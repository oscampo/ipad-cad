// Puente entre el documento y el solver de restricciones (planegcs, de FreeCAD, en WASM).
import { init_planegcs_module, GcsWrapper } from '@salusoft89/planegcs';
import { conRefs, addCon, ellipseOf, ellipseParam, isPartial } from './model.js';
import { arcSweepOf, closestOnPolyline, inSweep } from './geom.js';
import { bsplineThrough, bsplineSamples, bsplinePoint, bsplineTangent, sampleParam, chordParams, validParams } from './bspline.js';

let g = null;

// Sesion de arrastre: mientras se arrastra no cambia la estructura del dibujo (que restricciones hay y que puntos son
// fijos), solo las posiciones. El analisis estructural (seguidores, arcos inmoviles, cuerpos de los engranajes, splines y
// elipses con relaciones) cuesta mas en JavaScript que la propia resolucion, asi que se hace una vez por arrastre y se
// reutiliza. Si cambia el dibujo (otro objeto, otro numero de restricciones o de ids) la sesion se descarta sola.
let session = null;
// scoped: solo se resuelve lo conectado a lo arrastrado (el que llama garantiza que no hay formulas que lean medidas: con ellas, una cota lejana puede cambiar de valor)
export function beginSession(doc, scoped = false) { session = { doc, n: doc.n, nc: Object.keys(doc.cons).length, memo: new Map(), scoped }; }
export function endSession() { session = null; }
const fixedSig = (doc) => { let s = ''; for (const id in doc.pts) if (doc.pts[id].fixed) s += id + ','; return s; };
// Al empezar cada resolucion: la sesion sigue valida si es el mismo dibujo con la misma estructura; los puntos fijos si pueden
// cambiar entre resoluciones (las formulas fijan entradas un momento), asi que se guardan como firma de la cache.
function touchSession(doc) {
  const ss = session;
  if (!ss) return;
  ss.ok = ss.doc === doc && ss.n === doc.n && ss.nc === Object.keys(doc.cons).length;
  if (ss.ok) ss.sig = fixedSig(doc);
}
function structural(doc, key, fn, useSig) {
  const ss = session;
  if (!ss || !ss.ok || ss.doc !== doc) return fn();
  const sig = useSig ? ss.sig : '', hit = ss.memo.get(key);
  if (hit && hit.sig === sig) return hit.v;
  const v = fn();
  ss.memo.set(key, { sig, v });
  return v;
}

export async function initSolver(wasmUrl) {
  const mod = await init_planegcs_module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  g = new GcsWrapper(new mod.GcsSystem(), mod);
}

// 'l' linea, 'c' circulo, 'a' arco, 'p' punto
const kindOf = (doc, id) => (id in doc.lines ? 'l' : id in doc.circles ? 'c' : id in doc.arcs ? 'a' : 'p');

// Traduce una restriccion del documento a primitivas del solver.
function conPrims(doc, id, k) {
  if (k.ref) return []; // cota de referencia: solo mide, no restringe
  const r = k.refs;
  const base = { id };
  const kd = r.map((x) => kindOf(doc, x));
  switch (k.t) {
    case 'H': return r.length === 1 ? [{ ...base, type: 'horizontal_l', l_id: r[0] }] : [{ ...base, type: 'horizontal_pp', p1_id: r[0], p2_id: r[1] }];
    case 'V': return r.length === 1 ? [{ ...base, type: 'vertical_l', l_id: r[0] }] : [{ ...base, type: 'vertical_pp', p1_id: r[0], p2_id: r[1] }];
    case 'PAR': return [{ ...base, type: 'parallel', l1_id: r[0], l2_id: r[1] }];
    case 'PERP': return [{ ...base, type: 'perpendicular_ll', l1_id: r[0], l2_id: r[1] }];
    case 'EQL': return [{ ...base, type: 'equal_length', l1_id: r[0], l2_id: r[1] }];
    case 'EQR': {
      // circulo/arco: se ordena para que el circulo vaya primero
      const [x, y] = kd[0] === 'a' && kd[1] === 'c' ? [r[1], r[0]] : [r[0], r[1]];
      const kk = (kd[0] === 'a' && kd[1] === 'c' ? 'ca' : kd.join(''));
      if (kk === 'cc') return [{ ...base, type: 'equal_radius_cc', c1_id: x, c2_id: y }];
      if (kk === 'ca') return [{ ...base, type: 'equal_radius_ca', c1_id: x, a2_id: y }];
      return [{ ...base, type: 'equal_radius_aa', a1_id: x, a2_id: y }];
    }
    case 'COI': return [{ ...base, type: 'p2p_coincident', p1_id: r[0], p2_id: r[1] }];
    case 'PONL': return [{ ...base, type: 'point_on_line_pl', p_id: r[0], l_id: r[1] }];
    case 'PONC': return kd[1] === 'a'
      ? [{ ...base, type: 'point_on_arc', p_id: r[0], a_id: r[1] }]
      : [{ ...base, type: 'point_on_circle', p_id: r[0], c_id: r[1] }];
    case 'COL': {
      // dos lineas colineales: los extremos de la 2.ª sobre la recta de la 1.ª
      const l1 = doc.lines[r[0]], l2 = doc.lines[r[1]];
      const out = [];
      [l2.a, l2.b].forEach((p, i) => {
        if (p !== l1.a && p !== l1.b) out.push({ id: i ? `${id}_b` : id, type: 'point_on_line_pl', p_id: p, l_id: r[0] });
      });
      return out;
    }
    case 'CONC': { // concentricos: los centros de los dos circulos/arcos coinciden
      const ctr = (x) => (doc.circles[x] || doc.arcs[x]).c;
      return ctr(r[0]) === ctr(r[1]) ? [] : [{ ...base, type: 'p2p_coincident', p1_id: ctr(r[0]), p2_id: ctr(r[1]) }];
    }
    case 'MID': return [{ ...base, type: 'p2p_symmetric_ppp', p1_id: r[0], p2_id: r[1], p_id: r[2] }];
    case 'TANLC': return kd[1] === 'a'
      ? [{ ...base, type: 'tangent_la', l_id: r[0], a_id: r[1] }]
      : [{ ...base, type: 'tangent_lc', l_id: r[0], c_id: r[1] }];
    case 'TANCC': {
      const kk = kd[0] === 'a' && kd[1] === 'c' ? 'ca' : kd.join('');
      const [x, y] = kd[0] === 'a' && kd[1] === 'c' ? [r[1], r[0]] : [r[0], r[1]];
      if (kk === 'cc') return [{ ...base, type: 'tangent_cc', c1_id: x, c2_id: y }];
      if (kk === 'ca') return [{ ...base, type: 'tangent_ca', c_id: x, a_id: y }];
      return [{ ...base, type: 'tangent_aa', a1_id: x, a2_id: y }];
    }
    case 'DIST': return [{ ...base, type: 'p2p_distance', p1_id: r[0], p2_id: r[1], distance: k.v }];
    // restricciones de matrices y espejo: acimut de un segmento entre puntos, angulo entre dos segmentos de
    // puntos, igualdad de dos distancias y simetria de dos puntos respecto de una linea
    case 'AZ': return [{ ...base, type: 'p2p_angle', p1_id: r[0], p2_id: r[1], angle: (k.v * Math.PI) / 180 }];
    case 'ANG4': return [{ ...base, type: 'l2l_angle_pppp', l1p1_id: r[0], l1p2_id: r[1], l2p1_id: r[2], l2p2_id: r[3], angle: (k.v * Math.PI) / 180 }];
    case 'EQD': {
      const name = `__eqd${id}`, A = doc.pts[r[0]], B = doc.pts[r[1]];
      return [{ type: 'param', name, value: Math.hypot(B.x - A.x, B.y - A.y), fixed: false },
        { id: `${id}_a`, type: 'p2p_distance', p1_id: r[0], p2_id: r[1], distance: name }, { id: `${id}_b`, type: 'p2p_distance', p1_id: r[2], p2_id: r[3], distance: name }];
    }
    case 'SYM': return [{ ...base, type: 'p2p_symmetric_ppl', p1_id: r[0], p2_id: r[1], l_id: r[2] }];
    case 'DISTPL': return [{ ...base, type: 'p2l_distance', p_id: r[0], l_id: r[1], distance: k.v }];
    case 'ANG': return [{ ...base, type: 'l2l_angle_ll', l1_id: r[0], l2_id: r[1], angle: (k.v * Math.PI) / 180 }];
    case 'RAD': return kd[0] === 'a'
      ? [{ ...base, type: 'arc_radius', a_id: r[0], radius: k.v }]
      : [{ ...base, type: 'circle_radius', c_id: r[0], radius: k.v }];
    default: return [];
  }
}

// ---------------------------------------------------------------- elipses
// Una elipse con relaciones (punto sobre ella, tangencias) o parcial (arco eliptico) entra al solver como elipse
// nativa de planegcs: centro, un foco auxiliar y el semieje menor. Los puntos del dibujo que la definen quedan
// atados a ella: el del eje mas largo es el vertice del eje mayor (esta sobre la elipse y el foco cae en la recta
// centro-vertice) y la distancia del centro al otro es el semieje menor (la perpendicularidad entre ambos ejes la
// da la restriccion oculta de 90 grados que lleva toda elipse). Cual es cual se decide con las posiciones
// actuales en cada resolucion.
//  - PONE (punto sobre elipse): point_on_ellipse.
//  - TANLE / TANCE / TANEE (recta, circulo/arco u otra elipse tangente): el punto de contacto T va sobre las dos
//    curvas y el angulo entre ambas en T es 0 o 180 grados (angle_via_point).
const ELL = new Set(['PONE', 'TANLE', 'TANCE', 'TANEE']);
const ellRefs = (k) => (k.t === 'TANEE' ? [k.refs[0], k.refs[1]] : [k.refs[1]]);
const nativeEllipses = (doc) => structural(doc, 'ell', () => nativeEllipsesRaw(doc));
function nativeEllipsesRaw(doc) {
  const out = new Set();
  for (const [id, e] of Object.entries(doc.ellipses || {})) if (isPartial(e)) out.add(id);
  for (const k of Object.values(doc.cons)) if (ELL.has(k.t) && !k.ref) for (const r of ellRefs(k)) if (doc.ellipses?.[r]) out.add(r);
  return out;
}
function nativeEllipsePrims(doc, pos, ids) {
  const out = [], P = (id) => pos?.pts?.[id] || doc.pts[id];
  const geo = {};
  for (const id of ids) {
    const e = doc.ellipses[id], C = P(e.c), A = P(e.a), B = P(e.b);
    const g = ellipseOf({ pts: { [e.c]: C, [e.a]: A, [e.b]: B } }, e);
    geo[id] = g;
    const aMajor = g.ra >= g.rb, rmaj = Math.max(g.ra, g.rb), rmin = Math.max(Math.min(g.ra, g.rb), 1e-9);
    // direccion del eje mayor y lado del punto del eje menor
    const side = (B.x - C.x) * -g.uy + (B.y - C.y) * g.ux >= 0 ? 1 : -1; // b a la izquierda (+) o derecha (-) de c->a
    const d = aMajor ? { x: g.ux, y: g.uy } : { x: -g.uy * side, y: g.ux * side };
    const f = Math.max(Math.sqrt(Math.max(rmaj * rmaj - rmin * rmin, 0)), 1e-6 * rmaj);
    const fid = `__ef:${id}`;
    out.push({ id: fid, type: 'point', x: C.x + d.x * f, y: C.y + d.y * f, fixed: false });
    if (isPartial(e)) {
      const ang = (Q) => Math.atan2(((Q.x - C.x) * -d.y + (Q.y - C.y) * d.x) / rmin, ((Q.x - C.x) * d.x + (Q.y - C.y) * d.y) / rmaj);
      const a0 = ang(P(e.p1));
      let sw = (((ang(P(e.p2)) - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (sw < 1e-9) sw = 2 * Math.PI;
      out.push({ id, type: 'arc_of_ellipse', c_id: e.c, focus1_id: fid, start_id: e.p1, end_id: e.p2, radmin: rmin, start_angle: a0, end_angle: a0 + sw });
      out.push({ id: `${id}_rules`, type: 'arc_of_ellipse_rules', a_id: id });
    } else out.push({ id, type: 'ellipse', c_id: e.c, focus1_id: fid, radmin: rmin });
    const M = aMajor ? e.a : e.b, Nid = aMajor ? e.b : e.a;
    out.push({ id: `__ex:${id}`, type: 'line', p1_id: e.c, p2_id: M });
    out.push({ id: `${id}_fx`, type: 'point_on_line_pl', p_id: fid, l_id: `__ex:${id}` });
    out.push({ id: `${id}_mv`, type: 'point_on_ellipse', p_id: M, e_id: id });
    out.push({ id: `${id}_rn`, type: 'p2p_distance', p1_id: e.c, p2_id: Nid, distance: { o_id: id, prop: 'radmin' } });
  }
  // tangente (sentido antihorario) de la elipse en el punto Q
  const etan = (id, Q) => { const g = geo[id], t = ellipseParam(g, Q), x = -g.ra * Math.sin(t), y = g.rb * Math.cos(t); return { x: x * g.ux - y * g.uy, y: x * g.uy + y * g.ux }; };
  for (const [id, k] of Object.entries(doc.cons)) {
    if (!ELL.has(k.t) || k.ref || !ellRefs(k).every((r) => ids.has(r))) continue;
    if (k.t === 'PONE') { out.push({ id, type: 'point_on_ellipse', p_id: k.refs[0], e_id: k.refs[1] }); continue; }
    const [o, eid, tp] = k.refs, T = P(tp), t1 = etan(eid, T);
    out.push({ id: `${id}_s`, type: 'point_on_ellipse', p_id: tp, e_id: eid });
    let dir;
    if (k.t === 'TANLE') {
      const l = doc.lines[o], A = P(l.a), B = P(l.b);
      dir = { x: B.x - A.x, y: B.y - A.y };
      out.push({ id: `${id}_p`, type: 'point_on_line_pl', p_id: tp, l_id: o });
    } else if (k.t === 'TANCE') {
      const arc = o in doc.arcs, C = P((arc ? doc.arcs : doc.circles)[o].c);
      dir = { x: -(T.y - C.y), y: T.x - C.x };
      out.push(arc ? { id: `${id}_p`, type: 'point_on_arc', p_id: tp, a_id: o } : { id: `${id}_p`, type: 'point_on_circle', p_id: tp, c_id: o });
    } else {
      dir = etan(o, T);
      out.push({ id: `${id}_p`, type: 'point_on_ellipse', p_id: tp, e_id: o });
    }
    out.push({ id, type: 'angle_via_point', crv1_id: eid, crv2_id: o, p_id: tp, angle: t1.x * dir.x + t1.y * dir.y >= 0 ? 0 : Math.PI });
  }
  return out;
}

// Al arrastrar el punto de un eje de una elipse nativa mas alla del otro eje, los ejes mayor y menor cambian de
// papel. El solver no puede cruzar ese punto por si solo (pasaria por un circulo, con el foco en el centro), asi que
// en ese caso la resolucion arranca con el punto arrastrado casi en su destino.
function ellipseFlipStart(doc, live) {
  const ids = nativeEllipses(doc);
  let pts = null;
  for (const id of ids) {
    const e = doc.ellipses[id], C = doc.pts[e.c];
    for (const t of live) {
      if (t.id !== e.a && t.id !== e.b) continue;
      const o = doc.pts[t.id === e.a ? e.b : e.a], d0 = Math.hypot(doc.pts[t.id].x - C.x, doc.pts[t.id].y - C.y);
      const d1 = Math.hypot(t.x - C.x, t.y - C.y), dn = Math.hypot(o.x - C.x, o.y - C.y);
      // casi en el destino (no justo encima: la atraccion al destino se indefine a distancia cero)
      const q = doc.pts[t.id], w = { x: q.x + 0.97 * (t.x - q.x), y: q.y + 0.97 * (t.y - q.y) };
      if ((d0 - dn) * (Math.hypot(w.x - C.x, w.y - C.y) - dn) < 0 && d1 !== dn) (pts ||= {})[t.id] = w;
    }
  }
  return pts ? { pts } : null;
}

// ---------------------------------------------------------------- splines
// Un spline con relaciones entra al solver como B-spline nativo de planegcs: sus polos son incognitas
// auxiliares, cada punto de dato queda sobre su nudo (alineacion interna) y, si es abierto, los extremos
// llevan la condicion de curvatura nula (punto medio). Con eso la curva queda determinada por los puntos
// de dato, igual que al dibujarla (bspline.js).
//  - PONS (punto sobre spline): point_on_bspline con el parametro libre.
//  - TANLS / TANCS (recta o circulo/arco tangente al spline): el punto de contacto T va sobre el spline
//    (parametro libre) y sobre la otra curva, y el angulo entre ambas en T es 0 o 180 grados
//    (angle_via_point_and_param).
const SPL = new Set(['PONS', 'TANLS', 'TANCS']);
const splCon = (doc, k) => SPL.has(k.t) && !k.ref && !!doc.splines?.[k.refs[1]];
const hasSplRaw = (doc) => Object.values(doc.cons).some((k) => splCon(doc, k));
const hasSpl = (doc) => structural(doc, 'spl', () => hasSplRaw(doc));
// punto que la relacion pone sobre el spline
const splPoint = (k) => (k.t === 'PONS' ? k.refs[0] : k.refs[2]);
const isClosed = (sp) => !!sp.closed && sp.pts.length >= 3;

// Parametros de los puntos de un spline durante una resolucion: los guardados o, si no hay, los de la
// longitud de cuerda con las posiciones actuales del documento (se guardan al aceptar la solucion).
function tsFor(doc, sid, memo) {
  if (memo[sid]) return memo[sid];
  const sp = doc.splines[sid], closed = isClosed(sp);
  memo[sid] = validParams(sp.ts, sp.pts.length, closed) ? sp.ts : chordParams(sp.pts.map((id) => doc.pts[id]), closed);
  return memo[sid];
}
const curveOf = (doc, sid, P, memo) => { const sp = doc.splines[sid]; return bsplineThrough(sp.pts.map(P), isClosed(sp), tsFor(doc, sid, memo)); };

// Parametro inicial de un punto sobre el spline: el guardado si sigue siendo valido; si no, el mas cercano.
function initialParam(bs, k, p, hint) {
  if (Number.isFinite(hint)) return hint;
  if (Number.isFinite(k.u)) { const e = bsplinePoint(bs, k.u); if (Math.hypot(e.x - p.x, e.y - p.y) < 1e-6) return k.u; }
  const f = closestOnPolyline(bsplineSamples(bs, 32), p);
  return f ? sampleParam(bs, 32, f.i, f.u) : bs.ts[0];
}

// Primitivas nativas de los splines con relaciones.
function nativeSplinePrims(doc, pos, memo, F) {
  const out = [], P = (id) => pos?.pts?.[id] || doc.pts[id];
  const used = new Set();
  for (const [cid, k] of Object.entries(doc.cons)) if (splCon(doc, k) && !(F?.scope && !F.scope.conIn(cid))) used.add(k.refs[1]);
  const curves = {};
  for (const sid of used) {
    const sp = doc.splines[sid], bs = curveOf(doc, sid, P, memo);
    if (!bs) continue;
    curves[sid] = bs;
    const n = sp.pts.length, M = bs.G.length, pole = (i) => `__bp:${sid}:${i}`;
    bs.G.forEach((q, i) => out.push({ id: pole(i), type: 'point', x: q.x, y: q.y, fixed: false }));
    out.push({ id: `__bs:${sid}`, type: 'bspline', pole_ids: bs.G.map((_, i) => pole(i)), weights: bs.G.map(() => 1), knots: bs.ts, mult: bs.closed ? bs.ts.map(() => 1) : [4, ...Array(n - 2).fill(1), 4], degree: 3, periodic: bs.closed });
    sp.pts.forEach((pid, i) => out.push({ id: `__ka:${sid}:${i}`, type: 'internal_alignment_knot_point', b_id: `__bs:${sid}`, p_id: pid, knotindex: i }));
    if (!bs.closed) {
      out.push({ id: `__ns:${sid}`, type: 'p2p_symmetric_ppp', p1_id: pole(0), p2_id: pole(2), p_id: pole(1) });
      out.push({ id: `__ne:${sid}`, type: 'p2p_symmetric_ppp', p1_id: pole(M - 3), p2_id: pole(M - 1), p_id: pole(M - 2) });
    }
  }
  for (const [id, k] of Object.entries(doc.cons)) {
    if (!splCon(doc, k) || !curves[k.refs[1]]) continue;
    const bs = curves[k.refs[1]], pid = splPoint(k), b_id = `__bs:${k.refs[1]}`, name = `__u:${id}`;
    const u = initialParam(bs, k, P(pid), pos?.u?.[id]);
    out.push({ type: 'param', name, value: u, fixed: false });
    out.push({ id: k.t === 'PONS' ? id : `${id}_s`, type: 'point_on_bspline', p_id: pid, b_id, pointparam: name });
    if (k.t === 'PONS') continue;
    // tangencia: T sobre la otra curva y angulo 0 o 180 entre las tangentes (el que este mas cerca ahora)
    const tg = bsplineTangent(bs, u), o = k.refs[0];
    let dir;
    if (k.t === 'TANLS') {
      const l = doc.lines[o], A = P(l.a), B = P(l.b);
      dir = { x: B.x - A.x, y: B.y - A.y };
      out.push({ id: `${id}_p`, type: 'point_on_line_pl', p_id: pid, l_id: o });
    } else {
      const arc = o in doc.arcs, C = P((arc ? doc.arcs : doc.circles)[o].c), T = P(pid);
      dir = { x: -(T.y - C.y), y: T.x - C.x }; // tangente antihoraria del circulo en T
      out.push(arc ? { id: `${id}_p`, type: 'point_on_arc', p_id: pid, a_id: o } : { id: `${id}_p`, type: 'point_on_circle', p_id: pid, c_id: o });
    }
    out.push({ id, type: 'angle_via_point_and_param', crv1_id: b_id, crv2_id: o, p_id: pid, cparam: name, angle: tg.x * dir.x + tg.y * dir.y >= 0 ? 0 : Math.PI });
  }
  return out;
}

// Lleva el parametro de cada punto sobre spline a su dominio. Devuelve los que el solver dejo fuera (habia
// extrapolado la curva): { id: parametro corregido }, para repetir la resolucion desde ahi.
function fixParams(doc, res, memo) {
  const redo = {};
  for (const [id, k] of Object.entries(doc.cons)) {
    const u = res.params[`__u:${id}`];
    if (!splCon(doc, k) || !Number.isFinite(u)) continue;
    const sp = doc.splines[k.refs[1]], ts = tsFor(doc, k.refs[1], memo);
    const t0 = ts[0], t1 = ts[ts.length - 1], T = t1 - t0;
    if (isClosed(sp)) {
      const w = t0 + ((((u - t0) % T) + T) % T);
      if (u < t0 || u >= t1 + (ts[1] - t0)) redo[id] = w; // fuera del tramo que el solver evalua bien
      res.params[`__u:${id}`] = w;
    } else if (u < t0 - 1e-9 || u > t1 + 1e-9) {
      redo[id] = Math.min(t1, Math.max(t0, u));
    }
  }
  return redo;
}

// Distancia maxima de un punto de contacto a su spline (para validar la convergencia).
function splineResidual(doc, res) {
  let worst = 0;
  const memo = res.ts || {};
  const P = (id) => res.pts[id] || doc.pts[id];
  for (const [id, k] of Object.entries(doc.cons)) {
    if (!splCon(doc, k)) continue;
    // el punto debe estar sobre la curva en el parametro que encontro el solver (dentro del dominio)
    const u = res.params?.[`__u:${id}`];
    if (!Number.isFinite(u)) continue; // no entro a esta resolucion (fuera del alcance del arrastre)
    const bs = curveOf(doc, k.refs[1], P, memo);
    if (!bs) continue;
    const e = bsplinePoint(bs, u), q = P(splPoint(k));
    worst = Math.max(worst, Math.hypot(e.x - q.x, e.y - q.y));
  }
  return worst;
}

// Una pasada del solver; con splines se repite si un punto de contacto se salio del dominio de la curva
// (el solver habia extrapolado) para resolver de nuevo desde el parametro corregido.
function solveLoop(doc, pos, extra, F) {
  const spl = hasSpl(doc);
  const memo = {};
  let cur = pos, res = null;
  for (let i = 0; i < (spl ? 4 : 1); i++) {
    const prims = build(doc, cur, [...(spl ? nativeSplinePrims(doc, cur, memo, F) : []), ...(extra || [])], F);
    res = runSolve(F?.scope ? prunePrims(prims) : prims);
    res.ts = memo;
    if (!spl) break;
    const redo = fixParams(doc, res, memo);
    if (!Object.keys(redo).length) break;
    const u = {};
    for (const [name, v] of Object.entries(res.params)) if (name.startsWith('__u:')) u[name.slice(4)] = v;
    cur = { pts: res.pts, circles: res.circles, arcs: res.arcs, u: { ...u, ...redo } };
  }
  return res;
}

// ---------------------------------------------------------------- seguidores
// Una copia vinculada (matriz circular) o un reflejo (simetria) agrega 2 restricciones y 2 incognitas por punto. En un
// dibujo con cientos de puntos copiados eso agota la memoria del solver (WASM de memoria fija: ~220 puntos con 2
// restricciones cada uno). Un punto que SOLO existe para ser copia de otro no necesita ser incognita: queda fijo durante
// la resolucion y, una vez resuelto el resto, se calcula de su fuente. Resultado identico, sin cargar al solver.
//  - giro: EQD + ANG4 con refs [c, s, c, t]  ->  t es s girado v grados alrededor de c
//  - reflejo: SYM [s, t, recta]               ->  t es s reflejado en la recta
// t es seguidor solo si ninguna otra restriccion lo menciona ni menciona una curva que lo use como punto (si no, el
// solver necesita su posicion real mientras resuelve).
function findFollowers(doc) {
  const cons = Object.entries(doc.cons).filter(([, k]) => !k.ref);
  const defs = new Map(), byKey = new Map();
  for (const [id, k] of cons) {
    if (k.t === 'SYM' && kindOf(doc, k.refs[0]) === 'p' && kindOf(doc, k.refs[1]) === 'p' && kindOf(doc, k.refs[2]) === 'l') {
      if (!defs.has(k.refs[1])) defs.set(k.refs[1], { kind: 'sym', s: k.refs[0], l: k.refs[2], ids: [id] });
      else defs.get(k.refs[1]).bad = true;
    } else if ((k.t === 'EQD' || k.t === 'ANG4') && k.refs.length === 4 && k.refs[0] === k.refs[2]) {
      const key = k.refs.join('|'), e = byKey.get(key) || {};
      e[k.t] = [id, k]; byKey.set(key, e);
    }
  }
  for (const e of byKey.values()) {
    if (!e.EQD || !e.ANG4) continue;
    const [c, s, , t] = e.ANG4[1].refs;
    if (!defs.has(t)) defs.set(t, { kind: 'rot', c, s, v: e.ANG4[1].v, ids: [e.EQD[0], e.ANG4[0]] });
    else defs.get(t).bad = true;
  }
  if (!defs.size) return null;
  const defCons = new Set();
  for (const d of defs.values()) for (const i of d.ids) defCons.add(i);
  const mention = new Set(), blocked = new Set();
  const block = (r) => {
    if (r in doc.lines) { blocked.add(doc.lines[r].a); blocked.add(doc.lines[r].b); }
    else if (r in doc.circles) blocked.add(doc.circles[r].c);
    else if (r in doc.arcs) { const a = doc.arcs[r]; blocked.add(a.c); blocked.add(a.a); blocked.add(a.b); }
    else if (doc.splines?.[r]) for (const q of doc.splines[r].pts) blocked.add(q);
    else if (doc.ellipses?.[r]) { const e = doc.ellipses[r]; for (const q of [e.c, e.a, e.b, e.p1, e.p2]) if (q) blocked.add(q); }
  };
  for (const [id, k] of cons) {
    if (defCons.has(id)) continue;
    for (const r of k.refs) { mention.add(r); block(r); }
  }
  const cand = new Map();
  for (const [t, d] of defs) {
    const p = doc.pts[t];
    if (!d.bad && p && !p.fixed && !p.mark && !mention.has(t) && !blocked.has(t)) cand.set(t, d);
  }
  // orden de calculo: una fuente que tambien es seguidora se resuelve antes; los ciclos vuelven a ser incognitas
  const order = [], done = new Set();
  const inputs = (d) => (d.kind === 'rot' ? [d.c, d.s] : [d.s, doc.lines[d.l].a, doc.lines[d.l].b]);
  for (let progress = true; progress;) {
    progress = false;
    for (const [t, d] of cand) {
      if (done.has(t) || !inputs(d).every((q) => !cand.has(q) || done.has(q))) continue;
      done.add(t); order.push([t, d]); progress = true;
    }
  }
  if (!order.length) return null;
  const skip = new Set();
  for (const [, d] of order) for (const i of d.ids) skip.add(i);
  return { order, skip, map: new Map(order), idleArcs: new Set() };
}
// Arcos que el solver puede ignorar: ninguna restriccion los menciona y su centro y sus dos extremos no se pueden mover
// (fijos, marcas o seguidores). Su regla (extremos sobre la circunferencia) solo queda como restriccion redundante, y con
// decenas de arcos copia eso multiplicaba por 6 el costo de cada resolucion. El radio se calcula al terminar.
function prepare(doc) {
  const F0 = structural(doc, 'prep', () => prepareRaw(doc), true);
  return F0 ? { ...F0 } : F0; // copia: cada resolucion le agrega sus propias primitivas
}
function prepareRaw(doc) {
  const F = findFollowers(doc);
  const fixedOf = (i) => !!doc.pts[i]?.fixed || isMark(doc, i) || !!F?.map.has(i);
  const idle = new Set(), arcs = Object.entries(doc.arcs);
  if (arcs.length) {
    const mentioned = new Set();
    for (const k of Object.values(doc.cons)) if (!k.ref) for (const r of k.refs) mentioned.add(r);
    for (const [id, a] of arcs) if (!mentioned.has(id) && [a.c, a.a, a.b].every((q) => doc.pts[q] && fixedOf(q))) idle.add(id);
  }
  if (!idle.size) return F;
  if (F) { F.idleArcs = idle; return F; }
  return { order: [], skip: new Set(), map: new Map(), idleArcs: idle };
}

// Calcula las posiciones de los seguidores a partir de P (id -> punto) y las escribe en out (id -> {x, y}).
function applyFollowers(doc, F, P, out) {
  const get = (id) => out[id] || P(id);
  for (const [t, d] of F.order) {
    if (d.kind === 'rot') {
      const c = get(d.c), s = get(d.s), a = ((d.v || 0) * Math.PI) / 180, dx = s.x - c.x, dy = s.y - c.y;
      out[t] = { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
    } else {
      const s = get(d.s), l = doc.lines[d.l], A = get(l.a), B = get(l.b), ux = B.x - A.x, uy = B.y - A.y, L2 = ux * ux + uy * uy || 1;
      const f = ((s.x - A.x) * ux + (s.y - A.y) * uy) / L2, fx = A.x + f * ux, fy = A.y + f * uy;
      out[t] = { x: 2 * fx - s.x, y: 2 * fy - s.y };
    }
  }
}
// Un punto que el usuario arrastra y es seguidor: se arrastra su fuente (lo mismo que hacian las restricciones).
function retarget(doc, F, targets) {
  if (!F || !targets.some((t) => F.map.has(t.id))) return targets;
  return targets.map((t) => {
    for (let i = 0; i < 50 && F.map.has(t.id); i++) {
      const d = F.map.get(t.id);
      if (d.kind === 'rot') {
        const c = doc.pts[d.c], a = (-(d.v || 0) * Math.PI) / 180, dx = t.x - c.x, dy = t.y - c.y;
        t = { id: d.s, x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
      } else {
        const l = doc.lines[d.l], A = doc.pts[l.a], B = doc.pts[l.b], ux = B.x - A.x, uy = B.y - A.y, L2 = ux * ux + uy * uy || 1;
        const f = ((t.x - A.x) * ux + (t.y - A.y) * uy) / L2, fx = A.x + f * ux, fy = A.y + f * uy;
        t = { id: d.s, x: 2 * fx - t.x, y: 2 * fy - t.y };
      }
    }
    return t;
  });
}

// Una restriccion entre puntos que el solver no puede mover (fijos, marcas, seguidores, o los que se dejan fijos mientras
// se resuelve una formula) y que ya se cumple no informa nada: solo vuelve redundante al sistema, y planegcs, al detectar
// redundantes, resuelve dos veces cada vez y las diagnostica (un arrastre pasaba de ~80 ms a ~450 ms por una coincidencia
// entre un punto fijado y el centro). Si no se cumple se deja pasar: el conflicto debe seguir apareciendo.
function trivialFixed(doc, k, fixedOf) {
  const r = k.refs, P = (i) => doc.pts[i];
  if (!r.every((i) => P(i) && fixedOf(i))) return false;
  const near = (a, b) => Math.abs(a - b) <= 1e-7 * (1 + Math.abs(b));
  switch (k.t) {
    case 'COI': return r.length === 2 && near(P(r[0]).x, P(r[1]).x) && near(P(r[0]).y, P(r[1]).y);
    case 'H': return r.length === 2 && near(P(r[0]).y, P(r[1]).y);
    case 'V': return r.length === 2 && near(P(r[0]).x, P(r[1]).x);
    case 'DIST': return r.length === 2 && Number.isFinite(k.v) && near(Math.hypot(P(r[0]).x - P(r[1]).x, P(r[0]).y - P(r[1]).y), k.v);
    default: return false;
  }
}

function build(doc, pos, extra, F) {
  const out = [];
  const P = (id) => pos?.pts?.[id] || doc.pts[id];
  for (const [id, p] of Object.entries(doc.pts)) {
    const q = P(id);
    out.push({ id, type: 'point', x: q.x, y: q.y, fixed: !!p.fixed || isMark(doc, id) || !!F?.map.has(id) || (!!F?.scope && !F.scope.has(id)) }); // la marca de referencia no la mueve el solver; el seguidor se calcula despues; lo que no esta conectado al arrastre queda fijo
  }
  for (const [id, l] of Object.entries(doc.lines)) out.push({ id, type: 'line', p1_id: l.a, p2_id: l.b });
  for (const [id, c] of Object.entries(doc.circles)) {
    out.push({ id, type: 'circle', c_id: c.c, radius: pos?.circles?.[id] ?? c.r });
  }
  for (const [id, a] of Object.entries(doc.arcs)) {
    if (F?.idleArcs.has(id)) continue;
    const { a0, sweep } = arcSweepOf(P(a.c), P(a.a), P(a.b));
    out.push({ id, type: 'arc', c_id: a.c, start_id: a.a, end_id: a.b, radius: pos?.arcs?.[id] ?? a.r, start_angle: a0, end_angle: a0 + sweep });
    out.push({ id: `${id}_rules`, type: 'arc_rules', a_id: id });
  }
  const ell = nativeEllipses(doc);
  if (ell.size) out.push(...nativeEllipsePrims(doc, pos, ell));
  const fixedOf = (i) => !!doc.pts[i]?.fixed || isMark(doc, i) || !!F?.map.has(i);
  for (const [id, k] of Object.entries(doc.cons)) if (!F?.skip.has(id) && !(F?.scope && !k.ref && !F.scope.conIn(id)) && !(!k.ref && trivialFixed(doc, k, fixedOf))) out.push(...conPrims(doc, id, k));
  if (F?.gearPrims) out.push(...F.gearPrims);
  if (extra) out.push(...extra);
  return out;
}

// ---------------------------------------------------------------- relacion de engranaje (GEAR)
// { t: 'GEAR', refs: [lineaA, lineaB], ratio, a0: [aA0, aB0], cur: [aA, aB] }  =>  (aB - aB0) = ratio * (aA - aA0)
// Cada engranaje (o rueda, o polea) se representa por una linea rigida con su cuerpo; su angulo es la direccion a -> b. Los
// angulos se llevan sin limite (varias vueltas): cur guarda el ultimo, y cada resolucion toma el equivalente mas cercano.
// PlaneGCS no sirve para ligar los dos angulos como incognitas (su restriccion «proportional» ignora la razon cuando ambos
// parametros son libres), asi que se hace como una cota conductora: en cada resolucion un engranaje es el MAESTRO (el que se
// arrastra, o el primero) y su angulo se fija; el de los demas sale de la razon y tambien se fija. Con el angulo fijo el cuerpo
// gira rigido (sus puntos estan amarrados al centro). El valor del maestro arrastrado sale del raton: es el angulo del raton
// alrededor del centro, sin objetivo suave ni vueltas de formula.
const TWO_PI = 2 * Math.PI;
const wrapPi = (x) => x - TWO_PI * Math.round(x / TWO_PI);
const nearAng = (a, ref) => ref + wrapPi(a - ref);
const lineDir = (doc, lid) => { const l = doc.lines[lid], a = doc.pts[l.a], b = doc.pts[l.b]; return Math.atan2(b.y - a.y, b.x - a.x); };
const gearRelIds = (doc) => structural(doc, 'gearIds', () => Object.keys(doc.cons).filter((id) => relOk(doc, doc.cons[id])));
const gearRels = (doc) => gearRelIds(doc).map((id) => doc.cons[id]);
// RACK (rueda y cremallera, o rueda que rueda sin deslizar): { t: 'RACK', refs: [lineaDeLaRueda, puntoQ, lineaCremallera], ratio }
// El avance s de Q a lo largo de la cremallera (de su extremo a hacia b) cambia ratio veces lo que gira la linea de la rueda:
// ds = ratio * dtheta. En una rueda que rueda por el suelo, Q es su centro y ratio = -radio (avanza hacia +x girando en sentido horario).
const relOk = (doc, k) => {
  if ((k.t !== 'GEAR' && k.t !== 'RACK') || k.ref || !Number.isFinite(k.ratio) || k.ratio === 0) return false;
  if (k.t === 'GEAR') return k.refs.length === 2 && !!doc.lines[k.refs[0]] && !!doc.lines[k.refs[1]] && k.refs[0] !== k.refs[1];
  if (k.refs.length !== 3 || !doc.lines[k.refs[0]] || !doc.pts[k.refs[1]] || !doc.lines[k.refs[2]] || k.refs[0] === k.refs[2]) return false;
  const r = doc.lines[k.refs[2]], a = doc.pts[r.a], b = doc.pts[r.b];
  return Math.hypot(b.x - a.x, b.y - a.y) > 1e-9;
};

// Cuerpos: puntos que se mueven juntos (unidos por alguna restriccion o forma) sin pasar por puntos fijos.
const bodies = (doc) => structural(doc, 'bodies', () => bodiesRaw(doc), true);
function bodiesRaw(doc) {
  const par = new Map();
  const find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  const movable = (id) => doc.pts[id] && !doc.pts[id].fixed && !isMark(doc, id);
  const join = (ids) => {
    let first = null;
    for (const id of ids) {
      if (!movable(id)) continue;
      if (!par.has(id)) par.set(id, id);
      if (first === null) first = id; else { const a = find(first), b = find(id); if (a !== b) par.set(a, b); }
    }
  };
  const ptsOf = (r) => {
    if (r in doc.pts) return [r];
    if (r in doc.lines) return [doc.lines[r].a, doc.lines[r].b];
    if (r in doc.circles) return [doc.circles[r].c];
    if (r in doc.arcs) { const a = doc.arcs[r]; return [a.c, a.a, a.b]; }
    if (doc.splines?.[r]) return doc.splines[r].pts;
    if (doc.ellipses?.[r]) { const e = doc.ellipses[r]; return [e.c, e.a, e.b, e.p1, e.p2].filter(Boolean); }
    return [];
  };
  for (const k of Object.values(doc.cons)) if (!k.ref && k.t !== 'GEAR' && k.t !== 'RACK') join(k.refs.flatMap(ptsOf));
  for (const l of Object.values(doc.lines)) join([l.a, l.b]);
  for (const a of Object.values(doc.arcs)) join([a.c, a.a, a.b]);
  for (const sp of Object.values(doc.splines || {})) join(sp.pts);
  return { of: (id) => (par.has(id) ? find(id) : null) };
}

// Plan de una resolucion: angulos fijos para las lineas de los engranajes y avances fijos para los puntos de las cremalleras, y los
// destinos del raton que ya no hacen falta. Los nodos son giros (una linea rigida con su rueda) y avances (un punto que se
// desplaza a lo largo de una cremallera); las relaciones ligan el CAMBIO de uno con el del otro.
function gearPlan(doc, targets) {
  const rels = gearRels(doc);
  if (!rels.length) return { targets, prims: [], items: [] };
  // Se propaga el CAMBIO desde la postura actual, no el angulo absoluto: un engranaje que esta en dos relaciones (un tren A-B,
  // B-C, C-D) tendria constantes a0 en vueltas distintas (-180 en una, 180 en otra) y el angulo compuesto saldria desfasado en
  // multiplos de 360 por la razon (la rueda D quedaba 180 grados fuera). Con el cambio no hay ramas que mezclar.
  const nodes = new Map(); // clave -> { kind: 'ang' | 'tr', id, rels: [], meas | pos, u }
  const node = (key, make) => { if (!nodes.has(key)) nodes.set(key, { ...make(), rels: [] }); return nodes.get(key); };
  const links = []; // { k, a, b }: cambio de b = ratio * cambio de a
  for (const k of rels) {
    const A = node('L:' + k.refs[0], () => ({ kind: 'ang', id: k.refs[0], meas: lineDir(doc, k.refs[0]) }));
    let B;
    if (k.t === 'GEAR') B = node('L:' + k.refs[1], () => ({ kind: 'ang', id: k.refs[1], meas: lineDir(doc, k.refs[1]) }));
    else {
      const r = doc.lines[k.refs[2]], a = doc.pts[r.a], b = doc.pts[r.b], len = Math.hypot(b.x - a.x, b.y - a.y), q = doc.pts[k.refs[1]];
      B = node('T:' + k.refs[1], () => ({ kind: 'tr', id: k.refs[1], pos: { x: q.x, y: q.y }, u: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } }));
    }
    A.rels.push({ k, to: B, r: k.ratio }); B.rels.push({ k, to: A, r: 1 / k.ratio });
    links.push({ k, a: A, b: B });
  }
  const bod = targets.length ? bodies(doc) : null;
  const delta = new Map(), drop = new Set();
  const pivotOf = (lid) => structural(doc, 'pivot:' + lid, () => pivotRaw(lid), true);
  const pivotRaw = (lid) => { // extremo de la linea que es un punto fijo o esta ligado a uno por una coincidencia: el centro de giro
    // (una simple coincidencia de posiciones no cuenta: una rueda que rueda puede pasar por donde hay un punto fijo)
    const l = doc.lines[lid];
    for (const id of [l.a, l.b]) {
      if (doc.pts[id].fixed) return id;
      for (const k of Object.values(doc.cons)) if (k.t === 'COI' && !k.ref && k.refs.includes(id) && k.refs.some((x) => x !== id && doc.pts[x]?.fixed)) return id;
    }
    return null;
  };
  const seen = new Set();
  for (const n0 of nodes.values()) {
    if (seen.has(n0)) continue;
    // componente de nodos ligados por relaciones
    const comp = [], stack = [n0]; seen.add(n0);
    while (stack.length) { const x = stack.pop(); comp.push(x); for (const e of x.rels) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); } }
    // maestro: primero una rueda que gira alrededor de un centro fijo y cuyo cuerpo contiene un punto arrastrado (su angulo sale del
    // raton); si no, un punto de avance cuyo cuerpo contiene el punto arrastrado (avanza lo que el raton, a lo largo de la cremallera);
    // si no, el primero, sin cambio
    let master = comp[0], d0 = 0, bodyKey = null;
    outer: for (const pass of ['ang', 'tr']) {
      for (const t of targets) {
        const key = bod.of(t.id);
        if (key === null) continue;
        const p = doc.pts[t.id];
        for (const nd of comp) {
          if (nd.kind !== pass) continue;
          if (nd.kind === 'ang') {
            const l = doc.lines[nd.id];
            if (![l.a, l.b].some((id) => bod.of(id) === key)) continue;
            const cid = pivotOf(nd.id);
            if (cid === null) continue;
            const c = doc.pts[cid];
            if (Math.hypot(p.x - c.x, p.y - c.y) < 1e-9 || Math.hypot(t.x - c.x, t.y - c.y) < 1e-9) continue;
            const off = Math.atan2(p.y - c.y, p.x - c.x) - nd.meas; // posicion del punto respecto a la linea (rigido)
            master = nd; d0 = wrapPi(Math.atan2(t.y - c.y, t.x - c.x) - off - nd.meas); bodyKey = key;
          } else {
            if (bod.of(nd.id) !== key) continue;
            master = nd; d0 = (t.x - p.x) * nd.u.x + (t.y - p.y) * nd.u.y; bodyKey = key;
          }
          break outer;
        }
      }
    }
    delta.set(master, d0);
    const queue = [master];
    while (queue.length) {
      const x = queue.shift();
      for (const e of x.rels) if (!delta.has(e.to)) { delta.set(e.to, e.r * delta.get(x)); queue.push(e.to); }
    }
    if (bodyKey !== null) for (const t of targets) if (bod.of(t.id) === bodyKey) drop.add(t.id);
  }
  const prims = [], items = []; // items: las mismas primitivas con los puntos que las anclan (para filtrar por alcance)
  for (const [nd, dv] of delta) {
    if (nd.kind === 'ang') { const l = doc.lines[nd.id], pr = { id: `__gr:${nd.id}`, type: 'p2p_angle', p1_id: l.a, p2_id: l.b, angle: wrapPi(nd.meas + dv) }; prims.push(pr); items.push({ pids: [l.a, l.b], prims: [pr] }); }
    else {
      const a = { id: `__rt:${nd.id}`, type: 'point', x: nd.pos.x + dv * nd.u.x, y: nd.pos.y + dv * nd.u.y, fixed: true }, b = { id: `__rc:${nd.id}`, type: 'p2p_coincident', p1_id: nd.id, p2_id: `__rt:${nd.id}` };
      prims.push(a, b); items.push({ pids: [nd.id], prims: [a, b] });
    }
  }
  return { targets: targets.filter((t) => !drop.has(t.id)), prims, items };
}
// Tras resolver: el angulo continuo de cada relacion sigue a la geometria.
function trackGears(doc) {
  for (const k of gearRels(doc)) if (k.t === 'GEAR') k.cur = k.refs.map((lid, i) => nearAng(lineDir(doc, lid), Array.isArray(k.cur) && Number.isFinite(k.cur[i]) ? k.cur[i] : lineDir(doc, lid)));
}
// Datos de una relacion nueva con la postura actual como punto de partida.
// Rueda y cremallera: lineaRueda es una linea rigida con la rueda, q el punto que avanza (el centro de una rueda que rueda, o un
// punto de la cremallera) y lineaCremallera la direccion del avance.
export function makeRack(doc, wheelLine, pointQ, rackLine, ratio) { return { t: 'RACK', refs: [wheelLine, pointQ, rackLine], ratio }; }
// El punto que avanza solo tiene sentido si es el centro de una rueda que rueda sobre la cremallera (a |ratio| = radio de ella) o un punto
// de la propia cremallera (a 0): un punto del borde no avanza a ritmo uniforme y el sistema queda imposible. Devuelve el punto valido (si el
// elegido es un extremo de la linea de la rueda y su otro extremo si lo es, se usa ese: era el centro) o el error con la distancia medida.
export function checkRack(doc, wheelLine, q, rackLine, ratio) {
  const rl = doc.lines[rackLine], a = doc.pts[rl.a], b = doc.pts[rl.b], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dist = (id) => { const p = doc.pts[id]; return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len; };
  const tol = Math.max(1e-6, 1e-3 * Math.abs(ratio)), good = (id) => dist(id) < tol || Math.abs(dist(id) - Math.abs(ratio)) < tol;
  if (good(q)) return { ok: true, q };
  const wl = doc.lines[wheelLine], other = wl.a === q ? wl.b : wl.b === q ? wl.a : null;
  if (other && good(other)) return { ok: true, q: other, changed: true };
  return { ok: false, dist: dist(q) };
}
export function makeGear(doc, lineA, lineB, ratio) {
  const a = lineDir(doc, lineA), b = lineDir(doc, lineB);
  return { t: 'GEAR', refs: [lineA, lineB], ratio, a0: [a, b], cur: [a, b] };
}

// ---------------------------------------------------------------- relaciones finitas
// Una relacion con k.finite = true solo vale mientras su punto de contacto cae dentro de los limites graficos de los elementos (el
// segmento entre sus extremos, el barrido del arco). Fuera de ellos deja de existir: no se manda al solver y los elementos quedan
// libres. Para el solver las lineas y los circulos son infinitos, asi que sin esto una tangencia con un segmento que no se ve en
// contacto seguiria tirando de la geometria. Se decide con la postura actual antes de resolver y se repite si al resolver cambia.
export const FINITE_TYPES = ['PONL', 'PONC', 'TANLC', 'TANCC'];
const finiteIds = (doc) => structural(doc, 'finIds', () => Object.keys(doc.cons).filter((id) => doc.cons[id].finite && !doc.cons[id].ref && FINITE_TYPES.includes(doc.cons[id].t)));
// Estado de una relacion finita con la postura actual: { inside, gap, tol }.
//  inside: el punto de contacto cae dentro de los limites graficos (el segmento, el barrido del arco)
//  gap: separacion con signo entre los elementos (0 = se tocan); cambia de signo al atravesarse
//  tol: separacion maxima para considerar que se tocan (graficamente en contacto)
function finiteState(doc, k) {
  const P = (id) => doc.pts[id], eps = 1e-6;
  const centerOf = (id) => P((doc.circles[id] || doc.arcs[id]).c);
  const radiusOf = (id) => (id in doc.circles ? doc.circles[id].r : Math.hypot(P(doc.arcs[id].a).x - P(doc.arcs[id].c).x, P(doc.arcs[id].a).y - P(doc.arcs[id].c).y));
  const onCurve = (id, p) => { // un circulo entero siempre; un arco, solo dentro de su barrido
    const a = doc.arcs[id];
    if (!a) return true;
    const sw = arcSweepOf(P(a.c), P(a.a), P(a.b));
    return inSweep(P(a.c), sw.a0, sw.sweep, p, eps);
  };
  switch (k.t) {
    case 'PONL': { // punto sobre segmento: esta sobre el cuando su distancia a la recta es ~0 y su pie cae entre los extremos
      const p = P(k.refs[0]), l = doc.lines[k.refs[1]], a = P(l.a), b = P(l.b), dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L);
      return { inside: t >= -eps && t <= 1 + eps, gap: ((p.x - a.x) * dy - (p.y - a.y) * dx) / L, tol: 1e-3 * L };
    }
    case 'PONC': {
      const p = P(k.refs[0]), c = centerOf(k.refs[1]), r = radiusOf(k.refs[1]);
      return { inside: onCurve(k.refs[1], p), gap: Math.hypot(p.x - c.x, p.y - c.y) - r, tol: 1e-3 * r };
    }
    case 'TANLC': {
      const [lid, cid] = k.refs, c = centerOf(cid), r = radiusOf(cid), l = doc.lines[lid], a = P(l.a), b = P(l.b), dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (L * L); // pie de la perpendicular desde el centro: el punto de contacto
      const sd = Math.abs(((c.x - a.x) * dy - (c.y - a.y) * dx) / L);
      return { inside: t >= -eps && t <= 1 + eps && onCurve(cid, { x: a.x + t * dx, y: a.y + t * dy }), gap: sd - r, tol: 1e-3 * Math.max(r, 1e-9) };
    }
    case 'TANCC': {
      const [c1, c2] = k.refs, C1 = centerOf(c1), C2 = centerOf(c2), d = Math.hypot(C2.x - C1.x, C2.y - C1.y);
      if (d < 1e-12) return { inside: true, gap: 0, tol: 1 };
      const r1 = radiusOf(c1), r2 = radiusOf(c2), u = { x: (C2.x - C1.x) / d, y: (C2.y - C1.y) / d };
      const external = Math.abs(d - (r1 + r2)) <= Math.abs(d - Math.abs(r1 - r2));
      const s1 = external || r1 >= r2 ? 1 : -1, s2 = external ? -1 : r1 >= r2 ? 1 : -1; // lado del contacto en cada circulo
      return {
        inside: onCurve(c1, { x: C1.x + s1 * u.x * r1, y: C1.y + s1 * u.y * r1 }) && onCurve(c2, { x: C2.x + s2 * u.x * r2, y: C2.y + s2 * u.y * r2 }),
        gap: external ? d - (r1 + r2) : d - Math.abs(r1 - r2), tol: 1e-3 * (r1 + r2) / 2,
      };
    }
    default: return { inside: true, gap: 0, tol: 1 };
  }
}
// Puntos que intervienen en una relacion finita (los que pueden moverse y por tanto "recorrer" el contacto en un paso).
function finitePts(doc, k) {
  const ptsOf = (r) => (r in doc.pts ? [r] : r in doc.lines ? [doc.lines[r].a, doc.lines[r].b] : r in doc.circles ? [doc.circles[r].c] : r in doc.arcs ? [doc.arcs[r].c, doc.arcs[r].a, doc.arcs[r].b] : []);
  return k.refs.flatMap(ptsOf);
}
// Separaciones y posiciones actuales de las relaciones finitas (para detectar que se atravesaron o se rozaron entre dos posturas).
function finiteGaps(doc) {
  const m = new Map();
  for (const id of finiteIds(doc)) {
    try { const k = doc.cons[id]; m.set(id, { gap: finiteState(doc, k).gap, pos: finitePts(doc, k).map((q) => ({ id: q, x: doc.pts[q].x, y: doc.pts[q].y })) }); } catch { /* geometria incompleta */ }
  }
  return m;
}
// Ids de las relaciones finitas que ahora mismo no valen. Una relacion finita vale solo si los elementos se TOCAN graficamente: su punto de
// contacto cae dentro de los limites y la separacion es ~0 (o se atravesaron desde la postura anterior prev: entonces se activa y
// la resolucion los devuelve al contacto). Un punto que simplemente "se proyecta" sobre el segmento no vale: sin esto, un punto lejos
// de una ranura la seguiria con toda la cruz, y con varias ranuras a la vez las relaciones chocan entre si.
function finiteOff(doc, prev) {
  const out = new Set();
  for (const id of finiteIds(doc)) {
    try {
      const st = finiteState(doc, doc.cons[id]), pv = prev && prev.get(id);
      const crossed = !!pv && pv.gap * st.gap < 0;
      // en un paso discreto un contacto puede pasarse de largo o rozarse por menos de lo que se movio el punto: la tolerancia suma la
      // mitad de lo que se movio lo que interviene (si el perno entra de lado por la boca de una ranura, a 5 grados de paso queda a ~0,07 de la linea)
      const moved = pv ? Math.max(0, ...pv.pos.map((q) => Math.hypot(doc.pts[q.id].x - q.x, doc.pts[q.id].y - q.y))) : 0;
      if (!(st.inside && (Math.abs(st.gap) <= st.tol + 0.5 * moved || crossed))) out.add(id);
    } catch { /* geometria incompleta: se deja valer */ }
  }
  return out;
}
export const finiteInactive = (doc) => finiteOff(doc); // para dibujar atenuadas las que no valen
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
// F con las relaciones apagadas omitidas
function withOff(F, off) {
  if (!off.size) return F;
  const G = F ? { ...F } : { order: [], skip: new Set(), map: new Map(), idleArcs: new Set() };
  G.skip = new Set([...G.skip, ...off]);
  return G;
}

// ---------------------------------------------------------------- solo lo conectado al arrastre
// Al arrastrar, solo puede cambiar lo que esta conectado al punto arrastrado por restricciones o formas (sin pasar por puntos
// fijos). El resto del dibujo ya esta resuelto: si se manda al solver solo suma costo (medido: ~0,1 ms por relacion, aunque no
// tenga nada que ver con lo que se mueve). Se resuelve solo el componente conectado; lo demas queda fijo.
// Solo en sesion de arrastre con alcance (sin formulas que lean medidas) y sin elipses nativas.
const componentsOf = (doc) => structural(doc, 'comp', () => componentsRaw(doc), true);
function componentsRaw(doc) {
  const par = new Map();
  const find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  const node = (id) => (id in doc.pts ? (doc.pts[id].fixed || isMark(doc, id) ? null : id) : id); // los fijos no conectan; las curvas si (su radio es una incognita)
  const nodesOf = (r) => {
    if (r in doc.pts) return [r];
    if (r in doc.lines) return [doc.lines[r].a, doc.lines[r].b];
    if (r in doc.circles) return [r, doc.circles[r].c];
    if (r in doc.arcs) { const a = doc.arcs[r]; return [r, a.c, a.a, a.b]; }
    if (doc.splines?.[r]) return doc.splines[r].pts;
    if (doc.ellipses?.[r]) { const e = doc.ellipses[r]; return [e.c, e.a, e.b, e.p1, e.p2].filter(Boolean); }
    return [];
  };
  const join = (ids) => {
    let first = null;
    for (const raw of ids) {
      const id = node(raw);
      if (id === null || id === undefined) continue;
      if (!par.has(id)) par.set(id, id);
      if (first === null) first = id; else { const a = find(first), b = find(id); if (a !== b) par.set(a, b); }
    }
  };
  for (const k of Object.values(doc.cons)) if (!k.ref) join(k.refs.flatMap(nodesOf));
  for (const l of Object.values(doc.lines)) join([l.a, l.b]);
  for (const [id, a] of Object.entries(doc.arcs)) join([id, a.c, a.a, a.b]);
  for (const [id, c] of Object.entries(doc.circles)) join([id, c.c]);
  for (const sp of Object.values(doc.splines || {})) join(sp.pts);
  for (const e of Object.values(doc.ellipses || {})) join([e.c, e.a, e.b, e.p1, e.p2].filter(Boolean));
  const conRoot = new Map();
  for (const [cid, k] of Object.entries(doc.cons)) {
    if (k.ref) continue;
    const r = k.refs.flatMap(nodesOf).map(node).find((x) => x !== null && x !== undefined && par.has(x));
    if (r !== undefined) conRoot.set(cid, find(r));
  }
  return { of: (id) => { const n = node(id); return n !== null && n !== undefined && par.has(n) ? find(n) : null; }, conRoot };
}
function scopeOf(doc, targets) {
  if (!liveSession(doc) || !session.scoped || !targets.length || nativeEllipses(doc).size) return null;
  const comp = componentsOf(doc), roots = new Set(), ids = new Set(targets.map((t) => t.id));
  for (const t of targets) { const r = comp.of(t.id); if (r !== null) roots.add(r); }
  return {
    has: (id) => ids.has(id) || (comp.of(id) !== null && roots.has(comp.of(id))),
    conIn: (cid) => roots.has(comp.conRoot.get(cid)),
  };
}
function liveSession(doc) { return !!session && session.ok && session.doc === doc; }

// ---------------------------------------------------------------- poda
// Al solver solo le llegan las primitivas que pueden influir en el resultado. Una linea, un circulo o un punto que
// ninguna restriccion toca no cambia nada (y los seguidores y los puntos fijos que nadie usa tampoco), pero cada
// primitiva cuesta al pasar por la frontera JS/WASM en cada resolucion, que en un dibujo grande es lo que mas pesa.
// Se conservan: las restricciones, lo que ellas mencionan (recursivamente), y los arcos con algun extremo movil (su regla
// mantiene a los extremos sobre la circunferencia).
const GEOM = new Set(['point', 'line', 'circle', 'arc']);
function refsOfPrim(p) {
  const out = [];
  for (const [k, v] of Object.entries(p)) {
    if (k === 'id') continue;
    if (k.endsWith('_id') && typeof v === 'string') out.push(v);
    else if (k.endsWith('_ids') && Array.isArray(v)) out.push(...v);
    else if (k === 'distance' && v && typeof v === 'object' && v.o_id) out.push(v.o_id);
  }
  return out;
}
function prunePrims(prims) {
  const geo = new Map(), roots = [];
  for (const p of prims) {
    if (p.type === 'param') continue;
    if (GEOM.has(p.type)) geo.set(p.id, p);
    else if (p.type === 'arc_rules') continue; // sigue a su arco
    else roots.push(p);
  }
  const point = (id) => geo.get(id);
  for (const p of geo.values()) { // arcos con algun extremo movil
    if (p.type !== 'arc') continue;
    if ([p.c_id, p.start_id, p.end_id].some((q) => point(q) && !point(q).fixed)) roots.push(p);
  }
  const need = new Set(), stack = [];
  const want = (id) => { if (!need.has(id)) { need.add(id); stack.push(id); } };
  for (const p of roots) { if (geo.has(p.id)) want(p.id); for (const r of refsOfPrim(p)) want(r); }
  while (stack.length) { const g = geo.get(stack.pop()); if (g) for (const r of refsOfPrim(g)) want(r); }
  const keep = (p) => p.type === 'param' || (p.type === 'arc_rules' ? need.has(p.a_id) : GEOM.has(p.type) ? need.has(p.id) : true);
  return prims.filter(keep);
}

// Tiempos acumulados (ms) de las tres partes de cada llamada al solver, para el medidor ?perf: pasar las primitivas a WASM,
// el calculo y leer el resultado.
export const perfStats = { push: 0, solve: 0, read: 0 };
function runSolve(prims) {
  const t0 = performance.now();
  g.clear_data();
  const names = [];
  for (const p of prims) if (p.type === 'param') { g.push_sketch_param(p.name, p.value, !!p.fixed); names.push(p.name); }
  g.push_primitives_and_params(prims.filter((p) => p.type !== 'param'));
  const t1 = performance.now();
  const status = g.solve();
  g.apply_solution();
  const t2 = performance.now();
  const params = {};
  for (const n of names) params[n] = g.get_sketch_param_value(n);
  const conflicts = g.has_gcs_conflicting_constraints() ? g.get_gcs_conflicting_constraints() : [];
  const redundant = g.has_gcs_redundant_constraints() ? g.get_gcs_redundant_constraints() : [];
  const pts = {}, circles = {}, arcs = {};
  for (const p of g.sketch_index.get_primitives()) {
    if (p.type === 'point') pts[p.id] = { x: p.x, y: p.y };
    else if (p.type === 'circle') circles[p.id] = p.radius;
    else if (p.type === 'arc') arcs[p.id] = p.radius;
  }
  const t3 = performance.now();
  perfStats.push += t1 - t0; perfStats.solve += t2 - t1; perfStats.read += t3 - t2;
  return { status, conflicts, redundant, pts, circles, arcs, params };
}

// Marca de referencia: un punto con p.mark = id de una linea. El solver la trata como fija mientras resuelve; despues de cada
// resolucion se proyecta sobre su linea (que ya esta en su nueva posicion y orientacion). Asi la marca se desliza solo a lo
// largo de la linea, arrastrada por ella, y recuerda lo recorrido: la distancia de la marca a un punto de la linea acumula
// el camino, algo que ninguna cota que dependa solo de la posicion actual puede dar (rieles, ruedas, planimetros).
export const isMark = (doc, id) => { const p = doc.pts[id]; return !!(p && p.mark && doc.lines[p.mark] && doc.lines[p.mark].a !== id && doc.lines[p.mark].b !== id); };
export function projectMarks(doc) {
  for (const [id, p] of Object.entries(doc.pts)) {
    if (!isMark(doc, id)) continue;
    const l = doc.lines[p.mark], a = doc.pts[l.a], b = doc.pts[l.b];
    if (!a || !b) continue;
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (L2 < 1e-18) continue;
    const s = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2;
    p.x = a.x + s * (b.x - a.x); p.y = a.y + s * (b.y - a.y);
  }
}

// Referencia de una marca (mark0): su distancia con signo a lo largo de la linea, medida desde el extremo a. «Reiniciar» la
// devuelve ahi, sea cual sea la pose del mecanismo: asi la lectura vuelve a su valor de partida en cualquier lugar del dibujo.
function markDist(doc, id) {
  const p = doc.pts[id], l = doc.lines[p.mark], a = doc.pts[l.a], b = doc.pts[l.b], L = Math.hypot(b.x - a.x, b.y - a.y);
  return L < 1e-9 ? null : ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L;
}
export function setMarkRef(doc, id) {
  if (!isMark(doc, id)) return false;
  const d = markDist(doc, id);
  if (d === null) return false;
  doc.pts[id].mark0 = d;
  return true;
}
// Vuelve el punto una marca de la linea lid, con la posicion actual (proyectada sobre la linea) como referencia.
export function assignMark(doc, id, lid) {
  const p = doc.pts[id];
  p.mark = lid; p.fixed = false;
  projectMarks(doc);
  setMarkRef(doc, id);
}
export function ensureMarkRefs(doc) { // archivos hechos antes de que existiera la referencia: la de partida es donde estan al abrirlos
  for (const id of Object.keys(doc.pts)) if (isMark(doc, id) && doc.pts[id].mark0 === undefined) setMarkRef(doc, id);
}
// Devuelve las marcas (todas, o las de ids) a su referencia. Cuenta las que movio.
export function resetMarks(doc, ids) {
  let n = 0;
  for (const id of ids ?? Object.keys(doc.pts)) {
    if (!isMark(doc, id)) continue;
    const p = doc.pts[id];
    if (p.mark0 === undefined) { setMarkRef(doc, id); continue; }
    const l = doc.lines[p.mark], a = doc.pts[l.a], b = doc.pts[l.b], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) continue;
    p.x = a.x + ((b.x - a.x) / L) * p.mark0; p.y = a.y + ((b.y - a.y) / L) * p.mark0;
    n++;
  }
  return n;
}

function commit(doc, res) {
  for (const [id, q] of Object.entries(res.pts)) {
    if (doc.pts[id] && !id.startsWith('__')) { doc.pts[id].x = q.x; doc.pts[id].y = q.y; }
  }
  for (const [id, r] of Object.entries(res.circles)) if (doc.circles[id]) doc.circles[id].r = r;
  for (const [id, r] of Object.entries(res.arcs)) if (doc.arcs[id]) doc.arcs[id].r = Math.abs(r);
  for (const [name, v] of Object.entries(res.params || {})) if (name.startsWith('__u:') && doc.cons[name.slice(4)]) doc.cons[name.slice(4)].u = v;
  for (const [sid, ts] of Object.entries(res.ts || {})) if (doc.splines[sid]) doc.splines[sid].ts = ts;
}

// Restricciones del documento que el solver reporta como redundantes: no agregan informacion (otras ya implican lo mismo)
// y, mientras existan, cada resolucion se hace dos veces y se diagnostica, lo que en un dibujo grande multiplica el
// costo. Solo cuenta una restriccion si TODAS sus primitivas salieron redundantes (si solo una parte lo es, quitarla
// quitaria algo que si restringe). No modifica doc. Devuelve los ids de doc.cons.
export function redundantCons(doc) {
  if (!g) return [];
  touchSession(doc);
  const F = withOff(prepare(doc), finiteOff(doc));
  const res = solveLoop(doc, null, null, F);
  const red = new Set(res.redundant || []);
  if (!red.size) return [];
  const out = [];
  for (const [id, k] of Object.entries(doc.cons)) {
    if (k.ref) continue;
    const ids = conPrims(doc, id, k).map((q) => q.id);
    if (ids.length && ids.every((q) => red.has(q))) out.push(id);
  }
  return out;
}

// Resuelve el documento. targets (opcional): [{id,x,y}] puntos que el usuario arrastra;
// se atraen con una restriccion debil y luego se resuelve sin ella para que el
// resultado sea siempre factible. No modifica doc si falla.
export function solve(doc, targets = []) {
  if (!g) return { ok: true, conflicts: [] };
  touchSession(doc);
  const F0 = prepare(doc);
  const tg0 = retarget(doc, F0, targets);
  const G = gearPlan(doc, tg0);
  const S = scopeOf(doc, tg0);
  const gap0 = finiteIds(doc).length ? finiteGaps(doc) : null; // separaciones al empezar: sirven para detectar que se atraveso un contacto en este paso
  let off = finiteOff(doc), r;
  for (let it = 0; it < 3; it++) { // si al resolver cambia que relaciones finitas valen, se resuelve de nuevo con el conjunto nuevo
    r = solveCore(doc, F0, G.targets, G, S, off, it > 0);
    if (!r.ok) break;
    const off2 = finiteOff(doc, gap0);
    if (sameSet(off, off2)) break;
    off = off2;
  }
  return r;
}
function solveCore(doc, F0, targets, G, S, off, refine) {
  let F = F0 ? { ...F0 } : null;
  // en las repeticiones, un destino que el punto ya alcanzo no se usa: con el punto justo encima, la atraccion de distancia cero se indefine
  if (refine) targets = targets.filter((t) => !doc.pts[t.id] || Math.hypot(t.x - doc.pts[t.id].x, t.y - doc.pts[t.id].y) > 1e-7);
  if (off.size) F = withOff(F, off);
  if (S) { F ||= { order: [], skip: new Set(), map: new Map(), idleArcs: new Set() }; F.scope = S; }
  const gearPrims = G.items.filter((it) => !S || it.pids.some((id) => S.has(id))).flatMap((it) => it.prims);
  if (gearPrims.length) { F ||= { order: [], skip: new Set(), map: new Map(), idleArcs: new Set() }; F.gearPrims = gearPrims; }
  if (S) { // los arcos fuera del alcance (sus extremos quedan fijos) no hacen falta: solo sumarian reglas redundantes
    F.idleArcs = new Set(F.idleArcs);
    for (const [id, a] of Object.entries(doc.arcs)) if (!S.has(id) && ![a.c, a.a, a.b].some((q) => S.has(q))) F.idleArcs.add(id);
  }
  let pos = null;
  const live = targets.filter((t) => doc.pts[t.id] && !doc.pts[t.id].fixed && !isMark(doc, t.id));
  if (live.length) {
    const extra = [];
    live.forEach((t, i) => {
      extra.push({ id: `__t${i}`, type: 'point', x: t.x, y: t.y, fixed: true });
      extra.push({ id: `__d${i}`, type: 'p2p_distance', p1_id: t.id, p2_id: `__t${i}`, distance: 0, scale: 0.02 });
    });
    const r1 = solveLoop(doc, ellipseFlipStart(doc, live), extra, F);
    const u = {};
    for (const [name, v] of Object.entries(r1.params || {})) if (name.startsWith('__u:')) u[name.slice(4)] = v;
    pos = { pts: r1.pts, circles: r1.circles, arcs: r1.arcs, u };
  }
  const res = solveLoop(doc, pos, null, F);
  if (pos && F?.scope) { // con alcance se podan las primitivas sin restricciones: un punto libre (el ancla de un texto) solo esta en la 1.a pasada, la del destino
    for (const id of Object.keys(pos.pts)) if (!(id in res.pts)) res.pts[id] = pos.pts[id];
    for (const id of Object.keys(pos.circles || {})) if (!(id in res.circles)) res.circles[id] = pos.circles[id];
    for (const id of Object.keys(pos.arcs || {})) if (!(id in res.arcs)) res.arcs[id] = pos.arcs[id];
  }
  if (F) {
    applyFollowers(doc, F, (id) => doc.pts[id], res.pts);
    for (const id of F.idleArcs) { const a = doc.arcs[id], c = res.pts[a.c] || doc.pts[a.c], q = res.pts[a.a] || doc.pts[a.a]; res.arcs[id] = Math.hypot(q.x - c.x, q.y - c.y); }
  }
  const ok = (res.status === 0 || res.status === 1) && res.conflicts.length === 0 && (!hasSpl(doc) || splineResidual(doc, res) < 1e-3);
  if (ok) { commit(doc, res); projectMarks(doc); trackGears(doc); }
  return { ok, conflicts: res.conflicts, status: res.status };
}

// Como solve, pero si un salto grande del punto arrastrado hace perder el hilo al solver (puntos sobre circulos con
// otros enlaces), reintenta recorriendo el camino en tramos cortos: 4 y, si hace falta, 16. Si ninguno llega, doc queda
// como estaba. Sirve para arrastres rapidos de mecanismos con cotas que leen medidas.
export function solveSteps(doc, targets = []) {
  const r = solve(doc, targets);
  const live = targets.filter((t) => doc.pts[t.id] && !doc.pts[t.id].fixed && !isMark(doc, t.id));
  if (r.ok || !live.length) return r;
  const before = JSON.stringify(doc), from = live.map((t) => ({ x: doc.pts[t.id].x, y: doc.pts[t.id].y }));
  const restore = () => { const d = JSON.parse(before); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, d); };
  for (const n of [4, 16]) {
    let ok = true;
    for (let i = 1; i <= n && ok; i++) {
      const f = i / n;
      ok = solve(doc, live.map((t, j) => ({ id: t.id, x: from[j].x + (t.x - from[j].x) * f, y: from[j].y + (t.y - from[j].y) * f }))).ok;
    }
    if (ok) return { ok: true, conflicts: [], status: 0 };
    restore();
  }
  return r;
}

// Agrega restricciones y resuelve. Si falla y hay coincidencias entre puntos, reintenta acercando los puntos poco a
// poco y poniendo las restricciones al final: un salto grande de golpe puede hacer que el solver pierda el hilo (por
// ejemplo con arcos tangentes, que cambian de rama) aunque el caso tenga solucion. Si no hay solucion, doc queda
// como estaba antes de agregarlas.
export function addConsSolved(doc, list, steps = 16) {
  const before = JSON.stringify(doc);
  const restore = () => { const d = JSON.parse(before); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, d); };
  list.forEach((k) => addCon(doc, k));
  let r = solve(doc, []);
  if (r.ok || !list.some((k) => k.t === 'COI')) { if (!r.ok) restore(); return r; }
  restore();
  const goals = list.filter((k) => k.t === 'COI').map((k) => {
    const [a, b] = k.refs, mover = doc.pts[b].fixed ? a : b, other = mover === b ? a : b;
    return { id: mover, from: { x: doc.pts[mover].x, y: doc.pts[mover].y }, to: { x: doc.pts[other].x, y: doc.pts[other].y } };
  });
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    if (!solve(doc, goals.map((g) => ({ id: g.id, x: g.from.x + (g.to.x - g.from.x) * f, y: g.from.y + (g.to.y - g.from.y) * f }))).ok) { restore(); return { ok: false, conflicts: [] }; }
  }
  list.forEach((k) => addCon(doc, k));
  r = solve(doc, []);
  if (!r.ok) restore();
  return r;
}

// Tras mover los puntos de un spline con relaciones, sus parametros (fijos mientras se resuelve) pueden
// quedar desproporcionados respecto de las distancias reales y la curva ondula. Esto los recalcula con la
// longitud de cuerda actual y vuelve a resolver; si no converge, deja los anteriores. Devuelve true si cambio.
export function reparamSplines(doc) {
  const old = {}, oldU = {};
  for (const [sid, sp] of Object.entries(doc.splines || {})) {
    const closed = isClosed(sp);
    if (!validParams(sp.ts, sp.pts.length, closed)) continue;
    const ts = chordParams(sp.pts.map((id) => doc.pts[id]), closed);
    if (ts.every((v, i) => Math.abs(v - sp.ts[i]) < 1e-3)) continue;
    old[sid] = sp.ts; sp.ts = ts;
  }
  if (!Object.keys(old).length) return false;
  for (const [id, k] of Object.entries(doc.cons)) if (SPL.has(k.t) && old[k.refs[1]] && 'u' in k) { oldU[id] = k.u; delete k.u; }
  if (solve(doc, []).ok) return true;
  for (const [sid, ts] of Object.entries(old)) doc.splines[sid].ts = ts;
  for (const [id, u] of Object.entries(oldU)) doc.cons[id].u = u;
  return false;
}

export { conRefs };

// Puente entre el documento y el solver de restricciones (planegcs, de FreeCAD, en WASM).
import { init_planegcs_module, GcsWrapper } from '@salusoft89/planegcs';
import { conRefs } from './model.js';
import { arcSweepOf, closestOnPolyline } from './geom.js';
import { bsplineThrough, bsplineSamples, bsplinePoint, bsplineTangent, sampleParam, chordParams, validParams } from './bspline.js';

let g = null;

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
const hasSpl = (doc) => Object.values(doc.cons).some((k) => splCon(doc, k));
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
function nativeSplinePrims(doc, pos, memo) {
  const out = [], P = (id) => pos?.pts?.[id] || doc.pts[id];
  const used = new Set();
  for (const k of Object.values(doc.cons)) if (splCon(doc, k)) used.add(k.refs[1]);
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
    const bs = curveOf(doc, k.refs[1], P, memo), u = res.params?.[`__u:${id}`];
    if (!bs || !Number.isFinite(u)) continue;
    const e = bsplinePoint(bs, u), q = P(splPoint(k));
    worst = Math.max(worst, Math.hypot(e.x - q.x, e.y - q.y));
  }
  return worst;
}

// Una pasada del solver; con splines se repite si un punto de contacto se salio del dominio de la curva
// (el solver habia extrapolado) para resolver de nuevo desde el parametro corregido.
function solveLoop(doc, pos, extra) {
  const spl = hasSpl(doc);
  const memo = {};
  let cur = pos, res = null;
  for (let i = 0; i < (spl ? 4 : 1); i++) {
    res = runSolve(build(doc, cur, [...(spl ? nativeSplinePrims(doc, cur, memo) : []), ...(extra || [])]));
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

function build(doc, pos, extra) {
  const out = [];
  const P = (id) => pos?.pts?.[id] || doc.pts[id];
  for (const [id, p] of Object.entries(doc.pts)) {
    const q = P(id);
    out.push({ id, type: 'point', x: q.x, y: q.y, fixed: !!p.fixed });
  }
  for (const [id, l] of Object.entries(doc.lines)) out.push({ id, type: 'line', p1_id: l.a, p2_id: l.b });
  for (const [id, c] of Object.entries(doc.circles)) {
    out.push({ id, type: 'circle', c_id: c.c, radius: pos?.circles?.[id] ?? c.r });
  }
  for (const [id, a] of Object.entries(doc.arcs)) {
    const { a0, sweep } = arcSweepOf(P(a.c), P(a.a), P(a.b));
    out.push({ id, type: 'arc', c_id: a.c, start_id: a.a, end_id: a.b, radius: pos?.arcs?.[id] ?? a.r, start_angle: a0, end_angle: a0 + sweep });
    out.push({ id: `${id}_rules`, type: 'arc_rules', a_id: id });
  }
  for (const [id, k] of Object.entries(doc.cons)) out.push(...conPrims(doc, id, k));
  if (extra) out.push(...extra);
  return out;
}

function runSolve(prims) {
  g.clear_data();
  const names = [];
  for (const p of prims) if (p.type === 'param') { g.push_sketch_param(p.name, p.value, !!p.fixed); names.push(p.name); }
  g.push_primitives_and_params(prims.filter((p) => p.type !== 'param'));
  const status = g.solve();
  g.apply_solution();
  const params = {};
  for (const n of names) params[n] = g.get_sketch_param_value(n);
  const conflicts = g.has_gcs_conflicting_constraints() ? g.get_gcs_conflicting_constraints() : [];
  const pts = {}, circles = {}, arcs = {};
  for (const p of g.sketch_index.get_primitives()) {
    if (p.type === 'point') pts[p.id] = { x: p.x, y: p.y };
    else if (p.type === 'circle') circles[p.id] = p.radius;
    else if (p.type === 'arc') arcs[p.id] = p.radius;
  }
  return { status, conflicts, pts, circles, arcs, params };
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

// Resuelve el documento. targets (opcional): [{id,x,y}] puntos que el usuario arrastra;
// se atraen con una restriccion debil y luego se resuelve sin ella para que el
// resultado sea siempre factible. No modifica doc si falla.
export function solve(doc, targets = []) {
  if (!g) return { ok: true, conflicts: [] };
  let pos = null;
  const live = targets.filter((t) => doc.pts[t.id] && !doc.pts[t.id].fixed);
  if (live.length) {
    const extra = [];
    live.forEach((t, i) => {
      extra.push({ id: `__t${i}`, type: 'point', x: t.x, y: t.y, fixed: true });
      extra.push({ id: `__d${i}`, type: 'p2p_distance', p1_id: t.id, p2_id: `__t${i}`, distance: 0, scale: 0.02 });
    });
    const r1 = solveLoop(doc, null, extra);
    const u = {};
    for (const [name, v] of Object.entries(r1.params || {})) if (name.startsWith('__u:')) u[name.slice(4)] = v;
    pos = { pts: r1.pts, circles: r1.circles, arcs: r1.arcs, u };
  }
  const res = solveLoop(doc, pos, null);
  const ok = (res.status === 0 || res.status === 1) && res.conflicts.length === 0 && (!hasSpl(doc) || splineResidual(doc, res) < 1e-3);
  if (ok) commit(doc, res);
  return { ok, conflicts: res.conflicts, status: res.status };
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

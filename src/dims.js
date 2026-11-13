// Geometria de las cotas (lineas de extension, flechas, posicion editable). Sin DOM.
// layoutDim devuelve instrucciones de dibujo en pixeles de pantalla; dragDim cambia la
// posicion de la cota (k.off, k.lt, k.ang, k.lp) sin tocar la geometria ni el solver.
import { lineLine, signedAngle, norm, TAU, inSweep } from './geom.js';
import { arcOf } from './model.js';

export const ARROW = 9;
export const DIAM = '\u2300'; // simbolo de diametro (U+2300)
export const fmtNum = (v) => (Math.abs(v) >= 1000 ? v.toFixed(1) : String(Math.round(v * 1000) / 1000));

const V = (view) => (p) => ({ x: p.x * view.s + view.ox, y: view.oy - p.y * view.s });

function footOnLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

// Puntos que acota una distancia (DIST: 2 puntos; DISTPL: punto y su pie sobre la recta).
function distEnds(doc, k) {
  if (k.t === 'DIST') return [doc.pts[k.refs[0]], doc.pts[k.refs[1]]];
  const p = doc.pts[k.refs[0]], l = doc.lines[k.refs[1]];
  return [p, footOnLine(p, doc.pts[l.a], doc.pts[l.b])];
}

// ---- cota angular ----
// Dos rectas forman 4 sectores (a, 180-a, a, 180-a). k.v es el angulo "verdadero" que ve el solver (con
// signo, de la direccion de la 1.a recta a la de la 2.a); k.s1 y k.s2 (+1/-1) eligen con que semirrecta de
// cada recta se acota, es decir en que sector se coloca la cota. El valor que se muestra es siempre
// positivo (0 a 180): el del sector elegido. Mover la cota a otro sector cambia el valor mostrado
// (20 o 160) sin tocar la geometria.
// Angulo continuo: una cota con k.cur (grados, sin limite: 400 es una vuelta y 40°) y k.sg (+1 antihorario, -1 horario,
// el sentido en que se mide desde la 1.a semirrecta hasta la 2.a). Es la medida de siempre, pero sin el tope de 180°:
// las conductoras guardan el valor que pusiste y las de referencia (solo lectura) lo siguen de un cambio al siguiente
// tomando siempre el equivalente mas cercano al ultimo (trackAngles), asi pasan de 180° a 190° y a 400°.
// Sin k.cur (dibujos viejos) se muestra el valor de 0 a 180 como antes.
const normA = (a) => { while (a > Math.PI) a -= TAU; while (a <= -Math.PI) a += TAU; return a; };
const normD = (a) => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };
export function angSector(doc, k) {
  const l1 = doc.lines[k.refs[0]], l2 = doc.lines[k.refs[1]];
  const a1 = doc.pts[l1.a], b1 = doc.pts[l1.b], a2 = doc.pts[l2.a], b2 = doc.pts[l2.b];
  const d1 = { x: b1.x - a1.x, y: b1.y - a1.y }, d2 = { x: b2.x - a2.x, y: b2.y - a2.y };
  const V0 = lineLine(a1, b1, a2, b2);
  const A = k.ref ? signedAngle(d1, d2) : ((k.v || 0) * Math.PI) / 180;
  let s1 = k.s1 === -1 ? -1 : 1, s2 = k.s2 === -1 ? -1 : 1;
  if (!k.s1 && !k.s2 && V0) {
    // por defecto las semirrectas que apuntan hacia donde estan los segmentos: asi las lineas de extension
    // unen los segmentos con el arco
    const m1 = { x: (a1.x + b1.x) / 2 - V0.x, y: (a1.y + b1.y) / 2 - V0.y }, m2 = { x: (a2.x + b2.x) / 2 - V0.x, y: (a2.y + b2.y) / 2 - V0.y };
    s1 = m1.x * d1.x + m1.y * d1.y >= 0 ? 1 : -1;
    s2 = m2.x * d2.x + m2.y * d2.y >= 0 ? 1 : -1;
  }
  const phi = normA(A + Math.PI * ((s2 < 0 ? 1 : 0) - (s1 < 0 ? 1 : 0)));
  let val = (Math.abs(phi) * 180) / Math.PI, psi = phi;
  if (k.cur !== undefined) {
    const sg = k.sg === -1 ? -1 : 1, m = (sg * phi * 180) / Math.PI; // medida en el sentido de la cota, de -180 a 180
    val = k.ref ? k.cur + normD(m - k.cur) : k.cur; // referencia: el equivalente mas cercano al ultimo valor
    psi = (sg * (val % 360) * Math.PI) / 180; // lo que se dibuja (el arco puede pasar de 180°)
  }
  return { V0, d1, d2, s1, s2, phi, psi, val, A };
}
// Da a una cota angular (conductora o de referencia) su valor continuo, con la medida y el sentido actuales.
export function initAngle(doc, k) {
  const S = angSector(doc, { ...k, cur: undefined, sg: undefined });
  k.sg = S.phi < 0 ? -1 : 1; k.cur = S.val;
}
// Despues de cada solucion: las cotas angulares de referencia siguen la medida sin saltar al volver de 180° a 0°.
export function trackAngles(doc) {
  for (const k of Object.values(doc.cons)) {
    if (k.t !== 'ANG' || !k.ref) continue;
    if (k.cur === undefined) initAngle(doc, k); else k.cur = angSector(doc, k).val;
  }
}
// Valor verdadero (grados, para k.v) que corresponde a un valor positivo del sector que se muestra.
export function angTrue(doc, k, valDeg) {
  const S = angSector(doc, k);
  const sg = k.cur !== undefined ? (k.sg === -1 ? -1 : 1) : S.phi < 0 ? -1 : 1;
  return (normA(sg * (valDeg * Math.PI) / 180 - Math.PI * ((S.s2 < 0 ? 1 : 0) - (S.s1 < 0 ? 1 : 0))) * 180) / Math.PI;
}

// Valor que muestra una cota. Las de referencia (k.ref) no restringen nada: miden en vivo.
// ANG4 (angulo entre dos segmentos de puntos) se acota como un angulo entre dos lineas virtuales.
const v4 = (doc, k) => ({
  d: { ...doc, lines: { ...doc.lines, __v1: { a: k.refs[0], b: k.refs[1] }, __v2: { a: k.refs[2], b: k.refs[3] } } },
  k: { ...k, t: 'ANG', refs: ['__v1', '__v2'] },
});
export function dimValue(doc, k) {
  if (k.t === 'ANG4') { const x = v4(doc, k); return dimValue(x.d, x.k); }
  if (k.t === 'ANG') return angSector(doc, k).val;
  if (!k.ref) return k.v;
  if (k.t === 'DIST' || k.t === 'DISTPL') { const [p1, p2] = distEnds(doc, k); return Math.hypot(p2.x - p1.x, p2.y - p1.y); }
  if (k.t === 'RAD') { const o = doc.circles[k.refs[0]] || doc.arcs[k.refs[0]]; return o ? o.r : k.v; }
  return k.v;
}

export function dimText(doc, k) {
  if (k.t === 'ANG4') { const x = v4(doc, k); return dimText(x.d, x.k); }
  const v = dimValue(doc, k);
  if (k.t === 'ANG') return k.unit === 'rad' ? fmtNum((v * Math.PI) / 180) + ' rad' : fmtNum(v) + '°';
  if (k.t === 'RAD') return (k.refs[0] in doc.circles ? DIAM + fmtNum(2 * v) : 'R' + fmtNum(v));
  return fmtNum(v);
}

function layoutDimBase(doc, k, view) {
  const s = view.s, v = V(view);
  const out = { lines: [], arcs: [], arrows: [], label: null };
  const text = dimText(doc, k);

  if (k.t === 'DIST' || k.t === 'DISTPL') {
    const [p1, p2] = distEnds(doc, k);
    const A = v(p1), B = v(p2), L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < 1e-6) { out.label = { x: A.x + 16, y: A.y - 16, text }; return out; }
    const u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, n = { x: -u.y, y: u.x };
    const off = (k.off ?? 16 / s) * s, sg = off < 0 ? -1 : 1;
    const A2 = { x: A.x + n.x * off, y: A.y + n.y * off }, B2 = { x: B.x + n.x * off, y: B.y + n.y * off };
    if (Math.abs(off) > 7) {
      out.lines.push([A.x + n.x * sg * 3, A.y + n.y * sg * 3, A2.x + n.x * sg * 5, A2.y + n.y * sg * 5]);
      out.lines.push([B.x + n.x * sg * 3, B.y + n.y * sg * 3, B2.x + n.x * sg * 5, B2.y + n.y * sg * 5]);
    }
    const t = k.lt ?? 0.5;
    const lo = Math.min(0, t), hi = Math.max(1, t);
    const inside = L >= 2 * ARROW + 4;
    const tail = inside ? 0 : ARROW + 7;
    out.lines.push([A2.x + u.x * lo * L - u.x * tail, A2.y + u.y * lo * L - u.y * tail, A2.x + u.x * hi * L + u.x * tail, A2.y + u.y * hi * L + u.y * tail]);
    if (inside) {
      out.arrows.push({ x: A2.x, y: A2.y, dx: -u.x, dy: -u.y }, { x: B2.x, y: B2.y, dx: u.x, dy: u.y });
    } else {
      out.arrows.push({ x: A2.x, y: A2.y, dx: u.x, dy: u.y }, { x: B2.x, y: B2.y, dx: -u.x, dy: -u.y });
    }
    out.label = { x: A2.x + u.x * t * L + n.x * sg * 11, y: A2.y + u.y * t * L + n.y * sg * 11, text };
    return out;
  }

  if (k.t === 'ANG') {
    const l1 = doc.lines[k.refs[0]], l2 = doc.lines[k.refs[1]];
    const a1 = doc.pts[l1.a], b1 = doc.pts[l1.b], a2 = doc.pts[l2.a], b2 = doc.pts[l2.b];
    const S = angSector(doc, k), V0 = S.V0;
    if (!V0) {
      const m = v({ x: (a1.x + b1.x + a2.x + b2.x) / 4, y: (a1.y + b1.y + a2.y + b2.y) / 4 });
      out.label = { x: m.x + 14, y: m.y - 14, text };
      return out;
    }
    const th1 = Math.atan2(S.d1.y * S.s1, S.d1.x * S.s1), psi = S.psi, sgn = psi >= 0 ? 1 : -1;
    const R = Math.max(14, (k.off ?? 50 / s) * s);
    const C = v(V0);
    out.arcs.push({ cx: C.x, cy: C.y, r: R, a0: -th1, a1: -(th1 + psi), ccw: psi > 0 });
    const at = (th) => ({ x: C.x + R * Math.cos(th), y: C.y - R * Math.sin(th) });
    // flechas en los extremos del arco, apuntando hacia fuera del arco
    const tan = (th) => ({ x: -Math.sin(th), y: -Math.cos(th) }); // tangente en pantalla (th creciente en el modelo)
    const e1 = at(th1), e2 = at(th1 + psi), t1 = tan(th1), t2 = tan(th1 + psi);
    out.arrows.push({ x: e1.x, y: e1.y, dx: -sgn * t1.x, dy: -sgn * t1.y }, { x: e2.x, y: e2.y, dx: sgn * t2.x, dy: sgn * t2.y });
    // lineas de extension: prolongan cada recta hasta pasar el arco si no llega
    [[th1, a1, b1], [th1 + psi, a2, b2]].forEach(([th, pa_, pb_]) => {
      const ux = Math.cos(th), uy = Math.sin(th);
      const pa = ((pa_.x - V0.x) * ux + (pa_.y - V0.y) * uy) * s, pb = ((pb_.x - V0.x) * ux + (pb_.y - V0.y) * uy) * s;
      const near = Math.min(pa, pb), far = Math.max(pa, pb);
      // el arco queda mas alla del extremo del segmento: se prolonga la recta hasta pasarlo; si queda entre el
      // vertice y el segmento, se prolonga el segmento hacia el vertice
      if (far < R) { const from = Math.max(far, 0) + 3, to = R + 6; if (from < to) out.lines.push([C.x + ux * from, C.y - uy * from, C.x + ux * to, C.y - uy * to]); }
      else if (near > R) { const from = near - 3, to = Math.max(R - 6, 0); if (from > to) out.lines.push([C.x + ux * from, C.y - uy * from, C.x + ux * to, C.y - uy * to]); }
    });
    const thm = th1 + psi / 2;
    out.label = { x: C.x + (R + 13) * Math.cos(thm), y: C.y - (R + 13) * Math.sin(thm), text };
    return out;
  }

  if (k.t === 'RAD') {
    // Cotas de radio y diametro segun ANSI/ASME Y14.5: con el texto DENTRO, la linea de cota va por el
    // interior (diametro: de lado a lado con flecha en ambos extremos; radio: del centro al arco con una
    // flecha en el arco). Con el texto FUERA, una linea de llamada radial parte del arco con la flecha
    // tocandolo desde afuera y apuntando al centro, y termina en un tramo horizontal junto al texto.
    const circ = doc.circles[k.refs[0]], arc = circ ? null : doc.arcs[k.refs[0]];
    const o = circ || arc;
    if (!o) return out;
    const Cm = doc.pts[o.c], C = v(Cm), rs = o.r * s;
    let defAng = Math.PI / 4;
    if (arc) { const g = arcOf(doc, arc); defAng = g.a0 + g.sweep / 2; }
    let ang = k.ang ?? defAng;
    const tw = 0.6 * 12 * text.length + 8; // ancho aproximado del texto (px)
    let lp;
    if (k.lp !== undefined) lp = k.lp * s;
    else {
      const fits = circ ? 2 * rs >= tw + 2 * ARROW + 6 : rs >= tw + ARROW + 8;
      lp = fits ? (circ ? 0 : o.r * 0.5 * s) : rs + 26; // por defecto dentro si cabe, fuera si no
    }
    if (lp < 0) { ang += Math.PI; lp = -lp; }
    const d = { x: Math.cos(ang), y: -Math.sin(ang) }, nrm = { x: -d.y, y: d.x };
    const P = { x: C.x + d.x * rs, y: C.y + d.y * rs };
    if (lp > rs + 2) {
      // texto fuera: llamada radial + tramo horizontal + texto
      const E = { x: C.x + d.x * lp, y: C.y + d.y * lp };
      const side = d.x >= 0 ? 1 : -1, E2 = { x: E.x + side * 10, y: E.y };
      out.lines.push([P.x, P.y, E.x, E.y], [E.x, E.y, E2.x, E2.y]);
      out.arrows.push({ x: P.x, y: P.y, dx: -d.x, dy: -d.y });
      out.label = { x: E2.x + side * (tw / 2 + 1), y: E2.y, text };
    } else {
      const L = { x: C.x + d.x * lp, y: C.y + d.y * lp };
      if (circ) {
        const P1 = { x: C.x - d.x * rs, y: C.y - d.y * rs };
        out.lines.push([P1.x, P1.y, P.x, P.y]);
        out.arrows.push({ x: P.x, y: P.y, dx: d.x, dy: d.y }, { x: P1.x, y: P1.y, dx: -d.x, dy: -d.y });
      } else {
        out.lines.push([C.x, C.y, P.x, P.y]);
        out.arrows.push({ x: P.x, y: P.y, dx: d.x, dy: d.y });
      }
      out.label = { x: L.x + nrm.x * 11, y: L.y + nrm.y * 11, text };
    }
    if (arc) {
      // si la cota cae fuera del tramo, prolonga el arco con una linea de extension
      const g = arcOf(doc, arc);
      if (!inSweep(Cm, g.a0, g.sweep, { x: Cm.x + Math.cos(ang), y: Cm.y + Math.sin(ang) }, 1e-6)) {
        const dd = norm(ang - g.a0), toEnd = dd - g.sweep, toStart = TAU - dd;
        if (toEnd <= toStart) out.arcs.push({ cx: C.x, cy: C.y, r: rs, a0: -(g.a0 + g.sweep), a1: -ang, ccw: true, dashed: true });
        else out.arcs.push({ cx: C.x, cy: C.y, r: rs, a0: -ang, a1: -(g.a0 + TAU), ccw: true, dashed: true });
      }
    }
    return out;
  }
  return out;
}

// Las cotas de referencia llevan la etiqueta en cursiva (label.italic).
export function layoutDim(doc, k, view) {
  if (k.t === 'ANG4') { const x = v4(doc, k); return layoutDim(x.d, x.k, view); }
  const L = layoutDimBase(doc, k, view);
  if (L.label) L.label.italic = !!k.ref;
  return L;
}

// El usuario arrastra la etiqueta: reposiciona la cota. Devuelve true si cambio algo.
export function dragDim(doc, k, view, p) {
  if (k.t === 'ANG4') {
    const x = v4(doc, k), ok = dragDim(x.d, x.k, view, p);
    for (const f of ['off', 'lt', 'ang', 'lp', 's1', 's2']) if (x.k[f] !== undefined) k[f] = x.k[f];
    return ok;
  }
  const s = view.s, v = V(view);
  if (k.t === 'DIST' || k.t === 'DISTPL') {
    const [p1, p2] = distEnds(doc, k);
    const A = v(p1), B = v(p2), L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < 1e-6) return false;
    const u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, n = { x: -u.y, y: u.x };
    const rx = p.x - A.x, ry = p.y - A.y;
    k.off = (rx * n.x + ry * n.y) / s;
    k.lt = Math.max(-1.5, Math.min(2.5, (rx * u.x + ry * u.y) / L));
    return true;
  }
  if (k.t === 'ANG') {
    const l1 = doc.lines[k.refs[0]], l2 = doc.lines[k.refs[1]];
    const V0 = lineLine(doc.pts[l1.a], doc.pts[l1.b], doc.pts[l2.a], doc.pts[l2.b]);
    if (!V0) return false;
    const C = v(V0);
    k.off = Math.max(14, Math.hypot(p.x - C.x, p.y - C.y) - 13) / s;
    // el sector donde cae la cota decide que angulo se acota (20 o 160, por ejemplo)
    const S = angSector(doc, k);
    const beta = Math.atan2(-(p.y - C.y), p.x - C.x), g1 = Math.atan2(S.d1.y, S.d1.x), g2 = Math.atan2(S.d2.y, S.d2.x);
    for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      const R1 = g1 + (s1 < 0 ? Math.PI : 0), R2 = g2 + (s2 < 0 ? Math.PI : 0);
      const phi = normA(R2 - R1), tb = normA(beta - R1);
      if (Math.abs(phi) < 1e-9 || Math.abs(phi) > Math.PI - 1e-9) continue;
      if (phi > 0 ? tb >= 0 && tb <= phi : tb <= 0 && tb >= phi) { k.s1 = s1; k.s2 = s2; }
    }
    if (k.cur !== undefined) initAngle(doc, k); // otro sector es otro angulo: empieza de nuevo (0 a 180) con la geometria igual
    return true;
  }
  if (k.t === 'RAD') {
    const o = doc.circles[k.refs[0]] || doc.arcs[k.refs[0]];
    if (!o) return false;
    const C = v(doc.pts[o.c]);
    const dx = p.x - C.x, dy = p.y - C.y, d = Math.hypot(dx, dy);
    if (d < 4) return false;
    k.ang = Math.atan2(-dy, dx);
    k.lp = d / s;
    return true;
  }
  return false;
}

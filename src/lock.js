// Bloqueo "suave" al crear lineas: si el cursor queda cerca de una direccion notable, la linea se ajusta a ella
// (y la herramienta puede agregar la restriccion correspondiente). Sin DOM; coordenadas del modelo.
//  - Siempre: direcciones cada `step` grados (15 por defecto), que incluyen horizontal y vertical.
//  - Cerca de una linea existente (o si se empezo en ella): paralela y perpendicular a ella.
//  - Cerca de un arco o circulo (o si se empezo en uno): tangente.
//  - Si la direccion bloqueada cruza un elemento cerca del cursor, la linea termina en ese cruce
//    (y queda sobre ese elemento).
// Si el cursor esta sobre un punto o una interseccion, manda ese punto y no hay bloqueo.
import { dist, inSweep, closestOnSeg, lineLine, lineCircle, polylineLine } from './geom.js';
import { arcOf, splinePolyline } from './model.js';

const LABELS = { H: 'H', V: 'V', PAR: '∥', PERP: '⟂', TAN: 'T' };
const NEAR_PX = 36; // lineas que se consideran "cercanas" al cursor para paralela/perpendicular

// Que elementos "origen" tiene un punto de inicio: lineas que lo tienen de extremo o que lo contienen (PONL),
// circulos/arcos que lo contienen (PONC) y arcos que lo tienen de extremo.
export function originsOfPoint(doc, pid) {
  const lines = new Set(), curves = new Set();
  for (const [id, l] of Object.entries(doc.lines)) if (l.a === pid || l.b === pid) lines.add(id);
  for (const [id, a] of Object.entries(doc.arcs)) if (a.a === pid || a.b === pid) curves.add(id);
  for (const k of Object.values(doc.cons)) {
    if (k.refs?.[0] !== pid) continue;
    if (k.t === 'PONL') lines.add(k.refs[1]);
    else if (k.t === 'PONC') curves.add(k.refs[1]);
  }
  return { lines: [...lines], curves: [...curves] };
}
// Lo mismo a partir de lo que se toco antes de crear el punto (snapAt).
export function originsOfSnap(doc, snap) {
  if (!snap) return { lines: [], curves: [] };
  if (snap.type === 'pt') return originsOfPoint(doc, snap.id);
  if (snap.type === 'ln') return { lines: [snap.id], curves: [] };
  if (snap.type === 'ci' || snap.type === 'ar') return { lines: [], curves: [snap.id] };
  if (snap.type === 'int') {
    const o = { lines: [], curves: [] };
    for (const r of snap.refs || []) (r.k === 'ln' ? o.lines : o.curves).push(r.id);
    return o;
  }
  return { lines: [], curves: [] };
}

const curveOf = (doc, id) => doc.circles[id] || doc.arcs[id];
const angDiff = (a, b) => { let d = Math.abs(a - b) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; return d; }; // entre rectas

// Cruces del rayo S + t*u (t > 0) con lineas, circulos, arcos y splines.
function rayCrossings(doc, S, u, skip) {
  const out = [], B = { x: S.x + u.x, y: S.y + u.y }, add = (p, k, id) => {
    if ((p.x - S.x) * u.x + (p.y - S.y) * u.y > 1e-9) out.push({ x: p.x, y: p.y, k, id });
  };
  for (const [id, l] of Object.entries(doc.lines)) {
    if (skip.has(id)) continue;
    const A = doc.pts[l.a], C = doc.pts[l.b], p = lineLine(S, B, A, C);
    if (p && dist(p, closestOnSeg(p, A, C)) <= 1e-3) add(p, 'ln', id);
  }
  for (const [id, c] of Object.entries(doc.circles)) if (!skip.has(id)) for (const p of lineCircle(S, B, doc.pts[c.c], c.r)) add(p, 'ci', id);
  for (const [id, a] of Object.entries(doc.arcs)) {
    if (skip.has(id)) continue;
    const C = doc.pts[a.c], g = arcOf(doc, a);
    for (const p of lineCircle(S, B, C, a.r)) if (inSweep(C, g.a0, g.sweep, p, 1e-3 / Math.max(a.r, 1e-9))) add(p, 'ar', id);
  }
  for (const [id, sp] of Object.entries(doc.splines || {})) if (!skip.has(id)) for (const p of polylineLine(splinePolyline(doc, sp, 16), S, B)) add(p, 'sp', id);
  return out;
}

// S: inicio, P: cursor (sin ajustar), endSnap: lo que hay bajo el cursor (snapAt), s: px por unidad.
// opt: { step (grados entre bloqueos), angTol (grados de tolerancia angular) }
// Devuelve null o { x, y, kind, label, u, ref?, end?, deg? } (end: elemento sobre el que termina la linea).
export function lineLock(doc, S, origins, endSnap, P, s, tol = 9, opt = {}) {
  const step = opt.step > 0 ? opt.step : 15, angTol = ((opt.angTol ?? 4) * Math.PI) / 180;
  const dx = P.x - S.x, dy = P.y - S.y;
  if (Math.hypot(dx, dy) * s < 24) return null; // muy cerca del inicio: no se bloquea
  const et = endSnap?.type;
  if (et === 'pt' || et === 'int') return null; // un punto existente o una interseccion mandan
  const ang = Math.atan2(dy, dx);
  const px = (p) => dist(p, P) * s;

  // 1) tangente desde S a un arco o circulo cercano al cursor (si no se empezo en una curva)
  if (!origins.curves.length) {
    let best = null;
    const tryCurve = (id, isArc) => {
      const o = curveOf(doc, id), C = doc.pts[o.c], d = dist(S, C);
      if (d <= o.r * (1 + 1e-9)) return;
      const base = Math.atan2(S.y - C.y, S.x - C.x), al = Math.acos(o.r / d);
      for (const sg of [1, -1]) {
        const a = base + sg * al, T = { x: C.x + o.r * Math.cos(a), y: C.y + o.r * Math.sin(a) };
        if (isArc) { const g = arcOf(doc, doc.arcs[id]); if (!inSweep(C, g.a0, g.sweep, T, 1e-3)) continue; }
        const dpx = px(T);
        if (dpx <= tol * 1.6 && (!best || dpx < best.dpx)) best = { T, dpx, id, isArc };
      }
    };
    for (const id of Object.keys(doc.circles)) tryCurve(id, false);
    for (const id of Object.keys(doc.arcs)) tryCurve(id, true);
    if (best) {
      const L = dist(S, best.T) || 1;
      return { x: best.T.x, y: best.T.y, kind: 'TAN', label: LABELS.TAN, u: { x: (best.T.x - S.x) / L, y: (best.T.y - S.y) / L }, ref: best.id, end: { type: best.isArc ? 'ar' : 'ci', id: best.id } };
    }
  }

  // 2) direcciones candidatas
  const cands = [];
  const add = (ux, uy, kind, ref, special, deg) => { const l = Math.hypot(ux, uy); if (l > 1e-12) cands.push({ u: { x: ux / l, y: uy / l }, kind, ref, special, deg }); };
  for (let k = 0; k * step < 180 - 1e-9; k++) {
    const deg = k * step, r = (deg * Math.PI) / 180;
    add(Math.cos(r), Math.sin(r), deg === 0 ? 'H' : deg === 90 ? 'V' : 'ANG', null, false, deg);
  }
  const refLines = new Set(origins.lines);
  for (const [id, l] of Object.entries(doc.lines)) {
    if (refLines.has(id)) continue;
    const c = closestOnSeg(P, doc.pts[l.a], doc.pts[l.b]);
    if (px(c) <= NEAR_PX) refLines.add(id); // cerca del cursor: tambien da paralela y perpendicular
  }
  for (const id of refLines) {
    const l = doc.lines[id]; if (!l) continue;
    const a = doc.pts[l.a], b = doc.pts[l.b], ux = b.x - a.x, uy = b.y - a.y;
    add(ux, uy, 'PAR', id, true); add(-uy, ux, 'PERP', id, true);
  }
  for (const id of origins.curves) {
    const o = curveOf(doc, id); if (!o) continue;
    const C = doc.pts[o.c];
    add(-(S.y - C.y), S.x - C.x, 'TAN', id, true);
  }
  let best = null;
  for (const c of cands) {
    const e = angDiff(ang, Math.atan2(c.u.y, c.u.x));
    const dpx = Math.abs(dx * c.u.y - dy * c.u.x) * s;
    if (dpx > tol || e > (c.special ? angTol * 1.4 : angTol)) continue;
    const score = dpx - (c.special ? 3 : 0);
    if (!best || score < best.score) best = { ...c, dpx, score };
  }
  if (!best) return null;

  // 3) punto final: la proyeccion del cursor, o el cruce con un elemento si cae cerca del cursor
  const skip = new Set([...origins.lines, ...origins.curves]);
  let x, y, end;
  if (dx * best.u.x + dy * best.u.y < 0) best.u = { x: -best.u.x, y: -best.u.y }; // el sentido hacia el cursor
  const t = dx * best.u.x + dy * best.u.y;
  x = S.x + best.u.x * t; y = S.y + best.u.y * t;
  let bc = null;
  for (const c of rayCrossings(doc, S, best.u, skip)) {
    const d = px(c);
    if (d <= tol * 1.6 && (!bc || d < bc.d)) bc = { ...c, d };
  }
  if (bc) { x = bc.x; y = bc.y; end = { type: bc.k, id: bc.id }; }
  const label = best.kind === 'ANG' ? `${best.deg}°` : LABELS[best.kind];
  return { x, y, kind: best.kind, label, u: best.u, ref: best.ref, deg: best.deg, ...(end ? { end } : {}) };
}

// Restricciones que acompanan al bloqueo (la linea nueva es lineId). Las de angulo intermedio no llevan restriccion.
export function lockConstraints(lock, lineId) {
  if (!lock) return [];
  if (lock.kind === 'H') return [{ t: 'H', refs: [lineId] }];
  if (lock.kind === 'V') return [{ t: 'V', refs: [lineId] }];
  if (lock.kind === 'PAR') return [{ t: 'PAR', refs: [lineId, lock.ref] }];
  if (lock.kind === 'PERP') return [{ t: 'PERP', refs: [lineId, lock.ref] }];
  if (lock.kind === 'TAN') return [{ t: 'TANLC', refs: [lineId, lock.ref] }];
  return [];
}

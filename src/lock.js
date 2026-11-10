// Bloqueo "suave" al crear lineas: si el cursor queda cerca de una direccion notable, la linea se ajusta a ella
// (y la herramienta puede agregar la restriccion correspondiente). Sin DOM; coordenadas del modelo.
// Direcciones: horizontal, vertical y 45 grados siempre; desde otra linea, paralela y perpendicular; desde un
// arco o circulo (o el extremo de un arco), tangente; y al terminar sobre un arco o circulo, la tangente que
// pasa por el inicio.
import { dist, inSweep } from './geom.js';
import { arcOf } from './model.js';

const LABELS = { H: 'H', V: 'V', D45: '45°', PAR: '∥', PERP: '⟂', TAN: 'T' };

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
  return { lines: [], curves: [] };
}

const curveOf = (doc, id) => doc.circles[id] || doc.arcs[id];

// S: inicio, P: cursor (sin ajustar), endSnap: lo que hay bajo el cursor (snapAt), s: px por unidad.
// Devuelve null o { x, y, kind, label, u, ref?, end? } (end: extremo sobre una curva, para la tangente final).
export function lineLock(doc, S, origins, endSnap, P, s, tol = 9) {
  const dx = P.x - S.x, dy = P.y - S.y;
  if (Math.hypot(dx, dy) * s < 24) return null; // muy cerca del inicio: no se bloquea
  const et = endSnap?.type;
  // tangente final: el extremo cae sobre un arco/circulo y no se empezo en uno
  if ((et === 'ci' || et === 'ar') && !origins.curves.length) {
    const o = curveOf(doc, endSnap.id), C = doc.pts[o.c];
    const d = dist(S, C);
    if (d > o.r * (1 + 1e-9)) {
      const base = Math.atan2(S.y - C.y, S.x - C.x), al = Math.acos(o.r / d);
      let best = null;
      for (const sg of [1, -1]) {
        const a = base + sg * al, T = { x: C.x + o.r * Math.cos(a), y: C.y + o.r * Math.sin(a) };
        if (et === 'ar') { const g = arcOf(doc, doc.arcs[endSnap.id]); if (!inSweep(C, g.a0, g.sweep, T, 1e-3)) continue; }
        const dpx = dist(T, P) * s;
        if (dpx <= tol * 1.6 && (!best || dpx < best.dpx)) best = { T, dpx };
      }
      if (best) {
        const L = dist(S, best.T) || 1;
        return { x: best.T.x, y: best.T.y, kind: 'TAN', label: LABELS.TAN, u: { x: (best.T.x - S.x) / L, y: (best.T.y - S.y) / L }, ref: endSnap.id, end: { type: et, id: endSnap.id } };
      }
    }
    return null;
  }
  if (et === 'pt' || et === 'ln' || et === 'sp' || et === 'ci' || et === 'ar') return null; // cae sobre algo: manda ese punto
  const cands = [];
  const add = (ux, uy, kind, ref, special) => { const l = Math.hypot(ux, uy); if (l > 1e-12) cands.push({ u: { x: ux / l, y: uy / l }, kind, ref, special }); };
  add(1, 0, 'H', null, false); add(0, 1, 'V', null, false); add(1, 1, 'D45', null, false); add(1, -1, 'D45', null, false);
  for (const id of origins.lines) {
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
    const dpx = Math.abs(dx * c.u.y - dy * c.u.x) * s;
    if (dpx > tol) continue;
    const score = dpx - (c.special ? 3 : 0);
    if (!best || score < best.score) best = { ...c, dpx, score };
  }
  if (!best) return null;
  const t = dx * best.u.x + dy * best.u.y;
  return { x: S.x + best.u.x * t, y: S.y + best.u.y * t, kind: best.kind, label: LABELS[best.kind], u: best.u, ref: best.ref };
}

// Restricciones que acompanan al bloqueo (la linea nueva es lineId). El de 45 grados no lleva restriccion.
export function lockConstraints(lock, lineId) {
  if (!lock) return [];
  if (lock.kind === 'H') return [{ t: 'H', refs: [lineId] }];
  if (lock.kind === 'V') return [{ t: 'V', refs: [lineId] }];
  if (lock.kind === 'PAR') return [{ t: 'PAR', refs: [lineId, lock.ref] }];
  if (lock.kind === 'PERP') return [{ t: 'PERP', refs: [lineId, lock.ref] }];
  if (lock.kind === 'TAN') return [{ t: 'TANLC', refs: [lineId, lock.ref] }];
  return [];
}

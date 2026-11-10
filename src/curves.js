// Trazado de trayectorias de puntos y su conversion a spline. Sin DOM.
import { addPoint, addSpline } from './model.js';
import { resamplePolyline, polylineLength } from './geom.js';

const MAX_SAMPLES = 20000;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

export const TRACE_STYLE = { color: '#db2777', ltype: 'continua', w: 1.5, ls: 1 };

// Activa el trazado de un punto (guarda su posicion actual como primera muestra).
export function startTrace(doc, pid) {
  const p = doc.pts[pid];
  if (!p || doc.traces[pid]) return false;
  doc.traces[pid] = { pts: [{ x: r4(p.x), y: r4(p.y) }], ...TRACE_STYLE };
  return true;
}

// Agrega la posicion actual de cada punto trazado si se movio al menos minDist (unidades del modelo).
// Devuelve cuantas muestras agrego.
export function recordTraces(doc, minDist) {
  let added = 0;
  for (const [id, tr] of Object.entries(doc.traces || {})) {
    const p = doc.pts[id];
    if (!p) continue;
    const last = tr.pts[tr.pts.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDist) continue;
    tr.pts.push({ x: r4(p.x), y: r4(p.y) });
    added++;
    if (tr.pts.length > MAX_SAMPLES) tr.pts.shift();
  }
  return added;
}

// Convierte el trazado de un punto en un spline que pasa por n puntos repartidos a lo largo de la
// trayectoria. Si la trayectoria vuelve a donde empezo, el spline es cerrado. Los puntos de control
// son puntos reales (se pueden arrastrar para retocar la curva) y solo se ven con el spline seleccionado.
export function traceToSpline(doc, pid, n = 16) {
  const tr = doc.traces[pid];
  if (!tr || tr.pts.length < 3 || n < 3) return null;
  const L = polylineLength(tr.pts);
  const a = tr.pts[0], b = tr.pts[tr.pts.length - 1];
  const closed = L > 0 && Math.hypot(a.x - b.x, a.y - b.y) < L * 0.02;
  let P = resamplePolyline(tr.pts, closed ? n + 1 : n);
  if (closed) P = P.slice(0, -1);
  const ids = P.map((q) => {
    const id = addPoint(doc, q.x, q.y, true);
    doc.pts[id].splOnly = true;
    return id;
  });
  return addSpline(doc, ids, { color: tr.color, ltype: tr.ltype, w: tr.w, ls: tr.ls }, closed);
}

// Curva equidistante (offset) de una poligonal P a distancia d. Cerrada (sin repetir el primer
// punto): d > 0 hacia afuera, d < 0 hacia adentro. Abierta: d > 0 a la izquierda del recorrido.
// Devuelve { pts, undercut, minRadius }: undercut cuenta los tramos donde la equidistante se
// invierte (la distancia es mayor que el radio de curvatura: la curva se "socava") y minRadius es el
// menor radio de curvatura entre los puntos que se desplazan hacia su centro de curvatura.
export function offsetPolyline(P, d, closed) {
  const n = P.length;
  if (n < 3) return null;
  let area = 0;
  if (closed) for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += P[i].x * P[j].y - P[j].x * P[i].y; }
  const ccw = area > 0;
  const at = (i) => (closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const O = [];
  let minRadius = Infinity;
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i + 1);
    let tx = b.x - a.x, ty = b.y - a.y;
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    const left = { x: -ty, y: tx };
    const N = closed ? (ccw ? { x: ty, y: -tx } : { x: -ty, y: tx }) : left;
    O.push({ x: P[i].x + N.x * d, y: P[i].y + N.y * d });
    // radio de curvatura local (circunradio) y hacia donde queda su centro
    const p = at(i - 1), q = P[i], r = at(i + 1);
    const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
    const l1 = Math.hypot(q.x - p.x, q.y - p.y), l2 = Math.hypot(r.x - q.x, r.y - q.y), l3 = Math.hypot(r.x - p.x, r.y - p.y);
    if (Math.abs(cross) > 1e-12) {
      const R = (l1 * l2 * l3) / (2 * Math.abs(cross));
      const toward = d * (N.x * left.x + N.y * left.y) * Math.sign(cross) > 0;
      if (toward) minRadius = Math.min(minRadius, R);
    }
  }
  let undercut = 0;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    if ((O[j].x - O[i].x) * (P[j].x - P[i].x) + (O[j].y - O[i].y) * (P[j].y - P[i].y) <= 0) undercut++;
  }
  return { pts: O, undercut, minRadius };
}

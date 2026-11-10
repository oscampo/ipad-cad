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

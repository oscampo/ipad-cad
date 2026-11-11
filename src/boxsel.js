// Seleccion por cuadro (sin DOM). rect en coordenadas del modelo. Dos modos, como en los CAD:
//  - ventana (cross = false): solo lo que queda completamente dentro del cuadro;
//  - cruce (cross = true): lo que queda dentro o toca el cuadro.
import { splinePolyline, arcSamples, ellipsePolyline } from './model.js';

const inside = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

// ¿El segmento ab toca el rectangulo? (Liang-Barsky)
function segHits(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

function polyIn(P, r, cross) {
  if (!P.length) return false;
  if (!cross) return P.every((p) => inside(p, r));
  if (P.some((p) => inside(p, r))) return true;
  for (let i = 0; i < P.length - 1; i++) if (segHits(P[i], P[i + 1], r)) return true;
  return false;
}

// El cuadro puede venir con las esquinas en cualquier orden. shown: ids de puntos que se dibujan (opcional).
export function boxSelect(doc, rect, { cross = false, shown = null } = {}) {
  const r = { x0: Math.min(rect.x0, rect.x1), x1: Math.max(rect.x0, rect.x1), y0: Math.min(rect.y0, rect.y1), y1: Math.max(rect.y0, rect.y1) };
  const out = [];
  for (const [id, p] of Object.entries(doc.pts)) {
    if (shown ? !shown.has(id) : p.splOnly || p.txOnly) continue;
    if (inside(p, r)) out.push({ k: 'pt', id });
  }
  for (const [id, l] of Object.entries(doc.lines)) if (polyIn([doc.pts[l.a], doc.pts[l.b]], r, cross)) out.push({ k: 'ln', id });
  for (const [id, c] of Object.entries(doc.circles)) {
    const p = doc.pts[c.c];
    if (!cross) { if (p.x - c.r >= r.x0 && p.x + c.r <= r.x1 && p.y - c.r >= r.y0 && p.y + c.r <= r.y1) out.push({ k: 'ci', id }); continue; }
    // la circunferencia toca el cuadro si su radio esta entre la distancia minima y la maxima del centro al cuadro
    const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1), dy = Math.max(r.y0 - p.y, 0, p.y - r.y1);
    const fx = Math.max(Math.abs(p.x - r.x0), Math.abs(p.x - r.x1)), fy = Math.max(Math.abs(p.y - r.y0), Math.abs(p.y - r.y1));
    if (Math.hypot(dx, dy) <= c.r && c.r <= Math.hypot(fx, fy)) out.push({ k: 'ci', id });
  }
  for (const [id, a] of Object.entries(doc.arcs)) if (polyIn(arcSamples(doc, a), r, cross)) out.push({ k: 'ar', id });
  for (const [id, sp] of Object.entries(doc.splines || {})) if (polyIn(splinePolyline(doc, sp, 12), r, cross)) out.push({ k: 'sp', id });
  for (const [id, e] of Object.entries(doc.ellipses || {})) if (polyIn(ellipsePolyline(doc, e, 48), r, cross)) out.push({ k: 'el', id });
  for (const [id, t] of Object.entries(doc.texts || {})) if (doc.pts[t.pt] && inside(doc.pts[t.pt], r)) out.push({ k: 'tx', id });
  return out;
}

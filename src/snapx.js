// Intersecciones entre dos elementos (lineas, circulos, arcos y splines), limitadas a lo que cada uno ocupa.
// Sirve para el iman a intersecciones al dibujar. Sin DOM.
import { dist, closestOnSeg, inSweep, polylineLine, polylineCircle, polylinePolyline } from './geom.js';
import { arcOf, splinePolyline } from './model.js';
import { lineHits, circleHits } from './edit.js';

const TOL = 1e-3;
const onArc = (doc, id, p) => { const a = doc.arcs[id], g = arcOf(doc, a); return inSweep(doc.pts[a.c], g.a0, g.sweep, p, TOL / Math.max(a.r, 1e-9)); };

// a y b: { k: 'ln'|'ci'|'ar'|'sp', id }. Devuelve los puntos de cruce.
export function crossPoints(doc, a, b) {
  if (a.id === b.id) return [];
  if (a.k === 'sp' && b.k === 'sp') return polylinePolyline(splinePolyline(doc, doc.splines[a.id], 24), splinePolyline(doc, doc.splines[b.id], 24));
  if (a.k === 'sp' || b.k === 'sp') {
    const [s, o] = a.k === 'sp' ? [a, b] : [b, a], P = splinePolyline(doc, doc.splines[s.id], 24);
    if (o.k === 'ln') { const l = doc.lines[o.id], A = doc.pts[l.a], B = doc.pts[l.b]; return polylineLine(P, A, B).filter((p) => dist(p, closestOnSeg(p, A, B)) <= TOL); }
    const c = doc.circles[o.id] || doc.arcs[o.id];
    return polylineCircle(P, doc.pts[c.c], c.r).filter((p) => o.k !== 'ar' || onArc(doc, o.id, p));
  }
  if (a.k === 'ln') {
    const l = doc.lines[a.id], A = doc.pts[l.a], B = doc.pts[l.b];
    return lineHits(doc, A, B, b).filter((p) => dist(p, closestOnSeg(p, A, B)) <= TOL);
  }
  const c = doc.circles[a.id] || doc.arcs[a.id];
  return circleHits(doc, doc.pts[c.c], c.r, b).filter((p) => a.k !== 'ar' || onArc(doc, a.id, p));
}

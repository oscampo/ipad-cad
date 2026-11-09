import { hatchLoops, allLtypes } from './model.js';
import { dashFromPattern } from './geom.js';

function bounds(doc) {
  const xs = [], ys = [];
  for (const p of Object.values(doc.pts)) { xs.push(p.x); ys.push(p.y); }
  for (const c of Object.values(doc.circles)) { const p = doc.pts[c.c]; xs.push(p.x - c.r, p.x + c.r); ys.push(p.y - c.r, p.y + c.r); }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const n = (v) => Math.round(v * 1000) / 1000;
const col = (c) => (!c || c === 'auto' ? '#000000' : c);

// SVG con 1 unidad de modelo = K unidades de dibujo. Trazos de tipos de linea en
// unidades de papel (3 por unidad de patron), como en pantalla.
export function exportSVG(doc, ltScale = 1) {
  const b = bounds(doc);
  if (!b) return null;
  const K = 6, pad = 20;
  const W = n((b.x1 - b.x0) * K + pad * 2), H = n((b.y1 - b.y0) * K + pad * 2);
  const X = (x) => n((x - b.x0) * K + pad), Y = (y) => n((b.y1 - y) * K + pad);
  const lt = allLtypes(doc);
  const dash = (t) => {
    const d = dashFromPattern((lt[t] || lt.continua).pattern, 0.6).map((v) => n(Math.max(v, 0.01) * 3 * ltScale));
    return d.length ? ` stroke-dasharray="${d.join(' ')}"` : '';
  };
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`, `<rect width="100%" height="100%" fill="#fff"/>`];
  let clip = 0;
  for (const h of Object.values(doc.hatches)) {
    const loops = hatchLoops(doc, h);
    if (!loops.length) continue;
    const d = loops.map((lp) => (lp.pts
      ? 'M' + lp.pts.map((p) => `${X(p.x)} ${Y(p.y)}`).join(' L') + ' Z'
      : `M${X(lp.c.x + lp.r)} ${Y(lp.c.y)} A${n(lp.r * K)} ${n(lp.r * K)} 0 1 0 ${X(lp.c.x - lp.r)} ${Y(lp.c.y)} A${n(lp.r * K)} ${n(lp.r * K)} 0 1 0 ${X(lp.c.x + lp.r)} ${Y(lp.c.y)} Z`)).join(' ');
    if (h.kind === 'solid') { out.push(`<path d="${d}" fill="${col(h.color)}" fill-opacity="${h.alpha ?? 0.45}" fill-rule="evenodd" stroke="none"/>`); continue; }
    const id = `c${++clip}`;
    out.push(`<clipPath id="${id}"><path d="${d}" clip-rule="evenodd"/></clipPath>`);
    const R = Math.hypot(W, H);
    const angs = h.kind === 'cross' ? [h.angle, h.angle + 90] : [h.angle];
    out.push(`<g clip-path="url(#${id})" stroke="${col(h.color)}" stroke-width="1">`);
    for (const a of angs) {
      const t = (-a * Math.PI) / 180, dx = Math.cos(t), dy = Math.sin(t);
      for (let k = -R; k <= R; k += Math.max(2, h.spacing || 8)) {
        const px = W / 2 - dy * k, py = H / 2 + dx * k;
        out.push(`<line x1="${n(px - dx * R)}" y1="${n(py - dy * R)}" x2="${n(px + dx * R)}" y2="${n(py + dy * R)}"/>`);
      }
    }
    out.push('</g>');
  }
  for (const c of Object.values(doc.circles)) {
    const p = doc.pts[c.c];
    out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${n(c.r * K)}" fill="none" stroke="${col(c.color)}" stroke-width="${c.w}"${dash(c.ltype)}/>`);
  }
  for (const l of Object.values(doc.lines)) {
    const a = doc.pts[l.a], q = doc.pts[l.b];
    out.push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(q.x)}" y2="${Y(q.y)}" stroke="${col(l.color)}" stroke-width="${l.w}"${dash(l.ltype)}/>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

// DXF minimo (R12): LINE, CIRCLE y POINT. Los tipos de linea y colores se pierden.
export function exportDXF(doc) {
  if (!bounds(doc)) return null;
  const rows = [];
  const g = (code, v) => rows.push(String(code), String(v));
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const l of Object.values(doc.lines)) {
    const a = doc.pts[l.a], b = doc.pts[l.b];
    g(0, 'LINE'); g(8, '0'); g(10, a.x); g(20, a.y); g(30, 0); g(11, b.x); g(21, b.y); g(31, 0);
  }
  for (const c of Object.values(doc.circles)) {
    const p = doc.pts[c.c];
    g(0, 'CIRCLE'); g(8, '0'); g(10, p.x); g(20, p.y); g(30, 0); g(40, c.r);
  }
  for (const p of Object.values(doc.pts)) if (!p.auto) { g(0, 'POINT'); g(8, '0'); g(10, p.x); g(20, p.y); g(30, 0); }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return rows.join('\r\n') + '\r\n';
}

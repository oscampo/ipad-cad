import { hatchLoops, allLtypes, arcOf } from './model.js';
import { dashFromPattern } from './geom.js';
import { textFrame, LINE_SPACING } from './text.js';

function bounds(doc) {
  const xs = [], ys = [];
  for (const p of Object.values(doc.pts)) { xs.push(p.x); ys.push(p.y); }
  for (const c of Object.values(doc.circles)) { const p = doc.pts[c.c]; xs.push(p.x - c.r, p.x + c.r); ys.push(p.y - c.r, p.y + c.r); }
  for (const a of Object.values(doc.arcs || {})) { const p = doc.pts[a.c]; xs.push(p.x - a.r, p.x + a.r); ys.push(p.y - a.r, p.y + a.r); }
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
  const dash = (t, ls = 1) => {
    const d = dashFromPattern((lt[t] || lt.continua).pattern, 0.6).map((v) => n(Math.max(v, 0.01) * 3 * ltScale * (ls || 1)));
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
    out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${n(c.r * K)}" fill="none" stroke="${col(c.color)}" stroke-width="${c.w}"${dash(c.ltype, c.ls)}/>`);
  }
  for (const ar of Object.values(doc.arcs || {})) {
    const p = doc.pts[ar.c], { a0, sweep } = arcOf(doc, ar);
    const pt = (t) => `${X(p.x + ar.r * Math.cos(t))} ${Y(p.y + ar.r * Math.sin(t))}`;
    const R = n(ar.r * K);
    const attrs = `fill="none" stroke="${col(ar.color)}" stroke-width="${ar.w}"${dash(ar.ltype, ar.ls)}`;
    if (sweep > Math.PI * 2 - 1e-6) out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${R}" ${attrs}/>`);
    else out.push(`<path d="M${pt(a0)} A${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 0 ${pt(a0 + sweep)}" ${attrs}/>`);
  }
  for (const l of Object.values(doc.lines)) {
    const a = doc.pts[l.a], q = doc.pts[l.b];
    out.push(`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(q.x)}" y2="${Y(q.y)}" stroke="${col(l.color)}" stroke-width="${l.w}"${dash(l.ltype, l.ls)}/>`);
  }
  // textos: ancho aproximado (0.6 de la altura por caracter) solo para alinear
  const approx = (ln) => 0.6 * ln.length;
  for (const t of Object.values(doc.texts || {})) {
    const P = doc.pts[t.pt];
    if (!P) continue;
    const f = textFrame(t, approx);
    const anchor = { l: 'start', c: 'middle', r: 'end' }[t.anchor?.[1] ?? 'l'];
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = f.lines.map((ln, i) => `<tspan x="${n((anchor === 'start' ? f.xmin : anchor === 'middle' ? f.xmin + f.w / 2 : f.xmin + f.w) * K)}" y="${n((-f.ymax + (i * LINE_SPACING + 0.95) * t.h) * K)}">${esc(ln)}</tspan>`).join('');
    out.push(`<text transform="translate(${X(P.x)} ${Y(P.y)}) rotate(${n(-(t.ang || 0))})" font-family="sans-serif" font-size="${n(t.h * K)}" text-anchor="${anchor}" fill="${col(t.color)}">${lines}</text>`);
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
  for (const ar of Object.values(doc.arcs || {})) {
    const p = doc.pts[ar.c], { a0, sweep } = arcOf(doc, ar);
    if (sweep > Math.PI * 2 - 1e-6) { g(0, 'CIRCLE'); g(8, '0'); g(10, p.x); g(20, p.y); g(30, 0); g(40, ar.r); continue; }
    const deg = (t) => ((((t * 180) / Math.PI) % 360) + 360) % 360;
    g(0, 'ARC'); g(8, '0'); g(10, p.x); g(20, p.y); g(30, 0); g(40, ar.r); g(50, deg(a0)); g(51, deg(a0 + sweep));
  }
  // textos: una entidad TEXT por linea, alineada segun el punto de insercion (ancho aproximado)
  for (const t of Object.values(doc.texts || {})) {
    const P = doc.pts[t.pt];
    if (!P) continue;
    const f = textFrame(t, (ln) => 0.6 * ln.length);
    const a = ((t.ang || 0) * Math.PI) / 180, c0 = Math.cos(a), s0 = Math.sin(a);
    const h72 = { l: 0, c: 1, r: 2 }[t.anchor?.[1] ?? 'l'];
    f.lines.forEach((ln, i) => {
      const x = h72 === 0 ? f.xmin : h72 === 1 ? f.xmin + f.w / 2 : f.xmin + f.w;
      const y = f.ymax - (i + 1) * 1.2 * t.h + 0.2 * t.h; // linea base
      const wx = P.x + x * c0 - y * s0, wy = P.y + x * s0 + y * c0;
      g(0, 'TEXT'); g(8, '0'); g(10, wx); g(20, wy); g(30, 0); g(40, t.h); g(1, ln.replace(/\s+/g, ' '));
      g(50, (((t.ang || 0) % 360) + 360) % 360); g(72, h72); g(11, wx); g(21, wy); g(31, 0); g(73, 0);
    });
  }
  for (const p of Object.values(doc.pts)) if (!p.auto) { g(0, 'POINT'); g(8, '0'); g(10, p.x); g(20, p.y); g(30, 0); }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return rows.join('\r\n') + '\r\n';
}

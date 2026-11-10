import { hatchLoops, allLtypes, arcOf, arcSamples, splinePolyline } from './model.js';
import { dashFromPattern, norm, splineBezier } from './geom.js';
import { textFrame, textCorners, textPose, LINE_SPACING } from './text.js';
import { layoutDim } from './dims.js';

const DIM_KINDS = new Set(['DIST', 'DISTPL', 'ANG', 'RAD']);
const approx = (ln) => 0.6 * ln.length; // ancho aproximado de texto (por altura 1)

function bounds(doc) {
  const xs = [], ys = [];
  for (const p of Object.values(doc.pts)) { xs.push(p.x); ys.push(p.y); }
  for (const c of Object.values(doc.circles)) { const p = doc.pts[c.c]; xs.push(p.x - c.r, p.x + c.r); ys.push(p.y - c.r, p.y + c.r); }
  for (const a of Object.values(doc.arcs || {})) { const p = doc.pts[a.c]; xs.push(p.x - a.r, p.x + a.r); ys.push(p.y - a.r, p.y + a.r); }
  for (const sp of Object.values(doc.splines || {})) for (const q of splinePolyline(doc, sp, 8)) { xs.push(q.x); ys.push(q.y); }
  for (const tr of Object.values(doc.traces || {})) for (const q of tr.pts) { xs.push(q.x); ys.push(q.y); }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const n = (v) => Math.round(v * 1000) / 1000;
const col = (c) => (!c || c === 'auto' ? '#000000' : c);
const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Instrucciones de dibujo (px segun view) de todas las cotas visibles.
export function dimLayouts(doc, view) {
  const out = [];
  for (const k of Object.values(doc.cons)) {
    if (!DIM_KINDS.has(k.t) || k.hidden) continue;
    try { out.push(layoutDim(doc, k, view)); } catch { /* referencia perdida: se omite */ }
  }
  return out;
}

const labelBox = (l) => {
  const w = 0.6 * 12 * l.text.length + 8, h = 18;
  return { x: l.x - w / 2, y: l.y - h / 2, w, h };
};

// Extension (px segun view) que ocupan las cotas y los textos, para no recortarlos al exportar.
export function extraExtents(doc, view, vis = {}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const L of vis.dims === false ? [] : dimLayouts(doc, view)) {
    for (const l of L.lines) { add(l[0], l[1]); add(l[2], l[3]); }
    for (const a of L.arcs) { add(a.cx - a.r, a.cy - a.r); add(a.cx + a.r, a.cy + a.r); }
    for (const ar of L.arrows) { add(ar.x - ar.dx * 9 - 4, ar.y - ar.dy * 9 - 4); add(ar.x - ar.dx * 9 + 4, ar.y - ar.dy * 9 + 4); }
    if (L.label) { const b = labelBox(L.label); add(b.x, b.y); add(b.x + b.w, b.y + b.h); }
  }
  for (const t of vis.texts === false ? [] : Object.values(doc.texts || {})) {
    if (!doc.pts[t.pt]) continue;
    for (const p of textCorners(doc, t, approx)) add(p.x * view.s + view.ox, view.oy - p.y * view.s);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// Una cota como SVG (coordenadas del propio layout).
function dimSvg(L, color) {
  const out = [];
  for (const l of L.lines) out.push(`<line x1="${n(l[0])}" y1="${n(l[1])}" x2="${n(l[2])}" y2="${n(l[3])}" stroke="${color}" stroke-width="1"/>`);
  for (const a of L.arcs) {
    const p = (t) => `${n(a.cx + a.r * Math.cos(t))} ${n(a.cy + a.r * Math.sin(t))}`;
    const delta = a.ccw ? norm(a.a0 - a.a1) : norm(a.a1 - a.a0);
    out.push(`<path d="M${p(a.a0)} A${n(a.r)} ${n(a.r)} 0 ${delta > Math.PI ? 1 : 0} ${a.ccw ? 0 : 1} ${p(a.a1)}" fill="none" stroke="${color}" stroke-width="1"${a.dashed ? ' stroke-dasharray="4 3"' : ''}/>`);
  }
  for (const { x, y, dx, dy } of L.arrows) {
    const bx = x - dx * 9, by = y - dy * 9, nx = -dy, ny = dx;
    out.push(`<polygon points="${n(x)},${n(y)} ${n(bx + nx * 3.2)},${n(by + ny * 3.2)} ${n(bx - nx * 3.2)},${n(by - ny * 3.2)}" fill="${color}"/>`);
  }
  if (L.label) {
    const b = labelBox(L.label);
    out.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="3" fill="#fff" fill-opacity="0.85"/>`);
    out.push(`<text x="${n(L.label.x)}" y="${n(L.label.y)}" font-family="sans-serif" font-size="12" text-anchor="middle" dominant-baseline="central"${L.label.italic ? ' font-style="italic"' : ''} fill="${color}">${esc(L.label.text)}</text>`);
  }
  return out;
}

// SVG con 1 unidad de modelo = K unidades de dibujo. Trazos de tipos de linea en
// unidades de papel (3 por unidad de patron), como en pantalla. Las cotas se dibujan con el
// mismo layout que en pantalla (flechas y etiquetas de 12 px).
export function exportSVG(doc, ltScale = 1, vis = {}) {
  const b = bounds(doc);
  if (!b) return null;
  const K = 6, pad = 20;
  const W = n((b.x1 - b.x0) * K + pad * 2), H = n((b.y1 - b.y0) * K + pad * 2);
  const X = (x) => n((x - b.x0) * K + pad), Y = (y) => n((b.y1 - y) * K + pad);
  const view = { s: K, ox: pad - b.x0 * K, oy: pad + b.y1 * K }; // x*K+ox = X(x), oy-y*K = Y(y)
  const lt = allLtypes(doc);
  const dash = (t, ls = 1) => {
    const d = dashFromPattern((lt[t] || lt.continua).pattern, 0.6).map((v) => n(Math.max(v, 0.01) * 3 * ltScale * (ls || 1)));
    return d.length ? ` stroke-dasharray="${d.join(' ')}"` : '';
  };
  const out = [];
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
  // splines y trazados: poligonal muestreada
  const polyPath = (pts, closed) => 'M' + pts.map((q) => `${X(q.x)} ${Y(q.y)}`).join(' L') + (closed ? ' Z' : '');
  for (const sp of Object.values(doc.splines || {})) {
    out.push(`<path d="${polyPath(splinePolyline(doc, sp, 16), sp.closed)}" fill="none" stroke="${col(sp.color)}" stroke-width="${sp.w}" stroke-linejoin="round"${dash(sp.ltype, sp.ls)}/>`);
  }
  for (const tr of Object.values(doc.traces || {})) {
    if (tr.pts.length < 2) continue;
    out.push(`<path d="${polyPath(tr.pts, false)}" fill="none" stroke="${col(tr.color)}" stroke-width="${tr.w}" stroke-linejoin="round"${dash(tr.ltype, tr.ls)}/>`);
  }
  // textos: ancho aproximado (0.6 de la altura por caracter) solo para alinear
  for (const t of vis.texts === false ? [] : Object.values(doc.texts || {})) {
    const P = doc.pts[t.pt];
    if (!P) continue;
    const pose = textPose(doc, t);
    const f = textFrame(t, approx, pose.anchor);
    const anchor = { l: 'start', c: 'middle', r: 'end' }[pose.anchor[1]];
    const lines = f.lines.map((ln, i) => `<tspan x="${n((anchor === 'start' ? f.xmin : anchor === 'middle' ? f.xmin + f.w / 2 : f.xmin + f.w) * K)}" y="${n((-f.ymax + (i * LINE_SPACING + 0.95) * t.h) * K)}">${esc(ln)}</tspan>`).join('');
    out.push(`<text transform="translate(${X(P.x)} ${Y(P.y)}) rotate(${n(-pose.ang)})" font-family="sans-serif" font-size="${n(t.h * K)}" text-anchor="${anchor}" fill="${col(t.color)}">${lines}</text>`);
  }
  // cotas
  if (vis.dims !== false) for (const L of dimLayouts(doc, view)) out.push(...dimSvg(L, '#000000'));
  // el lienzo crece para que quepan cotas y textos
  const ex = extraExtents(doc, view, vis);
  const m = 8;
  const sx = ex ? Math.max(0, m - ex.minX) : 0, sy = ex ? Math.max(0, m - ex.minY) : 0;
  const W2 = n(Math.max(W, ex ? ex.maxX + m : 0) + sx), H2 = n(Math.max(H, ex ? ex.maxY + m : 0) + sy);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<g transform="translate(${n(sx)} ${n(sy)})">`,
    ...out,
    '</g>',
    '</svg>',
  ].join('\n');
}

// DXF minimo (R12): LINE, CIRCLE, ARC, TEXT, POINT y, para las cotas, LINE/ARC/SOLID/TEXT.
// viewScale: px por unidad del dibujo con que se ven las cotas (tamano de flechas y texto).
// Los tipos de linea y colores se pierden.
export function exportDXF(doc, viewScale = 5, vis = {}) {
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
  const deg = (t) => ((((t * 180) / Math.PI) % 360) + 360) % 360;
  for (const ar of Object.values(doc.arcs || {})) {
    const p = doc.pts[ar.c], { a0, sweep } = arcOf(doc, ar);
    if (sweep > Math.PI * 2 - 1e-6) { g(0, 'CIRCLE'); g(8, '0'); g(10, p.x); g(20, p.y); g(30, 0); g(40, ar.r); continue; }
    g(0, 'ARC'); g(8, '0'); g(10, p.x); g(20, p.y); g(30, 0); g(40, ar.r); g(50, deg(a0)); g(51, deg(a0 + sweep));
  }
  // splines y trazados como POLYLINE (R12) con los vertices muestreados
  const poly = (pts, closed) => {
    g(0, 'POLYLINE'); g(8, '0'); g(66, 1); g(70, closed ? 1 : 0);
    for (const q of pts) { g(0, 'VERTEX'); g(8, '0'); g(10, q.x); g(20, q.y); g(30, 0); }
    g(0, 'SEQEND'); g(8, '0');
  };
  for (const sp of Object.values(doc.splines || {})) poly(splinePolyline(doc, sp, 16), sp.closed);
  for (const tr of Object.values(doc.traces || {})) if (tr.pts.length >= 2) poly(tr.pts, false);
  // textos: una entidad TEXT por linea, alineada segun el punto de insercion (ancho aproximado)
  for (const t of vis.texts === false ? [] : Object.values(doc.texts || {})) {
    const P = doc.pts[t.pt];
    if (!P) continue;
    const pose = textPose(doc, t);
    const f = textFrame(t, approx, pose.anchor);
    const a = (pose.ang * Math.PI) / 180, c0 = Math.cos(a), s0 = Math.sin(a);
    const h72 = { l: 0, c: 1, r: 2 }[pose.anchor[1]];
    f.lines.forEach((ln, i) => {
      const x = h72 === 0 ? f.xmin : h72 === 1 ? f.xmin + f.w / 2 : f.xmin + f.w;
      const y = f.ymax - (i + 1) * 1.2 * t.h + 0.2 * t.h; // linea base
      const wx = P.x + x * c0 - y * s0, wy = P.y + x * s0 + y * c0;
      g(0, 'TEXT'); g(8, '0'); g(10, wx); g(20, wy); g(30, 0); g(40, t.h); g(1, ln.replace(/\s+/g, ' '));
      g(50, pose.ang); g(72, h72); g(11, wx); g(21, wy); g(31, 0); g(73, 0);
    });
  }
  // cotas como geometria: el layout esta en px de pantalla (y hacia abajo); se pasa a unidades del dibujo
  const S = viewScale > 0 ? viewScale : 5;
  const mx = (x) => x / S, my = (y) => -y / S;
  for (const L of vis.dims === false ? [] : dimLayouts(doc, { s: S, ox: 0, oy: 0 })) {
    for (const l of L.lines) { g(0, 'LINE'); g(8, '0'); g(10, mx(l[0])); g(20, my(l[1])); g(30, 0); g(11, mx(l[2])); g(21, my(l[3])); g(31, 0); }
    for (const a of L.arcs) {
      // angulos del lienzo (y hacia abajo): el del dibujo es su opuesto; ccw en pantalla = creciente en el dibujo
      const m0 = -a.a0, m1 = -a.a1;
      g(0, 'ARC'); g(8, '0'); g(10, mx(a.cx)); g(20, my(a.cy)); g(30, 0); g(40, a.r / S);
      g(50, deg(a.ccw ? m0 : m1)); g(51, deg(a.ccw ? m1 : m0));
    }
    for (const { x, y, dx, dy } of L.arrows) {
      const bx = x - dx * 9, by = y - dy * 9, nx = -dy, ny = dx;
      const P = [[x, y], [bx + nx * 3.2, by + ny * 3.2], [bx - nx * 3.2, by - ny * 3.2], [bx - nx * 3.2, by - ny * 3.2]];
      g(0, 'SOLID'); g(8, '0');
      P.forEach(([px, py], i) => { g(10 + i, mx(px)); g(20 + i, my(py)); g(30 + i, 0); });
    }
    if (L.label) {
      g(0, 'TEXT'); g(8, '0'); g(10, mx(L.label.x)); g(20, my(L.label.y)); g(30, 0); g(40, 11 / S); g(1, L.label.text.replace(/\u2300/g, '%%c'));
      if (L.label.italic) g(51, 15); // cota de referencia: oblicuo
      g(72, 1); g(11, mx(L.label.x)); g(21, my(L.label.y)); g(31, 0); g(73, 2);
    }
  }
  for (const p of Object.values(doc.pts)) if (!p.auto) { g(0, 'POINT'); g(8, '0'); g(10, p.x); g(20, p.y); g(30, 0); }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return rows.join('\r\n') + '\r\n';
}

// SVG para corte laser: a escala real (1 unidad del dibujo = unit mm), solo la geometria que se
// corta (lineas, circulos, arcos y splines como curvas Bezier exactas), un solo color y grosor
// de trazo fino, sin cotas, textos, puntos ni rellenos. El origen queda en la esquina superior
// izquierda del contenido.
// o: { unit (mm por unidad), stroke (mm), color, onlyContinuous (omite ejes, ocultas, etc.) }
export function exportSVGLaser(doc, o = {}) {
  const unit = Number(o.unit) > 0 ? Number(o.unit) : 1;
  const stroke = Number(o.stroke) > 0 ? Number(o.stroke) : 0.1;
  const color = o.color || '#ff0000';
  const keep = (e) => o.onlyContinuous === false || (e.ltype ?? 'continua') === 'continua';
  const lines = Object.values(doc.lines).filter(keep), circles = Object.values(doc.circles).filter(keep);
  const arcs = Object.values(doc.arcs || {}).filter(keep), splines = Object.values(doc.splines || {}).filter(keep);
  const xs = [], ys = [];
  const add = (x, y) => { xs.push(x); ys.push(y); };
  for (const l of lines) { add(doc.pts[l.a].x, doc.pts[l.a].y); add(doc.pts[l.b].x, doc.pts[l.b].y); }
  for (const c of circles) { const p = doc.pts[c.c]; add(p.x - c.r, p.y - c.r); add(p.x + c.r, p.y + c.r); }
  for (const a of arcs) for (const q of arcSamples(doc, a)) add(q.x, q.y);
  for (const sp of splines) for (const q of splinePolyline(doc, sp, 24)) add(q.x, q.y);
  if (!xs.length) return null;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const f = (v) => Math.round(v * 1e4) / 1e4;
  const X = (x) => f((x - x0) * unit), Y = (y) => f((y1 - y) * unit);
  const W = f((x1 - x0) * unit), H = f((y1 - y0) * unit);
  const out = [];
  for (const l of lines) out.push(`<path d="M${X(doc.pts[l.a].x)} ${Y(doc.pts[l.a].y)} L${X(doc.pts[l.b].x)} ${Y(doc.pts[l.b].y)}"/>`);
  for (const c of circles) { const p = doc.pts[c.c]; out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${f(c.r * unit)}"/>`); }
  for (const a of arcs) {
    const p = doc.pts[a.c], { a0, sweep } = arcOf(doc, a), r = f(a.r * unit);
    const pt = (t) => `${X(p.x + a.r * Math.cos(t))} ${Y(p.y + a.r * Math.sin(t))}`;
    if (sweep > Math.PI * 2 - 1e-6) out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${r}"/>`);
    else out.push(`<path d="M${pt(a0)} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 0 ${pt(a0 + sweep)}"/>`);
  }
  for (const sp of splines) {
    const segs = splineBezier(sp.pts.map((id) => doc.pts[id]), sp.closed);
    if (!segs.length) continue;
    const q = (pt) => `${X(pt.x)} ${Y(pt.y)}`;
    out.push(`<path d="M${q(segs[0].p0)} ${segs.map((b) => `C${q(b.c1)} ${q(b.c2)} ${q(b.p1)}`).join(' ')}${sp.closed ? ' Z' : ''}"/>`);
  }
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<g fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">`,
    ...out,
    '</g>',
    '</svg>',
  ].join('\n');
  return { svg, width: W, height: H, count: out.length };
}

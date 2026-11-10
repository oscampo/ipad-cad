import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { initSolver, solve } from './solver.js';
import {
  newDoc, addPoint, addLine, addCircle, addArc, addText, addSpline, splinePolyline, addCon, cleanup, deleteItems, clone, hatchLoops,
  allLtypes, PALETTE, arcOf,
} from './model.js';
import {
  dist, closestOnSeg, lineLine, lineCircle, circleCircle, signedAngle, dashFromPattern, parsePattern,
  arcThrough3, inSweep, TAU, splineSamples, resamplePolyline, closestOnPolyline, polylineLine, polylineCircle, polylinePolyline,
} from './geom.js';
import { startTrace, recordTraces, traceToSpline, offsetPolyline } from './curves.js';
import { splitElement } from './split.js';
import { layoutDim, dragDim, dimValue, angSector, angTrue } from './dims.js';
import { textFrame, textHit, textPose, rawAngle, ANCHORS, ANCHOR_NAMES, LINE_SPACING } from './text.js';
import { exportSVG, exportSVGLaser, exportDXF, extraExtents } from './export.js';
import { iconSvg } from './icons.js';
import { buildTree, kindOf } from './tree.js';
import { cleanFileBase } from './files.js';

const VERSION = '0.1.0';
const STORE = 'ipad-cad-v1';
const $ = (id) => document.getElementById(id);
const cv = $('cv');
const ctx = cv.getContext('2d');

// ---------------------------------------------------------------- estado
let doc = newDoc();
let view = { ox: 200, oy: 300, s: 3 }; // px por unidad; y del modelo hacia arriba
let tool = 'select';
let sel = []; // [{k:'pt'|'ln'|'ci'|'ha', id}]
let cur = { color: 'auto', ltype: 'continua', w: 2, ls: 1, tx: { h: null, ang: 0, anchor: 'bl', readable: true } };
const opts = { grid: true, snap: false, cons: true, pts: true, dims: true, texts: true, touch: false, ltScale: 1, labels: true, sections: {} };
let undoStack = [], redoStack = [];
let pending = null; // estado de la herramienta en curso
let hover = null; // posicion del puntero en pantalla
let drag = null;
let labelHits = [];
const pointers = new Map();
let gesture = null;
let spaceDown = false;
let theme = { fg: '#111', bg: '#fff', muted: '#888', grid: '#eee', grid2: '#ddd', accent: '#2563eb', sel: '#f59e0b', warn: '#dc2626' };

// ---------------------------------------------------------------- utilidades
const toScreen = (p) => ({ x: p.x * view.s + view.ox, y: view.oy - p.y * view.s });
const toModel = (sx, sy) => ({ x: (sx - view.ox) / view.s, y: (view.oy - sy) / view.s });
const same = (a, b) => a.k === b.k && a.id === b.id;
const isSel = (k, id) => sel.some((s) => s.k === k && s.id === id);
const fmt = (v) => (Math.abs(v) >= 1000 ? v.toFixed(1) : String(Math.round(v * 1000) / 1000));
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, d) => cs.getPropertyValue(n).trim() || d;
  theme = { fg: g('--fg', '#111'), bg: g('--bg', '#fff'), muted: g('--muted', '#888'), grid: g('--grid', '#eee'), grid2: g('--grid2', '#ddd'), accent: g('--accent', '#2563eb'), sel: g('--sel', '#f59e0b'), warn: g('--warn', '#dc2626') };
}
const colorOf = (c, o) => (!c || c === 'auto' ? o.fg : c);

function snapshot() { return JSON.stringify(doc); }
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 150) undoStack.shift(); redoStack = []; updateButtons(); }
function rollback() { if (undoStack.length) { doc = JSON.parse(undoStack.pop()); } updateButtons(); }
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot()); doc = JSON.parse(undoStack.pop());
  pending = null; sel = sel.filter(exists); afterChange();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot()); doc = JSON.parse(redoStack.pop());
  pending = null; sel = sel.filter(exists); afterChange();
}
function exists(s) {
  return s.k === 'pt' ? s.id in doc.pts : s.k === 'ln' ? s.id in doc.lines : s.k === 'ci' ? s.id in doc.circles : s.k === 'ar' ? s.id in doc.arcs : s.k === 'tx' ? s.id in doc.texts : s.k === 'sp' ? s.id in doc.splines : s.k === 'ha' ? s.id in doc.hatches : s.id in doc.cons;
}
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ doc, view, cur, opts })); } catch { /* sin almacenamiento */ }
  }, 300);
}
function afterChange() { updateButtons(); updateEnabled(); syncPanel(); persist(); draw(); renderTree(); }

// Un boton de restriccion solo se activa si la seleccion actual le sirve (mismas reglas que applyCon).
function updateEnabled() {
  const n = { pt: 0, ln: 0, ci: 0, ar: 0, sp: 0 };
  for (const x of sel) if (x.k in n) n[x.k]++;
  n.pt += sel.filter((x) => x.k === 'tx').length;
  const { pt, ln } = n;
  const crv = n.ci + n.ar;
  const rules = {
    H: ln >= 1 || pt >= 2, V: ln >= 1 || pt >= 2,
    PAR: ln >= 2, PERP: ln >= 2, COL: ln >= 2,
    COI: pt >= 2,
    MID: pt === 1 && ln === 1,
    EQ: (ln >= 2 && !crv) || (crv >= 2 && !ln),
    TAN: (ln === 1 && crv === 1 && !n.sp) || (crv === 2 && !ln && !n.sp) || (n.sp === 1 && ln + crv === 1),
    ONC: pt >= 1 && ln + crv + n.sp === 1,
    FIX: pt + ln + crv > 0,
    DIM: (pt === 2 && !ln) || (ln === 1 && !pt) || (pt === 1 && ln === 1),
    ANG: ln === 2,
    RAD: crv >= 1,
  };
  document.querySelectorAll('[data-con]').forEach((b) => { b.disabled = !rules[b.dataset.con]; });
  $('mkint').disabled = ln + crv + n.sp !== 2;
  $('mksplit').disabled = !(ln + crv === 1 && pt >= 1);
  $('mkhatch').disabled = ln + crv + n.sp < 1;
  const selPts = sel.filter((x) => x.k === 'pt').map((x) => x.id);
  $('trTrace').disabled = !selPts.length;
  $('trClear').disabled = !selPts.some((id) => doc.traces[id]?.pts.length > 1);
  $('trSpline').disabled = !(selPts.length === 1 && doc.traces[selPts[0]]?.pts.length >= 3);
  $('spClose').disabled = !n.sp;
  $('spOffset').disabled = !n.sp;
  $('del').disabled = !sel.length;
  $('txAlign').disabled = !(sel.some((x) => x.k === 'tx') && ln === 1);
  $('txFree').disabled = !sel.some((x) => x.k === 'tx' && doc.texts[x.id]?.ref);
}

// ---------------------------------------------------------------- arbol de elementos y menu
const treeOpen = new Set();
let treeSelKey = '';
const selMatch = (n) => n.sel && sel.some((s) => s.k === n.sel.k && s.id === n.sel.id);
function renderTree() {
  if (!document.body.classList.contains('treeopen')) return;
  const body = $('treeBody');
  const tree = buildTree(doc);
  // al cambiar la seleccion desde el lienzo, se abre la rama que lleva al elemento
  const key = sel.map((s) => s.k + s.id).join(',');
  const reveal = key !== treeSelKey && sel.length > 0;
  treeSelKey = key;
  let focusEl = null;
  const lock = iconSvg('lock');
  const mk = (n, path, depth) => {
    const kids = n.children && n.children.length ? n.children : null;
    const p = path + '/' + n.key;
    const on = !n.group && selMatch(n);
    const head = document.createElement(kids ? 'summary' : 'div');
    head.className = 'row2' + (on ? ' on' : '') + (kids ? '' : ' leaf');
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = n.label; nm.title = n.label;
    head.appendChild(nm);
    if (n.sel) {
      nm.onclick = (e) => { e.preventDefault(); e.stopPropagation(); treeSelect(n); };
    }
    const act = (svg, title, fn) => {
      const b = document.createElement('button'); b.className = 'ab'; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = svg;
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
      head.appendChild(b);
    };
    if (n.lock !== undefined) act(iconSvg(n.lock ? 'lock' : 'unlock'), n.lock ? 'Soltar punto' : 'Fijar punto', () => treeToggleFix(n.sel.id));
    if (n.con) {
      const k = doc.cons[n.con];
      if (k && ['DIST', 'DISTPL', 'ANG', 'RAD'].includes(k.t) && !k.ref) act(iconSvg('ruler'), 'Editar valor', () => editDimension(n.con));
    }
    if (n.sel && !String(n.key).startsWith('ref:') && !String(n.key).startsWith('tr:')) act(iconSvg('trash'), 'Borrar', () => treeDelete(n.sel));
    if (!kids) return head;
    const d = document.createElement('details');
    d.className = n.group ? 'grp' : '';
    if (reveal && sel.length === 1 && containsSel(n)) treeOpen.add(p);
    d.open = treeOpen.has(p);
    d.addEventListener('toggle', () => { if (d.open) treeOpen.add(p); else treeOpen.delete(p); });
    d.appendChild(head);
    const wrap = document.createElement('div'); wrap.className = 'kids';
    if (d.open) {
      const lim = n.children.slice(0, 300);
      lim.forEach((c) => wrap.appendChild(mk(c, p, depth + 1)));
      if (n.children.length > lim.length) { const m = document.createElement('div'); m.className = 'leaf'; m.textContent = `… ${n.children.length - lim.length} más`; wrap.appendChild(m); }
    } else {
      // se llena al abrir (el arbol puede tener cientos de nodos)
      d.addEventListener('toggle', function fill() {
        if (!d.open || wrap.childElementCount) return;
        n.children.slice(0, 300).forEach((c) => wrap.appendChild(mk(c, p, depth + 1)));
      });
    }
    d.appendChild(wrap);
    if (on && !focusEl) focusEl = head;
    return d;
  };
  const containsSel = (n) => (n.sel && selMatch(n) && !n.group) || (n.children || []).some(containsSel);
  body.textContent = '';
  if (!tree.length) { body.innerHTML = '<p style="padding:12px;color:var(--muted)">El dibujo está vacío.</p>'; return; }
  tree.forEach((g) => body.appendChild(mk(g, '', 0)));
  if (!focusEl) focusEl = body.querySelector('.row2.on');
  if (reveal && focusEl) focusEl.scrollIntoView({ block: 'nearest' });
}

function elementBounds(items) {
  const pts = [];
  for (const { k, id } of items) {
    if (k === 'pt' && doc.pts[id]) pts.push(doc.pts[id]);
    else if (k === 'ln' && doc.lines[id]) pts.push(doc.pts[doc.lines[id].a], doc.pts[doc.lines[id].b]);
    else if ((k === 'ci' && doc.circles[id]) || (k === 'ar' && doc.arcs[id])) { const o = doc.circles[id] || doc.arcs[id], c = doc.pts[o.c]; pts.push({ x: c.x - o.r, y: c.y - o.r }, { x: c.x + o.r, y: c.y + o.r }); }
    else if (k === 'sp' && doc.splines[id]) pts.push(...doc.splines[id].pts.map((p) => doc.pts[p]));
    else if (k === 'tx' && doc.texts[id]) pts.push(doc.pts[doc.texts[id].pt]);
  }
  return pts.filter(Boolean);
}
// Selecciona un nodo del arbol y, si queda fuera de la vista, centra el lienzo en el.
function treeSelect(n) {
  const s0 = n.sel;
  let items = [s0];
  if (s0.k === 'co') {
    const refs = (doc.cons[s0.id]?.refs || []).map((r) => { const k = kindOf(doc, r); return k ? { k, id: r } : null; }).filter(Boolean);
    items = [s0, ...refs];
  }
  sel = items;
  const b = elementBounds(items);
  if (b.length) {
    const r = cv.getBoundingClientRect();
    const out = b.some((p) => { const q = toScreen(p); return q.x < 8 || q.y < 8 || q.x > r.width - 8 || q.y > r.height - 8; });
    if (out) {
      const x0 = Math.min(...b.map((p) => p.x)), x1 = Math.max(...b.map((p) => p.x)), y0 = Math.min(...b.map((p) => p.y)), y1 = Math.max(...b.map((p) => p.y));
      view = { s: view.s, ox: r.width / 2 - ((x0 + x1) / 2) * view.s, oy: r.height / 2 + ((y0 + y1) / 2) * view.s };
    }
  }
  treeSelKey = sel.map((s) => s.k + s.id).join(','); // no reabrir ramas: ya estamos en el arbol
  afterChange();
}
function treeToggleFix(id) {
  const p = doc.pts[id]; if (!p) return;
  pushUndo(); p.fixed = !p.fixed; afterChange();
}
function treeDelete(s0) {
  pushUndo(); deleteItems(doc, [s0]); sel = sel.filter(exists);
  solve(doc, []);
  afterChange();
}
function applyChrome() {
  document.body.classList.toggle('nopanel', opts.panel === false);
  $('tPanel').setAttribute('aria-pressed', String(opts.panel !== false));
  document.body.classList.toggle('treeopen', !!opts.tree);
  $('tTree').setAttribute('aria-pressed', String(!!opts.tree));
  renderTree();
}
$('tPanel').onclick = () => { opts.panel = opts.panel === false; applyChrome(); persist(); };
$('tTree').onclick = () => { opts.tree = !opts.tree; applyChrome(); persist(); };
$('treeClose').onclick = () => { opts.tree = false; applyChrome(); persist(); };

function hydrateIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const slot = el.querySelector(':scope > i');
    if (slot) slot.innerHTML = iconSvg(el.dataset.icon);
  });
}

// En pantallas tactiles no hay hover: mantener presionado un boton de la barra muestra su nombre.
function wireLongPressHints() {
  let timer = 0, shown = false;
  const bar = $('bar');
  bar.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    if (!b || e.pointerType === 'mouse') return;
    shown = false;
    timer = setTimeout(() => { shown = true; toast(b.title || b.getAttribute('aria-label')); }, 450);
  });
  const stop = () => clearTimeout(timer);
  bar.addEventListener('pointerup', stop); bar.addEventListener('pointercancel', stop); bar.addEventListener('pointerleave', stop);
  bar.addEventListener('click', (e) => { if (shown) { e.stopImmediatePropagation(); e.preventDefault(); shown = false; } }, true);
}

function wireSections() {
  document.querySelectorAll('details.sec').forEach((d) => {
    const saved = opts.sections?.[d.dataset.sec];
    if (typeof saved === 'boolean') d.open = saved;
    d.addEventListener('toggle', () => { opts.sections[d.dataset.sec] = d.open; persist(); });
  });
}
function updateButtons() { $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length; }

// ---------------------------------------------------------------- snap y hit-test
// Puntos que son vertices/centros de lineas, arcos o circulos.
function geometryPoints() {
  const s = new Set();
  for (const l of Object.values(doc.lines)) { s.add(l.a); s.add(l.b); }
  for (const a of Object.values(doc.arcs)) { s.add(a.c); s.add(a.a); s.add(a.b); }
  for (const c of Object.values(doc.circles)) s.add(c.c);
  return s;
}

const selectedTextPoints = () => new Set(sel.filter((x) => x.k === 'tx').map((x) => doc.texts[x.id]?.pt).filter(Boolean));

// Puntos de insercion propios de un texto (txOnly) que ahora no se muestran: solo se ven con el texto seleccionado.
const selectedSplinePoints = () => new Set(sel.filter((x) => x.k === 'sp').flatMap((x) => doc.splines[x.id]?.pts || []));

function hiddenTextPoints() {
  const geom = geometryPoints(), selTx = selectedTextPoints(), selSp = selectedSplinePoints(), out = new Set();
  for (const [id, p] of Object.entries(doc.pts)) {
    if (p.txOnly && !geom.has(id) && !selTx.has(id)) out.add(id);
    else if (p.splOnly && !geom.has(id) && !selSp.has(id)) out.add(id); // control de un spline trazado: se ve al seleccionar la curva
  }
  return out;
}

// Puntos que se dibujan y se pueden tocar: respeta el interruptor "Puntos" y la regla anterior.
function shownPoints() {
  const hidden = hiddenTextPoints(), selTx = selectedTextPoints(), selSp = selectedSplinePoints();
  const out = new Set();
  for (const id of Object.keys(doc.pts)) {
    if (hidden.has(id)) continue;
    if (opts.pts || selTx.has(id) || selSp.has(id) || isSel('pt', id)) out.add(id);
  }
  return out;
}

function snapAt(sx, sy, o = {}) {
  const m = toModel(sx, sy);
  const textOnlyHidden = hiddenTextPoints();
  let best = null, bd = 14;
  for (const [id, p] of Object.entries(doc.pts)) {
    if (o.skip === id || textOnlyHidden.has(id)) continue;
    const d = dist(toScreen(p), { x: sx, y: sy });
    if (d < bd) { bd = d; best = { type: 'pt', id, x: p.x, y: p.y }; }
  }
  if (best) return best;
  bd = 9;
  for (const [id, l] of Object.entries(doc.lines)) {
    const a = doc.pts[l.a], b = doc.pts[l.b];
    const c = closestOnSeg(m, a, b);
    const d = dist(toScreen(c), { x: sx, y: sy });
    if (d < bd) { bd = d; best = { type: 'ln', id, x: c.x, y: c.y }; }
  }
  for (const [id, ci] of Object.entries(doc.circles)) {
    const cp = doc.pts[ci.c];
    const dc = dist(cp, m);
    if (dc < 1e-9) continue;
    const d = Math.abs(dc - ci.r) * view.s;
    if (d < bd) { bd = d; best = { type: 'ci', id, x: cp.x + ((m.x - cp.x) / dc) * ci.r, y: cp.y + ((m.y - cp.y) / dc) * ci.r }; }
  }
  for (const [id, ar] of Object.entries(doc.arcs)) {
    const cp = doc.pts[ar.c];
    const dc = dist(cp, m);
    if (dc < 1e-9) continue;
    const d = Math.abs(dc - ar.r) * view.s;
    const g = arcOf(doc, ar);
    if (d < bd && inSweep(cp, g.a0, g.sweep, m, 6 / (ar.r * view.s))) {
      bd = d; best = { type: 'ar', id, x: cp.x + ((m.x - cp.x) / dc) * ar.r, y: cp.y + ((m.y - cp.y) / dc) * ar.r };
    }
  }
  for (const [id, sp] of Object.entries(doc.splines)) {
    const f = closestOnPolyline(splinePolyline(doc, sp, 16), m);
    if (!f) continue;
    const d = dist(toScreen(f), { x: sx, y: sy });
    if (d < bd) { bd = d; best = { type: 'sp', id, x: f.x, y: f.y }; }
  }
  if (best) return best;
  if (opts.snap) { const g = gridStep(); return { type: 'free', x: Math.round(m.x / g) * g, y: Math.round(m.y / g) * g }; }
  return { type: 'free', x: m.x, y: m.y };
}

function hitTest(sx, sy) {
  for (const h of labelHits) if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) return { k: 'co', id: h.id };
  const m = toModel(sx, sy);
  let best = null, bd = 14;
  const shown = shownPoints();
  for (const [id, p] of Object.entries(doc.pts)) {
    if (!shown.has(id)) continue;
    const d = dist(toScreen(p), { x: sx, y: sy });
    if (d < bd) { bd = d; best = { k: 'pt', id }; }
  }
  if (best) return best;
  // un texto se toma por su caja (antes que las lineas que pasen por debajo)
  for (const [id, t] of Object.entries(doc.texts)) {
    if (opts.texts && doc.pts[t.pt] && textHit(doc, t, m, measureRel, 2 / view.s)) return { k: 'tx', id };
  }
  bd = 11;
  for (const [id, l] of Object.entries(doc.lines)) {
    const c = closestOnSeg(m, doc.pts[l.a], doc.pts[l.b]);
    const d = dist(toScreen(c), { x: sx, y: sy });
    if (d < bd) { bd = d; best = { k: 'ln', id }; }
  }
  for (const [id, ci] of Object.entries(doc.circles)) {
    const d = Math.abs(dist(doc.pts[ci.c], m) - ci.r) * view.s;
    if (d < bd) { bd = d; best = { k: 'ci', id }; }
  }
  for (const [id, ar] of Object.entries(doc.arcs)) {
    const cp = doc.pts[ar.c];
    const d = Math.abs(dist(cp, m) - ar.r) * view.s;
    const g = arcOf(doc, ar);
    if (d < bd && inSweep(cp, g.a0, g.sweep, m, 8 / Math.max(ar.r * view.s, 1))) { bd = d; best = { k: 'ar', id }; }
  }
  for (const [id, sp] of Object.entries(doc.splines)) {
    const d = distToPolyline(splinePolyline(doc, sp, 12).map(toScreen), sx, sy);
    if (d < bd) { bd = d; best = { k: 'sp', id }; }
  }
  if (best) return best;
  for (const [id, h] of Object.entries(doc.hatches)) {
    const path = hatchPath(h);
    if (path && ctx.isPointInPath(path, sx * dpr, sy * dpr, 'evenodd')) return { k: 'ha', id };
  }
  return null;
}

function gridStep() {
  const target = 24 / view.s;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (p * m >= target) return p * m;
  return p * 10;
}

// ---------------------------------------------------------------- dibujo
let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  draw();
}

function hatchPath(h, v = view) {
  const loops = hatchLoops(doc, h);
  if (!loops.length) return null;
  const path = new Path2D();
  const tx = (p) => ({ x: (p.x * v.s + v.ox) * dpr, y: (v.oy - p.y * v.s) * dpr });
  for (const lp of loops) {
    if (lp.pts) {
      lp.pts.forEach((p, i) => { const q = tx(p); if (i) path.lineTo(q.x, q.y); else path.moveTo(q.x, q.y); });
      path.closePath();
    } else {
      const c = tx(lp.c);
      path.moveTo(c.x + lp.r * v.s * dpr, c.y);
      path.arc(c.x, c.y, lp.r * v.s * dpr, 0, Math.PI * 2);
      path.closePath();
    }
  }
  return path;
}

function applyStroke(c, color, w, ltype, o, ls = 1) {
  const lt = allLtypes(doc)[ltype] || allLtypes(doc).continua;
  c.strokeStyle = colorOf(color, o);
  c.lineWidth = w * dpr;
  c.lineCap = 'butt';
  const k = (Number(opts.ltScale) || 1) * (Number(ls) || 1);
  const d = dashFromPattern(lt.pattern, 0.6).map((x) => Math.max(x, 0.01) * 3 * k * dpr);
  c.setLineDash(d);
  return d;
}

// Poligonal con patron dibujado tramo a tramo (px de dispositivo); sirve para splines y trazados.
function strokePolyline(c, P, dash) {
  c.setLineDash([]);
  c.beginPath();
  let total = 0;
  for (let i = 1; i < P.length; i++) total += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
  const period = dash.reduce((t, v) => t + v, 0);
  if (!dash.length || !(period > 0) || !(total > 0) || total / period > 20000) {
    P.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.stroke();
    return;
  }
  let i = 0, on = true, rem = dash[0];
  c.moveTo(P[0].x, P[0].y);
  for (let k = 1; k < P.length; k++) {
    let x = P[k - 1].x, y = P[k - 1].y, L = Math.hypot(P[k].x - x, P[k].y - y);
    if (!(L > 0)) continue;
    const ux = (P[k].x - x) / L, uy = (P[k].y - y) / L;
    while (L > 1e-9) {
      const take = Math.min(rem, L);
      x += ux * take; y += uy * take; L -= take; rem -= take;
      if (on) c.lineTo(x, y); else c.moveTo(x, y);
      if (rem <= 1e-9) { i++; on = !on; rem = dash[i % dash.length]; if (!(rem > 0)) rem = 1e-3; }
    }
  }
  c.stroke();
}

// Distancia (px) de (sx,sy) a una poligonal en pantalla.
function distToPolyline(P, sx, sy) {
  let best = Infinity;
  for (let i = 1; i < P.length; i++) best = Math.min(best, dist(closestOnSeg({ x: sx, y: sy }, P[i - 1], P[i]), { x: sx, y: sy }));
  return best;
}

// Segmento con patron dibujado tramo a tramo (px de dispositivo).
function strokeLine(c, x1, y1, x2, y2, dash) {
  c.setLineDash([]);
  const L = Math.hypot(x2 - x1, y2 - y1), period = dash.reduce((t, v) => t + v, 0);
  c.beginPath();
  if (!dash.length || !(period > 0) || !(L > 0) || L / period > 20000) {
    c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    return;
  }
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  let t = 0, i = 0;
  while (t < L) {
    const len = dash[i % dash.length];
    if (!(len > 0)) break;
    if (i % 2 === 0) { const t2 = Math.min(L, t + len); c.moveTo(x1 + ux * t, y1 + uy * t); c.lineTo(x1 + ux * t2, y1 + uy * t2); }
    t += len; i++;
  }
  c.stroke();
}

// Arco (o circulo completo) con patron, dibujado tramo a tramo: no depende del trazo
// punteado nativo sobre curvas, que en algunos navegadores (Safari) no se ve.
// Coordenadas en px de dispositivo; a0 y sweep en el sentido del modelo (antihorario).
function strokeArc(c, cx, cy, r, a0, sweep, dash) {
  c.setLineDash([]);
  const L = r * sweep, period = dash.reduce((t, v) => t + v, 0);
  c.beginPath();
  if (!dash.length || !(period > 0) || L / period > 20000) {
    c.arc(cx, cy, r, -a0, -(a0 + sweep), true);
    c.stroke();
    return;
  }
  let t = 0, i = 0;
  while (t < L) {
    const len = dash[i % dash.length];
    if (!(len > 0)) break;
    if (i % 2 === 0) {
      const t1 = a0 + t / r, t2 = a0 + Math.min(L, t + len) / r;
      c.moveTo(cx + r * Math.cos(-t1), cy + r * Math.sin(-t1));
      c.arc(cx, cy, r, -t1, -t2, true);
    }
    t += len; i++;
  }
  c.stroke();
}

function draw() { render(ctx, cv.width, cv.height, view, { fg: theme.fg, bg: theme.bg, grid: opts.grid, cons: opts.cons, dims: opts.dims, texts: opts.texts, ui: true }); }

// ctx en pixeles de dispositivo. o: {fg,bg,grid,cons,ui}
export function render(c, W, H, v, o) {
  const saveView = view;
  view = v;
  labelBg = o.bg;
  c.save();
  c.fillStyle = o.bg; c.fillRect(0, 0, W, H);
  if (o.grid) drawGrid(c, W, H);
  labelHits = [];
  // rellenos
  for (const [id, h] of Object.entries(doc.hatches)) drawHatch(c, id, h, o);
  // circulos y lineas
  for (const [id, ci] of Object.entries(doc.circles)) {
    const p = doc.pts[ci.c];
    const s = toScreen(p);
    if (o.ui && isSel('ci', id)) { c.setLineDash([]); c.strokeStyle = theme.sel + '88'; c.lineWidth = (ci.w + 6) * dpr; c.beginPath(); c.arc(s.x * dpr, s.y * dpr, ci.r * v.s * dpr, 0, 7); c.stroke(); }
    const dsh = applyStroke(c, ci.color, ci.w, ci.ltype, o, ci.ls);
    strokeArc(c, s.x * dpr, s.y * dpr, ci.r * v.s * dpr, 0, Math.PI * 2, dsh);
  }
  for (const [id, ar] of Object.entries(doc.arcs)) {
    const sc = toScreen(doc.pts[ar.c]);
    const { a0, sweep } = arcOf(doc, ar);
    const trace = () => { c.beginPath(); c.arc(sc.x * dpr, sc.y * dpr, ar.r * v.s * dpr, -a0, -(a0 + sweep), true); };
    if (o.ui && isSel('ar', id)) { c.setLineDash([]); c.strokeStyle = theme.sel + '88'; c.lineWidth = (ar.w + 6) * dpr; trace(); c.stroke(); }
    const dsh = applyStroke(c, ar.color, ar.w, ar.ltype, o, ar.ls);
    strokeArc(c, sc.x * dpr, sc.y * dpr, ar.r * v.s * dpr, a0, sweep, dsh);
  }
  for (const [id, l] of Object.entries(doc.lines)) {
    const a = toScreen(doc.pts[l.a]), b = toScreen(doc.pts[l.b]);
    if (o.ui && isSel('ln', id)) { c.setLineDash([]); c.strokeStyle = theme.sel + '88'; c.lineWidth = (l.w + 6) * dpr; c.beginPath(); c.moveTo(a.x * dpr, a.y * dpr); c.lineTo(b.x * dpr, b.y * dpr); c.stroke(); }
    const dsh = applyStroke(c, l.color, l.w, l.ltype, o, l.ls);
    strokeLine(c, a.x * dpr, a.y * dpr, b.x * dpr, b.y * dpr, dsh);
  }
  for (const [id, sp] of Object.entries(doc.splines)) {
    const P = splinePolyline(doc, sp, 16).map((q) => { const s = toScreen(q); return { x: s.x * dpr, y: s.y * dpr }; });
    if (o.ui && isSel('sp', id)) {
      c.setLineDash([]); c.strokeStyle = theme.sel + '88'; c.lineWidth = (sp.w + 6) * dpr; c.lineJoin = 'round';
      c.beginPath(); P.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke();
    }
    const dsh = applyStroke(c, sp.color, sp.w, sp.ltype, o, sp.ls);
    c.lineJoin = 'round';
    strokePolyline(c, P, dsh);
  }
  for (const tr of Object.values(doc.traces)) {
    if (tr.pts.length < 2) continue;
    const P = tr.pts.map((q) => { const s = toScreen(q); return { x: s.x * dpr, y: s.y * dpr }; });
    const dsh = applyStroke(c, tr.color, tr.w, tr.ltype, o, tr.ls);
    c.lineJoin = 'round';
    strokePolyline(c, P, dsh);
  }
  c.setLineDash([]);
  if (o.texts !== false) drawTexts(c, o);
  if (o.cons || o.dims) drawConstraints(c, o);
  if (o.ui) {
    const shown = shownPoints();
    for (const [id, p] of Object.entries(doc.pts)) {
      if (!shown.has(id)) continue;
      const s = toScreen(p);
      const selp = isSel('pt', id) || sel.some((x) => x.k === 'tx' && doc.texts[x.id]?.pt === id);
      c.fillStyle = selp ? theme.sel : o.fg;
      if (p.fixed) c.fillRect((s.x - 4) * dpr, (s.y - 4) * dpr, 8 * dpr, 8 * dpr);
      else { c.beginPath(); c.arc(s.x * dpr, s.y * dpr, (selp ? 5 : 3.2) * dpr, 0, 7); c.fill(); }
    }
    drawPreview(c);
  }
  c.restore();
  view = saveView;
}

function drawGrid(c, W, H) {
  const g = gridStep();
  const tl = toModel(0, 0), br = toModel(W / dpr, H / dpr);
  c.lineWidth = dpr;
  for (let x = Math.floor(tl.x / g) * g; x <= br.x; x += g) {
    const major = Math.abs(Math.round(x / g)) % 5 === 0;
    c.strokeStyle = x === 0 ? theme.muted : major ? theme.grid2 : theme.grid;
    const sx = Math.round(toScreen({ x, y: 0 }).x * dpr) + 0.5;
    c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, H); c.stroke();
  }
  for (let y = Math.floor(br.y / g) * g; y <= tl.y; y += g) {
    const major = Math.abs(Math.round(y / g)) % 5 === 0;
    c.strokeStyle = y === 0 ? theme.muted : major ? theme.grid2 : theme.grid;
    const sy = Math.round(toScreen({ x: 0, y }).y * dpr) + 0.5;
    c.beginPath(); c.moveTo(0, sy); c.lineTo(W, sy); c.stroke();
  }
}

function drawHatch(c, id, h, o) {
  const path = hatchPath(h);
  if (!path) return;
  c.save();
  const col = colorOf(h.color, o);
  if (o.ui && isSel('ha', id)) { c.fillStyle = theme.sel + '33'; c.fill(path, 'evenodd'); }
  if (h.kind === 'solid') {
    c.globalAlpha = h.alpha ?? 0.45; c.fillStyle = col; c.fill(path, 'evenodd');
  } else {
    c.clip(path, 'evenodd');
    c.strokeStyle = col; c.lineWidth = dpr; c.globalAlpha = Math.max(h.alpha ?? 1, 0.6); c.setLineDash([]);
    const loops = hatchLoops(doc, h);
    let minx = 1e18, miny = 1e18, maxx = -1e18, maxy = -1e18;
    for (const lp of loops) {
      const pts = lp.pts || [{ x: lp.c.x - lp.r, y: lp.c.y - lp.r }, { x: lp.c.x + lp.r, y: lp.c.y + lp.r }];
      for (const p of pts) { const s = toScreen(p); minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x); miny = Math.min(miny, s.y); maxy = Math.max(maxy, s.y); }
    }
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, R = Math.hypot(maxx - minx, maxy - miny) / 2 + 2;
    const sp = Math.max(2, h.spacing || 8);
    const angs = h.kind === 'cross' ? [h.angle, h.angle + 90] : [h.angle];
    for (const a of angs) {
      const t = (-a * Math.PI) / 180, dx = Math.cos(t), dy = Math.sin(t);
      c.beginPath();
      for (let k = -R; k <= R; k += sp) {
        const px = cx - dy * k, py = cy + dx * k;
        c.moveTo((px - dx * R) * dpr, (py - dy * R) * dpr); c.lineTo((px + dx * R) * dpr, (py + dy * R) * dpr);
      }
      c.stroke();
    }
  }
  c.restore();
}

let labelBg = '#fff';
function label(c, text, x, y, id, color, italic = false) {
  c.save();
  c.font = `${italic ? 'italic ' : ''}${12 * dpr}px -apple-system, system-ui, sans-serif`;
  const w = c.measureText(text).width / dpr + 8, h = 18;
  const bx = x - w / 2, by = y - h / 2;
  c.fillStyle = labelBg; c.globalAlpha = 0.85;
  c.beginPath(); c.roundRect(bx * dpr, by * dpr, w * dpr, h * dpr, 4 * dpr); c.fill();
  c.globalAlpha = 1; c.fillStyle = color; c.textBaseline = 'middle'; c.textAlign = 'center';
  c.fillText(text, x * dpr, y * dpr + dpr);
  c.restore();
  if (id) labelHits.push({ x: bx, y: by, w, h, id });
}

function midOf(refs) {
  const pts = [];
  for (const r of refs) {
    if (r in doc.pts) pts.push(doc.pts[r]);
    else if (r in doc.lines) pts.push(doc.pts[doc.lines[r].a], doc.pts[doc.lines[r].b]);
    else if (r in doc.circles) pts.push(doc.pts[doc.circles[r].c]);
    else if (r in doc.arcs) pts.push(doc.pts[doc.arcs[r].c]);
  }
  if (!pts.length) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

const GLYPH = { H: 'H', V: 'V', PAR: '∥', PERP: '⟂', EQL: '=', EQR: '=', MID: 'M', TANLC: 'T', TANCC: 'T', TANLS: 'T', TANCS: 'T', PONS: '●', COL: 'Col' };
const FONT = '-apple-system, system-ui, "Segoe UI", sans-serif';
let mctx = null;
// ancho de una linea de texto para altura 1 (se escala por la altura real del texto)
function measureRel(line) {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  mctx.font = `100px ${FONT}`;
  return mctx.measureText(line).width / 100;
}

function drawTexts(c, o) {
  for (const [id, t] of Object.entries(doc.texts)) {
    const P = doc.pts[t.pt];
    if (!P) continue;
    const pose = textPose(doc, t);
    const S = toScreen(P), f = textFrame(t, measureRel, pose.anchor), sc = view.s;
    c.save();
    c.translate(S.x * dpr, S.y * dpr);
    c.rotate(-(pose.ang * Math.PI) / 180);
    c.font = `${t.h * sc * dpr}px ${FONT}`;
    c.fillStyle = colorOf(t.color, o); c.textBaseline = 'top'; c.textAlign = 'left';
    f.lines.forEach((ln, i) => c.fillText(ln, f.xmin * sc * dpr, (-f.ymax * sc + (i * LINE_SPACING + 0.1) * t.h * sc) * dpr));
    if (o.ui && isSel('tx', id)) {
      c.strokeStyle = theme.sel; c.lineWidth = 1.5 * dpr; c.setLineDash([5 * dpr, 3 * dpr]);
      c.strokeRect(f.xmin * sc * dpr, -f.ymax * sc * dpr, f.w * sc * dpr, f.hh * sc * dpr);
    }
    c.restore();
  }
}

// cabeza de flecha con la punta en (x,y) apuntando hacia (dx,dy); medidas en px de pantalla
function arrowHead(c, { x, y, dx, dy }) {
  const len = 9, w = 3.2, bx = x - dx * len, by = y - dy * len, nx = -dy, ny = dx;
  c.beginPath();
  c.moveTo(x * dpr, y * dpr); c.lineTo((bx + nx * w) * dpr, (by + ny * w) * dpr); c.lineTo((bx - nx * w) * dpr, (by - ny * w) * dpr);
  c.closePath(); c.fill();
}

function drawDim(c, id, k, col) {
  const L = layoutDim(doc, k, view);
  c.save();
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = dpr; c.setLineDash([]);
  for (const l of L.lines) { c.beginPath(); c.moveTo(l[0] * dpr, l[1] * dpr); c.lineTo(l[2] * dpr, l[3] * dpr); c.stroke(); }
  for (const a of L.arcs) {
    c.beginPath(); c.arc(a.cx * dpr, a.cy * dpr, a.r * dpr, a.a0, a.a1, a.ccw);
    c.setLineDash(a.dashed ? [4 * dpr, 3 * dpr] : []); c.stroke();
  }
  c.setLineDash([]);
  for (const ar of L.arrows) arrowHead(c, ar);
  c.restore();
  if (L.label) label(c, L.label.text, L.label.x, L.label.y, id, col, L.label.italic);
}

function drawConstraints(c, o) {
  const used = {};
  for (const [id, k] of Object.entries(doc.cons)) {
    if (k.hidden) continue;
    // al exportar (sin interfaz) las cotas van en el color del dibujo y no se pintan los simbolos de relaciones
    const col = !o.ui ? o.fg : isSel('co', id) ? theme.sel : theme.accent;
    if (k.t === 'DIST' || k.t === 'DISTPL' || k.t === 'ANG' || k.t === 'RAD') { if (o.dims) drawDim(c, id, k, col); continue; }
    if (!o.cons) continue;
    const m = GLYPH[k.t] && midOf(k.refs);
    if (!m) continue;
    const sp = toScreen(m);
    const key = `${Math.round(sp.x)},${Math.round(sp.y)}`;
    used[key] = (used[key] || 0) + 1;
    label(c, GLYPH[k.t], sp.x + 12 + (used[key] - 1) * 18, sp.y + 14, id, col);
  }
}

function drawPreview(c) {
  c.save();
  c.setLineDash([6 * dpr, 4 * dpr]); c.lineWidth = 1.5 * dpr; c.strokeStyle = theme.accent;
  if (hover) {
    const s = snapAt(hover.x, hover.y);
    const sp = toScreen(s);
    if (tool !== 'select') {
      c.setLineDash([]); c.beginPath(); c.arc(sp.x * dpr, sp.y * dpr, 7 * dpr, 0, 7);
      c.strokeStyle = s.type === 'free' ? theme.muted : theme.accent; c.stroke();
    }
    if (tool === 'line' && pending?.start) {
      const a = toScreen(doc.pts[pending.start]);
      c.setLineDash([6 * dpr, 4 * dpr]); c.strokeStyle = theme.accent;
      c.beginPath(); c.moveTo(a.x * dpr, a.y * dpr); c.lineTo(sp.x * dpr, sp.y * dpr); c.stroke();
      label(c, fmt(dist(doc.pts[pending.start], s)), (a.x + sp.x) / 2, (a.y + sp.y) / 2 - 14, null, theme.accent);
    }
    if (tool === 'arcc' && pending?.center) {
      const cc = toScreen(doc.pts[pending.center]);
      if (!pending.start) {
        const r = dist(cc, sp);
        c.setLineDash([6 * dpr, 4 * dpr]); c.beginPath(); c.arc(cc.x * dpr, cc.y * dpr, r * dpr, 0, 7); c.stroke();
        label(c, 'R' + fmt(r / view.s), cc.x, cc.y - r - 14, null, theme.accent);
      } else {
        const C = doc.pts[pending.center], S = doc.pts[pending.start];
        const a0 = Math.atan2(S.y - C.y, S.x - C.x);
        const aE = Math.atan2(s.y - C.y, s.x - C.x);
        let sw = (((aE - a0) % TAU) + TAU) % TAU;
        if (sw < 1e-4) sw = TAU;
        c.setLineDash([6 * dpr, 4 * dpr]); c.beginPath();
        c.arc(cc.x * dpr, cc.y * dpr, dist(C, S) * view.s * dpr, -a0, -(a0 + sw), true); c.stroke();
        label(c, fmt((sw * 180) / Math.PI) + '°', cc.x, cc.y - dist(C, S) * view.s - 14, null, theme.accent);
      }
    }
    if (tool === 'arc3' && pending?.a) {
      const A = doc.pts[pending.a];
      c.setLineDash([6 * dpr, 4 * dpr]); c.beginPath();
      if (!pending.m) {
        const a = toScreen(A); c.moveTo(a.x * dpr, a.y * dpr); c.lineTo(sp.x * dpr, sp.y * dpr); c.stroke();
      } else {
        const g3 = arcThrough3(A, pending.m, s);
        if (g3) {
          const cc = toScreen(g3.c);
          const S0 = g3.startIsA ? A : s, E0 = g3.startIsA ? s : A;
          const a0 = Math.atan2(S0.y - g3.c.y, S0.x - g3.c.x), aE = Math.atan2(E0.y - g3.c.y, E0.x - g3.c.x);
          let sw = (((aE - a0) % TAU) + TAU) % TAU;
          if (sw < 1e-4) sw = TAU;
          c.arc(cc.x * dpr, cc.y * dpr, g3.r * view.s * dpr, -a0, -(a0 + sw), true); c.stroke();
          label(c, 'R' + fmt(g3.r), cc.x, cc.y - g3.r * view.s - 14, null, theme.accent);
        }
        const m = toScreen(pending.m);
        c.setLineDash([]); c.beginPath(); c.arc(m.x * dpr, m.y * dpr, 4 * dpr, 0, 7); c.stroke();
      }
    }
    if (tool === 'spline' && pending?.ids) {
      const Pm = pending.ids.map((id) => doc.pts[id]);
      if (!(s.type === 'pt' && s.id === pending.ids[pending.ids.length - 1])) Pm.push({ x: s.x, y: s.y });
      const Sm = splineSamples(Pm, false, 12).map(toScreen);
      c.setLineDash([6 * dpr, 4 * dpr]); c.beginPath();
      Sm.forEach((q, i) => (i ? c.lineTo(q.x * dpr, q.y * dpr) : c.moveTo(q.x * dpr, q.y * dpr)));
      c.stroke();
    }
    if (tool === 'circle' && pending?.center) {
      const cc = toScreen(doc.pts[pending.center]);
      const r = dist(cc, sp);
      c.setLineDash([6 * dpr, 4 * dpr]); c.beginPath(); c.arc(cc.x * dpr, cc.y * dpr, r * dpr, 0, 7); c.stroke();
      label(c, 'R' + fmt(r / view.s), cc.x, cc.y - r - 14, null, theme.accent);
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- entrada
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
const style = () => ({ color: cur.color, ltype: cur.ltype, w: cur.w, ls: cur.ls });

function pointFrom(s) {
  if (s.type === 'pt') return s.id;
  const id = addPoint(doc, s.x, s.y, true);
  if (s.type === 'ln') addCon(doc, { t: 'PONL', refs: [id, s.id] });
  if (s.type === 'ci' || s.type === 'ar') addCon(doc, { t: 'PONC', refs: [id, s.id] });
  if (s.type === 'sp') addCon(doc, { t: 'PONS', refs: [id, s.id] });
  return id;
}

function cancelPending() {
  if (pending) { pending = null; cleanup(doc); }
  hover = hover; draw();
}

cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  const p = pos(e);
  pointers.set(e.pointerId, { ...p, type: e.pointerType, button: e.button, down: p });
  const touches = [...pointers.values()].filter((q) => q.type === 'touch');
  if (touches.length >= 2) { startGesture(); return; }
  if (e.pointerType === 'touch' && !opts.touch) { gesture = { mode: 'pan', last: p, moved: false }; return; }
  if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || spaceDown)) { gesture = { mode: 'pan', last: p, moved: true }; return; }
  toolDown(p);
});
cv.addEventListener('pointermove', (e) => {
  const p = pos(e);
  const q = pointers.get(e.pointerId);
  if (q) { q.x = p.x; q.y = p.y; }
  if (gesture) { gestureMove(); return; }
  hover = p;
  if (q) toolMove(p);
  updateStatus(p);
  draw();
});
function endPointer(e) {
  const q = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (gesture) {
    const wasTap = gesture.mode === 'pan' && !gesture.moved && e.pointerType === 'touch' && !opts.touch;
    if (!pointers.size) { gesture = null; if (wasTap && e.type === 'pointerup') tapSelect(pos(e)); }
    else if (gesture.mode === 'pinch') gesture = null;
    return;
  }
  if (q && e.type === 'pointerup') toolUp(pos(e), q);
  else if (q) { drag = null; }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('pointerleave', () => { if (!pointers.size) { hover = null; draw(); } });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = pos(e);
  zoomAt(p, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });

function zoomAt(p, f) {
  const ns = Math.min(2000, Math.max(0.05, view.s * f));
  f = ns / view.s;
  view.ox = p.x - (p.x - view.ox) * f; view.oy = p.y - (p.y - view.oy) * f; view.s = ns;
  draw(); persist();
}

function startGesture() {
  drag = null;
  const t = [...pointers.values()].filter((q) => q.type === 'touch').slice(0, 2);
  gesture = { mode: 'pinch', d0: dist(t[0], t[1]) || 1, s0: view.s, c0: { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 }, o0: { x: view.ox, y: view.oy } };
}
function gestureMove() {
  if (gesture.mode === 'pan') {
    const q = [...pointers.values()][0];
    if (!q) return;
    if (!gesture.moved && dist(q, gesture.last) > 5) gesture.moved = true;
    if (gesture.moved) { view.ox += q.x - gesture.last.x; view.oy += q.y - gesture.last.y; gesture.last = { x: q.x, y: q.y }; draw(); persist(); }
  } else {
    const t = [...pointers.values()].filter((q) => q.type === 'touch').slice(0, 2);
    if (t.length < 2) return;
    const d = dist(t[0], t[1]), c = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 };
    const ns = Math.min(2000, Math.max(0.05, gesture.s0 * (d / gesture.d0))), f = ns / gesture.s0;
    view.s = ns;
    view.ox = c.x - (gesture.c0.x - gesture.o0.x) * f; view.oy = c.y - (gesture.c0.y - gesture.o0.y) * f;
    draw(); persist();
  }
}

function tapSelect(p) {
  if (tool === 'select') selectAt(p);
}

function selectAt(p) {
  const h = hitTest(p.x, p.y);
  if (!h) { sel = []; afterChange(); return; }
  if (h.k === 'co') { sel = [h]; afterChange(); editDimension(h.id); return; }
  const i = sel.findIndex((s) => same(s, h));
  if (i >= 0) sel.splice(i, 1); else sel.push(h);
  afterChange();
}

function toolDown(p) {
  hover = p;
  if (tool === 'select') {
    const h = hitTest(p.x, p.y);
    drag = { p0: p, hit: h, started: false };
    if (h && (h.k === 'pt' || h.k === 'ln' || h.k === 'ci' || h.k === 'ar')) {
      const m = toModel(p.x, p.y);
      drag.m0 = m;
      drag.orig = h.k === 'pt' ? { [h.id]: { ...doc.pts[h.id] } }
        : h.k === 'ln' ? { [doc.lines[h.id].a]: { ...doc.pts[doc.lines[h.id].a] }, [doc.lines[h.id].b]: { ...doc.pts[doc.lines[h.id].b] } } : {};
      if (h.k === 'ci') drag.r0 = doc.circles[h.id].r;
      if (h.k === 'ar') drag.r0 = doc.arcs[h.id].r;
    }
    if (h && h.k === 'co' && doc.cons[h.id]?.v !== undefined) drag.dim = true;
    if (h && h.k === 'tx') {
      const pid = doc.texts[h.id].pt;
      drag.m0 = toModel(p.x, p.y);
      drag.orig = { [pid]: { ...doc.pts[pid] } };
    }
  } else {
    drag = { p0: p, moved: false };
  }
}

function toolMove(p) {
  if (!drag) return;
  if (tool !== 'select') { if (dist(p, drag.p0) > 8) drag.moved = true; return; }
  if (drag.dim) {
    if (!drag.started) { if (dist(p, drag.p0) < 5) return; drag.started = true; pushUndo(); }
    dragDim(doc, doc.cons[drag.hit.id], view, p);
    draw();
    return;
  }
  if (!drag.hit || !drag.orig) return;
  if (!drag.started) {
    if (dist(p, drag.p0) < 6) return;
    drag.started = true; pushUndo();
  }
  const m = toModel(p.x, p.y);
  const h = drag.hit;
  if (h.k === 'ci' || h.k === 'ar') {
    const ci = h.k === 'ci' ? doc.circles[h.id] : doc.arcs[h.id], c = doc.pts[ci.c];
    const r0 = ci.r; ci.r = Math.max(0.01, dist(c, m));
    const res = solve(doc, []);
    if (!res.ok) ci.r = r0;
  } else {
    // con trazados activos se interpola el movimiento en pasos cortos para que la trayectoria salga continua
    const cur2 = { dx: m.x - drag.m0.x, dy: m.y - drag.m0.y }, prev = drag.lastD || { dx: 0, dy: 0 };
    const tracing = Object.keys(doc.traces).length > 0;
    const steps = tracing ? Math.min(40, Math.max(1, Math.ceil((Math.hypot(cur2.dx - prev.dx, cur2.dy - prev.dy) * view.s) / 8))) : 1;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps, dx = prev.dx + (cur2.dx - prev.dx) * f, dy = prev.dy + (cur2.dy - prev.dy) * f;
      const r = solve(doc, Object.entries(drag.orig).map(([id, o]) => ({ id, x: o.x + dx, y: o.y + dy })));
      if (r.ok && tracing) recordTraces(doc, 1.5 / view.s);
    }
    drag.lastD = cur2;
  }
  draw();
}

function toolUp(p, q) {
  const d = drag; drag = null;
  if (tool === 'select') {
    if (d?.started) { afterChange(); return; }
    selectAt(p);
    return;
  }
  const moved = d?.moved;
  const sDown = snapAt(q.down.x, q.down.y), sUp = snapAt(p.x, p.y);
  if (tool === 'point') {
    if (sUp.type === 'pt') { toast('Ya hay un punto aquí'); return; }
    pushUndo(); const id = pointFrom(sUp); doc.pts[id].auto = false; afterChange(); return;
  }
  if (tool === 'line') {
    if (moved && !pending) {
      pushUndo(); const a = pointFrom(sDown), b = pointFrom(sUp);
      if (a === b) { rollback(); return; }
      addLine(doc, a, b, style()); finishEdit();
      return;
    }
    if (!pending) { pushUndo(); pending = { start: pointFrom(sUp) }; draw(); return; }
    if (sUp.type === 'pt' && sUp.id === pending.start) { cancelPending(); return; }
    pushUndo(); const b = pointFrom(sUp);
    addLine(doc, pending.start, b, style());
    pending = { start: b };
    finishEdit(true);
    return;
  }
  if (tool === 'circle') {
    if (!pending) { pushUndo(); pending = { center: pointFrom(sUp) }; draw(); return; }
    const c = doc.pts[pending.center];
    const r = dist(c, sUp);
    if (r < 1e-6) { toast('Radio nulo'); return; }
    pushUndo();
    const id = addCircle(doc, pending.center, r, style());
    if (sUp.type === 'pt') addCon(doc, { t: 'PONC', refs: [sUp.id, id] });
    pending = null; finishEdit();
    return;
  }
  if (tool === 'spline') {
    if (!pending) { pushUndo(); pending = { ids: [pointFrom(sUp)] }; draw(); return; }
    const ids = pending.ids;
    if (sUp.type === 'pt' && sUp.id === ids[ids.length - 1]) { finishSpline(false); return; } // tocar de nuevo el ultimo punto termina
    if (sUp.type === 'pt' && sUp.id === ids[0] && ids.length >= 3) { finishSpline(true); return; } // tocar el primero cierra la curva
    ids.push(pointFrom(sUp)); draw();
    return;
  }
  if (tool === 'text') { placeText(sUp); return; }
  if (tool === 'arcc') {
    if (!pending) { pushUndo(); pending = { center: pointFrom(sUp) }; draw(); return; }
    if (!pending.start) {
      if (sUp.type === 'pt' && sUp.id === pending.center) return;
      if (dist(doc.pts[pending.center], sUp) < 1e-6) { toast('Radio nulo'); return; }
      pending.start = pointFrom(sUp); draw(); return;
    }
    const C = doc.pts[pending.center], S = doc.pts[pending.start];
    const r = dist(C, S);
    let tap = sUp;
    if (tap.type !== 'pt') {
      // el extremo se proyecta sobre la circunferencia (ignora imanes a otros elementos)
      const d = dist(C, tap) || 1;
      tap = { type: 'free', x: C.x + ((tap.x - C.x) / d) * r, y: C.y + ((tap.y - C.y) / d) * r };
    }
    pushUndo();
    const endId = pointFrom(tap);
    if (endId === pending.start) { rollback(); toast('El extremo no puede ser el inicio'); return; }
    addArc(doc, pending.center, pending.start, endId, r, style());
    pending = null; finishEdit();
    return;
  }
  if (tool === 'arc3') {
    if (!pending) { pushUndo(); pending = { a: pointFrom(sUp) }; draw(); return; }
    if (!pending.m) {
      if (sUp.type === 'pt' && sUp.id === pending.a) return;
      pending.m = { x: sUp.x, y: sUp.y }; draw(); return;
    }
    pushUndo();
    const bId = pointFrom(sUp);
    const g3 = arcThrough3(doc.pts[pending.a], pending.m, doc.pts[bId]);
    if (!g3 || bId === pending.a) { rollback(); toast('Los 3 puntos deben ser distintos y no colineales'); return; }
    const cid = addPoint(doc, g3.c.x, g3.c.y, false);
    addArc(doc, cid, g3.startIsA ? pending.a : bId, g3.startIsA ? bId : pending.a, g3.r, style());
    pending = null; finishEdit();
    return;
  }
  if (tool === 'intersect') {
    const h = hitTest(p.x, p.y);
    if (!h || !['ln', 'ci', 'ar', 'sp'].includes(h.k)) { toast('Toca una línea, un arco, un círculo o un spline'); return; }
    pending = pending || { items: [] };
    if (pending.items.some((i) => same(i, h))) return;
    pending.items.push(h);
    sel = [...pending.items];
    if (pending.items.length === 2) { const it = pending.items; pending = null; sel = []; makeIntersections(it); }
    else { toast('Toca el segundo elemento'); afterChange(); }
  }
}

function finishSpline(closed) {
  const ids = pending?.ids || [];
  pending = null;
  if (ids.length < 2) { cleanup(doc); afterChange(); return; }
  const id = addSpline(doc, ids, style(), closed);
  sel = [{ k: 'sp', id }];
  afterChange();
}

function niceHeight() {
  // altura "redonda" mas cercana a ~16 px en pantalla
  const raw = 16 / view.s, pw = Math.pow(10, Math.floor(Math.log10(raw)));
  const cand = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * pw);
  return cand.reduce((b, v) => (Math.abs(v - raw) < Math.abs(b - raw) ? v : b), cand[0]);
}

function askText(labelText, initial) {
  return new Promise((resolve) => {
    const dlg = $('dlgT'), inp = $('dlgTInput');
    $('dlgTLabel').textContent = labelText;
    inp.value = initial;
    let done = false;
    const finish = (v) => { if (done) return; done = true; dlg.close(); resolve(v); };
    $('dlgTOk').onclick = (ev) => { ev.preventDefault(); finish(inp.value); };
    $('dlgTCancel').onclick = () => finish(null);
    dlg.oncancel = () => finish(null);
    dlg.showModal(); inp.focus();
  });
}

async function placeText(sUp) {
  pushUndo();
  const reuse = sUp.type === 'pt';
  const pid = pointFrom(sUp); // el punto de insercion es un punto real: admite restricciones
  if (!reuse) doc.pts[pid].txOnly = true; // punto propio del texto: solo se ve al seleccionarlo
  const val = await askText('Texto (Enter = nueva línea)', '');
  if (val === null || !val.trim()) { rollback(); afterChange(); return; }
  const id = addText(doc, pid, val, { h: cur.tx.h ?? niceHeight(), ang: cur.tx.ang, anchor: cur.tx.anchor, color: cur.color, readable: cur.tx.readable });
  sel = [{ k: 'tx', id }];
  finishEdit();
}

function finishEdit(keepPending) {
  const r = solve(doc, []);
  if (!r.ok) { rollback(); pending = keepPending ? null : pending; toast('Restricciones en conflicto: se deshizo la acción'); }
  afterChange();
}

function makeIntersections(items) {
  const [a, b] = items;
  const pts = [];
  const ln = (id) => { const l = doc.lines[id]; return [doc.pts[l.a], doc.pts[l.b]]; };
  const ci = (id) => { const c = doc.circles[id] || doc.arcs[id]; return [doc.pts[c.c], c.r]; };
  if (a.k === 'sp' || b.k === 'sp') {
    const sA = a.k === 'sp' ? a : b, o = a.k === 'sp' ? b : a;
    const P = splinePolyline(doc, doc.splines[sA.id], 24);
    if (o.k === 'sp') pts.push(...polylinePolyline(P, splinePolyline(doc, doc.splines[o.id], 24)));
    else if (o.k === 'ln') pts.push(...polylineLine(P, ...ln(o.id)));
    else pts.push(...polylineCircle(P, ...ci(o.id)));
  } else if (a.k === 'ln' && b.k === 'ln') {
    const p = lineLine(...ln(a.id), ...ln(b.id));
    if (!p) { toast('Las rectas son paralelas'); afterChange(); return; }
    pts.push(p);
  } else if (a.k !== 'ln' && b.k !== 'ln') pts.push(...circleCircle(...ci(a.id), ...ci(b.id)));
  else { const l = a.k === 'ln' ? a : b, c = a.k === 'ln' ? b : a; pts.push(...lineCircle(...ln(l.id), ...ci(c.id))); }
  // en un arco solo valen los puntos dentro de su tramo
  for (let i = pts.length - 1; i >= 0; i--) {
    for (const it of items) {
      if (it.k !== 'ar') continue;
      const ar = doc.arcs[it.id], g = arcOf(doc, ar);
      if (!inSweep(doc.pts[ar.c], g.a0, g.sweep, pts[i], 1e-3)) { pts.splice(i, 1); break; }
    }
  }
  if (!pts.length) { toast(items.some((it) => it.k === 'ar') ? 'No se intersectan (dentro del tramo del arco)' : 'No se intersectan'); afterChange(); return; }
  pushUndo();
  const created = [];
  for (const q of pts) {
    const id = addPoint(doc, q.x, q.y, false);
    for (const it of items) addCon(doc, { t: it.k === 'ln' ? 'PONL' : it.k === 'sp' ? 'PONS' : 'PONC', refs: [id, it.id] });
    created.push(id);
  }
  const r = solve(doc, []);
  if (!r.ok) { rollback(); toast('No se pudo crear la intersección (conflicto)'); afterChange(); return; }
  sel = created.map((id) => ({ k: 'pt', id }));
  toast(pts.length === 1 ? 'Punto de intersección creado' : `${pts.length} puntos de intersección creados`);
  afterChange();
}

// ---------------------------------------------------------------- restricciones
// Ultimo estado del interruptor "Solo lectura" del dialogo de cotas.
let dlgRef = false;
function askNumber(labelText, initial, refState = false) {
  return new Promise((resolve) => {
    const dlg = $('dlg'), inp = $('dlgInput'), chk = $('dlgRef');
    $('dlgLabel').textContent = labelText;
    inp.value = String(initial);
    chk.checked = refState; inp.disabled = refState;
    chk.onchange = () => { inp.disabled = chk.checked; };
    let done = false;
    const finish = (v) => { if (done) return; done = true; dlgRef = chk.checked; dlg.close(); resolve(v); };
    $('dlgOk').onclick = (ev) => {
      ev.preventDefault();
      if (chk.checked) { finish(Number(initial)); return; } // cota de referencia: no se teclea valor
      const v = Number(inp.value.replace(',', '.')); finish(Number.isFinite(v) ? v : null);
    };
    $('dlgCancel').onclick = () => finish(null);
    dlg.oncancel = () => finish(null);
    dlg.showModal(); inp.focus(); inp.select();
  });
}

function selBy() {
  const ids = (k) => sel.filter((x) => x.k === k).map((x) => x.id);
  const crv = sel.filter((x) => x.k === 'ci' || x.k === 'ar').map((x) => x.id);
  // un texto seleccionado aporta su punto de insercion a las restricciones
  const txPts = sel.filter((x) => x.k === 'tx').map((x) => doc.texts[x.id]?.pt).filter((q) => q && !ids('pt').includes(q));
  return { pts: [...ids('pt'), ...txPts], lns: ids('ln'), cis: ids('ci'), ars: ids('ar'), sps: ids('sp'), crv };
}
const lineEnds = (id) => [doc.lines[id].a, doc.lines[id].b];
const curveOf = (id) => doc.circles[id] || doc.arcs[id];

async function applyCon(kind) {
  const { pts, lns, crv, sps } = selBy();
  const list = [];
  let pre = null; // ajuste previo del dibujo (despues de guardar el estado para deshacer)
  const bad = (m) => { toast(m); return null; };
  switch (kind) {
    case 'H': case 'V':
      if (lns.length) lns.forEach((l) => list.push({ t: kind, refs: [l] }));
      else if (pts.length >= 2) for (let i = 1; i < pts.length; i++) list.push({ t: kind, refs: [pts[0], pts[i]] });
      else return bad('Selecciona líneas o 2 puntos');
      break;
    case 'PAR': case 'PERP':
      if (lns.length < 2) return bad('Selecciona 2 líneas');
      for (let i = 1; i < lns.length; i++) list.push({ t: kind, refs: [lns[0], lns[i]] });
      break;
    case 'COL':
      if (lns.length < 2) return bad('Selecciona 2 o más líneas');
      for (let i = 1; i < lns.length; i++) list.push({ t: 'COL', refs: [lns[0], lns[i]] });
      break;
    case 'EQ':
      if (lns.length >= 2 && !crv.length) for (let i = 1; i < lns.length; i++) list.push({ t: 'EQL', refs: [lns[0], lns[i]] });
      else if (crv.length >= 2 && !lns.length) for (let i = 1; i < crv.length; i++) list.push({ t: 'EQR', refs: [crv[0], crv[i]] });
      else return bad('Selecciona 2 líneas, o 2 círculos/arcos');
      break;
    case 'COI':
      if (pts.length < 2) return bad('Selecciona 2 puntos');
      for (let i = 1; i < pts.length; i++) list.push({ t: 'COI', refs: [pts[0], pts[i]] });
      break;
    case 'ONC':
      if (pts.length && sps.length === 1 && !lns.length && !crv.length) pts.forEach((p) => list.push({ t: 'PONS', refs: [p, sps[0]] }));
      else if (pts.length && lns.length === 1 && !crv.length) pts.forEach((p) => list.push({ t: 'PONL', refs: [p, lns[0]] }));
      else if (pts.length && crv.length === 1 && !lns.length) pts.forEach((p) => list.push({ t: 'PONC', refs: [p, crv[0]] }));
      else return bad('Selecciona punto(s) y una línea, arco, círculo o spline');
      break;
    case 'MID':
      if (pts.length !== 1 || lns.length !== 1) return bad('Selecciona 1 punto y 1 línea');
      list.push({ t: 'MID', refs: [...lineEnds(lns[0]), pts[0]] });
      break;
    case 'TAN':
      if (sps.length === 1 && lns.length + crv.length === 1) {
        // punto de contacto: el punto del spline mas cercano a la recta (o a la circunferencia)
        const poly = splinePolyline(doc, doc.splines[sps[0]], 32);
        let score;
        if (lns.length) { const [a, b] = lineEnds(lns[0]).map((i) => doc.pts[i]); const L = dist(a, b) || 1; score = (q) => Math.abs((b.x - a.x) * (a.y - q.y) - (a.x - q.x) * (b.y - a.y)) / L; }
        else { const o = curveOf(crv[0]), c = doc.pts[o.c]; score = (q) => Math.abs(dist(c, q) - o.r); }
        const q0 = poly.reduce((m, q) => (score(q) < score(m) ? q : m), poly[0]);
        const tp = addPoint(doc, q0.x, q0.y, true);
        list.push({ t: lns.length ? 'TANLS' : 'TANCS', refs: [lns.length ? lns[0] : crv[0], sps[0], tp] });
        pre = () => seedTangent(lns[0], sps[0], tp, poly);
      } else if (lns.length === 1 && crv.length === 1) list.push({ t: 'TANLC', refs: [lns[0], crv[0]] });
      else if (crv.length === 2 && !lns.length) list.push({ t: 'TANCC', refs: [crv[0], crv[1]] });
      else return bad('Selecciona línea + círculo/arco, 2 círculos/arcos, o un spline + línea/círculo/arco');
      break;
    case 'FIX': {
      const ids = new Set(pts);
      lns.forEach((l) => lineEnds(l).forEach((p) => ids.add(p)));
      crv.forEach((c) => { const o = curveOf(c); ids.add(o.c); if (o.a) { ids.add(o.a); ids.add(o.b); } });
      if (!ids.size) return bad('Selecciona puntos o elementos a fijar');
      pushUndo();
      const allFixed = [...ids].every((i) => doc.pts[i].fixed);
      ids.forEach((i) => { doc.pts[i].fixed = !allFixed; });
      toast(allFixed ? 'Soltado' : 'Fijado'); afterChange();
      return;
    }
    case 'DIM': {
      let refs, t, v;
      if (pts.length === 2 && !lns.length) { refs = pts; t = 'DIST'; v = dist(doc.pts[pts[0]], doc.pts[pts[1]]); }
      else if (lns.length === 1 && !pts.length) { refs = lineEnds(lns[0]); t = 'DIST'; v = dist(doc.pts[refs[0]], doc.pts[refs[1]]); }
      else if (pts.length === 1 && lns.length === 1) {
        const [a, b] = lineEnds(lns[0]).map((i) => doc.pts[i]), p = doc.pts[pts[0]];
        refs = [pts[0], lns[0]]; t = 'DISTPL';
        v = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / (dist(a, b) || 1);
      } else return bad('Selecciona 2 puntos, 1 línea, o 1 punto + 1 línea');
      const val = await askNumber('Distancia', Math.round(v * 1000) / 1000);
      if (val === null || val <= 0) return;
      list.push({ t, refs, v: val, ...(dlgRef ? { ref: true } : {}) });
      break;
    }
    case 'ANG': {
      if (lns.length !== 2) return bad('Selecciona 2 líneas');
      const dir = (l) => { const [a, b] = lineEnds(l).map((i) => doc.pts[i]); return { x: b.x - a.x, y: b.y - a.y }; };
      const v = (signedAngle(dir(lns[0]), dir(lns[1])) * 180) / Math.PI;
      // sector que se acota: el que une los dos segmentos; luego se puede mover la cota a otro (20° o 160°)
      const tmp = { t: 'ANG', refs: [lns[0], lns[1]], v };
      const S = angSector(doc, tmp);
      tmp.s1 = S.V0 ? S.s1 : 1; tmp.s2 = S.V0 ? S.s2 : 1;
      const val = await askNumber('Ángulo (°) entre las dos líneas, de 0 a 180', Math.round(angSector(doc, tmp).val * 100) / 100);
      if (val === null) return;
      if (val < 0 || val > 180) return bad('El ángulo debe estar entre 0° y 180°');
      list.push({ t: 'ANG', refs: [lns[0], lns[1]], v: angTrue(doc, tmp, val), s1: tmp.s1, s2: tmp.s2, ...(dlgRef ? { ref: true } : {}) });
      break;
    }
    case 'RAD': {
      if (!crv.length) return bad('Selecciona un círculo o arco');
      const allC = crv.every((id) => id in doc.circles), allA = crv.every((id) => id in doc.arcs);
      if (!allC && !allA) return bad('Selecciona solo círculos o solo arcos');
      const r0 = curveOf(crv[0]).r;
      const val0 = await askNumber(allC ? 'Diámetro (φ)' : 'Radio (R)', Math.round((allC ? 2 * r0 : r0) * 1000) / 1000);
      if (val0 === null || val0 <= 0) return;
      crv.forEach((c) => list.push({ t: 'RAD', refs: [c], v: allC ? val0 / 2 : val0, ...(dlgRef ? { ref: true } : {}) }));
      break;
    }
    default: return;
  }
  commitCons(list, pre);
}

// Arranque de la tangencia recta-spline: si la recta tiene un extremo fijo, busca la tangente exacta desde
// ese extremo y gira el otro hasta ella, para que el solver parta cerca de la solucion (Newton).
function seedTangent(lnId, spId, tp, poly) {
  if (!lnId) return;
  const l = doc.lines[lnId], A = doc.pts[l.a], B = doc.pts[l.b];
  if (!!A.fixed === !!B.fixed) return;
  const piv = A.fixed ? A : B, fr = A.fixed ? B : A;
  const len = dist(piv, fr) || 1;
  const g = (i) => { const a = poly[i], b = poly[i + 1], L = dist(a, b) || 1; return ((b.x - a.x) * (a.y - piv.y) - (b.y - a.y) * (a.x - piv.x)) / L; };
  let best = null;
  for (let i = 0; i < poly.length - 2; i++) {
    const g0 = g(i), g1 = g(i + 1);
    if (g0 * g1 > 0 || g0 === g1) continue;
    const u = g0 / (g0 - g1), q = { x: poly[i + 1].x * u + poly[i].x * (1 - u), y: poly[i + 1].y * u + poly[i].y * (1 - u) };
    const ang = Math.abs(signedAngle({ x: fr.x - piv.x, y: fr.y - piv.y }, { x: q.x - piv.x, y: q.y - piv.y }));
    if (!best || ang < best.ang) best = { q, ang };
  }
  if (!best) return;
  const d = dist(piv, best.q) || 1;
  doc.pts[tp].x = best.q.x; doc.pts[tp].y = best.q.y;
  fr.x = piv.x + ((best.q.x - piv.x) / d) * len; fr.y = piv.y + ((best.q.y - piv.y) / d) * len;
}

const SPLIT_LOST = { EQL: 'igual longitud', ANG: 'ángulo', COL: 'colineal', DISTPL: 'distancia a recta' };
function splitSelected() {
  const els = sel.filter((x) => x.k === 'ln' || x.k === 'ci' || x.k === 'ar');
  const pts = sel.filter((x) => x.k === 'pt').map((x) => x.id);
  if (els.length !== 1 || !pts.length) { toast('Selecciona 1 segmento, arco o círculo y los puntos que lo dividen'); return; }
  pushUndo();
  const res = splitElement(doc, els[0].id, pts);
  if (!res.ok) { rollback(); toast(res.msg); afterChange(); return; }
  const r = solve(doc, []);
  if (!r.ok) { rollback(); toast('No se pudo dividir: conflicto con las restricciones'); afterChange(); return; }
  sel = res.pieces.map((id) => ({ k: els[0].k === 'ln' ? 'ln' : 'ar', id }));
  const lost = [...new Set(res.dropped)].map((t) => SPLIT_LOST[t] || t);
  toast(`Dividido en ${res.pieces.length}` + (lost.length ? `. No se pudo heredar: ${lost.join(', ')}` : ''));
  afterChange();
}

function commitCons(list, pre) {
  pushUndo();
  if (pre) pre();
  list.forEach((k) => addCon(doc, k));
  const r = solve(doc, []);
  if (!r.ok) { rollback(); toast('No se pudo: entra en conflicto con otras restricciones. Si solo quieres medir, usa «Solo lectura»'); afterChange(); return; }
  afterChange();
}

async function editDimension(id) {
  const k = doc.cons[id];
  if (!k || k.v === undefined) return;
  const isC = k.t === 'RAD' && k.refs[0] in doc.circles;
  const now = dimValue(doc, k); // las de referencia muestran el valor medido en este momento
  const val0 = await askNumber(k.t === 'ANG' ? 'Ángulo (°)' : k.t === 'RAD' ? (isC ? 'Diámetro (φ)' : 'Radio (R)') : 'Distancia', Math.round((isC ? 2 * now : now) * 1000) / 1000, !!k.ref);
  if (val0 === null || (!dlgRef && k.t !== 'ANG' && val0 <= 0)) return;
  pushUndo();
  if (dlgRef) { k.ref = true; afterChange(); return; } // es (o pasa a ser) cota de referencia: no toca el solver
  if (k.t === 'ANG' && (val0 < 0 || val0 > 180)) { rollback(); toast('El ángulo debe estar entre 0° y 180°'); afterChange(); return; }
  const val = isC ? val0 / 2 : k.t === 'ANG' ? angTrue(doc, { ...k, ref: false, v: k.ref ? (angSector(doc, k).A * 180) / Math.PI : k.v }, val0) : val0;
  k.v = val; delete k.ref;
  const r = solve(doc, []);
  if (!r.ok) { rollback(); toast('Valor imposible con las restricciones actuales. Usa «Solo lectura» para solo medirla'); }
  afterChange();
}

// ---------------------------------------------------------------- estilo, tipos de linea, rellenos
function applyStyle(prop, value) {
  cur[prop] = value;
  let touched = false;
  if (sel.length) pushUndo();
  for (const s of sel) {
    const o = s.k === 'ln' ? doc.lines[s.id] : s.k === 'ci' ? doc.circles[s.id] : s.k === 'ar' ? doc.arcs[s.id] : s.k === 'sp' ? doc.splines[s.id] : (s.k === 'ha' || s.k === 'tx') && prop === 'color' ? (s.k === 'ha' ? doc.hatches[s.id] : doc.texts[s.id]) : null;
    if (o) { o[prop] = value; touched = true; }
    else if (s.k === 'pt' && doc.traces[s.id]) { doc.traces[s.id][prop] = value; touched = true; } // el estilo de un punto con trazado es el de su trayectoria
  }
  if (sel.length && !touched) undoStack.pop();
  afterChange();
}

function buildSwatches() {
  const box = $('swatches');
  box.innerHTML = '';
  for (const [val, name] of PALETTE) {
    const b = document.createElement('button');
    b.title = name; b.dataset.val = val;
    b.style.background = val === 'auto' ? 'linear-gradient(135deg,#fff 50%,#111 50%)' : val;
    b.onclick = () => { applyStyle('color', val); };
    box.appendChild(b);
  }
}

function fillLtypes() {
  const s = $('ltype');
  const lt = allLtypes(doc);
  s.innerHTML = '';
  for (const [k, v] of Object.entries(lt)) { const o = document.createElement('option'); o.value = k; o.textContent = v.label; s.appendChild(o); }
  s.value = cur.ltype in lt ? cur.ltype : 'continua';
}

function drawSample(canvas, pattern, color) {
  const w = canvas.clientWidth || 200, h = 24;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = color; c.lineWidth = 2 * dpr;
  c.setLineDash(dashFromPattern(pattern, 0.6).map((x) => Math.max(x, 0.01) * 3 * opts.ltScale * dpr));
  c.beginPath(); c.moveTo(6 * dpr, 12 * dpr); c.lineTo((w - 6) * dpr, 12 * dpr); c.stroke();
}

function syncTextPanel(txt) {
  const src = txt || { text: '', h: cur.tx.h ?? '', ang: cur.tx.ang, anchor: cur.tx.anchor, readable: cur.tx.readable };
  $('txAngleLabel').textContent = txt?.ref ? 'Desfase °' : 'Ángulo °';
  $('txRead').setAttribute('aria-pressed', String(src.readable !== false));
  if (document.activeElement !== $('txContent')) $('txContent').value = src.text;
  if (document.activeElement !== $('txAngle')) $('txAngle').value = String(src.ang ?? 0);
  if (document.activeElement !== $('txSize')) $('txSize').value = src.h === '' ? '' : String(Math.round(src.h * 1000) / 1000);
  $('txContent').disabled = !txt;
  [...$('txAnchors').children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === src.anchor)));
}

function applyText(prop, value) {
  const ts = sel.filter((x) => x.k === 'tx').map((x) => doc.texts[x.id]);
  if (['h', 'ang', 'anchor', 'readable'].includes(prop) && !(prop === 'ang' && ts.some((t) => t.ref))) cur.tx[prop] = value;
  if (ts.length) { pushUndo(); ts.forEach((t) => { t[prop] = value; }); }
  afterChange();
}

function buildAnchors() {
  const box = $('txAnchors');
  box.innerHTML = '';
  ANCHORS.forEach((a) => {
    const b = document.createElement('button');
    b.dataset.a = a; b.title = 'Punto de inserción: ' + ANCHOR_NAMES[a]; b.setAttribute('aria-label', b.title);
    const x = { l: 5, c: 12, r: 19 }[a[1]], y = { t: 5, m: 12, b: 19 }[a[0]];
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="1" opacity=".55"/><circle cx="${x}" cy="${y}" r="3" fill="currentColor"/></svg>`;
    b.onclick = () => applyText('anchor', a);
    box.appendChild(b);
  });
}

function syncPanel() {
  const first = sel.map((s) => (s.k === 'ln' ? doc.lines[s.id] : s.k === 'ci' ? doc.circles[s.id] : s.k === 'ar' ? doc.arcs[s.id] : s.k === 'sp' ? doc.splines[s.id] : null)).find(Boolean);
  const hat = sel.map((s) => (s.k === 'ha' ? doc.hatches[s.id] : null)).find(Boolean);
  const txt = sel.map((s) => (s.k === 'tx' ? doc.texts[s.id] : null)).find(Boolean);
  if (first) { cur.color = first.color; cur.ltype = first.ltype; cur.w = first.w; cur.ls = first.ls ?? 1; }
  else if (hat) cur.color = hat.color;
  else if (txt) cur.color = txt.color;
  else if (sel.some((s) => s.k === 'pt' && doc.traces[s.id])) { const tr = doc.traces[sel.find((s) => s.k === 'pt' && doc.traces[s.id]).id]; cur.color = tr.color; cur.ltype = tr.ltype; cur.w = tr.w; cur.ls = tr.ls ?? 1; }
  $('ltEl').value = String(cur.ls ?? 1);
  syncTextPanel(txt);
  fillLtypes();
  $('weight').value = String(cur.w);
  [...$('swatches').children].forEach((b) => b.classList.toggle('on', b.dataset.val === cur.color));
  if (/^#/.test(cur.color)) $('colorPick').value = cur.color;
  if (hat) { $('hKind').value = hat.kind; $('hAngle').value = hat.angle; $('hSpace').value = hat.spacing; $('hAlpha').value = hat.alpha; }
  drawSample($('ltprev'), (allLtypes(doc)[cur.ltype] || allLtypes(doc).continua).pattern, theme.fg);
  const hasDimOrCon = sel.some((s) => s.k === 'co');
  $('del').title = hasDimOrCon ? 'Borrar cota o restricción (Supr)' : 'Borrar selección (Supr)';
}

function updateHatchFromPanel() {
  const hs = sel.filter((s) => s.k === 'ha');
  if (!hs.length) return;
  pushUndo();
  for (const s of hs) Object.assign(doc.hatches[s.id], { kind: $('hKind').value, angle: Number($('hAngle').value) || 0, spacing: Math.max(2, Number($('hSpace').value) || 8), alpha: Number($('hAlpha').value) });
  afterChange();
}

function createHatch() {
  const ids = sel.filter((s) => s.k === 'ln' || s.k === 'ci' || s.k === 'ar' || s.k === 'sp').map((s) => s.id);
  if (!ids.length) { toast('Selecciona las líneas, arcos o círculos que forman el contorno'); return; }
  const h = { ids, kind: $('hKind').value, angle: Number($('hAngle').value) || 0, spacing: Math.max(2, Number($('hSpace').value) || 8), alpha: Number($('hAlpha').value), color: cur.color };
  if (!hatchLoops(doc, h).length) { toast('El contorno debe ser cerrado (líneas y arcos encadenados) o un círculo'); return; }
  pushUndo();
  const id = 'h' + (++doc.n);
  doc.hatches[id] = h;
  sel = [{ k: 'ha', id }];
  afterChange();
}

// ---------------------------------------------------------------- estado / ayuda
const HINTS = {
  select: 'Toca para seleccionar (varios). Arrastra puntos, líneas o el borde de un círculo; el mecanismo se mueve según las restricciones.',
  point: 'Toca para colocar un punto (sobre una línea o círculo queda restringido a él).',
  line: 'Toca inicio y fin (encadena); o arrastra un segmento. Esc/Seleccionar termina.',
  circle: 'Toca el centro y luego un punto del borde.',
  intersect: 'Toca dos elementos (línea, arco o círculo) para crear su punto de intersección.',
  text: 'Toca donde va el punto de insercion del texto (puede ser un punto existente).',
  spline: 'Spline por puntos: toca los puntos por donde pasa la curva. Tocar de nuevo el último (o Esc) termina; tocar el primero la cierra.',
  arcc: 'Arco por centro y extremos: toca el centro, el inicio y el fin (sentido antihorario).',
  arc3: 'Arco por 3 puntos: toca el inicio, un punto intermedio y el fin.',
};
function ltLabel(o) {
  const lt = allLtypes(doc)[o.ltype] || allLtypes(doc).continua;
  return `línea ${lt.label.toLowerCase()}${o.ls && o.ls !== 1 ? ' ×' + o.ls : ''}`;
}

function updateStatus(p) {
  let txt = HINTS[tool];
  if (sel.length === 1) {
    const s = sel[0];
    if (s.k === 'pt') { const q = doc.pts[s.id]; txt = `Punto (${fmt(q.x)}, ${fmt(q.y)})${q.fixed ? ' fijo' : ''}`; }
    else if (s.k === 'ln') { const [a, b] = lineEnds(s.id).map((i) => doc.pts[i]); txt = `Línea: longitud ${fmt(dist(a, b))}, ángulo ${fmt((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)}°, ${ltLabel(doc.lines[s.id])}`; }
    else if (s.k === 'ci') txt = `Círculo: radio ${fmt(doc.circles[s.id].r)}, ${ltLabel(doc.circles[s.id])}`;
    else if (s.k === 'tx') { const t = doc.texts[s.id]; txt = `Texto: “${t.text.split('\n')[0].slice(0, 24)}”, ${fmt(t.ang)}°, insercion ${t.anchor}${t.ref ? ', alineado con una línea' : ''}`; }
    else if (s.k === 'sp') { const sp = doc.splines[s.id]; txt = `Spline: ${sp.pts.length} puntos, ${sp.closed ? 'cerrada' : 'abierta'}, ${ltLabel(sp)}`; }
    else if (s.k === 'ar') { const g = arcOf(doc, doc.arcs[s.id]); txt = `Arco: radio ${fmt(doc.arcs[s.id].r)}, ${fmt((g.sweep * 180) / Math.PI)}°, ${ltLabel(doc.arcs[s.id])}`; }
    else if (s.k === 'ha') txt = 'Relleno seleccionado';
    else if (s.k === 'co') txt = 'Restricción/cota seleccionada';
  } else if (sel.length > 1) txt = `${sel.length} elementos seleccionados`;
  if (p && tool !== 'select') { const m = snapAt(p.x, p.y); txt += `   (${fmt(m.x)}, ${fmt(m.y)})${m.type !== 'free' ? ' ' + { pt: 'punto', ln: 'sobre línea', ci: 'sobre círculo' }[m.type] : ''}`; }
  $('status').textContent = txt;
}

// ---------------------------------------------------------------- archivo
// Pide el nombre del archivo (Safari guarda sin preguntar). Devuelve el nombre completo o null si se cancela.
// El nombre base se recuerda para la siguiente exportacion; suffix distingue variantes (p. ej. "-laser").
function askFileName(ext, suffix = '') {
  return new Promise((resolve) => {
    const dlg = $('dlgN'), inp = $('nameInput');
    $('nameExt').textContent = '.' + ext;
    inp.value = (opts.fileBase || 'dibujo') + suffix;
    let done = false;
    const finish = (full, base) => { if (done) return; done = true; dlg.close(); if (base) { opts.fileBase = suffix && base.endsWith(suffix) ? base.slice(0, -suffix.length) || base : base; persist(); } resolve(full); };
    $('nameOk').onclick = (ev) => {
      ev.preventDefault();
      const base = cleanFileBase(inp.value, ext);
      if (!base) { toast('Escribe un nombre'); return; }
      finish(base + '.' + ext, base);
    };
    $('nameCancel').onclick = () => finish(null);
    dlg.oncancel = () => finish(null);
    dlg.showModal(); inp.focus(); inp.select();
  });
}
async function saveFile(ext, suffix, makeBlob) {
  const name = await askFileName(ext, suffix);
  if (!name) return;
  const bl = makeBlob();
  if (bl) download(name, bl);
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function contentBounds() {
  const xs = [], ys = [];
  for (const p of Object.values(doc.pts)) { xs.push(p.x); ys.push(p.y); }
  for (const c of Object.values(doc.circles)) { const p = doc.pts[c.c]; xs.push(p.x - c.r, p.x + c.r); ys.push(p.y - c.r, p.y + c.r); }
  for (const a of Object.values(doc.arcs)) { const p = doc.pts[a.c]; xs.push(p.x - a.r, p.x + a.r); ys.push(p.y - a.r, p.y + a.r); }
  for (const sp of Object.values(doc.splines)) for (const q of splinePolyline(doc, sp, 8)) { xs.push(q.x); ys.push(q.y); }
  for (const tr of Object.values(doc.traces)) for (const q of tr.pts) { xs.push(q.x); ys.push(q.y); }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function fitView() {
  const b = contentBounds();
  const r = cv.getBoundingClientRect();
  if (!b) { view = { ox: r.width / 2, oy: r.height / 2, s: 5 }; draw(); return; }
  const w = Math.max(b.x1 - b.x0, 1e-6), h = Math.max(b.y1 - b.y0, 1e-6);
  const s = Math.min((r.width - 80) / w, (r.height - 80) / h, 400);
  view = { s, ox: r.width / 2 - ((b.x0 + b.x1) / 2) * s, oy: r.height / 2 + ((b.y0 + b.y1) / 2) * s };
  draw(); persist();
}
function loadDoc(d) {
  if (!d || typeof d !== 'object' || !d.pts || !d.lines || !d.circles) throw new Error('Archivo no válido');
  doc = { n: 0, cons: {}, hatches: {}, ltypes: {}, arcs: {}, texts: {}, splines: {}, traces: {}, ...d };
  undoStack = []; redoStack = []; sel = []; pending = null;
}
async function exportPNG() {
  const b = contentBounds();
  if (!b) { toast('No hay nada que exportar'); return; }
  const pad = 20, k = 6;
  let W = Math.ceil((b.x1 - b.x0) * k + pad * 2), H = Math.ceil((b.y1 - b.y0) * k + pad * 2);
  let v = { s: k, ox: pad - b.x0 * k, oy: H - pad + b.y0 * k };
  // el lienzo crece para que quepan cotas y textos
  const ex = extraExtents(doc, v, { dims: opts.dims, texts: opts.texts }), m = 8;
  if (ex) {
    const sx = Math.max(0, m - ex.minX), sy = Math.max(0, m - ex.minY);
    W = Math.ceil(Math.max(W, ex.maxX + m) + sx); H = Math.ceil(Math.max(H, ex.maxY + m) + sy);
    v = { s: k, ox: v.ox + sx, oy: v.oy + sy };
  }
  const fname = await askFileName('png');
  if (!fname) return;
  const off = document.createElement('canvas');
  off.width = Math.min(W * 2, 8000); off.height = Math.min(H * 2, 8000);
  const sc = off.width / W;
  const oc = off.getContext('2d');
  const saveDpr = dpr, saveHits = labelHits, saveSel = sel;
  dpr = sc; sel = [];
  render(oc, off.width, off.height, v, { fg: '#000', bg: '#fff', grid: false, cons: false, dims: opts.dims, texts: opts.texts, ui: false });
  dpr = saveDpr; labelHits = saveHits; sel = saveSel;
  off.toBlob((bl) => download(fname, bl), 'image/png');
}

// ---------------------------------------------------------------- cableado de la interfaz
function setTool(t) {
  if (pending) { if (tool === 'spline' && pending.ids?.length >= 2) finishSpline(false); else { pending = null; cleanup(doc); } }
  tool = t;
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  if (t !== 'intersect') pending = null;
  updateStatus(); draw();
}
document.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => setTool(b.dataset.tool); });
document.querySelectorAll('[data-con]').forEach((b) => { b.onclick = () => applyCon(b.dataset.con); });
$('mksplit').onclick = splitSelected;
$('mkint').onclick = () => {
  const it = sel.filter((s) => s.k === 'ln' || s.k === 'ci' || s.k === 'ar' || s.k === 'sp');
  if (it.length !== 2) { toast('Selecciona 2 elementos (líneas, arcos, círculos o splines)'); return; }
  makeIntersections(it);
};
$('undo').onclick = undo; $('redo').onclick = redo;
$('fit').onclick = fitView;
$('del').onclick = () => {
  if (!sel.length) return;
  pushUndo(); deleteItems(doc, sel); sel = [];
  const r = solve(doc, []); if (!r.ok) { /* las restricciones restantes siguen siendo validas */ }
  afterChange();
};
$('weight').onchange = (e) => applyStyle('w', Number(e.target.value));
$('ltype').onchange = (e) => applyStyle('ltype', e.target.value);
$('colorPick').oninput = (e) => applyStyle('color', e.target.value);
['hKind', 'hAngle', 'hSpace', 'hAlpha'].forEach((id) => { $(id).onchange = updateHatchFromPanel; });
$('hAlpha').oninput = updateHatchFromPanel;
$('mkhatch').onclick = createHatch;

// ---- equidistante de un spline (p. ej. radio del rodillo de una leva) ----
function newControlPoints(P, closed, N, c = { x: 0, y: 0 }) {
  const R = closed ? resamplePolyline([...P, P[0]], N + 1).slice(0, -1) : resamplePolyline(P, N);
  return R.map((q) => { const id = addPoint(doc, c.x + q.x, c.y + q.y, true); doc.pts[id].splOnly = true; return id; });
}
$('spOffset').onclick = () => {
  const spId = sel.find((x) => x.k === 'sp')?.id;
  if (!spId) { toast('Selecciona un spline'); return; }
  const d = Number(String($('spOffD').value).replace(',', '.'));
  if (!Number.isFinite(d) || d === 0) { toast('Escribe la distancia (positiva = hacia afuera en curvas cerradas)'); return; }
  const sp = doc.splines[spId];
  const dense = splinePolyline(doc, sp, 24);
  const o = offsetPolyline(sp.closed ? dense.slice(0, -1) : dense, d, sp.closed);
  if (!o) { toast('El spline necesita al menos 3 puntos'); return; }
  pushUndo();
  const ids = newControlPoints(o.pts, sp.closed, Math.max(48, sp.pts.length * 3));
  const nid = addSpline(doc, ids, { color: sp.color, ltype: sp.ltype, w: sp.w, ls: sp.ls }, sp.closed);
  sel = [{ k: 'sp', id: nid }];
  afterChange();
  if (o.undercut > 0) toast(`La equidistante se socava en ${o.undercut} tramos: la distancia supera el radio de curvatura (mínimo ${fmt(o.minRadius)}). Revisa la curva.`);
  else toast('Equidistante creada');
};

// ---- SVG para corte laser ----
$('fLaser').onclick = () => {
  const v = { unit: 1, stroke: 0.1, color: '#ff0000', onlyContinuous: true, ...(opts.laser || {}) };
  $('lsUnit').value = String(v.unit); $('lsStroke').value = String(v.stroke); $('lsColor').value = v.color; $('lsCont').checked = !!v.onlyContinuous;
  $('dlgL').showModal();
};
$('lsCancel').onclick = () => $('dlgL').close();
$('lsOk').onclick = (ev) => {
  ev.preventDefault();
  const o = { unit: Number(String($('lsUnit').value).replace(',', '.')), stroke: Number(String($('lsStroke').value).replace(',', '.')), color: $('lsColor').value, onlyContinuous: $('lsCont').checked };
  if (!(o.unit > 0) || !(o.stroke > 0)) { toast('La escala y el grosor deben ser positivos'); return; }
  const r = exportSVGLaser(doc, o);
  if (!r) { toast('No hay geometría para cortar' + (o.onlyContinuous ? ' (solo se exporta trazo continuo)' : '')); return; }
  opts.laser = o; persist();
  $('dlgL').close();
  saveFile('svg', '-laser', () => new Blob([r.svg], { type: 'image/svg+xml' })).then(() => toast(`SVG de ${r.width.toFixed(1)} × ${r.height.toFixed(1)} mm con ${r.count} elementos`));
};
$('trTrace').onclick = () => {
  const pts = sel.filter((x) => x.k === 'pt').map((x) => x.id);
  if (!pts.length) { toast('Selecciona uno o más puntos'); return; }
  pushUndo();
  if (pts.every((id) => doc.traces[id])) { pts.forEach((id) => delete doc.traces[id]); toast('Trazado desactivado'); }
  else { pts.forEach((id) => startTrace(doc, id)); toast('Trazado activado: mueve el mecanismo para dibujar la trayectoria'); }
  afterChange();
};
$('trClear').onclick = () => {
  const pts = sel.filter((x) => x.k === 'pt' && doc.traces[x.id]).map((x) => x.id);
  if (!pts.length) return;
  pushUndo();
  pts.forEach((id) => { doc.traces[id].pts = [{ x: doc.pts[id].x, y: doc.pts[id].y }]; });
  afterChange();
};
$('trSpline').onclick = () => {
  const pid = sel.find((x) => x.k === 'pt' && doc.traces[x.id])?.id;
  if (!pid) { toast('Selecciona un punto con trazado'); return; }
  pushUndo();
  const id = traceToSpline(doc, pid, Math.max(3, Math.round(Number($('trN').value) || 16)));
  if (!id) { rollback(); toast('Aún no hay trayectoria: mueve el mecanismo con el trazado activado'); afterChange(); return; }
  sel = [{ k: 'sp', id }];
  toast(doc.splines[id].closed ? 'Spline cerrado creado a partir del trazado' : 'Spline creado a partir del trazado');
  afterChange();
};
$('spClose').onclick = () => {
  const sps = sel.filter((x) => x.k === 'sp').map((x) => doc.splines[x.id]);
  if (!sps.length) return;
  if (sps.some((sp) => sp.pts.length < 3)) { toast('Una curva cerrada necesita al menos 3 puntos'); return; }
  pushUndo();
  const to = !sps.every((sp) => sp.closed);
  sps.forEach((sp) => { sp.closed = to; });
  afterChange();
};
$('ltEl').oninput = (e) => applyStyle('ls', Number(e.target.value));
$('txContent').onchange = (e) => applyText('text', e.target.value);
$('txAlign').onclick = () => {
  const ts = sel.filter((x) => x.k === 'tx').map((x) => doc.texts[x.id]), lns = sel.filter((x) => x.k === 'ln').map((x) => x.id);
  if (!ts.length || lns.length !== 1) { toast('Selecciona un texto y una línea'); return; }
  pushUndo(); ts.forEach((t) => { t.ref = lns[0]; t.ang = 0; });
  toast('Texto alineado con la línea'); afterChange();
};
$('txFree').onclick = () => {
  const ts = sel.filter((x) => x.k === 'tx').map((x) => doc.texts[x.id]).filter((t) => t.ref);
  if (!ts.length) return;
  pushUndo(); ts.forEach((t) => { t.ang = rawAngle(doc, t); delete t.ref; }); // conserva la orientacion actual
  afterChange();
};
$('txRead').onclick = () => {
  const ts = sel.filter((x) => x.k === 'tx').map((x) => doc.texts[x.id]);
  applyText('readable', !(ts.length ? ts[0].readable !== false : cur.tx.readable !== false));
};
$('txAngle').onchange = (e) => applyText('ang', Number(e.target.value) || 0);
$('txSize').onchange = (e) => { const v = Number(e.target.value); if (v > 0) applyText('h', v); };

function toggle(id, key) {
  const b = $(id);
  b.onclick = () => { opts[key] = !opts[key]; b.setAttribute('aria-pressed', String(opts[key])); draw(); persist(); };
  b.setAttribute('aria-pressed', String(opts[key]));
}
toggle('tGrid', 'grid'); toggle('tSnap', 'snap'); toggle('tCons', 'cons'); toggle('tTouch', 'touch');
toggle('tPts', 'pts'); toggle('tDims', 'dims'); toggle('tTexts', 'texts');
$('tLabels').onclick = () => { opts.labels = !opts.labels; applyLabels(); persist(); };
function applyLabels() {
  document.body.classList.toggle('nolabels', !opts.labels);
  $('tLabels').setAttribute('aria-pressed', String(opts.labels));
}
$('ltScale').oninput = (e) => { opts.ltScale = Number(e.target.value); draw(); syncPanel(); persist(); };

function previewNew() {
  const pat = parsePattern($('ltPat').value);
  drawSample($('ltnewprev'), pat || [], theme.fg);
  return pat;
}
$('ltPat').oninput = previewNew;
$('ltAdd').onclick = () => {
  const name = $('ltName').value.trim();
  const pat = previewNew();
  if (!name) { toast('Escribe un nombre'); return; }
  if (!pat || !pat.some((n) => n > 0 || n === 0)) { toast('Patrón no válido. Ej.: 12 -3 2 -3'); return; }
  if (!pat.some((n) => n < 0)) { toast('El patrón necesita al menos un hueco (número negativo)'); return; }
  pushUndo();
  const key = 'u_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + (++doc.n);
  doc.ltypes[key] = { label: name, pattern: pat };
  cur.ltype = key;
  $('ltName').value = ''; $('ltPat').value = '';
  fillLtypes(); applyStyle('ltype', key);
  toast(`Tipo "${name}" creado`);
};
$('ltDel').onclick = () => {
  const k = $('ltype').value;
  if (!(k in doc.ltypes)) { toast('Solo se pueden quitar tipos propios'); return; }
  pushUndo();
  for (const o of [...Object.values(doc.lines), ...Object.values(doc.circles)]) if (o.ltype === k) o.ltype = 'continua';
  delete doc.ltypes[k]; cur.ltype = 'continua';
  fillLtypes(); afterChange();
};

$('fNew').onclick = () => { if (confirm('¿Empezar un dibujo nuevo? Se pierde lo no guardado.')) { loadDoc(newDoc()); fitView(); afterChange(); } };
$('fSave').onclick = () => saveFile('json', '', () => new Blob([JSON.stringify({ app: 'ipad-cad', version: VERSION, doc }, null, 1)], { type: 'application/json' }));
$('fLoad').onclick = () => $('fileIn').click();
$('fileIn').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { const j = JSON.parse(await f.text()); loadDoc(j.doc || j); const b = cleanFileBase(f.name, 'json'); if (b) opts.fileBase = b; fitView(); afterChange(); toast('Abierto: ' + f.name); }
  catch (err) { toast('No se pudo abrir: ' + err.message); }
};
$('fPng').onclick = exportPNG;
$('fSvg').onclick = () => { const s = exportSVG(doc, opts.ltScale, { dims: opts.dims, texts: opts.texts }); if (s) saveFile('svg', '', () => new Blob([s], { type: 'image/svg+xml' })); else toast('No hay nada que exportar'); };
$('fDxf').onclick = () => { const s = exportDXF(doc, view.s, { dims: opts.dims, texts: opts.texts }); if (s) saveFile('dxf', '', () => new Blob([s], { type: 'application/dxf' })); else toast('No hay nada que exportar'); };

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input,select,textarea,dialog')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  else if (k === 'escape') { if (pending) { if (tool === 'spline' && pending.ids?.length >= 2) finishSpline(false); else cancelPending(); } else { sel = []; afterChange(); } }
  else if (k === 'delete' || k === 'backspace') $('del').click();
  else if (!e.ctrlKey && !e.metaKey) { const m = { v: 'select', p: 'point', l: 'line', c: 'circle', i: 'intersect', a: 'arc3', r: 'arcc', t: 'text', s: 'spline' }[k]; if (m) setTool(m); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(cv);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); syncPanel(); draw(); });

// ---------------------------------------------------------------- arranque
async function boot() {
  $('ver').textContent = VERSION;
  readTheme();
  buildSwatches();
  buildAnchors();
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s?.doc) { loadDoc(s.doc); if (s.view) view = s.view; if (s.cur) cur = { ...cur, ...s.cur }; if (s.opts) Object.assign(opts, s.opts); }
  } catch { /* sin estado previo */ }
  for (const [id, key] of [['tGrid', 'grid'], ['tSnap', 'snap'], ['tCons', 'cons'], ['tTouch', 'touch'], ['tPts', 'pts'], ['tDims', 'dims'], ['tTexts', 'texts']]) $(id).setAttribute('aria-pressed', String(opts[key]));
  $('ltScale').value = String(opts.ltScale);
  hydrateIcons(); wireLongPressHints(); wireSections(); applyLabels(); applyChrome(); updateEnabled();
  setTool('select');
  try { await initSolver(wasmUrl); } catch (err) { toast('No cargó el solver: ' + err.message); }
  syncPanel(); updateButtons(); resize();
  if (!Object.keys(doc.pts).length) fitView();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__cad = { hitTest, get doc() { return doc; }, get view() { return view; }, solve, setTool, toScreen, toModel, applyCon, get sel() { return sel; }, set sel(v) { sel = v; afterChange(); } };
}
boot();

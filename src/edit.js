// Recortar, extender y matriz lineal. Sin DOM (se prueba en Node). Mutan doc; quien llama hace undo/solve
// y revierte si el solver falla.
import { makeVector } from './vectors.js';
import { shownEntries, addPoint, addLine, addArc, addCircle, addEllipse, addSpline, addText, addCon, nextId, arcOf, splinePolyline, deleteItems, arcSamples, ellipsePolyline, ellipseOf, ellipseRange, ellipsePoint, ellipseParam, isPartial, cleanup } from './model.js';
import { dist, closestOnSeg, lineLine, lineCircle, circleCircle, polylineLine, polylineCircle, polylinePolyline, closestOnPolyline, inSweep, angleFrom, norm, TAU } from './geom.js';
import { splitElement } from './split.js';
import { rawAngle } from './text.js';

const TOL = 1e-3; // tolerancia en unidades del dibujo

// ---------------------------------------------------------------- intersecciones
function* others(doc, selfId) {
  for (const [id] of shownEntries(doc, 'lines')) if (id !== selfId) yield { k: 'ln', id };
  for (const [id] of shownEntries(doc, 'circles')) if (id !== selfId) yield { k: 'ci', id };
  for (const [id] of shownEntries(doc, 'arcs')) if (id !== selfId) yield { k: 'ar', id };
  for (const [id] of shownEntries(doc, 'splines')) if (id !== selfId) yield { k: 'sp', id };
  for (const [id] of shownEntries(doc, 'ellipses')) if (id !== selfId) yield { k: 'el', id };
}

// ---- elipses y splines como poligonales (lo que realmente ocupan)
const SP_PER = 24, EL_N = 360, SPL_FILL = 6; // SPL_FILL: puntos por tramo original en los trozos de un spline recortado
const polyOf = (doc, o) => (o.k === 'el' ? ellipsePolyline(doc, doc.ellipses[o.id], EL_N) : splinePolyline(doc, doc.splines[o.id], SP_PER));
const inRange = (t, t0, sweep, tol) => sweep >= TAU - 1e-9 || norm(t - t0) <= sweep + tol || norm(t - t0) >= TAU - tol;

// Cruces (exactos) de la recta infinita AB con la elipse e, dentro del tramo que ocupa.
function lineEllipse(doc, A, B, e) {
  const g = ellipseOf(doc, e), { t0, sweep } = ellipseRange(doc, e, g);
  if (!(g.rb > 1e-12)) return [];
  const loc = (P) => { const dx = P.x - g.cx, dy = P.y - g.cy; return { x: (dx * g.ux + dy * g.uy) / g.ra, y: (-dx * g.uy + dy * g.ux) / g.rb }; };
  return lineCircle(loc(A), loc(B), { x: 0, y: 0 }, 1).map((q) => Math.atan2(q.y, q.x))
    .filter((t) => inRange(t, t0, sweep, TOL / Math.max(g.ra, 1e-9))).map((t) => ellipsePoint(g, t));
}
// Cruces de la circunferencia (C, r) con la elipse e: se buscan sobre su poligonal y se afinan sobre la elipse real.
function circleEllipse(doc, C, r, e) {
  const g = ellipseOf(doc, e), { t0, sweep } = ellipseRange(doc, e, g);
  const f = (t) => { const q = ellipsePoint(g, t); return Math.hypot(q.x - C.x, q.y - C.y) - r; };
  const out = [];
  for (const p of polylineCircle(ellipsePolyline(doc, e, EL_N), C, r)) {
    let t = ellipseParam(g, p);
    for (let i = 0; i < 8; i++) { const h = 1e-6, d = (f(t + h) - f(t - h)) / (2 * h); if (Math.abs(d) < 1e-12) break; t -= f(t) / d; }
    const q = Math.abs(f(t)) < 1e-7 * Math.max(r, 1) && inRange(t, t0, sweep, TOL / Math.max(g.ra, 1e-9)) ? ellipsePoint(g, t) : p;
    if (!out.some((o) => dist(o, q) < 1e-7)) out.push(q);
  }
  return out;
}

// Cruces de la recta infinita AB con el elemento o, limitados a lo que o realmente ocupa.
export function lineHits(doc, A, B, o) {
  if (o.k === 'ln') {
    const l = doc.lines[o.id], C = doc.pts[l.a], D = doc.pts[l.b];
    const p = lineLine(A, B, C, D);
    return p && dist(p, closestOnSeg(p, C, D)) <= TOL ? [p] : [];
  }
  if (o.k === 'ci') { const c = doc.circles[o.id]; return lineCircle(A, B, doc.pts[c.c], c.r); }
  if (o.k === 'ar') {
    const a = doc.arcs[o.id], C = doc.pts[a.c], g = arcOf(doc, a);
    return lineCircle(A, B, C, a.r).filter((p) => inSweep(C, g.a0, g.sweep, p, TOL / Math.max(a.r, 1e-9)));
  }
  if (o.k === 'el') return lineEllipse(doc, A, B, doc.ellipses[o.id]);
  return polylineLine(splinePolyline(doc, doc.splines[o.id], 24), A, B);
}

// Cruces de la circunferencia (C, r) con el elemento o.
export function circleHits(doc, C, r, o) {
  if (o.k === 'ln') {
    const l = doc.lines[o.id], P = doc.pts[l.a], Q = doc.pts[l.b];
    return lineCircle(P, Q, C, r).filter((p) => dist(p, closestOnSeg(p, P, Q)) <= TOL);
  }
  if (o.k === 'ci') { const c = doc.circles[o.id]; return circleCircle(C, r, doc.pts[c.c], c.r); }
  if (o.k === 'ar') {
    const a = doc.arcs[o.id], C2 = doc.pts[a.c], g = arcOf(doc, a);
    return circleCircle(C, r, C2, a.r).filter((p) => inSweep(C2, g.a0, g.sweep, p, TOL / Math.max(a.r, 1e-9)));
  }
  if (o.k === 'el') return circleEllipse(doc, C, r, doc.ellipses[o.id]);
  return polylineCircle(splinePolyline(doc, doc.splines[o.id], 24), C, r);
}

// Puntos de corte interiores de un segmento, arco o circulo con el resto del dibujo, ordenados por parametro
// (fraccion 0..1 en el segmento, angulo desde el inicio en arcos, angulo absoluto en circulos).
export function cutsOf(doc, kind, id) {
  const raw = [];
  let scale, total, base = null;
  if (kind === 'ln') {
    const l = doc.lines[id], A = doc.pts[l.a], B = doc.pts[l.b];
    scale = dist(A, B); total = 1;
    if (scale < 1e-9) return { cuts: [], scale, total };
    for (const o of others(doc, id)) for (const p of lineHits(doc, A, B, o)) {
      const s = ((p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y)) / (scale * scale);
      if (s * scale > TOL && (1 - s) * scale > TOL) raw.push({ s, x: p.x, y: p.y, via: o });
    }
  } else {
    const o = kind === 'ar' ? doc.arcs[id] : doc.circles[id], C = doc.pts[o.c];
    scale = o.r;
    let a0 = 0;
    total = TAU;
    if (kind === 'ar') { const g = arcOf(doc, o); a0 = g.a0; total = g.sweep; }
    base = a0;
    for (const q of others(doc, id)) for (const p of circleHits(doc, C, o.r, q)) {
      const s = angleFrom(C, a0, p);
      if (kind === 'ar' && (s * scale <= TOL || (total - s) * scale <= TOL || s > total)) continue;
      raw.push({ s, x: p.x, y: p.y, via: q });
    }
  }
  raw.sort((u, v) => u.s - v.s);
  const cuts = [];
  for (const c of raw) {
    const last = cuts[cuts.length - 1];
    if (last && (c.s - last.s) * scale < TOL) last.vias.push(c.via);
    else cuts.push({ s: c.s, x: c.x, y: c.y, vias: [c.via] });
  }
  // en un circulo, un corte pegado al angulo 2pi es el mismo que el de angulo 0
  if (kind === 'ci' && cuts.length > 1 && (TAU - cuts[cuts.length - 1].s + cuts[0].s) * scale < TOL) {
    const l = cuts.pop(); cuts[0].vias.push(...l.vias);
  }
  return { cuts, scale, total, base };
}

const conFor = (v) => (v.k === 'ln' ? 'PONL' : v.k === 'sp' ? 'PONS' : v.k === 'el' ? 'PONE' : 'PONC');

// Cortes interiores de una elipse (o arco eliptico) o de un spline con el resto del dibujo, ordenados por su
// posicion s a lo largo de la curva (unidades de longitud: angulo por el semieje mayor en la elipse, longitud de
// la poligonal en el spline). tol: tolerancia de esos cortes (los de un spline salen de su poligonal).
export function curveCuts(doc, kind, id) {
  const raw = [];
  let total, closed, tol = TOL, sOf, P = null, cum = null;
  if (kind === 'el') {
    const e = doc.ellipses[id], g = ellipseOf(doc, e), { t0, sweep } = ellipseRange(doc, e, g), R = Math.max(g.ra, g.rb);
    closed = !isPartial(e); total = sweep * R;
    sOf = (p) => norm(ellipseParam(g, p) - t0) * R;
  } else {
    const sp = doc.splines[id];
    P = splinePolyline(doc, sp, SP_PER); cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + dist(P[i - 1], P[i]));
    total = cum[cum.length - 1]; closed = !!sp.closed && sp.pts.length >= 3;
    tol = Math.max(TOL, 5e-4 * total);
    sOf = (p) => { const f = closestOnPolyline(P, p); return f ? cum[f.i] + f.u * (cum[f.i + 1] - cum[f.i]) : 0; };
  }
  const self = { k: kind, id }, mine = P || polyOf(doc, self);
  for (const o of others(doc, id)) {
    let hits;
    if (o.k === 'ln') {
      const l = doc.lines[o.id], A = doc.pts[l.a], B = doc.pts[l.b];
      if (dist(A, B) < 1e-9) continue;
      hits = (kind === 'el' ? lineHits(doc, A, B, self) : polylineLine(mine, A, B)).filter((p) => dist(p, closestOnSeg(p, A, B)) <= tol);
    } else if (o.k === 'ci' || o.k === 'ar') {
      const c = o.k === 'ci' ? doc.circles[o.id] : doc.arcs[o.id], C = doc.pts[c.c];
      hits = kind === 'el' ? circleHits(doc, C, c.r, self) : polylineCircle(mine, C, c.r);
      if (o.k === 'ar') { const ga = arcOf(doc, c); hits = hits.filter((p) => inSweep(C, ga.a0, ga.sweep, p, tol / Math.max(c.r, 1e-9))); }
    } else hits = polylinePolyline(mine, polyOf(doc, o));
    for (const p of hits) {
      const sv = sOf(p);
      if (!closed && (sv <= tol || total - sv <= tol)) continue;
      raw.push({ s: sv, x: p.x, y: p.y, via: o });
    }
  }
  raw.sort((u, v) => u.s - v.s);
  const cuts = [];
  for (const c of raw) {
    const last = cuts[cuts.length - 1];
    if (last && c.s - last.s < tol) last.vias.push(c.via);
    else cuts.push({ s: c.s, x: c.x, y: c.y, vias: [c.via] });
  }
  if (closed && cuts.length > 1 && total - cuts[cuts.length - 1].s + cuts[0].s < tol) { const l = cuts.pop(); cuts[0].vias.push(...l.vias); }
  return { cuts, total, closed, tol, sOf, P, cum };
}

// Punto del dibujo en esa posicion; si no hay, crea uno automatico sobre los elementos que lo cruzan.
function pointAt(doc, c, tol = TOL) {
  for (const [pid, p] of Object.entries(doc.pts)) if (dist(p, c) <= tol) return pid;
  const pid = addPoint(doc, c.x, c.y, true);
  for (const v of c.vias) addCon(doc, { t: conFor(v), refs: [pid, v.id], hidden: true });
  return pid;
}

function lastLE(arr, v) {
  let idx = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] <= v + 1e-12) idx = i;
  return idx;
}

// ---------------------------------------------------------------- recortar
// Quita el tramo del elemento que esta bajo m (punto del modelo) entre los dos cruces mas cercanos con otros
// elementos, y nada mas: el resto del elemento no se divide en los demas cruces. Sin cruces a ningun lado
// se borra completo.
// Elipse: completa necesita 2 cruces y queda como arco eliptico; un arco eliptico se acorta o se parte en dos
// (los trozos comparten centro y ejes, asi siguen siendo la misma elipse).
function trimEllipse(doc, id, m) {
  const e = doc.ellipses[id], g = ellipseOf(doc, e), { t0 } = ellipseRange(doc, e, g), R = Math.max(g.ra, g.rb);
  const full = !isPartial(e);
  const { cuts, total } = curveCuts(doc, 'el', id);
  if (full ? cuts.length < 2 : !cuts.length) {
    deleteItems(doc, [{ k: 'el', id }]);
    return { ok: true, deleted: true, pieces: [], dropped: [] };
  }
  let s = norm(ellipseParam(g, m) - t0) * R;
  if (!full && s > total) s = s - total < TAU * R - s ? total : 0; // fuera del tramo: el extremo mas cercano
  let lo = null, hi = null;
  for (const c of cuts) { if (c.s <= s) lo = c; else if (!hi) hi = c; }
  const pieces = [id];
  if (full) {
    lo = lo || cuts[cuts.length - 1]; hi = hi || cuts[0];
    e.p1 = pointAt(doc, hi); e.p2 = pointAt(doc, lo);
  } else {
    const { c, a, b, p1, p2, ...st } = e;
    if (lo && hi) pieces.push(addEllipse(doc, c, a, b, st, pointAt(doc, hi), p2));
    if (lo) e.p2 = pointAt(doc, lo); else e.p1 = pointAt(doc, hi);
  }
  cleanup(doc);
  return { ok: true, pieces, dropped: [] };
}

// Spline: lo que queda a cada lado del tramo quitado es un spline nuevo que pasa por el punto de corte, por los
// puntos originales de ese lado y por unos puntos extra tomados de la curva original junto al corte, para que
// conserve la forma (es una aproximacion: un trozo de un spline por puntos no es exactamente otro spline por puntos).
function trimSpline(doc, id, m) {
  const sp = doc.splines[id], n = sp.pts.length;
  const { cuts, total, closed, tol, sOf, P, cum } = curveCuts(doc, 'sp', id);
  if (closed ? cuts.length < 2 : !cuts.length) {
    deleteItems(doc, [{ k: 'sp', id }]);
    return { ok: true, deleted: true, pieces: [], dropped: [] };
  }
  const s = sOf(m);
  let lo = null, hi = null;
  for (const c of cuts) { if (c.s <= s) lo = c; else if (!hi) hi = c; }
  if (closed) { lo = lo || cuts[cuts.length - 1]; hi = hi || cuts[0]; }
  // posicion de cada punto de dato a lo largo de la curva
  const regular = P.length === (closed ? n : n - 1) * SP_PER + 1;
  const sd = sp.pts.map((pid, j) => (regular ? cum[j * SP_PER] : sOf(doc.pts[pid])));
  const at = (sv) => {
    sv = ((sv % total) + total) % total;
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < sv) i++;
    const L = cum[i + 1] - cum[i], u = L > 0 ? (sv - cum[i]) / L : 0;
    return { x: P[i].x + u * (P[i + 1].x - P[i].x), y: P[i].y + u * (P[i + 1].y - P[i].y) };
  };
  const { pts: _p, closed: _c, ts: _t, ...st } = sp;
  const step = total / ((closed ? n : n - 1) * SPL_FILL); // separacion de los puntos de cada trozo
  const piece = (s0, id0, s1, id1) => {
    const mid = [];
    sp.pts.forEach((pid, j) => { for (const w of closed ? [0, total] : [0]) { const sv = sd[j] + w; if (sv > s0 + tol && sv < s1 - tol) mid.push({ s: sv, id: pid }); } });
    mid.sort((u, v) => u.s - v.s);
    const chain = [{ s: s0, id: id0 }, ...mid, { s: s1, id: id1 }], out = [];
    for (let i = 0; i < chain.length - 1; i++) {
      out.push(chain[i].id);
      // puntos extra tomados de la curva original, a paso parejo, para que el trozo conserve la forma
      const k = Math.max(0, Math.ceil((chain[i + 1].s - chain[i].s) / step - 0.25) - 1);
      const fr = Array.from({ length: k }, (_, j) => (j + 1) / (k + 1));
      for (const f of fr) {
        const q = at(chain[i].s + f * (chain[i + 1].s - chain[i].s)), nid = addPoint(doc, q.x, q.y, true);
        doc.pts[nid].splOnly = true;
        out.push(nid);
      }
    }
    out.push(id1);
    const ids = out.filter((x, i) => i === 0 || x !== out[i - 1]);
    return ids.length >= 2 && new Set(ids).size === ids.length ? addSpline(doc, ids, st, false) : null;
  };
  const pieces = [];
  if (closed) pieces.push(piece(hi.s, pointAt(doc, hi, tol), lo.s > hi.s ? lo.s : lo.s + total, pointAt(doc, lo, tol)));
  else {
    if (lo) pieces.push(piece(0, sp.pts[0], lo.s, pointAt(doc, lo, tol)));
    if (hi) pieces.push(piece(hi.s, pointAt(doc, hi, tol), total, sp.pts[n - 1]));
  }
  const made = pieces.filter(Boolean);
  if (!made.length) return { ok: false, msg: 'No se pudo recortar el spline en ese tramo' };
  // las relaciones del spline pasan al trozo donde quedo su punto; las del tramo quitado se pierden
  const dropped = [], polys = made.map((pc) => splinePolyline(doc, doc.splines[pc], SP_PER));
  for (const [kid, k] of Object.entries(doc.cons)) {
    if (!(k.refs || []).includes(id)) continue;
    delete doc.cons[kid];
    if (!['PONS', 'TANLS', 'TANCS'].includes(k.t) || k.refs[1] !== id) { dropped.push(k.t); continue; }
    const pid = k.t === 'PONS' ? k.refs[0] : k.refs[2], q = doc.pts[pid];
    if (k.t === 'PONS' && made.some((pc) => doc.splines[pc].pts.includes(pid))) continue; // ya es un punto del trozo
    let best = -1, bd = Infinity;
    polys.forEach((Q, i) => { const f = closestOnPolyline(Q, q); if (f && f.d < bd) { bd = f.d; best = i; } });
    if (best < 0 || bd > 4 * tol) { if (!k.hidden) dropped.push(k.t); continue; }
    const { u: _u, ...rest } = k;
    addCon(doc, { ...rest, refs: k.refs.map((r) => (r === id ? made[best] : r)) });
  }
  for (const h of Object.values(doc.hatches || {})) if (h.ids.includes(id)) h.ids = h.ids.flatMap((i) => (i === id ? made : [i]));
  delete doc.splines[id];
  cleanup(doc);
  return { ok: true, pieces: made, dropped };
}

export function trimAt(doc, kind, id, m) {
  if (kind === 'el') return trimEllipse(doc, id, m);
  if (kind === 'sp') return trimSpline(doc, id, m);
  if (!['ln', 'ar', 'ci'].includes(kind)) return { ok: false, msg: 'Solo se recortan segmentos, arcos, círculos, elipses y splines' };
  const { cuts, total, base } = cutsOf(doc, kind, id);
  let s;
  if (kind === 'ln') { const l = doc.lines[id]; s = closestOnSeg(m, doc.pts[l.a], doc.pts[l.b]).t; }
  else { const o = kind === 'ar' ? doc.arcs[id] : doc.circles[id]; s = angleFrom(doc.pts[o.c], base, m); }
  if (kind === 'ci' ? cuts.length < 2 : !cuts.length) {
    deleteItems(doc, [{ k: kind, id }]);
    return { ok: true, deleted: true, pieces: [], dropped: [] };
  }
  // los cruces que acotan el tramo bajo el cursor (en un circulo, cíclicos)
  let lo = null, hi = null;
  for (const c of cuts) { if (c.s <= s) lo = c; else if (!hi) hi = c; }
  if (kind === 'ci') { lo = lo || cuts[cuts.length - 1]; hi = hi || cuts[0]; }
  const sub = (kind === 'ci' ? [lo, hi].sort((u, v) => u.s - v.s) : [lo, hi].filter(Boolean));
  const ptIds = sub.map((c) => pointAt(doc, c));
  const res = splitElement(doc, id, ptIds);
  if (!res.ok) return res;
  let idx;
  if (kind === 'ci') { const rel = sub.map((c) => norm(c.s - sub[0].s)); idx = lastLE(rel, norm(s - sub[0].s)); }
  else idx = lastLE([0, ...sub.map((c) => c.s), total], s);
  idx = Math.min(idx, res.pieces.length - 1);
  const gone = res.pieces[idx];
  deleteItems(doc, [{ k: kind === 'ln' ? 'ln' : 'ar', id: gone }]);
  return { ok: true, pieces: res.pieces.filter((p) => p !== gone), dropped: res.dropped };
}

// ---------------------------------------------------------------- extender
function pointUsedElsewhere(doc, pid, selfId) {
  for (const [id, l] of Object.entries(doc.lines)) if (id !== selfId && (l.a === pid || l.b === pid)) return true;
  for (const c of Object.values(doc.circles)) if (c.c === pid) return true;
  for (const [id, a] of Object.entries(doc.arcs)) if (id !== selfId && (a.c === pid || a.a === pid || a.b === pid)) return true;
  for (const sp of Object.values(doc.splines || {})) if (sp.pts.includes(pid)) return true;
  for (const e of Object.values(doc.ellipses || {})) if ([e.c, e.a, e.b, e.p1, e.p2].includes(pid)) return true;
  for (const t of Object.values(doc.texts || {})) if (t.pt === pid) return true;
  return false;
}
const pointConstrained = (doc, pid) => Object.values(doc.cons).some((k) => (k.refs || []).includes(pid));

// Lleva el extremo 'field' del elemento hasta el punto t. Si el extremo es de uso exclusivo de este elemento
// se mueve; si lo comparten otros (o tiene restricciones), se crea un punto nuevo y el elemento pasa a usarlo.
function relocateEnd(doc, elId, owner, field, t) {
  const old = owner[field];
  for (const [pid, p] of Object.entries(doc.pts)) {
    if (pid !== old && dist(p, t) <= TOL) {
      owner[field] = pid; // ya hay un punto ahi: el extremo pasa a ser ese
      if (!pointUsedElsewhere(doc, old, elId) && !pointConstrained(doc, old) && !doc.pts[old].fixed) delete doc.pts[old];
      return pid;
    }
  }
  // Un extremo que solo esta "sobre" otros elementos por restricciones ocultas (las que deja una extension
  // anterior) se desplaza de verdad: se sueltan esas restricciones y el extremo va al nuevo cruce, sin dejar
  // puntos atras.
  const autoOn = (k) => (k.refs || []).includes(old) && k.hidden && ['PONL', 'PONC', 'PONS', 'PONE'].includes(k.t) && k.refs[0] === old;
  const onlyAuto = Object.values(doc.cons).every((k) => !(k.refs || []).includes(old) || autoOn(k));
  const free = !pointUsedElsewhere(doc, old, elId) && onlyAuto && !doc.pts[old].fixed;
  let pid = old;
  if (free) {
    for (const [kid, k] of Object.entries(doc.cons)) if (autoOn(k)) delete doc.cons[kid];
    doc.pts[old].x = t.x; doc.pts[old].y = t.y;
  }
  else { pid = addPoint(doc, t.x, t.y, true); owner[field] = pid; }
  for (const v of t.vias) addCon(doc, { t: conFor(v), refs: [pid, v.id], hidden: true });
  return pid;
}

// Alarga el extremo (el mas cercano a near) de un segmento o arco hasta el primer elemento que encuentre.
// dropLength: tambien quita las restricciones que fijan la longitud del segmento.
export function extendEnd(doc, kind, id, near, { dropLength = false } = {}) {
  if (kind !== 'ln' && kind !== 'ar') return { ok: false, msg: kind === 'ci' ? 'Un círculo no se extiende' : 'Solo se extienden segmentos y arcos' };
  let best = null, owner, field;
  if (kind === 'ln') {
    owner = doc.lines[id];
    const A = doc.pts[owner.a], B = doc.pts[owner.b], len = dist(A, B);
    if (len < 1e-9) return { ok: false, msg: 'Segmento sin longitud' };
    field = dist(near, A) <= dist(near, B) ? 'a' : 'b';
    const P = field === 'a' ? A : B, Q = field === 'a' ? B : A;
    const dir = { x: (P.x - Q.x) / len, y: (P.y - Q.y) / len };
    for (const o of others(doc, id)) for (const p of lineHits(doc, A, B, o)) {
      const u = (p.x - P.x) * dir.x + (p.y - P.y) * dir.y;
      if (u > TOL && (!best || u < best.u)) best = { u, x: p.x, y: p.y, vias: [o] };
    }
  } else {
    owner = doc.arcs[id];
    const C = doc.pts[owner.c], A = doc.pts[owner.a], B = doc.pts[owner.b], g = arcOf(doc, owner);
    if (g.sweep >= TAU - 1e-7) return { ok: false, msg: 'El arco ya es una circunferencia completa' };
    field = dist(near, A) <= dist(near, B) ? 'a' : 'b';
    const aA = Math.atan2(A.y - C.y, A.x - C.x), aB = Math.atan2(B.y - C.y, B.x - C.x);
    const gap = TAU - g.sweep;
    for (const o of others(doc, id)) for (const p of circleHits(doc, C, owner.r, o)) {
      const ang = Math.atan2(p.y - C.y, p.x - C.x);
      const delta = field === 'b' ? norm(ang - aB) : norm(aA - ang); // hacia donde crece el arco
      if (delta * owner.r > TOL && (gap - delta) * owner.r > TOL && (!best || delta < best.u)) best = { u: delta, x: p.x, y: p.y, vias: [o] };
    }
  }
  if (!best) return { ok: false, msg: 'No hay ningún elemento más allá de ese extremo' };
  if (dropLength) {
    for (const [kid, k] of Object.entries(doc.cons)) {
      if ((k.t === 'DIST' && k.refs.length === 1 && k.refs[0] === id) || (k.t === 'EQL' && k.refs.includes(id))) delete doc.cons[kid];
    }
  }
  relocateEnd(doc, id, owner, field, best);
  return { ok: true, field };
}

// ---------------------------------------------------------------- copias (matriz lineal y espejo)
// Reune lo que se copia: puntos, elementos y las restricciones/rellenos que quedan completos dentro del conjunto.
function collect(doc, items) {
  const P = new Set(), L = [], Ci = [], Ar = [], Sp = [], Tx = [], El = [];
  for (const { k, id } of items) {
    if (k === 'pt' && doc.pts[id]) P.add(id);
    else if (k === 'ln' && doc.lines[id]) { L.push(id); P.add(doc.lines[id].a); P.add(doc.lines[id].b); }
    else if (k === 'ci' && doc.circles[id]) { Ci.push(id); P.add(doc.circles[id].c); }
    else if (k === 'ar' && doc.arcs[id]) { const a = doc.arcs[id]; Ar.push(id); P.add(a.c); P.add(a.a); P.add(a.b); }
    else if (k === 'sp' && doc.splines[id]) { Sp.push(id); for (const p of doc.splines[id].pts) P.add(p); }
    else if (k === 'tx' && doc.texts[id]) { Tx.push(id); P.add(doc.texts[id].pt); }
    else if (k === 'el' && doc.ellipses?.[id]) { const e = doc.ellipses[id]; El.push(id); P.add(e.c); P.add(e.a); P.add(e.b); if (isPartial(e)) { P.add(e.p1); P.add(e.p2); } }
  }
  const inSet = new Set([...P, ...L, ...Ci, ...Ar, ...Sp, ...Tx, ...El]);
  const cons = Object.values(doc.cons).filter((k) => (k.refs || []).length && k.refs.every((r) => inSet.has(r)));
  const hatches = Object.values(doc.hatches || {}).filter((h) => h.ids.length && h.ids.every((i) => inSet.has(i)));
  return { P, L, Ci, Ar, Sp, Tx, El, cons, hatches };
}

const jclone = (o) => JSON.parse(JSON.stringify(o));

// Crea una copia. tf(p) da la posicion del punto copiado; reuse(pid) (opcional) devuelve true si el punto
// no se duplica (se comparte). mirror: la copia es un reflejo (los arcos intercambian extremos para seguir
// siendo antihorarios, las cotas angulares cambian de signo y los textos reflejan su angulo con axisAng).
// hvAngle: grados a los que va a parar una direccion horizontal (rotacion o reflejo); las restricciones H/V
// solo siguen valiendo si ese angulo es multiplo de 90 (con 90 se intercambian); si no, no se copian.
// rotDeg: giro que se suma al angulo de los textos (en el reflejo se usa axisAng).
function makeCopy(doc, col, tf, { mirror = false, reuse = null, axisAng = 0, hvAngle, rotDeg = 0, linked = false, src = null } = {}) {
  const { P, L, Ci, Ar, Sp, Tx, El, cons, hatches } = col;
  const S = src || doc; // de donde se leen los originales (al pegar, un documento guardado al copiar)
  const M = {}, made = [], vecLines = [];
  // las partes de un vector (punto medio, texto y cota de magnitud) no se copian: la copia del vector las crea nuevas
  const vecMids = new Set(Object.values(S.lines).filter((l) => l.vec).map((l) => l.vec.m));
  for (const pid of P) {
    if (vecMids.has(pid)) continue;
    if (reuse && reuse(pid)) { M[pid] = pid; continue; }
    const o = S.pts[pid], q = tf(o), np = addPoint(doc, q.x, q.y, !!o.auto);
    const { x, y, mark, ...flags } = o; // la marca de referencia se reasigna a la copia de su linea mas abajo
    Object.assign(doc.pts[np], flags);
    if (linked) doc.pts[np].fixed = false; // la copia sigue al original
    M[pid] = np;
  }
  for (const id of L) { const { a, b, vec, ...st } = S.lines[id]; M[id] = addLine(doc, M[a], M[b], st); made.push({ k: 'ln', id: M[id] }); if (vec) vecLines.push([M[id], vec, S.texts?.[vec.t]]); }
  for (const pid of P) { const mk = S.pts[pid].mark; if (mk && M[mk] && M[pid] && M[pid] !== pid && doc.pts[M[pid]]) doc.pts[M[pid]].mark = M[mk]; }
  for (const id of Ci) { const { c, r, ...st } = S.circles[id]; M[id] = addCircle(doc, M[c], r, st); made.push({ k: 'ci', id: M[id] }); }
  for (const id of Ar) {
    const { c, a, b, r, ...st } = S.arcs[id];
    M[id] = mirror ? addArc(doc, M[c], M[b], M[a], r, st) : addArc(doc, M[c], M[a], M[b], r, st);
    made.push({ k: 'ar', id: M[id] });
  }
  for (const id of El) { // un arco eliptico reflejado intercambia sus extremos para seguir siendo antihorario
    const { c, a, b, p1, p2, ...st } = S.ellipses[id];
    M[id] = addEllipse(doc, M[c], M[a], M[b], st, p1 && M[mirror ? p2 : p1], p2 && M[mirror ? p1 : p2]); made.push({ k: 'el', id: M[id] });
  }
  for (const id of Sp) { const { pts, closed, ...st } = S.splines[id]; M[id] = addSpline(doc, pts.map((p) => M[p]), st, closed); made.push({ k: 'sp', id: M[id] }); }
  for (const id of Tx) {
    const t = S.texts[id];
    if (t.vecOf) continue;
    const ang0 = t.ref && !M[t.ref] ? rawAngle(S, t) : t.ang; // alineado con una linea que no viene en la copia: conserva su orientacion
    M[id] = addText(doc, M[t.pt], t.text, { h: t.h, ang: mirror ? 2 * axisAng - ang0 : ang0 + rotDeg, anchor: t.anchor, color: t.color, readable: t.readable, font: t.font, layer: t.layer });
    if (t.ref && M[t.ref]) doc.texts[M[id]].ref = M[t.ref];
    made.push({ k: 'tx', id: M[id] });
  }
  for (const k of linked ? [] : cons.filter((k) => !k.vec && !k.refs.some((r) => vecMids.has(r)))) { // vinculadas: las restricciones internas las hereda la copia por estar atada al original
    const n = { ...jclone(k), refs: k.refs.map((r) => M[r]) };
    if (hvAngle !== undefined && (n.t === 'H' || n.t === 'V')) {
      const m = ((hvAngle % 180) + 180) % 180;
      if (Math.abs(m - 90) < 1e-6) n.t = n.t === 'H' ? 'V' : 'H';
      else if (m > 1e-6 && 180 - m > 1e-6) continue;
    }
    if (mirror && (n.t === 'ANG' || n.t === 'ANG4') && typeof n.v === 'number') { n.v = -n.v; if (n.sg) n.sg = -n.sg; }
    addCon(doc, n);
  }
  for (const h of hatches) doc.hatches[nextId(doc, 'h')] = { ...jclone(h), ids: h.ids.map((x) => M[x]) };
  for (const [lid, v, tx] of vecLines) makeVector(doc, lid, { rev: v.rev, h: tx?.h }); // cada copia es un vector con su propia magnitud
  return { made, M };
}

// ---------------------------------------------------------------- vinculos entre original y copia
// Cada punto de la copia queda atado a su original con restricciones, de modo que la copia es una
// transformacion rigida del original y lo sigue si este cambia:
//  - lineal: distancia entre el punto y su copia + direccion (acimut, o angulo respecto de la linea elegida);
//  - circular: igual distancia al centro + angulo en el centro;
//  - espejo: simetria respecto de la linea eje.
// Los circulos ademas llevan igual radio. dims: la distancia (lineal) o el angulo (circular) del primer
// punto quedan como cota visible; las demas restricciones son automaticas (ocultas).
const normDeg = (a) => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };
function equalRadius(doc, col, M) {
  for (const id of col.Ci) addCon(doc, { t: 'EQR', refs: [id, M[id]], hidden: true });
}
const pairsOf = (col, M) => [...col.P].filter((p) => M[p] !== p).map((p) => [p, M[p]]);

function linkLinear(doc, col, M, { dx, dy, line, dims }) {
  const d = Math.hypot(dx, dy), az = (Math.atan2(dy, dx) * 180) / Math.PI;
  let rel = null;
  if (line && doc.lines[line]) { const l = doc.lines[line], A = doc.pts[l.a], B = doc.pts[l.b]; rel = normDeg((Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI - az); }
  pairsOf(col, M).forEach(([p, q], i) => {
    addCon(doc, { t: 'DIST', refs: [p, q], v: d, ...(dims && i === 0 ? {} : { hidden: true }) });
    if (rel !== null) addCon(doc, { t: 'ANG4', refs: [p, q, doc.lines[line].a, doc.lines[line].b], v: rel, hidden: true });
    else addCon(doc, { t: 'AZ', refs: [p, q], v: az, hidden: true });
  });
  equalRadius(doc, col, M);
}
function linkCircular(doc, col, M, { c, deg, dims }) {
  pairsOf(col, M).forEach(([p, q], i) => {
    addCon(doc, { t: 'EQD', refs: [c, p, c, q], hidden: true });
    addCon(doc, { t: 'ANG4', refs: [c, p, c, q], v: normDeg(deg), ...(dims && i === 0 ? {} : { hidden: true }) });
  });
  equalRadius(doc, col, M);
}
function linkMirror(doc, col, M, axis) {
  for (const [p, q] of pairsOf(col, M)) addCon(doc, { t: 'SYM', refs: [p, q, axis], hidden: true });
  equalRadius(doc, col, M);
}

// ---------------------------------------------------------------- matriz lineal
// items: [{k,id}] a copiar. dirs: [{u:{x,y} unitario, s: espaciado, n: copias nuevas}] (1 o 2 direcciones).
// Con dos direcciones se crea la cuadricula completa. Devuelve los elementos nuevos.
// opts: { link: copias atadas al original, dims: mostrar la cota de distancia (solo con link) }
export function linearArray(doc, items, dirs, { link = false, dims = false } = {}) {
  const col = collect(doc, items);
  if (!col.P.size) return { ok: false, msg: 'No hay nada que copiar' };
  const [d1, d2] = dirs;
  const n1 = d1.n, n2 = d2 ? d2.n : 0;
  if ((n1 + 1) * (n2 + 1) - 1 > 400) return { ok: false, msg: 'Demasiadas copias (máximo 400)' };
  const made = [];
  for (let i = 0; i <= n1; i++) {
    for (let j = 0; j <= n2; j++) {
      if (!i && !j) continue;
      const dx = i * d1.s * d1.u.x + (d2 ? j * d2.s * d2.u.x : 0), dy = i * d1.s * d1.u.y + (d2 ? j * d2.s * d2.u.y : 0);
      const r = makeCopy(doc, col, (o) => ({ x: o.x + dx, y: o.y + dy }), { linked: link });
      made.push(...r.made);
      if (link) linkLinear(doc, col, r.M, { dx, dy, line: d1.line || null, dims });
    }
  }
  return { ok: true, made };
}

// ---------------------------------------------------------------- copia espejo
// Refleja una copia de items respecto de la recta que pasa por A y B. Los puntos que ya estan sobre el eje
// se comparten (la copia queda unida al original por ahi). El eje no se copia.
// opts: { axis: id de la linea eje, para vincular las copias con simetria }
export function mirrorCopy(doc, items, A, B, { axis = null } = {}) {
  const len = dist(A, B);
  if (len < 1e-9) return { ok: false, msg: 'El eje no tiene longitud' };
  const u = { x: (B.x - A.x) / len, y: (B.y - A.y) / len };
  const col = collect(doc, items);
  if (!col.P.size) return { ok: false, msg: 'No hay nada que reflejar' };
  const refl = (o) => {
    const t = (o.x - A.x) * u.x + (o.y - A.y) * u.y;
    const fx = A.x + t * u.x, fy = A.y + t * u.y;
    return { x: 2 * fx - o.x, y: 2 * fy - o.y };
  };
  const onAxis = (pid) => { const o = doc.pts[pid], r = refl(o); return Math.hypot(r.x - o.x, r.y - o.y) / 2 <= TOL; };
  const r = makeCopy(doc, col, refl, { mirror: true, reuse: onAxis, axisAng: (Math.atan2(u.y, u.x) * 180) / Math.PI, hvAngle: (2 * Math.atan2(u.y, u.x) * 180) / Math.PI, linked: !!axis });
  if (axis) linkMirror(doc, col, r.M, axis);
  return { ok: true, made: r.made };
}

// ---------------------------------------------------------------- matriz circular
// c: centro {x,y}; step: angulo entre instancias (rad, con signo); n: instancias totales (incluye el original);
// skip: Set de numeros de instancia (2..n) que no se crean. Los puntos que coinciden con el centro se comparten.
// link: copias atadas al original; cid: punto del centro (si no hay, con link se crea uno fijo); dims: cota angular visible
export function circularArray(doc, items, { c, step, n, skip = new Set(), link = false, cid = null, dims = false }) {
  const col = collect(doc, items);
  if (!col.P.size) return { ok: false, msg: 'No hay nada que copiar' };
  if (!(n >= 2) || n > 400) return { ok: false, msg: 'Número de instancias no válido' };
  const made = [];
  if (link && !cid) { // el centro tiene que ser un punto del dibujo para poder acotarlo
    for (const [pid, p] of Object.entries(doc.pts)) if (dist(p, c) <= TOL) { cid = pid; break; }
    if (!cid) { cid = addPoint(doc, c.x, c.y, false); doc.pts[cid].fixed = true; }
  }
  for (let i = 1; i < n; i++) {
    if (skip.has(i + 1)) continue;
    const a = i * step, ca = Math.cos(a), sa = Math.sin(a);
    const rot = (o) => ({ x: c.x + (o.x - c.x) * ca - (o.y - c.y) * sa, y: c.y + (o.x - c.x) * sa + (o.y - c.y) * ca });
    const deg = (a * 180) / Math.PI;
    const r = makeCopy(doc, col, rot, { reuse: (pid) => dist(doc.pts[pid], c) <= TOL, hvAngle: deg, rotDeg: deg, linked: link });
    made.push(...r.made);
    if (link) linkCircular(doc, col, r.M, { c: cid, deg, dims });
  }
  if (!made.length) return { ok: false, msg: 'Todas las instancias están omitidas' };
  return { ok: true, made };
}

// ---------------------------------------------------------------- copiar y pegar
const COPYABLE = ['pt', 'ln', 'ci', 'ar', 'sp', 'tx', 'el'];
// Cuadro que encierra los elementos (geometria real: circulos, arcos, splines y elipses incluidos).
export function bboxOf(doc, items) {
  const col = collect(doc, items.filter((i) => COPYABLE.includes(i.k)));
  const xs = [], ys = [], add = (x, y) => { xs.push(x); ys.push(y); };
  for (const id of col.P) add(doc.pts[id].x, doc.pts[id].y);
  for (const id of col.Ci) { const c = doc.circles[id], p = doc.pts[c.c]; add(p.x - c.r, p.y - c.r); add(p.x + c.r, p.y + c.r); }
  for (const id of col.Ar) for (const q of arcSamples(doc, doc.arcs[id])) add(q.x, q.y);
  for (const id of col.Sp) for (const q of splinePolyline(doc, doc.splines[id], 12)) add(q.x, q.y);
  for (const id of col.El) for (const q of ellipsePolyline(doc, doc.ellipses[id], 48)) add(q.x, q.y);
  if (!xs.length) return null;
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// Guarda lo seleccionado: una copia del documento (para que el original pueda cambiar o borrarse) y los elementos.
export function clipOf(doc, items) {
  const its = items.filter((i) => COPYABLE.includes(i.k));
  const bbox = its.length ? bboxOf(doc, its) : null;
  if (!bbox) return null;
  return { src: JSON.parse(JSON.stringify(doc)), items: its.map((i) => ({ k: i.k, id: i.id })), bbox };
}

// Pega lo copiado de modo que el centro de su cuadro quede en target. Las restricciones y los rellenos que
// quedaban completos dentro de lo copiado se copian tambien.
export function pasteClip(doc, clip, target) {
  if (!clip) return { ok: false, msg: 'No hay nada copiado' };
  const col = collect(clip.src, clip.items);
  if (!col.P.size) return { ok: false, msg: 'No hay nada copiado' };
  const dx = target.x - (clip.bbox.x0 + clip.bbox.x1) / 2, dy = target.y - (clip.bbox.y0 + clip.bbox.y1) / 2;
  const r = makeCopy(doc, col, (o) => ({ x: o.x + dx, y: o.y + dy }), { src: clip.src });
  return { ok: true, made: r.made };
}

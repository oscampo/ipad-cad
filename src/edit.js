// Recortar, extender y matriz lineal. Sin DOM (se prueba en Node). Mutan doc; quien llama hace undo/solve
// y revierte si el solver falla.
import { addPoint, addLine, addArc, addCircle, addSpline, addText, addCon, nextId, arcOf, splinePolyline, deleteItems } from './model.js';
import { dist, closestOnSeg, lineLine, lineCircle, circleCircle, polylineLine, polylineCircle, inSweep, angleFrom, norm, TAU } from './geom.js';
import { splitElement } from './split.js';

const TOL = 1e-3; // tolerancia en unidades del dibujo

// ---------------------------------------------------------------- intersecciones
function* others(doc, selfId) {
  for (const id of Object.keys(doc.lines)) if (id !== selfId) yield { k: 'ln', id };
  for (const id of Object.keys(doc.circles)) if (id !== selfId) yield { k: 'ci', id };
  for (const id of Object.keys(doc.arcs)) if (id !== selfId) yield { k: 'ar', id };
  for (const id of Object.keys(doc.splines || {})) if (id !== selfId) yield { k: 'sp', id };
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

const conFor = (v) => (v.k === 'ln' ? 'PONL' : v.k === 'sp' ? 'PONS' : 'PONC');

// Punto del dibujo en esa posicion; si no hay, crea uno automatico sobre los elementos que lo cruzan.
function pointAt(doc, c) {
  for (const [pid, p] of Object.entries(doc.pts)) if (dist(p, c) <= TOL) return pid;
  const pid = addPoint(doc, c.x, c.y, true);
  for (const v of c.vias) addCon(doc, { t: conFor(v), refs: [pid, v.id] });
  return pid;
}

function lastLE(arr, v) {
  let idx = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] <= v + 1e-12) idx = i;
  return idx;
}

// ---------------------------------------------------------------- recortar
// Quita el tramo del elemento que esta bajo m (punto del modelo) entre los cruces mas cercanos con otros
// elementos. Sin cruces a ningun lado se borra completo.
export function trimAt(doc, kind, id, m) {
  if (!['ln', 'ar', 'ci'].includes(kind)) return { ok: false, msg: 'Solo se recortan segmentos, arcos y círculos' };
  const { cuts, total, base } = cutsOf(doc, kind, id);
  let s;
  if (kind === 'ln') { const l = doc.lines[id]; s = closestOnSeg(m, doc.pts[l.a], doc.pts[l.b]).t; }
  else { const o = kind === 'ar' ? doc.arcs[id] : doc.circles[id]; s = angleFrom(doc.pts[o.c], base, m); }
  if (kind === 'ci' ? cuts.length < 2 : !cuts.length) {
    deleteItems(doc, [{ k: kind, id }]);
    return { ok: true, deleted: true, pieces: [], dropped: [] };
  }
  const ptIds = cuts.map((c) => pointAt(doc, c));
  const res = splitElement(doc, id, ptIds);
  if (!res.ok) return res;
  let idx;
  if (kind === 'ci') { const rel = cuts.map((c) => norm(c.s - cuts[0].s)); idx = lastLE(rel, norm(s - cuts[0].s)); }
  else idx = lastLE([0, ...cuts.map((c) => c.s), total], s);
  idx = Math.min(idx, res.pieces.length - 1);
  const gone = res.pieces[idx];
  const n = res.pieces.length;
  const before = res.pieces[kind === 'ci' ? (idx + n - 1) % n : idx - 1], after = res.pieces[kind === 'ci' ? (idx + 1) % n : idx + 1];
  deleteItems(doc, [{ k: kind === 'ln' ? 'ln' : 'ar', id: gone }]);
  // al quitar un trozo del medio, los arcos que quedan siguen con igual radio
  if (kind !== 'ln' && before && after && before !== after && before !== gone && after !== gone) addCon(doc, { t: 'EQR', refs: [before, after], hidden: true });
  return { ok: true, pieces: res.pieces.filter((p) => p !== gone), dropped: res.dropped };
}

// ---------------------------------------------------------------- extender
function pointUsedElsewhere(doc, pid, selfId) {
  for (const [id, l] of Object.entries(doc.lines)) if (id !== selfId && (l.a === pid || l.b === pid)) return true;
  for (const c of Object.values(doc.circles)) if (c.c === pid) return true;
  for (const [id, a] of Object.entries(doc.arcs)) if (id !== selfId && (a.c === pid || a.a === pid || a.b === pid)) return true;
  for (const sp of Object.values(doc.splines || {})) if (sp.pts.includes(pid)) return true;
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
  const free = !pointUsedElsewhere(doc, old, elId) && !pointConstrained(doc, old) && !doc.pts[old].fixed;
  let pid = old;
  if (free) { doc.pts[old].x = t.x; doc.pts[old].y = t.y; }
  else { pid = addPoint(doc, t.x, t.y, true); owner[field] = pid; }
  for (const v of t.vias) addCon(doc, { t: conFor(v), refs: [pid, v.id] });
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
  const P = new Set(), L = [], Ci = [], Ar = [], Sp = [], Tx = [];
  for (const { k, id } of items) {
    if (k === 'pt' && doc.pts[id]) P.add(id);
    else if (k === 'ln' && doc.lines[id]) { L.push(id); P.add(doc.lines[id].a); P.add(doc.lines[id].b); }
    else if (k === 'ci' && doc.circles[id]) { Ci.push(id); P.add(doc.circles[id].c); }
    else if (k === 'ar' && doc.arcs[id]) { const a = doc.arcs[id]; Ar.push(id); P.add(a.c); P.add(a.a); P.add(a.b); }
    else if (k === 'sp' && doc.splines[id]) { Sp.push(id); for (const p of doc.splines[id].pts) P.add(p); }
    else if (k === 'tx' && doc.texts[id]) { Tx.push(id); P.add(doc.texts[id].pt); }
  }
  const inSet = new Set([...P, ...L, ...Ci, ...Ar, ...Sp, ...Tx]);
  const cons = Object.values(doc.cons).filter((k) => (k.refs || []).length && k.refs.every((r) => inSet.has(r)));
  const hatches = Object.values(doc.hatches || {}).filter((h) => h.ids.length && h.ids.every((i) => inSet.has(i)));
  return { P, L, Ci, Ar, Sp, Tx, cons, hatches };
}

const jclone = (o) => JSON.parse(JSON.stringify(o));

// Crea una copia. tf(p) da la posicion del punto copiado; reuse(pid) (opcional) devuelve true si el punto
// no se duplica (se comparte). mirror: la copia es un reflejo (los arcos intercambian extremos para seguir
// siendo antihorarios, las cotas angulares cambian de signo y los textos reflejan su angulo con axisAng).
// hvAngle: grados a los que va a parar una direccion horizontal (rotacion o reflejo); las restricciones H/V
// solo siguen valiendo si ese angulo es multiplo de 90 (con 90 se intercambian); si no, no se copian.
// rotDeg: giro que se suma al angulo de los textos (en el reflejo se usa axisAng).
function makeCopy(doc, col, tf, { mirror = false, reuse = null, axisAng = 0, hvAngle, rotDeg = 0 } = {}) {
  const { P, L, Ci, Ar, Sp, Tx, cons, hatches } = col;
  const M = {}, made = [];
  for (const pid of P) {
    if (reuse && reuse(pid)) { M[pid] = pid; continue; }
    const o = doc.pts[pid], q = tf(o), np = addPoint(doc, q.x, q.y, !!o.auto);
    const { x, y, ...flags } = o;
    Object.assign(doc.pts[np], flags);
    M[pid] = np;
  }
  for (const id of L) { const { a, b, ...st } = doc.lines[id]; M[id] = addLine(doc, M[a], M[b], st); made.push({ k: 'ln', id: M[id] }); }
  for (const id of Ci) { const { c, r, ...st } = doc.circles[id]; M[id] = addCircle(doc, M[c], r, st); made.push({ k: 'ci', id: M[id] }); }
  for (const id of Ar) {
    const { c, a, b, r, ...st } = doc.arcs[id];
    M[id] = mirror ? addArc(doc, M[c], M[b], M[a], r, st) : addArc(doc, M[c], M[a], M[b], r, st);
    made.push({ k: 'ar', id: M[id] });
  }
  for (const id of Sp) { const { pts, closed, ...st } = doc.splines[id]; M[id] = addSpline(doc, pts.map((p) => M[p]), st, closed); made.push({ k: 'sp', id: M[id] }); }
  for (const id of Tx) {
    const t = doc.texts[id];
    M[id] = addText(doc, M[t.pt], t.text, { h: t.h, ang: mirror ? 2 * axisAng - t.ang : t.ang + rotDeg, anchor: t.anchor, color: t.color, readable: t.readable });
    if (t.ref && M[t.ref]) doc.texts[M[id]].ref = M[t.ref];
    made.push({ k: 'tx', id: M[id] });
  }
  for (const k of cons) {
    const n = { ...jclone(k), refs: k.refs.map((r) => M[r]) };
    if (hvAngle !== undefined && (n.t === 'H' || n.t === 'V')) {
      const m = ((hvAngle % 180) + 180) % 180;
      if (Math.abs(m - 90) < 1e-6) n.t = n.t === 'H' ? 'V' : 'H';
      else if (m > 1e-6 && 180 - m > 1e-6) continue;
    }
    if (mirror && n.t === 'ANG' && typeof n.v === 'number') n.v = -n.v;
    addCon(doc, n);
  }
  for (const h of hatches) doc.hatches[nextId(doc, 'h')] = { ...jclone(h), ids: h.ids.map((x) => M[x]) };
  return made;
}

// ---------------------------------------------------------------- matriz lineal
// items: [{k,id}] a copiar. dirs: [{u:{x,y} unitario, s: espaciado, n: copias nuevas}] (1 o 2 direcciones).
// Con dos direcciones se crea la cuadricula completa. Devuelve los elementos nuevos.
export function linearArray(doc, items, dirs) {
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
      made.push(...makeCopy(doc, col, (o) => ({ x: o.x + dx, y: o.y + dy })));
    }
  }
  return { ok: true, made };
}

// ---------------------------------------------------------------- copia espejo
// Refleja una copia de items respecto de la recta que pasa por A y B. Los puntos que ya estan sobre el eje
// se comparten (la copia queda unida al original por ahi). El eje no se copia.
export function mirrorCopy(doc, items, A, B) {
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
  const made = makeCopy(doc, col, refl, { mirror: true, reuse: onAxis, axisAng: (Math.atan2(u.y, u.x) * 180) / Math.PI, hvAngle: (2 * Math.atan2(u.y, u.x) * 180) / Math.PI });
  return { ok: true, made };
}

// ---------------------------------------------------------------- matriz circular
// c: centro {x,y}; step: angulo entre instancias (rad, con signo); n: instancias totales (incluye el original);
// skip: Set de numeros de instancia (2..n) que no se crean. Los puntos que coinciden con el centro se comparten.
export function circularArray(doc, items, { c, step, n, skip = new Set() }) {
  const col = collect(doc, items);
  if (!col.P.size) return { ok: false, msg: 'No hay nada que copiar' };
  if (!(n >= 2) || n > 400) return { ok: false, msg: 'Número de instancias no válido' };
  const made = [];
  for (let i = 1; i < n; i++) {
    if (skip.has(i + 1)) continue;
    const a = i * step, ca = Math.cos(a), sa = Math.sin(a);
    const rot = (o) => ({ x: c.x + (o.x - c.x) * ca - (o.y - c.y) * sa, y: c.y + (o.x - c.x) * sa + (o.y - c.y) * ca });
    const deg = (a * 180) / Math.PI;
    made.push(...makeCopy(doc, col, rot, { reuse: (pid) => dist(doc.pts[pid], c) <= TOL, hvAngle: deg, rotDeg: deg }));
  }
  if (!made.length) return { ok: false, msg: 'Todas las instancias están omitidas' };
  return { ok: true, made };
}

// Documento: puntos, lineas, arcos, circulos, restricciones, rellenos y tipos de linea.
import { arcSweepOf, TAU, splineSamples } from './geom.js';

export const BUILTIN_LTYPES = {
  continua: { label: 'Continua', pattern: [] },
  oculta: { label: 'Oculta', pattern: [4, -2] },
  eje: { label: 'Eje (centro)', pattern: [14, -2.5, 2.5, -2.5] },
  fantasma: { label: 'Fantasma (phantom)', pattern: [14, -2.5, 2.5, -2.5, 2.5, -2.5] },
  discontinua: { label: 'Discontinua', pattern: [8, -4] },
  punteada: { label: 'Punteada', pattern: [0, -3] },
  trazopunto: { label: 'Traza y punto', pattern: [10, -2.5, 0, -2.5] },
  // constructiva: . ___ . (punto, hueco, trazo continuo, hueco, punto); se dibuja aparte, no es un patron repetido
  constructiva: { label: 'Constructiva (. ___ .)', pattern: [] },
};

export const PALETTE = [
  ['auto', 'Auto'], ['#dc2626', 'Rojo'], ['#ea580c', 'Naranja'], ['#ca8a04', 'Amarillo'],
  ['#16a34a', 'Verde'], ['#0891b2', 'Cian'], ['#2563eb', 'Azul'], ['#7c3aed', 'Violeta'],
  ['#db2777', 'Magenta'], ['#6b7280', 'Gris'],
];

export function newDoc() {
  return { n: 0, pts: {}, lines: {}, circles: {}, arcs: {}, ellipses: {}, texts: {}, splines: {}, traces: {}, cons: {}, hatches: {}, ltypes: {}, cn: {} };
}

export function nextId(doc, prefix) {
  doc.n += 1;
  return prefix + doc.n;
}

export function allLtypes(doc) {
  return { ...BUILTIN_LTYPES, ...Object.fromEntries(Object.entries(doc.ltypes || {}).map(([k, v]) => [k, { label: v.label || k, pattern: v.pattern, custom: true }])) };
}

export function addPoint(doc, x, y, auto = false) {
  const id = nextId(doc, 'p');
  doc.pts[id] = { x, y, fixed: false, auto };
  return id;
}

export function addLine(doc, a, b, style) {
  const id = nextId(doc, 'l');
  doc.lines[id] = { a, b, ...style };
  return id;
}

export function addCircle(doc, c, r, style) {
  const id = nextId(doc, 'c');
  doc.circles[id] = { c, r, ...style };
  return id;
}

// Arco antihorario de centro c desde el punto a hasta el punto b (r = radio inicial).
export function addArc(doc, c, a, b, r, style) {
  const id = nextId(doc, 'a');
  doc.arcs[id] = { c, a, b, r, ...style };
  return id;
}

export function arcOf(doc, arc) {
  return arcSweepOf(doc.pts[arc.c], doc.pts[arc.a], doc.pts[arc.b]);
}

// Elipse: centro c, extremo a del primer eje y un punto b que define el 2.o eje (su distancia al primer eje
// es el semieje menor). Al crearla se agrega una restriccion oculta de 90 grados entre c-a y c-b, asi b queda
// en el extremo del 2.o eje.
export function addEllipse(doc, c, a, b, style) {
  doc.ellipses ||= {};
  const id = nextId(doc, 'e');
  doc.ellipses[id] = { c, a, b, ...style };
  return id;
}
export function ellipseOf(doc, e) {
  const C = doc.pts[e.c], A = doc.pts[e.a], B = doc.pts[e.b];
  const ra = Math.hypot(A.x - C.x, A.y - C.y) || 1e-9, ux = (A.x - C.x) / ra, uy = (A.y - C.y) / ra;
  return { cx: C.x, cy: C.y, ra, rb: Math.abs((B.x - C.x) * uy - (B.y - C.y) * ux), ux, uy };
}
// Poligonal cerrada (el ultimo punto repite el primero).
export function ellipsePolyline(doc, e, n = 96) {
  const g = ellipseOf(doc, e), out = [];
  for (let i = 0; i <= n; i++) {
    const t = (TAU * i) / n, x = g.ra * Math.cos(t), y = g.rb * Math.sin(t);
    out.push({ x: g.cx + x * g.ux - y * g.uy, y: g.cy + x * g.uy + y * g.ux });
  }
  return out;
}

// Spline que pasa por una lista de puntos reales del dibujo (se mueve con ellos).
export function addSpline(doc, ptIds, style, closed = false) {
  const id = nextId(doc, 's');
  doc.splines[id] = { pts: [...ptIds], closed, ...style };
  return id;
}

// Poligonal muestreada del spline (coordenadas del modelo).
// sp.ts (parametros de los puntos) solo existe en los splines con relaciones: asi la curva que se dibuja es
// exactamente la que resolvio el solver. Sin relaciones se recalculan con la longitud de cuerda.
const polyCache = new Map();
export function splinePolyline(doc, sp, per = 16) {
  const P = sp.pts.map((p) => doc.pts[p]);
  let key = `${per}|${sp.closed ? 1 : 0}|${sp.ts ? sp.ts.join(',') : ''}`;
  for (const q of P) key += `|${q.x},${q.y}`;
  let hit = polyCache.get(key);
  if (!hit) {
    hit = splineSamples(P, sp.closed, per, sp.ts);
    if (polyCache.size > 300) polyCache.clear();
    polyCache.set(key, hit);
  }
  return hit;
}

// Texto con punto de insercion (un punto real del documento, asi admite restricciones).
// anchor: 'tl','tc','tr','ml','mc','mr','bl','bc','br' (vertical + horizontal); ang en grados.
export function addText(doc, pt, text, opts = {}) {
  const id = nextId(doc, 't');
  doc.texts[id] = { pt, text, h: opts.h ?? 4, ang: opts.ang ?? 0, anchor: opts.anchor ?? 'bl', color: opts.color ?? 'auto', readable: opts.readable ?? true, ...(opts.font ? { font: opts.font } : {}) };
  return id;
}

// Numeracion de restricciones: cada tipo cuenta aparte (V1, V2, ⟂1, ∥1...). Las que involucran varios
// elementos comparten un solo numero. "Punto sobre" y "coincidente" son la misma familia (●). Las ocultas
// y las cotas no se numeran. El numero no se reutiliza al borrar.
export const CON_GROUP = { H: 'H', V: 'V', PAR: 'PAR', PERP: 'PERP', EQL: 'EQ', EQR: 'EQ', COI: 'COI', PONL: 'COI', PONC: 'COI', PONS: 'COI', COL: 'COL', MID: 'MID', TANLC: 'TAN', TANCC: 'TAN', TANLS: 'TAN', TANCS: 'TAN' };
export const CON_GLYPH = { H: 'H', V: 'V', PAR: '∥', PERP: '⟂', EQ: '=', COI: '●', COL: 'Col', MID: 'M', TAN: 'T' };
export const conTag = (k) => (CON_GROUP[k.t] ? CON_GLYPH[CON_GROUP[k.t]] + (k.n ?? '') : '');
export function addCon(doc, con) {
  const id = nextId(doc, 'k');
  delete con.n;
  const g = CON_GROUP[con.t];
  if (g && !con.hidden) { doc.cn ||= {}; con.n = doc.cn[g] = (doc.cn[g] || 0) + 1; }
  doc.cons[id] = con;
  return id;
}
// Dibujos guardados antes de la numeracion: se numeran en el orden en que se crearon.
export function ensureNumbers(doc) {
  doc.cn ||= {};
  const ids = Object.keys(doc.cons).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  for (const g of new Set(Object.values(CON_GROUP))) {
    for (const id of ids) {
      const k = doc.cons[id];
      if (CON_GROUP[k.t] !== g || k.hidden || k.n !== undefined) continue;
      k.n = doc.cn[g] = (doc.cn[g] || 0) + 1;
    }
  }
}

// Identificadores de geometria que una restriccion referencia (para borrado).
export function conRefs(con) {
  return con.refs || [];
}

function pointsUsed(doc) {
  const used = new Set();
  for (const l of Object.values(doc.lines)) { used.add(l.a); used.add(l.b); }
  for (const c of Object.values(doc.circles)) used.add(c.c);
  for (const a of Object.values(doc.arcs)) { used.add(a.c); used.add(a.a); used.add(a.b); }
  for (const e of Object.values(doc.ellipses || {})) { used.add(e.c); used.add(e.a); used.add(e.b); }
  for (const t of Object.values(doc.texts || {})) used.add(t.pt);
  for (const sp of Object.values(doc.splines || {})) for (const p of sp.pts) used.add(p);
  for (const k of Object.values(doc.cons)) for (const r of conRefs(k)) used.add(r);
  return used;
}

// Elimina lo que quedo huerfano: restricciones con referencias muertas, rellenos sin
// contorno y puntos automaticos sin uso.
export function cleanup(doc) {
  const exists = (id) => id in doc.pts || id in doc.lines || id in doc.circles || id in doc.arcs || id in (doc.splines || {}) || id in (doc.ellipses || {});
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, k] of Object.entries(doc.cons)) {
      if (!conRefs(k).every(exists)) { delete doc.cons[id]; changed = true; }
    }
    for (const [id, sp] of Object.entries(doc.splines || {})) {
      const keep = sp.pts.filter((p) => p in doc.pts);
      if (keep.length !== sp.pts.length) { sp.pts = keep; changed = true; }
      if (sp.pts.length < 2) { delete doc.splines[id]; changed = true; }
    }
    for (const [id, e] of Object.entries(doc.ellipses || {})) if (!(e.c in doc.pts && e.a in doc.pts && e.b in doc.pts)) { delete doc.ellipses[id]; changed = true; }
    // un spline sin relaciones no conserva parametros fijos
    for (const [id, sp] of Object.entries(doc.splines || {})) {
      if (sp.ts && !Object.values(doc.cons).some((k) => (k.t === 'PONS' || k.t === 'TANLS' || k.t === 'TANCS') && k.refs[1] === id)) delete sp.ts;
    }
    for (const id of Object.keys(doc.traces || {})) if (!(id in doc.pts)) { delete doc.traces[id]; changed = true; }
    for (const [id, t] of Object.entries(doc.texts || {})) {
      if (!(t.pt in doc.pts)) { delete doc.texts[id]; changed = true; }
      else if (t.ref && !(t.ref in doc.lines)) delete t.ref; // la linea de referencia ya no existe: queda con su desfase
    }
    for (const [id, h] of Object.entries(doc.hatches)) {
      h.ids = h.ids.filter((e) => e in doc.lines || e in doc.circles || e in doc.arcs || e in (doc.splines || {}));
      if (!h.ids.length) { delete doc.hatches[id]; changed = true; }
    }
    const used = pointsUsed(doc);
    for (const [id, p] of Object.entries(doc.pts)) {
      if (p.auto && !used.has(id)) { delete doc.pts[id]; changed = true; }
    }
  }
}

export function deleteItems(doc, items) {
  for (const { k, id } of items) {
    if (k === 'pt') {
      for (const [lid, l] of Object.entries(doc.lines)) if (l.a === id || l.b === id) delete doc.lines[lid];
      for (const [cid, c] of Object.entries(doc.circles)) if (c.c === id) delete doc.circles[cid];
      for (const [aid, a] of Object.entries(doc.arcs)) if (a.c === id || a.a === id || a.b === id) delete doc.arcs[aid];
      for (const [eid, e] of Object.entries(doc.ellipses || {})) if (e.c === id || e.a === id || e.b === id) delete doc.ellipses[eid];
      delete doc.pts[id];
    } else if (k === 'ln') delete doc.lines[id];
    else if (k === 'ci') delete doc.circles[id];
    else if (k === 'ar') delete doc.arcs[id];
    else if (k === 'tx') delete doc.texts[id];
    else if (k === 'sp') delete doc.splines[id];
    else if (k === 'el') delete doc.ellipses[id];
    else if (k === 'ha') delete doc.hatches[id];
    else if (k === 'co') delete doc.cons[id];
  }
  cleanup(doc);
}

export const clone = (o) => JSON.parse(JSON.stringify(o));

// Puntos del arco muestreados de a a b (antihorario), n segmentos por vuelta completa = 90.
export function arcSamples(doc, arc) {
  const c = doc.pts[arc.c];
  const { a0, sweep } = arcOf(doc, arc);
  const n = Math.max(6, Math.ceil((sweep / TAU) * 90));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    out.push({ x: c.x + arc.r * Math.cos(t), y: c.y + arc.r * Math.sin(t) });
  }
  return out;
}

// Contornos de un relleno: lista de poligonos {pts:[{x,y}]} (lineas y arcos encadenados
// por puntos compartidos; los arcos se muestrean) y circulos {c,r}.
export function hatchLoops(doc, h) {
  const loops = [];
  const spl = doc.splines || {};
  const edges = h.ids.filter((i) => i in doc.lines || i in doc.arcs || (i in spl && !spl[i].closed));
  const ends = (id) => (id in doc.lines ? [doc.lines[id].a, doc.lines[id].b] : id in spl ? [spl[id].pts[0], spl[id].pts[spl[id].pts.length - 1]] : [doc.arcs[id].a, doc.arcs[id].b]);
  const used = new Set();
  const byPoint = new Map();
  for (const id of edges) for (const p of ends(id)) {
    if (!byPoint.has(p)) byPoint.set(p, []);
    byPoint.get(p).push(id);
  }
  // puntos al recorrer la arista id saliendo de 'from' (sin repetir 'from', con el extremo lejano)
  const walk = (id, from) => {
    const [ea, eb] = ends(id);
    if (id in doc.lines) return [from === ea ? eb : ea];
    const smp = id in spl ? splinePolyline(doc, spl[id], 12) : arcSamples(doc, doc.arcs[id]);
    return from === ea ? smp.slice(1) : smp.slice(0, -1).reverse();
  };
  const pt = (x) => (typeof x === 'string' ? doc.pts[x] && { x: doc.pts[x].x, y: doc.pts[x].y } : x);
  for (const start of edges) {
    if (used.has(start)) continue;
    used.add(start);
    const [sa] = ends(start);
    const seq = [sa, ...walk(start, sa)];
    let cur = ends(start)[1];
    for (;;) {
      const next = (byPoint.get(cur) || []).find((i) => !used.has(i));
      if (!next) break;
      used.add(next);
      const w = walk(next, cur);
      seq.push(...w);
      const e = ends(next);
      cur = e[0] === cur ? e[1] : e[0];
    }
    const pts = seq.map(pt).filter(Boolean);
    if (pts.length >= 3) loops.push({ pts });
  }
  for (const id of h.ids) if (id in spl && spl[id].closed) loops.push({ pts: splinePolyline(doc, spl[id], 12).slice(0, -1) });
  for (const id of h.ids) if (id in doc.circles) {
    const c = doc.circles[id];
    const p = doc.pts[c.c];
    if (p) loops.push({ c: { x: p.x, y: p.y }, r: c.r });
  }
  return loops;
}

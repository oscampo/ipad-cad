// Documento: puntos, lineas, arcos, circulos, restricciones, rellenos y tipos de linea.
import { arcSweepOf, TAU } from './geom.js';

export const BUILTIN_LTYPES = {
  continua: { label: 'Continua', pattern: [] },
  oculta: { label: 'Oculta', pattern: [4, -2] },
  eje: { label: 'Eje (centro)', pattern: [14, -2.5, 2.5, -2.5] },
  fantasma: { label: 'Fantasma (phantom)', pattern: [14, -2.5, 2.5, -2.5, 2.5, -2.5] },
  discontinua: { label: 'Discontinua', pattern: [8, -4] },
  punteada: { label: 'Punteada', pattern: [0, -3] },
  trazopunto: { label: 'Traza y punto', pattern: [10, -2.5, 0, -2.5] },
};

export const PALETTE = [
  ['auto', 'Auto'], ['#dc2626', 'Rojo'], ['#ea580c', 'Naranja'], ['#ca8a04', 'Amarillo'],
  ['#16a34a', 'Verde'], ['#0891b2', 'Cian'], ['#2563eb', 'Azul'], ['#7c3aed', 'Violeta'],
  ['#db2777', 'Magenta'], ['#6b7280', 'Gris'],
];

export function newDoc() {
  return { n: 0, pts: {}, lines: {}, circles: {}, arcs: {}, cons: {}, hatches: {}, ltypes: {} };
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

export function addCon(doc, con) {
  const id = nextId(doc, 'k');
  doc.cons[id] = con;
  return id;
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
  for (const k of Object.values(doc.cons)) for (const r of conRefs(k)) used.add(r);
  return used;
}

// Elimina lo que quedo huerfano: restricciones con referencias muertas, rellenos sin
// contorno y puntos automaticos sin uso.
export function cleanup(doc) {
  const exists = (id) => id in doc.pts || id in doc.lines || id in doc.circles || id in doc.arcs;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, k] of Object.entries(doc.cons)) {
      if (!conRefs(k).every(exists)) { delete doc.cons[id]; changed = true; }
    }
    for (const [id, h] of Object.entries(doc.hatches)) {
      h.ids = h.ids.filter((e) => e in doc.lines || e in doc.circles || e in doc.arcs);
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
      delete doc.pts[id];
    } else if (k === 'ln') delete doc.lines[id];
    else if (k === 'ci') delete doc.circles[id];
    else if (k === 'ar') delete doc.arcs[id];
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
  const edges = h.ids.filter((i) => i in doc.lines || i in doc.arcs);
  const ends = (id) => (id in doc.lines ? [doc.lines[id].a, doc.lines[id].b] : [doc.arcs[id].a, doc.arcs[id].b]);
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
    const smp = arcSamples(doc, doc.arcs[id]);
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
  for (const id of h.ids) if (id in doc.circles) {
    const c = doc.circles[id];
    const p = doc.pts[c.c];
    if (p) loops.push({ c: { x: p.x, y: p.y }, r: c.r });
  }
  return loops;
}

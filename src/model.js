// Documento: puntos, lineas, circulos, restricciones, rellenos y tipos de linea.
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
  return { n: 0, pts: {}, lines: {}, circles: {}, cons: {}, hatches: {}, ltypes: {} };
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
  for (const k of Object.values(doc.cons)) for (const r of conRefs(k)) used.add(r);
  return used;
}

// Elimina lo que quedo huerfano: restricciones con referencias muertas, rellenos sin
// contorno y puntos automaticos sin uso.
export function cleanup(doc) {
  const exists = (id) => id in doc.pts || id in doc.lines || id in doc.circles;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, k] of Object.entries(doc.cons)) {
      if (!conRefs(k).every(exists)) { delete doc.cons[id]; changed = true; }
    }
    for (const [id, h] of Object.entries(doc.hatches)) {
      h.ids = h.ids.filter((e) => e in doc.lines || e in doc.circles);
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
      delete doc.pts[id];
    } else if (k === 'ln') delete doc.lines[id];
    else if (k === 'ci') delete doc.circles[id];
    else if (k === 'ha') delete doc.hatches[id];
    else if (k === 'co') delete doc.cons[id];
  }
  cleanup(doc);
}

export const clone = (o) => JSON.parse(JSON.stringify(o));

// Contornos de un relleno: lista de poligonos {pts:[{x,y}]} y circulos {c,r}.
export function hatchLoops(doc, h) {
  const loops = [];
  const lines = h.ids.filter((i) => i in doc.lines);
  const used = new Set();
  const byPoint = new Map();
  for (const id of lines) for (const p of [doc.lines[id].a, doc.lines[id].b]) {
    if (!byPoint.has(p)) byPoint.set(p, []);
    byPoint.get(p).push(id);
  }
  for (const start of lines) {
    if (used.has(start)) continue;
    used.add(start);
    const l0 = doc.lines[start];
    const seq = [l0.a, l0.b];
    let cur = l0.b;
    for (;;) {
      const next = (byPoint.get(cur) || []).find((i) => !used.has(i));
      if (!next) break;
      used.add(next);
      const l = doc.lines[next];
      cur = l.a === cur ? l.b : l.a;
      seq.push(cur);
    }
    const pts = seq.map((p) => doc.pts[p]).filter(Boolean).map((p) => ({ x: p.x, y: p.y }));
    if (pts.length >= 3) loops.push({ pts });
  }
  for (const id of h.ids) if (id in doc.circles) {
    const c = doc.circles[id];
    const p = doc.pts[c.c];
    if (p) loops.push({ c: { x: p.x, y: p.y }, r: c.r });
  }
  return loops;
}

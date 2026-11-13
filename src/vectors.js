// Vectores: una linea con cabeza de flecha en la cabeza, cuya magnitud es una cota de referencia (D1, D2...) y se muestra
// como un texto "[=Dn]" unido al punto medio (punto de insercion: medio del lado superior de la caja, asi queda centrado).
// Sin DOM. Datos: line.vec = { rev, m, t, d }: rev = la cabeza esta en el punto a (la cola es b); m = punto medio (auto);
// t = texto de la magnitud; d = cota de referencia de la magnitud (oculta, con nombre, se puede usar en formulas).
import { addPoint, addCon, addText, cleanup } from './model.js';

export const isVector = (l) => !!(l && l.vec);

// Extremos del vector: { tail, head } (ids de puntos).
export const vecEnds = (l) => (l.vec?.rev ? { tail: l.b, head: l.a } : { tail: l.a, head: l.b });

// Punta y direccion unitaria (de la cola a la cabeza) en el modelo; null si no mide nada.
export function vecArrow(doc, l) {
  const { tail, head } = vecEnds(l);
  const t = doc.pts[tail], h = doc.pts[head];
  if (!t || !h) return null;
  const L = Math.hypot(h.x - t.x, h.y - t.y);
  return L < 1e-9 ? null : { tip: { x: h.x, y: h.y }, dir: { x: (h.x - t.x) / L, y: (h.y - t.y) / L }, len: L };
}

// Convierte una linea en vector. rev: la cola es el extremo b. h: altura del texto de la magnitud.
export function makeVector(doc, lid, { rev = false, h = 4 } = {}) {
  const l = doc.lines[lid];
  if (!l || l.vec) return false;
  const a = doc.pts[l.a], b = doc.pts[l.b];
  const m = addPoint(doc, (a.x + b.x) / 2, (a.y + b.y) / 2, true);
  doc.pts[m].txOnly = true; // solo se ve al seleccionarlo
  addCon(doc, { t: 'MID', refs: [l.a, l.b, m], hidden: true });
  const d = addCon(doc, { t: 'DIST', refs: [l.a, l.b], v: Math.hypot(b.x - a.x, b.y - a.y), ref: true, hidden: true, vec: lid });
  const t = addText(doc, m, `[=${doc.cons[d].name}]`, { h, anchor: 'tc', ang: 0, color: l.color ?? 'auto' });
  doc.texts[t].vecOf = lid;
  if (l.layer) doc.texts[t].layer = l.layer;
  l.vec = { rev: !!rev, m, t, d };
  return true;
}

// Convierte un vector en una linea: quita la flecha, el texto de la magnitud, su cota y el punto medio.
export function unmakeVector(doc, lid) {
  const l = doc.lines[lid];
  if (!l?.vec) return false;
  const { m, t, d } = l.vec;
  delete doc.texts[t];
  delete doc.cons[d];
  for (const [id, k] of Object.entries(doc.cons)) if (k.t === 'MID' && k.hidden && k.refs[2] === m) delete doc.cons[id];
  delete l.vec;
  cleanup(doc); // el punto medio (auto) queda sin uso y se va
  return true;
}

// Mantiene al dia lo que depende de los extremos (recortar o extender cambia los puntos de la linea).
export function syncVectors(doc) {
  for (const l of Object.values(doc.lines)) {
    const v = l.vec;
    if (!v) continue;
    if (doc.cons[v.d]) doc.cons[v.d].refs = [l.a, l.b];
    for (const k of Object.values(doc.cons)) if (k.t === 'MID' && k.hidden && k.refs[2] === v.m) k.refs = [l.a, l.b, v.m];
  }
}

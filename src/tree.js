// Arbol de elementos del documento (sin DOM): cada elemento con sus puntos y sus relaciones.
import { dist } from './geom.js';
import { conRefs, conTag } from './model.js';
import { dimValue, dimText, DIAM } from './dims.js';

const f = (v, d = 2) => String(Math.round(v * 10 ** d) / 10 ** d);

const CON_NAMES = {
  H: 'Horizontal', V: 'Vertical', PAR: 'Paralelas', PERP: 'Perpendiculares', EQL: 'Igual longitud', EQR: 'Igual radio',
  COI: 'Coincidentes', PONL: 'Coincidente (punto sobre línea)', PONC: 'Coincidente (punto sobre círculo/arco)', PONS: 'Coincidente (punto sobre spline)',
  COL: 'Colineales', MID: 'Punto medio', TANLC: 'Tangente', TANCC: 'Tangente', TANLS: 'Tangente a spline', TANCS: 'Tangente a spline',
  DIST: 'Distancia', DISTPL: 'Distancia a recta', ANG: 'Ángulo', ANG4: 'Ángulo', RAD: 'Radio',
  AZ: 'Dirección', EQD: 'Igual distancia', SYM: 'Simetría',
};

export function conLabel(doc, k) {
  const tag = conTag(k);
  let s = (tag ? tag + ' · ' : '') + (CON_NAMES[k.t] || k.t);
  if (k.t === 'DIST' || k.t === 'DISTPL') s += ` = ${f(k.v)}`;
  else if (k.t === 'ANG' || k.t === 'ANG4') s += ` = ${dimText(doc, k)}`;
  else if (k.t === 'RAD') s += (k.refs[0] in doc.circles ? ` ${DIAM} = ${f(k.v * 2)}` : ` R = ${f(k.v)}`);
  if (k.ref) s += ' (referencia)';
  if (k.hidden) s += ' (auto)';
  return s;
}

const kindOf = (doc, id) => (id in doc.pts ? 'pt' : id in doc.lines ? 'ln' : id in doc.circles ? 'ci' : id in doc.arcs ? 'ar' : id in (doc.splines || {}) ? 'sp' : id in (doc.ellipses || {}) ? 'el' : null);
export { kindOf };

// Nodo: { key, label, sel?: {k,id}, con?: id, lock?: boolean|undefined, children?: [] }
export function buildTree(doc) {
  const consOf = (id) => Object.entries(doc.cons).filter(([, k]) => conRefs(k).includes(id));
  const conNodes = (id) => consOf(id).map(([cid, k]) => ({ key: `co:${cid}`, label: conLabel(doc, k), con: cid, sel: { k: 'co', id: cid } }));
  const ptNode = (id, role) => {
    const p = doc.pts[id];
    if (!p) return null;
    return { key: `pt:${id}`, label: `${role ? role + ' ' : ''}Punto ${id} (${f(p.x)}, ${f(p.y)})`, sel: { k: 'pt', id }, lock: !!p.fixed, children: conNodes(id) };
  };
  const compact = (a) => a.filter(Boolean);
  const group = (key, label, items) => ({ key, label: `${label} (${items.length})`, group: true, children: items });

  const lines = Object.entries(doc.lines).map(([id, l]) => ({
    key: `ln:${id}`, label: `Línea ${id} · L = ${f(dist(doc.pts[l.a], doc.pts[l.b]))}`, sel: { k: 'ln', id },
    children: [...conNodes(id), ...compact([ptNode(l.a, 'A:'), ptNode(l.b, 'B:')])],
  }));
  const circles = Object.entries(doc.circles).map(([id, c]) => ({
    key: `ci:${id}`, label: `Círculo ${id} · ${DIAM} = ${f(2 * c.r)}`, sel: { k: 'ci', id },
    children: [...conNodes(id), ...compact([ptNode(c.c, 'Centro:')])],
  }));
  const arcs = Object.entries(doc.arcs).map(([id, a]) => ({
    key: `ar:${id}`, label: `Arco ${id} · R = ${f(a.r)}`, sel: { k: 'ar', id },
    children: [...conNodes(id), ...compact([ptNode(a.c, 'Centro:'), ptNode(a.a, 'Inicio:'), ptNode(a.b, 'Fin:')])],
  }));
  const splines = Object.entries(doc.splines || {}).map(([id, s]) => ({
    key: `sp:${id}`, label: `Spline ${id} · ${s.pts.length} puntos${s.closed ? ', cerrada' : ''}`, sel: { k: 'sp', id },
    children: [...conNodes(id), group(`spp:${id}`, 'Puntos de control', compact(s.pts.map((p) => ptNode(p))))],
  }));
  const ellipses = Object.entries(doc.ellipses || {}).map(([id, e]) => ({
    key: `el:${id}`, label: `Elipse ${id}`, sel: { k: 'el', id },
    children: [...conNodes(id), ...compact([ptNode(e.c, 'Centro:'), ptNode(e.a, 'Eje 1:'), ptNode(e.b, 'Eje 2:')])],
  }));
  const texts = Object.entries(doc.texts || {}).map(([id, t]) => ({
    key: `tx:${id}`, label: `Texto «${String(t.text).split('\n')[0].slice(0, 24)}»`, sel: { k: 'tx', id },
    children: compact([ptNode(t.pt, 'Inserción:')]),
  }));
  const hatches = Object.entries(doc.hatches || {}).map(([id, h]) => ({ key: `ha:${id}`, label: `Relleno ${id} (${h.ids.length} contornos)`, sel: { k: 'ha', id } }));
  // puntos sueltos del dibujo (los de control de un spline cuelgan de su spline)
  const pts = Object.entries(doc.pts).filter(([, p]) => !p.splOnly).map(([id]) => ptNode(id));
  const cons = Object.entries(doc.cons).map(([cid, k]) => ({
    key: `co:${cid}`, label: conLabel(doc, k), con: cid, sel: { k: 'co', id: cid },
    children: conRefs(k).map((r) => { const kd = kindOf(doc, r); return kd ? { key: `ref:${cid}:${r}`, label: `→ ${r}`, sel: { k: kd, id: r } } : null; }).filter(Boolean),
  }));
  const traces = Object.entries(doc.traces || {}).map(([id, t]) => ({ key: `tr:${id}`, label: `Trazado del punto ${id} · ${t.pts.length} muestras`, sel: doc.pts[id] ? { k: 'pt', id } : null }));

  const out = [
    group('g:ln', 'Líneas', lines), group('g:ci', 'Círculos', circles), group('g:ar', 'Arcos', arcs), group('g:el', 'Elipses', ellipses), group('g:sp', 'Splines', splines),
    group('g:tx', 'Textos', texts), group('g:ha', 'Rellenos', hatches), group('g:pt', 'Puntos', pts),
    group('g:co', 'Relaciones y cotas', cons), group('g:tr', 'Trazados', traces),
  ];
  return out.filter((g) => g.children.length);
}

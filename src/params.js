// Cotas con nombre y formulas entre cotas (sin DOM).
// Una cota conductora (no de referencia) puede definirse con una formula que use el nombre de otras: D2 = D1*sin(A1).
// Al cambiar una cota se recalculan en orden las que dependen de ella (grafo sin ciclos) y luego se resuelve la geometria.
// Las cotas de referencia no entran en formulas: su valor sale de la geometria y cerraria un ciclo con ella.
import { isNamedDim, dimLetter, DIM_KIND } from './model.js';
import { dimValue, angTrue } from './dims.js';
import { parseValue, exprRefs, renameInExpr, isReservedName, NAME_RE } from './expr.js';

const DEG = Math.PI / 180;
const drivers = (doc) => Object.entries(doc.cons).filter(([, k]) => isNamedDim(k) && !k.ref && k.name);

// Valor con el que una cota entra en una formula: la medida que muestra (diametro para circulos, grados convertidos a radianes).
export function varValue(doc, k) {
  const v = dimValue(doc, k);
  if (k.t === 'ANG') return { v: v * DEG, r: true };
  if (k.t === 'RAD' && k.refs[0] in doc.circles) return { v: 2 * v, r: false };
  return { v, r: false };
}
// Variables disponibles (sin la cota exceptId, que no puede usarse a si misma).
export function varsOf(doc, exceptId = null) {
  const out = {};
  for (const [id, k] of drivers(doc)) if (id !== exceptId) out[k.name] = varValue(doc, k);
  return out;
}
// Texto corto de las variables para mostrarlas al escribir una formula: "D1 = 25, A1 = 45°".
export function varsList(doc, exceptId = null) {
  return drivers(doc).filter(([id]) => id !== exceptId).map(([, k]) => {
    const v = dimValue(doc, k), x = k.t === 'RAD' && k.refs[0] in doc.circles ? 2 * v : v;
    return `${k.name} = ${Math.round(x * 1000) / 1000}${k.t === 'ANG' ? '°' : ''}`;
  }).join(', ');
}

export function checkName(doc, name, exceptId) {
  if (!NAME_RE.test(name)) return 'El nombre usa letras, números y _, y empieza con una letra';
  if (isReservedName(name)) return `«${name}» es una función o constante`;
  if (Object.entries(doc.cons).some(([id, k]) => id !== exceptId && k.name === name)) return `Ya existe una cota llamada «${name}»`;
  return null;
}

// Cambia el nombre de una cota y lo actualiza en las formulas de las demas.
export function renameDim(doc, id, name) {
  const k = doc.cons[id], old = k.name;
  if (!old || old === name) { k.name = name; return; }
  k.name = name;
  for (const o of Object.values(doc.cons)) if (o.expr) o.expr = renameInExpr(o.expr, old, name);
}

// Evalua en orden las cotas definidas con formula. { ok: true } o { ok: false, error } sin dejar nada a medias:
// si algo falla no se modifica ninguna cota.
export function recompute(doc) {
  const dr = drivers(doc), byName = new Map(dr.map(([id, k]) => [k.name, id])), f = dr.filter(([, k]) => k.expr);
  const deps = new Map();
  for (const [id, k] of f) {
    const ids = [];
    for (const n of exprRefs(k.expr)) {
      if (n === k.name) return { ok: false, error: `${k.name} no puede usarse en su propia fórmula` };
      if (!byName.has(n)) return { ok: false, error: `En la fórmula de ${k.name}: «${n}» no es una cota (o es de referencia)` };
      ids.push(byName.get(n));
    }
    deps.set(id, ids);
  }
  const order = [], state = new Map();
  let cycle = null;
  const visit = (id, path) => {
    if (cycle) return;
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { cycle = [...path.slice(path.indexOf(id)), id].map((x) => doc.cons[x].name).join(' → '); return; }
    state.set(id, 1);
    for (const d of deps.get(id) || []) if (deps.has(d)) visit(d, [...path, id]);
    state.set(id, 2);
    order.push(id);
  };
  for (const [id] of f) visit(id, []);
  if (cycle) return { ok: false, error: `Las cotas se definen en círculo: ${cycle}` };
  const bak = JSON.stringify(doc.cons);
  for (const id of order) {
    const k = doc.cons[id];
    let val;
    try { val = parseValue(k.expr, { angle: k.t === 'ANG', radians: k.t === 'ANG' && k.unit === 'rad', vars: varsOf(doc, id) }); } catch (e) { doc.cons = JSON.parse(bak); return { ok: false, error: `${k.name}: ${e.message}` }; }
    if (k.t === 'ANG') {
      if (val < 0 || val > 180) { doc.cons = JSON.parse(bak); return { ok: false, error: `${k.name} (ángulo) quedaría en ${Math.round(val * 100) / 100}°: debe estar entre 0° y 180°` }; }
      k.v = angTrue(doc, { ...k, ref: false }, val);
    } else {
      if (!(val > 0)) { doc.cons = JSON.parse(bak); return { ok: false, error: `${k.name} quedaría en ${Math.round(val * 1000) / 1000}: debe ser mayor que cero` }; }
      k.v = k.t === 'RAD' && k.refs[0] in doc.circles ? val / 2 : val;
    }
  }
  return { ok: true, count: order.length };
}

// Quita la formula (queda el valor actual) de las cotas cuyas variables ya no existen o pasaron a ser de referencia.
// Devuelve los nombres afectados.
export function pruneFormulas(doc) {
  const names = new Set(drivers(doc).map(([, k]) => k.name)), out = [];
  for (const k of Object.values(doc.cons)) {
    if (!k.expr) continue;
    if (!isNamedDim(k) || k.ref || exprRefs(k.expr).some((n) => !names.has(n) || n === k.name)) { delete k.expr; if (k.name) out.push(k.name); }
  }
  return out;
}

export { DIM_KIND, dimLetter };

// Cotas con nombre y formulas entre cotas (sin DOM).
// Una cota conductora (no de referencia) puede definirse con una formula que use el nombre de otras: D2 = D1*sin(A1).
// Al cambiar una cota se recalculan en orden las que dependen de ella (grafo sin ciclos) y luego se resuelve la geometria.
// Las cotas de referencia (solo lectura) tambien se pueden leer en una formula: su valor sale de la geometria, asi que
// resolver y recalcular se repite hasta que ya nada cambia (settle). Si no se estabiliza se avisa y se deshace.
import { isNamedDim, dimLetter, DIM_KIND } from './model.js';
import { dimValue, angTrue, initAngle, trackAngles } from './dims.js';
import { parseValue, exprRefs, renameInExpr, isReservedName, NAME_RE } from './expr.js';

const DEG = Math.PI / 180;
const named = (doc) => Object.entries(doc.cons).filter(([, k]) => isNamedDim(k) && k.name);
const drivers = (doc) => named(doc).filter(([, k]) => !k.ref);

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
  for (const [id, k] of named(doc)) if (id !== exceptId) out[k.name] = varValue(doc, k);
  return out;
}
// Texto corto de las variables para mostrarlas al escribir una formula: "D1 = 25, A1 = 45°".
export function varsList(doc, exceptId = null) {
  return named(doc).filter(([id]) => id !== exceptId).map(([, k]) => {
    const v = dimValue(doc, k), x = k.t === 'RAD' && k.refs[0] in doc.circles ? 2 * v : v;
    return `${k.name} = ${Math.round(x * 1000) / 1000}${k.t === 'ANG' ? '°' : ''}${k.ref ? ' (lectura)' : ''}`;
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
  // las salidas de los textos ([=D1]) tambien siguen al nombre
  for (const t of Object.values(doc.texts || {})) if (typeof t.text === 'string' && t.text.includes('[=')) t.text = t.text.replace(/\[=([^\]]*)\]/g, (m, ex) => '[=' + renameInExpr(ex, old, name) + ']');
}

// Evalua en orden las cotas definidas con formula. { ok: true } o { ok: false, error } sin dejar nada a medias:
// si algo falla no se modifica ninguna cota.
// omega < 1 amortigua (subrelajacion): el valor nuevo solo avanza esa fraccion hacia el de la formula; evita que una
// realimentacion con pendiente -1 oscile para siempre al repetir.
// hook(id, viejo, formula): si se da, decide el valor nuevo (settle lo usa para aplicar el metodo de la secante).
export function recompute(doc, omega = 1, hook = null) {
  for (const [, k] of drivers(doc)) if (k.t === 'ANG' && k.expr && k.cur === undefined) initAngle(doc, k); // las angulares con formula usan valor continuo
  const dr = drivers(doc), byName = new Map(named(doc).map(([id, k]) => [k.name, id])), f = dr.filter(([, k]) => k.expr);
  const deps = new Map();
  for (const [id, k] of f) {
    const ids = [];
    for (const n of exprRefs(k.expr)) {
      if (n === k.name) return { ok: false, error: `${k.name} no puede usarse en su propia fórmula` };
      if (!byName.has(n)) return { ok: false, error: `En la fórmula de ${k.name}: «${n}» no es una cota` };
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
  let resid = 0; // cuanto se aleja cada valor actual de lo que dice su formula (antes de amortiguar)
  for (const id of order) {
    const k = doc.cons[id];
    let val;
    try { val = parseValue(k.expr, { angle: k.t === 'ANG', radians: k.t === 'ANG' && k.unit === 'rad', vars: varsOf(doc, id) }); } catch (e) { doc.cons = JSON.parse(bak); return { ok: false, error: `${k.name}: ${e.message}` }; }
    if (k.t === 'ANG') { // el angulo no tiene limite (400° = una vuelta y 40°): se trabaja con el valor continuo
      const old = k.cur;
      resid = Math.max(resid, Math.abs(val - old) / (1 + Math.abs(val)));
      k.cur = hook ? hook(id, old, val, false) : omega === 1 ? val : old + omega * (val - old);
      k.v = angTrue(doc, { ...k, ref: false }, k.cur);
    } else {
      if (!(val > 0)) { doc.cons = JSON.parse(bak); return { ok: false, error: `${k.name} quedaría en ${Math.round(val * 1000) / 1000}: debe ser mayor que cero` }; }
      const tv = k.t === 'RAD' && k.refs[0] in doc.circles ? val / 2 : val;
      resid = Math.max(resid, Math.abs(tv - k.v) / (1 + Math.abs(tv)));
      k.v = hook ? hook(id, k.v, tv, true) : omega === 1 ? tv : k.v + omega * (tv - k.v);
    }
  }
  return { ok: true, count: order.length, resid };
}

// Quita la formula (queda el valor actual) de las cotas cuyas variables ya no existen.
// Devuelve los nombres afectados.
export function pruneFormulas(doc) {
  const names = new Set(named(doc).map(([, k]) => k.name)), out = [];
  for (const k of Object.values(doc.cons)) {
    if (!k.expr) continue;
    if (!isNamedDim(k) || k.ref || exprRefs(k.expr).some((n) => !names.has(n) || n === k.name)) { delete k.expr; if (k.name) out.push(k.name); }
  }
  return out;
}

// ¿Alguna cota con formula lee una cota de solo lectura? Entonces cada cambio de la geometria puede mover esas cotas.
export function hasReactive(doc) {
  const refs = new Set(named(doc).filter(([, k]) => k.ref).map(([, k]) => k.name));
  if (!refs.size) return false;
  return drivers(doc).some(([, k]) => k.expr && exprRefs(k.expr).some((n) => refs.has(n)));
}

// Puntos que miden las cotas de solo lectura que leen las formulas (las entradas del sistema).
function measuredPoints(doc) {
  const want = new Set();
  for (const [, k] of drivers(doc)) if (k.expr) for (const n of exprRefs(k.expr)) want.add(n);
  const pts = new Set(), endsOf = (lid) => { const l = doc.lines[lid]; if (l) { pts.add(l.a); pts.add(l.b); } };
  for (const [, k] of named(doc)) {
    if (!k.ref || !want.has(k.name)) continue;
    if (k.t === 'DIST') k.refs.forEach((p) => pts.add(p));
    else if (k.t === 'DISTPL') { pts.add(k.refs[0]); endsOf(k.refs[1]); }
    else if (k.t === 'ANG') k.refs.forEach(endsOf);
    else if (k.t === 'RAD') { const o = doc.circles[k.refs[0]] || doc.arcs[k.refs[0]]; if (o) pts.add(o.c); }
  }
  return pts;
}

// ¿La geometria cumple las cotas con formula? (con puntos fijos, el solver puede dar por buena una cota que no se cumple)
function formulasHold(doc) {
  for (const [, k] of drivers(doc)) {
    if (!k.expr) continue;
    const m = dimValue(doc, { ...k, ref: true }), tv = k.t === 'ANG' ? k.cur : k.v;
    if (Math.abs(m - tv) > 2e-3 * (1 + Math.abs(tv))) return false;
  }
  return true;
}

// Recalcula las formulas y resuelve la geometria; si alguna lee cotas de solo lectura, repite hasta que las formulas
// concuerden con lo medido. Es un punto fijo x = g(x) (x: valor de la cota, g: lo que da su formula con la geometria
// ya resuelta). La primera vuelta es directa; despues se usa el metodo de la secante por cota (converge en pocas
// vueltas aunque la pendiente de g sea -1, donde la repeticion simple oscilaria) y, si la secante no sirve, se
// amortigua a la mitad. solveFn(doc, targets) devuelve { ok }. Resultado: { ok, error?, iter, count }.
export function settle(doc, solveFn, targets = [], { maxIter = 40, tol = 1e-5 } = {}) {
  const loop = hasReactive(doc);
  if (!loop) {
    const rc = recompute(doc);
    if (!rc.ok) return { ok: false, error: rc.error, iter: 1 };
    const r = solveFn(doc, targets);
    if (r.ok) trackAngles(doc);
    return r.ok ? { ok: true, iter: 1, count: rc.count } : { ok: false, error: null, iter: 1, count: rc.count };
  }
  const bak = JSON.stringify(doc);
  const restoreTo = (json) => { const o = JSON.parse(json); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, o); };
  const restore = () => restoreTo(bak);
  // Tres estrategias, de la mas fiel a la mas tolerante (la primera que cierra gana):
  //  1. «entradas fijas»: los puntos que miden las cotas de solo lectura de las formulas (las entradas) y el punto arrastrado
  //     que ya llego a su destino se dejan fijos mientras se resuelve. Asi la salida no puede "empujar" a la entrada (en una
  //     evolvente, mover el punto tangente en vez de alargar la cuerda) y la formula no persigue su propia cola.
  //  2. secante con el punto arrastrado ya llegado fijo y, si no, el objetivo suave de siempre (casos donde la entrada tiene
  //     que moverse para cumplir la salida).
  //  3. repeticion amortiguada.
  const near = (t) => doc.pts[t.id] && Math.hypot(doc.pts[t.id].x - t.x, doc.pts[t.id].y - t.y) <= 1e-5;
  const solvePinned = (ids, tg) => {
    ids.forEach((id) => { doc.pts[id].fixed = true; });
    try { return solveFn(doc, tg); } finally { ids.forEach((id) => { if (doc.pts[id]) doc.pts[id].fixed = false; }); }
  };
  const run = (withInputs) => {
    const moving = new Set(targets.filter((t) => !near(t)).map((t) => t.id));
    const arrived = targets.filter((t) => doc.pts[t.id] && !doc.pts[t.id].fixed && near(t)).map((t) => t.id);
    const tg = targets.filter((t) => !near(t));
    if (withInputs) {
      const inputs = [...measuredPoints(doc)].filter((id) => doc.pts[id] && !doc.pts[id].fixed && !moving.has(id));
      const r = solvePinned([...new Set([...inputs, ...arrived])], tg);
      return r.ok && formulasHold(doc) ? r : { ok: false, conflicts: r.conflicts || [] }; // con puntos fijos, el solver puede dar por buena una cota que no se cumple
    }
    if (arrived.length) { const r = solvePinned(arrived, tg); if (r.ok) return r; }
    return solveFn(doc, targets);
  };
  let last = null;
  const modes = measuredPoints(doc).size ? ['pinned', 'secant', 'damped'] : ['secant', 'damped'];
  for (const mode of modes) {
    const hist = new Map();
    const hook = (id, old, tv, positive) => {
      if (mode === 'damped') return old + 0.5 * (tv - old);
      const h = hist.get(id);
      hist.set(id, { x: old, g: tv });
      if (!h) return tv;
      const dx = old - h.x;
      if (Math.abs(dx) > 1e-12) {
        const d = (tv - h.g) / dx - 1; // pendiente de g(x) - x
        if (Number.isFinite(d) && Math.abs(d) > 1e-3) {
          const nx = old - (tv - old) / d;
          if (Number.isFinite(nx) && (!positive || nx > 0) && Math.abs(nx - old) <= 20 * Math.abs(tv - old) + 1e-9) return nx;
        }
      }
      return old + 0.5 * (tv - old);
    };
    if (mode !== modes[0]) restore();
    last = null; // el motivo del fallo es el de la ultima estrategia
    for (let i = 1; i <= (mode === 'damped' ? 2 * maxIter : maxIter); i++) {
      const snap = JSON.stringify(doc);
      const rc = recompute(doc, 1, hook);
      if (!rc.ok) { restore(); return { ok: false, error: rc.error, iter: i }; }
      if (i > 1 && rc.resid <= tol) return { ok: true, iter: i, count: rc.count };
      let r = run(mode === 'pinned');
      if (!r.ok) { // un cambio grande de golpe: se reintenta avanzando solo una fraccion hacia el valor de las formulas
        for (const w of [0.5, 0.25, 0.125, 0.0625]) {
          restoreTo(snap); recompute(doc, w);
          r = run(mode === 'pinned');
          if (r.ok) break;
        }
      }
      if (!r.ok) { last = { ok: false, error: null, iter: i, count: rc.count }; break; }
      trackAngles(doc); // los angulos de referencia siguen la medida (sin saltos de 180° a 0°)
    }
  }
  restore();
  return last || { ok: false, error: 'Las cotas con fórmulas que leen medidas no se estabilizan: una depende de otra que cambia al resolverla (¿se realimentan?)', iter: maxIter };
}

export { DIM_KIND, dimLetter };

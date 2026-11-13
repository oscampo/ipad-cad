// Evaluador de expresiones matematicas para las cotas ("3π/4", "10*sin(30)", "10+1/3"). Sin eval.
// Devuelve { value, rad }: rad indica que el valor viene de π (esta en radianes), para que una cota angular
// lo convierta a grados. sin/cos/tan toman grados, salvo que su argumento contenga π (entonces radianes).
// Variables: las cotas con nombre (D1, A1, R2, O3 o el que les des) se pueden usar en las formulas: vars = { nombre: { v, r } }.
// Un angulo vale su medida en radianes (r = true), igual que π: sin(A1) funciona y R*A1 es la longitud de arco.

const TAU_DEG = 180 / Math.PI;
const FUNCS = {
  sin: (x, r) => Math.sin(r ? x : x / TAU_DEG), sen: (x, r) => Math.sin(r ? x : x / TAU_DEG),
  cos: (x, r) => Math.cos(r ? x : x / TAU_DEG), tan: (x, r) => Math.tan(r ? x : x / TAU_DEG),
  asin: (x, r, rm) => (rm ? Math.asin(x) : Math.asin(x) * TAU_DEG), acos: (x, r, rm) => (rm ? Math.acos(x) : Math.acos(x) * TAU_DEG), atan: (x, r, rm) => (rm ? Math.atan(x) : Math.atan(x) * TAU_DEG),
  sqrt: Math.sqrt, raiz: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10,
};
const KEEP_RAD = new Set(['sqrt', 'raiz', 'abs']); // conservan la marca de radianes del argumento
const CONSTS = { pi: Math.PI, π: Math.PI, e: Math.E };

// Nombres que no puede llevar una cota: funciones y constantes del evaluador.
export const isReservedName = (n) => { const l = String(n).toLowerCase(); return l in FUNCS || l in CONSTS || l === 'log10'; };
export const NAME_RE = /^[A-Za-zα-ωΑ-Ω_][A-Za-z0-9α-ωΑ-Ω_]*$/;
const ID_RE = /^[A-Za-zα-ωΑ-Ω_][A-Za-z0-9α-ωΑ-Ω_]*/;

// loose: no falla con identificadores desconocidos (para listar las variables de una formula)
function tokenize(src, vars = null, loose = false) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    let m = /^(\d+([.,]\d+)?|[.,]\d+)/.exec(src.slice(i));
    if (m) { toks.push({ t: 'num', v: Number(m[0].replace(',', '.')), i, j: i + m[0].length }); i += m[0].length; continue; }
    if (c === '√') { toks.push({ t: 'sqrt', i, j: i + 1 }); i++; continue; }
    if (c === 'π') { toks.push({ t: 'id', v: 'π', i, j: i + 1 }); i++; continue; }
    m = ID_RE.exec(src.slice(i));
    if (m) {
      const raw = m[0], name = raw.toLowerCase();
      if (vars && Object.prototype.hasOwnProperty.call(vars, raw)) toks.push({ t: 'var', v: raw, i, j: i + raw.length });
      else if (name in FUNCS || name in CONSTS) toks.push({ t: 'id', v: name, i, j: i + raw.length });
      else if (loose) toks.push({ t: 'var', v: raw, i, j: i + raw.length });
      else throw new Error(`No reconozco «${raw}»` + (/\d/.test(raw) || raw.length === 1 ? ' (no hay una cota con ese nombre)' : ''));
      i += raw.length; continue;
    }
    if (c === '*' && src[i + 1] === '*') { toks.push({ t: 'op', v: '^', i, j: i + 2 }); i += 2; continue; }
    if ('+-*/^()×÷·−'.includes(c)) { toks.push({ t: 'op', v: c === '×' || c === '·' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c, i, j: i + 1 }); i++; continue; }
    throw new Error(`Carácter no válido «${c}»`);
  }
  return toks;
}

// Variables que usa una formula (nombres que no son numeros, funciones ni constantes).
export function exprRefs(src) {
  try { return [...new Set(tokenize(String(src ?? ''), null, true).filter((k) => k.t === 'var').map((k) => k.v))]; } catch (e) { return []; }
}
// Cambia el nombre de una variable dentro de una formula (solo la palabra entera).
export function renameInExpr(src, from, to) {
  let out = '', last = 0;
  try {
    for (const k of tokenize(String(src ?? ''), null, true)) if (k.t === 'var' && k.v === from) { out += src.slice(last, k.i) + to; last = k.j; }
  } catch (e) { return src; }
  return out + src.slice(last);
}

export function evalExpr(src, { radians = false, vars = null } = {}) {
  const toks = tokenize(String(src ?? ''), vars);
  if (!toks.length) throw new Error('Escribe un valor');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const startsFactor = () => { const k = peek(); return k && (k.t === 'num' || k.t === 'id' || k.t === 'var' || k.t === 'sqrt' || (k.t === 'op' && k.v === '(')); };
  const bin = (a, b, v) => ({ v, r: a.r || b.r });

  function expr() {
    let a = term();
    while (isOp('+') || isOp('-')) { const o = toks[p++].v; const b = term(); a = bin(a, b, o === '+' ? a.v + b.v : a.v - b.v); }
    return a;
  }
  function term() {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const o = toks[p++].v; const b = unary(); if (o === '/' && b.v === 0) throw new Error('División entre cero'); a = bin(a, b, o === '*' ? a.v * b.v : a.v / b.v); }
      else if (startsFactor()) { const b = unary(); a = bin(a, b, a.v * b.v); } // multiplicacion implicita: 2π, 3(4+1)
      else return a;
    }
  }
  function unary() {
    if (isOp('-')) { p++; const a = unary(); return { v: -a.v, r: a.r }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power() {
    const a = primary();
    if (isOp('^')) { p++; const b = unary(); return { v: Math.pow(a.v, b.v), r: a.r }; }
    return a;
  }
  function primary() {
    const k = toks[p++];
    if (!k) throw new Error('Expresión incompleta');
    if (k.t === 'num') return { v: k.v, r: false };
    if (k.t === 'var') return { v: vars[k.v].v, r: !!vars[k.v].r };
    if (k.t === 'sqrt') { const a = primary(); if (a.v < 0) throw new Error('Raíz de un número negativo'); return { v: Math.sqrt(a.v), r: a.r }; }
    if (k.t === 'op' && k.v === '(') {
      const a = expr();
      if (!isOp(')')) throw new Error('Falta cerrar un paréntesis');
      p++;
      return a;
    }
    if (k.t === 'id') {
      if (k.v in CONSTS) return { v: CONSTS[k.v], r: k.v === 'pi' || k.v === 'π' };
      if (!isOp('(')) throw new Error(`«${k.v}» necesita paréntesis, p. ej. ${k.v}(30)`);
      p++;
      const a = expr();
      if (!isOp(')')) throw new Error('Falta cerrar un paréntesis');
      p++;
      const v = FUNCS[k.v](a.v, a.r || radians, radians);
      return { v, r: KEEP_RAD.has(k.v) ? a.r : false };
    }
    throw new Error('Expresión no válida');
  }
  const res = expr();
  if (p < toks.length) throw new Error('Sobra algo al final de la expresión');
  if (!Number.isFinite(res.v)) throw new Error('El resultado no es un número');
  return { value: res.v, rad: res.r };
}

// ¿El texto es un numero sin mas? (entonces no se guarda como formula)
export const isPlainNumber = (s) => /^\s*[-+]?(\d+([.,]\d+)?|[.,]\d+)\s*$/.test(String(s));

// Valor numerico de lo que escribio el usuario; angle: lo que viene de π se pasa de radianes a grados.
// radians: la cota angular se escribe en radianes (los numeros y sin/cos/tan van en radianes); si no, en grados.
export function parseValue(src, { angle = false, radians = false, vars = null } = {}) {
  const { value, rad } = evalExpr(src, { radians: angle && radians, vars });
  return Number((angle && (rad || radians) ? value * TAU_DEG : value).toPrecision(12));
}

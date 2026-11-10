// Evaluador de expresiones matematicas para las cotas ("3π/4", "10*sin(30)", "10+1/3"). Sin eval.
// Devuelve { value, rad }: rad indica que el valor viene de π (esta en radianes), para que una cota angular
// lo convierta a grados. sin/cos/tan toman grados, salvo que su argumento contenga π (entonces radianes).

const TAU_DEG = 180 / Math.PI;
const FUNCS = {
  sin: (x, r) => Math.sin(r ? x : x / TAU_DEG), sen: (x, r) => Math.sin(r ? x : x / TAU_DEG),
  cos: (x, r) => Math.cos(r ? x : x / TAU_DEG), tan: (x, r) => Math.tan(r ? x : x / TAU_DEG),
  asin: (x) => Math.asin(x) * TAU_DEG, acos: (x) => Math.acos(x) * TAU_DEG, atan: (x) => Math.atan(x) * TAU_DEG,
  sqrt: Math.sqrt, raiz: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10,
};
const KEEP_RAD = new Set(['sqrt', 'raiz', 'abs']); // conservan la marca de radianes del argumento
const CONSTS = { pi: Math.PI, π: Math.PI, e: Math.E };

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    let m = /^(\d+([.,]\d+)?|[.,]\d+)/.exec(src.slice(i));
    if (m) { toks.push({ t: 'num', v: Number(m[0].replace(',', '.')) }); i += m[0].length; continue; }
    if (c === '√') { toks.push({ t: 'sqrt' }); i++; continue; }
    if (c === 'π') { toks.push({ t: 'id', v: 'π' }); i++; continue; }
    m = /^(log10|[a-zA-Z]+)/.exec(src.slice(i));
    if (m) {
      const name = m[0].toLowerCase();
      if (!(name in FUNCS) && !(name in CONSTS)) throw new Error(`No reconozco «${m[0]}»`);
      toks.push({ t: 'id', v: name }); i += m[0].length; continue;
    }
    if (c === '*' && src[i + 1] === '*') { toks.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^()×÷·−'.includes(c)) { toks.push({ t: 'op', v: c === '×' || c === '·' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c }); i++; continue; }
    throw new Error(`Carácter no válido «${c}»`);
  }
  return toks;
}

export function evalExpr(src) {
  const toks = tokenize(String(src ?? ''));
  if (!toks.length) throw new Error('Escribe un valor');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const startsFactor = () => { const k = peek(); return k && (k.t === 'num' || k.t === 'id' || k.t === 'sqrt' || (k.t === 'op' && k.v === '(')); };
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
      const v = FUNCS[k.v](a.v, a.r);
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
export function parseValue(src, { angle = false } = {}) {
  const { value, rad } = evalExpr(src);
  return Number((angle && rad ? value * TAU_DEG : value).toPrecision(12));
}

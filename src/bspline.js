// B-spline cubico interpolante (pasa por todos los puntos de dato), con la MISMA convencion de nudos y
// polos que planegcs / FreeCAD, para que la curva que se dibuja sea exactamente la que resuelve el solver.
//  - abierto: nudos en cada punto de dato, extremos con multiplicidad 4, N+2 polos y curvatura nula en
//    los extremos (el 2.o polo es el punto medio del 1.o y el 3.o; igual al final), condicion que el
//    solver expresa con una restriccion de punto medio;
//  - cerrado: periodico, N polos y N+1 nudos simples.
// La curva queda determinada por los puntos de dato y sus parametros ts (longitud de cuerda).
export const DEG = 3;

// Parametros de los puntos (0..1), estrictamente crecientes. Abierto: N valores; cerrado: N+1 (el ultimo es
// la vuelta al primer punto).
export function chordParams(Q, closed = false) {
  const n = Q.length, m = closed ? n : n - 1;
  const d = [];
  let tot = 0;
  for (let i = 0; i < m; i++) { const a = Q[i], b = Q[(i + 1) % n]; const l = Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)); d.push(l); tot += l; }
  const min = tot > 0 ? tot * 1e-6 : 1; // puntos repetidos: tramo minimo para que los nudos no coincidan
  let s = 0;
  const acc = [0];
  for (let i = 0; i < m; i++) { s += Math.max(d[i], min); acc.push(s); }
  return acc.map((v) => v / s);
}

export const validParams = (ts, n, closed) => Array.isArray(ts) && ts.length === (closed ? n + 1 : n) && ts.every((v, i) => Number.isFinite(v) && (i === 0 || v > ts[i - 1]));

// Vector de nudos "aplanado" (con repeticiones), igual que BSpline::setupFlattenedKnots de planegcs.
export function flatKnots(ts, closed) {
  const n = ts.length;
  if (!closed) return [ts[0], ts[0], ts[0], ...ts, ts[n - 1], ts[n - 1], ts[n - 1]];
  const T = ts[n - 1] - ts[0];
  return [ts[n - 4] - T, ts[n - 3] - T, ts[n - 2] - T, ...ts, ts[1] + T, ts[2] + T, ts[3] + T];
}

// De Boor generalizado (blossom): con u1=u2=u3=u da el punto de la curva. d: los 4 valores de control del
// tramo s (polos s..s+3).
function blossom(flat, d, s, u1, u2, u3) {
  const k = s + DEG, us = [u1, u2, u3];
  const v = d.slice();
  for (let r = 1; r <= DEG; r++) {
    for (let j = DEG; j >= r; j--) {
      const a = (us[r - 1] - flat[j + k - DEG]) / (flat[j + 1 + k - r] - flat[j + k - DEG]);
      v[j] = (1 - a) * v[j - 1] + a * v[j];
    }
  }
  return v[DEG];
}
const UNIT = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
// Pesos de los polos s..s+3 en el parametro u (del tramo s).
const weights = (flat, s, u) => UNIT.map((e) => blossom(flat, e, s, u, u, u));

function solveLinear(A, bx, by) {
  const n = A.length;
  const M = A.map((r, i) => [...r, bx[i], by[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const row = M[c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / row[c];
      if (!f) continue;
      const Mr = M[r];
      for (let k = c; k < n + 2; k++) Mr[k] -= f * row[k];
    }
  }
  const x = Array(n), y = Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sx = M[i][n], sy = M[i][n + 1];
    for (let k = i + 1; k < n; k++) { sx -= M[i][k] * x[k]; sy -= M[i][k] * y[k]; }
    x[i] = sx / M[i][i]; y[i] = sy / M[i][i];
  }
  return x.map((v, i) => ({ x: v, y: y[i] }));
}

// Datos del B-spline que pasa por Q: { ts, flat, G (polos en el orden del solver), closed, spans, n }.
// Devuelve null si no se puede (menos de 2 puntos, o menos de 3 en un cerrado).
export function bsplineThrough(Q, closed = false, ts = null) {
  const n = Q.length;
  if (n < 2 || (closed && n < 3)) return null;
  if (!validParams(ts, n, closed)) ts = chordParams(Q, closed);
  const flat = flatKnots(ts, closed);
  let G;
  if (closed) {
    const A = Q.map((_, k) => { const row = Array(n).fill(0), w = weights(flat, k, ts[k]); for (let i = 0; i <= DEG; i++) row[(k + i) % n] += w[i]; return row; });
    G = solveLinear(A, Q.map((q) => q.x), Q.map((q) => q.y));
  } else {
    const M = n + 2, A = [], bx = [], by = [];
    const push = (row, q) => { A.push(row); bx.push(q ? q.x : 0); by.push(q ? q.y : 0); };
    const zero = () => Array(M).fill(0);
    let r = zero(); r[0] = 1; push(r, Q[0]);
    r = zero(); r[0] = -1; r[1] = 2; r[2] = -1; push(r, null); // G1 = punto medio de G0 y G2
    for (let k = 1; k < n - 1; k++) { r = zero(); const w = weights(flat, k, ts[k]); for (let i = 0; i <= DEG; i++) r[k + i] += w[i]; push(r, Q[k]); }
    r = zero(); r[M - 3] = -1; r[M - 2] = 2; r[M - 1] = -1; push(r, null); // G[M-2] = punto medio de G[M-3] y G[M-1]
    r = zero(); r[M - 1] = 1; push(r, Q[n - 1]);
    G = solveLinear(A, bx, by);
  }
  if (!G) return null;
  return { ts, flat, G, closed, spans: closed ? n : n - 1, n };
}

const ctrl = (bs, s) => { const m = bs.G.length; return [0, 1, 2, 3].map((i) => bs.G[bs.closed ? (s + i) % m : s + i]); };
const comb = (flat, s, C, u1, u2, u3) => ({ x: blossom(flat, C.map((c) => c.x), s, u1, u2, u3), y: blossom(flat, C.map((c) => c.y), s, u1, u2, u3) });

// Tramo s como curva de Bezier cubica: { p0, c1, c2, p1 }.
export function spanBezier(bs, s) {
  const a = bs.ts[s], b = bs.ts[s + 1], C = ctrl(bs, s), f = bs.flat;
  return { p0: comb(f, s, C, a, a, a), c1: comb(f, s, C, a, a, b), c2: comb(f, s, C, a, b, b), p1: comb(f, s, C, b, b, b) };
}
export const bsplineBezier = (bs) => Array.from({ length: bs.spans }, (_, s) => spanBezier(bs, s));

// Tramo al que pertenece el parametro u (acotado al dominio).
export function spanOf(bs, u) {
  let s = 0;
  while (s < bs.spans - 1 && u >= bs.ts[s + 1]) s++;
  return s;
}
// Punto de la curva en el parametro u (en un cerrado, u se toma modulo el periodo).
export function bsplinePoint(bs, u) {
  const t0 = bs.ts[0], T = bs.ts[bs.ts.length - 1] - t0;
  if (bs.closed) u = t0 + ((((u - t0) % T) + T) % T);
  else u = Math.min(bs.ts[bs.ts.length - 1], Math.max(t0, u));
  const s = spanOf(bs, u);
  return comb(bs.flat, s, ctrl(bs, s), u, u, u);
}

// Poligonal muestreada: per puntos por tramo (el primero de la curva + per por cada tramo).
export function bsplineSamples(bs, per = 16) {
  const out = [];
  for (let s = 0; s < bs.spans; s++) {
    const { p0, c1, c2, p1 } = spanBezier(bs, s);
    if (s === 0) out.push({ x: p0.x, y: p0.y });
    for (let i = 1; i <= per; i++) {
      const t = i / per, m = 1 - t;
      const w0 = m * m * m, w1 = 3 * m * m * t, w2 = 3 * m * t * t, w3 = t * t * t;
      out.push({ x: w0 * p0.x + w1 * c1.x + w2 * c2.x + w3 * p1.x, y: w0 * p0.y + w1 * c1.y + w2 * c2.y + w3 * p1.y });
    }
  }
  return out;
}
// Parametro u del punto (indice i de tramo de la poligonal, fraccion f dentro de el) de bsplineSamples.
export function sampleParam(bs, per, i, f) {
  const s = Math.min(bs.spans - 1, Math.floor(i / per)), loc = (i - s * per + f) / per;
  return bs.ts[s] + loc * (bs.ts[s + 1] - bs.ts[s]);
}

// Direccion (sin normalizar) de la tangente de la curva en el parametro u.
export function bsplineTangent(bs, u) {
  const t0 = bs.ts[0], t1 = bs.ts[bs.ts.length - 1], h = (t1 - t0) * 1e-5;
  let a = u - h, b = u + h;
  if (!bs.closed) { a = Math.max(t0, a); b = Math.min(t1, b); }
  const A = bsplinePoint(bs, a), B = bsplinePoint(bs, b);
  return { x: B.x - A.x, y: B.y - A.y };
}

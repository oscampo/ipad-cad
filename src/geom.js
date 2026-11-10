// Geometria 2D pura (sin DOM), reutilizable en pruebas de Node.
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function closestOnSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy, t };
}

// Interseccion de dos rectas infinitas (por 2 puntos cada una). null si son paralelas.
export function lineLine(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

// Recta infinita (a,b) con circulo (c,r): 0, 1 o 2 puntos.
export function lineCircle(a, b, c, r) {
  const d = { x: b.x - a.x, y: b.y - a.y }, f = { x: a.x - c.x, y: a.y - c.y };
  const A = d.x * d.x + d.y * d.y, B = 2 * (f.x * d.x + f.y * d.y), C = f.x * f.x + f.y * f.y - r * r;
  if (A < 1e-12) return [];
  let D = B * B - 4 * A * C;
  if (D < -1e-9) return [];
  D = Math.sqrt(Math.max(D, 0));
  const ts = D < 1e-9 ? [-B / (2 * A)] : [(-B - D) / (2 * A), (-B + D) / (2 * A)];
  return ts.map((t) => ({ x: a.x + t * d.x, y: a.y + t * d.y }));
}

// Dos circulos: 0, 1 o 2 puntos.
export function circleCircle(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d < 1e-12 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
  const ux = (c2.x - c1.x) / d, uy = (c2.y - c1.y) / d;
  const mx = c1.x + a * ux, my = c1.y + a * uy;
  if (h < 1e-9) return [{ x: mx, y: my }];
  return [{ x: mx - h * uy, y: my + h * ux }, { x: mx + h * uy, y: my - h * ux }];
}

// Angulo con signo (rad) desde la direccion u hasta la direccion v.
export function signedAngle(u, v) {
  return Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
}

// Convierte un patron de tipo de linea ("12 -3 2 -3": + trazo, - hueco, 0 punto)
// en un arreglo para setLineDash (trazo, hueco, trazo, hueco...) en unidades de papel.
export function dashFromPattern(pattern, dotLen = 0.6) {
  const out = [];
  let expectDash = true;
  for (const raw of pattern) {
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    if (expectDash) {
      if (v < 0) { out.push(0, -v); } else { out.push(v === 0 ? dotLen : v); expectDash = false; }
    } else if (v < 0) { out.push(-v); expectDash = true; }
    else { out.push(0, v === 0 ? dotLen : v); expectDash = false; }
  }
  if (!expectDash) out.push(0);
  return out;
}

export function parsePattern(text) {
  const nums = String(text).split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!nums.length || nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

// ---------------------------------------------------------------- arcos
export const TAU = Math.PI * 2;
export const norm = (a) => ((a % TAU) + TAU) % TAU;

// Circulo por 3 puntos; null si son colineales.
export function circumcircle(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { c: { x, y }, r: Math.hypot(a.x - x, a.y - y) };
}

// Arco antihorario del centro c desde el punto a hasta el punto b.
// Si a y b coinciden, es el arco de 360 grados.
export function arcSweepOf(c, a, b) {
  const a0 = Math.atan2(a.y - c.y, a.x - c.x), a1 = Math.atan2(b.y - c.y, b.x - c.x);
  let sweep = norm(a1 - a0);
  if (sweep < 1e-7) sweep = TAU;
  return { a0, sweep };
}

// ¿El punto p (visto desde c) cae dentro del barrido [a0, a0+sweep]? tol en radianes.
export function inSweep(c, a0, sweep, p, tol = 0) {
  const d = norm(Math.atan2(p.y - c.y, p.x - c.x) - a0);
  return d <= sweep + tol || d >= TAU - tol;
}

// Angulo del punto p respecto de a0, en [0, 2pi).
export const angleFrom = (c, a0, p) => norm(Math.atan2(p.y - c.y, p.x - c.x) - a0);

// Arco por 3 puntos A (inicio), M (intermedio) y B (fin). El arco del solver es siempre
// antihorario: si A->B antihorario no pasa por M, el arco real va de B a A.
export function arcThrough3(A, M, B) {
  const cc = circumcircle(A, M, B);
  if (!cc) return null;
  const ang = (p) => Math.atan2(p.y - cc.c.y, p.x - cc.c.x);
  const sAB = norm(ang(B) - ang(A));
  const sAM = norm(ang(M) - ang(A));
  return { c: cc.c, r: cc.r, startIsA: sAM < sAB };
}

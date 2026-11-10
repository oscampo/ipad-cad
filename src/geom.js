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

// ---------------------------------------------------------------- splines
// Curva que pasa por todos los puntos P (Catmull-Rom centripeta: sin bucles ni picos).
// closed: curva cerrada. per: muestras por tramo. Devuelve la poligonal muestreada.
export function splineSamples(P, closed = false, per = 16) {
  const n = P.length;
  if (n < 2) return P.map((p) => ({ x: p.x, y: p.y }));
  if (n === 2 && !closed) return [{ x: P[0].x, y: P[0].y }, { x: P[1].x, y: P[1].y }];
  const refl = (a, b) => ({ x: 2 * a.x - b.x, y: 2 * a.y - b.y });
  const at = (i) => {
    if (closed) return P[((i % n) + n) % n];
    if (i < 0) return refl(P[0], P[1]);
    if (i >= n) return refl(P[n - 1], P[n - 2]);
    return P[i];
  };
  const segs = closed ? n : n - 1;
  const out = [{ x: P[0].x, y: P[0].y }];
  const knot = (a, b) => Math.sqrt(Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-9));
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    for (let k = 1; k <= per; k++) {
      if (k === per) { out.push({ x: p2.x, y: p2.y }); break; }
      const t = t1 + ((t2 - t1) * k) / per;
      const a1 = lerp(p0, p1, (t - t0) / (t1 - t0)), a2 = lerp(p1, p2, (t - t1) / (t2 - t1)), a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
      const b1 = lerp(a1, a2, (t - t0) / (t2 - t0)), b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
      out.push(lerp(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  return out;
}

// Longitud acumulada de una poligonal.
export function polylineLength(P) {
  let L = 0;
  for (let i = 1; i < P.length; i++) L += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
  return L;
}

// n puntos repartidos a distancias iguales (por longitud de arco) sobre la poligonal P, con los extremos incluidos.
export function resamplePolyline(P, n) {
  const total = polylineLength(P);
  if (P.length < 2 || n < 2 || !(total > 0)) return P.slice();
  const out = [{ x: P[0].x, y: P[0].y }];
  let acc = 0, k = 1;
  for (let i = 1; i < P.length && k < n - 1; i++) {
    const seg = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
    while (k < n - 1 && acc + seg >= (total * k) / (n - 1) - 1e-12) {
      const f = seg > 0 ? ((total * k) / (n - 1) - acc) / seg : 0;
      out.push({ x: P[i - 1].x + (P[i].x - P[i - 1].x) * f, y: P[i - 1].y + (P[i].y - P[i - 1].y) * f });
      k++;
    }
    acc += seg;
  }
  out.push({ x: P[P.length - 1].x, y: P[P.length - 1].y });
  return out;
}

// El mismo spline que splineSamples, pero como tramos de Bezier cubica exactos
// (p0, c1, c2, p1): cada tramo de una Catmull-Rom centripeta es un polinomio cubico.
// Sirve para exportar curvas suaves (SVG para corte laser) sin facetas.
export function splineBezier(P, closed = false) {
  const n = P.length;
  if (n < 2) return [];
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  if (n === 2 && !closed) return [{ p0: P[0], c1: lerp(P[0], P[1], 1 / 3), c2: lerp(P[0], P[1], 2 / 3), p1: P[1] }];
  const refl = (a, b) => ({ x: 2 * a.x - b.x, y: 2 * a.y - b.y });
  const at = (i) => {
    if (closed) return P[((i % n) + n) % n];
    if (i < 0) return refl(P[0], P[1]);
    if (i >= n) return refl(P[n - 1], P[n - 2]);
    return P[i];
  };
  const knot = (a, b) => Math.sqrt(Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-9));
  const segs = closed ? n : n - 1, out = [];
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3), t0 = 0, dt = t2 - t1;
    const m = (a, b, ta, tb) => ({ x: (b.x - a.x) / (tb - ta), y: (b.y - a.y) / (tb - ta) });
    const a01 = m(p0, p1, t0, t1), a02 = m(p0, p2, t0, t2), a12 = m(p1, p2, t1, t2);
    const a13 = m(p1, p3, t1, t3), a23 = m(p2, p3, t2, t3);
    const m1 = { x: a01.x - a02.x + a12.x, y: a01.y - a02.y + a12.y };
    const m2 = { x: a12.x - a13.x + a23.x, y: a12.y - a13.y + a23.y };
    out.push({
      p0: p1, p1: p2,
      c1: { x: p1.x + (m1.x * dt) / 3, y: p1.y + (m1.y * dt) / 3 },
      c2: { x: p2.x - (m2.x * dt) / 3, y: p2.y - (m2.y * dt) / 3 },
    });
  }
  return out;
}

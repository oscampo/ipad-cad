import assert from 'node:assert/strict';
import { newDoc, addPoint, addLine, addCircle, addCon, nextId } from '../src/model.js';
import { initSolver, solve } from '../src/solver.js';
import { lineLine, lineCircle, circleCircle, signedAngle, dashFromPattern, parsePattern } from '../src/geom.js';

await initSolver();
const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} ${a} vs ${b}`);
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

t('geometria: interseccion recta-recta', () => {
  const p = lineLine({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
  near(p.x, 5); near(p.y, 5);
  assert.equal(lineLine({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null);
});
t('geometria: recta-circulo y circulo-circulo', () => {
  assert.equal(lineCircle({ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 }, 3).length, 2);
  assert.equal(lineCircle({ x: -5, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0 }, 3).length, 0);
  assert.equal(circleCircle({ x: 0, y: 0 }, 3, { x: 4, y: 0 }, 3).length, 2);
  assert.equal(circleCircle({ x: 0, y: 0 }, 1, { x: 10, y: 0 }, 1).length, 0);
});
t('tipos de linea: patron a dash', () => {
  assert.deepEqual(dashFromPattern([12, -3, 2, -3]), [12, 3, 2, 3]);
  assert.deepEqual(dashFromPattern([0, -3], 0.6), [0.6, 3]);
  assert.deepEqual(dashFromPattern([]), []);
  assert.deepEqual(parsePattern('12, -3  2 -3'), [12, -3, 2, -3]);
  assert.equal(parsePattern('a b'), null);
});

function lineDoc() {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 10), c = addPoint(d, 0, 10), e = addPoint(d, 10, 0);
  d.pts[a].fixed = d.pts[b].fixed = d.pts[c].fixed = d.pts[e].fixed = true;
  const l1 = addLine(d, a, b, {}), l2 = addLine(d, c, e, {});
  return { d, a, b, c, e, l1, l2 };
}

t('solver: punto de interseccion (point_on_line x2)', () => {
  const { d, l1, l2 } = lineDoc();
  const p = addPoint(d, 3, 4);
  addCon(d, { t: 'PONL', refs: [p, l1] }); addCon(d, { t: 'PONL', refs: [p, l2] });
  const r = solve(d);
  assert.ok(r.ok);
  near(d.pts[p].x, 5, 1e-5); near(d.pts[p].y, 5, 1e-5);
});

t('solver: arrastre sigue el puntero sobre un circulo de radio fijo', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0); d.pts[o].fixed = true;
  const c = addCircle(d, o, 10, {});
  const p = addPoint(d, 10, 0);
  addCon(d, { t: 'RAD', refs: [c], v: 10 }); addCon(d, { t: 'PONC', refs: [p, c] });
  for (let i = 1; i <= 36; i++) {
    const a = (i * Math.PI) / 36, R = 14;
    const r = solve(d, [{ id: p, x: R * Math.cos(a), y: R * Math.sin(a) }]);
    assert.ok(r.ok, 'paso ' + i);
    near(Math.hypot(d.pts[p].x, d.pts[p].y), 10, 1e-4, 'radio');
    near(Math.atan2(d.pts[p].y, d.pts[p].x), a, 0.05, 'angulo paso ' + i);
  }
});

t('solver: distancia y mecanismo de 4 barras sigue siendo resoluble', () => {
  const d = newDoc();
  const o2 = addPoint(d, 0, 0), o4 = addPoint(d, 8, 0);
  d.pts[o2].fixed = d.pts[o4].fixed = true;
  const a = addPoint(d, 0, 3), b = addPoint(d, 8, 4);
  const l2 = addLine(d, o2, a, {}), l3 = addLine(d, a, b, {}), l4 = addLine(d, o4, b, {});
  addCon(d, { t: 'DIST', refs: [o2, a], v: 3 });
  addCon(d, { t: 'DIST', refs: [a, b], v: 9 });
  addCon(d, { t: 'DIST', refs: [o4, b], v: 5 });
  void l2; void l3; void l4;
  for (let i = 0; i <= 20; i++) {
    const th = Math.PI / 6 + (i * Math.PI) / 30;
    const r = solve(d, [{ id: a, x: 3 * Math.cos(th), y: 3 * Math.sin(th) }]);
    assert.ok(r.ok, 'paso ' + i);
    near(Math.hypot(d.pts[a].x - d.pts[b].x, d.pts[a].y - d.pts[b].y), 9, 1e-4, 'biela');
  }
});

t('solver: angulo entre rectas conserva la geometria al aplicarse', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0), a = addPoint(d, 10, 0), b = addPoint(d, 3, 6);
  d.pts[o].fixed = d.pts[a].fixed = true;
  const l1 = addLine(d, o, a, {}), l2 = addLine(d, o, b, {});
  const ang = (signedAngle({ x: 10, y: 0 }, { x: 3, y: 6 }) * 180) / Math.PI;
  addCon(d, { t: 'ANG', refs: [l1, l2], v: ang });
  addCon(d, { t: 'DIST', refs: [o, b], v: Math.hypot(3, 6) });
  const r = solve(d);
  assert.ok(r.ok);
  near(d.pts[b].x, 3, 1e-4); near(d.pts[b].y, 6, 1e-4);
  d.cons[Object.keys(d.cons).find((k) => d.cons[k].t === 'ANG')].v = 90;
  assert.ok(solve(d).ok);
  near(d.pts[b].x, 0, 1e-4); near(Math.abs(d.pts[b].y), Math.hypot(3, 6), 1e-3);
  assert.ok(d.pts[b].y > 0, 'el angulo positivo gira antihorario (sin salto de signo)');
});

t('solver: punto medio y tangente recta-circulo', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 2); d.pts[a].fixed = d.pts[b].fixed = true;
  addLine(d, a, b, {});
  const m = addPoint(d, 4, 1); addCon(d, { t: 'MID', refs: [a, b, m] });
  assert.ok(solve(d).ok); near(d.pts[m].x, 5, 1e-4); near(d.pts[m].y, 1, 1e-4);
  const d2 = newDoc();
  const p = addPoint(d2, 0, 0), q = addPoint(d2, 10, 0); d2.pts[p].fixed = d2.pts[q].fixed = true;
  const l = addLine(d2, p, q, {});
  const o = addPoint(d2, 5, 7), c = addCircle(d2, o, 4, {});
  addCon(d2, { t: 'TANLC', refs: [l, c] }); addCon(d2, { t: 'DISTPL', refs: [o, l], v: 6 });
  assert.ok(solve(d2).ok); near(d2.circles[c].r, 6, 1e-4);
});

t('solver: conflicto se informa y no modifica el documento', () => {
  const { d } = lineDoc();
  const p = addPoint(d, 1, 1), q = addPoint(d, 5, 1);
  addCon(d, { t: 'DIST', refs: [p, q], v: 3 }); addCon(d, { t: 'COI', refs: [p, q] });
  const before = JSON.stringify(d.pts);
  const r = solve(d);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(d.pts), before);
});

console.log(`\n${passed} pruebas pasaron`);

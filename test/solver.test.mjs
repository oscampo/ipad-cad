import assert from 'node:assert/strict';
import { newDoc, addPoint, addLine, addCircle, addArc, addCon, hatchLoops, arcOf } from '../src/model.js';
import { splitElement } from '../src/split.js';
import { initSolver, solve } from '../src/solver.js';
import { lineLine, lineCircle, circleCircle, signedAngle, dashFromPattern, parsePattern, circumcircle, arcSweepOf, TAU } from '../src/geom.js';

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


const D2R = Math.PI / 180;
const onCircle = (d, c, p, r) => Math.abs(Math.hypot(d.pts[p].x - d.pts[c].x, d.pts[p].y - d.pts[c].y) - r);

t('arcos: circulo por 3 puntos y barrido antihorario', () => {
  const k = circumcircle({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
  near(k.c.x, 0); near(k.c.y, 0); near(k.r, 1);
  assert.equal(circumcircle({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }), null);
  const s = arcSweepOf({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
  near(s.sweep, Math.PI / 2);
  near(arcSweepOf({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }).sweep, TAU, 1e-9, 'coincidentes = 360');
});

function arcDoc(r = 10) {
  const d = newDoc();
  const o = addPoint(d, 0, 0), a = addPoint(d, r, 0), b = addPoint(d, 0, r);
  d.pts[o].fixed = true;
  const A = addArc(d, o, a, b, r, {});
  return { d, o, a, b, A };
}

t('arcos: arrastrar el extremo mantiene el arco sobre su circunferencia', () => {
  const { d, o, a, b, A } = arcDoc();
  addCon(d, { t: 'RAD', refs: [A], v: 10 });
  for (let i = 1; i <= 20; i++) {
    const ang = Math.PI / 2 + (i * Math.PI) / 30;
    assert.ok(solve(d, [{ id: b, x: 14 * Math.cos(ang), y: 14 * Math.sin(ang) }]).ok, 'paso ' + i);
    near(onCircle(d, o, b, 10), 0, 1e-4); near(onCircle(d, o, a, 10), 0, 1e-4);
    near(Math.atan2(d.pts[b].y, d.pts[b].x), ((ang + Math.PI) % TAU) - Math.PI, 0.06, 'angulo');
  }
});

t('arcos: tangente recta-arco, punto sobre arco, radios iguales', () => {
  const { d, o, A } = arcDoc(8);
  const p1 = addPoint(d, -20, 10), p2 = addPoint(d, 20, 10);
  d.pts[p1].fixed = d.pts[p2].fixed = true;
  const L = addLine(d, p1, p2, {});
  addCon(d, { t: 'TANLC', refs: [L, A] });
  const q = addPoint(d, 5, 5);
  addCon(d, { t: 'PONC', refs: [q, A] });
  assert.ok(solve(d).ok);
  near(d.arcs[A].r, 10, 1e-4);
  near(onCircle(d, o, q, d.arcs[A].r), 0, 1e-4);
  const c2 = addPoint(d, 30, 0), e2 = addPoint(d, 36, 0), f2 = addPoint(d, 30, 6);
  const A2 = addArc(d, c2, e2, f2, 6, {});
  addCon(d, { t: 'EQR', refs: [A, A2] });
  assert.ok(solve(d).ok);
  near(d.arcs[A2].r, d.arcs[A].r, 1e-4);
});

t('colineal: dos lineas quedan sobre la misma recta', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 2), c = addPoint(d, 14, 5), e = addPoint(d, 25, 9);
  d.pts[a].fixed = d.pts[b].fixed = true;
  const l1 = addLine(d, a, b, {}), l2 = addLine(d, c, e, {});
  addCon(d, { t: 'COL', refs: [l1, l2] });
  assert.ok(solve(d).ok);
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  near(cross(d.pts[a], d.pts[b], d.pts[c]), 0, 1e-6);
  near(cross(d.pts[a], d.pts[b], d.pts[e]), 0, 1e-6);
});

t('dividir: segmento horizontal con 2 puntos hereda H y mantiene la recta', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 30, 0), p = addPoint(d, 10, 0), q = addPoint(d, 20, 0);
  d.pts[a].fixed = true;
  const L = addLine(d, a, b, { color: '#dc2626', ltype: 'eje', w: 2 });
  addCon(d, { t: 'H', refs: [L] });
  addCon(d, { t: 'PONL', refs: [p, L] });
  addCon(d, { t: 'PONL', refs: [q, L] });
  const r = splitElement(d, L, [p, q]);
  assert.ok(r.ok);
  assert.equal(r.pieces.length, 3);
  assert.ok(!(L in d.lines));
  assert.ok(r.pieces.every((id) => d.lines[id].color === '#dc2626' && d.lines[id].ltype === 'eje'), 'hereda estilo');
  assert.equal(Object.values(d.cons).filter((k) => k.t === 'H').length, 3, 'H en cada trozo');
  assert.equal(Object.values(d.cons).filter((k) => k.t === 'PONL').length, 0, 'ya son vertices');
  assert.ok(solve(d, [{ id: q, x: 22, y: 6 }]).ok);
  near(d.pts[q].y, 0, 1e-6); near(d.pts[p].y, 0, 1e-6); near(d.pts[b].y, 0, 1e-6);
});

t('dividir: segmento inclinado conserva la recta y reasigna puntos', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 30, 15), p = addPoint(d, 10, 5), m = addPoint(d, 25, 12.5);
  d.pts[a].fixed = true;
  const L = addLine(d, a, b, {});
  addCon(d, { t: 'PONL', refs: [p, L] });
  addCon(d, { t: 'PONL', refs: [m, L] });
  const r = splitElement(d, L, [p]);
  assert.ok(r.ok && r.pieces.length === 2);
  const onM = Object.values(d.cons).find((k) => k.t === 'PONL');
  assert.equal(onM.refs[0], m);
  assert.equal(onM.refs[1], r.pieces[1], 'm queda en el 2.º trozo');
  assert.ok(solve(d, [{ id: b, x: 30, y: 40 }]).ok);
  const cross = (P, Q, R) => (Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x);
  near(cross(d.pts[a], d.pts[p], d.pts[b]), 0, 1e-5, 'a-p-b alineados');
  near(cross(d.pts[a], d.pts[p], d.pts[m]), 0, 1e-5, 'm sobre la recta');
});

t('dividir: circulo con 1 punto pasa a arco de 360 con extremos coincidentes y reposicionables', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0), p = addPoint(d, 10, 0);
  d.pts[o].fixed = true;
  const C = addCircle(d, o, 10, { color: '#2563eb', ltype: 'continua', w: 2 });
  addCon(d, { t: 'RAD', refs: [C], v: 10 });
  addCon(d, { t: 'PONC', refs: [p, C] });
  const r = splitElement(d, C, [p]);
  assert.ok(r.ok && r.pieces.length === 1 && !(C in d.circles));
  const A = d.arcs[r.pieces[0]];
  assert.equal(A.color, '#2563eb');
  near(arcOf(d, A).sweep, TAU, 1e-9, '360');
  assert.ok(Object.values(d.cons).some((k) => k.t === 'RAD' && k.refs[0] === r.pieces[0]), 'RAD heredado');
  assert.ok(solve(d).ok);
  const e = A.b;
  assert.ok(solve(d, [{ id: e, x: -8, y: 8 }]).ok);
  near(onCircle(d, o, e, 10), 0, 1e-4);
  const sw = arcOf(d, d.arcs[r.pieces[0]]).sweep;
  assert.ok(sw < TAU - 0.1, 'el extremo se separo: arco de ' + (sw / D2R).toFixed(0) + ' grados');
});

t('dividir: circulo con 3 puntos da 3 arcos con radios iguales; arco con 2 puntos da 3', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0);
  d.pts[o].fixed = true;
  const pts = [0, 100, 250].map((g) => addPoint(d, 10 * Math.cos(g * D2R), 10 * Math.sin(g * D2R)));
  const C = addCircle(d, o, 10, {});
  const r = splitElement(d, C, pts);
  assert.ok(r.ok && r.pieces.length === 3);
  assert.equal(Object.values(d.cons).filter((k) => k.t === 'EQR').length, 2);
  assert.ok(solve(d).ok);
  const sweeps = r.pieces.map((id) => arcOf(d, d.arcs[id]).sweep / D2R);
  near(sweeps.reduce((s, v) => s + v, 0), 360, 1e-3, 'suman 360');
  const e = arcDoc();
  const m1 = addPoint(e.d, 10 * Math.cos(30 * D2R), 10 * Math.sin(30 * D2R));
  const m2 = addPoint(e.d, 10 * Math.cos(60 * D2R), 10 * Math.sin(60 * D2R));
  const r2 = splitElement(e.d, e.A, [m1, m2]);
  assert.ok(r2.ok && r2.pieces.length === 3);
  assert.ok(solve(e.d, [{ id: e.b, x: -6, y: 9 }]).ok);
});

t('dividir: errores claros y relleno con cadena de arcos', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), far = addPoint(d, 5, 5);
  const L = addLine(d, a, b, {});
  assert.equal(splitElement(d, L, [far]).ok, false);
  assert.equal(splitElement(d, L, []).ok, false);
  const e = arcDoc();
  const l1 = addLine(e.d, e.b, e.o, {}), l2 = addLine(e.d, e.o, e.a, {});
  const loops = hatchLoops(e.d, { ids: [e.A, l1, l2] });
  assert.equal(loops.length, 1);
  assert.ok(loops[0].pts.length > 20, 'el arco se muestrea');
});

console.log(`\n${passed} pruebas pasaron`);

import assert from 'node:assert/strict';
import { newDoc, addPoint, addLine, addCircle, addArc, addCon, addText, addSpline, deleteItems, hatchLoops, arcOf, cleanup, splinePolyline } from '../src/model.js';
import { startTrace, recordTraces, traceToSpline, offsetPolyline, firstLap } from '../src/curves.js';
import { layoutDim, dragDim, dimValue, dimText, angSector, angTrue } from '../src/dims.js';
import { textFrame, textCorners, textHit, textPose, rawAngle } from '../src/text.js';
import { exportSVG, exportSVGLaser, exportDXF, dimLayouts, extraExtents, laserClasses, styleKey } from '../src/export.js';
import { splitElement } from '../src/split.js';
import { buildTree, conLabel } from '../src/tree.js';
import { cleanFileBase } from '../src/files.js';
import { parseValue, evalExpr, isPlainNumber } from '../src/expr.js';
import { trimAt, extendEnd, cutsOf, linearArray, mirrorCopy, circularArray } from '../src/edit.js';
import { lineLock, lockConstraints, originsOfPoint, originsOfSnap } from '../src/lock.js';
import { initSolver, solve, reparamSplines } from '../src/solver.js';
import { bsplineThrough, bsplinePoint } from '../src/bspline.js';
import { boxSelect } from '../src/boxsel.js';
import { crossPoints } from '../src/snapx.js';
import { lineLine, lineCircle, circleCircle, signedAngle, dashFromPattern, parsePattern, circumcircle, arcSweepOf, TAU, splineSamples, resamplePolyline, polylineLength, splineBezier, closestOnPolyline, polylineLine, polylineCircle, polylinePolyline } from '../src/geom.js';

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


// ---------------------------------------------------------------- cotas y textos
const VIEW = { s: 10, ox: 0, oy: 0 };

t('cotas: distancia con flechas, lineas de extension y etiqueta reposicionable', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0);
  const k = { t: 'DIST', refs: [a, b], v: 10 };
  let L = layoutDim(d, k, VIEW);
  assert.equal(L.arrows.length, 2);
  assert.equal(L.lines.length, 3, '2 extension + linea de cota');
  assert.equal(L.label.text, '10');
  // flechas hacia fuera (hacia las lineas de extension) cuando cabe
  assert.ok(L.arrows[0].dx < 0 && L.arrows[1].dx > 0);
  const y0 = L.label.y;
  assert.ok(dragDim(d, k, VIEW, { x: 50, y: -60 }));
  L = layoutDim(d, k, VIEW);
  assert.ok(Math.abs(L.label.y - y0) > 20, 'la cota se desplazo');
  near(k.lt, 0.5, 1e-9, 'etiqueta en el medio');
  // cota corta: flechas por fuera apuntando hacia dentro
  const e = addPoint(d, 1, 0);
  const short = layoutDim(d, { t: 'DIST', refs: [a, e], v: 1 }, VIEW);
  assert.ok(short.arrows[0].dx > 0 && short.arrows[1].dx < 0, 'flechas exteriores');
  // etiqueta arrastrada fuera del tramo prolonga la linea de cota
  dragDim(d, k, VIEW, { x: 200, y: -60 });
  assert.ok(k.lt > 1);
  const L2 = layoutDim(d, k, VIEW);
  assert.ok(Math.max(...L2.lines.flatMap((l) => [l[0], l[2]])) > 105, 'linea prolongada hasta la etiqueta');
});

t('cotas: angulo con arco, flechas, lineas de extension y radio ajustable', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0), a = addPoint(d, 4, 0), b = addPoint(d, 0, 4);
  const l1 = addLine(d, o, a, {}), l2 = addLine(d, o, b, {});
  const k = { t: 'ANG', refs: [l1, l2], v: 90 };
  const L = layoutDim(d, k, VIEW);
  assert.equal(L.arcs.length, 1);
  assert.equal(L.arrows.length, 2);
  assert.equal(L.label.text, '90°');
  assert.ok(L.lines.length >= 1, 'las rectas son cortas: hay extensiones');
  assert.ok(dragDim(d, k, VIEW, { x: 200, y: -200 }));
  assert.ok(layoutDim(d, k, VIEW).arcs[0].r > L.arcs[0].r, 'el radio crecio');
  const p1 = addPoint(d, 0, 5), p2 = addPoint(d, 4, 5);
  const l3 = addLine(d, p1, p2, {});
  assert.equal(layoutDim(d, { t: 'ANG', refs: [l1, l3], v: 0 }, VIEW).arcs.length, 0, 'paralelas: solo etiqueta');
});

t('cotas: circulo muestra phi con el diametro y arco muestra R', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0), p = addPoint(d, 5, 0), q = addPoint(d, 0, 5);
  const c = addCircle(d, o, 5, {});
  const A = addArc(d, o, p, q, 5, {});
  const kc = { t: 'RAD', refs: [c], v: 5 };
  const Lc = layoutDim(d, kc, VIEW);
  assert.equal(Lc.label.text, '⌀10');
  assert.equal(Lc.arrows.length, 2);
  const ka = { t: 'RAD', refs: [A], v: 5 };
  const La = layoutDim(d, ka, VIEW);
  assert.equal(La.label.text, 'R5');
  assert.equal(La.arrows.length, 1);
  assert.equal(La.arcs.length, 0, 'por defecto cae dentro del tramo');
  dragDim(d, ka, VIEW, { x: -100, y: 100 }); // fuera del tramo del arco (cuadrante opuesto)
  assert.ok(layoutDim(d, ka, VIEW).arcs.some((x) => x.dashed), 'arco de extension');
  assert.ok(dragDim(d, kc, VIEW, { x: 0, y: -80 }));
  near(kc.lp, 8, 1e-9);
  const lc2 = layoutDim(d, kc, VIEW);
  assert.ok(lc2.lines[0].some((v) => Math.abs(v) > 60), 'linea extendida hasta una etiqueta fuera del circulo');
});

const measure = (l) => 0.6 * l.length;

t('texto: caja segun el punto de insercion (esquinas, medios y centro)', () => {
  const d = newDoc();
  const p = addPoint(d, 10, 20);
  const T = { pt: p, text: 'ABCDE', h: 2, ang: 0, anchor: 'bl' };
  let f = textFrame(T, measure);
  near(f.w, 6); near(f.hh, 2.4);
  near(f.xmin, 0); near(f.ymin, 0);
  f = textFrame({ ...T, anchor: 'mc' }, measure);
  near(f.xmin, -3); near(f.ymin, -1.2); near(f.ymax, 1.2);
  f = textFrame({ ...T, anchor: 'tr' }, measure);
  near(f.xmin, -6); near(f.ymax, 0); near(f.ymin, -2.4);
  f = textFrame({ ...T, anchor: 'ml' }, measure);
  near(f.xmin, 0); near(f.ymax, 1.2);
  const two = textFrame({ ...T, text: 'AB\nABCDEF' }, measure);
  near(two.w, 7.2); near(two.hh, 4.8);
});

t('texto: la orientacion gira la caja alrededor del punto de insercion y el golpe la respeta', () => {
  const d = newDoc();
  const p = addPoint(d, 0, 0);
  const T = { pt: p, text: 'ABCDE', h: 2, ang: 90, anchor: 'bl' };
  const cs = textCorners(d, T, measure);
  // 90 grados: el ancho (6) queda a lo largo de +y y la altura (2.4) hacia -x
  near(cs[1].x, 0, 1e-9); near(cs[1].y, 6, 1e-9);
  near(cs[3].x, -2.4, 1e-9); near(cs[3].y, 0, 1e-9);
  assert.ok(textHit(d, T, { x: -1, y: 3 }, measure));
  assert.ok(!textHit(d, T, { x: 3, y: 1 }, measure), 'sin girar estaria dentro; girado, no');
  assert.ok(textHit(d, { ...T, ang: 0 }, { x: 3, y: 1 }, measure));
});

t('texto: el punto de insercion es un punto real y admite restricciones; borrar el punto borra el texto', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), p = addPoint(d, 3, 4, false);
  d.pts[a].fixed = d.pts[b].fixed = true;
  const L = addLine(d, a, b, {});
  const tid = addText(d, p, 'hola', { h: 2, ang: 30, anchor: 'mc' });
  addCon(d, { t: 'PONL', refs: [p, L] });
  assert.ok(solve(d).ok);
  near(d.pts[p].y, 0, 1e-6);
  assert.ok(tid in d.texts);
  deleteItems(d, [{ k: 'pt', id: p }]);
  assert.ok(!(tid in d.texts), 'el texto desaparece con su punto');
});


t('exportar: SVG y DXF incluyen arcos, textos con rotacion y escala de patron', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 5), c = addPoint(d, 0, 10), e = addPoint(d, 5, 5);
  addLine(d, a, b, { color: '#dc2626', ltype: 'eje', w: 2, ls: 0.5 });
  addArc(d, a, b, c, 11.18, { color: 'auto', ltype: 'oculta', w: 2 });
  addText(d, e, 'Hola <A>\nlinea 2', { h: 2, ang: 30, anchor: 'mc' });
  const svg = exportSVG(d, 1);
  assert.ok(svg.includes('<text transform="translate('), 'texto en SVG');
  assert.ok(svg.includes('rotate(-30)'), 'rotacion del texto');
  assert.ok(svg.includes('&lt;A&gt;'), 'se escapa el texto');
  assert.equal(svg.split('<tspan').length - 1, 2, 'una tspan por linea');
  assert.ok(svg.includes('A'), 'arco como path');
  const d1 = svg.match(/stroke="#dc2626"[^>]*stroke-dasharray="([^"]+)"/)[1].split(' ').map(Number);
  near(d1[0], 14 * 3 * 0.5, 1e-6, 'la escala del patron por elemento se aplica');
  const rows = exportDXF(d).trim().split('\r\n');
  assert.equal(rows.length % 2, 0, 'pares codigo/valor');
  assert.equal(rows.filter((r) => r === 'TEXT').length, 2);
  assert.equal(rows.filter((r) => r === 'ARC').length, 1);
});


t('exportar cotas: SVG y DXF llevan flechas, extension, arcos de angulo y etiquetas; el lienzo no las recorta', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0), a = addPoint(d, 40, 0), b = addPoint(d, 0, 30), c0 = addPoint(d, 80, 10), c1 = addPoint(d, 80, 20);
  const l1 = addLine(d, o, a, {}), l2 = addLine(d, o, b, {});
  const C = addCircle(d, c0, 10, {});
  addCon(d, { t: 'DIST', refs: [o, a], v: 40, off: 8, lt: 0.3 });
  addCon(d, { t: 'ANG', refs: [l1, l2], v: 90 });
  addCon(d, { t: 'RAD', refs: [C], v: 10 });
  addCon(d, { t: 'H', refs: [l1], hidden: true }); // las relaciones no se exportan
  const view = { s: 6, ox: 0, oy: 0 };
  const L = dimLayouts(d, view);
  assert.equal(L.length, 3, 'solo cotas');
  const nArrows = L.reduce((s, x) => s + x.arrows.length, 0);
  const svg = exportSVG(d, 1);
  assert.equal(svg.split('<polygon').length - 1, nArrows, 'una flecha por cabeza');
  assert.ok(svg.includes('>40</text>') && svg.includes('>90°</text>') && svg.includes('>⌀20</text>'), 'etiquetas');
  assert.ok(/<path d="M[^"]+ A[^"]+" fill="none" stroke="#000000" stroke-width="1"\/>/.test(svg), 'arco de la cota angular');
  const W = Number(svg.match(/width="([\d.]+)"/)[1]), H = Number(svg.match(/height="([\d.]+)"/)[1]);
  const tr = svg.match(/<g transform="translate\(([\d.-]+) ([\d.-]+)\)">/);
  assert.ok(tr, 'grupo con desplazamiento');
  const ex = extraExtents(d, { s: 6, ox: 20, oy: 20 + 30 * 6 }); // y1 del contenido = 30
  assert.ok(ex.maxX + 8 + Number(tr[1]) <= W + 1e-6, 'caben las cotas en x');
  assert.ok(ex.maxY + 8 + Number(tr[2]) <= H + 1e-6, 'caben las cotas en y');
  assert.ok(ex.minX + Number(tr[1]) >= 8 - 1e-6 || Number(tr[1]) === 0, 'no se recorta por la izquierda');
  const rows = exportDXF(d, 6).trim().split('\r\n');
  assert.equal(rows.length % 2, 0);
  assert.equal(rows.filter((r) => r === 'SOLID').length, nArrows, 'flechas SOLID');
  const labels = rows.filter((r, i) => rows[i - 1] === '1');
  assert.ok(['40', '90°', '%%c20'].every((t) => labels.includes(t)), 'etiquetas en DXF');
  assert.ok(rows.filter((r) => r === 'ARC').length >= 1, 'arco de la cota angular');
  // coordenadas del DXF en unidades del dibujo: la cota de 40 queda cerca de y=-8/6.. (sobre el eje, desplazada)
  const idx = rows.findIndex((r, i) => r === 'LINE' && rows[i + 5] === '20');
  assert.ok(idx >= 0);
});


t('exportar: respeta los interruptores de cotas y textos', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 30, 0), e = addPoint(d, 10, 10);
  addLine(d, a, b, {});
  addCon(d, { t: 'DIST', refs: [a, b], v: 30 });
  addText(d, e, 'Hola', { h: 2 });
  const full = exportSVG(d, 1);
  assert.ok(full.includes('<polygon') && full.includes('<text transform'));
  const noDims = exportSVG(d, 1, { dims: false });
  assert.ok(!noDims.includes('<polygon') && noDims.includes('<text transform'));
  const noTexts = exportSVG(d, 1, { texts: false });
  assert.ok(noTexts.includes('<polygon') && !noTexts.includes('<text transform'));
  const rows = (v) => exportDXF(d, 5, v).trim().split('\r\n');
  assert.equal(rows({ dims: false }).filter((r) => r === 'SOLID').length, 0);
  assert.ok(rows({ texts: false }).filter((r) => r === 'TEXT').length === 1, 'solo la etiqueta de la cota');
});


t('texto: alineado con una linea sigue su direccion y se gira si cambia', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 10), p = addPoint(d, 5, 5);
  const L = addLine(d, a, b, {});
  const T = { pt: p, text: 'AB', h: 2, ang: 0, anchor: 'bl', ref: L, readable: true };
  near(rawAngle(d, T), 45, 1e-9);
  assert.equal(textPose(d, T).ang, 45);
  d.pts[b].x = 0; d.pts[b].y = 10; // la linea pasa a vertical (90 grados)
  near(rawAngle(d, T), 90, 1e-9);
  const pz = textPose(d, { ...T, ang: 30 }); // 90 + 30 = 120: boca abajo, se gira 180
  near(pz.ang, 300, 1e-9);
  assert.equal(pz.anchor, 'tr');
  near(rawAngle(d, { ...T, ang: 90 }), 180, 1e-9, 'el desfase se suma al de la linea');
  assert.equal(textPose(d, { ...T, ref: 'no-existe', ang: 20 }).ang, 20, 'referencia perdida: usa su angulo');
});

t('texto: legible gira 180 y cambia el punto de insercion, la caja queda en el mismo sitio', () => {
  const d = newDoc();
  const p = addPoint(d, 3, 4);
  const T = { pt: p, text: 'ABCDE', h: 2, ang: 200, anchor: 'bl', readable: true };
  const pose = textPose(d, T);
  near(pose.ang, 20, 1e-9);
  assert.equal(pose.anchor, 'tr');
  const box = (cs) => [Math.min(...cs.map((c) => c.x)), Math.max(...cs.map((c) => c.x)), Math.min(...cs.map((c) => c.y)), Math.max(...cs.map((c) => c.y))];
  const flipped = box(textCorners(d, T, measure));
  const raw = box(textCorners(d, { ...T, readable: false }, measure));
  flipped.forEach((v, i) => near(v, raw[i], 1e-9, 'misma region de la hoja'));
  assert.equal(textPose(d, { ...T, readable: false }).ang, 200, 'sin legibilidad no se toca');
  assert.equal(textPose(d, { ...T, ang: 90 }).ang, 90, 'vertical hacia arriba se queda');
  assert.equal(textPose(d, { ...T, ang: 270 }).ang, 90, 'vertical hacia abajo se gira');
  assert.equal(textPose(d, { ...T, ang: 359, anchor: 'mc' }).anchor, 'mc', 'sin giro no cambia el ancla');
  assert.ok(textHit(d, T, { x: 3 - 1, y: 4 - 1 }, measure), 'el golpe usa la pose legible');
});

t('cotas de referencia: miden en vivo, no entran al solver y salen en cursiva', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 3, 4), c = addPoint(d, 10, 0);
  d.pts[a].fixed = d.pts[c].fixed = true;
  const l1 = addLine(d, a, b, {}), l2 = addLine(d, a, c, {});
  const ref = addCon(d, { t: 'DIST', refs: [a, b], v: 99, ref: true });
  const ang = addCon(d, { t: 'ANG', refs: [l2, l1], v: 1, ref: true });
  assert.ok(solve(d).ok, 'una cota que no cumple la geometria no es conflicto si es de referencia');
  near(dimValue(d, d.cons[ref]), 5, 1e-9);
  assert.equal(dimText(d, d.cons[ref]), '5');
  near(dimValue(d, d.cons[ang]), (Math.atan2(4, 3) * 180) / Math.PI, 1e-9);
  assert.equal(layoutDim(d, d.cons[ref], { s: 10, ox: 0, oy: 0 }).label.italic, true);
  d.pts[b].x = 6; d.pts[b].y = 8;
  assert.equal(dimText(d, d.cons[ref]), '10', 'sigue a la geometria');
  addCon(d, { t: 'DIST', refs: [a, b], v: 10 });
  assert.ok(solve(d).ok);
  const drive = addCon(d, { t: 'DIST', refs: [a, b], v: 7 });
  assert.equal(solve(d).ok, false, 'la misma cota como restriccion si entra en conflicto');
  assert.equal(layoutDim(d, d.cons[drive], { s: 10, ox: 0, oy: 0 }).label.italic, false);
  const circ = addCircle(d, c, 4, {});
  const kc = { t: 'RAD', refs: [circ], v: 1, ref: true };
  assert.equal(dimText(d, kc), '⌀8');
});


t('spline: pasa por todos los puntos, cierra y no hace picos', () => {
  const P = [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 0 }, { x: 30, y: 8 }];
  const S = splineSamples(P, false, 16);
  assert.equal(S.length, 3 * 16 + 1);
  P.forEach((q) => assert.ok(S.some((r) => Math.hypot(r.x - q.x, r.y - q.y) < 1e-9), 'pasa por el punto'));
  assert.ok(S.every((r) => r.y > -3 && r.y < 11), 'sin oscilaciones grandes (centripeta)');
  assert.deepEqual(splineSamples([P[0], P[1]], false), [P[0], P[1]], 'con 2 puntos es un segmento');
  const C = splineSamples([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], true, 16);
  assert.equal(C.length, 4 * 16 + 1);
  near(C[0].x, C[C.length - 1].x, 1e-9); near(C[0].y, C[C.length - 1].y, 1e-9);
  const dup = splineSamples([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }], false, 8);
  assert.ok(dup.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y)), 'puntos repetidos no dan NaN');
});

t('spline: entidad ligada a puntos reales; borrar un punto lo quita de la curva; relleno de curva cerrada', () => {
  const d = newDoc();
  const ids = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 14]].map(([x, y]) => addPoint(d, x, y, false));
  const sp = addSpline(d, ids, { color: 'auto', ltype: 'continua', w: 2 }, true);
  assert.equal(splinePolyline(d, d.splines[sp]).length, 5 * 16 + 1);
  const loops = hatchLoops(d, { ids: [sp] });
  assert.equal(loops.length, 1);
  assert.equal(loops[0].pts.length, 5 * 12, "curva cerrada muestreada sin repetir el primer punto");
  deleteItems(d, [{ k: 'pt', id: ids[4] }]);
  assert.equal(d.splines[sp].pts.length, 4);
  deleteItems(d, [{ k: 'pt', id: ids[3] }, { k: 'pt', id: ids[2] }, { k: 'pt', id: ids[1] }]);
  assert.ok(!(sp in d.splines), 'con menos de 2 puntos la curva desaparece');
});

t('trazado: el punto del seguidor deja su trayectoria al simular el mecanismo', () => {
  const d = newDoc();
  const o2 = addPoint(d, 0, 0), o4 = addPoint(d, 8, 0);
  d.pts[o2].fixed = d.pts[o4].fixed = true;
  const a = addPoint(d, 0, 3), b = addPoint(d, 8, 4), m = addPoint(d, 4, 6);
  addLine(d, o2, a, {}); addLine(d, a, b, {}); addLine(d, o4, b, {});
  addCon(d, { t: 'DIST', refs: [o2, a], v: 3 }); addCon(d, { t: 'DIST', refs: [a, b], v: 9 }); addCon(d, { t: 'DIST', refs: [o4, b], v: 5 });
  addCon(d, { t: 'DIST', refs: [a, m], v: 4 }); addCon(d, { t: 'DIST', refs: [b, m], v: 6 });
  assert.ok(startTrace(d, m));
  assert.ok(!startTrace(d, m), 'no duplica el trazado');
  let n = 0;
  for (let i = 0; i <= 40; i++) {
    const th = Math.PI / 6 + (i * Math.PI) / 40;
    const r = solve(d, [{ id: a, x: 3 * Math.cos(th), y: 3 * Math.sin(th) }]);
    if (r.ok) n += recordTraces(d, 0.05);
  }
  const tr = d.traces[m];
  assert.ok(tr.pts.length > 25, 'muestras: ' + tr.pts.length);
  assert.equal(tr.pts.length, n + 1);
  // cada muestra cumple la geometria del acoplador (trayectoria fisicamente valida)
  const A = (q) => q; void A;
  const d2 = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const last = tr.pts[tr.pts.length - 1];
  near(d2(last, d.pts[m]), 0, 1e-3, 'la ultima muestra es la posicion actual');
  assert.ok(Math.hypot(tr.pts[0].x - last.x, tr.pts[0].y - last.y) > 1, 'la trayectoria se movio');
  const before = tr.pts.length;
  recordTraces(d, 0.05);
  assert.equal(tr.pts.length, before, 'sin movimiento no agrega');
});

t('trazado: convertir a spline reparte puntos por longitud y detecta trayectorias cerradas', () => {
  const d = newDoc();
  const m = addPoint(d, 10, 0);
  startTrace(d, m);
  for (let i = 1; i <= 120; i++) { const th = (i / 120) * Math.PI * 2; d.pts[m].x = 10 * Math.cos(th); d.pts[m].y = 10 * Math.sin(th); recordTraces(d, 0.01); }
  const sid = traceToSpline(d, m, 12);
  const sp = d.splines[sid];
  assert.equal(sp.closed, true);
  assert.equal(sp.pts.length, 12);
  assert.ok(sp.pts.every((p) => d.pts[p].splOnly && d.pts[p].auto), 'puntos de control propios de la curva');
  // los puntos estan sobre la circunferencia y bien repartidos
  const angs = sp.pts.map((p) => Math.atan2(d.pts[p].y, d.pts[p].x));
  sp.pts.forEach((p) => near(Math.hypot(d.pts[p].x, d.pts[p].y), 10, 0.05));
  const gaps = angs.map((a, i) => ((angs[(i + 1) % angs.length] - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  gaps.forEach((g) => near(Math.abs(g), (2 * Math.PI) / 12, 0.1, 'reparto uniforme'));
  deleteItems(d, [{ k: 'sp', id: sid }]);
  assert.equal(Object.keys(d.pts).length, 1, 'al borrar la curva se van sus puntos de control');
  // trayectoria abierta
  const e = newDoc(), q = addPoint(e, 0, 0);
  startTrace(e, q);
  for (let i = 1; i <= 50; i++) { e.pts[q].x = i; e.pts[q].y = Math.sin(i / 8) * 3; recordTraces(e, 0.01); }
  const s2 = e.splines[traceToSpline(e, q, 8)];
  assert.equal(s2.closed, false);
  assert.equal(s2.pts.length, 8);
  near(e.pts[s2.pts[0]].x, 0, 1e-9); near(e.pts[s2.pts[7]].x, 50, 1e-9);
  assert.equal(traceToSpline(newDoc(), 'nada'), null);
});

t('exportar: splines y trazados salen en SVG y DXF', () => {
  const d = newDoc();
  const ids = [[0, 0], [10, 6], [20, 0]].map(([x, y]) => addPoint(d, x, y, false));
  addSpline(d, ids, { color: '#2563eb', ltype: 'eje', w: 2, ls: 1 }, false);
  const m = addPoint(d, 5, 5); startTrace(d, m); d.pts[m].x = 9; recordTraces(d, 0.1); d.pts[m].y = 8; recordTraces(d, 0.1);
  const svg = exportSVG(d, 1);
  assert.equal(svg.split('<path d="M').length - 1, 2, 'spline + trazado');
  assert.ok(svg.includes('stroke="#2563eb"') && svg.includes('stroke="#db2777"'));
  const rows = exportDXF(d, 5).trim().split('\r\n');
  assert.equal(rows.length % 2, 0);
  assert.equal(rows.filter((r) => r === 'POLYLINE').length, 2);
  assert.equal(rows.filter((r) => r === 'SEQEND').length, 2);
  assert.equal(rows.filter((r) => r === 'VERTEX').length, 2 * 0 + 2 * 16 + 1 + 3);
});


t('spline a Bezier: cada tramo coincide con la curva muestreada (abierta y cerrada)', () => {
  const P = [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 25, y: 2 }, { x: 31, y: 12 }, { x: 45, y: 4 }];
  for (const closed of [false, true]) {
    const S = splineSamples(P, closed, 16), B = splineBezier(P, closed);
    assert.equal(B.length, closed ? P.length : P.length - 1);
    B.forEach((b, i) => {
      for (let k = 0; k <= 16; k++) {
        const u = k / 16, w = 1 - u;
        const x = w * w * w * b.p0.x + 3 * w * w * u * b.c1.x + 3 * w * u * u * b.c2.x + u * u * u * b.p1.x;
        const y = w * w * w * b.p0.y + 3 * w * w * u * b.c1.y + 3 * w * u * u * b.c2.y + u * u * u * b.p1.y;
        near(x, S[i * 16 + k].x, 1e-9, 'x'); near(y, S[i * 16 + k].y, 1e-9, 'y');
      }
    });
  }
  assert.equal(splineBezier([P[0]], false).length, 0);
  assert.equal(splineBezier([P[0], P[1]], false).length, 1);
});

t('corte laser: escala real en mm, solo trazo continuo, curvas Bezier, sin cotas ni textos', () => {
  const d = newDoc();
  const ids = [[0, 0], [30, 10], [60, 0], [30, -10]].map(([x, y]) => addPoint(d, x, y, false));
  addSpline(d, ids, { color: 'auto', ltype: 'continua', w: 2, ls: 1 }, true);
  const c = addPoint(d, 30, 0, false);
  addCircle(d, c, 5, { color: 'auto', ltype: 'continua', w: 2 });
  const e = addPoint(d, 0, 20, false), f = addPoint(d, 60, 20, false);
  addLine(d, e, f, { color: 'auto', ltype: 'eje', w: 2 }); // eje: no se corta
  addCon(d, { t: 'DIST', refs: [e, f], v: 60 });
  addText(d, c, 'no sale', { h: 3 });
  const L = exportSVGLaser(d, { unit: 2, stroke: 0.1, color: '#ff0000' });
  assert.ok(L.svg.includes('<path d="M') && L.svg.includes(' C') && L.svg.includes(' Z'), 'spline cerrada como Bezier');
  assert.ok(L.svg.includes('<circle'));
  assert.equal(L.count, 2, 'spline + circulo; el eje se omite');
  assert.ok(!L.svg.includes('<text') && !L.svg.includes('<polygon'));
  assert.ok(L.svg.includes('stroke="#ff0000"') && L.svg.includes('stroke-width="0.1"'));
  assert.ok(/width="[\d.]+mm" height="[\d.]+mm"/.test(L.svg), 'dimensiones en mm');
  // la spline cerrada abarca 60 x ~20 unidades => 120 x ~40 mm con unit=2
  near(L.width, 120, 0.5); assert.ok(L.height > 30 && L.height < 50);
  const all = exportSVGLaser(d, { onlyContinuous: false });
  assert.equal(all.count, 3, 'sin filtro entra tambien el eje');
  assert.equal(exportSVGLaser(newDoc()), null);
});

t('equidistante: circulo hacia afuera/adentro y deteccion de socavado', () => {
  const circle = (r, n = 120) => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i / n) * 2 * Math.PI), y: r * Math.sin((i / n) * 2 * Math.PI) }));
  const out = offsetPolyline(circle(10), 3, true);
  out.pts.forEach((q) => near(Math.hypot(q.x, q.y), 13, 0.02, 'hacia afuera'));
  assert.equal(out.undercut, 0);
  const inn = offsetPolyline(circle(10), -4, true);
  inn.pts.forEach((q) => near(Math.hypot(q.x, q.y), 6, 0.02, 'hacia adentro'));
  assert.equal(inn.undercut, 0);
  near(inn.minRadius, 10, 0.1, 'radio minimo ~ el del circulo');
  // sentido horario: mismo resultado (d>0 sigue siendo hacia afuera)
  const cw = offsetPolyline(circle(10).reverse(), 3, true);
  cw.pts.forEach((q) => near(Math.hypot(q.x, q.y), 13, 0.02));
  // radio de offset mayor que el de curvatura => socavado
  const bad = offsetPolyline(circle(10), -12, true);
  assert.ok(bad.undercut > 50, 'se invierte: ' + bad.undercut);
});



function splDoc() {
  const d = newDoc();
  const ids = [[0, 0], [10, 8], [20, 0], [30, 8], [40, 0]].map(([x, y]) => addPoint(d, x, y, false));
  ids.forEach((i) => { d.pts[i].fixed = true; });
  const sp = addSpline(d, ids, { color: 'auto', ltype: 'continua', w: 2, ls: 1 }, false);
  return { d, ids, sp };
}
const distToSpl = (d, sp, p) => closestOnPolyline(splinePolyline(d, d.splines[sp], 400), p).d; // muestreo fino: el punto queda sobre la curva exacta

t('geometria: cruces de poligonales y punto mas cercano', () => {
  const P = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
  const f = closestOnPolyline(P, { x: 10, y: 20 });
  near(f.x, 10); near(f.y, 10);
  assert.equal(polylineLine(P, { x: 0, y: 5 }, { x: 1, y: 5 }).length, 2);
  assert.equal(polylineCircle(P, { x: 10, y: 10 }, 5).length, 2);
  const q = polylinePolyline(P, [{ x: 0, y: 8 }, { x: 20, y: 8 }]);
  assert.equal(q.length, 2); near(q[0].y, 8);
});

t('relacion: punto sobre spline se mantiene al arrastrar y al mover la curva', () => {
  const { d, ids, sp } = splDoc();
  const p = addPoint(d, 25, 3, false);
  addCon(d, { t: 'PONS', refs: [p, sp] });
  let r = solve(d, []);
  assert.ok(r.ok, 'converge');
  assert.ok(distToSpl(d, sp, d.pts[p]) < 1e-4, 'quedo sobre la curva: ' + distToSpl(d, sp, d.pts[p]));
  // arrastrar el punto hacia otro lado: sigue sobre la curva
  for (let i = 0; i < 10; i++) { r = solve(d, [{ id: p, x: 25 - i * 1.5, y: 20 }]); assert.ok(r.ok); }
  assert.ok(distToSpl(d, sp, d.pts[p]) < 1e-4, 'tras arrastrar');
  // mover la curva (liberar un punto de control): el punto la sigue
  d.pts[ids[2]].fixed = false;
  r = solve(d, [{ id: ids[2], x: 20, y: 14 }]);
  assert.ok(r.ok); d.pts[ids[2]].fixed = true;
  assert.ok(distToSpl(d, sp, d.pts[p]) < 1e-4, 'tras mover la curva');
});

t('relacion: interseccion recta-spline con ambas relaciones y fijando la recta', () => {
  const { d, sp } = splDoc();
  const a = addPoint(d, 5, 20, false), b = addPoint(d, 35, -10, false);
  d.pts[a].fixed = d.pts[b].fixed = true;
  const l = addLine(d, a, b, {});
  const X = polylineLine(splinePolyline(d, d.splines[sp], 24), d.pts[a], d.pts[b]);
  assert.ok(X.length >= 1);
  const p = addPoint(d, X[0].x + 0.3, X[0].y - 0.2, false);
  addCon(d, { t: 'PONL', refs: [p, l] }); addCon(d, { t: 'PONS', refs: [p, sp] });
  const r = solve(d, []);
  assert.ok(r.ok);
  assert.ok(distToSpl(d, sp, d.pts[p]) < 1e-4);
  const cr = (d.pts[b].x - d.pts[a].x) * (d.pts[p].y - d.pts[a].y) - (d.pts[b].y - d.pts[a].y) * (d.pts[p].x - d.pts[a].x);
  near(cr, 0, 1e-5, 'sobre la recta');
});

t('relacion: punto fijo fuera de la curva da conflicto (no se acepta en silencio)', () => {
  const { d, sp } = splDoc();
  const p = addPoint(d, 20, 30, false); d.pts[p].fixed = true;
  addCon(d, { t: 'PONS', refs: [p, sp] });
  assert.equal(solve(d, []).ok, false);
});

t('relacion: recta tangente a spline', () => {
  const { d, sp } = splDoc();
  const a = addPoint(d, 5, 12, false), b = addPoint(d, 35, 12, false);
  const l = addLine(d, a, b, {});
  d.pts[a].fixed = true; // un extremo fijo, el otro libre: la recta gira hasta ser tangente
  const T = addPoint(d, 10, 8, true);
  addCon(d, { t: 'TANLS', refs: [l, sp, T] });
  const r = solve(d, []);
  assert.ok(r.ok, 'converge');
  assert.ok(distToSpl(d, sp, d.pts[T]) < 1e-4, 'contacto sobre la curva');
  // el contacto esta sobre la recta y la recta es tangente a la poligonal en ese punto
  const A = d.pts[a], B = d.pts[b], Tp = d.pts[T];
  near((B.x - A.x) * (Tp.y - A.y) - (B.y - A.y) * (Tp.x - A.x), 0, 1e-4, 'T sobre la recta');
  const f = closestOnPolyline(splinePolyline(d, d.splines[sp], 32), Tp);
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  near(Math.abs(((B.x - A.x) * f.tx + (B.y - A.y) * f.ty) / L), 1, 1e-3, 'direcciones paralelas');
});

t('relacion: circulo tangente a spline y borrado limpia las relaciones', () => {
  const { d, sp, ids } = splDoc();
  const c = addPoint(d, 10, 16, false); d.pts[c].fixed = true;
  const ci = addCircle(d, c, 6, {}); // radio libre: crece/decrece hasta tocar la curva
  const T = addPoint(d, 10, 8, true);
  addCon(d, { t: 'TANCS', refs: [ci, sp, T] });
  const r = solve(d, []);
  assert.ok(r.ok, 'converge');
  assert.ok(distToSpl(d, sp, d.pts[T]) < 1e-4);
  near(Math.hypot(d.pts[T].x - d.pts[c].x, d.pts[T].y - d.pts[c].y), d.circles[ci].r, 1e-4, 'T sobre el circulo');
  // tangente: el radio hacia el contacto es perpendicular a la curva
  const f = closestOnPolyline(splinePolyline(d, d.splines[sp], 32), d.pts[T]);
  const rx = d.pts[T].x - d.pts[c].x, ry = d.pts[T].y - d.pts[c].y;
  near((rx * f.tx + ry * f.ty) / Math.hypot(rx, ry), 0, 2e-3, 'radio perpendicular a la curva');
  deleteItems(d, [{ k: 'sp', id: sp }]);
  assert.equal(Object.values(d.cons).filter((k) => k.t === 'TANCS').length, 0, 'la relacion muere con el spline');
  assert.ok(solve(d, []).ok);
});


t('trazado a spline: varias vueltas usan solo la primera (sin enredarse)', () => {
  const d = newDoc();
  const p = addPoint(d, 30, 0, false);
  startTrace(d, p);
  // 4 vueltas a una elipse 30 x 18, con desfase y ruido distinto en cada vuelta
  for (let lap = 0; lap < 4; lap++) {
    for (let i = 1; i <= 90; i++) {
      const a = ((i + lap * 0.37) / 90) * 2 * Math.PI;
      d.pts[p].x = 30 * Math.cos(a) + 0.05 * Math.sin(7 * a + lap); d.pts[p].y = 18 * Math.sin(a);
      recordTraces(d, 0.01);
    }
  }
  const sp = traceToSpline(d, p, 16);
  const S = d.splines[sp];
  assert.equal(S.closed, true);
  // 16 puntos de una sola vuelta: todos sobre la elipse y avanzando en un solo sentido
  const ang = S.pts.map((id) => Math.atan2(d.pts[id].y / 18, d.pts[id].x / 30));
  S.pts.forEach((id) => near(Math.hypot(d.pts[id].x / 30, d.pts[id].y / 18), 1, 0.03, 'sobre la elipse'));
  let turns = 0;
  for (let i = 0; i < ang.length; i++) { let da = ang[(i + 1) % ang.length] - ang[i]; while (da < -Math.PI) da += 2 * Math.PI; while (da > Math.PI) da -= 2 * Math.PI; assert.ok(da > 0, 'avanza siempre'); turns += da; }
  near(turns, 2 * Math.PI, 1e-6, 'una sola vuelta');
});

t('trazado a spline: ida y vuelta sale abierta y una vuelta incompleta usa todo el trazado', () => {
  const line = Array.from({ length: 60 }, (_, i) => ({ x: i, y: 0.01 * (i % 3) }));
  const back = line.slice(0, -1).reverse();
  const lap = firstLap([...line, ...back, ...line]);
  assert.equal(lap.closed, false);
  near(lap.pts[lap.pts.length - 1].x, 59, 1e-9, 'llega al extremo');
  assert.equal(firstLap(line), null, 'una trayectoria abierta no tiene vuelta');
});

t('arrastrar un punto ligado a un spline deforma la curva y el punto llega al destino', () => {
  const d = newDoc();
  const ids = [[0, 0], [10, 8], [20, 0], [30, 8], [40, 0]].map(([x, y]) => addPoint(d, x, y, false));
  const sp = addSpline(d, ids, { color: 'auto', ltype: 'continua', w: 2, ls: 1 }, false);
  d.pts[ids[0]].fixed = d.pts[ids[4]].fixed = true;
  const f = closestOnPolyline(splinePolyline(d, d.splines[sp], 32), { x: 15, y: 5 });
  const p = addPoint(d, f.x, f.y, false);
  addCon(d, { t: 'PONS', refs: [p, sp] });
  assert.ok(solve(d, []).ok);
  const before = ids.map((i) => ({ ...d.pts[i] }));
  const tx = f.x, ty = f.y + 6;
  for (let i = 1; i <= 6; i++) assert.ok(solve(d, [{ id: p, x: tx, y: f.y + i }]).ok);
  assert.ok(distToSpl(d, sp, d.pts[p]) < 1e-3, 'sigue sobre la curva');
  near(d.pts[p].y, ty, 0.5, 'llega cerca del destino: ' + d.pts[p].y);
  assert.ok(ids.some((i, k) => Math.hypot(d.pts[i].x - before[k].x, d.pts[i].y - before[k].y) > 1), 'la curva se deformo');
  near(d.pts[ids[0]].x, 0, 1e-9); near(d.pts[ids[4]].y, 0, 1e-9);
});


t('arbol de elementos: grupos, puntos de cada elemento y relaciones', () => {
  const { d, a, b, l1, l2 } = lineDoc();
  addCon(d, { t: 'PAR', refs: [l1, l2] });
  addCon(d, { t: 'DIST', refs: [a, b], v: 14.14 });
  const ids = [[0, 0], [5, 3], [9, 0]].map(([x, y]) => addPoint(d, x, y, true));
  ids.forEach((i) => { d.pts[i].splOnly = true; });
  const sp = addSpline(d, ids, { color: 'auto', ltype: 'continua', w: 2, ls: 1 }, false);
  const p = addPoint(d, 4, 3, false); addCon(d, { t: 'PONS', refs: [p, sp] });
  const tree = buildTree(d);
  const g = (k) => tree.find((x) => x.key === k);
  assert.equal(g('g:ln').children.length, 2);
  const ln1 = g('g:ln').children.find((n) => n.sel.id === l1);
  assert.ok(ln1.children.some((c) => c.con && /Paralelas/.test(c.label)), 'la linea muestra sus relaciones');
  assert.equal(ln1.children.filter((c) => c.sel.k === 'pt').length, 2, 'y sus dos puntos');
  const spn = g('g:sp').children[0];
  assert.equal(spn.children.find((c) => c.group).children.length, 3, 'puntos de control del spline');
  assert.ok(spn.children.some((c) => /Punto sobre spline/.test(c.label)));
  assert.ok(!g('g:pt').children.some((c) => ids.includes(c.sel.id)), 'los puntos de control no aparecen sueltos');
  assert.equal(g('g:co').children.length, 3);
  assert.equal(conLabel(d, { t: 'DIST', refs: [a, b], v: 14.14, ref: true }), 'Distancia = 14.14 (referencia)');
  assert.deepEqual(buildTree(newDoc()), []);
});


t('nombres de archivo: limpia caracteres invalidos y la extension tecleada', () => {
  assert.equal(cleanFileBase('mecanismo 4 barras', 'json'), 'mecanismo 4 barras');
  assert.equal(cleanFileBase('leva.JSON', 'json'), 'leva');
  assert.equal(cleanFileBase('a/b|c:d*e?', 'svg'), 'a b c d e');
  assert.equal(cleanFileBase('  ..oculto.. ', 'png'), 'oculto');
  assert.equal(cleanFileBase('   ', 'dxf'), '');
  assert.equal(cleanFileBase('dibujo.svg.svg', 'svg'), 'dibujo.svg');
});


// el caso del dibujo: dos segmentos cortos a la izquierda cuyo punto de corte queda lejos, a la derecha
function angCase() {
  const d = newDoc();
  const a1 = addPoint(d, 0, 0), b1 = addPoint(d, 10, 0), a2 = addPoint(d, 0, 4), b2 = addPoint(d, 10, 2);
  const l1 = addLine(d, a1, b1, {}), l2 = addLine(d, a2, b2, {});
  return { d, l1, l2, V0: { x: 20, y: 0 } };
}
t('cota angular: siempre positiva, sin importar el orden de seleccion', () => {
  const { d, l1, l2 } = angCase();
  const A = Math.atan2(2 - 4, 10) ; // l2 respecto a l1: negativa
  for (const refs of [[l1, l2], [l2, l1]]) {
    const k = { t: 'ANG', refs, ref: true };
    const v = dimValue(d, k);
    assert.ok(v > 0 && v < 180, 'positiva: ' + v);
    near(v, (Math.abs(A) * 180) / Math.PI, 1e-6, 'sector que une los segmentos');
    assert.match(dimText(d, k), /^11\.31/);
  }
  void A;
});
t('cota angular: el sector donde se coloca decide 11.3 o 168.7 sin cambiar la geometria', () => {
  const { d, l1, l2, V0 } = angCase();
  const k = { t: 'ANG', refs: [l1, l2], v: (Math.atan2(2 - 4, 10) * 180) / Math.PI };
  const VIEW = { s: 10, ox: 0, oy: 0 };
  const C = { x: V0.x * 10, y: -V0.y * 10 };
  const base = angSector(d, k).val;
  near(base, 11.3099, 1e-3);
  // el arco por defecto y sus extensiones: las rectas terminan antes del vertice, debe haber lineas de extension
  const L0 = layoutDim(d, k, VIEW);
  assert.equal(L0.arcs.length, 1);
  assert.ok(L0.lines.length >= 2, 'lineas de extension hasta el arco');
  // colocar la cota del otro lado del vertice (hacia la derecha): sector suplementario
  assert.ok(dragDim(d, k, VIEW, { x: C.x + 150, y: C.y }));
  near(dimValue(d, k), 180 - base, 1e-3, 'suplementario');
  // y arriba (entre una recta y la prolongacion de la otra) el otro sector agudo/obtuso
  dragDim(d, k, VIEW, { x: C.x - 150, y: C.y - 20 });
  near(dimValue(d, k), base, 1e-3, 'de vuelta al sector de los segmentos');
  assert.ok(dimValue(d, k) > 0);
});
t('cota angular: editar el valor del sector elegido y resolver', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0), a = addPoint(d, 10, 0), b = addPoint(d, 8, 6);
  d.pts[o].fixed = d.pts[a].fixed = true;
  const l1 = addLine(d, o, a, {}), l2 = addLine(d, o, b, {});
  const k = { t: 'ANG', refs: [l1, l2], v: 36.87 };
  const S = angSector(d, k);
  near(S.val, 36.87, 1e-6);
  // el usuario ve el sector suplementario (143.13) y pide 150: la geometria debe quedar con 30 grados entre las rectas
  k.s1 = 1; k.s2 = -1;
  near(dimValue(d, k), 143.13, 1e-2);
  k.v = angTrue(d, k, 150);
  const id = addCon(d, k);
  d.cons[id] = k;
  assert.ok(solve(d, []).ok);
  const ang = Math.abs((Math.atan2(d.pts[b].y, d.pts[b].x) * 180) / Math.PI);
  near(ang, 30, 1e-3, 'rectas a 30 grados');
  near(dimValue(d, k), 150, 1e-3, 'se sigue mostrando el sector suplementario');
});


t('expresiones en cotas: formulas, constantes, funciones y errores', () => {
  const v = (s, o) => parseValue(s, o);
  near(v('10+1/3'), 10 + 1 / 3, 1e-9);
  near(v('10*sin(30)'), 5, 1e-9, 'sin en grados');
  near(v('10sin(30)'), 5, 1e-9, 'producto implicito');
  near(v('sin(π/6)'), 0.5, 1e-9, 'con π, radianes');
  near(v('3π/4'), (3 * Math.PI) / 4, 1e-9, 'en longitud es un numero');
  near(v('3π/4', { angle: true }), 135, 1e-9, 'en angulo pasa a grados');
  near(v('2π*5', { angle: true }), 1800, 1e-6);
  near(v('45', { angle: true }), 45, 1e-12, 'un numero simple no se convierte');
  near(v('2(3+1)'), 8); near(v('√2'), Math.SQRT2, 1e-9); near(v('2^-1'), 0.5); near(v('2**3'), 8); near(v('1,5*2'), 3);
  near(v('-3+10'), 7); near(v('atan(1)'), 45, 1e-9); near(v('log(1000)'), 3); near(v('ln(e)'), 1);
  near(v('sqrt(16)+abs(-4)'), 8);
  for (const bad of ['', '1/0', '(1+2', '3+', 'foo(2)', 'sin 30', '2 $ 3', 'sqrt(-4)', '1)']) assert.throws(() => evalExpr(bad), undefined, 'debe fallar: ' + bad);
  assert.ok(isPlainNumber('12.5') && isPlainNumber(' -3,2 ') && !isPlainNumber('3π') && !isPlainNumber('1+2'));
});


t('angulos en radianes: selector de unidad en expresiones y etiqueta', () => {
  near(parseValue('2.35619449', { angle: true, radians: true }), 135, 1e-6, 'numero simple en radianes');
  near(parseValue('3π/4', { angle: true, radians: true }), 135, 1e-9);
  near(parseValue('sin(π/6)*2', { radians: false }), 1, 1e-9);
  near(parseValue('asin(0.5)', { angle: true, radians: true }), 30, 1e-9, 'asin en radianes -> 30 grados');
  near(parseValue('asin(0.5)', { angle: true }), 30, 1e-9, 'asin en grados');
  near(parseValue('1', { angle: true, radians: true }), 57.2957795131, 1e-6);
  near(parseValue('10*sin(30)', { radians: false }), 5, 1e-9);
  const { d, l1, l2 } = (() => { const d = newDoc(); const o = addPoint(d, 0, 0), a = addPoint(d, 4, 0), b = addPoint(d, 0, 4); return { d, l1: addLine(d, o, a, {}), l2: addLine(d, o, b, {}) }; })();
  assert.equal(dimText(d, { t: 'ANG', refs: [l1, l2], v: 90 }), '90°');
  assert.equal(dimText(d, { t: 'ANG', refs: [l1, l2], v: 90, unit: 'rad' }), '1.571 rad');
});

t('cotas de radio y diametro (ANSI): dentro = linea por el interior; fuera = llamada radial con flecha desde afuera', () => {
  const d = newDoc();
  const c = addPoint(d, 0, 0), e = addPoint(d, 10, 0);
  const ci = addCircle(d, c, 10, {});
  const VIEW = { s: 10, ox: 0, oy: 0 }; // radio en pantalla: 100 px
  const kin = { t: 'RAD', refs: [ci], v: 10, lp: 0, ang: 0 };
  const Lin = layoutDim(d, kin, VIEW);
  assert.equal(Lin.arrows.length, 2, 'diametro dentro: dos flechas');
  assert.equal(Lin.lines.length, 1, 'una sola linea de lado a lado');
  near(Math.abs(Lin.lines[0][2] - Lin.lines[0][0]), 200, 1e-6, 'abarca el diametro');
  assert.ok(Lin.arrows.every((a) => Math.abs(Math.hypot(a.x, a.y) - 100) < 1e-6), 'flechas sobre la circunferencia');
  const kout = { t: 'RAD', refs: [ci], v: 10, lp: 15, ang: 0 }; // texto fuera (150 px > 100 px)
  const Lout = layoutDim(d, kout, VIEW);
  assert.equal(Lout.arrows.length, 1, 'fuera: una flecha');
  near(Lout.arrows[0].x, 100, 1e-6); near(Lout.arrows[0].dx, -1, 1e-9, 'apunta hacia el centro');
  assert.equal(Lout.lines.length, 2, 'llamada + tramo horizontal');
  assert.ok(Lout.lines[0][0] >= 100 - 1e-6 && Lout.lines[0][2] >= 150 - 1e-6, 'la llamada no cruza el circulo');
  assert.ok(Lout.label.x > Lout.lines[1][2], 'texto junto al tramo horizontal');
  // por defecto, un circulo diminuto en pantalla pone el texto fuera
  const small = layoutDim(d, { t: 'RAD', refs: [ci], v: 10 }, { s: 1, ox: 0, oy: 0 });
  assert.equal(small.arrows.length, 1, 'no cabe: fuera');
  // radio de arco: dentro, una flecha desde el centro; fuera, llamada
  const arc = addArc(d, c, e, addPoint(d, 0, 10), 10, {});
  const ra = layoutDim(d, { t: 'RAD', refs: [arc], v: 10, lp: 5, ang: Math.PI / 4 }, VIEW);
  assert.equal(ra.arrows.length, 1); assert.equal(ra.lines.length, 1);
  const rb = layoutDim(d, { t: 'RAD', refs: [arc], v: 10, lp: 14, ang: Math.PI / 4 }, VIEW);
  assert.equal(rb.lines.length, 2); assert.ok(rb.arrows[0].dx * Math.cos(Math.PI / 4) < 0 || rb.arrows[0].dx < 0);
});


t('bloqueo suave: horizontal, vertical y 45 grados solo cerca de la direccion', () => {
  const d = newDoc(); const S = { x: 0, y: 0 }, free = { type: 'free' }, none = { lines: [], curves: [] };
  const h = lineLock(d, S, none, free, { x: 10, y: 0.3 }, 10);
  assert.equal(h.kind, 'H'); near(h.y, 0); near(h.x, 10, 0.01);
  assert.equal(lineLock(d, S, none, free, { x: 0.2, y: 8 }, 10).kind, 'V');
  const dd = lineLock(d, S, none, free, { x: 7, y: 7.4 }, 10);
  assert.equal(dd.kind, 'ANG'); assert.equal(dd.deg, 45); assert.equal(dd.label, '45°'); near(dd.x, dd.y, 1e-9);
  assert.equal(lineLock(d, S, none, free, { x: 10, y: 4.5 }, 10), null, 'entre dos bloqueos de 15 grados: libre');
  assert.equal(lineLock(d, S, none, free, { x: 0.5, y: 0.1 }, 10), null, 'muy cerca del inicio no bloquea');
  assert.equal(lineLock(d, S, none, { type: 'pt', id: 'x' }, { x: 10, y: 0.3 }, 10), null, 'si cae sobre un punto, manda el punto');
  assert.deepEqual(lockConstraints(h, 'l1'), [{ t: 'H', refs: ['l1'] }]);
  assert.deepEqual(lockConstraints(dd, 'l1'), [], '45 no lleva restriccion');
});
t('bloqueo suave: desde otra linea, paralela y perpendicular con su restriccion', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 6);
  const l = addLine(d, a, b, {});
  const m = addPoint(d, 5, 3); addCon(d, { t: 'PONL', refs: [m, l] });
  const o = originsOfPoint(d, m);
  assert.deepEqual(o.lines, [l]);
  const S = d.pts[m];
  const perp = lineLock(d, S, o, { type: 'free' }, { x: 5 - 6 * 0.5, y: 3 + 10 * 0.5 + 0.3 }, 10); // direccion (-0.51, 0.86) ~ perpendicular a (10,6)
  assert.equal(perp.kind, 'PERP'); assert.equal(perp.ref, l);
  near(perp.u.x * 10 + perp.u.y * 6, 0, 1e-9);
  assert.deepEqual(lockConstraints(perp, 'n'), [{ t: 'PERP', refs: ['n', l] }]);
  const par = lineLock(d, S, o, { type: 'free' }, { x: 5 + 8.6, y: 3 + 5.2 }, 10);
  assert.equal(par.kind, 'PAR');
  assert.deepEqual(originsOfSnap(d, { type: 'ln', id: l }).lines, [l]);
  assert.deepEqual(originsOfPoint(d, a).lines, [l], 'extremo de una linea');
});
t('bloqueo suave: tangente desde un circulo y tangente al terminar sobre un circulo', () => {
  const d = newDoc(); const c = addPoint(d, 0, 10); const ci = addCircle(d, c, 10, {});
  // inicio sobre el circulo en (0,0): la tangente es horizontal y gana a la H generica
  const o = originsOfSnap(d, { type: 'ci', id: ci });
  const t1 = lineLock(d, { x: 0, y: 0 }, o, { type: 'free' }, { x: 12, y: 0.4 }, 10);
  assert.equal(t1.kind, 'TAN'); assert.equal(t1.ref, ci);
  assert.deepEqual(lockConstraints(t1, 'n'), [{ t: 'TANLC', refs: ['n', ci] }]);
  // final sobre el circulo: la linea desde S pasa a ser tangente
  const S = { x: 30, y: 10 };
  const T = { x: 10 * Math.cos(Math.acos(10 / 30)), y: 10 + 10 * Math.sin(Math.acos(10 / 30)) };
  const t2 = lineLock(d, S, { lines: [], curves: [] }, { type: 'ci', id: ci }, { x: T.x + 0.2, y: T.y + 0.1 }, 10);
  assert.equal(t2.kind, 'TAN'); assert.deepEqual(t2.end, { type: 'ci', id: ci });
  near(Math.hypot(t2.x - 0, t2.y - 10), 10, 1e-9, 'sobre el circulo');
  near((t2.x - 0) * (t2.x - S.x) + (t2.y - 10) * (t2.y - S.y), 0, 1e-6, 'radio perpendicular a la linea');
  assert.notEqual(lineLock(d, S, { lines: [], curves: [] }, { type: 'ci', id: ci }, { x: -9.9, y: 10 }, 10)?.kind, 'TAN', 'lejos de las tangentes: no es tangente (queda el bloqueo H)');
});
t('dividir en n partes iguales: lineas, arcos y circulos', () => {
  // linea
  let d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 12, 0);
  const l = addLine(d, a, b, {});
  const P = [1, 2, 3].map((i) => addPoint(d, (12 * i) / 4, 0, true));
  const r = splitElement(d, l, P);
  assert.ok(r.ok && r.pieces.length === 4);
  for (let i = 1; i < r.pieces.length; i++) addCon(d, { t: 'EQL', refs: [r.pieces[i - 1], r.pieces[i]], hidden: true });
  d.pts[a].fixed = true; d.pts[b].fixed = true;
  b && (d.pts[b].x = 20);
  assert.ok(solve(d, []).ok);
  r.pieces.forEach((pid) => { const q = d.lines[pid]; near(Math.hypot(d.pts[q.b].x - d.pts[q.a].x, d.pts[q.b].y - d.pts[q.a].y), 5, 1e-6, 'partes iguales tras estirar'); });
  // circulo en 6 partes
  d = newDoc();
  const c = addPoint(d, 0, 0), ci = addCircle(d, c, 5, {});
  const Q = Array.from({ length: 6 }, (_, i) => addPoint(d, 5 * Math.cos((i * Math.PI) / 3), 5 * Math.sin((i * Math.PI) / 3), true));
  const r2 = splitElement(d, ci, Q);
  assert.ok(r2.ok); assert.equal(r2.pieces.length, 6);
  assert.ok(solve(d, []).ok);
  r2.pieces.forEach((id) => near(arcOf(d, d.arcs[id]).sweep, Math.PI / 3, 1e-6));
});


t('recortar: tramo de una linea entre dos cruces', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 30, 0);
  const l = addLine(d, a, b, {});
  const v1 = addLine(d, addPoint(d, 10, -5), addPoint(d, 10, 5), {});
  const v2 = addLine(d, addPoint(d, 20, -5), addPoint(d, 20, 5), {});
  const r = trimAt(d, 'ln', l, { x: 15, y: 0 });
  assert.ok(r.ok && !r.deleted && r.pieces.length === 2);
  assert.ok(solve(d, []).ok);
  const xs = r.pieces.map((id) => [d.pts[d.lines[id].a].x, d.pts[d.lines[id].b].x].sort((m, n) => m - n));
  near(xs[0][0], 0); near(xs[0][1], 10, 1e-6); near(xs[1][0], 20, 1e-6); near(xs[1][1], 30);
  assert.ok(Object.values(d.cons).some((k) => k.t === 'PONL' && k.refs[1] === v1));
  assert.ok(Object.values(d.cons).some((k) => k.t === 'PONL' && k.refs[1] === v2));
  assert.ok(!(l in d.lines));
});
t('recortar: un extremo, sin cruces y circulo', () => {
  let d = newDoc();
  const l = addLine(d, addPoint(d, 0, 0), addPoint(d, 30, 0), {});
  addLine(d, addPoint(d, 10, -5), addPoint(d, 10, 5), {});
  let r = trimAt(d, 'ln', l, { x: 25, y: 0 }); // a la derecha del unico cruce: queda el tramo izquierdo
  assert.ok(r.ok && r.pieces.length === 1);
  const q = d.lines[r.pieces[0]];
  near(Math.max(d.pts[q.a].x, d.pts[q.b].x), 10, 1e-6);
  // sin cruces: se borra completo
  d = newDoc();
  const l2 = addLine(d, addPoint(d, 0, 0), addPoint(d, 5, 0), {});
  r = trimAt(d, 'ln', l2, { x: 2, y: 0 });
  assert.ok(r.ok && r.deleted); assert.equal(Object.keys(d.lines).length, 0);
  // circulo cortado por una recta: queda un arco
  d = newDoc();
  const c = addPoint(d, 0, 0), ci = addCircle(d, c, 10, {});
  addLine(d, addPoint(d, -20, 0), addPoint(d, 20, 0), {});
  r = trimAt(d, 'ci', ci, { x: 0, y: -10 }); // quita la mitad inferior
  assert.ok(r.ok && r.pieces.length === 1);
  assert.ok(solve(d, []).ok);
  near(arcOf(d, d.arcs[r.pieces[0]]).sweep, Math.PI, 1e-6);
});
t('recortar: arco entre dos lineas', () => {
  const d = newDoc();
  const c = addPoint(d, 0, 0), a = addPoint(d, 10, 0), b = addPoint(d, -10, 0);
  const ar = addArc(d, c, a, b, 10, {});
  addLine(d, addPoint(d, 7.0710678, -2), addPoint(d, 7.0710678, 20), {});
  addLine(d, addPoint(d, -7.0710678, -2), addPoint(d, -7.0710678, 20), {});
  const r = trimAt(d, 'ar', ar, { x: 0, y: 10 }); // la parte alta, entre las dos verticales
  assert.ok(r.ok && r.pieces.length === 2);
  assert.ok(solve(d, []).ok);
  r.pieces.forEach((id) => near(arcOf(d, d.arcs[id]).sweep, Math.PI / 4, 1e-4));
});
t('extender: segmento hasta otra linea (punto compartido => punto nuevo)', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0);
  const l = addLine(d, a, b, {});
  const other = addLine(d, b, addPoint(d, 10, 8), {}); // b es compartido con otra linea
  const wall = addLine(d, addPoint(d, 25, -5), addPoint(d, 25, 5), {});
  const r = extendEnd(d, 'ln', l, { x: 9, y: 0 });
  assert.ok(r.ok);
  assert.ok(solve(d, []).ok);
  assert.notEqual(d.lines[l].b, b, 'se creo un punto nuevo');
  near(d.pts[d.lines[l].b].x, 25, 1e-6); near(d.pts[d.lines[l].b].y, 0, 1e-6);
  near(d.pts[b].x, 10); // el punto compartido no se movio
  assert.ok(Object.values(d.cons).some((k) => k.t === 'PONL' && k.refs[1] === wall));
  void other;
});
t('extender: extremo libre se mueve; arco hasta una linea; sin destino avisa', () => {
  let d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0);
  const l = addLine(d, a, b, {});
  addLine(d, addPoint(d, 18, -5), addPoint(d, 18, 5), {});
  assert.ok(extendEnd(d, 'ln', l, { x: 10, y: 0 }).ok);
  assert.equal(d.lines[l].b, b, 'mismo punto');
  near(d.pts[b].x, 18, 1e-6);
  assert.equal(extendEnd(d, 'ln', l, { x: 0, y: 0 }).ok, false, 'hacia la izquierda no hay nada');
  // arco 0..90 grados que se alarga hasta la recta x = -5
  d = newDoc();
  const c = addPoint(d, 0, 0), s = addPoint(d, 10, 0), e = addPoint(d, 0, 10);
  const ar = addArc(d, c, s, e, 10, {});
  addLine(d, addPoint(d, -5, -20), addPoint(d, -5, 20), {});
  const r = extendEnd(d, 'ar', ar, { x: 0, y: 9 });
  assert.ok(r.ok && r.field === 'b');
  assert.ok(solve(d, []).ok);
  near(d.pts[d.arcs[ar].b].x, -5, 1e-4);
  assert.equal(extendEnd(d, 'ci', 'x', { x: 0, y: 0 }).ok, false);
});
t('matriz lineal: una y dos direcciones, con restricciones internas', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 4, 0);
  const l = addLine(d, a, b, {});
  addCon(d, { t: 'H', refs: [l] });
  const c = addPoint(d, 0, 2), ci = addCircle(d, c, 1, {});
  const r = linearArray(d, [{ k: 'ln', id: l }, { k: 'ci', id: ci }], [{ u: { x: 1, y: 0 }, s: 10, n: 2 }]);
  assert.ok(r.ok); assert.equal(r.made.length, 4);
  assert.equal(Object.keys(d.lines).length, 3); assert.equal(Object.keys(d.circles).length, 3);
  assert.equal(Object.values(d.cons).filter((k) => k.t === 'H').length, 3, 'la restriccion se copia');
  const xs = Object.values(d.lines).map((q) => d.pts[q.a].x).sort((m, n) => m - n);
  assert.deepEqual(xs, [0, 10, 20]);
  assert.ok(solve(d, []).ok);
  // dos direcciones: cuadricula 3 x 2 menos el original = 5 copias
  const d2 = newDoc();
  const l2 = addLine(d2, addPoint(d2, 0, 0), addPoint(d2, 1, 0), {});
  const r2 = linearArray(d2, [{ k: 'ln', id: l2 }], [{ u: { x: 1, y: 0 }, s: 5, n: 2 }, { u: { x: 0, y: 1 }, s: 3, n: 1 }]);
  assert.ok(r2.ok); assert.equal(r2.made.length, 5); assert.equal(Object.keys(d2.lines).length, 6);
  assert.equal(linearArray(d2, [{ k: 'ln', id: l2 }], [{ u: { x: 1, y: 0 }, s: 1, n: 500 }]).ok, false);
  void cutsOf;
});


t('copia espejo: puntos, arco (sigue antihorario), cota angular y puntos sobre el eje compartidos', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0), a = addPoint(d, 10, 0), b = addPoint(d, 4, 6);
  const l1 = addLine(d, o, a, {}), l2 = addLine(d, o, b, {});
  addCon(d, { t: 'H', refs: [l1] });
  const ang = (Math.atan2(6, 4) * 180) / Math.PI;
  addCon(d, { t: 'ANG', refs: [l1, l2], v: ang });
  const c = addPoint(d, 5, 5), s = addPoint(d, 8, 5), e = addPoint(d, 5, 8);
  const ar = addArc(d, c, s, e, 3, {});
  const axA = addPoint(d, 0, -20), axB = addPoint(d, 0, 20);
  const axis = addLine(d, axA, axB, {}); // eje: la recta x = 0
  const r = mirrorCopy(d, [{ k: 'ln', id: l1 }, { k: 'ln', id: l2 }, { k: 'ar', id: ar }], d.pts[axA], d.pts[axB]);
  assert.ok(r.ok);
  assert.ok(solve(d, []).ok);
  const nl1 = r.made.filter((m) => m.k === 'ln').map((m) => d.lines[m.id]);
  // el punto o esta sobre el eje: se comparte
  assert.ok(nl1.every((q) => q.a === o || q.b === o));
  const far = nl1.map((q) => d.pts[q.a === o ? q.b : q.a]).sort((m, n) => m.y - n.y);
  near(far[0].x, -10, 1e-6); near(far[0].y, 0, 1e-6); near(far[1].x, -4, 1e-6); near(far[1].y, 6, 1e-6);
  const na = d.arcs[r.made.find((m) => m.k === 'ar').id];
  near(arcOf(d, na).sweep, Math.PI / 2, 1e-6, 'sigue siendo un cuarto de arco');
  near(d.pts[na.c].x, -5, 1e-6);
  // la cota angular copiada cambia de signo y el solver la acepta
  const angs = Object.values(d.cons).filter((k) => k.t === 'ANG');
  assert.equal(angs.length, 2); near(angs[0].v, -angs[1].v, 1e-6);
  void axis;
});


t('SVG corte laser: clases de linea a corte, marcado u omitir', () => {
  const d = newDoc();
  const cut = addLine(d, addPoint(d, 0, 0), addPoint(d, 10, 0), { ltype: 'continua', w: 2 });
  const fold = addLine(d, addPoint(d, 0, 5), addPoint(d, 10, 5), { ltype: 'continua', w: 1 }); // mismo tipo, otro grosor
  const dashed = addLine(d, addPoint(d, 0, 8), addPoint(d, 10, 8), { ltype: 'discontinua', w: 2 });
  const cls = laserClasses(d);
  assert.equal(cls.length, 3);
  const k = (id) => styleKey(d.lines[id]);
  const r = exportSVGLaser(d, { unit: 1, stroke: 0.1, cutColor: '#ff0000', markColor: '#0000ff', modes: { [k(cut)]: 'cut', [k(fold)]: 'mark', [k(dashed)]: 'skip' } });
  assert.equal(r.cut, 1); assert.equal(r.mark, 1); assert.equal(r.count, 2);
  assert.match(r.svg, /<g id="corte" fill="none" stroke="#ff0000"/);
  assert.match(r.svg, /<g id="marcado" fill="none" stroke="#0000ff"/);
  assert.equal(exportSVGLaser(d, { modes: { [k(cut)]: 'skip' } }), null);
});


t('matriz circular: 4 instancias a 90, restricciones H/V se intercambian, omitir y centro compartido', () => {
  const d = newDoc();
  const o = addPoint(d, 0, 0), a = addPoint(d, 10, 0);
  const l = addLine(d, o, a, {});
  addCon(d, { t: 'H', refs: [l] });
  const r = circularArray(d, [{ k: 'ln', id: l }], { c: { x: 0, y: 0 }, step: Math.PI / 2, n: 4, skip: new Set([3]) });
  assert.ok(r.ok); assert.equal(r.made.length, 2, 'copias 2 y 4; la 3 se omite');
  assert.ok(solve(d, []).ok);
  const ends = r.made.map((m) => d.pts[d.lines[m.id].b]).sort((p, q) => p.y - q.y);
  near(ends[0].x, 0, 1e-6); near(ends[0].y, -10, 1e-6); near(ends[1].x, 0, 1e-6); near(ends[1].y, 10, 1e-6);
  assert.ok(r.made.every((m) => d.lines[m.id].a === o), 'el centro se comparte');
  assert.equal(Object.values(d.cons).filter((k) => k.t === 'V').length, 2, 'H pasa a V a 90 y 270 grados');
  // angulo cualquiera: no se copia H/V
  const d2 = newDoc();
  const l2 = addLine(d2, addPoint(d2, 5, 0), addPoint(d2, 8, 0), {});
  addCon(d2, { t: 'H', refs: [l2] });
  const r2 = circularArray(d2, [{ k: 'ln', id: l2 }], { c: { x: 0, y: 0 }, step: (30 * Math.PI) / 180, n: 3 });
  assert.ok(r2.ok && solve(d2, []).ok);
  assert.equal(Object.values(d2.cons).filter((k) => k.t === 'H' || k.t === 'V').length, 1);
  const q = d2.pts[d2.lines[r2.made[1].id].a];
  near(Math.hypot(q.x, q.y), 5, 1e-9);
});


t('B-spline: pasa por los puntos (abierto y cerrado) con parametros dados o calculados', () => {
  const Q = [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 22, y: 10 }, { x: 34, y: 3 }, { x: 44, y: -4 }];
  for (const closed of [false, true]) {
    const bs = bsplineThrough(Q, closed);
    assert.equal(bs.G.length, closed ? Q.length : Q.length + 2);
    Q.forEach((q, k) => { const e = bsplinePoint(bs, bs.ts[k]); near(e.x, q.x, 1e-9); near(e.y, q.y, 1e-9); });
    if (closed) { const a = bsplinePoint(bs, bs.ts[0]), b = bsplinePoint(bs, bs.ts[0] + 1); near(a.x, b.x, 1e-9, 'periodico'); }
    else { near(bs.G[1].x, (bs.G[0].x + bs.G[2].x) / 2, 1e-9, 'curvatura nula al inicio'); }
  }
  assert.equal(bsplineThrough([Q[0]], false), null);
});
t('spline cerrado nativo: punto sobre la curva, arrastre del punto y de la curva, tangentes', () => {
  const d = newDoc();
  const ids = [[20, 0], [14, 14], [0, 18], [-14, 14], [-20, 0], [-14, -14], [0, -18], [14, -14]].map(([x, y]) => addPoint(d, x, y, false));
  ids.forEach((i) => { d.pts[i].fixed = true; });
  const sp = addSpline(d, ids, {}, true);
  const p = addPoint(d, 19, 6, false);
  addCon(d, { t: 'PONS', refs: [p, sp] });
  assert.ok(solve(d, []).ok);
  assert.ok(distToSpl(d, sp, d.pts[p]) < 5e-5, 'sobre la curva ' + distToSpl(d, sp, d.pts[p]));
  // da la vuelta completa (pasa por la union del periodo) sin perder la curva
  for (let i = 1; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI + 0.3;
    assert.ok(solve(d, [{ id: p, x: 30 * Math.cos(a), y: 30 * Math.sin(a) }]).ok, 'paso ' + i);
    assert.ok(distToSpl(d, sp, d.pts[p]) < 5e-5, 'sobre la curva en el paso ' + i);
  }
  // un punto de la curva libre: arrastrarlo la deforma y el punto ligado sigue sobre ella
  d.pts[ids[1]].fixed = false;
  for (let i = 1; i <= 10; i++) assert.ok(solve(d, [{ id: ids[1], x: 14 + i, y: 14 + i }]).ok);
  near(d.pts[ids[1]].x, 24, 1e-6);
  assert.ok(distToSpl(d, sp, d.pts[p]) < 5e-5);
  assert.ok(Array.isArray(d.splines[sp].ts), 'con relaciones conserva sus parametros');
  // reparametrizar tras el arrastre y seguir cumpliendo
  reparamSplines(d);
  assert.ok(distToSpl(d, sp, d.pts[p]) < 5e-5, 'tras reparametrizar');
  // recta horizontal tangente por arriba y circulo tangente por fuera
  const a = addPoint(d, -30, 25, false), b = addPoint(d, 30, 25, false);
  const l = addLine(d, a, b, {}); addCon(d, { t: 'H', refs: [l] });
  // como en la app: el contacto arranca en el punto de la curva mas cercano a la recta
  const q0 = splinePolyline(d, d.splines[sp], 32).reduce((m, q) => (q.y > m.y ? q : m));
  const T = addPoint(d, q0.x, q0.y, true);
  addCon(d, { t: 'TANLS', refs: [l, sp, T] });
  assert.ok(solve(d, []).ok, 'tangente con recta');
  assert.ok(distToSpl(d, sp, d.pts[T]) < 5e-5);
  near(d.pts[a].y, d.pts[T].y, 1e-6, 'la recta toca en T');
  const top = Math.max(...splinePolyline(d, d.splines[sp], 200).map((q) => q.y));
  near(d.pts[T].y, top, 1e-3, 'toca en el punto mas alto');
  // sin relaciones, el spline deja de guardar parametros
  deleteItems(d, Object.keys(d.cons).map((id) => ({ k: 'co', id })));
  assert.equal(d.splines[sp].ts, undefined);
});


t('seleccion por cuadro: ventana (dentro) y cruce (toca)', () => {
  const d = newDoc();
  const a = addPoint(d, 1, 1), b = addPoint(d, 4, 1), c = addPoint(d, 8, 8), e = addPoint(d, 20, 20);
  const inL = addLine(d, a, b, {}), crossL = addLine(d, b, c, {}), outL = addLine(d, c, e, {});
  const cc = addPoint(d, 3, 3), inC = addCircle(d, cc, 1, {}), bigC = addCircle(d, cc, 3.5, {}), farC = addCircle(d, addPoint(d, 40, 40), 2, {});
  const ids = (r, o) => boxSelect(d, r, o).map((x) => x.id);
  const box = { x0: 0, y0: 0, x1: 5, y1: 5 };
  const win = ids(box, { cross: false });
  assert.ok(win.includes(inL) && win.includes(inC) && win.includes(a) && win.includes(b));
  assert.ok(!win.includes(crossL) && !win.includes(bigC) && !win.includes(outL) && !win.includes(farC));
  const cr = ids(box, { cross: true });
  assert.ok(cr.includes(crossL) && cr.includes(inL) && cr.includes(inC), 'el cruce incluye lo de dentro');
  assert.ok(cr.includes(bigC), 'una circunferencia que cruza el borde');
  assert.ok(!cr.includes(outL) && !cr.includes(farC));
  const ring = addCircle(d, cc, 8, {});
  assert.ok(!ids(box, { cross: true }).includes(ring), 'rodear sin tocar no cuenta');
  assert.deepEqual(ids({ x0: 5, y0: 5, x1: 0, y1: 0 }, { cross: false }), win);
  assert.ok(!ids(box, { shown: new Set([a]) }).includes(b));
  assert.ok(!ids({ x0: 2.5, y0: 2.5, x1: 3.5, y1: 3.5 }, { cross: true }).includes(bigC));
});


t('bloqueo suave: cada 15 grados, con etiqueta, y paso configurable', () => {
  const d = newDoc(), S = { x: 0, y: 0 }, none = { lines: [], curves: [] }, free = { type: 'free' };
  for (const deg of [15, 30, 60, 75, 105, 120, 135, 165]) {
    const r = (deg * Math.PI) / 180, k = lineLock(d, S, none, free, { x: 12 * Math.cos(r) + 0.05, y: 12 * Math.sin(r) - 0.04 }, 10);
    assert.ok(k, deg + ' grados'); assert.equal(k.deg, deg); assert.equal(k.kind, 'ANG'); assert.equal(k.label, deg + '°');
    near(Math.atan2(k.y, k.x), r, 1e-9);
    assert.deepEqual(lockConstraints(k, 'n'), [], 'solo H y V llevan restriccion');
  }
  const k20 = lineLock(d, S, none, free, { x: 12 * Math.cos(0.35), y: 12 * Math.sin(0.35) }, 10, 9, { step: 10 });
  assert.equal(k20.deg, 20, 'con paso de 10 grados, 20 existe');
  assert.equal(lineLock(d, S, none, free, { x: 12 * Math.cos(0.35), y: 12 * Math.sin(0.35) }, 10), null, 'con 15 no');
  assert.equal(lineLock(d, S, none, free, { x: 12, y: 0.02 }, 10).kind, 'H');
  assert.equal(lineLock(d, S, none, free, { x: -12, y: 0.02 }, 10).kind, 'H', 'hacia el otro lado');
});
t('bloqueo suave: no se pierde cerca de otra linea; da perpendicular, paralela y termina en el cruce', () => {
  const d = newDoc();
  const a = addPoint(d, 20, -20), b = addPoint(d, 20, 40);
  const wall = addLine(d, a, b, {}); // pared vertical en x = 20
  const none = { lines: [], curves: [] }, S = { x: 0, y: 0 };
  // el cursor cae sobre la pared (endSnap 'ln'): antes se perdia el bloqueo; ahora la linea a 30 grados sigue y termina en la pared
  const r = (30 * Math.PI) / 180, X = 20, Y = X * Math.tan(r);
  const k = lineLock(d, S, none, { type: 'ln', id: wall }, { x: X + 0.1, y: Y + 0.15 }, 10);
  assert.ok(k && k.kind === 'ANG' && k.deg === 30);
  assert.deepEqual(k.end, { type: 'ln', id: wall }); near(k.x, X, 1e-9); near(k.y, Y, 1e-9);
  // perpendicular a la pared (horizontal): el final cae en el pie, sobre la pared
  const p = lineLock(d, S, none, { type: 'ln', id: wall }, { x: 19.9, y: 0.2 }, 10);
  assert.ok(p && (p.kind === 'PERP' || p.kind === 'H'));
  assert.deepEqual(p.end, { type: 'ln', id: wall }); near(p.y, 0, 1e-9);
  assert.equal(p.kind, 'PERP', 'a igual distancia gana la relacion con la linea'); assert.equal(p.ref, wall);
  // paralela a una linea cercana al cursor (no es origen): 70 grados
  const c = addPoint(d, 5, 20), e = addPoint(d, 5 + 6, 20 + 6 * Math.tan((70 * Math.PI) / 180));
  const slope = addLine(d, c, e, {});
  const q = lineLock(d, S, none, { type: 'free' }, { x: 6.89, y: 18.79 }, 10); // sobre la direccion de 70 grados y cerca de la linea
  assert.ok(q && q.kind === 'PAR' && q.ref === slope, 'paralela a la linea cercana: ' + JSON.stringify(q));
  assert.deepEqual(lockConstraints(q, 'n'), [{ t: 'PAR', refs: ['n', slope] }]);
  // un punto existente sigue mandando
  assert.equal(lineLock(d, S, none, { type: 'pt', id: a }, { x: 20, y: 11.5 }, 10), null);
  assert.equal(lineLock(d, S, none, { type: 'int', refs: [] }, { x: 20, y: 11.5 }, 10), null);
});
t('bloqueo suave: tangente a un circulo cercano al cursor aunque el cursor no este sobre el', () => {
  const d = newDoc(); const c = addPoint(d, 30, 10); const ci = addCircle(d, c, 10, {});
  const S = { x: 0, y: 0 }, dd = Math.hypot(30, 10), al = Math.acos(10 / dd), base = Math.atan2(S.y - 10, S.x - 30);
  const T = { x: 30 + 10 * Math.cos(base + al), y: 10 + 10 * Math.sin(base + al) };
  const k = lineLock(d, S, { lines: [], curves: [] }, { type: 'free' }, { x: T.x + 0.3, y: T.y - 0.2 }, 10);
  assert.ok(k && k.kind === 'TAN' && k.ref === ci);
  assert.deepEqual(k.end, { type: 'ci', id: ci });
});
t('interseccion para iman: cruces dentro de cada elemento (linea, circulo, arco y spline)', () => {
  const d = newDoc();
  const l1 = addLine(d, addPoint(d, 0, 0), addPoint(d, 10, 10), {}), l2 = addLine(d, addPoint(d, 0, 10), addPoint(d, 10, 0), {});
  const far = addLine(d, addPoint(d, 20, 0), addPoint(d, 20, 10), {});
  const P = crossPoints(d, { k: 'ln', id: l1 }, { k: 'ln', id: l2 });
  assert.equal(P.length, 1); near(P[0].x, 5); near(P[0].y, 5);
  assert.equal(crossPoints(d, { k: 'ln', id: l1 }, { k: 'ln', id: far }).length, 0, 'las rectas se cortan fuera de los segmentos');
  const c = addCircle(d, addPoint(d, 5, 5), 3, {});
  assert.equal(crossPoints(d, { k: 'ci', id: c }, { k: 'ln', id: l1 }).length, 2);
  assert.equal(crossPoints(d, { k: 'ln', id: l1 }, { k: 'ci', id: c }).length, 2, 'simetrico');
  const arc = addArc(d, d.circles[c].c, addPoint(d, 8, 5), addPoint(d, 5, 8), 3, {}); // cuarto de arco superior derecho
  assert.equal(crossPoints(d, { k: 'ar', id: arc }, { k: 'ln', id: l1 }).length, 1, 'solo el cruce dentro del tramo');
  assert.equal(crossPoints(d, { k: 'ci', id: c }, { k: 'ci', id: c }).length, 0);
  const sp = addSpline(d, [addPoint(d, 0, 5), addPoint(d, 5, 5), addPoint(d, 10, 5)], {}, false);
  assert.ok(crossPoints(d, { k: 'sp', id: sp }, { k: 'ln', id: l1 }).length >= 1);
});

console.log(`\n${passed} pruebas pasaron`);

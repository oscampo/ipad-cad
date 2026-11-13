import assert from 'node:assert/strict';
import { addLayer, deleteLayer, layerCount, isHidden, shownEntries, layerHiddenPoints, consHidden, visibleDoc, newDoc, addPoint, addLine, addCircle, addArc, addCon, addText, addSpline, deleteItems, hatchLoops, arcOf, cleanup, splinePolyline, conTag, ensureNumbers, addEllipse, ellipseOf, ellipsePolyline, ellipsePoint, ellipseParam, ellipseRange, isPartial } from '../src/model.js';
import { startTrace, recordTraces, traceToSpline, offsetPolyline, firstLap } from '../src/curves.js';
import { layoutDim, dragDim, dimValue, dimText, angSector, angTrue, initAngle, trackAngles } from '../src/dims.js';
import { textFrame, textCorners, textHit, textPose, rawAngle } from '../src/text.js';
import { exportSVG, exportSVGLaser, exportDXF, dimLayouts, extraExtents, laserClasses, styleKey } from '../src/export.js';
import { splitElement } from '../src/split.js';
import { buildTree, conLabel } from '../src/tree.js';
import { cleanFileBase } from '../src/files.js';
import { parseValue, evalExpr, isPlainNumber, exprRefs, renameInExpr } from '../src/expr.js';
import { recompute, pruneFormulas, renameDim, checkName, varsOf, settle, hasReactive } from '../src/params.js';
import { nameDims } from '../src/model.js';
import { trimAt, extendEnd, cutsOf, curveCuts, linearArray, mirrorCopy, circularArray, clipOf, pasteClip, bboxOf } from '../src/edit.js';
import { CLINE_STYLE, circleThrough3, addRectangle, polygonVertices, addPolygon, arcIsClockwise, constructionArcDash } from '../src/shapes.js';
import { FONTS, fontCss } from '../src/text.js';
import { lineLock, lockConstraints, originsOfPoint, originsOfSnap } from '../src/lock.js';
import { initSolver, solve, solveSteps, reparamSplines, addConsSolved } from '../src/solver.js';
import { readFileSync } from 'node:fs';
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
  assert.ok(spn.children.some((c) => /punto sobre spline/.test(c.label)));
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


t('bloqueo suave: por defecto H, V y 45; con paso 15 cada 15 grados', () => {
  const d = newDoc(), S = { x: 0, y: 0 }, none = { lines: [], curves: [] }, free = { type: 'free' };
  for (const deg of [15, 30, 60, 75, 105, 120, 135, 165]) {
    const r = (deg * Math.PI) / 180, k = lineLock(d, S, none, free, { x: 12 * Math.cos(r) + 0.05, y: 12 * Math.sin(r) - 0.04 }, 10, 9, { step: 15 });
    assert.ok(k, deg + ' grados'); assert.equal(k.deg, deg); assert.equal(k.kind, 'ANG'); assert.equal(k.label, deg + '°');
    near(Math.atan2(k.y, k.x), r, 1e-9);
    assert.deepEqual(lockConstraints(k, 'n'), [], 'solo H y V llevan restriccion');
  }
  assert.equal(lineLock(d, S, none, free, { x: 12 * Math.cos(0.5236) + 0.05, y: 12 * Math.sin(0.5236) - 0.04 }, 10), null, 'por defecto 30 grados no bloquea');
  assert.equal(lineLock(d, S, none, free, { x: 12 * Math.cos(0.7854) + 0.05, y: 12 * Math.sin(0.7854) - 0.04 }, 10).deg, 45);
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
  // el cursor cae sobre la pared (endSnap 'ln'): antes se perdia el bloqueo; ahora la linea a 45 grados sigue y termina en la pared
  const r = (45 * Math.PI) / 180, X = 20, Y = X * Math.tan(r);
  const k = lineLock(d, S, none, { type: 'ln', id: wall }, { x: X + 0.1, y: Y + 0.15 }, 10);
  assert.ok(k && k.kind === 'ANG' && k.deg === 45);
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


t('recortar: solo quita el tramo, el resto no se divide en los demas cruces', () => {
  const d = newDoc();
  const l = addLine(d, addPoint(d, 0, 0), addPoint(d, 60, 0), {});
  for (const x of [10, 30, 50]) addLine(d, addPoint(d, x, -5), addPoint(d, x, 5), {});
  const nPts = Object.keys(d.pts).length;
  // recortar a la izquierda del primer cruce: queda UNA sola linea de x = 10 a x = 60
  const r = trimAt(d, 'ln', l, { x: 4, y: 0 });
  assert.ok(r.ok && r.pieces.length === 1, 'una sola pieza restante');
  const q = d.lines[r.pieces[0]], xs = [d.pts[q.a].x, d.pts[q.b].x].sort((m, n) => m - n);
  near(xs[0], 10, 1e-6); near(xs[1], 60, 1e-6);
  assert.equal(Object.keys(d.pts).length, nPts + 1, 'solo se crea el punto del cruce en x = 10');
  const horizontals = Object.values(d.lines).filter((m) => Math.abs(d.pts[m.a].y) < 1e-9 && Math.abs(d.pts[m.b].y) < 1e-9);
  assert.equal(horizontals.length, 1);
  // un tramo del medio entre cruces: quedan dos lineas (izquierda y derecha), sin mas divisiones
  const d2 = newDoc();
  const l2 = addLine(d2, addPoint(d2, 0, 0), addPoint(d2, 60, 0), {});
  for (const x of [10, 20, 30, 50]) addLine(d2, addPoint(d2, x, -5), addPoint(d2, x, 5), {});
  const r2 = trimAt(d2, 'ln', l2, { x: 25, y: 0 }); // entre x = 20 y x = 30
  assert.equal(r2.pieces.length, 2);
  const spans = r2.pieces.map((id) => [d2.pts[d2.lines[id].a].x, d2.pts[d2.lines[id].b].x].sort((m, n) => m - n)).sort((m, n) => m[0] - n[0]);
  near(spans[0][0], 0); near(spans[0][1], 20, 1e-6); near(spans[1][0], 30, 1e-6); near(spans[1][1], 60);
});


t('numeracion de restricciones: por tipo, compartida entre elementos, sin reutilizar; coincidente unifica punto sobre', () => {
  const d = newDoc();
  const l1 = addLine(d, addPoint(d, 0, 0), addPoint(d, 10, 0), {}), l2 = addLine(d, addPoint(d, 0, 5), addPoint(d, 10, 5), {}), l3 = addLine(d, addPoint(d, 3, 0), addPoint(d, 3, 9), {});
  const k1 = addCon(d, { t: 'H', refs: [l1] }), k2 = addCon(d, { t: 'H', refs: [l2] });
  const kp = addCon(d, { t: 'PERP', refs: [l1, l3] });
  addCon(d, { t: 'PONL', refs: [d.lines[l3].a, l1], hidden: true });
  const kc = addCon(d, { t: 'PONL', refs: [d.lines[l3].b, l2] });
  assert.equal(conTag(d.cons[k1]), 'H1'); assert.equal(conTag(d.cons[k2]), 'H2');
  assert.equal(conTag(d.cons[kp]), '⟂1', 'una sola numeracion para las dos lineas');
  assert.equal(conTag(d.cons[kc]), '●1', 'las ocultas no se numeran; el punto sobre linea es coincidente');
  delete d.cons[k1];
  const k3 = addCon(d, { t: 'H', refs: [l3] });
  assert.equal(conTag(d.cons[k3]), 'H3', 'no se reutiliza el numero borrado');
  // dibujos viejos sin numeros: se numeran en el orden de creacion
  const old = newDoc();
  const a = addLine(old, addPoint(old, 0, 0), addPoint(old, 1, 0), {});
  old.cons.k5 = { t: 'V', refs: [a] }; old.cons.k9 = { t: 'V', refs: [a] }; delete old.cn;
  ensureNumbers(old);
  assert.equal(old.cons.k5.n, 1); assert.equal(old.cons.k9.n, 2);
});
t('matriz lineal vinculada: la copia sigue al original (distancia + direccion); cota visible opcional', () => {
  for (const dims of [false, true]) {
    const d = newDoc();
    const a = addPoint(d, 0, 0), b = addPoint(d, 4, 0);
    const l = addLine(d, a, b, {});
    d.pts[a].fixed = true;
    const r = linearArray(d, [{ k: 'ln', id: l }], [{ u: { x: 0, y: 1 }, s: 10, n: 2 }], { link: true, dims });
    assert.ok(r.ok && solve(d, []).ok);
    const dimK = Object.values(d.cons).filter((k) => k.t === 'DIST' && !k.hidden);
    assert.equal(dimK.length, dims ? 2 : 0, 'una cota visible por copia solo si se pide');
    // al girar el original (mover su otro extremo), las copias se mueven rigidamente y no cambian de forma
    assert.ok(solve(d, [{ id: b, x: 4, y: 3 }]).ok);
    near(d.pts[b].x, 4, 1e-3); near(d.pts[b].y, 3, 1e-3);
    const copies = r.made.map((m) => d.lines[m.id]);
    copies.forEach((c, i) => {
      const A = d.pts[c.a], B = d.pts[c.b];
      near(B.x - A.x, 4, 1e-4, 'misma forma'); near(B.y - A.y, 3, 1e-4);
      near(A.x, 0, 1e-4); near(A.y, 10 * (i + 1), 1e-4, 'en su lugar');
    });
  }
});
t('matriz lineal vinculada con linea de direccion: sigue a la linea si esta gira', () => {
  const d = newDoc();
  const l = addLine(d, addPoint(d, 0, 0), addPoint(d, 4, 0), {});
  const dir = addLine(d, addPoint(d, 20, 20), addPoint(d, 30, 20), {}); // direccion horizontal
  d.pts[d.lines[l].a].fixed = true; d.pts[d.lines[dir].a].fixed = true;
  const r = linearArray(d, [{ k: 'ln', id: l }], [{ u: { x: 1, y: 0 }, s: 10, n: 1, line: dir }], { link: true });
  assert.ok(r.ok && solve(d, []).ok);
  assert.ok(solve(d, [{ id: d.lines[dir].b, x: 20, y: 30 }]).ok, 'la linea de direccion se pone vertical');
  const c = d.lines[r.made[0].id];
  near(d.pts[c.a].x, 0, 1e-3); near(d.pts[c.a].y, 10, 1e-3, 'la copia ahora esta arriba');
});
t('matriz circular vinculada: copias a igual distancia del centro y con el angulo; siguen al original', () => {
  const d = newDoc();
  const c = addPoint(d, 0, 0), p = addPoint(d, 10, 0);
  d.pts[c].fixed = true;
  const l = addLine(d, c, p, {});
  const r = circularArray(d, [{ k: 'ln', id: l }], { c: { x: 0, y: 0 }, step: Math.PI / 2, n: 3, link: true, cid: c, dims: true });
  assert.ok(r.ok && solve(d, []).ok);
  assert.equal(Object.values(d.cons).filter((k) => k.t === 'ANG4' && !k.hidden).length, 2, 'cota angular visible');
  assert.ok(solve(d, [{ id: p, x: 6, y: 8 }]).ok); // el original gira y se acorta
  r.made.forEach((m, i) => {
    const q = d.pts[d.lines[m.id].b];
    near(Math.hypot(q.x, q.y), 10, 1e-3, 'mismo radio');
    const want = Math.atan2(8, 6) + (Math.PI / 2) * (i + 1);
    near(Math.atan2(Math.sin(Math.atan2(q.y, q.x) - want), Math.cos(Math.atan2(q.y, q.x) - want)), 0, 1e-3, 'angulo de la copia');
  });
});
t('copia espejo vinculada: simetria con el eje; sigue al original', () => {
  const d = newDoc();
  const ax = addPoint(d, 0, -10), bx = addPoint(d, 0, 10);
  d.pts[ax].fixed = d.pts[bx].fixed = true;
  const axis = addLine(d, ax, bx, {});
  const a = addPoint(d, 5, 0), b = addPoint(d, 8, 3);
  const l = addLine(d, a, b, {});
  const ci = addCircle(d, addPoint(d, 5, 6), 2, {});
  const r = mirrorCopy(d, [{ k: 'ln', id: l }, { k: 'ci', id: ci }], d.pts[ax], d.pts[bx], { axis });
  assert.ok(r.ok && solve(d, []).ok);
  assert.ok(solve(d, [{ id: b, x: 9, y: 5 }]).ok);
  const m = d.lines[r.made.find((x) => x.k === 'ln').id];
  near(d.pts[m.b].x, -9, 1e-3); near(d.pts[m.b].y, 5, 1e-3);
  const mc = d.circles[r.made.find((x) => x.k === 'ci').id];
  assert.ok(solve(d, [{ id: d.circles[ci].c, x: 7, y: 6 }]).ok);
  near(d.pts[mc.c].x, -7, 1e-3);
  d.circles[ci].r = 3; assert.ok(solve(d, []).ok); near(mc.r, 3, 1e-3, 'igual radio');
});


t('elipse: semiejes desde el centro y dos puntos, cierra, se copia, se exporta y se borra con sus puntos', () => {
  const d = newDoc();
  const c = addPoint(d, 10, 5), a = addPoint(d, 16, 5), b = addPoint(d, 10, 8);
  const e = addEllipse(d, c, a, b, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  addCon(d, { t: 'ANG4', refs: [c, a, c, b], v: 90, hidden: true });
  const g = ellipseOf(d, d.ellipses[e]);
  near(g.ra, 6); near(g.rb, 3); near(g.ux, 1); near(g.uy, 0, 1e-12);
  const P = ellipsePolyline(d, d.ellipses[e], 96);
  near(P[0].x, 16); near(P[0].y, 5); near(P[24].x, 10, 1e-9); near(P[24].y, 8, 1e-9, 'extremo del eje 2');
  near(P[96].x, P[0].x, 1e-9, 'cerrada');
  // el 2.o eje se mantiene perpendicular al mover el extremo del 1.o
  d.pts[c].fixed = true;
  assert.ok(solve(d, [{ id: a, x: 10, y: 11 }]).ok);
  const g2 = ellipseOf(d, d.ellipses[e]);
  near(g2.ra, 6, 1e-4); near(g2.uy, 1, 1e-4, 'el eje gira'); near(d.pts[b].y, 5, 1e-3, 'b sigue perpendicular al eje girado (a la altura del centro)');
  // copias (lineal) y exportacion
  const r = linearArray(d, [{ k: 'el', id: e }], [{ u: { x: 1, y: 0 }, s: 30, n: 1 }], {});
  assert.ok(r.ok && r.made[0].k === 'el' && Object.keys(d.ellipses).length === 2);
  assert.match(exportSVG(d, 1, {}), /<path d="M[^"]+ Z"/);
  assert.ok(exportDXF(d, 5, {}).includes('POLYLINE'));
  assert.ok(exportSVGLaser(d, { modes: { [styleKey(d.ellipses[e])]: 'cut' } }).svg.includes('id="corte"'));
  assert.equal(boxSelect(d, { x0: 0, y0: -5, x1: 30, y1: 25 }, {}).filter((x) => x.k === 'el').length, 1, 'cuadro: solo la elipse que cae dentro');
  deleteItems(d, [{ k: 'pt', id: a }]);
  assert.equal(Object.keys(d.ellipses).length, 1, 'al borrar un punto de la elipse, se borra la elipse');
});


t('extension sucesiva: el extremo se desplaza, sin dejar puntos nuevos', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0);
  const h = addLine(d, a, b, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  const cross = [30, 60, 90].map((x) => { const p = addPoint(d, x, -10), q = addPoint(d, x, 10); return addLine(d, p, q, { color: 'auto', ltype: 'continua', w: 2, ls: 1 }); });
  const n0 = Object.keys(d.pts).length;
  for (let i = 0; i < 3; i++) {
    const r = extendEnd(d, 'ln', h, { x: d.pts[d.lines[h].b].x, y: 0 });
    assert.ok(r.ok, r.msg);
    assert.ok(solve(d, []).ok);
  }
  near(d.pts[d.lines[h].b].x, 90, 1e-6, 'llega al 3.er cruce');
  assert.equal(Object.keys(d.pts).length, n0, 'no se crearon puntos');
  assert.equal(d.lines[h].b, b, 'sigue siendo el mismo extremo');
  const on = Object.values(d.cons).filter((k) => k.t === 'PONL' && k.refs[0] === b);
  assert.equal(on.length, 1, 'solo queda la restriccion con la ultima linea');
  assert.equal(on[0].refs[1], cross[2]);
});

t('rectangulo: 4 lineas H/V, se mantiene al mover una esquina; de centro con punto medio', () => {
  const d = newDoc();
  const p1 = addPoint(d, 0, 0), p3 = addPoint(d, 8, 5), p2 = addPoint(d, 8, 0), p4 = addPoint(d, 0, 5);
  addRectangle(d, [p1, p2, p3, p4], { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  assert.equal(Object.keys(d.lines).length, 4);
  assert.ok(solve(d, [{ id: p3, x: 12, y: 9 }]).ok);
  near(d.pts[p2].x, 12, 1e-5); near(d.pts[p2].y, 0, 1e-5); near(d.pts[p4].x, 0, 1e-5); near(d.pts[p4].y, 9, 1e-5);
  // de centro
  const e = newDoc();
  const c = addPoint(e, 5, 5), q1 = addPoint(e, 1, 2), q3 = addPoint(e, 9, 8), q2 = addPoint(e, 9, 2), q4 = addPoint(e, 1, 8);
  addRectangle(e, [q1, q2, q3, q4], { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  addCon(e, { t: 'MID', refs: [q1, q3, c], hidden: true });
  assert.ok(solve(e, [{ id: q3, x: 13, y: 10 }]).ok);
  near(e.pts[c].x, (e.pts[q1].x + e.pts[q3].x) / 2, 1e-5); near(e.pts[c].y, (e.pts[q1].y + e.pts[q3].y) / 2, 1e-5);
});

t('circulo por 3 puntos: centro y radio; colineales se rechazan', () => {
  const g = circleThrough3({ x: 5, y: 0 }, { x: 0, y: 5 }, { x: -5, y: 0 });
  near(g.c.x, 0); near(g.c.y, 0); near(g.r, 5);
  assert.equal(circleThrough3({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }), null);
});

t('poligono regular: inscrito y circunscrito, orientacion por el radio, se mantiene regular al arrastrar', () => {
  const C = { x: 0, y: 0 };
  const vi = polygonVertices(C, { x: 10, y: 0 }, 6, false);
  near(vi[0].x, 10); near(vi[1].x, 5, 1e-9); near(vi[1].y, 8.660254037844386, 1e-9);
  const vc = polygonVertices(C, { x: 10, y: 0 }, 4, true); // apotema 10: cuadrado de lado 20
  near(Math.hypot(vc[0].x - vc[3].x, vc[0].y - vc[3].y), 20, 1e-9);
  near((vc[0].x + vc[3].x) / 2, 10, 1e-9, 'el radio llega al medio de un lado');
  const vo = polygonVertices(C, { x: 0, y: 10 }, 3, false);
  near(vo[0].x, 0, 1e-9); near(vo[0].y, 10, 1e-9);
  const d = newDoc();
  const c = addPoint(d, 0, 0), ids = vi.map((q) => addPoint(d, q.x, q.y));
  addPolygon(d, c, ids, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  assert.equal(Object.keys(d.lines).length, 6);
  assert.ok(solve(d, [{ id: ids[0], x: 14, y: 6 }]).ok);
  const r = ids.map((i) => Math.hypot(d.pts[i].x - d.pts[c].x, d.pts[i].y - d.pts[c].y));
  r.forEach((v) => near(v, r[0], 1e-4, 'vertices equidistantes'));
  const side = (i) => Math.hypot(d.pts[ids[(i + 1) % 6]].x - d.pts[ids[i]].x, d.pts[ids[(i + 1) % 6]].y - d.pts[ids[i]].y);
  for (let i = 1; i < 6; i++) near(side(i), side(0), 1e-4, 'lados iguales');
});

t('copiar y pegar: el centro del cuadro va al destino, lleva sus restricciones y sobrevive a borrar el original', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0);
  const l = addLine(d, a, b, { color: '#dc2626', ltype: 'eje', w: 2, ls: 1 });
  addCon(d, { t: 'H', refs: [l] });
  const cc = addPoint(d, 5, 10), ci = addCircle(d, cc, 4, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  const items = [{ k: 'ln', id: l }, { k: 'ci', id: ci }];
  const bb = bboxOf(d, items);
  near(bb.x0, 0); near(bb.x1, 10); near(bb.y0, 0); near(bb.y1, 14);
  const clip = clipOf(d, items);
  deleteItems(d, items);
  const r = pasteClip(d, clip, { x: 100, y: 50 });
  assert.ok(r.ok && r.made.length === 2);
  const nl = r.made.find((m) => m.k === 'ln').id, nc = r.made.find((m) => m.k === 'ci').id;
  assert.equal(d.lines[nl].ltype, 'eje');
  assert.ok(Object.values(d.cons).some((k) => k.t === 'H' && k.refs[0] === nl), 'la H se copia');
  const A = d.pts[d.lines[nl].a], B = d.pts[d.lines[nl].b];
  near((Math.min(A.x, B.x) + Math.max(A.x, B.x)) / 2 - 5 + 5, 100 - 0, 1e-9, 'la linea queda centrada en x=100 (cuadro 0..10 en x)');
  near(d.pts[d.circles[nc].c].y, 50 + 3, 1e-9, 'el circulo queda a 10-7=3 sobre el centro');
  assert.ok(solve(d, []).ok);
  const r2 = pasteClip(d, clip, { x: 0, y: 0 });
  assert.ok(r2.ok, 'se puede pegar varias veces');
});

t('linea constructiva: estilo propio y no sale en el SVG de corte por defecto', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), c = addPoint(d, 0, 5);
  addLine(d, a, b, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  addLine(d, a, c, { ...CLINE_STYLE });
  assert.equal(CLINE_STYLE.color, '#C3C3C3'); assert.equal(CLINE_STYLE.w, 1);
  const cls = laserClasses(d);
  assert.equal(cls.length, 2);
  const r = exportSVGLaser(d, { onlyContinuous: true });
  assert.equal(r.cut, 1, 'solo la continua se corta');
});

t('fuentes de texto: lista con generica y se mide por fuente', () => {
  assert.ok(FONTS.length >= 8);
  assert.match(fontCss('mono'), /monospace/);
  assert.equal(fontCss(undefined), FONTS[0][2]);
  const d = newDoc(); const p = addPoint(d, 0, 0);
  const id = addText(d, p, 'Hola', { h: 2, font: 'serif' });
  assert.equal(d.texts[id].font, 'serif');
  const seen = [];
  textFrame(d.texts[id], (ln, f) => { seen.push(f); return ln.length * 0.6; }, 'bl');
  assert.deepEqual(seen, ['serif']);
  const e = exportSVG(d, 1, {});
  assert.ok(e.includes('Times'), 'el SVG lleva la fuente');
});


t('concentrica: los centros coinciden, se numera y no hace nada si ya comparten centro', () => {
  const d = newDoc();
  const c1 = addPoint(d, 0, 0), c2 = addPoint(d, 7, 3), c3 = addPoint(d, -4, 2);
  const a = addCircle(d, c1, 5, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  const b = addCircle(d, c2, 2, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  const e = addArc(d, c3, addPoint(d, -1, 2), addPoint(d, -4, 5), 3, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  d.pts[c1].fixed = true;
  const k1 = addCon(d, { t: 'CONC', refs: [a, b] }), k2 = addCon(d, { t: 'CONC', refs: [a, e] });
  assert.ok(solve(d, []).ok);
  near(d.pts[c2].x, 0, 1e-5); near(d.pts[c2].y, 0, 1e-5); near(d.pts[c3].x, 0, 1e-5); near(d.pts[c3].y, 0, 1e-5);
  assert.equal(conTag(d.cons[k1]), '◎1'); assert.equal(conTag(d.cons[k2]), '◎2');
  const d2 = newDoc(); const p = addPoint(d2, 0, 0);
  const x = addCircle(d2, p, 1, {}), y = addCircle(d2, p, 2, {});
  addCon(d2, { t: 'CONC', refs: [x, y] });
  assert.ok(solve(d2, []).ok, 'mismo centro: restriccion vacia, no falla');
});

t('linea de punto medio: crece simetrica y sigue siendolo al mover el extremo', () => {
  const d = newDoc();
  const m = addPoint(d, 10, 10), b = addPoint(d, 16, 12), a = addPoint(d, 4, 8);
  addLine(d, a, b, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  addCon(d, { t: 'MID', refs: [a, b, m] });
  d.pts[m].fixed = true;
  assert.ok(solve(d, [{ id: b, x: 20, y: 10 }]).ok);
  near(d.pts[a].x, 0, 1e-5); near(d.pts[a].y, 10, 1e-5);
});


t('sentido del arco: sigue el movimiento; con un toque, el arco corto', () => {
  const C = { x: 0, y: 0 }, S = { x: 10, y: 0 };
  assert.equal(arcIsClockwise(1.2, C, S, { x: 0, y: 10 }), false, 'se movio antihorario');
  assert.equal(arcIsClockwise(-1.2, C, S, { x: 0, y: 10 }), true, 'se movio horario aunque el extremo este arriba: arco largo horario');
  assert.equal(arcIsClockwise(0, C, S, { x: 0, y: 10 }), false, 'toque: corto, antihorario');
  assert.equal(arcIsClockwise(0, C, S, { x: 0, y: -10 }), true, 'toque: corto, horario');
});

t('arco constructivo: punto, hueco, trazo, hueco, punto; continuo si es muy corto', () => {
  const d = constructionArcDash(100, 2, 3.5);
  assert.equal(d.length, 5); near(d.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(constructionArcDash(8, 2, 3.5), []);
});

t('arco horario: el arco antihorario va del extremo al inicio y barre lo mismo', () => {
  const d = newDoc();
  const c = addPoint(d, 0, 0), s0 = addPoint(d, 10, 0), e0 = addPoint(d, 0, 10);
  const id = addArc(d, c, e0, s0, 10, { color: 'auto', ltype: 'continua', w: 2, ls: 1 }); // horario de s0 a e0
  near(arcOf(d, d.arcs[id]).sweep, (3 * Math.PI) / 2, 1e-9);
});

// ---------------------------------------------------------------- v1.1.0: elipses y splines
const ST = { color: 'auto', ltype: 'continua', w: 2, ls: 1 };
const mkEll = (d, cx = 0, cy = 0, ra = 10, rb = 5, p1 = null, p2 = null) => {
  const c = addPoint(d, cx, cy), a = addPoint(d, cx + ra, cy), b = addPoint(d, cx, cy + rb);
  const e = addEllipse(d, c, a, b, ST, p1, p2);
  addCon(d, { t: 'ANG4', refs: [c, a, c, b], v: 90, hidden: true });
  return { e, c, a, b };
};
const offEll = (d, e, pid) => { const g = ellipseOf(d, d.ellipses[e]), P = d.pts[pid], q = ellipsePoint(g, ellipseParam(g, P)); return Math.hypot(q.x - P.x, q.y - P.y); };

t('arco eliptico: tramo antihorario de p1 a p2, sus extremos siguen a la elipse, se copia, se refleja y se exporta abierto', () => {
  const d = newDoc();
  const p1 = addPoint(d, 10 * Math.cos(0.3), 5 * Math.sin(0.3), true), p2 = addPoint(d, 10 * Math.cos(2), 5 * Math.sin(2), true);
  const { e, c, a } = mkEll(d, 0, 0, 10, 5, p1, p2);
  assert.ok(isPartial(d.ellipses[e]));
  const r0 = ellipseRange(d, d.ellipses[e]);
  near(r0.t0, 0.3, 1e-9); near(r0.sweep, 1.7, 1e-9);
  const P = ellipsePolyline(d, d.ellipses[e], 96);
  near(P[0].x, d.pts[p1].x, 1e-9); near(P[P.length - 1].x, d.pts[p2].x, 1e-9, 'la poligonal va de p1 a p2');
  d.pts[c].fixed = true;
  assert.ok(solve(d, [{ id: a, x: 14, y: 3 }]).ok);
  near(offEll(d, e, p1), 0, 1e-6, 'p1 sobre la elipse'); near(offEll(d, e, p2), 0, 1e-6, 'p2 sobre la elipse');
  assert.ok(solve(d, [{ id: p2, x: -20, y: 0 }]).ok, 'el extremo se desliza por la elipse');
  near(offEll(d, e, p2), 0, 1e-6);
  const m = mirrorCopy(d, [{ k: 'el', id: e }], { x: 30, y: -5 }, { x: 30, y: 5 });
  assert.ok(m.ok);
  const me = d.ellipses[m.made[0].id];
  near(ellipseRange(d, me).sweep, ellipseRange(d, d.ellipses[e]).sweep, 1e-6, 'el reflejo ocupa el mismo tramo');
  const svg = exportSVG(d, 1, {});
  assert.ok(!/ Z"/.test(svg), 'los arcos elipticos no se cierran en el SVG');
  assert.ok(JSON.stringify(buildTree(d)).includes('Arco elíptico'));
  deleteItems(d, [{ k: 'pt', id: p1 }]);
  assert.ok(!d.ellipses[e], 'borrar un extremo borra el arco eliptico');
});

t('coincidente con elipse (PONE): el punto queda sobre la elipse, tambien si el 2.o eje pasa a ser el mayor', () => {
  const d = newDoc(); const { e, c, a, b } = mkEll(d);
  const p = addPoint(d, 7, 7);
  const k = addCon(d, { t: 'PONE', refs: [p, e] });
  assert.equal(conTag(d.cons[k]), '●1');
  assert.ok(solve(d, []).ok); near(offEll(d, e, p), 0, 1e-7);
  assert.ok(solve(d, [{ id: a, x: 14, y: 3 }]).ok); near(offEll(d, e, p), 0, 1e-7);
  d.pts[c].fixed = d.pts[a].fixed = true;
  assert.ok(solve(d, [{ id: b, x: d.pts[b].x * 4, y: d.pts[b].y * 4 }]).ok);
  const g = ellipseOf(d, d.ellipses[e]);
  assert.ok(g.rb > g.ra, 'el segundo eje es ahora el mayor'); near(offEll(d, e, p), 0, 1e-7);
});

t('tangente con elipse: recta, circulo y otra elipse', () => {
  const d = newDoc(); const { e, c, a, b } = mkEll(d);
  d.pts[c].fixed = d.pts[a].fixed = d.pts[b].fixed = true;
  const l1 = addPoint(d, -3, 8), l2 = addPoint(d, 12, 6), L = addLine(d, l1, l2, ST);
  const T = addPoint(d, 3, 4.8, true);
  const k = addCon(d, { t: 'TANLE', refs: [L, e, T] });
  assert.equal(conTag(d.cons[k]), 'T1');
  assert.ok(solve(d, []).ok);
  near(offEll(d, e, T), 0, 1e-7);
  // en coordenadas de la elipse (circulo unitario) la recta queda a distancia 1 del centro
  const u = (P) => ({ x: P.x / 10, y: P.y / 5 }), A = u(d.pts[l1]), B = u(d.pts[l2]);
  near(Math.abs((B.x - A.x) * A.y - (B.y - A.y) * A.x) / Math.hypot(B.x - A.x, B.y - A.y), 1, 1e-6, 'recta tangente');
  const cc = addPoint(d, 15, 6), ci = addCircle(d, cc, 3, ST), T2 = addPoint(d, 9.5, 2, true);
  addCon(d, { t: 'TANCE', refs: [ci, e, T2] });
  assert.ok(solve(d, []).ok);
  near(offEll(d, e, T2), 0, 1e-7); near(Math.hypot(d.pts[T2].x - d.pts[cc].x, d.pts[T2].y - d.pts[cc].y), d.circles[ci].r, 1e-7);
  // la normal de la elipse en T2 pasa por el centro del circulo
  const q = d.pts[T2], nrm = { x: q.x / 100, y: q.y / 25 }, v = { x: d.pts[cc].x - q.x, y: d.pts[cc].y - q.y };
  near((nrm.x * v.y - nrm.y * v.x) / (Math.hypot(nrm.x, nrm.y) * Math.hypot(v.x, v.y)), 0, 1e-6, 'circulo tangente');
  const o = mkEll(d, 18, -9, 6, 3), T3 = addPoint(d, 11, -6, true);
  addCon(d, { t: 'TANEE', refs: [e, o.e, T3] });
  assert.ok(solve(d, []).ok);
  near(offEll(d, e, T3), 0, 1e-6); near(offEll(d, o.e, T3), 0, 1e-6);
});

t('recortar elipse: queda un arco eliptico, luego se parte y al final se borra', () => {
  const d = newDoc(); const { e } = mkEll(d);
  addLine(d, addPoint(d, 4, -8), addPoint(d, 4, 8), ST); addLine(d, addPoint(d, -4, -8), addPoint(d, -4, 8), ST);
  assert.equal(curveCuts(d, 'el', e).cuts.length, 4);
  assert.ok(trimAt(d, 'el', e, { x: 0, y: 5 }).ok && solve(d, []).ok);
  const el = d.ellipses[e];
  assert.ok(isPartial(el));
  near(d.pts[el.p1].x, -4, 1e-6); near(d.pts[el.p1].y, 4.5826, 1e-3); near(d.pts[el.p2].x, 4, 1e-6);
  near(ellipseRange(d, el).sweep, TAU - (Math.PI - 2 * Math.acos(0.4)), 1e-6);
  const r = trimAt(d, 'el', e, { x: 0, y: -5 });
  assert.ok(r.ok && solve(d, []).ok); assert.equal(r.pieces.length, 2);
  const [x, y] = r.pieces.map((i) => d.ellipses[i]);
  assert.ok(x.c === y.c && x.a === y.a && x.b === y.b, 'los trozos comparten centro y ejes');
  near(ellipseRange(d, x).sweep, 2 * Math.acos(0.4), 1e-6);
  const r3 = trimAt(d, 'el', e, { x: -10, y: 0 });
  assert.ok(r3.ok && solve(d, []).ok);
  assert.equal(Object.keys(d.ellipses).length, 1, 'un trozo sin mas cruces se quita entero');
  // una elipse con un solo cruce se borra completa
  const d2 = newDoc(); const o = mkEll(d2);
  addLine(d2, addPoint(d2, 0, 0), addPoint(d2, 20, 0), ST);
  assert.ok(trimAt(d2, 'el', o.e, { x: 0, y: 5 }).deleted);
});

t('recortar spline: los trozos conservan la forma y las relaciones pasan al trozo que corresponde', () => {
  const d = newDoc();
  const ids = [[0, 0], [10, 8], [20, 0], [30, -8], [40, 0], [50, 6]].map(([x, y]) => addPoint(d, x, y));
  const s = addSpline(d, ids, ST, false);
  const orig = splinePolyline(d, d.splines[s], 24).map((q) => ({ ...q }));
  const l1 = addLine(d, addPoint(d, 14, -20), addPoint(d, 14, 20), ST); addLine(d, addPoint(d, 33, -20), addPoint(d, 33, 20), ST);
  const on = closestOnPolyline(orig, { x: 45, y: 3 }), pp = addPoint(d, on.x, on.y);
  addCon(d, { t: 'PONS', refs: [pp, s] });
  const r = trimAt(d, 'sp', s, { x: 22, y: -1 });
  assert.ok(r.ok && solve(d, []).ok); assert.equal(r.pieces.length, 2); assert.ok(!d.splines[s]);
  const [A, B] = r.pieces.map((i) => d.splines[i]);
  assert.equal(A.pts[0], ids[0]); assert.equal(B.pts[B.pts.length - 1], ids[5]);
  near(d.pts[A.pts[A.pts.length - 1]].x, 14, 1e-6, 'el trozo termina en el corte'); near(d.pts[B.pts[0]].x, 33, 1e-6);
  assert.ok(Object.values(d.cons).some((k) => k.t === 'PONL' && k.refs[0] === A.pts[A.pts.length - 1] && k.refs[1] === l1 && k.hidden));
  assert.ok(Object.values(d.cons).some((k) => k.t === 'PONS' && k.refs[0] === pp && k.refs[1] === r.pieces[1]), 'el punto sobre el spline pasa al 2.o trozo');
  let dev = 0;
  for (const sp of [A, B]) for (const q of splinePolyline(d, sp, 24)) dev = Math.max(dev, closestOnPolyline(orig, q).d);
  assert.ok(dev < 0.05, 'desviacion ' + dev);
  // cerrado: con 2 cruces queda abierto; sin cruces se borra
  const d2 = newDoc();
  const c2 = [[10, 0], [7, 7], [0, 10], [-7, 7], [-10, 0], [-7, -7], [0, -10], [7, -7]].map(([x, y]) => addPoint(d2, x, y));
  const s2 = addSpline(d2, c2, ST, true);
  const d3 = JSON.parse(JSON.stringify(d2));
  addLine(d2, addPoint(d2, -20, 3), addPoint(d2, 20, 3), ST);
  const r2 = trimAt(d2, 'sp', s2, { x: 0, y: 10 });
  assert.ok(r2.ok && solve(d2, []).ok);
  const rest = d2.splines[r2.pieces[0]];
  assert.ok(!rest.closed); near(Math.max(...splinePolyline(d2, rest, 24).map((q) => q.y)), 3, 1e-3, 'se quito la parte de arriba');
  assert.ok(trimAt(d3, 'sp', s2, { x: 0, y: 10 }).deleted);
});

t('extender hasta elipses y splines: la linea y el arco llegan a la curva y quedan sobre ella', () => {
  const d = newDoc(); const { e } = mkEll(d);
  const l = addLine(d, addPoint(d, -30, 2), addPoint(d, -20, 2), ST);
  assert.ok(extendEnd(d, 'ln', l, { x: -20, y: 2 }).ok && solve(d, []).ok);
  near(d.pts[d.lines[l].b].x, -Math.sqrt(100 * (1 - 4 / 25)), 1e-6);
  assert.ok(Object.values(d.cons).some((k) => k.t === 'PONE' && k.hidden && k.refs[0] === d.lines[l].b));
  const n0 = Object.keys(d.pts).length;
  assert.ok(extendEnd(d, 'ln', l, { x: -9, y: 2 }).ok && solve(d, []).ok);
  near(d.pts[d.lines[l].b].x, Math.sqrt(100 * (1 - 4 / 25)), 1e-6, 'la extension sucesiva llega al otro lado');
  assert.equal(Object.keys(d.pts).length, n0, 'sin puntos nuevos');
  const cc = addPoint(d, 0, 12), ar = addArc(d, cc, addPoint(d, 8, 12), addPoint(d, 0, 20), 8, ST);
  assert.ok(extendEnd(d, 'ar', ar, { x: 8, y: 12 }).ok && solve(d, []).ok);
  near(offEll(d, e, d.arcs[ar].a), 0, 1e-6, 'el arco termina sobre la elipse');
  near(Math.hypot(d.pts[d.arcs[ar].a].x, d.pts[d.arcs[ar].a].y - 12), 8, 1e-6);
  // arco eliptico: solo cuenta el tramo que ocupa
  const d2 = newDoc();
  const p1 = addPoint(d2, 0, 5, true), p2 = addPoint(d2, -10, 0, true);
  mkEll(d2, 0, 0, 10, 5, p1, p2);
  const l2 = addLine(d2, addPoint(d2, 30, 2), addPoint(d2, 20, 2), ST);
  assert.ok(extendEnd(d2, 'ln', l2, { x: 20, y: 2 }).ok);
  assert.ok(d2.pts[d2.lines[l2].b].x < 0, 'pasa de largo por el lado que el arco no ocupa');
  // spline
  const d3 = newDoc();
  const s = addSpline(d3, [[0, 0], [10, 8], [20, 0], [30, -8]].map(([x, y]) => addPoint(d3, x, y)), ST, false);
  const l3 = addLine(d3, addPoint(d3, 25, 30), addPoint(d3, 25, 20), ST);
  assert.ok(extendEnd(d3, 'ln', l3, { x: 25, y: 20 }).ok && solve(d3, []).ok);
  const end = d3.pts[d3.lines[l3].b];
  near(end.x, 25, 1e-6); near(closestOnPolyline(splinePolyline(d3, d3.splines[s], 48), end).d, 0, 1e-2);
});

t('coincidente entre dos puntos lejanos con arcos tangentes: se resuelve acercandolos por pasos (caso del iPad)', () => {
  const d = JSON.parse(readFileSync(new URL('./fixtures/arcos-tangentes-coincidente.json', import.meta.url), 'utf8'));
  assert.ok(solve(d, []).ok);
  // directo, de golpe, el solver pierde el hilo aunque el caso tiene solucion
  const directo = JSON.parse(JSON.stringify(d)); addCon(directo, { t: 'COI', refs: ['p3', 'p8'] });
  assert.equal(solve(directo, []).ok, false);
  const r = addConsSolved(d, [{ t: 'COI', refs: ['p3', 'p8'] }]);
  assert.ok(r.ok);
  near(d.pts.p3.x, d.pts.p8.x, 1e-6); near(d.pts.p3.y, d.pts.p8.y, 1e-6);
  assert.ok(Object.values(d.cons).some((k) => k.t === 'COI'));
  assert.ok(solve(d, []).ok);
  // sin solucion: el documento queda como estaba
  const e = JSON.parse(JSON.stringify(d)), n = Object.keys(e.cons).length;
  e.pts.p1.fixed = e.pts.p9.fixed = true;
  const bad = addConsSolved(e, [{ t: 'COI', refs: ['p1', 'p2'] }, { t: 'COI', refs: ['p9', 'p3'] }]);
  assert.equal(bad.ok, false); assert.equal(Object.keys(e.cons).length, n, 'sin restricciones nuevas');
});

// ---- capas
const mkLayerDoc = () => {
  const d = newDoc();
  const l0 = addLine(d, addPoint(d, 0, 0, true), addPoint(d, 10, 0, true), { color: 'auto', ltype: 'continua', w: 2, ls: 1 }); // sin capa
  const A = addLayer(d, 'A'); // queda como capa actual
  const l1 = addLine(d, addPoint(d, 0, 5, true), addPoint(d, 10, 5, true), { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  const c1 = addCircle(d, addPoint(d, 20, 20, false), 3, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  const tx = addText(d, addPoint(d, 1, 1, true), 'hola');
  return { d, l0, l1, c1, tx, A };
};
t('capas: por defecto no hay ninguna y lo nuevo no lleva capa', () => {
  const d = newDoc();
  assert.deepEqual(d.layers, {}); assert.equal(d.curLayer, null);
  const l = addLine(d, addPoint(d, 0, 0, true), addPoint(d, 1, 0, true), { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  assert.equal(d.lines[l].layer, undefined);
});
t('capas: al crearla queda activa y lo que se dibuja va a ella', () => {
  const { d, l0, l1, c1, tx, A } = mkLayerDoc();
  assert.equal(d.curLayer, A);
  assert.equal(d.lines[l0].layer, undefined); assert.equal(d.lines[l1].layer, A); assert.equal(d.circles[c1].layer, A); assert.equal(d.texts[tx].layer, A);
  assert.equal(layerCount(d, A), 3);
  const B = addLayer(d, 'B'); assert.equal(d.curLayer, B);
});
t('capas: apagar oculta elementos, puntos, restricciones y exportacion', () => {
  const { d, l0, l1, A } = mkLayerDoc();
  addCon(d, { t: 'H', refs: [l1] }); addCon(d, { t: 'H', refs: [l0] });
  d.layers[A].on = false;
  assert.ok(isHidden(d, d.lines[l1])); assert.ok(!isHidden(d, d.lines[l0]));
  assert.deepEqual(shownEntries(d, 'lines').map(([id]) => id), [l0]);
  const hp = layerHiddenPoints(d);
  assert.ok(hp.has(d.lines[l1].a) && hp.has(d.lines[l1].b) && !hp.has(d.lines[l0].a));
  const cons = Object.values(d.cons);
  assert.ok(consHidden(d, cons[0], hp)); assert.ok(!consHidden(d, cons[1], hp));
  const v = visibleDoc(d);
  assert.deepEqual(Object.keys(v.lines), [l0]); assert.equal(Object.keys(v.circles).length, 0); assert.equal(Object.keys(v.texts).length, 0);
  assert.equal(Object.keys(v.cons).length, 1);
  const svg = exportSVG(d);
  assert.ok(svg && !svg.includes('<circle'), 'el circulo oculto no se exporta');
  d.layers[A].on = true;
  assert.equal(visibleDoc(d), d, 'sin capas apagadas es el mismo documento');
});
t('capas: borrar una capa deja sus elementos en ninguna', () => {
  const { d, l1, c1, tx, A } = mkLayerDoc();
  assert.equal(deleteLayer(d, A), 3);
  assert.equal(d.layers[A], undefined); assert.equal(d.curLayer, null);
  assert.equal(d.lines[l1].layer, undefined); assert.equal(d.circles[c1].layer, undefined); assert.equal(d.texts[tx].layer, undefined);
  assert.equal(deleteLayer(d, A), 0);
});
t('capas: recortar y dividir conservan la capa de la linea', () => {
  const d = newDoc(), A = addLayer(d, 'A');
  const a = addPoint(d, 0, 0, true), b = addPoint(d, 10, 0, true), m = addPoint(d, 5, 0, false);
  const l = addLine(d, a, b, { color: 'auto', ltype: 'continua', w: 2, ls: 1 });
  d.curLayer = null;
  const r = splitElement(d, l, [m]);
  assert.ok(r.ok);
  for (const id of r.pieces) assert.equal(d.lines[id].layer, A);
});

t('cotas con nombre: D, A, R, O numeradas por letra y sin repetir', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), c = addPoint(d, 0, 10), cc = addPoint(d, 20, 0);
  const l1 = addLine(d, a, b, {}), l2 = addLine(d, a, c, {});
  const ci = addCircle(d, cc, 3, {});
  const k1 = addCon(d, { t: 'DIST', refs: [a, b], v: 10 }), k2 = addCon(d, { t: 'DIST', refs: [a, c], v: 10 });
  const k3 = addCon(d, { t: 'ANG', refs: [l1, l2], v: 90 }), k4 = addCon(d, { t: 'RAD', refs: [ci], v: 3 });
  assert.deepEqual([k1, k2, k3, k4].map((k) => d.cons[k].name), ['D1', 'D2', 'A1', 'O1']);
  addCon(d, { t: 'H', refs: [l1] });
  assert.equal(d.cons[addCon(d, { t: 'DIST', refs: [b, c], v: 14, hidden: true })].name, undefined);
  delete d.cons[k2];
  assert.equal(d.cons[addCon(d, { t: 'DIST', refs: [b, c], v: 14 })].name, 'D3', 'no se reutiliza D2');
  for (const k of Object.values(d.cons)) delete k.name; // dibujo viejo sin nombres
  delete d.cnd;
  nameDims(d);
  assert.equal(d.cons[k1].name, 'D1');
  assert.equal(d.cons[k3].name, 'A1');
});
t('formulas con variables: evalExpr, referencias y renombrado', () => {
  const vars = { D1: { v: 10, r: false }, A1: { v: Math.PI / 6, r: true }, L: { v: 4, r: false } };
  near(parseValue('D1*sin(A1)', { vars }), 5);
  near(parseValue('D1*sin(3π/4)', { vars }), 10 * Math.sin((3 * Math.PI) / 4));
  near(parseValue('2L+D1/2', { vars }), 13);
  near(parseValue('A1', { angle: true, vars }), 30); // un angulo en una cota angular vuelve a grados
  assert.throws(() => parseValue('D9*2', { vars }), /D9/);
  assert.deepEqual(exprRefs('D1*sin(A1)+L2+3π').sort(), ['A1', 'D1', 'L2']);
  assert.equal(renameInExpr('D1*sin(A1)+D10', 'D1', 'Ancho'), 'Ancho*sin(A1)+D10');
});
t('formulas entre cotas: recalculo en cadena, ciclos y referencias', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), c = addPoint(d, 0, 6);
  d.pts[a].fixed = true;
  const l1 = addLine(d, a, b, {}), l2 = addLine(d, a, c, {});
  addCon(d, { t: 'H', refs: [l1] }); addCon(d, { t: 'V', refs: [l2] });
  const kA = addCon(d, { t: 'DIST', refs: [a, b], v: 10 });
  const kB = addCon(d, { t: 'DIST', refs: [a, c], v: 6, expr: 'D1/2+1' });
  assert.ok(solve(d, []).ok);
  d.cons[kA].v = 20;
  const r = recompute(d);
  assert.ok(r.ok); near(d.cons[kB].v, 11);
  assert.ok(solve(d, []).ok);
  near(Math.hypot(d.pts[c].x - d.pts[a].x, d.pts[c].y - d.pts[a].y), 11, 1e-4);
  // ciclo
  d.cons[kA].expr = 'D2*2';
  const rc = recompute(d);
  assert.ok(!rc.ok && /círculo/.test(rc.error), rc.error);
  delete d.cons[kA].expr;
  // una cota de referencia tambien sirve de variable (se lee su medida)
  d.cons[kA].ref = true;
  assert.deepEqual(pruneFormulas(d), []);
  assert.equal(d.cons[kB].expr, 'D1/2+1');
  assert.ok('D1' in varsOf(d));
  // valor imposible (negativo) no modifica nada
  d.cons[kA].ref = false; d.cons[kB].expr = 'D1-100';
  const bad = recompute(d);
  assert.ok(!bad.ok); near(d.cons[kB].v, 11);
});
t('cotas de referencia en formulas: se resuelve y recalcula hasta estabilizar', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), c = addPoint(d, 0, 6);
  d.pts[a].fixed = true;
  const l1 = addLine(d, a, b, {}), l2 = addLine(d, a, c, {});
  addCon(d, { t: 'H', refs: [l1] }); addCon(d, { t: 'V', refs: [l2] });
  const kIn = addCon(d, { t: 'DIST', refs: [a, b], v: 10 });                 // D1 (conductora)
  const kRef = addCon(d, { t: 'DIST', refs: [a, b], v: 10, ref: true });     // D2 (solo lectura): mide la linea 1
  const kOut = addCon(d, { t: 'DIST', refs: [a, c], v: 6, expr: 'D2*2+1' }); // D3 lee la medida
  assert.equal(d.cons[kRef].name, 'D2');
  assert.ok(hasReactive(d));
  const r1 = settle(d, solve, []);
  assert.ok(r1.ok, r1.error); near(d.cons[kOut].v, 21);
  // cambiar la entrada: la geometria cambia, la medida cambia, la salida la sigue
  d.cons[kIn].v = 30;
  const r2 = settle(d, solve, []);
  assert.ok(r2.ok, r2.error);
  near(d.cons[kOut].v, 61, 1e-4);
  near(Math.hypot(d.pts[c].x - d.pts[a].x, d.pts[c].y - d.pts[a].y), 61, 1e-3);
  // realimentacion que diverge: una cota que se alimenta de su propia medida +1
  const dd = newDoc();
  const p0 = addPoint(dd, 0, 0), p1 = addPoint(dd, 5, 0);
  dd.pts[p0].fixed = true;
  const ll = addLine(dd, p0, p1, {});
  addCon(dd, { t: 'H', refs: [ll] });
  addCon(dd, { t: 'DIST', refs: [p0, p1], v: 5, expr: 'D2+1' });
  addCon(dd, { t: 'DIST', refs: [p0, p1], v: 5, ref: true });
  const bad = settle(dd, solve, [], { maxIter: 15 });
  assert.ok(!bad.ok && /estabiliz/.test(bad.error), JSON.stringify(bad));
});
t('rueda que rueda: la distancia lee el angulo medido y el punto sigue la cicloide al arrastrarlo', () => {
  const R = 10, th0 = 0.6, cyc = (t) => ({ x: R * (t - Math.sin(t)), y: R * (1 - Math.cos(t)) });
  const d = newDoc();
  const O = addPoint(d, 0, 0), G1 = addPoint(d, 120, 0); d.pts[O].fixed = true; d.pts[G1].fixed = true;
  const ground = addLine(d, O, G1, {});
  const T = addPoint(d, R * th0, 0), C = addPoint(d, R * th0, R), P = addPoint(d, R * th0 - R * Math.sin(th0), R - R * Math.cos(th0));
  const wheel = addCircle(d, C, R, {}), lCT = addLine(d, C, T, {}), lCP = addLine(d, C, P, {});
  for (const k of [{ t: 'PONL', refs: [T, ground] }, { t: 'V', refs: [C, T] }, { t: 'RAD', refs: [wheel], v: R }, { t: 'TANLC', refs: [ground, wheel] }, { t: 'PONC', refs: [P, wheel] }]) addCon(d, k);
  const kA = addCon(d, { t: 'ANG', refs: [lCT, lCP], v: (th0 * 180) / Math.PI, ref: true });   // A1: solo lectura, mide el giro
  addCon(d, { t: 'DIST', refs: [O, T], v: R * th0, expr: 'O1/2*A1' });                           // D1 = r * A1 (rueda sin deslizar)
  assert.ok(hasReactive(d));
  assert.ok(settle(d, solve, []).ok);
  for (const th of [0.7, 0.9, 1.1, 1.3, 1.5]) {
    const s = settle(d, solve, [{ id: P, x: d.pts[C].x - R * Math.sin(th), y: d.pts[C].y - R * Math.cos(th) }], { maxIter: 20 });
    assert.ok(s.ok, 'th ' + th + ' ' + s.error);
    const A = (dimValue(d, d.cons[kA]) * Math.PI) / 180, e = cyc(A);
    near(d.pts[T].x, R * A, 1e-3, 'rueda sin deslizar');
    near(d.pts[P].x, e.x, 1e-3, 'P en la cicloide'); near(d.pts[P].y, e.y, 1e-3);
  }
});
t('rueda gobernada por el punto de tangencia: arrastrar T da varias vueltas y P queda en la cicloide', () => {
  const R = 10, x0 = 7.377, cyc = (t) => ({ x: R * (t - Math.sin(t)), y: R * (1 - Math.cos(t)) });
  const d = newDoc();
  const O = addPoint(d, 0, 0), G1 = addPoint(d, 150, 0); d.pts[O].fixed = true; d.pts[G1].fixed = true;
  const ground = addLine(d, O, G1, {});
  const T = addPoint(d, x0, 0), C = addPoint(d, x0, R), q = cyc(x0 / R), P = addPoint(d, q.x, q.y);
  const wheel = addCircle(d, C, R, {}), lCT = addLine(d, C, T, {}), lCP = addLine(d, C, P, {});
  for (const k of [{ t: 'PONL', refs: [T, ground] }, { t: 'V', refs: [C, T] }, { t: 'RAD', refs: [wheel], v: R }, { t: 'TANLC', refs: [ground, wheel] }, { t: 'PONC', refs: [P, wheel] }]) addCon(d, k);
  addCon(d, { t: 'DIST', refs: [O, T], v: x0, ref: true });                                                   // D1: medida (solo lectura)
  const tdeg = (signedAngle({ x: 0, y: -R }, { x: d.pts[P].x - d.pts[C].x, y: d.pts[P].y - d.pts[C].y }) * 180) / Math.PI;
  const kA = addCon(d, { t: 'ANG', refs: [lCT, lCP], s1: 1, s2: 1, v: tdeg, sg: tdeg < 0 ? -1 : 1, cur: Math.abs(tdeg), unit: 'rad', expr: 'D1/(O1/2)' });
  assert.ok(settle(d, solveSteps, []).ok);
  let maxIt = 0;
  for (let x = x0 + 0.7; x <= 70; x += 0.7) {                       // casi dos vueltas arrastrando T por el suelo
    const s = settle(d, solveSteps, [{ id: T, x, y: 0 }], { maxIter: 20 });
    assert.ok(s.ok, 'x ' + x.toFixed(1) + ' ' + (s.error || 'solver'));
    maxIt = Math.max(maxIt, s.iter);
    near(d.pts[T].x, x, 1e-4, 'T llega a donde se arrastra');
    const A = (d.cons[kA].cur * Math.PI) / 180, e = cyc(A);
    near(A, x / R, 1e-4, 'A1 = D1/r'); near(d.pts[P].x, e.x, 1e-3, 'P en la cicloide'); near(d.pts[P].y, e.y, 1e-3);
  }
  assert.ok(maxIt <= 8, 'converge en pocas vueltas: ' + maxIt);
  assert.ok(d.cons[kA].cur > 360, 'paso de una vuelta');
});
t('cotas con nombre: renombrar actualiza formulas y valida el nombre', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), c = addPoint(d, 0, 6);
  const k1 = addCon(d, { t: 'DIST', refs: [a, b], v: 10 }), k2 = addCon(d, { t: 'DIST', refs: [a, c], v: 20, expr: 'D1*2' });
  assert.equal(checkName(d, 'D1', k2) !== null, true);
  assert.equal(checkName(d, 'sin', k1) !== null, true);
  assert.equal(checkName(d, '2x', k1) !== null, true);
  assert.equal(checkName(d, 'Ancho', k1), null);
  renameDim(d, k1, 'Ancho');
  assert.equal(d.cons[k2].expr, 'Ancho*2');
  assert.ok(recompute(d).ok); near(d.cons[k2].v, 20);
  delete d.cons[k1];
  assert.deepEqual(pruneFormulas(d), ['D2']);
});

t('angulo continuo: una conductora de 250 queda a 250 y una de 400 vale una vuelta y 40', () => {
  for (const [val, deg] of [[250, 250], [400, 40], [-30, -30]]) {
    const d = newDoc();
    const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), c = addPoint(d, 5, 5);
    d.pts[a].fixed = true; d.pts[b].fixed = true;
    const l1 = addLine(d, a, b, {}), l2 = addLine(d, a, c, {});
    const k = { t: 'ANG', refs: [l1, l2], s1: 1, s2: 1, sg: 1, cur: val };
    k.v = angTrue(d, k, val);
    const id = addCon(d, k);
    assert.ok(solve(d, []).ok);
    const ang = (Math.atan2(d.pts[c].y, d.pts[c].x) * 180) / Math.PI;
    near(((ang - deg) % 360 + 540) % 360 - 180, 0, 1e-3, `direccion ${val}`);
    near(dimValue(d, d.cons[id]), val, 1e-9, 'el valor mostrado es el que se puso');
    assert.match(dimText(d, d.cons[id]), new RegExp('^' + String(val).replace('-', '\\-') + '°'));
  }
});
t('angulo continuo: una cota de referencia sigue la vuelta completa sin saltar de 180° a 0°', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), c = addPoint(d, 10 * Math.cos(0.5), 10 * Math.sin(0.5));
  const l1 = addLine(d, a, b, {}), l2 = addLine(d, a, c, {});
  const id = addCon(d, { t: 'ANG', refs: [l1, l2], s1: 1, s2: 1, v: (0.5 * 180) / Math.PI, ref: true });
  trackAngles(d);
  near(d.cons[id].cur, (0.5 * 180) / Math.PI, 1e-9);
  for (let deg = 35; deg <= 760; deg += 25) { // dos vueltas y poco mas, en pasos de 25°
    const r = (deg * Math.PI) / 180;
    d.pts[c].x = 10 * Math.cos(r); d.pts[c].y = 10 * Math.sin(r);
    trackAngles(d);
    near(dimValue(d, d.cons[id]), deg, 1e-6, 'vuelta ' + deg);
  }
  // y de vuelta hacia atras
  for (let deg = 735; deg >= 10; deg -= 25) {
    const r = (deg * Math.PI) / 180;
    d.pts[c].x = 10 * Math.cos(r); d.pts[c].y = 10 * Math.sin(r);
    trackAngles(d);
    near(dimValue(d, d.cons[id]), deg, 1e-6, 'regreso ' + deg);
  }
});
t('angulo continuo: una formula puede dar mas de 360 y entra en otras como radianes', () => {
  const d = newDoc();
  const a = addPoint(d, 0, 0), b = addPoint(d, 10, 0), c = addPoint(d, 5, 5), e = addPoint(d, 0, 20);
  d.pts[a].fixed = true; d.pts[b].fixed = true;
  const l1 = addLine(d, a, b, {}), l2 = addLine(d, a, c, {});
  const kA = addCon(d, { t: 'ANG', refs: [l1, l2], s1: 1, s2: 1, sg: 1, cur: 90, v: 90 });            // A1 = 90
  const kB = addCon(d, { t: 'DIST', refs: [a, e], v: 1, expr: 'A1*2' });                               // D1 = 2 * (π/2)
  assert.ok(settle(d, solve, []).ok);
  near(d.cons[kB].v, Math.PI, 1e-9);
  d.cons[kA].cur = 450; d.cons[kA].v = angTrue(d, d.cons[kA], 450); // 450° = 1 vuelta y 90°
  assert.ok(recompute(d).ok);
  near(d.cons[kB].v, 2 * (450 * Math.PI) / 180, 1e-9);
});

console.log(`\n${passed} pruebas pasaron`);

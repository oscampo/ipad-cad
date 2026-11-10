// Dividir un segmento, arco o circulo por puntos que estan sobre el. Sin DOM (se prueba en Node).
// Muta doc; quien llama hace undo/solve y revierte si el solver falla.
import { addLine, addArc, addCon, addPoint, cleanup } from './model.js';
import { closestOnSeg, dist, arcSweepOf, angleFrom, norm, TAU } from './geom.js';

const styleOf = (o) => ({ color: o.color, ltype: o.ltype, w: o.w, ls: o.ls });
const replaceRef = (refs, from, to) => refs.map((r) => (r === from ? to : r));

function retargetHatches(doc, elId, pieces) {
  for (const h of Object.values(doc.hatches)) {
    if (h.ids.includes(elId)) h.ids = h.ids.flatMap((i) => (i === elId ? pieces : [i]));
  }
}

function lastIndexLE(arr, v) {
  let idx = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] <= v + 1e-12) idx = i;
  return idx;
}

// Traslada las restricciones del elemento original a los trozos.
//  rules: { replicate:[tipos], first:[tipos], pointOn:tipo, pointPiece:(pid)=>indice }
function transfer(doc, elId, pieces, splitSet, rules) {
  const dropped = [];
  const related = Object.entries(doc.cons).filter(([, k]) => k.refs.includes(elId));
  for (const [kid, k] of related) {
    delete doc.cons[kid];
    if (rules.single.includes(k.t)) {
      for (const pc of pieces) addCon(doc, { ...k, refs: [pc] });
    } else if (rules.replicate.includes(k.t)) {
      for (const pc of pieces) addCon(doc, { ...k, refs: replaceRef(k.refs, elId, pc) });
    } else if (rules.first.includes(k.t)) {
      addCon(doc, { ...k, refs: replaceRef(k.refs, elId, pieces[0]) });
    } else if (k.t === rules.pointOn) {
      const p = k.refs[0];
      if (splitSet.has(p)) continue; // ahora es un vertice
      addCon(doc, { ...k, refs: [p, pieces[rules.pointPiece(p)]] });
    } else dropped.push(k.t);
  }
  return dropped;
}

export function splitElement(doc, elId, ptIds) {
  if (elId in doc.lines) return splitLine(doc, elId, ptIds);
  if (elId in doc.arcs) return splitArc(doc, elId, ptIds);
  if (elId in doc.circles) return splitCircle(doc, elId, ptIds);
  return { ok: false, msg: 'Selecciona un segmento, un arco o un círculo' };
}

function splitLine(doc, id, ptIds) {
  const l = doc.lines[id];
  const A = doc.pts[l.a], B = doc.pts[l.b];
  const tol = 1e-3 * Math.max(1, dist(A, B));
  const items = [];
  for (const pid of new Set(ptIds)) {
    if (pid === l.a || pid === l.b) continue;
    const P = doc.pts[pid];
    const c = closestOnSeg(P, A, B);
    if (dist(P, c) > tol) return { ok: false, msg: 'Hay puntos que no están sobre el segmento' };
    if (c.t <= 1e-9 || c.t >= 1 - 1e-9) continue;
    items.push({ pid, t: c.t });
  }
  items.sort((x, y) => x.t - y.t);
  if (!items.length) return { ok: false, msg: 'Ningún punto cae en el interior del segmento' };
  const chain = [l.a, ...items.map((i) => i.pid), l.b];
  const ts = [0, ...items.map((i) => i.t), 1];
  const style = styleOf(l);
  const pieces = [];
  for (let i = 0; i < chain.length - 1; i++) pieces.push(addLine(doc, chain[i], chain[i + 1], style));
  const dropped = transfer(doc, id, pieces, new Set(items.map((i) => i.pid)), {
    single: ['H', 'V'],
    replicate: ['PAR', 'PERP', 'ANG', 'TANLC'],
    first: ['COL', 'DISTPL'],
    pointOn: 'PONL',
    pointPiece: (p) => Math.min(pieces.length - 1, lastIndexLE(ts, closestOnSeg(doc.pts[p], A, B).t)),
  });
  for (let i = 0; i < pieces.length - 1; i++) addCon(doc, { t: 'COL', refs: [pieces[i], pieces[i + 1]], hidden: true });
  retargetHatches(doc, id, pieces);
  delete doc.lines[id];
  cleanup(doc);
  return { ok: true, pieces, dropped };
}

function curveRules(pieceFn) {
  return { single: [], replicate: ['RAD', 'EQR', 'TANLC', 'TANCC'], first: [], pointOn: 'PONC', pointPiece: pieceFn };
}

function chainEqualRadius(doc, pieces) {
  for (let i = 0; i < pieces.length - 1; i++) addCon(doc, { t: 'EQR', refs: [pieces[i], pieces[i + 1]], hidden: true });
}

function splitArc(doc, id, ptIds) {
  const arc = doc.arcs[id];
  const C = doc.pts[arc.c];
  const { a0, sweep } = arcSweepOf(C, doc.pts[arc.a], doc.pts[arc.b]);
  const tol = 1e-3 * Math.max(1, arc.r);
  const items = [];
  for (const pid of new Set(ptIds)) {
    if (pid === arc.a || pid === arc.b) continue;
    const P = doc.pts[pid];
    if (Math.abs(dist(C, P) - arc.r) > tol) return { ok: false, msg: 'Hay puntos que no están sobre el arco' };
    const ang = angleFrom(C, a0, P);
    if (sweep < TAU - 1e-9 && ang > sweep + 1e-6) return { ok: false, msg: 'Hay puntos fuera del tramo del arco' };
    if (ang <= 1e-9 || (sweep < TAU - 1e-9 && ang >= sweep - 1e-9)) continue;
    items.push({ pid, ang });
  }
  items.sort((x, y) => x.ang - y.ang);
  if (!items.length) return { ok: false, msg: 'Ningún punto cae en el interior del arco' };
  const chain = [arc.a, ...items.map((i) => i.pid), arc.b];
  const angs = [0, ...items.map((i) => i.ang), sweep];
  const style = styleOf(arc);
  const pieces = [];
  for (let i = 0; i < chain.length - 1; i++) pieces.push(addArc(doc, arc.c, chain[i], chain[i + 1], arc.r, style));
  const dropped = transfer(doc, id, pieces, new Set(items.map((i) => i.pid)),
    curveRules((p) => Math.min(pieces.length - 1, lastIndexLE(angs, angleFrom(C, a0, doc.pts[p])))));
  chainEqualRadius(doc, pieces);
  retargetHatches(doc, id, pieces);
  delete doc.arcs[id];
  cleanup(doc);
  return { ok: true, pieces, dropped };
}

function splitCircle(doc, id, ptIds) {
  const ci = doc.circles[id];
  const C = doc.pts[ci.c];
  const tol = 1e-3 * Math.max(1, ci.r);
  const items = [];
  for (const pid of new Set(ptIds)) {
    if (pid === ci.c) return { ok: false, msg: 'El centro no está sobre la circunferencia' };
    const P = doc.pts[pid];
    if (Math.abs(dist(C, P) - ci.r) > tol) return { ok: false, msg: 'Hay puntos que no están sobre el círculo' };
    items.push({ pid, ang: norm(Math.atan2(P.y - C.y, P.x - C.x)) });
  }
  items.sort((x, y) => x.ang - y.ang);
  const uniq = items.filter((it, i) => i === 0 || it.ang - items[i - 1].ang > 1e-9);
  if (!uniq.length) return { ok: false, msg: 'Selecciona al menos un punto sobre el círculo' };
  const style = styleOf(ci);
  const pieces = [];
  if (uniq.length === 1) {
    // arco de 360 grados: el extremo final coincide con el inicial pero es un punto propio
    const p0 = doc.pts[uniq[0].pid];
    const endId = addPoint(doc, p0.x, p0.y, false);
    pieces.push(addArc(doc, ci.c, uniq[0].pid, endId, ci.r, style));
  } else {
    for (let i = 0; i < uniq.length; i++) pieces.push(addArc(doc, ci.c, uniq[i].pid, uniq[(i + 1) % uniq.length].pid, ci.r, style));
  }
  const rel = uniq.map((u) => norm(u.ang - uniq[0].ang));
  const dropped = transfer(doc, id, pieces, new Set(uniq.map((u) => u.pid)),
    curveRules((p) => {
      if (pieces.length === 1) return 0;
      const a = norm(Math.atan2(doc.pts[p].y - C.y, doc.pts[p].x - C.x) - uniq[0].ang);
      return Math.min(pieces.length - 1, lastIndexLE(rel, a));
    }));
  chainEqualRadius(doc, pieces);
  retargetHatches(doc, id, pieces);
  delete doc.circles[id];
  cleanup(doc);
  return { ok: true, pieces, dropped };
}

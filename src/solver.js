// Puente entre el documento y el solver de restricciones (planegcs, de FreeCAD, en WASM).
import { init_planegcs_module, GcsWrapper } from '@salusoft89/planegcs';
import { conRefs } from './model.js';
import { arcSweepOf, splineSamples, closestOnPolyline } from './geom.js';

let g = null;

export async function initSolver(wasmUrl) {
  const mod = await init_planegcs_module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  g = new GcsWrapper(new mod.GcsSystem());
}

// 'l' linea, 'c' circulo, 'a' arco, 'p' punto
const kindOf = (doc, id) => (id in doc.lines ? 'l' : id in doc.circles ? 'c' : id in doc.arcs ? 'a' : 'p');

// Traduce una restriccion del documento a primitivas del solver.
function conPrims(doc, id, k) {
  if (k.ref) return []; // cota de referencia: solo mide, no restringe
  const r = k.refs;
  const base = { id };
  const kd = r.map((x) => kindOf(doc, x));
  switch (k.t) {
    case 'H': return r.length === 1 ? [{ ...base, type: 'horizontal_l', l_id: r[0] }] : [{ ...base, type: 'horizontal_pp', p1_id: r[0], p2_id: r[1] }];
    case 'V': return r.length === 1 ? [{ ...base, type: 'vertical_l', l_id: r[0] }] : [{ ...base, type: 'vertical_pp', p1_id: r[0], p2_id: r[1] }];
    case 'PAR': return [{ ...base, type: 'parallel', l1_id: r[0], l2_id: r[1] }];
    case 'PERP': return [{ ...base, type: 'perpendicular_ll', l1_id: r[0], l2_id: r[1] }];
    case 'EQL': return [{ ...base, type: 'equal_length', l1_id: r[0], l2_id: r[1] }];
    case 'EQR': {
      // circulo/arco: se ordena para que el circulo vaya primero
      const [x, y] = kd[0] === 'a' && kd[1] === 'c' ? [r[1], r[0]] : [r[0], r[1]];
      const kk = (kd[0] === 'a' && kd[1] === 'c' ? 'ca' : kd.join(''));
      if (kk === 'cc') return [{ ...base, type: 'equal_radius_cc', c1_id: x, c2_id: y }];
      if (kk === 'ca') return [{ ...base, type: 'equal_radius_ca', c1_id: x, a2_id: y }];
      return [{ ...base, type: 'equal_radius_aa', a1_id: x, a2_id: y }];
    }
    case 'COI': return [{ ...base, type: 'p2p_coincident', p1_id: r[0], p2_id: r[1] }];
    case 'PONL': return [{ ...base, type: 'point_on_line_pl', p_id: r[0], l_id: r[1] }];
    case 'PONC': return kd[1] === 'a'
      ? [{ ...base, type: 'point_on_arc', p_id: r[0], a_id: r[1] }]
      : [{ ...base, type: 'point_on_circle', p_id: r[0], c_id: r[1] }];
    case 'COL': {
      // dos lineas colineales: los extremos de la 2.ª sobre la recta de la 1.ª
      const l1 = doc.lines[r[0]], l2 = doc.lines[r[1]];
      const out = [];
      [l2.a, l2.b].forEach((p, i) => {
        if (p !== l1.a && p !== l1.b) out.push({ id: i ? `${id}_b` : id, type: 'point_on_line_pl', p_id: p, l_id: r[0] });
      });
      return out;
    }
    case 'MID': return [{ ...base, type: 'p2p_symmetric_ppp', p1_id: r[0], p2_id: r[1], p_id: r[2] }];
    case 'TANLC': return kd[1] === 'a'
      ? [{ ...base, type: 'tangent_la', l_id: r[0], a_id: r[1] }]
      : [{ ...base, type: 'tangent_lc', l_id: r[0], c_id: r[1] }];
    case 'TANCC': {
      const kk = kd[0] === 'a' && kd[1] === 'c' ? 'ca' : kd.join('');
      const [x, y] = kd[0] === 'a' && kd[1] === 'c' ? [r[1], r[0]] : [r[0], r[1]];
      if (kk === 'cc') return [{ ...base, type: 'tangent_cc', c1_id: x, c2_id: y }];
      if (kk === 'ca') return [{ ...base, type: 'tangent_ca', c_id: x, a_id: y }];
      return [{ ...base, type: 'tangent_aa', a1_id: x, a2_id: y }];
    }
    case 'DIST': return [{ ...base, type: 'p2p_distance', p1_id: r[0], p2_id: r[1], distance: k.v }];
    case 'DISTPL': return [{ ...base, type: 'p2l_distance', p_id: r[0], l_id: r[1], distance: k.v }];
    case 'ANG': return [{ ...base, type: 'l2l_angle_ll', l1_id: r[0], l2_id: r[1], angle: (k.v * Math.PI) / 180 }];
    case 'RAD': return kd[0] === 'a'
      ? [{ ...base, type: 'arc_radius', a_id: r[0], radius: k.v }]
      : [{ ...base, type: 'circle_radius', c_id: r[0], radius: k.v }];
    default: return [];
  }
}

// Relaciones con splines (punto sobre spline y tangencias). El spline no es una primitiva del
// solver: en cada pasada se linealiza como su tangente en el punto mas cercano (recta fija) y
// solve() repite hasta converger (Newton). Cada relacion lleva el punto de contacto en refs.
const SPL = new Set(['PONS', 'TANLS', 'TANCS']);
const hasSpl = (doc) => Object.values(doc.cons).some((k) => SPL.has(k.t) && !k.ref && doc.splines?.[k.refs[1]]);

function splinePrims(doc, pos) {
  const out = [], cache = {};
  const P = (id) => pos?.pts?.[id] || doc.pts[id];
  const poly = (sid) => (cache[sid] ||= splineSamples(doc.splines[sid].pts.map(P), doc.splines[sid].closed, 32));
  let n = 0;
  for (const [id, k] of Object.entries(doc.cons)) {
    if (!SPL.has(k.t) || k.ref || !doc.splines?.[k.refs[1]]) continue;
    const pid = k.t === 'PONS' ? k.refs[0] : k.refs[2];
    const f = closestOnPolyline(poly(k.refs[1]), P(pid));
    if (!f) continue;
    const a = `__sa${n}`, b = `__sb${n}`, l = `__sl${n}`, o = `__so${n}`, oc = `__sc${n}`;
    n++;
    const tangency = k.t !== 'PONS';
    const R = Math.abs(f.k) > 1e-6 ? 1 / Math.abs(f.k) : Infinity;
    if (tangency && R < 1e5) {
      // tangencia: el spline se sustituye por su circulo osculador en el punto de contacto (centro sobre la
      // normal por el punto mas cercano); asi la linealizacion incluye la curvatura y el Newton converge
      const s = Math.sign(f.k);
      out.push({ id: o, type: 'point', x: f.x - f.ty * R * s, y: f.y + f.tx * R * s, fixed: true });
      out.push({ id: oc, type: 'circle', c_id: o, radius: R }, { id: `${oc}_r`, type: 'circle_radius', c_id: oc, radius: R });
      out.push({ id: `${id}_s`, type: 'point_on_circle', p_id: pid, c_id: oc });
      // el contacto T se define sin redundancia (en la tangencia dos curvas se cortan en un solo punto,
      // lo que haria singular el sistema): T sobre el circulo osculador y sobre la normal comun
      if (k.t === 'TANLS') {
        out.push({ id: `__sr${n}`, type: 'line', p1_id: o, p2_id: pid });
        out.push({ id: `${id}_p`, type: 'point_on_line_pl', p_id: pid, l_id: k.refs[0] });
        out.push({ id: `${id}_q`, type: 'perpendicular_ll', l1_id: `__sr${n}`, l2_id: k.refs[0] });
      } else {
        const arc = k.refs[0] in doc.arcs;
        const cc = (arc ? doc.arcs : doc.circles)[k.refs[0]].c;
        out.push({ id: `__sr${n}`, type: 'line', p1_id: o, p2_id: cc });
        out.push({ id: `${id}_p`, type: 'point_on_line_pl', p_id: pid, l_id: `__sr${n}` });
        out.push(arc ? { id: `${id}_q`, type: 'tangent_ca', c_id: oc, a_id: k.refs[0] } : { id: `${id}_q`, type: 'tangent_cc', c1_id: oc, c2_id: k.refs[0] });
      }
      continue;
    }
    // punto sobre spline (o tramo recto): recta fija tangente al spline en el punto mas cercano
    out.push({ id: a, type: 'point', x: f.x, y: f.y, fixed: true }, { id: b, type: 'point', x: f.x + f.tx * 10, y: f.y + f.ty * 10, fixed: true }, { id: l, type: 'line', p1_id: a, p2_id: b });
    out.push({ id: `${id}_s`, type: 'point_on_line_pl', p_id: pid, l_id: l });
    if (k.t === 'TANLS') {
      out.push({ id: `${id}_p`, type: 'point_on_line_pl', p_id: pid, l_id: k.refs[0] });
      out.push({ id: `${id}_q`, type: 'parallel', l1_id: k.refs[0], l2_id: l });
    } else if (k.t === 'TANCS') {
      const arc = k.refs[0] in doc.arcs;
      const cc = (arc ? doc.arcs : doc.circles)[k.refs[0]].c;
      out.push(arc ? { id: `${id}_p`, type: 'point_on_arc', p_id: pid, a_id: k.refs[0] } : { id: `${id}_p`, type: 'point_on_circle', p_id: pid, c_id: k.refs[0] });
      out.push({ id: `__sr${n}`, type: 'line', p1_id: cc, p2_id: pid });
      out.push({ id: `${id}_q`, type: 'perpendicular_ll', l1_id: `__sr${n}`, l2_id: l });
    }
  }
  return out;
}

// Distancia maxima de un punto de contacto a su spline (para validar la convergencia).
function splineResidual(doc, res) {
  let worst = 0;
  for (const k of Object.values(doc.cons)) {
    if (!SPL.has(k.t) || k.ref || !doc.splines?.[k.refs[1]]) continue;
    const sp = doc.splines[k.refs[1]];
    const P = (id) => res.pts[id] || doc.pts[id];
    const f = closestOnPolyline(splineSamples(sp.pts.map(P), sp.closed, 32), P(k.t === 'PONS' ? k.refs[0] : k.refs[2]));
    if (f) worst = Math.max(worst, f.d);
  }
  return worst;
}

// Una o varias pasadas del solver (varias si hay relaciones con splines).
function solveLoop(doc, pos, extra) {
  const spl = hasSpl(doc);
  let cur = pos, res = null;
  for (let i = 0; i < (spl ? 30 : 1); i++) {
    res = runSolve(build(doc, cur, spl ? [...(extra || []), ...splinePrims(doc, cur)] : extra));
    if (!spl) break;
    let d = 0;
    for (const [id, q] of Object.entries(res.pts)) {
      const o = cur?.pts?.[id] || doc.pts[id];
      if (o) d = Math.max(d, Math.hypot(q.x - o.x, q.y - o.y));
    }
    cur = { pts: res.pts, circles: res.circles, arcs: res.arcs };
    if (d < 1e-7) break;
  }
  return res;
}

function build(doc, pos, extra) {
  const out = [];
  const P = (id) => pos?.pts?.[id] || doc.pts[id];
  for (const [id, p] of Object.entries(doc.pts)) {
    const q = P(id);
    out.push({ id, type: 'point', x: q.x, y: q.y, fixed: !!p.fixed });
  }
  for (const [id, l] of Object.entries(doc.lines)) out.push({ id, type: 'line', p1_id: l.a, p2_id: l.b });
  for (const [id, c] of Object.entries(doc.circles)) {
    out.push({ id, type: 'circle', c_id: c.c, radius: pos?.circles?.[id] ?? c.r });
  }
  for (const [id, a] of Object.entries(doc.arcs)) {
    const { a0, sweep } = arcSweepOf(P(a.c), P(a.a), P(a.b));
    out.push({ id, type: 'arc', c_id: a.c, start_id: a.a, end_id: a.b, radius: pos?.arcs?.[id] ?? a.r, start_angle: a0, end_angle: a0 + sweep });
    out.push({ id: `${id}_rules`, type: 'arc_rules', a_id: id });
  }
  for (const [id, k] of Object.entries(doc.cons)) out.push(...conPrims(doc, id, k));
  if (extra) out.push(...extra);
  return out;
}

function runSolve(prims) {
  g.clear_data();
  g.push_primitives_and_params(prims);
  const status = g.solve();
  g.apply_solution();
  const conflicts = g.has_gcs_conflicting_constraints() ? g.get_gcs_conflicting_constraints() : [];
  const pts = {}, circles = {}, arcs = {};
  for (const p of g.sketch_index.get_primitives()) {
    if (p.type === 'point') pts[p.id] = { x: p.x, y: p.y };
    else if (p.type === 'circle') circles[p.id] = p.radius;
    else if (p.type === 'arc') arcs[p.id] = p.radius;
  }
  return { status, conflicts, pts, circles, arcs };
}

function commit(doc, res) {
  for (const [id, q] of Object.entries(res.pts)) {
    if (doc.pts[id] && !id.startsWith('__')) { doc.pts[id].x = q.x; doc.pts[id].y = q.y; }
  }
  for (const [id, r] of Object.entries(res.circles)) if (doc.circles[id]) doc.circles[id].r = r;
  for (const [id, r] of Object.entries(res.arcs)) if (doc.arcs[id]) doc.arcs[id].r = Math.abs(r);
}

// Resuelve el documento. targets (opcional): [{id,x,y}] puntos que el usuario arrastra;
// se atraen con una restriccion debil y luego se resuelve sin ella para que el
// resultado sea siempre factible. No modifica doc si falla.
export function solve(doc, targets = []) {
  if (!g) return { ok: true, conflicts: [] };
  let pos = null;
  const live = targets.filter((t) => doc.pts[t.id] && !doc.pts[t.id].fixed);
  if (live.length) {
    const extra = [];
    live.forEach((t, i) => {
      extra.push({ id: `__t${i}`, type: 'point', x: t.x, y: t.y, fixed: true });
      extra.push({ id: `__d${i}`, type: 'p2p_distance', p1_id: t.id, p2_id: `__t${i}`, distance: 0, scale: 0.02 });
    });
    const r1 = solveLoop(doc, null, extra);
    pos = { pts: r1.pts, circles: r1.circles, arcs: r1.arcs };
  }
  const res = solveLoop(doc, pos, null);
  const ok = (res.status === 0 || res.status === 1) && res.conflicts.length === 0 && (!hasSpl(doc) || splineResidual(doc, res) < 1e-3);
  if (ok) commit(doc, res);
  return { ok, conflicts: res.conflicts, status: res.status };
}

export { conRefs };

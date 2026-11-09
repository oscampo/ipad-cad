// Puente entre el documento y el solver de restricciones (planegcs, de FreeCAD, en WASM).
import { init_planegcs_module, GcsWrapper } from '@salusoft89/planegcs';
import { conRefs } from './model.js';

let g = null;

export async function initSolver(wasmUrl) {
  const mod = await init_planegcs_module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  g = new GcsWrapper(new mod.GcsSystem());
}

// Traduce una restriccion del documento a primitivas del solver.
function conPrims(id, k) {
  const r = k.refs;
  const base = { id };
  switch (k.t) {
    case 'H': return r.length === 1 ? [{ ...base, type: 'horizontal_l', l_id: r[0] }] : [{ ...base, type: 'horizontal_pp', p1_id: r[0], p2_id: r[1] }];
    case 'V': return r.length === 1 ? [{ ...base, type: 'vertical_l', l_id: r[0] }] : [{ ...base, type: 'vertical_pp', p1_id: r[0], p2_id: r[1] }];
    case 'PAR': return [{ ...base, type: 'parallel', l1_id: r[0], l2_id: r[1] }];
    case 'PERP': return [{ ...base, type: 'perpendicular_ll', l1_id: r[0], l2_id: r[1] }];
    case 'EQL': return [{ ...base, type: 'equal_length', l1_id: r[0], l2_id: r[1] }];
    case 'EQR': return [{ ...base, type: 'equal_radius_cc', c1_id: r[0], c2_id: r[1] }];
    case 'COI': return [{ ...base, type: 'p2p_coincident', p1_id: r[0], p2_id: r[1] }];
    case 'PONL': return [{ ...base, type: 'point_on_line_pl', p_id: r[0], l_id: r[1] }];
    case 'PONC': return [{ ...base, type: 'point_on_circle', p_id: r[0], c_id: r[1] }];
    case 'MID': return [{ ...base, type: 'p2p_symmetric_ppp', p1_id: r[0], p2_id: r[1], p_id: r[2] }];
    case 'TANLC': return [{ ...base, type: 'tangent_lc', l_id: r[0], c_id: r[1] }];
    case 'TANCC': return [{ ...base, type: 'tangent_cc', c1_id: r[0], c2_id: r[1] }];
    case 'DIST': return [{ ...base, type: 'p2p_distance', p1_id: r[0], p2_id: r[1], distance: k.v }];
    case 'DISTPL': return [{ ...base, type: 'p2l_distance', p_id: r[0], l_id: r[1], distance: k.v }];
    case 'ANG': return [{ ...base, type: 'l2l_angle_ll', l1_id: r[0], l2_id: r[1], angle: (k.v * Math.PI) / 180 }];
    case 'RAD': return [{ ...base, type: 'circle_radius', c_id: r[0], radius: k.v }];
    default: return [];
  }
}

function build(doc, pos, extra) {
  const out = [];
  for (const [id, p] of Object.entries(doc.pts)) {
    const q = pos?.pts?.[id] || p;
    out.push({ id, type: 'point', x: q.x, y: q.y, fixed: !!p.fixed });
  }
  for (const [id, l] of Object.entries(doc.lines)) out.push({ id, type: 'line', p1_id: l.a, p2_id: l.b });
  for (const [id, c] of Object.entries(doc.circles)) {
    out.push({ id, type: 'circle', c_id: c.c, radius: pos?.circles?.[id] ?? c.r });
  }
  for (const [id, k] of Object.entries(doc.cons)) out.push(...conPrims(id, k));
  if (extra) out.push(...extra);
  return out;
}

function runSolve(prims) {
  g.clear_data();
  g.push_primitives_and_params(prims);
  const status = g.solve();
  g.apply_solution();
  const conflicts = g.has_gcs_conflicting_constraints() ? g.get_gcs_conflicting_constraints() : [];
  const pts = {}, circles = {};
  for (const p of g.sketch_index.get_primitives()) {
    if (p.type === 'point') pts[p.id] = { x: p.x, y: p.y };
    else if (p.type === 'circle') circles[p.id] = p.radius;
  }
  return { status, conflicts, pts, circles };
}

function commit(doc, res) {
  for (const [id, q] of Object.entries(res.pts)) {
    if (doc.pts[id] && !id.startsWith('__')) { doc.pts[id].x = q.x; doc.pts[id].y = q.y; }
  }
  for (const [id, r] of Object.entries(res.circles)) if (doc.circles[id]) doc.circles[id].r = r;
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
    const r1 = runSolve(build(doc, null, extra));
    pos = { pts: r1.pts, circles: r1.circles };
  }
  const res = runSolve(build(doc, pos, null));
  const ok = (res.status === 0 || res.status === 1) && res.conflicts.length === 0;
  if (ok) commit(doc, res);
  return { ok, conflicts: res.conflicts, status: res.status };
}

export { conRefs };

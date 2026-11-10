// Geometria de las cotas (lineas de extension, flechas, posicion editable). Sin DOM.
// layoutDim devuelve instrucciones de dibujo en pixeles de pantalla; dragDim cambia la
// posicion de la cota (k.off, k.lt, k.ang, k.lp) sin tocar la geometria ni el solver.
import { lineLine, signedAngle, norm, TAU, inSweep } from './geom.js';
import { arcOf } from './model.js';

export const ARROW = 9;
export const fmtNum = (v) => (Math.abs(v) >= 1000 ? v.toFixed(1) : String(Math.round(v * 1000) / 1000));

const V = (view) => (p) => ({ x: p.x * view.s + view.ox, y: view.oy - p.y * view.s });

function footOnLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

// Puntos que acota una distancia (DIST: 2 puntos; DISTPL: punto y su pie sobre la recta).
function distEnds(doc, k) {
  if (k.t === 'DIST') return [doc.pts[k.refs[0]], doc.pts[k.refs[1]]];
  const p = doc.pts[k.refs[0]], l = doc.lines[k.refs[1]];
  return [p, footOnLine(p, doc.pts[l.a], doc.pts[l.b])];
}

// Valor que muestra una cota. Las de referencia (k.ref) no restringen nada: miden en vivo.
export function dimValue(doc, k) {
  if (!k.ref) return k.v;
  if (k.t === 'DIST' || k.t === 'DISTPL') { const [p1, p2] = distEnds(doc, k); return Math.hypot(p2.x - p1.x, p2.y - p1.y); }
  if (k.t === 'ANG') {
    const l1 = doc.lines[k.refs[0]], l2 = doc.lines[k.refs[1]];
    const d = (l) => ({ x: doc.pts[l.b].x - doc.pts[l.a].x, y: doc.pts[l.b].y - doc.pts[l.a].y });
    return (signedAngle(d(l1), d(l2)) * 180) / Math.PI;
  }
  if (k.t === 'RAD') { const o = doc.circles[k.refs[0]] || doc.arcs[k.refs[0]]; return o ? o.r : k.v; }
  return k.v;
}

export function dimText(doc, k) {
  const v = dimValue(doc, k);
  if (k.t === 'ANG') return fmtNum(v) + '°';
  if (k.t === 'RAD') return (k.refs[0] in doc.circles ? 'φ' + fmtNum(2 * v) : 'R' + fmtNum(v));
  return fmtNum(v);
}

function layoutDimBase(doc, k, view) {
  const s = view.s, v = V(view);
  const out = { lines: [], arcs: [], arrows: [], label: null };
  const text = dimText(doc, k);

  if (k.t === 'DIST' || k.t === 'DISTPL') {
    const [p1, p2] = distEnds(doc, k);
    const A = v(p1), B = v(p2), L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < 1e-6) { out.label = { x: A.x + 16, y: A.y - 16, text }; return out; }
    const u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, n = { x: -u.y, y: u.x };
    const off = (k.off ?? 16 / s) * s, sg = off < 0 ? -1 : 1;
    const A2 = { x: A.x + n.x * off, y: A.y + n.y * off }, B2 = { x: B.x + n.x * off, y: B.y + n.y * off };
    if (Math.abs(off) > 7) {
      out.lines.push([A.x + n.x * sg * 3, A.y + n.y * sg * 3, A2.x + n.x * sg * 5, A2.y + n.y * sg * 5]);
      out.lines.push([B.x + n.x * sg * 3, B.y + n.y * sg * 3, B2.x + n.x * sg * 5, B2.y + n.y * sg * 5]);
    }
    const t = k.lt ?? 0.5;
    const lo = Math.min(0, t), hi = Math.max(1, t);
    const inside = L >= 2 * ARROW + 4;
    const tail = inside ? 0 : ARROW + 7;
    out.lines.push([A2.x + u.x * lo * L - u.x * tail, A2.y + u.y * lo * L - u.y * tail, A2.x + u.x * hi * L + u.x * tail, A2.y + u.y * hi * L + u.y * tail]);
    if (inside) {
      out.arrows.push({ x: A2.x, y: A2.y, dx: -u.x, dy: -u.y }, { x: B2.x, y: B2.y, dx: u.x, dy: u.y });
    } else {
      out.arrows.push({ x: A2.x, y: A2.y, dx: u.x, dy: u.y }, { x: B2.x, y: B2.y, dx: -u.x, dy: -u.y });
    }
    out.label = { x: A2.x + u.x * t * L + n.x * sg * 11, y: A2.y + u.y * t * L + n.y * sg * 11, text };
    return out;
  }

  if (k.t === 'ANG') {
    const l1 = doc.lines[k.refs[0]], l2 = doc.lines[k.refs[1]];
    const a1 = doc.pts[l1.a], b1 = doc.pts[l1.b], a2 = doc.pts[l2.a], b2 = doc.pts[l2.b];
    const V0 = lineLine(a1, b1, a2, b2);
    if (!V0) {
      const m = v({ x: (a1.x + b1.x + a2.x + b2.x) / 4, y: (a1.y + b1.y + a2.y + b2.y) / 4 });
      out.label = { x: m.x + 14, y: m.y - 14, text };
      return out;
    }
    const d1 = { x: b1.x - a1.x, y: b1.y - a1.y }, d2 = { x: b2.x - a2.x, y: b2.y - a2.y };
    const th1 = Math.atan2(d1.y, d1.x), psi = signedAngle(d1, d2), sgn = psi >= 0 ? 1 : -1;
    const R = Math.max(14, (k.off ?? 50 / s) * s);
    const C = v(V0);
    out.arcs.push({ cx: C.x, cy: C.y, r: R, a0: -th1, a1: -(th1 + psi), ccw: psi > 0 });
    const at = (th) => ({ x: C.x + R * Math.cos(th), y: C.y - R * Math.sin(th) });
    // flechas en los extremos del arco, apuntando hacia fuera del arco
    const tan = (th) => ({ x: -Math.sin(th), y: -Math.cos(th) }); // tangente en pantalla (th creciente en el modelo)
    const e1 = at(th1), e2 = at(th1 + psi), t1 = tan(th1), t2 = tan(th1 + psi);
    out.arrows.push({ x: e1.x, y: e1.y, dx: -sgn * t1.x, dy: -sgn * t1.y }, { x: e2.x, y: e2.y, dx: sgn * t2.x, dy: sgn * t2.y });
    // lineas de extension: prolongan cada recta hasta pasar el arco si no llega
    [[th1, a1, b1], [th1 + psi, a2, b2]].forEach(([th, pa, pb]) => {
      const ux = Math.cos(th), uy = Math.sin(th);
      const far = Math.max((pa.x - V0.x) * ux + (pa.y - V0.y) * uy, (pb.x - V0.x) * ux + (pb.y - V0.y) * uy) * s;
      const from = Math.max(far, 0) + 3, to = R + 6;
      if (from < to) out.lines.push([C.x + ux * from, C.y - uy * from, C.x + ux * to, C.y - uy * to]);
    });
    const thm = th1 + psi / 2;
    out.label = { x: C.x + (R + 13) * Math.cos(thm), y: C.y - (R + 13) * Math.sin(thm), text };
    return out;
  }

  if (k.t === 'RAD') {
    const circ = doc.circles[k.refs[0]], arc = circ ? null : doc.arcs[k.refs[0]];
    const o = circ || arc;
    if (!o) return out;
    const Cm = doc.pts[o.c], C = v(Cm), rs = o.r * s;
    let defAng = Math.PI / 4;
    if (arc) { const g = arcOf(doc, arc); defAng = g.a0 + g.sweep / 2; }
    const ang = k.ang ?? defAng;
    const d = { x: Math.cos(ang), y: -Math.sin(ang) }, nrm = { x: -d.y, y: d.x };
    const lp = (k.lp ?? (circ ? 0 : o.r * 0.5)) * s;
    const L = { x: C.x + d.x * lp, y: C.y + d.y * lp };
    if (circ) {
      const P1 = { x: C.x - d.x * rs, y: C.y - d.y * rs }, P2 = { x: C.x + d.x * rs, y: C.y + d.y * rs };
      const ext1 = lp < -rs ? L : P1, ext2 = lp > rs ? L : P2;
      out.lines.push([ext1.x, ext1.y, ext2.x, ext2.y]);
      out.arrows.push({ x: P2.x, y: P2.y, dx: d.x, dy: d.y }, { x: P1.x, y: P1.y, dx: -d.x, dy: -d.y });
    } else {
      const P = { x: C.x + d.x * rs, y: C.y + d.y * rs };
      const end = lp > rs ? L : P;
      out.lines.push([C.x, C.y, end.x, end.y]);
      out.arrows.push({ x: P.x, y: P.y, dx: d.x, dy: d.y });
      // si la cota cae fuera del tramo, prolonga el arco con una linea de extension
      const g = arcOf(doc, arc);
      if (!inSweep(Cm, g.a0, g.sweep, { x: Cm.x + Math.cos(ang), y: Cm.y + Math.sin(ang) }, 1e-6)) {
        const dd = norm(ang - g.a0), toEnd = dd - g.sweep, toStart = TAU - dd;
        if (toEnd <= toStart) out.arcs.push({ cx: C.x, cy: C.y, r: rs, a0: -(g.a0 + g.sweep), a1: -ang, ccw: true, dashed: true });
        else out.arcs.push({ cx: C.x, cy: C.y, r: rs, a0: -ang, a1: -(g.a0 + TAU), ccw: true, dashed: true });
      }
    }
    out.label = { x: L.x + nrm.x * 11, y: L.y + nrm.y * 11, text };
    return out;
  }
  return out;
}

// Las cotas de referencia llevan la etiqueta en cursiva (label.italic).
export function layoutDim(doc, k, view) {
  const L = layoutDimBase(doc, k, view);
  if (L.label) L.label.italic = !!k.ref;
  return L;
}

// El usuario arrastra la etiqueta: reposiciona la cota. Devuelve true si cambio algo.
export function dragDim(doc, k, view, p) {
  const s = view.s, v = V(view);
  if (k.t === 'DIST' || k.t === 'DISTPL') {
    const [p1, p2] = distEnds(doc, k);
    const A = v(p1), B = v(p2), L = Math.hypot(B.x - A.x, B.y - A.y);
    if (L < 1e-6) return false;
    const u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, n = { x: -u.y, y: u.x };
    const rx = p.x - A.x, ry = p.y - A.y;
    k.off = (rx * n.x + ry * n.y) / s;
    k.lt = Math.max(-1.5, Math.min(2.5, (rx * u.x + ry * u.y) / L));
    return true;
  }
  if (k.t === 'ANG') {
    const l1 = doc.lines[k.refs[0]], l2 = doc.lines[k.refs[1]];
    const V0 = lineLine(doc.pts[l1.a], doc.pts[l1.b], doc.pts[l2.a], doc.pts[l2.b]);
    if (!V0) return false;
    const C = v(V0);
    k.off = Math.max(14, Math.hypot(p.x - C.x, p.y - C.y) - 13) / s;
    return true;
  }
  if (k.t === 'RAD') {
    const o = doc.circles[k.refs[0]] || doc.arcs[k.refs[0]];
    if (!o) return false;
    const C = v(doc.pts[o.c]);
    const dx = p.x - C.x, dy = p.y - C.y, d = Math.hypot(dx, dy);
    if (d < 4) return false;
    k.ang = Math.atan2(-dy, dx);
    k.lp = d / s;
    return true;
  }
  return false;
}

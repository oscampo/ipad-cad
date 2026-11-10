// Geometria de los textos: caja imaginaria, punto de insercion y orientacion. Sin DOM.
// measure(linea) -> ancho de la linea para una altura de texto de 1 (en el navegador sale
// de measureText; en las pruebas puede ser una aproximacion).
export const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
export const ANCHOR_NAMES = {
  tl: 'esquina superior izquierda', tc: 'medio del lado superior', tr: 'esquina superior derecha',
  ml: 'medio del lado izquierdo', mc: 'centro', mr: 'medio del lado derecho',
  bl: 'esquina inferior izquierda', bc: 'medio del lado inferior', br: 'esquina inferior derecha',
};
export const LINE_SPACING = 1.2;

const norm360 = (a) => ((a % 360) + 360) % 360;
const flipAnchor = (a) => ({ t: 'b', b: 't', m: 'm' }[a[0]] + { l: 'r', r: 'l', c: 'c' }[a[1]]);

// Angulo del texto antes de aplicar la regla de legibilidad: absoluto, o el de la linea
// de referencia mas el desfase t.ang si el texto esta alineado con una linea (t.ref).
export function rawAngle(doc, t) {
  const l = t.ref && doc.lines?.[t.ref];
  if (!l) return norm360(t.ang || 0);
  const a = doc.pts[l.a], b = doc.pts[l.b];
  return norm360((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + (t.ang || 0));
}

// Orientacion con la que realmente se dibuja. Si el texto es "legible" y quedaria boca abajo
// (entre 90 y 270 grados) se gira 180 y se cambia el punto de insercion por el opuesto de la
// caja: la caja queda en el mismo sitio de la hoja y el texto se lee de izquierda a derecha.
export function textPose(doc, t) {
  let ang = rawAngle(doc, t);
  let anchor = t.anchor ?? 'bl';
  if (t.readable !== false && ang > 90.0001 && ang <= 270.0001) {
    ang = norm360(ang + 180);
    anchor = flipAnchor(anchor);
  }
  return { ang, anchor };
}

// Caja en el sistema local del texto (x a la derecha, y arriba, origen en el punto de insercion).
export function textFrame(t, measure, anchor = t.anchor) {
  const lines = String(t.text ?? '').split('\n');
  const w = Math.max(0.0001, ...lines.map((l) => measure(l) * t.h));
  const hh = lines.length * LINE_SPACING * t.h;
  const ax = { l: 0, c: 0.5, r: 1 }[anchor?.[1] ?? 'l'];
  const ay = { t: 0, m: 0.5, b: 1 }[anchor?.[0] ?? 'b'];
  const xmin = -ax * w, ymax = ay * hh;
  return { lines, w, hh, xmin, ymax, ymin: ymax - hh };
}

// Esquinas de la caja en coordenadas del modelo (antihorario).
export function textCorners(doc, t, measure) {
  const P = doc.pts[t.pt];
  const pose = textPose(doc, t);
  const f = textFrame(t, measure, pose.anchor);
  const a = (pose.ang * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const to = (x, y) => ({ x: P.x + x * c - y * s, y: P.y + x * s + y * c });
  return [to(f.xmin, f.ymin), to(f.xmin + f.w, f.ymin), to(f.xmin + f.w, f.ymax), to(f.xmin, f.ymax)];
}

// ¿El punto p (modelo) cae dentro de la caja del texto, con un margen pad (unidades del modelo)?
export function textHit(doc, t, p, measure, pad = 0) {
  const P = doc.pts[t.pt];
  const pose = textPose(doc, t);
  const f = textFrame(t, measure, pose.anchor);
  const a = (pose.ang * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const rx = p.x - P.x, ry = p.y - P.y;
  const u = rx * c + ry * s, w = -rx * s + ry * c; // al sistema local
  return u >= f.xmin - pad && u <= f.xmin + f.w + pad && w >= f.ymin - pad && w <= f.ymax + pad;
}

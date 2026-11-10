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

// Caja en el sistema local del texto (x a la derecha, y arriba, origen en el punto de insercion).
export function textFrame(t, measure) {
  const lines = String(t.text ?? '').split('\n');
  const w = Math.max(0.0001, ...lines.map((l) => measure(l) * t.h));
  const hh = lines.length * LINE_SPACING * t.h;
  const ax = { l: 0, c: 0.5, r: 1 }[t.anchor?.[1] ?? 'l'];
  const ay = { t: 0, m: 0.5, b: 1 }[t.anchor?.[0] ?? 'b'];
  const xmin = -ax * w, ymax = ay * hh;
  return { lines, w, hh, xmin, ymax, ymin: ymax - hh };
}

// Esquinas de la caja en coordenadas del modelo (antihorario).
export function textCorners(doc, t, measure) {
  const P = doc.pts[t.pt];
  const f = textFrame(t, measure);
  const a = ((t.ang || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const to = (x, y) => ({ x: P.x + x * c - y * s, y: P.y + x * s + y * c });
  return [to(f.xmin, f.ymin), to(f.xmin + f.w, f.ymin), to(f.xmin + f.w, f.ymax), to(f.xmin, f.ymax)];
}

// ¿El punto p (modelo) cae dentro de la caja del texto, con un margen pad (unidades del modelo)?
export function textHit(doc, t, p, measure, pad = 0) {
  const P = doc.pts[t.pt];
  const f = textFrame(t, measure);
  const a = ((t.ang || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const rx = p.x - P.x, ry = p.y - P.y;
  const u = rx * c + ry * s, w = -rx * s + ry * c; // al sistema local
  return u >= f.xmin - pad && u <= f.xmin + f.w + pad && w >= f.ymin - pad && w <= f.ymax + pad;
}

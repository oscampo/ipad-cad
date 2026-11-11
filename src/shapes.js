// Formas compuestas: rectangulos, poligonos regulares y circunferencia por 3 puntos. Sin DOM (se prueba en Node).
// Crean elementos y restricciones en doc; quien llama hace undo/solve y revierte si el solver falla.
import { addLine, addCon } from './model.js';
import { circumcircle } from './geom.js';

// Estilo de la linea constructiva: gris, fina, tipo "constructiva". No sale en el SVG de corte laser.
export const CLINE_STYLE = { color: '#C3C3C3', ltype: 'constructiva', w: 1, ls: 1 };

// Circunferencia por 3 puntos; null si son colineales (con tolerancia relativa).
export function circleThrough3(A, B, C) {
  const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
  const n = Math.hypot(B.x - A.x, B.y - A.y) * Math.hypot(C.x - A.x, C.y - A.y);
  if (!(n > 1e-12) || Math.abs(cross) < 1e-7 * n) return null;
  const cc = circumcircle(A, B, C);
  return cc && Number.isFinite(cc.r) ? cc : null;
}

// Rectangulo a partir de 4 puntos ya creados, en orden alrededor (p1 y p3 opuestos). Lineas horizontales
// (p1p2, p3p4) y verticales (p2p3, p4p1) con sus restricciones. Devuelve los ids de las 4 lineas.
export function addRectangle(doc, [p1, p2, p3, p4], style) {
  const l = [addLine(doc, p1, p2, style), addLine(doc, p2, p3, style), addLine(doc, p3, p4, style), addLine(doc, p4, p1, style)];
  addCon(doc, { t: 'H', refs: [l[0]] });
  addCon(doc, { t: 'V', refs: [l[1]] });
  addCon(doc, { t: 'H', refs: [l[2]] });
  addCon(doc, { t: 'V', refs: [l[3]] });
  return l;
}

// Vertices de un poligono regular de n lados. rp define el radio (distancia al centro) y la orientacion
// (angulo del radio con la horizontal). Inscrito: rp es un vertice y R el radio de la circunferencia que pasa
// por ellos. Circunscrito: R es la distancia del centro al punto medio de un lado (apotema) y rp apunta a ese
// punto medio, asi la circunferencia de radio R queda tangente a todos los lados.
export function polygonVertices(c, rp, n, circumscribed = false) {
  const R = Math.hypot(rp.x - c.x, rp.y - c.y), th = Math.atan2(rp.y - c.y, rp.x - c.x);
  const Rv = circumscribed ? R / Math.cos(Math.PI / n) : R, a0 = th + (circumscribed ? Math.PI / n : 0);
  const out = [];
  for (let i = 0; i < n; i++) { const a = a0 + (2 * Math.PI * i) / n; out.push({ x: c.x + Rv * Math.cos(a), y: c.y + Rv * Math.sin(a) }); }
  return out;
}

// Poligono regular con vertices (ids de puntos) ya creados alrededor del centro cId. Para mantenerlo regular:
// los vertices equidistan del centro y los lados son iguales (restricciones ocultas). Devuelve los ids de las lineas.
export function addPolygon(doc, cId, verts, style) {
  const n = verts.length, ls = [];
  for (let i = 0; i < n; i++) ls.push(addLine(doc, verts[i], verts[(i + 1) % n], style));
  for (let i = 1; i < n; i++) addCon(doc, { t: 'EQD', refs: [cId, verts[0], cId, verts[i]], hidden: true });
  for (let i = 1; i < n; i++) addCon(doc, { t: 'EQL', refs: [ls[0], ls[i]], hidden: true });
  return ls;
}

// Sentido de un arco por centro y extremos. acc: angulo (rad, + antihorario) que recorrio el cursor alrededor
// del centro desde el inicio del arco (el movimiento del usuario). Si casi no se movio (un toque en el extremo),
// se toma el arco corto: el sentido que lleva del inicio al extremo por el camino mas corto.
export function arcIsClockwise(acc, C, S, E) {
  if (Math.abs(acc) > 0.05) return acc < 0;
  return (S.x - C.x) * (E.y - C.y) - (S.y - C.y) * (E.x - C.x) < 0;
}

// Patron de un arco constructivo: punto, hueco, trazo continuo, hueco, punto (largo L, en las mismas unidades).
// Si el arco es demasiado corto para eso, es continuo.
export function constructionArcDash(L, dot, gap) {
  const solid = L - 2 * (dot + gap);
  return solid > dot ? [dot, gap, solid, gap, dot] : [];
}

# iPad CAD

CAD 2D parametrico para iPad (uso personal), inspirado en Updraw. PWA: se instala desde Safari con
"Anadir a pantalla de inicio". Solver de restricciones: planegcs (FreeCAD) en WebAssembly.

- Puntos, lineas, circulos con restricciones (H, V, paralela, perpendicular, coincidente, punto medio,
  igual, tangente, punto sobre linea/circulo, fijar) y cotas (distancia, angulo, radio).
- Interseccion de dos elementos (recta-recta, recta-circulo, circulo-circulo) como punto restringido a ambos.
- Tipos de linea: continua, oculta, eje, fantasma, discontinua, punteada, traza y punto, y propios
  (patron tipo `12 -3 2 -3`).
- Colores y grosores por elemento. Rellenos: achurado (lineas, cruzado) y color solido.
- Arcos (centro y extremos, 3 puntos), colineal y dividir (segmentos, arcos y circulos heredan estilo y relaciones).
- Cotas con flechas y lineas de extension reposicionables (arrastra la etiqueta): distancia, angulo, R de arco, phi de circulo.
- Texto con punto de insercion (esquinas, medios de lado o centro de la caja), angulo y altura; el punto es un punto real del dibujo.
- Texto alineado con una linea (sigue su direccion, con desfase) y modo legible (se gira 180 grados si quedaria boca abajo, manteniendo su caja en el mismo sitio).
- Cotas de referencia (solo lectura, en cursiva): miden en vivo y no entran al solver, para medir resultados sin generar conflictos.
- Splines por puntos (Catmull-Rom centripeta, abiertos o cerrados): pasan por puntos reales del dibujo y se pueden rellenar y exportar.
- Trazado de trayectorias: marca un punto con "Trazar punto" y al arrastrar el mecanismo deja su trayectoria; se puede convertir en un spline editable.
- Interruptores de vista: restricciones, puntos, cotas y textos.
- Escala del patron de linea por elemento.
- Exportar .json, PNG, SVG, DXF (lineas, arcos, circulos, puntos, textos y cotas; en DXF las cotas salen como geometria: LINE, ARC, SOLID y TEXT, no como entidades DIMENSION).

Desarrollo: `npm install`, `npm run dev`, `npm test`, `npm run build`.
Apple Pencil dibuja y arrastra; un dedo desplaza y hace zoom (pellizco). Interruptor "Dibujar con dedo".

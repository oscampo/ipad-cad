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
- Escala del patron de linea por elemento.
- Exportar .json, PNG, SVG, DXF (lineas, arcos, circulos, puntos y textos; las cotas no se exportan todavia).

Desarrollo: `npm install`, `npm run dev`, `npm test`, `npm run build`.
Apple Pencil dibuja y arrastra; un dedo desplaza y hace zoom (pellizco). Interruptor "Dibujar con dedo".

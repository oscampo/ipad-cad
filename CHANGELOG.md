# Historial de cambios

## v1.0.1 (2026-11-10)

**Bloqueo suave rehecho al dibujar líneas**
- Bloqueos cada 15° (incluye horizontal y vertical), con la etiqueta del ángulo. El paso se cambia en Vista.
- Corrección: el bloqueo ya no se pierde cuando el final de la línea se acerca a otra línea, un arco o un círculo.
- Cerca de una línea existente: paralela o perpendicular a ella; la perpendicular termina en el pie sobre esa línea.
- Cerca de un arco o círculo: tangente, con el extremo sobre la curva.
- Si la dirección bloqueada cruza un elemento cerca del cursor, la línea termina en ese cruce.
- Imán a intersecciones: el inicio o el final de la línea se toman en la intersección de dos elementos (líneas, arcos, círculos, splines) cuando el cursor se queda cerca; el tiempo (ms) es configurable en Vista. Un toque o el inicio de un arrastre la toman al instante.

## v1.0.0 (2026-11-10)

Primera versión numerada. Resume lo construido desde el prototipo del 2026-11-09.

**Dibujo y solver**
- Editor 2D paramétrico (PWA para iPad) con solver de restricciones PlaneGCS (FreeCAD, WebAssembly).
- Puntos, líneas, círculos, arcos (centro y extremos, 3 puntos), splines y textos.
- Restricciones: horizontal, vertical, paralela, perpendicular, coincidente, colineal, punto medio, igual, tangente, punto sobre, fijar.
- Intersección de dos elementos; tipos de línea de mecánica y propios, colores, grosores y rellenos.
- Bloqueo suave al dibujar líneas (H, V, 45°, paralela, perpendicular, tangente).

**Cotas**
- Distancia, ángulo (siempre positivo, el sector lo decide dónde se coloca), radio y diámetro (⌀) según ANSI.
- Fórmulas (`3π/4`, `10*sin(30)`...), grados o radianes, cotas de referencia.

**Splines**
- B-splines cúbicos nativos de PlaneGCS, abiertos y cerrados (periódicos).
- Punto sobre spline, intersecciones y tangencias con líneas, círculos y arcos, resueltos de forma exacta.
- Trazado de trayectorias y conversión a spline (primera vuelta), equidistante.

**Edición**
- Recortar (arrastrando), extender, dividir (en puntos o en n partes iguales).
- Matriz lineal (1 o 2 direcciones), matriz circular (con omitir instancias) y copia espejo.
- Selección con cuadro: de izquierda a derecha toma lo que queda dentro; de derecha a izquierda, lo que toca.

**Interfaz y archivos**
- Árbol de elementos con relaciones y propiedades; menú; ayuda con la documentación y los créditos del solver.
- Guardar y abrir .json; exportar PNG, SVG, DXF y SVG CUT (corte láser a escala real con clases de línea: corte, marcado u omitir).

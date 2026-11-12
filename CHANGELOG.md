# Historial de cambios

## v1.2.1 (2026-11-11)

- **Cota de distancia entre 2 líneas paralelas** (se seleccionan las dos y se pulsa Distancia): acota la distancia perpendicular y agrega la restricción Paralela si no la tenían (salvo en cotas de referencia). Si no son paralelas (más de 1°) avisa.
- **Cotas**: un toque las selecciona (para borrarlas, por ejemplo), arrastrar las reposiciona y el doble toque edita su valor. Antes un toque abría directamente la edición.

## v1.2.0 (2026-11-11)

- **Enganche al punto medio de las líneas** al dibujar (marca M): el punto nuevo queda con una restricción oculta de punto medio. No se ofrece en líneas muy cortas en pantalla.

## v1.1.1 (2026-11-11)

- **Coincidente entre puntos lejanos**: si de golpe el solver pierde el hilo (pasaba con arcos tangentes y un punto a más de una unidad), ahora reintenta acercando los puntos poco a poco y pone la restricción al final. Antes decía «No se pudo» aunque el caso tenía solución.

## v1.1.0 (2026-11-11)

- **Elipse parcial** (desplegable de Elipse): arco elíptico definido con el centro, el primer eje y el segundo eje, y arrastrando sobre la elipse de referencia para marcar el tramo (en el sentido del movimiento). Sus extremos son puntos que se deslizan sobre la elipse.
- **Recortar elipses y splines**: la elipse queda como arco elíptico (o se parte en dos que comparten centro y ejes); el spline queda en trozos que conservan la forma con puntos extra tomados de la curva original.
- **Extender** líneas y arcos hasta elipses, arcos elípticos y splines.
- **Coincidente con elipses** (punto sobre elipse) y, con una elipse o spline, el extremo más cercano de las líneas o arcos seleccionados. Al dibujar, los puntos se enganchan también a las elipses.
- **Tangente con elipses**: línea, círculo, arco u otra elipse.
- Las elipses con relaciones y los arcos elípticos se resuelven como elipses nativas del solver.

## v1.0.6 (2026-11-11)

- **Círculos y arcos constructivos**: herramientas nuevas en los desplegables de Círculo y Arco (círculo constructivo; arco constructivo por centro y extremos y por 3 puntos) y conversión de cualquier elemento con el tipo «Constructiva» del panel de Estilo. Color y grosor de la línea constructiva; el círculo se ve en «traza y punto» y los arcos llevan un punto en cada extremo.
- **Arcos en sentido horario o antihorario** según el movimiento del cursor (o del arrastre) alrededor del centro; con un toque directo se crea el arco corto. La vista previa indica el sentido.

## v1.0.5 (2026-11-11)

- **Línea de punto medio** (desplegable de Línea, tecla M): el punto inicial es el punto medio y la línea crece igual hacia ambos lados al elegir un extremo (toques o arrastre). Con bloqueo suave y restricción de punto medio.
- **Restricción concéntrica** entre círculos y arcos (los centros coinciden), numerada (◎1...) y en el árbol de elementos.
- Los puntos de la línea constructiva se dibujan como los del tipo «traza y punto».

## v1.0.4 (2026-11-11)

- **Botones desplegables** (esquina marcada, tocar de nuevo o mantener presionado): Seleccionar (con **Filtrar**), Línea (con **línea constructiva**), Círculo (con **círculo perimetral** por 3 puntos), Arco (por centro y por 3 puntos) y Rectángulo (por diagonal y de centro). Cada grupo recuerda la última herramienta usada.
- **Filtrar** la selección por entidades y por tipo de línea (tocar y cuadro de selección), con indicador en el botón.
- **Copiar y Pegar**: el centro del cuadro de lo copiado queda en el punto elegido; conserva restricciones y rellenos internos y sobrevive a borrar el original.
- **Línea constructiva**: #C3C3C3, grosor fino, con un punto (el de «traza y punto») en cada extremo y trazo continuo en medio; por defecto no sale en el SVG de corte láser.
- **Rectángulos** (diagonal y de centro) con restricciones H/V, y **polígono regular** inscrito/circunscrito con número de lados y orientación por el radio (con bloqueo suave).
- **Fuentes de texto**: selector al crear y en el panel; se aplican en el lienzo y en el SVG.
- **Extensión sucesiva corregida**: el extremo se desplaza al siguiente cruce en vez de dejar puntos nuevos en los anteriores.

## v1.0.3 (2026-11-11)

- **Restricciones numeradas** por tipo (H1, V2, ⟂1, ∥1, =1, ●1, T1...). Las que involucran varios elementos comparten número y se rotulan junto a cada uno. El número no se reutiliza. Se muestran en el árbol de elementos, que lleva el lienzo hasta ellas.
- **Coincidente** unifica «Punto sobre»: 2 puntos coinciden; punto(s) y una línea, arco, círculo o spline quedan sobre el elemento. Se quita el botón «Punto sobre».
- **Restricciones automáticas del bloqueo suave** (verificado): horizontal, vertical, perpendicular, paralela y tangente, con los elementos involucrados.
- **Matrices lineal y circular y copia espejo con copias vinculadas** al original (distancia y dirección, igual distancia al centro y ángulo, simetría, igual radio), activables y con **cotas opcionales**.
- **Herramienta de elipse** (O): centro, primer eje y segundo eje, con toques o arrastrando. Se selecciona, copia, exporta (PNG, SVG, DXF, SVG CUT) y aparece en el árbol.
- **Recorte corregido**: solo quita el tramo bajo el cursor entre los dos cruces más cercanos; ya no divide el resto del elemento en los demás cruces.

## v1.0.2 (2026-11-10)

- El bloqueo suave vuelve a horizontal, vertical y 45° por defecto (cada 45°). El paso sigue siendo configurable en Vista ("Bloqueo suave cada (°)"), por ejemplo 15.
- Se conservan las mejoras de v1.0.1: el bloqueo se mantiene cerca de otros elementos, paralela, perpendicular y tangente, final en el cruce e imán a intersecciones.

## v1.0.1 (2026-11-10)

**Bloqueo suave rehecho al dibujar líneas**
- Bloqueos con paso configurable (15° en esta versión), con la etiqueta del ángulo.
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

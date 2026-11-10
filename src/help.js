// Contenido de la ayuda (HTML estático). Se inserta en el diálogo de ayuda.
export const HELP_HTML = `
<p>iPad CAD es un editor de dibujo 2D <b>paramétrico</b>: dibujas puntos, líneas, círculos, arcos y splines, los relacionas con <b>restricciones</b> (horizontal, paralela, tangente...) y <b>cotas</b>, y un solver geométrico mantiene todo consistente. Si mueves un punto, el resto del dibujo se reacomoda respetando las relaciones. Sirve para croquis, geometría descriptiva, <b>mecanismos</b> (arrastras un eslabón y el mecanismo se mueve) y estática gráfica.</p>

<details open><summary>Primeros pasos y gestos</summary>
<ul>
<li><b>Apple Pencil o ratón</b>: dibujan y seleccionan.</li>
<li><b>Dedo</b>: desplaza el lienzo y, con dos dedos, hace zoom (pellizco). Con <i>Dedo dibuja</i> (panel Vista) el dedo también dibuja.</li>
<li><b>Ratón</b>: rueda = zoom; botón central, botón derecho o Espacio + arrastrar = desplazar.</li>
<li><b>Menú (☰)</b>: muestra u oculta el panel de herramientas de la derecha. El primer botón de la barra abre el <b>árbol de elementos</b>.</li>
<li>La barra inferior explica la herramienta activa y muestra los datos del elemento seleccionado.</li>
<li>Seleccionar: toca un elemento (toca varios para sumar). Los botones del panel solo se activan si la selección les sirve.</li>
<li><b>Selección con cuadro</b>: con la herramienta Seleccionar, arrastra desde un lugar vacío. De <b>izquierda a derecha</b> (cuadro azul, línea continua) se seleccionan los elementos que quedan <b>completamente dentro</b>; de <b>derecha a izquierda</b> (cuadro naranja, línea discontinua) también los que el cuadro <b>toca</b>. Con Mayús se suma a la selección. Alcanza puntos, líneas, círculos, arcos, splines y textos (un texto por su punto de inserción). Con el dedo, activa <i>Dedo dibuja</i>, porque si no el dedo desplaza el lienzo.</li>
</ul></details>

<details><summary>Herramientas de dibujo (barra superior)</summary>
<ul>
<li><b>Seleccionar (V)</b>: selecciona, arrastra puntos, líneas o el borde de un círculo (el mecanismo se mueve según las restricciones) y, arrastrando desde un lugar vacío, selecciona con un cuadro.</li>
<li><b>Punto (P)</b>: sobre una línea o círculo queda restringido a él.</li>
<li><b>Línea (L)</b>: toca inicio y fin (encadena) o arrastra un segmento. Esc o Seleccionar termina.</li>
<li><b>Círculo (C)</b>: centro y un punto del borde.</li>
<li><b>Arco por centro y extremos (R)</b>: centro, inicio y fin (sentido antihorario).</li>
<li><b>Arco por 3 puntos (A)</b>: inicio, punto intermedio y fin.</li>
<li><b>Spline (S)</b>: toca los puntos por donde pasa la curva; tocar de nuevo el último (o Esc) termina, tocar el primero la cierra.</li>
<li><b>Texto (T)</b>: toca donde va el punto de inserción.</li>
<li><b>Intersección (I)</b>: toca dos elementos (línea, arco, círculo o spline) para crear su punto de intersección con las relaciones correspondientes.</li>
<li><b>Recortar (X)</b>: mantén presionado y arrastra sobre los tramos que quieres quitar (entre los cruces con otros elementos). Un toque recorta un tramo. Sin cruces, borra el elemento completo. No recorta splines.</li>
<li><b>Extender (E)</b>: toca un segmento o arco cerca del extremo que quieres alargar; llega hasta el primer elemento que encuentre.</li>
<li>Deshacer, rehacer, borrar selección y ajustar vista están a la derecha de la barra.</li>
</ul></details>

<details><summary>Bloqueo suave al dibujar líneas</summary>
<p>Al dibujar una línea, si el cursor queda cerca de una dirección notable, la línea se ajusta y se ve una guía con una etiqueta:</p>
<ul>
<li><b>H, V y 45°</b>: siempre. H y V agregan la restricción; 45° no agrega ninguna.</li>
<li>Si empiezas en una línea o en su extremo: <b>paralela (∥)</b> o <b>perpendicular (⟂)</b> a ella, con la restricción correspondiente.</li>
<li>Si empiezas o terminas en un arco o círculo: <b>tangente (T)</b>.</li>
</ul>
<p>Si la restricción choca con las existentes, se quita y la línea queda tal cual. Se apaga con <i>Bloqueo suave</i> en el panel Vista.</p></details>

<details><summary>Restricciones</summary>
<p>Selecciona los elementos y pulsa el botón. Cada botón indica qué selección necesita.</p>
<ul>
<li><b>Horizontal / Vertical</b>: líneas, o 2 puntos.</li>
<li><b>Paralela / Perpendicular</b>: 2 o más líneas.</li>
<li><b>Coincidente</b>: 2 o más puntos. <b>Colineal</b>: 2 o más líneas.</li>
<li><b>Punto medio</b>: 1 punto + 1 línea.</li>
<li><b>Igual</b>: 2 líneas (igual longitud) o 2 círculos/arcos (igual radio).</li>
<li><b>Tangente</b>: línea + círculo/arco, 2 círculos/arcos, o un spline con una línea, círculo o arco.</li>
<li><b>Punto sobre</b>: punto(s) + 1 línea, arco, círculo o spline.</li>
<li><b>Fijar / soltar</b>: puntos, líneas o círculos. Un punto fijo no se mueve al arrastrar.</li>
</ul>
<p>Si una restricción contradice a las demás, la app avisa y deshace la acción.</p></details>

<details><summary>Cotas (dimensiones)</summary>
<ul>
<li><b>Distancia</b>: 2 puntos, 1 línea, o punto + línea.</li>
<li><b>Ángulo</b>: 2 líneas. La cota siempre es positiva (0° a 180°). El lugar donde la coloques decide el sector que se acota (por ejemplo 20° o 160°). Arrastra la cota para reubicarla.</li>
<li><b>Radio / ⌀</b>: arco (R) o círculo (diámetro con el símbolo ⌀). Siguen la norma ANSI: con el texto dentro, la línea de cota va por el interior; con el texto fuera, una llamada radial con la flecha tocando desde afuera.</li>
<li><b>Fórmulas</b>: en cualquier cota se puede escribir una expresión: <code>3π/4</code>, <code>2π*5</code>, <code>10*sin(30)</code>, <code>10+1/3</code>, <code>√2</code>, <code>2^3</code>.</li>
<li><b>Grados o radianes</b>: en cotas angulares hay un selector de unidad. En grados, sin/cos/tan usan grados (radianes si el argumento lleva π); en radianes, todo va en radianes.</li>
<li><b>Solo lectura (referencia)</b>: mide y muestra el valor en cursiva sin restringir la geometría.</li>
<li>Toca una cota para editar su valor.</li>
</ul></details>

<details><summary>Dividir, copiar y repetir</summary>
<ul>
<li><b>Dividir</b> (panel, sección Cotas...): con 1 segmento, arco o círculo más los puntos que están sobre él, lo parte en esos puntos. Sin puntos, lo divide en <b>n partes iguales</b> (en líneas, las partes quedan con restricción de igual longitud; en arcos y círculos no hay restricción de igual ángulo).</li>
<li><b>Matriz lineal</b>: selecciona lo que quieres copiar. Define la dirección 1 (con una línea: de su inicio a su fin; sin línea, horizontal), el espaciado y el <i>número total</i> (incluye el original; si solo das el espaciado, el total es 2). La dirección 2 es opcional y llena una cuadrícula; sin línea es perpendicular a la 1. Las direcciones elegidas se resaltan con una flecha en el lienzo.</li>
<li><b>Matriz circular</b>: centro (origen o un punto que toques), ángulo total (360° por defecto), número total, separación igual o ángulo entre instancias, sentido invertido y <i>omitir instancias</i> (por ejemplo 3, 5).</li>
<li><b>Copia espejo</b>: selecciona lo que quieres reflejar, pulsa el botón y toca la línea que hace de eje. Los puntos sobre el eje se comparten.</li>
</ul>
<p>Las copias son independientes del original: llevan sus restricciones internas, pero si cambias el original, no cambian.</p></details>

<details><summary>Splines y trazados (levas y trayectorias)</summary>
<ul>
<li>Un spline es un <b>B-spline cúbico</b> que pasa por puntos reales del dibujo. Abierto: curvatura nula en los extremos. Cerrado: periódico, suave en toda la vuelta, sin esquina en la unión. Esos puntos se comportan como puntos libres hasta que los restrinjas.</li>
<li><b>Es un elemento de primera clase</b>: puede tener puntos sobre él, intersecciones y tangencias con líneas, círculos y arcos. El solver las resuelve de forma exacta, no aproximada, junto con el resto del dibujo.</li>
<li><b>Deformación</b>: arrastrar un punto del spline, o un punto ligado a él, deforma la curva y el resto del dibujo sigue. Un seguidor (punto sobre el spline y sobre una recta, por ejemplo) recorre el perfil mientras mueves la recta.</li>
<li>Un punto ligado a un spline <b>abierto</b> no puede salirse de sus extremos: si lo intentas, la app avisa de un conflicto y deshace.</li>
<li>Al soltar un arrastre, un spline con relaciones recalcula sus parámetros internos para que no ondule si los puntos se movieron mucho; puede cambiar ligeramente de forma.</li>
<li><b>Trazar punto</b>: hace que un punto dibuje su trayectoria al mover el mecanismo. <b>Trazado a spline</b> convierte la trayectoria (la primera vuelta) en un spline editable.</li>
<li><b>Equidistante</b>: curva paralela a un spline a una distancia dada (por ejemplo el radio del rodillo de una leva). Avisa si la distancia supera el radio de curvatura.</li>
<li><b>Cerrar / abrir</b> el spline seleccionado. En el SVG de corte y en el DXF salen como curvas exactas.</li>
</ul></details>

<details><summary>Texto, estilo y rellenos</summary>
<ul>
<li><b>Texto</b>: el punto de inserción es un punto real (se puede acotar, fijar o relacionar). Elige el punto de inserción en la caja, el ángulo, la altura, alinea con una línea y <i>Legible</i> (gira 180° el texto que quedaría boca abajo).</li>
<li><b>Estilo</b>: color, tipo de línea (continua, oculta, eje, fantasma, discontinua, punteada, traza y punto, o uno nuevo con su patrón) y grosor (fino, normal, grueso). Aplica a la selección y a lo nuevo.</li>
<li><b>Relleno / achurado</b>: sobre un contorno cerrado (líneas, arcos o círculo): líneas, cruzado o sólido, con ángulo, separación y opacidad.</li>
</ul></details>

<details><summary>Vista y árbol de elementos</summary>
<ul>
<li><b>Vista</b>: cuadrícula, imán (a la cuadrícula), bloqueo suave, mostrar u ocultar restricciones, puntos, cotas y textos, dedo dibuja, etiquetas del panel y escala de los trazos.</li>
<li><b>Árbol de elementos</b> (primer botón de la barra): lista líneas, círculos, arcos, splines, textos, rellenos, puntos y relaciones. Toca un elemento para seleccionarlo y ver sus puntos y restricciones.</li>
</ul></details>

<details><summary>Archivo y exportación</summary>
<ul>
<li><b>Guardar / Abrir</b>: el dibujo se guarda en un archivo .json (te pide el nombre). Además, la app recuerda el último dibujo <b>solo en este navegador</b>: guarda un .json para respaldar.</li>
<li><b>PNG</b>: imagen del dibujo. <b>SVG</b>: vectorial. <b>DXF</b>: para CAD (las cotas salen como geometría y texto).</li>
<li><b>SVG CUT</b> (corte láser): SVG a escala real en mm. Cada <i>clase de línea</i> (tipo, color y grosor) se manda a <b>Corte</b> (color de corte, rojo por defecto), <b>Marcado</b> (otro color, por ejemplo pliegues) u <b>Omitir</b>. Sale en dos grupos, "corte" y "marcado". No salen cotas, textos, puntos ni rellenos.</li>
</ul></details>

<details><summary>Atajos de teclado</summary>
<p>V seleccionar, P punto, L línea, C círculo, R arco por centro, A arco por 3 puntos, S spline, T texto, I intersección, X recortar, E extender. Ctrl/Cmd+Z deshacer, Ctrl/Cmd+Y (o Ctrl/Cmd+Mayús+Z) rehacer, Supr o Retroceso borra, Esc cancela o termina.</p></details>

<details><summary>Historial de versiones</summary>
<p><b>v1.0.0</b>: primera versión numerada. Incluye dibujo paramétrico con restricciones y cotas (fórmulas, grados o radianes, ANSI), splines B-spline nativos de PlaneGCS, recortar, extender, dividir, matrices lineal y circular, copia espejo, bloqueo suave, selección con cuadro, árbol de elementos, exportación PNG, SVG, DXF y SVG CUT, y esta ayuda. El detalle está en <a href="https://github.com/oscampo/ipad-cad/blob/main/CHANGELOG.md" target="_blank" rel="noopener">CHANGELOG.md</a>.</p></details>

<details open><summary>Solver y créditos</summary>
<p>Las restricciones las resuelve <b>PlaneGCS</b>, el solver geométrico 2D del módulo <i>Sketcher</i> de <b>FreeCAD</b>, cuyo código original es de <b>Konstantinos Poulios</b> (© 2011, parte del proyecto FreeCAD, licencia LGPL).</p>
<p>La app lo usa compilado a WebAssembly mediante el paquete <b>@salusoft89/planegcs</b> (v1.3.0), un build wasm y envoltorio JavaScript de <b>Salusoft89</b>, con licencia LGPL-2.0-or-later: <a href="https://github.com/Salusoft89/planegcs" target="_blank" rel="noopener">github.com/Salusoft89/planegcs</a>. FreeCAD: <a href="https://www.freecad.org" target="_blank" rel="noopener">freecad.org</a>.</p>
<p>Los splines son <b>B-splines cúbicos nativos de PlaneGCS</b>: cada punto del spline queda sobre su nudo, los polos son incógnitas auxiliares del solver y la curva dibujada es la misma que resuelve el solver. El punto sobre spline (<code>point_on_bspline</code>) y las tangencias con líneas, círculos y arcos (<code>angle_via_point_and_param</code>) se resuelven de forma exacta. En los abiertos, la curvatura nula en los extremos se expresa con una restricción de punto medio entre polos.</p>
<p>Otros componentes: íconos <b>Lucide</b> (licencia ISC) y empaquetado con <b>Vite</b> (licencia MIT).</p></details>

<details><summary>Límites conocidos</summary>
<ul>
<li>Un spline no se recorta ni se extiende.</li>
<li>Una tangencia con un spline puede no converger si el punto de contacto arranca muy lejos de la solución (la app lo arranca en el punto más cercano).</li>
<li>La división en partes iguales de arcos y círculos no deja restricción de igual ángulo.</li>
<li>Las copias de las matrices y del espejo no quedan ligadas al original.</li>
<li>Si el solver no converge o hay restricciones en conflicto, la acción se deshace con un aviso.</li>
</ul></details>
`;

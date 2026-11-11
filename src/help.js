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
<p>Los botones con una esquina marcada son <b>desplegables</b>: muestran la última herramienta usada del grupo. Toca la esquina, vuelve a tocar el botón cuando ya está activo, o mantenlo presionado para ver las demás.</p>
<ul>
<li><b>Seleccionar (V)</b>: selecciona, arrastra puntos, líneas o el borde de un círculo (el mecanismo se mueve según las restricciones) y, arrastrando desde un lugar vacío, selecciona con un cuadro.</li>
<li><b>Filtrar</b> (en el desplegable de Seleccionar): elige qué se puede seleccionar, por entidades (puntos, líneas, círculos, arcos, elipses, splines, textos, rellenos, cotas) y por tipo de línea. Vale para tocar y para el cuadro de selección. Un punto rojo en el botón indica que hay filtro activo.</li>
<li><b>Copiar</b> (Ctrl+C) y <b>Pegar</b> (Ctrl+V): Copiar guarda la selección con sus restricciones internas; Pegar pide un punto y deja el centro del cuadro que encierra lo copiado en ese punto (se ve el cuadro mientras mueves). Se puede pegar varias veces; Esc o Seleccionar termina. Lo copiado se conserva aunque borres el original, pero se pierde al cerrar la app.</li>
<li><b>Punto (P)</b>: sobre una línea o círculo queda restringido a él.</li>
<li><b>Línea (L)</b>: toca inicio y fin (encadena) o arrastra un segmento. Esc o Seleccionar termina.</li>
<li><b>Línea de punto medio (M)</b> (desplegable de Línea): toca el punto inicial, que será el <i>punto medio</i>, y luego un extremo (o arrastra); la línea crece igual hacia el otro lado. Queda con una restricción de punto medio (M) y el bloqueo suave funciona como en las líneas.</li>
<li><b>Línea constructiva (K)</b> (desplegable de Línea): gris (#C3C3C3), del grosor «fino» y con un trazo continuo en el medio y un punto en cada extremo, separados por un hueco; los puntos se ven como los del tipo «traza y punto». Se dibuja como una línea normal, con bloqueo suave. No sale en el SVG de corte láser salvo que cambies su clase a Corte o Marcado.</li>
<li><b>Círculo (C)</b>: centro y un punto del borde.</li>
<li><b>Círculo perimetral</b> (desplegable de Círculo): toca 3 puntos no colineales; los puntos quedan sobre la circunferencia.</li>
<li><b>Elipse (O)</b>: toca el centro; luego toca (o arrastra hasta) el extremo del primer eje y, por último, un punto del segundo eje (la elipse pasa por la proyección de ese punto sobre la perpendicular al primer eje). También puedes arrastrar desde el centro hasta el extremo del primer eje. Es un elemento propio: se selecciona, se copia, se exporta, aparece en el árbol y sus tres puntos (centro, eje 1 y eje 2) se pueden acotar y restringir. No se recorta, no se extiende y no admite intersecciones.</li>
<li><b>Arco por centro y extremos (R)</b>: centro, inicio y fin (sentido antihorario).</li>
<li><b>Arco por 3 puntos (A)</b> (desplegable de Arco): inicio, punto intermedio y fin.</li>
<li><b>Spline (S)</b>: toca los puntos por donde pasa la curva; tocar de nuevo el último (o Esc) termina, tocar el primero la cierra.</li>
<li><b>Rectángulo (B)</b>: toca (o arrastra entre) dos esquinas opuestas. Queda con restricciones horizontal y vertical, así que sigue siendo rectángulo al mover una esquina.</li>
<li><b>Rectángulo de centro</b> (desplegable de Rectángulo): toca el centro y una esquina (o arrastra del centro a la esquina). El centro queda como punto medio de la diagonal.</li>
<li><b>Polígono (G)</b>: toca el centro y el radio; luego eliges el número de lados (3 a 64) y si es <i>inscrito</i> (el radio llega a un vértice) o <i>circunscrito</i> (el radio llega al medio de un lado). El ángulo del radio con la horizontal da la orientación, con los mismos bloqueos suaves de las líneas. Queda regular al mover un vértice (vértices equidistantes del centro y lados iguales, restricciones ocultas).</li>
<li><b>Texto (T)</b>: toca donde va el punto de inserción; en el cuadro eliges la fuente.</li>
<li><b>Intersección (I)</b>: toca dos elementos (línea, arco, círculo o spline) para crear su punto de intersección con las relaciones correspondientes.</li>
<li><b>Recortar (X)</b>: mantén presionado y arrastra sobre los tramos que quieres quitar (entre los cruces con otros elementos). Un toque recorta un tramo. Solo se quita ese tramo: el resto del elemento no se divide en los demás cruces. Sin cruces, borra el elemento completo. No recorta splines ni elipses.</li>
<li><b>Extender (E)</b>: toca un segmento o arco cerca del extremo que quieres alargar; llega hasta el primer elemento que encuentre. Al extender de nuevo, el mismo extremo se desplaza al siguiente cruce (no deja puntos en los anteriores).</li>
<li>Deshacer, rehacer, borrar selección y ajustar vista están a la derecha de la barra.</li>
</ul></details>

<details><summary>Bloqueo suave e imán a intersecciones al dibujar líneas</summary>
<p>Al dibujar una línea, si el cursor queda cerca de una dirección notable, la línea se ajusta y se ve una guía punteada con una etiqueta:</p>
<ul>
<li><b>Horizontal, vertical y 45°</b> (cada 45°; el paso se puede cambiar en el panel Vista, por ejemplo a 15°): la etiqueta muestra H, V o el ángulo. H y V agregan su restricción; los demás ángulos no agregan ninguna.</li>
<li><b>Cerca de una línea existente</b> (a menos de unos 36 px del cursor): <b>paralela (∥)</b> o <b>perpendicular (⟂)</b> a ella, con la restricción correspondiente. Si la dirección bloqueada cruza una línea, un arco o un círculo cerca del cursor, la nueva línea <b>termina en ese cruce</b>, sobre ese elemento (la perpendicular termina en el pie de la perpendicular).</li>
<li><b>Cerca de un arco o círculo</b>: <b>tangente (T)</b>, con el extremo sobre la curva. También si empiezas en una curva.</li>
<li>Si empiezas en una línea o en su extremo, también da paralela y perpendicular a ella.</li>
<li><b>Restricciones automáticas</b>: si la línea queda horizontal, vertical, perpendicular, paralela o tangente por haber aceptado el bloqueo, se crea la restricción correspondiente con los elementos involucrados (el final que cae sobre una línea o curva queda sobre ella). Los 45° y demás ángulos intermedios no agregan restricción.</li>
<li>Un <b>punto existente</b> o una <b>intersección</b> cerca del cursor mandan sobre el bloqueo.</li>
</ul>
<p><b>Imán a intersecciones</b>: si el inicio o el final de la línea está cerca de la intersección de dos elementos (líneas, arcos, círculos o splines), la línea empieza o termina ahí (∩) y el punto queda sobre ambos. Con el cursor, hay que quedarse cerca unos milisegundos (por defecto 80, configurable en Vista; 0 = al instante); un toque o el inicio de un arrastre la toman al instante.</p>
<p>Si la restricción choca con las existentes, se quita y la línea queda tal cual. El bloqueo se apaga con <i>Bloqueo suave</i> en el panel Vista.</p></details>

<details><summary>Restricciones</summary>
<p>Selecciona los elementos y pulsa el botón. Cada botón indica qué selección necesita.</p>
<ul>
<li><b>Horizontal / Vertical</b>: líneas, o 2 puntos.</li>
<li><b>Paralela / Perpendicular</b>: 2 o más líneas.</li>
<li><b>Coincidente</b>: 2 o más puntos (quedan en el mismo lugar), o punto(s) y 1 línea, arco, círculo o spline (los puntos quedan sobre el elemento). <b>Colineal</b>: 2 o más líneas.</li>
<li><b>Punto medio</b>: 1 punto + 1 línea.</li>
<li><b>Concéntrica (◎)</b>: 2 o más círculos o arcos; el centro del primero manda y los demás centros coinciden con él. Si ya comparten el centro, avisa y no agrega nada.</li>
<li><b>Igual</b>: 2 líneas (igual longitud) o 2 círculos/arcos (igual radio).</li>
<li><b>Tangente</b>: línea + círculo/arco, 2 círculos/arcos, o un spline con una línea, círculo o arco.</li>
<li><b>Fijar / soltar</b>: puntos, líneas o círculos. Un punto fijo no se mueve al arrastrar.</li>
</ul>
<p><b>Numeración</b>: cada restricción lleva un número por tipo (H1, H2, ⟂1, ∥1, =1, ●1, T1...). Las que involucran varios elementos comparten un solo número y se rotulan junto a cada elemento (por ejemplo, dos líneas perpendiculares muestran ⟂1 cada una). El número no se reutiliza si borras la restricción. En el árbol de elementos cada restricción aparece con su número: tócala para seleccionarla junto con sus elementos y llevar el lienzo hasta ahí. Las restricciones automáticas que ponen un punto sobre un elemento al dibujar (●) no se rotulan.</p>
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
<p><b>Copias vinculadas</b> (opción "Vincular las copias al original", activa por defecto): cada punto de la copia queda atado a su original con restricciones automáticas, así que la copia es una réplica rígida que <b>sigue al original</b> si lo mueves, lo giras o cambias su tamaño. En la matriz lineal, la distancia y la dirección (el ángulo respecto de la línea elegida, o absoluta si no hay línea); en la circular, igual distancia al centro y el ángulo en el centro; en la copia espejo, simetría respecto del eje y, en los círculos, igual radio. <b>Las cotas de la matriz son opcionales</b> ("Mostrar las cotas"): la distancia entre el original y la primera copia en la lineal, y la cota angular en la circular. Con la opción desactivada, las copias son independientes y llevan solo sus restricciones internas.</p></details>

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
<li><b>Texto</b>: la <b>fuente</b> se elige al crearlo o en el panel (sistema, Helvetica/Arial, Times/Georgia, Courier/Menlo, Verdana, Palatino, Optima, Futura, American Typewriter y tres manuscritas; si el dispositivo no tiene una, se usa una genérica parecida). El punto de inserción es un punto real (se puede acotar, fijar o relacionar). Elige el punto de inserción en la caja, el ángulo, la altura, alinea con una línea y <i>Legible</i> (gira 180° el texto que quedaría boca abajo).</li>
<li><b>Estilo</b>: color, tipo de línea (continua, oculta, eje, fantasma, discontinua, punteada, traza y punto, o uno nuevo con su patrón) y grosor (fino, normal, grueso). Aplica a la selección y a lo nuevo.</li>
<li><b>Relleno / achurado</b>: sobre un contorno cerrado (líneas, arcos o círculo): líneas, cruzado o sólido, con ángulo, separación y opacidad.</li>
</ul></details>

<details><summary>Vista y árbol de elementos</summary>
<ul>
<li><b>Vista</b>: cuadrícula, imán (a la cuadrícula), bloqueo suave (y cada cuántos grados), tiempo del imán a intersecciones, mostrar u ocultar restricciones, puntos, cotas y textos, dedo dibuja, etiquetas del panel y escala de los trazos.</li>
<li><b>Árbol de elementos</b> (primer botón de la barra): lista líneas, círculos, arcos, splines, textos, rellenos, puntos y relaciones. Toca un elemento para seleccionarlo y ver sus puntos y restricciones.</li>
</ul></details>

<details><summary>Archivo y exportación</summary>
<ul>
<li><b>Guardar / Abrir</b>: el dibujo se guarda en un archivo .json (te pide el nombre). Además, la app recuerda el último dibujo <b>solo en este navegador</b>: guarda un .json para respaldar.</li>
<li><b>PNG</b>: imagen del dibujo. <b>SVG</b>: vectorial. <b>DXF</b>: para CAD (las cotas salen como geometría y texto).</li>
<li><b>SVG CUT</b> (corte láser): SVG a escala real en mm. Cada <i>clase de línea</i> (tipo, color y grosor) se manda a <b>Corte</b> (color de corte, rojo por defecto), <b>Marcado</b> (otro color, por ejemplo pliegues) u <b>Omitir</b>. Sale en dos grupos, "corte" y "marcado". No salen cotas, textos, puntos ni rellenos.</li>
</ul></details>

<details><summary>Atajos de teclado</summary>
<p>V seleccionar, P punto, L línea, K línea constructiva, C círculo, B rectángulo, G polígono, O elipse, Ctrl/Cmd+C copiar, Ctrl/Cmd+V pegar, R arco por centro, A arco por 3 puntos, S spline, T texto, I intersección, X recortar, E extender. Ctrl/Cmd+Z deshacer, Ctrl/Cmd+Y (o Ctrl/Cmd+Mayús+Z) rehacer, Supr o Retroceso borra, Esc cancela o termina.</p></details>

<details><summary>Historial de versiones</summary>
<p><b>v1.0.5</b>: línea de punto medio y restricción concéntrica entre círculos y arcos.</p>
<p><b>v1.0.4</b>: botones desplegables (Seleccionar con Filtrar, Línea con constructiva, Círculo con perimetral, Arco, Rectángulo), Copiar y Pegar, rectángulos, polígono regular, fuentes de texto y extensión sucesiva que desplaza el extremo.</p>
<p><b>v1.0.3</b>: restricciones numeradas y navegables desde el árbol, «Punto sobre» unificado en Coincidente, copias vinculadas con cotas opcionales (matrices y espejo), herramienta de elipse y recorte que no divide el resto del elemento.</p>
<p><b>v1.0.2</b>: el bloqueo suave vuelve a horizontal, vertical y 45° por defecto (el paso es configurable).</p>
<p><b>v1.0.1</b>: bloqueo suave que se mantiene cerca de otras líneas, con perpendicular, paralela y tangente al acercarse a elementos, y el imán a intersecciones.</p>
<p><b>v1.0.0</b>: primera versión numerada. Incluye dibujo paramétrico con restricciones y cotas (fórmulas, grados o radianes, ANSI), splines B-spline nativos de PlaneGCS, recortar, extender, dividir, matrices lineal y circular, copia espejo, bloqueo suave, selección con cuadro, árbol de elementos, exportación PNG, SVG, DXF y SVG CUT, y esta ayuda. El detalle está en <a href="https://github.com/oscampo/ipad-cad/blob/main/CHANGELOG.md" target="_blank" rel="noopener">CHANGELOG.md</a>.</p></details>

<details open><summary>Solver y créditos</summary>
<p>Las restricciones las resuelve <b>PlaneGCS</b>, el solver geométrico 2D del módulo <i>Sketcher</i> de <b>FreeCAD</b>, cuyo código original es de <b>Konstantinos Poulios</b> (© 2011, parte del proyecto FreeCAD, licencia LGPL).</p>
<p>La app lo usa compilado a WebAssembly mediante el paquete <b>@salusoft89/planegcs</b> (v1.3.0), un build wasm y envoltorio JavaScript de <b>Salusoft89</b>, con licencia LGPL-2.0-or-later: <a href="https://github.com/Salusoft89/planegcs" target="_blank" rel="noopener">github.com/Salusoft89/planegcs</a>. FreeCAD: <a href="https://www.freecad.org" target="_blank" rel="noopener">freecad.org</a>.</p>
<p>Los splines son <b>B-splines cúbicos nativos de PlaneGCS</b>: cada punto del spline queda sobre su nudo, los polos son incógnitas auxiliares del solver y la curva dibujada es la misma que resuelve el solver. El punto sobre spline (<code>point_on_bspline</code>) y las tangencias con líneas, círculos y arcos (<code>angle_via_point_and_param</code>) se resuelven de forma exacta. En los abiertos, la curvatura nula en los extremos se expresa con una restricción de punto medio entre polos.</p>
<p>Otros componentes: íconos <b>Lucide</b> (licencia ISC) y empaquetado con <b>Vite</b> (licencia MIT).</p></details>

<details><summary>Límites conocidos</summary>
<ul>
<li>Un spline o una elipse no se recortan ni se extienden; la elipse tampoco admite intersecciones ni tangencias.</li>
<li>Una tangencia con un spline puede no converger si el punto de contacto arranca muy lejos de la solución (la app lo arranca en el punto más cercano).</li>
<li>La división en partes iguales de arcos y círculos no deja restricción de igual ángulo.</li>
<li>Las cotas angulares de una matriz circular no se editan a mano (se rehace la matriz); la distancia de una matriz lineal sí.</li>
<li>Si el solver no converge o hay restricciones en conflicto, la acción se deshace con un aviso.</li>
</ul></details>
`;

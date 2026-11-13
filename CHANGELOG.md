# Historial de cambios

## Sin publicar

- **Recortar spline**: ya no multiplica los puntos de control. El trozo conserva los puntos originales que le quedan y agrega solo unos pocos junto al corte (un spline de 16 puntos pasa de 64 a unos 13), con desviación de forma menor a 0,05 % del tamaño.

## v1.6.0 (2026-11-13)

- **Reiniciar marcas**: cada marca guarda una referencia (su distancia sobre la línea desde el primer extremo, tomada al asignarla). El botón «Reiniciar marcas» del grupo Spline (con marcas seleccionadas, solo esas) y «Reiniciar» en las propiedades del punto las devuelven a ella, en cualquier lugar donde esté el mecanismo, para empezar de cero otra lectura. «Tomar la actual» redefine la referencia. Los archivos anteriores toman como referencia la posición al abrirlos.
- **Spline**: tocar la curva y arrastrar la mueve entera (antes no hacía nada). Arrastrar uno de sus puntos sigue cambiando su forma.
- **Marca de referencia**: un punto puede ser marca de una línea (propiedades del punto, «Marca de referencia en»). El solver no la mueve y, tras cada cambio, se proyecta sobre su línea: se desliza por ella arrastrada por la línea y recuerda lo recorrido, algo que una cota de posición no puede dar. Se dibuja como una x. Sirve para rieles, ruedas y planímetros; las copias la reasignan a la copia de su línea y si se borra la línea deja de ser marca. En el planímetro polar mide el área de un cuadrado con 2 a 4 % de error.

## v1.5.3 (2026-11-13)

- El texto de la magnitud de un vector queda **alineado con la línea** del vector por defecto.
- La **versión y su fecha** (`v1.5.3 2026-11-13`, en cursiva) se ven en la esquina inferior izquierda del dibujo, con el tamaño del texto de ayuda de abajo.
- Se quita el texto explicativo de las propiedades del vector (queda en la ayuda).
- **Propiedades del vector** (doble toque): «Magnitud» (valor o fórmula; escribirla fija la longitud), «Magnitud fija» (para volver a solo lectura) y «Nombre de la magnitud». Cambiar un nombre actualiza también las salidas `[=…]` de los textos.
- **Vector** (en el desplegable de Línea, tecla W): una línea con cabeza de flecha en el punto final y su magnitud como texto en el punto medio (inserción en el medio del lado superior, así queda centrada). La magnitud es una cota de solo lectura con nombre (D1...), usable en fórmulas y textos. Con una línea y uno de sus extremos (la cola) seleccionados, «Vector» la convierte; con un vector seleccionado, «Línea» lo convierte en línea. Se copian con su propio texto y magnitud, el borrado se lleva sus partes, y la flecha sale en SVG y DXF.
- **Salidas en textos**: `[=expresión]` en un texto muestra el valor de la expresión (`[=O1]`, `[=D1*D2]`, `[=A1/(2π)]`), con los nombres de las cotas y sus funciones. Se actualiza al cambiar el dibujo, y también en las exportaciones.

## v1.5.2 (2026-11-12)

- **Evolvente y otras salidas que leen una medida**: al resolver las fórmulas, los puntos que miden las cotas de solo lectura que ellas leen (las entradas) se dejan fijos. Antes, al fijar D1 = R·A1 el solver podía mover el punto tangente (que mide A1) en vez de alargar la cuerda, A1 cambiaba, la fórmula perseguía su propia cola y daba «D1 quedaría en -3.404». Si el dibujo necesita que la entrada se mueva (por ejemplo arrastrar la rueda por P), se reintenta sin fijarla. Con una comprobación de que la cota con fórmula se cumple de verdad.

## v1.5.1 (2026-11-12)

- **Arrastre con cotas que leen medidas, más robusto**: un salto grande del punto arrastrado se recorre en tramos cortos; si al girar otra cota el solver pierde el hilo, el punto arrastrado que ya llegó a su destino se deja fijo mientras se resuelve (así no se desliza), y si eso es imposible se vuelve al objetivo suave de siempre; si un cambio de golpe no se resuelve, se reintenta avanzando solo una fracción hacia el valor de las fórmulas.
- Ejemplo de la rueda que rueda sin deslizar gobernada por el punto de tangencia (diseño de Oscar): al arrastrar T, A1 = D1/r y P traza la cicloide en varias vueltas. Arrastrar P para gobernar era mal condicionado cerca del suelo.

## v1.5.0 (2026-11-12)

- **Cotas con nombre**: cada cota recibe un nombre automático por tipo (D distancia, A ángulo, R radio de arco, O diámetro de círculo; D1, A1...), visible en el árbol y en el diálogo de la cota (doble toque), donde se puede cambiar. Los dibujos viejos se numeran al abrirlos.
- **Fórmulas entre cotas**: el nombre de una cota se puede usar en la fórmula de otra (`D1*sin(3π/4)`, `D1/2+1`). Al cambiar una cota se recalculan en orden las que dependen de ella y se resuelve la geometría; ciclos, valores imposibles o referencias inexistentes se rechazan sin dejar cambios a medias. Un ángulo entra en la fórmula como radianes; las cotas de solo lectura no se pueden usar.
- Si se borra una cota de la que dependía otra, esa conserva su valor y pierde la fórmula (con aviso).
- **Ángulos sin límite**: las cotas angulares ya no se quedan entre 0° y 180°: 250° es un arco reflejo, 400° es una vuelta y 40°, y una cota angular de solo lectura sigue a la geometría sin saltar de 180° a 0° (mide siempre el equivalente más cercano al último valor). Se mide en el sentido en que se creó la cota; los dibujos viejos se actualizan cuando se edita o se mueve la cota a otro sector. En fórmulas el ángulo entra en radianes, también más allá de 2π. Con esto la rueda que rueda da varias vueltas y traza la cicloide completa.
- **Color de los puntos**: propiedad nueva en la ventana de propiedades de un punto (doble toque); solo se ve en pantalla.
- **Cotas de solo lectura en fórmulas**: una cota conductora puede leer una medida de la geometría. Se resuelve y recalcula en vueltas hasta que concuerden (secante, con repetición amortiguada de respaldo), al editar, crear y mientras se arrastra; si no se estabiliza se deshace y se avisa. Permite, por ejemplo, la rueda que rueda sin deslizar (D = r·A) y trazar la cicloide arrastrando un punto del borde.

## v1.4.2 (2026-11-12)

- **Lupa del dedo**: al tocar y sostener (unos 0,28 s sin mover) aparece un círculo con zoom 2x de lo que hay bajo el dedo, desplazado hacia arriba para no taparlo, con mira en el centro. Se desliza para afinar. Con «Dedo dibuja» activo funciona con cualquier herramienta; con «Dedo dibuja» apagado, en Selección: al soltar se selecciona lo que está bajo la mira.
- **Botón Capas** desacoplado de la barra: va en la esquina superior izquierda del dibujo, y cuando hay una capa actual su nombre aparece debajo.
- **Aro del cursor** (el circulito del lápiz o del ratón) también en Seleccionar, en la posición real del cursor.
- Con «Dedo dibuja» y Selección, sostener el dedo apunta con la lupa y al soltar selecciona; ya no arrastra ni arma un cuadro (el cuadro sigue saliendo al arrastrar de una vez desde un lugar vacío).
- **Botón Archivo** en la barra (entre el menú y la ayuda) con Nuevo, Guardar, Abrir, PNG, SVG, SVG para corte láser y DXF.
- **Botón Spline** ahora es un desplegable: Spline por puntos, Trazar punto, Borrar trayectoria, Trazado a spline, Cerrar o abrir y Equidistante. Trazado a spline y Equidistante piden el número de puntos o la distancia en una ventana.
- Se quitan del menú de herramientas las secciones «Spline y trazado» y «Archivo».
- **GitHub**: Archivo → Guardar en GitHub, Abrir de GitHub y Configurar GitHub. Guarda y abre los .json en un repositorio privado (API de contenidos, token de grano fino guardado solo en el navegador). Cada guardado es un commit; avisa antes de sobrescribir si el archivo cambió en GitHub desde la última vez que se abrió o guardó en ese dispositivo.
- **Safari/iPad**: se bloquea el zoom de la página por doble toque (touch-action en toda la interfaz) y por pellizco fuera del lienzo.

## v1.4.1 (2026-11-12)

- **Teléfono**: con el menú oculto, el lienzo ocupa todo el alto. Antes quedaba una franja vacía abajo (el 40% reservado al panel).

## v1.4.0 (2026-11-12)

- **Ventana de propiedades**: con doble toque sobre un punto, línea, círculo, arco, elipse, spline, texto o relleno se abre una ventana para cambiar su capa, color, tipo de línea, grosor, escala del patrón (texto: contenido, fuente, altura y ángulo; punto: X, Y y fijo), ver y quitar sus restricciones y cotas, y agregar las que se aplican a ese elemento solo. En una cota, el doble toque sigue editando su valor.
- **Capas**: botón Capas entre Pegar y Punto. Crear, renombrar, encender, apagar y borrar; por defecto no hay ninguna. Una capa nueva queda como capa actual y lo que se dibuja va en ella. Al apagarla se ocultan sus elementos, puntos, restricciones y cotas (no se seleccionan, no cortan al recortar o extender y no se exportan). Al borrarla, sus elementos pasan a «ninguna». Se guardan en el archivo .json.
- **Copiar y Pegar** en un solo botón desplegable. Tras copiar, el botón pasa a mostrar Pegar.

## v1.3.1 (2026-11-11)

- **Ayuda**: el atajo D de Acotar y la lista de límites conocidos quedan al día (ya se recortan y extienden elipses y splines).

## v1.3.0 (2026-11-11)

- **Herramienta Acotar** (tecla D) después de Texto, en lugar del botón de Intersección: elige sola la cota según la selección. 2 puntos o punto y línea: distancia; 2 líneas paralelas: distancia; 2 líneas no paralelas: ángulo; un arco: radio; un círculo: diámetro; arco o círculo con otro elemento: distancia hasta el centro. Si ya había selección, acota esa; si no, se toca elemento por elemento.
- **Distancia al centro** de un arco o círculo (desde un punto, una línea, otro arco o círculo, o una elipse), también desde el botón Distancia del panel.
- La intersección sigue disponible en el panel y con la tecla I.

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

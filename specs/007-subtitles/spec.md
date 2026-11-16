# Feature Specification: Subtítulos

**Feature Branch**: `007-subtitles`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "007 subtitles: subtítulos del vídeo, la última feature de la v1. El creador ya ha grabado y montado el vídeo a partir del guion aprobado (005) y tiene su paquete de publicación (006). La app le ayuda a obtener los subtítulos en español listos para subir a YouTube, partiendo del vídeo o audio final y del guion, y usa los tiempos reales para que los minutos de los capítulos del paquete (que en la 006 se estimaron desde el guion) pasen a ser los reales. Sin voz, imágenes ni edición de vídeo (fuera del alcance de la v1). La IA propone y el creador decide; todo editable y versionado."

## Contexto

La 006 termina cuando el creador tiene un **paquete de publicación**: títulos, miniatura, descripción, capítulos y
etiquetas. Después graba y monta el vídeo fuera de la app. Lo que falta para publicar son los **subtítulos**: los ve
quien mira sin sonido (la mayoría en el móvil, en el transporte o en el trabajo), quien no oye bien y quien no domina el
idioma. Los subtítulos automáticos de YouTube fallan en nombres propios, cifras y términos del nicho, y no tienen
puntuación cuidada.

Esta feature convierte el **audio o vídeo final** del creador en unos subtítulos en español listos para subir a YouTube
Studio. El reconocimiento de voz se hace **en el equipo del creador** (constitución, restricciones técnicas: `whisper.cpp`),
sin enviar el audio fuera y sin coste. El **guion aprobado** sirve de referencia para escribir bien los nombres, las
cifras y los términos que el reconocimiento entiende mal. Con los tiempos reales, la app propone los **minutos reales
de los capítulos**, que en la 006 eran una estimación hecha desde el guion.

La IA propone y el creador decide (principio II): cada subtítulo se puede editar, la versión anterior se puede recuperar
y nada cambia en el paquete sin que el creador lo acepte. La app no sube nada a YouTube (principio VIII): el creador
descarga el fichero y lo sube él.

La feature empieza en un guion aprobado de la 005 (con o sin paquete de la 006). Termina cuando el creador tiene unos
**subtítulos aprobados** descargados y, en un vídeo largo con paquete, los capítulos con sus minutos reales.

## Clarifications

### Session 2026-11-14

- Q: ¿Cuándo se obtiene el motor de reconocimiento y su modelo de voz? → A: La primera vez que el creador hace
  subtítulos, con aviso del tamaño y su confirmación; la instalación no cambia.
- Q: ¿La IA revisa además los subtítulos? → A: Sí, como propuesta: cambios marcados que el creador acepta o rechaza,
  gastando cupo, con el coste visible antes, como en la 005 y la 006.
- Q: ¿Se ofrecen traducidos a otros idiomas? → A: No: solo español en la v1; la traducción queda fuera.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Subtítulos del vídeo largo, listos para descargar (Priority: P1)

Con el guion aprobado, el creador pulsa «Hacer los subtítulos». La app le explica en una frase para qué sirven (mucha
gente mira sin sonido) y le pide el fichero final del vídeo o solo su audio. El creador lo elige. La app avisa de lo que
va a pasar: el audio se escucha en su equipo, no sale de él y no cuesta nada; tarda unos minutos y le dice cuántos más o
menos. Mientras trabaja, el creador ve el avance y puede seguir usando la app o cerrarla. Al terminar, ve el texto con
sus tiempos, troceado en subtítulos que se leen bien (pocas palabras por línea, sin cortar a mitad de una idea). Las
palabras que el reconocimiento no entendió bien y que el guion escribe de otra forma (un nombre, una cifra, un término)
aparecen corregidas según el guion y marcadas para que el creador las vea. El creador descarga el fichero de subtítulos.

**Why this priority**: Es lo que pide la v1 (principio VIII) y lo único que el creador no puede hacer bien en otra parte
sin pagar: los automáticos de YouTube fallan justo en lo que más importa del nicho.

**Independent Test**: Con un audio de prueba corto y su guion aprobado, y el reconocimiento sustituido por uno falso
determinista, el creador elige el fichero, ve el avance, recibe los subtítulos troceados con sus tiempos, ve marcada
una corrección hecha desde el guion y descarga un fichero que YouTube acepta.

**Acceptance Scenarios**:

1. **Given** un guion largo aprobado sin subtítulos, **When** el creador abre sus subtítulos, **Then** ve una frase que
   explica para qué sirven, qué fichero necesita y que el audio no sale de su equipo.
2. **Given** el fichero final del vídeo, **When** el creador lo elige, **Then** la app le dice cuánto tardará más o
   menos y que no cuesta dinero, y empieza solo cuando él lo confirma.
3. **Given** el reconocimiento en marcha, **When** el creador recarga la página, cierra la pestaña o sale a otra parte
   de la app, **Then** el trabajo sigue y, al volver, ve el avance o el resultado.
4. **Given** el reconocimiento terminado, **When** el creador ve el resultado, **Then** cada subtítulo tiene inicio,
   fin y texto, ninguno pasa de los límites de lectura (líneas, caracteres por línea, velocidad de lectura) y no se
   solapan.
5. **Given** una palabra que el reconocimiento escribió distinta de como la escribe el guion en ese mismo momento,
   **When** el creador ve los subtítulos, **Then** aparece la forma del guion, marcada, con la que se oyó al lado.
6. **Given** los subtítulos, **When** el creador pulsa «Descargar», **Then** obtiene un fichero en un formato que
   YouTube Studio acepta, con el nombre del vídeo.

**Qué podrá hacer el creador**: Partiendo de un guion largo aprobado y del fichero final de su vídeo o de su audio,
obtener unos subtítulos en español con sus tiempos y descargarlos. Necesita el fichero y el motor de reconocimiento
instalado; no necesita IA, conexión ni saldo para esta historia.

**Resultado observable**: La pantalla de subtítulos con el texto troceado y sus tiempos; las correcciones desde el guion
marcadas; un fichero de subtítulos descargado; los subtítulos guardados y versionados (versión 1).

**Qué debe respetar**: II (propuesta editable), III (sin coste: el reconocimiento es local), VII (el audio no sale del
equipo; los datos se exportan en formatos abiertos), I (sin jerga: nada de «transcripción», «modelo» ni formatos en la
interfaz salvo en «Modo experto»), IV (el reconocimiento se invoca a través de un adaptador, nunca desde el dominio). No
rompe la 005 ni la 006: el guion y el paquete no cambian en esta historia (tests de regresión de guion y paquete).

**Cómo se demuestra**: Tests de dominio del troceado (límites de lectura, sin solapes, sin cortar a mitad de una idea) y
de las correcciones desde el guion; test de contrato del adaptador de reconocimiento con un falso determinista; test del
fichero descargado contra el formato; e2e con axe a 375 y 1280 px en claro y oscuro; evidencia en
`checklists/validation.md`, sección US1.

**Huecos abiertos**: ninguno.

---

### User Story 2 - Revisar, corregir y aprobar (Priority: P1)

El creador repasa los subtítulos mientras escucha el audio. Si quiere, pide a la IA una revisión de puntuación,
mayúsculas y errores que el guion no cubre, y acepta o rechaza cada cambio que propone. Puede cambiar el texto de cualquiera, partir uno en dos,
juntar dos seguidos y mover un poco su inicio o su fin. Si una palabra se repite mal en todo el vídeo (el nombre de su
canal, por ejemplo), la cambia de una vez en todos. Ve de un vistazo los subtítulos que conviene mirar: correcciones
desde el guion, trozos que el reconocimiento entendió con poca seguridad, los que se leen demasiado rápido. Cada cambio
guardado es una versión nueva y puede volver a cualquiera anterior. Cuando está conforme, los aprueba.

**Why this priority**: Unos subtítulos con errores en el nombre del canal o en una cifra quedan peor que no tenerlos. El
creador tiene que poder dejarlos bien sin salir de la app.

**Independent Test**: Con subtítulos ya hechos con el reconocimiento falso, el creador oye un trozo, edita un texto,
parte un subtítulo, junta dos, cambia una palabra en todos, vuelve a la versión anterior, la recupera y aprueba; al
recargar, siguen aprobados con su historial.

**Acceptance Scenarios**:

1. **Given** unos subtítulos, **When** el creador pulsa en uno, **Then** puede oír ese trozo del audio y editar su
   texto, su inicio y su fin.
2. **Given** un cambio que dejaría dos subtítulos solapados o uno por encima de los límites de lectura, **When** el
   creador lo guarda, **Then** la app lo guarda y lo marca con un aviso en llano, sin bloquearlo.
3. **Given** una palabra que aparece en varios subtítulos, **When** el creador la cambia en todos, **Then** la app le
   dice cuántos cambia antes de hacerlo y los cambia en una sola versión nueva.
4. **Given** varias versiones, **When** el creador vuelve a una anterior, **Then** esa pasa a ser una versión nueva y
   ninguna se pierde.
5. **Given** unos subtítulos aprobados, **When** el creador edita uno o vuelve a una versión, **Then** la app le avisa
   antes de que vuelven a borrador y tendrá que aprobarlos otra vez.
6. **Given** unos subtítulos, **When** el creador pide la revisión de la IA, **Then** ve antes el coste y, al terminar,
   los cambios propuestos marcados con el texto anterior al lado; acepta unos, rechaza otros y lo aceptado es una
   versión nueva, con los tiempos intactos.
7. **Given** los subtítulos, **When** el creador filtra «Para revisar», **Then** ve solo los marcados (correcciones,
   poca seguridad, lectura rápida) y el número que queda.

**Qué podrá hacer el creador**: Repasar los subtítulos oyendo cada trozo, corregirlos uno a uno o en bloque, pedir la
revisión de la IA, volver a versiones anteriores y aprobarlos. Necesita subtítulos hechos (US1); para la revisión de la
IA, la conexión de la 002.

**Resultado observable**: Subtítulos editados y aprobados; su historial de versiones; el filtro «Para revisar» con su
número; el aviso al volver a borrador.

**Qué debe respetar**: II (todo editable y versionado, nada se pierde; la IA solo propone), III y IV (coste visible
antes, límites de gasto, fallos tipados de la IA), I (avisos en llano, una acción principal por
pantalla), VI (teclado y lector de pantalla para oír, editar y moverse entre subtítulos; `prefers-reduced-motion`).

**Cómo se demuestra**: Tests de dominio de partir, juntar, mover tiempos y cambiar en todos; tests de versiones y de
vuelta a borrador; tests de la revisión de la IA con el proveedor falso (salida validada, tiempos intactos, los cinco
fallos tipados); e2e con teclado y axe en claro y oscuro a 375 y 1280 px; evidencia en `checklists/validation.md`,
sección US2.

**Huecos abiertos**: ninguno.

---

### User Story 3 - Los minutos reales de los capítulos (Priority: P2)

En un vídeo largo con paquete, cuando los subtítulos están hechos, la app compara dónde empieza de verdad cada bloque del
guion en el audio con el minuto estimado de su capítulo. Si alguno cambia, le propone al creador los minutos reales, con
el antes y el después de cada capítulo. El creador los acepta todos, algunos o ninguno, o escribe un minuto a mano.
Los aceptados entran en el paquete como una versión nueva de los capítulos, que dejan de estar marcados como estimación.

**Why this priority**: Un capítulo con el minuto equivocado lleva a la gente a otro sitio y YouTube puede no mostrarlos.
Es lo que la 006 dejó pendiente para cuando hubiera audio, pero los subtítulos sirven aunque no se haga.

**Independent Test**: Con un paquete aprobado cuyos capítulos están estimados y unos subtítulos falsos donde el tercer
bloque empieza 40 segundos más tarde, el creador ve la propuesta, acepta ese capítulo, ve el paquete en borrador con
el minuto nuevo y lo vuelve a aprobar.

**Acceptance Scenarios**:

1. **Given** un paquete con capítulos estimados y subtítulos hechos, **When** el creador abre los capítulos reales,
   **Then** ve cada capítulo con su minuto estimado, el real y la diferencia.
2. **Given** un capítulo escrito a mano por el creador en la 006, **When** la app propone los minutos reales, **Then**
   lo muestra pero no lo marca para cambiar salvo que el creador lo elija.
3. **Given** un bloque del guion que no se encuentra en el audio (se cortó en el montaje), **When** se proponen los
   minutos, **Then** su capítulo aparece como «no encontrado», sin minuto propuesto, y el creador decide si lo quita o
   le pone uno a mano.
4. **Given** minutos aceptados en un paquete aprobado, **When** se guardan, **Then** la app avisa antes de que el
   paquete vuelve a borrador (FR-015 de la 006) y los capítulos quedan como versión nueva, sin marca de estimación.
5. **Given** minutos reales que dejarían un capítulo por debajo de lo que YouTube exige, **When** se proponen, **Then**
   la revisión del paquete de la 006 lo avisa como cualquier otro capítulo.

**Qué podrá hacer el creador**: Llevar al paquete los minutos reales de los capítulos, eligiendo cuáles. Necesita un
vídeo largo con paquete (006) y subtítulos hechos (US1).

**Resultado observable**: La comparación estimado/real por capítulo; los capítulos del paquete en una versión nueva,
sin marca de estimación; el paquete en borrador con su aviso.

**Qué debe respetar**: II (el creador elige; nada cambia en el paquete sin aceptarlo), contratos de la 006 (capítulos
ligados a bloques, reglas de revisión, vuelta a borrador de FR-015): sus tests de regresión siguen pasando.

**Cómo se demuestra**: Tests de dominio de la localización de bloques en el audio (encontrado, no encontrado, orden);
test de contrato de la versión nueva de capítulos; e2e de aceptar parte de la propuesta; evidencia en
`checklists/validation.md`, sección US3.

**Huecos abiertos**: ninguno.

---

### User Story 4 - Subtítulos de un Short (Priority: P2)

Con un guion de Short aprobado, el creador hace sus subtítulos igual que los de un vídeo largo. La app tiene en cuenta
que un Short se ve en vertical y deprisa: subtítulos más cortos y de una línea. No hay capítulos.

**Why this priority**: Los Shorts se ven casi siempre sin sonido al empezar; el camino es el mismo que el del vídeo
largo, con otros límites.

**Independent Test**: Con un audio de Short de prueba y el reconocimiento falso, el creador obtiene subtítulos de una
línea dentro de los límites del Short, sin propuesta de capítulos, y los descarga.

**Acceptance Scenarios**:

1. **Given** un guion de Short aprobado, **When** el creador hace sus subtítulos, **Then** cada uno cumple los límites
   del Short y la app no le habla de capítulos.
2. **Given** un fichero que dura más de lo que YouTube permite en un Short, **When** el creador lo elige, **Then** la
   app le avisa antes de empezar y le deja seguir o cambiar el fichero.

**Qué podrá hacer el creador**: Hacer, revisar, aprobar y descargar los subtítulos de un Short. Necesita un guion de
Short aprobado y su fichero.

**Resultado observable**: Subtítulos de Short aprobados y descargados, sin capítulos.

**Qué debe respetar**: Lo mismo que US1 y US2; la duración máxima de un Short sale del conocimiento de la 005.

**Cómo se demuestra**: Tests de dominio del troceado con los límites del Short; e2e del Short; evidencia en
`checklists/validation.md`, sección US4.

**Huecos abiertos**: ninguno.

---

### User Story 5 - Volver a hacerlos con otro montaje (Priority: P3)

El creador cambia el montaje después de hacer los subtítulos (quita un trozo, cambia el orden). Elige el fichero nuevo
y la app hace los subtítulos otra vez como una versión nueva, sin perder las anteriores. Si había corregido palabras en
todos los subtítulos, la app le ofrece aplicar esas mismas correcciones a los nuevos.

**Why this priority**: Pasa a menudo y rehacer a mano todas las correcciones cansa; pero el camino básico ya funciona
sin esto.

**Independent Test**: Con subtítulos aprobados y una corrección hecha en todos, el creador elige otro fichero, recibe
una versión nueva, acepta aplicar la corrección y ve la versión anterior intacta en el historial.

**Acceptance Scenarios**:

1. **Given** unos subtítulos, **When** el creador elige otro fichero, **Then** la app le avisa de que se hará una
   versión nueva y de que la anterior se conserva.
2. **Given** correcciones hechas en todos los subtítulos de la versión anterior, **When** termina el nuevo
   reconocimiento, **Then** la app ofrece aplicarlas y dice cuántos subtítulos cambian.

**Qué podrá hacer el creador**: Rehacer los subtítulos con otro montaje y recuperar sus correcciones. Necesita
subtítulos anteriores.

**Resultado observable**: Una versión nueva hecha desde el fichero nuevo; las correcciones aplicadas si las acepta; el
historial completo.

**Qué debe respetar**: II (nada se pierde), US3 (si los capítulos ya tenían minutos reales, se vuelven a proponer).

**Cómo se demuestra**: Tests de dominio de reaplicar correcciones; e2e del segundo fichero; evidencia en
`checklists/validation.md`, sección US5.

**Huecos abiertos**: ninguno.

---

### Edge Cases

- **Fichero sin audio, con el audio vacío o que no se puede leer**: la app lo dice en llano antes de empezar, sin
  gastar tiempo en el reconocimiento.
- **Formato no admitido**: la app dice qué formatos acepta y cómo sacar el audio del editor de vídeo.
- **Fichero muy grande**: la app lo admite hasta el límite que fije el plan; por encima, pide solo el audio.
- **Audio en otro idioma o casi sin voz** (solo música): el resultado se marca entero «para revisar» y la app avisa de
  que el reconocimiento entendió poco.
- **El creador improvisa o se salta trozos del guion**: los subtítulos siguen lo que dice el audio, no el guion; el
  guion solo corrige la forma de escribir palabras que se oyen en el mismo sitio.
- **El reconocimiento se corta** (equipo apagado, app cerrada, sin disco): al volver, el trabajo consta como fallido
  con su motivo y se puede repetir; no queda una versión a medias.
- **El creador cancela**: el trabajo se para y no se crea versión.
- **Dos reconocimientos a la vez**: la app hace uno cada vez y deja el segundo esperando, con su aviso.
- **El guion se reabre después** (vuelve a borrador en la 005): los subtítulos se conservan y avisan de que el guion
  cambió; las correcciones desde el guion nuevas solo se aplican si el creador rehace los subtítulos.
- **Vídeo largo sin paquete**: los subtítulos se hacen igual; los minutos reales de los capítulos no aparecen.
- **Bloques del guion en otro orden en el montaje**: cada capítulo se busca en el audio por su contenido; si el orden
  real cambia, la propuesta lo dice y el creador decide.
- **Equipo lento o VPS pequeño**: la estimación de tiempo lo refleja y la app lo dice antes de empezar.
- **Motor de reconocimiento no instalado o roto**: la app lo dice en llano con un botón para instalarlo o repararlo.

## Requirements *(mandatory)*

### Functional Requirements

**Obtener los subtítulos**

- **FR-001**: Desde un guion aprobado (largo o Short), el creador DEBE poder hacer sus subtítulos eligiendo el fichero
  final del vídeo o solo su audio, en los formatos habituales de los editores de vídeo.
- **FR-002**: El reconocimiento de voz DEBE hacerse en el equipo donde corre la app, sin enviar el audio fuera y sin
  coste. El motor y su modelo de voz en español se descargan la primera vez que el creador hace subtítulos, una sola vez,
  diciendo antes cuánto ocupan y con su confirmación; la instalación de la 002 no cambia. Si la descarga se corta, se
  puede retomar.
- **FR-003**: Antes de empezar, la app DEBE decir cuánto tardará aproximadamente en ese equipo, que no cuesta dinero y
  que el audio no sale de él, y empezar solo con la confirmación del creador.
- **FR-004**: El reconocimiento DEBE seguir aunque el creador recargue, cierre la pestaña o cambie de pantalla, mostrar
  su avance al volver y poder cancelarse. Si falla, DEBE constar como fallido con un motivo en llano y poder repetirse,
  sin dejar una versión a medias.
- **FR-005**: El resultado DEBE trocearse en subtítulos que respeten los límites de lectura del conocimiento versionado
  (líneas por subtítulo, caracteres por línea, velocidad de lectura, duración mínima y máxima, separación entre
  subtítulos), distintos para vídeo largo y Short, sin solapes y sin cortar a mitad de una idea cuando haya otra forma.
- **FR-006**: Cuando el reconocimiento escribe una palabra de otra forma que el guion en el mismo momento del discurso
  (nombres propios, cifras, términos), la app DEBE proponer la forma del guion, marcarla y conservar la que se oyó para
  que el creador pueda elegir. Lo que el creador dijo y el guion no tiene NO DEBE sustituirse por el guion.
- **FR-007**: El creador DEBE poder descargar los subtítulos en un formato que YouTube Studio acepta para subirlos, con
  el nombre del vídeo. En «Modo experto», también en los otros formatos de subtítulos que YouTube admite.

**Revisar y aprobar**

- **FR-008**: El creador DEBE poder oír el trozo de audio de cada subtítulo y editar su texto, su inicio y su fin,
  partirlo en dos y juntar dos seguidos.
- **FR-009**: El creador DEBE poder cambiar una palabra o expresión en todos los subtítulos de una vez, viendo antes
  cuántos cambian.
- **FR-010**: La app DEBE marcar «para revisar» los subtítulos con correcciones desde el guion, los que el
  reconocimiento entendió con poca seguridad y los que pasan de los límites de lectura, y ofrecer un filtro con su
  número. Un aviso NO DEBE impedir guardar ni aprobar.
- **FR-011**: El creador DEBE poder pedir a la IA una revisión de los subtítulos (puntuación, mayúsculas y errores que
  el guion no cubre). La IA propone cambios marcados, subtítulo a subtítulo, que el creador acepta o rechaza uno a uno o
  todos; nada cambia sin aceptarlo, y lo aceptado es una versión nueva. Antes de pedirla, la app DEBE mostrar el coste
  (cupo o dinero) como en la 005 y la 006, y respetar los límites de gasto. La IA NO DEBE cambiar los tiempos ni
  reescribir lo que el creador dijo: solo corrige cómo se escribe.
- **FR-012**: Cada cambio guardado DEBE crear una versión nueva de los subtítulos; el creador DEBE poder ver el historial
  y volver a cualquier versión, que pasa a ser una versión nueva. Ninguna se pierde.
- **FR-013**: El creador DEBE poder aprobar los subtítulos. Editar o recuperar una versión de unos subtítulos aprobados
  DEBE devolverlos a borrador, avisando antes.

**Capítulos reales**

- **FR-014**: En un vídeo largo con paquete, la app DEBE localizar en el audio dónde empieza cada bloque del guion ligado
  a un capítulo y proponer su minuto real, con el estimado al lado y la diferencia. Un bloque que no aparece consta
  como «no encontrado», sin minuto propuesto.
- **FR-015**: El creador DEBE poder aceptar todos los minutos, algunos o ninguno, o escribir uno a mano. Un capítulo
  escrito a mano en la 006 NO DEBE marcarse para cambiar salvo que el creador lo elija.
- **FR-016**: Los minutos aceptados DEBEN guardarse como una versión nueva de los capítulos del paquete, sin marca de
  estimación, y seguir las reglas de la 006: revisión de capítulos y vuelta a borrador de un paquete aprobado.

**Otro montaje**

- **FR-017**: Elegir otro fichero DEBE crear una versión nueva de los subtítulos, conservando las anteriores, y ofrecer
  reaplicar las correcciones en bloque (FR-009) de la versión anterior. Si los capítulos tenían minutos reales, se
  vuelven a proponer.

**Transversales**

- **FR-018**: La app NO DEBE subir nada a YouTube ni modificar el vídeo: no quema subtítulos en la imagen, no corta ni
  monta (principio VIII).
- **FR-019**: La app NO DEBE guardar una copia del vídeo del creador. Conserva lo que hace falta para revisar (el audio
  del vídeo, para oír cada trozo) dentro de la carpeta de trabajo del canal y el creador DEBE poder borrarlo desde la
  app sin perder los subtítulos.
- **FR-020**: Los subtítulos DEBEN poder exportarse con el resto de datos del canal en formatos abiertos, legibles sin
  la app (principio VII).
- **FR-021**: Los subtítulos DEBEN estar en el idioma del vídeo, español en la v1. La traducción a otros idiomas queda
  fuera de la v1 (YouTube traduce automáticamente los subtítulos subidos).
- **FR-022**: Todos los textos de la interfaz DEBEN estar en español llano, sin jerga técnica (glosario), en catálogos
  de textos, y cada paso DEBE explicar por qué importa.
- **FR-023**: Desde el guion aprobado y desde su paquete DEBE haber un camino visible a sus subtítulos, con su estado
  (sin hacer, en marcha, en borrador, aprobados).

### Key Entities

- **Fichero de origen**: el vídeo o audio final que el creador elige; la app solo guarda su nombre, su duración y el
  audio que necesita para revisar (FR-019).
- **Trabajo de reconocimiento**: escucha un fichero de origen para un guion; tiene estado (en cola, en curso, hecho,
  fallido, cancelado), avance y motivo de fallo.
- **Subtítulos**: los de un guion; una lista ordenada de subtítulos con inicio, fin, texto y marcas («corregido desde el
  guion» con la forma oída, «poca seguridad», «lectura rápida»); versionados y con estado (borrador o aprobados).
- **Corrección en bloque**: un cambio de una palabra o expresión por otra en todos los subtítulos, que se puede reaplicar
  a una versión nueva.
- **Propuesta de minutos reales**: por capítulo del paquete, el minuto estimado, el real (o «no encontrado») y si el
  creador lo acepta; al aceptarla, crea una versión de los capítulos de la 006.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con un vídeo largo de 10 minutos en un portátil corriente, el creador tiene unos subtítulos listos para
  revisar en menos de 15 minutos desde que elige el fichero.
- **SC-002**: El 100 % de los subtítulos propuestos cumple los límites de lectura del conocimiento versionado y ninguno se
  solapa con otro.
- **SC-003**: El fichero descargado lo acepta YouTube Studio a la primera en el 100 % de las pruebas con vídeos reales.
- **SC-004**: En las pruebas con guion conocido, el 100 % de las palabras que el guion escribe de otra forma en el mismo
  momento aparecen corregidas y marcadas, y ninguna frase improvisada se sustituye por texto del guion.
- **SC-005**: Los minutos reales propuestos para los capítulos se quedan a 2 segundos o menos del inicio real del bloque
  en el audio en el 95 % de los capítulos.
- **SC-006**: Hacer los subtítulos no cuesta dinero aparte: el reconocimiento no consume ni saldo ni cupo de la IA; solo
  la revisión de la IA, si el creador la pide, gasta cupo, y su coste se ve antes.
- **SC-007**: Un creador sin experiencia hace, revisa, aprueba y descarga sus subtítulos sin ayuda: la auditoría de
  novato da 0 graves y como mucho 3 medios.

## Assumptions

- El guion llega aprobado de la 005; el paquete de la 006 es opcional y solo hace falta para los capítulos reales.
- El creador graba y monta fuera de la app y tiene el fichero final en el equipo donde abre la app (en un VPS, lo sube
  desde el navegador).
- El reconocimiento local usa `whisper.cpp`, el binario externo que fija la constitución, a través de un adaptador, igual
  que `yt-dlp` en la 003. La calidad y la velocidad dependen del equipo; el modelo por defecto se elige para que un
  portátil corriente cumpla SC-001, y en «Modo experto» se puede elegir otro.
- Los límites de lectura de subtítulos (líneas, caracteres por línea, velocidad de lectura, duraciones) y los formatos
  que acepta YouTube se toman de la ayuda oficial de YouTube y de guías de subtitulado reconocidas, y se guardan en el
  conocimiento versionado con fuente y fecha de revisión.
- El fichero que se descarga por defecto es SRT, el formato más extendido que YouTube Studio acepta.
- Los subtítulos los sube el creador en YouTube Studio; la app no los quema en el vídeo (fuera de la v1: montaje).
- Un guion tiene unos solos subtítulos (con su historial de versiones).
- La IA es la de la 002 (suscripción de Claude o API de Anthropic) y solo se usa en la revisión que pide el creador
  (FR-011).
- El modelo de voz se descarga de su origen oficial, con versión fijada y comprobación de integridad, como `yt-dlp` en
  la instalación.

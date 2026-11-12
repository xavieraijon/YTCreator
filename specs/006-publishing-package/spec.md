# Feature Specification: Paquete de publicación

**Feature Branch**: `006-publishing-package`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "006 publishing-package: paquete de publicación a partir de un guion aprobado (salida de la 005), dentro del alcance v1 de la constitución (principio VIII): títulos, brief de miniatura (descripción para que el creador o un diseñador la haga; sin generar imágenes), descripción, capítulos y etiquetas, para vídeo largo y Short. La IA propone y el creador aprueba, edita, regenera con indicaciones y vuelve a versiones anteriores. Termina con un paquete listo para copiar en YouTube Studio a mano (sin subida automática). Es la entrada de la 007 (subtítulos)."

## Clarifications

### Session 2026-11-12

- Q: ¿Qué se hace con los minutos de los capítulos, si antes de grabar solo hay estimación? → A: Las dos cosas: ahora se
  estiman con el guion, editables y marcados como estimación; cuando la 007 tenga el audio, propondrá los minutos reales.
- Q: ¿El paquete lleva algo más que las cinco piezas de la constitución? → A: Sí: el comentario fijado y una lista guiada
  de los ajustes de YouTube Studio (público infantil, contenido alterado o sintético, idioma, categoría). TikTok y Reels
  quedan fuera.
- Q: ¿Los títulos se contrastan con datos reales de YouTube? → A: No: se usa solo lo que ya se midió de la idea en la 004,
  sin llamadas nuevas ni coste de cuota.

## Contexto

La 005 termina cuando el creador tiene un **guion aprobado**: sabe qué dice su vídeo y en qué orden. Ahora la pregunta
es otra: **por qué alguien va a pulsar** en ese vídeo entre todos los que YouTube le enseña, y qué encuentra cuando lo
hace. El título y la miniatura deciden si se hace clic; la descripción, los capítulos y las etiquetas ayudan a que lo
encuentren y a que se quede.

Esta feature convierte un guion aprobado en un **paquete de publicación**: los títulos, el brief de la miniatura, la
descripción, los capítulos y las etiquetas, listos para copiar en YouTube Studio. La IA propone y el creador decide
(principio II): cada pieza se puede editar a mano, pedir de nuevo con indicaciones y devolver a una versión anterior.
La app no sube nada ni crea imágenes (principio VIII): el creador copia el paquete en YouTube Studio y hace la miniatura
él mismo o se la encarga a alguien con el brief.

La feature empieza en un guion aprobado de la 005, donde hoy la idea muestra «guion listo». Termina cuando el creador
tiene un **paquete aprobado**, que es lo que usará la 007 (subtítulos).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Título y miniatura que hacen pulsar (Priority: P1)

Con el guion aprobado, el creador pulsa «Preparar la publicación». La app le explica en una frase que el título y la
miniatura se leen juntos y deciden si alguien pulsa. La IA lee el guion, la idea y el perfil del canal y propone varios
títulos, cada uno con el motivo por el que funciona (curiosidad, cifra concreta, promesa clara) y sin prometer nada que
el vídeo no cumpla. El creador elige uno como principal y, si quiere, hasta dos más para que YouTube los pruebe. Después
la IA propone conceptos de miniatura que completan el título sin repetirlo: qué se ve, el texto grande (pocas palabras),
la expresión o emoción, la composición y el contraste de color. El creador elige, edita y aprueba.

**Why this priority**: Sin clic no hay vídeo: un buen guion con un título flojo no lo ve nadie. Es la pieza que más
cambia los resultados y la que más cuesta a un creador novato.

**Independent Test**: Con un proveedor de IA falso y un guion aprobado, el creador ve el coste, recibe títulos con su
motivo, elige un principal y dos alternativos, recibe conceptos de miniatura, edita uno, aprueba y, al recargar, sigue
aprobado.

**Acceptance Scenarios**:

1. **Given** un guion aprobado, **When** el creador abre su publicación, **Then** ve el título de trabajo de la idea,
   el gancho del guion y una frase que explica por qué importan el título y la miniatura.
2. **Given** esa pantalla, **When** pulsa «Proponer títulos», **Then** ve antes el coste estimado y, al confirmar, entre
   5 y 8 títulos, cada uno con su motivo y su número de caracteres.
3. **Given** los títulos, **When** elige uno como principal y hasta dos como alternativos, **Then** quedan guardados en
   ese orden; un título que se corta en la pantalla del móvil o pasa del máximo de YouTube lleva un aviso.
4. **Given** un título principal, **When** pulsa «Proponer miniaturas», **Then** ve el coste y, al confirmar, 3 conceptos
   de miniatura, cada uno con qué se ve, el texto grande, la emoción, la composición y los colores, y con qué título casa.
5. **Given** un concepto, **When** el creador lo edita o pide otro con indicaciones («sin cara, solo el objeto»),
   **Then** el cambio se guarda como una versión nueva y la anterior sigue disponible.
6. **Given** títulos y miniaturas elegidos, **When** los aprueba, **Then** quedan aprobados y la acción principal pasa a
   ser la descripción.
7. **Given** un canal sin guiones aprobados, **When** el creador abre las publicaciones, **Then** la app le explica que
   primero hay que aprobar un guion y le lleva a sus guiones.

**Qué podrá hacer el creador**: Obtener, elegir, editar y aprobar los títulos y el brief de miniatura de un guion
aprobado. Necesita la IA configurada en la 002. Editar a mano no necesita IA ni conexión.

**Resultado observable**: Un título principal, hasta dos alternativos y uno a tres conceptos de miniatura elegidos,
guardados, versionados y en estado «aprobado» tras reiniciar la app.

**Qué debe respetar**: Principios I (una acción principal, por qué importa, sin jerga), II (aprobar, editar, regenerar,
versiones), III (coste antes de cada propuesta), IV (salida validada, fallos tipados) y VIII (no se generan imágenes).
Regresión: el guion aprobado y los estados de la 005 no cambian; sus tests siguen en verde.

**Cómo se demuestra**: Tests de dominio de longitudes y elección; test de la salida de la IA con proveedor falso; e2e con
teclado; axe en claro y oscuro a 375 y 1280 px. Evidencia en la sección «US1» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 2 - Descripción, capítulos y etiquetas (Priority: P1)

Con el título aprobado, la IA propone la descripción: dos primeras líneas que dicen de qué va el vídeo con las palabras
que la gente busca (es lo único que se ve sin desplegar), un cuerpo breve, los capítulos, las fuentes que respaldan los
hechos del guion y la parte fija del canal (sus enlaces, su coletilla, avisos). Los capítulos salen de los bloques del
guion, con un nombre que da ganas de verlos y su minuto. Las etiquetas salen del guion, de la idea y del perfil, con las
búsquedas del público. El creador lo edita todo, pide de nuevo cualquier pieza con indicaciones y aprueba.

**Why this priority**: Es lo que se pega en YouTube Studio en cada vídeo. Hacerlo a mano cuesta tiempo y se olvidan
cosas: los capítulos, las fuentes o el enlace de suscripción.

**Independent Test**: Con un proveedor de IA falso, un guion aprobado con lista de hechos y un título aprobado, el
creador genera la descripción, ve los capítulos con su minuto, ve las fuentes, edita un capítulo, pide de nuevo las
etiquetas sin que cambie la descripción y aprueba.

**Acceptance Scenarios**:

1. **Given** un título aprobado, **When** pulsa «Proponer descripción», **Then** ve el coste y, al confirmar, una
   descripción con primeras líneas, cuerpo, capítulos, fuentes y la parte fija del canal, y una lista de etiquetas.
2. **Given** un guion con N bloques, **When** se proponen los capítulos, **Then** el primero empieza en 0:00, cada uno
   tiene nombre y minuto, y los minutos salen de la duración de los bloques del guion, marcados como estimación y
   editables a mano; la pantalla dice que la 007 podrá ajustarlos con el audio real.
3. **Given** un guion con hechos que tienen enlaces, **When** se propone la descripción, **Then** el apartado de fuentes
   lleva esos enlaces; la IA no añade ninguno que no esté en la lista de hechos.
4. **Given** la descripción, **When** el creador edita una parte o pide de nuevo solo los capítulos o solo las
   etiquetas, **Then** solo esa parte cambia y sus ediciones a mano en el resto siguen intactas.
5. **Given** un canal sin parte fija, **When** se escribe su primera descripción, **Then** la app usa una por defecto
   (el enlace de suscripción del canal), dice dónde cambiarla, y los cambios no alteran las descripciones ya aprobadas.
6. **Given** la descripción y las etiquetas, **When** las aprueba, **Then** quedan aprobadas.

**Qué podrá hacer el creador**: Obtener, editar y aprobar la descripción, los capítulos y las etiquetas, y fijar la
parte de la descripción que se repite en todos sus vídeos. Necesita la IA configurada.

**Resultado observable**: Descripción, capítulos y etiquetas guardados, versionados y aprobados; y la parte fija del
canal guardada en sus ajustes.

**Qué debe respetar**: Principios II (dato frente a estimación: los minutos son una estimación y se dice), III, V (la IA
no inventa fuentes; las reglas de YouTube viven en un paquete versionado con fuente y fecha) y VII (exportable).
Regresión: la lista de hechos de la 005 no cambia.

**Cómo se demuestra**: Tests de dominio de capítulos (0:00, orden, duración mínima) y de límites; test de que pedir una
parte no toca las otras; e2e del recorrido; axe en claro y oscuro a 375 y 1280 px. Evidencia en la sección «US2» de
`checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 3 - El paquete, listo para copiar (Priority: P2)

Con todo aprobado, el creador ve el paquete en una sola pantalla, en el orden en que lo pide YouTube Studio: título,
descripción, miniatura, etiquetas. Cada pieza tiene un botón «Copiar». Una revisión gratuita y al momento avisa de lo que
YouTube no acepta o que suele salir mal: título demasiado largo, descripción por encima del máximo, capítulos que YouTube
no mostraría, etiquetas que se pasan del límite, la parte fija olvidada. El creador aprueba el paquete y puede
descargarlo para tenerlo fuera de la app o pasarle el brief de la miniatura a un diseñador.

**Why this priority**: Es el final del recorrido de la v1 y evita errores que solo se ven al subir. Sin esta pantalla las
piezas ya existen, aprobadas una a una; por eso no es P1.

**Independent Test**: Con un paquete grabado que tiene un título de 110 caracteres y un capítulo de 5 segundos, el
creador ve los dos avisos, salta a cada uno, los corrige, copia cada pieza, aprueba y descarga un documento que se
entiende sin la app.

**Acceptance Scenarios**:

1. **Given** un paquete con piezas aprobadas, **When** abre el paquete, **Then** ve cada pieza en el orden de YouTube
   Studio con su botón «Copiar», y al pulsarlo la app confirma que se ha copiado.
2. **Given** un paquete, **When** abre la revisión, **Then** ve los avisos con su motivo en lenguaje llano y un enlace a
   la pieza, sin gastar IA.
3. **Given** avisos sin resolver, **When** intenta aprobar, **Then** la app le dice cuántos quedan y le deja decidir.
4. **Given** un paquete aprobado, **When** edita cualquier pieza, **Then** la app avisa de que dejará de estar aprobado
   y, si sigue, vuelve a borrador.
5. **Given** un paquete, **When** lo descarga, **Then** obtiene un documento legible con todas las piezas y el brief de
   la miniatura aparte, y un fichero de datos abierto con lo mismo.
6. **Given** un paquete aprobado, **When** vuelve a la cola, **Then** la idea muestra «lista para publicar» y sigue en la
   cola hasta que el creador la marque como hecha.
7. **Given** un paquete, **When** lo abre, **Then** ve también un comentario fijado propuesto (una pregunta que invita a
   comentar, editable y copiable) y una lista guiada de los ajustes de YouTube Studio: público infantil, contenido
   alterado o sintético, idioma y categoría, cada uno con la respuesta que corresponde a su canal y el porqué.
8. **Given** la lista guiada, **When** el creador marca cada ajuste como hecho, **Then** la marca se guarda en ese
   paquete; la lista es una ayuda y no bloquea la aprobación.

**Qué podrá hacer el creador**: Ver, copiar, revisar, aprobar, reabrir y descargar el paquete. No necesita IA ni
conexión.

**Resultado observable**: Una pantalla con cada pieza copiable, el comentario fijado, la lista guiada de ajustes, una lista de avisos enlazada, el estado «aprobado»
guardado, y un fichero Markdown y otro JSON legibles sin la app.

**Qué debe respetar**: Principios II (ningún aviso bloquea; nada sale de la app sin una acción del creador: copiar es
esa acción), V (las reglas de YouTube en un paquete versionado) y VII (exportación en formatos abiertos). Regresión: los
estados de la idea de la 004 y de la 005.

**Cómo se demuestra**: Tests unitarios de cada regla de revisión; test de la exportación; e2e de copiar, aprobar y
reabrir; axe en claro y oscuro a 375 y 1280 px. Evidencia en la sección «US3» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 4 - El paquete de un Short (Priority: P2)

Si el guion es de un Short, el paquete se acorta: un título, una descripción breve con pocos hashtags, etiquetas y, en
lugar de miniatura, la indicación del fotograma que conviene elegir como portada en la app de YouTube del móvil. No hay
capítulos. Si el Short sale de un vídeo largo, la descripción lo enlaza.

**Why this priority**: Los Shorts están en el alcance de la v1, pero el perfil por defecto los trata como escaparate del
vídeo largo, de modo que el flujo principal es el largo.

**Independent Test**: Con un proveedor de IA falso y un guion Short aprobado sacado de un vídeo largo, el creador genera
el paquete sin capítulos, ve la portada sugerida y el enlace al vídeo largo, y lo aprueba.

**Acceptance Scenarios**:

1. **Given** un guion Short aprobado, **When** abre su publicación, **Then** la app no le pide capítulos ni conceptos de
   miniatura y le explica en una frase cómo se elige la portada de un Short.
2. **Given** un Short, **When** se propone el paquete, **Then** tiene título, descripción breve con hasta 3 hashtags,
   etiquetas y la portada sugerida (el momento del guion y el texto que se ve en ese fotograma).
3. **Given** un Short sacado de un vídeo largo, **When** se propone la descripción, **Then** menciona el vídeo largo y
   la app recuerda que se enlaza con «Vídeo relacionado» al subirlo.
4. **Given** un paquete de Short, **When** usa editar, pedir de nuevo, revisar, aprobar, volver a una versión o
   descargar, **Then** todo funciona igual que en un vídeo largo.

**Qué podrá hacer el creador**: Obtener y aprobar el paquete de un Short. Necesita la IA configurada.

**Resultado observable**: Un paquete de Short sin capítulos, con portada sugerida, guardado y aprobado.

**Qué debe respetar**: Principios I y II; paquete de conocimiento de Shorts existente, sin duplicar sus cifras.

**Cómo se demuestra**: Tests de dominio de las diferencias de un Short; e2e del recorrido; axe en claro y oscuro a 375 y
1280 px. Evidencia en la sección «US4» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 5 - Volver a cualquier versión (Priority: P2)

El creador ve el historial de cada pieza del paquete: cada versión con su fecha y su origen (la IA, una edición suya o una
pieza pedida de nuevo). Abre una versión antigua, ve qué cambia respecto a la actual y, si la prefiere, vuelve a ella sin
perder ninguna.

**Why this priority**: La constitución lo exige para todo lo que genera la IA. Las versiones se guardan desde el primer
momento; esta historia añade la manera de verlas, como en la 005.

**Independent Test**: Con una descripción con cuatro versiones grabadas, el creador abre la segunda, ve qué cambia,
vuelve a ella y comprueba que la cuarta sigue en el historial.

**Acceptance Scenarios**:

1. **Given** una pieza con varias versiones, **When** abre el historial, **Then** ve todas, de la más nueva a la más
   antigua, con fecha y origen.
2. **Given** una versión antigua, **When** pulsa «Volver a esta versión», **Then** se crea una versión nueva con ese
   contenido y ninguna versión se pierde.
3. **Given** un paquete aprobado, **When** vuelve a una versión anterior de una pieza, **Then** esa pieza y el paquete
   pasan a borrador.

**Qué podrá hacer el creador**: Ver, comparar y recuperar cualquier versión de cada pieza. No necesita IA ni conexión.

**Resultado observable**: Historial completo por pieza, guardado tras reiniciar la app, sin pérdidas al recuperar.

**Qué debe respetar**: Principio II. Mismo comportamiento que el historial de la 005.

**Cómo se demuestra**: Tests de dominio de versiones; e2e de recuperar; axe en claro y oscuro a 375 y 1280 px. Evidencia
en la sección «US5» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### Edge Cases

- **Guion reabierto después de empezar el paquete**: el paquete no cambia solo; la app avisa de que el guion es distinto
  del que se usó y ofrece rehacer las piezas afectadas con el coste a la vista.
- **Guion que vuelve a borrador**: el paquete se conserva y se sigue abriendo, con el aviso; solo se puede aprobar de
  nuevo el paquete cuando el guion vuelve a estar aprobado.
- **Título principal cambiado con miniaturas ya elegidas**: las miniaturas no cambian solas; la app avisa de que se
  pensaron para otro título.
- **Guion sin lista de hechos o hechos sin enlaces**: la descripción va sin apartado de fuentes y la app lo dice.
- **Afirmaciones del guion aprobadas como pendientes**: la app lo recuerda junto a las fuentes; no bloquea.
- **Título que promete algo que el guion no cuenta**: la IA no debe proponerlo; si el creador lo escribe, la decisión es
  suya.
- **Bloques muy cortos**: un capítulo de menos de lo que YouTube exige se junta con el siguiente en la propuesta y, si el
  creador lo deja así, la revisión avisa.
- **Menos capítulos de los que YouTube exige**: la revisión avisa de que YouTube no los mostrará.
- **Parte fija más larga que lo que cabe**: la revisión avisa del total y de cuánto sobra.
- **Idea que sale de la cola** (vuelve al banco, hecha o archivada): su paquete se conserva y se sigue abriendo.
- **Fallo de la IA a mitad**: sin cupo, sin sesión o tiempo agotado se explican para personas con un botón; lo aprobado y
  lo editado no se pierde. Una salida inválida se reintenta una vez.
- **Límite de gasto**: si no cabe en el presupuesto, el botón queda apagado y se explica, como en la 003.
- **El navegador no deja copiar**: la app selecciona el texto y dice cómo copiarlo a mano.
- **Dos pestañas**: si otra pestaña guardó antes, la app avisa y no pisa el trabajo sin preguntar.
- **Varios canales**: cada canal ve solo sus paquetes y su parte fija.
- **Una pieza vacía**: no se puede aprobar, y la app dice por qué.

## Requirements *(mandatory)*

### Functional Requirements

**Entrada desde el guion**

- **FR-001**: Un guion aprobado de la 005 DEBE ofrecer «Preparar la publicación» como acción principal.
- **FR-002**: Cada canal DEBE tener una lista de sus paquetes con la idea, el formato, el estado (en preparación,
  aprobado) y la fecha del último cambio. Cada guion tiene como máximo un paquete.

**Títulos y miniatura**

- **FR-003**: La IA DEBE proponer entre 5 y 8 títulos, cada uno con su motivo y su número de caracteres. El creador DEBE
  poder elegir uno principal y hasta dos alternativos, editarlos, escribir los suyos y pedir otros con indicaciones.
- **FR-004**: La IA DEBE proponer 3 conceptos de miniatura para el título principal: qué se ve, el texto grande, la
  emoción, la composición, los colores y el título con el que casa. El creador DEBE poder elegir de uno a tres, editarlos
  y pedir otros con indicaciones. La app NO DEBE generar imágenes (principio VIII).
- **FR-005**: Los títulos y las miniaturas NO DEBEN prometer nada que el guion no cuente, y el conocimiento de títulos y
  miniaturas DEBE vivir en paquetes versionados con fuente y fecha de revisión. Lo que no tenga fuente se marca como
  supuesto.

**Descripción, capítulos y etiquetas**

- **FR-006**: La IA DEBE proponer una descripción con primeras líneas, cuerpo, capítulos, fuentes y la parte fija del
  canal, en ese orden.
- **FR-007**: Los capítulos DEBEN salir de los bloques del guion aprobado, con nombre y minuto, empezando en 0:00. Sus
  minutos son una estimación, editable a mano, y la pantalla lo dice. Cuando la 007 tenga el audio real, podrá proponer
  los minutos reales; el creador decide si los acepta.
- **FR-008**: Las fuentes DEBEN salir de la lista de hechos de la 005; la IA NO DEBE añadir enlaces que no estén en ella.
- **FR-009**: La IA DEBE proponer etiquetas a partir del guion, la idea y el perfil del canal.
- **FR-010**: Cada canal DEBE tener una parte fija de la descripción que el creador puede editar, con un valor por
  defecto que sirve sin tocar nada. Cambiarla NO DEBE alterar los paquetes aprobados.
- **FR-011**: El creador DEBE poder editar a mano cualquier parte y pedir de nuevo una sola parte (descripción,
  capítulos o etiquetas) con indicaciones, sin que cambie ninguna otra.

**Revisión, copia y aprobación**

- **FR-012**: La app DEBE ofrecer una revisión automática, sin IA, que avise de: título por encima del máximo de YouTube
  o cortado en móvil, descripción por encima del máximo, capítulos que YouTube no mostraría (sin 0:00, pocos o demasiado
  cortos), etiquetas por encima del límite y parte fija ausente. Cada aviso lleva su motivo y enlaza con la pieza. Las
  reglas y sus cifras viven en un paquete versionado con fuente y fecha.
- **FR-013**: Ningún aviso DEBE impedir aprobar. Si quedan avisos, la app DEBE decir cuántos antes de aprobar.
- **FR-014**: Cada pieza DEBE poder copiarse con un botón, en el formato que acepta YouTube Studio, y la app DEBE
  confirmar la copia.
- **FR-015**: Editar o recuperar una versión de un paquete aprobado DEBE devolverlo a borrador, avisando antes. La idea
  pasa a mostrar «lista para publicar» con el paquete aprobado; su paso a «hecha» sigue siendo manual.
- **FR-016**: La app NO DEBE subir, publicar ni enviar nada a YouTube ni a otro servicio (principios II y VIII).
- **FR-017**: El paquete DEBE incluir un comentario fijado propuesto por la IA junto con la descripción (editable,
  copiable y versionado) y una lista guiada de ajustes de YouTube Studio: público infantil, contenido alterado o
  sintético, idioma y categoría. Las respuestas salen del perfil del canal y de los paquetes de conocimiento existentes
  (contenido para niños, contenido no auténtico), sin duplicar sus cifras. Las marcas de «hecho» se guardan por paquete y
  no bloquean nada.

**Shorts**

- **FR-018**: El paquete de un Short DEBE tener título, descripción breve con hasta 3 hashtags, etiquetas y la portada
  sugerida, sin capítulos ni conceptos de miniatura. Si el Short sale de un vídeo largo, la descripción lo menciona.

**Coste y procesos**

- **FR-019**: Antes de cada petición a la IA (títulos, miniaturas, descripción, capítulos, etiquetas, paquete de Short)
  la app DEBE mostrar el coste estimado en euros y respetar los límites de gasto. Editar, revisar, copiar, aprobar,
  recuperar y descargar NO DEBEN gastar IA.
- **FR-020**: Las generaciones DEBEN seguir en el servidor si el creador cierra la pestaña, y su resultado DEBE verse al
  volver. Ninguna generación DEBE sustituir el contenido actual hasta terminar y validarse.
- **FR-021**: Los títulos y las etiquetas DEBEN usar solo lo que ya se midió de la idea en la 004 (búsquedas,
  competencia, semáforo). Esta feature NO DEBE hacer llamadas nuevas a YouTube ni gastar cuota.

**Versiones y exportación**

- **FR-022**: Cada cambio guardado de una pieza DEBE crear una versión con fecha y origen (IA, edición o pieza pedida de
  nuevo). Se DEBE poder ver, comparar y recuperar cualquiera sin perder ninguna.
- **FR-023**: El creador DEBE poder descargar el paquete en Markdown y JSON, legible sin la app, con el brief de la
  miniatura como documento aparte, y DEBE poder descargar de una vez todos los paquetes del canal.

**Lenguaje y accesibilidad**

- **FR-024**: Todos los textos DEBEN estar en español llano y en catálogos, sin jerga del glosario, y cada paso DEBE
  decir por qué importa (principio I).
- **FR-025**: Todo el recorrido DEBE funcionar con teclado y a 375 px, con los componentes existentes del design system.

### Key Entities

- **Paquete de publicación**: el trabajo de publicación de un guion. Pertenece a un guion aprobado y a un canal; guarda su
  estado, la versión del guion con la que se hizo y su aprobación.
- **Títulos**: candidatos con motivo; uno principal y hasta dos alternativos elegidos. Versionados.
- **Concepto de miniatura**: qué se ve, texto grande, emoción, composición, colores y título con el que casa. De uno a
  tres elegidos. Versionados. En un Short, la portada sugerida (momento del guion y texto en pantalla).
- **Descripción**: primeras líneas, cuerpo, fuentes y parte fija. Versionada.
- **Capítulo**: nombre, minuto y bloque del guion del que sale. Versionados como lista.
- **Etiquetas**: lista ordenada. Versionada.
- **Comentario fijado**: texto propuesto junto con la descripción. Versionado.
- **Ajuste de YouTube Studio**: nombre, respuesta para el canal, motivo y si el creador lo marcó como hecho.
- **Parte fija del canal**: texto que se añade a todas las descripciones del canal. Una por canal.
- **Versión**: una foto completa de una pieza, con fecha y origen.
- **Aviso de revisión**: regla, motivo y pieza. Se calcula al vuelo y no se guarda.
- **Aprobación**: fecha, versiones aprobadas y número de avisos que quedaban.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un creador con un guion aprobado llega a un paquete aprobado y copiado en menos de 15 minutos, sin ayuda,
  contando la lectura.
- **SC-002**: El 100 % de los títulos propuestos caben en el máximo de YouTube, y al menos la mitad caben sin cortarse en
  el móvil.
- **SC-003**: El 100 % de los capítulos propuestos empiezan en 0:00, van en orden y cumplen el mínimo de YouTube.
- **SC-004**: El 100 % de los enlaces de fuentes de la descripción están en la lista de hechos del guion.
- **SC-005**: Pedir de nuevo una parte deja las demás idénticas, carácter a carácter, en el 100 % de los casos.
- **SC-006**: Todas las peticiones muestran su coste antes de hacerse, y ninguna empieza si su coste máximo previsto no
  cabe en los límites de gasto.
- **SC-007**: La revisión automática de un paquete aparece en menos de 1 segundo.
- **SC-008**: Ninguna versión se pierde: tras recuperar una, el historial tiene una versión más y ninguna menos.
- **SC-009**: Todo el recorrido se maneja con teclado, y axe no encuentra infracciones en claro ni en oscuro, a 375 y
  1280 px.
- **SC-010**: La auditoría de novato termina con 0 graves y como mucho 3 medios.

## Assumptions

- El guion llega aprobado de la 005, con sus bloques, su duración estimada, su lista de hechos y su idea de la 004.
- El creador sube el vídeo y hace la miniatura fuera de la app, o se la encarga a alguien con el brief: la generación de
  imágenes, el montaje y la subida automática están fuera de la v1 (principio VIII).
- Los límites de YouTube (caracteres del título, de la descripción y de las etiquetas; reglas de los capítulos; ajustes de Studio; pruebas de
  hasta 3 títulos y 3 miniaturas) se toman de la ayuda oficial de YouTube y se guardan con fuente y fecha de revisión.
- Elegir hasta tres títulos y tres miniaturas sirve para la función de YouTube que prueba varias y se queda con la que
  más clics consigue; la app solo los prepara.
- La 007 (subtítulos) podrá proponer los minutos reales de los capítulos a partir del audio; esta feature deja los
  capítulos ligados a sus bloques del guion para que sea posible.
- La parte fija por defecto lleva el enlace de suscripción directa del canal, como en el proyecto de referencia.
- Los paquetes se escriben en español, como los guiones.
- La IA es la de la 002 (suscripción de Claude o API de Anthropic); no hay opción gratuita en la v1.
- Una idea tiene un solo guion y un guion un solo paquete.
- Fuera de esta feature (al backlog si interesan): textos para TikTok e Instagram, listas de reproducción, pantalla final
  y tarjetas, hora de publicación según la audiencia, y seguimiento de resultados tras publicar.

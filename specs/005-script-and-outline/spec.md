# Feature Specification: Guion y escaleta

**Feature Branch**: `005-script-and-outline`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "005 script-and-outline: guion y escaleta (vídeo largo y Short) a partir de una idea del banco, dentro del alcance v1 de la constitución."

## Clarifications

### Session 2026-11-09

- Q: ¿De dónde salen los hechos que cuenta el guion? → A: De las dos vías: el creador añade sus apuntes y sus fuentes, y
  la IA puede además investigar por su cuenta en internet, como en el proyecto de referencia.
- Q: ¿Cómo se fija la voz del canal? → A: Con ajustes por canal (trato y registro) y, si el creador quiere, un texto suyo
  como muestra. Los valores por defecto sirven sin tocar nada.
- Q: ¿Se puede sacar un Short de un guion largo aprobado? → A: Sí: crea una idea Short enlazada al vídeo largo y escribe
  su guion.

## Contexto

La 004 termina cuando el creador tiene una idea **elegida para guion**, en una cola ordenada de próximos vídeos. La
pregunta cambia otra vez: ya sabe **qué vídeo** hace, y ahora necesita saber **qué dice** en él, y en qué orden, para que
la gente se quede hasta el final.

Esta feature convierte una idea en un texto listo para grabar. Primero se reúnen los **hechos**, con los apuntes y las
fuentes del creador, con una investigación de la IA o con las dos cosas. Después vienen dos pasos que el creador aprueba:
la **escaleta** (la estructura del vídeo, bloque a bloque) y el **guion** (lo que se dice, palabra por palabra). La
IA propone y el creador decide (principio II): todo se puede editar a mano, pedir de nuevo con indicaciones y devolver a
una versión anterior.

La feature empieza en la cola de la 004, donde hoy la pantalla dice que el guion llegará después. Termina cuando el
creador tiene un **guion aprobado**, que es la entrada de la 006 (paquete de publicación).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - De la idea a una escaleta aprobada (Priority: P1)

El creador abre la primera idea de su cola y pulsa «Preparar el guion». Elige cuánto quiere que dure el vídeo y añade
sus apuntes: lo que sabe del tema, los datos que quiere contar y de dónde los ha sacado. La IA lee la idea, el perfil
del canal y esos apuntes, y propone una escaleta: un gancho, el contexto, varios actos que van a más (cada uno con la
pregunta que abre, la recompensa que da y lo que engancha con el siguiente) y un cierre. Cada bloque explica por qué
está ahí. El creador cambia el orden, edita, añade o quita bloques, pide otra con indicaciones y la aprueba.

**Why this priority**: La estructura decide si la gente se queda. Corregir un orden equivocado en una escaleta cuesta un
minuto; corregirlo en un guion escrito cuesta rehacerlo. Sin escaleta aprobada no hay guion.

**Independent Test**: Con un proveedor de IA falso y una idea en la cola, el creador escribe apuntes, ve el coste, recibe
una escaleta, mueve un bloque con el teclado, edita otro, la aprueba y, al recargar, sigue aprobada.

**Acceptance Scenarios**:

1. **Given** una idea elegida para guion, **When** el creador abre su guion, **Then** ve la idea (título de trabajo,
   gancho, dato concreto y formato), la duración que se propone, un campo de apuntes y una frase que explica por qué
   importa la estructura.
2. **Given** la duración y los apuntes, **When** pulsa «Proponer escaleta», **Then** ve antes el coste estimado y, al
   confirmar, una escaleta con gancho, contexto, al menos dos actos y cierre, con la duración estimada de cada bloque.
3. **Given** una escaleta propuesta, **When** el creador mueve, edita, añade o quita bloques, **Then** la duración total
   se recalcula y los cambios se guardan como una versión nueva.
4. **Given** una escaleta, **When** pide otra con indicaciones («empieza por el final de la historia»), **Then** ve el
   coste, la IA las tiene en cuenta y la escaleta anterior sigue disponible.
5. **Given** una escaleta, **When** la aprueba, **Then** queda marcada como aprobada y la acción principal pasa a ser
   escribir el guion.
6. **Given** un canal sin ideas elegidas, **When** el creador abre los guiones, **Then** la app le explica que primero
   hay que elegir una idea y le lleva al banco.

**Qué podrá hacer el creador**: Preparar la escaleta de cualquier idea de su cola, empezando por la primera. Necesita
un perfil aprobado, una idea elegida para guion y la IA configurada en la 002. Sus apuntes son opcionales.

**Resultado observable**: La escaleta aparece bloque a bloque con su propósito y su duración, y queda guardada,
versionada y en estado «aprobada» tras reiniciar la app.

**Qué debe respetar**: Principios I (una acción principal, por qué importa, sin jerga), II (aprobar, editar, regenerar),
III (coste antes de cada propuesta) y IV (salida validada, fallos tipados). Regresión: la cola y los estados de la 004 no
cambian; sus tests siguen en verde.

**Cómo se demuestra**: Tests de dominio de la escaleta y de la duración; test de la salida de la IA con proveedor falso;
e2e con teclado; axe en claro y oscuro a 375 y 1280 px. Evidencia en la sección «US1» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 2 - De la escaleta a un guion que suena a persona (Priority: P1)

Con la escaleta aprobada, el creador pulsa «Escribir el guion». La IA escribe, bloque a bloque, lo que se dice en voz
alta, con la voz del canal y una nota breve de qué se ve en cada momento. La voz se ajusta una vez por canal: tú o usted,
un registro y, si quiere, un texto suyo como muestra. El creador lee, edita cualquier frase a mano, y si un bloque no le
convence pide solo ese bloque de nuevo, con indicaciones, sin tocar el resto. Las afirmaciones que no salen de los hechos
reunidos aparecen marcadas «por comprobar».

**Why this priority**: Es la razón de ser de la feature: el texto que el creador va a grabar.

**Independent Test**: Con un proveedor de IA falso y una escaleta aprobada, el creador genera el guion, edita una frase,
pide de nuevo un bloque con indicaciones, comprueba que los demás no cambian y ve las afirmaciones marcadas.

**Acceptance Scenarios**:

1. **Given** una escaleta aprobada, **When** pulsa «Escribir el guion», **Then** ve el coste estimado y, al confirmar,
   un guion con los mismos bloques de la escaleta, con el texto hablado, la nota de qué se ve y su duración estimada.
2. **Given** un guion, **When** edita el texto de un bloque, **Then** la duración se recalcula y el cambio se guarda
   como una versión nueva sin gastar IA.
3. **Given** un guion, **When** pide de nuevo un bloque con indicaciones, **Then** ve el coste de ese bloque, solo ese
   bloque cambia y, en el resto, sus ediciones a mano siguen intactas.
4. **Given** un guion con una cifra, fecha, nombre o hecho que no está entre los hechos reunidos, **When** se muestra,
   **Then** esa afirmación aparece marcada «por comprobar», distinta de las que tienen respaldo.
5. **Given** una afirmación marcada, **When** el creador la da por correcta, la corrige, dice que no es un dato o la quita
   del guion, **Then** la marca desaparece y el recuento de pendientes baja.
6. **Given** un guion en generación, **When** el creador cierra la pestaña, **Then** la generación sigue en el servidor y
   el resultado aparece al volver.
7. **Given** un canal sin voz ajustada, **When** se escribe su primer guion, **Then** se usan los valores por defecto y
   la app dice cuáles son y dónde cambiarlos; **When** el creador los cambia, **Then** los guiones ya escritos no cambian
   y los siguientes usan la voz nueva.

**Qué podrá hacer el creador**: Obtener un guion completo desde su escaleta aprobada y retocarlo frase a frase o bloque a
bloque. Necesita la IA configurada. Editar a mano no necesita IA ni conexión.

**Resultado observable**: El guion se ve por bloques, con duración total, afirmaciones marcadas y estado guardado tras
reiniciar la app.

**Qué debe respetar**: Principios II (dato frente a estimación, edición a mano), III (coste por bloque), V (reglas de
escritura humana y conocimiento versionado; la IA no inventa cifras) y IV (prompts en ficheros versionados).

**Cómo se demuestra**: Tests de dominio de bloques, marcas y duración; test de que regenerar un bloque no toca otros; e2e
del recorrido; axe en claro y oscuro a 375 y 1280 px. Evidencia en la sección «US2» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 3 - Revisar y aprobar el guion (Priority: P2)

Antes de aprobar, el creador ve una revisión del guion, gratis y al momento: si dura lo que quería, si el gancho se
alarga demasiado, qué muletillas de IA quedan, qué frases son difíciles de decir en voz alta y cuántas afirmaciones
siguen por comprobar. Cada aviso lleva al sitio exacto. El creador corrige lo que quiere y aprueba. Después puede
descargar el guion para leerlo o grabarlo donde quiera.

**Why this priority**: Evita grabar un guion con fallos que se detectan sin gastar nada, y deja lista la entrada de la
006. Sin esta revisión el guion ya existe; por eso no es P1.

**Independent Test**: Con un guion grabado que tiene muletillas, un gancho largo y una afirmación sin comprobar, el
creador ve los tres avisos, salta a cada uno, aprueba y descarga un documento que se entiende sin la app.

**Acceptance Scenarios**:

1. **Given** un guion, **When** abre la revisión, **Then** ve los avisos con su motivo en lenguaje llano y un enlace al
   bloque, sin gastar IA.
2. **Given** afirmaciones por comprobar, **When** intenta aprobar, **Then** la app le dice cuántas quedan y le deja
   decidir: revisarlas o aprobar igualmente. La decisión queda registrada.
3. **Given** un guion aprobado, **When** vuelve a editarlo, **Then** la app le avisa de que dejará de estar aprobado y,
   si sigue, el estado vuelve a «en borrador» hasta que apruebe de nuevo.
4. **Given** un guion, **When** lo descarga, **Then** obtiene un documento legible con la escaleta, el guion, las notas
   y las marcas, y un fichero de datos abierto con lo mismo.
5. **Given** un guion aprobado, **When** vuelve a la cola, **Then** esa idea muestra «guion listo» y sigue en la cola
   hasta que el creador la marque como hecha.

**Qué podrá hacer el creador**: Revisar, aprobar, reabrir y descargar un guion. No necesita IA ni conexión.

**Resultado observable**: Lista de avisos enlazada, estado «aprobado» guardado, y un fichero Markdown y otro JSON
legibles sin la app.

**Qué debe respetar**: Principios II (la decisión es del creador: un aviso nunca bloquea la aprobación), V (reglas de
escritura en un paquete versionado) y VII (exportación en formatos abiertos). Regresión: los estados de la idea de la
004, incluida la vuelta de «hecha» al banco.

**Cómo se demuestra**: Tests unitarios de cada regla de revisión; test de la exportación; e2e de aprobar y reabrir; axe en
claro y oscuro a 375 y 1280 px. Evidencia en la sección «US3» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 4 - El guion de un Short (Priority: P2)

Si la idea es un Short, el recorrido se acorta: no hay escaleta aparte. El creador elige la duración y escribe sus
apuntes si quiere, y la IA propone directamente el guion en tres tramos: el gancho de los primeros segundos, el
desarrollo y el cierre, que empuja a seguir viendo o enlaza con otro vídeo. Se edita, se pide de nuevo, se revisa y se
aprueba igual que un vídeo largo.

**Why this priority**: Los Shorts están en el alcance de la v1 y en el banco de la 004, pero el perfil por defecto los
trata como escaparate del vídeo largo, de modo que el flujo principal es el largo.

**Independent Test**: Con un proveedor de IA falso y una idea Short en la cola, el creador genera el guion sin pasar por
la escaleta, ve los tres tramos con una duración dentro del máximo de YouTube y lo aprueba.

**Acceptance Scenarios**:

1. **Given** una idea con formato Short, **When** abre su guion, **Then** la app no le pide escaleta y le explica en una
   frase por qué los primeros segundos deciden un Short.
2. **Given** una duración, **When** se genera el guion, **Then** tiene gancho, desarrollo y cierre, con su duración
   estimada, y el total no supera el máximo que marca el paquete de conocimiento de Shorts.
3. **Given** un Short que se pasa de duración tras editarlo, **When** abre la revisión, **Then** ve un aviso con cuánto
   sobra.
4. **Given** un guion de Short, **When** usa editar, regenerar un tramo, revisar, aprobar, volver a una versión o
   descargar, **Then** todo funciona igual que en un vídeo largo.

**Qué podrá hacer el creador**: Obtener y aprobar el guion de una idea Short. Necesita la IA configurada.

**Resultado observable**: Un guion en tres tramos con duración dentro del máximo, guardado y aprobado.

**Qué debe respetar**: Principios I y II; paquete de conocimiento de Shorts existente, sin duplicar sus cifras.

**Cómo se demuestra**: Tests de dominio del límite; e2e del recorrido Short; axe en claro y oscuro a 375 y 1280 px.
Evidencia en la sección «US4» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 5 - Volver a cualquier versión (Priority: P2)

El creador ve el historial de la escaleta y del guion: cada versión con su fecha y su origen (la IA, una edición suya o
un bloque pedido de nuevo). Abre una versión antigua, la compara con la actual y, si la prefiere, vuelve a ella. Volver
no borra nada: crea una versión nueva igual a la antigua.

**Why this priority**: La constitución lo exige para todo lo que genera la IA, y es lo que da confianza para pedir
cambios. No va en P1 porque las versiones se guardan desde el primer momento: esta historia añade la manera de verlas.

**Independent Test**: Con un guion con cuatro versiones grabadas, el creador abre la segunda, ve qué bloques cambian,
vuelve a ella y comprueba que la cuarta sigue en el historial.

**Acceptance Scenarios**:

1. **Given** un guion con varias versiones, **When** abre el historial, **Then** ve todas, de la más nueva a la más
   antigua, con fecha y origen.
2. **Given** una versión antigua, **When** la abre, **Then** ve qué bloques cambian respecto a la actual.
3. **Given** una versión antigua, **When** pulsa «Volver a esta versión», **Then** se crea una versión nueva con ese
   contenido y ninguna versión se pierde.
4. **Given** un guion aprobado, **When** vuelve a una versión anterior, **Then** el guion pasa a borrador.

**Qué podrá hacer el creador**: Ver, comparar y recuperar cualquier versión. No necesita IA ni conexión.

**Resultado observable**: Historial completo, guardado tras reiniciar la app, sin pérdidas al recuperar.

**Qué debe respetar**: Principio II («se puede volver a cualquier versión anterior»). Es más estricto que lo que hacen las
ideas de la 004 (original y última edición), que no cambian.

**Cómo se demuestra**: Tests de dominio de versiones; e2e de recuperar; axe en claro y oscuro a 375 y 1280 px. Evidencia
en la sección «US5» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 6 - Investigar el tema con fuentes (Priority: P2)

Antes de la escaleta, el creador puede pedir a la IA que investigue el tema en internet. La app le enseña el coste y, al
confirmar, la IA reúne hechos, cada uno con los enlaces que lo respaldan y una etiqueta en lenguaje llano: **comprobado**
(dos fuentes fiables o más), **una sola fuente** o **leyenda o sin confirmar**. El creador lee la lista, quita lo que no
quiere, corrige, y añade sus propias fuentes y hechos, que quedan marcados como suyos. Con esa lista se escriben la
escaleta y el guion, y lo que sea dudoso se cuenta como dudoso. Con el guion escrito, puede pedir que la IA compruebe las
afirmaciones que siguen pendientes: recibe un veredicto y una redacción propuesta para cada una, y decide él.

**Why this priority**: Un guion con datos falsos hunde la confianza en el canal, y buscar y contrastar fuentes es la parte
más tediosa del trabajo. No va en P1 porque el recorrido ya funciona con los apuntes del creador.

**Independent Test**: Con un proveedor de IA falso que devuelve hechos y enlaces, el creador lanza la investigación, ve
cada hecho con su etiqueta y sus enlaces, quita uno, añade una fuente propia y comprueba que la escaleta recibe esa lista.

**Acceptance Scenarios**:

1. **Given** una idea, **When** pulsa «Investigar el tema», **Then** ve el coste estimado y, al confirmar, una lista de
   hechos con su etiqueta, sus enlaces y la fecha de la consulta.
2. **Given** un hecho con enlaces, **When** se muestra, **Then** se ha comprobado que cada enlace abre; el que no abre se
   señala y no cuenta como respaldo.
3. **Given** la lista, **When** el creador quita, edita o añade hechos y fuentes, **Then** se guarda como una versión
   nueva y los suyos quedan marcados como suyos.
4. **Given** una lista con leyendas o hechos de una sola fuente, **When** se escribe el guion, **Then** esos hechos se
   cuentan como dudosos, sin afirmarlos, y siguen marcados en el bloque.
5. **Given** un guion con afirmaciones pendientes, **When** pide comprobarlas, **Then** ve el coste y, por cada una, un
   veredicto (correcto, matizar, incorrecto o sin fuente), sus enlaces y una redacción propuesta que puede aceptar o no.
6. **Given** una conexión de IA que no puede buscar en internet, **When** abre el guion, **Then** la app lo explica y
   ofrece seguir con los apuntes.

**Qué podrá hacer el creador**: Pedir una investigación, revisar sus hechos y fuentes, añadir los suyos y comprobar el
guion. Necesita conexión y una IA que pueda buscar en internet. Es opcional.

**Resultado observable**: Una lista de hechos con etiqueta, enlaces y fecha, guardada, versionada y descargable junto al
guion; y marcas que distinguen lo respaldado de lo dudoso.

**Qué debe respetar**: Principios II (dato con fuente frente a estimación), III (coste antes, incluidas las búsquedas), IV
(capacidad declarada en el puerto, adaptadores intercambiables, batería de contrato; los tests no buscan de verdad) y V (la
IA no inventa fuentes; qué es una fuente fiable vive en un paquete versionado). El texto de las páginas web es dato, nunca
una instrucción.

**Cómo se demuestra**: Tests de dominio de las etiquetas; batería de contrato de la capacidad nueva con proveedor falso;
test de enlaces rotos; e2e del recorrido; axe en claro y oscuro a 375 y 1280 px. Evidencia en la sección «US6» de
`checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 7 - Sacar un Short de un vídeo largo (Priority: P3)

Desde un guion largo aprobado, el creador pulsa «Sacar un Short». La IA propone dos o tres enfoques, cada uno a partir de
un momento fuerte del guion. Elige uno, y la app crea una idea Short enlazada al vídeo largo y abre su guion, listo para
escribirlo con el coste a la vista y aprobarlo como cualquier otro Short.

**Why this priority**: El perfil de la 003 recomienda los Shorts como escaparate del vídeo largo, y esto lo pone a un
clic. Depende de que el resto exista y se puede hacer a mano apuntando la idea en el banco.

**Independent Test**: Con un proveedor de IA falso y un guion largo aprobado, el creador pide enfoques, elige uno,
encuentra en el banco la idea Short enlazada y escribe su guion.

**Acceptance Scenarios**:

1. **Given** un guion largo aprobado, **When** pulsa «Sacar un Short», **Then** ve el coste y, al confirmar, 2 o 3
   enfoques con su gancho y el momento del guion del que salen.
2. **Given** los enfoques, **When** elige uno, **Then** se crea una idea Short que indica de qué vídeo sale, sin pasar por
   la medida de la 004, y se abre su guion sin escribir, con los hechos del vídeo largo y «Escribir el guion» con su coste.
3. **Given** un Short sacado de un vídeo largo, **When** se abre cualquiera de los dos, **Then** se ve el enlace al otro.
4. **Given** un guion largo aún sin aprobar, **When** se abre, **Then** la acción no aparece disponible y la app dice que
   hace falta aprobarlo.

**Qué podrá hacer el creador**: Obtener Shorts de un guion largo aprobado, tantos como quiera. Necesita la IA configurada.

**Resultado observable**: Una idea Short enlazada en el banco y su guion abierto, con los hechos heredados.

**Qué debe respetar**: Principios II y III. Regresión: los campos y estados de las ideas de la 004; la idea nueva sigue
pudiendo medirse a petición.

**Cómo se demuestra**: Tests de dominio del enlace; e2e del recorrido; axe en claro y oscuro a 375 y 1280 px. Evidencia en
la sección «US7» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### Edge Cases

- **Investigación sin resultados útiles**: la app lo dice, no rellena la lista con suposiciones y deja seguir con apuntes.
- **Fuentes que se contradicen**: el hecho se etiqueta «leyenda o sin confirmar» y enseña las dos versiones.
- **Enlace que deja de abrir más tarde**: se conserva con la fecha de la consulta; la comprobación se hace al investigar.
- **Enlace escrito por el creador que no abre**: se avisa y se guarda igual; la decisión es suya.
- **Investigación más cara que el límite**: el botón queda apagado y se explica; el recorrido sigue con apuntes.
- **Hechos cambiados con escaleta o guion ya escritos**: no cambian solos; la app avisa y ofrece rehacerlos con el coste a
  la vista.
- **Guion largo que cambia después de sacar un Short**: el Short no cambia; la app avisa en él.
- **Idea editada después de empezar**: la escaleta y el guion no cambian solos; la pantalla avisa de que la idea es
  distinta de la que se usó.
- **Perfil cambiado después de empezar**: lo mismo, como en las ideas de la 004.
- **Escaleta editada con guion ya escrito**: el guion no cambia; la app avisa de que se escribió con otra escaleta y
  ofrece escribirlo de nuevo, con el coste a la vista. El guion anterior queda en el historial.
- **Idea que sale de la cola** (vuelve al banco, hecha o archivada): su guion se conserva y se sigue abriendo.
- **Idea recuperada del archivo**: recupera su guion.
- **Idea quemada o competida**: la app lo recuerda con su semáforo y deja seguir; no bloquea.
- **Sin apuntes ni investigación**: se puede seguir; la app avisa de que casi todo saldrá marcado «por comprobar».
- **Apuntes muy largos**: la app dice cuánto admite y el coste estimado sube en consecuencia.
- **Fallo de la IA a mitad**: sin cupo, sin sesión o tiempo agotado se explican para personas con un botón; lo aprobado y
  lo editado no se pierde. Una salida inválida se reintenta una vez.
- **Bloque a medias**: el guion se guarda solo cuando la respuesta está completa y es válida; nunca a trozos.
- **Límite de gasto**: si no cabe en el presupuesto, el botón queda apagado y se explica, como en la 003.
- **Edición sin guardar al pedir un bloque**: lo escrito se guarda antes de pedirlo.
- **Dos pestañas**: si otra pestaña guardó antes, la app avisa y no pisa el trabajo sin preguntar.
- **Varios canales**: cada canal ve solo sus guiones.
- **Un bloque vacío o una escaleta sin bloques**: no se puede aprobar, y la app dice por qué.
- **Duración fuera de lo razonable**: la app admite solo el intervalo de FR-003.

## Requirements *(mandatory)*

### Functional Requirements

**Entrada desde el banco**

- **FR-001**: La cola de la 004 DEBE ofrecer preparar el guion de la primera idea como acción principal y de las demás
  como acción secundaria. Sustituye al aviso de que el guion llegará después.
- **FR-002**: Cada canal DEBE tener una lista de sus guiones con la idea, el formato, el estado (escaleta en borrador,
  escaleta aprobada, guion en borrador, guion aprobado) y la fecha del último cambio. Cada idea tiene como máximo un
  guion.

**Duración y apuntes**

- **FR-003**: El creador DEBE elegir la duración objetivo: de 3 a 30 minutos en un vídeo largo, 10 por defecto; y de 15
  segundos al máximo del paquete de conocimiento en un Short, 45 por defecto.
- **FR-004**: El creador DEBE poder escribir apuntes opcionales con lo que sabe del tema y añadir sus fuentes (enlace o
  referencia escrita).
- **FR-004b**: El creador DEBE poder pedir, solo si quiere, que la IA investigue el tema en internet. El resultado es una
  lista de hechos, cada uno con sus enlaces, la fecha de la consulta y una etiqueta: comprobado (dos fuentes fiables o
  más), una sola fuente, o leyenda o sin confirmar.
- **FR-004c**: La app DEBE comprobar que cada enlace que aporta la IA abre. Un enlace que no abre NO DEBE contar como
  respaldo. La IA NO DEBE inventar fuentes, y qué es una fuente fiable DEBE vivir en un paquete versionado.
- **FR-004d**: El creador DEBE poder quitar, editar y añadir hechos y fuentes; los suyos quedan marcados como suyos. La
  lista DEBE estar versionada, y la escaleta y el guion guardan con qué versión se hicieron.
- **FR-004e**: Buscar en internet DEBE ser una capacidad declarada del puerto de IA. Si la conexión no la tiene, la app lo
  explica y el recorrido sigue con los apuntes.
- **FR-004f**: El texto que llega de las páginas web DEBE tratarse como dato, nunca como instrucción para la IA.
- **FR-005**: La duración estimada DEBE calcularse a partir del número de palabras y un ritmo de 150 palabras por minuto,
  que se marca como estimación y se puede cambiar en «Más opciones» para cada canal.

**Escaleta**

- **FR-006**: La IA DEBE proponer una escaleta con gancho, contexto, al menos dos actos y cierre. Cada acto tiene la
  pregunta que abre, la recompensa que da y su enganche con el siguiente; cada bloque lleva su propósito y su duración
  estimada.
- **FR-007**: El creador DEBE poder mover con ratón y teclado, editar, añadir y quitar bloques, pedir otra escaleta con
  indicaciones y aprobarla. El guion solo se puede escribir con la escaleta aprobada.

**Guion**

- **FR-008**: La IA DEBE escribir el guion bloque a bloque a partir de la escaleta aprobada, con el texto hablado y una
  nota de qué se ve. La nota es texto para el creador: la app no genera imágenes.
- **FR-009**: El creador DEBE poder editar a mano cualquier bloque y pedir de nuevo un solo bloque con indicaciones, sin
  que cambie ningún otro. También DEBE poder pedir otro guion entero con indicaciones; el anterior queda en el historial.
- **FR-010**: Los textos generados DEBEN seguir las reglas de escritura para ser dichos en voz alta, y el conocimiento de
  ganchos, retención y estructura DEBE vivir en paquetes versionados con fuente y fecha de revisión. Lo que no tenga fuente
  se marca como supuesto.
- **FR-011**: La IA DEBE escribir con la voz del canal: trato (tú o usted), registro (cercano, sobrio o enérgico) y, si
  el creador lo añade, un texto suyo como muestra. Cada canal tiene su voz, con valores por defecto (tú y cercano) que
  sirven sin tocar nada. Cambiarla no altera los guiones ya escritos.
- **FR-012**: Cada cifra, fecha, nombre o hecho que no salga de los apuntes o de la lista de hechos DEBE marcarse «por
  comprobar», y lo que venga de un hecho dudoso DEBE contarse como dudoso y marcarse. Para cada marca, el creador DEBE
  poder darla por correcta, corregirla, indicar que no es un dato (la marca se va y el texto no cambia) o quitar el
  fragmento del guion.
- **FR-012b**: Con el guion escrito, el creador DEBE poder pedir a la IA que compruebe las afirmaciones pendientes. Cada
  una recibe un veredicto (correcto, matizar, incorrecto o sin fuente), sus enlaces y una redacción propuesta. El guion
  solo cambia si el creador la acepta.

**Coste y procesos**

- **FR-013**: Antes de cada petición a la IA (investigación, escaleta, guion, bloque, comprobación, enfoques de un Short)
  la app DEBE mostrar el coste estimado en euros, incluidas las búsquedas si se cobran aparte, y respetar los límites de
  gasto. Editar, revisar, aprobar, recuperar y descargar NO DEBEN gastar IA.
- **FR-014**: Las generaciones DEBEN seguir en el servidor si el creador cierra la pestaña, y su resultado DEBE verse al
  volver. Ninguna generación DEBE sustituir el contenido actual hasta terminar y validarse.

**Revisión y aprobación**

- **FR-015**: La app DEBE ofrecer una revisión automática, sin IA, que avise de: duración frente al objetivo, gancho
  demasiado largo, muletillas de IA, frases difíciles de decir en voz alta y afirmaciones por comprobar. Cada aviso lleva
  su motivo y enlaza con el bloque. Las reglas viven en un paquete versionado.
- **FR-016**: Ningún aviso DEBE impedir aprobar. Si quedan afirmaciones por comprobar, la app DEBE decir cuántas antes de
  aprobar y guardar que el creador aprobó sabiéndolo.
- **FR-017**: Editar o recuperar una versión de un guion aprobado DEBE devolverlo a borrador, avisando antes. La idea
  sigue en su estado de la 004 y su paso a «hecha» sigue siendo manual.

**Shorts**

- **FR-018**: Las ideas Short DEBEN ir directamente al guion, sin escaleta aparte, en tres tramos (gancho, desarrollo y
  cierre), con todo lo demás igual que un vídeo largo.
- **FR-019**: Desde un guion largo aprobado, el creador DEBE poder pedir de 2 a 3 enfoques de Short. Al elegir uno, la app
  crea una idea Short enlazada al vídeo largo y su guion, todavía sin escribir, con la lista de hechos del vídeo largo.
  Escribirlo es una petición aparte, con su coste a la vista.

**Versiones y exportación**

- **FR-020**: Cada cambio guardado de una escaleta o un guion DEBE crear una versión con fecha y origen (IA, edición o
  bloque pedido de nuevo). Se DEBE poder ver, comparar por bloques y recuperar cualquiera sin perder ninguna. Lo único que
  se agrupa en una sola versión son las marcas seguidas que no cambian el texto de un guion sin aprobar; todo cambio de
  texto es una versión propia.
- **FR-021**: El creador DEBE poder descargar la escaleta, el guion y la lista de hechos en Markdown y JSON, legibles sin
  la app, con las notas, las marcas y las fuentes, y DEBE poder descargar de una vez todos los guiones del canal.

**Lenguaje y accesibilidad**

- **FR-022**: Todos los textos DEBEN estar en español llano y en catálogos, sin jerga del glosario, y cada paso DEBE decir
  por qué importa (principio I).
- **FR-023**: Todo el recorrido DEBE funcionar con teclado y a 375 px, con los componentes existentes del design system.

### Key Entities

- **Guion de una idea**: el trabajo sobre una idea. Pertenece a una idea y a un canal; guarda duración objetivo, apuntes,
  estado, versión de la idea y versión del perfil con las que se hizo y, si es un Short sacado de otro vídeo, el guion de
  origen.
- **Voz del canal**: trato, registro y muestra opcional. Una por canal.
- **Lista de hechos**: versionada; pertenece a un guion de una idea.
- **Hecho**: texto, etiqueta, origen (IA o creador) y sus fuentes.
- **Fuente**: enlace o referencia escrita, fecha de consulta y si el enlace abría.
- **Escaleta**: una lista ordenada de bloques (tipo, título, propósito, pregunta, recompensa, enganche, duración
  estimada), versionada y con estado aprobada o en borrador. Los Shorts no la tienen.
- **Guion**: la lista ordenada de bloques escritos (texto hablado, nota de qué se ve, duración estimada), versionada y con
  estado aprobado o en borrador, ligada a la versión de la escaleta de la que salió.
- **Afirmación por comprobar**: un fragmento de un bloque, con su estado (pendiente, confirmada, corregida, sin marca o
  quitada) y,
  si se comprobó, su veredicto, sus enlaces y la redacción propuesta.
- **Versión**: una foto completa de la escaleta o del guion, con fecha y origen.
- **Aviso de revisión**: regla, motivo y bloque. Se calcula al vuelo y no se guarda.
- **Aprobación**: fecha, versión aprobada y número de afirmaciones que quedaban pendientes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un creador con una idea en la cola llega de la idea a un guion aprobado de 10 minutos en menos de 30
  minutos, sin ayuda, contando la lectura.
- **SC-002**: La duración estimada del guion queda a un ±10 % de la duración objetivo en la primera propuesta en el 90 %
  de los casos.
- **SC-003**: El 100 % de las cifras y fechas que no están en los apuntes ni en la lista de hechos aparecen marcadas «por
  comprobar». Los nombres propios se detectan con una regla aproximada: en los casos grabados de las pruebas se marca el
  100 % de los que van fuera de inicio de frase, y al inicio de frase depende de lo que indique la IA.
- **SC-004**: Pedir de nuevo un bloque deja el resto idéntico, carácter a carácter, en el 100 % de los casos.
- **SC-005**: Todas las peticiones muestran su coste antes de hacerse, y ninguna empieza si su coste máximo previsto no
  cabe en los límites de gasto. En las que buscan en internet, lo que cuesta leer las páginas es una estimación, y se dice.
- **SC-006**: La revisión automática de un guion de 30 minutos aparece en menos de 1 segundo.
- **SC-007**: Ninguna versión se pierde: tras recuperar una, el historial tiene una versión más y ninguna menos.
- **SC-008**: Todo el recorrido se maneja con teclado, y axe no encuentra infracciones en claro ni en oscuro, a 375 y
  1280 px.
- **SC-009**: La auditoría de novato termina con 0 graves y como mucho 3 medios.
- **SC-010**: El 100 % de los hechos etiquetados «comprobado» tienen al menos dos enlaces que abrían en la fecha de la
  consulta.
- **SC-011**: La investigación de un tema termina en menos de 5 minutos con una conexión normal.

## Assumptions

- El perfil del canal (003) está aprobado y la idea llega de la cola de la 004, con título de trabajo, gancho, dato
  concreto, pilar y formato.
- El creador graba con su propia voz, o con la herramienta que elija fuera de la app: la síntesis de voz, las imágenes, el
  montaje y la subida están fuera de la v1 (principio VIII).
- Los títulos definitivos, el brief de miniatura y la descripción son de la 006. La idea sigue usando su título de trabajo.
- El ritmo de 150 palabras por minuto y los límites de duración son un supuesto sin fuente, y se marcan como tal.
- La IA es la de la 002 (suscripción de Claude o API de Anthropic); no hay opción gratuita en la v1.
- Una idea tiene un solo guion: para otra versión del mismo tema se crea otra idea.
- La regla de «dos fuentes fiables para comprobado» viene del proyecto de referencia; no tiene fuente externa y se marca
  como supuesto.
- La app comprueba que un enlace abre, no que diga lo que la IA afirma: la etiqueta es una ayuda y la decisión es del
  creador, y la pantalla lo dice.
- La investigación es un coste aparte y opcional; el camino sin coste adicional del principio III sigue siendo la
  suscripción de IA del creador.
- Un guion largo se escribe en una sola petición, y un bloque suelto en una petición propia.
- Los guiones se escriben en español, como las ideas.
- Fuera de esta feature (al backlog si interesan): modo teleprompter, aprender de las ediciones del creador, y comparar el
  guion con vídeos de otros canales.

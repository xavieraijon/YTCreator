# Feature Specification: Banco de ideas con detección de temas quemados

**Feature Branch**: `004-idea-bank`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "004 banco de ideas (idea-bank). El creador, con el perfil de su canal ya hecho (feature
003: nicho, concepto, público, formato, ritmo), tiene un banco de ideas de vídeo. La IA propone tandas de ideas
ajustadas al perfil (título de trabajo, gancho, por qué encaja en el canal, formato: vídeo largo o Short); el creador
puede escribir las suyas, editarlas, descartarlas, ordenarlas y marcar el estado (en el banco, elegida para guion,
hecha). Cada idea se puede medir contra YouTube antes de producirla con la detección de temas quemados: demanda del
tema general y oferta del dato concreto, con un semáforo en lenguaje llano: hueco, competido, quemado o frío, y la
evidencia a la vista. Las cifras salen del puerto de YouTube ya existente y los umbrales sin fuente se marcan como
supuesto (principio V). Una idea quemada sugiere el ángulo de al lado. La idea elegida es la entrada de la feature
siguiente (guion y escaleta). Coste de IA estimado antes de cada propuesta, como en 003."

## Clarifications

### Session 2026-11-07

- Q: ¿Cada idea se mide sola al entrar en el banco o cuando el creador lo pide? → A: Cuando lo pide: «¿Tiene hueco?»
  en una idea o «Medir todas» en el banco. Nada gasta cuota de YouTube sin que lo pida.
- Q: ¿Se compara también con lo que hay en inglés? → A: Sí. La búsqueda del dato concreto se mide también en inglés, y
  la medida avisa de una oportunidad si en inglés el tema funciona y en castellano hay poco.
- Q: ¿Puede haber varias ideas elegidas para guion a la vez? → A: Sí, en cola: una lista ordenada de próximos vídeos;
  el guion (005) empieza por la primera.

## Contexto

Con el perfil del canal aprobado (003), la pregunta del creador cambia: ya sabe **de qué** va su canal, y ahora
necesita saber **qué vídeo** hace a continuación. Hacer un vídeo cuesta horas; hacerlo sobre un tema que ya han contado
cien canales el mes pasado, o que nadie busca, es tirarlas.

El banco de ideas es el sitio donde el creador junta, ordena y elige sus próximos vídeos. La IA le ayuda a llenarlo con
ideas que encajan en su promesa y sus pilares, y la app le dice, con datos públicos de YouTube, si cada idea tiene hueco
o ya está quemada. La decisión es siempre del creador (principio II): la app propone y mide, no elige.

La feature empieza en la pantalla del canal que deja la 003, donde hoy está «Banco de ideas: próximamente». Termina
cuando el creador tiene una idea **elegida para guion**, que es la entrada de la 005 (guion y escaleta).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Llenar el banco con ideas que encajan (Priority: P1)

El creador abre «Banco de ideas» desde su canal. Si está vacío, la acción principal es «Proponer ideas». La IA lee el
perfil del canal (nicho, promesa, pilares, público, formato y ritmo) y propone una tanda de ideas. Cada idea tiene un
título de trabajo, el gancho (por qué alguien haría clic), por qué encaja en el canal (qué pilar toca) y el formato:
vídeo largo o Short. El creador se queda las que quiere y descarta las demás; puede pedir otra tanda con indicaciones
(«más de misterios sin resolver»), escribir ideas propias y editar cualquiera.

**Why this priority**: Sin ideas no hay nada que medir ni que guionizar. Es el paso que convierte el perfil en trabajo
concreto, y el que un creador que empieza más agradece: «no sé de qué hacer el próximo vídeo».

**Independent Test**: Con un proveedor de IA falso y un canal con perfil aprobado, el creador pide ideas, ve una tanda
ajustada al perfil, se queda dos, descarta el resto, escribe una propia y las tres quedan guardadas en el banco.

**Acceptance Scenarios**:

1. **Given** un canal con perfil aprobado y el banco vacío, **When** el creador pulsa «Proponer ideas», **Then** ve
   antes el coste estimado y, al confirmar, una tanda de 6 a 10 ideas, cada una con título de trabajo, gancho, pilar
   que toca y formato.
2. **Given** una tanda propuesta, **When** el creador se queda unas y descarta otras, **Then** las que se queda pasan al
   banco con estado «en el banco» y las descartadas no aparecen en él, aunque la tanda sigue guardada.
3. **Given** el banco, **When** el creador pide otra tanda con indicaciones, **Then** la IA las tiene en cuenta y no
   repite ideas que ya están en el banco ni las descartadas.
4. **Given** el banco, **When** el creador escribe una idea propia (como mínimo un título de trabajo y el formato),
   **Then** queda en el banco marcada como suya, con los mismos campos editables que las de la IA.
5. **Given** un canal sin perfil aprobado, **When** el creador intenta abrir el banco, **Then** la app le explica que
   primero hay que terminar el perfil y le lleva a él.

**Qué podrá hacer el creador**: Pedir tandas de ideas a la IA sobre su perfil, quedarse o descartar cada una, y escribir
o editar las suyas. Necesita un perfil de canal aprobado y una IA configurada (002); escribir ideas propias funciona sin
IA. Antes de cada tanda ve su coste estimado y el límite de gasto se respeta (principio III).

**Resultado observable**: La pantalla «Banco de ideas» lista las ideas guardadas con su título, gancho, pilar, formato,
origen (IA o propia) y estado. Cada tanda queda registrada con su coste en el uso de la IA. Las ideas sobreviven a un
reinicio del servidor.

**Qué debe respetar**: Principios I (lenguaje llano), II (la IA propone, el creador decide), III (coste antes de
gastar) y IV (puerto de IA; reintento de salida inválida reservado, entrada 152 de la 003). El perfil del canal de la
003 no cambia: se lee. Regresión: los tests de propuestas, presupuesto y estimación de la 003.

**Cómo se demuestra**: Tests de contrato del uso de IA nuevo con el proveedor falso; tests de servidor de las rutas del
banco; e2e del recorrido con axe en claro y oscuro a 375 y 1280 px. Evidencia en la sección «US1» de
`checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 2 - Saber si una idea está quemada antes de hacerla (Priority: P1)

Para cada idea del banco el creador puede pulsar «¿Tiene hueco?», o «Medir todas» para las que no tienen medida. Nada
se mide solo. La app mide en YouTube dos cosas: si el **tema
general** tiene público (hay vídeos del tema con muchas visitas) y cuánta **oferta hay del dato concreto** (cuántos
vídeos en castellano cuentan casi lo mismo, cuántos se han subido en los últimos meses y cuánto se ven). Con eso da un
semáforo en lenguaje llano:

- **Hay hueco** (verde): pocos vídeos casi iguales y el tema tiene público.
- **Competido** (ámbar): muchos vídeos casi iguales, pero se ven, o se está llenando ahora: solo con un enfoque propio.
- **Quemado** (rojo): muchos vídeos casi iguales y se han subido muchos hace poco, o hay muchos y casi nadie los ve.
- **Frío** (gris): pocos vídeos casi iguales, pero tampoco se ve público para el tema.

La misma búsqueda se mide también en inglés: si allí el tema tiene muchas visitas y en castellano hay poco, la medida
lo dice como **oportunidad**, sin cambiar el semáforo. Junto al semáforo, la frase que lo explica y la evidencia: los vídeos parecidos que encontró (título, canal, visitas y
fecha), la fecha de la medida y la fuente. Los umbrales del semáforo son una primera versión sin estudio que los
respalde y se dice así, «un supuesto nuestro» (principio V).

**Why this priority**: Es lo que distingue este banco de una lista de notas: evita la pérdida más cara, que es producir
un vídeo que nadie va a encontrar. Comparte prioridad con US1 porque, sin medida, las ideas de la IA son solo opinión.

**Independent Test**: Con datos de YouTube grabados (yt-dlp falso), el creador mide una idea con hueco, una quemada,
una competida y una fría y ve los cuatro semáforos con su frase, los vídeos parecidos, la fecha y la fuente.

**Acceptance Scenarios**:

1. **Given** una idea del banco, **When** el creador pulsa «¿Tiene hueco?», **Then** ve el progreso mientras se mide y,
   al acabar, el semáforo, la frase que lo explica, los vídeos parecidos con sus visitas y su fecha, la fecha de la
   medida y la fuente.
2. **Given** una idea medida hace más de 30 días, **When** el creador la mira, **Then** el semáforo dice que la medida
   es antigua y ofrece «Volver a medir».
3. **Given** que YouTube no responde, corta las peticiones o el lector no está listo, **When** se mide una idea,
   **Then** la idea queda «sin medir» con el fallo explicado y su acción (reintentar o ir a Ajustes), nunca con un
   semáforo inventado.
4. **Given** una idea medida, **When** el creador edita su título o su dato concreto, **Then** la medida anterior se
   conserva pero se marca como de la versión anterior de la idea.
5. **Given** cualquier semáforo, **When** el creador lo mira, **Then** se dice que los umbrales son un supuesto, sin
   fuente que los respalde.
6. **Given** una idea cuyo dato concreto tiene en inglés vídeos con muchas visitas y en castellano pocos parecidos,
   **When** se mide, **Then** la medida avisa de una oportunidad y enseña también los vídeos en inglés.
7. **Given** el banco con ideas sin medir, **When** el creador pulsa «Medir todas», **Then** ve antes cuántas ideas se
   medirán (y, con la Data API, cuántas unidades gastará) y las mide una tras otra, con el progreso a la vista.

**Qué podrá hacer el creador**: Medir cualquier idea del banco, también las suyas, y volver a medirla. Necesita el
lector de YouTube listo (yt-dlp o clave de la Data API, 003). Medir no cuesta dinero; con la Data API gasta unidades de su
cuota y la app lo dice antes. Para la búsqueda en inglés hace falta traducir el dato concreto: lo escribe la IA al
proponer la idea, y para una idea propia lo puede escribir el creador o pedirlo a la IA, con su coste a la vista.

**Resultado observable**: Cada idea medida muestra su semáforo, su frase, la evidencia y la fecha; la medida queda
guardada con la idea y se puede consultar después. Una medida fallida deja la idea «sin medir» con el motivo.

**Qué debe respetar**: Principios I, V (cada cifra con su fuente y su fecha; supuestos marcados) y VI (privacidad: solo
datos públicos). El puerto de YouTube de la 003 y sus códigos de fallo (incluido `no_disponible` de la entrada 153, que
nunca se lee como «sin resultados»). Regresión: tests de contrato del puerto de YouTube y de la medida de nichos.

**Cómo se demuestra**: Tests unitarios del semáforo (los cuatro colores y los bordes de cada umbral); test de contrato
con el yt-dlp falso; e2e de la medida con axe. Evidencia en la sección «US2» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 3 - El ángulo de al lado para una idea quemada (Priority: P2)

Cuando una idea sale **quemada** o **competida**, la app ofrece «Buscar otro enfoque». La IA propone de 2 a 3 variantes
del mismo tema que cuentan el dato de al lado (un detalle menos contado, otra pregunta, otro público dentro del nicho),
cada una con por qué se aparta de lo que ya hay (una opinión: si tiene hueco solo lo dice la medida). El creador puede quedarse una como idea nueva del banco, y medirla.

**Why this priority**: Convierte un «no» en una alternativa, que es lo que más ayuda a quien empieza. Depende de US1 y
US2, y un creador puede vivir sin ella buscando el enfoque por su cuenta.

**Independent Test**: Con el proveedor de IA falso y una idea quemada en el banco, el creador pide otro enfoque, ve 2-3
variantes con su motivo y se queda una, que entra en el banco enlazada a la idea de la que salió.

**Acceptance Scenarios**:

1. **Given** una idea quemada o competida, **When** el creador pulsa «Buscar otro enfoque», **Then** ve el coste
   estimado y, al confirmar, 2-3 variantes con su motivo, que la IA escribe sabiendo qué vídeos parecidos ya hay.
2. **Given** las variantes, **When** el creador se queda una, **Then** entra en el banco como idea nueva, «sin medir»,
   con un enlace a la idea original.
3. **Given** una idea con hueco o fría, **When** el creador la mira, **Then** no se le ofrece «Buscar otro enfoque»
   como acción principal.

**Qué podrá hacer el creador**: Pedir variantes de una idea quemada o competida y quedarse las que quiera. Necesita la
idea medida y una IA configurada; ve el coste antes.

**Resultado observable**: Las variantes elegidas aparecen en el banco con su origen («otro enfoque de …»). La propuesta
queda registrada con su coste.

**Qué debe respetar**: Principios II, III y V: la IA no afirma que una variante tenga hueco; lo dice como opinión y la
variante se mide como cualquier otra idea.

**Cómo se demuestra**: Test de contrato del uso de IA con el proveedor falso; test de servidor; e2e. Evidencia en la
sección «US3» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### User Story 4 - Ordenar el banco y elegir la próxima idea (Priority: P2)

El creador ordena su banco como quiera (arrastrando o con «Subir» y «Bajar», también con teclado), lo filtra por estado,
formato y semáforo, y marca cada idea: **en el banco**, **elegida para guion** o **hecha**. Las elegidas forman una cola ordenada de
próximos vídeos. Puede archivar las que ya no
quiere sin borrarlas. La primera de la cola es la que la 005 usará para escribir el guion; mientras la 005 no
exista, la pantalla dice que el guion llegará después.

**Why this priority**: Sin orden, un banco de 40 ideas no sirve para decidir. Elegir la idea es el puente con la
feature siguiente, pero el valor principal (ideas medidas) ya está en US1 y US2.

**Independent Test**: Con un banco de ideas grabado, el creador reordena tres ideas con el teclado, filtra las verdes,
marca una como «elegida para guion», archiva otra y, al recargar, todo sigue igual.

**Acceptance Scenarios**:

1. **Given** el banco, **When** el creador cambia el orden con el ratón o con el teclado, **Then** el orden se guarda y
   se mantiene al volver.
2. **Given** el banco, **When** filtra por estado, formato o semáforo, **Then** ve solo esas ideas, y quitar el filtro
   las devuelve todas.
3. **Given** una idea, **When** la marca como «elegida para guion», **Then** entra al final de la cola de próximos
   vídeos, que se puede reordenar, y la pantalla dice cuál es la siguiente y qué viene después.
4. **Given** una idea, **When** la archiva, **Then** desaparece del banco y aparece en «Archivadas», de donde se puede
   recuperar.
5. **Given** el banco, **When** el creador lo descarga, **Then** obtiene un documento legible con las ideas, su estado y
   su semáforo con fecha y fuente.

**Qué podrá hacer el creador**: Ordenar, filtrar, cambiar el estado, archivar, recuperar y descargar sus ideas. No
necesita IA ni conexión.

**Resultado observable**: El orden, los estados y el archivo se guardan y sobreviven a un reinicio; la descarga es un
documento legible.

**Qué debe respetar**: Principios I (accesible con teclado y lector de pantalla), II (nada se borra sin que el creador
lo pida) y VII (sus datos son suyos y se pueden llevar). Design system de la 001: los componentes existentes, sin
aspecto nuevo. Regresión: los tests de axe y de teclado del design system.

**Cómo se demuestra**: Tests de servidor del orden y los estados; e2e con teclado; axe en claro y oscuro a 375 y
1280 px. Evidencia en la sección «US4» de `checklists/validation.md`.

**Huecos abiertos**: Ninguno.

---

### Edge Cases

- **Perfil cambiado después de crear ideas**: las ideas ya guardadas no cambian; la pantalla avisa de que algunas se
  propusieron con una versión anterior del perfil.
- **Idea duplicada**: si el creador escribe o se queda una idea con el mismo título de trabajo que otra del banco, la
  app avisa y deja decidir.
- **Sin vídeos parecidos y sin público**: el semáforo es «frío», no «hueco».
- **Búsqueda sin resultados**: «frío» si YouTube devolvió una lista vacía; si no se pudo leer, «sin medir» (entrada 153
  de la 003).
- **Límite de gasto**: si la tanda no cabe en el presupuesto, el botón queda apagado y se explica, como en la 003.
- **Varios canales**: cada canal tiene su banco; las ideas de uno no se ven en otro.
- **Cuota de la Data API agotada**: la medida cae a yt-dlp si está, o queda «sin medir» con el motivo.
- **Medida en curso al cerrar la pestaña**: sigue en el servidor y su resultado aparece al volver.
- **Idea propia sin búsqueda en inglés**: se mide en castellano y la medida dice que falta la parte en inglés, con la
  opción de escribirla o pedirla a la IA.
- **Short**: se mide igual, pero los vídeos parecidos que cuentan son los cortos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada canal con perfil aprobado DEBE tener un banco de ideas propio, accesible desde la pantalla del canal.
- **FR-002**: La app DEBE pedir a la IA tandas de 6 a 10 ideas basadas en el perfil del canal actual, con título de
  trabajo, gancho, pilar del canal que toca, formato (vídeo largo o Short) y el dato concreto que la idea cuenta.
- **FR-003**: Antes de cada propuesta de IA la app DEBE mostrar el coste estimado y respetar el límite de gasto por
  operación (principio III).
- **FR-004**: La IA NO DEBE repetir ideas que ya estén en el banco, archivadas o descartadas del mismo canal.
- **FR-005**: El creador DEBE poder quedarse o descartar cada idea de una tanda, pedir otra con indicaciones, escribir
  ideas propias y editar cualquier campo de cualquier idea.
- **FR-006**: Cada idea DEBE guardar su origen (IA, propia u otro enfoque de otra idea) y la versión del perfil con la
  que se propuso.
- **FR-007**: La app DEBE medir una idea en YouTube solo cuando el creador lo pida («¿Tiene hueco?» o «Medir todas»),
  con el puerto de la 003, y calcular: público del tema general, número de vídeos casi iguales en castellano, cuántos
  son recientes (últimos 90 días) y cuánto se ven.
- **FR-007b**: La medida DEBE buscar también el dato concreto en inglés y avisar de una oportunidad cuando en inglés haya
  vídeos con público y en castellano pocos parecidos, enseñando los vídeos en inglés. El aviso no cambia el semáforo.
- **FR-007c**: Antes de «Medir todas» la app DEBE decir cuántas ideas medirá y, con la Data API, cuántas unidades
  calcula que gastará.
- **FR-008**: La medida DEBE terminar en uno de cuatro semáforos (hay hueco, competido, quemado, frío) con una frase en
  lenguaje llano que diga por qué, o en «sin medir» con el fallo explicado.
- **FR-009**: Cada medida DEBE mostrar los vídeos parecidos que encontró (título, canal, visitas, fecha si la hay), la
  fecha de la medida y la fuente, y decir que los umbrales son un supuesto sin fuente.
- **FR-010**: Una medida de más de 30 días DEBE marcarse como antigua y ofrecer volver a medir.
- **FR-011**: Para una idea quemada o competida, la app DEBE ofrecer «Buscar otro enfoque»: 2 a 3 variantes de la IA,
  escritas con los vídeos parecidos a la vista, que el creador puede añadir al banco.
- **FR-012**: El creador DEBE poder ordenar el banco con ratón y teclado, filtrarlo por estado, formato y semáforo, y
  cambiar el estado de cada idea entre «en el banco», «elegida para guion» y «hecha». Las elegidas forman una cola
  ordenada; la primera es la entrada de la 005.
- **FR-013**: El creador DEBE poder archivar y recuperar ideas; nada se borra sin que lo pida.
- **FR-014**: El creador DEBE poder descargar el banco como documento legible.
- **FR-015**: Las medidas DEBEN seguir en el servidor si el creador cierra la pestaña, y su resultado DEBE verse al volver.
- **FR-016**: Todos los textos DEBEN estar en español llano, sin jerga del glosario (principio I).

### Key Entities

- **Banco de ideas**: el conjunto de ideas de un canal. Pertenece a un canal.
- **Idea**: título de trabajo, gancho, dato concreto (y su búsqueda en inglés), pilar, formato, origen, estado (en el banco, elegida para guion,
  hecha, archivada), posición en el orden, versión del perfil con la que nació y, si salió de otra, la idea de origen.
  Se guardan el original y la última edición.
- **Tanda de ideas**: una propuesta de la IA para un canal, con sus indicaciones, su coste y las ideas que el creador se
  quedó o descartó.
- **Medida de una idea**: semáforo, frase, cifras (público del tema, vídeos parecidos, recientes, visitas), vídeos
  parecidos, aviso de oportunidad en inglés con sus vídeos, fuente, fecha, la versión de la idea medida y, si falló, el código de fallo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un creador con perfil aprobado llena su banco con al menos 5 ideas y elige una para guion en menos de 15
  minutos, sin ayuda.
- **SC-002**: El 100 % de los semáforos mostrados llevan su frase, su evidencia, su fecha y su fuente; ninguno sale de
  una lectura fallida.
- **SC-003**: Una idea se mide, con su búsqueda en inglés, en menos de 2 minutos con una conexión normal.
- **SC-004**: Ninguna tanda supera el límite de gasto por operación y todas muestran su coste antes de pedirse.
- **SC-005**: Todo el banco se maneja con teclado, y axe no encuentra infracciones en claro ni en oscuro, a 375 y
  1280 px.
- **SC-006**: La auditoría de novato termina el recorrido sin bloqueos.

## Assumptions

- El perfil del canal (003) está aprobado y tiene nicho, promesa, pilares, público, formato y ritmo.
- Los umbrales del semáforo parten de la primera versión del proyecto de referencia (40 resultados mirados; 5 o menos
  casi iguales es poco y 12 o más es mucho; 4 recientes en 90 días es «se está llenando»; una mediana de menos de 1.000
  visitas es «nadie los ve»; dos vídeos del tema general con 100.000 visitas o más, o un casi igual que las tenga, es «hay público»). No tienen fuente:
  se marcan como supuesto.
- La IA es la de la 002 (suscripción de Claude o API de Anthropic); no hay opción gratuita en la v1.
- Las ideas se escriben en español y se miden en castellano, sin filtrar país, como los nichos de la 003.
- La versión de cada idea se guarda como en las propuestas de la 003: el original y la última edición (entrada 156).
- El guion de la idea elegida es la 005: aquí solo se marca la idea.
- Generar miniaturas o títulos definitivos es la 006 (paquete de publicación), no esta feature.

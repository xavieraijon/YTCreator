# Validación de la 006: paquete de publicación

## Foundational (T001–T018), Puerta A del 2026-11-13

### 1. Resumen

La base del paquete está lista: modelo de piezas y estados, migración 0007, repos con versiones inmutables, conocimiento
`publish/` validado al arrancar, la vista y las rutas base, y en la web la lista y el esqueleto con `Stepper`. Los cuatro
revisores no encontraron nada grave. Los hallazgos confirmados (la lista sin título si una fila está rota, lo medido sin
origen, afirmaciones sin fuente o supuesto, el texto de los Shorts) están corregidos. La interfaz aún no tiene recorrido
propio: su e2e y axe llegan con US1.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T004–T005 modelo, límites y pasos por formato | Cumplido | `packages/core/test/publish/model.test.ts` | 2026-11-13 |
| T006–T007 seis estados y avisos | Cumplido | `packages/core/test/publish/status.test.ts` | 2026-11-13 |
| T008–T009 migración 0007 aditiva | Cumplido | `apps/server/test/db/migration-0007.test.ts`, versiones `[1..7]` en las anteriores | 2026-11-13 |
| T010–T011 repos, versión por pieza, inmutables | Cumplido | `apps/server/test/db/repos/packages.test.ts` (11 casos) | 2026-11-13 |
| T012 fuentes abiertas antes de citar | Cumplido | Abiertas en esta sesión: Ayuda de YouTube 57404, 9884579, 6390658, 13861714, 12340300, 12948449, 9528076, 14328491 y la documentación de vídeos para desarrolladores. Lo que no respaldan lleva `assumption`. Revisión del 2026-11-13 (la tarea decía 12; corregida) | 2026-11-13 |
| T013 consejos del oficio | Cumplido | `craft.json`, con el contraste como supuesto (decisión 23); `packages/knowledge/test/publish.test.ts` | 2026-11-13 |
| T014 contratos `PackageView` y `PackageSummary` | Cumplido | `packages/core/src/api/publish.ts`; el cliente web valida con ellos | 2026-11-13 |
| T015–T016 rutas base | Cumplido | `apps/server/test/http/packages-base.test.ts` (7 casos: 201/200, `sin_aprobar`, paquete previo con guion reabierto, canal ajeno, fila rota, lo medido tras un fallo, no encontrado) | 2026-11-13 |
| T017 web base | Parcial | Compila; rutas con test (también `ajustes` reservada); el recorrido y axe llegan con US1 | 2026-11-13 |

### 3. Cómo se comprobó

Tras las correcciones: `fnm exec --using=24 -- pnpm lint` (código 0), `typecheck` (código 0) y `test` (código 0,
182 ficheros, 2328 pasados y 4 omitidos). `test:e2e`: ver el punto 4. El flujo real de la fase (abrir el paquete de un
guion aprobado con la IA falsa, leerlo y listarlo) es el de `packages-base.test.ts`.

### 4. Controles

- Pasados: lint, typecheck, test, glosario (con `publishEs`, las etiquetas de `publish/` y ahora «brief» prohibido),
  `secrets-leak` dentro del e2e.
- `test:e2e`: 49 de 49, código 0, antes de las correcciones de revisión, que en la web solo tocan textos, la lista y una
  ruta reservada, sin recorrido e2e todavía.
- No ejecutados: axe en claro y oscuro a 375 y 1280 px, teclado y reduced-motion de las pantallas nuevas, porque aún no se
  llega a ellas desde la app (la entrada es T024); van en el e2e de US1. Tipos de fallo de IA: esta fase no llama a la IA.
  `test:installer`: no se toca el instalador.

### 5. Hallazgos

Corregidos:
- Una versión de `titulos` que no valida tumbaba la lista entera (lógica, seguridad, regresión): ahora cae al título de
  trabajo, con test.
- Lo medido en la 004 se perdía tras una medición fallida o un cambio de la idea, y no decía su origen (fidelidad): se toma
  la última medida `medida`, con `source`, `partial` y `olderRevision` (decisión 20), con test.
- `studio.json`: idioma y categoría sin fuente ni supuesto, y la categoría presentada como regla de YouTube (fidelidad,
  lógica, regresión): marcados como supuesto, texto corregido, y el esquema exige fuente o supuesto (decisión 23).
- La misma dirección con dos títulos en `studio.json` y `made-for-kids.json` (regresión): igualado al de la 003.
- Falta el consejo de contraste (fidelidad, regresión): añadido como supuesto.
- Sin test de canal ajeno (fidelidad, seguridad, regresión): añadido.
- Un Short decía «Título y miniatura» en la lista (fidelidad): ahora «Título y portada» (decisión 24).
- El estado vacío decía «primero aprueba un guion» aunque hubiera alguno: texto que sirve en los dos casos.
- `/canal/publicaciones/ajustes` se leería como un paquete (lógica, regresión): reservada, con test.
- Los dos provisionales de los avisos (`sourcesCount: 0` y parte fija vacía) no tenían tarea que los quitara (lógica):
  T036 los nombra.
- Fecha de revisión distinta de la tarea (los cuatro): la tarea dice ahora 2026-11-13, la fecha real.
- Límites y la regla `sin_fuentes` sin registrar (fidelidad, regresión): decisiones 21 y 22.
- «brief» no estaba en los términos prohibidos (regresión): añadido.

Descartados:
- Decisiones 14 y 17 mal clasificadas (fidelidad): salieron del análisis, y el creador pidió aplicar esas correcciones el
  2026-11-13; son de riesgo medio (actuar, registrar y destacar), no alto.
- La inmutabilidad solo se prueba por la forma del repo (regresión): es la misma garantía que la 005; ninguna ruta escribe
  `UPDATE` sobre `package_version`.
- Las respuestas no se validan con el esquema en los tests del servidor (regresión): el cliente web las valida al leerlas,
  como en la 005.
- Los textos de `studio.json` y `craft.json` no pasan por el glosario (regresión): todavía no se enseñan; entran en el test
  cuando la lista guiada los muestre (US3).

Abiertos: ninguno grave ni medio.

### 6. Desviaciones

`PackageView.measured` lleva más que lo planeado: `source`, `partial` y `olderRevision` (principio V). Los capítulos con
minuto, las fuentes, la descripción montada y la lista guiada de la vista llegan con US2 y US3, como estaba previsto.

### 7. Decisiones

Agente: 20 a 24 (medio: 20, 22, 23 y 24, destacadas aquí; bajo: 21). Pendientes del creador: ninguna para esta fase.

### 8. Constitución

I (textos sin jerga, «brief» prohibido), II (versiones inmutables, nada cambia solo), V (conocimiento con fuente y fecha o
supuesto marcado, lo medido con origen y fecha), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta fase. La migración 0007 solo añade tablas. Queda pendiente: US1 en adelante.

## US1 título y miniatura (T019–T026), Puerta A del 2026-11-13

### 1. Resumen

Desde un guion aprobado se proponen títulos (con su motivo y el bloque que cumple la promesa) e ideas de miniatura,
se elige el principal y hasta dos para probar, se escriben o editan, y se aprueba la portada. Todo pasa por la IA falsa:
coste antes de pedir, trabajo que sigue con la pestaña cerrada, y sin llamadas a YouTube. Los cuatro revisores
encontraron un grave (cifras sin comprobar) y varios medios; están corregidos. El creador contestó la única pregunta abierta (P1, opción A).

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T019–T020 salidas `titulos` y `miniaturas`, sin direcciones web, con prompts y lo medido en la 004 | Cumplido | `packages/core/test/publish/outputs.test.ts`; batería de contrato U4 y U5 (`packages/ai/test/contract/battery.ts`) | 2026-11-13 |
| T021–T022 rutas de estimación, generación, guardado y aprobación | Cumplido | `apps/server/test/http/packages-cover.test.ts` (26 casos, incluidos los cinco fallos de IA, la dirección web con títulos previos, lo editado que se conserva, la lista llena y las cifras en el motivo) | 2026-11-13 |
| T023 textos | Cumplido | `publish.es.ts`; glosario en `pnpm test` | 2026-11-13 |
| T024 entrada desde el guion y «Mis publicaciones» | Cumplido | e2e US1; tests de la 005 en verde | 2026-11-13 |
| T025 paso «Título y miniatura» | Cumplido | e2e US1; muestra el gancho, lo medido (con fecha, parcial y revisión anterior) y los avisos arriba | 2026-11-13 |
| T026 e2e con pestaña cerrada, teclado, recarga y axe | Cumplido | `apps/web/e2e/publish.spec.ts`: flechas, espacio y Enter sin perder el foco; axe en claro y oscuro a 375 y 1280 px | 2026-11-13 |
| Escenario 1 de US1 (ver el gancho del guion) | Cumplido | `CoverStep.tsx`, tras la revisión | 2026-11-13 |
| Short: título ahora, portada en US4 | Parcial | Decisiones 27 y 34; la aprobación del paso de un Short llega con `portada_short` | 2026-11-13 |

### 3. Cómo se comprobó

Tras la segunda vuelta: `fnm exec --using=24 -- pnpm lint` (código 0), `typecheck` (código 0) y `test` (código 0: 184
ficheros, 2394 pasados y 4 omitidos). En una pasada anterior `test` dio código 1 por C6 de `claude-code.contract.test.ts` (2550 ms frente a un
máximo de 2000): mide el tiempo de un proceso bajo carga, no lo toca este cambio y pasa al repetirlo. Antes de las
correcciones de revisión, `test:e2e` dio 50 de 50 con código 0; tras ellas, también (punto 4). El flujo real de la historia
con la IA falsa es el del e2e de US1 y el de `packages-cover.test.ts`.

### 4. Controles

- Pasados: lint, typecheck, test, glosario, `secrets-leak` (dentro del e2e), axe en claro y oscuro a 375 y 1280 px en las
  pantallas nuevas, teclado (flechas en el principal, espacio en las casillas y Enter para aprobar, con el foco en su
  sitio), los cinco tipos de fallo de IA para `titulos` y `miniaturas`, y «Cómo se demuestra» (pestaña cerrada durante la
  generación y resultado al volver).
- `test:e2e` tras las dos vueltas de correcciones: código 0, 97 de 97 y 50 de 50.
- No ejecutados: `prefers-reduced-motion` aparte, porque el paso no añade animaciones propias (usa `AiWorking`, ya
  auditado en la 005); `test:installer`, porque no se toca el instalador; IA real, porque necesita la aprobación del
  creador (T068).

### 5. Hallazgos

Corregidos:
- Grave (fidelidad): `titulos` y `miniaturas` no pasaban por el control de cifras. Ahora se comprueban `why` y `scene`
  (decisión 30), con un test que falla sin la corrección.
- Un título o una idea que el creador reescribe seguía como «Opinión de la IA», con su motivo y su bloque, y «Pedir otros»
  lo borraba si no estaba elegido (los cuatro). Ahora pasa a ser del creador y se conserva, con test.
- Pedir otras miniaturas podía dejar una elegida que ya no existía, y pedir otros títulos podía pagar sin que cupiera
  ninguno (lógica, seguridad, regresión). Lo elegido nunca se recorta y, sin sitio, el botón se apaga y lo dice antes de
  pagar (decisión 31), con tests.
- Un título demasiado largo impedía aprobar, en contra de FR-013 (lógica, fidelidad, regresión): ahora es solo un aviso.
- El corte en el móvil no se marcaba como supuesto (los cuatro): el texto lo dice.
- Los avisos calculados no se veían y «Ir al guion» no se usaba (lógica, fidelidad, regresión): salen arriba con su acción
  (decisión 33).
- Faltaban el gancho del guion (fidelidad, regresión) y la medida parcial (fidelidad).
- Con las flechas, cada opción guardaba una versión y el foco se perdía (regresión): las elecciones se guardan un momento
  después del último cambio, sin desactivar los controles (decisión 32); el e2e lo recorre con el teclado.
- Textos de un Short que hablaban de miniatura (regresión): decisión 34.
- `role="alert"` repetido dentro de las opciones, el guion y el «·» fuera del catálogo, y cifras escritas a mano en los
  textos (lógica, fidelidad, regresión): corregido; las cifras salen de `PUBLISH_LIMITS`.
- Textos en blanco aceptados por la API (lógica): los esquemas recortan los espacios, con test.
- Reglas de `craft.json` copiadas en los prompts (regresión): quitadas; los prompts ya reciben `craft`.
- La fuente del máximo podía caer por defecto en otra (fidelidad, regresión): ahora falla al arrancar si no la tiene.
- Faltaban la batería de contrato de los usos nuevos, el 400 sin principal y la dirección web con contenido previo
  (fidelidad, lógica, regresión): añadidos.
- Decisión 28 mal clasificada y módulos fuera del plan (fidelidad): 28 pasa a medio; decisión 29.

Descartados:
- `Checkbox` se documenta como «se aplica al enviar el formulario» (regresión): es una nota del componente sobre su uso en
  formularios; aquí la elección se guarda sola, como en la 005 con las afirmaciones, y no cambia su aspecto ni su
  comportamiento.

Segunda vuelta (lógica, sobre las correcciones), corregidos:
- Grave: al pedir otros títulos se perdía el título de una miniatura elegida, y desde entonces ningún guardado de
  miniaturas pasaba (400). Ahora ese título se conserva y solo se comprueba el título de las ideas que cambian (decisión 35),
  con test que reproduce el caso.
- Al recortar una cifra en una escena caían las ideas sin texto grande y la respuesta pagada no valía: el recorte solo
  quita lo que él mismo vacía (decisión 37), con test.
- «Pedir otras ideas» recortaba en silencio las editadas por el creador: ahora, sin sitio, se apaga antes de pagar
  (decisión 31), con test.
- Menores: una elección guardada al salir del paso partía de una versión vieja; se podía elegir entre pulsar «Pedir otros»
  y que empezara el trabajo; elegir una miniatura borraba el aviso de título cambiado (decisión 36). Corregidos.

Abiertos: ninguno grave ni medio. El creador contestó P1 el 2026-11-13 con la opción A, que es la implementada. Tercera
vuelta: no se lanzó otra revisión; las correcciones de la segunda llevan cada una su test.

### 6. Desviaciones

De más: los avisos arriba con su acción (estaba en `ui-screens.md`, sin tarea) y el código de campo `lleno`. De menos: la
portada de un Short, que llega con US4.

### 7. Decisiones

Creador: 25 (P1, opción A). Agente: 26 a 37 (medio: 27, 28 y 30 a 37, destacadas aquí; bajo: 26 y 29). Pendiente del creador: ninguna; P1
(qué pasa con las propuestas de la IA que no eligió al pedir otras) la contestó con la opción A, decisión 25.

### 8. Constitución

II (lo del creador nunca lo cambia la IA, y lo que reescribe deja de ser de la IA), III (coste antes de pedir, y nada se
paga si no cabe), IV (salidas validadas, una dirección web no valida), V (cifras comprobadas, supuestos marcados), VI
(teclado y foco), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones. Queda pendiente: US2 en adelante.

## US2 descripción, capítulos, etiquetas y comentario (T028–T041), Puerta A del 2026-11-13

### 1. Resumen

Con la portada aprobada se propone la descripción de un vídeo largo: primeras líneas, cuerpo, capítulos con su minuto
estimado, etiquetas y comentario fijado; las fuentes salen de los datos del guion y la parte fija, de los nuevos
«Ajustes de publicación». Cada parte se edita, se pide de nuevo sola o se aprueba junto a las demás. Los cuatro revisores
y una segunda vuelta de lógica encontraron medios (ninguno grave); están corregidos, cada uno con su test.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T028–T029 `chapterTimes`, `proposeChapters` y el minuto escrito por el creador | Cumplido | `packages/core/test/publish/chapters.test.ts` (17 casos, con los grabados de SC-003, `parseChapterTime` y `chaptersInOrder`) | 2026-11-13 |
| T030–T031 fuentes de la descripción y texto montado | Cumplido | `packages/core/test/publish/description.test.ts` | 2026-11-13 |
| T032–T033 salidas y usos `descripcion` y `parte_paquete`, con prompts | Cumplido | `outputs.test.ts`; baterías de contrato U1–U3 de los tres adaptadores; `lock.json` | 2026-11-13 |
| T034–T035 ajustes de publicación | Cumplido | `apps/server/test/http/publish-settings.test.ts` (5 casos); que cambiarlos no toca lo guardado, en `packages-texts.test.ts` | 2026-11-13 |
| T036–T037 rutas de los textos | Cumplido | `apps/server/test/http/packages-texts.test.ts` (22 casos: `sin_aprobar`, cuatro versiones con `draft_version` y `main_title`, cada parte sola carácter a carácter (SC-005), ediciones, minuto manual, parte fija cambiada y «Usar la nueva», `sin_fuentes`, aprobar con piezas vacías y comentario vacío, estimación de otra parte, cifra del creador, doble petición, minutos desordenados) | 2026-11-13 |
| T038 textos | Cumplido | `publish.es.ts`; glosario ampliado a los textos de `core/publish/description.ts` | 2026-11-13 |
| T039 paso «Descripción» | Cumplido | e2e US2 | 2026-11-13 |
| T040 «Ajustes de publicación» y su ruta | Cumplido | e2e US2; `router.test.ts` | 2026-11-13 |
| T041 e2e con axe | Cumplido | `apps/web/e2e/publish.spec.ts` (US2): teclado para guardar y aprobar, minuto mal escrito, pedir de nuevo una parte, ajustes con `Select`, aviso de parte fija y «Usar la nueva»; axe en claro y oscuro a 375 y 1280 px | 2026-11-13 |
| Short: textos | Parcial | Decisión 40: llegan con `paquete_short` (US4); el paso lo dice | 2026-11-13 |

### 3. Cómo se comprobó

Tras la segunda vuelta: `fnm exec --using=24 -- pnpm lint` (código 0), `typecheck` (código 0) y `test` con la caché de
vitest borrada, porque cambiaron prompts (código 0: 188 ficheros, 2470 pasados y 4 omitidos). `test:e2e`: ver el punto 4. El flujo real
de la historia con la IA falsa es el del e2e de US2 y el de `packages-texts.test.ts`. Los tests nuevos de las
correcciones de cifras y de estimación se comprobaron fallando sin la corrección.

### 4. Controles

- Pasados: lint, typecheck, test, glosario, axe en claro y oscuro a 375 y 1280 px en el paso y en los ajustes, teclado
  (Enter en guardar y aprobar, desplegable de categoría con teclado), los cinco tipos de fallo de IA (los cubre
  `AiAction`, el mismo de US1, con `failureFor` por parte) y «Cómo se demuestra» (pedir de nuevo solo el comentario y ver
  que el resto sigue igual, en e2e y carácter a carácter en el servidor).
- `test:e2e`: tras la primera vuelta, 147 pasados y 1 fallido, el de US2, que en la ejecución completa encontraba la IA ya
  conectada por US1 (comparten servidor); corregido y verificado con el fichero entero. Resultado tras la segunda vuelta:
  código 0, 97 de 97 y 51 de 51.
- No ejecutados: `test:installer`, porque no se toca el instalador; `prefers-reduced-motion` aparte, porque el paso no
  añade animaciones propias; IA real, porque necesita la aprobación del creador (T068).

### 5. Hallazgos

Corregidos (primera vuelta):
- Una estimación de una parte servía para generar otra, y de otro paquete (seguridad): la estimación queda ligada al
  paquete y a la parte (decisión 50), con test.
- La parte actual iba a la IA como `current` y una cifra escrita a mano contaba como fuente (seguridad, lógica): va como
  `previous`, que no cuenta (decisión 50), con test que falla sin la corrección.
- Las partes pedidas de nuevo se guardaban como `ia` y no como `parte_ia` (fidelidad, lógica): corregido (decisión 49).
- Editar la descripción, o «Usar la nueva», volvía a sellar el título y borraba el aviso de título cambiado (los tres):
  ahora conserva su título (decisión 49).
- El aviso de título cambiado culpaba a las miniaturas y el de parte fija no tenía acción (fidelidad, regresión): dice
  «parte de lo que tienes» y lleva a la pieza afectada (decisión 51).
- Cifras comprobadas en la descripción sin decisión ni test (fidelidad, regresión): decisión 48 y test.
- Afirmación sin fuente sobre lo que pesan las etiquetas (fidelidad): quitada; la decisión 38 ya no se apoya en ella.
- Pedir `descripcion` con los textos hechos pagaba y pisaba lo editado en otra pestaña (lógica): 409 (decisión 53).
- Un comentario vaciado por el recorte tiraba la respuesta pagada; etiquetas con coma o repetidas dejaban la pantalla con
  «cambios sin guardar» (lógica): decisión 54, con tests.
- Enlace de suscripción con una @ provisional (lógica): decisión 55.
- `inputMode="numeric"` sin «:» en iOS, frases montadas en el componente, cinco «Guardar» con el mismo nombre y campos
  de indicaciones repetidos, límite de etiquetas sin explicar, textos de `core` fuera del glosario, `hasHandle` fuera del
  contrato, frase de la 007 que pide la spec, marca de la IA solo en la descripción, `sin_fuentes` impreciso, «Proponer
  descripción» del contrato (regresión, fidelidad, lógica): corregidos (decisiones 52 y 56).
- Riesgo mal clasificado en las decisiones 44 y 46 (fidelidad): pasan a medio.

Corregidos (segunda vuelta, lógica):
- La IA podía dar menos capítulos que el mínimo de YouTube y etiquetas que pasaban del total: la respuesta no vale y se
  pide otra vez, con las cifras de `youtube.json` (decisión 57), con tests.
- Un minuto escrito a mano podía dejar los capítulos desordenados: los estimados siguientes se mueven con él y el servidor
  rechaza el desorden; la pantalla lo avisa antes (decisión 58), con tests.

Descartados, con motivo:
- La fuente del máximo de la descripción es la del título (fidelidad, lógica, regresión): las dos cifras tienen la misma
  fuente en `youtube.json` y la vista lleva una sola cita desde US1; si un día difieren, `limitsOf` ya obliga a que cada
  cifra tenga fuente. Se revisará con la vista de revisión (US3).
- «Volver a mis publicaciones» en los ajustes no vuelve al paquete (regresión): se entra también desde la lista; el
  navegador vuelve atrás.
- Una parte fija guardada con la @ de entonces no se actualiza si cambia la @ (regresión): lo guardado es del creador y no
  se cambia solo (principio II).
- Las cuatro versiones de `descripcion` no van en una transacción (lógica, menor): son síncronas; si faltara alguna, la
  pantalla y el servidor dejan pedirla entera otra vez (decisión 53).

Abiertos (menores, para su historia):
- «hashtags: de 0 a 3» copiado en el prompt y en `outputs.ts` en vez de inyectado de `youtube.json` (fidelidad): solo
  afecta al Short; se corrige en US4.
- Un número de un título de la IA cuenta como fuente en la descripción (lógica): el texto del título no pasa el control
  de cifras (decisión 30); se revisará con la revisión (US3).

Tercera vuelta: no se lanzó; las correcciones de la segunda llevan cada una su test.

### 6. Desviaciones

De más: la estimación ligada a la parte, el 409 de la doble petición, el desplazamiento de los minutos estimados tras uno
manual y el campo `hasHandle`. De menos: los textos de un Short, que llegan con US4.

### 7. Decisiones

Agente: 38 a 58. Medio, destacadas aquí: 38, 39, 40, 43, 44, 45, 46, 48 a 55, 57 y 58. Bajo: 41, 42, 47 y 56.
Pendientes del creador: ninguna.

### 8. Constitución

II (lo editado por el creador no lo pisa la IA ni otra pestaña; la marca de la IA en cada parte), III (precio por parte,
estimación ligada a lo que se pide, nada se paga dos veces), IV (salidas validadas con las cifras de YouTube), V
(fuentes solo de los hechos, cifras comprobadas, sin afirmaciones sin fuente), VI (teclado, nombres accesibles distintos,
axe), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones. Queda pendiente: US3 en adelante.

## US3 revisar, copiar, aprobar y descargar (T043–T053), Puerta A del 2026-11-13

### 1. Resumen

Con los textos aprobados, el paso «Revisar y copiar» calcula sin IA los avisos del paquete (límites de YouTube con su
fuente, capítulos, etiquetas, consejos nuestros marcados como tales), deja copiar cada pieza en el orden de YouTube
Studio, con la lista guiada de ajustes, y aprueba la publicación entera, con diálogo si quedan avisos. Se descarga en
Markdown, JSON e indicaciones de miniatura, una o todas. Tres vueltas de revisión; los medios confirmados están corregidos.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T043–T044 `reviewPackage` y cada regla, SC-007 | Cumplido | `packages/core/test/publish/review.test.ts` (16 casos, con 30 capítulos en menos de 1 s y las comillas de las etiquetas) | 2026-11-13 |
| T045–T046 exportación | Cumplido | `packages/core/test/publish/export.test.ts`: orden de Studio, bloques literales, JSON legible, indicaciones sin datos del canal, todas las publicaciones, las que no se leen, portada en blanco | 2026-11-13 |
| T047–T048 lista guiada | Cumplido | `packages/core/test/publish/studio.test.ts`; fuentes y perfil ilegible en `packages-approve.test.ts` | 2026-11-13 |
| T049–T050 rutas | Cumplido | `apps/server/test/http/packages-approve.test.ts` (13 casos: cifras y fuentes, marcas sin versión, 409 de otra pestaña, aprobar con `sin_aprobar`, `version_cambiada` y avisos que no cuadran, editar lo aprobado, descargas, `packageStatus` de la idea); los tests de la 004 y la 005 siguen pasando | 2026-11-13 |
| T051 textos | Cumplido | `publish.es.ts`; glosario ampliado a `publish` y a los textos de `studio.json` y `made-for-kids.json` | 2026-11-13 |
| T052 paso y etiqueta de la cola | Cumplido | `ReviewCopyStep.tsx`, `IdeaQueue.tsx`; e2e US3 | 2026-11-13 |
| T053 e2e con axe | Cumplido | `apps/web/e2e/publish.spec.ts` (US3): avisos y saltos a la pieza, copiar con y sin portapapeles, marcar con Espacio, aprobar con diálogo, recargar, salir de lo aprobado (quedarse y seguir), descargas md/json/indicaciones, «Lista para publicar» y descargar todo; axe en claro y oscuro a 375 y 1280 px | 2026-11-13 |
| Short | Parcial | La portada del Short se exporta y revisa; su paquete propio llega con US4 | 2026-11-13 |

### 3. Cómo se comprobó

Tras la tercera vuelta: `fnm exec --using=24 -- pnpm lint` (código 0), `typecheck` (código 0) y `test` (código 0:
192 ficheros, 2524 pasados y 4 omitidos; la caché de vitest se borró en la segunda). `test:e2e`: ver el punto 4. El flujo real de la
historia con la IA falsa es el del e2e de US3 y el de `packages-approve.test.ts`.

### 4. Controles

- Pasados: lint, typecheck, test, glosario (con `publish`, `studio.json` y `made-for-kids.json`), `secrets-leak` (dentro
  de `test`), axe en claro y oscuro a 375 y 1280 px en el paso, teclado (copiar, Espacio en las casillas, diálogos),
  copia sin portapapeles y «Cómo se demuestra» (avisos, aprobar con avisos, descargar y ver «Lista para publicar»).
- `test:e2e` tras la segunda vuelta: código 0, 97 de 97 (catálogo) y 52 de 52 (web). Una ejecución anterior falló en
  `rotation.spec.ts` por servidores de una ejecución solapada; la limpia pasó entera. La corrección de la tercera vuelta
  solo cambia el texto del documento con el perfil ilegible, cubierto por `export.test.ts`.
- No ejecutados: `test:installer`, porque no se toca el instalador; los tipos de fallo de IA, porque el paso no llama a
  la IA; `prefers-reduced-motion` aparte, porque no añade animaciones propias; IA real (T068, necesita al creador).

### 5. Hallazgos

Corregidos (primera vuelta, cuatro revisores):
- Una sola fuente para todas las cifras: cada aviso lleva la fuente de su cifra (`sources`, decisión 59).
- Doble clic en aprobar y en las marcas: guardas por referencia.
- «Lista para publicar» con el guion reabierto: solo si el guion sigue aprobado.
- Plurales del documento, nombre de las indicaciones de un Short, descarga de todas que fallaba entera por un paquete
  ilegible (decisión 77), mensaje cuando cambian los avisos al aprobar, lista dentro de un párrafo, puntuación montada
  en JSX, textos de conocimiento fuera del glosario, contrato de pantallas, «todo en orden» con avisos del paquete,
  copiar las miniaturas y la portada, diálogo al salir de lo aprobado (FR-015, escenario 4), «estimado» en el capítulo
  corto, cuánto sobra en la descripción, foco de las casillas y reintento de las descargas.

Corregidos (segunda vuelta):
- Las marcas de dos pestañas se pisaban (antes descartado): `base` y 409 (decisión 75).
- Las etiquetas no contaban las comillas que YouTube pone a las que tienen espacios (decisión 78), con tests.
- Lista guiada sin fuente: cada ajuste oficial la enseña.
- Perfil ilegible respondía «no está hecho para niños»: ahora no responde (decisión 65).
- Consejos nuestros que parecían reglas de YouTube (decisión 79); portada en blanco (decisión 80); el documento de todas
  las publicaciones dice cuántas faltan (decisión 77); textos del documento más claros; clave de las alternativas;
  claves del glosario; contrato HTTP con `sources` y `base`.

Corregidos (tercera vuelta, lógica y fidelidad):
- El documento descargado respondía «no está hecho para niños» con el perfil ilegible (los dos): dice lo mismo que la
  pantalla, con test.
- La decisión 78 cambia qué respuestas de la IA valen y estaba como Bajo (fidelidad): pasa a Medio.

Abiertos (menores):
- El «+2» de las comillas va en el código y no en `youtube.json`, y no se ha podido comprobar sin red que la fuente lo
  diga (fidelidad): se revisa con el paquete de conocimiento en Polish.
- El prompt de la descripción no dice a la IA que las comillas cuentan (lógica): con 20 etiquetas como máximo es
  improbable pasar de 500; si pasa, se pide una vez más (decisión 57).

### 6. Desviaciones

De más: las fuentes por cifra y por ajuste, el 409 de las marcas, el diálogo al salir de lo aprobado y el aviso de
publicaciones que faltan. De menos: en el e2e, el aviso del título se deja sin corregir para probar «Aprobar igual»; el
paquete del Short llega con US4.

### 7. Decisiones

Agente: 59 a 80. Medio: 59 a 78 (efecto visible, texto de interfaz o coste). Bajo: 79 y 80. Pendientes del creador: ninguna.

### 8. Constitución

I (avisos que dicen qué hacer y llevan a la pieza), II (la app no responde por el creador si el vídeo es para niños; no
se pisa lo marcado en otra pestaña), III (la revisión no llama a la IA), V (cada cifra y ajuste oficial con su fuente;
los consejos nuestros dicen que lo son), VI (teclado, axe, copia sin portapapeles), VII (descargas legibles sin la app;
dicen lo que falta), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones nuevas. Queda pendiente: US4, US5 y Polish; T068 (IA real)
necesita la autorización del creador.

## US4 el paquete de un Short (T055–T060), Puerta A del 2026-11-13

### 1. Resumen

Un Short aprobado pide su paquete en una sola petición (`paquete_short`): de 3 a 5 títulos, la portada sugerida (bloque,
momento y texto en pantalla), descripción con hashtags, etiquetas y comentario, sin capítulos ni miniaturas. Si viene de
un vídeo largo, la descripción lo nombra siempre («Vídeo completo: «…»»), aunque la IA o el creador no lo hagan. Tres
vueltas de revisión como máximo; se hicieron dos y los medios confirmados están corregidos.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T055–T056 salida y uso `paquete_short` | Cumplido | `packages/core/test/publish/outputs.test.ts` (3 a 5 títulos de bloques del guion, hasta los hashtags que YouTube enseña, únicos y sin coma ni «#», portada de un bloque que existe, sin direcciones web, textos vacíos tras recortar una cifra); prompt `paquete_short/v1.md` con `parentTitle` y sin enlaces; `parte_paquete/v2.md` | 2026-11-13 |
| T057–T058 rutas | Cumplido | `apps/server/test/http/packages-short.test.ts` (13 casos: piezas creadas y ninguna de miniaturas ni capítulos, `parentTitle` de la idea, del título principal del largo o nulo, rechazos de `titulos`/`miniaturas`/`descripcion` en un Short y de `paquete_short` en un largo o por segunda vez, títulos pedidos antes, guion sin aprobar, portada pedida otra vez y editada, bloque desconocido, mención añadida por la app, aprobar los pasos y el paquete sin capítulos) | 2026-11-13 |
| T059 pantallas | Cumplido | `CoverStep.tsx` (portada del Short, guardar antes de aprobar), `DescriptionStep.tsx` (hashtags con su límite y fuente, sin capítulos, recordatorio del vídeo relacionado), `ReviewCopyStep.tsx`, `AskAgain.tsx`, `publish.es.ts` | 2026-11-13 |
| T060 e2e con axe | Cumplido | `apps/web/e2e/publish.spec.ts` (US4): pedir el paquete, aprobar bloqueado con cambios sin guardar, hashtags, texto del vídeo relacionado, revisar, aprobar y descargar `portada-*.md`; axe en claro y oscuro a 375 y 1280 px | 2026-11-13 |
| FR-018 vídeo relacionado | Cumplido | `assembleDescription` añade la línea si los textos no lo nombran (decisión 90); `description.test.ts` | 2026-11-13 |
| Volver a una versión anterior | No cumplido aquí | Es de US5 | 2026-11-13 |

### 3. Cómo se comprobó

Tras la segunda vuelta: `fnm exec --using=24 -- pnpm lint` (código 0), `typecheck` (código 0) y `test` con la caché
de vitest borrada (código 0: 193 ficheros, 2554 pasados y 4 omitidos). `test:e2e`: ver el punto 4. El flujo real de la
historia con la IA falsa es el del e2e de US4 y el de `packages-short.test.ts`.

### 4. Controles

- Pasados: lint, typecheck, test, glosario (dentro de `test`, con los textos nuevos de `publish.es.ts`), `secrets-leak`,
  axe en claro y oscuro a 375 y 1280 px, teclado (grupo de títulos, campos de la portada y los hashtags) y «Cómo se
  demuestra» (paquete del Short sin capítulos, aprobado y descargado).
- Tipos de fallo de IA: el paso usa `AiAction`, que ya cubre `sin_sesion`, `cupo_agotado`, `tiempo_agotado`,
  `contenido_filtrado` y `no_disponible` (tests de la 005 y de US1); el error del paquete solo se enseña mientras falta.
- `test:e2e` tras la segunda vuelta: código 0, 97 pasados y 2 omitidos (catálogo) y 53 de 53 (web).
- No ejecutados: `test:installer`, porque no se toca el instalador; `prefers-reduced-motion` aparte, porque no añade
  animaciones propias; IA real (T068, necesita al creador).

### 5. Hallazgos

Corregidos (primera vuelta, cuatro revisores):
- Un Short con piezas a medias se quedaba sin salida: `paquete_short` se puede pedir mientras falte alguna, y solo
  añade las que faltan (decisión 82).
- Se podía aprobar con la portada sin guardar (decisión 91).
- La descripción pedida sola no recibía `parentTitle` y el prompt fijaba 3 hashtags: `parte_paquete` v2 (decisión 89),
  con `hashtagsShown` en los límites (decisión 88).
- «#» dentro de un hashtag, hashtags repetidos o con coma, y hashtags perdidos al pedir otra descripción (decisión 92).
- Cifras en el momento de la portada; bloque obsoleto al editar (decisión 87); textos de la pantalla del Short.

Corregidos (segunda vuelta):
- FR-018 dependía de la IA: la app añade la mención (decisión 90).
- Riesgo de las decisiones 87 y 92 como Bajo: pasan a Medio.
- El texto en pantalla de la portada no pasa el control de cifras («3 TRUCOS» es su función, decisión 92).
- Recortar una cifra podía tirar la respuesta entera ya pagada: el control mira solo los textos de la descripción y el
  comentario, que pueden quedar vacíos (decisión 93), con test.

Descartados:
- Envolver en una transacción la conservación de piezas al pedir el paquete: las escrituras son síncronas y un resultado
  a medias ya tiene salida (decisión 82).

Abiertos (menores):
- Un título del vídeo largo con «#» o una dirección podría hacer que la IA lo copie y su respuesta no valga: se pide una
  vez más (decisión 57), y la mención la pone la app sin exigirla al esquema (decisión 90).

### 6. Desviaciones

De más: `parte_paquete` v2 con el título del largo y el límite de hashtags, la mención añadida por la app y el bloqueo
de aprobar con cambios sin guardar. De menos: volver a una versión anterior es de US5.

### 7. Decisiones

Agente: 81 a 93, todas Medio (efecto visible, texto de interfaz o coste). Pendientes del creador: ninguna.

### 8. Constitución

I (el Short tiene su paso propio y dice qué falta), II (la app no inventa la dirección del largo, decisión 10; no se
aprueba lo que no se ha guardado), III (una sola petición para el paquete; no se tira una respuesta pagada por una
frase), V (el límite de hashtags con su fuente), VI (teclado y axe), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones nuevas; los prompts nuevos quedan en el lock y se van con
el revert. Queda pendiente: US5 y Polish; T068 (IA real) necesita la autorización del creador.

## US5 volver a cualquier versión (T062–T066), Puerta A del 2026-11-13

### 1. Resumen

Cada pieza del paquete tiene su historial plegado debajo: todas las versiones, de la más nueva a la más antigua, con
fecha y origen; comparar una con la actual, elemento a elemento; y «Volver a esta versión», que la copia como la más
nueva sin perder ninguna. Si la publicación o el paso estaban aprobados, vuelven a borrador. Dos vueltas de revisión.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T062–T063 comparar versiones | Cumplido | `packages/core/test/publish/compare.test.ts` (10 casos: títulos nuevos, quitados y cambiados, principal elegido, ideas de miniatura y elegidas, partes de la descripción, capítulos con orden y minuto, etiquetas añadidas y quitadas, portada y comentario, origen de la IA) | 2026-11-13 |
| T064 rutas | Cumplido | `apps/server/test/http/packages-versions.test.ts` (8 casos: lista de la más nueva con fecha y origen, errores de petición, abrir con diferencias, volver crea `recuperada` y el historial tiene una más (SC-008), ninguna si es la actual, 409 de otra pestaña, volver sobre la publicación aprobada la devuelve a borrador) | 2026-11-13 |
| T065 rutas y pantalla | Cumplido | `GET /packages/:id/versions`, `GET …/versions/:kind/:version`, `POST …/restore`; `History.tsx` debajo de cada pieza en `CoverStep.tsx` y `DescriptionStep.tsx`; textos en `publish.es.ts` | 2026-11-13 |
| T066 e2e con axe | Cumplido | `apps/web/e2e/publish.spec.ts` (US5): cuatro versiones, comparar la segunda con el teclado, volver con el teclado sobre una publicación aprobada, la cuarta sigue, «Recuperada · copia de la versión 2», recargar; axe en claro y oscuro a 375 y 1280 px | 2026-11-13 |
| Escenario 3 / FR-015 | Cumplido | La app avisa al entrar en el paso de una publicación aprobada (decisión 68) y el paso lo recuerda arriba (decisión 97); el test de rutas comprueba `textos_borrador` | 2026-11-13 |

### 3. Cómo se comprobó

Tras la segunda vuelta: `fnm exec --using=24 -- pnpm lint` (código 0), `typecheck` (código 0) y `test` (código 0:
195 ficheros, 2572 pasados y 4 omitidos). `test:e2e`: ver el punto 4. El flujo real de la historia con la IA falsa es el
del e2e de US5.

### 4. Controles

- Pasados: lint, typecheck, test, glosario (dentro de `test`, con `publishEs.history`), `secrets-leak`, axe en claro y
  oscuro a 375 y 1280 px con la lista y con la comparación abiertas (un texto largo desbordaba a 375 px: corregido con
  `overflow-wrap`), teclado (abrir el historial, comparar, volver, foco en la comparación y en el aviso) y «Cómo se
  demuestra».
- `test:e2e` tras la segunda vuelta: código 0, 97 pasados y 2 omitidos (catálogo) y 54 de 54 (web). Dos ejecuciones
  anteriores fallaron en el catálogo (tiempo agotado en `a11y.spec.ts` con las pruebas unitarias a la vez, y el
  `theme.spec.ts` de webkit, intermitente conocido), que no toca este cambio; las limpias pasaron enteras.
- Tipos de fallo de IA: no aplican; el historial no llama a la IA.
- No ejecutados: `test:installer`, porque no se toca el instalador; `prefers-reduced-motion` aparte, porque no añade
  animaciones propias; IA real (T068, necesita al creador).

### 5. Hallazgos

Corregidos (primera vuelta, cuatro revisores):
- Una idea de miniatura recuperada podía quedar para un título que ya no está y mostrar «Para el título: «»»: lo dice
  en su tarjeta (decisión 96).
- Diálogo nuevo al volver, doble con el de entrar en el paso (decisión 68): quitado (decisión 97).
- La comparación no marcaba lo de la IA, como la 005 (decisión 99, en la segunda vuelta por elemento).
- El test del paquete aprobado no demostraba nada (recuperaba tras una edición): ahora recupera sobre la publicación
  aprobada.
- El historial de las miniaturas desaparecía sin título principal.
- Comparación desfasada si la pieza cambiaba mientras llegaba; bloques sin título y capítulos sin nombre sin texto; el
  error de `kind` no válido nombraba `version`; decisiones de US5 sin registrar (94 a 98).

Corregidos (segunda vuelta, lógica y fidelidad):
- La idea con un título que ya no está no se podía editar (400): el título solo se comprueba si cambia (decisión 96).
- «Opinión de la IA» en todo, también en lo del creador: va por elemento (decisión 99).

Descartados:
- Volver a una versión igual a la actual con otro número crea una versión: es lo que dice el contrato y hace la 005
  (decisión 97).
- Una fila antigua que ya no se lee da un error interno al abrirla: igual que en la 005; la lista sí se protege.

Abiertos (menores):
- Las etiquetas que solo cambian de mayúsculas salen como iguales (decisión 94).
- Las ideas de miniatura se llaman todas «Idea de miniatura» en la comparación (decisión 98): para la pasada con Design.
- Mientras se vuelve a una versión, guardar otra pieza del paso puede dar un 409 que la pantalla ya explica; no se
  pierde nada.

### 6. Desviaciones

De más: la marca de la IA por elemento y el aviso de la idea para un título que ya no está. De menos: ninguna.

### 7. Decisiones

Agente: 94 a 99, todas Medio (efecto visible o texto de interfaz). Pendientes del creador: ninguna.

### 8. Constitución

II (ninguna versión se pierde; lo de la IA se marca como su opinión; avisar antes de dejar algo sin aprobar), III (el
historial no gasta), VI (teclado, foco y axe), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones nuevas: `restored_from` y `recuperada` ya existían.
Polish (T068–T074) se cierra en la sección siguiente.

## Polish (T068–T074), Puerta A del 2026-11-13

### 1. Resumen

Se cierran los casos límite que faltaban (T069), las comprobaciones de glosario, secretos y YouTube (T070), el
quickstart (T071), la auditoría de novato (T072, cinco rondas, cerrada por el creador con 4 medios abiertos) y el estado
en `CLAUDE.md` y el `README.md` (T073). T068 (IA real) no se ejecuta: espera la autorización del creador (C1).

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T068 prueba con IA real (SC-001, SC-002) | No ejecutado | Necesita la autorización del creador; consta como pendiente C1 en `decisions.md` | 2026-11-13 |
| T069 casos límite | Cumplido | `apps/server/test/http/packages-edge.test.ts` (13 pruebas): guion aprobado otra vez con otro texto, datos pendientes en el guion, idea a «hecha», «archivada» o «banco», límite de gasto, seis fallos tipados de la IA y la parte fija por canal. Los demás casos ya los cubren otros tests (lo dice la cabecera del fichero) | 2026-11-13 |
| T070 glosario, secretos y YouTube | Cumplido | `glossary.test.ts` pasa con los textos nuevos; `secrets-leak.spec.ts` sin cambios y en verde en el e2e; ningún servicio ni ruta de paquetes importa un cliente de YouTube (solo leen las cifras de `publish/youtube.json`) | 2026-11-13 |
| T071 quickstart | Cumplido | Cada recorrido, en su prueba: 1 y 1b, e2e US1; 2, e2e US1 (estado vacío y «Ir a mis guiones»); 3, e2e US2 y `description.test.ts` (SC-004); 4, `packages-texts.test.ts` (SC-005); 5, e2e US2 y `packages-texts.test.ts` («Usar la nueva»); 6 y 7, e2e US3; 8, e2e US4; 9, e2e US5 y `packages-versions.test.ts` (SC-008); 10, `packages-base` y `packages-approve`. Garantías: `chapters.test.ts` (SC-003), `review.test.ts` (30 capítulos en menos de 1 s, SC-007) | 2026-11-13 |
| T072 auditoría de novato | Cumplido por decisión del creador | `novice-audit.md`: rondas 1 a 5; la 5 con 0 graves y 4 medios abiertos, cerrada así por el creador (decisión 112). Tiempo del guion aprobado al paquete copiado: de 126 a 236 s con la herramienta; las auditoras calculan de 10 a 25 minutos para una persona real (SC-001 con IA real, no comprobado) | 2026-11-13 |
| T073 `CLAUDE.md` y `README.md` | Cumplido | El README dice qué prepara la publicación y que YTCreator nunca sube nada a YouTube | 2026-11-13 |
| T074 Puerta A | Cumplido | Este informe | 2026-11-13 |

### 3. Cómo se comprobó

- `fnm exec --using=24 -- pnpm lint`, `typecheck` y `test`: pasan (196 ficheros, 2585 pruebas, 4 saltadas).
- `fnm exec --using=24 -- pnpm test:e2e`: pasan (catálogo 97 y 2 saltadas; app 54), código de salida 0.
- Cinco rondas de auditoría con el agente `usuario-novato`, cada una sobre la app recompilada en un puerto y una carpeta
  nuevos del scratchpad, con la IA y YouTube falsos.

### 4. Controles

- Pasados: lint, typecheck, unitarias, e2e (axe en claro y oscuro a 375 y 1280 px dentro de `publish.spec.ts`), glosario,
  `secrets-leak`, fallos tipados de la IA (`packages-edge.test.ts`).
- No ejecutados: `test:installer` (Polish no toca el instalador); T068 con IA real (sin autorización).
- E2E nuevos: guion listo en «Mis publicaciones», preguntar al salir sin guardar, «Aprobar» apagado con una idea en
  edición y diciendo qué falta, el diálogo enumera los avisos y «Revisar los avisos» lleva a ellos, «Corregirlo» deja el
  foco en la pieza.

### 5. Hallazgos

Revisores (una vuelta, los cuatro):
- Corregidos: el título propio sin añadir no contaba como cambio sin guardar; varios botones principales en «Mis
  publicaciones»; títulos `h2` dentro de un `h2` y una lista vacía; un fallo de la lista de guiones tumbaba la pantalla;
  el estado vacío daba un consejo imposible; el README decía «miniatura» (la app propone ideas); el contrato de pantallas
  no recogía los cambios; T068 no constaba como pendiente; la decisión 100 citaba mal de dónde sale la guarda; la prueba
  de la idea fuera de la cola no probaba «hecha»; la del límite de gasto no miraba los estados HTTP.
- Descartados: abrir «Editar» sin cambiar nada cuenta como cambio sin guardar (es una edición abierta; preguntar es lo
  seguro); el diálogo de avisos no cita la fuente de cada cifra (la cita la sección a la que lleva); la decisión 101 añade
  comportamiento no pedido (arregla un medio de la auditoría, que la constitución IX exige pasar, como hizo la 005 con sus
  decisiones 48 a 50; queda en el contrato).
- Los graves de proceso («se da por cerrado sin auditoría ni informe») eran del momento de la revisión: este informe y
  la decisión 112 los cierran.

Auditoría: ver `novice-audit.md`. Abiertos: el indicador de pasos, la portada que no lleva a las listas, resaltar el
elemento exacto en «Corregirlo» y los menores, para la pasada de interfaz con modo Design.

### 6. Desviaciones

De más: «Mis publicaciones» lista los guiones aprobados sin publicación (decisión 101); la guarda de cambios sin guardar
y «Aprobar» que dice qué falta (100, 105, 106); «Corregirlo» lleva a la pieza (109). De menos: T068.

### 7. Decisiones

Agente: 100 a 111 (Medio, salvo 104 y 111, Bajo). Creador: 112 (cerrar la auditoría así). Pendiente del creador: C1
(T068 con IA real).

### 8. Constitución

II (nada se pierde sin preguntar; lo aprobado es lo guardado), III (abrir una publicación desde la lista no gasta), VI
(foco, teclado y axe), IX (auditoría de novato, cerrada por el creador), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de Polish. No hay migraciones. Pendiente: la pasada de
interfaz con modo Design para los medios y menores abiertos.


## Prueba real (T068), 2026-11-14

Autorizada por el creador (decisión 113, C1 resuelto) y ejecutada en su terminal con la suscripción de Claude Code; la
API no se llamó. Prueba: `apps/server/test/real/package-ai.real.test.ts` (`pnpm test:real-ai -t "publishing package"`).
El canal se prepara con la IA falsa, como en el resto de pruebas; desde el guion, cada encargo va a Claude Code real con
los prompts, entradas y esquemas de la aplicación, a través de los servicios reales. Resultado: **pasa** (1 prueba, 90 s).

### Encargos

| Encargo | Resultado | Tiempo | Tokens (entrada/salida) |
|---------|-----------|--------|-------------------------|
| `escaleta` (005) | hecho | 14 s | 2 / 1271 |
| `guion` (005) | hecho | 30 s | 2 / 3318 |
| `titulos` | hecho | 8 s | 2 / 761 |
| `miniaturas` | hecho | 8 s | 2 / 857 |
| `descripcion` (descripción, capítulos, etiquetas y comentario) | hecho | 8 s | 2 / 988 |
| `enfoques_short` (005) | hecho | 6 s | 2 / 465 |
| `guion_short` (005) | hecho | 8 s | 2 / 876 |
| `paquete_short` | hecho | 8 s | 2 / 907 |

**Coste real:** 0 € en todas las llamadas; gastan cupo de la suscripción, no dinero. La entrada que informa la CLI
(2 tokens) no cuenta la parte en caché, así que no mide el tamaño real del contexto; la salida sí es la real.

### Criterios de éxito

| Criterio | Resultado | Evidencia |
|----------|-----------|-----------|
| SC-001: paquete en menos de 15 minutos | Cumplido en la parte de la máquina | Vídeo largo: 24 s de IA y servidor (títulos, miniaturas y textos). Short: 8 s. No incluye lo que tarda una persona en leer y elegir |
| SC-002: 100 % de títulos dentro del máximo de YouTube (100) | Cumplido | 7 de 7 en el vídeo largo y 4 de 4 en el Short |
| SC-002: al menos la mitad caben en el móvil (70, cifra supuesta) | Cumplido | 11 de 11; el más largo tiene 64 caracteres |

### Calidad observada

- Títulos: variados y fieles al guion; cada uno da un porqué concreto (cuatro ingredientes, tres señales del reposo,
  olla con tapa).
- Miniaturas: tres conceptos con escena, texto grande, emoción y colores con contraste explicado. La revisión avisó de
  `miniatura_repite_titulo` porque el primer concepto («SIN AMASAR») repite el título elegido: funciona como se diseñó.
- Textos del vídeo largo: seis capítulos desde 0:00 que cuadran con el guion, 15 etiquetas, un comentario fijado con
  pregunta y la descripción montada en 1054 caracteres con enlace de suscripción.
- Short: portada en un momento del guion con texto en pantalla, tres hashtags, y una descripción que nombra el vídeo
  largo por su título. La revisión no dio avisos.
- `sin_fuentes` en los dos paquetes: es lo esperado, porque la prueba no hace investigación.

### Lo que no cubre

- La API de Anthropic, que es secundaria (005, T087) y no se llamó.
- YouTube real: las medidas del nicho son las falsas.
- Lo que tarda una persona en leer y elegir; SC-001 solo se mide en la parte de la máquina.

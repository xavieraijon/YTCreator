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

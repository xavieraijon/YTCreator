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
encontraron un grave (cifras sin comprobar) y varios medios; están corregidos. Queda una pregunta para el creador (P1).

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

Abiertos: ninguno grave ni medio. La regla de «Pedir otros» queda provisional hasta que el creador conteste P1. Tercera
vuelta: no se lanzó otra revisión; las correcciones de la segunda llevan cada una su test.

### 6. Desviaciones

De más: los avisos arriba con su acción (estaba en `ui-screens.md`, sin tarea) y el código de campo `lleno`. De menos: la
portada de un Short, que llega con US4.

### 7. Decisiones

Agente: 25 a 37 (medio: 27, 28 y 30 a 37, destacadas aquí; bajo: 26 y 29). Pendiente del creador: P1 (qué pasa
con las propuestas de la IA que no eligió al pedir otras); la 25 queda provisional con la opción recomendada.

### 8. Constitución

II (lo del creador nunca lo cambia la IA, y lo que reescribe deja de ser de la IA), III (coste antes de pedir, y nada se
paga si no cabe), IV (salidas validadas, una dirección web no valida), V (cifras comprobadas, supuestos marcados), VI
(teclado y foco), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones. Queda pendiente: P1, y US2 en adelante.

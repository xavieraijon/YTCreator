---
description: "Lista de tareas de la feature 004: banco de ideas"
---

# Tasks: Banco de ideas con detección de temas quemados

**Input**: Documentos de diseño en `/specs/004-idea-bank/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: SÍ. La constitución (principio IX) pide que la lógica de dominio tenga tests escritos antes o junto al
código. Cada tarea de test va antes que su implementación y debe fallar al principio.

**Organization**: Las tareas van agrupadas por historia de usuario, para que cada una se pueda implementar y probar por
separado.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US4)
- **[A]**: tarea de Puerta A que cierra una fase o historia (principio XI)
- Cada descripción lleva la ruta exacta del fichero

## Convenciones comunes

- **Idiomas:** código, identificadores y nombres de fichero en inglés; textos de interfaz, prompts y documentos en
  español.
- **Sin servicios reales:** ningún test llama a una IA ni a YouTube de verdad. Se usan el proveedor `fake`
  (`YTCREATOR_FAKE_AI=<escenario>`) y el YouTube `fake` (`YTCREATOR_FAKE_YOUTUBE=1`, escenarios en
  `packages/youtube/src/fake/scenarios.ts`).
- **Códigos, no textos:** el servidor devuelve códigos y la web los traduce en `apps/web/src/strings/ideas.es.ts`.
- **Comandos con Node 24:** `fnm exec --using=24 -- pnpm lint|typecheck|test|test:e2e`. **No hay que ejecutar
  `pnpm format` global**, porque reformatea `packages/youtube/test/fixtures/fake-yt-dlp`: se formatean solo los ficheros
  tocados.
- **Si cambia un prompt:** hay que borrar `node_modules/.vitest-cache` antes de `test`.
- **Al cerrar cada fase o historia:** `/puerta-a` y commit (`feat(004): …`).

---

## Phase 1: Setup

**Purpose**: Dejar preparados los sitios donde va el código nuevo.

- [ ] T001 Crear `packages/core/src/ideas/index.ts` y exportarlo desde `packages/core/src/index.ts`. Crear `packages/core/src/api/ideas.ts` (vacío, con su export) y exportarlo desde `packages/core/src/api/index.ts`
- [ ] T002 [P] Crear `apps/web/src/strings/ideas.es.ts` con el objeto `ideasEs` vacío, y añadirlo a la lista de catálogos del test de glosario (buscar dónde se registra `channel.es.ts` en `apps/web/test`)

---

## Phase 2: Foundational

**Purpose**: Lo que necesitan todas las historias: modelo, migración, repos, umbrales y la ruta base del banco.

**⚠️ CRITICAL**: Ninguna historia empieza antes de cerrar esta fase.

- [ ] T003 [P] Test de modelo en `packages/core/test/ideas/model.test.ts`: `IDEA_STATUSES = ['banco','elegida','hecha','archivada']`, `IDEA_FORMATS = ['largo','short']`, `IDEA_ORIGINS = ['ia','creador','otro_enfoque']`, y el esquema `ideaDraftSchema` con `title` de 1 a 120 caracteres, `hook` de 1 a 300, `format` del enum y `query`, `broadQuery` y `queryEn` de 1 a 120 cada una, sin comillas
- [ ] T004 Implementar `packages/core/src/ideas/model.ts` para que pase T003, con los tipos `Idea`, `IdeaDraft` e `IdeaStatus`
- [ ] T005 [P] Test de migración en `apps/server/test/db/migration-0005.test.ts`. Se parte de una base con las migraciones 0001 a 0004 y un `background_job` de cada `kind`, y al aplicar 0005:
  - se conservan todas sus filas;
  - se admiten `kind = 'medir_ideas'` y `channel_id`;
  - existen `idea_batch`, `idea` e `idea_measure` con las columnas y restricciones de `data-model.md`. Entre ellas: `status IN ('banco','elegida','hecha','archivada')`, `format IN ('largo','short')`, `origin IN ('ia','creador','otro_enfoque')` y `verdict IN ('hueco','competido','quemado','frio')` o nulo.
- [ ] T006 Escribir `apps/server/src/db/migrations/0005_idea_bank.sql`, que pasa T005. Rehace `background_job` en una transacción (crear `background_job_new`, copiar, borrar, renombrar y recrear índices) y crea los índices `(channel_id, status, position)` y `(channel_id, queue_position)`
- [ ] T007 [P] Tests de repos en `apps/server/test/db/ideas-repo.test.ts`:
  - crear, leer por canal en orden de `position` (sin archivadas) y editar, con estas reglas:
    - `revision` sube solo al cambiar título, gancho, pilar, formato o búsquedas;
    - `original` no cambia;
    - `updated_at` se actualiza;
  - `setStatus`: `elegida` pone la idea al final de la cola, y salir de `elegida` deja `queue_position` en nulo y vuelve a numerar;
  - `reorder` y `reorderQueue`;
  - `idea_measure` guarda una medida y la última es la que vale;
  - `idea_batch` guarda `decisions`.
- [ ] T008 Implementar `apps/server/src/db/repos/ideas.ts`, `apps/server/src/db/repos/idea-batches.ts` y `apps/server/src/db/repos/idea-measures.ts`, que pasan T007, y añadir `medir_ideas` y `channel_id` a `apps/server/src/db/repos/jobs.ts` (o donde viva el repo de `background_job`)
- [ ] T009 [P] Añadir a `packages/knowledge/market/thresholds.json` (subir `version` a 5 y `reviewedAt`) el bloque `ideas`: `{searchResults: 40, broadResults: 20, similarHigh: 12, similarLow: 5, recentDays: 90, recentBurst: 4, datedSample: 12, deadMedianViews: 1000, audienceViews: 100000, audienceVideos: 2, keywordShare: 0.75, staleDays: 30, opportunity: {englishBigVideos: 2, maxSimilar: 5}}`. Su fuente propia es `{label: 'Supuesto de YTCreator, sin estudio que lo respalde (primera versión del proyecto de referencia, 2026-09-27)', assumption: true}`. Ampliar el esquema y los tests de `packages/knowledge/src/market.ts` y `packages/knowledge/test/market.test.ts`
- [ ] T010 [P] Esquemas de API en `packages/core/src/api/ideas.ts` (`IdeaView`, `IdeaMeasureView`, `IdeaBatchView` y los cuerpos de [http-api](./contracts/http-api.md)), con su test en `packages/core/test/api/ideas.test.ts`
- [ ] T011 Test de servidor en `apps/server/test/http/ideas-base.test.ts`:
  - `GET /api/channels/:id/ideas` sin perfil aprobado da `409` con `fields: {profile: 'sin_perfil'}`;
  - con perfil, da `{ideas: [], queue: [], profileVersion, pendingBatch: null, runningJob: null}`;
  - canal ajeno o inexistente: `404`.
- [ ] T012 Implementar `apps/server/src/services/ideas.ts` (vista de una idea con `stale`, `fromOlderProfile` y `measuredOlderRevision`) y `apps/server/src/http/routes/ideas.ts` con `GET .../ideas`, montado en el servidor como las rutas de `channel.ts`, para que pase T011
- [ ] T013 [P] Cliente `ideasApi` en `apps/web/src/api/client.ts` con `list`, y la ruta `/canal/ideas` en el router de la web con una pantalla `apps/web/src/screens/channel/ideas/IdeaBank.tsx` que, por ahora, enseña el título, el «por qué importa» y el aviso sin perfil
- [ ] T014 [A] Puerta A de Foundational: ejecutar `/puerta-a 004 Foundational`. No se marca `[X]` hasta que la skill diga «pasada»; el informe queda en `checklists/validation.md`

**Checkpoint**: Hay base de datos, repos, umbrales y la pantalla vacía.

---

## Phase 3: User Story 1 - Llenar el banco con ideas que encajan (Priority: P1) 🎯 MVP

**Goal**: La IA propone tandas sobre el perfil; el creador se queda, descarta, escribe y edita ideas.

**Independent Test**: Con IA falsa y perfil aprobado: pedir ideas, quedarse dos, descartar el resto y escribir una propia. Hay tres en el banco y siguen ahí tras reiniciar.

### Tests de US1

- [ ] T015 [P] [US1] Test de salidas en `packages/core/test/ideas/outputs.test.ts`:
  - `ideasOutput`: de 6 a 10 `IdeaDraft`; `pillar` tiene que ser uno de los pilares dados (fábrica `ideasOutputFor(pillars)`), sin distinguir mayúsculas;
  - `busquedasOutput`: `{query, broadQuery, queryEn}`.
- [ ] T016 [P] [US1] Test de repetidas en `packages/core/test/ideas/repeats.test.ts`: `dropRepeats(candidates, existing)` quita las que repiten título normalizado o `query` normalizada (con `normalizeName` de `packages/core/src/market/names.ts`) y devuelve las que quedan y cuántas quitó
- [ ] T017 [P] [US1] Test de contrato del uso `ideas` en la batería de IA (`packages/ai/test/contract/`), con el proveedor falso: salida válida; `pilar_invalido` (la primera no valida y el reintento sí); `cifras_inventadas` con `claimsTrimmed`; y los cinco fallos tipados
- [ ] T018 [P] [US1] Test de servidor en `apps/server/test/http/ideas-batch.test.ts`:
  - `POST .../ideas/estimate` con `use: 'ideas'` da un `Estimate`;
  - `POST .../idea-batches` da 6–10 candidatas, y con `ideas_repetidas` quita 2 y devuelve `removedRepeats: 2`;
  - `POST /api/idea-batches/:id/decide` crea las elegidas al final del banco con `origin: 'ia'`, `batch_id` y `profile_version`;
  - un índice ya decidido da `409`;
  - pedir otra tanda descarta las pendientes de la anterior;
  - el `input` del uso lleva `avoid` con las ideas del banco, las archivadas y las descartadas (hasta 200);
  - límite de gasto: `limite_de_gasto` sin gastar.
- [ ] T019 [P] [US1] Test de servidor en `apps/server/test/http/ideas-own.test.ts`:
  - `POST .../ideas` con `{title, format}` da `201`, `origin: 'creador'` y `duplicateOf` cuando el título normalizado ya existe;
  - `PATCH /api/ideas/:id` con una `revision` vieja da `409` con la idea actual;
  - editar sube la `revision` y conserva `original`;
  - los límites de `data-model.md`: `title` de 1 a 120, `hook` de 0 a 300 y `notes` de 0 a 2.000 (`400 validacion`).

### Implementación de US1

- [ ] T020 [US1] Implementar `packages/core/src/ideas/outputs.ts` y `packages/core/src/ideas/repeats.ts` (pasan T015 y T016), y añadir `ideas`, `otro_enfoque` y `busquedas_idea` a `AI_USES` en `packages/core/src/ai/uses.ts`
- [ ] T021 [US1] Prompt `packages/knowledge/prompts/ideas/v1.md` según [ai-uses](./contracts/ai-uses.md): fijo, en español, con `writing/human.md`, sin pedir cifras, sin repetir `avoid`, y respetando el formato del perfil. Actualizar `packages/knowledge/prompts/lock.json` y los tests de `packages/knowledge/test/prompts.test.ts`
- [ ] T022 [US1] Perfil por proveedor del uso `ideas` (tope de salida 3.000 tokens, 90 s) en el registro de `packages/ai`, y salidas del proveedor falso: `ok`, `ideas_repetidas`, `pilar_invalido` y `cifras_inventadas`. Pasa T017
- [ ] T023 [US1] Rutas `POST .../ideas/estimate`, `POST .../idea-batches` y `POST /api/idea-batches/:id/decide` en `apps/server/src/http/routes/ideas.ts`, con `ai-run.ts`, el presupuesto (reintento reservado), `claims.ts` y `dropRepeats`. Pasa T018
- [ ] T024 [US1] Rutas `POST .../ideas` y `PATCH /api/ideas/:id` (campos y `revision`) en `apps/server/src/http/routes/ideas.ts`. Pasa T019
- [ ] T025 [P] [US1] Test de pantalla en `apps/web/test/ideas/batch.test.tsx`:
  - con el banco vacío, la acción principal es «Proponer ideas de vídeo» con el coste;
  - la tanda tiene «Me la quedo», «No me interesa», «Quedarme con todas» y «Proponer otras» con indicaciones;
  - sale el aviso de repetidas;
  - «Escribir una idea mía» con título y formato;
  - el aviso de duplicada.
- [ ] T026 [US1] Pantallas `apps/web/src/screens/channel/ideas/IdeaBatch.tsx`, `IdeaEditor.tsx` y `IdeaCard.tsx` (título, gancho, pilar, formato, origen y «Cambiar algo»), con los textos en `apps/web/src/strings/ideas.es.ts`. Usan `useEstimate` y el patrón de `AiAction` de la 003. Pasa T025
- [ ] T027 [US1] Entrada desde la pantalla del canal: en `apps/web/src/screens/channel/start/Start.tsx`, la frase `nextStep` de `apps/web/src/strings/channel.es.ts` pasa a ser el botón «Ir al banco de ideas» con el perfil aprobado. Actualizar su test y el e2e que busca la frase vieja
- [ ] T028 [US1] e2e en `apps/web/e2e/ideas.spec.ts` (US1): desde el canal, ir al banco, proponer, quedarse 2, descartar el resto y escribir una propia; recargar y comprobar que siguen; axe en claro y oscuro a 375 y 1280 px
- [ ] T029 [A] [US1] Puerta A de US1: ejecutar `/puerta-a 004 US1`. No se marca `[X]` hasta que la skill diga «pasada»

**Checkpoint**: El banco ya sirve: ideas de la IA y propias.

---

## Phase 4: User Story 2 - Saber si una idea está quemada antes de hacerla (Priority: P1)

**Goal**: «¿Tiene hueco?» y «Medir todas», con semáforo, frase, evidencia, fuente, fecha, supuesto y oportunidad en inglés.

**Independent Test**: Con YouTube falso, las ideas con búsquedas preparadas dan los cuatro semáforos, un fallo y una oportunidad, con su evidencia.

### Tests de US2

- [ ] T030 [P] [US2] Test en `packages/core/test/ideas/similar.test.ts`:
  - `keywordsOf(query)` quita las palabras vacías en español e inglés y normaliza;
  - `isSimilar(title, keywords, share = 0.75)` pide el 75 % redondeado hacia arriba, con un mínimo de 2, y con una sola palabra basta con esa;
  - tildes y mayúsculas no cuentan.
- [ ] T031 [P] [US2] Test en `packages/core/test/ideas/figures.test.ts`, que comprueba `ideaFigures({hits, broadHits, format, thresholds, now})`:
  - filtra por formato (`short` ≤ 180 s, `largo` > 180 s);
  - cuenta `similar`, y `dated` y `recent` sobre los 12 primeros;
  - `medianViews` y `maxViews` ignoran los nulos;
  - `broadTopViews` y `broadBigVideos`;
  - `hasAudience`;
  - `partial` si falta la fecha en más de la mitad de la muestra.
- [ ] T032 [P] [US2] Test en `packages/core/test/ideas/verdict.test.ts`: los ocho `reason` de [idea-measure](./contracts/idea-measure.md), en el orden de R3, con los bordes de cada umbral: 5 y 6, 11 y 12, `recent` 3 y 4, mediana 999 y 1.000, y `hasAudience` verdadero y falso
- [ ] T033 [P] [US2] Test en `packages/core/test/ideas/opportunity.test.ts`:
  - `englishOpportunity({similar, englishHits, thresholds})` da oportunidad con 2 o más vídeos en inglés de 100.000 visitas o más y 5 o menos casi iguales en castellano;
  - devuelve los 5 vídeos en inglés con más visitas;
  - sin `englishHits` devuelve `null`.
- [ ] T034 [P] [US2] Escenarios del YouTube falso en `packages/youtube/src/fake/scenarios.ts` y su test de contrato en `packages/youtube/test/fake.contract.test.ts`: `idea con hueco`, `idea competida`, `idea quemada` (12 casi iguales, 4 recientes), `idea agotada`, `idea fria`, `idea oportunidad` (con su búsqueda en inglés) e `idea bloqueado`
- [ ] T035 [P] [US2] Test del servicio en `apps/server/test/services/idea-measure.test.ts`, que comprueba que:
  - cada idea hace sus tres búsquedas (dos sin `queryEn`);
  - el castellano lleva fechas, y el tema general y el inglés no;
  - se guarda `idea_measure` con `idea_revision`, `queries`, `source`, `thresholds_version` y `partial`;
  - con `sin_datos` en castellano, `similar = 0` y el semáforo se calcula;
  - con `bloqueado`, `no_disponible`, `cupo_agotado`, `tiempo_agotado` o `no_encontrado` en castellano o en el tema general, la medida es `fallida` con ese `failure`;
  - un fallo en inglés solo quita la oportunidad;
  - una idea sin `query` se salta y se cuenta;
  - `fresh` salta la caché.
- [ ] T036 [P] [US2] Test de servidor en `apps/server/test/http/ideas-measure.test.ts`:
  - `POST .../idea-measures/estimate` da `units: null` con yt-dlp y, con la Data API, 303 por idea con `queryEn` y 202 sin él;
  - `POST .../idea-measures` da `202 {jobId}`, y con otro en curso, `409` con su `jobId`;
  - los eventos SSE `item` llevan `{ideaId, measure}`;
  - tras reiniciar, el trabajo queda `interrumpido` y `GET .../ideas` lo refleja;
  - una medida de más de 30 días da `stale: true`, y una de otra `revision`, `measuredOlderRevision: true`.

### Implementación de US2

- [ ] T037 [US2] Implementar `packages/core/src/ideas/similar.ts`, `figures.ts`, `verdict.ts` y `opportunity.ts`, que pasan T030 a T033
- [ ] T038 [US2] Escenarios del YouTube falso (pasa T034)
- [ ] T039 [US2] Servicio `apps/server/src/services/idea-measure.ts`: trabajo `medir_ideas` con `channel_id`; las ideas una tras otra; las tres búsquedas a la vez con el límite de procesos de la 003; progreso `{done, total, ideaIds}`; e `item` por SSE. Recuperarlo tras reiniciar en `apps/server/src/services/jobs.ts`. Pasa T035
- [ ] T040 [US2] Rutas `POST .../idea-measures/estimate` y `POST .../idea-measures` en `apps/server/src/http/routes/ideas.ts`, y `runningJob` en `GET .../ideas`. Pasa T036
- [ ] T041 [P] [US2] Test de pantalla en `apps/web/test/ideas/measure.test.tsx`:
  - «¿Tiene hueco?» y «Medir todas», con el aviso de unidades si hay Data API;
  - el `Semaphore` con la frase de cada `reason`;
  - el `DataSource` con la fuente, la fecha y el sello de supuesto;
  - «Ver los vídeos parecidos» plegado;
  - la oportunidad con sus vídeos en inglés;
  - los avisos «Medida antigua», «Medida de una versión anterior de la idea» y el de la parte en inglés que falta;
  - un fallo con el texto y la acción de `youtube-failures.es.ts`;
  - el progreso y «Seguir midiendo».
- [ ] T042 [US2] Pantallas `apps/web/src/screens/channel/ideas/IdeaMeasure.tsx` y la parte de medida de `IdeaCard.tsx` e `IdeaBank.tsx`, con `useJob` de la 003 y una región `aria-live` educada. Las búsquedas van en «Modo experto» dentro de `IdeaEditor.tsx`. Para una idea propia sin búsquedas, «Medir con el título» usa `title` como `query` y el pilar del perfil como `broadQuery`. Textos en `ideas.es.ts`, con el glosario («clon» y «tema amplio» prohibidos). Pasa T041
- [ ] T043 [US2] Uso `busquedas_idea`:
  - prompt `packages/knowledge/prompts/busquedas_idea/v1.md` y `lock.json`;
  - perfil (300 tokens, 30 s) y salida falsa;
  - test de contrato en la batería de IA;
  - ruta `POST /api/ideas/:id/queries` (sube la `revision`), con su test en `apps/server/test/http/ideas-own.test.ts`;
  - botón «Preparar la medida · {coste}» en `IdeaEditor.tsx`.
- [ ] T044 [US2] e2e en `apps/web/e2e/ideas.spec.ts` (US2):
  - medir las ideas con búsquedas preparadas;
  - ver los cuatro semáforos, el fallo y la oportunidad;
  - cerrar la pestaña a media «Medir todas» y volver;
  - axe en claro y oscuro.
- [ ] T045 [A] [US2] Puerta A de US2: ejecutar `/puerta-a 004 US2`

**Checkpoint**: Cada idea se puede medir con evidencia.

---

## Phase 5: User Story 3 - El ángulo de al lado para una idea quemada (Priority: P2)

**Goal**: «Buscar otro enfoque» da 2–3 variantes que entran en el banco enlazadas a la original.

**Independent Test**: Con IA falsa y una idea quemada: pedir otro enfoque, ver 3 variantes con su motivo y quedarse una, que entra «sin medir» enlazada a la original.

- [ ] T046 [P] [US3] Test en `packages/core/test/ideas/outputs.test.ts`: `anglesOutputFor(pillars)` pide de 2 a 3 variantes con `why` de 1 a 300 caracteres, y no valida un `why` que diga «tiene hueco» (o «hay hueco»)
- [ ] T047 [P] [US3] Test de contrato del uso `otro_enfoque` en la batería de IA, con el proveedor falso
- [ ] T048 [P] [US3] Test de servidor en `apps/server/test/http/ideas-angles.test.ts`:
  - `estimate` con `otro_enfoque` sin medida quemada o competida da `400` con `ideaId: 'sin_medida_quemada'`;
  - `POST /api/ideas/:id/angles` da un `IdeaBatchView` de tipo `otro_enfoque`;
  - el `input` lleva los títulos de los casi iguales (hasta 12);
  - `decide` crea la idea con `origin: 'otro_enfoque'`, `source_idea_id` y sin medida.
- [ ] T049 [US3] Implementar el uso: esquema en `packages/core/src/ideas/outputs.ts`; prompt `packages/knowledge/prompts/otro_enfoque/v1.md` y `lock.json`; perfil (1.500 tokens, 60 s) y salida falsa; y la ruta `POST /api/ideas/:id/angles` en `apps/server/src/http/routes/ideas.ts`. Pasa T046 a T048
- [ ] T050 [P] [US3] Test de pantalla en `apps/web/test/ideas/angles.test.tsx`:
  - «Buscar otro enfoque · {coste}» solo aparece con `quemado` o `competido`;
  - las variantes salen con su motivo marcado como opinión de la IA;
  - quedarse una la añade como «Otro enfoque de …».
- [ ] T051 [US3] Pantalla: la acción en `IdeaCard.tsx` y las variantes con `IdeaBatch.tsx` en modo `otro_enfoque`. Pasa T050
- [ ] T052 [US3] e2e en `apps/web/e2e/ideas.spec.ts` (US3), con axe
- [ ] T053 [A] [US3] Puerta A de US3: ejecutar `/puerta-a 004 US3`

---

## Phase 6: User Story 4 - Ordenar el banco y elegir la próxima idea (Priority: P2)

**Goal**: orden, filtros, estados, cola de próximos vídeos, archivo y descarga.

**Independent Test**: Con un banco grabado: reordenar con teclado, filtrar las verdes, elegir dos para guion, archivar y recuperar. Al recargar, todo sigue igual.

- [ ] T054 [P] [US4] Test en `packages/core/test/ideas/order.test.ts`: `checkOrder(ids, current)` exige el mismo conjunto, sin repetir; `moveUp` y `moveDown` no salen de los bordes
- [ ] T055 [P] [US4] Test de servidor en `apps/server/test/http/ideas-order.test.ts`:
  - `PUT .../ideas/order` y `PUT .../ideas/queue` (`400` si falta o sobra alguna);
  - `PATCH` de estado según el diagrama de `data-model.md`: elegir pone al final de la cola, salir de `elegida` vuelve a numerar, `archivada` pasa a `GET .../ideas/archived` y recuperar la vuelve a `banco`;
  - no hay ninguna ruta que borre.
- [ ] T056 [P] [US4] Test de exportación en `apps/server/test/http/ideas-export.test.ts`:
  - `GET .../ideas/export?format=json` sigue el formato de `data-model.md` (`version: 1`, la medida con `assumption: true` y `thresholdsVersion`);
  - el `.md` lleva la cola, luego el banco y luego las hechas, sin las archivadas;
  - las dos respuestas llevan `Content-Disposition`.
- [ ] T057 [US4] Implementar `packages/core/src/ideas/order.ts`, las rutas de orden, cola, estados, archivadas y exportación en `apps/server/src/http/routes/ideas.ts`, y la exportación en `apps/server/src/services/ideas.ts`. Pasa T054 a T056
- [ ] T058 [P] [US4] Test de pantalla en `apps/web/test/ideas/queue.test.tsx`:
  - «Próximos vídeos» en orden, con «Subir», «Bajar» y «Quitar de la cola»;
  - la nota de que el guion llegará después;
  - los filtros de estado, formato y semáforo, y «Quitar filtros»;
  - «Archivadas» plegado, con «Recuperar»;
  - «Descargar como documento» y «Descargar como datos»;
  - el nombre accesible de cada botón de orden lleva el título de la idea.
- [ ] T059 [US4] Pantallas `apps/web/src/screens/channel/ideas/IdeaQueue.tsx`, más filtros, orden y archivo en `IdeaBank.tsx`. Después de mover, el foco se queda en el mismo botón y se anuncia «Movida a la posición {n}». Pasa T058
- [ ] T060 [US4] e2e en `apps/web/e2e/ideas.spec.ts` (US4): reordenar con teclado, filtrar, elegir dos, archivar, recuperar, recargar y descargar; axe en claro y oscuro a 375 y 1280 px
- [ ] T061 [A] [US4] Puerta A de US4: ejecutar `/puerta-a 004 US4`

---

## Phase 7: Polish & Cross-Cutting

- [ ] T062 [P] Aviso «Propuesta con una versión anterior de tu perfil» (`fromOlderProfile`), con su test de servidor y de pantalla
- [ ] T063 [P] Revisar que los textos nuevos pasan el glosario y el test de fuga de secretos (`secrets-leak.spec.ts`) sin cambios
- [ ] T064 Recorrer el [quickstart](./quickstart.md) entero con IA y YouTube falsos y guardar el resultado en `checklists/validation.md`
- [ ] T065 Auditoría de novato del banco con el agente `usuario-novato`, en `specs/004-idea-bank/novice-audit.md`. Los menores visuales van a la pasada del modo Design; los que bloquean se corrigen aquí
- [ ] T066 Actualizar `CLAUDE.md` (estado de la 004) y `README.md` si cambia algo de cara al creador
- [ ] T067 [A] Puerta A de Polish: ejecutar `/puerta-a 004 Polish`

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → historias.
- **US1 (3)** es el MVP. **US2 (4)** depende de que existan ideas (US1), aunque sus funciones de dominio (T030–T033,
  T037) se pueden hacer en paralelo con US1.
- **US3 (5)** depende de US2 (necesita una idea medida).
- **US4 (6)** solo depende de Foundational y US1, y puede ir en paralelo con US2 y US3 si se reparten ficheros
  (`IdeaQueue.tsx` y las rutas de orden son suyos).
- **Polish (7)**, al final.

## Parallel Example: US2

```text
T030 similar.test.ts   T031 figures.test.ts   T032 verdict.test.ts   T033 opportunity.test.ts
T034 escenarios del YouTube falso             T035 idea-measure.test.ts   T036 ideas-measure.test.ts
```

## Implementation Strategy

1. Setup y Foundational, con su Puerta A.
2. US1, y se para a comprobar: ya hay un banco útil (MVP).
3. US2: lo que distingue al banco. Con US1 y US2 el creador ya decide con datos.
4. US3 y US4.
5. Polish, auditoría de novato y PR cuando lo pida el creador.

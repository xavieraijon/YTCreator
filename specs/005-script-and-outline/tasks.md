---
description: "Lista de tareas de la feature 005: guion y escaleta"
---

# Tasks: Guion y escaleta

**Input**: Documentos de diseño en `/specs/005-script-and-outline/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: SÍ. La constitución (principio IX) pide que la lógica de dominio tenga tests escritos antes o junto al
código. Cada tarea de test va antes que su implementación y debe fallar al principio.

**Organization**: Las tareas van agrupadas por historia de usuario, para que cada una se pueda implementar y probar por
separado.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US7)
- **[A]**: tarea de Puerta A que cierra una fase o historia (principio XI)
- Cada descripción lleva la ruta exacta del fichero

## Convenciones comunes

- **Idiomas:** código, identificadores y nombres de fichero en inglés; textos de interfaz, prompts y documentos en
  español.
- **Sin servicios reales:** ningún test llama a una IA, a YouTube ni a internet. Se usa el proveedor `fake`
  (`YTCREATOR_FAKE_AI=<escenario>`) y un servidor local para los enlaces. Una llamada real es riesgo alto: va a P1.
- **Códigos, no textos:** el servidor devuelve códigos y la web los traduce en `apps/web/src/strings/script.es.ts`.
- **Comandos con Node 24:** `fnm exec --using=24 -- pnpm lint|typecheck|test|test:e2e`. **No hay que ejecutar
  `pnpm format` global**, porque reformatea `packages/youtube/test/fixtures/fake-yt-dlp`: se formatean solo los ficheros
  tocados.
- **Si cambia un prompt:** hay que borrar `node_modules/.vitest-cache` antes de `test`.
- **Cada uso de IA nuevo** son siempre estos pasos: añadirlo a `AI_USES` en `packages/core/src/ai/uses.ts`, su esquema a
  `CHANNEL_OUTPUTS`, su perfil en `packages/ai/src/profiles.ts` con los valores de [ai-uses](./contracts/ai-uses.md),
  `CLAIM_FIELDS: []` en `apps/server/src/services/ai-run.ts`, su salida en `packages/ai/src/fake/outputs.ts`, su prompt
  `packages/knowledge/prompts/<uso>/v1.md`, su suma en `lock.json` y su nombre para personas en `uses` de
  `apps/web/src/strings/es.ts`, que usa el registro de consumo (`UsageLog.tsx`).
- **Al cerrar cada fase o historia:** `/puerta-a` y commit (`feat(005): …`).

---

## Phase 1: Setup

**Purpose**: Dejar preparados los sitios donde va el código nuevo.

- [X] T001 Crear `packages/core/src/script/index.ts` y exportarlo desde `packages/core/src/index.ts`. Crear `packages/core/src/api/scripts.ts` (vacío, con su export) y exportarlo desde `packages/core/src/api/index.ts`
- [X] T002 [P] Crear `apps/web/src/strings/script.es.ts` con el objeto `scriptEs` vacío, y añadirlo a los catálogos de `apps/web/test/glossary.test.ts` y `apps/web/test/strings-coverage.test.ts`
- [X] T003 [P] Crear la carpeta `packages/knowledge/script/` y `packages/knowledge/src/script.ts`, exportado desde `packages/knowledge/src/index.ts`, con un lector tipado de paquetes `{version, reviewedAt, source, data}` como el de `packages/knowledge/src/market.ts`

---

## Phase 2: Foundational

**Purpose**: Lo que necesitan todas las historias: modelo, migración, repos, conocimiento y la ruta base del guion.

**⚠️ CRITICAL**: Ninguna historia empieza antes de cerrar esta fase.

- [X] T004 [P] Test de modelo en `packages/core/test/script/model.test.ts` para cada esquema de [data-model](./data-model.md): `FactsContent` de 0 a 60 hechos; `Fact.text` de 0 a 600, vacío solo si `origin=creador` y hay fuente; `label` del enum `comprobado|una_fuente|sin_confirmar|del_creador`; `Source` con `url` o `reference`, al menos uno; `OutlineContent` de 1 a 30 bloques, `title` de 1 a 120, `purpose` de 0 a 300, `type` del enum `gancho|contexto|acto|cierre`; `DraftBlock.text` de 0 a 12.000, `visual` de 0 a 500, `type` del enum `gancho|contexto|acto|cierre|desarrollo`; `Claim.status` del enum `pendiente|confirmada|corregida|sin_marca|quitada` y `Claim.reason` de `sin_respaldo|hecho_dudoso`
- [X] T005 Implementar `packages/core/src/script/model.ts` para que pase T004, con los límites: `target_seconds` largo de 180 a 1.800 y Short de 15 a un máximo que se recibe como parámetro (`core` no depende de `knowledge`; el servidor lo lee de `shorts.json`), `notes` ≤ 20.000, `sample` ≤ 4.000, `instructions` ≤ 500 y `words_per_minute` de 100 a 220
- [X] T006 [P] Test en `packages/core/test/script/status.test.ts` de `scriptStatus` (los estados `sin_empezar`, `escaleta_borrador`, `escaleta_aprobada`, `guion_borrador`, `guion_aprobado`, según la tabla de `data-model.md`; una escaleta nueva con guion escrito no cambia el estado; Short sin escaleta) y de `scriptWarnings` (`idea_cambiada`, `perfil_cambiado`, `hechos_cambiados`, `escaleta_cambiada`, `origen_cambiado`)
- [X] T007 Implementar `packages/core/src/script/status.ts` para que pase T006
- [X] T008 [P] Test en `packages/core/test/script/duration.test.ts`: `durationSeconds(texto, ppm)` (texto vacío, espacios repetidos, 150 ppm) y `expectedOutputTokens(segundos, ppm, bloques)` según R11
- [X] T009 Implementar `packages/core/src/script/duration.ts` para que pase T008
- [X] T010 [P] Test de migración en `apps/server/test/db/migration-0006.test.ts`. Se parte de una base con las migraciones 0001 a 0005 y datos en `idea` y `ai_usage`, y al aplicar 0006: se conservan todas las filas, `ai_usage.web_searches` vale 0, y existen `channel_script_settings`, `script` (con `idea_id` único) y `script_version` (con `UNIQUE(script_id, kind, version)`), con las restricciones de `data-model.md`
- [X] T011 Escribir `apps/server/src/db/migrations/0006_script.sql` para que pase T010. Solo `CREATE TABLE`, `CREATE INDEX` y `ALTER TABLE ai_usage ADD COLUMN`; no rehace ninguna tabla
- [X] T012 [P] Test de repos en `apps/server/test/db/repos/scripts.test.ts`: crear, leer por idea, unicidad por idea, listar por canal, última versión por tipo, numeración por tipo, `JSON` validado al leer y actualización solo de la última versión `marcas` si no está aprobada, rechazando cualquier cambio de texto
- [X] T013 Implementar `apps/server/src/db/repos/scripts.ts` (`script` y `channel_script_settings`) y `apps/server/src/db/repos/script-versions.ts` para que pasen T012
- [X] T014 [P] Escribir `packages/knowledge/script/craft.json`, con estructura de vídeo largo, gancho, retención y Short. Abrir cada fuente antes de citarla; la que no abra no se cita, y lo que no tenga fuente lleva `assumption: true`. `reviewedAt: 2026-11-09`
- [X] T015 [P] Escribir `packages/knowledge/script/review.json` (muletillas, `maxSentenceWords: 25`, `hookMaxSeconds` de largo 30 y de Short 5, `durationTolerance: 0.1`) y `packages/knowledge/script/sources.json` (qué es una fuente fiable y dominios no fiables), con fuente y fecha, y un test en `packages/knowledge/test/script.test.ts`
- [X] T016 [P] Escribir `packages/knowledge/writing/spoken.md` y hacer que `parsePrompt` de `packages/knowledge/src/prompts.ts` lo use en vez de `human.md` para `guion`, `guion_short` y `bloque_guion`, con su test en `packages/knowledge/test/prompts.test.ts`
- [X] T017 [P] Test en `apps/server/test/services/ai-run-output.test.ts`: `estimate` acepta `outputTokens`, que sustituye al máximo del perfil solo en `cents`; `maxCents`, `blockedBy` y la comprobación de `run` siguen usando el tope del perfil, y una petición cuyo máximo no cabe en el límite no empieza aunque lo esperado sí quepa
- [X] T018 Ampliar `apps/server/src/services/ai-run.ts` para que pase T017
- [X] T019 Escribir en `packages/core/src/api/scripts.ts` `ScriptView`, `ScriptSummary`, los cuerpos base y los códigos `en_curso`, `version_cambiada`, `sin_aprobar` y `sin_internet` de [http-api](./contracts/http-api.md)
- [X] T020 [P] Test de rutas en `apps/server/test/http/scripts-base.test.ts`: `POST /ideas/:id/script` crea (201) o devuelve (200) el guion, y exige una idea elegida; `GET /scripts/:id`; `PATCH /scripts/:id` con límites de duración según formato y de apuntes; `GET /channels/:id/scripts`; y canal ajeno o inexistente
- [X] T021 Implementar `apps/server/src/services/scripts.ts` y `apps/server/src/http/routes/scripts.ts` para que pase T020, y registrar las rutas y sus dependencias en `apps/server/src/http/app.ts` y `apps/server/src/main.ts`
- [X] T022 Añadir `scriptsApi` en `apps/web/src/api/client.ts` y las rutas `/canal/guiones` y `/canal/guiones/:id` en el enrutador de la web, con la lista en `apps/web/src/screens/channel/scripts/ScriptList.tsx` (incluido el `EmptyState` que lleva al banco) y el esqueleto con `Stepper` en `apps/web/src/screens/channel/scripts/ScriptScreen.tsx`
- [X] T023 [A] Puerta A de Foundational: ejecutar `/puerta-a 005 Foundational`. No se marca `[X]` hasta que la skill diga «pasada»; el informe queda en `checklists/validation.md`

**Checkpoint**: la base está lista.

---

## Phase 3: User Story 1 - De la idea a una escaleta aprobada (Priority: P1) 🎯 MVP

**Goal**: El creador abre una idea de la cola, escribe sus apuntes, recibe una escaleta, la edita y la aprueba.

**Independent Test**: Con proveedor falso, apuntes, coste, escaleta, mover un bloque con el teclado, editar otro, aprobar y seguir aprobada al recargar.

- [X] T024 [P] [US1] Test de la salida `escaleta` en `packages/core/test/script/outputs.test.ts`: primer bloque `gancho`, último `cierre`, un `contexto`, al menos dos `acto`
- [X] T025 [US1] Implementar la salida en `packages/core/src/script/outputs.ts` y dar de alta el uso `escaleta` según las convenciones, con su prompt en `packages/knowledge/prompts/escaleta/v1.md`, que use el conocimiento de `craft.json`
- [X] T026 [P] [US1] Test de rutas en `apps/server/test/http/scripts-outline.test.ts`: `POST /scripts/:id/estimate` y `POST /scripts/:id/generate` con `use=escaleta` (202 y `jobId`), versión nueva con `id` de bloque asignado por el servidor, `en_curso` con un trabajo vivo, contenido anterior intacto si la IA falla, `PUT /scripts/:id/outline` con `baseVersion` (`version_cambiada` si no coincide), aprobar, no aprobar sin bloques o con uno sin título, y editar lo aprobado vuelve a borrador
- [X] T027 [US1] Implementar en `apps/server/src/services/scripts.ts` el trabajo de generación (`background_job` con `kind='ia'`, `channel_id`, `script.job_id` y `job_op`) y en `apps/server/src/http/routes/scripts.ts` las rutas de T026, con la salida esperada de R11 y el gasto en el `journey` del canal, como en la 004
- [X] T028 [P] [US1] Textos de la cola, la lista y los pasos Hechos y Escaleta en `apps/web/src/strings/script.es.ts`, incluida la explicación de «escaleta»
- [X] T029 [US1] En `apps/web/src/screens/channel/ideas/IdeaQueue.tsx` y `apps/web/src/strings/ideas.es.ts` quitar la nota de que el guion llegará después, actualizar la comprobación de esa nota en `apps/web/e2e/ideas-queue.spec.ts:89` y añadir «Preparar el guion» (principal en la primera) y «Seguir con el guion». Añadir el enlace «Mis guiones» en la pantalla del canal, y `script` en `IdeaView` (`packages/core/src/api/ideas.ts` y `apps/server/src/services/ideas.ts`) sin romper los tests de la 004
- [X] T030 [US1] Implementar el paso Hechos sin investigación (duración y apuntes) en `apps/web/src/screens/channel/scripts/FactsStep.tsx`
- [X] T031 [US1] Implementar el paso Escaleta en `apps/web/src/screens/channel/scripts/OutlineStep.tsx`: bloques, «Subir» y «Bajar», editar, añadir, quitar, duración total, pedir otra con indicaciones, aprobar, coste antes de cada petición y `AiWorking` al volver
- [X] T032 [US1] e2e en `apps/web/e2e/scripts.spec.ts` (US1), con teclado, recarga y axe en claro y oscuro a 375 y 1280 px
- [X] T033 [A] [US1] Puerta A de US1: ejecutar `/puerta-a 005 US1`

**Checkpoint**: MVP de estructura.

---

## Phase 4: User Story 2 - De la escaleta a un guion que suena a persona (Priority: P1)

**Goal**: Guion por bloques con la voz del canal, editable, con regeneración por bloque y marcas «por comprobar».

**Independent Test**: Con proveedor falso, generar, editar una frase, pedir un bloque de nuevo y comprobar que los demás no cambian y que las afirmaciones salen marcadas.

- [X] T034 [P] [US2] Test en `packages/core/test/script/claims.test.ts` con casos grabados de `detectClaims`: números, porcentajes, años, fechas, «mil» y «millones», y nombres propios fuera de inicio de frase (el 100 % de los casos grabados, SC-003), ignorando lo que esté en apuntes, hechos e idea; unión con `claims[]` de la IA sin duplicados; `reason: hecho_dudoso` si viene de un hecho `una_fuente` o `sin_confirmar`; y marca huérfana a `quitada` cuando el fragmento desaparece
- [X] T035 [US2] Implementar `packages/core/src/script/claims.ts` para que pase T034
- [X] T036 [P] [US2] Tests de las salidas `guion` (mismos bloques que la escaleta o no valida) y `bloque_guion` en `packages/core/test/script/outputs.test.ts`
- [X] T037 [US2] Implementar las salidas en `packages/core/src/script/outputs.ts` y dar de alta los usos `guion` y `bloque_guion` según las convenciones, con sus prompts
- [X] T038 [P] [US2] Test de rutas en `apps/server/test/http/script-settings.test.ts`: valores por defecto `tu`, `cercano`, sin muestra y 150; guardar; límites; y que cambiar la voz no altera versiones ya guardadas
- [X] T039 [US2] Implementar `GET` y `PUT /channels/:id/script-settings` en `apps/server/src/http/routes/scripts.ts`
- [X] T040 [P] [US2] Test de rutas en `apps/server/test/http/scripts-draft.test.ts`: `sin_aprobar` sin escaleta aprobada; generar crea el guion con marcas y `outline_version`; regenerar un bloque deja los demás idénticos carácter a carácter (SC-004) y conserva sus ediciones; pedir otro guion entero con indicaciones deja el anterior en el historial; `PUT /scripts/:id/draft`; las cinco acciones de `POST /scripts/:id/claims/:claimId`; `confirmar` y `no_es_dato` seguidas en una sola versión `marcas` si no está aprobada; y `corregir`, `quitar_del_guion` y `aceptar_propuesta` siempre en una versión `edicion` propia, de modo que ningún texto intermedio se pierde
- [X] T041 [US2] Implementar en `apps/server/src/services/scripts.ts` y `apps/server/src/http/routes/scripts.ts` las rutas de T040
- [X] T042 [P] [US2] Textos del paso Guion y de la voz en `apps/web/src/strings/script.es.ts`
- [X] T043 [US2] Implementar el paso Guion en `apps/web/src/screens/channel/scripts/DraftStep.tsx` (bloques, `<mark>` como botón con nombre accesible, `Dialog` de marca, edición con guardado antes de pedir un bloque, contador, «Pedir otro guion» y el aviso antes del primer cambio en un guion aprobado, FR-017) y `apps/web/src/screens/channel/scripts/VoiceSettings.tsx` en `/canal/guiones/voz`, con las palabras por minuto en «Más opciones»
- [X] T043b [US2] Calcular los avisos en `apps/server/src/services/scripts.ts` y pintarlos en `apps/web/src/screens/channel/scripts/ScriptWarnings.tsx`, usado en `ScriptScreen.tsx`: `idea_cambiada`, `perfil_cambiado`, `hechos_cambiados` y `escaleta_cambiada`, cada uno con su acción y su coste a la vista si lo tiene, y el semáforo de la idea si está quemada o competida, sin bloquear nada. `origen_cambiado` se añade en T092
- [X] T044 [US2] e2e en `apps/web/e2e/scripts.spec.ts` (US2), incluido cerrar la pestaña durante la generación y dos pestañas, con axe en claro y oscuro a 375 y 1280 px
- [X] T045 [A] [US2] Puerta A de US2: ejecutar `/puerta-a 005 US2`

---

## Phase 5: User Story 3 - Revisar y aprobar el guion (Priority: P2)

**Goal**: Revisión gratuita, aprobación informada y descarga.

**Independent Test**: Un guion grabado con muletillas, gancho largo y una afirmación pendiente muestra los tres avisos, se aprueba y se descarga.

- [X] T046 [P] [US3] Test en `packages/core/test/script/review.test.ts` de las cinco reglas (duración frente al objetivo, gancho largo, muletillas, frases de más de 25 palabras y afirmaciones pendientes), de cada aviso con su `blockId`, y de que 4.500 palabras se revisan en menos de 1 s (SC-006)
- [X] T047 [US3] Implementar `packages/core/src/script/review.ts` para que pase T046
- [X] T048 [P] [US3] Test en `packages/core/test/script/export.test.ts`: Markdown y JSON con escaleta, guion, notas, marcas y fuentes, y varios guiones en un fichero
- [X] T049 [US3] Implementar `packages/core/src/script/export.ts` para que pase T048
- [X] T050 [P] [US3] Test de rutas en `apps/server/test/http/scripts-approve.test.ts`: `GET /scripts/:id/review`; aprobar con y sin pendientes, 409 si `acknowledgedPending` no coincide; `draft_approved_pending` guardado; editar vuelve a borrador; aprobar no cambia el estado de la idea; y las dos descargas
- [X] T051 [US3] Implementar las rutas de T050 en `apps/server/src/http/routes/scripts.ts`
- [X] T052 [US3] Implementar el paso Revisar en `apps/web/src/screens/channel/scripts/ReviewStep.tsx` con sus textos, el `Dialog` de pendientes, «Descargar» y «Descargar todos» en la lista, y «Guion listo» en `IdeaQueue.tsx`
- [X] T053 [US3] e2e en `apps/web/e2e/scripts.spec.ts` (US3), con axe en claro y oscuro a 375 y 1280 px
- [X] T054 [A] [US3] Puerta A de US3: ejecutar `/puerta-a 005 US3`

---

## Phase 6: User Story 4 - El guion de un Short (Priority: P2)

**Goal**: Una idea Short va directa al guion, en tres tramos.

**Independent Test**: Con proveedor falso, una idea Short genera el guion sin escaleta, con tres tramos dentro del máximo, y se aprueba.

- [X] T055 [P] [US4] Tests de la salida `guion_short` (exactamente `gancho`, `desarrollo` y `cierre`, en ese orden) en `packages/core/test/script/outputs.test.ts`, y del aviso de exceso en `packages/core/test/script/review.test.ts`, con el máximo recibido como parámetro
- [X] T056 [US4] Implementar la salida y dar de alta el uso `guion_short` según las convenciones, con su prompt, y el exceso en `packages/core/src/script/review.ts`
- [X] T057 [P] [US4] Test de rutas en `apps/server/test/http/scripts-short.test.ts`: generar sin escaleta, rechazar `use=escaleta`, y editar, regenerar un tramo y aprobar como en un vídeo largo
- [X] T058 [US4] Implementar el recorrido Short en `apps/server/src/services/scripts.ts`, y en `ScriptScreen.tsx` el `Stepper` de tres pasos, la frase de por qué importan los primeros segundos, la duración por defecto de 45 s y «Pedir otro guion», con el máximo de `shorts.json` pasado a `core`
- [X] T059 [US4] e2e en `apps/web/e2e/scripts.spec.ts` (US4), con axe en claro y oscuro a 375 y 1280 px
- [X] T060 [A] [US4] Puerta A de US4: ejecutar `/puerta-a 005 US4`

---

## Phase 7: User Story 5 - Volver a cualquier versión (Priority: P2)

**Goal**: Ver, comparar y recuperar cualquier versión.

**Independent Test**: Un guion con cuatro versiones grabadas: abrir la segunda, ver qué cambia, volver a ella y comprobar que la cuarta sigue.

- [X] T061 [P] [US5] Test en `packages/core/test/script/compare.test.ts`: bloques `igual`, `cambiado`, `nuevo` y `quitado`, emparejados por `id`
- [X] T062 [US5] Implementar `packages/core/src/script/compare.ts` para que pase T061
- [X] T063 [P] [US5] Test de rutas en `apps/server/test/http/scripts-versions.test.ts`: listar de la más nueva a la más antigua, leer con la comparación, recuperar crea versión `recuperada` con `restored_from` y una más sin perder ninguna (SC-007), y recuperar en un guion aprobado lo vuelve a borrador
- [X] T064 [US5] Implementar las rutas de T063 en `apps/server/src/http/routes/scripts.ts`
- [X] T065 [US5] Implementar `apps/web/src/screens/channel/scripts/History.tsx` con sus textos, incluidos los siete orígenes y el aviso antes de recuperar en un guion aprobado (FR-017), y usarlo en todos los pasos
- [X] T066 [US5] e2e en `apps/web/e2e/scripts.spec.ts` (US5), con axe en claro y oscuro a 375 y 1280 px
- [X] T067 [A] [US5] Puerta A de US5: ejecutar `/puerta-a 005 US5`

---

## Phase 8: User Story 6 - Investigar el tema con fuentes (Priority: P2)

**Goal**: La IA reúne hechos con enlaces, el creador los revisa y añade los suyos, y se puede comprobar el guion.

**Independent Test**: Con proveedor falso, investigar, ver etiquetas y enlaces, quitar uno, añadir una fuente propia y comprobar que la escaleta recibe esa lista.

- [X] T068 [P] [US6] Test en `packages/core/test/script/facts.test.ts` de `factLabel`: `comprobado` con dos enlaces que abren, de dominios distintos y fiables; mismo dominio cuenta uno; dominio no fiable no cuenta; `no_abre` y `sin_comprobar` no cuentan; la IA solo baja la etiqueta; y direcciones fuera de `seenUrls` descartadas
- [X] T069 [US6] Implementar `packages/core/src/script/facts.ts` para que pase T068
- [X] T070 [P] [US6] Test en `apps/server/test/services/link-check.test.ts` con un servidor local: `abre`, `no_abre` (404, 410), `sin_comprobar` (403, 429, 5xx, tiempo agotado); rechazo de todas las direcciones no públicas de R7 (`0.0.0.0`, `10.x`, `100.64.x`, `127.x`, `169.254.x`, `172.16.x`, `192.168.x`, `[::]`, `[::1]`, `fc00::`, `fe80::` y `[::ffff:127.0.0.1]`) **tanto escritas como IP en la dirección, donde Node no llama a `lookup`, como resueltas por DNS**; rechazo de redirección hacia ellas; máximo 3 redirecciones; solo `http` y `https`, sin usuario en la dirección; y que la dirección no aparece en los logs
- [X] T071 [US6] Implementar `apps/server/src/services/link-check.ts` con `node:http` y `node:https` para que pase T070 (R7). Sin dependencias nuevas
- [X] T072 [US6] Ampliar el puerto en `packages/core/src/ai/capabilities.ts` y `packages/core/src/ai/port.ts` (R3), y `ActiveAi` en `apps/server/src/services/ai-connections.ts` para exponer `webResearch`. El proveedor falso declara la capacidad, con el escenario `sin_web` y enlaces falsos, en `packages/ai/src/fake/`
- [X] T073 [P] [US6] Ampliar la batería de contrato en `packages/ai/test/contract` con los tres casos de [ai-uses](./contracts/ai-uses.md)
- [X] T074 [P] [US6] Test del adaptador con `fetch` falso en `packages/ai/test/anthropic-web.test.ts`: dos pasos, `pause_turn` hasta 3 veces, un error de búsqueda dentro de un 200, ninguna búsqueda útil es `no_disponible`, solo se repite el paso estructurado, `seenUrls` y `webSearches`
- [X] T075 [US6] Implementar en `packages/ai/src/anthropic/adapter.ts` los dos pasos de R4 con `web_search_20260209` y `web_fetch_20260209`, `max_uses` y `max_content_tokens: 8000`, para que pase T074
- [X] T076 [P] [US6] Test en `packages/ai/test/claude-command.test.ts`: `--tools WebSearch,WebFetch` y `--allowedTools` solo con `web`; `--tools ''` en los demás usos; y las banderas de aislamiento sin cambios
- [X] T077 [US6] Implementar la petición con `web` en `packages/ai/src/claude-code/command.ts` y `adapter.ts` para que pase T076 (R5), declarando `webResearch: true` en ambos adaptadores
- [X] T078 [P] [US6] Test en `packages/core/test/spending/estimate.test.ts` del coste web: búsquedas y lectura una sola vez, solo el paso estructurado reservado por duplicado, el presupuesto con el máximo de búsquedas y lecturas de la petición, y 0 € con suscripción
- [X] T079 [US6] Subir `packages/knowledge/market/pricing.json` a la versión 2 (R6), con `webSearchUsdPer1000: 10` y los dos supuestos marcados, y ampliar `packages/core/src/spending/estimate.ts` y `apps/server/src/services/ai-run.ts` (`web` y `web_searches` en `ai_usage`) para que pase T078
- [X] T080 [P] [US6] Tests de las salidas `investigacion` (lista vacía válida) y `comprobar_guion` (cada `claimId` existe) en `packages/core/test/script/outputs.test.ts`
- [X] T081 [US6] Implementar las salidas y dar de alta los usos `investigacion` y `comprobar_guion` según las convenciones, con prompts que declaren que el contenido web es dato. La entrada de `investigacion` solo lleva idea, apuntes, idioma, lista de fuentes fiables e indicaciones (R20)
- [X] T082 [P] [US6] Test de rutas en `apps/server/test/http/scripts-facts.test.ts`: investigar comprueba enlaces y recalcula etiquetas; `sin_internet`; investigar otra vez conserva los hechos del creador; `PUT /scripts/:id/facts` comprueba enlaces nuevos y guarda aunque no abran; la escaleta recibe la última lista y guarda `facts_version`; comprobar pendientes crea versión `comprobacion` sin cambiar el texto, con cada enlace comprobado por `link-check` y sin contar los que no abren; y `aceptar_propuesta` lo cambia
- [X] T083 [US6] Implementar en `apps/server/src/services/scripts.ts` y `apps/server/src/http/routes/scripts.ts` las rutas de T082
- [X] T084 [US6] Ampliar `FactsStep.tsx` con la investigación, las etiquetas, los enlaces, el aviso de lo que la app comprueba y el caso sin internet, y `DraftStep.tsx` con «Comprobar con internet», el veredicto y «Usar esta redacción», con sus textos
- [X] T085 [US6] e2e en `apps/web/e2e/scripts.spec.ts` (US6), incluido `sin_web`, con axe en claro y oscuro a 375 y 1280 px
- [X] T086 [A] [US6] Puerta A de US6: ejecutar `/puerta-a 005 US6`. La prueba real consta como no ejecutada hasta T087
- [X] T087 [US6] Prueba real de P1, **solo con la autorización del creador**: una investigación y una generación con cada conexión autorizada, guardando el resultado en `checklists/validation.md`, incluidos SC-002 y SC-011 (tiempo total: los pasos de búsqueda, forma y enlaces). Si se pasa de 5 minutos, se ajustan los tiempos y se anota. Si `--json-schema` no convive con las herramientas web, Claude Code pasa a dos pasos como en R4

---

## Phase 9: User Story 7 - Sacar un Short de un vídeo largo (Priority: P3)

**Goal**: Desde un guion largo aprobado, una idea Short enlazada y su guion, listo para escribirse.

**Independent Test**: Con proveedor falso, pedir enfoques, elegir uno, encontrar en el banco la idea Short enlazada y escribir su guion.

- [X] T088 [P] [US7] Test de la salida `enfoques_short` (de 2 a 3, `blockId` existente) en `packages/core/test/script/outputs.test.ts`
- [X] T089 [US7] Implementar la salida y dar de alta el uso `enfoques_short` según las convenciones, con su prompt
- [X] T090 [P] [US7] Test de rutas en `apps/server/test/http/scripts-short-from-long.test.ts`: `sin_aprobar` sin guion aprobado; enfoques guardados en `short_angles`; elegir crea una idea `short` con `origin='otro_enfoque'`, `source_idea_id` y estado `banco`, y un guion en `sin_empezar`, sin llamar a la IA, con `source_script_id` y hechos `heredada`; varios Shorts del mismo vídeo; y `origen_cambiado`
- [X] T091 [US7] Implementar la elección en `apps/server/src/services/scripts.ts` y `POST /scripts/:id/short-angles/:index/choose` en las rutas
- [X] T092 [US7] Añadir en `ReviewStep.tsx` «Sacar un Short» y los enfoques; al elegir, abrir el guion del Short con «Escribir el guion · {coste}»; añadir los enlaces entre los dos guiones, el aviso `origen_cambiado` en `ScriptWarnings.tsx` y sus textos. La idea muestra de qué vídeo sale
- [X] T093 [US7] e2e en `apps/web/e2e/scripts.spec.ts` (US7), con axe en claro y oscuro a 375 y 1280 px
- [X] T094 [A] [US7] Puerta A de US7: ejecutar `/puerta-a 005 US7`

---

## Phase 10: Polish & Cross-Cutting

- [x] T095 [P] Comprobar los casos límite de la spec que falten con su test: idea archivada y recuperada, idea quemada, apuntes muy largos, límite de gasto, fallos tipados de la IA y varios canales, en `apps/server/test/http/scripts-edge.test.ts`
- [x] T096 [P] Revisar que los textos nuevos pasan el glosario y `apps/web/e2e/secrets-leak.spec.ts` sin cambios, y que ningún log contiene enlaces
- [x] T097 Recorrer el [quickstart](./quickstart.md) entero con IA falsa y guardar el resultado en `checklists/validation.md`
- [ ] T098 Auditoría de novato del guion con el agente `usuario-novato`, en `specs/005-script-and-outline/novice-audit.md`. Debe dar 0 graves y como mucho 3 medios, y anotar el tiempo de la idea al guion aprobado (SC-001). Los menores visuales van a la pasada del modo Design
- [ ] T099 Actualizar `CLAUDE.md` (estado de la 005) y `README.md` si cambia algo de cara al creador
- [ ] T100 [A] Puerta A de Polish: ejecutar `/puerta-a 005 Polish`

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → historias.
- **US1 (3)** es el MVP de estructura. **US2 (4)** depende de US1.
- **US3 (5)** depende de US2. **US4 (6)** reutiliza el paso Guion de US2 y la revisión de US3.
- **US5 (7)** solo depende de que haya versiones: va después de US2.
- **US6 (8)** depende de US2 (marcas) y puede ir en paralelo con US3 a US5 si se reparten ficheros: el puerto, los
  adaptadores y `link-check` son suyos. **T087** espera a la autorización del creador y no bloquea nada más.
- **US7 (9)** depende de US3 y US4.
- **Polish (10)**, al final.

## Parallel Example: US6

```text
T068 facts.test.ts   T070 link-check.test.ts   T073 batería de contrato   T074 anthropic-web.test.ts
T076 claude-command.test.ts   T078 estimate.test.ts   T080 outputs.test.ts
```

## Implementation Strategy

1. Setup y Foundational, con su Puerta A.
2. US1 y US2, y se para a comprobar: ya sale un guion editable de una idea.
3. US3, US4 y US5: lo cierran como producto.
4. US6: la investigación, con la prueba real si el creador la autoriza.
5. US7.
6. Polish, auditoría de novato y PR cuando lo pida el creador.

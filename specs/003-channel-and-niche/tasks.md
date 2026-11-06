---
description: "Lista de tareas de la feature 003: canal y nicho"
---

# Tasks: Canal y nicho

**Input**: Documentos de diseño en `/specs/003-channel-and-niche/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: SÍ. La constitución (principio VI) pide pruebas primero: cada tarea de test se escribe antes que su
implementación y tiene que fallar al principio.

**Organization**: Las tareas van agrupadas por historia de usuario para que cada una se pueda implementar y probar por
separado.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US5)
- **[A]**: tarea de Puerta A que cierra una fase o historia (constitución, principio XI). Las fases 1 a 5 se cerraron
  antes de existir y no la llevan; tienen una revisión retroactiva en `checklists/validation.md`
- Cada descripción lleva la ruta exacta del fichero

## Convenciones comunes

- Código, identificadores y nombres de fichero en inglés; textos de interfaz, prompts y documentos en español.
- Ningún test llama a una IA real ni a YouTube real: proveedor `fake` (`YTCREATOR_FAKE_AI=<escenario>`) y YouTube
  `fake` (`YTCREATOR_FAKE_YOUTUBE=1`). `pnpm test:real-youtube` es opcional y queda fuera de CI.
- El servidor devuelve códigos (`sin_datos`, `bloqueado`, `ya_hay_canal`…); la web los traduce en `strings/`.
- La clave de YouTube Data API es un `Secret` de la 002: vive en el `SecretStore`, va en la cabecera `X-Goog-Api-Key`
  (nunca en la URL), solo se muestra su `hint` de 4 caracteres y `Secret.reveal()` solo se permite en
  `packages/ai/src/**`, `packages/youtube/src/data-api/**` y `apps/server/src/secrets/**`. Los logs nunca llevan URLs
  completas ni cabeceras.
- yt-dlp se lanza con `execFile` y argumentos en lista, nunca con `shell: true`.
- Comandos con Node 24: `fnm exec --using=24 -- pnpm lint|typecheck|test|test:installer|test:e2e`.
- Al acabar cada fase o historia: lint + typecheck + test en verde y commit (`feat(003): …`).

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: Spikes, paquete nuevo y ajustes de herramientas.

- [X] T001 Spike S1+S2 (research.md): con yt-dlp real fuera de CI, probar `yt-dlp --flat-playlist -J "ytsearch40:<q>"`, la pestaña `/videos` de un canal (suscriptores y hasta 200 vídeos) y `https://www.youtube.com/@<handle>` libre (404) frente a ocupado frente a sin red; anotar campos que vienen vacíos y patrones de stderr de bloqueo y 404 en `specs/003-channel-and-niche/research.md` («### Resultados»)
- [X] T002 Spike S3: medir el tiempo de 5 nichos con 3 procesos en paralelo y anotar en `specs/003-channel-and-niche/research.md` si hace falta bajar a `ytsearch25`
- [X] T003 Spike S4: contar unidades de la Data API de un recorrido completo (búsqueda 100 unidades, canales y vídeos 1) y anotar el reparto Data API / yt-dlp en `specs/003-channel-and-niche/research.md`
- [X] T004 Crear el paquete `@ytcreator/youtube` en `packages/youtube/` (`package.json`, `tsconfig.json`, `src/index.ts`, `vitest.config.ts`) y añadir su referencia en `tsconfig.json` raíz y el proyecto en `vitest.workspace.ts`
- [X] T005 [P] Añadir yt-dlp (versión, URL y SHA256 por sistema y arquitectura: macOS, Linux x64/arm64) en `installer/versions.json`
- [X] T006 [P] Reglas de ESLint en `eslint.config.js`: `node:child_process` solo en `packages/youtube/src/ytdlp/**` (y donde ya lo permita la 002), prohibido `shell: true`, llamadas a `googleapis.com` solo en `packages/youtube/src/data-api/**`, y ampliar la lista de `Secret.reveal()` con `packages/youtube/src/data-api/**`
- [X] T007 [P] Script `test:real-youtube` en `package.json` raíz y `packages/youtube/package.json` (solo `*.real.test.ts`, excluido de `pnpm test`)
- [X] T008 [P] Variable `YTCREATOR_FAKE_YOUTUBE=1` en el `webServer` de `apps/web/playwright.config.ts` y en `apps/web/e2e/server.ts`; declararla en `apps/server/src/env.d.ts`

**Checkpoint**: spikes anotados y paquete vacío que compila.

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: Puerto de YouTube, conocimiento, base de datos, IA con gasto, trabajos en segundo plano y esqueleto de
rutas y pantallas.

**⚠️ CRITICAL**: Ninguna historia empieza hasta acabar esta fase.

### Tests foundational ⚠️

- [X] T009 [P] Test del puerto y los fallos de YouTube en `packages/core/test/youtube/failures.test.ts`: códigos `sin_datos | no_encontrado | bloqueado | cupo_agotado | tiempo_agotado | no_disponible` y forma `{ok:false, failure}`
- [X] T010 [P] Test de normalización de la @ en `packages/core/test/youtube/handle.test.ts`: acepta enlace de canal, `@handle`, `handle`, enlace de vídeo y `/channel/UC…`; la @ final tiene 3–30 caracteres `[A-Za-z0-9._-]` sin `@`; `youtube_channel_id` empieza por `UC` y tiene 24 caracteres
- [X] T011 [P] Test del limitador de concurrencia en `packages/core/test/concurrency.test.ts`: nunca más de N tareas a la vez, conserva el orden de resultados y sigue tras un fallo
- [X] T012 [P] Test del paquete de conocimiento en `packages/knowledge/test/market.test.ts`: cada fichero (`ypp`, `rpm`, `made-for-kids`, `inauthentic`, `shorts`, `thresholds`, `pricing`) cumple su esquema (`version` entero, `reviewedAt`, `source` con uno o más `{label,url}`, `data`); un fichero roto lanza al cargar; aviso de revisión con más de 180 días con fecha simulada
- [X] T013 [P] Test de la migración `0002_channel.sql` en `apps/server/test/db/migration-0002.test.ts`: crea `channel`, `journey`, `proposal`, `channel_profile`, `profile_version`, `market_measure`, `reference_channel`, `name_check`, `channel_reading`, `ai_usage`, `yt_cache`, `yt_quota`, `background_job`; `UNIQUE(youtube_channel_id)`; índice único `UNIQUE(channel_id) WHERE status='activo'` en recorridos; la 0001 sigue intacta
- [X] T014 [P] Tests de repos en `apps/server/test/db/repos/channels.test.ts`, `journeys.test.ts`, `proposals.test.ts`, `profiles.test.ts`: crear canal, `revision` desfasada devuelve `conflicto`, un solo recorrido activo por canal, versiones de perfil correlativas con origen `ia|manual|restaurada`
- [X] T015 [P] Tests de repos en `apps/server/test/db/repos/measures.test.ts`, `names.test.ts`, `readings.test.ts`, `usage.test.ts`, `yt-cache.test.ts`, `jobs.test.ts`: caché de 24 h (1 h para comprobaciones de @), cupo por fecha del Pacífico, trabajos `en_curso` pasan a `interrumpido` al arrancar
- [X] T016 [P] Test de `AiRequest.input` en `packages/ai/test/input.test.ts`: los datos de YouTube y del creador van dentro de `<datos>…</datos>` y nunca se mezclan con las instrucciones del prompt; fake y adaptadores reales lo reciben igual
- [X] T016b [P] Ampliar la batería de contrato de IA de la 002 en `packages/ai/test/contract/battery.ts` con los seis usos (`preguntas`, `nichos`, `conceptos`, `nombres`, `lectura_canal`, `posicionamiento`): esquema válido, esquema no válido con un solo reintento y cifras inventadas; la pasan el fake y los adaptadores reales
- [X] T017 [P] Test de los usos de IA en `packages/core/test/ai/uses.test.ts`: `preguntas`, `nichos`, `conceptos`, `nombres`, `lectura_canal`, `posicionamiento` con su modelo (Haiku o Sonnet según ai-uses.md), tiempo máximo (60 s o 120 s) y esquema de salida Zod
- [X] T018 [P] Test de prompts en `packages/knowledge/test/prompts.test.ts`: cada `prompts/<uso>/v1.md` tiene cabecera con versión y hash, el hash coincide con el contenido y cambiar el texto sin subir versión falla
- [X] T019 [P] Test del validador de cifras en `packages/core/test/channel/claims.test.ts`: una cifra que no está en los datos de entrada se detecta; primer fallo pide un reintento; si vuelve a fallar se recortan las frases y se marca `claimsTrimmed`
- [X] T020 [P] Test de estimación y presupuesto en `packages/core/test/spending/estimate.test.ts` y `budget.test.ts`: `cents = ceil(usd × fx × 100)` con `pricing.json`; suscripción cuesta 0 €; estimación caduca a los 10 min; límites por operación, diario y mensual; aviso si el coste real supera la estimación en más del 50 %
- [X] T021 [P] Test del servicio `ai-run` en `apps/server/test/services/ai-run.test.ts`: sin `estimateId` válido no llama a la IA; guarda `ai_usage`; `limite_de_gasto` sin llamada; reintento único por cifras inventadas
- [X] T022 [P] Batería de contrato de YouTube en `packages/youtube/test/contract/battery.ts` (search, channel, videos, handle, resolve; cada fallo del puerto) y `packages/youtube/test/fake.contract.test.ts` que la pasa con el fake
- [X] T023 [P] Tests del adaptador yt-dlp en `packages/youtube/test/ytdlp.contract.test.ts` con el binario falso `packages/youtube/test/fixtures/fake-yt-dlp` (salidas grabadas en S1): argumentos en lista, tiempo máximo 45 s (15 s para la @), clasificación de stderr en `bloqueado`/`no_encontrado`, binario ausente = `no_disponible`
- [X] T024 [P] Tests de RSS y Data API en `packages/youtube/test/rss.test.ts` y `packages/youtube/test/data-api.contract.test.ts` con `fetch` simulado: clave en `X-Goog-Api-Key` y nunca en la URL, 403 `quotaExceeded` = `cupo_agotado`, contador de unidades, `health().quota.nearLimit` es verdadero al pasar el umbral de `thresholds.json` (FR-030)
- [X] T025 [P] Test del servicio `youtube` en `apps/server/test/services/youtube.test.ts`: elige Data API si hay clave y cupo, si no yt-dlp; usa la caché; como mucho 3 procesos yt-dlp y 4 comprobaciones de @ a la vez; los logs no contienen la clave, URLs completas ni cabeceras
- [X] T026 [P] Test de trabajos en segundo plano en `apps/server/test/http/jobs.test.ts`: `GET /api/jobs/:id/events` emite `progress`, `item`, `done`, `failed` por SSE; el trabajo sigue si se cierra la conexión; al reiniciar, `en_curso` pasa a `interrumpido`
- [X] T027 [P] Test del recorrido en `packages/core/test/channel/journey.test.ts`: transiciones `intereses→preguntas→nichos→ritmo→conceptos→nombres→hecho` y `enlace→confirmar→lectura→posicionamiento→hecho`; saltar un paso no aprobado falla; volver a un paso anterior conserva lo aprobado después hasta que se cambie; volver a `nichos` con un concepto aprobado lo marca para revisar y exige `confirm: true` (FR-025); `journeyStateSchema` (intereses 10–1.000 caracteres, 0–3 respuestas, `hoursPerWeek` 1–60, `onCamera` `cara|voz|ninguna`)
- [X] T028 [P] Test del esquema `ChannelProfile` en `packages/core/test/channel/profile.test.ts`: promesa ≤ 160 caracteres, 3–4 pilares, monetización con `monthlyEurRange` = visitas × RPM / 1.000, `displayName` 1–100 caracteres
- [X] T029 [P] Tests de esquemas de API en `packages/core/test/api/channel.test.ts`, `youtube.test.ts`, `usage.test.ts`: cada cuerpo de petición y respuesta de http-api.md
- [X] T030 [P] Tests de rutas base en `apps/server/test/http/channel-base.test.ts`: `GET /api/channels/current` con y sin canal, `POST /api/channels` (201 y `409 ya_hay_canal`), `GET /api/journeys/:id`, `POST /api/journeys/:id/step` con `revision` desfasada (`409` con `current`) y paso no aprobado (`400`), `POST /api/journeys/:id/estimate`, `POST /api/journeys/:id/proposals` con `estimateId` caducado, `PATCH /api/proposals/:id`, guardia de Host/Origin
- [X] T031 [P] Tests de componentes en `packages/ui/test/Semaphore.test.tsx` y `packages/ui/test/DataSource.test.tsx`: cada estado con texto e icono (no solo color), `DataSource` en sus tres variantes (dato de YouTube con fecha, conocimiento con fecha de revisión, «Opinión de la IA»), axe sin fallos
- [X] T032 [P] Ampliar `packages/ui/test/forbidden-terms.ts` con `RPM`, `YPP`, `CTR`, `handle` y `yt-dlp` y comprobar que `apps/web/test/glossary.test.ts` falla con un texto de prueba que los use
- [X] T033 [P] Tests del instalador en `installer/test/ytdlp.test.ts`: descarga correcta, hash erróneo (borra el temporal y sigue), sin red (sigue y avisa), ya instalado con la misma versión (no descarga); en macOS y Linux
- [X] T084 [P] Test de avisos en `packages/core/test/channel/warnings.test.ts`: hecho para niños (`made-for-kids.json`), contenido repetitivo o no auténtico (`inauthentic.json`), `solo_shorts` (`shorts.json`), ritmo insostenible para las horas indicadas; requisitos del programa de socios de `ypp.json`; los mismos avisos se calculan para un nicho medido (US1 AS7, FR-015)
- [X] T063b [P] Test de Inicio en `apps/web/test/channel/start.test.tsx`: sin canal se ven «Crear mi canal» (principal) y «Ya tengo un canal» (secundaria), cada una con su frase; con un recorrido a medias, «Seguir donde lo dejaste»; con el canal listo, el siguiente paso y, si el nombre es provisional, «Te falta elegir el nombre»

### Implementation foundational

- [X] T034 [P] Puerto de YouTube en `packages/core/src/youtube/port.ts` (operaciones `search`, `channel`, `videos`, `checkHandle`, `resolve`; vídeos con `title`, `views`, `durationSec`, `publishedAt`, campos que pueden ser `null`) y fallos en `packages/core/src/youtube/failures.ts`
- [X] T035 [P] Normalización de enlaces y @ en `packages/core/src/youtube/handle.ts`
- [X] T036 [P] Limitador de concurrencia en `packages/core/src/concurrency.ts`
- [X] T037 [P] Ficheros de mercado en `packages/knowledge/market/ypp.json`, `rpm.json` (€ por categoría y región `espana|latam|mixto`), `made-for-kids.json`, `inauthentic.json`, `shorts.json` (incluye `solo_shorts`), `thresholds.json` (demanda alta ≥ 50.000, media ≥ 5.000; puerta abierta ≥ 3, entreabierta ≥ 1; concentración alta ≥ 0,70, media ≥ 0,40; < 10 vídeos = `sin_datos`; máximo 20 canales; datos viejos > 90 días; aviso de cupo de la Data API al 80 % de las unidades del día) y `pricing.json` (USD por millón de tokens por modelo y cambio a € con fecha), cada uno con `version`, `reviewedAt` y `source`
- [X] T088 [P] Avisos en `packages/core/src/channel/warnings.ts` (para nichos y conceptos)
- [X] T038 Cargador y esquemas Zod del conocimiento en `packages/knowledge/src/index.ts` (falla al arrancar si un fichero no valida; lista de entradas con más de 180 días) y guía de escritura en `packages/knowledge/writing/human.md`
- [X] T039 Migración `apps/server/src/db/migrations/0002_channel.sql` con las tablas y restricciones de data-model.md (handle 3–30 `[A-Za-z0-9._-]`, `display_name` 1–100, `youtube_channel_id` `UC…` de 24 caracteres UNIQUE, `revision`, origen de versión `ia|manual|restaurada`, estados de `background_job`)
- [X] T040 [P] Repos `apps/server/src/db/repos/channels.ts`, `journeys.ts`, `proposals.ts`, `profiles.ts` sobre `transaction.ts`
- [X] T041 [P] Repos `apps/server/src/db/repos/measures.ts`, `names.ts`, `readings.ts`, `usage.ts`, `yt-cache.ts`, `jobs.ts`
- [X] T042 Añadir `input` a `AiRequest` en `packages/core/src/ai/port.ts` y envolverlo en `<datos>` en `packages/ai/src/anthropic/adapter.ts`, `packages/ai/src/claude-code/adapter.ts` y `packages/ai/src/fake/fake-provider.ts`
- [X] T043 Usos nuevos en `packages/core/src/ai/uses.ts` y perfiles de modelo en `packages/ai/src/profiles.ts`
- [X] T044 [P] Esquemas Zod de salida de cada uso en `packages/core/src/channel/outputs.ts` (preguntas, nichos con consultas, conceptos, nombres, lectura del canal, posicionamiento)
- [X] T045 [P] Validador de cifras en `packages/core/src/channel/claims.ts`
- [X] T046 [P] Escenarios del fake de IA para los seis usos (normal, `cifra_inventada`, `salida_rota`, `limite_de_gasto`) en `packages/ai/src/fake/scenarios.ts`
- [X] T047 [P] Estimación en `packages/core/src/spending/estimate.ts` y presupuesto en `packages/core/src/spending/budget.ts` (reutiliza `spending/limits.ts` de la 002)
- [X] T048 Servicio `apps/server/src/services/ai-run.ts`: estimar, guardar la estimación 10 min, comprobar presupuesto, llamar al puerto, validar con Zod, validar cifras, registrar `ai_usage`
- [X] T049 [P] Fake de YouTube con escenarios (nicho normal, `sin_datos`, `bloqueado`, @ ocupada, canal de 30 vídeos, canal de 3 vídeos) en `packages/youtube/src/fake/fake-youtube.ts` y `packages/youtube/src/fake/scenarios.ts`
- [X] T050 [P] Adaptador yt-dlp en `packages/youtube/src/ytdlp/command.ts`, `adapter.ts`, `parse.ts`, `classify.ts`, más `packages/youtube/test/fixtures/fake-yt-dlp`
- [X] T051 [P] Lector RSS de vídeos recientes (fechas exactas de `publishedAt`) en `packages/youtube/src/rss/feed.ts` y `parse.ts`
- [X] T052 [P] Adaptador de la Data API en `packages/youtube/src/data-api/adapter.ts` y `classify.ts` (clave en cabecera, contador de unidades)
- [X] T053 Registro en `packages/youtube/src/registry.ts` (fake con `YTCREATOR_FAKE_YOUTUBE=1`, si no Data API o yt-dlp; ruta del binario `<datos>/bin/yt-dlp`) y exportaciones en `packages/youtube/src/index.ts`
- [X] T054 Servicio `apps/server/src/services/youtube.ts`: elección de fuente, caché `yt_cache`, cupo `yt_quota` con aviso al acercarse al límite (FR-030), concurrencia (3 yt-dlp, 4 @), registro sin secretos en `apps/server/src/logging.ts`
- [X] T055 Trabajos en segundo plano: `apps/server/src/services/jobs.ts` (lanzar, emitir eventos, marcar `interrumpido` al arrancar desde `apps/server/src/main.ts`) y ruta SSE `GET /api/jobs/:id/events` en `apps/server/src/http/routes/jobs.ts`
- [X] T056 [P] Tabla de transiciones en `packages/core/src/channel/journey.ts` y esquema `ChannelProfile` en `packages/core/src/channel/profile.ts`
- [X] T057 [P] Esquemas de API en `packages/core/src/api/channel.ts`, `youtube.ts`, `usage.ts` y exportarlos en `packages/core/src/api/index.ts`; guardia `ya_hay_canal` en `GUARDS` de `packages/core/src/api/errors.ts`
- [X] T058 Rutas base en `apps/server/src/http/routes/channel.ts` (`channels/current`, crear canal, `journeys/:id`, `step`, `estimate`, `proposals`, `PATCH proposals/:id`) y montarlas en `apps/server/src/http/app.ts`
- [X] T059 [P] Componente `Semaphore` en `packages/ui/src/components/Semaphore/` (verde, ámbar, rojo, «sin comprobar») con entrada en `apps/catalog`
- [X] T060 [P] Componente `DataSource` en `packages/ui/src/components/DataSource/` con entrada en `apps/catalog`; exportar ambos en `packages/ui/src/index.ts`
- [X] T061 [P] Textos base en `apps/web/src/strings/channel.es.ts` y traducción de fallos de YouTube en `apps/web/src/strings/youtube-failures.es.ts`; cubrirlos en `apps/web/test/strings-coverage.test.ts`
- [X] T062 Cliente de API para canal, recorrido, trabajos (SSE) y consumo en `apps/web/src/api/client.ts` y hook de trabajo en `apps/web/src/shell/useJob.ts`
- [X] T063 Pantalla de Inicio del canal en `apps/web/src/screens/channel/start/Start.tsx` (sin canal: «Crear mi canal» principal y «Ya tengo un canal» secundaria, cada una con su frase (FR-001); con un recorrido a medias: «Seguir donde lo dejaste»; con el canal listo: siguiente paso y recordatorio del nombre provisional (FR-018b)) enlazada desde `apps/web/src/screens/home/Home.tsx`, y rutas `/canal/...` en `apps/web/src/router.ts`
- [X] T063c [P] Indicador de pasos común a los dos recorridos en `apps/web/src/screens/channel/StepIndicator.tsx` (paso actual y «Volver» al anterior, FR-002) con su test en `apps/web/test/channel/step-indicator.test.tsx`
- [X] T064 Componente de propuesta en `apps/web/src/screens/channel/Proposal.tsx`: «Aprobar», «Editar», «Proponer otra» con «¿Qué cambiarías?», importe en el botón, estados de fallo de IA (`limite_de_gasto` enlaza a Ajustes → Límites)
- [X] T065 Paso 8 de 9 del instalador «Preparar el lector de YouTube» en `installer/install.sh` (temporal, SHA256, permisos, mensajes «Preparando el lector de YouTube…» / «Lector de YouTube listo.» / «No hemos podido preparar el lector de YouTube. Puedes seguir; lo intentaremos desde Ajustes.», códigos `descarga|hash|permisos` sin rutas personales) y ayudas en `installer/test/helpers.ts` y `installer/test/fixtures/make-release.ts`

**Checkpoint**: base lista; las historias pueden empezar.

---

## Phase 3: User Story 1 - Elegir nicho con datos reales (Priority: P1) 🎯 MVP

**Goal**: El creador cuenta qué le interesa, contesta o salta hasta 3 preguntas, ve 3–5 nichos medidos con datos de
YouTube (demanda, puerta de entrada, concentración, saturación, veredicto y avisos) y elige uno con 2–4 canales de referencia y su ritmo.

**Independent Test**: Con los fakes, recorrer Intereses → Preguntas → Nichos → Referencias → Ritmo y comprobar que cada
cifra lleva «Dato de YouTube · fecha», que un nicho `sin_datos` no muestra cifras ni veredicto y que `bloqueado` ofrece
«Volver a intentarlo» sin parar el resto.

### Tests para User Story 1 ⚠️

- [X] T066 [P] [US1] Test de medidas en `packages/core/test/market/measures.test.ts`: demanda (mediana de visitas de los resultados), puerta de entrada (canales < 200.000 suscriptores con visitas muy por encima de sus suscriptores), concentración (parte de visitas de los 3 primeros canales), saturación (vídeos de los resultados de los últimos 90 días, en número y porcentaje; sin nivel), todo solo con vídeos largos (FR-007b: añadir Shorts o vídeos sin duración no cambia ningún indicador, y se cuentan aparte), máximo 20 canales, < 10 vídeos largos = `sin_datos` aunque haya muchos Shorts
- [X] T066b [P] [US1] Test de lo normal del canal en `packages/core/test/market/own-baseline.test.ts`: mediana de los 10 anteriores del mismo formato, `null` con menos de 3 anteriores o mediana 0, un viral entre los anteriores no la desfigura, formatos sin mezclar, destacado ≥ 3 veces, vídeos de menos de 30 días fuera de «peores» y vídeo sin fecha tratado como antiguo
- [X] T067 [P] [US1] Test del veredicto en `packages/core/test/market/verdict.test.ts`: reglas de research.md con los umbrales de `thresholds.json`, razón en llano y sin veredicto cuando hay `sin_datos`
- [X] T068 [P] [US1] Test del servicio `niche-research` en `apps/server/test/services/niche-research.test.ts`: mide cada nicho con sus consultas, guarda cada medida al acabar (lo medido sobrevive a un corte), un fallo no para el resto, reanuda los pendientes con «Seguir»
- [X] T069 [P] [US1] Tests de rutas en `apps/server/test/http/measures.test.ts`: `POST /api/journeys/:id/measures` (`202 {jobId}`, `revision`), `POST /api/journeys/:id/references` (`measureId`, `add`, `remove`, 2–4 canales; `medianViews` y `bestRatio`, a `null` si falla la lectura de ese canal sin que falle la referencia), eventos `item` por nicho
- [X] T070 [P] [US1] Tests de pantallas en `apps/web/test/channel/new-us1.test.tsx`: Intereses explica «nicho» en una frase, Preguntas permite «Saltar», tarjeta de nicho con `DataSource`, veredicto y avisos de contenido infantil y de políticas con fuente, volver a la tanda anterior, «Escribir mi propio nicho», estado `no_disponible` enlaza a Ajustes → YouTube
- [X] T071 [P] [US1] E2E en `apps/web/e2e/channel-niche.spec.ts`: recorrido hasta Ritmo con los fakes, nicho `sin_datos`, nicho `bloqueado`, volver de Ritmo a Nichos y regresar, cerrar la pestaña midiendo y volver con «Seguir donde lo dejaste», axe sin fallos

### Implementation para User Story 1

- [X] T072c [US1] Ampliar lo ya hecho en la fase 2 para las medidas nuevas ([data-model](./data-model.md), todavía sin publicar): columnas en `apps/server/src/db/migrations/0002_channel.sql` y `db/repos/measures.ts`; `measureSchema` y `referenceChannelSchema` en `packages/core/src/api/channel.ts`; `ownChannel` (`baselineVideos` 10, `minBaseline` 3, `notableRatio` 3, `youngDays` 30, `referenceVideos` 30) en `packages/knowledge/market/thresholds.json` v3 y su esquema; actualizar sus tests y comprobar que el escenario fake normal da ≥ 10 vídeos largos
- [X] T072 [P] [US1] Cálculo de medidas (demanda, puerta de entrada, concentración y saturación, solo con vídeos largos, y Shorts aparte) en `packages/core/src/market/measures.ts`
- [X] T072b [P] [US1] Lo normal del canal en `packages/core/src/market/own-baseline.ts`
- [X] T073 [P] [US1] Veredicto en `packages/core/src/market/verdict.ts`
- [X] T074 [P] [US1] Prompts `packages/knowledge/prompts/preguntas/v1.md` y `packages/knowledge/prompts/nichos/v1.md` (cada nicho con 2–3 consultas de búsqueda; sin cifras propias; reglas de `writing/human.md`)
- [X] T075 [US1] Servicio `apps/server/src/services/niche-research.ts` sobre `services/youtube.ts` y `services/jobs.ts`; al fijar canales de referencia, lee sus 30 vídeos recientes y calcula `medianViews` y `bestRatio`
- [X] T076 [US1] Rutas `measures` y `references` en `apps/server/src/http/routes/youtube.ts` y montarlas en `apps/server/src/http/app.ts`
- [X] T077 [P] [US1] Pantalla `apps/web/src/screens/channel/new/Interests.tsx` (campo libre con ejemplos, 10–1.000 caracteres)
- [X] T078 [P] [US1] Pantalla `apps/web/src/screens/channel/new/Questions.tsx` (0–3 preguntas de la IA, «Seguir» y «Saltar»)
- [X] T079 [US1] Pantalla `apps/web/src/screens/channel/new/Niches.tsx` (propuesta de nichos, progreso «Midiendo 2 de 5 nichos», tarjetas con los cuatro indicadores (la saturación como cifra, sin semáforo), los Shorts como cifra aparte y los avisos de `warnings.ts`, «Elegir este nicho», «Escribir mi propio nicho», volver a la tanda anterior (US1 AS5), datos con más de 90 días con «Volver a medir»)
- [X] T080 [P] [US1] Pantalla `apps/web/src/screens/channel/new/References.tsx` (2–4 canales de referencia opcionales de la medida, con su mejor vídeo en «veces lo normal en su canal» y `DataSource`)
- [X] T081 [P] [US1] Pantalla `apps/web/src/screens/channel/new/Rhythm.tsx` (horas por semana 1–60, cara/voz/ninguna, región del público `espana|latam|mixto`)
- [X] T082 [US1] Confirmación antes de gastar (FR-029) en las acciones de IA de Preguntas y Nichos usando el importe de `POST /api/journeys/:id/estimate` en `apps/web/src/screens/channel/Proposal.tsx`
- [X] T082b [US1] Opinión de la IA sobre los nichos medidos (FR-010, US1 AS4), que no tenía tarea: uso `recomendacion` en `packages/core/src/ai/uses.ts`, `channel/outputs.ts`, `packages/ai/src/profiles.ts`, prompt `packages/knowledge/prompts/recomendacion/v1.md` y botón con su coste en `Niches.tsx`, con `DataSource` `ia`
- [X] T082c [US1] Volver a la tanda anterior (US1 AS5), que necesitaba ruta propia: `POST /api/proposals/:id/back`

**Checkpoint**: US1 funciona y se prueba sola.

---

## Phase 4: User Story 2 - Definir el concepto del canal (Priority: P1)

**Goal**: Con el nicho y el ritmo, la IA propone 2–3 conceptos (promesa, pilares, público, formato largo + Shorts,
ritmo y monetización honesta en rangos con fuentes) y el creador elige uno.

**Independent Test**: Con un recorrido en `conceptos` creado en el test, ver 2–3 conceptos con rangos en € citando
`rpm.json`, el aviso «hecho para niños» cuando toca y elegir uno.

### Tests para User Story 2 ⚠️

- [X] T083 [P] [US2] Test de monetización en `packages/core/test/channel/monetization.test.ts`: `monthlyEurRange` = visitas × RPM / 1.000 con el rango de `rpm.json` según región; contenido hecho para niños baja el rango; sin datos no hay cifra
- [X] T085 [P] [US2] Test de la propuesta de conceptos en `apps/server/test/http/concepts.test.ts`: `POST /api/journeys/:id/proposals` con `kind: conceptos` devuelve 2–3 conceptos válidos, «Proponer otra» con indicaciones crea una propuesta hija (`parentId`), elegir avanza a `nombres`
- [X] T086 [P] [US2] Test de pantalla en `apps/web/test/channel/concepts.test.tsx`: monetización en rangos con `DataSource` del conocimiento, avisos visibles, «Elegir este concepto», editar un concepto
- [X] T085b [P] [US2] Test de pantalla en `apps/web/test/channel/niche-change.test.tsx`: volver a Nichos con un concepto aprobado y elegir otro muestra «Tu concepto se basaba en el nicho anterior. ¿Cambiar igualmente?»; cancelar lo deja todo igual (FR-025, US2 AS5)

### Implementation para User Story 2

- [X] T087 [P] [US2] Monetización en `packages/core/src/channel/monetization.ts`
- [X] T089 [P] [US2] Prompt `packages/knowledge/prompts/conceptos/v1.md` (promesa ≤ 160 caracteres, 3–4 pilares unidos por la promesa, formato largo + Shorts de escaparate, sin cifras propias; reglas de `writing/human.md`)
- [X] T090 [US2] Montar en el servidor los conceptos: datos de entrada (nicho medido, referencias, ritmo, conocimiento) y cálculo de monetización y avisos tras la IA en `apps/server/src/services/concepts.ts`, llamado desde `apps/server/src/http/routes/channel.ts`
- [X] T091 [US2] Pantalla `apps/web/src/screens/channel/new/Concepts.tsx`
- [X] T091b [US2] Aviso y confirmación al cambiar de nicho con un concepto aprobado en `apps/web/src/screens/channel/new/NicheChange.tsx` y `ChannelStep.tsx` (el servidor pide la confirmación al volver a Nichos, así que el aviso sale al volver, antes de elegir otro), enviando `confirm: true` a `POST /api/journeys/:id/step`

**Checkpoint**: US1 + US2 forman el MVP.

---

## Phase 5: User Story 3 - Elegir el nombre y la @ (Priority: P2)

**Goal**: La IA propone 6–8 nombres, la app comprueba nombre y @ en YouTube con semáforo, el creador elige, escribe el
suyo o lo deja para más tarde, y se guarda el perfil v1.

**Independent Test**: Con un recorrido en `nombres`, ver 6–8 nombres con semáforo y razón, una @ ocupada en rojo y no
recomendada, «Decidir más tarde» guarda el perfil con nombre provisional.

### Tests para User Story 3 ⚠️

- [X] T092 [P] [US3] Test del semáforo en `packages/core/test/market/names.test.ts`: reglas de data-model.md; @ ocupada = rojo; canales parecidos, 3 o más vídeos con el nombre en el título o más de 30 letras = ámbar (FR-017); cualquier fallo de comprobación = `sin_comprobar` y nunca verde
- [X] T093 [P] [US3] Test del servicio `name-check` en `apps/server/test/services/name-check.test.ts`: como mucho 4 comprobaciones a la vez, caché de 1 h, cada nombre emite `item`
- [X] T094 [P] [US3] Test de rutas en `apps/server/test/http/names.test.ts`: `POST /api/journeys/:id/name-checks` (`202`), paso a `hecho` crea `profile_version` 1 con origen `ia`, nombre aplazado guarda nombre provisional
- [X] T095 [P] [US3] Test de pantalla en `apps/web/test/channel/names.test.tsx`: semáforo con texto e icono, «la @ de tu canal», «Quedarme con este nombre», «Escribir el mío», «Decidir más tarde»; elegir un nombre en rojo pide confirmación y no lo bloquea; aviso de que la @ solo se confirma al crearla en YouTube (FR-018)

### Implementation para User Story 3

- [X] T096 [P] [US3] Semáforo de nombres en `packages/core/src/market/names.ts`
- [X] T097 [P] [US3] Prompt `packages/knowledge/prompts/nombres/v1.md` (6–8 nombres, @ válida de 3–30 caracteres; reglas de `writing/human.md`)
- [X] T098 [US3] Servicio `apps/server/src/services/name-check.ts` y ruta `name-checks` en `apps/server/src/http/routes/youtube.ts`
- [X] T099 [US3] Cierre del recorrido nuevo: paso `hecho` arma el `ChannelProfile` desde nicho, concepto y nombre y guarda la versión 1 en `apps/server/src/services/profile.ts`
- [X] T100 [US3] Pantalla `apps/web/src/screens/channel/new/Names.tsx` (comprobar el nombre escrito por el creador, confirmación al elegir uno en rojo, aviso de que la @ se confirma en YouTube, nombre provisional al aplazar)
- [X] T100b [US3] Elegir más tarde el nombre aplazado y la pantalla de inicio con el canal (FR-018b, US3 AS5 y AS6), que no tenían tarea: paso `hecho` → `nombres` en `packages/core/src/channel/journey.ts`, `Start.tsx` y `apps/web/src/screens/home/Home.tsx`

**Checkpoint**: recorrido de canal nuevo completo.

---

## Phase 5b: Correcciones de la revisión retroactiva

**Goal**: Cerrar los seis hallazgos graves de `checklists/validation.md`, con las recomendaciones P10, P11 y P12 de
`decisions.md`, que el creador aprobó el 2026-11-04.

- [X] T129 [P] G1: sin clave, `auto` usa yt-dlp, con una prueba del cableado real; una clave que la Data API rechaza también cae a yt-dlp, en `apps/server/src/services/youtube.ts` y `apps/server/src/main.ts`
- [X] T130 [P] G2: las búsquedas de yt-dlp completan fechas con el RSS en `packages/youtube/src/ytdlp/adapter.ts`, y la pantalla dice que solo se conoce la fecha de lo más nuevo
- [X] T131 [P] G3: muestra repartida de canales y `unread_channels` separado de los que ocultan la cifra, en `packages/core/src/market/measures.ts` y migración `0003`
- [X] T132 G4: cifras de los conceptos calculadas con el nicho, el ritmo y la medida actuales al leer y al cerrar el perfil, y aviso si el concepto se escribió con otro nicho, horas o forma de salir en vídeo (la región no avisa, entrada 32), en `apps/server/src/services/concepts.ts`
- [X] T133 [P] G5: confianza de los ingresos en pantalla y en el perfil, y nota de `rpm.json` sin afirmaciones sin fuente
- [X] T134 [P] G6: el gasto de una respuesta inválida se registra, en `packages/ai/src/anthropic/adapter.ts` y `apps/server/src/services/ai-run.ts`
- [X] T134b Segunda ronda tras la revisión: región de las cifras, fuente real de la medida, caché del respaldo, límites de los feeds, entrada de la IA, perfiles antiguos, medida sin canales leídos y contratos. Tercera ronda: marca de región puesta a mano, aviso también por horas y forma de salir en vídeo, cifras fuera de `previous`, muestra con los 4 canales con más visitas, feeds que no se repiten al fallar y la propuesta anterior fuera de las fuentes de cifras
- [X] T134c P16 a): sin veredicto si se conoce la cifra de menos de la mitad de los canales preguntados, en `packages/core/src/market/measures.ts`
- [X] T134d Cuarta ronda tras la Puerta A: un canal que falla cuenta como no leído, lo recortado se vuelve a validar, `auto` cae también por tiempo agotado, textos de lo mirado y singular, etiqueta de la estimación de euros y comprobación de que con `prefers-reduced-motion` no queda ningún bucle en marcha. Quinta ronda: referencias por debajo del mínimo, causa del fallo, elementos de lista recortados y glosario en las fuentes del conocimiento
- [X] T134e P18 b): lo que el recorte quita se dice en todas las pantallas (preguntas, opinión y propuestas), y la IA no puede dar un concepto sin supuestos, ni se muestra si los pierde todos, en `packages/core/src/channel/claims.ts`, `Questions.tsx` y `Niches.tsx`
- [X] T135 [A] Puerta A de las correcciones: ejecutar `/puerta-a Correcciones`. No se marca `[X]` hasta que la skill diga «pasada»; el informe queda en `specs/003-channel-and-niche/checklists/validation.md`

**Checkpoint**: el camino real por defecto mide con yt-dlp, sin clave, en las pruebas con un binario falso.

---

## Phase 6: User Story 4 - Posicionar un canal que ya existe (Priority: P2)

**Goal**: El creador pega el enlace o la @ de su canal, lo confirma, la app lee sus vídeos y la IA saca el perfil
actual (citando vídeos) y propone cómo posicionarlo.

**Independent Test**: Con el canal fake de 30 vídeos, recorrer Enlace → Confirmar → Lectura → Ritmo → Posicionamiento y aprobar;
el perfil tiene la misma forma que uno nuevo. Con el canal de 3 vídeos se ofrece el recorrido de canal nuevo
conservando nombre y @.

### Control adelantado para la Puerta A

- [X] T123 E2E de accesibilidad a 375 y 1280 px en tema claro y oscuro, con teclado y `prefers-reduced-motion`, para las pantallas de US1, US2 y US3 en `apps/web/e2e/channel-niche.spec.ts` (auditoría compartida en `audit.ts`) y `a11y.spec.ts` (teclado); cada historia añade las suyas antes de su Puerta A

### Tests para User Story 4 ⚠️

- [X] T101 [P] [US4] Test de rutas en `apps/server/test/http/existing.test.ts`: `POST /api/journeys/:id/resolve` (`{channelId,title,handle,subscribers,thumbnailUrl}`, `404` si no existe), `POST /api/journeys/:id/reading` (`202`), `youtube_channel_id` repetido da `conflicto`
- [X] T102 [P] [US4] Test del servicio `channel-reading` en `apps/server/test/services/channel-reading.test.ts`: hasta 200 vídeos con título, visitas, duración y fecha (fecha exacta del RSS para los recientes), resumen por formato con duración media, vídeos por semana y los 3 mejores y 3 peores según veces lo normal (FR-020b: los de menos de 30 días no cuentan como peores), cada cifra marcada como dato con fecha (FR-020); menos de 5 vídeos marca `lowInfo`; lo que funciona cita vídeos de la lectura
- [X] T103 [P] [US4] Test de posicionamiento en `apps/server/test/http/positioning.test.ts`: aprobar crea `profile_version` 1 con origen `ia` y la forma de `ChannelProfile`; editar antes de aprobar
- [X] T104 [P] [US4] Tests de pantallas en `apps/web/test/channel/existing.test.tsx` y E2E en `apps/web/e2e/channel-existing.spec.ts`: acepta enlace de canal, @ o enlace de vídeo; «Sí, es mi canal»; progreso de lectura; canal de 3 vídeos ofrece recorrido nuevo; axe sin fallos

### Implementation para User Story 4

- [X] T105 [P] [US4] Prompts `packages/knowledge/prompts/lectura_canal/v1.md` (perfil actual: nicho, pilares, público, lo que funciona y lo que no, basándose en las veces lo normal y citando vídeos por id) y `packages/knowledge/prompts/posicionamiento/v1.md`, los dos con las reglas de `writing/human.md`
- [X] T106 [US4] Servicio `apps/server/src/services/channel-reading.ts` (resolver, leer canal y vídeos, RSS, calcular `ratio` con `own-baseline.ts`, guardar `channel_reading`)
- [X] T107 [US4] Rutas `resolve` y `reading` en `apps/server/src/http/routes/youtube.ts`
- [X] T108 [P] [US4] Pantallas `apps/web/src/screens/channel/existing/ChannelUrl.tsx` y `Confirm.tsx`
- [X] T109 [US4] Pantalla `apps/web/src/screens/channel/existing/Reading.tsx` (progreso, resumen de cifras por formato con `DataSource` (duración media, frecuencia, mejores y peores vídeos con «veces lo normal en su canal»), «Ver mi perfil actual», con menos de 5 vídeos ofrece el recorrido de canal nuevo conservando nombre y @)
- [X] T110 [US4] Pantalla `apps/web/src/screens/channel/existing/Positioning.tsx` (perfil actual con vídeos citados, propuesta de cambios, «Aprobar»)

- [X] T110b [A] [US4] Puerta A de US4: ejecutar `/puerta-a US4`. No se marca `[X]` hasta que la skill diga «pasada»; el informe queda en `specs/003-channel-and-niche/checklists/validation.md`

**Checkpoint**: los dos recorridos acaban en el mismo perfil.

---

## Phase 7: User Story 5 - Ver, editar y exportar el perfil del canal (Priority: P3)

**Goal**: El creador ve el perfil vigente, lo edita (nueva versión), restaura versiones, cambia el nombre, lo descarga
como documento y como datos, y gestiona YouTube y el consumo en Ajustes.

**Independent Test**: Con un perfil creado en el test, editar dos veces, restaurar la 1 (versión 4 `restaurada`, la 2 y
la 3 siguen), descargar `.md` y `.json` con las mismas secciones y «Fuentes» al final, y guardar una clave de prueba
que solo se ve por su `hint`.

### Tests para User Story 5 ⚠️

- [X] T111 [P] [US5] Test de exportación en `packages/core/test/channel/export.test.ts`: Markdown y JSON con las mismas secciones, «Fuentes» al final con cada dato de YouTube (fecha) y cada fichero de conocimiento (revisión), opiniones marcadas como de la IA
- [X] T112 [P] [US5] Tests de rutas de perfil en `apps/server/test/http/profile.test.ts`: `GET .../profile/versions` y `/versions/:v`, `PUT .../profile` con `baseVersion` desfasada (`409`), `POST .../profile/restore`, `PATCH /api/channels/:id/name` con `checkId`, `GET .../export?format=md|json` con `Content-Disposition`
- [X] T113 [P] [US5] Tests de ajustes en `apps/server/test/http/youtube-settings.test.ts` y `usage.test.ts`: `GET/PUT /api/settings/youtube/source`, `PUT api-key` comprueba con una llamada de 1 unidad y nunca devuelve la clave, `400` si no vale, `DELETE` (`204`), `update-reader` (`202`), `GET /api/usage?from&to` con `todayCents` y `monthCents`; buscar la clave de prueba en todo lo escrito (base de datos, logs, respuestas) no da resultados
- [X] T114 [P] [US5] Tests de pantallas en `apps/web/test/channel/profile.test.tsx` y `apps/web/test/settings/youtube.test.tsx`: «Descargar como documento» y «Descargar como datos», historial, restaurar, aviso de datos con más de 90 días con «Volver a medir», clave solo con `hint`, consumo con totales (sin el botón «Volver a medir», pausado en P27, entrada 102)

- [X] T124 [P] E2E de fuga de la clave de YouTube en `apps/web/e2e/secrets-leak.spec.ts` (base de datos, logs, carpeta de trabajo, Git, respuestas HTTP) (se escribe antes que T117, que guarda la clave; fallará hasta entonces)

### Implementation para User Story 5

- [X] T115 [P] [US5] Exportación en `packages/core/src/channel/export.ts`
- [X] T116 [US5] Rutas de perfil y exportación en `apps/server/src/http/routes/channel.ts` sobre `apps/server/src/services/profile.ts`
- [X] T117 [US5] Ajustes de YouTube: guardar la clave en el `SecretStore` (`apps/server/src/secrets/`), fuente, cupo y actualizar el lector (descarga verificada por SHA256 con `installer/versions.json`) en `apps/server/src/http/routes/youtube-settings.ts`; una clave que YouTube rechaza se marca y deja de probarse (P15 a))
- [X] T118 [P] [US5] Ruta `GET /api/usage` en `apps/server/src/http/routes/usage.ts`
- [X] T119 [US5] Pantallas `apps/web/src/screens/channel/profile/Profile.tsx`, `ProfileHistory.tsx` y `Export.tsx` (siguiente paso: banco de ideas «próximamente») (sin «Volver a medir» ni «Cambiar el nombre»: P27 y P29)
- [X] T120 [P] [US5] Pantalla `apps/web/src/screens/settings/YouTubeSettings.tsx` (fuente, «clave de YouTube» en «Modo experto», `hint`, cupo con aviso al pasar del 80 % del día (FR-030), «Actualizar el lector», aviso de clave rechazada (P15 a)) enlazada en `apps/web/src/screens/settings/Settings.tsx`
- [X] T121 [P] [US5] Pantalla `apps/web/src/screens/settings/UsageLog.tsx` y lista de conocimiento con más de 180 días en Ajustes

- [X] T121c [US5] P29 (entrada 116): «Cambiar el nombre» en el perfil de un canal nuevo abre el paso de nombres (`hecho → nombres` también con el nombre elegido, en `packages/core/src/channel/journey.ts`), con test en `packages/core/test/channel/journey.test.ts` y `apps/web/test/channel/profile.test.tsx`
- [X] T121d [US5] P30 (entrada 117): editar en el perfil el ritmo, la región, la forma de aparecer y el contenido para niños, y recalcular el dinero y los avisos con el conocimiento (`apps/server/src/services/profile.ts`, `ProfileEditor`); tests en `apps/server/test/http/profile.test.ts`
- [X] T121e [US5] P27 (entrada 114): «Volver a medir» en el perfil mide de nuevo el nicho elegido en segundo plano y guarda una versión nueva con las cifras nuevas (`POST /api/channels/:id/profile/remeasure`, `202 {jobId}`); en un canal que ya existía, «Volver a leer tu canal» (P32, entrada 125); tests de ruta y de pantalla
- [X] T121f [US5] P28 (entrada 115): regenerar con IA la promesa, los temas o el público con indicaciones, con estimación de coste antes y guardado como versión nueva (`ia`); la propuesta espera guardada en `profile_regeneration` (P33, entrada 126); tests de ruta, de coste y de los fallos de IA
- [X] T121b [A] [US5] Puerta A de US5: ejecutar `/puerta-a US5` (primer intento 2026-11-05: bloqueada por P27 a P31; pasada el 2026-11-06 tras tres vueltas). No se marca `[X]` hasta que la skill diga «pasada»; el informe queda en `specs/003-channel-and-niche/checklists/validation.md`

**Checkpoint**: todas las historias funcionan por separado.

---

## Polish & Cross-Cutting Concerns

- [X] T122 [P] Revisar todos los textos nuevos con `apps/web/test/glossary.test.ts` y `packages/knowledge/writing/human.md`
- [X] T122b [P] Test en `apps/web/test/channel/why.test.tsx`: cada pantalla de los dos recorridos tiene su frase de por qué importa el paso (FR-004)
- [X] T125 [P] E2E de casos difíciles de quickstart §4 que falten (sin lector, límite de 1 céntimo, cifra inventada, versiones) en `apps/web/e2e/channel-hard-cases.spec.ts`
- [X] T125b [P] Pruebas con YouTube real en `packages/youtube/test/youtube.real.test.ts` (`pnpm test:real-youtube`, fuera de CI): 10 @ conocidas y ocupadas salen en rojo (SC-004), medir 5 nichos tarda menos de 2 min (SC-003) y analizar un canal menos de 1 min (SC-005). También lo que US4 deja por comprobar: la imagen del canal (entrada 56), `/shorts` y canales grandes (57), canales sin lista de vídeos (68), canal sin título y 404 en `/videos` (81), una @ con ñ (84) y las URL `/c/` y `/user/` (88). **Hecha con yt-dlp (entrada 141); 68 y 81 sin comprobar con YouTube real (entrada 134).**
- [X] T126 Pasar `specs/003-channel-and-niche/quickstart.md` §1–§5 entero, ejecutar T125b y anotar resultados en `specs/003-channel-and-niche/checklists/validation.md`
- [X] T127 Auditoría de novato (§6) con el agente `usuario-novato` sobre los dos recorridos; anotar en `specs/003-channel-and-niche/novice-audit.md` y corregir los bloqueos
- [X] T128b [A] Puerta A de Polish: ejecutar `/puerta-a Polish`. No se marca `[X]` hasta que la skill diga «pasada»; el informe queda en `specs/003-channel-and-niche/checklists/validation.md`
- [X] T128 Actualizar el estado de la 003 en `CLAUDE.md`

---

## Dependencies & Execution Order

### Entre fases

- **Setup (Phase 1)**: sin dependencias. Los spikes T001–T003 van antes de los adaptadores (T050–T052).
- **Foundational (Phase 2)**: depende de Setup y bloquea todas las historias.
- **US1 (Phase 3)**: tras Foundational.
- **US2 (Phase 4)**: tras Foundational; usa el nicho medido de US1 como entrada, pero sus tests crean el recorrido en
  `conceptos` directamente.
- **US3 (Phase 5)**: tras Foundational; sus tests crean el recorrido en `nombres`.
- **US4 (Phase 6)**: tras Foundational; independiente del recorrido nuevo.
- **US5 (Phase 7)**: tras Foundational; necesita un perfil (lo crea el test). En la app real llega tras US3 o US4.
- **Polish**: tras las historias que se quieran entregar.

### Dentro de cada historia

- Tests primero (deben fallar), luego dominio en `packages/core`, prompts, servicios, rutas y pantallas.

### Grafo

```text
Setup → Foundational ─┬→ US1 → US2 ─┐
                      ├→ US3 ───────┤
                      ├→ US4 ───────┼→ US5 → Polish
                      └─────────────┘
```

---

## Parallel Examples

### Phase 2

```text
T009, T010, T011, T012, T016, T016b, T017, T018, T019, T020, T022, T023, T024, T027, T028, T031, T033, T084, T063b (tests en paquetes distintos)
T034, T035, T036, T037, T088 (core y conocimiento)
T049, T050, T051, T052 (adaptadores de YouTube)
T059, T060, T061, T063c (componentes y textos)
```

### US1

```text
T066, T066b, T067, T068, T069, T070, T071
T072c → T072, T072b, T073, T074 → T075 → T076
T077, T078, T080, T081 (pantallas independientes) mientras se hace T079
```

### US2

```text
T083, T085, T085b, T086 → T087, T089 → T090 → T091 → T091b
```

### US3

```text
T092, T093, T094, T095 → T096, T097 → T098 → T099 → T100
```

### US4

```text
T101, T102, T103, T104 → T105, T108 → T106 → T107 → T109, T110
```

### US5

```text
T111, T112, T113, T114 → T115, T118, T120, T121 → T116, T117, T119
```

---

## Implementation Strategy

### MVP primero (US1 + US2)

1. Phase 1 y Phase 2.
2. US1: nichos medidos con datos reales.
3. US2: concepto del canal.
4. **Parar y validar** con quickstart §2 hasta el concepto.

### Entrega incremental

1. Base → US1 → US2 (MVP) → US3 (recorrido nuevo completo) → US4 (canal existente) → US5 (perfil, exportar, ajustes).
2. Cada historia se cierra con lint, typecheck, test, E2E y commit.

---

## Notes

- [P] = ficheros distintos y sin dependencias pendientes.
- Si un spike cambia un supuesto (S2 sin 404 fiable, S3 lento), se ajusta `thresholds.json` o el semáforo queda en
  `sin_comprobar`, y se anota en research.md antes de seguir.
- Nada se sube (`git push`) sin que lo pida el creador.

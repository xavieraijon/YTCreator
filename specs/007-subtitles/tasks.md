---
description: "Lista de tareas de la feature 007: subtítulos"
---

# Tasks: Subtítulos

**Input**: Documentos de diseño en `/specs/007-subtitles/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: SÍ. La constitución (principio IX) pide que la lógica de dominio tenga tests escritos antes o junto al
código. Cada tarea de test va antes que su implementación y debe fallar al principio.

**Organization**: Las tareas van agrupadas por historia de usuario, para que cada una se pueda implementar y probar por
separado.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US5)
- **[A]**: tarea de Puerta A que cierra una fase o historia (principio XI)
- Cada descripción lleva la ruta exacta del fichero

## Convenciones comunes

- **Idiomas:** código, identificadores y nombres de fichero en inglés; textos de interfaz, prompts y documentos en
  español.
- **Sin servicios reales en los tests:** ningún test llama a una IA, descarga el motor o los modelos, ni ejecuta
  `whisper-cli`. Se usan el proveedor de IA `fake` (`YTCREATOR_FAKE_AI=<escenario>`), el reconocimiento falso
  (`YTCREATOR_FAKE_SPEECH=1`, T016) y un binario falso de `whisper-cli` en `packages/speech/test/fixtures/` (como
  `packages/youtube/test/fixtures/fake-yt-dlp`). Las pruebas reales van aparte (T075, T076).
- **Códigos, no textos:** el servidor devuelve códigos y la web los traduce en `apps/web/src/strings/subtitles.es.ts`.
  Ningún texto puede usar las palabras de `packages/ui/test/forbidden-terms.ts`, ni «transcripción», «modelo», «SRT» o
  «WAV» fuera de «Modo experto» ([ui-screens](./contracts/ui-screens.md)).
- **Comandos con Node 24:** `fnm exec --using=24 -- pnpm lint|typecheck|test|test:e2e`. **No hay que ejecutar
  `pnpm format` global**: se formatean solo los ficheros tocados con `npx prettier --write`.
- **Si cambia un prompt:** hay que borrar `node_modules/.vitest-cache` antes de `test`.
- **El uso de IA nuevo** sigue los pasos de siempre: `AI_USES` en `packages/core/src/ai/uses.ts`, su esquema en
  `CHANNEL_OUTPUTS`, su perfil en `packages/ai/src/profiles.ts` con los valores de [ai-uses](./contracts/ai-uses.md),
  `CLAIM_FIELDS: []` en `apps/server/src/services/ai-run.ts`, su salida en `packages/ai/src/fake/outputs.ts`, su prompt
  en `packages/knowledge/prompts/revision_subtitulos/v1.md`, su suma en `lock.json` y su nombre para personas en `uses`
  de `apps/web/src/strings/es.ts`.
- **Componentes:** solo los de `@ytcreator/ui`. Si un subtítulo, el campo de tiempo `m:ss,d` o el botón de oír no se
  pueden montar con ellos, se para y se pregunta al creador antes de crear uno (R18).
- **Al cerrar cada fase o historia:** `/puerta-a` y commit (`feat(007): …`).

---

## Phase 1: Setup

**Purpose**: Dejar preparados los sitios donde va el código nuevo.

- [X] T001 Crear `packages/core/src/subtitles/index.ts` y `packages/core/src/speech/index.ts`, exportados desde `packages/core/src/index.ts`, y `packages/core/src/api/subtitles.ts` (vacío, con su export) exportado desde `packages/core/src/api/index.ts`
- [X] T002 [P] Crear el paquete `packages/speech` como `packages/youtube`: `package.json` (`@ytcreator/speech`, depende de `@ytcreator/core` y `zod`, script `test:real-speech` con `vitest.real.config.ts`), `tsconfig.json` con su referencia en el `tsconfig.json` raíz, `src/index.ts`, y su proyecto en `vitest.config.ts` con `define: allowFakeAi` y `exclude: ['test/**/*.real.test.ts']`. Añadir `test:real-speech` al `package.json` raíz
- [X] T003 [P] Crear `apps/web/src/strings/subtitles.es.ts` con el objeto `subtitlesEs` vacío, y añadirlo a los catálogos de `apps/web/test/glossary.test.ts` y `apps/web/test/strings-coverage.test.ts`
- [X] T004 [P] Crear la carpeta `packages/knowledge/subtitles/` y `packages/knowledge/src/subtitles.ts`, exportado desde `packages/knowledge/src/index.ts`, con un lector tipado de paquetes `{version, reviewedAt, source, data}` como el de `packages/knowledge/src/publish.ts`
- [X] T005 [P] Añadir `mediabunny` a `apps/web/package.json` con versión exacta (la última estable al instalar, sin `^`), decisión 4 y R3. Comprobar que `pnpm install --frozen-lockfile` funciona tras actualizar `pnpm-lock.yaml`

---

## Phase 2: Foundational

**Purpose**: Lo que necesitan todas las historias: modelo, estado, migración, repos, conocimiento, el puerto de
reconocimiento con su falso y la ruta base.

**⚠️ CRITICAL**: Ninguna historia empieza antes de cerrar esta fase.

- [X] T006 [P] Test de modelo en `packages/core/test/subtitles/model.test.ts` para cada esquema de [data-model](./data-model.md): `Cue` con `id`, `start` y `end` en segundos con 3 decimales y «`0 ≤ start < end ≤ audioSeconds`», `text` «hasta 2 líneas separadas por `\n` (1 en un Short); no vacío», `flags` del enum `del_guion|poca_seguridad|cambio_ia`, `heard` obligatorio con `del_guion` o `cambio_ia`, `reviewed` booleano; `HeardWord` `{text, start, end, p}` con `0 ≤ p ≤ 1`; `SubtitlesContent` `{cues, words, audioSeconds}`; `SUBTITLE_ORIGINS` = `reconocimiento|edicion|ia|recuperada|reaplicada`; y una corrección en bloque `{from, to}` con los dos no vacíos y distintos
- [X] T007 Implementar `packages/core/src/subtitles/model.ts` para que pase T006
- [X] T008 [P] Test en `packages/core/test/subtitles/status.test.ts` de `subtitlesStatus` con la tabla «Pista» de `data-model.md` (`sin_hacer`, `en_marcha` con el trabajo `en_cola` o `en_curso`, `borrador`, `aprobados`) y de que una versión nueva tras aprobar da `borrador`
- [X] T009 Implementar `packages/core/src/subtitles/status.ts` para que pase T008
- [X] T010 [P] Test de migración en `apps/server/test/db/migration-0008.test.ts`. Se parte de una base con las migraciones 0001 a 0007 y filas en `background_job` (de cada tipo y estado), `script` y `package_version`, y al aplicar 0008: se conservan todas las filas de `background_job` con sus valores; `kind` admite `reconocer_voz` y `descargar_motor`; `status` admite `en_cola`; `reconocer_voz` exige `channel_id`; existen `subtitle_track` (con `script_id` único, `format` en `largo|short` y `replacements` por defecto `[]`) y `subtitle_version` (con `origin` de su enum y `UNIQUE (track_id, version)`)
- [X] T011 Escribir `apps/server/src/db/migrations/0008_subtitles.sql` para que pase T010, reconstruyendo `background_job` como `0005_idea_bank.sql`; actualizar los tipos de `apps/server/src/db/repos/jobs.ts` con los tipos y el estado nuevos
- [X] T012 [P] Test de repos en `apps/server/test/db/repos/subtitles.test.ts`: crear la pista, leerla por guion, unicidad por guion, numeración de versiones, última versión, `JSON` validado al leer, versiones inmutables, guardar la aprobada, `replacements`, el audio (`audio_file`, `audio_seconds`, `source_name`) y `job_id`/`job_op`
- [X] T013 Implementar `apps/server/src/db/repos/subtitle-tracks.ts` y `apps/server/src/db/repos/subtitle-versions.ts` para que pasen T012
- [X] T014 [P] Escribir `packages/knowledge/subtitles/craft.json` con R7, R8 y R10: límites de lectura del vídeo largo (2 líneas, 42 caracteres por línea, 17 caracteres por segundo, 0,83 a 7 s, 83 ms entre subtítulos) con la guía de Netflix para el español como fuente (abrirla antes de citarla; la cifra que no se confirme lleva `assumption: true`); los del Short (1 línea de 32) con `assumption: true`; el umbral de `poca_seguridad` (0,5) y los factores de velocidad por sistema y modelo con `assumption: true`. Escribir `packages/knowledge/subtitles/youtube.json` con los formatos que admite YouTube Studio, citando su ayuda («Formatos de subtítulos admitidos»), abierta antes de citarla. `reviewedAt` del día. Test de los dos en `packages/knowledge/test/subtitles.test.ts`
- [X] T015 [P] Escribir el puerto en `packages/core/src/speech/port.ts` y los fallos en `packages/core/src/speech/failures.ts` según [speech-recognizer](./contracts/speech-recognizer.md): `recognize({audioPath, language, hint, model, signal, onProgress})`, `HeardWord` y `SpeechFailure` = `sin_motor|sin_modelo|audio_no_valido|sin_memoria|interrumpido|interno`
- [X] T016 Batería de contrato en `packages/speech/test/contract/recognizer-contract.ts` con las reglas 1 a 6 de [speech-recognizer](./contracts/speech-recognizer.md), y el reconocimiento falso en `packages/speech/src/fake/` con sus audios de prueba (`hola.wav`, `con-errores.wav`, `improvisa.wav`, `silencio.wav`, `fallo-<código>.wav`), activado con `YTCREATOR_FAKE_SPEECH` solo si `__YTC_ALLOW_FAKE_AI__`; que pase la batería en `packages/speech/test/fake.contract.test.ts`. Añadir a `.github/workflows/release.yml` el paso «No fake speech», que busca en `apps/server/dist/server.mjs` sus marcas (`YTCREATOR_FAKE_SPEECH`, `createFakeRecognizer` y los nombres de sus audios)
- [X] T017 Escribir en `packages/core/src/api/subtitles.ts` `SubtitlesView`, los cuerpos y los códigos de [http-api](./contracts/http-api.md), reutilizando `en_curso`, `version_cambiada`, `sin_aprobar` y `validacion`
- [X] T018 [P] Test de rutas en `apps/server/test/http/subtitles-base.test.ts`: `GET /scripts/:id/subtitles` sin pista da `status: 'sin_hacer'`; guion inexistente, 404; guion de otro canal, 404; guion sin aprobar, la vista lo dice
- [X] T019 Implementar la base de `apps/server/src/services/subtitles.ts` y `apps/server/src/http/routes/subtitles.ts` para que pase T018, y registrar las rutas, el reconocedor (real o falso según el entorno) y sus dependencias en `apps/server/src/http/app.ts` y `apps/server/src/main.ts`
- [X] T020 Añadir `subtitlesApi` en `apps/web/src/api/client.ts` y la ruta `/canal/subtitulos/:scriptId` en `apps/web/src/router.ts` (con su caso en `apps/web/test/router.test.ts`), con el esqueleto en `apps/web/src/screens/channel/subtitles/SubtitlesScreen.tsx` y la frase de por qué importa
- [X] T021 [A] Puerta A de Foundational: ejecutar `/puerta-a 007 Foundational`. No se marca `[X]` hasta que la skill diga «pasada»; el informe queda en `checklists/validation.md`

**Checkpoint**: la base está lista.

---

## Phase 3: User Story 1 - Subtítulos del vídeo largo, listos para descargar (Priority: P1) 🎯 MVP

**Goal**: Del fichero final de un vídeo largo a unos subtítulos troceados, corregidos con el guion y descargables, con el
reconocimiento en el equipo y sin coste.

**Independent Test**: Con el reconocimiento falso y un fichero de prueba corto, elegir el fichero, ver el avance,
recargar a mitad, recibir los subtítulos con una corrección marcada y descargar un SRT válido.

- [X] T022 [P] [US1] Test en `packages/core/test/subtitles/segment.test.ts` del troceado (R8): ningún subtítulo pasa de las líneas, los caracteres por línea, la velocidad de lectura ni las duraciones de `craft.json`; sin solapes y con la separación mínima; corta antes en final de frase, pausa, coma o conjunción que entre dos palabras cualesquiera; no deja una palabra sola en una línea si se puede evitar; reparte las dos líneas; una palabra más larga que una línea no rompe nada; audio vacío da cero subtítulos
- [X] T023 [US1] Implementar `packages/core/src/subtitles/segment.ts` para que pase T022 (SC-002)
- [X] T024 [P] [US1] Test en `packages/core/test/subtitles/align.test.ts` de las correcciones (R9) con casos fijos: nombre propio mal oído corregido y marcado con lo oído; «veinte» frente a «20» y al revés; cambio de hasta 3 palabras parecidas; una frase improvisada que el guion no tiene, intacta; una frase del guion que no se dijo, sin insertar; palabras parecidas pero en otro sitio, sin tocar; 1 hora de audio en menos de 2 s (SC-004)
- [X] T025 [US1] Implementar `packages/core/src/subtitles/align.ts` (normalización, alineamiento global en banda y correcciones) para que pase T024
- [X] T026 [P] [US1] Test en `packages/core/test/subtitles/flags.test.ts` (R10): `poca_seguridad` con la probabilidad media por debajo del umbral; `lectura_rapida` y `fuera_de_limites` calculadas y no guardadas; el número «para revisar» cuenta los subtítulos con marcas sin revisar
- [X] T027 [US1] Implementar `packages/core/src/subtitles/flags.ts` para que pase T026
- [X] T028 [P] [US1] Test en `packages/core/test/subtitles/export.test.ts` (R14): SRT con numeración, `hh:mm:ss,mmm`, líneas y línea en blanco; WebVTT con cabecera y `hh:mm:ss.mmm`; SBV con `h:mm:ss.mmm,h:mm:ss.mmm`; UTF-8 con tildes y «ñ»; y el nombre del fichero desde el título principal o el de la idea, sin caracteres no admitidos
- [X] T029 [US1] Implementar `packages/core/src/subtitles/export.ts` para que pase T028
- [X] T030 [P] [US1] Test en `apps/server/test/services/speech-engine.test.ts` de la descarga del motor y los modelos (R1, R2) con un `fetch` falso: SHA256 correcto, se pone en su sitio; incorrecto, `hash` y nada cambia; corte a mitad y reanudación con `Range`; sin espacio, `espacio`; sistema sin entrada en `versions.json`, `descarga`; en Linux, el `.tar.gz` se extrae en `APP_HOME/bin/whisper/`; ya instalado, no descarga; el trabajo `descargar_motor` informa del avance en bytes
- [X] T031 [US1] Implementar `apps/server/src/services/speech-engine.ts` para que pase T030, con el patrón de `apps/server/src/services/reader-update.ts`, y las rutas `GET /speech/engine`, `POST /speech/engine` y `PUT /speech/engine/model` de [http-api](./contracts/http-api.md). Ampliar el esquema de `installer/versions.json` con `whisperCpp` (versión `b5454`, dirección y SHA256 por sistema) y `whisperModels` (`large-v3-turbo-q5_0`, `small-q5_1` y `silero-v6.2.0`, con dirección fijada por commit, tamaño y SHA256). Las direcciones y SHA256 de Linux y de los modelos se sacan de sus orígenes oficiales y se comprueban descargándolos una vez
- [X] T032 [US1] Escribir `.github/workflows/whisper-macos.yml` (lanzado a mano): compila `whisper-cli` de la etiqueta `b5454` en ejecutores `macos` de Apple Silicon (con Metal incrustado) e Intel, enlazado de forma estática, comprueba que arranca sin bibliotecas externas (`otool -L`) y publica los dos binarios con su SHA256 en la versión `whisper-cpp-b5454` del repositorio. **Lanzarlo y publicar es una acción externa: se pide permiso al creador antes.** Después, fijar sus direcciones y SHA256 en `installer/versions.json`
- [X] T033 [P] [US1] Test del adaptador en `packages/speech/test/whisper.test.ts` con un `whisper-cli` falso en `packages/speech/test/fixtures/fake-whisper-cli` (un guion de shell que imprime el avance y escribe un JSON como el de `-ojf`): los argumentos (modelo, `-l es`, detección de voz, `-ojf`, `--prompt` con la pista, hilos, sin shell); el entorno mínimo con `LD_LIBRARY_PATH` solo en Linux; la lectura del JSON a `HeardWord` (probabilidad media de los fragmentos de cada palabra, tiempos en segundos); el avance creciente; y cada fallo de [speech-recognizer](./contracts/speech-recognizer.md). Que pase también la batería de contrato con el binario falso
- [X] T034 [US1] Implementar `packages/speech/src/whisper/` (`command.ts`, `process.ts`, `parse.ts`, `classify.ts`, `adapter.ts`) para que pase T033, como `packages/youtube/src/ytdlp/`; la pista del guion (`hint`) se construye en `packages/core/src/subtitles/hint.ts` (nombres propios, cifras y términos, hasta unos 200 tokens) con su test en `packages/core/test/subtitles/hint.test.ts`
- [X] T035 [P] [US1] Test de rutas en `apps/server/test/http/subtitles-recognize.test.ts`: `PUT /scripts/:id/subtitles/audio` acepta un WAV PCM 16 kHz mono y devuelve `{audioSeconds, estimateSeconds}`, y rechaza otro formato (400 `audio_no_valido`), más de 3 horas (413 `audio_largo`), el disco lleno (507 `sin_espacio`) y un guion sin aprobar (409 `sin_aprobar`); la subida se escribe en un temporal y se renombra; `POST …/recognize` da 202, o 409 `sin_motor` o `sin_audio`; un segundo reconocimiento queda `en_cola` y empieza al terminar el primero; `POST …/cancel` deja `fallido` con `cancelado` y no crea versión; al terminar, versión 1 con origen `reconocimiento`, `draft_version` y subtítulos troceados y corregidos; un trabajo que el servidor no terminó aparece `interrumpido` al arrancar; `GET …/audio` con `Range` da 206; `GET …/export?format=srt`; y ningún log lleva el texto oído ni la ruta del audio
- [X] T036 [US1] Implementar en `apps/server/src/services/subtitles.ts` y `apps/server/src/http/routes/subtitles.ts` la subida en flujo a `~/YTCreator/subtitulos/<scriptId>/`, la comprobación de la cabecera, la cola de un reconocimiento a la vez, el trabajo `reconocer_voz` (pista del guion → reconocer → trocear → alinear → marcas → versión 1), el factor de velocidad medido en `app_settings` (`speech.speed`, R7), la reproducción con `Range` y la exportación, para que pase T035. Añadir `subtitles: {status} | null` a `ScriptView` en `packages/core/src/api/scripts.ts` y `apps/server/src/services/scripts.ts`, sin romper los tests de la 005
- [X] T037 [P] [US1] Implementar `apps/web/src/audio/extract.ts` con mediabunny, cargado con `import()` diferido (R3): `canDecode()` de la pista de audio, conversión a WAV PCM 16 kHz mono descartando el vídeo, avance de 0 a 1 y cancelación. Test en `apps/web/test/audio/extract.test.ts` de lo que no depende del navegador (cabecera del WAV, errores traducidos a códigos)
- [X] T038 [P] [US1] Textos de los estados «Elegir», «En marcha» y «Revisar» (solo lectura y descarga) en `apps/web/src/strings/subtitles.es.ts`, con el porqué y los fallos de [ui-screens](./contracts/ui-screens.md) y [speech-recognizer](./contracts/speech-recognizer.md)
- [X] T039 [US1] Implementar en `apps/web/src/screens/channel/subtitles/` los estados de [ui-screens](./contracts/ui-screens.md): `ChooseStep.tsx` (descarga del programa la primera vez con su tamaño, elegir fichero, duración, «Tardará unos N minutos», «Empezar»; el fichero que no se puede leer), `RunningStep.tsx` (avance con `role="status"`, «Parar», en cola) y `ReviewStep.tsx` en solo lectura (subtítulos con tiempo y marcas en palabras, filtro «Para revisar», «Descargar los subtítulos»). Entrada desde el guion aprobado en `apps/web/src/screens/channel/scripts/ReviewStep.tsx` («Hacer los subtítulos» o «Ver los subtítulos» con su estado)
- [X] T040 [US1] Ficheros de prueba hechos para el proyecto en `apps/web/e2e/fixtures/subtitles/` (un MP4 de unos segundos con voz y un WAV) y e2e en `apps/web/e2e/subtitles.spec.ts` (US1) con `YTCREATOR_FAKE_SPEECH=1`: descargar el programa, elegir el MP4, recargar durante el reconocimiento y ver el avance al volver, ver una corrección marcada, descargar y comprobar que el SRT es válido; teclado y axe en claro y oscuro a 375 y 1280 px. Añadir la variable a `apps/web/e2e/server.ts`
- [X] T041 [A] [US1] Puerta A de US1: ejecutar `/puerta-a 007 US1`

**Checkpoint**: MVP: el creador ya descarga los subtítulos de su vídeo.

---

## Phase 4: User Story 2 - Revisar, corregir y aprobar (Priority: P1)

**Goal**: Oír cada trozo, editar, partir, juntar, cambiar en todos, pedir la revisión de la IA, volver a versiones y
aprobar.

**Independent Test**: Con subtítulos hechos con el falso, oír un trozo, editar, partir, juntar, cambiar una palabra en
todos, aceptar un cambio de la IA y rechazar otro, volver a una versión y aprobar; al recargar, siguen aprobados.

- [X] T042 [P] [US2] Test en `packages/core/test/subtitles/edit.test.ts`: partir por una posición del texto reparte el tiempo en proporción a los caracteres; juntar dos seguidos une texto y tiempo; mover inicio y fin dentro de `0 ≤ start < end ≤ audioSeconds`; cambiar en todos cuenta antes y cambia palabras enteras sin tocar otras que la contienen; dar por revisado; lo que pasa de los límites se guarda con su marca calculada (FR-010)
- [X] T043 [US2] Implementar `packages/core/src/subtitles/edit.ts` para que pase T042
- [X] T044 [P] [US2] Test en `packages/core/test/subtitles/review.test.ts` de la salida de `revision_subtitulos` (R11 y [ai-uses](./contracts/ai-uses.md)): rechaza un `id` que no está en la tanda o repetido, un `text` vacío o igual, más de un 30 % de distancia de edición, una palabra nueva que no está en el texto ni en el guion (salvo mayúsculas, tildes o signos) y más líneas de las permitidas; acepta cambios de puntuación y mayúsculas; reparte en tandas de 200
- [X] T045 [US2] Implementar `packages/core/src/subtitles/review.ts` para que pase T044 y dar de alta el uso `revision_subtitulos` según las convenciones, con su prompt (solo corrige cómo está escrito; no cambia lo dicho ni los tiempos) y los escenarios del falso `ok`, `reescribe` e `id_inventado`
- [X] T046 [P] [US2] Test de rutas en `apps/server/test/http/subtitles-edit.test.ts`: `PUT /scripts/:id/subtitles` crea una versión `edicion` y da 409 `version_cambiada` con una `baseVersion` vieja; `POST …/replace` con `dryRun` da el número y sin él guarda la versión y la corrección en `replacements`; `POST …/restore` crea una versión `recuperada` y no se pierde ninguna; `POST …/approve` y la vuelta a borrador al editar o recuperar; `GET …/versions` y `…/versions/:n`; `POST …/estimate` y `…/generate` con `revision_subtitulos` (coste de todas las tandas, límite de gasto, `en_curso`), la propuesta en la vista sin crear versión, y `POST …/ai-proposal` con cambios aceptados (versión `ia` con los tiempos intactos y la marca `cambio_ia`) o `accept: []`; y los cinco fallos tipados de la IA sin tocar los subtítulos
- [X] T047 [US2] Implementar las rutas de T046 en `apps/server/src/services/subtitles.ts` y `apps/server/src/http/routes/subtitles.ts`, con el trabajo de la IA (`background_job` con `kind='ia'`, `channel_id`, `subtitle_track.job_id` y `job_op='revision_ia'`, como en la 006)
- [X] T048 [P] [US2] Textos de la edición, «Cambiar en todos», la revisión de la IA, el historial y los avisos de vuelta a borrador en `apps/web/src/strings/subtitles.es.ts`
- [X] T049 [US2] Implementar la revisión editable en `apps/web/src/screens/channel/subtitles/ReviewStep.tsx`, `CueEditor.tsx`, `ReplaceAll.tsx`, `AiReview.tsx` y `History.tsx`: oír cada trozo con `<audio>` (R15), editar texto y tiempos `m:ss,d`, partir, juntar, dar por revisado, cambiar en todos con el número antes, la revisión de la IA con el coste antes y aceptar o rechazar cada cambio, el historial con «Volver a esta» y aprobar con su aviso; con el teclado de [ui-screens](./contracts/ui-screens.md) y `prefers-reduced-motion`
- [X] T050 [US2] e2e en `apps/web/e2e/subtitles.spec.ts` (US2) solo con teclado: oír, editar, partir, juntar, cambiar en todos, revisión de la IA falsa, volver a una versión, aprobar y recargar; axe en claro y oscuro a 375 y 1280 px
- [X] T051 [A] [US2] Puerta A de US2: ejecutar `/puerta-a 007 US2`

---

## Phase 5: User Story 3 - Los minutos reales de los capítulos (Priority: P2)

**Goal**: Llevar al paquete de la 006 los minutos reales de los capítulos, eligiendo cuáles.

**Independent Test**: Con un paquete aprobado de capítulos estimados y subtítulos falsos donde el tercer bloque empieza
40 s más tarde, aceptar ese capítulo y ver el paquete en borrador con el minuto nuevo.

- [X] T052 [P] [US3] Test en `packages/core/test/subtitles/align.test.ts` de `blockStarts` (R13): el inicio de la primera palabra alineada de cada bloque; «no encontrado» si se alinea menos del 30 % de sus palabras; bloques en otro orden en el montaje; a 2 s o menos del inicio real en los casos fijos (SC-005)
- [X] T053 [US3] Implementar `blockStarts` en `packages/core/src/subtitles/align.ts` para que pase T052
- [X] T054 [P] [US3] Test en `packages/core/test/publish/chapters.test.ts` de `fromAudio`: `chapterTimes` lo trata como minuto fijo igual que `manual`; las versiones guardadas sin el campo se leen igual; y la revisión de la 006 avisa de un capítulo real por debajo del mínimo de YouTube
- [X] T055 [US3] Añadir `fromAudio?: true` a `chapterSchema` en `packages/core/src/publish/model.ts` y tratarlo en `packages/core/src/publish/chapters.ts` para que pase T054, sin romper los tests de la 006
- [X] T056 [P] [US3] Test de rutas en `apps/server/test/http/subtitles-chapters.test.ts`: `GET /scripts/:id/subtitles/chapters` con estimado, real, diferencia, `manual` y `fromAudio`, y 404 sin paquete; `POST /packages/:id/chapters/from-audio` crea una versión de `capitulos` con origen `edicion` y `fromAudio` en los aceptados; uno manual no cambia si no se acepta; un paquete aprobado vuelve a borrador (FR-015 de la 006); la descripción montada lleva el minuto real; `version_cambiada` con una base vieja
- [X] T057 [US3] Implementar las rutas de T056 en `apps/server/src/services/subtitles.ts` y en `apps/server/src/services/packages.ts` (la versión nueva, por el camino de la 006)
- [X] T058 [US3] Implementar `apps/web/src/screens/channel/subtitles/RealChapters.tsx` (una lista con casillas, decisión 49; marcadas por defecto las que cambian salvo las manuales, «No aparece en el audio» con quitarlo o escribirlo, el aviso de borrador) y, en el paso de textos de la 006 (`apps/web/src/screens/channel/publish/DescriptionStep.tsx`), «Poner los minutos reales» o la línea que lleva a los subtítulos y «minuto real» en vez de «estimado»; con sus textos en `subtitles.es.ts` y `publish.es.ts`
- [X] T059 [US3] e2e en `apps/web/e2e/subtitles-chapters.spec.ts` (US3; fichero propio con su servidor y el audio falso `capitulos`, decisión 50): aceptar parte de la propuesta, ver el paquete en borrador y aprobarlo otra vez; axe en claro y oscuro a 375 y 1280 px
- [X] T060 [A] [US3] Puerta A de US3: ejecutar `/puerta-a 007 US3`

---

## Phase 6: User Story 4 - Subtítulos de un Short (Priority: P2)

**Goal**: El mismo camino en un Short, con sus límites y sin capítulos.

**Independent Test**: Con un audio de Short y el falso, subtítulos de una línea dentro de los límites del Short, sin
capítulos, y descargados.

- [X] T061 [P] [US4] Test en `packages/core/test/subtitles/segment.test.ts` de los límites del Short (1 línea de 32 caracteres) y test de rutas en `apps/server/test/http/subtitles-short.test.ts`: el formato de la pista sale del guion, no hay capítulos (`GET …/chapters` da 404) y `PUT …/audio` devuelve el aviso de duración por encima del máximo de un Short del conocimiento de la 005, sin bloquear
- [X] T062 [US4] Implementar los límites del Short en `segment.ts` y el aviso en `apps/server/src/services/subtitles-recognize.ts` (decisión 53) para que pase T061; en la web, el aviso antes de «Empezar» y sin la parte de capítulos
- [X] T063 [US4] e2e en `apps/web/e2e/subtitles-short.spec.ts` (US4, decisión 53) con un guion de Short; axe en claro y oscuro a 375 y 1280 px
- [X] T064 [A] [US4] Puerta A de US4: ejecutar `/puerta-a 007 US4`

---

## Phase 7: User Story 5 - Volver a hacerlos con otro montaje (Priority: P3)

**Goal**: Rehacer los subtítulos con otro fichero como versión nueva, recuperando las correcciones en bloque.

**Independent Test**: Con subtítulos aprobados y una corrección en todos, elegir otro fichero, aceptar reaplicarla y ver
la versión anterior intacta.

- [X] T065 [P] [US5] Test en `packages/core/test/subtitles/edit.test.ts` de `reapply`: aplica las correcciones de `replacements` en orden y cuenta los subtítulos que cambian
- [X] T066 [US5] Implementar `reapply` en `packages/core/src/subtitles/edit.ts` para que pase T065
- [X] T067 [P] [US5] Test de rutas en `apps/server/test/http/subtitles-again.test.ts`: un audio nuevo no sustituye al anterior hasta que el reconocimiento termina bien; el resultado es una versión nueva y las anteriores siguen; la vista ofrece reaplicar con su número; `POST …/reapply` crea la versión `reaplicada`; con un paquete con minutos reales, la propuesta de capítulos se recalcula; `DELETE …/audio` borra el fichero y deja los subtítulos (R16), y `GET …/audio` da 404 `sin_audio`
- [X] T068 [US5] Implementar las rutas de T067 y, en la web, «Elegir otro fichero» con su aviso, el ofrecimiento de reaplicar y «Borrar el audio de este equipo» con su confirmación, con sus textos
- [X] T069 [US5] e2e en `apps/web/e2e/subtitles-again.spec.ts` (US5, decisión 57) con el WAV de prueba; axe en claro y oscuro a 375 y 1280 px
- [X] T070 [A] [US5] Puerta A de US5: ejecutar `/puerta-a 007 US5`

---

## Phase 8: Polish & Cross-Cutting

- [X] T071 [P] Comprobar los casos límite de la spec que falten con su test, en `apps/server/test/http/subtitles-edge.test.ts`: fichero sin audio o con el audio vacío, otro idioma o casi sin voz (todo marcado «para revisar»), guion reabierto después (`scriptChanged`), vídeo largo sin paquete, motor roto, dos pestañas y varios canales
- [X] T072 [P] Exportación (R17, FR-020): los subtítulos de cada guion en la exportación de datos del canal como `.srt` y `.json` con todas las versiones, sin el audio, con su test
- [X] T073 [P] Revisar que los textos nuevos pasan el glosario, que `apps/web/e2e/secrets-leak.spec.ts` sigue igual, que `whisper-cli` no recibe secretos en su entorno y que el bundle publicado no lleva el reconocimiento falso (paso de T016)
- [X] T074 Recorrer el [quickstart](./quickstart.md) entero con los falsos y guardar el resultado en `checklists/validation.md`
- [ ] T075 Prueba real del reconocimiento con `pnpm test:real-speech` en `packages/speech/test/whisper.real.test.ts` y un audio de prueba en español hecho para el proyecto con su guion: descarga el motor y el modelo fijados, mide el tiempo (SC-001 en proporción) y comprueba SC-004 y SC-005. No gasta dinero ni cupo: la ejecuta el agente. Si el modelo por defecto no cumple SC-001, se registra en `decisions.md` y se cambia el defecto (decisión 6). Resultado en `checklists/validation.md`
- [ ] T076 Prueba con la IA real de `revision_subtitulos`, **solo con la autorización del creador** (riesgo alto) y con la suscripción de Claude Code, en `apps/server/test/real/subtitles-ai.real.test.ts`: coste, tiempo y que ningún cambio aceptado altera lo dicho. Pedir también al creador que suba a YouTube Studio un fichero descargado de un vídeo suyo (SC-003). Lo que no se haga consta como no ejecutado
- [X] T077 Auditoría de novato de los subtítulos con el agente `usuario-novato`, en `specs/007-subtitles/novice-audit.md`. Debe dar 0 graves y como mucho 3 medios (SC-007). Los menores visuales van a la pasada del modo Design
- [X] T078 Actualizar `CLAUDE.md` (estado de la 007) y `README.md` (subtítulos, la descarga al primer uso y su tamaño)
- [X] T079 [A] Puerta A de Polish: ejecutar `/puerta-a 007 Polish`

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → historias.
- **US1 (3)** es el MVP. **US2 (4)** depende de US1 (edita lo que US1 crea).
- **US3 (5)** depende de US1 (necesita el alineamiento y los subtítulos); puede ir en paralelo con US2 si se reparten
  ficheros (`align.ts` y `publish/` frente a `edit.ts` y la pantalla de revisión).
- **US4 (6)** depende de US1.
- **US5 (7)** depende de US2 (necesita las correcciones en bloque).
- **Polish (8)**, al final. **T032** (publicar los binarios de Mac) y **T076** (IA real) necesitan el permiso del creador;
  sin él, constan como no ejecutadas y no bloquean lo demás (en Mac se prueba con el binario falso hasta entonces).

## Parallel Example: Foundational

```text
T006 model.test.ts   T008 status.test.ts   T010 migration-0008.test.ts   T012 subtitles.test.ts (repos)
T014 craft.json y youtube.json   T015 port.ts y failures.ts
```

## Parallel Example: US1

```text
T022 segment.test.ts   T024 align.test.ts   T026 flags.test.ts   T028 export.test.ts
T030 speech-engine.test.ts   T033 whisper.test.ts   T037 extract.ts   T038 subtitles.es.ts
```

## Implementation Strategy

1. Setup y Foundational, con su Puerta A.
2. US1 y se para a comprobar: ya salen subtítulos descargables de un vídeo largo.
3. US2: el creador los deja bien y los aprueba. Con US1, es lo que pide la v1.
4. US3 y US4: los minutos reales y los Shorts.
5. US5.
6. Polish: pruebas reales, auditoría de novato y PR cuando lo pida el creador.

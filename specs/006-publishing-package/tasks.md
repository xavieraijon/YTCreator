---
description: "Lista de tareas de la feature 006: paquete de publicación"
---

# Tasks: Paquete de publicación

**Input**: Documentos de diseño en `/specs/006-publishing-package/`
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
- **Sin servicios reales:** ningún test llama a una IA, a YouTube ni a internet. Se usa el proveedor `fake`
  (`YTCREATOR_FAKE_AI=<escenario>`). Esta feature no llama a YouTube nunca (FR-021). Una llamada real a la IA es riesgo
  alto: solo con la autorización del creador (T068).
- **Códigos, no textos:** el servidor devuelve códigos y la web los traduce en `apps/web/src/strings/publish.es.ts`.
  Ningún texto puede usar las palabras de `packages/ui/test/forbidden-terms.ts` (por ejemplo «handle»: se dice «el nombre
  de tu canal en YouTube»), ni «brief» (decisión 12).
- **Comandos con Node 24:** `fnm exec --using=24 -- pnpm lint|typecheck|test|test:e2e`. **No hay que ejecutar
  `pnpm format` global**, porque reformatea `packages/youtube/test/fixtures/fake-yt-dlp`: se formatean solo los ficheros
  tocados.
- **Si cambia un prompt:** hay que borrar `node_modules/.vitest-cache` antes de `test`.
- **Cada uso de IA nuevo** son siempre estos pasos: añadirlo a `AI_USES` en `packages/core/src/ai/uses.ts`, su esquema a
  `CHANNEL_OUTPUTS`, su perfil en `packages/ai/src/profiles.ts` con los valores de [ai-uses](./contracts/ai-uses.md),
  `CLAIM_FIELDS: []` en `apps/server/src/services/ai-run.ts`, su salida en `packages/ai/src/fake/outputs.ts`, su prompt
  `packages/knowledge/prompts/<uso>/v1.md` (con `writing/human.md` y los límites de `publish/youtube.json` inyectados,
  nunca copiados), su suma en `lock.json` y su nombre para personas en `uses` de `apps/web/src/strings/es.ts`.
- **Toda salida de la IA del paquete** pasa por `rejectWebAddresses()` (T019): una dirección web no valida (R4).
- **Al cerrar cada fase o historia:** `/puerta-a` y commit (`feat(006): …`).

---

## Phase 1: Setup

**Purpose**: Dejar preparados los sitios donde va el código nuevo.

- [X] T001 Crear `packages/core/src/publish/index.ts` y exportarlo desde `packages/core/src/index.ts`. Crear `packages/core/src/api/publish.ts` (vacío, con su export) y exportarlo desde `packages/core/src/api/index.ts`
- [X] T002 [P] Crear `apps/web/src/strings/publish.es.ts` con el objeto `publishEs` vacío, y añadirlo a los catálogos de `apps/web/test/glossary.test.ts` y `apps/web/test/strings-coverage.test.ts`
- [X] T003 [P] Crear la carpeta `packages/knowledge/publish/` y `packages/knowledge/src/publish.ts`, exportado desde `packages/knowledge/src/index.ts`, con un lector tipado de paquetes `{version, reviewedAt, source, data}` como el de `packages/knowledge/src/script.ts`

---

## Phase 2: Foundational

**Purpose**: Lo que necesitan todas las historias: modelo, estado, migración, repos, conocimiento de YouTube y la ruta
base del paquete.

**⚠️ CRITICAL**: Ninguna historia empieza antes de cerrar esta fase.

- [X] T004 [P] Test de modelo en `packages/core/test/publish/model.test.ts` para cada esquema de [data-model](./data-model.md): `TitlesContent` de 1 a 12 candidatos y de 0 a 2 alternativos, con `main` y `alternatives` apuntando a candidatos distintos y existentes; `TitleCandidate.text` de 1 a 200 (decisión 13), `why` de 0 a 300, `origin` del enum `ia|creador`; `ThumbnailsContent` de 1 a 6 conceptos y de 0 a 3 elegidos; `scene` de 1 a 500, `bigText` de 0 a 40, `emotion` de 0 a 120, `composition` de 0 a 300, `colors` de 0 a 200; `ShortCoverContent` con `moment` de 0 a 300 y `screenText` de 0 a 60; `DescriptionContent` con `firstLines` de 0 a 300, `body` de 0 a 3.000, `hashtags` de 0 a 10 sin «#» ni espacios y `fixedText` de 0 a 1.500; `ChaptersContent` de 0 a 30, `Chapter.title` de 0 a 100, `startSeconds` nulo o ≥ 0, `manual` booleano; `TagsContent` de 0 a 40, cada una de 1 a 100; `CommentContent.text` de 0 a 1.000; `instructions` ≤ 500; y la regla de «pieza vacía» al aprobar de cada `kind`, con el comentario vacío permitido (decisión 14)
- [X] T005 Implementar `packages/core/src/publish/model.ts` para que pase T004, con `PACKAGE_KINDS` (`titulos`, `miniaturas`, `portada_short`, `descripcion`, `capitulos`, `etiquetas`, `comentario`), `PACKAGE_ORIGINS` (`ia`, `edicion`, `parte_ia`, `recuperada`) y los pasos `portada` y `textos` de R2 (en un Short, `portada` = `titulos` + `portada_short`, y `textos` sin `capitulos`)
- [X] T006 [P] Test en `packages/core/test/publish/status.test.ts` de `packageStatus` (los estados `sin_empezar`, `portada_borrador`, `portada_aprobada`, `textos_borrador`, `textos_aprobados` y `aprobado`, según la tabla de `data-model.md`, en vídeo largo y en Short; una edición tras aprobar vuelve a borrador; la portada en borrador con textos escritos da `portada_borrador`) y de `packageWarnings` (`guion_cambiado`, `guion_sin_aprobar`, `titulo_cambiado`, `parte_fija_cambiada`, `sin_fuentes`, `pendientes_en_guion`)
- [X] T007 Implementar `packages/core/src/publish/status.ts` para que pase T006
- [X] T008 [P] Test de migración en `apps/server/test/db/migration-0007.test.ts`. Se parte de una base con las migraciones 0001 a 0006 y datos en `idea`, `script` y `script_version`, y al aplicar 0007: se conservan todas las filas, y existen `channel_publish_settings`, `publish_package` (con `script_id` único, `format` en `largo|short` y `studio_done` por defecto `[]`) y `package_version` (con `kind` y `origin` de sus enums y `UNIQUE(package_id, kind, version)`), con las restricciones de `data-model.md`
- [X] T009 Escribir `apps/server/src/db/migrations/0007_publish_package.sql` para que pase T008. Solo `CREATE TABLE` y `CREATE INDEX` (índice `(channel_id, updated_at)` en `publish_package`); no rehace ninguna tabla
- [X] T010 [P] Test de repos en `apps/server/test/db/repos/packages.test.ts`: crear, leer por guion, unicidad por guion, listar por canal, última versión por tipo, numeración por tipo, `JSON` validado al leer, versiones inmutables, guardar los mapas de aprobación y `studio_done`, y leer y guardar `channel_publish_settings`
- [X] T011 Implementar `apps/server/src/db/repos/packages.ts` (`publish_package` y `channel_publish_settings`) y `apps/server/src/db/repos/package-versions.ts` para que pasen T010
- [X] T012 [P] Escribir `packages/knowledge/publish/youtube.json` con los límites de R11 (título 100, descripción 5.000, etiquetas 500 en total, capítulos con el primero en 0:00, al menos 3 y de 10 s como mínimo, hashtags visibles 3 e ignorados más de 60, «Probar y comparar» hasta 3 miniaturas y 3 títulos). Abrir cada página de la ayuda oficial de YouTube antes de citarla; la cifra que no se pueda confirmar no se cita y lleva `assumption: true`. Escribir también `packages/knowledge/publish/studio.json`: los cuatro ajustes de R12, la regla de contenido alterado o sintético con su fuente oficial comprobada, la lista de categorías de YouTube y la sugerida «Educación» con `assumption: true`. `reviewedAt: 2026-11-13`. Test de los dos en `packages/knowledge/test/publish.test.ts`
- [X] T013 [P] Escribir `packages/knowledge/publish/craft.json`: oficio de títulos (curiosidad, cifra concreta, promesa que el vídeo cumple), miniaturas (texto grande corto, una emoción, contraste, no repetir el título), primeras líneas de la descripción y comentario fijado; con fuente y fecha, y `mobileTitleChars: 70` con `assumption: true`. Ampliar el test de T012
- [X] T014 Escribir en `packages/core/src/api/publish.ts` `PackageView`, `PackageSummary`, los cuerpos base y la reutilización de los códigos `en_curso`, `version_cambiada` y `sin_aprobar` de [http-api](./contracts/http-api.md)
- [X] T015 [P] Test de rutas en `apps/server/test/http/packages-base.test.ts`: `POST /scripts/:id/package` crea (201) o devuelve (200) el paquete, copia el `format` del guion y exige un guion aprobado o un paquete previo (`sin_aprobar`); `GET /packages/:id` con estado y avisos; `GET /channels/:id/packages`; y canal ajeno o inexistente
- [X] T016 Implementar `apps/server/src/services/packages.ts` y `apps/server/src/http/routes/packages.ts` para que pase T015, y registrar las rutas y sus dependencias en `apps/server/src/http/app.ts` y `apps/server/src/main.ts`
- [X] T017 Añadir `packagesApi` en `apps/web/src/api/client.ts` y las rutas `/canal/publicaciones` y `/canal/publicaciones/:id` en `apps/web/src/router.ts` (con su caso en `apps/web/test/router.test.ts`), con la lista en `apps/web/src/screens/channel/publish/PackageList.tsx` (incluido el `EmptyState` que lleva a los guiones) y el esqueleto con `Stepper` en `apps/web/src/screens/channel/publish/PackageScreen.tsx`
- [X] T018 [A] Puerta A de Foundational: ejecutar `/puerta-a 006 Foundational`. No se marca `[X]` hasta que la skill diga «pasada»; el informe queda en `checklists/validation.md`

**Checkpoint**: la base está lista.

---

## Phase 3: User Story 1 - Título y miniatura que hacen pulsar (Priority: P1) 🎯 MVP

**Goal**: Desde un guion aprobado, títulos con su motivo, un principal y hasta dos alternativos, conceptos de miniatura y
la portada aprobada.

**Independent Test**: Con proveedor falso, ver el coste, recibir títulos, elegir principal y dos alternativos, recibir
conceptos, editar uno, aprobar y seguir aprobado al recargar.

- [X] T019 [P] [US1] Test en `packages/core/test/publish/outputs.test.ts` de `rejectWebAddresses()` (`http`, `https`, `www.`, en cualquier campo de texto anidado) y de las salidas `titulos` (de 5 a 8 en largo y de 3 a 5 en Short, cada `text` ≤ 100 aunque el esquema admita 200, `blockId` existente en el guion) y `miniaturas` (exactamente 3, `titleIndex` 0, 1 o 2)
- [X] T020 [US1] Implementar `rejectWebAddresses()` y las salidas en `packages/core/src/publish/outputs.ts` y dar de alta los usos `titulos` y `miniaturas` según las convenciones, con sus prompts, que reciben lo medido en la 004 (`query`, veredicto, fecha y hasta 10 títulos de `similar_videos` como ejemplos que no se copian, R7) y los candidatos anteriores para no repetirlos
- [X] T021 [P] [US1] Test de rutas en `apps/server/test/http/packages-cover.test.ts`: `POST /packages/:id/estimate` y `POST /packages/:id/generate` con `use=titulos` y `use=miniaturas` (202 y `jobId`); versión nueva con `id` de candidato asignado por el servidor y `main_title`; `miniaturas` exige un título principal (`sin_aprobar`); `en_curso` con un trabajo vivo; contenido anterior intacto si la IA falla o la salida trae una dirección web; `PUT /packages/:id/pieces/titulos` y `/miniaturas` con `baseVersion` (`version_cambiada` si no coincide); títulos escritos por el creador sin `blockId`; `POST /packages/:id/approve` con `step=portada` (400 sin principal o sin miniatura elegida; 409 `version_cambiada` si no son las últimas); editar lo aprobado vuelve a borrador; y `titulo_cambiado` al cambiar el principal con miniaturas hechas. Ninguna llamada a YouTube
- [X] T022 [US1] Implementar en `apps/server/src/services/packages.ts` el trabajo de generación (`background_job` con `kind='ia'`, `channel_id`, `publish_package.job_id` y `job_op`, como en la 005) y en `apps/server/src/http/routes/packages.ts` las rutas de T021, leyendo la última medida `medida` de la idea con el repo `idea-measures`
- [X] T023 [P] [US1] Textos de la lista y del paso «Título y miniatura» en `apps/web/src/strings/publish.es.ts`, con el porqué de [ui-screens](./contracts/ui-screens.md) y la explicación de «Probar y comparar»
- [X] T024 [US1] Entrada: en `apps/web/src/screens/channel/scripts/ReviewStep.tsx`, con el guion aprobado, «Preparar la publicación» como acción principal, «Seguir con la publicación» o «Ver la publicación»; `package: {id, status} | null` en `ScriptView` (`packages/core/src/api/scripts.ts` y `apps/server/src/services/scripts.ts`); enlace «Mis publicaciones» en la pantalla del canal, junto a «Mis guiones». Sin romper los tests de la 005
- [X] T025 [US1] Implementar el paso en `apps/web/src/screens/channel/publish/CoverStep.tsx`: lo medido en la 004 como dato con fecha (`DataSource`); candidatos con texto editable, motivo con «Opinión de la IA», bloque del guion, caracteres y aviso de corte en móvil o máximo; `RadioGroup` «Principal» y `Checkbox` «Probar también» (hasta 2); «Escribir uno mío»; conceptos en `Card` con `Checkbox` «Elegir» (hasta 3) y edición; «Pedir otros» con indicaciones; coste antes de cada petición; `AiWorking` al volver; aprobar. Sin componentes nuevos
- [X] T026 [US1] e2e en `apps/web/e2e/publish.spec.ts` (US1), con canal sin guiones aprobados, cerrar la pestaña durante la generación y ver el resultado al volver (FR-020), teclado, recarga y axe en claro y oscuro a 375 y 1280 px
- [X] T027 [A] [US1] Puerta A de US1: ejecutar `/puerta-a 006 US1`

**Checkpoint**: MVP: el creador ya tiene título y miniatura de su vídeo.

---

## Phase 4: User Story 2 - Descripción, capítulos y etiquetas (Priority: P1)

**Goal**: Descripción por partes con capítulos calculados, fuentes desde los hechos y parte fija del canal, etiquetas y
comentario fijado, con cada parte pedible por separado.

**Independent Test**: Con proveedor falso, guion con hechos enlazados y título aprobado: generar la descripción, ver los
capítulos con su minuto y las fuentes, editar un capítulo, pedir de nuevo las etiquetas sin que cambie la descripción y
aprobar.

- [X] T028 [P] [US2] Test en `packages/core/test/publish/chapters.test.ts` de `chapterTimes` (el primero siempre 0; la suma de `durationSeconds` de la 005 al ritmo del canal; un minuto `manual` se respeta y no se recalcula; formato `m:ss` y `h:mm:ss` desde una hora) y `proposeChapters` (junta con el siguiente cada capítulo por debajo del mínimo de `youtube.json`; el último corto se junta con el anterior; los `blockIds` cubren todos los bloques, en orden y sin repetir), con casos grabados que dan el 100 % de capítulos válidos (SC-003)
- [X] T029 [US2] Implementar `packages/core/src/publish/chapters.ts` para que pase T028
- [X] T030 [P] [US2] Test en `packages/core/test/publish/description.test.ts` de `descriptionSources` (solo enlaces `link = abre` y referencias del creador de la lista de hechos que usó el guion aprobado, sin repetir; vacío sin hechos, SC-004) y `assembleDescription` (orden: primeras líneas, cuerpo, capítulos, fuentes, hashtags con «#» y parte fija; sin apartados vacíos)
- [X] T031 [US2] Implementar `packages/core/src/publish/description.ts` para que pase T030
- [X] T032 [P] [US2] Tests de las salidas `descripcion` (sin hashtags; `blockIds` existentes, en orden, cubriendo todos sin repetir) y `parte_paquete` (el esquema de cada `part`) en `packages/core/test/publish/outputs.test.ts`
- [X] T033 [US2] Implementar las salidas y dar de alta los usos `descripcion` y `parte_paquete` según las convenciones, con sus prompts
- [X] T034 [P] [US2] Test de rutas en `apps/server/test/http/publish-settings.test.ts`: valor por defecto con el enlace de suscripción si el perfil tiene nombre de canal en YouTube, y vacío si no (decisión 7); guardar `fixedText` ≤ 1.500 y una `category` de `studio.json` (T012) o `null`; y que cambiarlo no altera versiones ya guardadas
- [X] T035 [US2] Implementar `GET` y `PUT /channels/:id/publish-settings` en `apps/server/src/http/routes/packages.ts`
- [X] T036 [P] [US2] Test de rutas en `apps/server/test/http/packages-texts.test.ts`: `sin_aprobar` sin portada aprobada; `use=descripcion` crea versiones de `descripcion` (con copia de la parte fija), `capitulos`, `etiquetas` y `comentario`, todas con `draft_version` y `main_title`; `parte_paquete` con cada `part` solo crea versión de su tipo y deja las demás idénticas carácter a carácter (SC-005), sin tocar la parte fija; `PUT /packages/:id/pieces/:kind` de cada tipo; capítulo con minuto `manual`; `parte_fija_cambiada` y «Usar la nueva» como versión `edicion`; `sin_fuentes`; `approve` con `step=textos` y sus piezas vacías (400), salvo el comentario, que puede estar vacío. Sustituir los dos provisionales de `apps/server/src/services/packages.ts`: `sourcesCount: 0` por el número de `descriptionSources()` y la parte fija vacía por la parte fija por defecto del canal sin ajustes guardados (Puerta A de Foundational)
- [X] T037 [US2] Implementar en `apps/server/src/services/packages.ts` y `apps/server/src/http/routes/packages.ts` las rutas de T036, con los capítulos de la IA pasados por `proposeChapters` antes de guardarlos
- [X] T038 [P] [US2] Textos del paso «Descripción» y de los ajustes en `apps/web/src/strings/publish.es.ts`, con «estimado» y «Ajústalos cuando tengas el vídeo montado», y la explicación de «capítulos» y «etiquetas»
- [X] T039 [US2] Implementar el paso en `apps/web/src/screens/channel/publish/DescriptionStep.tsx`: partes editables, capítulos con nombre y minuto (calculado con «estimado» o manual), fuentes de solo lectura, parte fija con enlace a los ajustes, etiquetas y comentario aparte, «Pedir de nuevo · {coste}» por parte con indicaciones, aprobar
- [X] T040 [US2] Implementar `apps/web/src/screens/channel/publish/PublishSettings.tsx` y la ruta `/canal/publicaciones/ajustes` en `apps/web/src/router.ts`: parte fija con su explicación y, si falta el nombre del canal en YouTube, cómo añadirlo; `Select` de categoría con la sugerida marcada; «Cambiarla no toca las publicaciones que ya tienes»
- [X] T041 [US2] e2e en `apps/web/e2e/publish.spec.ts` (US2), con axe en claro y oscuro a 375 y 1280 px
- [X] T042 [A] [US2] Puerta A de US2: ejecutar `/puerta-a 006 US2`

**Checkpoint**: todas las piezas existen y se aprueban por pasos.

---

## Phase 5: User Story 3 - El paquete, listo para copiar (Priority: P2)

**Goal**: Una pantalla con cada pieza copiable, revisión gratuita, lista guiada de YouTube Studio, aprobación y descargas.

**Independent Test**: Con un paquete grabado con un título de 110 caracteres y un capítulo de 5 s, ver los dos avisos,
saltar a cada uno, corregirlos, copiar cada pieza, aprobar y descargar un documento legible sin la app.

- [X] T043 [P] [US3] Test en `packages/core/test/publish/review.test.ts` de cada regla de `reviewPackage` (R13): título por encima del máximo y del corte en móvil; descripción montada por encima del máximo; capítulos sin 0:00, menos de 3 o alguno corto; etiquetas por encima de 500 en total; más de 3 hashtags en un Short; parte fija ausente; texto grande de la miniatura que comparte más de la mitad de sus palabras con el título principal; pieza vacía (la única que impide aprobar). Y que un paquete de 30 capítulos se revisa en menos de 1 s (SC-007)
- [X] T044 [US3] Implementar `packages/core/src/publish/review.ts` para que pase T043
- [X] T045 [P] [US3] Test en `packages/core/test/publish/export.test.ts` de `exportPackage`: Markdown legible con todas las piezas en el orden de YouTube Studio, JSON con lo mismo, las indicaciones de miniatura como documento aparte sin datos del canal que no hagan falta, y la exportación de todos los paquetes del canal
- [X] T046 [US3] Implementar `packages/core/src/publish/export.ts` para que pase T045
- [X] T047 [P] [US3] Test en `packages/core/test/publish/studio.test.ts` de `studioChecklist`: público infantil desde `audience.madeForKids` con las implicaciones de `made-for-kids.json` sin copiarlas; contenido sintético como pregunta sin respuesta por defecto; idioma con la variante de `audience.region`; categoría elegida o la sugerida como supuesto
- [X] T048 [US3] Implementar `packages/core/src/publish/studio.ts` para que pase T047
- [X] T049 [P] [US3] Test de rutas en `apps/server/test/http/packages-approve.test.ts`: `GET /packages/:id/review`; `PUT /packages/:id/studio` guarda `done` sin crear versión y rechaza claves desconocidas; `approve` con `step=paquete` exige los dos pasos y el guion aprobados (409 `sin_aprobar`, incluido `guion_sin_aprobar`), guarda versiones, fecha, `package_approved_draft` y avisos, y da 400 si `acknowledgedWarnings` no coincide; editar lo aprobado vuelve a borrador; `GET /packages/:id/export?format=md|json|brief` y `GET /channels/:id/packages/export`; `IdeaView.script.packageStatus` en `packages/core/src/api/ideas.ts` y `apps/server/src/services/ideas.ts`, sin romper los tests de la 004
- [X] T050 [US3] Implementar las rutas de T049 en `apps/server/src/services/packages.ts` y `apps/server/src/http/routes/packages.ts`
- [X] T051 [P] [US3] Textos del paso «Revisar y copiar», de cada aviso, de la lista guiada y de la copia en `apps/web/src/strings/publish.es.ts`
- [X] T052 [US3] Implementar `apps/web/src/screens/channel/publish/ReviewCopyStep.tsx`: avisos con motivo y enlace a la pieza; piezas en el orden de YouTube Studio con «Copiar» (`navigator.clipboard.writeText`) y `Toast` «Copiado», y, si falla, el texto seleccionado en un `TextArea` de solo lectura con «Pulsa Ctrl+C (⌘C en Mac) para copiarlo» (R14); lista guiada con `Checkbox`; descargas; «Aprobar la publicación» con `Dialog` si quedan avisos y apagado con una frase si el guion no está aprobado. Y la etiqueta «Lista para publicar» en `apps/web/src/screens/channel/ideas/IdeaQueue.tsx`
- [X] T053 [US3] e2e en `apps/web/e2e/publish.spec.ts` (US3): copiar con y sin permiso de portapapeles, aprobar con avisos, reabrir y descargar, con axe en claro y oscuro a 375 y 1280 px
- [X] T054 [A] [US3] Puerta A de US3: ejecutar `/puerta-a 006 US3`

---

## Phase 6: User Story 4 - El paquete de un Short (Priority: P2)

**Goal**: Paquete de Short sin capítulos ni miniaturas, con portada sugerida y mención del vídeo largo.

**Independent Test**: Con proveedor falso y un guion Short aprobado sacado de un vídeo largo, generar el paquete sin
capítulos, ver la portada sugerida y el vídeo largo mencionado, y aprobarlo.

- [X] T055 [P] [US4] Test de la salida `paquete_short` en `packages/core/test/publish/outputs.test.ts`: de 3 a 5 títulos, hasta 3 hashtags, `cover.blockId` existente y sin direcciones web
- [X] T056 [US4] Implementar la salida y dar de alta el uso `paquete_short` según las convenciones, con su prompt, que recibe `parentTitle` (el título principal del paquete del vídeo largo o, si no hay, el de trabajo de su idea) y no lleva enlaces (decisión 10)
- [X] T057 [P] [US4] Test de rutas en `apps/server/test/http/packages-short.test.ts`: `use=paquete_short` crea versiones de `titulos`, `portada_short`, `descripcion`, `etiquetas` y `comentario` y ninguna de `miniaturas` ni `capitulos`; `titulos`, `miniaturas` y `descripcion` rechazan un Short y `paquete_short` un vídeo largo; `parte_paquete` con `portada_short`; aprobar los pasos y el paquete sin capítulos
- [X] T058 [US4] Implementar en `apps/server/src/services/packages.ts` las rutas de T057
- [X] T059 [US4] Adaptar `CoverStep.tsx`, `DescriptionStep.tsx` y `ReviewCopyStep.tsx` al Short: pasos «Título y portada → Descripción → Revisar y copiar», portada sugerida con la frase de la app del móvil, hashtags, recordatorio de «Vídeo relacionado» y sus textos en `publish.es.ts`
- [X] T060 [US4] e2e en `apps/web/e2e/publish.spec.ts` (US4), con axe en claro y oscuro a 375 y 1280 px
- [X] T061 [A] [US4] Puerta A de US4: ejecutar `/puerta-a 006 US4`

---

## Phase 7: User Story 5 - Volver a cualquier versión (Priority: P2)

**Goal**: Historial por pieza, comparar y recuperar sin perder nada.

**Independent Test**: Con una descripción con cuatro versiones grabadas, abrir la segunda, ver qué cambia, volver a ella
y comprobar que la cuarta sigue en el historial.

- [X] T062 [P] [US5] Test en `packages/core/test/publish/compare.test.ts`: diferencias de una pieza con la actual (candidatos y conceptos nuevos, quitados o cambiados; partes de la descripción; capítulos; etiquetas añadidas y quitadas)
- [X] T063 [US5] Implementar `packages/core/src/publish/compare.ts` para que pase T062
- [X] T064 [P] [US5] Test de rutas en `apps/server/test/http/packages-versions.test.ts`: `GET /packages/:id/versions?kind=` de la más nueva a la más antigua con fecha y origen; `GET /packages/:id/versions/:kind/:version` con diferencias; `restore` crea una versión `recuperada` (ninguna si ya es la actual) y el historial tiene una más y ninguna menos (SC-008); recuperar en un paquete aprobado lo devuelve a borrador
- [X] T065 [US5] Implementar las rutas de T064 e `apps/web/src/screens/channel/publish/History.tsx`, con sus textos, siguiendo el `History.tsx` de la 005
- [X] T066 [US5] e2e en `apps/web/e2e/publish.spec.ts` (US5), con axe en claro y oscuro a 375 y 1280 px
- [X] T067 [A] [US5] Puerta A de US5: ejecutar `/puerta-a 006 US5`

---

## Phase 8: Polish & Cross-Cutting

- [X] T068 (ejecutada el 2026-11-14 con Claude Code, decisión 113; resultados en `checklists/validation.md`) Prueba con IA real, **solo con la autorización del creador** (riesgo alto): un paquete de vídeo largo y uno de Short con la conexión autorizada, guardando en `checklists/validation.md` el coste real, el tiempo y si los títulos caben en el móvil (SC-002). Sin autorización, consta como no ejecutada y no bloquea nada más
- [X] T069 [P] Comprobar los casos límite de la spec que falten con su test: guion reabierto o vuelto a borrador, idea fuera de la cola, bloques muy cortos, parte fija demasiado larga, afirmaciones pendientes en el guion, límite de gasto, fallos tipados de la IA, dos pestañas y varios canales, en `apps/server/test/http/packages-edge.test.ts`
- [X] T070 [P] Revisar que los textos nuevos pasan el glosario, que `apps/web/e2e/secrets-leak.spec.ts` sigue igual y que ninguna ruta de la feature llama a YouTube
- [X] T071 Recorrer el [quickstart](./quickstart.md) entero con IA falsa y guardar el resultado en `checklists/validation.md`
- [X] T072 Auditoría de novato de la publicación con el agente `usuario-novato`, en `specs/006-publishing-package/novice-audit.md`. Debe dar 0 graves y como mucho 3 medios, y anotar el tiempo del guion aprobado al paquete copiado (SC-001). Los menores visuales van a la pasada del modo Design
- [X] T073 Actualizar `CLAUDE.md` (estado de la 006) y `README.md` si cambia algo de cara al creador
- [X] T074 [A] Puerta A de Polish: ejecutar `/puerta-a 006 Polish`

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → historias.
- **US1 (3)** es el MVP. **US2 (4)** depende de US1 (la descripción se escribe para el título principal).
- **US3 (5)** depende de US2.
- **US4 (6)** reutiliza los pasos de US1 a US3.
- **US5 (7)** solo depende de que haya versiones: puede ir después de US1, en paralelo con US2 a US4 si se reparten
  ficheros.
- **Polish (8)**, al final. **T068** se ejecutó el 2026-11-14 con la autorización del creador (decisión 113).

## Parallel Example: Foundational

```text
T004 model.test.ts   T006 status.test.ts   T008 migration-0007.test.ts   T010 packages.test.ts
T012 youtube.json   T013 craft.json
```

## Parallel Example: US2

```text
T028 chapters.test.ts   T030 description.test.ts   T032 outputs.test.ts   T034 publish-settings.test.ts
T036 packages-texts.test.ts   T038 publish.es.ts
```

## Implementation Strategy

1. Setup y Foundational, con su Puerta A.
2. US1 y se para a comprobar: ya sale título y miniatura de un guion aprobado.
3. US2 y US3: el paquete completo, revisado y copiable. Es el final del recorrido de la v1.
4. US4 y US5.
5. Polish, auditoría de novato y PR cuando lo pida el creador.

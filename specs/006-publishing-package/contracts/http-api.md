# Contrato: API HTTP del paquete de publicación

**Feature**: `006-publishing-package` | Esquemas Zod en `packages/core/src/api/publish.ts`

Errores con el formato de `http/errors.ts`. Códigos que se reutilizan de la 005: `en_curso` (409), `version_cambiada`
(409), `sin_aprobar` (409, falta aprobar el paso anterior o el guion).

## Lista y ajustes

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /channels/:id/packages` | | `PackageSummary[]`: idea, formato, estado, último cambio |
| `GET /channels/:id/packages/export?format=md\|json` | | fichero con todos los paquetes |
| `GET /channels/:id/publish-settings` | | `{fixedText, category, isDefault, hasHandle, suggestedCategory, categories}` (`hasHandle`: si el perfil tiene la @ del canal) |
| `PUT /channels/:id/publish-settings` | `{fixedText, category}` | lo guardado |

## Un paquete

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /scripts/:id/package` | | `PackageView`, 201; si ya existe, 200 con el mismo. Exige guion aprobado o paquete previo |
| `GET /packages/:id` | | `PackageView` |
| `GET /packages/:id/review` | | `{rules, sources}`: las cifras de `publish/youtube.json` y `publish/craft.json` que usa la revisión (`titleMaxChars`, `mobileTitleChars`, `descriptionMaxChars`, `tagsMaxTotalChars`, `chapterMinCount`, `chapterMinSeconds`, `hashtagsShown`) y, por cifra, su fuente `{label, date}` o `null` si es un supuesto nuestro |
| `PUT /packages/:id/studio` | `{done: string[], base: string[]}` | `PackageView`; no crea versión; `base` son las marcas que tenía la pantalla: 409 `version_cambiada` si ya no son las guardadas (otra pestaña marcó algo); 400 `validacion` con una clave que no es de la lista |
| `GET /packages/:id/export?format=md\|json\|brief` | | fichero |

`PackageView` lleva la idea, el guion aprobado (bloques con su duración, para los capítulos), el estado, la última
versión de cada pieza, los capítulos con su minuto calculado, las fuentes, la descripción montada, la lista guiada, los
avisos, lo medido en la 004 (si hay), el último trabajo con su estado y, en un Short sacado de un vídeo largo, el título
del vídeo largo. La lista guiada va en `studio` (cuatro ajustes con su respuesta, su motivo y su fuente `{label, date}`, o `null` si es un supuesto; `publico_infantil` lleva además `implicationsSource` y su respuesta es `null` si el perfil no se puede leer) y sus marcas en
`studioDone`.

Con `step: paquete`, `versions` lleva todas las piezas del formato y `acknowledgedWarnings` cuenta los avisos de la
revisión que no impiden aprobar más los avisos del paquete; si no hay ninguno se puede omitir.

## Versiones

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `PUT /packages/:id/pieces/:kind` | `{baseVersion, content}` | `PackageView` con una versión `edicion` |
| `GET /packages/:id/versions?kind=` | | lista: versión, origen, fecha |
| `GET /packages/:id/versions/:kind/:version` | | la versión y sus diferencias con la actual |
| `POST /packages/:id/versions/:kind/:version/restore` | `{baseVersion}` | `PackageView`, con una versión `recuperada`; si ya es la actual, ninguna |
| `POST /packages/:id/approve` | `{step: portada\|textos\|paquete, versions, acknowledgedWarnings?}` | `PackageView`; 409 `version_cambiada` si `versions` no son las últimas; 409 `sin_aprobar` si falta el paso anterior o el guion; 400 `validacion` si una pieza está vacía o `acknowledgedWarnings` no coincide |

## Con IA

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /packages/:id/estimate` | `{use, part?}` | `Estimate` de la 003, con `cents`, `maxCents`, `blockedBy` |
| `POST /packages/:id/generate` | `{use, estimateId, instructions?, part?}` | 202 `{jobId}` |

`use` es uno de los cinco de [ai-uses.md](./ai-uses.md); `part` solo con `parte_paquete`. El progreso va por el SSE de
trabajos de la 003, y el resultado se lee con `GET /packages/:id` al terminar.

## Cambios en rutas existentes (aditivos)

- `IdeaView.script` gana `packageStatus`.
- `ScriptView` gana `package: {id, status} | null`.

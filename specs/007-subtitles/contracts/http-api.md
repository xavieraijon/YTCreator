# Contrato: API HTTP de los subtítulos

**Feature**: `007-subtitles` | Esquemas Zod en `packages/core/src/api/subtitles.ts`

Errores con el formato de `http/errors.ts`. Códigos que se reutilizan: `en_curso` (409), `version_cambiada` (409),
`sin_aprobar` (409, el guion no está aprobado), `validacion` (400).

## El motor

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /speech/engine` | | `{installed, model, models: [{id, sizeBytes, installed, recommended}], job}`: qué hay instalado y la descarga en curso, si la hay |
| `POST /speech/engine` | `{model?}` | 202 con el trabajo `descargar_motor`: el motor y el modelo que falten, fijados y comprobados (R1, R2); si ya están, 200 |
| `PUT /speech/engine/model` | `{model}` | el modelo elegido («Modo experto»); 409 `sin_modelo` si no está descargado |

Fallos de la descarga: `descarga`, `hash`, `permisos` y `espacio` (los de `reader-update.ts` más el disco lleno).

## Unos subtítulos

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /scripts/:id/subtitles` | | `SubtitlesView`; 404 si el guion no existe; sin pista, `{status: 'sin_hacer', …}` |
| `PUT /scripts/:id/subtitles/audio` | WAV PCM 16 kHz mono, `Content-Type: audio/wav` | `{audioSeconds, estimateSeconds}`. 400 `audio_no_valido` si no lo es; 413 `audio_largo` por encima de 3 horas; 507 `sin_espacio`; 409 `sin_aprobar` |
| `POST /scripts/:id/subtitles/recognize` | `{}` | 202 con el trabajo `reconocer_voz` (o `en_cola`); 409 `sin_motor` si falta el motor o el modelo; 409 `sin_audio` si no se subió |
| `POST /scripts/:id/subtitles/cancel` | | 200; el trabajo queda `fallido` con `cancelado` |
| `GET /scripts/:id/subtitles/audio` | | el WAV, con `Range` (R15); 404 `sin_audio` si se borró |
| `DELETE /scripts/:id/subtitles/audio` | | `SubtitlesView` sin audio; los subtítulos no cambian (R16) |
| `PUT /scripts/:id/subtitles` | `{baseVersion, content}` | `SubtitlesView` con la versión nueva (`edicion`); 409 `version_cambiada` si `baseVersion` no es la última |
| `POST /scripts/:id/subtitles/replace` | `{baseVersion, from, to}` | `{count}` en un `dryRun: true`; sin él, `SubtitlesView` con la versión nueva y la corrección añadida a `replacements` |
| `POST /scripts/:id/subtitles/reapply` | `{baseVersion}` | `SubtitlesView` con las correcciones de `replacements` aplicadas (`reaplicada`) y `{count}` |
| `POST /scripts/:id/subtitles/restore` | `{baseVersion, version}` | `SubtitlesView` con la versión `recuperada` |
| `POST /scripts/:id/subtitles/approve` | `{version}` | `SubtitlesView` aprobado; 409 `version_cambiada` si no es la última |
| `GET /scripts/:id/subtitles/versions` | | `[{version, origin, createdAt, cueCount}]` |
| `GET /scripts/:id/subtitles/versions/:n` | | la versión completa |
| `GET /scripts/:id/subtitles/export?format=srt\|vtt\|sbv` | | el fichero, `Content-Disposition` con el nombre del vídeo (R14) |

## La revisión de la IA

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /scripts/:id/subtitles/estimate` | `{use: 'revision_subtitulos'}` | la estimación de `ai-run.ts` (`estimateId`, coste, `blockedBy`), con las tandas sumadas (R11) |
| `POST /scripts/:id/subtitles/generate` | `{use, estimateId, baseVersion}` | 202; al terminar, la vista trae `aiProposal: [{cueId, text, reason}]`, sin crear versión |
| `POST /scripts/:id/subtitles/ai-proposal` | `{baseVersion, accept: string[]}` | `SubtitlesView` con la versión `ia` hecha con los cambios aceptados; `accept: []` descarta la propuesta |

## Los capítulos reales

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /scripts/:id/subtitles/chapters` | | `[{chapterId, title, estimated, real, status: 'encontrado' \| 'no_encontrado', manual, fromAudio}]`; `estimated` es el minuto que el paquete muestra ahora; el primero siempre `0`; 404 si no hay paquete, no es un vídeo largo o aún no hay subtítulos; calculado al pedirlo (R13, decisiones 44 a 47) |
| `POST /packages/:id/chapters/from-audio` | `{baseVersion, accept: [{chapterId, seconds}], remove?: [chapterId]}` | `PackageView` de la 006 con la versión nueva de `capitulos` (origen `edicion`); un minuto igual al real propuesto lleva `fromAudio`, otro cualquiera queda como escrito a mano (`manual`); vuelve a borrador si estaba aprobado (FR-015 de la 006); 409 `version_cambiada` si `baseVersion` no es la última; 400 `validacion` con un capítulo que no existe, el primero fuera de `0` o quitado, un minuto más allá del audio o un orden que YouTube no acepta. Junto a un minuto real solo cuenta el orden y un capítulo que queda corto se guarda y lo avisa la revisión de la 006; uno escrito a mano cumple el mínimo de la 006 (decisión 46). `remove` quita capítulos que no están en el audio: sus bloques pasan al anterior (AS3). Sin nada que cambiar no crea versión |

## `SubtitlesView`

El guion (idea, formato, versión aprobada), el estado (data-model, «Estados»), la última versión con sus subtítulos y
las marcas calculadas, el número «para revisar», si hay audio y su duración, el nombre del fichero de origen, la versión
aprobada, `scriptChanged` (si el guion aprobado cambió después de reconocer), los límites de lectura con su fuente, el
último trabajo con su estado y su avance, la propuesta de la IA pendiente, si la hay, y `packageId`, el paquete de la
006 del guion o `null` (adonde van los minutos reales, US3).

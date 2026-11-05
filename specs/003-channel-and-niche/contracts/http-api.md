# Contrato: API HTTP

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R13–R17

Rutas nuevas del servidor local. Esquemas Zod en `packages/core/src/api/channel.ts`, exportados por
`@ytcreator/core/api` y compartidos con la web.

## Reglas generales

Las mismas de la 002:

- Guard de `Host` y `Origin` locales; si no, `403 prohibido`.
- El servidor devuelve códigos; la web los traduce (`strings/`). Ninguna respuesta lleva secretos; la clave de YouTube
  como mucho su `hint` de 4 caracteres.
- Fechas ISO 8601 UTC; importes en céntimos enteros.
- Un fallo de la IA o de YouTube es un `200` con el estado nuevo (la propuesta o la medida con su `failure`). Las
  excepciones son `resolve`, `reading` y `references`, que no tienen estado que devolver: `502 youtube` con su fallo.
- Errores con `ApiError`: `400 validacion`, `403 prohibido`, `404 no_encontrado`, `409 conflicto`, `422 ia`.
- `GUARDS` gana `ya_hay_canal` (la v1 solo deja crear un canal, FR-028).
- Las rutas que cambian un recorrido piden `revision`; si no coincide, `409 conflicto` con `current` (evita dobles
  envíos y pestañas viejas).
- Las rutas de IA piden `estimateId` ([cost](./cost.md)).

## Canal y recorrido

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/channels/current` | — | `{channel, profile, journey}` o `{channel: null}` |
| `POST /api/channels` | `{origin}` | `201 {channel, journey}`; `409` guard `ya_hay_canal` |
| `GET /api/journeys/:id` | — | `Journey` con `state`, propuestas vigentes, medidas, comprobaciones, trabajos y `reading` (la lectura del canal elegido o `null`). La propuesta de conceptos trae las cifras de ahora, `basedOn` (nicho, horas y forma de salir en vídeo para los que se escribió) y `stale` |
| `POST /api/journeys/:id/step` | `{revision, step, data?}` | `Journey`; `400` si falta la aprobación del paso |
| `POST /api/journeys/:id/estimate` | `{use, proposalId?}` | `Estimate`; `400` en `posicionamiento` sin perfil actual aprobado o sin respuestas de ritmo |
| `POST /api/journeys/:id/proposals` | `{revision, kind, estimateId, instructions?, parentId?}` | `Proposal` (con `failure` si falló); `400` como en `estimate`; `409 conflicto` si el recorrido pasó a otro canal mientras la IA respondía |
| `PATCH /api/proposals/:id` | `{editedPayload?, selectedIndex?, status?}` | `Proposal` |
| `POST /api/journeys/:id/as-new` | `{revision}` | `201 {channel, journey}`: canal con pocos vídeos (FR-022). El recorrido viejo queda `abandonado`, el nuevo guarda `keptName`; `400` con 5 vídeos o más; `409 conflicto` con una revisión vieja |
| `POST /api/proposals/:id/back` | `{}` | `Proposal`: descarta esta y recupera la que sustituyó (US1 AS5); `409 conflicto` si no hay anterior |

## YouTube

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/journeys/:id/measures` | `{revision, niches: {label, queries}[]}` | `202 {jobId}` |
| `POST /api/journeys/:id/name-checks` | `{revision, names: {displayName, handle, origin}[]}` | `202 {jobId}` |
| `POST /api/journeys/:id/reading` | `{revision, input}` | `202 {jobId}`: confirma el canal, pasa a `lectura` y lee; con el mismo canal en curso, el mismo trabajo. `404` si el canal no existe; `409 conflicto` si otro canal de la app ya es ese, guard `ya_hay_canal`; `502 youtube` con su fallo si YouTube no se pudo leer |
| `POST /api/journeys/:id/resolve` | `{input}` | `{channelId, title, handle, subscribers, thumbnailUrl, fetchedAt}` para confirmar; `404` si no existe; `502 youtube` con su fallo si YouTube no se pudo leer |
| `GET /api/jobs/:id/events` | — | `text/event-stream`: `progress`, `item` (una medida o comprobación), `done`, `failed` |
| `POST /api/journeys/:id/references` | `{measureId, add?: string, remove?: string}` | `ReferenceChannel[]` |

Los trabajos siguen corriendo si se cierra la pestaña; al volver, `GET /api/journeys/:id` trae lo ya hecho. Si el
servidor se reinicia, los trabajos `en_curso` pasan a `interrumpido` y la pantalla ofrece «Seguir».

## Perfil

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/channels/:id/profile/versions` | — | `{version, origin, createdAt}[]` |
| `GET /api/channels/:id/profile/versions/:v` | — | `ProfileVersion` |
| `PUT /api/channels/:id/profile` | `{baseVersion, profile}` | Nueva versión `manual`; `409` si `baseVersion` no es la vigente |
| `POST /api/channels/:id/profile/restore` | `{version}` | Nueva versión `restaurada` |
| `PATCH /api/channels/:id/name` | `{displayName, handle, checkId?}` | `Channel` |
| `GET /api/channels/:id/export?format=md\|json` | — | Descarga con `Content-Disposition` |

## Ajustes

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/settings/youtube` | — | `{source, effectiveSource, ytdlpVersion, apiKey: {set, hint}, quota?}` |
| `PUT /api/settings/youtube/source` | `{source}` | lo mismo |
| `PUT /api/settings/youtube/api-key` | `{apiKey}` | Se comprueba con una llamada de 1 unidad; `400 validacion` si no vale; nunca se devuelve |
| `DELETE /api/settings/youtube/api-key` | — | `204` |
| `POST /api/settings/youtube/update-reader` | — | `202 {jobId}` (descarga yt-dlp, [installer](./installer.md)) |
| `GET /api/usage?from&to` | — | `{items: AiUsage[], todayCents, monthCents}` |

## Pruebas

Integración con el servidor real, base de datos en memoria y adaptadores `fake`: cada ruta, cada guard, `revision`
vieja, `estimateId` caducado, y que ninguna respuesta ni log contiene la clave (se busca la clave de prueba en todo lo
escrito).

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
  También `PUT /api/settings/youtube/api-key` cuando YouTube no contesta a la comprobación (entrada 106).
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
| `PUT /api/channels/:id/profile` | `{baseVersion, profile}` | Nueva versión `manual`; `409` si `baseVersion` no es la vigente. Se guardan los textos, los supuestos del dinero y las respuestas (ritmo, región, forma de aparecer, para niños); el dinero, los avisos y sus fuentes de conocimiento se vuelven a calcular, y las cifras de YouTube y el nombre salen de la versión base. `400 validacion` (`profile`) si el ritmo cambia fuera de sus límites o si ya no se encuentra el tipo de contenido del que sale el dinero y las respuestas cambian (entradas 117, 121, 123, 124 y 132) |
| `POST /api/channels/:id/profile/restore` | `{version}` | Nueva versión `restaurada`, con el nombre de ahora (entrada 103) |
| `POST /api/channels/:id/profile/remeasure` | — | `202 {jobId}`. Con nicho medido, «Volver a medir» (entradas 114 y 120); con un canal leído, «Volver a leer tu canal» (entradas 125 y 128). Al terminar, nueva versión con las cifras nuevas; si no se puede hacer, el trabajo acaba fallido. `409` si ya hay una en marcha; `400 validacion` (`profile`) si no hay medida ni lectura |
| `POST /api/channels/:id/profile/estimate` | `{part: promesa\|temas\|publico}` | `Estimate` del uso `perfil_parte` (entrada 115) |
| `POST /api/channels/:id/profile/regenerate` | `{part, baseVersion, estimateId, instructions?}` | `{regenerationId, part, baseVersion, proposed, claimsTrimmed}` o `{failure}`. La propuesta queda guardada hasta aprobarla o descartarla y sustituye a la anterior; el perfil no cambia. `409` si `baseVersion` no es la vigente; `400` si la estimación es de otro canal (entradas 119 y 126) |
| `GET /api/channels/:id/profile/reading` | — | La lectura de la que sale el perfil (`context.readingId`), no la última; `null` si no viene de un canal leído |
| `GET /api/channels/:id/profile/regeneration` | — | La propuesta que espera, o `null` |
| `DELETE /api/channels/:id/profile/regeneration/:regenerationId` | — | `204`; `404` si ya no está |
| `POST /api/channels/:id/profile/regenerated` | `{regenerationId, baseVersion}` | Nueva versión `ia` con la parte propuesta, el dinero y los avisos mirados de nuevo; `404` si la propuesta ya no está; `409` si el perfil cambió (entrada 119) |
| `PATCH /api/channels/:id/name` | `{displayName, handle, checkId?}` | `Channel` |
| `GET /api/channels/:id/export?format=md\|json` | — | Descarga con `Content-Disposition` |

## Ajustes

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/settings/youtube` | — | `{source, effectiveSource, ytdlpVersion, apiKey: {set, hint, rejected}, quota?}`; `quota` solo con clave |
| `PUT /api/settings/youtube/source` | `{source}` | lo mismo; `400 validacion` (`source`) si es `data_api` sin una clave que YouTube acepte (entrada 105) |
| `PUT /api/settings/youtube/api-key` | `{apiKey}` | Se comprueba con una llamada de 1 unidad; `400 validacion` (`apiKey`) si no vale; `502 youtube` si YouTube no contesta; nunca se devuelve |
| `DELETE /api/settings/youtube/api-key` | — | `204` |
| `POST /api/settings/youtube/update-reader` | — | `202 {jobId}` (descarga yt-dlp, [installer](./installer.md)) |
| `GET /api/usage?from&to` | — | `{items: AiUsage[], todayCents, monthCents}` |
| `GET /api/settings/knowledge` | — | `{files: [{id, label, reviewedAt, stale}], staleAfterDays}` (entrada 97) |

## Pruebas

Integración con el servidor real, base de datos en memoria y adaptadores `fake`: cada ruta, cada guard, `revision`
vieja, `estimateId` caducado, y que ninguna respuesta ni log contiene la clave (se busca la clave de prueba en todo lo
escrito).

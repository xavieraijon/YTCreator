# Contrato: puerto `YouTubeData`

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R1–R5

El dominio solo habla con YouTube a través de este puerto (`packages/youtube`). Ningún otro paquete lanza yt-dlp ni
llama a la Data API.

## Reglas generales

- Todas las operaciones devuelven `Result<T, YouTubeFailure>`; nunca lanzan hacia el dominio.
- Cada resultado lleva `source: 'ytdlp' | 'data_api' | 'fake'` y `fetchedAt` (ISO 8601 UTC) para poder citarlo (FR-008).
- Si un dato no se pudo leer, el campo es `null`; el puerto **nunca** rellena ni estima (FR-009).
- La clave de la Data API se lee del `SecretStore` en cada uso y va en la cabecera `X-Goog-Api-Key`, nunca en la URL.
  Los logs registran operación, fuente, duración y código de fallo, nunca la URL completa ni cabeceras.
- Todo pasa por la caché `yt_cache` (24 h; 1 h para `checkHandle` y para lo que llega incompleto, `Sourced.partial`) y
  por el limitador de concurrencia (máximo 3 procesos de yt-dlp, 4 comprobaciones de nombre a la vez).
- Feeds RSS de yt-dlp: 5 a la vez en toda la app; cada canal una vez por hora y, si falla, una vez cada 10 minutos; pausa
  de 10 minutos tras un 403 o un 429; 15 s de tope por búsqueda. Una respuesta sin fechas cuenta como no leída. `search` con `withoutDates` no los pide.
- Tiempos máximos: yt-dlp 45 s por proceso, Data API 15 s por petición.

## Operaciones

| Operación | Entrada | Salida |
|---|---|---|
| `search(query, {limit})` | texto en el idioma del canal; `limit` ≤ 40 | `VideoHit[]` |
| `getChannel(ref)` | `ChannelRef` | `ChannelInfo` |
| `listChannelVideos(channelId, {limit, withShorts?, fresh?})` | `limit` ≤ 200; `withShorts` también lee los Shorts con yt-dlp, cuya lista de vídeos no los trae, y un 404 en esa lista no los oculta; `fresh` no responde con la copia guardada del servicio (el lector de fechas mantiene su pausa) | `VideoInfo[]`, de más nuevo a más viejo dentro de cada formato; los que no tienen fecha, en turnos de cada lista si no caben todos; `partial` si no se pudo leer todo |
| `checkHandle(handle)` | sin `@` | `'libre' \| 'ocupado'` |
| `resolve(input)` | URL de canal, `@`, URL de vídeo | `ChannelRef` |
| `health()` | — | `{source, available, version?, quota?: {used, limit, nearLimit}}`; `nearLimit` al pasar el umbral de `thresholds.json` (FR-030) |

Tipos:

| Tipo | Campos |
|---|---|
| `ChannelRef` | `{channelId}` (siempre resuelto a `UC…`) |
| `VideoHit` | `{videoId, title, channelId, channelTitle, views \| null, publishedAt \| null, durationSeconds \| null}` |
| `ChannelInfo` | `{channelId, title, handle \| null, description, subscribers \| null, videoCount \| null, country \| null, thumbnailUrl \| null}` |
| `VideoInfo` | `{videoId, title, views \| null, durationSeconds \| null, publishedAt \| null, isShort}` |

`isShort`: duración ≤ 180 s y relación vertical cuando la fuente la da; si no, solo duración. `VideoHit` no lleva
`isShort`: las medidas clasifican por `durationSeconds` ([market](./market.md)). `publishedAt` de yt-dlp
en listados planos puede venir vacío: el adaptador lo completa con el RSS del canal (15 más recientes) y deja `null`
el resto.

`YouTubeFailure`:

| Código | Cuándo |
|---|---|
| `sin_datos` | La búsqueda o el canal no devuelven nada útil |
| `no_encontrado` | El canal o la @ no existen (en `resolve` y `getChannel`) |
| `bloqueado` | YouTube corta las peticiones (429, «Sign in to confirm», bot check) |
| `cupo_agotado` | Data API sin unidades hoy; el registro cae a yt-dlp |
| `tiempo_agotado` | Se pasó el tiempo máximo; con `auto`, la Data API cae a yt-dlp |
| `no_disponible` | No hay yt-dlp instalado ni clave válida; con `auto`, la Data API que no responde cae a yt-dlp |

## Adaptadores

| Adaptador | Cuándo se usa | Notas |
|---|---|---|
| `ytdlp` | Por defecto | Binario en `<datos>/bin/yt-dlp`; argumentos como lista, nunca por shell; `--flat-playlist -J` para listados, `ytsearch40:` para búsquedas |
| `data-api` | `youtube.source` = `data_api`, o `auto` con clave válida | `search.list` 100 unidades; `channels`, `videos`, `playlistItems` 1 unidad; suma en `yt_quota` |
| `rss` | Solo como complemento de fechas | `feeds/videos.xml?channel_id=` |
| `fake` | `YTCREATOR_FAKE_YOUTUBE=1` (tests, e2e, auditoría de novato) | Datos de `packages/youtube/fixtures/`; nichos «sin_datos» y «bloqueado» preparados |

`checkHandle` con yt-dlp/HTTP: petición `HEAD`/`GET` a `https://www.youtube.com/@<handle>`; 404 → `libre`, 200 →
`ocupado`, cualquier otra cosa → fallo (el semáforo queda en `sin_comprobar`). Spike S2.

## Pruebas de contrato

Una misma batería corre contra `fake` (siempre) y contra fixtures grabadas de `ytdlp` y `data-api`: misma forma de
salida, `null` donde falta el dato, y cada código de fallo provocado al menos una vez. `pnpm test:real-youtube`
(fuera de CI) la corre contra YouTube de verdad.

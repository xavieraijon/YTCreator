# Data Model: Canal y nicho

**Feature**: `003-channel-and-niche` | **Fecha**: 2026-10-31

Todo vive en la misma base de datos `~/YTCreator/ytcreator.db` con la migración `0002_channel.sql`. La base de datos
**nunca contiene secretos**: la clave opcional de la YouTube Data API va en el `SecretStore` de la 002 y aquí solo se
guardan su referencia y su `hint`, en `app_settings`.

Los tipos de TypeScript viven en `packages/core` y los esquemas Zod en `@ytcreator/core/api`
([contracts/http-api.md](./contracts/http-api.md)). Como en la 002, los valores de dominio van en español (`nuevo`,
`sin_comprobar`) y los técnicos en inglés (`created_at`). Fechas en ISO 8601 UTC; importes en céntimos de euro
enteros.

---

## Entidades de la spec → dónde viven

| Entidad (spec) | Tabla | Decisión |
|---|---|---|
| Canal | `channel` | R15 |
| Recorrido | `journey` | R14 |
| Propuesta | `proposal` | R15 |
| Perfil del canal y sus versiones | `channel_profile`, `profile_version` | R15 |
| Medida de mercado | `market_measure` | R6 |
| Canal de referencia | `reference_channel` | R6 |
| Comprobación de nombre | `name_check` | FR-017 |
| Lectura de canal | `channel_reading` | FR-020 |
| *(trabajo largo: medir, leer, comprobar)* | `background_job` | R14 |
| *(consumo de IA)* | `ai_usage` | R13 |
| *(caché y cupo de YouTube)* | `yt_cache`, `yt_quota` | R3, R4 |

Relaciones:

```text
channel 1 ── N journey ── N proposal
   │             ├── N market_measure ── N reference_channel
   │             ├── N name_check
   │             └── N background_job
   ├── 1 channel_profile ── N profile_version
   └── N channel_reading
ai_usage ── (opcional) journey
```

---

## `channel`

Un canal del creador. FR-028: el modelo admite N; esta feature solo deja crear uno (la ruta de alta devuelve
`conflicto` si ya existe uno sin archivar).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | UUID v7 |
| `origin` | `'nuevo' \| 'existente'` | Recorrido con que se creó |
| `display_name` | `TEXT \| NULL` | 1–100 caracteres; `NULL` hasta elegir nombre |
| `handle` | `TEXT \| NULL` | Sin `@`, 3–30 caracteres `[A-Za-z0-9._-]` |
| `name_status` | `'provisional' \| 'elegido'` | FR-018b; `provisional` mientras no se elija |
| `youtube_channel_id` | `TEXT \| NULL` | `UC…` (24 caracteres); solo en canales existentes |
| `language` | `TEXT` | `'es'` en la v1 |
| `audience_region` | `'espana' \| 'latam' \| 'mixto'` | FR-014b; por defecto `espana` |
| `archived_at` | `TEXT \| NULL` | Reservado para la gestión de varios canales (fuera de alcance) |
| `created_at`, `updated_at` | `TEXT` | |

Índices: `UNIQUE (youtube_channel_id) WHERE youtube_channel_id IS NOT NULL`.

## `journey`

Un recorrido guiado. Un canal tiene como mucho un recorrido `activo` a la vez.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `channel_id` | `TEXT` FK → `channel` | |
| `kind` | `'nuevo' \| 'existente'` | |
| `step` | ver transiciones | |
| `status` | `'activo' \| 'terminado' \| 'abandonado'` | |
| `state` | `TEXT` (JSON) | Respuestas del creador por paso, validado con `journeyStateSchema` |
| `revision` | `INTEGER` | Sube con cada transición; las rutas la piden para evitar dobles envíos (`conflicto`) |
| `created_at`, `updated_at` | `TEXT` | |

Índice: `UNIQUE (channel_id) WHERE status = 'activo'`.

`state` (todos los campos opcionales hasta su paso):

| Campo | Tipo | Paso | Regla |
|---|---|---|---|
| `interests` | `string` | `intereses` | 10–1.000 caracteres |
| `answers` | `{questionId, answer}[]` | `preguntas` | 0–3 (FR-005); se pueden saltar |
| `hoursPerWeek` | `number` | `ritmo` | 1–60 (FR-012b) |
| `onCamera` | `'cara' \| 'voz' \| 'ninguna'` | `ritmo` | FR-012b |
| `audienceRegion` | `'espana' \| 'latam' \| 'mixto'` | `ritmo` | FR-014b |
| `channelInput` | `string` | `enlace` | URL de canal, `@` o URL de vídeo (FR-019) |
| `resolvedChannelId` | `string` | `confirmar` | |
| `lowInfo` | `boolean` | `lectura` | `true` si hay menos de 5 vídeos (FR-022) |

### Transiciones

Canal nuevo:

```text
intereses → preguntas → nichos → ritmo → conceptos → nombres → hecho
                          ↑  └──────── (cambiar nicho: FR-025, pide confirmación) ──┐
                          └─────────────────────────────────────────────────────────┘
nombres ──(dejar para más tarde, FR-018b)──→ hecho   [channel.name_status = provisional]
```

Canal existente:

```text
enlace → confirmar → lectura → posicionamiento → hecho
                        └──(menos de 5 vídeos, FR-022)──→ recorrido nuevo en «intereses»,
                                                          conservando display_name y handle
```

Reglas:

- Solo se avanza si el paso actual tiene su aprobación (`nichos` necesita una propuesta de nichos con uno elegido,
  `conceptos` un concepto aprobado, etc.).
- Volver a un paso anterior está permitido; no borra propuestas, solo cambia `step`.
- `hecho` pone `status = 'terminado'` y crea la primera versión del perfil si no existía.

## `proposal`

Toda salida de la IA que el creador puede aprobar, editar o regenerar (FR-023).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `journey_id` | `TEXT` FK → `journey` | |
| `kind` | `'preguntas' \| 'nichos' \| 'conceptos' \| 'nombres' \| 'perfil_actual' \| 'posicionamiento'` | |
| `payload` | `TEXT` (JSON) | Validado con el esquema del `kind` ([ai-uses](./contracts/ai-uses.md)) |
| `edited_payload` | `TEXT \| NULL` | Versión editada a mano; si existe, manda sobre `payload` |
| `selected_index` | `INTEGER \| NULL` | Elemento elegido (nicho, concepto, nombre) |
| `status` | `'propuesta' \| 'aprobada' \| 'descartada'` | Al regenerar, la anterior pasa a `descartada` |
| `parent_id` | `TEXT \| NULL` FK → `proposal` | La propuesta que se regeneró |
| `instructions` | `TEXT \| NULL` | Indicaciones del creador al regenerar; 0–500 caracteres |
| `prompt_id`, `prompt_version` | `TEXT`, `INTEGER` | Principio IV |
| `claims_trimmed` | `0 \| 1` | R8: se quitaron frases con cifras sin respaldo |
| `usage_id` | `TEXT \| NULL` FK → `ai_usage` | |
| `created_at`, `decided_at` | `TEXT`, `TEXT \| NULL` | |

Los nichos escritos por el creador (FR-011) se guardan como un elemento más de la propuesta de nichos con
`origin: 'creador'`; los nombres propios (FR-016), igual en la de nombres.

## `channel_profile` y `profile_version`

`channel_profile` es la fila viva (una por canal); `profile_version` guarda una copia completa e inmutable de cada
cambio aprobado (FR-024).

`channel_profile`:

| Columna | Tipo | Regla |
|---|---|---|
| `channel_id` | `TEXT` PK FK → `channel` | |
| `current_version` | `INTEGER` | Número de la versión vigente |
| `updated_at` | `TEXT` | |

`profile_version`:

| Columna | Tipo | Regla |
|---|---|---|
| `channel_id` | `TEXT` FK | |
| `version` | `INTEGER` | 1, 2, 3…; PK compuesta `(channel_id, version)` |
| `origin` | `'ia' \| 'manual' \| 'restaurada'` | `restaurada` lleva `restored_from` |
| `restored_from` | `INTEGER \| NULL` | |
| `proposal_id` | `TEXT \| NULL` | La propuesta aprobada que la generó |
| `profile` | `TEXT` (JSON) | `ChannelProfile`, ver abajo |
| `created_at` | `TEXT` | |

### `ChannelProfile` (JSON)

La misma forma para canales nuevos y existentes (FR-021b).

| Campo | Tipo | Regla |
|---|---|---|
| `schemaVersion` | `1` | |
| `niche` | `{label, summary, measureId \| null}` | `measureId` apunta a la medida que lo respalda |
| `concept.promise` | `string` | Una frase, ≤ 160 caracteres |
| `concept.pillars` | `{title, description}[]` | 3–4 (FR-013) |
| `concept.audience` | `{description, region, madeForKids}` | `madeForKids: true` lleva aviso (FR-015) |
| `concept.format` | `{presence: 'cara' \| 'voz' \| 'ninguna', longForm, shortsRole}` | |
| `concept.cadence` | `{longPerWeek, shortsPerWeek, hoursPerWeek}` | Encaja con `hoursPerWeek` del recorrido |
| `concept.monetization` | `MonetizationEstimate` | Rangos con supuestos y fuentes (FR-014) |
| `concept.warnings` | `{code: 'infantil' \| 'solo_shorts' \| 'no_autentico', sourceId}[]` | FR-015 |
| `name` | `{displayName, handle, status: 'provisional' \| 'elegido', checkId \| null}` | |
| `context` | `{currentProfile, readingId} \| null` | Solo canales existentes (FR-021b) |
| `sources` | `Source[]` | Cada cifra del perfil apunta aquí |

`MonetizationEstimate`:

| Campo | Tipo | Regla |
|---|---|---|
| `rpmEurRange` | `{min, max}` | De `rpm.json` para la categoría y región |
| `monthlyViewsAssumption` | `{min, max}` | Supuesto visible, no medida |
| `monthlyEurRange` | `{min, max}` | `views × rpm / 1000`, redondeado |
| `yppRequirements` | `{subscribers, watchHours, shortsViews}` | De `ypp.json` |
| `assumptions` | `string[]` | Textos generados por la IA, pasados por las reglas de escritura |
| `sourceIds` | `string[]` | |

`Source`:

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `string` | |
| `kind` | `'youtube' \| 'conocimiento'` | |
| `label` | `string` | «YouTube (yt-dlp)», «Programa de socios de YouTube» |
| `url` | `string \| null` | |
| `date` | ISO 8601 | Fecha de la medida o `reviewedAt` del conocimiento |

## `market_measure`

Una medida de un nicho (FR-007, FR-009).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `journey_id` | `TEXT` FK | |
| `niche_label` | `TEXT` | |
| `queries` | `TEXT` (JSON `string[]`) | 1–3 búsquedas en el idioma del canal |
| `source` | `'ytdlp' \| 'data_api' \| 'fake'` | `fake` solo en pruebas |
| `status` | `'en_curso' \| 'medida' \| 'fallida'` | |
| `failure` | `YouTubeFailure \| NULL` | Si `fallida`; no hay cifras (FR-009) |
| `demand_median_views` | `INTEGER \| NULL` | |
| `demand_level` | `'alta' \| 'media' \| 'baja' \| NULL` | |
| `entry_channels` | `INTEGER \| NULL` | Canales < 200.000 con algún vídeo largo de visitas ≥ suscriptores |
| `entry_level` | `'abierta' \| 'entreabierta' \| 'cerrada' \| NULL` | |
| `concentration` | `REAL \| NULL` | 0–1 |
| `concentration_level` | `'alta' \| 'media' \| 'baja' \| NULL` | |
| `recent_videos` | `INTEGER \| NULL` | Últimos 90 días |
| `recent_share` | `REAL \| NULL` | 0–1 |
| `sample_size` | `INTEGER \| NULL` | Vídeos largos analizados |
| `shorts_in_sample` | `INTEGER \| NULL` | Shorts de la búsqueda, fuera de los indicadores (FR-007b) |
| `shorts_median_views` | `INTEGER \| NULL` | Si hay al menos `minVideos` Shorts |
| `unknown_format_videos` | `INTEGER \| NULL` | Vídeos sin duración, fuera de los indicadores |
| `verdict` | `'conviene' \| 'con_reservas' \| 'no_conviene' \| NULL` | Regla fija ([market](./contracts/market.md)) |
| `thresholds_version` | `INTEGER` | Versión de `thresholds.json` usada |
| `measured_at` | `TEXT \| NULL` | FR-008; si tiene más de 90 días, aviso (FR-027) |
| `created_at` | `TEXT` | |

## `reference_channel`

De 2 a 4 canales de referencia reales del nicho elegido (FR-012).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `measure_id` | `TEXT` FK → `market_measure` | |
| `youtube_channel_id` | `TEXT` | |
| `title`, `handle` | `TEXT`, `TEXT \| NULL` | |
| `subscribers` | `INTEGER \| NULL` | `NULL` si el canal oculta la cifra |
| `top_video_views` | `INTEGER` | |
| `median_views` | `INTEGER \| NULL` | Mediana de sus vídeos largos recientes; `NULL` si no se pudieron leer |
| `best_ratio` | `REAL \| NULL` | Mayores «veces lo normal» de sus vídeos largos ([market](./contracts/market.md)) |
| `best_video_id`, `best_video_title` | `TEXT \| NULL` | El vídeo de `best_ratio` |
| `reason` | `TEXT` | Por qué es referencia; generado por la IA y marcado como opinión |
| `fetched_at` | `TEXT` | |

## `name_check`

Comprobación de un nombre candidato (FR-016–FR-018).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `journey_id` | `TEXT` FK | |
| `display_name` | `TEXT` | |
| `handle` | `TEXT` | |
| `origin` | `'ia' \| 'creador'` | |
| `semaphore` | `'rojo' \| 'ambar' \| 'verde' \| 'sin_comprobar'` | |
| `reasons` | `TEXT` (JSON) | Códigos: `handle_ocupado`, `nombre_igual`, `parecidos`, `titulos_con_nombre`, `largo`, `fallo` |
| `handle_status` | `'libre' \| 'ocupado' \| 'sin_comprobar'` | Libre = 404; ocupado = respuesta correcta |
| `similar_channels` | `TEXT` (JSON) | Hasta 5 `{title, handle, subscribers}` |
| `title_hits` | `INTEGER \| NULL` | Vídeos con el nombre en el título |
| `checked_at` | `TEXT` | |

Regla del semáforo: rojo si `handle_ocupado` o `nombre_igual`; si no, ámbar si `parecidos`, `title_hits ≥ 3` o más de
30 caracteres; si no, verde. Cualquier fallo de la comprobación da `sin_comprobar`, nunca verde.

## `channel_reading`

Lo que se leyó de un canal existente (FR-020).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `channel_id` | `TEXT` FK | |
| `youtube_channel_id` | `TEXT` | |
| `source` | `'ytdlp' \| 'data_api' \| 'fake'` | `fake` solo en pruebas |
| `title`, `handle`, `description` | `TEXT` | |
| `subscribers` | `INTEGER \| NULL` | |
| `video_count` | `INTEGER` | Total público |
| `videos` | `TEXT` (JSON) | Hasta 200 `{id, title, views, durationSeconds, publishedAt, isShort, ratio \| null}`; `ratio` = veces lo normal |
| `summary` | `TEXT` (JSON) | Cifras calculadas, separadas por formato: mediana de visitas, ritmo, reparto largo/Shorts, mejores y peores según `ratio` |
| `fetched_at` | `TEXT` | |

## `background_job`

Las operaciones largas guardan su estado para que cerrar la app no las deje colgadas (SC-006).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `journey_id` | `TEXT \| NULL` FK | `NULL` en `actualizar_lector`, que no depende de un recorrido |
| `kind` | `'medir_nichos' \| 'comprobar_nombres' \| 'leer_canal' \| 'ia' \| 'actualizar_lector'` | |
| `status` | `'en_curso' \| 'hecho' \| 'fallido' \| 'interrumpido'` | Al arrancar, los `en_curso` pasan a `interrumpido` |
| `progress` | `TEXT` (JSON) | `{done, total}` |
| `failure` | `TEXT \| NULL` | Código de fallo |
| `started_at`, `finished_at` | `TEXT`, `TEXT \| NULL` | |

## `ai_usage`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `journey_id` | `TEXT \| NULL` | |
| `use` | `AiUse` | |
| `provider_id`, `model` | `TEXT` | |
| `input_tokens`, `output_tokens` | `INTEGER` | Los reales de la respuesta |
| `estimated_cents` | `INTEGER` | Lo que se mostró en el botón |
| `cost_cents` | `INTEGER` | Real; 0 con suscripción |
| `pricing_version` | `INTEGER` | Versión de `pricing.json` |
| `outcome` | `'ok' \| AiFailure` | |
| `created_at` | `TEXT` | Índice por fecha para sumar día y mes |

## `yt_cache` y `yt_quota`

`yt_cache`: `key` PK (`fuente:tipo:consulta normalizada`), `payload` JSON, `fetched_at`, `expires_at` (24 h; 1 h para
las comprobaciones de @). Se purga al arrancar lo caducado.

`yt_quota`: `day` PK (fecha del Pacífico, `YYYY-MM-DD`), `units` `INTEGER`. Solo la usa el adaptador de Data API.

## Ajustes nuevos en `app_settings`

| Clave | Valor | Regla |
|---|---|---|
| `youtube.source` | `'auto' \| 'ytdlp' \| 'data_api'` | `auto` por defecto: Data API si hay clave válida |
| `youtube.api_key_ref` | referencia del `SecretStore` | Nunca la clave |
| `youtube.api_key_hint` | 4 caracteres | |
| `youtube.ytdlp_version` | `string` | La instalada (R2) |

## Exportación

`GET /api/channels/:id/export` produce el perfil vigente; no llama a la IA ni gasta nada. El JSON
es `{schemaVersion: 1, exportedAt, channel, profile: ChannelProfile, measures, references, reading?}` y el Markdown
tiene las mismas secciones con «Fuentes» al final (R17).

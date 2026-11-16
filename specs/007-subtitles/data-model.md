# Data Model: Subtítulos

**Feature**: `007-subtitles` | Decisiones en [research.md](./research.md)

Migración `0008_subtitles.sql`. Añade dos tablas y reconstruye `background_job` (como la `0005`), conservando todas sus
filas. No toca las tablas del guion ni del paquete: los minutos reales viajan dentro del JSON de `package_version`.

## Tablas

### `subtitle_track`

Los subtítulos de un guion. Se crea al subir el primer audio.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | TEXT PK | |
| `channel_id` | TEXT | → `channel` |
| `script_id` | TEXT UNIQUE | → `script`; una pista por guion |
| `format` | TEXT | `largo` \| `short`; copiado del guion |
| `audio_file` | TEXT NULL | nombre del audio en la carpeta de trabajo; `NULL` si no hay o se borró (R16) |
| `audio_seconds` | REAL NULL | duración del audio |
| `source_name` | TEXT NULL | nombre del fichero que eligió el creador, para mostrarlo (sin ruta) |
| `approved_version` | INTEGER NULL | versión aprobada |
| `approved_at` | TEXT NULL | |
| `replacements` | TEXT | JSON `[{from, to}]` de las correcciones en bloque, para reaplicarlas (FR-017); por defecto `[]` |
| `speed_model` | TEXT NULL | modelo con el que se hizo la última versión de reconocimiento |
| `job_id` | TEXT NULL | → `background_job`; el último trabajo de reconocimiento o de revisión de la IA |
| `job_op` | TEXT NULL | `reconocer` \| `revision_ia` |
| `ai_proposal` | TEXT NULL | JSON de la propuesta de la IA pendiente: `{baseVersion, changes: [{cueId, text, reason}], usageIds, promptId, promptVersion}`; solo vale para la versión `baseVersion` (migración 0009, decisión 34) |
| `created_at`, `updated_at` | TEXT | ISO |

### `subtitle_version`

Una foto completa de los subtítulos por cambio (R12).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | TEXT PK | |
| `track_id` | TEXT | → `subtitle_track` |
| `version` | INTEGER | ≥ 1, `UNIQUE (track_id, version)` |
| `origin` | TEXT | `reconocimiento` \| `edicion` \| `ia` \| `recuperada` \| `reaplicada` |
| `content` | TEXT | JSON de `SubtitlesContent` |
| `draft_version` | INTEGER NULL | versión del guion aprobado con la que se alineó (avisa si el guion cambió) |
| `restored_from` | INTEGER NULL | con origen `recuperada` |
| `usage_id` | TEXT NULL | → `ai_usage`; con origen `ia` |
| `prompt_id`, `prompt_version` | TEXT NULL, INTEGER NULL | con origen `ia` |
| `created_at` | TEXT | ISO |

### `background_job` (reconstruida)

Igual que en la `0005`, más:

- `kind` admite `reconocer_voz` y `descargar_motor`.
- `status` admite `en_cola` (R5).
- `CHECK (kind NOT IN ('reconocer_voz') OR channel_id IS NOT NULL)`.

### `app_settings` (existente, clave y valor)

Dos claves nuevas: `speech.model` (el modelo elegido en «Modo experto»; por defecto, el de R2) y `speech.speed`
(JSON `{[model]: factor}` medido en este equipo, R7).

## Contenido

### `SubtitlesContent`

```text
{
  cues: Cue[]                 // ordenados por start, sin solapes en la propuesta
  words: HeardWord[]          // lo oído, para alinear de nuevo y localizar bloques; no se edita
  audioSeconds: number
}
```

### `Cue`

| Campo | Regla |
|---|---|
| `id` | estable entre versiones mientras no se parta ni se junte |
| `start`, `end` | segundos con 3 decimales; `0 ≤ start < end ≤ audioSeconds` |
| `text` | hasta 2 líneas separadas por `\n` (1 en un Short); no vacío |
| `flags` | lista de `del_guion`, `poca_seguridad`, `cambio_ia` (guardadas) |
| `heard` | con `del_guion` o `cambio_ia`: el texto anterior, para mostrarlo al lado |
| `reviewed` | `true` cuando el creador da por revisadas sus marcas |

`lectura_rapida` y `fuera_de_limites` no se guardan: se calculan contra `subtitles/craft.json` cada vez (R10).

### `HeardWord`

`{ text, start, end, p }`: palabra oída, sus tiempos y su probabilidad media (0 a 1).

### Capítulos de la 006

`Chapter` gana un campo opcional, `fromAudio?: true`. Con él, `startSeconds` es el minuto real y `chapterTimes` lo
trata como fijo, igual que `manual`. Las versiones guardadas antes no lo llevan y se leen igual (R13).

## Estados

### Pista (calculado, R12)

| Estado | Cuándo |
|---|---|
| `sin_hacer` | no hay pista o no tiene versiones |
| `en_marcha` | su trabajo de reconocimiento está `en_cola` o `en_curso` |
| `borrador` | hay versiones y la última no es la aprobada |
| `aprobados` | la última versión es la aprobada |

Editar, recuperar o reaplicar sobre unos subtítulos aprobados crea una versión nueva y, por tanto, vuelve a `borrador`;
la interfaz avisa antes (FR-013).

### Trabajo de reconocimiento

`en_cola` → `en_curso` → `hecho` | `fallido` | `interrumpido`. Cancelar mata el proceso y lo deja `fallido` con el motivo
`cancelado`. Solo `hecho` crea versión.

## Ficheros

| Ruta | Qué |
|---|---|
| `~/YTCreator/subtitulos/<scriptId>/audio.wav` | el audio que se oye al revisar; se borra con R16 |
| `~/YTCreator/subtitulos/<scriptId>/.audio-<id>.tmp` | la subida en curso; se renombra o se borra |
| `APP_HOME/bin/whisper/` | `whisper-cli`, sus bibliotecas (Linux) y `whisper.version` |
| `APP_HOME/models/` | los modelos de voz y de detección de voz, cada uno con su versión |

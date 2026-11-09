# Data Model: Banco de ideas

Todo vive en la SQLite de la 002 y la 003. La migración `0005_idea_bank.sql` es aditiva (R12): crea `idea_batch`,
`idea` e `idea_measure` y rehace `background_job` sin perder datos. Las fechas van en ISO 8601 UTC y los ids son UUID,
como en la 003.

## idea_batch

Cada tanda que propone la IA (uso `ideas`) o cada lote de variantes (uso `otro_enfoque`).

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `channel_id` | `TEXT` → `channel.id` | |
| `kind` | `'ideas' \| 'otro_enfoque'` | |
| `source_idea_id` | `TEXT` → `idea.id`, nulo | Solo con `otro_enfoque`: la idea quemada o competida |
| `payload` | JSON | Salida validada: `{ideas: IdeaDraft[]}`, de 6 a 10, o `{angles: (IdeaDraft & {why})[]}`, de 2 a 3 |
| `decisions` | JSON | `{[index]: 'quedada' \| 'descartada'}`; lo que no aparece está pendiente |
| `removed_repeats` | `INTEGER` | Candidatas que el servidor quitó por repetidas (R9) |
| `instructions` | `TEXT`, nulo | Hasta 500 caracteres |
| `prompt_id`, `prompt_version` | `TEXT` | |
| `claims_trimmed` | `INTEGER` 0/1 | Como en `proposal` |
| `usage_id` | `TEXT` → `ai_usage.id` | |
| `profile_version` | `INTEGER` | Versión del perfil leída al proponer |
| `created_at` | `TEXT` | |

`IdeaDraft` = `{title, hook, pillar, format, query, broadQuery, queryEn}`:

- `title`: 1–120 caracteres;
- `hook`: 1–300;
- `pillar`: uno de los pilares del perfil;
- `format`: `'largo' | 'short'`;
- búsquedas: 1–120 cada una.

## idea

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `channel_id` | `TEXT` → `channel.id` | Cada canal, su banco (FR-001) |
| `origin` | `'ia' \| 'creador' \| 'otro_enfoque'` | FR-006 |
| `batch_id` | `TEXT` → `idea_batch.id`, nulo | De qué tanda salió |
| `source_idea_id` | `TEXT` → `idea.id`, nulo | Con `otro_enfoque`: la idea de la que salió |
| `title` | `TEXT` | 1–120, obligatorio |
| `hook` | `TEXT` | 0–300 (una idea propia puede no tenerlo) |
| `pillar` | `TEXT`, nulo | Pilar del perfil, o nulo en una propia |
| `format` | `'largo' \| 'short'` | Obligatorio |
| `query`, `broad_query`, `query_en` | `TEXT`, nulo | Búsquedas (R6); sin `query` no se mide |
| `notes` | `TEXT` | 0–2.000, del creador |
| `status` | `'banco' \| 'elegida' \| 'hecha' \| 'archivada'` | |
| `position` | `INTEGER` | Orden en el banco (R10) |
| `queue_position` | `INTEGER`, nulo | Solo con `status = 'elegida'` |
| `original` | JSON | Los campos tal como nacieron (R11) |
| `revision` | `INTEGER` | Empieza en 1 y sube con cada edición de título, gancho, pilar, formato o búsquedas |
| `profile_version` | `INTEGER` | Versión del perfil con la que nació (R15) |
| `created_at`, `updated_at` | `TEXT` | |

Índices: `(channel_id, status, position)` y `(channel_id, queue_position)`.

### Estados

```text
banco ──elegir──→ elegida (entra al final de la cola)
elegida ──quitar de la cola──→ banco
banco | elegida ──marcar hecha──→ hecha ──volver al banco──→ banco
cualquiera ──archivar──→ archivada ──recuperar──→ banco
```

- Archivar nunca borra (FR-013). No hay borrado en la v1 de esta feature.
- Cambiar de `elegida` a otro estado deja `queue_position` en nulo y vuelve a numerar la cola.
- `hecha` la pone el creador. La 005 podrá ponerla cuando exista.

## idea_measure

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | |
| `idea_id` | `TEXT` → `idea.id` | |
| `idea_revision` | `INTEGER` | La versión de la idea medida (R11) |
| `status` | `'medida' \| 'fallida'` | |
| `verdict` | `'hueco' \| 'competido' \| 'quemado' \| 'frio'`, nulo | Nulo si `fallida` |
| `reason` | `TEXT`, nulo | Código de R3 |
| `figures` | JSON, nulo | `{similar, recent, dated, medianViews, maxViews, broadTopViews, broadBigVideos, hasAudience}` |
| `similar_videos` | JSON | Hasta 12 `VideoHit` casi iguales, ordenados por visitas |
| `opportunity` | JSON, nulo | `{english: boolean, englishBigVideos, topVideos: VideoHit[] (≤ 5)}`, o nulo sin `queryEn` |
| `queries` | JSON | `{query, broadQuery, queryEn}` usadas, para que la evidencia diga qué se buscó |
| `failure` | `TEXT`, nulo | Código del puerto de YouTube si `fallida` |
| `source` | `'ytdlp' \| 'data_api' \| 'fake'` | |
| `partial` | `INTEGER` 0/1 | Faltan fechas (R2) |
| `thresholds_version` | `INTEGER` | Versión de `thresholds.json` usada |
| `measured_at` | `TEXT` | |

- La medida que se muestra es la última de la idea. Las anteriores se conservan.
- Es antigua si `measured_at` tiene más de `ideas.staleDays` (30) días (FR-010).

## background_job (rehecha)

Igual que en la 003, con dos cambios:

- `kind` admite también `'medir_ideas'`;
- la columna nueva `channel_id` (nula) apunta a `channel.id`.

Un `medir_ideas` lleva `channel_id`, y su `progress` es `{done, total, ideaIds}`.

## Exportación del banco (`.json`)

```json
{
  "version": 1,
  "exportedAt": "2026-11-07T10:00:00.000Z",
  "channel": { "id": "…", "displayName": "…" },
  "ideas": [
    {
      "title": "…", "hook": "…", "pillar": "…", "format": "largo", "status": "elegida", "queuePosition": 1,
      "origin": "ia", "queries": { "query": "…", "broadQuery": "…", "queryEn": "…" }, "notes": "",
      "measure": {
        "verdict": "hueco", "reason": "pocos_con_publico", "figures": { "…": 0 },
        "source": "ytdlp", "measuredAt": "…", "assumption": true, "thresholdsVersion": 5
      }
    }
  ]
}
```

El `.md` es el mismo contenido en texto llano: la cola primero, luego el banco y al final las hechas. Las archivadas
no van.

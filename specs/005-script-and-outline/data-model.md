# Data Model: Guion y escaleta

**Feature**: `005-script-and-outline` | Decisiones en [research.md](./research.md)

Migración aditiva `0006_script.sql`. No rehace ninguna tabla.

## Tablas

### `channel_script_settings`

La voz y el ritmo de cada canal. Si no hay fila, se usan los valores por defecto.

| Columna | Tipo | Regla |
|---|---|---|
| `channel_id` | TEXT PK | → `channel` |
| `address` | TEXT | `tu` \| `usted`; por defecto `tu` |
| `register` | TEXT | `cercano` \| `sobrio` \| `energico`; por defecto `cercano` |
| `sample` | TEXT | ≤ 4.000 caracteres; por defecto vacío |
| `words_per_minute` | INTEGER | 100 a 220; por defecto 150 |
| `updated_at` | TEXT | ISO |

### `script`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | TEXT PK | |
| `channel_id` | TEXT | → `channel` |
| `idea_id` | TEXT UNIQUE | → `idea`; un guion por idea |
| `format` | TEXT | `largo` \| `short`; copiado de la idea al crearlo |
| `target_seconds` | INTEGER | largo 180 a 1.800; Short 15 al máximo de `shorts.json` |
| `notes` | TEXT | ≤ 20.000 caracteres |
| `outline_approved_version` | INTEGER NULL | |
| `draft_approved_version` | INTEGER NULL | |
| `draft_approved_at` | TEXT NULL | |
| `draft_approved_pending` | INTEGER NULL | afirmaciones pendientes al aprobar |
| `source_script_id` | TEXT NULL | → `script`; Short sacado de un vídeo largo |
| `source_block_id` | TEXT NULL | el momento del guion del que sale |
| `source_draft_version` | INTEGER NULL | versión del guion largo de la que se escribió por última vez (para `origen_cambiado`) |
| `short_angles` | TEXT NULL | JSON con los enfoques ya pagados: cada uno con su `moment` (texto del bloque), `trimmed` y el `scriptId` del Short que salió de él (decisiones 41 y 43) |
| `job_id` | TEXT NULL | → `background_job` |
| `job_op` | TEXT NULL | uso en curso |
| `created_at`, `updated_at` | TEXT | ISO |

Se crea al abrir por primera vez el guion de una idea elegida. Índice por `(channel_id, updated_at)`.

### `script_version`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | TEXT PK | |
| `script_id` | TEXT | → `script` |
| `kind` | TEXT | `hechos` \| `escaleta` \| `guion` |
| `version` | INTEGER | ≥ 1; `UNIQUE(script_id, kind, version)` |
| `origin` | TEXT | `ia` \| `edicion` \| `bloque_ia` \| `recuperada` \| `comprobacion` \| `marcas` \| `heredada` |
| `content` | TEXT | JSON validado con el esquema de su `kind` |
| `facts_version` | INTEGER NULL | con qué hechos se hizo |
| `outline_version` | INTEGER NULL | con qué escaleta se hizo (solo `guion`) |
| `idea_revision` | INTEGER | |
| `profile_version` | INTEGER | |
| `instructions` | TEXT NULL | ≤ 500 caracteres |
| `prompt_id`, `prompt_version` | TEXT, INTEGER NULL | si salió de la IA |
| `usage_id` | TEXT NULL | → `ai_usage` |
| `restored_from` | INTEGER NULL | versión recuperada |
| `created_at` | TEXT | ISO |

Inmutable. Única excepción: si la última versión es `marcas` y no está aprobada, «Es correcto» y «No es un dato» la
actualizan, sin tocar nunca el texto (R10).

### `ai_usage` (cambio aditivo)

`web_searches INTEGER NOT NULL DEFAULT 0`, con `ALTER TABLE ADD COLUMN`.

## Contenido de las versiones (Zod, `packages/core/src/script/model.ts`)

```text
FactsContent   { facts: Fact[] }                      (0 a 60)
Fact           { id, text (0-600), label, origin: ia|creador, sources: Source[], alternatives: string|null }
  label        comprobado | una_fuente | sin_confirmar | del_creador
  text         vacío solo si origin=creador y hay al menos una fuente
Source         { id, url|null, reference|null, title, accessedAt, link: abre|no_abre|sin_comprobar|null }
  url o reference, al menos uno

OutlineContent { blocks: OutlineBlock[] }             (1 a 30)
OutlineBlock   { id, type: gancho|contexto|acto|cierre, title (0-120; vacío al editar, no al aprobar), purpose (0-300),
                 question|null, reward|null, bridge|null, seconds }

DraftContent   { blocks: DraftBlock[], claims: Claim[] }
DraftBlock     { id, type: gancho|contexto|acto|cierre|desarrollo, title, text (0-12000), visual (0-500) }
Claim          { id, blockId, text, status: pendiente|confirmada|corregida|sin_marca|quitada,
                 reason: sin_respaldo|hecho_dudoso, factId|null, check: ClaimCheck|null }
ClaimCheck     { verdict: correcto|matizar|incorrecto|sin_fuente, sources: Source[], proposal|null, checkedAt }
```

Los Shorts no tienen versiones `escaleta`. La duración de cada bloque del guion se calcula, no se guarda.

## Reglas

- **Etiqueta de un hecho** (`factLabel`, R8): `comprobado` exige ≥ 2 fuentes con `link = abre`, de dominios distintos y
  fiables; la IA solo puede bajarla.
- **Investigar otra vez**: los hechos del creador se conservan y los de la IA se sustituyen; lo anterior queda en el
  historial.
- **Aprobar una escaleta**: al menos un bloque y ninguno sin título.
- **Aprobar un guion**: al menos un bloque, ninguno con el texto vacío. Los avisos nunca bloquean (FR-016).
- **Escribir un guion**: exige que la última escaleta esté aprobada; en un Short no hace falta.
- **Sacar un Short**: exige un guion largo con su última versión aprobada.

## Estados que ve el creador (`scriptStatus`, R2)

```text
escaleta_borrador → escaleta_aprobada → guion_borrador → guion_aprobado
Short:                                  guion_borrador → guion_aprobado
```

| Situación | Estado |
|---|---|
| Sin escaleta ni guion | `sin_empezar` |
| Sin guion; la última escaleta no está aprobada | `escaleta_borrador` |
| Sin guion; la última escaleta está aprobada | `escaleta_aprobada` |
| Con guion; su última versión no está aprobada | `guion_borrador` |
| Con guion; su última versión está aprobada | `guion_aprobado` |

Una escaleta nueva con guion escrito no cambia el estado: sale el aviso `escaleta_cambiada`, y para escribirlo de nuevo
hay que aprobarla. Un Short sacado de un vídeo largo empieza en `sin_empezar`.

## Avisos calculados

| Aviso | Condición |
|---|---|
| `idea_cambiada` | `idea.revision` > `idea_revision` de la versión actual |
| `perfil_cambiado` | versión actual del perfil > `profile_version` |
| `hechos_cambiados` | última versión de hechos > `facts_version` |
| `escaleta_cambiada` | última versión de escaleta > `outline_version` del guion |
| `origen_cambiado` | el texto del momento de origen en la versión aprobada del guion largo no es el de `source_draft_version` (decisión 44) |

## Relación con la 004

La idea no cambia de esquema. `IdeaView` gana `script: { id, status } | null`. Un guion no bloquea ningún cambio de estado
de la idea y se conserva si sale de la cola.

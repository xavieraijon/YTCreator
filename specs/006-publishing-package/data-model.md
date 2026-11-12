# Data Model: Paquete de publicación

**Feature**: `006-publishing-package` | Decisiones en [research.md](./research.md)

Migración aditiva `0007_publish_package.sql`. No rehace ninguna tabla.

## Tablas

### `channel_publish_settings`

La parte fija de la descripción y la categoría de cada canal. Sin fila, valores por defecto (R6, R12).

| Columna | Tipo | Regla |
|---|---|---|
| `channel_id` | TEXT PK | → `channel` |
| `fixed_text` | TEXT | ≤ 1.500 caracteres; por defecto, el enlace de suscripción si hay `handle` |
| `category` | TEXT NULL | una de `studio.json`; `NULL` = se sugiere la de `studio.json` como supuesto |
| `updated_at` | TEXT | ISO |

### `publish_package`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | TEXT PK | |
| `channel_id` | TEXT | → `channel` |
| `script_id` | TEXT UNIQUE | → `script`; un paquete por guion |
| `format` | TEXT | `largo` \| `short`; copiado del guion al crearlo |
| `cover_approved` | TEXT NULL | JSON `{kind: version}` del paso Portada |
| `texts_approved` | TEXT NULL | JSON `{kind: version}` del paso Textos |
| `package_approved` | TEXT NULL | JSON `{kind: version}` de todo el paquete |
| `package_approved_at` | TEXT NULL | |
| `package_approved_warnings` | INTEGER NULL | avisos que quedaban al aprobar |
| `package_approved_draft` | INTEGER NULL | versión del guion aprobado al aprobar el paquete |
| `studio_done` | TEXT | JSON con las claves marcadas de la lista guiada; por defecto `[]` |
| `job_id` | TEXT NULL | → `background_job` |
| `job_op` | TEXT NULL | uso en curso |
| `created_at`, `updated_at` | TEXT | ISO |

Se crea al abrir por primera vez la publicación de un guion aprobado. Índice por `(channel_id, updated_at)`.

### `package_version`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | TEXT PK | |
| `package_id` | TEXT | → `publish_package` |
| `kind` | TEXT | `titulos` \| `miniaturas` \| `portada_short` \| `descripcion` \| `capitulos` \| `etiquetas` \| `comentario` |
| `version` | INTEGER | ≥ 1; `UNIQUE(package_id, kind, version)` |
| `origin` | TEXT | `ia` \| `edicion` \| `parte_ia` \| `recuperada` |
| `content` | TEXT | JSON validado con el esquema de su `kind` |
| `draft_version` | INTEGER | versión del guion aprobado con la que se hizo |
| `main_title` | TEXT NULL | título principal vigente al hacerla (para `titulo_cambiado`; no en `titulos`) |
| `instructions` | TEXT NULL | ≤ 500 caracteres |
| `prompt_id`, `prompt_version` | TEXT, INTEGER NULL | si salió de la IA |
| `usage_id` | TEXT NULL | → `ai_usage` |
| `restored_from` | INTEGER NULL | versión recuperada |
| `created_at` | TEXT | ISO |

Inmutable. Un vídeo largo no tiene `portada_short`; un Short no tiene `miniaturas` ni `capitulos`.

## Contenido de las versiones (Zod, `packages/core/src/publish/model.ts`)

```text
TitlesContent     { candidates: TitleCandidate[], main: id|null, alternatives: id[] }   (1 a 12 candidatos; 0 a 2 alternativos)
TitleCandidate    { id, text (1-100), why (0-300), blockId|null, origin: ia|creador }
  main y alternatives apuntan a candidatos distintos y existentes

ThumbnailsContent { concepts: ThumbnailConcept[], chosen: id[] }                         (1 a 6 conceptos; 0 a 3 elegidos)
ThumbnailConcept  { id, scene (1-500), bigText (0-40), emotion (0-120), composition (0-300), colors (0-200),
                    titleId|null, origin: ia|creador }

ShortCoverContent { blockId|null, moment (0-300), screenText (0-60) }

DescriptionContent { firstLines (0-300), body (0-3000), hashtags: string[] (0-10), fixedText (0-1500) }
  hashtags sin «#» ni espacios; el «#» lo pone el montaje. Solo en Shorts; en un vídeo largo, vacío

ChaptersContent   { chapters: Chapter[] }                                                  (0 a 30)
Chapter           { id, title (0-100), blockIds: id[], startSeconds|null, manual: boolean }
  startSeconds null = se calcula (R3); manual = lo escribió el creador

TagsContent       { tags: string[] }                                                       (0 a 40, cada una 1-100)

CommentContent    { text (0-1000) }
```

Al aprobar, ninguna pieza del paso puede estar vacía: `titulos` sin `main`, `miniaturas` sin elegidas,
`descripcion` sin `firstLines`, `etiquetas` sin ninguna, `comentario` sin texto, `capitulos` sin capítulos en un vídeo
largo, `portada_short` sin `moment`.

## Funciones puras (`packages/core/src/publish/`)

| Función | Qué hace |
|---|---|
| `chapterTimes(chapters, draft, wpm)` | minuto de cada capítulo: el manual, o la suma de duraciones de los bloques anteriores; el primero, 0 (R3) |
| `proposeChapters(aiChapters, draft, wpm, minSeconds)` | junta con el siguiente cada capítulo más corto que el mínimo |
| `descriptionSources(facts)` | apartado de fuentes, solo desde la lista de hechos (R4) |
| `assembleDescription(desc, chapters, sources)` | texto que se copia, en el orden de R5 |
| `studioChecklist(profile, settings, knowledge)` | los cuatro ajustes de R12 |
| `reviewPackage(pkg, knowledge)` | avisos de R13 |
| `packageStatus(pkg, versions, scriptStatus)` | estado (abajo) |
| `packageWarnings(...)` | avisos calculados (abajo) |
| `exportPackage(...)` | Markdown, JSON y brief (R15) |

## Estados que ve el creador (`packageStatus`, R2)

```text
sin_empezar → portada_borrador → portada_aprobada → textos_borrador → textos_aprobados → aprobado
```

| Situación | Estado |
|---|---|
| Sin `titulos` | `sin_empezar` |
| La portada no está aprobada en sus últimas versiones | `portada_borrador` |
| Portada aprobada, sin `descripcion` | `portada_aprobada` |
| Portada aprobada; los textos no están aprobados en sus últimas versiones | `textos_borrador` |
| Los dos pasos aprobados; el paquete no, o no en sus últimas versiones | `textos_aprobados` |
| `package_approved` coincide con todas las últimas versiones | `aprobado` |

Si la portada vuelve a borrador con los textos ya escritos, el estado es `portada_borrador` y los textos se conservan,
con el aviso `titulo_cambiado` si cambia el título principal.

## Avisos calculados

| Aviso | Condición |
|---|---|
| `guion_cambiado` | la versión aprobada del guion no es el `draft_version` de alguna pieza vigente |
| `guion_sin_aprobar` | el guion no está en `guion_aprobado`; bloquea solo aprobar el paquete |
| `titulo_cambiado` | `main_title` de `miniaturas`, `descripcion` o `portada_short` distinto del título principal actual |
| `parte_fija_cambiada` | `fixedText` de la descripción vigente distinto de `channel_publish_settings.fixed_text` |
| `sin_fuentes` | la lista de hechos no da ningún enlace ni referencia |
| `pendientes_en_guion` | el guion se aprobó con afirmaciones por comprobar (`draft_approved_pending > 0`) |

## Relación con la 004 y la 005

`idea` y `script` no cambian de esquema. `IdeaView.script` gana `packageStatus` (o `null`), y `ScriptView` gana
`package: {id, status} | null`. Un paquete no bloquea ningún cambio de estado de la idea ni del guion y se conserva si
la idea sale de la cola o el guion vuelve a borrador.

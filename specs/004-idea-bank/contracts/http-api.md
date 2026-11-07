# Contrato: API HTTP del banco de ideas

**Feature**: `004-idea-bank` | Decisiones en [research.md](../research.md)

Las rutas nuevas son del servidor local. Los esquemas Zod van en `packages/core/src/api/ideas.ts`, se exportan desde
`@ytcreator/core/api` y los comparte la web.

## Reglas generales

Son las de la 003 ([http-api de la 003](../../003-channel-and-niche/contracts/http-api.md)):

- el guard local;
- códigos en vez de textos;
- fechas ISO;
- importes en céntimos;
- `ApiError` (`400 validacion`, `404 no_encontrado`, `409 conflicto`, `422 ia`);
- `estimateId` en las rutas de IA ([cost de la 003](../../003-channel-and-niche/contracts/cost.md)).

Además:

- Un canal sin perfil aprobado da `409 conflicto` con `fields: {profile: 'sin_perfil'}` en todas las rutas del banco
  (US1 AS5).
- Cambiar una idea pide su `revision`. Si no coincide, devuelve `409 conflicto` con la idea actual.
- Un fallo de la IA es un `200` con `{failure}`. Un fallo de YouTube queda en la medida (`status: 'fallida'`), nunca
  en un `5xx`.

## Banco

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/channels/:id/ideas` | — | `{ideas: IdeaView[], queue: string[], profileVersion, pendingBatch: IdeaBatchView \| null, runningJob: string \| null}`. `ideas` en orden de `position`, sin las archivadas. `IdeaView` lleva su última medida y `stale`, `fromOlderProfile` y `measuredOlderRevision` |
| `GET /api/channels/:id/ideas/archived` | — | `IdeaView[]` |
| `POST /api/channels/:id/ideas` | `{title, format, hook?, pillar?, notes?, query?, broadQuery?, queryEn?}` | `201 {idea, duplicateOf: string \| null}` (R15) |
| `PATCH /api/ideas/:id` | `{revision, title?, hook?, pillar?, format?, notes?, query?, broadQuery?, queryEn?, status?}` | `IdeaView`. `status` acepta `banco`, `elegida`, `hecha` y `archivada`: elegir pone la idea al final de la cola y salir de `elegida` la quita de la cola. Recuperar es `status: 'banco'` desde `archivada` |
| `PUT /api/channels/:id/ideas/order` | `{ids: string[]}` | `{ideas: IdeaView[]}`. Hacen falta todas las ideas no archivadas, sin repetir; si no, `400 validacion` |
| `PUT /api/channels/:id/ideas/queue` | `{ids: string[]}` | `{queue: string[]}`. Hacen falta todas las elegidas, sin repetir |
| `GET /api/channels/:id/ideas/export?format=md\|json` | — | Descarga con `Content-Disposition` ([data-model](../data-model.md#exportación-del-banco-json)) |

## IA

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/channels/:id/ideas/estimate` | `{use: 'ideas' \| 'otro_enfoque' \| 'busquedas_idea', ideaId?}` | `Estimate` de la 003. `otro_enfoque` y `busquedas_idea` piden `ideaId`; `otro_enfoque` solo admite una idea medida `quemado` o `competido` (`400 validacion`, `ideaId: 'sin_medida_quemada'`) |
| `POST /api/channels/:id/idea-batches` | `{estimateId, instructions?}` | `IdeaBatchView` (las candidatas pendientes, `removedRepeats`, `claimsTrimmed`) o `{failure}` |
| `POST /api/idea-batches/:id/decide` | `{keep: number[], discard: number[]}` | `{batch: IdeaBatchView, created: IdeaView[]}`. Las que se quedan entran al final del banco; un índice ya decidido da `409 conflicto` |
| `POST /api/ideas/:id/angles` | `{estimateId}` | `IdeaBatchView` de tipo `otro_enfoque` o `{failure}` |
| `POST /api/ideas/:id/queries` | `{estimateId, revision}` | `IdeaView` con `query`, `broadQuery` y `queryEn` escritos por la IA (sube la `revision`) o `{failure}` |

`pendingBatch` es la última tanda con candidatas sin decidir. La pantalla la vuelve a enseñar al volver, como la
propuesta guardada del perfil en la 003. Pedir una tanda nueva descarta las pendientes de la anterior.

## Medidas

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/channels/:id/idea-measures/estimate` | `{ideaIds: string[]}` | `{ideas: number, measurable: number, withoutEnglish: number, units: number \| null}`. `units` es `null` con yt-dlp y, con la Data API, 303 por idea con `queryEn` y 202 sin él (R2). Se calculan con `ideaMeasureUnits` a partir de `dataApi.searchUnits` y `otherUnits` de `thresholds.json` |
| `POST /api/channels/:id/idea-measures` | `{ideaIds: string[], fresh?: true}` | `202 {jobId}`. Las ideas sin `query` se saltan y lo dice el `progress`. Con un `medir_ideas` en curso para el canal, `409 conflicto` con su `jobId` |
| `GET /api/jobs/:id/events` | — | El de la 003: `progress`, `item` (`{ideaId, measure}`), `done`, `failed` |

Al reiniciar, un `medir_ideas` `en_curso` pasa a `interrumpido`, y `GET .../ideas` lo devuelve en `runningJob: null`
con las ideas que faltan sin medir. La pantalla ofrece «Seguir midiendo».

## Vistas

```text
IdeaView = {
  id, origin, batchId, sourceIdeaId, title, hook, pillar, format, notes,
  query, broadQuery, queryEn, status, position, queuePosition, revision, profileVersion,
  createdAt, updatedAt,
  measure: IdeaMeasureView | null,
  stale: boolean, fromOlderProfile: boolean, measuredOlderRevision: boolean
}
IdeaMeasureView = { id, ideaRevision, status, verdict, reason, figures, similarVideos, opportunity,
                    queries, failure, source, partial, thresholdsVersion, measuredAt }
IdeaBatchView = { id, kind, sourceIdeaId, candidates: (IdeaDraft & {index, why?, decision})[],
                  removedRepeats, claimsTrimmed, createdAt }
```

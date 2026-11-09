# Contrato: API HTTP del guion

**Feature**: `005-script-and-outline` | Esquemas Zod en `packages/core/src/api/scripts.ts`

Errores con el formato de `http/errors.ts`. Códigos propios: `en_curso` (409, hay un trabajo), `version_cambiada` (409,
R18), `sin_aprobar` (409, falta aprobar el paso anterior), `sin_internet` (409, la conexión no puede buscar).

## Lista y voz

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /channels/:id/scripts` | | `ScriptSummary[]` |
| `GET /channels/:id/scripts/export?format=md\|json` | | fichero con todos los guiones |
| `GET /channels/:id/script-settings` | | `{address, register, sample, wordsPerMinute, isDefault}` |
| `PUT /channels/:id/script-settings` | `{address, register, sample, wordsPerMinute}` | lo guardado |

## Un guion

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /ideas/:id/script` | | `ScriptView`, 201; si ya existe, 200 con el mismo. Exige idea elegida o guion previo |
| `GET /scripts/:id` | | `ScriptView` |
| `PATCH /scripts/:id` | `{baseUpdatedAt, targetSeconds?, notes?}` | `ScriptView`; 409 `version_cambiada` si otra pestaña guardó antes |
| `GET /scripts/:id/review` | | `{rules}`: el paquete de revisión versionado |
| `GET /scripts/:id/export?format=md\|json` | | fichero |

`ScriptView` lleva la idea, el estado, las últimas versiones de los tres tipos, los avisos, el último trabajo con su estado (también si ya acabó, para poder decir que falló al volver),
`webResearch` y los límites de duración.

## Versiones

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `PUT /scripts/:id/facts` | `{baseVersion, content}` | `ScriptView` con la versión nueva y los enlaces nuevos comprobados |
| `PUT /scripts/:id/outline` | `{baseVersion, content}` | `ScriptView` con la versión nueva |
| `PUT /scripts/:id/draft` | `{baseVersion, content}` | `ScriptView` con la versión nueva |
| `POST /scripts/:id/claims/:claimId` | `{baseVersion, action, text?}` | `confirmar` y `no_es_dato` dan una versión `marcas` (R10); `corregir`, `quitar_del_guion` y `aceptar_propuesta`, una versión `edicion` |
| `GET /scripts/:id/versions?kind=` | | lista: versión, origen, fecha |
| `GET /scripts/:id/versions/:kind/:version` | | versión completa y bloques cambiados frente a la actual |
| `POST /scripts/:id/versions/:kind/:version/restore` | `{baseVersion}` | versión nueva de origen `recuperada` |
| `POST /scripts/:id/outline/approve` | `{version}` | `ScriptView` |
| `POST /scripts/:id/draft/approve` | `{version, acknowledgedPending}` | `ScriptView`; 409 si `acknowledgedPending` no coincide |

## Con IA

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /scripts/:id/estimate` | `{use, blockId?}` | `Estimate` de la 003, con `searches`; `cents` es lo esperado y `maxCents` lo máximo; `blockedBy` y `run` comprueban el tope de salida del perfil |
| `POST /scripts/:id/generate` | `{use, estimateId, instructions?, blockId?}` | 202 `{jobId}` |
| `POST /scripts/:id/short-angles/:index/choose` | | 201 `{ideaId, scriptId}`. No llama a la IA: el guion queda en `sin_empezar` |

`use` es uno de los siete de [ai-uses.md](./ai-uses.md). El progreso va por el SSE de trabajos de la 003, y el resultado se
lee con `GET /scripts/:id` al terminar.

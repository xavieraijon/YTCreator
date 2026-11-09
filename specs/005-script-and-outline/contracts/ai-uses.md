# Contrato: usos de IA del guion

**Feature**: `005-script-and-outline` | Decisiones en [research.md](../research.md) R3 a R6 y R9

Siete usos nuevos en `AI_USES`, con prompt `v1` en `packages/knowledge/prompts/<uso>/v1.md`, su suma en `lock.json`,
salida Zod en `packages/core/src/script/outputs.ts` y perfil por proveedor.

## Reglas comunes

- Todos pasan por `ai-run.ts`: estimación, presupuesto, puerto y `ai_usage`.
- Una salida que no valida se repite una vez. En los usos con internet solo se repite el paso estructurado.
- `CLAIM_FIELDS` es `[]`: aquí una cifra sin fuente se marca, no se recorta (R9).
- Los usos de texto hablado (`guion`, `guion_short`, `bloque_guion`) llevan `writing/spoken.md`; los demás, `human.md`.
- `voice` es `{address, register, sample}`. `craft` es el paquete `script/craft.json`.

## Usos

| Uso | Modelo | Tiempo | Salida máx. | Internet |
|---|---|---|---|---|
| `investigacion` | Sonnet 5.5 | 300 s | 8.000 | 8 búsquedas, 10 lecturas |
| `escaleta` | Sonnet 5.5 | 120 s | 5.000 | no |
| `guion` | Sonnet 5.5 | 420 s | 22.000 | no |
| `guion_short` | Sonnet 5.5 | 90 s | 2.000 | no |
| `bloque_guion` | Sonnet 5.5 | 90 s | 3.000 | no |
| `comprobar_guion` | Sonnet 5.5 | 300 s | 8.000 | 8 búsquedas, 10 lecturas |
| `enfoques_short` | Sonnet 5.5 | 60 s | 1.500 | no |

En Claude Code, esfuerzo `medium`.

## Entradas y salidas

**`investigacion`**
- Entrada: `idea {title, hook, query, queryEn}`, `notes`, `language`, `reliable` (de `sources.json`), `instructions`.
- Salida: `{facts: {text, label, sources: {url, title}[], alternatives}[]}`, de 0 a 40. Una lista vacía es válida.
- El servidor añade `id`, `accessedAt` y `link`, y recalcula `label`.

**`escaleta`**
- Entrada: `idea`, `profile`, `notes`, `facts`, `targetSeconds`, `wordsPerMinute`, `craft`, `instructions`, `previous`.
- Salida: `{blocks: {type, title, purpose, question, reward, bridge, seconds}[]}`, con un `gancho` el primero, un `cierre` el
  último, un `contexto` y al menos dos `acto`.

**`guion`**
- Entrada: `outline` (con `id`), `idea`, `profile`, `voice`, `notes`, `facts`, `targetSeconds`, `wordsPerMinute`, `craft`,
  `instructions`.
- Salida: `{blocks: {outlineBlockId, text, visual}[], claims: {outlineBlockId, text, factId}[]}`. Debe tener los mismos
  bloques que la escaleta, o no valida.

**`guion_short`**
- Entrada: como `guion`, sin `outline`, con `angle` si sale de un vídeo largo.
- Salida: `{blocks: {type: gancho|desarrollo|cierre, text, visual}[], claims: {type, text, factId}[]}`, exactamente tres, en
  ese orden y sin pasar del máximo de `shorts.json` al ritmo del canal.

**`bloque_guion`**
- Entrada: `block`, `previousText`, `nextText`, `voice`, `notes`, `facts`, `targetSeconds` del bloque, `instructions`.
- Salida: `{text, visual, claims: {text, factId}[]}`.

**`comprobar_guion`**
- Entrada: `claims: {id, text, context}[]` pendientes, `facts`, `language`, `reliable`.
- Salida: `{checks: {claimId, verdict, sources: {url, title}[], proposal}[]}`. Cada `claimId` debe existir.

**`enfoques_short`**
- Entrada: `blocks` del guion aprobado, `idea`, `profile`, `craft`.
- Salida: `{angles: {title, hook, blockId, why}[]}`, de 2 a 3, con `blockId` existente.

## Puerto

```text
AiCapabilities + webResearch: boolean
AiRequest      + web?: { maxSearches: number; maxFetches: number }
AiUsage        + webSearches?: number
AiResult ok    + seenUrls?: string[]
```

La batería de contrato de los adaptadores añade:
- un adaptador sin `webResearch` responde `no_disponible` si recibe `web`;
- con `web`, la salida valida contra el esquema y `usage.webSearches` llega informado cuando se cobra;
- un adaptador con `seenUrls` no incluye direcciones que no vio.

El proveedor falso declara `webResearch: true`, salvo en el escenario `sin_web`. Los tests no buscan de verdad.

# Contrato: uso de IA de los subtítulos

**Feature**: `007-subtitles` | Decisiones en [research.md](../research.md) R11

Un uso nuevo en `AI_USES`, `revision_subtitulos`, con prompt `v1` en
`packages/knowledge/prompts/revision_subtitulos/v1.md`, su suma en `lock.json`, salida Zod en
`packages/core/src/subtitles/review.ts` y perfil por proveedor. No busca en internet.

## Reglas

- Pasa por `ai-run.ts`: estimación, presupuesto, puerto y `ai_usage`. Las tandas de un mismo vídeo se estiman juntas y
  cada una registra su uso.
- Una salida que no valida se repite una vez; si vuelve a fallar, el trabajo falla con un error amable y no se aplica
  nada de esa tanda.
- No lleva `writing/human.md`: no escribe texto nuevo, solo corrige cómo está escrito.

## Uso

| Uso | Modelo | Tiempo | Salida máx. |
|---|---|---|---|
| `revision_subtitulos` | Sonnet 5.5 | 120 s por tanda | 6.000 |

**Entrada**: `{ cues: [{id, text}] (≤ 200), script: {blocks: [{id, text}]}, glossary: string[] }`. Sin tiempos.

**Salida**: `{ changes: [{ id, text, reason }] }`, con `reason` de hasta 120 caracteres en español llano («falta el punto
final», «nombre propio con mayúscula»).

**Rechazos** (la salida no valida):

- un `id` que no está en la tanda, o repetido;
- un `text` vacío o igual al que había;
- un cambio con más de un 30 % de distancia de edición respecto al texto que había;
- una palabra nueva que no estaba en el texto ni en el guion (salvo cambios de mayúsculas, tildes o signos);
- un `text` que pasa de 2 líneas (1 en un Short).

## Escenarios del proveedor falso

`ok` (dos cambios de puntuación y uno de mayúscula), `reescribe` (un cambio que se rechaza por distancia), `id_inventado`
y los cinco fallos tipados de la constitución.

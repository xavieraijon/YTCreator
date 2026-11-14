# Contrato: usos de IA del paquete de publicación

**Feature**: `006-publishing-package` | Decisiones en [research.md](../research.md) R3, R4, R7 a R10

Cinco usos nuevos en `AI_USES`, con prompt `v1` en `packages/knowledge/prompts/<uso>/v1.md`, su suma en `lock.json`,
salida Zod en `packages/core/src/publish/outputs.ts` y perfil por proveedor. Ninguno busca en internet.

## Reglas comunes

- Todos pasan por `ai-run.ts`: estimación, presupuesto, puerto y `ai_usage`.
- Una salida que no valida se repite una vez.
- Ninguna salida puede llevar direcciones web (`http`, `www.`): no valida (R4).
- Todos llevan `writing/human.md` y `publish/craft.json`; los límites de `publish/youtube.json` van en la entrada.
- `draft` es el guion aprobado: `{blocks: {id, type, title, text}[]}`.
- `measured` es lo medido en la 004 o `null`: `{query, verdict, similarTitles: string[] (≤ 10), measuredAt}` (R7).

## Usos

| Uso | Modelo | Tiempo | Salida máx. |
|---|---|---|---|
| `titulos` | Sonnet 5.5 | 90 s | 1.500 |
| `miniaturas` | Sonnet 5.5 | 90 s | 2.000 |
| `descripcion` | Sonnet 5.5 | 120 s | 4.000 |
| `parte_paquete` | Sonnet 5.5 | 90 s | 2.500 |
| `paquete_short` | Sonnet 5.5 | 90 s | 2.500 |

En Claude Code, esfuerzo `medium`.

## Entradas y salidas

**`titulos`**
- Entrada: `idea {title, hook, format}`, `draft`, `profile`, `measured`, `limits`, `instructions`, `previous` (los
  candidatos que ya se ven, para no repetirlos).
- Salida: `{titles: {text, why, blockId}[]}`, de 5 a 8 (un Short: de 3 a 5). Cada `blockId` debe existir en `draft` y
  cada `text` caber en el máximo de YouTube.

**`miniaturas`**
- Entrada: `mainTitle`, `alternatives`, `idea`, `draft` (solo gancho y cierre), `profile` (presencia en cámara),
  `instructions`, `previous`.
- Salida: `{concepts: {scene, bigText, emotion, composition, colors, titleIndex}[]}`, exactamente 3. `titleIndex` es 0
  (principal), 1 o 2.

**`descripcion`**
- Entrada: `mainTitle`, `idea`, `draft`, `profile`, `measured`, `limits`, `instructions`.
- Salida: `{firstLines, body, chapters: {title, blockIds}[], tags: string[], comment}`, sin hashtags (solo los
  Shorts los llevan). Los
  `blockIds` deben existir, ir en orden y cubrir todos los bloques sin repetir ninguno. Los minutos y las fuentes no
  vienen de aquí (R3, R4).

**`parte_paquete`**
- Entrada: `part` (`descripcion` \| `capitulos` \| `etiquetas` \| `comentario` \| `portada_short`), la versión actual
  de esa parte, `mainTitle`, `idea`, `draft`, `profile`, `measured`, `limits`, `parentTitle` (en un Short sacado de un
  vídeo largo; si no, `null`; desde `v2`), `instructions`.
- Salida: el esquema de esa parte en `descripcion` o en `paquete_short` (para `portada_short`). En `descripcion`, solo
  `firstLines`, `body` y, en un Short, `hashtags`; la parte fija no se toca.

**`paquete_short`**
- Entrada: `idea`, `draft` (tres tramos), `profile`, `measured`, `limits`, `parentTitle` (o `null`), `instructions`.
- Salida: `{titles: {text, why, blockId}[] (3-5), firstLines, body, hashtags (0-3), tags, comment,
  cover: {blockId, moment, screenText}}`.

## Batería de contrato

Los usos no añaden capacidades al puerto. La batería de los adaptadores añade casos grabados con el proveedor falso: una
salida con una dirección web no valida y se repite una vez; un `blockId` que no existe no valida.

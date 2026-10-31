# Contrato: usos de IA

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R7–R10

Seis usos nuevos detrás del puerto `AiProvider` de la 002. El dominio pide un uso; nunca escribe prompts ni elige
modelo.

## Reglas generales

- `AI_USES` añade: `preguntas`, `nichos`, `conceptos`, `nombres`, `perfil_actual`, `posicionamiento`.
- `AiRequest` gana `input?: Record<string, unknown>`, que el proveedor envía como JSON dentro de un bloque `<datos>`
  separado de las instrucciones. Todo lo que el creador escribe va en `input`, nunca concatenado al prompt.
- Prompts en `packages/ai/prompts/<uso>.v1.md` con cabecera `id`, `version`, `use`; una prueba comprueba que el hash
  de cada prompt coincide con el registrado (cambiar un prompt obliga a subir `version`). Todos incluyen
  `writing/human.md` (reglas de escritura: sin jerga, frases cortas, tuteo).
- Cada salida se valida con su esquema Zod. Si no pasa: un reintento con el error de validación; si vuelve a fallar,
  fallo `respuesta_invalida` y la pantalla ofrece «Volver a intentarlo».
- **Validador de cifras** (R8): toda cifra de la salida debe aparecer en `input` (con tolerancia de redondeo) y toda
  afirmación sobre la lectura de un canal debe citar un `videoId` de `input`. Si no: un reintento; después se quitan
  las frases que no pasan y la propuesta queda con `claimsTrimmed = true`, que la pantalla explica.
- Cada llamada pasa antes por el presupuesto ([cost](./cost.md)) y deja una fila en `ai_usage`.
- Regenerar acepta `instructions` (0–500 caracteres) y la propuesta anterior como contexto.

## Usos

| Uso | Modelo | Tiempo máx. | Entrada (`input`) | Salida |
|---|---|---|---|---|
| `preguntas` | Haiku 5.5 | 60 s | `interests` | 0–3 `{id, question, why}` (FR-005) |
| `nichos` | Sonnet 5.5 | 120 s | `interests`, `answers` | 3–5 `{label, summary, queries[1..3], whyItFits}` |
| `conceptos` | Sonnet 5.5 | 120 s | nicho, medida, referencias, `hoursPerWeek`, `onCamera`, `audienceRegion`, fragmentos de conocimiento (`ypp`, `rpm`, `made-for-kids`, `inauthentic`, `shorts`) | 2–3 `Concept` (forma de `ChannelProfile.concept`) |
| `nombres` | Haiku 5.5 | 60 s | concepto elegido, nombres ya descartados | 6–8 `{displayName, handle, why}` |
| `perfil_actual` | Sonnet 5.5 | 120 s | lectura del canal (`summary` + vídeos) | `{niche, pillars, audience, works[], doesNotWork[]}`; cada punto con `videoIds[]` |
| `posicionamiento` | Sonnet 5.5 | 120 s | perfil actual, lectura, conocimiento | `Concept` + `changes[]` `{what, why, videoIds[]}` |

Reglas de forma (además del esquema):

- `handle`: 3–30 caracteres `[A-Za-z0-9._-]`, sin `@`.
- `Concept.pillars`: 3–4; `promise` ≤ 160 caracteres.
- `monetization`: la IA solo escribe `assumptions`; los rangos los calcula el dominio con `rpm.json` y `ypp.json`.
- `warnings`: la IA puede proponerlas, pero `infantil` lo decide también una regla del dominio sobre el público.

## Fallos

Los de la 002 (`sin_sesion`, `cupo_agotado`, `tiempo_agotado`, `contenido_filtrado`, `no_disponible`) más
`respuesta_invalida` y `limite_de_gasto`. Todos devuelven `200` con el estado nuevo ([http-api](./http-api.md)).

## Pruebas

Proveedor `fake` con respuestas grabadas por uso: válida, inválida-luego-válida, inválida dos veces, cifra inventada,
afirmación sin `videoId`. Pruebas de los esquemas y del validador de cifras sin red.

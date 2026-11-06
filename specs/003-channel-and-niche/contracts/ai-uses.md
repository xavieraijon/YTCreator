# Contrato: usos de IA

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R7–R10

Ocho usos nuevos detrás del puerto `AiProvider` de la 002 (`recomendacion` llegó en la fase 3 y `perfil_parte` con US5, entrada 115). El dominio pide un uso; nunca escribe prompts ni elige
modelo.

## Reglas generales

- `AI_USES` añade: `preguntas`, `nichos`, `recomendacion`, `conceptos`, `nombres`, `lectura_canal`, `posicionamiento` y
  `perfil_parte`. `perfil_parte` se pide desde el perfil (`POST /api/channels/:id/profile/estimate`); la estimación de un
  recorrido no lo admite.
- `AiRequest` gana `input?: Record<string, unknown>`, que el proveedor envía como JSON dentro de un bloque `<datos>`
  separado de las instrucciones. Todo lo que el creador escribe va en `input`, nunca concatenado al prompt.
- Prompts en `packages/knowledge/prompts/<uso>/v1.md` con cabecera `id`, `version`, `use`; una prueba comprueba que el hash
  de cada prompt coincide con el registrado (cambiar un prompt obliga a subir `version`). Todos incluyen
  `writing/human.md` (reglas de escritura: sin jerga, frases cortas, tuteo).
- Cada salida se valida con su esquema Zod. Si no pasa: un reintento con el error de validación; si vuelve a fallar,
  fallo `respuesta_invalida` y la pantalla ofrece «Volver a intentarlo».
- **Validador de cifras** (R8): toda cifra de la salida debe aparecer en `input` (con tolerancia de redondeo) y toda
  afirmación sobre la lectura de un canal debe citar un `videoId` de `input`. Si no: un reintento; después se quitan
  las frases que no pasan y la propuesta queda con `claimsTrimmed = true`, que la pantalla explica siempre: también en
  las preguntas y en la opinión. Un elemento de una lista que se queda sin un texto se quita entero. Un concepto que se
  queda sin ningún supuesto se quita igual, y la IA no puede escribir uno sin supuestos: esa salida no pasa el esquema
  (FR-014). El creador sí puede borrarlos al editar. Si lo que queda no cumple su esquema, el fallo es
  `respuesta_invalida`, y el gasto se registra.
- Cada llamada pasa antes por el presupuesto ([cost](./cost.md)) y deja una fila en `ai_usage`.
- Regenerar acepta `instructions` (0–500 caracteres) y la propuesta anterior como contexto.

## Usos

| Uso | Modelo | Tiempo máx. | Entrada (`input`) | Salida |
|---|---|---|---|---|
| `preguntas` | Haiku 5.5 | 60 s | `interests` | 0–3 `{id, question, why}` (FR-005) |
| `nichos` | Sonnet 5.5 | 120 s | `interests`, `answers` | 3–5 `{label, summary, queries[1..3], whyItFits}` |
| `recomendacion` | Sonnet 5.5 | 120 s | `interests`, `answers`, nichos con sus cifras medidas | `{recommendedLabel, why, cautions[]}` `{label, why}`: opinión marcada como IA, a petición y con su coste (FR-010, US1 AS4) |
| `conceptos` | Sonnet 5.5 | 120 s | nicho, medida, referencias, `hoursPerWeek`, `onCamera`, `audienceRegion`, fragmentos de conocimiento (`ypp`, `rpm`, `made-for-kids`, `inauthentic`, `shorts`) | 2–3 `Concept` (forma de `ChannelProfile.concept`) |
| `nombres` | Haiku 5.5 | 60 s | concepto elegido, nombres ya descartados | 6–8 `{displayName, handle, why}` |
| `lectura_canal` | Sonnet 5.5 | 120 s | lectura del canal (`summary` + vídeos con sus veces lo normal) | `{niche, pillars, audience, works[], doesNotWork[]}`; cada punto con `videoIds[]` |
| `posicionamiento` | Sonnet 5.5 | 120 s | perfil actual, lectura, respuestas de ritmo, conocimiento | `Concept` + `changes[]` `{what, why, videoIds[]}`, con al menos un vídeo en cada cambio. Al editar, los supuestos se pueden borrar; los euros al mes salen de sus propios vídeos (decisions.md, entrada 73) |
| `perfil_parte` | Sonnet 5.5 | 120 s | `part`, el perfil guardado sin dinero ni cifras (nicho, promesa, temas, público, formato, ritmo), `currentProfile` si el canal ya existía, `instructions` | `{promise, pillars, audienceDescription}`; el dominio se queda solo con la parte pedida (entradas 115 y 119) |

Reglas de forma (además del esquema):

- `handle`: 3–30 caracteres `[A-Za-z0-9._-]`, sin `@`.
- `Concept.pillars`: 3–4; `promise` ≤ 160 caracteres.
- `audience.region`: la manda la respuesta del recorrido, no la IA; un concepto la sigue salvo que el creador le haya
  puesto otra a mano (`regionByHand`, guardado junto al concepto).
- `measure` y `niches`: sin `recentVideos` si la medida se leyó con yt-dlp, porque esa cifra sale de fechas parciales.
- `previous`, al pedir otra propuesta: sin `figures`, y no sirve de fuente al validar las cifras de la respuesta.
- `AiResult`: amplía el contrato de la 002 con `usage` opcional en el fallo, para que el gasto de una respuesta inválida
  se registre.
- `monetization`: la IA solo escribe `category` (la categoría de `rpm.json`) y `assumptions`; los rangos los calcula el dominio con `rpm.json` y `ypp.json`, y se guardan aparte en `figures` junto con los avisos. Al editar un concepto, `figures` se descarta y se recalcula.
- `warnings`: la IA puede proponerlas, pero `infantil` lo decide también una regla del dominio sobre el público.

## Fallos

Los de la 002 (`sin_sesion`, `cupo_agotado`, `tiempo_agotado`, `contenido_filtrado`, `no_disponible`) más
`respuesta_invalida` y `limite_de_gasto`. Todos devuelven `200` con el estado nuevo ([http-api](./http-api.md)).

## Pruebas

Proveedor `fake` con respuestas grabadas por uso: válida, inválida-luego-válida, inválida dos veces, cifra inventada,
afirmación sin `videoId`. Pruebas de los esquemas y del validador de cifras sin red.

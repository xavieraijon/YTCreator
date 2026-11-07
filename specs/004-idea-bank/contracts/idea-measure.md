# Contrato: medida de una idea («¿Tiene hueco?»)

**Feature**: `004-idea-bank` | Decisiones en [research.md](../research.md) R1–R5 y R12

## Flujo

1. El creador pulsa «¿Tiene hueco?» en una idea o «Medir todas». Con «Medir todas», antes se dice cuántas ideas se
   medirán y, con la Data API, cuántas unidades se gastarán (`idea-measures/estimate`).
2. El servidor crea un `medir_ideas` y mide las ideas una tras otra. Por cada idea hace a la vez, por el puerto
   `YouTubeData`, estas búsquedas:
   - `search(query, {limit: 40})`, con fechas;
   - `search(broadQuery, {limit: 20, withoutDates})`;
   - `search(queryEn, {limit: 40, withoutDates})`, si hay `queryEn`.
3. Con los resultados calcula las cifras (`ideaFigures`), el semáforo (`ideaVerdict`) y la oportunidad
   (`englishOpportunity`), que son funciones puras de `packages/core/src/ideas/`, y guarda la `idea_measure`.
4. Emite un `item` por SSE con la medida y pasa a la siguiente.

## Cifras

- **Ajuste por formato:** con una idea `short` solo cuentan los vídeos de 180 s o menos (`SHORT_MAX_SECONDS`); con una
  `largo`, los de más.
- `similar`: vídeos de la búsqueda en castellano cuyo título casi iguala a `query` (R1).
- `dated`, `recent`: de los primeros `datedSample` (12) casi iguales, cuántos tienen fecha y cuántos son de los últimos
  `recentDays` (90).
- `medianViews`, `maxViews`: de los casi iguales con visitas conocidas.
- `broadTopViews`, `broadBigVideos`: visitas del vídeo más visto del tema general, y cuántos tienen
  `audienceViews` (100.000) o más.
- `hasAudience`: `broadBigVideos ≥ audienceVideos (2)` o `maxViews ≥ audienceViews`.
- `partial`: falta la fecha en más de la mitad de la muestra, o el puerto devolvió `partial`.

## Fallos

| Lo que pasa | Resultado |
|---|---|
| La búsqueda en castellano da `sin_datos` (lista vacía) | `similar = 0`. El semáforo se calcula: `frio` si el tema no tiene público y `hueco` si lo tiene |
| La búsqueda del tema general da `sin_datos` | `hasAudience` solo mira `maxViews` |
| La búsqueda en inglés falla con cualquier código | Se mide sin oportunidad, y `opportunity` lleva `{failure}` |
| Castellano o tema general fallan con `bloqueado`, `cupo_agotado`, `tiempo_agotado`, `no_disponible` o `no_encontrado` | `status: 'fallida'` con `failure`. La pantalla usa el texto y la acción de `youtube-failures.es.ts` |
| La idea no tiene `query` | No se mide, y el `progress` la cuenta como saltada |

`no_disponible` nunca se lee como «sin resultados» (entrada 153 de la 003).

## Textos del semáforo

La pantalla traduce `verdict` y `reason` con las cifras ([ui-screens](./ui-screens.md)):

| `reason` | Semáforo | Frase |
|---|---|---|
| `racha_reciente` | quemado | «Ya hay {n} vídeos casi iguales y {r} son de los últimos {d} días: ahora mismo lo está contando mucha gente.» |
| `agotado` | quemado | «Ya hay {n} vídeos casi iguales y casi nadie los ve (unas {v} visitas cada uno): está agotado.» |
| `muchos_con_visitas` | competido | «Ya hay {n} vídeos casi iguales, pero se ven: solo merece la pena con un enfoque claramente distinto.» |
| `llenandose` | competido | «Hay {n} vídeos casi iguales y {r} son recientes: se está llenando, hace falta un enfoque propio.» |
| `pocos_con_publico` | hueco | «Solo hay {n} vídeos casi iguales y el tema tiene público: hay hueco.» |
| `pocos_sin_publico` | frio | «Solo hay {n} vídeos casi iguales, pero tampoco se ve público para el tema: puede ser muy de nicho.» |
| `sin_racha_con_publico` | hueco | «Hay {n} vídeos casi iguales, pero ninguno reciente, y el tema tiene público: hay sitio.» |
| `sin_racha_sin_publico` | frio | «Hay {n} vídeos casi iguales, ninguno reciente, y no se ve mucho público.» |

Junto a todos, el sello del supuesto: «Los límites de este semáforo son un supuesto nuestro, sin un estudio que los
respalde.» La oportunidad dice: «En inglés este tema tiene vídeos con más de 100.000 visitas y en castellano casi
nadie lo cuenta: puede ser una oportunidad.»

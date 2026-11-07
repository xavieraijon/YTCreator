# Research: Banco de ideas con detección de temas quemados

Decisiones técnicas de la 004. Cada una dice qué se eligió, por qué y qué se descartó. Parten del código de la 003 (puerto
`YouTubeData`, `ai-run.ts`, presupuesto, `background_job`) y del concepto de `herramientas/saturacion.py` del proyecto
de referencia, solo como idea.

## R1. Qué es un «vídeo casi igual»

- **Decisión:** se normaliza el dato concreto de la idea con `normalizeName` de la 003 (sin tildes, minúsculas, solo
  letras y números) y se quitan las palabras vacías de una lista fija en español e inglés. Un vídeo es **casi igual**
  si su título normalizado contiene al menos el 75 % de esas palabras clave (redondeando hacia arriba), y como mínimo
  2. Con una sola palabra clave, basta con que esté.
- **Por qué:** es la regla del proyecto de referencia («casi todas las palabras clave»), es una función pura que se
  prueba sin red y no hace falta IA para contar, así que ninguna cifra sale de la IA (principio V).
- **Descartado:** pedir a la IA que juzgue si un título es parecido. Costaría dinero en cada medida y convertiría la
  cifra en opinión. También se descartó comparar por distancia de edición, que falla con títulos largos.
- **Supuesto:** el 75 % no tiene fuente. Va en `thresholds.json` con los demás umbrales (R4).

## R2. Qué se busca en cada medida

- **Decisión:** tres búsquedas por idea, a la vez, con el máximo de 3 procesos yt-dlp de la 003:
  1. el **dato concreto en castellano**, con `SEARCH_LIMIT` (40) y fechas (`withFeedDates`);
  2. el **tema general** (`broadQuery`), con 20 resultados y sin fechas;
  3. el **dato concreto en inglés** (`queryEn`), con 40 resultados y sin fechas.
- **Por qué:** con la primera se cuentan los casi iguales, cuántos son recientes y cuánto se ven. La segunda dice si
  el tema tiene público. La tercera da la señal de oportunidad que pidió el creador.
- **Cuota con la Data API:** cada búsqueda cuesta 100 unidades más 1 de `videos.list`, unas **303 por idea**. Se dice
  antes de «Medir todas» (FR-007c). Con yt-dlp no hay cuota.
- **Caché:** la de 24 h por consulta de la 003 (`yt_cache`). «Volver a medir» la salta (`fresh`), como en la 003.
- **Descartado:** abrir cada vídeo para sacar su fecha (unos 2 s por vídeo en el proyecto de referencia). Se usan las
  fechas del RSS de cada canal, que ya da la 003. Los vídeos sin fecha no cuentan como recientes, y la medida se marca
  como `partial` si faltan muchas.

## R3. El semáforo

Función pura `ideaVerdict(figures, thresholds)` en `packages/core/src/ideas/verdict.ts`. Las cifras de entrada son:

- `similar`: los casi iguales en castellano;
- `recent`: cuántos de los 12 primeros casi iguales con fecha son de los últimos 90 días;
- `medianViews`: la mediana de visitas de los casi iguales;
- `hasAudience`: si el tema tiene público.

`hasAudience` es verdadero si hay al menos 2 vídeos del tema general con 100.000 visitas o más, o algún casi igual con
100.000 o más.

| Semáforo | Regla, en orden |
|---|---|
| `quemado` | `similar ≥ 12` y `recent ≥ 4` (se está contando ahora mismo) |
| `quemado` | `similar ≥ 12` y `medianViews < 1.000` (está agotado) |
| `competido` | `similar ≥ 12` (se ve, pero hace falta un enfoque claramente distinto) |
| `hueco` / `frio` | `similar ≤ 5`: `hueco` con público y `frio` sin él |
| `competido` | entre 6 y 11, con `recent ≥ 4` (se está llenando) |
| `hueco` / `frio` | entre 6 y 11, sin ráfaga: `hueco` con público y `frio` sin él |

Cada resultado lleva un `reason` (código) que la pantalla traduce a una frase en llano, con las cifras dentro. Así no
hay textos en el dominio, igual que en `verdict.ts` de la 003.

- **Descartado:** puntuar de 0 a 100. Un número sin fuente parece más exacto de lo que es (principio V).

## R4. Umbrales y su fuente

- **Decisión:** un bloque `ideas` en `packages/knowledge/market/thresholds.json` (versión 5), con estos valores:
  `searchResults: 40`, `broadResults: 20`, `similarHigh: 12`, `similarLow: 5`, `recentDays: 90`, `recentBurst: 4`,
  `datedSample: 12`, `deadMedianViews: 1000`, `audienceViews: 100000`, `audienceVideos: 2`, `keywordShare: 0.75`,
  `staleDays: 30` y `opportunity` (R5). El bloque lleva su propia fuente: «Supuesto de YTCreator, sin estudio que lo
  respalde (primera versión del proyecto de referencia, 2026-09-27)». La pantalla lo dice con el `DataSource` de la
  003, en la variante de supuesto que se usa con las visitas de un canal que empieza (entrada 151 de la 003).
- **Por qué:** el principio V exige conocimiento versionado, con fuente y fecha, y que un supuesto se vea como tal.
- **Descartado:** dejarlos en el código, porque no se verían ni se podrían revisar.

## R5. La oportunidad en inglés

- **Decisión:** hay **oportunidad** si en inglés el dato concreto tiene al menos 2 vídeos con 100.000 visitas o más y
  en castellano hay 5 casi iguales o menos. Es un aviso aparte que **no cambia el semáforo**. La medida guarda los
  5 vídeos en inglés con más visitas para enseñarlos.
- **Por qué:** es la señal del proyecto de referencia («mucho en inglés y poco en castellano»). Va aparte para no
  mezclar dos supuestos en un solo color.
- **Sin `queryEn`:** la medida se hace solo en castellano y dice que falta la parte en inglés (caso límite de la spec).

## R6. Las búsquedas de cada idea

- **Decisión:** cada idea guarda tres textos de búsqueda: `query` (el dato concreto, en castellano), `broadQuery` (el
  tema general) y `queryEn`. La IA los escribe al proponer la idea (uso `ideas`) o la variante (uso `otro_enfoque`).
  Para una idea propia, el creador los escribe en «Modo experto», o pulsa «Preparar la medida», que llama al uso
  `busquedas_idea`: barato, con su estimación y sin cifras.
- **Por qué:** la medida no puede depender de la IA en el momento de medir, porque medir es gratis y el creador lo
  lanza cuando quiere. Las búsquedas son datos de la idea, editables y visibles.
- **Sin `query`:** una idea propia sin búsquedas no se puede medir. El botón «¿Tiene hueco?» lleva primero a «Preparar
  la medida», y antes se puede usar el título de trabajo como `query` (`broadQuery` = pilar del perfil) si el creador
  lo elige: «Medir con el título».

## R7. Usos de IA nuevos

Tres usos en `AI_USES`, cada uno con perfil por proveedor, prompt `v1` en `packages/knowledge/prompts/` y salida Zod en
`packages/core/src/ideas/outputs.ts`:

| Uso | Entrada (`AiRequest.input`) | Salida |
|---|---|---|
| `ideas` | perfil del canal actual (nicho, promesa, pilares, público, formato, ritmo), títulos que no se pueden repetir (R9), indicaciones | 6–10 ideas: `title`, `hook`, `pillar`, `format` (`largo` o `short`), `query`, `broadQuery`, `queryEn` |
| `otro_enfoque` | la idea, su medida (semáforo y los títulos de los casi iguales), el perfil | 2–3 variantes con los mismos campos y `why` (opinión) |
| `busquedas_idea` | título, gancho, pilar y perfil | `query`, `broadQuery`, `queryEn` |

- Reintento reservado de una salida inválida (principio IV, entrada 152 de la 003): el presupuesto cuenta dos llamadas.
- `pillar` tiene que ser uno de los pilares del perfil. Si no lo es, la salida no valida y se repite.
- Las reglas de escritura humana (`writing/human.md`) van en los tres prompts.
- `claims.ts` de la 003 se aplica a `hook` y `why`: una cifra de mercado que no venga de los datos se quita, y la
  propuesta lo dice (`claimsTrimmed`).

## R8. Dónde se guardan las tandas

- **Decisión:** las tablas nuevas `idea_batch` y `idea` no usan `proposal`, porque `proposal` cuelga de un `journey` y
  el banco cuelga del **canal**. `idea_batch` guarda la salida de la IA, las indicaciones, el prompt, el `usage_id` y
  qué candidatas se quedaron (`kept`) o se descartaron. Una candidata que se queda se copia a `idea`.
- **Por qué:** un banco vive mucho más que un recorrido. Meterlo en `proposal` obligaría a un `journey` falso.
- **Descartado:** hacer `proposal.journey_id` opcional, porque es una migración de una tabla con datos del creador y
  rompe las rutas de la 003.

## R9. Que la IA no repita

- **Decisión:** el `input` del uso `ideas` lleva los títulos de trabajo y los datos concretos de todas las ideas del
  canal (en el banco, elegidas, hechas, archivadas) y de las candidatas descartadas, hasta 200. Si hay más, van las
  200 más recientes. Además, el servidor quita de la tanda las candidatas cuyo título normalizado o `query`
  normalizada ya existan, y lo dice («la IA repitió 2 ideas que ya tenías; las hemos quitado»).
- **Por qué:** el prompt evita casi todo, y la comprobación del servidor garantiza FR-004 sin pedir otra llamada.

## R10. Orden y cola

- **Decisión:**
  - `idea.position` es un entero, y reordenar envía la lista entera de ids visibles en el orden nuevo
    (`PUT .../ideas/order`).
  - La cola de elegidas tiene su propio `queue_position`, que solo tiene valor si el estado es `elegida`, y se reordena
    igual (`PUT .../ideas/queue`).
  - En la pantalla se reordena con «Subir» y «Bajar» (botones con nombre accesible, también con teclado), con los
    componentes de `@ytcreator/ui`.
- **Por qué:** sin dependencias nuevas (principio X), accesible por teclado (principio I) y sin estados intermedios
  en el servidor. La spec admite «arrastrando o con Subir y Bajar».
- **Descartado:** una librería de arrastrar y soltar, que es una dependencia nueva y obliga a un trabajo de
  accesibilidad propio. Va al backlog.

## R11. Versiones de una idea

- **Decisión:** igual que las propuestas de la 003 (entrada 156): la idea guarda `original` (lo que propuso la IA o
  escribió el creador) y los campos actuales, más un `revision` que sube con cada edición. Cada medida guarda la
  `idea_revision` medida. Si no coincide con la actual, la pantalla dice «medida de una versión anterior de la idea»
  (escenario 4 de US2).

## R12. Medir en segundo plano

- **Decisión:**
  - Un trabajo `medir_ideas` en `background_job`, con `channel_id` y la lista de ideas. Las ideas se miden una tras
    otra, y las tres búsquedas de cada una a la vez.
  - El progreso es `{done, total}` y cada idea terminada emite un `item` por SSE, como `medir_nichos`.
  - Al reiniciar, un trabajo `en_curso` pasa a `interrumpido` (lo hace la 003 en `jobs.ts`) y la pantalla ofrece
    «Seguir midiendo».
- **Migración:** `0005_idea_bank.sql` crea `idea_batch`, `idea` e `idea_measure`. Además rehace `background_job` para
  admitir el `kind` nuevo y la columna `channel_id`: crea la tabla nueva, copia, borra y renombra, dentro de una
  transacción. No se pierde ningún dato, y se prueba con una base de la 003 rellena.
- **Descartado:** reutilizar el `kind` `medir_nichos`, porque la pantalla y la recuperación tras reinicio lo
  confundirían.

## R13. Descargar el banco

- **Decisión:** «Descargar como documento» (`.md`) y «Descargar como datos» (`.json`), como el perfil de la 003
  (principio VII). El `.json` lleva `version: 1`, el canal, y las ideas con sus medidas, fuentes y fechas. El formato
  se documenta en `data-model.md`.

## R14. Pantalla y navegación

- **Decisión:**
  - Ruta nueva `/canal/ideas`. En la pantalla del canal, «Banco de ideas: próximamente» pasa a ser un enlace.
  - La pantalla tiene una acción principal: «Proponer ideas» si el banco está vacío, y «¿Tiene hueco?» en la primera
    idea sin medir si no lo está.
  - Las ideas son tarjetas (`Card`) con `Semaphore` y `DataSource` de la 001 y la 003. Los filtros son `Select`.
    «Archivadas» va plegado en un `Disclosure`.
  - Sin componentes nuevos del design system. Si hiciera falta uno, se para y se pregunta (riesgo alto).
- **Por qué:** se reutiliza lo aprobado, y el diseño se revisa en la pasada final con el modo Design, que el creador
  dejó para cuando termine el desarrollo.

## R15. Varias ideas iguales y perfil cambiado

- **Idea duplicada (escrita por el creador):** al guardar, el servidor responde `201` con `duplicateOf` si el título
  normalizado ya existe. La pantalla avisa y deja seguir. No es un error, porque el creador decide.
- **Perfil cambiado:** `idea.profile_version` se compara con la versión actual del perfil. Si es más antigua, la idea
  lleva el aviso «propuesta con una versión anterior de tu perfil».

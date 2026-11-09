# Research: Guion y escaleta

**Feature**: `005-script-and-outline` | **Date**: 2026-11-09

Cada entrada dice qué se decide, por qué y qué se descartó. Lo que cruza varias entradas está en
[data-model.md](./data-model.md) y en [contracts/](./contracts/).

## R1. Versiones: una foto completa por cambio, en una sola tabla

- **Decisión**: `script_version` guarda cada versión de la lista de hechos, la escaleta y el guion como JSON completo,
  numerada por tipo (`kind` + `version`). Nunca se actualiza una fila, salvo la excepción de R10.
- **Motivo**: el principio II exige volver a cualquier versión. Una foto de un guion de 30 minutos ronda los 30 kB: mil
  versiones son 30 MB. Recuperar es copiar una fila, y comparar es leer dos.
- **Descartado**: guardar diferencias (más código y más fallos, sin necesidad); el «original y última edición» de las
  ideas de la 004 (no cumple «cualquier versión»); una tabla por tipo (tres repos iguales).

## R2. El estado se calcula, no se guarda

- **Decisión**: `script` guarda qué versión está aprobada (`outline_approved_version`, `draft_approved_version`). El
  estado que ve el creador sale de una función pura de `core`: si la última versión del guion está aprobada, «guion
  aprobado»; si hay guion, «guion en borrador»; si la última escaleta está aprobada, «escaleta aprobada»; si no,
  «escaleta en borrador».
- **Motivo**: una columna de estado se puede desincronizar de las versiones. Crear una versión nueva deja de coincidir con
  la aprobada, así que «volver a borrador» (FR-017) sale solo.
- **Escaleta nueva con guion escrito**: el estado sigue siendo el del guion, y sale el aviso `escaleta_cambiada`. Para
  escribirlo de nuevo hay que aprobar antes la escaleta nueva.

## R3. Buscar en internet es una capacidad del puerto

- **Decisión**:
  - `AiCapabilities` gana `webResearch: boolean`.
  - `AiRequest` gana `web?: { maxSearches: number; maxFetches: number }`.
  - `AiUsage` gana `webSearches?: number`.
  - `AiResult` correcto gana `seenUrls?: string[]`: las direcciones que el proveedor vio de verdad, si las conoce.
  - Un adaptador sin la capacidad devuelve `no_disponible` si le llega `web`.
- **Motivo**: principio IV. El dominio pide «investiga con este límite» y cada adaptador sabe cómo hacerlo.
- **Descartado**: una herramienta de búsqueda propia con otro proveedor de búsquedas (dependencia y clave nuevas, y el
  creador ya paga una IA que busca).

## R4. API de Anthropic: dos pasos

- **Decisión**: con `web`, el adaptador hace dos llamadas:
  1. Con `web_search_20260209` y `web_fetch_20260209` (Sonnet 5.5), `max_uses` del pedido y `max_content_tokens: 8000`,
     sin formato de salida. Si la respuesta acaba en `pause_turn`, la reenvía sin cambios, hasta 3 veces.
  2. Sin herramientas, con `output_config.format`, le pasa el texto del primer paso y pide el JSON del esquema.
- **Motivo**: las citas de la búsqueda web están siempre activas y la documentación dice que la salida estructurada es
  incompatible con las citas (error 400). Pedir JSON dentro del texto citado obliga a recomponer bloques partidos.
- **Extra**: el primer paso devuelve las direcciones reales de los resultados y las citas, que se entregan en `seenUrls`.
- **Reintento**: la salida inválida repite solo el segundo paso. La búsqueda, que es lo caro, no se repite.
- **Errores**: un error de búsqueda llega con estado 200 dentro del bloque. Si ninguna búsqueda funcionó, el adaptador
  devuelve `no_disponible`. Un 400 de «búsqueda desactivada por la organización» también se traduce a `no_disponible`.
- **No verificado**: nada de esto se ha probado contra la API real (P1 de `decisions.md`).

## R5. Claude Code: una llamada con dos herramientas

- **Decisión**: `buildClaudeCommand` pasa `--tools WebSearch,WebFetch` y `--allowedTools WebSearch WebFetch` solo si la
  petición lleva `web`; en el resto de usos sigue `--tools ''`. El resto de banderas de aislamiento no cambia: entorno
  limpio, carpeta vacía, sin MCP y sin ajustes. Sigue con `--json-schema`.
- **Motivo**: esas dos herramientas no ejecutan órdenes ni leen ficheros, de modo que un texto malicioso de una página
  no puede tocar la máquina.
- **Límite**: la CLI no tiene `max_uses`. El límite va en la instrucción, y como la suscripción no cobra por búsqueda no
  hay riesgo de gasto.
- **Sin `seenUrls`**: la salida JSON no da los resultados de la búsqueda, y queda solo la comprobación de enlaces (R7).
- **No verificado**: que `--json-schema` conviva con las herramientas web se comprueba en la prueba real (P1). Si no
  convive, el adaptador usa dos pasos como en R4.

## R6. Coste de investigar

- **Decisión**: `pricing.json` pasa a la versión 2 con `webSearchUsdPer1000: 10` (precio publicado) y
  `webInputTokensPerSearch: 5000` y `webInputTokensPerFetch: 8000` (supuestos sin fuente, marcados). La estimación suma
  búsquedas y tokens de lectura **una sola vez**, y solo el paso estructurado se reserva por duplicado. El presupuesto
  cuenta el máximo de búsquedas y lecturas de la petición. `ai_usage` gana `web_searches` y el coste real incluye lo que
  informa el proveedor.
- **Límite**: las lecturas tienen tope (`max_content_tokens`), pero lo que devuelve una búsqueda no. Ese tramo es una
  estimación, y la pantalla lo dice (SC-005).
- **Orden de magnitud** (8 búsquedas, 6 lecturas, Sonnet 5.5): unos 0,30 €. Si no cabe en el límite por operación, el
  botón se apaga (Edge Case).
- **Suscripción**: 0 €, como el resto de usos.

## R7. Comprobar que un enlace abre

- **Decisión**: servicio `link-check` con `node:https`/`node:http` y una función `lookup` propia:
  - solo `http` y `https`, sin usuario ni contraseña en la dirección;
  - **rechaza direcciones no públicas** en dos sitios: antes de conectar, si la dirección ya es una IP (Node no llama a
    `lookup` en ese caso), y en el propio `lookup`, para que un cambio de DNS entre comprobar y conectar no sirva. Son
    no públicas: `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `::`, `::1`,
    `fc00::/7`, `fe80::/10` y las IPv6 que envuelven una IPv4 de esas;
  - sigue hasta 3 redirecciones, revisando cada una;
  - `GET` sin leer el cuerpo, 8 s de límite, 5 a la vez;
  - nunca escribe la dirección en los logs.
- **Tres resultados**: `abre` (2xx), `no_abre` (404, 410, DNS o conexión), `sin_comprobar` (401, 403, 429, 5xx, tiempo).
  Solo `abre` cuenta como respaldo (FR-004c, SC-010).
- **Coste de ser estricto**: una web que bloquea robots no cuenta aunque exista. El hecho baja de etiqueta y la pantalla
  dice que no se pudo comprobar. El creador puede añadir el hecho como suyo.
- **Descartado**: `fetch` global (no permite validar la dirección ya resuelta sin `undici` como dependencia directa).

## R8. La etiqueta la pone el dominio

- **Decisión**: la IA propone una etiqueta, pero `factLabel()` la recalcula tras comprobar los enlaces:
  - «comprobado» exige dos enlaces que abren, de **dominios distintos** y que no estén en la lista de no fiables;
  - con uno, «una sola fuente»; con ninguno, «leyenda o sin confirmar»;
  - la IA solo puede bajar la etiqueta, nunca subirla;
  - una dirección que no esté en `seenUrls`, cuando el proveedor la da, se descarta por inventada.
- **Motivo**: SC-010 no puede depender de lo que la IA diga de sí misma.

## R9. Marcas «por comprobar»

- **Decisión**: unión de dos fuentes:
  1. La salida de la IA incluye `claims[]`: fragmento exacto y `factId` o nulo.
  2. `detectClaims()`, función pura, busca en el texto generado números, porcentajes, años, fechas y nombres propios
     (mayúscula fuera de inicio de frase) que no estén en los apuntes, los hechos ni la idea.
- **Cifras en el guion**: el prompt pide cifras y fechas con dígitos. El creador lee su propio guion; la regla del
  proyecto de referencia de escribirlas en letra era para la voz sintética, que está fuera de la v1. El detector cubre
  también «mil», «millón» y «millones».
- **Lo que escribe el creador no se marca**: el texto a mano es suyo.
- **Validador de cifras de la 003**: los usos de esta feature van con `CLAIM_FIELDS: []`, porque aquí una cifra sin
  fuente se marca, no se recorta.
- **Límite conocido**: la detección de nombres es aproximada y no ve los que van al inicio de una frase; ahí depende de
  `claims[]`. SC-003 lo dice y se mide con casos grabados. Por eso una marca se puede descartar como «no es un dato».

## R10. Bloques con identidad y marcas sin inundar el historial

- **Decisión**: cada bloque lleva un `id` estable que asigna el servidor; la escaleta y el guion se corresponden por él, y
  regenerar un bloque copia los demás tal cual (SC-004).
- **Excepción a R1**: «Es correcto» y «No es un dato» no cambian el texto. Crean una versión de origen `marcas`, y las
  siguientes actualizan esa misma versión, para que 40 marcas sean una línea en el historial y no 40. La excepción solo
  vale si esa versión es la última y no está aprobada; si lo está, se crea una nueva y el guion vuelve a borrador.
- **Lo que cambia el texto nunca se agrupa**: corregir, quitar del guion y aceptar una propuesta crean una versión
  `edicion` propia (principio II).
- **Marca huérfana**: si el creador edita y el fragmento desaparece, la marca pasa a `quitada`.

## R11. Duración y salida esperada

- **Decisión**: `durationSeconds(texto, ppm) = palabras / ppm × 60`. La estimación de coste usa la salida esperada para
  la duración pedida (`palabras × 1,6 × 1,3` más 60 tokens por bloque), no el máximo del perfil. El perfil de `guion` tiene
  22.000 tokens de tope y 7 minutos, para un vídeo de 30 minutos con pensamiento incluido.
- **Motivo**: estimar por el tope haría parecer caro un vídeo de 5 minutos.
- **Presupuesto**: la pantalla enseña el coste esperado y `maxCents`, pero `blockedBy` y la comprobación de `run` usan
  siempre el tope del perfil, de modo que una respuesta más larga de lo esperado no pueda pasarse del límite (SC-005).

## R12. Trabajos en segundo plano sin rehacer tablas

- **Decisión**: se usa `background_job` con `kind = 'ia'` y `channel_id`, y `script.job_id` y `script.job_op` apuntan al
  trabajo. Un guion tiene un solo trabajo a la vez (409 `en_curso`), y mientras corre no admite cambios.
- **Motivo**: evita rehacer otra vez la tabla, que la migración 0005 ya tuvo que hacer.

## R13. Conocimiento versionado

- `packages/knowledge/script/craft.json`: estructura, gancho, retención y Shorts, con fuente y fecha; lo que no tenga
  fuente lleva `assumption: true`.
- `packages/knowledge/script/review.json`: muletillas, límites y tolerancias de la revisión.
- `packages/knowledge/script/sources.json`: qué es una fuente fiable y dominios no fiables.
- `packages/knowledge/writing/spoken.md`: reglas para escribir lo que se dice en voz alta. Sustituye a `human.md`, que
  se dirige al creador, en los usos de guion.
- Las fuentes se comprueban una a una al escribir los paquetes; la que no se pueda abrir no se cita.

## R14. Revisión sin IA

- **Decisión**: `reviewScript()`, función pura, con cinco reglas (duración, gancho largo, muletillas, frases largas y
  afirmaciones pendientes). Se calcula en el navegador con el paquete versionado que manda el servidor. No se guarda.
- **Motivo**: SC-006 (menos de 1 s) y FR-013 (sin IA).

## R15. Comparar versiones

- **Decisión**: por bloques (igual, cambiado, nuevo, quitado), enseñando el texto anterior y el actual uno bajo el otro.
- **Descartado**: diferencia palabra a palabra (dependencia o algoritmo propio; FR-020 pide «por bloques»).

## R16. Sacar un Short

- **Decisión**: la idea nueva usa `origin = 'otro_enfoque'` y `source_idea_id` con la idea larga, y queda en estado
  `banco`. `script.source_script_id` guarda el enlace entre guiones. La lista de hechos se copia como versión 1 de origen
  `heredada`. Los enfoques se guardan en `script.short_angles`: ya están pagados.
- **Motivo**: no hay que rehacer `idea` para admitir un origen nuevo.

## R17. Descargas

- **Decisión**: por guion (`.md` y `.json`) y de todos los guiones del canal. No se toca ninguna exportación existente.
- **Motivo**: la app no tiene una exportación general; tiene la del perfil y la del banco, y cambiar su formato es riesgo
  alto. Corrige FR-021 de la spec (decisión 4).

## R18. Dos pestañas

- **Decisión**: cada escritura envía `baseVersion`. Si no coincide con la última, responde 409 `version_cambiada` y la
  pantalla ofrece recargar sin perder lo escrito.

## R19. Interfaz

- **Decisión**: sin componentes nuevos en `@ytcreator/ui`. Las marcas del texto son un `<mark>` en el CSS Module de la
  pantalla, con tokens existentes. El orden de bloques usa «Subir» y «Bajar», como la cola de la 004, sin arrastrar.
- **Si hiciera falta un componente nuevo**: se para y se pregunta (riesgo alto).

## R20. Lo que llega de internet

- **Decisión**: la petición de investigación solo lleva la idea y los apuntes; nunca el perfil, claves ni datos de otros
  canales. El prompt declara que el contenido web es dato. La salida pasa por un esquema Zod y no ejecuta nada.
- **Riesgo residual**: la documentación avisa del riesgo de fuga con la lectura web. Por eso se limita lo que se envía, y
  se dice en pantalla que los apuntes se usan para buscar.

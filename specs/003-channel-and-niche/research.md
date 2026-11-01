# Research: Canal y nicho

**Feature**: `003-channel-and-niche` | **Fecha**: 2026-10-31

Decisiones técnicas que resuelven las incógnitas del plan: de dónde salen los datos de YouTube y cómo se piden sin
coste, cómo se calculan las medidas de mercado, cómo se integran los seis usos nuevos de IA en el puerto `AiProvider`,
cómo se estima el coste antes de cada llamada y cómo se guardan recorridos, propuestas y versiones del perfil. Los
umbrales de mercado vienen de los conceptos de CanalYT (`docs/mercado.md`, `herramientas/mercado.py`,
`herramientas/nombre_canal.py`), reescritos aquí sin copiar código.

---

## R1. Fuente de datos de YouTube

- **Decisión:** puerto `YouTubeData` en `packages/core/src/youtube/port.ts` con tres adaptadores en
  `packages/youtube`: `ytdlp` (por defecto, sin clave), `data-api` (opcional, con clave del creador) y `fake`
  (`YTCREATOR_FAKE_YOUTUBE=1`, para tests y e2e). El feed RSS público del canal
  (`https://www.youtube.com/feeds/videos.xml?channel_id=…`) complementa a yt-dlp para fechas exactas de los 15 vídeos
  más recientes. El registro elige Data API si hay clave guardada y válida; si no, yt-dlp.
- **Motivo:** FR-030 y FR-033 piden que lo básico funcione gratis y sin clave. yt-dlp lee datos públicos sin cuota;
  la Data API es más estable y rápida cuando el creador quiere darla. El puerto deja cambiar de fuente sin tocar las
  medidas (principio IV aplicado a datos).
- **Alternativas:** solo Data API (obliga a crear un proyecto en Google Cloud: rompe el test de novato); InnerTube a
  mano o `youtubei.js` (API interna sin contrato, se rompe sin aviso y no aporta frente a yt-dlp, que ya la mantiene una
  comunidad grande); scraping HTML propio (frágil y peor que yt-dlp).

## R2. Instalar yt-dlp

- **Decisión:** el instalador añade el paso 9: descarga el binario autónomo de yt-dlp de la release de GitHub fijada en
  `installer/versions.json` (versión y SHA256 por plataforma: `yt-dlp_macos`, `yt-dlp_linux`, `yt-dlp.exe`), verifica el
  hash y lo deja en `<datos de la app>/bin/`. Ajustes → YouTube ofrece «Actualizar el lector de YouTube», que repite la
  descarga con la versión fijada en la release de YTCreator en curso. Si el paso falla, la instalación sigue: la app
  marca la fuente como `no_disponible` y explica cómo reintentarlo.
- **Motivo:** el binario autónomo no necesita Python. Fijar versión y hash cumple el principio VII (nada sin
  verificar). YouTube cambia a menudo y yt-dlp se actualiza para seguirle, de ahí el botón de actualizar.
- **Alternativas:** `pip install yt-dlp` (exige Python, más pasos para el novato); `yt-dlp -U` sin hash (ejecuta lo
  último sin verificar); paquete npm envoltorio (añade una dependencia que solo descarga el mismo binario).

## R3. YouTube Data API opcional

- **Decisión:** adaptador con `fetch` nativo contra `https://www.googleapis.com/youtube/v3/` (`search.list`,
  `channels.list`, `videos.list`, `playlistItems.list`). La clave se guarda en el `SecretStore` de 002 (llavero del
  sistema o fichero `0600` fuera de la carpeta de trabajo); las respuestas HTTP solo devuelven `hint` (últimos 4
  caracteres). El adaptador cuenta las unidades gastadas en el día del Pacífico (`search.list` = 100, el resto = 1) en
  la tabla `yt_quota`; con el 80 % de 10.000 avisa y con el 100 % devuelve `cupo_agotado` y el registro cae a yt-dlp.
  La clave va en la cabecera `X-Goog-Api-Key`, nunca en la URL, para que no salga en logs de proxies.
- **Motivo:** FR-030 (avisar antes de agotar el límite) y FR-033. `fetch` basta para cuatro endpoints GET.
- **Alternativas:** `googleapis` (paquete enorme para cuatro llamadas); clave en `.env` (dentro de la carpeta de
  trabajo, prohibido por VII).

## R4. Tiempos, caché y clasificación de fallos

- **Decisión:** cada llamada a yt-dlp tiene un tope de 45 s (`AbortSignal.timeout`, mata el proceso); Data API, 15 s.
  Las respuestas se guardan en `yt_cache` con clave `fuente + consulta normalizada` y caducan a las 24 h; las
  comprobaciones de @ caducan a la hora. Los fallos son tipados: `sin_datos` (la búsqueda no devuelve nada),
  `bloqueado` (HTTP 429, «Sign in to confirm», captcha), `cupo_agotado`, `tiempo_agotado`, `no_disponible` (falta el
  binario o no hay red) y `no_encontrado` (canal o vídeo que no existe). La clasificación de yt-dlp se hace por código
  de salida y patrones de stderr probados con salidas grabadas (spike S1).
- **Motivo:** FR-009 pide decir la causa de que un nicho no se pueda medir; la caché evita repetir búsquedas al
  regenerar propuestas y reduce el riesgo de bloqueo.
- **Alternativas:** sin caché (más lento y más bloqueos); caché más larga (datos viejos sin avisar; el aviso de 90 días
  de FR-027 es otra cosa: mira la fecha de la medida guardada en el perfil).

## R5. Concurrencia y SC-003

- **Decisión:** un limitador propio de 20 líneas en `packages/core/src/concurrency.ts` (cola con N huecos). Máximo 3
  procesos yt-dlp a la vez en toda la app y 4 comprobaciones de nombre a la vez. Cada nicho lanza sus búsquedas en
  paralelo dentro de ese tope; la pantalla muestra cada nicho en cuanto su medida termina (no espera a todos).
- **Motivo:** SC-003 (medir 5 nichos en menos de 2 minutos) sin disparar el bloqueo de YouTube. Con 3 procesos y
  ~8 s por búsqueda, 5 nichos × 2 búsquedas caben en ~40 s más los canales.
- **Alternativas:** `p-limit` (dependencia para algo trivial, principio X); sin límite (bloqueos).

## R6. Medidas de mercado y umbrales

- **Decisión:** funciones puras en `packages/core/src/market/measures.ts` sobre los vídeos de `ytsearch40:<consulta>`
  (y `search.list` con `maxResults=50` en Data API), en el idioma del canal y sin filtro de país (FR-014b):
  - **Demanda:** mediana de visitas de los resultados. Alta ≥ 50.000; media ≥ 5.000; baja por debajo.
  - **Puerta de entrada:** canales distintos de menos de 200.000 suscriptores cuyo vídeo tiene al menos tantas visitas
    como suscriptores tiene el canal (multiplicador ≥ 1). Abierta ≥ 3 canales; entreabierta ≥ 1; cerrada 0.
  - **Concentración:** parte de las visitas totales que se llevan los 3 canales con más visitas. Alta ≥ 0,70; media
    ≥ 0,40; baja por debajo.
  - **Saturación:** vídeos de los resultados publicados en los últimos 90 días, en número y porcentaje.
  - Contexto adicional: canales pequeños (< 10.000 suscriptores) y nuevos (primer vídeo hace ≤ 24 meses) que aparecen
    con ≥ 10.000 visitas, como evidencia de que se puede entrar.
  - El veredicto (`verdict.ts`) combina los cuatro en `conviene` / `con_reservas` / `no_conviene` con reglas
    explícitas; la IA lo explica pero no lo cambia.
  - Los umbrales viven en `packages/knowledge/market/thresholds.json` con fuente (CanalYT, revisado 2026-10-31) para que
    se ajusten sin tocar código.
- **Motivo:** FR-007 y FR-009; las cifras salen de datos medidos y la IA solo opina sobre ellas (II, V). La mediana
  resiste a un vídeo viral que distorsiona la media.
- **Alternativas:** media de visitas (un viral lo desfigura); pedir a la IA que estime demanda (prohibido por FR-009);
  Google Trends (sin API oficial y no mide YouTube en castellano con fiabilidad).

## R7. Entrada de datos en `AiRequest`

- **Decisión:** `AiRequest` gana `input?: Record<string, unknown>`. Los adaptadores lo serializan como JSON dentro de
  un bloque `<datos>` tras el texto del prompt, separado de las instrucciones. El texto del prompt sigue siendo fijo y
  versionado; lo variable va siempre en `input`.
- **Motivo:** los prompts de 002 eran fijos. Separar instrucciones de datos permite versionar el prompt, contar tokens
  igual en todos los proveedores y reducir la inyección desde títulos de vídeos (los datos van marcados como datos).
- **Alternativas:** plantillas con interpolación en el texto (mezcla datos y prompt, rompe la versión del prompt);
  un mensaje por dato (complica los adaptadores sin beneficio).

## R8. Validador de afirmaciones (SC-002)

- **Decisión:** `packages/core/src/channel/claims.ts` recorre la salida de la IA y comprueba dos reglas: (1) todo
  número que parezca cifra de mercado (visitas, suscriptores, vídeos, euros, porcentajes) debe coincidir con un valor
  de la medida o del conocimiento que se le pasó en `input`, con tolerancia de redondeo; (2) en la lectura de canal,
  cada punto de «lo que funciona / lo que no» debe citar al menos un `videoId` que exista en los datos. Si falla, se
  repite la llamada una vez con el error añadido; si vuelve a fallar, se descarta la frase infractora y se marca la
  propuesta con `claimsTrimmed = true` para que la interfaz lo diga.
- **Motivo:** SC-002 pide 0 cifras inventadas; un esquema Zod no basta porque las cifras van dentro de texto libre.
- **Alternativas:** confiar en el prompt (no verificable); prohibir todos los números en la salida (la monetización
  necesita rangos, que salen del conocimiento y se validan igual).

## R9. Perfiles por uso y salida estructurada

- **Decisión:** `AI_USES` pasa a `['comprobacion', 'preguntas', 'nichos', 'conceptos', 'nombres', 'lectura_canal',
  'posicionamiento']`. `packages/ai/src/profiles.ts` asigna por proveedor: Haiku 5.5 para `preguntas` y `nombres`;
  Sonnet 5.5 para `nichos`, `conceptos`, `lectura_canal` y `posicionamiento`. Todos piden salida estructurada con el
  esquema Zod convertido a JSON Schema (Claude Code con `--json-schema`, Anthropic con `output_config.format`, que ya
  existen desde 002). Un fallo de validación da un reintento; el segundo devuelve el fallo tipado `respuesta_invalida`.
  Topes de tiempo: 60 s (`preguntas`, `nombres`), 120 s (el resto).
- **Motivo:** principio IV; el modelo barato basta para preguntas y nombres, y el razonamiento sobre medidas pide uno
  mejor. El coste medio por recorrido queda por debajo de 0,15 € con la API (R12).
- **Alternativas:** Opus para todo (4 veces más caro sin mejora visible en estas tareas); un solo uso genérico
  (impide ajustar modelo y tope por tarea).

## R10. Prompts v1

- **Decisión:** un fichero por uso en `packages/knowledge/prompts/<uso>/v1.md` con cabecera `id`, `version`, `use`. Cada
  prompt dice: el papel (productor de YouTube en castellano), las reglas de II/V (no inventar cifras, citar fuentes del
  `input`, marcar opinión), los límites de cantidad de la spec (3 preguntas, 3-5 nichos, 2-3 conceptos, 6-8 nombres)
  e incluye las reglas de `packages/knowledge/writing/human.md` (FR-032). Los tests de contrato comprueban que el
  prompt cargado coincide con su hash registrado, para que un cambio sin subir versión falle.
- **Motivo:** principio IV (prompts versionados) y FR-032.
- **Alternativas:** prompts en código TS (difíciles de revisar por el creador); un prompt maestro para todo (cambiar
  uno obliga a versionar todos).

## R11. Paquete de conocimiento

- **Decisión:** `packages/knowledge/market/` con un JSON por tema: `ypp.json` (requisitos del programa de socios),
  `rpm.json` (rangos de ingresos por cada 1.000 visitas por categoría y público España / Latinoamérica / mixto),
  `made-for-kids.json`, `inauthentic.json`, `shorts.json`, `thresholds.json` y `pricing.json` (precios de modelos y
  cambio USD→EUR). Cada fichero lleva `source` (URL o documento), `reviewedAt` (fecha ISO) y `version`, validados con
  Zod al arrancar. Si `reviewedAt` tiene más de 180 días, la interfaz lo avisa junto a la cifra. Las cifras de RPM son
  rangos de fuentes públicas citadas, nunca un número único.
- **Motivo:** FR-014, FR-031 y principio V. JSON es legible y se puede revisar en un PR.
- **Alternativas:** constantes en código (sin fuente ni fecha visibles); base de datos (el conocimiento se versiona con
  el código, no con los datos del creador).

## R12. Estimación en euros

- **Decisión:** `packages/core/src/spending/estimate.ts` calcula: tokens de entrada = `count_tokens` de la API de
  Anthropic sobre el prompt + `input` (llamada gratuita), o una heurística de 1 token por cada 3,5 caracteres si no hay
  red; tokens de salida = tope típico por uso declarado en el perfil. Coste = tokens × precio de `pricing.json` × cambio
  USD→EUR del mismo fichero, redondeado hacia arriba al céntimo. Con la suscripción de Claude Code el coste marginal es
  0 € y el botón lo dice («Incluido en tu suscripción»). El botón principal de cada paso con coste muestra la
  estimación («Proponer nichos · unos 0,03 €»); pulsarlo es la confirmación (FR-029). Si la estimación no cabe en los
  límites de gasto, el botón no lanza nada y la pantalla explica qué límite se superaría (R13).
- **Motivo:** principio III sin añadir un diálogo en cada paso, que rompería «una acción principal por pantalla».
- **Alternativas:** diálogo de confirmación en cada llamada (fricción alta para céntimos); estimar solo con la
  heurística (hasta un 30 % de error con textos en castellano).

## R13. Límites de gasto y registro de consumo

- **Decisión:** tabla `ai_usage` con cada llamada: uso, modelo, tokens reales de entrada y salida (de la respuesta),
  coste en céntimos de euro calculado con la tabla de precios vigente y fecha. Antes de cada llamada, `budget.ts`
  comprueba la estimación contra los tres límites de `spending_limits` de la 002 (`per_operation_cents`, `daily_cents`
  y `monthly_cents`, sumando el día y el mes en curso de `ai_usage`). Si alguno se superaría, la operación se bloquea
  con el fallo `limite_de_gasto`, la causa en llano y un enlace a Ajustes → Límites. Ajustes → Consumo lista las
  llamadas del mes y su total. Con la suscripción no se registra coste (0 céntimos) pero sí la llamada.
- **Motivo:** principio III y FR-029 (respetar los límites del onboarding); el creador ve en qué se fue el dinero.
- **Alternativas:** fiarse solo de la estimación (no detecta desvíos); consultar el consumo a Anthropic (la Admin API
  pide otra clave).

## R14. Recorrido y reanudación (SC-006)

- **Decisión:** tabla `journey` con `kind` (`nuevo` / `existente`), `step` y `state` JSON. Pasos del canal nuevo:
  `intereses → preguntas → nichos → ritmo → conceptos → nombres → hecho`; del existente:
  `enlace → confirmar → lectura → posicionamiento → hecho`. Elegir un nicho o un concepto no es un paso propio: es
  aprobar la propuesta (`selected_index` y `status = aprobada`, ver el modelo de datos), y esa aprobación es la que
  hace avanzar al paso siguiente. Cada transición se guarda en una transacción
  junto con la propuesta o la aprobación que la produce. Al abrir la app, si hay un recorrido sin terminar, el inicio
  ofrece «Seguir donde lo dejaste». Las operaciones largas (medir, leer canal) son trabajos con estado en la tabla, así
  que cerrar la app a mitad deja el trabajo en `interrumpido` y se puede relanzar.
- **Motivo:** SC-006 (reanudar sin perder nada) y el principio I (un paso por pantalla).
- **Alternativas:** estado en el navegador (se pierde al cambiar de navegador); librería de máquinas de estado (XState:
  dependencia grande para dos listas de pasos).

## R15. Propuestas y versiones del perfil

- **Decisión:** una tabla `proposal` con `kind` (`nichos`, `conceptos`, `nombres`, `perfil_actual`,
  `posicionamiento`), `payload` JSON validado por el esquema del tipo, `promptId`, `promptVersion`, `instructions`
  (indicaciones de regeneración), `parentId` (la propuesta que regenera) y `status` (`propuesta`, `aprobada`,
  `descartada`). El perfil es la tabla `channel_profile` (una fila viva por canal) más `profile_version` (copia completa
  e inmutable de cada versión aprobada, con origen `ia` / `manual` / `restaurada`). Restaurar crea una versión nueva
  igual a la elegida, sin borrar nada.
- **Motivo:** FR-023 y FR-024 (aprobar, editar, regenerar, volver atrás) con un único patrón para los cinco tipos.
- **Alternativas:** una tabla por tipo de propuesta (cinco veces el mismo código); guardar diffs en vez de copias
  (perfiles pequeños: la copia completa es más simple y más fácil de exportar).

## R16. Componentes de interfaz nuevos

- **Decisión:** dos componentes en `packages/ui`: `Semaphore` (rojo / ámbar / verde / sin comprobar, siempre con texto
  e icono además del color, WCAG 1.4.1) y `DataSource` (etiqueta «Dato de YouTube · 31 oct 2026» o «Opinión de la IA»,
  con estilos distintos de tokens existentes). Se añaden al catálogo con sus estados.
- **Motivo:** FR-008 (distinguir dato de opinión), FR-017 y el principio VI (todo con tokens, en el catálogo).
- **Alternativas:** estilos sueltos en cada pantalla (incoherencia y fallos de contraste).

## R17. Exportar el perfil

- **Decisión:** `packages/core/src/channel/export.ts` genera Markdown (perfil legible con una sección «Fuentes» que
  lista cada cifra con fuente y fecha) y JSON (el perfil completo con `schemaVersion`, medidas y fuentes). La descarga
  sale de `GET /api/channels/:id/export?format=md|json`.
- **Motivo:** FR-026 y principio VII (datos exportables en formato abierto).
- **Alternativas:** PDF (no editable y añade dependencia); solo JSON (no legible para el creador).

## R18. Estrategia de pruebas

- **Decisión:**
  - Unitarias: medidas y veredicto con conjuntos de vídeos de ejemplo, semáforo de nombres, validador de
    afirmaciones, estimación y presupuesto, máquina de pasos.
  - Contrato: los tres adaptadores de `YouTubeData` pasan la misma batería con salidas grabadas de yt-dlp y Data API
    en `packages/youtube/test/fixtures`; los seis usos de IA pasan sus esquemas con la IA falsa.
  - Integración del servidor: rutas con SQLite en memoria, IA falsa y YouTube falso.
  - E2E con Playwright + axe: los dos recorridos completos, reanudar a mitad, nicho no medible, nombre en rojo, nombre
    aplazado, canal con menos de 5 vídeos.
  - Prueba real opcional (`pnpm test:real-youtube`), fuera de CI, que mide un nicho de verdad.
  - Auditoría de novato (SC-008) con el agente `usuario-novato` al cerrar la feature.
- **Motivo:** principio IX; CI no depende de YouTube ni de la IA reales.
- **Alternativas:** e2e contra YouTube real en CI (inestable y con riesgo de bloqueo de la IP del runner).

## Spikes (verificación antes de construir)

| # | Pregunta | Bloquea | Si falla |
|---|---|---|---|
| S1 | ¿`yt-dlp --flat-playlist -J "ytsearch40:<consulta>"` devuelve visitas, canal, `channel_id` y fecha en cada vídeo, y `--flat-playlist -J <canal>/videos` da suscriptores y hasta 200 vídeos? Grabar salidas y patrones de stderr de bloqueo y 404. | R1, R4, R6 | Pedir los datos del canal con una segunda llamada sin `--flat-playlist` (más lenta) y recalcular SC-003. |
| S2 | ¿La comprobación de @ (`yt-dlp https://www.youtube.com/@<handle>`) distingue libre (404) de ocupada (código 0) de error de red? | FR-017 | Marcar la @ como «sin comprobar» y basar el semáforo solo en la búsqueda de nombre. |
| S3 | ¿Cuánto tarda de verdad medir 5 nichos con 3 procesos a la vez? | SC-003 | Bajar a `ytsearch25` y medir los canales de referencia aparte. |
| S4 | ¿Cuántas unidades de Data API gasta un recorrido completo? | R3 | Avisar antes y caer a yt-dlp más pronto. |
| S5 | ¿`count_tokens` aplica con la suscripción de Claude Code? | R12 | No aplica: el coste marginal es 0 € y no se llama. |

### Resultados

- S5 resuelto en esta fase: con la suscripción de Claude Code no hay coste por llamada, así que la estimación devuelve
  0 € y no llama a `count_tokens`.
- S1 (2026-11-01, yt-dlp 2026.08.19, macOS arm64, red doméstica):
  - `yt-dlp --flat-playlist -J "ytsearch40:<consulta>"` tarda ~3 s y devuelve 40 entradas con `id`, `title`, `url`,
    `view_count`, `duration`, `channel`, `channel_id`, `uploader_id` (la @) y `channel_is_verified` (no siempre).
    **`timestamp`, `upload_date` y `release_timestamp` vienen siempre vacíos** en modo plano. Una consulta sin
    resultados devuelve `entries: []` con código 0 (→ `sin_datos`).
  - `--flat-playlist -J --playlist-end 200 https://www.youtube.com/@<handle>/videos` tarda ~3 s y trae
    `channel_id`, `channel` y `channel_follower_count` (suscriptores) a nivel raíz y 200 entradas con `view_count`,
    `duration` y `title`, también **sin fecha**.
  - Las fechas salen del feed RSS (`/feeds/videos.xml?channel_id=UC…`), que da las 15 últimas publicaciones. Por
    eso la saturación (vídeos de los últimos 90 días) se calcula con las fechas que haya; si ningún vídeo de la
    búsqueda tiene fecha, la saturación queda `null` («sin dato»), nunca estimada. La Data API sí da fechas.
  - Canal inexistente: código 1 y stderr con `HTTP Error 404` / `Requested entity was not found` → `no_encontrado`.
  - Sin red: código 1 y stderr con `Unable to download API page` + `Failed to establish a new connection` /
    `Unable to connect` / `getaddrinfo` → `no_disponible`. Bloqueo: patrones `HTTP Error 429`,
    `Sign in to confirm`, `captcha` (no reproducido; tomado de los avisos de yt-dlp) → `bloqueado`.
- S2: `GET https://www.youtube.com/@<handle>` responde 404 si la @ está libre y 200 si está ocupada; sin red, error de
  conexión → `sin_comprobar`. Se hace con `fetch` (más rápido que lanzar yt-dlp) y se confirma la decisión del
  contrato.
- S3: 10 búsquedas (5 nichos × 2) con 3 procesos a la vez: 8 s. 20 canales con `--playlist-end 30` y 3 a la vez:
  10 s. Medir 5 nichos completos cabe holgado en SC-003 (< 2 min): **no hace falta bajar a `ytsearch25`**.
- S4 (calculado, sin clave real): un recorrido desde cero hace 10 `search.list` (1.000 unidades), 10 `videos.list`
  para las visitas (10) y 5 `channels.list` por lotes de 50 (5); la comprobación de 5 nombres, 5 `search.list` (500).
  Total ≈ 1.515 unidades: unos 6 recorridos al día con el cupo gratuito de 10.000. Reparto: la Data API mide nichos y
  nombres mientras quede cupo; la @ libre se comprueba siempre por URL pública (0 unidades) y, al llegar al 100 %, el
  registro cae a yt-dlp.

# Research: Onboarding — instalación y elección de la IA

**Feature**: `002-onboarding` | **Fecha**: 2026-10-28

Cada decisión sigue el formato Decisión / Motivo / Alternativas. Las dependencias nuevas se justifican aquí
(constitución, principio X) y se resumen en [plan.md](./plan.md#dependencias-nuevas). Lo que no se puede dar por
seguro sin probarlo en una máquina real queda como **spike** (S1–S6, al final), con su plan B. Los *spikes* son las
primeras tareas de `/speckit-tasks` y bloquean las pantallas que dependen de ellos.

---

## R1. Qué se distribuye y cómo

- **Decisión:** cada versión se publica como **GitHub Release** con tres recursos:
  - `ytcreator-<versión>.tar.gz`: `server.mjs` (servidor ya empaquetado, con las migraciones y los prompts
    incrustados), `web/` (la SPA compilada), `bin/ytcreator` (lanzador) y `VERSION`. Es JavaScript puro: un solo
    tarball sirve para todos los sistemas.
  - `SHA256SUMS`: la suma del tarball.
  - `install.sh`: el instalador de esa versión.

  El instalador descarga además el **Node 24 oficial** (`nodejs.org/dist`, `.tar.gz`) de la plataforma y lo deja en la
  carpeta interna de la app. La versión de Node y las cuatro sumas SHA-256 (darwin-arm64, darwin-x64, linux-x64,
  linux-arm64) van **escritas dentro de `install.sh`** por el flujo de publicación (R24).

  La línea de instalación es:
  `curl -fsSL https://github.com/<owner>/<repo>/releases/latest/download/install.sh | bash`.
- **Motivo:** el creador no necesita tener Node, Homebrew ni nada previo (FR-001). Un Node propio y fijado evita
  sorpresas con la versión del sistema y con `node:sqlite` (R7). Las sumas protegen contra descargas cortadas o
  corruptas. Las de Node, además, contra un Node manipulado, porque viajan dentro de un `install.sh` servido por HTTPS
  desde GitHub. La suma del tarball sale de la misma versión publicada: protege la integridad, no la autoría. Firmar
  las versiones queda en el backlog.
- **Alternativas:**
  - *Node SEA (ejecutable único)*: todavía exige compilar por plataforma y firmar en macOS. No aporta nada a cambio.
  - *Docker*: es lo que pide la constitución para el VPS, pero en local exige instalar Docker Desktop. Rompe «una
    línea» para un novato.
  - *Homebrew / paquetes `.deb` y `.rpm`*: tres canales que mantener, y Homebrew no existe en Linux por defecto.
  - *`npm i -g`*: necesita Node previo.
- **Punto abierto (no bloquea el plan):** el repositorio y sus versiones deben ser **públicos** para que la línea
  funcione sin identificarse. Si el creador prefiere mantenerlo privado hasta la v1, la validación manual usa
  `YTCREATOR_RELEASE_BASE` apuntando a una carpeta local ([contracts/installer.md](./contracts/installer.md)).

## R2. Estructura del instalador

- **Decisión:** un único fichero `installer/install.sh` en Bash compatible con la 3.2 (la de macOS), con
  `set -euo pipefail` y estas reglas:
  - todos los textos visibles en un bloque `MSG_*` al principio del fichero, en español y con el tono de la app.
    El test de glosario los lee igual que los catálogos de la web;
  - **ocho pasos**, cada uno con una función `step_N_done` que **inspecciona** el resultado (¿existe el Node de la
    versión fijada y responde `--version`?), no una marca escrita a ciegas. Así, repetir la línea salta lo hecho
    (FR-003, SC-003) y actualizar es lo mismo que instalar;
  - las descargas van a `*.partial` con `curl -fL --retry 3 -C -` (reanudables), se verifica la suma y se renombran
    al final. Un corte nunca deja un fichero «bueno» a medias;
  - las preguntas se leen de `/dev/tty`, porque la entrada estándar es la tubería de `curl`. Si no hay terminal, se
    toma la respuesta prudente (parar);
  - cada paso escribe en `logs/install-<fecha>.log` (FR-004), sin secretos: el instalador no maneja ninguno;
  - un error muestra qué ha pasado, qué hacer y «vuelve a pegar la misma línea» (FR-004). El código de salida dice
    cuál fue ([contracts/installer.md](./contracts/installer.md));
  - gancho de pruebas `YTCREATOR_INSTALL_FAIL_STEP=N`, que solo funciona con `YTCREATOR_INSTALL_TEST=1`, para cortar
    en cada paso (SC-003).

  Los pasos son:

  1. **Comprobar el ordenador:** sistema (Darwin o Linux), arquitectura, `curl`, `tar`, `shasum` o `sha256sum`,
     `script` y espacio libre (≥ 1 GB; si no llega, avisa y pregunta). En un sistema no soportado se para sin
     escribir nada.
  2. **Preparar carpetas:** crea las de R3. Si `~/YTCreator` existe, no está vacía y no tiene la marca
     `.ytcreator`, se para sin tocarla (caso límite «carpeta que no es de YTCreator»).
  3. **Descargar el motor:** Node 24 fijado.
  4. **Descargar YTCreator:** el tarball de la versión, en `versions/<versión>/`.
  5. **Instalar Claude Code:** si `claude --version` responde, se salta. Si no, ejecuta el instalador oficial
     (`curl -fsSL https://claude.ai/install.sh | bash`, que lo deja en `~/.local/bin/claude` sin `sudo`; la URL se
     verifica al implementar). Si falla, **avisa y sigue**: la app lo detecta y ofrece repararlo (caso límite).
  6. **Preparar tus datos:** para la instancia en marcha si la hay, copia la base de datos a `backups/`, ejecuta
     `node server.mjs migrate` y solo entonces cambia el enlace `current` a la versión nueva (R21).
  7. **Crear el acceso directo** (R6).
  8. **Abrir YTCreator:** arranca la app con el lanzador y abre el navegador. Sin entorno gráfico, muestra la
     dirección.

  **Sin `sudo` en la v1:** ningún paso lo necesita. Si una feature futura lo requiere (p. ej. un paquete del
  sistema), el instalador lo anunciará antes (FR-005).
- **Motivo:** inspeccionar el resultado es lo único que resiste cortes en cualquier punto, incluido a mitad de una
  marca. Un solo fichero se puede servir tal cual como recurso de la versión.
- **Alternativas:**
  - *Marcas `step-N.done`*: mienten si el corte llega entre el trabajo y la marca, o si alguien borra a mano lo
    instalado.
  - *Instalador en Node* (descargar Node y luego delegar): el paso 1–3 seguiría en Bash. Partirlo en dos lenguajes no
    simplifica nada.

## R3. Carpetas

- **Decisión:**
  - **Carpeta interna de la app** (`APP_HOME`): en macOS, `~/Library/Application Support/YTCreator`; en Linux,
    `${XDG_DATA_HOME:-~/.local/share}/ytcreator`. Contiene:
    - `runtime/node-v<versión>/`;
    - `versions/<versión>/` (la actual y la anterior);
    - `current` → enlace a la versión en uso;
    - `install.json` e `instance.json` ([data-model](./data-model.md));
    - `secrets/` (`0700`) con `secrets.json` (`0600`) si no hay llavero (R8);
    - `claude-accounts/<id>/` (`0700`): la carpeta de configuración aislada de cada cuenta de suscripción (R10);
    - `logs/` y `backups/`.
  - **Carpeta de trabajo**: `~/YTCreator`, visible y pensada para que el creador la copie o la exporte. Contiene
    `ytcreator.db` y la marca `.ytcreator`. **Nunca** contiene secretos (FR-028b).
- **Motivo:** separa lo que es del creador (sus datos, exportables) de lo que es de la app (programa, credenciales,
  registros). Sigue las convenciones de cada sistema.
- **Alternativas:**
  - *Todo en `~/YTCreator`*: exportar la carpeta arrastraría credenciales y binarios.
  - *`~/.ytcreator`*: oculto para el novato, que es justo donde no queremos sus datos.

## R4. Servidor local e instancia única

- **Decisión:** Hono sobre `@hono/node-server`, escuchando **solo en `127.0.0.1`** (FR-007). Puerto preferido
  `4310`; si está ocupado por otro programa, prueba `4311`–`4329` sin preguntar nada (caso límite «puerto ocupado»).
  Al arrancar:
  1. crea `instance.json` con `O_EXCL` (`{pid, port, startedAt, version, instanceId}`);
  2. si ya existe, comprueba si ese proceso vive y responde `GET /api/health` con `app: 'ytcreator'`. Si responde,
     no arranca una segunda copia y termina con un código que el lanzador entiende. Si no responde, el fichero es
     de una ejecución muerta y se sustituye.

  `POST /api/app/shutdown` («Cerrar YTCreator») responde y después cierra el servidor, borra `instance.json` y sale.
  Las señales `SIGTERM` y `SIGINT` hacen el mismo apagado ordenado.
- **Motivo:** FR-006 (reutilizar si ya está en marcha, cerrar desde la app) sin un demonio ni un gestor de servicios.
  El `instanceId` evita confundir la app con otro programa que use el mismo puerto.
- **Alternativas:**
  - *`launchd` / `systemd --user`*: arrancan con el equipo, lo que la spec descarta.
  - *Puerto aleatorio siempre*: rompe los marcadores del navegador sin motivo.

## R5. Guardia de `Host` y `Origin`

- **Decisión:** un middleware en todas las rutas `/api/*`:
  - `Host` debe ser `127.0.0.1:<puerto>` o `localhost:<puerto>`. Si no, `403`. Esto corta el *DNS rebinding*;
  - en peticiones que cambian algo (`POST`, `PUT`, `PATCH`, `DELETE`), `Origin` debe existir y coincidir con
    `http://127.0.0.1:<puerto>` o `http://localhost:<puerto>`. Esto corta el CSRF desde otras webs;
  - el cuerpo, si lo hay, debe ser `application/json`. Así ningún formulario HTML puede enviarlo sin *preflight*.

  Las respuestas llevan además `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'` (con el *hash*
  del script de tema de la 001), `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.
- **Motivo:** escuchar en `127.0.0.1` impide el acceso desde otros equipos, pero no que una web abierta en el mismo
  navegador ataque al servidor local. Sin identificación (un creador por equipo), la guardia es la única defensa.
- **Alternativas:**
  - *Token de sesión en una cookie*: añade estado sin proteger más que `Origin` + `Host` en este escenario. Se
    reconsiderará con la feature del VPS, que sí exige identificación.

## R6. Acceso directo y lanzador

- **Decisión:** el lanzador `bin/ytcreator` (Bash, dentro de cada versión) hace siempre lo mismo:
  1. si `instance.json` existe y `GET /api/health` responde en ≤ 1 s → abre el navegador (≤ 1 s en caliente);
  2. si no, arranca `node --disable-warning=ExperimentalWarning server.mjs serve` desacoplado (`nohup`, y `setsid`
     cuando existe), espera a `instance.json` con un tiempo máximo de 5 s y abre el navegador;
  3. abre con `open` (macOS) o `xdg-open` (Linux con `DISPLAY` o `WAYLAND_DISPLAY`). Si no hay entorno gráfico,
     escribe la dirección.

  El acceso directo llama al lanzador de `current` con rutas absolutas:
  - **macOS:** `~/Applications/YTCreator.app`, un *bundle* mínimo (`Info.plist` + `Contents/MacOS/YTCreator`) que
    aparece en Launchpad y en Spotlight;
  - **Linux:** `~/.local/share/applications/ytcreator.desktop`, visible en el menú de aplicaciones.
- **Motivo:** FR-006 sin terminal y sin depender del `PATH` del usuario. Un `.app` hecho a mano no necesita firma
  porque lo crea el propio usuario en su equipo (no lleva el atributo de cuarentena).
- **Alternativas:**
  - *Platypus / Automator*: herramientas externas para algo que caben en veinte líneas.
  - *Alias en `.zshrc`*: exige terminal.

## R7. Base de datos y migraciones

- **Decisión:** `node:sqlite` (`DatabaseSync`), incluido en Node 24. Sigue marcado como experimental, pero el Node
  va fijado (R1) y el aviso se silencia en el lanzador. Las migraciones son ficheros SQL numerados
  (`0001_onboarding.sql`), incrustados en `server.mjs`, aplicados en orden dentro de una transacción y anotados en
  `schema_migrations`. Antes de migrar se copia la base a `backups/` (R21). Si la base tiene una migración que esta
  versión no conoce (vuelta atrás a una versión anterior), el servidor no arranca y lo explica.

  `PRAGMA journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 3000`.
- **Motivo:** cero dependencias nativas. Con `better-sqlite3`, cada versión de Node exige un binario precompilado
  por plataforma, y si falta hay que compilar con herramientas que el novato no tiene. El volumen de esta feature
  (unas pocas filas) no necesita ORM.
- **Alternativas:**
  - *`better-sqlite3`*: **plan B** si `node:sqlite` diera problemas. La API es casi idéntica, así que el cambio
    queda en `db/open.ts`.
  - *Drizzle / Kysely*: un ORM o un *query builder* para cinco tablas no se justifica (X).

## R8. Dónde viven los secretos

- **Decisión:** un puerto `SecretStore` en `packages/core` con tres implementaciones en `apps/server`
  ([contracts/secrets.md](./contracts/secrets.md)):
  - **macOS — llavero:** la herramienta del sistema `security`, alimentada por **la entrada estándar**
    (`security -i`), para que el secreto no aparezca nunca en los argumentos del proceso (visibles con `ps`).
    Servicio `YTCreator` y cuenta = referencia del secreto;
  - **Linux con escritorio — Secret Service:** `secret-tool store`, que lee el secreto de la entrada estándar.
    Disponible si `secret-tool` existe y una prueba de guardar-leer-borrar termina en ≤ 3 s (sin D-Bus, se colgaría:
    de ahí el tiempo máximo);
  - **Sin llavero — fichero:** `APP_HOME/secrets/secrets.json` con permisos `0600` dentro de una carpeta `0700`.
    Escrituras atómicas (fichero temporal `0600` + `rename`).

  La implementación se elige la primera vez y queda anotada en los ajustes (`secret_store`). Si más tarde no está
  disponible (p. ej. llavero bloqueado en una sesión SSH), el fallo es `no_disponible` con motivo
  `llavero_no_disponible`, nunca un cambio silencioso a otro almacén. La base de datos solo guarda la referencia
  (`secret_ref`) y los 4 últimos caracteres (`secret_hint`).
- **Motivo:** FR-028b literalmente, sin dependencias nativas. Las tres opciones quedan fuera de la carpeta de
  trabajo.
- **Alternativas:**
  - *`keytar`*: abandonado. *`@napi-rs/keyring`*: binario nativo por plataforma. Queda como **plan B** si las
    herramientas del sistema dieran problemas.
  - *Cifrar con una clave derivada*: la clave tendría que guardarse en algún sitio; no mejora un fichero `0600`.

## R9. El puerto `AiProvider` y el registro

- **Decisión** (detalle en [contracts/ai-provider.md](./contracts/ai-provider.md)):
  - `AiProvider` declara `id`, `capabilities` (`text`, `structured`, `streaming`, `vision`), `billing`
    (`por_uso` | `suscripcion` | `gratis`) y dos operaciones: `check()` (comprobación sin coste, **nunca lanza**:
    devuelve `conectada` o un `AiFailure`) y `generate(request)` (devuelve `AiResult<T>`, también sin lanzar);
  - cada petición lleva un `use` (`AiUse`). En esta feature solo existe `'comprobacion'`. El perfil (modelo,
    esfuerzo, tiempo máximo) sale de `packages/ai/src/profiles.ts` según el uso y el adaptador, nunca del entorno
    (principio IV);
  - un **registro** de descriptores `{id, connectionKind, billing, create(credentials, deps), login?}`. Añadir un
    proveedor = escribir el adaptador y añadir una línea en `registry.ts` (FR-015);
  - el dominio (`packages/core`) define los tipos y la rotación. `packages/ai` importa `core`, nunca al revés.
- **Motivo:** principio IV. `check()` separado de `generate()` permite que cada adaptador use su vía sin coste
  (R12) sin que el dominio sepa cuál es.
- **Alternativas:**
  - *Lanzar excepciones tipadas*: obliga a cada llamador a recordar el `try`; un resultado discriminado lo impone
    el compilador.
  - *Vercel AI SDK / LangChain*: abstraen proveedores, pero no Claude Code ni el inicio de sesión, y traen mucho más
    de lo que usamos.

## R10. Llamar a Claude Code con la suscripción

- **Decisión:** el adaptador ejecuta el binario con `execFile` (sin *shell*):
  `claude -p <prompt> --output-format json --model <id del perfil> …`, con:
  - **entorno limpio:** solo `PATH`, `HOME`, `LANG`, más `CLAUDE_CODE_OAUTH_TOKEN` (el de la cuenta) y
    `CLAUDE_CONFIG_DIR=APP_HOME/claude-accounts/<id>`. Se eliminan expresamente `ANTHROPIC_API_KEY`,
    `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`,
    `CLAUDE_CODE_USE_FOUNDRY`, `CLAUDE_EFFORT` y `MAX_THINKING_TOKENS`, para que nunca se cobre por uso a escondidas
    ni cambie el modelo fijado;
  - `cwd` en una carpeta vacía propia, sin herramientas ni servidores MCP (los *flags* exactos se fijan en **S1**);
  - tiempo máximo con `AbortSignal` (60 s por defecto para `comprobacion`, porque arrancar el programa ya tarda);
  - el modelo de `comprobacion` es el más ligero (`claude-haiku-5-5`), escrito en `profiles.ts`.

  El binario se busca en este orden: `YTCREATOR_CLAUDE_BIN` → `~/.local/bin/claude` → `PATH`. Si no está, el fallo
  es `no_disponible` / `programa_no_instalado` y la UI ofrece **repararlo**, que vuelve a ejecutar el instalador
  oficial desde el servidor (caso límite).
- **Motivo:** la carpeta de configuración aislada impide mezclar la cuenta del creador en su terminal con las cuentas
  de la app, y que *hooks*, ajustes o MCP del usuario se cuelen en las llamadas. El entorno limpio cumple el
  principio III.
- **Alternativas:**
  - *Claude Agent SDK*: usa la misma CLI por debajo, pero su uso con suscripción no está pensado para apps de
    terceros. Llamar a la CLI que el creador instala deja clara la responsabilidad («bajo tu responsabilidad»).
  - *Heredar `~/.claude` del creador*: una sola cuenta, mezclada con la suya.

## R11. Iniciar sesión en la suscripción sin terminal

- **Decisión:** el puerto `SubscriptionLogin` (`start()` → `{loginId, url}`, `complete(loginId, code)`,
  `cancel(loginId)`). Para Claude, el adaptador ejecuta `claude setup-token`, que crea un *token* de larga duración
  pensado para usos sin terminal, dentro de una **pseudoterminal** con la herramienta del sistema `script`:
  - macOS: `script -q /dev/null claude setup-token`;
  - Linux (util-linux): `script -qec "claude setup-token" /dev/null`.

  El flujo:
  1. `start()`: lanza el proceso con `COLUMNS` muy grande (para que el enlace no se parta en líneas), quita los
     códigos ANSI de la salida y espera el enlace de autorización (≤ 20 s). Devuelve el enlace a la UI;
  2. el creador abre el enlace, aprueba el acceso y copia el código que le da la web;
  3. `complete()`: escribe el código y un salto de línea en la entrada del proceso y espera el *token*
     (`sk-ant-oat…`). Con él, comprueba la cuenta (R12), la guarda en `SecretStore` y crea la
     `subscription_account`;
  4. un código no válido o caducado → `sin_sesion` / `codigo_no_valido`, y la UI ofrece «Pedir un enlace nuevo»
     (FR-016). Cada sesión de inicio caduca a los 10 minutos y se mata el proceso.

  **La salida del proceso no se escribe nunca en los registros**: contiene el *token*. Las salidas de ejemplo se
  graban como *fixtures* (con *tokens* inventados) para los tests y para `fake-claude`.

  **Cuenta duplicada** (caso límite): si **S3** confirma una forma de saber la identidad de la cuenta con el *token*
  (p. ej. el estado de la sesión de la CLI), se guarda su huella (`identity_fingerprint`) y se rechaza la segunda.
  Si no existe, la huella es el *hash* del *token*, que solo detecta el mismo *token* pegado dos veces. En ese caso se
  avisará al creador antes de implementar, porque ese caso límite quedaría cubierto a medias.
- **Motivo:** es la única vía oficial que da un *token* reutilizable sin que el creador abra la terminal (FR-016,
  SC-011). `script` viene con macOS y con util-linux (Ubuntu, Debian y Fedora lo traen), así que no añade
  dependencias. Lo comprueba el paso 1 del instalador.
- **Alternativas:**
  - *Implementar el OAuth de Claude a mano*: suplantaría a Claude Code. Es frágil y probablemente contrario a sus
    condiciones.
  - **Plan B — `node-pty`:** pseudoterminal real si `script` no se comporta igual en algún sistema. Es dependencia
    nativa, de ahí que no sea la primera opción.
  - **Plan C — instrucciones manuales tras «Modo experto»:** ejecutar `claude setup-token` y pegar el *token*.
    Degrada la experiencia y **rompe SC-011**: solo se adoptaría avisando al creador.

## R12. Comprobaciones sin coste

- **Decisión:** `check()` por adaptador:

  | Adaptador | Comprobación | Qué detecta | Coste |
  |---|---|---|---|
  | Suscripción de Claude | `claude --version` → llamada mínima con el perfil `comprobacion` (el prompt versionado pide una sola palabra) | programa ausente, sesión caducada, plan sin Claude Code, cupo agotado, sin conexión, tiempo agotado | 0 € (consume una fracción mínima del cupo de la suscripción) |
  | API de Anthropic | `client.models.list()` | clave no válida, sin permiso, sin conexión, servicio caído | 0 € (no se factura) |
  | Gemini gratis | `GET https://generativelanguage.googleapis.com/v1beta/models` con la cabecera `x-goog-api-key` | clave no válida, sin permiso, región no soportada, sin conexión, servicio caído | 0 € |

  **La falta de saldo** de la API de Anthropic no se ve al listar modelos. Para mantener 0 € (principio III y supuesto
  de la spec), la pantalla avisa **antes**: «Para usar esta opción necesitas saldo en tu cuenta de Anthropic», con el
  enlace a la página de facturación. El fallo `cupo_agotado` / `sin_saldo` se detecta en la primera llamada real
  (feature 003+). **S4** comprueba si `countTokens` (gratuito) devuelve el error de saldo: si lo hace, se añade a la
  comprobación.
- **Motivo:** FR-019 y SC-004. Listar modelos valida la clave sin generar nada.
- **Alternativas:**
  - *Llamada mínima de 1 token a la API*: céntimos de céntimo, pero no 0 €. Rompe SC-004 y obligaría a pedir
    confirmación.

## R13. Fallos tipados con motivo

- **Decisión:** `AiFailure = {kind, reason, resetsAt?, retryable: false}`, donde `kind` son los cinco fallos de la
  constitución y `reason` precisa el mensaje:

  | `kind` | `reason` |
  |---|---|
  | `sin_sesion` | `clave_no_valida`, `sesion_caducada`, `sin_permiso`, `plan_sin_acceso`, `codigo_no_valido` |
  | `cupo_agotado` | `sin_saldo`, `limite_de_uso` |
  | `tiempo_agotado` | `respuesta_lenta` |
  | `contenido_filtrado` | `rechazo_del_modelo` |
  | `no_disponible` | `sin_conexion`, `servicio_caido`, `programa_no_instalado`, `llavero_no_disponible`, `region_no_soportada` |

  Cada adaptador traduce sus errores en `classify.ts`:
  - **Anthropic** (clases de error del SDK, en este orden porque heredan unas de otras):
    `APIConnectionTimeoutError` → `tiempo_agotado`; `APIConnectionError` → `no_disponible`/`sin_conexion`;
    `AuthenticationError` (401) → `clave_no_valida`; `PermissionDeniedError` (403) → `sin_permiso`; 402
    (`billing_error`) o 400 con «credit balance» → `sin_saldo`; `RateLimitError` (429) → `limite_de_uso` con
    `resetsAt` de las cabeceras `anthropic-ratelimit-*-reset` o `retry-after`; 529 y 5xx → `servicio_caido`;
    `stop_reason: 'refusal'` → `contenido_filtrado`;
  - **Gemini** (`error.status` y `error.details[].reason` del cuerpo): `API_KEY_INVALID` → `clave_no_valida`; 403
    `PERMISSION_DENIED` → `sin_permiso`; `FAILED_PRECONDITION` de ubicación → `region_no_soportada`; 429
    `RESOURCE_EXHAUSTED` → `limite_de_uso`; 5xx → `servicio_caido`; `promptFeedback.blockReason` o
    `finishReason: 'SAFETY'` → `contenido_filtrado`;
  - **Claude Code** (código de salida + campos del JSON + texto de error, con *fixtures* grabados en S1): sesión
    no válida o caducada → `sesion_caducada`; plan sin acceso → `plan_sin_acceso`; límite de uso → `limite_de_uso`
    con la hora de vuelta si aparece; `ENOENT` → `programa_no_instalado`; aborto por tiempo → `tiempo_agotado`.

  Un error que no encaja se clasifica como `no_disponible` / `servicio_caido` y se registra su **tipo** (nunca el
  cuerpo completo) para afinar la tabla.

  La web traduce `kind` + `reason` a un mensaje con su acción (`failures.es.ts`,
  [contracts/ui-screens.md](./contracts/ui-screens.md#mensajes-de-fallo)).
- **Motivo:** la spec exige distinguir clave no válida / sin saldo / sin permiso / sin conexión (FR-017) y cada
  fallo con su mensaje propio (FR-027, SC-007). Cinco `kind` no bastan para eso; el `reason` lo resuelve sin tocar la
  constitución.
- **Alternativas:**
  - *Más `kind`*: cambiaría la lista que fija la constitución.

## R14. Rotación de cuentas de suscripción

- **Decisión:** en `packages/core/src/ai/rotation.ts`, una función pura que recibe las cuentas en orden y la
  operación:
  - antes de llamar, descarta las cuentas con `cupo_agotado` y `resetsAt` futuro y las que tienen `sin_sesion`. Si
    no queda ninguna, **no llama** y devuelve `cupo_agotado` con el `resetsAt` más próximo (US4-7);
  - si la cuenta en uso devuelve `cupo_agotado`, la marca y pasa a la siguiente válida, **una vez por cuenta**, y
    añade un aviso `AccountSwitched {fromId, toId, reason}` al resultado (FR-016c, SC-012);
  - `tiempo_agotado`, `sin_sesion` y el resto **no** cambian de cuenta: se devuelven tal cual (principio IV);
  - cada resultado actualiza el estado de la cuenta (`status`, `status_reason`, `resets_at`, `last_call_at`), así
    que la salud que se ve en Ajustes sale de llamadas reales (FR-016b).

  En esta feature, la operación que pasa por la rotación es «Comprobar ahora» de la conexión de suscripción. La
  comprobación de una cuenta concreta no rota.
- **Motivo:** la lógica es de dominio y se prueba sin red. La comprobación de la conexión es una operación real
  para validar SC-012 sin crear rutas solo para tests.
- **Alternativas:**
  - *Reintentar la misma cuenta tras esperar*: es justo el reintento a ciegas que prohíbe el principio IV.

## R15. Adaptador de la API de Anthropic

- **Decisión:** `@anthropic-ai/sdk` con `new Anthropic({apiKey, maxRetries: 0, timeout, fetch})`. `maxRetries: 0`
  porque el SDK reintenta 429 y 5xx por defecto, y eso sería un reintento a ciegas. El `fetch` se inyecta en los
  tests de contrato. Modelo por uso en `profiles.ts`. Enlaces de la UI: página de claves y página de facturación de
  la consola de Anthropic.
- **Motivo:** el SDK oficial da las clases de error de R13 y los tipos de respuesta.
- **Alternativas:**
  - *`fetch` a mano*: perderíamos los tipos de error y tendríamos que seguir los cambios de la API por nuestra cuenta.

## R16. Adaptador de Gemini gratis

- **Decisión:** `fetch` directo contra la API REST `v1beta` (`models` para la comprobación y `generateContent` para
  generar), con la clave en la cabecera `x-goog-api-key` (nunca en la URL, que acabaría en registros). El modelo se
  fija en `profiles.ts` tras confirmar el catálogo vigente del nivel gratuito (**S6**). La UI enlaza a
  `https://aistudio.google.com/apikey` para conseguir la clave y avisa, en una frase, de que con el nivel gratuito
  Google puede usar el contenido para mejorar sus productos (FR-030), además de que los resultados son más modestos
  y el cupo limitado (FR-018).
- **Motivo:** dos rutas REST no justifican un SDK (X), y así el adaptador no depende de los cambios de nombre del
  SDK de Google.
- **Alternativas:**
  - *`@google/genai`*: oficial, pero más superficie de la que usamos.
  - *Ollama en local*: la constitución lo permite, pero la spec eligió Gemini (sesión de aclaraciones).

## R17. Límites de gasto

- **Decisión:** importes en **céntimos enteros** (sin coma flotante). Valores por defecto: **0,50 € por operación,
  3 € al día y 20 € al mes**. Validación: enteros > 0 y ≤ 1.000 €; por operación ≤ diario ≤ mensual (FR-022). Se
  guardan solo cuando el creador los acepta (paso de límites o Ajustes). Se piden al activar por primera vez la
  opción de pago por uso, venga del asistente o de Ajustes (US4-4).
- **Motivo:** prudentes para quien empieza («céntimos por operación, pocos euros al día, pocas decenas al mes»,
  según la spec). Aplicarlos es cosa de la 003+, cuando haya operaciones con coste; aquí se fijan.
- **Alternativas:**
  - *Guardar los valores por defecto sin preguntar*: incumple FR-021 («aceptarlos o cambiarlos»).

## R18. El asistente como máquina de estados en el servidor

- **Decisión:** el estado vive en la tabla `onboarding_state` (una fila) con un número de `revision`. La máquina
  (`packages/core/src/onboarding/wizard.ts`) es pura:
  - pasos `bienvenida` → `elegir` → `conectar` → `limites` (solo con `por_uso`) → `listo` → completado;
  - acciones `continuar`, `volver`, `elegir(opcion)`, `aplazar` y `retomar`, cada una con sus guardas (p. ej.
    `continuar` desde `conectar` exige una conexión activa en estado `conectada`; desde `limites`, que haya límites
    guardados);
  - cada petición lleva `expectedRevision`. Si no coincide (otra pestaña avanzó), el servidor responde `409` con el
    estado actual y la web navega a él (caso límite de las dos pestañas). La web vuelve a pedir el estado al
    recuperar la visibilidad (`visibilitychange`);
  - con suscripción o gratis, el paso `limites` se salta y `listo` muestra la nota «Con esta opción no pagas nada
    extra en YTCreator» (FR-023);
  - `aplazar` («Lo haré más tarde») lleva a `/conectar-ia`, cuya única acción es `retomar` (FR-010).

  Diagrama y guardas en [data-model.md](./data-model.md#estado-del-asistente).
- **Motivo:** FR-012 (retomar donde se dejó, aunque se cierre la app) y el caso de las dos pestañas, sin lógica
  duplicada en el cliente.
- **Alternativas:**
  - *Estado en `localStorage`*: no sobrevive a otro navegador y no resuelve las dos pestañas.
  - *XState*: una dependencia para cinco estados.

## R19. La web sin router ni librería de datos

- **Decisión:** un router propio de ~60 líneas (`pathname` + `history.pushState` + `popstate`) con las rutas de
  [contracts/ui-screens.md](./contracts/ui-screens.md), y el servidor devuelve `index.html` para cualquier ruta que
  no sea `/api/*`. Las llamadas usan `fetch` y se validan con los esquemas Zod de `@ytcreator/core/api`. Todos los
  textos viven en `strings/es.ts` y `strings/failures.es.ts`.
- **Motivo:** unas diez rutas sin parámetros complejos ni caché compartida no justifican `react-router` ni TanStack
  Query (X).
- **Alternativas:**
  - *Rutas con `#`, como el catálogo de la 001*: valen para una herramienta interna; en el producto, las rutas
    limpias son más fáciles de explicar y de reabrir.

## R20. Aviso de versiones nuevas

- **Decisión:** con la app en marcha y el aviso activado, el servidor consulta la última versión **al arrancar y
  luego cada 24 h**, y anota `last_update_check_at` para no repetir la consulta si se reinicia el mismo día. La
  consulta es una petición `GET` al recurso `VERSION` de la última versión publicada (texto plano). Lleva
  `User-Agent: YTCreator` sin número de versión y no lleva ningún dato del creador (FR-009b, FR-031). Con un tiempo
  máximo de 10 s, cualquier fallo se ignora en silencio. Si hay versión nueva y el creador no la ha descartado, la web
  muestra un aviso discreto con «vuelve a pegar la línea de instalación» y un botón para copiarla. «Cerrar» la
  descarta (`dismissed_version`). Con el aviso desactivado, no se hace ninguna petición (US5-5).
- **Motivo:** un recurso de texto plano evita la API de GitHub (límites, JSON) y no revela nada.
- **Alternativas:**
  - *API `releases/latest` de GitHub*: funciona igual, pero con JSON y límite de peticiones.
  - *Autoactualizar*: lo prohíbe FR-009b.

## R21. Actualizar sin perder nada

- **Decisión:** actualizar es repetir la instalación (FR-003). El paso 6 hace:
  1. si hay una instancia en marcha, le envía `SIGTERM` (pid de `instance.json`) y espera a que salga;
  2. copia `ytcreator.db` a `backups/ytcreator-<versión anterior>-<fecha>.db` (se conservan las 3 últimas);
  3. ejecuta `migrate` con la versión nueva;
  4. solo si migra bien, cambia `current` de forma atómica (enlace temporal + `mv`);
  5. si falla, restaura la copia, deja `current` como estaba y explica qué ha pasado (US5-3).

  Se conservan la versión actual y la anterior en `versions/`. Las credenciales no se tocan: viven en el llavero o
  en `secrets/` (FR-009). El paso 8 vuelve a abrir la app, que es el «se reinicia sola» de US5-2.
- **Motivo:** el cambio de `current` es el único punto de no retorno, y llega cuando todo lo demás ha salido bien.
- **Alternativas:**
  - *Migrar al arrancar el servidor*: un fallo dejaría la app sin arrancar y sin el instalador delante para
    explicarlo. El servidor también migra al arrancar, como red de seguridad en desarrollo.

## R22. Registros sin secretos

- **Decisión:**
  - un registrador propio de JSON por líneas (`logging.ts`, ~50 líneas) en `APP_HOME/logs/server.log`, que rota a
    los 5 MB y conserva 3 ficheros;
  - una clase `Secret` (`packages/core/src/secrets/secret.ts`) que envuelve cada credencial. `toString()`,
    `toJSON()` y `[util.inspect.custom]` devuelven `'[oculto]'`; el valor solo sale con `secret.reveal()`, que se
    llama en tres sitios: el adaptador al construir la petición, el `SecretStore` al guardar y la entrada estándar
    del proceso de Claude;
  - un redactor que se aplica a cada línea antes de escribirla, por si algo se escapa: `sk-ant-[A-Za-z0-9_-]+`
    (cubre las claves de API y los *tokens* `sk-ant-oat…`) y `AIza[0-9A-Za-z_-]{35}`;
  - los errores de los proveedores se registran por tipo y código, nunca con el cuerpo ni las cabeceras.
- **Motivo:** FR-028 y SC-006 con defensa en dos capas: un tipo que no se serializa y un filtro final.
- **Alternativas:**
  - *`pino` con `redact`*: redacta por rutas de propiedades, no por patrón, y añade una dependencia para un fichero.

## R23. Estrategia de tests

- **Decisión:**
  - **Unitarios (Vitest):** máquina del asistente, rotación, validación de límites, comparación de versiones,
    clasificadores de errores, `Secret` y redactor;
  - **Batería de contrato** (`packages/ai/test/contract/battery.ts`): la misma para el proveedor falso y los tres
    adaptadores. Los adaptadores se prueban con transporte falso: `fetch` inyectado para Anthropic y Gemini, y el
    ejecutable `fake-claude` (con salidas grabadas) para Claude Code. Casos en
    [contracts/ai-provider.md](./contracts/ai-provider.md#batería-de-contrato);
  - **Servidor:** rutas con `app.request()` de Hono, SQLite en memoria, `SecretStore` de fichero en carpeta
    temporal y guardia de `Host`/`Origin`;
  - **Instalador:** Vitest que ejecuta `install.sh` con `HOME` temporal y `curl`, `uname` y el instalador de Claude
    falsos en el `PATH`, sirviendo *fixtures* locales. Corta con `YTCREATOR_INSTALL_FAIL_STEP` en cada uno de los
    ocho pasos, repite y comprueba que termina sin rehacer lo hecho (SC-003). En CI, en Ubuntu y en macOS;
  - **e2e (Playwright + axe):** el servidor real con `YTCREATOR_FAKE_AI=<escenario>` y carpetas temporales. Cubre
    cada opción del asistente, los cinco fallos, la rotación, las dos pestañas, Ajustes, accesibilidad en ambos
    temas, 375 px y zoom 200 %;
  - **Fuga de secretos** (SC-006): un e2e que usa credenciales de prueba reconocibles y después las busca en los
    registros, en la carpeta de trabajo, en la base de datos, en todas las respuestas HTTP capturadas, en el DOM y en
    los ficheros versionados del repositorio;
  - **Auditoría de novato** (IX, SC-008): manual con un agente, sobre el recorrido completo ([quickstart.md](./quickstart.md)).

  El proveedor falso solo existe en las compilaciones de desarrollo y de test: la compilación publicada lo elimina
  con una constante de Vite (R24), así que `YTCREATOR_FAKE_AI` no hace nada en una instalación real.
- **Motivo:** principio IX. Ningún test llama a una IA real.

## R24. Compilación y publicación

- **Decisión:**
  - el servidor se empaqueta con **Vite en modo SSR** (`ssr.noExternal: true`) en un único `dist/server.mjs`, con
    las migraciones y el prompt incrustados (`?raw`). Una constante (`__YTC_ALLOW_FAKE_AI__`) elimina el proveedor
    falso de la compilación publicada;
  - `release.yml` (al crear una etiqueta `v*`): `lint`, `typecheck` y `test`; compila web y servidor; arma el
    tarball; calcula `SHA256SUMS`; escribe la versión de Node y sus sumas en `install.sh`; y publica los tres
    recursos más `VERSION`;
  - `ci.yml` añade `shellcheck` del instalador y del lanzador, y el test del instalador en `ubuntu-latest` y
    `macos-latest`.
- **Motivo:** Vite ya está en el repo y usa esbuild y Rollup por debajo. Sin herramientas nuevas.
- **Alternativas:**
  - *`esbuild` directo*: otra dependencia y otra configuración para lo mismo.
  - *`tsc` sin empaquetar*: obligaría a llevar `node_modules` en el tarball.

---

## Spikes (verificación antes de construir)

Cada *spike* es una tarea corta, con resultado anotado en este fichero, y bloquea solo lo que depende de él.

| # | Pregunta | Bloquea | Si falla |
|---|---|---|---|
| **S1** | *Flags* exactos de `claude -p` para: salida JSON, modelo fijado, sin herramientas ni MCP, sin cargar ajustes del usuario. Grabar las salidas de éxito, sesión caducada, plan sin acceso y límite de uso | adaptador Claude Code, `fake-claude` | Ajustar `command.ts` a lo que exista; el aislamiento por `CLAUDE_CONFIG_DIR` y `cwd` vacío se mantiene |
| **S2** | `claude setup-token` dentro de `script` en macOS y en Linux: ¿se ve el enlace?, ¿acepta el código por la entrada?, ¿se captura el *token*? | pantalla de inicio de sesión (FR-016, SC-011) | Plan B `node-pty`; plan C instrucciones manuales, avisando al creador |
| **S3** | ¿Hay una forma oficial de conocer la identidad de la cuenta a partir del *token* (estado de la sesión de la CLI)? | detección de cuenta duplicada | Huella = *hash* del *token*, y avisar al creador del alcance reducido |
| **S4** | ¿`countTokens` (gratuito) devuelve el error de falta de saldo con una cuenta sin saldo? | comprobación de la API de Anthropic | Mantener el aviso previo de R12 |
| **S5** | `node:sqlite` en el Node 24 fijado: transacciones, WAL y que el empaquetado de Vite lo deje como módulo del sistema | capa de datos | Plan B `better-sqlite3` |
| **S6** | Modelo vigente del nivel gratuito de Gemini y la forma de su error de región | perfil de Gemini, `classify.ts` | Elegir el modelo gratuito más ligero que liste `models` |

---
description: "Lista de tareas de la feature 002: onboarding"
---

# Tasks: Onboarding — instalación y elección de la IA

**Input**: documentos de diseño de `specs/002-onboarding/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: SÍ. La constitución y el plan los exigen. En cada fase, los tests se escriben **primero** y deben
**fallar** antes de implementar.

**Organization**: las tareas se agrupan por historia de usuario para que cada una se pueda implementar y probar
por separado.

**Revisión 2026-10-29** (constitución 2.0.0): sin opción gratuita. T018, T082, T096, T109 y T114 quedan retiradas
(conservan su número); T161–T163 son nuevas (aviso de FR-001b en el instalador y `README.md`). El código ya hecho
se ha limpiado de la opción gratuita en esa misma revisión.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin depender de tareas pendientes);
- **[Story]**: historia a la que pertenece (US1…US5). Setup, Foundational y Polish no llevan etiqueta;
- cada descripción incluye la ruta exacta del fichero.

## Convenciones comunes (valen para todas las tareas)

- Código, identificadores y nombres de fichero en **inglés**; textos de la interfaz, del instalador y de la
  documentación en **español**, revisados con el glosario de la constitución.
- **Ningún test llama a una IA real**: se usa el proveedor falso (`YTCREATOR_FAKE_AI=<escenario>` en e2e, parámetro
  directo en unitarios) o un `fetch`/binario inyectado.
- El servidor devuelve **códigos** (`kind`, `reason`, `code`, `fields`, `guard`); solo la web los traduce a texto
  (`apps/web/src/strings/`).
- Un valor secreto viaja siempre envuelto en `Secret`; `.reveal()` solo se permite en `packages/ai/src/**` y
  `apps/server/src/secrets/**`. Nunca va en los argumentos de un proceso ni en un registro.
- Las comprobaciones cuestan **0 €** (R12). Ningún adaptador reintenta por su cuenta (`maxRetries: 0`),
  salvo el único reintento de una salida que no valida su esquema (principio IV).
- Comandos con Node 24: `fnm exec --using=24 -- pnpm lint|typecheck|test|test:e2e`.

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: crear los paquetes nuevos, sus dependencias y la configuración de calidad que usan todas las historias.

- [X] T001 Crear el paquete `@ytcreator/core` con `exports` `.` (`src/index.ts`) y `./api` (`src/api/index.ts`), dependencia `zod` v4, `tsconfig.json` que extiende el base y carpeta `test/` en `packages/core/package.json`
- [X] T002 [P] Crear el paquete `@ytcreator/ai` (depende de `@ytcreator/core` y `@anthropic-ai/sdk`), `src/index.ts` vacío y `tsconfig.json` en `packages/ai/package.json`
- [X] T003 [P] Crear el paquete `@ytcreator/knowledge` con `prompts/` y un `src/index.ts` que exporta los prompts como texto (import `?raw`) en `packages/knowledge/package.json`
- [X] T004 [P] Crear la app `@ytcreator/server` (dependencias `hono`, `@hono/node-server`, `@ytcreator/core`, `@ytcreator/ai`, `@ytcreator/knowledge`; scripts `dev`, `build`, `start`) y `apps/server/vite.config.ts` en modo SSR con `ssr.noExternal: true`, salida `dist/server.mjs`, `define: { __YTC_ALLOW_FAKE_AI__: mode !== 'production' }` y la declaración global en `apps/server/src/env.d.ts`
- [X] T005 [P] Crear la app `@ytcreator/web` (React + Vite, dependencias `@ytcreator/ui`, `@ytcreator/tokens`, `@ytcreator/core`), `apps/web/vite.config.ts` con proxy de `/api` al servidor de desarrollo y `apps/web/index.html` con `lang="es"` y el CSS de tokens
- [X] T006 Añadir las referencias de los cinco proyectos nuevos al `tsconfig.json` raíz para que `pnpm typecheck` (`tsc -b`) los compile
- [X] T007 Añadir los proyectos `core`, `ai`, `server`, `web` (environment `jsdom` solo si hace falta, por defecto `node`) e `installer` (root `installer`, `include test/**/*.test.ts`, `testTimeout` 120 s) en `vitest.config.ts`
- [X] T008 Añadir a `eslint.config.js` (fichero raíz existente): `no-restricted-imports` de `@anthropic-ai/sdk` y de cualquier SDK de IA fuera de `packages/ai/**`; `no-restricted-syntax` que prohíbe `.reveal(` fuera de `packages/ai/src/**` y `apps/server/src/secrets/**`; `packages/core` no puede importar de `packages/ai` ni de `apps/*`
- [X] T009 Actualizar los scripts del `package.json` raíz: `test:e2e` ejecuta los e2e de `@ytcreator/catalog` y de `@ytcreator/web`; nuevo `test:installer` (`vitest run --project installer`)
- [X] T010 Crear `apps/web/playwright.config.ts` con `@axe-core/playwright` como dependencia de desarrollo, proyecto Chromium, y `webServer` que compila web + servidor y arranca `dist/server.mjs` con `YTCREATOR_FAKE_AI=ok`, `HOME` y `XDG_DATA_HOME` en una carpeta temporal y un puerto fijo de test
- T011 → movida al final de US1, tras T072 (necesita `dist/server.mjs`, `installer/stamp.sh` y `apps/server/bin/ytcreator`)
- [X] T012 Ejecutar `pnpm install` y comprobar que `pnpm lint`, `pnpm typecheck` y `pnpm test` siguen en verde con los esqueletos vacíos

**Checkpoint**: el monorepo compila con los paquetes nuevos y la CI los conoce.

---

## Phase 2: Foundational (requisitos previos que bloquean todas las historias)

**Purpose**: spikes, tipos del dominio, base de datos, servidor mínimo, proveedor falso y base de la web.

**⚠️ CRÍTICO**: ninguna historia empieza hasta terminar esta fase.

### Spikes (R, quickstart §0) — se anotan en `research.md`

- [X] T013 [P] Spike S1: confirmar los flags de `claude -p` que usará el adaptador (salida JSON, modelo, esfuerzo, sin herramientas, sin sesión persistente) y grabar salidas reales de éxito y de cada error en `packages/ai/test/fixtures/claude-code/`; anotar el resultado en `specs/002-onboarding/research.md`
- [X] T014 [P] Spike S2 (lo ejecuta el creador con su cuenta): confirmar que `claude setup-token` bajo `script` imprime el enlace y acepta el código pegado por la entrada estándar; grabar la salida (sin el *token*) en `packages/ai/test/fixtures/claude-code/setup-token/`; si falla, aplicar el plan B de R11 o parar y decidir con el creador el plan C (rompe SC-011). Anotar en `specs/002-onboarding/research.md`
- [X] T015 [P] Spike S3 (lo ejecuta el creador): averiguar de dónde sale la identidad de la cuenta tras `setup-token` (salida, fichero en `CLAUDE_CONFIG_DIR` o llamada) para la huella; si no hay identidad, la huella es el SHA-256 del *token*. Anotar en `specs/002-onboarding/research.md`
- [X] T016 [P] Spike S4: comprobar si `countTokens` (gratuito) devuelve un error distinto con una clave sin saldo; si no, se mantiene solo el aviso previo de saldo de R12 (nunca una llamada de pago). Anotar en `specs/002-onboarding/research.md`
- [X] T017 [P] Spike S5 (**bloquea la base de datos**): compilar con Vite SSR un `server.mjs` que importa `node:sqlite`, abrirlo con Node 24 sin flags y ejecutar una consulta; si falla, cambiar el empaquetado en `apps/server/vite.config.ts`. Anotar en `specs/002-onboarding/research.md`
- ~~T018~~ Retirada el 2026-10-29 (constitución 2.0.0: la v1 no incluye opción gratuita)

### Tipos del dominio y secretos (packages/core)

- [X] T019 [P] Definir los tipos del puerto según `contracts/ai-provider.md`: `AiCapabilities`, `Billing`, `ConnectionKind` en `packages/core/src/ai/capabilities.ts`; `AiUse = 'comprobacion'` en `packages/core/src/ai/uses.ts`; `FailureKind` (`sin_sesion | cupo_agotado | tiempo_agotado | contenido_filtrado | no_disponible`), `FailureReason` (los 14 motivos literales), `AiFailure{kind, reason, resetsAt?}` y `ConnectionStatus = 'sin_comprobar' | 'conectada' | FailureKind` en `packages/core/src/ai/failures.ts`; `CheckResult`, `AiRequest<T>`, `AiUsage`, `AiResult<T>`, `AiProvider`, `LoginStart`, `LoginResult`, `SubscriptionLogin` en `packages/core/src/ai/port.ts`
- [X] T020 [P] Test de `Secret` en `packages/core/test/secrets/secret.test.ts`: el valor no aparece con `JSON.stringify`, `String()`, plantillas, `util.inspect`, `console.log` ni `Object.keys`; `reveal()` lo devuelve; `hint()` da los 4 últimos caracteres; `Secret.from` limpia espacios al principio y al final
- [X] T021 Implementar `Secret` (campo privado `#value`, `toJSON`/`toString`/`[util.inspect.custom]` devuelven `[oculto]`) en `packages/core/src/secrets/secret.ts` hasta que pase T020
- [X] T022 [P] Definir el puerto `SecretStore`, `SecretStoreKind` y `StoreResult<T>` (`no_disponible / llavero_no_disponible`) y el formato de `ref` `ytcreator:<tipo>:<id>` en `packages/core/src/secrets/port.ts`
- [X] T023 [P] Definir `ProviderDescriptor{id, connectionKind, billing, label, create(credentials: Secret, deps: ProviderDeps), login?}`, `ProviderDeps{fetch, now, logger, claudeBin?, accountDir?}` y la interfaz `Logger` en `packages/core/src/ai/registry.ts`
- [X] T024 Escribir los esquemas Zod compartidos de `contracts/http-api.md` en `packages/core/src/api/`: `errors.ts` (`ApiError` con `code` `validacion | conflicto | no_encontrado | ia | prohibido | interno`, `fields`, `guard` `sin_conexion | sin_limites | maximo_de_cuentas`, `failure`, `current`), `onboarding.ts` (`OnboardingState`, cuerpo de `POST /api/onboarding/step`, `kind` obligatorio con `elegir`), `ai.ts` (`ConnectionView`, `AccountView`, `AiOverview`, `RepairState`, `AccountSwitched`, cuerpos de login, credencial con `.transform` a `Secret`, `label` de 1–40 caracteres, `ids`), `settings.ts` (`LimitsView`, `GeneralSettings` con `aiTimeoutSeconds` 10–300 o `null`), `updates.ts` (`UpdateInfo`, `dismiss`) y `index.ts`

### Base de datos (apps/server/src/db)

- [X] T025 Test de migraciones en `apps/server/test/db/migrate.test.ts` (SQLite en memoria): aplica `0001` una sola vez (segunda ejecución sin cambios); la fila de `onboarding_state` nace en `bienvenida` con `revision = 0`; falla insertar `id = 2` en tablas de fila única; falla una segunda `ai_connection` con `is_active = 1`; falla una `subscription_account` duplicada en `(provider_id, identity_fingerprint)`; fallan los `CHECK` de `spending_limits` (`per_operation_cents > 0`, `daily_cents >= per_operation_cents`, `monthly_cents >= daily_cents AND monthly_cents <= 100000`); falla un `step`, `kind` o `status` fuera de su lista
- [X] T026 [P] Implementar `openDatabase(path | ':memory:')` con `node:sqlite`, `PRAGMA journal_mode = WAL`, `foreign_keys = ON` y `busy_timeout = 5000` en `apps/server/src/db/open.ts`
- [X] T027 [P] Escribir `apps/server/src/db/migrations/0001_onboarding.sql` según `data-model.md`: `schema_migrations(version INTEGER PK, applied_at TEXT NOT NULL)`; `onboarding_state` con `id INTEGER PK CHECK (id = 1)`, `step` ∈ `bienvenida | elegir | conectar | limites | listo | completado`, `chosen_kind` NULL o ∈ `suscripcion | pago_por_uso`, `postponed INTEGER NOT NULL DEFAULT 0`, `completed_at`, `revision INTEGER NOT NULL DEFAULT 0`, `updated_at` y la fila inicial; `ai_connection` con `kind TEXT PK`, `provider_id`, `is_active INTEGER NOT NULL DEFAULT 0` + «Índice único parcial `WHERE is_active = 1`: como mucho una activa», `status` ∈ `sin_comprobar | conectada | sin_sesion | cupo_agotado | tiempo_agotado | contenido_filtrado | no_disponible`, `status_reason`, `resets_at`, `last_checked_at`, `secret_ref`, `secret_hint`, `created_at`, `updated_at`; `subscription_account` con `id TEXT PK`, `provider_id`, `label TEXT NOT NULL` (1–40 caracteres), `identity_fingerprint TEXT NOT NULL` + `UNIQUE (provider_id, identity_fingerprint)`, `position INTEGER NOT NULL`, `status`, `status_reason`, `resets_at`, `last_checked_at`, `last_call_at`, `secret_ref TEXT NOT NULL`, `secret_hint TEXT NOT NULL`, `created_at`; `spending_limits` con los tres `CHECK` literales y `accepted_at TEXT NOT NULL`; `app_settings(key TEXT PK, value TEXT NOT NULL)`
- [X] T028 Implementar `migrate(db, migrations)` (ficheros `NNNN_*.sql` incrustados con `import.meta.glob('./migrations/*.sql', { query: '?raw', eager: true })`, cada uno en su transacción, anota `schema_migrations`) en `apps/server/src/db/migrate.ts` hasta que pase T025

### Servidor mínimo (apps/server/src)

- [X] T029 [P] Test y `appPaths({platform, env, homedir})` en `apps/server/test/paths.test.ts` y `apps/server/src/paths.ts`: `APP_HOME` = `~/Library/Application Support/YTCreator` en macOS y `${XDG_DATA_HOME:-~/.local/share}/ytcreator` en Linux, con `runtime/`, `versions/`, `current`, `install.json`, `instance.json`, `secrets/`, `claude-accounts/`, `logs/`, `backups/`; carpeta de trabajo `~/YTCreator` con `ytcreator.db` y `.ytcreator`
- [X] T030 [P] Test del registro y del redactor en `apps/server/test/logging.test.ts`: una línea JSON por evento con `ts`, `level`, `event`; sustituye por `[oculto]` `sk-ant-[A-Za-z0-9_-]{8,}` y el valor de los campos `apiKey`, `token`, `code`, `authorization`, `x-api-key` (también anidados); un `Secret` se escribe como `[oculto]`; rota a los 5 MB y conserva 3 ficheros
- [X] T031 Implementar `createLogger(dir)` con redactor y rotación en `apps/server/src/logging.ts` hasta que pase T030
- [X] T032 [P] Test de la guardia en `apps/server/test/http/guard.test.ts`: `403 {error: {code: 'prohibido'}}` con `Host` ajeno; con `Origin` ajeno o ausente en `POST`/`PUT`/`PATCH`/`DELETE`; con `Content-Type` distinto de `application/json` en mutaciones con cuerpo; acepta `127.0.0.1:<puerto>` y `localhost:<puerto>`; `GET /api/health` pasa sin `Origin`
- [X] T033 Implementar el middleware de la guardia (R5) en `apps/server/src/http/guard.ts` hasta que pase T032
- [X] T034 Implementar `createApp(deps)` en `apps/server/src/http/app.ts`: monta la guardia y las rutas de `/api`, clase `ApiError` → código HTTP de la tabla de `contracts/http-api.md` (400/403/404/409/422), cualquier otra excepción → `500 {error: {code: 'interno'}}` con el detalle solo en el registro, cabecera CSP (`default-src 'self'`), ficheros estáticos de `web/` y `index.html` para cualquier otra ruta `GET`
- [X] T035 [P] Crear los helpers de test en `apps/server/test/helpers.ts`: `makeTestApp({fakeAi?, now?})` con SQLite en memoria migrado, `file-store` en carpeta temporal, logger a memoria, y `request(method, path, body?)` con `Host`/`Origin` locales
- [X] T036 [P] Test de `file-store` en `apps/server/test/secrets/file-store.test.ts`: `set/get/delete`; crea `secrets/` con `0700` y `secrets.json` con `0600`; escribe a un temporal `0600` y hace `rename`; corrige permisos más abiertos al leer y registra un aviso sin contenido; nunca escribe dentro de la carpeta de trabajo
- [X] T037 Implementar `createFileStore(dir, logger)` en `apps/server/src/secrets/file-store.ts` hasta que pase T036
- [X] T038 [P] Implementar el repositorio de ajustes con lectura validada por Zod de las claves `update_check_enabled` (`'1' | '0'`, por defecto `'1'`), `last_update_check_at`, `latest_version`, `dismissed_version`, `ai_timeout_seconds` (entero 10–300), `secret_store` (`'keychain' | 'secret-service' | 'file'`) en `apps/server/src/db/repos/settings.ts`, con test en `apps/server/test/db/settings.test.ts`

### IA: perfiles, proveedor falso y batería de contrato (packages/ai)

- [X] T039 [P] Escribir el prompt mínimo de comprobación (respuesta de una palabra) en `packages/knowledge/prompts/comprobacion/v1.md` y exportarlo como `{id: 'comprobacion', version: 1, text}` desde `packages/knowledge/src/index.ts`
- [X] T040 [P] Implementar `AiProfile{model, timeoutMs, maxOutputTokens, effort?}` y `PROFILES` (claude-code: `claude-haiku-5-5`, 60 s, 16 tokens, esfuerzo bajo; anthropic: `claude-haiku-5-5`, 30 s, 16; fake: `fake`, 1 s) y `resolveProfile(provider, use, settings)` que sustituye `timeoutMs` por `ai_timeout_seconds` si existe, en `packages/ai/src/profiles.ts`
- [X] T041 Escribir la batería de contrato C1–C13 de `contracts/ai-provider.md` como `runProviderContract(name, factory)` en `packages/ai/test/contract/battery.ts`; cada adaptador aporta los *stubs* que provocan cada caso (para C11: «primera salida inválida y segunda válida» y «dos salidas inválidas») y un contador de llamadas al transporte
- [X] T042 [P] Implementar los escenarios del proveedor falso (`ok`, `<kind>:<reason>`, `cupo:<resetsAt>`, `cuentas:<s1>,<s2>,…`, `lento`, `login:codigo_malo`, `login:duplicada`) en `packages/ai/src/fake/scenarios.ts`
- [X] T043 Implementar `createFakeProvider(scenario, credentials)` (acepta `sk-ant-api03-FAKE…` y `sk-ant-oat-FAKE…`) en `packages/ai/src/fake/fake-provider.ts` y `createFakeLogin(scenario)` (enlace fijo; código `ABCD-1234` → *token* `sk-ant-oat-FAKE…`; un inicio a la vez; caducidad a los 10 min) en `packages/ai/src/fake/fake-login.ts`
- [X] T044 Ejecutar la batería contra el falso en `packages/ai/test/contract/fake.contract.test.ts` hasta que pase con T042–T043
- [X] T045 [P] Test del registro en `packages/ai/test/registry.test.ts`: con `__YTC_ALLOW_FAKE_AI__ = false` la lista no contiene `fake` aunque exista `YTCREATOR_FAKE_AI`; con `true` y `YTCREATOR_FAKE_AI` definido, los dos descriptores reales usan el falso; hay exactamente un descriptor por `ConnectionKind`
- [X] T046 Implementar `createRegistry({env})` en `packages/ai/src/registry.ts` con solo el descriptor falso por ahora (los reales llegan en US2), hasta que pase T045

### Arranque mínimo y base de la web

- [X] T047 Implementar `apps/server/src/main.ts` mínimo: crea carpetas con `appPaths`, abre la base, `migrate`, `createApp`, escucha **solo** en `127.0.0.1` en el primer puerto libre de 4310–4329 y registra `server_started` (sin datos del creador); con su test en `apps/server/test/main.test.ts`: tras arrancar, `server.address().address === '127.0.0.1'` (FR-007, principio VII)
- [X] T048 [P] Implementar `apiClient` en `apps/web/src/api/client.ts`: `fetch` con `Content-Type: application/json`, parseo de respuestas y de `ApiError` con los esquemas de `@ytcreator/core/api`, error tipado para la web
- [X] T049 [P] Crear el catálogo de textos `apps/web/src/strings/es.ts` (claves por pantalla) y `apps/web/src/strings/failures.es.ts` con un mensaje y una acción para **cada** combinación `FailureKind` + `FailureReason` de R13, en español llano sin jerga técnica
- [X] T050 [P] Test de glosario en `apps/web/test/glossary.test.ts` que reutiliza `findForbiddenTerms` de `packages/ui/test/forbidden-terms.ts` sobre todos los valores de `apps/web/src/strings/*.ts`
- [X] T051 [P] Test de cobertura de textos en `apps/web/test/strings-coverage.test.ts`: todo `FailureReason`, `guard` y código de `fields` de `@ytcreator/core/api` tiene texto en `strings/`, y no hay claves huérfanas
- [X] T052 Crear `apps/web/src/router.ts` (rutas de `contracts/ui-screens.md` con pantallas vacías), `apps/web/src/App.tsx` (tema, `AppHeader`, `<main>` con foco al cambiar de ruta) y `apps/web/src/main.tsx`
- [X] T053 Crear `AppHeader` base (nombre de la app y enlace a Ajustes; el indicador de IA y «Cerrar» llegan en US1/US2) con componentes de `@ytcreator/ui` en `apps/web/src/shell/AppHeader.tsx`

**Checkpoint**: la base está lista; el servidor arranca en local con la base migrada y sirve la web vacía. Las
historias pueden empezar.

---

## Phase 3: User Story 1 — Instalar YTCreator en mi ordenador con una línea (Priority: P1) 🎯 MVP

**Goal**: con una sola línea pegada en Terminal, el creador instala todo lo necesario (motor, app, Claude Code, acceso
directo) sin sudo, ve «Paso N de 8 · …», y acaba con la app abierta en el navegador. Si algo falla, volver a pegar
la línea continúa donde se quedó.

**Independent Test**: en un `HOME` temporal con `curl`, `uname`, `script` y el instalador de Claude falsos, ejecutar
`installer/install.sh` contra una release local: termina con código 0, la estructura de R3 existe, `ytcreator open`
abre `http://127.0.0.1:<puerto>`, y cortar en cualquier paso y repetir deja el mismo árbol. La salida empieza por el
aviso de lo que hace falta (FR-001b), que también está en `README.md`.

### Tests para User Story 1 ⚠️

- [X] T054 [P] [US1] Crear los helpers del instalador en `installer/test/helpers.ts`: `HOME` y `XDG_DATA_HOME` temporales, `PATH` con `curl` falso (sirve ficheros de una carpeta, cuenta descargas, puede fallar), `uname` falso (`darwin-arm64`, `linux-x64`, `freebsd`), `script` falso, instalador de Claude falso (éxito o fallo), `open`/`xdg-open` falsos que anotan la URL, y `runInstaller(env)` que devuelve código, salida y árbol de ficheros
- [X] T055 [P] [US1] Crear `installer/test/fixtures/make-release.ts`: genera `ytcreator-<v>.tar.gz` (con un `bin/ytcreator` falso que responde a `migrate` y `open`, `server.mjs` de prueba y `VERSION`), un *runtime* de Node falso, `SHA256SUMS` y un `install.sh` sellado con `installer/stamp.sh`
- [X] T056 [US1] Escribir los casos 1–5 y 8 de `contracts/installer.md` en `installer/test/install.test.ts`: (1) instalación limpia en `darwin-arm64` y `linux-x64` → código 0 y estructura de R3; (2) para cada `N` de 1 a 8, corte con `YTCREATOR_INSTALL_FAIL_STEP=N` y repetición sin el gancho → código 0, mismo árbol que (1) y sin repetir descargas verificadas; (3) sistema no soportado → 10 y nada escrito; (4) `~/YTCreator` ajena → 20 y su contenido intacto; (5) suma incorrecta → 31 y ningún `*.partial` promovido; (8) fallo al instalar Claude Code → aviso y código 0. Además: cada paso se anuncia como `Paso N de 8 · <texto>`; todo error ocupa 3 líneas e incluye la ruta del registro; el script nunca invoca `sudo`
- [X] T057 [P] [US1] Test de instancia en `apps/server/test/instance.test.ts`: escribe `instance.json` (`pid`, `port`, `instanceId`, `version`) al arrancar y lo borra al apagar; si hay otra instancia viva que responde `GET /api/health` con `app: 'ytcreator'`, no arranca otra y devuelve su URL; un `instance.json` con `pid` muerto se ignora; salta puertos ocupados dentro de 4310–4329
- [X] T058 [P] [US1] Test de rutas de app en `apps/server/test/http/app-routes.test.ts`: `GET /api/health` → `{app: 'ytcreator', version, instanceId}`; `POST /api/app/shutdown` con `{}` → `202 {}` y después se llama al apagado; sin `Origin` local → 403
- [X] T059 [P] [US1] Test del CLI en `apps/server/test/cli.test.ts`: `serve` arranca o reutiliza la instancia; `migrate` aplica migraciones y sale con 0 (o ≠ 0 si fallan, sin tocar `current`); `open` arranca si hace falta y abre el navegador (o imprime la URL si no hay entorno gráfico); argumento desconocido → código 2

### Implementation para User Story 1

- [X] T060 [US1] Implementar `acquireInstance(paths, port range)`, `writeInstanceFile`, `releaseInstance` y el apagado ordenado (cierra el servidor, la base y borra `instance.json`) en `apps/server/src/instance.ts` hasta que pase T057
- [X] T061 [P] [US1] Implementar `GET /api/health` en `apps/server/src/http/routes/health.ts` y `POST /api/app/shutdown` (responde `202` y apaga en el siguiente ciclo) en `apps/server/src/http/routes/app.ts` hasta que pase T058
- [X] T062 [US1] Ampliar `apps/server/src/main.ts` para usar `acquireInstance`, gestionar `SIGTERM`/`SIGINT` con el apagado ordenado y registrar errores de arranque en `logs/`
- [X] T063 [US1] Implementar `apps/server/src/cli.ts` (`serve` | `migrate` | `open`) como punto de entrada de `dist/server.mjs` hasta que pase T059; `open` usa `open` en macOS y `xdg-open` en Linux, y sin `DISPLAY`/`WAYLAND_DISPLAY` imprime la dirección local
- [X] T064 [US1] Escribir el lanzador Bash `apps/server/bin/ytcreator` según `contracts/installer.md` (Lanzador): localiza `APP_HOME/current` y el Node de `runtime/`, ejecuta `server.mjs open`, compatible con bash 3.2 y sin avisos de `shellcheck`
- [X] T065 [US1] Escribir el esqueleto de `installer/install.sh`: bash 3.2, `set -euo pipefail`, función `run_step N texto comprobación acción` que salta los pasos cuya comprobación ya se cumple, función `fail código mensaje` (3 líneas, con la ruta del registro `APP_HOME/logs/install.log`), `trap` para Ctrl+C y errores inesperados (código 99), gancho `YTCREATOR_INSTALL_FAIL_STEP`, variables `YTCREATOR_RELEASE_BASE`, `YTCREATOR_ASSUME_YES`, `YTCREATOR_INSTALL_TEST`, y versión de Node + 4 sumas SHA-256 como marcadores que rellena `stamp.sh`
- [X] T066 [US1] Implementar en `installer/install.sh` el paso 1 «Comprobando tu ordenador» (sistema y arquitectura → 10; `curl`, `tar`, `shasum`/`sha256sum`, `script` → 11; espacio libre con pregunta, o 12 sin terminal o si el creador dice que no) y el paso 2 «Preparando las carpetas» (carpetas de R3, `~/YTCreator/.ytcreator`; carpeta ajena con contenido → 20; sin permiso de escritura en `HOME` → 21)
- [X] T067 [US1] Implementar en `installer/install.sh` los pasos 3 «Descargando el motor» y 4 «Descargando YTCreator»: descarga a `*.partial` con 3 intentos (→ 30), verificación SHA-256 (→ 31) antes de promover, extracción a `runtime/node-v<fijada>/` y a `versions/<v>/`
- [X] T068 [US1] Implementar en `installer/install.sh` el paso 5 «Instalando Claude Code» con el instalador oficial (respetando `YTCREATOR_CLAUDE_BIN` en test); si falla, aviso y sigue con código 0
- [X] T069 [US1] Implementar en `installer/install.sh` el paso 6 «Preparando tus datos» para una instalación nueva: `versions/<v>/bin/ytcreator migrate` y cambio atómico de `current` (enlace temporal + `mv`); si `migrate` falla → 60 y `current` no cambia
- [X] T070 [US1] Implementar en `installer/install.sh` el paso 7 «Creando el acceso directo» (macOS: `~/Applications/YTCreator.app` mínima que llama al lanzador; Linux: `~/.local/share/applications/ytcreator.desktop`; si falla, aviso 71 y sigue) y el paso 8 «Abriendo YTCreator» (`ytcreator open`; sin entorno gráfico, muestra la dirección local, no es error); escribir `install.json`
- [X] T071 [US1] Implementar en `installer/install.sh` la reinstalación de la misma versión: si `install.json` ya tiene `<v>` completa, solo se ejecutan los pasos 1, 6, 7 y 8
- [X] T072 [P] [US1] Escribir `installer/stamp.sh`: sustituye en `install.sh` la versión de Node, la versión de YTCreator y las 4 sumas SHA-256 (Node darwin-arm64, darwin-x64, linux-x64 y la release) leídas de `SHA256SUMS`
- [X] T011 [US1] Ampliar `.github/workflows/ci.yml` (requiere T047, T063, T064 y T072): en `quality`, instalar Playwright también en `apps/web` y ejecutar `pnpm test:e2e`; nuevo paso `shellcheck installer/install.sh installer/stamp.sh apps/server/bin/ytcreator`; nuevo job `installer` con matriz `ubuntu-latest` y `macos-latest` que ejecuta `pnpm test:installer`
- [X] T073 [US1] Ampliar `apps/web/test/glossary.test.ts` para extraer y revisar también los textos visibles de `installer/install.sh` (líneas `Paso N de 8 · …`, avisos y errores)
- [X] T074 [US1] Añadir a `AppHeader` el botón «Cerrar YTCreator» con `Dialog` de confirmación de `@ytcreator/ui`, que llama a `POST /api/app/shutdown` y muestra la pantalla final «Puedes cerrar esta pestaña» en `apps/web/src/shell/AppHeader.tsx`
- [X] T075 [US1] e2e en `apps/web/e2e/shutdown.spec.ts`: «Cerrar YTCreator» → confirmar → mensaje final y `GET /api/health` deja de responder
- [X] T161 [US1] Test en `installer/test/install.test.ts`: la salida del instalador empieza por el aviso de lo que hace falta (FR-001b), antes de `Paso 1 de 8`, sin pedir respuesta; también al reinstalar y al actualizar
- [X] T162 [US1] Añadir a `installer/install.sh` los textos `MSG_NEEDS_AI_1` y `MSG_NEEDS_AI_2` de `contracts/installer.md` y mostrarlos antes del paso 1 hasta que pase T161 (el test de glosario de T073 los revisa)
- [X] T163 [P] [US1] Crear `README.md` en la raíz: qué es YTCreator, la línea de instalación de `contracts/installer.md`, el aviso de FR-001b (suscripción de Claude con Claude Code o cuenta de Anthropic con saldo; sin IA gratuita) con un enlace a `claude.ai/pricing` y otro a `console.anthropic.com`, sistemas compatibles y cómo desinstalar a mano

**Checkpoint**: la línea instala, abre y cierra la app, y antes de empezar avisa de qué IA hace falta; los tests
1–5, 8 y 10 del instalador pasan en CI (ubuntu y macOS).

---

## Phase 4: User Story 2 — Elegir y conectar la IA en el primer arranque (Priority: P1) 🎯 MVP

**Goal**: en el primer arranque, un asistente guía al creador para elegir suscripción de Claude o pago por uso (API de Anthropic)
y conectarla sin tocar Terminal; la comprobación no cuesta nada; si sale y vuelve, sigue en el mismo paso; con
suscripción puede añadir varias cuentas.

**Independent Test**: con `YTCREATOR_FAKE_AI=ok`, abrir la app nueva, recorrer `/bienvenida` → elegir suscripción →
pegar `ABCD-1234` → «Funciona» → `/bienvenida/listo` → `/inicio`; cerrar la pestaña a mitad y volver al mismo paso. El recorrido
de pago por uso termina en US3 (límites).

### Tests para User Story 2 ⚠️

- [X] T076 [P] [US2] Test de la máquina del asistente en `packages/core/test/onboarding/wizard.test.ts` con cada fila de la tabla de `data-model.md` (Estado del asistente): transiciones válidas; `continuar` en `conectar` sin conexión `conectada` → `validacion` con `sin_conexion`; `continuar` en `limites` sin límites → `sin_limites`; desde `listo` sin límites `volver` va a `conectar`; `aplazar` desde cualquier paso salvo `completado`; `retomar` conserva el paso; cada acción válida sube `revision`; `expectedRevision` distinto → `conflicto` con el estado actual; `pago_por_uso` nunca queda activa sin límites
- [X] T077 [P] [US2] Test de rutas del asistente en `apps/server/test/http/onboarding.test.ts`: `GET /api/onboarding`; `POST /api/onboarding/step` con cuerpo válido, inválido (`elegir` sin `kind` → 400), cada guarda (400 con `guard`), `409` con `current` al usar una revisión antigua, y activación de la conexión en la misma transacción al salir de `conectar` (suscripción)
- [X] T078 [P] [US2] Test de rutas de conexión en `apps/server/test/http/ai-connections.test.ts`: `GET /api/ai` (`AiOverview`, solo conexiones configuradas, cuentas en orden, sin secretos, `hint` de 4 caracteres); `PUT /api/ai/connections/pago_por_uso/credential` con clave buena → `conectada` y secreto guardado (la conexión queda inactiva hasta aceptar los límites de US3); con clave mala (`sin_sesion:clave_no_valida`) → `422 ia` y **ni fila ni secreto**; clave con espacios → se limpia; login → complete con `ABCD-1234` → `201 AccountView` y conexión `suscripcion` creada; código malo → `422` con `codigo_no_valido`; cuenta duplicada (`login:duplicada`) → `409 conflicto`; sexta cuenta → `400` con `guard: 'maximo_de_cuentas'`; un login nuevo cancela el anterior; ninguna respuesta contiene la credencial de prueba
- [X] T079 [P] [US2] Crear el ejecutable `packages/ai/test/fixtures/fake-claude` (Node) que reproduce las salidas grabadas en S1/S2 según variables de entorno (éxito, cada error, `setup-token` con enlace, código válido o no, cuelgue) y anota `argv` y entorno en un fichero para CC1/CC3
- [X] T080 [P] [US2] Ejecutar la batería C1–C13 y los casos CC1–CC6 contra `claude-code` con `fake-claude` en `packages/ai/test/contract/claude-code.contract.test.ts`: CC1 entorno sin `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_*`, `CLAUDE_EFFORT`, `MAX_THINKING_TOKENS` y con `CLAUDE_CODE_OAUTH_TOKEN` y `CLAUDE_CONFIG_DIR` de la cuenta; CC2 binario ausente → `programa_no_instalado`; CC3 el *token* no está en `argv`; CC4 enlace → código → *token*; CC5 `codigo_no_valido`; CC6 caducidad → proceso terminado y `codigo_no_valido`
- [X] T081 [P] [US2] Ejecutar la batería contra `anthropic` con `fetch` inyectado en `packages/ai/test/contract/anthropic.contract.test.ts`, más AN1 (cliente con `maxRetries: 0`) y AN2 (429 con cabeceras de reinicio → `resetsAt`); `check()` solo usa `models.list()` (y `countTokens` si S4 lo confirma), nunca `messages.create`
- ~~T082~~ Retirada el 2026-10-29 (constitución 2.0.0: la v1 no incluye opción gratuita)
- [X] T083 [P] [US2] Test de almacenes del sistema en `apps/server/test/secrets/select.test.ts` y `apps/server/test/secrets/system-stores.test.ts` con `security` y `secret-tool` falsos en el `PATH`: el valor llega por la entrada estándar y nunca en `argv`; `select` elige keychain en macOS, secret-service si la prueba guardar-leer-borrar termina en ≤ 3 s, y si no `file`; anota `secret_store` y después siempre usa ese, devolviendo `llavero_no_disponible` si deja de funcionar; los errores se registran por código de salida, sin salida estándar

### Implementation para User Story 2

- [X] T084 [US2] Implementar `transition(state, action, context)` puro en `packages/core/src/onboarding/wizard.ts` hasta que pase T076
- [X] T085 [P] [US2] Implementar el repositorio del asistente (`get`, `apply(action, expectedRevision)` en una transacción que también activa la conexión cuando toca, `hasSpendingLimits` para el contexto) en `apps/server/src/db/repos/onboarding.ts`
- [X] T086 [P] [US2] Implementar el repositorio de conexiones en `apps/server/src/db/repos/connections.ts`: `upsert`, `get`, `list`, `setActive(kind)` (desactiva las demás en la misma transacción), `updateStatus`; reglas de `data-model.md`: «una clave solo se guarda si la comprobación termina en `conectada`», «activar `pago_por_uso` exige que `spending_limits` exista», y en `suscripcion` el `status` es «el resumen de las cuentas: `conectada` si alguna lo está; si no, el fallo de la primera cuenta en orden, y con `cupo_agotado` en todas, el `resets_at` más próximo»
- [X] T087 [P] [US2] Implementar el repositorio de cuentas en `apps/server/src/db/repos/accounts.ts`: `create` (label por defecto «Cuenta N», «1–40 caracteres»; `position` al final, «1..n sin huecos»), `list` en orden, `get`, `count` (máximo **5 cuentas** por proveedor), `findByFingerprint`, `updateStatus`, `updateLastCall`; la huella «nunca es el *token* ni un fragmento: es un *hash* SHA-256 del *token*» (S3)
- [X] T088 [P] [US2] Implementar `createMacosKeychain()` con `security -i` y el valor por la entrada estándar en `apps/server/src/secrets/macos-keychain.ts`
- [X] T089 [P] [US2] Implementar `createLinuxSecretService()` con `secret-tool` y el valor por la entrada estándar en `apps/server/src/secrets/linux-secret-service.ts`
- [X] T090 [US2] Implementar `selectSecretStore(platform, settings, logger)` en `apps/server/src/secrets/select.ts` hasta que pase T083
- [X] T091 [P] [US2] Implementar `buildClaudeCommand(profile, account)` en `packages/ai/src/claude-code/command.ts`: flags confirmados en S1, entorno limpio (quita las variables de CC1, añade `CLAUDE_CODE_OAUTH_TOKEN` y `CLAUDE_CONFIG_DIR=<accountDir>`), sin el *token* en `argv`
- [X] T092 [P] [US2] Implementar `classifyClaudeResult(exitCode, stdout, stderr)` → `AiFailure` (R13) con las salidas grabadas en S1 en `packages/ai/src/claude-code/classify.ts`; lo desconocido → `no_disponible / servicio_caido`
- [X] T093 [US2] Implementar el adaptador `claude-code` (`check()` = `claude --version` + llamada mínima con el perfil `comprobacion`; `generate()` con validación Zod y **un reintento** si no valida; tiempo máximo con `AbortSignal`; no registra la salida del proceso) en `packages/ai/src/claude-code/adapter.ts`
- [X] T094 [US2] Implementar `createClaudeLogin(deps)` en `packages/ai/src/claude-code/login.ts`: `claude setup-token` bajo `script` (o el plan de S2), extrae el enlace, un solo inicio a la vez, caducidad a los 10 min con el proceso terminado, `complete(loginId, code: Secret)` escribe el código por la entrada estándar y devuelve `{token: Secret, identity}` según S3; hasta que pase T080
- [X] T095 [P] [US2] Implementar el adaptador `anthropic` (`new Anthropic({apiKey, maxRetries: 0, fetch})`, `check()` = `client.models.list()`, `generate()` con perfil, Zod y **un reintento** si no valida) y su clasificación de errores del SDK en `packages/ai/src/anthropic/adapter.ts` y `packages/ai/src/anthropic/classify.ts` hasta que pase T081
- ~~T096~~ Retirada el 2026-10-29 (constitución 2.0.0: la v1 no incluye opción gratuita)
- [X] T097 [US2] Añadir al registro los descriptores reales `claude-code` (suscripción, con `login`), y `anthropic` (pago por uso) en `packages/ai/src/registry.ts`, manteniendo T045 en verde
- [X] T098 [US2] Implementar `apps/server/src/services/ai-connections.ts`: `overview()`; `saveKey(kind, key)` (comprueba sin coste y solo guarda secreto + fila si queda `conectada`; si no, `ApiError` `ia` con el fallo); `startLogin()` / `completeLogin(loginId, code, label?)` (huella SHA-256 del *token*, duplicada → `conflicto`, sexta → `maximo_de_cuentas`, guarda el *token* en `ytcreator:cuenta:<uuid>`, crea `claude-accounts/<id>/` con `0700`, crea la conexión `suscripcion` si no existía, comprueba la cuenta) / `cancelLogin()`; el registro de errores sigue `{provider, kind, reason, status?, errorType?}`
- [X] T099 [US2] Implementar `GET /api/onboarding` y `POST /api/onboarding/step` en `apps/server/src/http/routes/onboarding.ts` hasta que pase T077
- [X] T100 [US2] Implementar `GET /api/ai`, `POST /api/ai/subscription/login`, `POST /api/ai/subscription/login/:loginId/complete`, `DELETE /api/ai/subscription/login/:loginId` y `PUT /api/ai/connections/:kind/credential` (`kind` = `pago_por_uso`) en `apps/server/src/http/routes/ai.ts` hasta que pase T078
- [X] T101 [US2] Implementar la redirección del asistente en `apps/web/src/router.ts` y `apps/web/src/onboarding/useOnboarding.ts`: sin `completado` y sin `postponed` → paso del servidor; con `postponed` → `/conectar-ia`; recarga el estado en `visibilitychange` y tras un `409` (se coloca en `current` sin perder nada)
- [X] T102 [US2] Crear el armazón del asistente en `apps/web/src/screens/onboarding/WizardShell.tsx`: `Stepper` de `@ytcreator/ui`, acción principal única, «Volver», «Lo haré más tarde», y `AiWorking` durante una comprobación con «Cancelar» si pasa de 5 s (aborta la petición)
- [X] T103 [P] [US2] Crear `AiFailureMessage` (usa `ErrorMessage` de `@ytcreator/ui` y `failures.es.ts`: qué ha pasado, por qué y qué hacer; con `resetsAt`, la hora local) en `apps/web/src/shell/AiFailureMessage.tsx`
- [X] T104 [P] [US2] Añadir a `AppHeader` el indicador de IA (`Badge` con la opción activa y su estado, enlace a `/ajustes/ia`) leyendo `GET /api/ai` en `apps/web/src/shell/AppHeader.tsx`
- [X] T105 [P] [US2] Crear la pantalla `Welcome` (`/bienvenida`), con la nota de lo que hace falta y sus enlaces (FR-018), en `apps/web/src/screens/onboarding/Welcome.tsx` según `contracts/ui-screens.md`
- [X] T106 [P] [US2] Crear la pantalla `ChooseAi` (`/bienvenida/elegir`, `RadioGroup` con las dos opciones, coste y requisitos de cada una, aviso de la nube de FR-030) en `apps/web/src/screens/onboarding/ChooseAi.tsx`
- [X] T107 [P] [US2] Crear `ConnectSubscription` (`/bienvenida/conectar` con suscripción): «Abrir la página de Claude» con el enlace del login, campo para pegar el código, lista de cuentas conectadas, «Añadir otra cuenta» (hasta 5), nota de S3 bajo la lista («no puede saber si dos accesos son de la misma cuenta»), y con `codigo_no_valido` ofrece un enlace nuevo, en `apps/web/src/screens/onboarding/ConnectSubscription.tsx`
- [X] T108 [P] [US2] Crear `ConnectApiKey` (`/bienvenida/conectar` con pago por uso): enlace a la consola de Anthropic, aviso previo de saldo con enlace a facturación (R12), campo de clave tipo contraseña, tras guardar solo el `hint`, en `apps/web/src/screens/onboarding/ConnectApiKey.tsx`
- ~~T109~~ Retirada el 2026-10-29 (constitución 2.0.0: la v1 no incluye opción gratuita)
- [X] T110 [P] [US2] Crear `Done` (`/bienvenida/listo`, resumen de la opción conectada y «Empezar») en `apps/web/src/screens/onboarding/Done.tsx`
- [X] T111 [P] [US2] Crear `ConnectAi` (`/conectar-ia`, explica qué no funcionará sin IA y ofrece «Conectar ahora» → `retomar`) en `apps/web/src/screens/connect-later/ConnectAi.tsx`
- [X] T112 [P] [US2] Crear `Home` (`/inicio`, `EmptyState` con «Crear mi primer canal» **habilitado** como acción principal; abre un `Dialog`: «Crear canales llegará en la próxima versión. Mientras, puedes revisar tu IA en Ajustes») en `apps/web/src/screens/home/Home.tsx`
- [X] T113 [P] [US2] e2e `apps/web/e2e/wizard-subscription.spec.ts` (`ok`): bienvenida con la nota de FR-018 y sus dos enlaces (a los planes de Claude y a la consola de Anthropic) → suscripción → enlace → `ABCD-1234` → «Funciona» → añadir segunda cuenta → listo → inicio, y el indicador de la cabecera muestra la suscripción; en inicio, «Crear mi primer canal» abre el diálogo de «llegará en la próxima versión» y se cierra con teclado
- ~~T114~~ Retirada el 2026-10-29 (constitución 2.0.0: la v1 no incluye opción gratuita)
- [X] T115 [P] [US2] e2e `apps/web/e2e/wizard-resume.spec.ts`: cerrar la pestaña y reiniciar el servidor en cada paso; al volver aparece el mismo paso con lo ya hecho (FR-012)
- [X] T116 [P] [US2] e2e `apps/web/e2e/wizard-postpone.spec.ts`: «Lo haré más tarde» en cada paso → `/conectar-ia`; «Conectar ahora» vuelve al mismo paso
- [X] T117 [P] [US2] e2e `apps/web/e2e/two-tabs.spec.ts`: avanzar en una pestaña y pulsar en la otra → la segunda se coloca en el paso real sin error visible
- [X] T118 [P] [US2] e2e `apps/web/e2e/failures.spec.ts`: con `sin_sesion:clave_no_valida`, `sin_sesion:plan_sin_acceso`, `no_disponible:sin_conexion`, `cupo:<fecha>`, `login:codigo_malo`, `login:duplicada` y `lento`, cada fallo muestra su mensaje y su acción (no «clave no válida» cuando no hay conexión), y `lento` ofrece «Cancelar» a los 5 s (SC-007)

**Checkpoint**: MVP completo (US1 + US2). Se instala y se conecta por suscripción sin Terminal. El pago por
uso guarda la clave, pero solo se activa al terminar US3.

---

## Phase 5: User Story 3 — Fijar límites de gasto antes de gastar (Priority: P2)

**Goal**: con pago por uso, el creador acepta o ajusta tres límites (por operación, diario, mensual) antes de que se
active la opción; los errores se explican campo a campo.

**Independent Test**: con `YTCREATOR_FAKE_AI=ok`, elegir pago por uso, guardar `sk-ant-api03-FAKE…`, ver los valores
propuestos (0,50 €, 3,00 €, 20,00 €), probar valores inválidos, aceptar y llegar a inicio con la opción activa.

### Tests para User Story 3 ⚠️

- [ ] T119 [P] [US3] Test de `validateLimits` en `packages/core/test/spending/limits.test.ts`: propuestos 50, 300 y 2000 céntimos; `debe_ser_positivo` si `perOperationCents <= 0`; `mayor_que_diario` si `dailyCents < perOperationCents`; `mayor_que_mensual` si `monthlyCents < dailyCents`; `demasiado_alto` si `monthlyCents > 100000`; varios errores a la vez, uno por campo; solo enteros
- [ ] T120 [P] [US3] Test de rutas de límites en `apps/server/test/http/limits.test.ts`: `GET /api/settings/limits` sin límites → propuestos con `accepted: false`; `PUT` válido → `accepted: true` y `accepted_at`; `PUT` inválido → `400 validacion` con `fields`; tras aceptar, `continuar` desde `limites` activa `pago_por_uso`

### Implementation para User Story 3

- [ ] T121 [US3] Implementar `PROPOSED_LIMITS` y `validateLimits` (repite los `CHECK`: «`per_operation_cents > 0`», «`daily_cents >= per_operation_cents`», «`monthly_cents >= daily_cents AND monthly_cents <= 100000`») en `packages/core/src/spending/limits.ts` hasta que pase T119
- [ ] T122 [P] [US3] Implementar el repositorio de límites (`get`, `save` con `accepted_at = now`) en `apps/server/src/db/repos/limits.ts`
- [ ] T123 [US3] Implementar `GET /api/settings/limits` y `PUT /api/settings/limits` en `apps/server/src/http/routes/settings.ts` hasta que pase T120
- [ ] T124 [P] [US3] Crear `LimitsForm` (tres `TextField` en euros con coma decimal, conversión exacta a céntimos, error por campo desde `fields`, explicación de qué pasa al llegar a cada límite) en `apps/web/src/screens/settings/LimitsForm.tsx`
- [ ] T125 [US3] Crear la pantalla `Limits` (`/bienvenida/limites`, usa `LimitsForm`, «Aceptar estos límites» → `PUT` y `continuar`) en `apps/web/src/screens/onboarding/Limits.tsx`
- [ ] T126 [US3] e2e `apps/web/e2e/wizard-api-key.spec.ts`: pago por uso → clave con espacios → aviso de saldo visible → límites propuestos → valores inválidos con su mensaje → aceptar → listo → inicio con pago por uso activo

**Checkpoint**: los dos recorridos del asistente funcionan de punta a punta.

---

## Phase 6: User Story 4 — Cambiar de IA o reconectarla cuando falla (Priority: P2)

**Goal**: desde Ajustes, el creador ve el estado real de cada opción y cuenta, comprueba, reconecta, cambia de opción
sin perder las demás, ordena y renombra cuentas, repara Claude Code, y con varias cuentas la app pasa sola a la
siguiente cuando una agota su cupo.

**Independent Test**: con `YTCREATOR_FAKE_AI=cuentas:cupo,ok`, «Comprobar ahora» en suscripción → pasa a la segunda
cuenta y lo avisa; cambiar a pago por uso y volver a suscripción sin reconectar; borrar la última cuenta desactiva la
suscripción.

### Tests para User Story 4 ⚠️

- [ ] T127 [P] [US4] Tests de rotación R1–R6 en `packages/core/test/ai/rotation.test.ts`: (R1) respeta `position`; (R2) cada cuenta se intenta una vez como mucho; (R3) `tiempo_agotado` no rota y se devuelve tal cual; (R4) todas agotadas → no llama y devuelve `cupo_agotado / limite_de_uso`; (R5) con el `resetsAt` más próximo, y si todas están `sin_sesion`, el fallo de la primera; (R6) `cupo_agotado` con `resetsAt` pasado vuelve a ser candidata; `updates` y `switched` correctos
- [ ] T128 [P] [US4] Test de rutas de Ajustes de IA en `apps/server/test/http/ai-settings.test.ts`: `POST /api/ai/active` sin conexión `conectada` → `guard: 'sin_conexion'`, `pago_por_uso` sin límites → `sin_limites`, las demás conexiones se conservan; `POST /api/ai/connections/suscripcion/check` con `cuentas:cupo,ok` → `switched` y estados persistidos; `DELETE /api/ai/connections/:kind/credential` borra secreto y fila y, si estaba activa, ya no hay activa; `PATCH accounts/order` con permutación exacta (si no, 400); `PATCH accounts/:id` con label de 0 o 41 caracteres → 400; `DELETE accounts/:id` borra secreto y carpeta y recompone `position`; borrar la última cuenta → `suscripcion` pasa a `sin_sesion / sesion_caducada` y deja de estar activa; `POST accounts/:id/check` no rota; `POST accounts/:id/login` + `complete` con la misma huella → `200`, *token* sustituido y cuenta `conectada` sin crear otra; con `login:otra_cuenta` → `409 conflicto` y la cuenta no cambia; id inexistente → 404
- [ ] T129 [P] [US4] Test de reparación en `apps/server/test/services/claude-repair.test.ts` con un instalador falso: `POST` → `202 en_curso`; un segundo `POST` en curso no lanza otro; termina en `hecho` o `fallido`; no registra la salida del instalador

### Implementation para User Story 4

- [ ] T130 [US4] Implementar `pickCandidates(accounts, now)` y `runWithRotation(accounts, call, now)` → `{result, updates, switched}` según las reglas 1–5 de `contracts/ai-provider.md` en `packages/core/src/ai/rotation.ts` hasta que pase T127
- [ ] T131 [US4] Ampliar `apps/server/src/services/ai-connections.ts` con `checkConnection(kind)` (suscripción pasa por `runWithRotation`, persiste `updates`, recalcula el resumen y devuelve `switched`), `checkAccount(id)`, `startRelogin(accountId)` (como `startLogin`, pero el inicio queda ligado a esa cuenta y `completeLogin` sustituye su *token* si la huella coincide; si no, `conflicto`), `activate(kind)`, `deleteKey(kind)`, `reorderAccounts(ids)`, `renameAccount(id, label)` y `deleteAccount(id)` (secreto, carpeta `claude-accounts/<id>/`, `position`, y desactivación si era la última)
- [ ] T132 [P] [US4] Implementar `apps/server/src/services/claude-repair.ts`: ejecuta el instalador oficial de Claude Code en segundo plano, uno a la vez, estado `inactivo | en_curso | hecho | fallido`, registra solo el código de salida; hasta que pase T129
- [ ] T133 [US4] Implementar `POST /api/ai/active`, `POST /api/ai/connections/:kind/check`, `DELETE /api/ai/connections/:kind/credential`, `POST /api/ai/subscription/accounts/:id/check`, `POST /api/ai/subscription/accounts/:id/login`, `PATCH /api/ai/subscription/accounts/order`, `PATCH /api/ai/subscription/accounts/:id`, `DELETE /api/ai/subscription/accounts/:id` y `POST`/`GET /api/ai/repair-claude-code` en `apps/server/src/http/routes/ai.ts` hasta que pase T128
- [ ] T134 [US4] Crear `Settings` (`/ajustes`, `Tabs` «IA» | «General») en `apps/web/src/screens/settings/Settings.tsx`
- [ ] T135 [US4] Crear `AiSettings` (`/ajustes/ia`): una `Card` por opción con estado real, última comprobación, «Comprobar ahora», «Usar esta opción», «Cambiar clave», «Quitar», límites (con `LimitsForm`) para pago por uso, `AiFailureMessage` con su acción, y aviso con `Toast` cuando hay `switched`, en `apps/web/src/screens/settings/AiSettings.tsx`
- [ ] T136 [P] [US4] Crear `AccountList` (orden con botones subir/bajar accesibles por teclado, renombrar 1–40 caracteres, comprobar, quitar con `Dialog`, estado y `resetsAt` por cuenta, «Volver a conectar» en las cuentas con `sesion_caducada` (enlace → código, reutiliza la parte de código de `ConnectSubscription`; aviso «Entra con la misma cuenta de Claude»; con `409`, el texto de «acceso ya en otra fila» de `contracts/ui-screens.md`; nota de S3 bajo la lista), «Añadir otra cuenta») en `apps/web/src/screens/settings/AccountList.tsx`
- [ ] T137 [US4] Crear la ruta `/ajustes/ia/cambiar/:kind` que reutiliza `ConnectSubscription` o `ConnectApiKey` fuera del asistente, con la acción final «Usar esta opción» (`POST /api/ai/active`) y sin tocar `onboarding_state`, en `apps/web/src/screens/settings/ChangeAi.tsx`
- [ ] T138 [US4] Añadir «Reparar Claude Code» (visible con `programa_no_instalado`) con `ProgressBar` y consulta de `GET /api/ai/repair-claude-code` cada 2 s mientras está `en_curso` en `apps/web/src/screens/settings/AiSettings.tsx`
- [ ] T139 [P] [US4] e2e `apps/web/e2e/rotation.spec.ts` (`cuentas:cupo,ok`): «Comprobar ahora» → aviso de cambio de cuenta, primera cuenta con su hora de reinicio, segunda «Funciona» (SC-012)
- [ ] T140 [P] [US4] e2e `apps/web/e2e/settings.spec.ts` (pestaña IA): cambiar de suscripción a pago por uso y volver sin reconectar; renombrar y reordenar cuentas; una cuenta con `sesion_caducada` muestra «Volver a conectar» y, tras pegar `ABCD-1234`, vuelve a «Funciona» sin duplicarse; quitar la última cuenta → la cabecera indica que no hay IA activa

**Checkpoint**: la IA se gestiona entera desde Ajustes y la rotación funciona sin intervención.

---

## Phase 7: User Story 5 — Actualizar sin perder nada (Priority: P3)

**Goal**: como mucho una vez al día, la app consulta si hay una versión nueva (sin enviar datos del creador) y lo
avisa; pegar la misma línea actualiza conservando datos, conexiones y límites, y si la migración falla todo queda
como estaba.

**Independent Test**: instalar `v1` con datos, publicar `v2` en la release local, ver el aviso, ejecutar la línea:
arranca `v2` con todo intacto; con una migración que falla, código 60 y la base restaurada byte a byte.

### Tests para User Story 5 ⚠️

- [ ] T141 [P] [US5] Test de `compareVersions` y `isNewer` (semver, prerelease menor que release) en `packages/core/test/updates/version.test.ts`
- [ ] T142 [P] [US5] Test de la consulta de versiones en `apps/server/test/updates/version-check.test.ts` con `fetch` y reloj inyectados: como mucho una consulta cada 24 h (`last_update_check_at`); la petición no lleva cabeceras ni parámetros con datos del creador (ni `instanceId`, ni versión del sistema más allá de lo estándar); desactivada (`update_check_enabled = '0'`) → cero peticiones; un fallo de red se ignora en silencio y solo se registra. Cubre FR-031: es la única llamada saliente de toda la feature, y aquí se verifica que no lleva datos del creador
- [ ] T143 [P] [US5] Test de rutas en `apps/server/test/http/updates.test.ts`: `GET /api/updates` no hace peticiones de red; `show` solo si hay versión nueva, el aviso está activado y no se ha descartado; `POST /api/updates/dismiss`; `GET`/`PATCH /api/settings/general` con `aiTimeoutSeconds` 10–300 o `null` (9 y 301 → 400)
- [ ] T144 [US5] Añadir los casos 6 y 7 de `contracts/installer.md` a `installer/test/install.test.ts`: (6) actualización de `v1` a `v2` con datos → datos y secretos de prueba intactos, `current` → `v2`, `v1` conservada; (7) migración que falla → 60, base restaurada byte a byte, `current` → `v1`

### Implementation para User Story 5

- [ ] T145 [US5] Implementar `compareVersions` e `isNewer` en `packages/core/src/updates/version.ts` hasta que pase T141
- [ ] T146 [US5] Implementar `createVersionCheck({fetch, now, settings, logger})` (consulta la última release pública una vez al día tras el arranque, guarda `latest_version` y `last_update_check_at`) en `apps/server/src/updates/version-check.ts` y lanzarlo desde `apps/server/src/main.ts`, hasta que pase T142
- [ ] T147 [US5] Implementar `GET /api/updates`, `POST /api/updates/dismiss` en `apps/server/src/http/routes/updates.ts` y `GET`/`PATCH /api/settings/general` en `apps/server/src/http/routes/settings.ts`, hasta que pase T143; aplicar `ai_timeout_seconds` en `resolveProfile`
- [ ] T148 [P] [US5] Crear `UpdateNotice` (aviso no intrusivo con la línea para copiar, botón «Copiar» y «Ahora no» → `dismiss`) en `apps/web/src/shell/UpdateNotice.tsx` y montarlo en `apps/web/src/App.tsx`
- [ ] T149 [P] [US5] Crear `GeneralSettings` (`/ajustes/general`: `Switch` del aviso de versiones, versión actual, y `Disclosure` «Modo experto» con el tiempo máximo de la IA en segundos, 10–300 o vacío) en `apps/web/src/screens/settings/GeneralSettings.tsx`
- [ ] T150 [US5] Implementar la actualización (R21) en el paso 6 de `installer/install.sh`: si `install.json` tiene otra versión, `SIGTERM` al `pid` de `instance.json` y espera; copia de la base en `backups/ytcreator-<anterior>-<fecha>.db` (se conservan 3); `migrate` con la versión nueva; cambio atómico de `current`; conserva la versión anterior en `versions/`; si falla, restaura la copia, `current` queda como estaba y sale con 60; hasta que pase T144
- [ ] T151 [US5] Ampliar `apps/web/e2e/settings.spec.ts` con la pestaña General: desactivar el aviso, cambiar el tiempo máximo (valor fuera de rango con su mensaje) y comprobar que persiste tras recargar

**Checkpoint**: todas las historias funcionan por separado y juntas.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: garantías transversales, publicación y validación final.

- [ ] T152 [P] e2e de fuga de secretos en `apps/web/e2e/secrets-leak.spec.ts` según `contracts/secrets.md`: conectar las dos opciones con `sk-ant-oat-FAKE…` y `sk-ant-api03-FAKE…`, recorrer comprobación, fallo, borrado y cambio de opción, y buscar las dos cadenas (completas y sin los 4 últimos caracteres) en `APP_HOME/logs/`, todo `~/YTCreator` (base en binario incluida), cuerpos HTTP capturados, DOM y `localStorage` de cada pantalla, y `git ls-files`: cero apariciones (SC-006)
- [ ] T153 [P] e2e de accesibilidad en `apps/web/e2e/a11y.spec.ts`: axe sin violaciones en cada pantalla de `contracts/ui-screens.md`, en tema claro y oscuro, a 375 px y con zoom al 200 %; recorrido completo del asistente solo con teclado y foco visible (SC-010)
- [ ] T154 [P] Crear `.github/workflows/release.yml`: en etiquetas `v*`, compila con `mode=production` (sin proveedor falso), empaqueta `ytcreator-<v>.tar.gz` (`server.mjs`, `web/`, `bin/ytcreator`, `VERSION`), genera `SHA256SUMS`, sella `install.sh` con `installer/stamp.sh` y publica los tres como recursos de la release; comprueba que `server.mjs` no contiene el proveedor falso
- [ ] T155 Pasada final del glosario: ejecutar `apps/web/test/glossary.test.ts` y revisar a mano todos los textos de `apps/web/src/strings/` e `installer/install.sh` contra el glosario de la constitución
- [ ] T156 Ejecutar `fnm exec --using=24 -- pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:installer` y `pnpm test:e2e` completos y corregir lo que falle
- [ ] T157 Recorrer `specs/002-onboarding/quickstart.md` §2–§4 y §7–§8 (desarrollo local, instalador en macOS y Linux con y sin escritorio, cortes en cada paso, actualización, dos pestañas) y anotar el resultado en `specs/002-onboarding/checklists/validation.md`
- [ ] T158 Pruebas manuales con proveedores reales de `quickstart.md` §5 y §6 (las hace el creador con sus cuentas): suscripción, clave con y sin saldo, clave revocada, sin Wi-Fi, 0 € en la consola de Anthropic, y búsqueda de las claves reales; anotar en `specs/002-onboarding/checklists/validation.md`
- [ ] T159 Auditoría de novato de `quickstart.md` §9 (0 problemas graves, ≤ 3 medios) con una persona que no ha usado nunca la terminal; anotar hallazgos y correcciones en `specs/002-onboarding/checklists/validation.md`
- [ ] T160 Actualizar el estado de la feature 002 y los comandos nuevos (`test:installer`, dev de server y web) en `CLAUDE.md`

---

## Dependencies & Execution Order

### Dependencias entre fases

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y **bloquea** todas las historias. Dentro de la fase:
  - S5 (T017) bloquea T025–T028 (base de datos);
  - S1 (T013) y S2/S3 (T014–T015) no bloquean la fase, pero sí T091–T094 de US2; S4 (T016) bloquea T095.
    S6 (T018) está retirado.
- **US1 (Phase 3)**: depende de Foundational. T011 (CI) va después de T072 porque necesita el servidor compilado,
  `installer/stamp.sh` y el lanzador.
- **US2 (Phase 4)**: depende de Foundational. Es independiente de US1 en desarrollo (se prueba con `pnpm dev` y
  e2e); juntas forman el MVP.
- **US3 (Phase 5)**: depende de US2 (pantalla de clave y máquina del asistente).
- **US4 (Phase 6)**: depende de US2 (conexiones, cuentas, servicio). T135 usa `LimitsForm` de US3.
- **US5 (Phase 7)**: depende de US1 (instalador, instancia) y de Foundational (ajustes). T149 vive en `Settings` de
  US4.
- **Polish (Phase 8)**: depende de todas las historias.

### Dentro de cada historia

- Tests primero y en rojo → core → repositorios → servicios → rutas → pantallas → e2e.
- Una tarea con el mismo fichero que otra pendiente no lleva `[P]`.

### Grafo

```text
Setup → Foundational ─┬─▶ US1 ───────────────┬─▶ US5 ─┐
                      └─▶ US2 ─┬─▶ US3 ─┐     │        ├─▶ Polish
                               └────────┴─▶ US4 ──────┘
```

---

## Parallel Examples

### Foundational

```text
T013 S1 · T014 S2 · T015 S3 · T016 S4 · T017 S5                  (spikes en paralelo)
T019 tipos del puerto · T020 test de Secret · T022 SecretStore · T023 registro del core
T029 paths · T030 logging · T032 guardia · T036 file-store · T038 ajustes
T048 cliente · T049 textos · T050 glosario · T051 cobertura
```

### User Story 1

```text
T054 helpers del instalador · T055 make-release · T057 instancia · T058 rutas de app · T059 CLI
T061 health/app · T072 stamp.sh · T163 README
```

### User Story 2

```text
T076 wizard · T077 rutas del asistente · T078 rutas de conexión · T079 fake-claude · T081 anthropic · T083 almacenes
T085 repo asistente · T086 repo conexiones · T087 repo cuentas · T088 keychain · T089 secret-service
T091 command · T092 classify · T095 anthropic
T103–T112 pantallas y piezas de la cabecera
T113–T118 e2e
```

### User Story 3

```text
T119 test de límites · T120 test de rutas · T122 repo · T124 LimitsForm
```

### User Story 4

```text
T127 rotación · T128 rutas · T129 reparación · T132 claude-repair · T136 AccountList · T139 e2e rotación · T140 e2e ajustes
```

### User Story 5

```text
T141 versión · T142 consulta · T143 rutas · T148 UpdateNotice · T149 GeneralSettings
```

---

## Implementation Strategy

### MVP primero (US1 + US2)

1. Phase 1 Setup.
2. Phase 2 Foundational, con los spikes cerrados y anotados (S2 es el más arriesgado: si falla, parar y decidir con
   el creador antes de seguir con la suscripción).
3. Phase 3 US1: la línea instala, abre y cierra la app.
4. Phase 4 US2: el asistente conecta la suscripción.
5. **Parar y validar**: el recorrido de suscripción de punta a punta; el de pago por uso se completa en US3.
6. Enseñarlo al creador para su aprobación.

### Entrega incremental

1. Setup + Foundational → base lista.
2. US1 + US2 → MVP instalable y conectable.
3. US3 → pago por uso con límites.
4. US4 → gestión desde Ajustes y rotación de cuentas.
5. US5 → actualizaciones.
6. Polish → fuga de secretos, accesibilidad, release y validación manual.

Cada historia añade valor sin romper las anteriores; la CI debe quedar en verde al final de cada fase.

---

## Notes

- `[P]` = ficheros distintos y sin dependencias pendientes.
- Verificar que cada test falla antes de implementar.
- Un commit por tarea o grupo lógico, solo cuando el creador lo pida.
- Parar en cada checkpoint para validar la historia por separado.
- Si un spike cambia una decisión, actualizar `research.md`, `plan.md` y los contratos antes de tocar código.
- Las tareas que necesitan cuentas reales (T014, T015, T158, T159) las ejecuta el creador; el resto no debe
  depender de ellas.

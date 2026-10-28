# Implementation Plan: Onboarding — instalación y elección de la IA

**Branch**: `002-onboarding` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-onboarding/spec.md`

## Summary

Esta feature convierte el design system de la 001 en una app que se instala, arranca y habla con una IA. Tiene cinco
piezas:

- **`installer/install.sh`:** la línea de instalación (`curl … | bash`) para macOS y Linux. Ocho pasos que se
  comprueban por inspección (no por marcas a ciegas), descargas reanudables con suma de verificación, sin permisos de
  administrador. Descarga un Node 24 propio y una versión ya compilada de YTCreator, instala Claude Code con su
  instalador oficial, prepara los datos y deja un acceso directo. Repetirlo actualiza (R1–R3, R6, R21).
- **`apps/server`:** Node + Hono, solo en `127.0.0.1`, con instancia única, protección de `Host`/`Origin`, SQLite con
  `node:sqlite` y migraciones, secretos en el llavero del sistema (o en un fichero `0600`), aviso diario de versiones
  y registros sin secretos (R4, R5, R7, R8, R20, R22).
- **`packages/core`:** el puerto `AiProvider` con capacidades declaradas, los fallos tipados con su motivo, el
  registro de adaptadores, la rotación de cuentas de suscripción, la máquina de estados del asistente, los límites de
  gasto y los esquemas Zod compartidos con la web (R9, R13, R14, R17, R18).
- **`packages/ai`:** tres adaptadores — suscripción de Claude (Claude Code CLI, con inicio de sesión desde la app),
  API de Anthropic (SDK oficial, sin reintentos) y Gemini gratis (`fetch`, sin SDK) — más un proveedor falso
  determinista y la batería de contrato común (R10–R12, R15, R16, R23).
- **`apps/web`:** el asistente de primer arranque, la pantalla «conecta tu IA», la pantalla de inicio y Ajustes (IA y
  General), construidos solo con componentes de `@ytcreator/ui` y textos en catálogo (R18, R19).

El riesgo principal es el **inicio de sesión de la suscripción sin terminal** (FR-016, SC-011): depende de envolver
`claude setup-token` en una pseudoterminal. Se valida con un *spike* antes de construir la pantalla, con dos planes B
documentados (R11).

## Technical Context

**Language/Version**: TypeScript `strict` (+ `erasableSyntaxOnly`) sobre Node 24 LTS; Bash (POSIX + bash 3.2, el de
macOS) solo para el instalador y el lanzador (ver Complexity Tracking).

**Primary Dependencies**: Hono + `@hono/node-server`, Zod 4, `@anthropic-ai/sdk`, React 19 + Vite (ya en el repo),
`@ytcreator/ui` y `@ytcreator/tokens`. Sin ORM, sin router, sin librería de llavero ni SDK de Gemini. Detalle y
justificación en [research.md](./research.md) y en «Dependencias nuevas».

**Storage**: SQLite (`node:sqlite`) en la carpeta de trabajo (`~/YTCreator/ytcreator.db`) con migraciones SQL
versionadas; `install.json` e `instance.json` en la carpeta interna de la app; secretos en el llavero del sistema o
en `secrets/secrets.json` (`0600`), siempre fuera de la carpeta de trabajo (R3, R7, R8).

**Testing**: Vitest (dominio, servidor con SQLite en memoria, adaptadores contra la batería de contrato con
transporte falso, instalador en un `HOME` temporal); Playwright + `@axe-core/playwright` sobre `apps/web` en ambos
temas y a 375 px; test de fuga de secretos (SC-006); `shellcheck` en CI; auditoría de novato (R23).

**Target Platform**: macOS 13+ (Apple Silicon e Intel) y Linux x64/arm64 con glibc (Ubuntu 22.04+, Debian 12+,
Fedora 40+). Navegadores: los dos últimos de Chrome, Edge, Firefox y Safari.

**Project Type**: app web local (servidor Node que sirve una SPA de React) + instalador de shell, dentro del monorepo
pnpm.

**Performance Goals**:

- instalación completa ≤ 15 min con conexión doméstica (SC-001); la descarga total ronda 60–70 MB (Node + app);
- el acceso directo abre el navegador en ≤ 5 s si la app estaba apagada y en ≤ 1 s si ya estaba en marcha;
- el servidor arranca en ≤ 2 s (migraciones incluidas en una base vacía);
- comprobación de IA con tiempo máximo: 30 s para API y Gemini, 60 s para Claude Code (arranque del programa).

**Constraints**:

- 0 € en todo el recorrido (SC-004); ningún secreto en registros, repositorio, interfaz ni carpeta de trabajo
  (SC-006);
- escucha solo en `127.0.0.1`, con `Host` y `Origin` comprobados (R5);
- sin telemetría; la consulta de versiones no envía datos del creador (FR-009b);
- ningún paso del instalador pide `sudo` en la v1 (FR-005);
- sin reintentos automáticos de IA (`maxRetries: 0`), salvo el único reintento de una salida que no valida su
  esquema, y con tiempo máximo explícito por uso (principio IV);
- WCAG 2.2 AA en ambos temas, 375 px, zoom 200 %.

**Scale/Scope**: 1 creador por instalación; 3 opciones de IA y N cuentas de suscripción (pensado para 1–5); ~10
pantallas/pasos; ~23 rutas de API; 8 pasos de instalación; 1 migración inicial.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ver `.specify/memory/constitution.md` (v1.0.0). Marcar cada puerta como ✅ cumple, ➖ no aplica o ❌ viola (si viola,
justificar en «Complexity Tracking»).

| # | Puerta | Estado | Nota |
|---|--------|--------|------|
| I | Una acción principal por pantalla, sin jerga (test de glosario), lo avanzado plegado tras «Modo experto», errores para personas | ✅ | Cada paso del asistente y cada pantalla tiene una sola acción principal y su frase de «por qué» ([ui-screens](./contracts/ui-screens.md)). El test de glosario de la 001 se extiende a los catálogos de `apps/web` y a los textos del instalador. El tiempo máximo de la IA vive en «Modo experto». Cada fallo tipado + motivo tiene su mensaje con acción (R13) |
| II | Todo lo generado se puede aprobar, editar y regenerar, con versiones; nada externo sin una acción explícita; dato ≠ opinión | ✅ | No hay generación de contenido. Las comprobaciones de IA y la reparación de Claude Code solo ocurren tras una acción del creador. La consulta de versiones está aclarada en la spec (FR-009b): no envía datos y se puede desactivar |
| III | Coste estimado en euros antes de gastar, dentro de los límites de gasto, con un camino sin coste | ✅ | Todo cuesta 0 € (R12): la API y Gemini se comprueban listando modelos; la suscripción con una llamada mínima que no se factura en euros. Los límites se guardan ya (R17). La tabla de precios y el registro de consumo llegan con la primera operación con coste (feature 003+); aquí no hay nada que registrar. Suscripción y Gratis son el camino sin coste |
| IV | La IA solo a través del puerto `AiProvider`; prompts versionados que valen para cualquier modelo; salida validada con Zod; errores tipados; uso explícito | ✅ | Puerto con capacidades, registro de adaptadores (añadir uno = adaptador + una línea), fallos tipados con motivo, `maxRetries: 0`, perfil de modelo y tiempo por uso (`comprobacion`), prompt de comprobación en `packages/knowledge` (R9–R16) |
| V | Conocimiento en paquetes versionados con fuente y fecha; datos de mercado reales y citados; reglas de escritura humana | ➖ | Sin conocimiento de YouTube. `packages/knowledge` nace solo con el prompt versionado de la comprobación |
| VI | Solo tokens (ningún valor suelto), `@layer` + CSS Modules, temas claro y oscuro, WCAG 2.2 AA, 375 px, componente documentado | ✅ | Pantallas compuestas con componentes de `@ytcreator/ui`; los estilos de `apps/web` pasan el mismo Stylelint. Si hiciera falta un componente nuevo, se añade a `packages/ui` con su ficha en el catálogo antes de usarlo |
| VII | Datos en local y exportables, secretos protegidos, autenticación en VPS, sin telemetría por defecto | ✅ | `127.0.0.1` + guardia de `Host`/`Origin` (R5); secretos en llavero o `0600`, fuera de la carpeta de trabajo (R8); tipo `Secret` que no se serializa y redactor en registros (R22); sin telemetría; instalación de una línea, repetible y reanudable (R2). VPS fuera de alcance (spec) |
| VIII | Dentro del alcance de la v1; lo que surja va al backlog | ✅ | Fuera: servidor/VPS, Windows, desinstalador, binarios de YouTube y transcripción (el instalador queda preparado para añadir pasos) |
| IX | Tests unitarios, de contrato de los adaptadores con IA falsa, e2e + axe y auditoría de novato prevista | ✅ | Batería de contrato común para los tres adaptadores y el falso; e2e + axe del asistente y Ajustes en ambos temas; test de fuga de secretos; test del instalador interrumpiendo en cada paso; auditoría de novato del recorrido completo (R23, quickstart) |
| X | La opción más simple; cada dependencia nueva justificada | ✅ | `node:sqlite`, CLIs del sistema para el llavero, `fetch` para Gemini, router propio y Vite para empaquetar el servidor evitan cinco dependencias. Las que entran se justifican abajo. Desviaciones en Complexity Tracking |

**Re-evaluación tras la Fase 1:** sin cambios en las puertas. El diseño añade dos abstracciones, ambas con caso de
uso real en esta feature: el puerto `SecretStore` (tres implementaciones: llavero de macOS, Secret Service de Linux y
fichero `0600`) y el puerto `SubscriptionLogin` (lo exige FR-015: otra suscripción = otro adaptador). Los contratos no
exponen ningún secreto en respuestas (solo `hint` de 4 caracteres) y el servidor devuelve códigos, nunca textos, para
que todos los mensajes vivan en el catálogo de la web.

### Dependencias nuevas

| Dependencia | Qué resuelve | Alternativa sin ella | Coste de mantenimiento |
|---|---|---|---|
| `hono`, `@hono/node-server` | Servidor HTTP, rutas, estáticos de la SPA; lo fija la constitución | `node:http` a mano (enrutado, cuerpo, estáticos) | Bajo |
| `zod` (v4) | Esquemas compartidos cliente-servidor y validación de salidas de IA; lo fija la constitución | Validación a mano duplicada | Bajo |
| `@anthropic-ai/sdk` | Adaptador de la API de Anthropic con errores tipados y `fetch` inyectable para los tests | `fetch` a mano: la guía oficial exige el SDK en proyectos TS y perderíamos los tipos de error | Bajo (sigue la API) |
| `shellcheck` (solo CI, preinstalado en los runners de GitHub) | Lint del instalador y del lanzador | Revisar Bash a ojo | Nulo |
| `@playwright/test`, `@axe-core/playwright` | Ya están en el repo (001); `apps/web` los reutiliza | — | — |

**Descartadas a propósito** (X): `better-sqlite3` (plan B de R7), `keytar`/`@napi-rs/keyring` (plan B de R8),
`node-pty` (plan B de R11), `@google/genai` (R16), `react-router` y TanStack Query (R19), `pino` (R22), `esbuild`
directo (R24, Vite ya lo trae).

## Project Structure

### Documentation (this feature)

```text
specs/002-onboarding/
├── plan.md              # este fichero
├── research.md          # decisiones R1–R24 y spikes
├── data-model.md        # Instalación, Instancia, Estado del asistente, Conexión de IA, Cuenta de suscripción,
│                        # Límites de gasto, Ajustes, Secreto
├── quickstart.md        # guía de validación
├── contracts/
│   ├── installer.md     # la línea, los 8 pasos, carpetas, lanzador, variables, códigos de salida
│   ├── ai-provider.md   # puerto AiProvider, SubscriptionLogin, registro, fallos, usos, batería de contrato
│   ├── secrets.md       # puerto SecretStore, implementaciones, garantías
│   ├── http-api.md      # rutas, esquemas Zod, guardia Host/Origin, errores
│   └── ui-screens.md    # rutas de la web, acción principal, textos, accesibilidad
└── tasks.md             # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
installer/
├── install.sh               # la línea: curl -fsSL …/releases/latest/download/install.sh | bash
└── test/                    # install.test.ts: HOME temporal, curl/claude falsos, corte en cada paso

apps/server/                 # @ytcreator/server
├── src/
│   ├── main.ts              # serve: lock de instancia, migraciones, Hono en 127.0.0.1
│   ├── cli.ts               # `serve` | `migrate` | `open` (lo usan el instalador y el lanzador)
│   ├── paths.ts             # carpetas por sistema (R3)
│   ├── instance.ts          # instance.json, puerto libre, apagado ordenado
│   ├── http/
│   │   ├── app.ts           # composición de rutas + estáticos de apps/web
│   │   ├── guard.ts         # Host/Origin/Content-Type (R5)
│   │   └── routes/          # health, app, onboarding, ai, settings, updates
│   ├── db/
│   │   ├── open.ts, migrate.ts
│   │   ├── migrations/      # 0001_onboarding.sql
│   │   └── repos/           # onboarding, connections, accounts, limits, settings
│   ├── secrets/             # macos-keychain.ts, linux-secret-service.ts, file-store.ts, select.ts
│   ├── updates/             # version-check.ts (una vez al día, silencioso)
│   ├── services/            # ai-connections.ts (orquesta core + ai + secretos), claude-repair.ts
│   └── logging.ts           # JSON lines con redacción (R22)
├── bin/ytcreator            # lanzador Bash que va en la versión publicada (R6)
├── test/
└── vite.config.ts           # build SSR → dist/server.mjs, todo empaquetado (R24)

apps/web/                    # @ytcreator/web
├── index.html
├── src/
│   ├── main.tsx, App.tsx, router.ts
│   ├── api/client.ts        # fetch + parseo con los esquemas de @ytcreator/core/api
│   ├── strings/             # es.ts (catálogo), failures.es.ts (fallo + motivo → mensaje y acción)
│   ├── shell/               # AppHeader (indicador de IA, Ajustes, Cerrar), UpdateNotice, AiFailureMessage
│   ├── onboarding/          # useOnboarding.ts (hook de redirección y recarga del estado)
│   └── screens/
│       ├── onboarding/      # Welcome, ChooseAi, ConnectSubscription, ConnectApiKey, ConnectFree, Limits, Done
│       ├── connect-later/   # ConnectAi (pantalla de «lo haré más tarde»)
│       ├── home/            # Home («Crear mi primer canal»)
│       └── settings/        # Settings (Tabs IA | General), AiSettings, AccountList, LimitsForm, GeneralSettings,
│                             # ChangeAi (cambiar de opción fuera del asistente)
├── test/                    # glossary (catálogos web + instalador), strings-coverage
├── e2e/                     # wizard-*, two-tabs, failures, rotation, settings, shutdown, secrets-leak, a11y
└── playwright.config.ts     # arranca el servidor con YTCREATOR_FAKE_AI y una carpeta temporal

packages/core/               # @ytcreator/core (dominio y puertos, sin SDK de IA)
├── src/
│   ├── ai/                  # port.ts, capabilities.ts, failures.ts, uses.ts, registry.ts, rotation.ts
│   ├── onboarding/          # wizard.ts (máquina de estados)
│   ├── spending/            # limits.ts (validación, valores por defecto)
│   ├── secrets/             # port.ts (SecretStore), secret.ts (tipo Secret)
│   ├── updates/             # version.ts (comparación semver)
│   └── api/                 # esquemas Zod compartidos: onboarding, ai, settings, updates, errors
└── test/

packages/ai/                 # @ytcreator/ai (adaptadores)
├── src/
│   ├── claude-code/         # adapter.ts, command.ts (perfil por uso, entorno limpio), classify.ts, login.ts
│   ├── anthropic/           # adapter.ts, classify.ts
│   ├── gemini/              # adapter.ts, classify.ts
│   ├── fake/                # fake-provider.ts, fake-login.ts, scenarios.ts
│   ├── profiles.ts          # modelo, esfuerzo y tiempo por uso y adaptador
│   └── registry.ts          # registro de los adaptadores de la v1
└── test/
    ├── contract/            # battery.ts + <adaptador>.contract.test.ts
    └── fixtures/            # fake-claude (ejecutable), salidas grabadas de setup-token y de errores

packages/knowledge/          # @ytcreator/knowledge (mínimo)
└── prompts/comprobacion/v1.md

.github/workflows/
├── ci.yml                   # + shellcheck, + test del instalador en ubuntu y macos
└── release.yml              # en etiqueta v*: build, tarball, SHA256, install.sh como recurso de la versión
```

**Structure Decision**: monorepo pnpm según las restricciones técnicas de la constitución. Esta feature crea
`apps/web`, `apps/server`, `packages/core`, `packages/ai` y un `packages/knowledge` mínimo, y añade `installer/` en la
raíz. Los esquemas Zod compartidos viven en `packages/core` (subruta `@ytcreator/core/api`) para no crear un paquete
de contratos aparte. `apps/catalog` no cambia salvo que haga falta documentar un componente nuevo.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Código en Bash (`installer/install.sh`, `apps/server/bin/ytcreator`) en un monorepo «TypeScript en todo» | La línea de instalación corre **antes** de que exista Node en el equipo (FR-001), y el acceso directo debe arrancar la app sin depender del `PATH` del usuario | Pedir Node o Homebrew de antemano rompe «una línea» para un novato. Un binario compilado (Node SEA, Go) añade una cadena de compilación por sistema. El Bash se limita a orquestar; la lógica (migraciones, puerto, instancia) vive en `server.mjs` y se invoca desde el script |
| Carpeta `installer/` fuera de `apps/` y `packages/` | No es una app ni una librería: es un único fichero que se publica como recurso de cada versión | Meterlo en `apps/server` lo acoplaría al empaquetado del servidor y lo escondería |
| Inicio de sesión envolviendo `claude setup-token` en una pseudoterminal (`script`) | FR-016 y SC-011: entrar en la suscripción sin terminal. Claude Code no ofrece otra vía no interactiva | Implementar el OAuth de Claude a mano suplantaría a Claude Code (frágil y contra sus condiciones). `node-pty` es dependencia nativa: queda como plan B (R11) |

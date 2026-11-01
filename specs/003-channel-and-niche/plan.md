# Implementation Plan: Canal y nicho — perfil del canal, nicho y posicionamiento

**Branch**: `003-channel-and-niche` | **Date**: 2026-10-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-channel-and-niche/spec.md`

## Summary

Esta feature es la primera que **usa** la IA para producir algo y la primera que lee **datos reales de YouTube**. Da
al creador un perfil de canal guardado, con versiones, por dos recorridos: canal nuevo (intereses → nichos medidos →
concepto → nombre) y canal que ya existe (URL o @ → lectura → perfil actual → posicionamiento). Tiene seis piezas:

- **Puerto `YouTubeData`** (`packages/core/src/youtube`) con tres adaptadores en `packages/youtube`:
  - **yt-dlp + RSS** (por defecto, sin clave, sin coste): búsqueda de vídeos, pestañas de un canal, comprobación de
    la @;
  - **YouTube Data API v3** (opcional, con clave en «Modo experto»): lo mismo con cuota diaria y aviso antes de
    agotarla;
  - **falso** con salidas grabadas (`YTCREATOR_FAKE_YOUTUBE`), para los tests y el e2e.

  yt-dlp es un binario externo y solo se llama desde su adaptador (R1–R4).
- **Medidas de mercado** (`packages/core/src/market`): demanda, puerta de entrada para canales pequeños,
  concentración y saturación. Son funciones puras sobre los datos del puerto, con umbrales leídos del paquete de
  conocimiento y siempre con fuente y fecha. Las cuatro medidas de cada nicho van en paralelo para caber en
  SC-003 (R5, R6).
- **Usos de IA nuevos** con su prompt versionado, su esquema Zod y su perfil por proveedor:
  - `preguntas`, `nichos`, `conceptos`, `nombres`, `lectura_canal` y `posicionamiento`;
  - `AiRequest` gana un campo `input` para separar el prompt fijo de los datos de cada llamada;
  - la IA nunca recibe permiso para dar cifras de mercado: las cifras se calculan y se le pasan, y un validador
    rechaza las que no vengan de los datos (R7–R10).
- **Paquete de conocimiento de mercado** (`packages/knowledge/market`), con fuente y fecha de revisión:
  - YPP actual y desde el 2027-02-01, RPM por nicho (global y en español), «hecho para niños», contenido no auténtico
    y Shorts;
  - umbrales de las medidas y del semáforo de nombres;
  - tabla de precios de los modelos con su tipo de cambio fechado;
  - reglas de escritura humana (R11).
- **Coste**: un registro `ai_usage` del consumo real y una estimación en euros antes de cada operación con coste. El
  botón muestra la estimación y el clic es la confirmación; si supera algún límite, la operación no se lanza y se
  explica por qué. Con la suscripción, 0 € y sin estimación (R12, R13).
- **`apps/web`**: los dos recorridos, el perfil del canal con su historial de versiones y la exportación a Markdown
  y JSON. Todo con componentes de `@ytcreator/ui` y textos en catálogo (R14–R17).

El riesgo principal es la **fragilidad de yt-dlp** (cambios de YouTube que rompen la extracción, límites de
frecuencia) y el tiempo de las búsquedas. Se mitiga así (R2–R4):

- adaptador aislado con su batería de contrato;
- versión fijada con suma de verificación y actualizable desde el instalador y desde Ajustes;
- tiempo máximo por llamada;
- caché de 24 h por consulta;
- la API de datos como alternativa;
- si no hay datos, se dice: nunca se inventan cifras.

## Technical Context

**Language/Version**: TypeScript `strict` (+ `erasableSyntaxOnly`) sobre Node 24 LTS; Bash 3.2 solo para el paso nuevo
del instalador.

**Primary Dependencies**: las de la 002 (Hono, Zod 4, `@anthropic-ai/sdk`, React 19 + Vite, `@ytcreator/ui`). Sin
paquetes npm nuevos. Un binario externo nuevo: **yt-dlp**, que instala el instalador con suma de verificación (R2). La
YouTube Data API se llama con `fetch`, sin SDK de Google (R3).

**Storage**: la misma SQLite (`~/YTCreator/ytcreator.db`) con la migración `0002_channel.sql`. La clave opcional de la
YouTube Data API va en el `SecretStore` de la 002 (llavero o fichero `0600`). La caché de consultas de YouTube va en
una tabla con caducidad (R4, R15).

**Testing**:

- Vitest:
  - medidas de mercado con conjuntos fijos;
  - validador «sin cifras inventadas»;
  - estimación de coste y regla de presupuesto;
  - esquemas de cada uso de IA;
  - servidor con SQLite en memoria.
- Batería de contrato común para los tres adaptadores de `YouTubeData`, con salidas grabadas de yt-dlp y de la API.
- La batería de contrato de IA de la 002 se amplía con los usos nuevos.
- Playwright + axe de los dos recorridos en ambos temas y a 375 px, con YouTube e IA falsos. El escenario «la IA
  inventa cifras» de SC-002 va incluido.
- Test del paso nuevo del instalador.
- Auditoría de novato (R18).

**Target Platform**: las de la 002 (macOS 13+, Linux x64/arm64 con glibc). yt-dlp tiene binario autónomo para ambos
(`yt-dlp_macos`, `yt-dlp_linux`, `yt-dlp_linux_aarch64`).

**Project Type**: app web local (servidor Node + SPA de React) dentro del monorepo pnpm.

**Performance Goals**:

- medidas de los 3–5 nichos en ≤ 2 min en total (SC-003): 4 medidas en paralelo por nicho, con un máximo de 3 procesos
  yt-dlp a la vez y 45 s de tiempo máximo por llamada;
- resumen de un canal existente en ≤ 1 min (SC-005): una lectura plana de hasta 200 vídeos (`--flat-playlist`) más la
  llamada de IA;
- semáforo de 6–8 nombres en ≤ 30 s (comprobaciones de @ en paralelo, como máximo 4 a la vez);
- las respuestas de la IA con su perfil por uso: 60–120 s de tiempo máximo según el uso (R9).

**Constraints**:

- ninguna cifra de mercado sale de la IA: o viene de datos medidos con fuente y fecha, o no se muestra (SC-002,
  FR-010);
- ninguna operación con coste sin estimación en euros visible antes y dentro de los límites de gasto (principio III);
- las consultas a YouTube cuestan 0 € al creador (FR-030);
- la clave de la YouTube Data API nunca en registros, Git, la interfaz ni la carpeta de trabajo; como mucho una
  `hint` de 4 caracteres (FR-033);
- todo funciona sin clave de YouTube;
- WCAG 2.2 AA en ambos temas, 375 px, zoom 200 %.

**Scale/Scope**:

- 1 creador, N canales en el modelo de datos (gestión de varios fuera de alcance);
- 2 recorridos, unas 12 pantallas o pasos y unas 20 rutas de API nuevas;
- 6 usos de IA, 3 adaptadores de YouTube y 1 migración.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ver `.specify/memory/constitution.md` (v2.0.0). Marcar cada puerta como ✅ cumple, ➖ no aplica o ❌ viola (si viola,
justificar en «Complexity Tracking»).

| # | Puerta | Estado | Nota |
|---|--------|--------|------|
| I | Una acción principal por pantalla, sin jerga (test de glosario), lo avanzado plegado tras «Modo experto», errores para personas | ✅ | Cada paso de los recorridos tiene una acción principal y una frase de «por qué importa». La tabla de cada medida lleva una explicación en llano ([ui-screens](./contracts/ui-screens.md)). La clave de YouTube y los umbrales viven en «Modo experto». Los fallos de YouTube son tipados (`sin_datos`, `bloqueado`, `cupo_agotado`, `tiempo_agotado`, `no_disponible`, `no_encontrado`) y cada uno tiene su mensaje con acción. El test de glosario prohíbe además «RPM», «YPP», «CTR», «handle» y «yt-dlp», y «nicho» se explica la primera vez ([ui-screens](./contracts/ui-screens.md#test-de-glosario-fr-034), FR-034) |
| II | Todo lo generado se puede aprobar, editar y regenerar, con versiones; nada externo sin una acción explícita; dato ≠ opinión | ✅ | Cada propuesta de la IA (preguntas, nichos, conceptos, nombres, lectura, posicionamiento) se guarda como `proposal` con versión y admite aprobar, editar o regenerar con indicaciones. El perfil guarda una `profile_version` en cada cambio. Las medidas se muestran con fuente y fecha en un bloque visualmente separado de la opinión de la IA, y el validador elimina las cifras que la IA no pueda respaldar con los datos (R8). Las consultas a YouTube solo se lanzan tras una acción del creador |
| III | Coste estimado en euros antes de gastar, dentro de los límites de gasto, con un camino sin coste adicional | ✅ | Cada botón que lanza IA con la API muestra «~X €», que sale de `count_tokens`, del máximo de salida y de la tabla de precios fechada (R12). Antes de lanzar se aplican los límites por operación, por día y por mes de la 002, y la tabla `ai_usage` registra el consumo real, consultable en Ajustes (R13). Con la suscripción cuesta 0 € y no hay estimación. YouTube cuesta 0 € con los dos adaptadores |
| IV | La IA solo a través del puerto `AiProvider`; prompts versionados que valen para cualquier modelo; salida validada con Zod; errores tipados; uso explícito | ✅ | Seis usos nuevos en `AI_USES`, cada uno con perfil por proveedor (modelo, esfuerzo, tiempo, máximo de salida) y prompt `v1` en `packages/knowledge`. Las salidas son estructuradas, se validan con Zod y tienen un solo reintento si no validan. `AiRequest.input` separa datos de prompt (R7, R9). Sin reintentos ciegos en cupo ni en tiempo agotado |
| V | Conocimiento en paquetes versionados con fuente y fecha; datos de mercado reales y citados; reglas de escritura humana | ✅ | `packages/knowledge/market/*.json` contiene YPP, RPM, «hecho para niños», contenido no auténtico, Shorts, umbrales y precios, cada fichero con `source` y `reviewedAt`. Las reglas de escritura humana van en `writing/human.md`, que se incluye en los prompts de los seis usos (FR-032). Los datos de mercado salen solo de yt-dlp o de la YouTube Data API (R11). Un aviso salta si un fichero lleva más de 180 días sin revisar |
| VI | Solo tokens (ningún valor suelto), `@layer` + CSS Modules, temas claro y oscuro, WCAG 2.2 AA, 375 px, componente documentado | ✅ | Las pantallas se componen con `@ytcreator/ui`. Hacen falta dos componentes nuevos, `Semaphore` (semáforo con texto, no solo color) y `DataSource` (sello de fuente y fecha), que se documentan en el catálogo antes de usarlos (R16) |
| VII | Local y portable; exportable en Markdown y JSON; secretos protegidos; un creador con varios canales | ✅ | Todo vive en la SQLite local. «Exportar perfil» genera `.md` y `.json` (R17). La clave de YouTube va en el `SecretStore` y solo se muestra su `hint`. `channel` lleva su `id` y todo cuelga de él, así que el modelo admite N canales |
| VIII | Dentro del alcance de la v1; lo que surja va al backlog | ✅ | Fuera de esta feature: gestión de varios canales, estilo visual, voz, música, marca gráfica, agentes y banco de ideas |
| IX | Tests unitarios, de contrato de los adaptadores con IA falsa, e2e + axe y auditoría de novato prevista | ✅ | Batería de contrato de `YouTubeData` (3 adaptadores). Batería de IA ampliada. e2e + axe de los dos recorridos. SC-002, con una IA falsa que inventa cifras, es un test. Auditoría de novato de los dos recorridos (R18) |
| X | La opción más simple; cada dependencia nueva justificada | ✅ | Ningún paquete npm nuevo: el RSS se lee con un parser de una función y la Data API con `fetch`. yt-dlp se justifica abajo. La caché es una tabla, no un servicio |

**Re-evaluación tras la Fase 1:** sin cambios en las puertas. El diseño añade una abstracción con caso de uso real: el
puerto `YouTubeData`, con tres implementaciones en esta misma feature y fallos tipados propios. El resto del diseño
también sigue las reglas de la constitución:

- Las rutas devuelven códigos y nunca textos, igual que en la 002.
- Las medidas son funciones puras y testables sin red.
- Las propuestas comparten una sola tabla (`proposal`) con `kind`, para no crear una tabla por tipo.
- La exportación se genera desde el modelo, sin plantillas externas.
- Los trabajos largos guardan su estado en `background_job` para poder seguir tras cerrar la app (SC-006), y la v1
  limita a un canal con el guard `ya_hay_canal` sin cerrar el modelo a varios (FR-028).

### Dependencias nuevas

| Dependencia | Qué resuelve | Alternativa sin ella | Coste de mantenimiento |
|---|---|---|---|
| **yt-dlp** (binario autónomo, fuera de npm, versión fijada con SHA256) | Datos reales de YouTube sin clave ni coste: búsqueda, vídeos de un canal, existencia de una @ (FR-008, FR-017, FR-020). La constitución lo nombra como fuente | Solo la YouTube Data API: exige que el novato cree un proyecto en Google Cloud y una clave, y tiene un cupo de unas 100 búsquedas al día | Medio: YouTube cambia a menudo y hay que actualizarlo. Mitigado con el paso de actualización y la API como alternativa (R2) |

**Descartadas a propósito** (X):

- `googleapis` o `@googleapis/youtube`: tres rutas REST no justifican 10+ MB (R3);
- un parser XML como `fast-xml-parser`: el RSS es fijo y basta un extractor de etiquetas acotado y testado (R3);
- `youtubei.js` o InnerTube directo: frágil y sin respaldo, peor que yt-dlp (R1);
- `p-limit`: un semáforo de 15 líneas en `packages/core` (R5).

## Project Structure

### Documentation (this feature)

```text
specs/003-channel-and-niche/
├── plan.md              # este fichero
├── research.md          # decisiones R1–R18 y spikes
├── data-model.md        # Canal, Recorrido, Propuesta, Perfil y versiones, Medida de mercado, Canal de referencia,
│                        # Comprobación de nombre, Lectura de canal, Consumo de IA, Caché de YouTube
├── quickstart.md        # guía de validación
├── contracts/
│   ├── youtube-data.md  # puerto YouTubeData, adaptadores, fallos, caché, batería de contrato
│   ├── market.md        # medidas, umbrales, veredicto, semáforo de nombres
│   ├── ai-uses.md       # usos nuevos, AiRequest.input, esquemas de salida, perfiles, validador de cifras
│   ├── knowledge.md     # paquete market/ y writing/, formato, fuente y fecha
│   ├── cost.md          # estimación en euros, regla de presupuesto, registro de consumo
│   ├── http-api.md      # rutas nuevas, esquemas Zod, errores
│   ├── installer.md     # paso nuevo: yt-dlp con suma de verificación y su actualización
│   └── ui-screens.md    # rutas de la web, acción principal, textos, accesibilidad
├── checklists/
└── tasks.md             # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
installer/
├── install.sh               # + paso 9: yt-dlp (descarga, SHA256, <datos>/bin/yt-dlp)
└── test/                    # + caso del paso 9 (descarga falsa, suma errónea, actualización)

packages/core/src/
├── ai/
│   ├── port.ts              # AiRequest + input
│   └── uses.ts              # + preguntas, nichos, conceptos, nombres, lectura_canal, posicionamiento
├── youtube/
│   ├── port.ts              # YouTubeData: search, channel, videos, checkHandle, resolve
│   ├── failures.ts          # YouTubeFailure tipado
│   └── handle.ts            # normalizar URL o @ → referencia de canal
├── market/
│   ├── measures.ts          # demanda, puerta de entrada, concentración, saturación
│   ├── verdict.ts           # veredicto del nicho a partir de las medidas y los umbrales
│   └── names.ts             # semáforo de nombres
├── channel/
│   ├── journey.ts           # máquina de estados de los dos recorridos
│   ├── outputs.ts           # esquemas Zod de salida de los seis usos
│   ├── monetization.ts      # ingresos en rangos con rpm.json
│   ├── warnings.ts          # avisos de nicho y concepto (niños, no auténtico, solo Shorts, ritmo)
│   ├── profile.ts           # perfil y versiones, edición, diferencias
│   ├── claims.ts            # validador «sin cifras inventadas»
│   └── export.ts            # perfil → Markdown y JSON
├── spending/
│   ├── limits.ts            # (002)
│   ├── estimate.ts          # tokens → euros con la tabla de precios
│   └── budget.ts            # ¿cabe esta operación en los límites y lo consumido?
├── concurrency.ts           # semáforo de N tareas
└── api/
    ├── channel.ts           # esquemas Zod de recorridos, propuestas, perfil, medidas, nombres
    ├── youtube.ts           # ajustes de la fuente y estado del cupo
    └── usage.ts             # consumo de IA

packages/youtube/            # @ytcreator/youtube (adaptadores, nuevo)
├── src/
│   ├── ytdlp/               # adapter.ts, command.ts (args, tiempo, entorno), parse.ts, classify.ts
│   ├── rss/                 # feed.ts (feeds/videos.xml?channel_id=), parse.ts
│   ├── data-api/            # adapter.ts (fetch, cupo por unidades), classify.ts
│   ├── fake/                # fake-youtube.ts, scenarios.ts
│   └── registry.ts
└── test/
    ├── contract/            # battery.ts + <adaptador>.contract.test.ts
    └── fixtures/            # salidas grabadas de yt-dlp, RSS y Data API; fake-yt-dlp ejecutable

packages/ai/src/
└── profiles.ts              # + perfiles de los seis usos en los tres proveedores

packages/knowledge/
├── prompts/                 # + preguntas, nichos, conceptos, nombres, lectura_canal, posicionamiento (v1.md)
├── market/                  # ypp.json, rpm.json, made-for-kids.json, inauthentic.json, shorts.json,
│                            # thresholds.json, pricing.json
├── writing/human.md         # reglas de escritura humana
└── src/index.ts             # + carga y validación Zod de market/*.json

apps/server/src/
├── db/
│   ├── migrations/0002_channel.sql
│   └── repos/               # channels, journeys, proposals, profiles, measures, names, readings, usage, yt-cache, jobs
├── services/
│   ├── ai-run.ts            # estimación → presupuesto → generate → validar → registrar consumo
│   ├── youtube.ts           # elegir adaptador, caché, cupo
│   ├── niche-research.ts    # nichos → medidas en paralelo
│   ├── concepts.ts          # entrada de la IA, monetización y avisos
│   ├── name-check.ts
│   ├── channel-reading.ts
│   ├── profile.ts           # armar el perfil y guardar versiones
│   └── jobs.ts              # trabajos en segundo plano con eventos SSE
└── http/routes/             # + channel.ts, youtube.ts, youtube-settings.ts, jobs.ts, usage.ts

apps/web/src/
├── strings/                 # + channel.es.ts, youtube-failures.es.ts
├── shell/useJob.ts          # seguir un trabajo por SSE
└── screens/
    ├── channel/
    │   ├── Proposal.tsx     # aprobar, editar, proponer otra, importe
    │   ├── StepIndicator.tsx # paso actual y «Volver»
    │   ├── start/           # Inicio: elegir recorrido, seguir, canal listo
    │   ├── new/             # Interests, Questions, Niches (con medidas), References, Rhythm, Concepts, Names
    │   ├── existing/        # ChannelUrl, Confirm, Reading, Positioning
    │   └── profile/         # Profile, ProfileHistory, Export
    └── settings/            # + YouTubeSettings (Modo experto: clave), UsageLog

packages/ui/src/
├── Semaphore/               # nuevo, con ficha en apps/catalog
└── DataSource/              # nuevo, con ficha en apps/catalog
```

**Structure Decision**: los adaptadores de YouTube van en un paquete propio, `packages/youtube`, igual que los de IA
van en `packages/ai`. Así el dominio (`packages/core`) no conoce procesos ni HTTP, y la batería de contrato vive junto
a ellos. El dominio nuevo se reparte en tres carpetas de `packages/core`:

- `youtube`: el puerto;
- `market`: medidas puras;
- `channel`: recorridos, perfil y exportación.

Los esquemas Zod compartidos siguen en `@ytcreator/core/api`. Los dos componentes nuevos de la interfaz se añaden a
`packages/ui` con su ficha en el catálogo.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Binario externo yt-dlp (Python empaquetado) en una app «TypeScript en todo» | FR-008 y FR-030: datos reales de YouTube sin coste ni clave para un novato. La constitución lo prevé tras un adaptador | Solo la Data API obliga a crear un proyecto en Google Cloud (rompe «sin jerga»). Reescribir la extracción en TS es mantener un yt-dlp propio |
| Paquete nuevo `packages/youtube` | Tres adaptadores con su batería de contrato, como `packages/ai` | Meterlos en `apps/server` mezclaría procesos y red con el servidor y haría imposible reutilizar la batería |

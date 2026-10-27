---

description: "Lista de tareas de la feature 001: base del design system"
---

# Tasks: Base del design system

**Input**: documentos de diseño de `/specs/001-design-system-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: SÍ. La spec los pide de forma explícita (FR-021, FR-022, SC-001, SC-002, SC-003, SC-005, SC-006, SC-009) y
[contracts/quality-gates.md](./contracts/quality-gates.md) fija cada fichero. Dentro de cada historia, los tests se
escriben primero y deben fallar antes de implementar.

**Organization**: tareas agrupadas por historia de usuario para poder implementar y validar cada una por separado.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (ficheros distintos, sin dependencias de tareas pendientes).
- **[Story]**: historia a la que pertenece (US1…US5).
- Rutas relativas a la raíz del repositorio.

## Convenciones comunes (aplican a todas las tareas)

- **Tokens:** nombres `--p-*` (primitivo), `--s-*` (semántico), `--c-*` (de componente) según
  [contracts/tokens.md](./contracts/tokens.md). Los componentes y pantallas solo usan `--s-*` y `--c-*`.
- **Componente nuevo** = `packages/ui/src/components/<Name>/{<Name>.tsx,<Name>.module.css,index.ts}` +
  tokens en `packages/tokens/src/component/<kebab-name>.ts` (solo referencian semánticos) + ficha en
  `apps/catalog/src/docs/<kebab-name>.doc.tsx`. Además:
  - reenvía `ref`, acepta `className` y los atributos nativos del elemento base;
  - todas sus reglas van dentro de `@layer components { … }` en el CSS Module;
  - los selectores de estado incluyen el forzado del catálogo: `:is(:hover, [data-force-state='hover'])`,
    `:is(:focus-visible, [data-force-state='focus'])`, `:is(:active, [data-force-state='active'])`;
  - ningún texto interno incrustado: sale de `useUiStrings()` (añadir la clave en `packages/ui/src/strings/es.ts`);
  - nada de `style={…}` salvo custom properties de ejecución documentadas (p. ej. `--progress`);
  - la ficha `ComponentDoc` tiene «al menos una» variante, los estados que apliquen, «al menos uno de cada» `dos` y
    `donts`, notas `a11y` y la lista de `tokens` que consume.
- **Textos de interfaz y specs en español; código e identificadores en inglés.**

## Path Conventions

Monorepo pnpm: `packages/tokens/`, `packages/ui/`, `apps/catalog/` (ver plan.md, «Project Structure»).

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: arrancar el monorepo y sus herramientas.

- [X] T001 Crear `package.json` raíz (`private`, `"type": "module"`, `packageManager: "pnpm@10.x"`, `engines.node: ">=24"`, scripts `lint`, `typecheck` = `tsc -b`, `test` = `vitest run`, `test:e2e` = `pnpm --filter @ytcreator/catalog test:e2e`, `format` = `prettier --write .`), `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `.nvmrc` con `24`, y ampliar `.gitignore` (`node_modules`, `dist`, `test-results`, `playwright-report`). Comprobar antes que `node -v` es ≥ 24 (quickstart avisa de que en esta máquina hay Node 20)
- [X] T002 Crear `tsconfig.base.json` (`strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `jsx: react-jsx`, `moduleResolution: bundler`, `target: ES2023`) y `tsconfig.json` raíz con `references` a `packages/tokens`, `packages/ui` y `apps/catalog` para `tsc -b`
- [X] T003 [P] Crear `.prettierrc` (sin punto y coma, comillas simples, `printWidth` 120) y `.prettierignore` (`dist`, `pnpm-lock.yaml`, `playwright-report`)
- [X] T004 [P] Crear `eslint.config.js` (flat config) con `typescript-eslint`, `eslint-plugin-react` y `eslint-plugin-jsx-a11y` (recomendadas). Prohibir `style` en JSX salvo custom properties con `no-restricted-syntax` sobre el selector `JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression > Property[key.type="Identifier"]` y el mensaje «Usa un CSS Module con tokens; en línea solo se permiten custom properties (p. ej. '--progress')» (research R4, R12)
- [X] T005 [P] Crear `packages/tokens/package.json` (`@ytcreator/tokens`, `type: module`, `exports`: `./tokens.css` → `dist/tokens.css`, `./tokens.json` → `dist/tokens.json`, `./breakpoints` → `dist/breakpoints.ts`; script `build` = `node src/build.ts`) y `packages/tokens/tsconfig.json` (extiende la base, `composite`)
- [X] T006 [P] Crear `packages/ui/package.json` (`@ytcreator/ui`, `exports`: `.` → `src/index.ts`, `./vite` → `src/vite/index.ts`, `./styles.css` → `src/styles/index.css`; dependencias `react@19`, `react-dom@19`, `radix-ui`, `lucide-react`, `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@ytcreator/tokens: workspace:*`; `vite` como peer) y `packages/ui/tsconfig.json`
- [X] T007 [P] Crear `apps/catalog/package.json` (`@ytcreator/catalog`, privada; scripts `dev`, `build`, `preview`, `test:e2e` = `playwright test`), `apps/catalog/vite.config.ts` (`@vitejs/plugin-react`; `server` y `preview` en `host: '127.0.0.1'`, puertos 5173 y 4173; constitución VII), `apps/catalog/index.html` (`lang="es"`, `<div id="root">`) y `apps/catalog/tsconfig.json`
- [X] T008 Crear `vitest.config.ts` raíz con `test.projects` para `packages/tokens`, `packages/ui` y `apps/catalog` (entorno `node`, `include: ['test/**/*.test.ts']`)
- [X] T009 [P] Crear `apps/catalog/playwright.config.ts`: proyectos `chromium`, `firefox` y `webkit`; `testDir: 'e2e'`; `webServer` = `pnpm build && pnpm preview` en `http://127.0.0.1:4173`; dependencias `@playwright/test` y `@axe-core/playwright`
- [X] T010 [P] Crear `.github/workflows/ci.yml`: en las PR a `main`, Node desde `.nvmrc`, `pnpm install --frozen-lockfile`, `pnpm --filter @ytcreator/tokens build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm exec playwright install --with-deps` y `pnpm test:e2e`
- [X] T011 Ejecutar `pnpm install` (genera `pnpm-lock.yaml`) y `pnpm --filter @ytcreator/catalog exec playwright install`; comprobar que `pnpm typecheck` y `pnpm test` arrancan sin errores de configuración

---

## Phase 2: Foundational (prerrequisitos bloqueantes)

**Purpose**: tokens completos con su generación y contraste, estilos base, textos sustituibles, iconos y el
esqueleto del catálogo. Todas las historias dependen de esto.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase.

### Tokens: tipos y valores

- [X] T012 Crear `packages/tokens/src/types.ts`: `Level = 'primitive' | 'semantic' | 'component'`; `Category = 'color' | 'space' | 'type' | 'radius' | 'shadow' | 'glass' | 'border' | 'layer' | 'motion' | 'breakpoint'`; `Ref<L extends Level>` (marca de tipo que solo se obtiene de un token de nivel `L`); `Token` con `name` («Kebab-case, único»), `level` y `category` obligatorios, `value` (literal `string` en primitivos; `{ light: Ref; dark: Ref }` o `Ref` en semánticos y de componente: «el primitivo lleva un valor literal; el resto solo referencias»), `ref` (`semantic → primitive`, `component → semantic`, «nunca al mismo nivel ni a uno superior»), `description` (obligatoria en semánticos y de componente), `allowedOn?: string[]` («obligatorio en semánticos de texto o icono»), `reducedMotion?: Ref` y `reducedTransparency?: Ref`; y `ContrastPair` (`foreground`, `background`, `kind: 'text' | 'large-text' | 'ui'` con mínimos 4.5 / 3 / 3, `ratio: { light: number; dark: number }` calculado, `allowed: boolean`). Exportar helpers `primitive()`, `semantic()` y `component()` cuyos tipos impidan referencias de nivel incorrecto (data-model.md, «Token»)
- [X] T013 [P] Crear `packages/tokens/src/primitive/color.ts` con **exactamente** los valores OKLCH de la tabla de research.md R2 (`neutral-0` … `neutral-950`, `coral-300` … `coral-700`, `violet-400/500/600`, `green-400/700`, `amber-400/700`, `red-400/700`, `blue-400/700`) y los colores puros `white` y `black` para la composición del cristal
- [X] T014 [P] Crear `packages/tokens/src/primitive/{space,type,radius,border}.ts`: espacio `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80` px en `rem`; familias `'Geist Variable'` y `'Geist Mono Variable'` con pila de respaldo del sistema; tamaños `0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.875, 2.25, 3` rem; pesos 400/500/600; interlineados 1.15/1.45/1.6; ajuste de letra de titular negativo; radios 4/8/12/16 px y `9999px`; anchos de borde 1px y 2px (research R7, contracts/tokens.md)
- [X] T015 [P] Crear `packages/tokens/src/primitive/{shadow,glass,layer,motion,breakpoint}.ts`: sombras para 3 elevaciones y dos brillos (acento y IA); cristal con alfa ≥ 0,72, `blur(20px) saturate(140%)` y luz interior de 1 px (research R9); capas `0, 1, 100, 1000, 1100, 1200`; duraciones `80ms, 150ms, 240ms, 400ms, 8s` y curvas `standard`, `enter`, `exit` en `cubic-bezier`; puntos de ruptura `sm 40rem`, `md 48rem`, `lg 64rem`, `xl 80rem` (research R5)
- [X] T016 Crear `packages/tokens/src/semantic/color.ts` con el inventario completo de contracts/tokens.md (fondos y superficies, texto e iconos, bordes, acento, `gradient-brand` de `coral-500` a `violet-500` interpolado `in oklch`, `gradient-ai`, y `success/warning/danger/info` × `fg/bg/border`). Invariante: «todo semántico de color tiene un valor para `light` y otro para `dark`». Cada token de texto o icono declara `allowedOn` con los fondos donde se permite; todos llevan `description` en español. Usar las parejas de research R2 como punto de partida (p. ej. `text-secondary`: `neutral-600` claro / `neutral-400` oscuro; `accent`: `coral-600`; `text-accent`: `coral-700` / `coral-400`)
- [X] T017 [P] Crear `packages/tokens/src/semantic/{space,type,radius,border,layer,motion,control}.ts`: `space-0` … `space-12`; `font-family-ui/mono`, `font-size-xs` … `font-size-4xl`, `font-weight-regular/medium/semibold`, `line-height-tight/ui/reading`, `letter-spacing-tight`; `radius-sm/md/lg/xl/full`; `border-width-default/strong`, `focus-ring-width`, `focus-ring-offset`; `z-base/raised/sticky/overlay/popover/toast`; `duration-instant/fast/normal/slow/ai-cycle`, `easing-standard/enter/exit`; `control-height-sm/md/lg` (32/40/44), `icon-size-sm/md/lg` (16/20/24), `target-min` (24). Todos con `description`
- [X] T018 [P] Crear `packages/tokens/src/semantic/{shadow,glass}.ts`: `shadow-1` (tarjeta), `shadow-2` (popover), `shadow-3` (diálogo), `glow-accent`, `glow-ai`; `glass-bg`, `glass-border`, `glass-blur`, `glass-highlight`. `glass-bg` declara `reducedTransparency` → `color-surface-raised` y `glass-blur` → `none` (data-model.md)
- [X] T019 [P] Crear `packages/tokens/src/component/index.ts` que exporta el array de tokens de componente (vacío al principio; cada componente añade su fichero y lo registra aquí) y `packages/tokens/src/index.ts` que reúne los tres niveles

### Tokens: contraste, generación y tests

- [X] T020 [P] Escribir `packages/tokens/test/levels.test.ts`: recorre todos los tokens y falla si una referencia apunta al mismo nivel o a uno superior, si un token de componente apunta a un primitivo, si falta `description` en semánticos o de componente, o si un nombre no es kebab-case o está repetido (FR-002)
- [X] T021 Crear `packages/tokens/src/contrast.ts`: OKLCH → OKLab → sRGB lineal (con recorte a gama), luminancia relativa WCAG, composición alfa sobre un fondo y `contrastRatio(fg, bg)`; sin dependencias
- [X] T022 Crear `packages/tokens/src/contrast-pairs.ts`: genera las parejas a partir de `allowedOn` y añade a mano las de componente (se amplía en US2/US3). Si el fondo es de cristal, evalúa el fondo compuesto sobre `white`, `black` y `coral-500` y guarda el peor ratio. Calcula `ratio.light`, `ratio.dark` y `allowed` («`true` solo si ambos ratios cumplen el mínimo»)
- [X] T023 [P] Escribir `packages/tokens/test/contrast.test.ts`: toda `ContrastPair` tiene `allowed = true`; si no, el mensaje indica primer plano, fondo, tema, ratio y mínimo (SC-001, escenario 3.4). Incluye un caso de control con valores conocidos (blanco sobre negro = 21)
- [X] T024 Crear `packages/tokens/src/build.ts` (ejecutable con el *type stripping* de Node 24) que genera:
  - `dist/tokens.css` dentro de `@layer tokens`, con `:root { color-scheme: light dark }`, `:root[data-theme='light'] { color-scheme: light }`, `:root[data-theme='dark'] { color-scheme: dark }` (contracts/theme.md); primitivos `--p-*`, semánticos `--s-*` (los de color como `light-dark(var(--p-…), var(--p-…))`) y de componente `--c-*`; **sin** emitir los `breakpoint`;
  - `dist/tokens.json` con los metadatos de cada token (nivel, categoría, descripción, valor por tema, referencia, `allowedOn`) y las `ContrastPair` con sus ratios;
  - `dist/breakpoints.ts` con `export const breakpoints = { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem' } as const`.

  El *build* falla si un semántico de texto o icono no tiene `allowedOn` (contracts/tokens.md, regla 1)
- [X] T025 [P] Escribir `packages/tokens/test/build.test.ts`: *snapshot* de `tokens.css`; todo `--s-color-*` usa `light-dark()`; ninguna custom property de `breakpoint`; `tokens.json` contiene las parejas de contraste

### UI: estilos, textos, iconos y marca

- [X] T026 Crear `packages/ui/src/styles/index.css` (declara una sola vez `@layer reset, tokens, base, components, utilities;` e importa `@ytcreator/tokens/tokens.css`, `fonts.css`, `reset.css` y `base.css`), `reset.css` (en `@layer reset`), `fonts.css` (importa `@fontsource-variable/geist` y `@fontsource-variable/geist-mono`, `font-display: swap`) y `base.css` (en `@layer base`: `body` con `--s-color-bg`, `--s-color-text-primary`, `--s-font-family-ui`, `--s-line-height-ui`; foco global `:focus-visible` con `outline: var(--s-focus-ring-width) solid var(--s-color-border-focus)` y `outline-offset: var(--s-focus-ring-offset)`; clase utilitaria `.visually-hidden` en `@layer utilities`)
- [X] T027 Crear `packages/ui/src/strings/{types.ts,es.ts,format.ts,UiStringsProvider.tsx}`: tipo `UiStrings` anidado por componente (`dialog.close`, `button.loading`, `stepper.position` = «Paso {current} de {total}», `stepper.done` = «completado», `stepper.current`, `stepper.pending` = «pendiente», `toast.close`, `field.optional`, `field.errorPrefix`, `theme.auto/light/dark`, `aiWorking.defaultLabel`…); `format(template, values)` que sustituye `{nombre}` y lanza un error si falta un valor; `UiStringsProvider` con sustitución parcial y mezcla profunda; `useUiStrings()` (data-model.md, «UiStrings»; research R10)
- [X] T028 [P] Escribir `packages/ui/test/strings.test.ts`: `format` resuelve marcadores y falla si falta uno; ningún valor de `es.ts` deja un marcador sin nombre; la mezcla profunda de `UiStringsProvider` conserva las claves no sustituidas
- [X] T029 [P] Crear `packages/ui/test/forbidden-terms.ts` con la lista de términos prohibidos (`token`, `JSON`, `API`, `HTTP`, `prompt`, `localStorage`, `CSS`, `Claude`, `GPT`, `Gemini`, `Ollama`…) y una función `findForbiddenTerms(strings)` (sin distinguir mayúsculas, palabra completa) que devuelve la clave y el término de cada aparición; y escribir `packages/ui/test/glossary.test.ts`, que la aplica a todos los valores de `packages/ui/src/strings/es.ts` (principio I, research R10)
- [X] T030 [P] Crear `packages/ui/src/icons/{Icon.tsx,Icon.module.css,index.ts}`: envuelve un icono de `lucide-react`, `strokeWidth` 1.75, `size: 'sm' | 'md' | 'lg'` mediante `--s-icon-size-*`; `aria-hidden="true"` por defecto y, si recibe `label`, `role="img"` + `aria-label` (FR-016, research R8)
- [X] T031 [P] Crear `packages/ui/src/brand/{Logo.tsx,logo.svg,Logo.module.css}`: logotipo provisional que se cambia sustituyendo `logo.svg` sin tocar componentes; usa `currentColor` y el degradado de marca (FR-023)
- [X] T032 Crear `packages/ui/src/index.ts` exportando `Icon`, `Logo`, `UiStringsProvider`, `useUiStrings`, `format` y el tipo `UiStrings`

### Catálogo: esqueleto

- [X] T033 Crear el esqueleto de `apps/catalog/src/`: `router.ts` (router por *hash* de ~40 líneas con `useRoute()` y las rutas de contracts/catalog.md; `#/` por defecto), `main.tsx` (importa `@ytcreator/ui/styles.css`, monta `UiStringsProvider` y `Layout`), `Layout.tsx` + `Layout.module.css` (cabecera con `Logo`, hueco para el selector de tema, navegación lateral plegable en móvil, contenido principal con `<main>`), y `strings/catalog.es.ts` con los textos del catálogo

### Calidad: lint de estilos (FR-021)

Va aquí y no en US5 para que el *lint* vigile cada componente desde el primero; US5 añade el test de los mensajes
y la explicación en la portada.

- [X] T034 Crear `stylelint.config.js` (dependencias `stylelint`, `stylelint-declaration-strict-value`): `scale-unlimited/declaration-strict-value` sobre las propiedades visuales de research R12 (color, fondos, bordes, sombras, `outline`, márgenes, rellenos, `gap`, tipografía, radios, `z-index`, duraciones, curvas, `backdrop-filter`), admitiendo solo `var(--s-…)`, `var(--c-…)` y `inherit`, `currentColor`, `transparent`, `none`, `0`, `auto`, con un mensaje por categoría con el formato de contracts/quality-gates.md; `declaration-property-value-disallowed-list` con `/var\(--p-/` para todo fuera de `packages/tokens`; `media-feature-name-value-allowed-list` construido importando `@ytcreator/tokens/breakpoints` (más `prefers-*`, `forced-colors` y `pointer`); `color-no-hex: true`; `color-named: 'never'`; ignora `**/dist/**`. Depende de T024 (`dist/breakpoints.ts`)
- [X] T035 Añadir Stylelint al script `lint` de `package.json` raíz (`eslint . && stylelint "**/*.css"`) y al paso de *lint* de `.github/workflows/ci.yml` si fuese un paso separado; ejecutar `pnpm lint` y dejar en verde los CSS de Foundational (`packages/ui/src/styles/`, `Icon`, `Logo`, `Layout`)

**Checkpoint**: `pnpm --filter @ytcreator/tokens build` genera los tres ficheros; `pnpm test` pasa niveles, contraste,
*build*, textos y glosario; el catálogo arranca vacío.

---

## Phase 3: User Story 1 - Fundamentos y temas a la vista (Priority: P1) 🎯 MVP

**Goal**: el catálogo muestra cada fundamento con su nombre, uso y aspecto en ambos temas, y el selector de tema
(automático, claro, oscuro) se recuerda sin destellos.

**Independent Test**: abrir el catálogo, recorrer los fundamentos en ambos temas, cambiar el tema, cerrar y volver a
abrir: el tema se mantiene y cada fundamento está documentado (quickstart, escenarios 1–4).

### Tests for User Story 1 ⚠️

> Escribirlos primero y comprobar que fallan.

- [X] T036 [P] [US1] Escribir `apps/catalog/e2e/theme.spec.ts`: sin preferencia y `colorScheme: 'dark'` emulado → oscuro (1.1); en «automático», `page.emulateMedia({ colorScheme: 'light' })` cambia el fondo calculado sin recargar (1.2); elegir «Claro», recargar con el sistema en oscuro → sigue claro (1.3); `localStorage` que lanza excepción (vía `addInitScript`) → «automático» y 0 errores de consola; valor corrupto → «automático»; 10 cargas con tema guardado comprobando `html[data-theme]` y el `background-color` calculado en `DOMContentLoaded` (registrado por un `addInitScript`) → 0 destellos (SC-006)
- [X] T037 [P] [US1] Escribir `packages/ui/test/theme-init.test.ts`: el script de `init-script.ts` ocupa menos de 300 bytes; ejecutado con `new Function` sobre un `document`/`localStorage` simulados pone `data-theme` con `light` o `dark`, no hace nada con otro valor y no lanza si `localStorage` falla

### Implementation for User Story 1

- [X] T038 [US1] Crear `packages/ui/src/theme/init-script.ts`: exporta el script como cadena; lee `localStorage.getItem('ytc.theme')` en `try/catch` y, si vale `light` o `dark`, pone `document.documentElement.dataset.theme`; en cualquier otro caso no hace nada (contracts/theme.md)
- [X] T039 [US1] Crear `packages/ui/src/vite/index.ts` con `themeInit(): Plugin` que, en `transformIndexHtml`, inyecta como primeros hijos del `<head>` (`injectTo: 'head-prepend'`), antes de cualquier hoja de estilos, `<meta name="color-scheme" content="light dark">` y el `<script>` en línea de T038
- [X] T040 [P] [US1] Crear `packages/ui/src/theme/useThemePreference.ts`: `ThemePreference = 'auto' | 'light' | 'dark'`, por defecto `'auto'`; almacenamiento en `localStorage["ytc.theme"]` con «lectura y escritura en `try/catch`. Un valor desconocido o un error equivalen a `'auto'`»; reflejo en `html[data-theme]`, «ausente en `auto`; `light` o `dark` en los demás casos»; guardar y actualizar el atributo en el mismo tick; durante el cambio pone `html[data-theme-switching]` un fotograma para desactivar transiciones (data-model.md, «ThemePreference»)
- [X] T041 [P] [US1] Crear `packages/ui/src/theme/useResolvedTheme.ts`: devuelve `'light' | 'dark'` escuchando `matchMedia('(prefers-color-scheme: dark)')` y los cambios de `data-theme` con un `MutationObserver`
- [X] T042 [US1] Crear `packages/ui/src/theme/{ThemeSwitcher.tsx,ThemeSwitcher.module.css}`: grupo segmentado de radios nativos («Automático / Claro / Oscuro» desde `theme.auto/light/dark` de `UiStrings`) con `fieldset` y leyenda accesible oculta; tokens de componente en `packages/tokens/src/component/theme-switcher.ts`. Añadir a `packages/ui/src/styles/base.css` la regla que anula `transition` bajo `html[data-theme-switching] *`
- [X] T043 [US1] Exportar `useThemePreference`, `useResolvedTheme`, `ThemeSwitcher` y el tipo `ThemePreference` en `packages/ui/src/index.ts`; registrar `themeInit()` en `apps/catalog/vite.config.ts`; colocar `ThemeSwitcher` en la cabecera de `apps/catalog/src/Layout.tsx`; registrar `theme-switcher.ts` en `packages/tokens/src/component/index.ts`
- [X] T044 [P] [US1] Crear `apps/catalog/src/foundations/{tokens-data.ts,TokenTable.tsx,TokenTable.module.css,ThemeSplit.tsx,ThemeSplit.module.css}`: carga tipada de `@ytcreator/tokens/tokens.json`; tabla con nombre, descripción, primitivo de origen y valor; `ThemeSplit` pinta el mismo contenido dos veces lado a lado forzando `color-scheme: light` y `color-scheme: dark` (contracts/catalog.md)
- [X] T045 [US1] Crear `apps/catalog/src/foundations/ColorPage.tsx` (+ `.module.css`): cada semántico de color con nombre, descripción, muestra en ambos temas con `ThemeSplit`, primitivo de origen y tabla de `ContrastPair` (ratio por tema y si cumple) (escenario 1.4)
- [X] T046 [P] [US1] Crear `apps/catalog/src/foundations/TypographyPage.tsx` (+ `.module.css`): escala, pesos, interlineados y familias UI y mono con texto de ejemplo en castellano (incluidas tildes y «ñ»)
- [X] T047 [P] [US1] Crear `apps/catalog/src/foundations/{SpacingPage,RadiusPage,BordersPage}.tsx` (+ `.module.css`): escala visual de espacio, radios y anchos de borde y foco, con su uso recomendado
- [X] T048 [P] [US1] Crear `apps/catalog/src/foundations/{ElevationPage,GlassPage}.tsx` (+ `.module.css`): sombras y brillos; tokens de cristal con la **regla de la mesura** de spec.md (solo paneles flotantes, diálogos, asistente y firma de la IA; **nunca** lectura larga; ante la duda, gana la legibilidad) (FR-013)
- [X] T049 [P] [US1] Crear `apps/catalog/src/foundations/{LayersPage,MotionPage,BreakpointsPage}.tsx` (+ `.module.css`): capas en orden, duraciones y curvas con una demostración que se puede disparar, y puntos de ruptura (leídos de `@ytcreator/tokens/breakpoints`) con la nota de `@media (width >= 48rem)` y preferencia por `@container` (research R5)
- [X] T050 [P] [US1] Crear `apps/catalog/src/foundations/IconsPage.tsx` (+ `.module.css`): rejilla de iconos de Lucide con `Icon` en los tres tamaños, cuándo son decorativos y cuándo llevan `label`
- [X] T051 [US1] Crear `apps/catalog/src/Home.tsx` (+ `.module.css`) con la portada (qué es el design system y la regla de la mesura) y conectar en `apps/catalog/src/router.ts` y la navegación de `Layout.tsx` las rutas `#/fundamentos/{color,tipografia,espaciado,radios,elevacion,cristal,bordes,capas,movimiento,puntos-de-ruptura,iconos}`

**Checkpoint**: US1 completa. `theme.spec.ts` y `theme-init.test.ts` en verde; quickstart, escenarios 1–4, superados.

---

## Phase 4: User Story 2 - Componentes básicos listos para construir pantallas (Priority: P1)

**Goal**: los 21 componentes base, con variantes y estados, usables con teclado y documentados en el catálogo.

**Independent Test**: montar una pantalla solo con componentes del catálogo sin estilos propios, y recorrerla solo
con teclado (quickstart, escenarios 5–7).

### Tests for User Story 2 ⚠️

- [X] T052 [P] [US2] Escribir `apps/catalog/test/docs-coverage.test.ts`: compara los *exports* de `@ytcreator/ui` cuyo nombre empieza por mayúscula con los `id` de `apps/catalog/src/docs/registry.ts` y falla nombrando los que no tienen ficha. Exentos: `Icon`, `Logo`, `ThemeSwitcher`, `UiStringsProvider` y `ToastProvider` (documentado en la ficha `toast`) (data-model.md, «ComponentDoc»)
- [X] T053 [P] [US2] Escribir `apps/catalog/e2e/keyboard.spec.ts`: diálogo (abrir con Enter, Tab repetido no sale del diálogo, Escape cierra y el foco vuelve al disparador; igual con el botón de cerrar) (2.3); pestañas (flechas, Inicio, Fin); `Disclosure` cerrado no recibe foco y su `summary` alterna con Enter/Espacio (2.5); avisos alcanzables con F8; botón con Tab y Espacio (2.1, 2.2); `Stepper` con `aria-current="step"` y textos ocultos «completado»/«pendiente» (2.4)
- [X] T054 [P] [US2] Escribir `apps/catalog/e2e/a11y.spec.ts`: recorre cada `#/componentes/<id>` del registro y ejecuta `AxeBuilder` con las etiquetas `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` en tema claro y oscuro (vía `localStorage` + recarga); 0 infracciones (SC-002)

### Infraestructura de fichas

- [X] T055 [US2] Crear `apps/catalog/src/docs/types.ts` (interfaz `ComponentDoc` de contracts/catalog.md: `id` igual a la ruta `#/componentes/<id>`; `group: 'actions' | 'forms' | 'containers' | 'communication' | 'progress'`; `variants` «al menos una»; `dos`/`donts` «al menos uno de cada»), `apps/catalog/src/docs/registry.ts` (array vacío) y `apps/catalog/src/docs/ComponentPage.tsx` (+ `.module.css`) que pinta resumen, variantes, estados (forzados con `data-force-state`), uso correcto e incorrecto, notas de accesibilidad, tokens enlazados a su fundamento y matriz de temas con `ThemeSplit`, con `data-testid="doc-<id>"` en la raíz; conectar la ruta `#/componentes/<id>` y la navegación agrupada por `group`

### Componentes, oleada A (sin dependencias entre sí)

- [X] T056 [US2] Crear el ayudante interno `packages/ui/src/components/Field/{Field.tsx,Field.module.css}` (no se exporta): etiqueta obligatoria, `description?`, `error?`, `required?`, `optional?` (texto `field.optional`); ids con `useId` unidos por `aria-describedby`; con `error`, `aria-invalid`, icono de alerta y texto con prefijo oculto `field.errorPrefix` (FR-010); tokens en `packages/tokens/src/component/field.ts`
- [X] T057 [P] [US2] Crear `Spinner` (convención común): `label?` (con él, `role="status"` y texto oculto; sin él, `aria-hidden`), `size` por `--s-icon-size-*`; anima solo `transform`
- [X] T058 [P] [US2] Crear `Tooltip` (convención común) sobre `radix-ui` Tooltip: `content: string`, disparador enfocable; abre con el ratón encima y con el foco (Radix no lo abre en táctil, así que la ficha exige que su contenido esté también en el nombre accesible del disparador o en texto visible); nunca lleva información esencial (lo dice su ficha); superficie con `shadow-2` y `z-popover`
- [X] T059 [P] [US2] Crear `Badge` (convención común): `tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'`; una línea; recorte con elipsis y texto completo en `title` y nombre accesible (caso límite «textos largos»)
- [X] T060 [P] [US2] Crear `Card` (convención común): `as?`, `interactive?` (con estados encima/foco/pulsado); superficie sólida con `shadow-1`, **nunca** cristal
- [X] T061 [P] [US2] Crear `Skeleton` (convención común): `shape: 'text' | 'rect' | 'circle'`, `lines?`; `aria-hidden`; la ficha muestra al contenedor con `aria-busy`
- [X] T062 [P] [US2] Crear `ProgressBar` (convención común): `value?` 0–100 (sin valor, indeterminada), `label`; `role="progressbar"` con `aria-valuenow`/`aria-valuemin`/`aria-valuemax`; ancho por la custom property `--progress` en `style` (única excepción permitida)
- [X] T063 [P] [US2] Crear `Stepper` (convención común): `steps: { id; label }[]`, `current`; `<ol>` con `aria-current="step"`; hechos con icono de check y texto oculto `stepper.done`, pendientes con `stepper.pending`; posición «Paso {current} de {total}» visible; no depende solo del color (escenario 2.4); a 375 px muestra la posición y la etiqueta del paso actual sin desbordar
- [X] T064 [P] [US2] Crear `Disclosure` (convención común) sobre `<details>/<summary>`: `summary`, `defaultOpen?`, `open?`, `onOpenChange?` (evento `toggle`); icono que gira con `duration-fast`; la ficha muestra «Modo experto» como uso de este componente (escenario 2.5)
- [X] T065 [P] [US2] Crear `Tabs` (convención común) sobre `radix-ui` Tabs: `items: { id; label; content }[]`, `value?`, `onValueChange?`; flechas, Inicio y Fin; con muchas pestañas o etiquetas largas, desplazamiento horizontal interno sin romper la página

### Componentes, oleada B (dependen de la oleada A)

- [X] T066 [US2] Crear `Button` (convención común; usa `Spinner`): `variant: 'primary' | 'secondary' | 'ghost' | 'danger'` (por defecto `secondary`), `size: 'sm' | 'md' | 'lg'` (alturas `control-height-*`; con `@media (pointer: coarse)` `md` sube a 44 px), `loading?`, `iconStart?`, `iconEnd?`, `disabled?`. Con `loading`: `aria-busy`, spinner superpuesto conservando el texto (el ancho no salta), `aria-disabled` en lugar de `disabled` y sin responder a clics. Texto largo se ajusta en varias líneas (research R15, contracts/components.md). Añadir la pareja de contraste «texto sobre botón principal» en `packages/tokens/src/contrast-pairs.ts`
- [X] T067 [P] [US2] Crear `IconButton` (convención común; usa `Icon` y `Tooltip`): `label: string` obligatoria en el tipo, `icon`, `variant`, `size`; nombre accesible desde `label` y tooltip con el mismo texto; zona táctil ≥ `target-min` (44 px con puntero grueso) (FR-009)
- [X] T068 [P] [US2] Crear `TextField` (convención común; usa `Field`): `<input>` con `type` `text | email | url | search | number | password` e `iconStart?`
- [X] T069 [P] [US2] Crear `TextArea` (convención común; usa `Field`): `rows`, `autoResize?` con `field-sizing: content` bajo `@supports`; usa `line-height-reading`
- [X] T070 [P] [US2] Crear `Select` (convención común; usa `Field`): `<select>` nativo estilizado, `options: { value; label; disabled? }[]` o `children`; flecha con `Icon`
- [X] T071 [P] [US2] Crear `Switch` (convención común; usa `Field`): `<input type="checkbox" role="switch">`, `checked`, `onCheckedChange`; el estado no depende solo del color (posición del mando)
- [X] T072 [P] [US2] Crear `Checkbox` (convención común; usa `Field`): `<input type="checkbox">` estilizado, `indeterminate?` aplicado con `ref`
- [X] T073 [P] [US2] Crear `RadioGroup` (convención común; usa `Field`): `<fieldset>` + `<input type="radio">`; `appearance: 'list' | 'cards'`; las tarjetas admiten `title`, `description` e `icon`, ocupan una columna a 375 px y marcan la elegida con borde, icono y no solo color
- [X] T074 [US2] Crear `Dialog` (convención común; usa `IconButton`): `<dialog>` + `showModal()`, `open`, `onOpenChange`, `title` obligatorio, `description?`, `footer?`, `size?: 'sm' | 'md'`; superficie con los tokens de cristal y `shadow-3`, *scrim* con `color-surface-overlay`; guarda el elemento activo al abrir y le devuelve el foco al cerrar (Escape o botón `dialog.close`); el foco no sale del diálogo (escenario 2.3)
- [X] T075 [P] [US2] Crear `ToastProvider` + `useToast()` en `packages/ui/src/components/Toast/` (convención común, ficha `toast`) sobre `radix-ui` Toast: `toast({ title, description?, tone?: 'neutral' | 'success' | 'warning' | 'danger', action?: { label; onClick } })`; viewport arriba a la derecha en escritorio y arriba a ancho completo en móvil, máximo 3 visibles; duración 6 s + 60 ms por carácter; con `action` no se cierra solo; siempre con botón de cerrar `toast.close`; atajo F8 (FR-012, research R15)
- [X] T076 [P] [US2] Crear `EmptyState` (convención común; usa `Button`): `icon?`, `title`, `description`, `action?` con una sola acción principal
- [X] T077 [P] [US2] Crear `ErrorMessage` (convención común; usa `Button` e `Icon`): `title` (qué ha pasado), `description` (qué se puede hacer), `action: { label; onClick }` obligatoria; prop `live?` que pone `role="alert"` cuando aparece tras una acción del usuario; la ficha muestra un ejemplo correcto en lenguaje llano y uno incorrecto con jerga (escenario 2.6)

### Integración

- [X] T078 [US2] Registrar los tokens de los 21 componentes en `packages/tokens/src/component/index.ts`, exportar los componentes y sus tipos de props en `packages/ui/src/index.ts`, y añadir las 21 fichas a `apps/catalog/src/docs/registry.ts`; regenerar los tokens
- [X] T079 [US2] Ejecutar `pnpm test` (`docs-coverage`, contraste) y `pnpm test:e2e -- keyboard.spec.ts a11y.spec.ts` en los tres motores, y corregir lo que falle en los componentes afectados

**Checkpoint**: US1 y US2 funcionan. Cada componente tiene ficha, axe da 0 infracciones y todo se usa con teclado.

---

## Phase 5: User Story 3 - Cristal, brillo y la firma de la IA (Priority: P2)

**Goal**: superficies de cristal y el indicador «la IA está trabajando», reconocibles y respetuosos con las
preferencias de movimiento, transparencia y colores forzados.

**Independent Test**: activar `AiWorking` y abrir un `GlassPanel`; luego emular «reducir movimiento» y «reducir
transparencia» y comprobar que no queda animación continua ni translucidez, sin perder información (quickstart,
escenarios 8–9).

### Tests for User Story 3 ⚠️

- [X] T080 [P] [US3] Escribir `apps/catalog/e2e/preferences.spec.ts`: con `reducedMotion: 'reduce'`, en las fichas `ai-working`, `spinner`, `skeleton`, `progress-bar` y en `#/fundamentos/movimiento`, `document.getAnimations()` no contiene ninguna con `iterations === Infinity`; con `forcedColors: 'active'`, el foco de un botón y de un campo tiene `outline-style` distinto de `none`; solo en Chromium, con `prefers-reduced-transparency: reduce` emulado (CDP `Emulation.setEmulatedMedia`), el `backdrop-filter` calculado de `GlassPanel` y `Dialog` es `none` (SC-009, escenarios 3.2 y 3.3)
- [X] T081 [P] [US3] Ampliar `packages/tokens/test/build.test.ts`: `tokens.css` contiene el bloque `@media (prefers-reduced-motion: reduce)` con todas las duraciones a `0ms` salvo `duration-fast`, y los bloques `@supports not (backdrop-filter: blur(1px))` y `@media (prefers-reduced-transparency: reduce)` con `--s-glass-bg` → `var(--s-color-surface-raised)` y `--s-glass-blur` → `none`

### Implementation for User Story 3

- [X] T082 [US3] Ampliar `packages/tokens/src/build.ts` para emitir los valores `reducedMotion` y `reducedTransparency` de los tokens dentro de esos bloques (contracts/tokens.md); actualizar el *snapshot*
- [X] T083 [P] [US3] Crear `GlassPanel` (convención común): `as?`, `elevation?: 2 | 3`; `background: var(--s-glass-bg)`, `backdrop-filter: var(--s-glass-blur)`, borde `glass-border` y luz interior `glass-highlight`. La ficha incluye un *don't* explícito: «nunca en guiones, descripciones u otra lectura larga» (FR-013) y una demostración sobre fondo con mucho detalle (escenario 3.4). Añadir sus parejas de contraste en `packages/tokens/src/contrast-pairs.ts`
- [X] T084 [P] [US3] Crear `AiWorking` (convención común; usa `ProgressBar`): `label: string` obligatoria (p. ej. «Escribiendo tu guion…»), `progress?: number`, `variant?: 'inline' | 'panel'`; aurora con un pseudo-elemento con degradado cónico `gradient-ai` que anima solo `transform` y `opacity` en un ciclo de `duration-ai-cycle`, y una segunda animación no infinita que baja la opacidad tras un reposo largo (caso «indicador sin fin»); texto visible dentro de `role="status"` (FR-011); con `prefers-reduced-motion: reduce`, degradado estático sin animación (escenario 3.2)
- [X] T085 [P] [US3] Añadir reglas `@media (forced-colors: active)` en `packages/ui/src/styles/base.css` (foco con `Highlight`) y en los CSS Modules de `Button`, `IconButton`, `Card`, `Switch`, `Checkbox`, `RadioGroup`, `Stepper`, `ProgressBar`, `Dialog` y `Toast` (sin sombras ni degradados, bordes `CanvasText`) (research R9, caso límite «alto contraste»)
- [X] T086 [P] [US3] Ajustar el movimiento reducido en `packages/ui/src/components/{Spinner,Skeleton}/*.module.css`: sin animaciones infinitas bajo `prefers-reduced-motion: reduce` (`Spinner` pasa a un icono estático con su texto, como fijan research R9 y contracts/components.md; `Skeleton` sin brillo animado)
- [X] T087 [US3] Registrar `GlassPanel` y `AiWorking` (tokens en `packages/tokens/src/component/index.ts`, *exports* en `packages/ui/src/index.ts`, fichas en `apps/catalog/src/docs/registry.ts`) y añadir demostraciones en vivo a `apps/catalog/src/foundations/{GlassPage,MotionPage}.tsx`
- [X] T088 [US3] Ejecutar `pnpm test` y `pnpm test:e2e -- preferences.spec.ts a11y.spec.ts` y corregir lo que falle

**Checkpoint**: la firma de la IA y el cristal funcionan y respetan las preferencias del sistema.

---

## Phase 6: User Story 4 - Página de muestra para validar la estética (Priority: P2)

**Goal**: `#/muestra`, «Elige el enfoque de tu vídeo», que combina los componentes en un paso realista y sirve
de puerta de aprobación estética.

**Independent Test**: abrir `#/muestra` en escritorio y a 375 px, en ambos temas, y completar el paso con ratón y
con teclado (quickstart, escenarios 10–12 y 15).

### Tests for User Story 4 ⚠️

- [X] T089 [P] [US4] Escribir `apps/catalog/e2e/sample.spec.ts`: solo con teclado, elegir un enfoque, escribir el público, abrir «Modo experto», pulsar «Generar propuesta», ver `AiWorking` con su texto, después la `Card` de resultado y el aviso de éxito (4.1); ninguna petición de red tras la carga (`page.on('request')`)
- [X] T090 [P] [US4] Escribir `apps/catalog/e2e/responsive.spec.ts`: a 375 px y a 320 px, en `#/`, en cada página de fundamentos, en cada ficha de componente y en `#/muestra`, `document.documentElement.scrollWidth <= clientWidth` (SC-005); en `#/muestra`, todos los controles interactivos miden al menos 24×24 px (FR-009)

### Implementation for User Story 4

- [X] T091 [P] [US4] Crear `apps/catalog/src/strings/sample.es.ts` con todos los textos de la muestra: titular, la frase de «por qué importa» (principio I), los 3 enfoques con título y descripción, la etiqueta «¿A quién va dirigido?», las opciones de «Modo experto», «Generar propuesta», el texto de `AiWorking`, la propuesta simulada y el aviso de éxito
- [X] T092 [US4] Crear `apps/catalog/test/glossary.test.ts`, que importa `findForbiddenTerms` de `packages/ui/test/forbidden-terms.ts` y la aplica a `apps/catalog/src/strings/sample.es.ts`; así `ui` no depende de `apps/catalog`
- [X] T093 [US4] Crear `apps/catalog/src/sample/{ChooseApproach.tsx,ChooseApproach.module.css}` con la composición fija de contracts/catalog.md: `Stepper` (paso 3 de 5); titular + frase de por qué + `RadioGroup appearance="cards"` con 3 enfoques; `TextField`; `Disclosure` «Modo experto» con un `Select` y un `Switch`; una sola acción principal `Button variant="primary"` fija abajo en móvil (`position: sticky`, `z-sticky`); al pulsarla, `AiWorking` dentro de un `GlassPanel` durante ~3 s con `setTimeout`, después la propuesta en una `Card` sólida editable y un `toast` de éxito; `IconButton` del asistente con cristal, abajo a la derecha, sin solaparse con la acción principal ni con los avisos. Sin llamadas de red
- [X] T094 [US4] Conectar `#/muestra` en `apps/catalog/src/router.ts` y en la navegación de `Layout.tsx`, y añadir `#/muestra` a `apps/catalog/e2e/a11y.spec.ts` en ambos temas
- [X] T095 [US4] Ejecutar `pnpm test` y `pnpm test:e2e -- sample.spec.ts responsive.spec.ts a11y.spec.ts` y corregir lo que falle

**Checkpoint**: la muestra se completa en escritorio y móvil, en ambos temas, con ratón y con teclado.

---

## Phase 7: User Story 5 - Reglas que impiden inventar estilos (Priority: P3)

**Goal**: la verificación de calidad rechaza valores visuales sueltos y primitivos fuera de `tokens`, con un
mensaje que indica el token correcto; la portada explica los tres niveles.

**Independent Test**: escribir `color: #fff;` o `padding: 13px;` en un `.module.css` de `ui` y ejecutar
`pnpm lint`: falla con la línea y el token que toca (quickstart, escenarios 13–14).

### Tests for User Story 5 ⚠️

- [X] T096 [P] [US5] Escribir `packages/ui/test/stylelint.test.ts`: con la API de `stylelint` y la configuración raíz, lint de fragmentos CSS en memoria (con `codeFilename` dentro de `packages/ui/src/components/`) que contienen `padding: 13px`, `color: #fff`, `color: red`, `z-index: 10`, `transition-duration: 200ms`, `color: var(--p-color-coral-500)` y `@media (width >= 50rem)`; cada uno da un aviso con el formato de contracts/quality-gates.md (p. ej. `Valor suelto en "padding". Usa un token de espaciado (var(--s-space-…) o var(--c-…-…)).`); y un fragmento válido con `var(--s-*)`, `var(--c-*)`, `0`, `auto`, `inherit`, `currentColor`, `transparent` y `none` no da avisos (escenario 5.1)

### Implementation for User Story 5

La configuración de Stylelint y su paso en `pnpm lint` ya existen desde Foundational (T034, T035), así que los
componentes de US2–US4 nacen vigilados. Esta fase añade el test que fija los mensajes y la explicación de la portada.

- [X] T097 [US5] Ajustar `stylelint.config.js` hasta que T096 pase (mensajes y casos válidos), ejecutar `pnpm lint` y corregir cualquier infracción que quede en `packages/ui/src/**/*.css` y `apps/catalog/src/**/*.css`, añadiendo los tokens de componente o semánticos que falten en lugar de desactivar reglas
- [X] T098 [US5] Ampliar `apps/catalog/src/Home.tsx` con la sección de los tres niveles de token: qué es un primitivo, un semántico y uno de componente, con un ejemplo de cada uno, quién puede usar cada nivel (las pantallas solo semánticos o de componente) y qué hacer si falta un token (escenario 5.2)

**Checkpoint**: todas las historias funcionan y la coherencia queda protegida por el *lint*.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: casos límite, validación completa y cierre de la feature.

- [X] T099 [P] Añadir un estado «texto largo» (palabras como «Configuración» y «Personalizar», y frases largas) en las fichas `apps/catalog/src/docs/{button,badge,toast,tabs}.doc.tsx` y comprobar que se ajustan o recortan con el texto completo disponible (caso límite «textos largos»)
- [X] T100 Ejecutar la puerta de calidad completa `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` (tres motores) y dejarla en verde
- [X] T101 Comprobar SC-004: construir con cronómetro una pantalla nueva que no esté en el catálogo (p. ej. «Ajustes del canal» con `TextField`, `Select`, `Switch`, `Tabs`, `Card`, `EmptyState` y una acción principal) en `apps/catalog/src/sample/ChannelSettings.tsx`, solo con componentes y tokens, sin CSS propio salvo el de colocación en su `.module.css`; `pnpm lint` debe quedar limpio y el tiempo debe ser inferior a 2 h. Anotar tiempo y resultado en `specs/001-design-system-foundation/checklists/validation.md` y borrar la pantalla después (o dejarla como segunda muestra si aporta)
- [X] T102 Recorrer a mano los escenarios 1–15 de [quickstart.md](./quickstart.md) (incluidos VoiceOver, Safari privado y zoom al 200 %) y anotar el resultado de cada uno en `specs/001-design-system-foundation/checklists/validation.md`
- [X] T103 Hacer la **auditoría de novato** sobre `#/muestra` (un agente que hace de usuario profano la recorre) y guardar el informe en `specs/001-design-system-foundation/novice-audit.md`; se requieren 0 graves y como mucho 3 medios, y corregir hasta cumplirlo (SC-007, constitución IX)
- [ ] T104 Pedir al creador del producto la **aprobación explícita de la estética** en `#/muestra`, en ambos temas y en móvil, y anotarla con fecha en `specs/001-design-system-foundation/checklists/validation.md`; si no convence, ajustar solo `packages/tokens/src/primitive/color.ts` y repetir (SC-008, research R2)
- [X] T105 [P] Actualizar la sección «Status» de `CLAUDE.md` (001 implementada; siguiente feature: onboarding)

---

## Phase 9: Ajustes de la revisión estética (feedback de T104, 2026-10-27)

**Objetivo**: corregir lo que el creador señaló al revisar `#/muestra` antes de volver a pedir la aprobación (T104).

- [X] T106 [P] Rehacer el `Stepper` con marcadores sobre una línea continua que une sus centros, nombres debajo sin recortar (hasta dos líneas) y, en móvil, el nombre del paso actual junto a «Paso N de M», en `packages/ui/src/components/Stepper/`
- [X] T107 [P] Hacer más visible la aurora de `AiWorking`: borde más grueso (token `ai-working-ring`) y un degradado más vivo (token `gradient-ai-vivid`), y que el giro se note: ciclo de 3 s en vez de 8 s y una chispa clara con estela sobre el degradado (token `gradient-ai-ring`), sin tocar el texto ni romper «reducir movimiento», en `packages/tokens/src/` y `packages/ui/src/components/AiWorking/`
- [X] T108 [P] Avisos temporales o persistentes según FR-012a: opción `duration`, valores por defecto por tono y acción, barra de tiempo que se pausa con el puntero, el foco o la ventana sin foco, en `packages/ui/src/components/Toast/`; documentar las reglas en `apps/catalog/src/docs/toast.doc.tsx` y probarlas en `packages/ui/src/components/Toast/Toast.test.tsx`
- [X] T109 [P] Alinear las tarjetas de `RadioGroup`: radio, icono y marca centrados con la primera línea del título y la descripción debajo del título a todo el ancho, en `packages/ui/src/components/RadioGroup/RadioGroup.module.css`
- [X] T110 Cambiar `Select` a Radix Select con desplegable propio (superficie elevada, opción marcada con check, descripción opcional, teclado y búsqueda por letras), manteniendo la API de campo (`label`, `description`, `error`, `optional`), en `packages/ui/src/components/Select/`; actualizar su doc y los usos de la muestra y los e2e
- [X] T111 Puerta de calidad completa y capturas nuevas de `#/muestra` (claro, oscuro y móvil) para repetir T104

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. **Bloquea todas las historias.**
- **US1 (Phase 3)** y **US2 (Phase 4)**: dependen solo de Foundational; pueden ir en paralelo.
- **US3 (Phase 5)**: depende de Foundational y de US2 (`ProgressBar`, `Spinner`, `Dialog`, `Toast` y los
  componentes con colores forzados).
- **US4 (Phase 6)**: depende de US2 y US3 (usa `GlassPanel` y `AiWorking`); el tema de US1 es necesario para
  validarla en ambos temas.
- **US5 (Phase 7)**: depende de Foundational, donde ya se configura el *lint* de estilos (T034, T035), y de que
  exista `apps/catalog/src/Home.tsx` (US1).
- **Polish (Phase 8)**: depende de todas las historias.

### Dentro de cada fase

- Tests antes de implementación, y deben fallar primero.
- Tokens: T012 → (T013–T019) → T021 → T022 → T024. Los tests T020, T023 y T025 pueden escribirse en cuanto existe T012.
- Lint de estilos: T024 → T034 → T035 (al final de Foundational, cuando ya hay CSS que vigilar).
- US2: T055 y T056 → oleada A (T057–T065) → oleada B (T066–T077; `Button` antes de `Dialog`, `Toast`, `EmptyState` y
  `ErrorMessage`; `IconButton` antes de `Dialog` y `Toast`; `Field` antes de los formularios) → T078 → T079.
- Las tareas de registro (T043, T078, T087, T094) tocan ficheros compartidos (`index.ts`, `registry.ts`): no se
  hacen en paralelo entre sí.

### Parallel Opportunities

- Setup: T003, T004, T005, T006, T007, T009 y T010.
- Foundational: los primitivos (T013–T015), los semánticos (T017, T018) y los tests (T020, T023, T025, T028, T029);
  `Icon` y `Logo` (T030, T031).
- US1: hooks (T040, T041) y las páginas de fundamentos (T046–T050).
- US2: los 9 componentes de la oleada A y 11 de la oleada B (cada uno en sus propios ficheros).
- US3: `GlassPanel`, `AiWorking`, colores forzados y movimiento reducido (T083–T086).
- Con dos personas: una hace US1 y otra US2 tras Foundational.

---

## Parallel Example: User Story 2

```bash
# Tests de la historia, a la vez:
Task: "docs-coverage en apps/catalog/test/docs-coverage.test.ts"
Task: "teclado en apps/catalog/e2e/keyboard.spec.ts"
Task: "axe en apps/catalog/e2e/a11y.spec.ts"

# Oleada A de componentes, a la vez (ficheros independientes):
Task: "Spinner en packages/ui/src/components/Spinner/"
Task: "Tooltip en packages/ui/src/components/Tooltip/"
Task: "Badge en packages/ui/src/components/Badge/"
Task: "Stepper en packages/ui/src/components/Stepper/"
Task: "Tabs en packages/ui/src/components/Tabs/"
```

## Parallel Example: User Story 1

```bash
Task: "Páginas de espaciado, radios y bordes en apps/catalog/src/foundations/"
Task: "Páginas de elevación y cristal en apps/catalog/src/foundations/"
Task: "Páginas de capas, movimiento y puntos de ruptura en apps/catalog/src/foundations/"
Task: "Página de iconos en apps/catalog/src/foundations/IconsPage.tsx"
```

---

## Implementation Strategy

### MVP primero (US1)

1. Phase 1 (Setup) y Phase 2 (Foundational).
2. Phase 3 (US1): catálogo con fundamentos y tema persistente.
3. **Parar y validar**: quickstart, escenarios 1–4. Ya se puede juzgar paleta y tipografía.

### Entrega incremental

1. Setup + Foundational → tokens y catálogo vacío.
2. US1 → fundamentos y temas (MVP: primera opinión sobre la paleta).
3. US2 → componentes base (desbloquea las features siguientes).
4. US3 → cristal y firma de la IA.
5. US4 → página de muestra y **aprobación estética** (SC-008).
6. US5 → test de los mensajes del *lint* y explicación de los niveles (el *lint* ya funciona desde Foundational).
7. Polish → auditoría de novato y cierre.

---

## Notes

- [P] = ficheros distintos y sin dependencias pendientes.
- La etiqueta [Story] enlaza cada tarea con su historia.
- Commits convencionales después de cada tarea o grupo lógico, con la identidad `Xavi Aijon <xavi.aijon@gmail.com>`.
- Lo que aparezca fuera del alcance de la spec va al backlog, no a esta feature (constitución VIII).

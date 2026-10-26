# Implementation Plan: Base del design system

**Branch**: `001-design-system-foundation` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-design-system-foundation/spec.md`

## Summary

Esta feature arranca el monorepo y construye el design system propio de YTCreator, con la estética «precisión
oscura con chispa». Tiene tres piezas:

- **`packages/tokens`:** los tokens en TypeScript, en tres niveles (primitivo → semántico → de componente), con
  colores OKLCH y temas resueltos con `light-dark()`. Un script propio genera el CSS (`@layer tokens`) y los
  metadatos.
- **`packages/ui`:** 23 componentes en React con CSS Modules. Se apoyan en HTML nativo y solo usan Radix para
  pestañas, tooltip y avisos. Incluye la firma de la IA (una aurora que respeta el movimiento reducido), el cristal
  que cae a sólido, los textos sustituibles y el script de tema sin destellos.
- **`apps/catalog`:** el catálogo vivo y la página de muestra «Elige el enfoque de tu vídeo», que es la puerta de
  aprobación estética.

La calidad la vigilan Stylelint (ningún valor suelto, ningún primitivo fuera de `tokens`), Vitest (niveles,
contraste AA en ambos temas y glosario) y Playwright + axe en los tres motores de navegador.

## Technical Context

**Language/Version**: TypeScript `strict` (+ `erasableSyntaxOnly`), Node 24 LTS

**Primary Dependencies**: React 19, Vite (CSS Modules), `radix-ui` (Tabs, Tooltip y Toast), `lucide-react`,
`@fontsource-variable/geist` y `@fontsource-variable/geist-mono`. Detalle en [research.md](./research.md).

**Storage**: `localStorage["ytc.theme"]` para la preferencia de tema. No hay base de datos.

**Testing**: Vitest (tokens, contraste, textos y glosario); Playwright + `@axe-core/playwright` (Chromium, Firefox y
WebKit) sobre el catálogo.

**Target Platform**: las dos últimas versiones de Chrome, Edge, Firefox y Safari, en escritorio y en móvil, desde
375 px.

**Project Type**: librería de UI + app web interna (catálogo) dentro de un monorepo pnpm.

**Performance Goals**:

- la aurora y las transiciones solo animan `transform` y `opacity`, y van a 60 fps sin repintar;
- el script de tema, en línea y de menos de 300 bytes;
- las fuentes, autoalojadas con `swap`.

**Constraints**:

- WCAG 2.2 AA en ambos temas;
- 0 valores visuales sueltos;
- funcionamiento a 375 px y con zoom del 200 %;
- respeto a `prefers-reduced-motion`, `prefers-reduced-transparency` y `forced-colors`;
- ninguna llamada de red en la página de muestra.

**Scale/Scope**: unos 100 tokens semánticos, 23 componentes (más `Icon`, `Logo` y `ThemeSwitcher`), 1 catálogo y 1 página de muestra.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ver `.specify/memory/constitution.md` (v1.0.0). Marcar cada puerta como ✅ cumple, ➖ no aplica o ❌ viola (si viola,
justificar en «Complexity Tracking»).

| # | Puerta | Estado | Nota |
|---|--------|--------|------|
| I | Una acción principal por pantalla, sin jerga (test de glosario), lo avanzado plegado tras «Modo experto», errores para personas | ✅ | La muestra tiene una sola acción principal, una frase de «por qué» y «Modo experto» con `Disclosure`. `ErrorMessage` obliga a decir qué ha pasado, qué hacer y a ofrecer una acción. El test de glosario cubre los textos de `ui` y de la muestra; el catálogo es interno y queda exento (R10) |
| II | Todo lo generado se puede aprobar, editar y regenerar, con versiones; nada externo sin una acción explícita; dato ≠ opinión | ➖ | Aquí no hay generación real. La muestra simula el flujo: propuesta en una `Card` editable |
| III | Coste estimado en euros antes de gastar, dentro de los límites de gasto, con un camino sin coste | ➖ | Sin operaciones con coste |
| IV | La IA solo a través del puerto `AiProvider`; prompts versionados que valen para cualquier modelo; salida validada con Zod; errores tipados; uso explícito | ➖ | No se llama a ninguna IA. `AiWorking` es solo presentación |
| V | Conocimiento en paquetes versionados con fuente y fecha; datos de mercado reales y citados; reglas de escritura humana | ➖ | No aplica |
| VI | Solo tokens (ningún valor suelto), `@layer` + CSS Modules, temas claro y oscuro, WCAG 2.2 AA, 375 px, componente documentado | ✅ | Es el núcleo de la feature: R1–R5 y R12, contraste comprobado (R2, R9), `ComponentDoc` obligatorio por componente (data-model) y e2e a 375 y 320 px |
| VII | Datos en local y exportables, secretos protegidos, autenticación en VPS, sin telemetría por defecto | ✅ | Fuentes e iconos autoalojados, sin CDN ni telemetría. El catálogo en desarrollo escucha en `127.0.0.1` |
| VIII | Dentro del alcance de la v1; lo que surja va al backlog | ✅ | Solo el alcance de la spec. Componentes complejos, logotipo final e i18n real, fuera |
| IX | Tests unitarios, de contrato de los adaptadores con IA falsa, e2e + axe y auditoría de novato prevista | ✅ | Vitest + Playwright/axe en ambos temas. Auditoría de novato sobre `#/muestra` antes de cerrar (quickstart). Sin adaptadores de IA en esta feature |
| X | La opción más simple; cada dependencia nueva justificada | ✅ | Sin Storybook, Style Dictionary, Turborepo, Testing Library ni librería de i18n. Cada dependencia se justifica abajo. Única desviación: `apps/catalog` (ver Complexity Tracking) |

**Re-evaluación tras la Fase 1:** sin cambios. Los contratos no introducen abstracciones sin caso de uso: el plugin
de tema se comparte porque lo usarán `apps/catalog` y la futura `apps/web`, y `ComponentDoc` lo exige el principio
VI.

### Dependencias nuevas

| Dependencia | Qué resuelve | Alternativa sin ella | Coste de mantenimiento |
|---|---|---|---|
| `react`, `react-dom`, `vite`, `typescript` | La base del stack que fija la constitución | — | Bajo |
| `radix-ui` (Tabs, Tooltip, Toast) | Foco itinerante, posicionamiento y región viva con pausa, todo accesible | Escribirlo a mano: es donde más se falla en accesibilidad | Medio. Plan B: Base UI (R6) |
| `lucide-react` | Iconos coherentes con licencia ISC (FR-016) | SVG propios | Bajo |
| `@fontsource-variable/geist`, `…/geist-mono` | Fuentes autoalojadas con licencia OFL | Copiar los `.woff2` a mano | Bajo |
| `stylelint`, `stylelint-declaration-strict-value` | FR-021 | Un script de expresiones regulares propio (frágil) | Bajo |
| `eslint`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y` | Lint y accesibilidad estática | — | Bajo |
| `prettier` | Formato uniforme | Revisiones de estilo a mano | Bajo |
| `vitest` | Tests unitarios | `node:test` (peor integración con TS y Vite) | Bajo |
| `@playwright/test`, `@axe-core/playwright` | e2e + axe en tres motores (IX, FR-022) | — | Medio (navegadores) |

## Project Structure

### Documentation (this feature)

```text
specs/001-design-system-foundation/
├── plan.md              # este fichero
├── research.md          # decisiones R1–R15
├── data-model.md        # Token, ContrastPair, ThemePreference, UiStrings, ComponentDoc
├── quickstart.md        # guía de validación
├── contracts/
│   ├── tokens.md        # nombres, niveles, inventario de semánticos
│   ├── theme.md         # plugin de Vite, API de React, garantías
│   ├── components.md    # API pública de los 23 componentes
│   ├── catalog.md       # rutas, ComponentDoc, página de muestra
│   └── quality-gates.md # lint, tests unitarios y e2e
└── tasks.md             # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
package.json                 # scripts: lint, typecheck, test, test:e2e, format
pnpm-workspace.yaml
tsconfig.base.json
eslint.config.js
stylelint.config.js          # lee la lista de puntos de ruptura de @ytcreator/tokens
.prettierrc
.nvmrc                       # 24
.github/workflows/ci.yml

packages/tokens/             # @ytcreator/tokens
├── src/
│   ├── primitive/           # color.ts (OKLCH), space.ts, type.ts, radius.ts, shadow.ts, glass.ts,
│   │                        # border.ts, layer.ts, motion.ts, breakpoint.ts
│   ├── semantic/            # color.ts (light/dark + allowedOn), space.ts, type.ts, …
│   ├── component/           # button.ts, field.ts, dialog.ts, toast.ts, stepper.ts, ai-working.ts, …
│   ├── types.ts             # Ref<Level>, Token, ContrastPair
│   ├── contrast.ts          # OKLCH → sRGB, luminancia relativa, composición alfa
│   ├── contrast-pairs.ts
│   └── build.ts             # → dist/tokens.css, dist/tokens.json, dist/breakpoints.ts
└── test/                    # levels, build (snapshot), contrast

packages/ui/                 # @ytcreator/ui (se consume desde src/)
├── src/
│   ├── styles/              # index.css (orden de @layer), reset.css, base.css, fonts.css
│   ├── theme/               # useThemePreference, useResolvedTheme, ThemeSwitcher, init-script.ts
│   ├── vite/                # plugin themeInit()
│   ├── strings/             # UiStringsProvider, es.ts, format.ts
│   ├── icons/               # Icon
│   ├── brand/               # Logo.tsx, logo.svg (provisional)
│   ├── components/
│   │   └── <Component>/     # <Component>.tsx, <Component>.module.css, index.ts
│   │       # Button, IconButton, TextField, TextArea, Select, Switch, Checkbox, RadioGroup,
│   │       # Card, GlassPanel, Dialog, Tabs, Disclosure, Toast, Badge, Tooltip, EmptyState,
│   │       # ErrorMessage, Stepper, ProgressBar, Spinner, Skeleton, AiWorking
│   └── index.ts
└── test/                    # strings, glossary

apps/catalog/                # @ytcreator/catalog (interna)
├── index.html
├── src/
│   ├── main.tsx, router.ts, Layout.tsx
│   ├── strings/             # catalog.es.ts, sample.es.ts
│   ├── foundations/         # una página por categoría
│   ├── docs/                # types.ts (ComponentDoc), registry.ts, <component>.doc.tsx
│   └── sample/              # ChooseApproach.tsx (página de muestra)
├── test/                    # docs-coverage
├── e2e/                     # a11y, theme, keyboard, responsive, preferences, sample
└── playwright.config.ts
```

**Structure Decision**: monorepo pnpm según las restricciones técnicas de la constitución. Esta feature crea
`packages/tokens`, `packages/ui` y `apps/catalog`. Las carpetas `apps/web`, `apps/server`, `packages/core`,
`packages/ai` y `packages/knowledge` se crearán con las features que las necesiten (X).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `apps/catalog` no figura en la estructura de la constitución | FR-018 y FR-020 piden un catálogo y una página de muestra que **no** forman parte de la app del creador (supuesto de la spec) | Meterlo en `apps/web` mezclaría una herramienta interna con el producto, y `apps/web` aún no existe. Meterlo dentro de `packages/ui` convertiría la librería en una app. Storybook se descarta en R11 |

# Research: Base del design system

**Feature**: `001-design-system-foundation` | **Fecha**: 2026-10-26

Cada decisión sigue el formato Decisión / Motivo / Alternativas. Todas las dependencias nuevas se justifican aquí
(constitución, principio X) y se resumen en [plan.md](./plan.md#dependencias-nuevas).

---

## R1. Fuente de los tokens y su generación

- **Decisión:** los tokens se escriben en **TypeScript** (`packages/tokens/src/`), como objetos tipados con
  referencias explícitas al nivel inferior. Un script propio (`build.ts`, ~150 líneas, ejecutado con el *type
  stripping* nativo de Node 24) genera:
  - `dist/tokens.css`: custom properties dentro de `@layer tokens`;
  - `dist/tokens.json`: metadatos (nivel, categoría, descripción, valor por tema, referencia) para el catálogo y los
    tests;
  - `dist/breakpoints.ts`: constantes para JS y para la regla de Stylelint.
- **Motivo:** los tipos garantizan en compilación que un semántico solo referencia primitivos y un token de
  componente solo semánticos (FR-002). No hace falta herramienta externa para algo tan pequeño.
- **Alternativas:**
  - *Style Dictionary + JSON DTCG*: estándar, pero añade una dependencia y una capa de configuración que no
    necesitamos para un solo destino (CSS). Se puede adoptar más tarde si aparece otro destino (p. ej. Figma).
  - *Tokens escritos a mano en CSS*: no permite comprobar niveles ni contrastes sin parsear CSS.

## R2. Espacio de color y paleta inicial

- **Decisión:** primitivos de color en **OKLCH** (escalas perceptualmente uniformes, degradados sin zonas grises).
  Valores iniciales (comprobados con un cálculo de contraste; el test de contraste es el árbitro final):

  | Primitivo | OKLCH | ≈ sRGB |
  |---|---|---|
  | `neutral-0` | 1 0 0 | #ffffff |
  | `neutral-50` | 0.985 0.002 285 | #fafafb |
  | `neutral-100` | 0.965 0.003 285 | #f3f3f5 |
  | `neutral-200` | 0.92 0.004 285 | #e4e4e7 |
  | `neutral-300` | 0.87 0.005 285 | #d4d4d7 |
  | `neutral-400` | 0.71 0.01 285 | #a1a1a8 |
  | `neutral-500` | 0.55 0.012 285 | #717178 |
  | `neutral-600` | 0.44 0.012 285 | #525259 |
  | `neutral-700` | 0.37 0.01 285 | #3f3f45 |
  | `neutral-800` | 0.27 0.008 285 | #26262a |
  | `neutral-850` | 0.22 0.007 285 | #1a1a1e |
  | `neutral-900` | 0.18 0.006 285 | #111114 |
  | `neutral-950` | 0.145 0.005 285 | #0a0a0c |
  | `coral-300` | 0.81 0.11 10 | #ffa3b1 |
  | `coral-400` | 0.74 0.17 8 | #ff7796 |
  | `coral-500` | 0.67 0.22 5 | #fb4583 |
  | `coral-600` | 0.58 0.22 5 | #da1d69 |
  | `coral-700` | 0.50 0.19 5 | #b31555 |
  | `violet-400` | 0.70 0.16 295 | #a787f6 |
  | `violet-500` | 0.62 0.21 293 | #8f63f6 |
  | `violet-600` | 0.54 0.23 292 | #7842e5 |
  | `green-400` / `green-700` | 0.78 0.17 150 / 0.50 0.13 150 | #56d57b / #137738 |
  | `amber-400` / `amber-700` | 0.83 0.16 80 / 0.55 0.13 65 | #fdba2f / #a45e00 |
  | `red-400` / `red-700` | 0.72 0.17 25 / 0.52 0.19 27 | #fd736d / #be2323 |
  | `blue-400` / `blue-700` | 0.74 0.13 245 / 0.50 0.15 255 | #5db2f7 / #1762b6 |

  Contrastes medidos de las parejas clave:

  | Tema | Primer plano → fondo | Ratio |
  |---|---|---|
  | oscuro | texto principal (`neutral-50`) → fondo (`neutral-950`) | 18,96 |
  | oscuro | texto secundario (`neutral-400`) → superficie elevada (`neutral-850`) | 6,72 |
  | oscuro | acento texto (`coral-400`) → fondo | 7,85 |
  | ambos | blanco → botón principal (`coral-600`) | 4,83 |
  | claro | texto secundario (`neutral-600`) → `neutral-100` | 7,03 |
  | claro | acento texto (`coral-700`) → blanco | 6,68 |
  | claro | estados `*-700` → blanco | 5,02–6,08 |

- **Acento y YouTube:** el coral-magenta (tono 5° en OKLCH, rosado) se separa del rojo de YouTube (#FF0000, ~29°).
  El **degradado de marca** va de `coral-500` a `violet-500` (interpolado en OKLCH).
- **Riesgo conocido:** el rojo de error (25–27°) queda cerca del acento. Se mitiga con la regla de FR-010 (el error
  siempre lleva icono y texto) y se valida en la página de muestra (SC-008). Si confunde, se gira el acento hacia
  355° solo en primitivos.
- **Alternativas:** hex/HSL (HSL no es perceptual: los pasos de la escala no se ven iguales); P3 explícito
  (innecesario; OKLCH ya lo aprovecha donde hay pantalla P3).

## R3. Mecanismo de temas sin destellos

- **Decisión:**
  - Cada semántico de color se emite como `light-dark(<claro>, <oscuro>)`.
  - `:root { color-scheme: light dark }` hace que «automático» siga al sistema **sin JavaScript** y en caliente
    (escenario 1.2).
  - Las elecciones explícitas se aplican con `html[data-theme="light"|"dark"]`, que fija `color-scheme`.
  - Un **script en línea** en el `<head>` (antes de cualquier hoja de estilos) lee `localStorage["ytc.theme"]` dentro
    de `try/catch` y pone el atributo. Si el almacenamiento falla, no hace nada: queda «automático» (caso límite).
  - Se inyecta con un plugin mínimo de Vite exportado por `@ytcreator/ui/vite`, para que el catálogo y la futura
    `apps/web` compartan el mismo script.
- **Motivo:** `light-dark()` está en las dos últimas versiones de Chrome, Edge, Firefox y Safari. Una sola
  declaración por token, sin duplicar bloques por tema.
- **Alternativas:** bloques `[data-theme]` + `@media (prefers-color-scheme)` duplicados (más CSS y más fácil de
  desincronizar); poner el tema desde React (provoca destello, viola SC-006).
- **Nota:** cuando haya CSP en `apps/web`, el script en línea irá con su hash.

## R4. Organización del CSS

- **Decisión:**
  - Orden de capas declarado una sola vez: `@layer reset, tokens, base, components, utilities;`.
  - **CSS Modules** de Vite por componente; cada módulo envuelve sus reglas en `@layer components`.
  - Nada de estilos en línea (`style={…}`) en componentes ni pantallas, salvo custom properties de ejecución
    documentadas (p. ej. `--progress` de la barra de progreso).
- **Motivo:** principio VI.
- **Alternativas:** CSS-in-JS (runtime y peor rendimiento), Tailwind (utilidades con valores propios, compite con los
  tokens), vanilla-extract (dependencia más compilación; los CSS Modules bastan).

## R5. Puntos de ruptura

- **Decisión:** los puntos de ruptura son tokens documentados (`sm 40rem`, `md 48rem`, `lg 64rem`, `xl 80rem`;
  base móvil desde 375 px). Las custom properties no valen dentro de `@media`, así que:
  - en CSS se escriben como valor literal en consultas de rango (`@media (width >= 48rem)`);
  - Stylelint solo admite los valores que salen del token (`media-feature-name-value-allowed-list`, generado desde
    `breakpoints.ts`);
  - se prefieren `@container` y diseños intrínsecos (`grid` con `minmax`) cuando bastan.
- **Alternativas:** `@custom-media` con PostCSS o Lightning CSS (requiere importar las definiciones en cada módulo o
  un plugin; más piezas para el mismo resultado).

## R6. Primitivas de comportamiento (headless)

- **Decisión: HTML nativo primero; Radix solo donde el nativo no llega.**

  | Componente | Base | Motivo |
  |---|---|---|
  | Botón, campos, área de texto, casilla, grupo de opciones | nativo | Accesibles de serie |
  | Interruptor | `<input type="checkbox" role="switch">` | Nativo con el rol correcto |
  | Selector | Radix Select (revisado 2026-10-27) | El desplegable nativo no se puede diseñar y desentona con el sistema (revisión estética de T104). Radix da el *listbox* accesible: teclado, búsqueda por letras, `aria-*`, colocación y un `<select>` oculto para formularios. Coste: en móvil se pierde la rueda nativa |
  | Sección plegable | `<details>/<summary>` | Cerrada no recibe foco y anuncia su estado (escenario 2.5) |
  | Diálogo | `<dialog>` + `showModal()` | Capa superior, contenido de fuera inerte, Escape. El componente guarda y devuelve el foco por su cuenta (escenario 2.3) |
  | Pestañas | Radix Tabs | Foco itinerante y activación por flechas |
  | Tooltip | Radix Tooltip | Posicionamiento y retardos. Radix no lo abre en táctil, así que su contenido va también en el nombre accesible del disparador o en texto visible |
  | Aviso flotante | Radix Toast | Región viva, pausa al pasar el ratón o con foco, atajo F8, apilado |

  Se usa el paquete unificado `radix-ui`, del que solo se importan esas cuatro primitivas.
- **Motivo:** la constitución permite primitivas *headless*. Usarlas solo donde ahorran código delicado de
  accesibilidad es lo más simple (X).
- **Alternativas:**
  - *Ark UI*: equivalente, pero con menos uso en React.
  - *React Aria*: la mejor accesibilidad, pero mucho más pesada.
  - *Base UI*: madura desde 2025; queda como plan B si Radix se estanca.
  - *Todo a mano*: pestañas, tooltip y avisos son justo donde más se falla en accesibilidad.

## R7. Tipografía

- **Decisión:** **Geist** (interfaz) y **Geist Mono**, variables, autoalojadas con `@fontsource-variable/geist` y
  `@fontsource-variable/geist-mono` (licencia OFL), con `font-display: swap` y precarga del peso de texto.
  - Escala (rem): 0.75, 0.875, 1 (base), 1.125, 1.25, 1.5, 1.875, 2.25, 3.
  - Pesos: 400, 500, 600.
  - Interlineado: 1.6 en lectura larga, 1.45 en interfaz, 1.15 en titulares.
  - Ajuste de letra negativo solo en tamaños de titular.
- **Motivo:** encaja con «precisión oscura». Tiene diseño propio para monoespaciada y cubre todos los signos del
  castellano. Sin depender de servicios externos (VII).
- **Alternativas:** Inter + JetBrains Mono (válida y algo más neutra; la pareja Geist es más coherente); Google Fonts
  por CDN (descartado: dependencia externa y privacidad).

## R8. Iconografía

- **Decisión:** **Lucide** (`lucide-react`, ISC), con trazo de 1.75 y tamaños de token (16/20/24). Un envoltorio
  `Icon` pone `aria-hidden="true"` por defecto. Para un icono con significado propio se pasa `label`, y el
  `IconButton` exige `label` en sus tipos.
- **Alternativas:** Phosphor (más pesado por variantes), Heroicons (catálogo corto), SVG propios (coste de diseño).

## R9. Cristal, brillo y firma de la IA

- **Decisión:**
  - **Cristal:** el fondo semántico translúcido es la superficie con alfa ≥ 0,72, con `backdrop-filter: blur(20px)
    saturate(140%)` y un borde de luz interior de 1 px.
  - **Contraste del cristal (escenario 3.4):** el test compone el fondo translúcido sobre los **peores fondos
    posibles** (blanco, negro y el acento) y exige AA al texto en los tres casos. Así el desenfoque nunca es
    necesario para leer.
  - **Caída a sólido (FR-015):** `@supports not (backdrop-filter: blur(1px))` y
    `@media (prefers-reduced-transparency: reduce)` redefinen el token semántico de cristal como superficie sólida
    elevada. Limitación: hoy esa media query solo la reconocen los navegadores Chromium; en los demás el cristal se
    mantiene, pero ya cumple AA por diseño.
  - **Firma de la IA:** una aurora hecha con un pseudo-elemento con degradado cónico de marca. Se anima solo
    `transform` y `opacity`, para que trabaje en el compositor y no repinte. Da una vuelta cada 3 s, lo que dura
    una espera típica, con una chispa clara y su estela (`gradient-ai-ring`) sobre el degradado para que el giro se
    note. Baja la opacidad tras un reposo largo (caso «indicador sin fin»). Siempre la acompaña un texto visible dentro de
    `role="status"`.
  - **Movimiento reducido (FR-014, SC-009):** con `prefers-reduced-motion: reduce`, los tokens de duración pasan a
    0 ms, salvo las opacidades breves (≤ 150 ms). La aurora se vuelve un degradado estático y el spinner un icono
    estático junto a su texto (un pulso continuo seguiría siendo una animación sin fin).
  - **Colores forzados:** con `@media (forced-colors: active)` se quitan sombras y degradados, se dejan bordes
    `CanvasText` y el foco usa `Highlight`.
- **Alternativas:** aurora en `<canvas>` o WebGL (más coste y más difícil de respetar las preferencias); animar
  `background-position` (repinta en cada fotograma).

## R10. Textos sustituibles (FR-019)

- **Decisión:**
  - `UiStringsProvider` es un contexto de React con un catálogo por defecto en español (`strings/es.ts`), tipado con
    `UiStrings`.
  - Los componentes leen de ahí sus textos internos («Cerrar», «Cargando…», «Paso {current} de {total}»…).
  - Los textos de contenido llegan siempre por *props*.
  - El catálogo y la página de muestra tienen su propio fichero de textos. Las fichas `*.doc.tsx` son contenido del
    catálogo (no de `ui`), así que sus textos pueden vivir en ellas sin incumplir FR-019.
  - Sin librería de i18n por ahora: la interpolación es una función de 10 líneas.
- **Motivo:** cumple la preparación para i18n sin meter una dependencia que la v1 aún no necesita (X).
- **Alternativas:** i18next o FormatJS (se adoptarán cuando haya un segundo idioma; el contrato `UiStrings` se
  mantiene).
- **Test de glosario (principio I):** un test de Vitest recorre los textos de `@ytcreator/ui` y de la página de
  muestra con una lista de términos prohibidos (`token`, `JSON`, `API`, `HTTP`, `prompt`, nombres de modelo…). El
  catálogo es una herramienta interna y queda exento.

## R11. Catálogo vivo

- **Decisión:** una app propia, **`apps/catalog`** (Vite + React), con un router por *hash* de ~40 líneas. Las
  páginas son:
  - `#/fundamentos/<categoría>`;
  - `#/componentes/<componente>`;
  - `#/muestra`.

  Cada componente se describe con un objeto `ComponentDoc` (ver [contracts/catalog.md](./contracts/catalog.md))
  que la app pinta de forma uniforme: variantes, estados, uso correcto e incorrecto, notas de accesibilidad y la
  matriz de temas.
- **Motivo:**
  - El catálogo debe demostrar el tema persistente sin destellos (SC-006) y la página de muestra, y eso se prueba
    mejor en una app real que en el *iframe* de Storybook.
  - Además lo construimos con nuestros propios componentes, así que el catálogo es la primera prueba de SC-004.
- **Alternativas:**
  - *Storybook*: un ecosistema enorme (addons de a11y y de temas), pero docenas de dependencias, un tema propio y una
    actualización mayor cada año.
  - *Ladle*: más ligero, pero tampoco controla el `<head>` para el script de tema.

## R12. Comprobación de valores sueltos (FR-021)

- **Decisión:** **Stylelint** con:
  - `stylelint-declaration-strict-value`: en las propiedades visuales (color, fondos, bordes, sombras, `outline`,
    márgenes, rellenos, `gap`, tipografía, radios, `z-index`, duraciones y curvas, `backdrop-filter`) solo admite
    `var(--…)` o palabras clave (`inherit`, `currentColor`, `transparent`, `none`, `0`, `auto`). El mensaje dice qué
    categoría de token toca usar.
  - `declaration-property-value-disallowed-list` con `/var\(--p-/`: los primitivos están prohibidos fuera de
    `packages/tokens`.
  - `media-feature-name-value-allowed-list`: solo los puntos de ruptura del token.
  - `color-no-hex` y `color-named: never`, como red de seguridad.

  Además, **ESLint** prohíbe `style={…}` en JSX (`react/forbid-dom-props`, salvo custom properties), y `jsx-a11y`
  añade sus reglas de accesibilidad.
- **Alternativas:** un plugin propio de Stylelint (innecesario mientras las reglas existentes basten).

## R13. Pruebas

- **Decisión:**
  - **Vitest** (Node):
    - niveles de referencia de los tokens;
    - generación del CSS (*snapshot*);
    - contraste de todas las parejas documentadas en ambos temas, cristal incluido (SC-001);
    - interpolación de textos;
    - test de glosario.
  - **Playwright + `@axe-core/playwright`** sobre el catálogo servido, en Chromium, Firefox y WebKit:
    - axe en cada página de componente y en la muestra, en ambos temas (SC-002);
    - recorridos con teclado (SC-003): diálogo, pestañas, avisos y paso de muestra;
    - ancho de 375 px y de 320 px (equivale a 1280 px con un zoom del 400 %, y cubre el 200 %): sin desplazamiento
      horizontal (SC-005);
    - 10 cargas con el tema guardado, comprobando `data-theme` y el fondo calculado en el primer fotograma (SC-006);
    - `reducedMotion: 'reduce'` y `forcedColors: 'active'` emulados, sin animaciones activas (SC-009);
    - comprobación de que `prefers-reduced-transparency` deja el cristal sólido (solo en Chromium).
  - Sin Testing Library ni jsdom: el comportamiento se prueba en navegadores reales a través del catálogo, que ya
    existe. Es una pieza menos (X).
- **Alternativas:** Vitest Browser Mode o Testing Library (duplican lo que hacen los e2e sobre el catálogo).

## R14. Monorepo y herramientas

- **Decisión:**
  - pnpm workspaces con `pnpm -r` para los scripts. Sin Turborepo ni Nx.
  - TypeScript `strict` + `erasableSyntaxOnly` (para el *type stripping* de Node) y referencias de proyecto.
  - Node 24 LTS (`.nvmrc`; Node 26 entra en LTS a finales de octubre de 2026 y se adoptará entonces).
  - `@ytcreator/ui` se consume desde el código fuente (`exports` a `src/`): sin paso de compilación de la librería
    mientras solo la consuman apps Vite del monorepo.
  - Prettier para el formato.
  - Una CI mínima de GitHub Actions (`lint`, `typecheck`, `test`, `test:e2e`) en las PR a `main` (principio IX).
- **Alternativas:** Turborepo (caché útil cuando haya muchos paquetes; hoy son tres); compilar `ui` con tsup (sin
  consumidor que lo necesite).

## R15. Disposición de avisos y zonas táctiles

- **Decisión:**
  - Los avisos se apilan arriba a la derecha en escritorio y arriba a ancho completo en móvil. Así no tapan ni la
    acción principal (abajo en móvil) ni el botón del asistente (abajo a la derecha). Se ven 3 a la vez como mucho.
  - Duración: 6 s más 60 ms por carácter. Los que llevan acción no se cierran solos.
  - Tamaños de control: `sm` 32 px, `md` 40 px y `lg` 44 px. Con `@media (pointer: coarse)`, `md` sube a 44 px. El
    mínimo absoluto, 24 px, se cumple siempre (FR-009).
- **Alternativas:** abajo a la derecha (choca con el botón del asistente).

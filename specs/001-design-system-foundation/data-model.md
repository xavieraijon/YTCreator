# Data Model: Base del design system

**Feature**: `001-design-system-foundation` | **Fecha**: 2026-10-26

No hay base de datos: las «entidades» son estructuras tipadas en TypeScript dentro de `packages/tokens` y
`packages/ui`, más la preferencia de tema en el navegador. Los nombres de código van en inglés.

---

## Token

Definido en `packages/tokens/src/{primitive,semantic,component}/*.ts`. Exportado en `dist/tokens.json`.

| Campo | Tipo | Regla |
|---|---|---|
| `name` | `string` | Kebab-case, único. Con prefijo de nivel en CSS: `--p-*`, `--s-*`, `--c-*` (ver [contracts/tokens.md](./contracts/tokens.md)) |
| `level` | `'primitive' \| 'semantic' \| 'component'` | Obligatorio |
| `category` | `'color' \| 'space' \| 'type' \| 'radius' \| 'shadow' \| 'glass' \| 'border' \| 'layer' \| 'motion' \| 'breakpoint'` | Obligatorio (FR-001) |
| `value` | `string` (primitivo) o `{ light: Ref; dark: Ref }` / `Ref` (semántico o de componente) | El primitivo lleva un valor literal; el resto solo referencias |
| `ref` | `Ref` | `semantic → primitive`, `component → semantic`. Nunca al mismo nivel ni a uno superior (FR-002). Se valida en tipos y en un test |
| `description` | `string` (es) | Obligatoria en semánticos y de componente: para qué se usa |
| `allowedOn` | `string[]` (nombres de fondos semánticos) | Obligatorio en semánticos de texto o icono (FR-004) |
| `reducedMotion` / `reducedTransparency` | `Ref` opcional | Valor alternativo con la preferencia activa (FR-014, FR-015) |

**Invariantes**

- Todo semántico de color tiene un valor para `light` y otro para `dark` (FR-005).
- Ningún token de componente apunta a un primitivo.
- Las categorías `breakpoint` no se emiten como custom properties, sino como constantes y como lista permitida para
  el linter (ver [research.md R5](./research.md)).

## ContrastPair

Definida en `packages/tokens/src/contrast-pairs.ts`; se genera a partir de `allowedOn` y se amplía a mano para los
casos de componente (p. ej. texto del botón principal sobre su fondo).

| Campo | Tipo | Regla |
|---|---|---|
| `foreground` | nombre de token semántico o de componente | — |
| `background` | nombre de token semántico o de componente | Si es de cristal, se evalúa compuesto sobre blanco, negro y el acento |
| `kind` | `'text' \| 'large-text' \| 'ui'` | Mínimo 4,5 / 3 / 3 |
| `ratio` | `{ light: number; dark: number }` | Calculado, no escrito a mano |
| `allowed` | `boolean` | `true` solo si ambos ratios cumplen el mínimo |

**Invariante (SC-001):** ninguna pareja documentada tiene `allowed = false`. El test falla con el detalle del
par y del tema.

## ThemePreference

| Campo | Tipo | Regla |
|---|---|---|
| valor | `'auto' \| 'light' \| 'dark'` | Por defecto `'auto'` |
| almacenamiento | `localStorage["ytc.theme"]` | Lectura y escritura en `try/catch`. Un valor desconocido o un error equivalen a `'auto'` |
| reflejo en el DOM | `html[data-theme]` | Ausente en `auto`; `light` o `dark` en los demás casos |

**Transiciones**

```text
auto ──elige claro──▶ light ──elige oscuro──▶ dark ──elige automático──▶ auto
  ▲ (sin atributo: sigue al sistema en caliente vía color-scheme)
```

- Al cambiar, se escribe en el almacenamiento y se actualiza el atributo en el mismo tick.
- La transición de colores al cambiar de tema se desactiva durante ese cambio, para evitar un barrido animado.

## Theme (resuelto)

No se guarda en ningún sitio: es el par de valores `light-dark()` de cada semántico, que el navegador resuelve según
`color-scheme`. El hook `useResolvedTheme()` lo expone (`'light' | 'dark'`) para los pocos casos que lo necesitan en
JavaScript, como mostrar en el catálogo «estás viendo el tema oscuro».

## UiStrings

Definido en `packages/ui/src/strings/`.

| Campo | Tipo | Regla |
|---|---|---|
| claves | objeto anidado por componente (`dialog.close`, `button.loading`, `stepper.position`, `stepper.done`, `stepper.current`, `stepper.pending`, `toast.close`, `field.optional`, `field.errorPrefix`, `theme.auto/light/dark`, `aiWorking.defaultLabel`…) | Tipado con `UiStrings` |
| valores | `string` con marcadores `{nombre}` | Interpolación propia; un marcador sin valor falla en el test |
| catálogo por defecto | `es.ts` | Pasa el test de glosario |

Se sustituye con `<UiStringsProvider strings={…}>`, de forma parcial y con mezcla profunda.

## ComponentDoc

Definido en `apps/catalog/src/docs/types.ts` (ver [contracts/catalog.md](./contracts/catalog.md)).

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `string` | Igual que la ruta `#/componentes/<id>` |
| `name`, `summary` | `string` (es) | — |
| `group` | `'actions' \| 'forms' \| 'containers' \| 'communication' \| 'progress'` | Grupos de FR-007 |
| `variants` | `{ title; render(): ReactNode }[]` | Al menos una |
| `states` | `{ state: 'default' \| 'hover' \| 'focus' \| 'active' \| 'disabled' \| 'loading' \| 'error' \| …; render() }[]` | Los que apliquen (US2) |
| `dos` / `donts` | `{ text; render?() }[]` | Al menos uno de cada (FR-018) |
| `a11y` | `string[]` | Notas de teclado, rol y anuncios |
| `tokens` | `string[]` | Tokens de componente que consume (se enlazan a fundamentos) |

**Invariante:** cada componente exportado por `@ytcreator/ui` tiene un `ComponentDoc`. Lo comprueba un test que
compara los *exports* con el registro de documentación (constitución VI: «documentación viva antes de usarse»).

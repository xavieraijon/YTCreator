# Contrato: tokens (`@ytcreator/tokens`)

Lo que el resto del monorepo puede usar del paquete de tokens. Lo que no aparece aquí es interno.

## Salidas del paquete

| Export | Contenido | Quién lo usa |
|---|---|---|
| `@ytcreator/tokens/tokens.css` | Custom properties de los tres niveles dentro de `@layer tokens` | `@ytcreator/ui` (lo importa una vez en `styles/index.css`) |
| `@ytcreator/tokens/tokens.json` | Metadatos de cada token y parejas de contraste con sus ratios | El catálogo y los tests |
| `@ytcreator/tokens/breakpoints` | `export const breakpoints = { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem' } as const` | JavaScript y la configuración de Stylelint |

## Nombres

```text
--p-<categoría>-<nombre>[-<paso>]      primitivo         --p-color-coral-500, --p-space-4, --p-radius-md
--s-<categoría>-<rol>[-<variante>]     semántico         --s-color-text-secondary, --s-color-surface-raised
--c-<componente>-<parte>[-<estado>]    de componente     --c-button-primary-bg, --c-button-primary-bg-hover
```

- **Quién puede usar cada nivel:**
  - `--p-*` solo puede usarse dentro de `packages/tokens`;
  - los componentes de `@ytcreator/ui` usan `--c-*` y `--s-*`;
  - las pantallas usan `--s-*` y `--c-*` (FR-021).
- Los nombres no cambian entre temas: el valor por tema va dentro de `light-dark()`.

## Inventario mínimo de semánticos (v1 de esta feature)

| Categoría | Tokens |
|---|---|
| Fondos y superficies | `color-bg`, `color-surface`, `color-surface-raised`, `color-surface-sunken`, `color-surface-overlay` (scrim), `color-surface-inverse` |
| Texto e iconos | `color-text-primary`, `color-text-secondary`, `color-text-tertiary`, `color-text-disabled`, `color-text-on-accent`, `color-text-accent`, `color-text-inverse` |
| Bordes | `color-border-subtle`, `color-border-default`, `color-border-strong`, `color-border-focus` |
| Acento | `color-accent`, `color-accent-hover`, `color-accent-active`, `color-accent-subtle`, `gradient-brand`, `gradient-ai` |
| Estados (`success`, `warning`, `danger`, `info`) | `color-<estado>-fg`, `color-<estado>-bg`, `color-<estado>-border` |
| Cristal | `glass-bg`, `glass-border`, `glass-blur`, `glass-highlight` |
| Elevación | `shadow-1` (tarjeta), `shadow-2` (popover), `shadow-3` (diálogo), `glow-accent`, `glow-ai` |
| Espaciado | `space-0` … `space-12` (escala de 4 px: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80) |
| Tipografía | `font-family-ui`, `font-family-mono`; `font-size-xs` … `font-size-4xl`; `font-weight-regular/medium/semibold`; `line-height-tight/ui/reading`; `letter-spacing-tight` |
| Radios | `radius-sm` (4), `radius-md` (8), `radius-lg` (12), `radius-xl` (16), `radius-full` |
| Bordes | `border-width-default` (1px), `border-width-strong` (2px), `focus-ring-width` (2px), `focus-ring-offset` (2px) |
| Capas | `z-base`, `z-raised`, `z-sticky`, `z-overlay`, `z-popover`, `z-toast` |
| Movimiento | `duration-instant` (80ms), `duration-fast` (150ms), `duration-normal` (240ms), `duration-slow` (400ms), `duration-ai-cycle` (3s); `easing-standard`, `easing-enter`, `easing-exit` |
| Controles | `control-height-sm/md/lg` (32/40/44), `icon-size-sm/md/lg` (16/20/24), `target-min` (24) |

- Con `prefers-reduced-motion: reduce`, todas las duraciones pasan a `0ms`, salvo `duration-fast`, que se queda solo
  para las opacidades.
- Con `prefers-reduced-transparency: reduce` o sin `backdrop-filter`, `glass-bg` pasa a `color-surface-raised` y
  `glass-blur` a `none`.

## Reglas de autoría

1. Un semántico de texto o icono declara `allowedOn`. Si falta, el *build* falla.
2. Añadir un token de componente no requiere tocar los semánticos. Añadir un primitivo no cambia nada visible
   hasta que algún semántico lo referencia.
3. Cambiar el acento de marca consiste en editar `primitive/color.ts`. Nada más cambia (supuesto de la spec).

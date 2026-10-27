# Contrato: tema

## Plugin de Vite (`@ytcreator/ui/vite`)

```ts
export function themeInit(): Plugin
```

Inyecta en el `<head>` de `index.html`, como primer hijo y antes de cualquier `<link rel="stylesheet">`:

1. `<meta name="color-scheme" content="light dark">`;
2. un `<script>` en línea que:
   - lee `localStorage.getItem('ytc.theme')` dentro de `try/catch`;
   - si el valor es `light` o `dark`, pone `document.documentElement.dataset.theme`;
   - en cualquier otro caso no hace nada.

Ocupa menos de 300 bytes y no depende de nada.

## API de React (`@ytcreator/ui`)

```ts
type ThemePreference = 'auto' | 'light' | 'dark'

function useThemePreference(): {
  preference: ThemePreference
  setPreference(p: ThemePreference): void   // guarda (try/catch) y actualiza html[data-theme]
}

function useResolvedTheme(): 'light' | 'dark' // escucha matchMedia y data-theme

function ThemeSwitcher(props: { className?: string }): JSX.Element
// Grupo de opciones segmentado: Automático / Claro / Oscuro (textos de UiStrings).
```

## CSS

```css
:root { color-scheme: light dark; }
:root[data-theme='light'] { color-scheme: light; }
:root[data-theme='dark']  { color-scheme: dark; }
```

Todo semántico de color usa `light-dark(<claro>, <oscuro>)`. Ningún componente consulta `prefers-color-scheme`
directamente.

## Garantías

| Situación | Resultado |
|---|---|
| Sin preferencia guardada | Sigue al sistema y cambia en caliente (escenarios 1.1 y 1.2) |
| Preferencia guardada | Se aplica antes del primer pintado (SC-006) |
| `localStorage` bloqueado | «Automático», sin errores en consola (caso límite) |
| Valor corrupto en el almacenamiento | «Automático» |

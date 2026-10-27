# Contrato: comprobaciones de calidad

Comandos desde la raíz. Todos deben estar en verde para integrar en `main` (principio IX).

| Comando | Qué ejecuta | Falla si… |
|---|---|---|
| `pnpm lint` | ESLint (TS, React, `jsx-a11y`) y Stylelint | Hay un valor visual suelto, un primitivo fuera de `tokens`, un `style={…}`, un punto de ruptura que no es de token, o una infracción de `jsx-a11y` |
| `pnpm typecheck` | `tsc -b` | Hay un error de tipos. Incluye las referencias entre niveles de token |
| `pnpm test` | Vitest | Ver la tabla de tests unitarios |
| `pnpm test:e2e` | Playwright (Chromium, Firefox y WebKit) sobre el catálogo compilado | Ver la tabla de tests e2e |

## Mensajes de Stylelint (FR-021, escenario 5.1)

Formato: `<fichero>:<línea>:<col> — Valor suelto en "<propiedad>". Usa un token de <categoría> (var(--s-…) o
var(--c-…)).`

Ejemplo:

```text
packages/ui/src/components/Button/Button.module.css:12:3 — Valor suelto en "padding". Usa un token de espaciado (var(--s-space-…) o var(--c-button-…)).
```

## Tests unitarios (Vitest)

| Test | Garantiza |
|---|---|
| `tokens/levels.test.ts` | Cada referencia apunta al nivel inferior (FR-002) |
| `tokens/build.test.ts` | El CSS generado es estable (*snapshot*) y todo semántico de color tiene los dos temas |
| `tokens/contrast.test.ts` | Toda `ContrastPair` cumple su mínimo en ambos temas; el cristal, sobre los peores fondos (SC-001, escenario 3.4) |
| `ui/strings.test.ts` | Ningún marcador queda sin resolver |
| `ui/glossary.test.ts` | Los textos de `ui` y de la página de muestra no contienen términos prohibidos (principio I) |
| `catalog/docs-coverage.test.ts` | Cada componente exportado tiene su `ComponentDoc` |

## Tests e2e (Playwright + axe)

| Test | Garantiza |
|---|---|
| `a11y.spec.ts` | axe con 0 infracciones (WCAG 2.2 AA) en cada ficha de componente y en la muestra, en los dos temas (SC-002) |
| `theme.spec.ts` | Persistencia, «automático» en caliente, almacenamiento bloqueado y 10 cargas sin destello (SC-006) |
| `keyboard.spec.ts` | Diálogo (foco atrapado y devuelto), pestañas, sección plegable, avisos (F8) y recorrido completo de la muestra solo con teclado (SC-003) |
| `responsive.spec.ts` | A 375 px y a 320 px, `scrollWidth <= clientWidth` en el catálogo y la muestra (SC-005); zonas táctiles de al menos 24 px |
| `preferences.spec.ts` | Con `reducedMotion: 'reduce'`, `document.getAnimations()` no devuelve ninguna animación infinita. Con `forcedColors`, el foco sigue siendo visible. Con transparencia reducida (Chromium), el `backdrop-filter` calculado del cristal es `none` (SC-009) |
| `sample.spec.ts` | El paso de muestra se completa: elegir, escribir, abrir «Modo experto», generar, ver el resultado y el aviso (escenario 4.1) |

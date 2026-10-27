# Validación: 001 Design system foundation

Fecha: 2026-10-26. Lo hizo el agente de implementación. Las comprobaciones en el navegador se hicieron con Playwright (Chromium, Firefox y WebKit) sobre `pnpm --filter catalog dev`.

## Puerta de calidad (T100)

- [x] `pnpm lint`: limpio (ESLint y Stylelint).
- [x] `pnpm typecheck`: limpio.
- [x] `pnpm test`: 123 de 123.
- [x] `pnpm test:e2e`, en los tres motores: 94 pasan y 2 se omiten. Las 2 omitidas son «transparencia reducida», que solo se emula en Chromium.
- [x] `prettier --check .`: limpio. Se ignora `.claude/` porque lo genera Spec Kit, igual que `.specify/`.

## SC-004: pantalla nueva en menos de 2 h (T101)

- **Pantalla:** «Ajustes del canal» (`apps/catalog/src/sample/ChannelSettings.tsx`). Usa `Tabs`, `Card`, `TextField`, `TextArea`, `Select`, `Switch`, `EmptyState`, un `Button` principal y un aviso.
- **CSS propio:** 30 líneas en `ChannelSettings.module.css`, solo de colocación (grid, gap, anchura máxima) y la tipografía del título. Todo son tokens.
- **Tiempo:** el agente la construyó y verificó en menos de 5 minutos, de las 16:56 a las 16:57 según el reloj. El objetivo es menos de 2 h. La cifra mide al agente, no a una persona, pero la pantalla no necesitó ningún componente ni token nuevo.
- **Resultado:**
  - `pnpm lint` y `pnpm typecheck` quedaron limpios a la primera.
  - axe no encontró infracciones en las 3 pestañas y en los 2 temas.
  - No hay desplazamiento horizontal a 320 px.
  - El aviso «Ajustes guardados» aparece.
- **Observación:** en la pestaña «Series» conviven la acción del `EmptyState` y «Guardar los ajustes», y las dos son primarias. Es una decisión de composición de la pantalla, no un fallo del sistema. Al construir pantallas reales, la acción de guardar debería ir fuera de las pestañas o el `EmptyState` debería usar una acción secundaria.
- **Destino:** la pantalla se borró después. No aporta nada nuevo frente a `#/muestra` y mantenerla obligaría a añadir una ruta.

## Escenarios del quickstart (T102)

| # | Resultado | Cómo se comprobó |
|---|---|---|
| 1 | ✅ Oscuro desde el primer instante; cada semántico muestra los dos temas y su contraste | `theme.spec.ts` (1.1) y la ficha de color |
| 2 | ✅ Cambia en caliente | `theme.spec.ts` (1.2), emulando el esquema de color del sistema |
| 3 | ✅ Sigue en claro tras recargar | `theme.spec.ts` (1.3) |
| 4 | ✅ «Automático», sin errores en consola | `theme.spec.ts`, con el almacenamiento bloqueado, en WebKit además de los otros motores |
| 5 | ✅ Alcance con Tab, activación con Espacio y foco visible | `keyboard.spec.ts` (2.1, 2.2) y `preferences.spec.ts` (foco con colores forzados) |
| 6 | ✅ El foco queda atrapado y vuelve al botón | `keyboard.spec.ts` (2.3), cerrando con Escape y con el botón |
| 7 | ✅ Árbol accesible correcto y confirmado con VoiceOver real | El snapshot ARIA de WebKit da «Paso 3 de 5» y cada paso con «completado», «paso actual» o «pendiente». «Modo experto» es un `details/summary` nativo, que VoiceOver anuncia como plegado o desplegado. El creador lo comprobó con VoiceOver el 2026-10-27. |
| 8 | ✅ Aurora y texto visibles | Fichas `ai-working` y `glass-panel`, y la muestra mientras genera |
| 9 | ✅ Correcto por emulación y con los ajustes reales de macOS | `preferences.spec.ts`: sin animaciones infinitas con movimiento reducido, y cristal sólido con transparencia reducida (Chromium). El creador lo comprobó con los ajustes reales de macOS el 2026-10-27. |
| 10 | ✅ Flujo completo sin instrucciones | `sample.spec.ts` |
| 11 | ✅ Sin desplazamiento horizontal a 375 y 320 px, acción fija abajo, avisos arriba, solo teclado | `responsive.spec.ts` y `sample.spec.ts` |
| 12 | ✅ La misma marca, la misma firma de IA y la misma jerarquía | `a11y.spec.ts` en los dos temas y capturas comparadas |
| 13 | ✅ Falla con la propiedad y el token que corresponde | `packages/ui/test/stylelint.test.ts` (5.1) |
| 14 | ✅ Explica los tres niveles, con ejemplo, quién usa cada uno y qué hacer si falta un token | Portada `#/` (T098) |
| 15 | ✅ Usable a 200 % (1280×800 equivale a 640×400 px CSS): el flujo se completa sin desplazamiento horizontal | Comprobación puntual con Playwright en WebKit y captura |

Los escenarios 7 (VoiceOver) y 9 (ajustes reales de macOS) los comprobó el creador a mano en su Mac.

## Estética (T104)

- [X] Aprobada explícitamente por el creador el 2026-10-27 en `#/muestra`, en los dos temas y en móvil, tras la
  revisión estética T106–T111.

# Quickstart: validar la base del design system

Guía para comprobar que la feature 001 funciona de punta a punta. Los detalles de cada pieza están en
[contracts/](./contracts/) y en [data-model.md](./data-model.md).

## Requisitos

- Node 24 LTS (`nvm use`, que lee `.nvmrc`). En esta máquina hay Node 20: hay que actualizarlo.
- pnpm 10 o superior.
- Para los e2e, los navegadores de Playwright: `pnpm exec playwright install`.

## Puesta en marcha

```bash
pnpm install
pnpm --filter @ytcreator/tokens build   # genera tokens.css, tokens.json y breakpoints
pnpm --filter @ytcreator/catalog dev    # catálogo en http://127.0.0.1:5173
```

## Comprobaciones automáticas

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

**Resultado esperado:** todo en verde. Qué cubre cada comando: [contracts/quality-gates.md](./contracts/quality-gates.md).

## Escenarios manuales

| # | Pasos | Resultado esperado | Cubre |
|---|---|---|---|
| 1 | Con el sistema en oscuro y sin preferencia guardada, abrir `#/fundamentos/color` | Tema oscuro desde el primer instante. Cada semántico muestra los dos temas y su contraste | US1 (1.1, 1.4) |
| 2 | Con «Automático», cambiar el sistema operativo a claro | El catálogo cambia sin recargar | 1.2 |
| 3 | Elegir «Claro», cerrar la pestaña y volver a abrir | Sigue en claro | 1.3 |
| 4 | Abrir en una ventana privada de Safari con el almacenamiento bloqueado | «Automático», sin errores en consola | Caso límite |
| 5 | `#/componentes/button`: recorrer con Tab y Espacio | Todas las variantes y estados, foco visible y activación sin ratón | US2 (2.1, 2.2) |
| 6 | `#/componentes/dialog`: abrir, pulsar Tab muchas veces y luego Escape | El foco no sale del diálogo y al cerrar vuelve al botón que lo abrió | 2.3 |
| 7 | Probar el lector de pantalla (VoiceOver) en `Stepper` y `Disclosure` | Anuncia «paso 3 de 5» y el estado de cada paso, y si «Modo experto» está desplegado o plegado | 2.4, 2.5 |
| 8 | Activar `AiWorking` y abrir un `GlassPanel` | Aurora reconocible y texto visible | US3 (3.1) |
| 9 | Activar en macOS «Reducir movimiento» y «Reducir transparencia» y repetir el paso 8 | Sin animación continua y con cristal sólido (en Safari y Firefox, que no exponen «reducir transparencia», el cristal se mantiene, pero legible; FR-015) | 3.2, 3.3, SC-009 |
| 10 | Abrir `#/muestra` en escritorio y completar el paso | Elegir, escribir, abrir «Modo experto», generar, ver el resultado y el aviso, sin instrucciones | US4 (4.1) |
| 11 | Repetir el paso 10 a 375 px (DevTools) y solo con teclado | Sin desplazamiento horizontal, con la acción principal fija abajo y los avisos arriba | 4.2, SC-003, SC-005 |
| 12 | Comparar `#/muestra` en claro y en oscuro | La misma marca, la misma firma de IA y la misma jerarquía | 4.3 |
| 13 | Escribir `color: #fff;` o `padding: 13px;` en un `.module.css` de `ui` y ejecutar `pnpm lint` | Falla, con la línea y el token que corresponde | US5 (5.1) |
| 14 | Leer `#/` (portada del catálogo) | Explica los tres niveles de token y cuál usar en cada caso | 5.2 |
| 15 | Zoom del navegador al 200 % en `#/muestra` | Usable, sin pérdida de información | Caso límite, SC-005 |

## Cierre de la feature

1. **Auditoría de novato** sobre `#/muestra` (SC-007): el informe debe dar 0 graves y como mucho 3 medios.
2. **Aprobación explícita de la estética** por el creador del producto, en ambos temas y en móvil (SC-008). Si no
   convence, se ajustan los primitivos (research R2) y se repite.

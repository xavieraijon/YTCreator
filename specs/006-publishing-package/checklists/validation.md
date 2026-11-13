# Validación de la 006: paquete de publicación

## Foundational (T001–T018), Puerta A del 2026-11-13

### 1. Resumen

La base del paquete está lista: modelo de piezas y estados, migración 0007, repos con versiones inmutables, conocimiento
`publish/` validado al arrancar, la vista y las rutas base, y en la web la lista y el esqueleto con `Stepper`. Los cuatro
revisores no encontraron nada grave. Los hallazgos confirmados (la lista sin título si una fila está rota, lo medido sin
origen, afirmaciones sin fuente o supuesto, el texto de los Shorts) están corregidos. La interfaz aún no tiene recorrido
propio: su e2e y axe llegan con US1.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T004–T005 modelo, límites y pasos por formato | Cumplido | `packages/core/test/publish/model.test.ts` | 2026-11-13 |
| T006–T007 seis estados y avisos | Cumplido | `packages/core/test/publish/status.test.ts` | 2026-11-13 |
| T008–T009 migración 0007 aditiva | Cumplido | `apps/server/test/db/migration-0007.test.ts`, versiones `[1..7]` en las anteriores | 2026-11-13 |
| T010–T011 repos, versión por pieza, inmutables | Cumplido | `apps/server/test/db/repos/packages.test.ts` (11 casos) | 2026-11-13 |
| T012 fuentes abiertas antes de citar | Cumplido | Abiertas en esta sesión: Ayuda de YouTube 57404, 9884579, 6390658, 13861714, 12340300, 12948449, 9528076, 14328491 y la documentación de vídeos para desarrolladores. Lo que no respaldan lleva `assumption`. Revisión del 2026-11-13 (la tarea decía 12; corregida) | 2026-11-13 |
| T013 consejos del oficio | Cumplido | `craft.json`, con el contraste como supuesto (decisión 23); `packages/knowledge/test/publish.test.ts` | 2026-11-13 |
| T014 contratos `PackageView` y `PackageSummary` | Cumplido | `packages/core/src/api/publish.ts`; el cliente web valida con ellos | 2026-11-13 |
| T015–T016 rutas base | Cumplido | `apps/server/test/http/packages-base.test.ts` (7 casos: 201/200, `sin_aprobar`, paquete previo con guion reabierto, canal ajeno, fila rota, lo medido tras un fallo, no encontrado) | 2026-11-13 |
| T017 web base | Parcial | Compila; rutas con test (también `ajustes` reservada); el recorrido y axe llegan con US1 | 2026-11-13 |

### 3. Cómo se comprobó

Tras las correcciones: `fnm exec --using=24 -- pnpm lint` (código 0), `typecheck` (código 0) y `test` (código 0,
182 ficheros, 2328 pasados y 4 omitidos). `test:e2e`: ver el punto 4. El flujo real de la fase (abrir el paquete de un
guion aprobado con la IA falsa, leerlo y listarlo) es el de `packages-base.test.ts`.

### 4. Controles

- Pasados: lint, typecheck, test, glosario (con `publishEs`, las etiquetas de `publish/` y ahora «brief» prohibido),
  `secrets-leak` dentro del e2e.
- `test:e2e`: 49 de 49, código 0, antes de las correcciones de revisión, que en la web solo tocan textos, la lista y una
  ruta reservada, sin recorrido e2e todavía.
- No ejecutados: axe en claro y oscuro a 375 y 1280 px, teclado y reduced-motion de las pantallas nuevas, porque aún no se
  llega a ellas desde la app (la entrada es T024); van en el e2e de US1. Tipos de fallo de IA: esta fase no llama a la IA.
  `test:installer`: no se toca el instalador.

### 5. Hallazgos

Corregidos:
- Una versión de `titulos` que no valida tumbaba la lista entera (lógica, seguridad, regresión): ahora cae al título de
  trabajo, con test.
- Lo medido en la 004 se perdía tras una medición fallida o un cambio de la idea, y no decía su origen (fidelidad): se toma
  la última medida `medida`, con `source`, `partial` y `olderRevision` (decisión 20), con test.
- `studio.json`: idioma y categoría sin fuente ni supuesto, y la categoría presentada como regla de YouTube (fidelidad,
  lógica, regresión): marcados como supuesto, texto corregido, y el esquema exige fuente o supuesto (decisión 23).
- La misma dirección con dos títulos en `studio.json` y `made-for-kids.json` (regresión): igualado al de la 003.
- Falta el consejo de contraste (fidelidad, regresión): añadido como supuesto.
- Sin test de canal ajeno (fidelidad, seguridad, regresión): añadido.
- Un Short decía «Título y miniatura» en la lista (fidelidad): ahora «Título y portada» (decisión 24).
- El estado vacío decía «primero aprueba un guion» aunque hubiera alguno: texto que sirve en los dos casos.
- `/canal/publicaciones/ajustes` se leería como un paquete (lógica, regresión): reservada, con test.
- Los dos provisionales de los avisos (`sourcesCount: 0` y parte fija vacía) no tenían tarea que los quitara (lógica):
  T036 los nombra.
- Fecha de revisión distinta de la tarea (los cuatro): la tarea dice ahora 2026-11-13, la fecha real.
- Límites y la regla `sin_fuentes` sin registrar (fidelidad, regresión): decisiones 21 y 22.
- «brief» no estaba en los términos prohibidos (regresión): añadido.

Descartados:
- Decisiones 14 y 17 mal clasificadas (fidelidad): salieron del análisis, y el creador pidió aplicar esas correcciones el
  2026-11-13; son de riesgo medio (actuar, registrar y destacar), no alto.
- La inmutabilidad solo se prueba por la forma del repo (regresión): es la misma garantía que la 005; ninguna ruta escribe
  `UPDATE` sobre `package_version`.
- Las respuestas no se validan con el esquema en los tests del servidor (regresión): el cliente web las valida al leerlas,
  como en la 005.
- Los textos de `studio.json` y `craft.json` no pasan por el glosario (regresión): todavía no se enseñan; entran en el test
  cuando la lista guiada los muestre (US3).

Abiertos: ninguno grave ni medio.

### 6. Desviaciones

`PackageView.measured` lleva más que lo planeado: `source`, `partial` y `olderRevision` (principio V). Los capítulos con
minuto, las fuentes, la descripción montada y la lista guiada de la vista llegan con US2 y US3, como estaba previsto.

### 7. Decisiones

Agente: 20 a 24 (medio: 20, 22, 23 y 24, destacadas aquí; bajo: 21). Pendientes del creador: ninguna para esta fase.

### 8. Constitución

I (textos sin jerga, «brief» prohibido), II (versiones inmutables, nada cambia solo), V (conocimiento con fuente y fecha o
supuesto marcado, lo medido con origen y fecha), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta fase. La migración 0007 solo añade tablas. Queda pendiente: US1 en adelante.

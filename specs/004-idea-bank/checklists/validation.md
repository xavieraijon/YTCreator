# Validación: 004 banco de ideas

Informes de la Puerta A (`/puerta-a`), uno por fase o historia.

## Fase 2: Foundational (T001–T013)

### 1. Resumen

- El banco tiene su base: modelo y esquemas en `core`, la migración `0005`, los repos, los umbrales v5, los tres usos
  de IA con su prompt `v1` y la ruta `GET /api/channels/:id/ideas` con su pantalla mínima en `/canal/ideas`.
- Los cuatro revisores no encontraron nada grave. Los hallazgos medios y menores confirmados se han corregido o
  registrado en `decisions.md` (entradas 9 a 16).
- Resultado: **pasada**. Los controles terminan con código 0 y no queda ningún pendiente de riesgo alto.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T001 `ideas/` y `api/ideas.ts` exportados | Cumplido | `packages/core/src/index.ts`, `packages/core/src/api/index.ts` | 2026-11-07 |
| T002 `ideas.es.ts` en el test de glosario | Cumplido | `apps/web/test/glossary.test.ts` | 2026-11-07 |
| T003–T004 modelo y `ideaDraftSchema` | Cumplido | `packages/core/test/ideas/model.test.ts` | 2026-11-07 |
| T005–T006 migración `0005` sin pérdida de datos | Cumplido | `migration-0005.test.ts` compara filas enteras; restricciones de `idea_batch`, `idea` e `idea_measure` | 2026-11-07 |
| T007–T008 repos y `medir_ideas` con `channel_id` | Cumplido | `apps/server/test/db/repos/ideas.test.ts` (el fichero sigue la convención `test/db/repos/`, no el nombre de la tarea) | 2026-11-07 |
| T009 umbrales v5 con su fuente de supuesto | Cumplido | `thresholds.json` (`data.ideas.basis`), `market.test.ts` | 2026-11-07 |
| T010 esquemas de API | Cumplido | `packages/core/test/api/ideas.test.ts` | 2026-11-07 |
| T011–T012 `GET .../ideas` (409 `sin_perfil`, vacío, 404, avisos) | Cumplido | `apps/server/test/http/ideas-base.test.ts` | 2026-11-07 |
| T013 cliente, ruta `/canal/ideas` y pantalla | Cumplido | `apps/web/test/channel/idea-bank.test.tsx`, `router.test.ts` | 2026-11-07 |

### 3. Cómo se comprobó

- `fnm exec --using=24 -- pnpm lint`: código 0.
- `fnm exec --using=24 -- pnpm typecheck`: código 0.
- `fnm exec --using=24 -- pnpm test`, tras borrar `node_modules/.vitest-cache`: 130 ficheros, 1553 pruebas pasadas y
  2 saltadas, código 0.
- `fnm exec --using=24 -- pnpm test:e2e`: 97 + 35 pasadas, código 0.

### 4. Controles obligatorios

- **Pasados:**
  - `lint`, `typecheck` y `test`;
  - el glosario, con `ideasEs` incluido;
  - la batería de contrato de IA, que recorre los tres usos nuevos (válida, inválida dos veces y cifra inventada);
  - `test:e2e` antes y después de las correcciones: 97 + 35 pasadas las dos veces, código 0.
  - `secrets-leak` está dentro de `test:e2e`.
- **No ejecutados:**
  - `test:installer`: la fase no toca el instalador.
  - axe en claro y oscuro, el teclado y `prefers-reduced-motion` de `/canal/ideas`: la pantalla solo tiene el título,
    el «por qué importa» y el aviso sin perfil. El recorrido con axe es `apps/web/e2e/ideas.spec.ts`, que llega con
    US1.
  - Los tipos de fallo de IA en el banco: no hay todavía llamadas de IA desde sus rutas (US1).

### 5. Hallazgos de revisión

- **Confirmados y corregidos:**
  - las búsquedas no rechazaban operadores (`-x`, `+x`, `OR`, `|`, `campo:valor`);
  - el validador de cifras miraba todos los campos de una idea, no solo `hook` y `why` (decisión 12);
  - `opportunity` no admitía solo `{failure}`;
  - las unidades de la Data API estaban escritas a mano en el bloque del supuesto (decisión 13);
  - `reviewedAt` de `thresholds.json` decía que todo el fichero se revisó hoy: vuelve a 2026-11-05;
  - el reformateo entero de `thresholds.json`: se deja solo el bloque nuevo;
  - el test de la migración solo contaba filas: ahora compara filas enteras con estados y fallos variados, y prueba
    las restricciones de `idea_batch`;
  - un `medir_ideas` sin canal: `CHECK` en la migración;
  - `setStatus` aceptaba cualquier cambio de estado: `canMoveIdea` e `IdeaMoveError`;
  - `edit` pisaba con `undefined`;
  - `pilar_invalido` no afectaba a `otro_enfoque`;
  - un pilar vacío se guardaba como `''`;
  - `stale` y `measuredOlderRevision` con una medida fallida (decisión 11);
  - «Llega muy pronto» en `start.nextStep`;
  - el texto de `sin_medida_quemada` no hablaba de las competidas;
  - `CandidateDecision` repetido a mano; `db` y `backToChannel` sin uso;
  - el contrato decía `cifras_inventadas` y el escenario es `cifra_inventada`;
  - la spec decía un vídeo de 100.000 visitas y R3 dice dos (decisión 14).
- **Registrados sin cambio de código:** el adelanto de la fontanería de IA (decisión 9), las ideas propias sin aviso
  de perfil antiguo (decisión 10), el riesgo de la migración (decisión 15) y `pendingBatch` solo de ideas (decisión
  16).
- **Quedan para su historia:**
  - el redondeo de `medianViews` lo hace US2 al calcular, como dice ya `idea-measure.md`;
  - `progress.ideaIds` en la vista del trabajo, para «Seguir midiendo» (US2);
  - el `409` de un índice ya decidido lo hace la ruta de US1;
  - el botón «Ir al banco de ideas» en `Start.tsx` es T027.
- **Descartados:** el «canal ajeno» de T011 no aplica, porque en la v1 hay un solo creador y un solo canal (FR-028
  de la 003). El 404 se prueba con un canal que no existe.

### 6. Desviaciones respecto a la spec

- **De más:** se adelanta la fontanería de IA de US1–US3 (decisión 9) y `GET .../ideas/archived` (de US4), con sus
  pruebas. El botón de entrada al banco está en el perfil, que es lo que se ve con el canal listo; el de `Start.tsx`
  llega con T027.
- **De menos:** nada de lo que pide la fase.

### 7. Decisiones

- **Del agente:** entradas 9 a 16 de `decisions.md`, de riesgo bajo y medio.
- **Pendientes del creador:** ninguna.

### 8. Impacto en la constitución

- **III (coste):** los usos nuevos tienen tope de salida y tiempo por proveedor. El validador sigue mirando las cifras
  de opinión.
- **IV (IA):** prompts `v1` con su suma en `lock.json`, salida Zod, perfil por proveedor y esquema estricto del pilar.
- **V (conocimiento):** el supuesto lleva su fuente y fecha. Las unidades salen de la cuota de la Data API.
- **IX (pruebas):** cada pieza tiene su prueba.
- **XI (autonomía):** los huecos están registrados.

### 9. Cómo revertir y qué queda

- **Revertir:** revertir el commit de la fase. La migración `0005` no se puede deshacer sola sobre una base que ya
  la tenga: haría falta una `0006` que rehaga `background_job` sin `channel_id` y borre las tres tablas.
- **Queda:** US1 a US4 y Polish (T015–T067).

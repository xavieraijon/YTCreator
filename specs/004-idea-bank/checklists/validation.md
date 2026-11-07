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

## US1: tandas de ideas y escribir las propias (T015–T028)

### 1. Resumen

- El creador pide una tanda de ideas de vídeo con su coste por delante, se queda o descarta cada candidata, pide otra
  con indicaciones (también con el banco ya lleno), escribe las suyas y las cambia. Las repetidas se quitan y se avisa.
- Los cuatro revisores no encontraron nada grave tras verificar; los dos «graves» de lógica (dos `decide` o dos
  `PATCH` a la vez) eran reales y están corregidos con relectura dentro de la transacción y su prueba en paralelo.
- Resultado: **pasada**. Todos los controles con código 0 y sin pendientes de riesgo alto.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| FR-001/AS1 tanda de 6 a 10 con estimación previa | Cumplido | `ideas-batch.test.ts` «estimates first…», e2e `ideas.spec.ts` | 2026-11-07 |
| FR-002/AS2 quedarse o descartar cada una; las quedadas al final del banco | Cumplido | `ideas-batch.test.ts` «keeps the chosen…»; e2e | 2026-11-07 |
| FR-004 sin repetir banco, archivo, descartadas ni pendientes, sin tope en el filtro | Cumplido | `repeats.test.ts`; `ideas-batch.test.ts` (repetidas, pendientes, más de 200) | 2026-11-07 |
| FR-005/AS3 otra tanda con indicaciones, con tanda pendiente o sin ella | Cumplido | `idea-bank.test.tsx`; `ideas-batch.test.ts` | 2026-11-07 |
| Tanda que queda vacía por repetidas: se avisa y no se pierde la pendiente | Cumplido | `ideas-batch.test.ts` «every candidate repeats»; decisión 17 | 2026-11-07 |
| AS4 escribir una idea propia (título y formato bastan); aviso de duplicada | Cumplido | `ideas-own.test.ts`; e2e (duplicada escrita de otra forma) | 2026-11-07 |
| «Cambiar algo» con `revision` y 409 con lo actual | Cumplido | `ideas-own.test.ts`, también con dos `PATCH` en paralelo | 2026-11-07 |
| AS5 sin perfil: aviso y camino al perfil | Cumplido | `ideas-base.test.ts`, `idea-bank.test.tsx` | 2026-11-07 |
| Lista con título, gancho, pilar, formato, origen y estado | Cumplido | `IdeaCard.tsx`, `idea-bank.test.tsx` | 2026-11-07 |
| Pilar de la IA dentro del perfil (`pilar_invalido` → reintento) | Cumplido | `fake.test.ts`, `ideas-batch.test.ts` | 2026-11-07 |
| Cifra inventada en el gancho → `claimsTrimmed` | Cumplido | `ideas-batch.test.ts` | 2026-11-07 |
| `limite_de_gasto`: nada gastado ni creado | Cumplido | `ideas-batch.test.ts` | 2026-11-07 |
| T027 entrada al banco desde el canal | Cumplido (en `Profile.tsx`) | decisión 22 | 2026-11-07 |

### 3. Cómo se comprobó

- `fnm exec --using=24 -- pnpm lint` y `typecheck`: código 0.
- `fnm exec --using=24 -- pnpm test`, tras borrar `node_modules/.vitest-cache`: 133 ficheros, 1581 pruebas pasadas y
  2 saltadas (proveedores reales), código 0.
- `fnm exec --using=24 -- pnpm test:e2e` antes de corregir: 97 + 36 pasadas, código 0. Tras las correcciones, la
  primera vuelta falló en `ideas.spec.ts` (axe, `label-content-name-mismatch`); corregido, la segunda: 97 + 36
  pasadas, código 0.
- El flujo real de la historia con los proveedores falsos es `apps/web/e2e/ideas.spec.ts`: tanda, quedarse dos,
  descartar el resto (con el foco tras cada decisión), idea propia en Short, duplicada y recarga.

### 4. Controles obligatorios

- **Pasados:**
  - `lint`, `typecheck` y `test`; el glosario con los textos nuevos;
  - `test:e2e` con `secrets-leak` y axe en claro y oscuro a 375 y 1280 px y zoom del 200 % en cada paso del banco
    (`audit.ts`);
  - teclado: el foco pasa al estado de la candidata tras «Me la quedo» (e2e); los botones nombran la idea;
  - fallos de IA: se enseñan con `AiAction`, el mismo componente probado en la 003 para los cinco tipos; la ruta
    devuelve `{failure}` sin crear tanda (prueba con `limite_de_gasto`).
- **No ejecutados:** `test:installer` (la historia no toca el instalador); `prefers-reduced-motion`, porque las
  pantallas nuevas no añaden animaciones propias.

### 5. Hallazgos de revisión

- **Confirmados y corregidos:**
  - dos `decide` o dos `PATCH` a la vez pasaban las dos la comprobación con la lectura previa al `await`: se relee
    dentro de la transacción (pruebas en paralelo con `Promise.all`; no comprobé que fallaran antes del cambio);
  - la tanda vacía por repetidas se cobraba, no se enseñaba y descartaba la pendiente (decisión 17);
  - las candidatas pendientes no iban en `avoid` ni en el filtro, y la tanda siguiente podía repetirlas (decisión 24);
  - el tope de 200 ponía primero todas las ideas y el filtro del servidor usaba la lista cortada: ahora se mezclan
    por fecha y el filtro usa la lista entera;
  - «Reintentar» no volvía a pedir la estimación y el botón de proponer quedaba apagado;
  - el aviso de duplicada no salía si la gemela estaba archivada;
  - el formulario de idea propia se borraba al decidir una candidata (`key` por guardado, no por número de ideas);
  - el `Select` del pilar se veía vacío con «Ninguno» (Radix trata `''` como sin valor) y con un pilar fuera de las
    opciones (decisión 23);
  - sin campo de indicaciones fuera de una tanda pendiente (AS3);
  - la tarjeta no enseñaba el estado;
  - `fields.ideaId` en vez de `fields.use` al estimar un uso aún no listo;
  - etiquetas pegadas en el JSX: ahora son plantillas del catálogo; `maxLength` de las indicaciones desde
    `IDEA_LIMITS`;
  - el foco se perdía al decidir una candidata, y los botones no nombraban la idea (en la primera vuelta el nombre
    «Me quedo «…»» no contenía el texto visible y axe lo marcó, `label-content-name-mismatch`; ahora es
    «Me la quedo «…»»);
  - «Proponer otras» descartaba las pendientes sin decirlo;
  - `research.md` decía `200` para la idea duplicada y el contrato `201`.
- **Registrados sin cambio de código:** el gasto en el último recorrido (decisión 18), la `revision` sin notas ni
  estado (19), sin aviso de duplicada al quedarse una candidata (20), el formato por defecto (21, con cambio), T027 en
  `Profile.tsx` (22), `pilar_invalido` fuera de la batería (25) y recargar en vez de reiniciar en el e2e (26).
- **Descartados:** `useEstimate` de T026: el banco usa `refreshEstimate` con el mismo efecto y una estimación por
  llamada, como pide `cost.md`. El fichero de T025 no es el que nombra la tarea: anotado en `tasks.md`.
- **Abiertos:** ninguno.

### 6. Desviaciones respecto a la spec

- **De más:** campo de indicaciones también con el banco lleno; formato por defecto según el ritmo del perfil.
- **De menos:** el aviso de duplicada al quedarse una candidata (decisión 20).

### 7. Decisiones

- **Del agente:** entradas 17 a 26 de `decisions.md`, de riesgo bajo y medio.
- **Pendientes del creador:** ninguna.

### 8. Impacto en la constitución

- **I (lenguaje llano):** los avisos nuevos dicen qué pasó y qué hacer (tanda repetida, descarte al pedir otras).
- **II (dato y opinión):** la tanda lleva «Propuesta por la IA» y la fuente IA.
- **III (coste):** estimación antes de cada tanda; una tanda vacía ya no se cobra en silencio.
- **IV (IA):** salida estricta con el pilar del perfil; reintento reservado en el presupuesto.
- **IX (pruebas y accesibilidad):** pruebas de ruta, pantalla y e2e con axe; foco tras decidir.

### 9. Cómo revertir y qué queda

- **Revertir:** revertir el commit de US1. No hay migraciones nuevas.
- **Queda:** US2 (medir), US3 (otro enfoque y búsquedas), US4 (orden, cola, filtros, archivo) y Polish.

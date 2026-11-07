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

## US2: ¿Tiene hueco? Medir ideas contra YouTube (T030–T044)

### 1. Resumen

- El creador mide una idea («¿Tiene hueco?») o todas («Medir todas»). Cada medida da uno de cuatro semáforos con su
  frase, sus cifras, los vídeos parecidos plegados, la fecha, la fuente, el sello del supuesto y, si hay búsqueda en
  inglés, el aviso de oportunidad. La medida sigue en el servidor aunque se cierre la pestaña.
- Los cuatro revisores dieron 4 graves distintos (contando repetidos). Los cuatro eran reales y están corregidos:
  - una idea con medida fallida no se podía volver a medir;
  - «Medir todas» no decía cuántas ideas iba a medir;
  - «Frío» salía en ámbar, contra la spec;
  - (seguridad y coste) medir una idea sola gastaba unidades sin avisar.
- Resultado: **pasada**. Controles con código 0, sin hallazgos graves abiertos y sin pendientes de riesgo alto.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| FR-007 medir solo cuando se pide; una y todas | Cumplido | `ideas-measure.test.ts`; e2e `ideas-measure.spec.ts` | 2026-11-07 |
| FR-007 un trabajo por canal; `409` con `jobId` y la pantalla sigue ese | Cumplido | `ideas-measure.test.ts` (con `hold`); aviso `otherRunning` | 2026-11-07 |
| FR-007b búsqueda en inglés y aviso de oportunidad sin tocar el semáforo | Cumplido | `opportunity.test.ts`, `idea-measure.test.ts` (servicio y pantalla), e2e | 2026-11-07 |
| FR-007c antes de «Medir todas»: cuántas ideas y, con la Data API, unidades; también al medir una sola y en «Seguir midiendo» | Cumplido | `idea-measure.test.tsx` (`countOne`, `unitsOne`, `measureUnits`); e2e «Se medirán 6 ideas.» | 2026-11-07 |
| FR-008 cuatro semáforos con su frase; «Frío» gris | Cumplido | `verdict.test.ts` (bordes 5/6, 11/12, 3/4, 999/1.000); `VERDICT_STATE`; decisión 29 corregida | 2026-11-07 |
| FR-009 vídeos parecidos, fecha, fuente y sello del supuesto | Cumplido | `idea-measure.test.tsx`; e2e | 2026-11-07 |
| FR-010 medida de más de 30 días marcada como antigua, con volver a medir | Cumplido | `ideas-measure.test.ts` «stale»; `idea-measure.test.tsx` (singular «1 día») | 2026-11-07 |
| AS3 un fallo deja la idea «Sin medir», con el fallo explicado y su acción | Cumplido | `idea-measure.test.tsx` (fallo, lector, `no_encontrado`); e2e «Bloqueada» | 2026-11-07 |
| Cerrar la pestaña a media medida y volver; «Seguir midiendo» tras un reinicio | Cumplido | e2e (cierre tras el `202`); `ideas-measure.test.ts` «after a restart» | 2026-11-07 |
| R6 idea propia sin búsquedas: «Preparar la medida» desde la tarjeta o «Medir con el título» | Cumplido | e2e «Sin búsquedas»; `idea-measure.test.tsx`; decisiones 37, 41 y 42 | 2026-11-07 |
| Anuncio educado, una vez por idea | Cumplido | e2e (región `status`); efecto de `items` anuncia todas las que llegan | 2026-11-07 |
| SC-002 ningún semáforo sin frase, evidencia, fecha y fuente | Cumplido | `idea-measure.test.tsx` «measured» | 2026-11-07 |
| SC-003 menos de 2 minutos por idea | Parcial | Solo con los falsos; no se midió con YouTube real (prohibido en pruebas) | 2026-11-07 |

### 3. Cómo se comprobó

- `fnm exec --using=24 -- pnpm lint` y `typecheck`: código 0.
- `fnm exec --using=24 -- pnpm test`, tras borrar `node_modules/.vitest-cache`: 140 ficheros, 1652 pasadas y 2
  saltadas (proveedores reales), código 0.
- `fnm exec --using=24 -- pnpm test:e2e` antes de corregir: 36 pasadas y 1 fallo (`ideas.spec.ts:81`, un
  `getByLabel('Título')` que también casaba con «Medir con el título «…»»; el selector se cambió a `textbox`).
  Después de las correcciones: 97 + 37 pasadas, código 0.
- `vite build --mode production` del servidor: el `grep` de `release.yml`, con los marcadores nuevos del YouTube falso,
  no encuentra nada (0 coincidencias de IA falsa y de YouTube falso).
- El flujo real con los falsos es `apps/web/e2e/ideas-measure.spec.ts`:
  - seis ideas, una por escenario, y una sin búsquedas;
  - el aviso «Se medirán 6 ideas.» y «Medir todas»;
  - cerrar la pestaña tras el `202` y volver;
  - los cuatro semáforos, el fallo con su vuelta a medir, la oportunidad y los parecidos;
  - el anuncio al volver a medir;
  - «¿Tiene hueco?» → «Preparar la medida» en la idea sin búsquedas;
  - axe en cada paso.

### 4. Controles obligatorios

- **Pasados:**
  - `lint`, `typecheck` y `test`;
  - el glosario, ahora también con «clon» y «tema amplio»;
  - `secrets-leak`, y axe en claro y oscuro a 375 y 1280 px (`audit.ts`) en el banco con medidas;
  - teclado: todos los botones de medir nombran su idea («¿Tiene hueco? «…»», «Ir a Ajustes «…»»);
  - fallos de IA en «Preparar la medida»: `AiAction`, el mismo de la 003, y tras un fallo se pide otra estimación;
  - fallos de YouTube: los seis códigos tienen su frase; `no_disponible` lleva a Ajustes.
- **No ejecutados:**
  - `test:installer`: la historia no toca el instalador;
  - `prefers-reduced-motion`: solo se usa el `ProgressBar` del design system, ya auditado.

### 5. Hallazgos de revisión

- **Confirmados y corregidos:**
  - **G** (regresión, lógica, fidelidad): tras un fallo, sobre todo `no_disponible`, la idea no se podía volver a
    medir. Ahora siempre hay «¿Tiene hueco?» con su nombre, más «Ir a Ajustes» si el fallo es del lector, y «Medir
    todas» incluye las fallidas (decisiones 39 y 40).
  - **G** (fidelidad, seguridad): «Medir todas» y «Seguir midiendo» no decían cuántas ideas ni cuántas unidades; medir
    una sola no avisaba de las unidades. Ahora se dice en los tres casos (decisión 45).
  - **G** (fidelidad, regresión): «Frío» salía en ámbar con el mismo icono que «Competido». Ahora va en gris, como
    fija la spec; la decisión 29 está corregida.
  - **M**: «Reintentar» en «Preparar la medida» usaba una estimación ya gastada. Ahora se pide otra tras cada fallo.
  - **M**: «Preparar la medida» cerraba el editor y perdía lo no guardado. Ahora espera a que se guarde
    (decisión 42).
  - **M**: «ninguno reciente» era falso con 1 a 3 recientes. Corregido en los textos y en el contrato (decisión 46).
  - **M**: sin `broadQuery`, el semáforo decía «sin público» sin haberlo mirado. Ahora hacen falta las dos búsquedas,
    y «Medir con el título» usa el pilar o el nicho (decisión 37).
  - **M**: lo básico dependía del «Modo experto». Ahora «¿Tiene hueco?» lleva a «Preparar la medida» en la tarjeta
    (decisión 41).
  - **M**: los textos de fallo de canal y la acción «esperar» no encajaban en una idea (decisión 40).
  - **M**: las decisiones 27 y 36 estaban en riesgo Bajo y pasan a Medio.
  - **M**: faltaban «clon» y «tema amplio» en el glosario.
  - **Menores corregidos:**
    - una búsqueda en inglés vacía contaba como fallo (decisión 38);
    - `asSearch` no quitaba `or` en minúscula, y los títulos que quedan vacíos no ofrecen «Medir con el título»;
    - «Medir con el título» pisaba `broadQuery` y no usaba `conflictOr`;
    - se aceptaban `ideaIds` repetidos y archivadas (decisión 43);
    - el anuncio solo decía la última de un lote y tocaba el estado dentro del `setState`;
    - con todo medido no había acción principal;
    - un «¿Tiene hueco?» suelto escondía «Seguir midiendo» (decisión 44);
    - los singulares («1 día», «Midiendo la idea», «1 idea»);
    - «100.000» escrito a mano; la etiqueta de `thresholds.json` era jerga y repetía la fecha;
    - `quickstart.md`, `http-api.md` y T034 no casaban con el código;
    - faltaban marcadores del YouTube falso en `release.yml`;
    - el e2e cerraba la pestaña antes de que llegara el `POST`.
- **Descartados con justificación:**
  - m2 (seguridad): la estimación de `busquedas_idea` no queda atada a su idea. Es el mismo patrón de estimación de un
    solo uso de la 003, y el coste no depende de la idea.
  - N9 (fidelidad): enseñar las búsquedas fuera de «Modo experto». No lo pide ningún requisito, y siguen visibles en
    «Cambiar algo».
  - N8: las unidades cuentan el tema general. Ahora siempre existe (decisión 37), así que la cifra es exacta.
- **Abiertos:** ninguno.

### 6. Desviaciones respecto a la spec

- **De más:** el aviso «Propuesta con una versión anterior de tu perfil» sale ya en la US2 (decisión 47; su test es
  T062).
- **De menos:**
  - «Preparar la medida» no está en «Escribir una idea mía», porque la idea aún no existe; al guardarla, la tarjeta lo
    ofrece (decisión 42);
  - SC-003 no se ha medido con YouTube real.

### 7. Decisiones

- **Del agente:** 27 a 47. Riesgo medio: 27, 28, 36, 37, 38, 39, 40, 41 y 46. El resto, bajo. La 29 está corregida
  para seguir la spec.
- **Pendientes del creador:** ninguna de esta historia.

### 8. Impacto en la constitución

- **I:**
  - una acción principal según el estado («Medir todas», o «Proponer más ideas de vídeo» con todo medido);
  - lo básico sin «Modo experto»;
  - errores en llano con salida.
- **II:** la IA solo escribe las búsquedas («Preparar la medida»), con su coste antes; las cifras y el semáforo son
  funciones puras.
- **V:**
  - el sello del supuesto con su fecha y el umbral citado de `thresholds.json`;
  - «sin datos» nunca se lee como cero, en inglés tampoco;
  - sin tema general no hay veredicto de público.
- **IX:** axe y teclado en el e2e; la auditoría de novato llega en Polish.
- **X:** sin dependencias nuevas.

### 9. Cómo revertir y qué queda

- **Revertir:** `git revert` del commit de la US2. No hay migraciones nuevas: `ideaIds` y `skipped` van en el JSON de
  `jobs.progress`, y las medidas en la tabla `idea_measure` de la Fase 2.
- **Queda:**
  - la US3 (otro enfoque), la US4 (ordenar, cola, archivar y exportar) y Polish, con la auditoría de novato;
  - SC-003 con YouTube real, cuando el creador lo autorice.

## US3: el ángulo de al lado para una idea quemada (T046–T052)

### 1. Resumen

- Una idea quemada o competida ofrece «Buscar otro enfoque». Al pulsarlo salen las indicaciones opcionales y el
  botón con su coste. La IA propone 2 o 3 variantes sabiendo qué vídeos parecidos hay y qué ideas ya tiene el
  creador. Esperan en la tarjeta de su idea con el motivo como opinión de la IA, y la que se queda entra «Sin medir»
  enlazada a su origen.
- Los cuatro revisores no encontraron nada grave. El medio en el que coincidían todos era real y está corregido:
  pedir variantes de una idea descartaba sin avisar las de otra. También se corrigieron las variantes repetidas que
  se cobraban, la falta de indicaciones y los contratos sin actualizar.
- Resultado: **pasada**. Controles con código 0, sin graves abiertos y sin pendientes de riesgo alto.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| FR-011 / AS1: solo con `quemado` o `competido`, coste antes, 2 a 3 variantes con su motivo, escritas con los parecidos | Cumplido | `ideas-angles.test.ts`, `idea-angles.test.tsx`, e2e | 2026-11-07 |
| AS2: quedarse una la añade «Sin medir», con origen `otro_enfoque` y enlace | Cumplido | `ideas-angles.test.ts` «keeping one»; e2e | 2026-11-07 |
| AS3: con hueco o fría no se ofrece | Cumplido | `idea-angles.test.tsx`; e2e (tarjeta «Hueco») | 2026-11-07 |
| Principio II: regenerar con indicaciones | Cumplido | e2e (indicaciones y «Proponer otras variantes»); decisión 49 | 2026-11-07 |
| Principio V: el motivo no habla de «hueco» y se enseña como opinión | Cumplido | `outputs.test.ts`; decisiones 50 y 53 | 2026-11-07 |
| La propuesta queda registrada con su coste | Cumplido | `ideas-angles.test.ts` (`ai_usage` de `otro_enfoque`) | 2026-11-07 |

### 3. Cómo se comprobó

- `fnm exec --using=24 -- pnpm lint` y `typecheck`: código 0.
- `fnm exec --using=24 -- pnpm test`, tras borrar `node_modules/.vitest-cache` (el prompt cambió): 142 ficheros, 1670
  pasadas y 2 saltadas, código 0.
- `fnm exec --using=24 -- pnpm test:e2e`, antes de corregir: 97 + 37 pasadas. Después: 97 + 37 pasadas, código 0.
- El flujo real con los falsos está al final de `apps/web/e2e/ideas-measure.spec.ts`:
  - «Buscar otro enfoque» en «Quemada», y que no sale en «Hueco»;
  - las indicaciones y el coste;
  - las variantes con su opinión;
  - quedarse una;
  - recargar;
  - «Proponer otras variantes»;
  - axe.

### 4. Controles obligatorios

- **Pasados:**
  - `lint`, `typecheck` y `test`, con el glosario y `secrets-leak`;
  - axe en claro y oscuro a 375 y 1280 px en el banco con variantes;
  - teclado: los botones nombran la idea («Buscar otro enfoque «…»», «Proponer otras variantes de «…»»);
  - fallos de IA: `AiAction` de la 003 en la tarjeta, con estimación nueva tras cada fallo;
  - `checkPromptLock`: la v2 está registrada en `lock.json` y la v1 no cambió.
- **No ejecutados:**
  - `test:installer`: la historia no toca el instalador;
  - `prefers-reduced-motion`: no hay animaciones nuevas;
  - la build de producción: el proveedor falso no ha cambiado; su `grep` pasó en la US2.

### 5. Hallazgos de revisión

- **Confirmados y corregidos:**
  - **M**, de los cuatro revisores: pedir variantes de una idea descartaba en silencio las pendientes de otra. Ahora
    hay un lote por idea, y solo se descartan las de la misma idea, con aviso previo (decisión 48).
  - **M**, de seguridad y lógica: la IA no sabía qué evitar, y pedir otra vez daba variantes repetidas que se
    cobraban. La IA recibe ahora `avoid` (prompt v2, decisión 52).
  - **M**, de fidelidad: no se podía regenerar con indicaciones (principio II). Ahora hay indicaciones en la tarjeta y
    «Proponer otras variantes» (decisión 49).
  - **M**: `http-api.md`, `ai-uses.md` y `ui-screens.md` no recogían los cambios. Están al día.
  - **M**: el aviso de «todas repetidas» mandaba a unas indicaciones que no existían. Ahora tiene un texto propio y
    las indicaciones existen.
  - **Menores:**
    - una medida de una versión anterior, una idea archivada, o una medida que cambia mientras la IA escribe: ahora se
      rechazan, también al guardar (decisión 51);
    - el filtro de «hueco» era estrecho (decisión 53, con la frase de la spec alineada al contrato);
    - el salto de encabezados de las variantes sin su idea;
    - las variantes desaparecían mientras se cambiaba su idea;
    - dos peticiones a la vez se pisaban, y salían dos acciones principales iguales (decisión 54);
    - el riesgo de las decisiones 49 y 50 sube a Medio.
- **Descartados con justificación:**
  - la estimación no queda atada a la idea: es el patrón de un solo uso de la 003, el tope se recalcula con lo que se
    envía, y la pantalla no lo cruza;
  - las cifras de los títulos de YouTube cuentan como fuente para `claimsTrimmed`: el prompt prohíbe cantidades y el
    motivo se enseña como opinión. Queda anotado para revisar las fuentes de cifras en la 005;
  - el tamaño por defecto de `h4` y `h5`: va a la pasada con el modo Design.
- **Abiertos:** ninguno.

### 6. Desviaciones respecto a la spec

- La frase de la US3 en `spec.md` se alineó con el contrato: el motivo dice por qué se aparta, no por qué tendría
  hueco (decisión 53).
- Por lo demás, ninguna.

### 7. Decisiones

- **Del agente:** 48 a 54. Riesgo medio: 48, 49, 50 y 52. El resto, bajo.
- **Pendientes del creador:** ninguna.

### 8. Impacto en la constitución

- **II:** propuesta de la IA con aprobar (quedarse), descartar y regenerar con indicaciones; el motivo es una opinión.
- **III:** coste antes de cada petición y registrado en `ai_usage`; `avoid` evita pagar por repetidas.
- **V:** el motivo no puede hablar de «hueco»; solo la medida lo dice.
- **I y IX:** acciones con nombre, axe y teclado.

### 9. Cómo revertir y qué queda

- **Revertir:** `git revert` del commit de la US3. El prompt `otro_enfoque/v1.md` sigue en su sitio, así que basta con
  quitar la v2 y su línea de `lock.json`. No hay migraciones.
- **Queda:** la US4, Polish y la auditoría de novato.

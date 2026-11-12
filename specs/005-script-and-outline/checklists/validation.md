# Validación de la 005: guion y escaleta

## Foundational (T001–T023), Puerta A del 2026-11-09

### 1. Resumen

La base del guion está: modelo, estados, duración, migración 0006, repos, conocimiento versionado, estimación con salida
esperada, rutas base y lista y esqueleto en la web. Tres revisores encontraron lo mismo en `updateMarks`, ya corregido.
Sin graves abiertos. La interfaz no tiene todavía recorrido propio: su e2e y axe llegan con US1.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T004–T005 modelo y límites | Cumplido | `packages/core/test/script/model.test.ts` | 2026-11-09 |
| T006–T007 estados y avisos | Cumplido | `packages/core/test/script/status.test.ts` | 2026-11-09 |
| T008–T009 duración | Cumplido | `packages/core/test/script/duration.test.ts` | 2026-11-09 |
| T010–T011 migración aditiva | Cumplido | `apps/server/test/db/migration-0006.test.ts` | 2026-11-09 |
| T012–T013 repos y excepción de marcas | Cumplido | `apps/server/test/db/repos/scripts.test.ts` | 2026-11-09 |
| T014 fuentes abiertas antes de citar | Cumplido | Abiertas en esta sesión: Ayuda de YouTube 9314415, Creator Playbook (2011), Wikipedia Reliable sources y UWGB evalinfo. Lo demás lleva `assumption` | 2026-11-09 |
| T015–T016 paquetes y voz alta | Cumplido | `packages/knowledge/test/{script,prompts}.test.ts` | 2026-11-09 |
| T017–T018 salida esperada | Cumplido | `apps/server/test/services/ai-run-output.test.ts` | 2026-11-09 |
| T019–T021 API y rutas base | Cumplido | `apps/server/test/http/scripts-base.test.ts` | 2026-11-09 |
| T022 web base | Parcial | Compila y su ruta tiene test; el recorrido llega en US1 | 2026-11-09 |

### 3. Cómo se comprobó

`lint`, `typecheck` y `test` tras las correcciones, con el resultado del punto 4. `test:e2e`: 39 de 39, código 0, antes de
las correcciones de revisión, que en la web solo tocan la lista y un tipo del cliente.

### 4. Controles

- Pasados: lint, typecheck, test, glosario (ahora también `script/`), `secrets-leak` dentro del e2e.
- No ejecutados: axe, teclado y reduced-motion de las pantallas nuevas, porque aún no se llega a ellas desde la app; van
  en T032. Tipos de fallo de IA: esta fase no llama a la IA. `test:installer`: no se toca el instalador.

### 5. Hallazgos

Corregidos: `updateMarks` admitía cambiar títulos, tipos y marcas (tres revisores); paquetes sin validar al arrancar ni en
Ajustes; `PATCH` sin aviso entre pestañas (decisión 16); ids repetidos y marcas sin bloque; varias acciones principales en
la lista; tipo duplicado en el cliente; `query` (el dato concreto) faltaba en la vista; `created_at` reescrito; listas de
conocimiento sin marca de supuesto; tests de canal ajeno, `en_curso` y rutas web; el contrato de `blockedBy` y `job`.

Descartados: dependencias sin usar del servicio (las usa US1 en la siguiente fase); Wikipedia citada a la vez que no fiable
(se cita su criterio sobre fuentes, no un dato); la ayuda de YouTube en `review.json` (respalda que se mida el arranque; los
límites van marcados como supuesto).

Abiertos: ninguno grave ni medio.

### 6. Desviaciones

`source_draft_version` en `script` (decisión 14) y `baseUpdatedAt` en `PATCH` (decisión 16). El título de bloque puede estar
vacío al editar (decisión 15).

### 7. Decisiones

Agente: 14 a 17. Pendientes del creador: P1 (prueba real) y P2 (cifras con dígitos). Ninguna bloquea esta fase.

### 8. Constitución

II (versiones: excepción de marcas acotada), III (el presupuesto sigue con el tope del perfil), V (conocimiento con fuente y
fecha, validado al arrancar), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta fase. La migración 0006 es aditiva y no afecta a lo anterior. Queda pendiente: US1 en
adelante.

## US1 (T024–T033), Puerta A del 2026-11-09

### 1. Resumen

De una idea elegida se llega a una escaleta aprobada: apuntes, duración, coste a la vista, propuesta de la IA, editar,
mover con teclado y aprobar, y todo sobrevive a recargar. Los cuatro revisores dieron un grave (precio caducado) y una
docena de medios; están corregidos. Sin graves ni medios abiertos, salvo AS5, que depende de US2.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| FR-005 duración estimada | Cumplido | `scripts.spec.ts` («En total, unos 10 min») | 2026-11-09 |
| FR-006 estructura y actos completos | Cumplido | `packages/core/test/script/outputs.test.ts` | 2026-11-09 |
| FR-007 pedir otra con indicaciones | Parcial | Ruta probada en `scripts-outline.test.ts`; el efecto del prompt solo se ve con IA real (P1) | 2026-11-09 |
| Coste antes de gastar | Cumplido | `scripts.spec.ts`: si el precio cambia no se gasta y se muestra el nuevo | 2026-11-09 |
| Fallos de IA visibles | Cumplido | `scripts-outline.test.ts` (servidor) y `script-outline.test.tsx` (pantalla) | 2026-11-09 |
| Teclado, foco y accesibilidad | Cumplido | `scripts.spec.ts`, con axe también con el editor abierto | 2026-11-09 |
| AS5 «Escribir el guion · {coste}» tras aprobar | No cumplido | Depende de US2: se añade en T043 | 2026-11-09 |

### 3. Cómo se comprobó

Tras las correcciones: `lint` 0, `typecheck` 0, `test` 1.814 pasados y 2 omitidos (código 0), `test:e2e` de la web 40 de 40
(código 0). Recorrido real con los proveedores falsos en `scripts.spec.ts`.

### 4. Controles

- Pasados: lint, typecheck, test, test:e2e web, glosario, `secrets-leak`, axe claro y oscuro a 375 y 1280 px con
  reduced-motion, teclado, tipos de fallo de IA.
- No ejecutados: `test:installer` (no se toca el instalador); IA real (P1). Las correcciones han pasado todos los controles,
  pero no una segunda vuelta de revisores.

### 5. Hallazgos

Corregidos: estimación caducada a los 10 minutos (grave; ahora se pide una nueva justo antes de gastar y, si el precio cambia,
no se gasta); precio de apuntes viejos; fallos de IA ocultos o tapados al saltar de paso; estimación que fallaba en silencio;
perder lo escrito con el editor abierto; conflicto entre pestañas (se elige, y se conserva lo escrito); actos sin pregunta,
recompensa o enganche; marca «Opinión de la IA» que desaparecía al editar; foco al cambiar, guardar, cancelar y quitar; casos
límite de apuntes; prompt que no cambiaba nada sin indicaciones; texto incrustado en `clock`; `setJob` movía `updated_at`;
duración que se redondeaba sola; `outOfRange` sin unidad; `scriptEs` fuera de la comprobación de textos.

Descartados: ninguno.

Abiertos (menores): «Añadir bloque» guarda una versión con un bloque vacío aunque luego se cancele (no se puede aprobar sin
título y se puede quitar).

### 6. Desviaciones

Entradas 18 a 20 de `decisions.md`. `outlineFromAi` en `ScriptView`, para que una edición conserve la marca.

### 7. Decisiones

Agente: 18 a 20 (riesgo medio la 18 y la 19). Pendientes del creador: P1 y P2; no bloquean esta historia.

### 8. Constitución

I (error con qué pasó y salida), II (dato frente a opinión), III (coste antes de gastar), IV (esquema estricto), VI
(accesibilidad), XI (este informe). Principio V: la entrada 19 deja una cifra de la escaleta sin marcar hasta el guion.

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones. Queda: US2 en adelante, y AS5 en T043.

## US2 (T034–T045), Puerta A del 2026-11-09

### 1. Resumen

De la escaleta aprobada sale un guion por bloques con la voz del canal, marcas «por comprobar», edición a mano y regeneración
de un bloque sin tocar el resto. Los revisores dieron dos graves, los dos en las marcas (cifras perdidas y acciones que
tocaban otras palabras), ya corregidos. Sin graves ni medios abiertos; la acción «Revisar el guion» llega con US3.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| AS1 guion con los bloques de la escaleta y coste antes | Cumplido | `scripts-draft.test.ts`, `scripts.spec.ts` | 2026-11-09 |
| AS2 editar crea versión sin IA y recalcula | Cumplido | `scripts-draft.test.ts`, `scripts.spec.ts` | 2026-11-09 |
| AS3 / SC-004 un bloque, el resto idéntico | Cumplido | `scripts-draft.test.ts` (comparación de cada bloque) | 2026-11-09 |
| AS4 / SC-003 marcas | Cumplido con casos grabados | `claims.test.ts`; los nombres al inicio de frase dependen de la IA (R9) | 2026-11-09 |
| AS5 acciones sobre una marca | Cumplido | `scripts-draft.test.ts`, las cinco acciones | 2026-11-09 |
| AS6 cerrar la pestaña | Cumplido | `scripts.spec.ts` | 2026-11-09 |
| AS7 voz por defecto y voz nueva | Cumplido | `script-settings.test.ts`, `scripts-draft.test.ts`, `scripts.spec.ts` | 2026-11-09 |
| FR-017 aviso en guion aprobado | Parcial | Implementado; aprobar llega en US3 y su recorrido se prueba allí | 2026-11-09 |
| Avisos con acción y coste | Cumplido | `ScriptWarnings.tsx`; el coste de rehacer sale en el propio aviso | 2026-11-09 |
| AS5 de US1 «Escribir el guion · {coste}» | Cumplido | `scripts.spec.ts` | 2026-11-09 |

### 3. Cómo se comprobó

Tras las correcciones: `lint` 0, `typecheck` 0, `test` 1.908 pasados y 2 omitidos (código 0), `test:e2e` de la web 41 de 41
(código 0). Recorrido real con los proveedores falsos en `scripts.spec.ts`.

### 4. Controles

- Pasados: lint, typecheck, test, test:e2e web, glosario, `secrets-leak`, axe claro y oscuro a 375 y 1280 px con
  reduced-motion (guion, diálogo de marca y voz), teclado y foco.
- Tipos de fallo de IA: los cinco se prueban con `escaleta` en `scripts-outline.test.ts`; `guion` y `bloque_guion` usan el
  mismo camino y no tienen prueba propia de cada fallo.
- No ejecutados: `test:installer` (no se toca el instalador); IA real (P1). Las correcciones han pasado todos los controles,
  pero no una segunda vuelta de revisores.

### 5. Hallazgos

Corregidos: cifra contenida en otra sin marca (grave); corregir, quitar y pintar marcas dentro de otras palabras (grave);
«Quitar del guion» borraba la frase y no el fragmento; lo declarado por la IA se marcaba aunque estuviera en los apuntes;
avisos de idea y perfil que desaparecían al tocar algo; los avisos no ofrecían rehacer con coste; semáforo sin origen ni
fecha; lo escrito no se guardaba antes de pedir un bloque; bloque regenerado con una escaleta sin aprobar; reintento de la
voz que borraba lo escrito; foco tras cerrar una marca; `<mark>` sin tokens; plural del contador; marcas pulsables con un
trabajo en curso; guardar sin cambios creaba versión; `actOnClaim` admitía marcas ya resueltas; tests de T038 y de
`aceptar_propuesta`.

Descartados: ninguno.

Abiertos (menores): una estimación no queda atada a su bloque (solo por API; el presupuesto se vuelve a comprobar); salir por
los pasos con una edición abierta la descarta; la voz no avisa si otra pestaña guardó antes.

### 6. Desviaciones

Entradas 21 y 22 de `decisions.md`. `verdictAt` en la vista de la idea.

### 7. Decisiones

Agente: 21 (bajo) y 22 (medio). Pendientes del creador: P1 y P2; no bloquean esta historia.

### 8. Constitución

II (dato frente a opinión, versiones), III (coste en cada petición), IV (esquema atado a la escaleta), V (marcas, reglas de
escritura), VI (tokens y accesibilidad), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones. Queda: US3 en adelante.

## US3 (T046–T054), Puerta A del 2026-11-09

### 1. Resumen

Revisión gratuita con cinco reglas, aprobación sabiendo lo que queda por comprobar, vuelta a borrador al cambiar un guion
aprobado y descargas en `.md` y `.json`, de uno o de todos. La cola dice «Guion listo». Revisar, aprobar y descargar no
llaman a la IA.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| FR-013 / SC-006 revisión sin IA | Cumplido | `review.test.ts` (4.500 palabras en menos de 1 s), `scripts-approve.test.ts` (sin consumo) | 2026-11-09 |
| FR-015 motivo e «Ir al bloque» | Cumplido | `scripts.spec.ts`; decisión 24 para la duración total | 2026-11-09 |
| FR-016 aprobar con pendientes | Cumplido | `scripts-approve.test.ts` (409 si no coincide), `scripts.spec.ts` (diálogo, recarga) | 2026-11-09 |
| FR-017 cambiar un guion aprobado | Cumplido | `scripts.spec.ts` (diálogo y vuelta a borrador), `scripts-approve.test.ts` | 2026-11-09 |
| FR-021 / AS4 descargas | Cumplido | `export.test.ts`, `scripts-approve.test.ts`, `scripts.spec.ts`; decisión 23 | 2026-11-09 |
| «Guion listo» en la cola y estado de la idea | Cumplido | `scripts.spec.ts`; `scripts-approve.test.ts` (hecha y vuelta al banco) | 2026-11-09 |

### 3. Cómo se comprobó

Tras las correcciones: `lint` 0, `typecheck` 0, `test` en verde (código 0). `test:e2e` de la web: 42 de 42 antes de los
últimos ajustes de tipos y pruebas; después, `scripts.spec` 3 de 3. Recorrido con los proveedores falsos.

### 4. Controles

- Pasados: lint, typecheck, test, glosario, `secrets-leak`, axe claro y oscuro a 375 y 1280 px con reduced-motion (revisión y
  diálogo de pendientes), teclado y foco.
- Tipos de fallo de IA: no aplica, esta historia no llama a la IA.
- No ejecutados: `test:installer` (no se toca el instalador); IA real (P1). Las correcciones han pasado los controles, pero
  no una segunda vuelta de revisores.

### 5. Hallazgos

Corregidos (medios): la descarga decía «Aprobado» de un guion que volvió a borrador; cambiar de paso con un bloque abierto
perdía lo escrito; el Markdown no señalaba enlaces sin comprobar, versiones contradictorias ni comprobaciones; el aviso de
duración parecía de un solo bloque; decisiones de descarga sin registrar. Corregidos (menores): singular de «por comprobar»;
foco y anuncio al aprobar; aprobar con un trabajo en curso; conflicto de marcas entre pestañas; fichero en blanco en
«Descargar todos»; un fallo de descarga borraba la lista; `#` y `---` del creador en el documento; fechas en UTC; frases
tras `.»` o salto de línea; `CSS.escape`; el supuesto duplicado respecto al paquete; `gancho_largo` y «hecha» sin prueba.

Descartados: ninguno.

Abiertos (menores): las abreviaturas («Sr.», «EE. UU.») parten la frase en el aviso de frase larga, que nunca bloquea;
`saveFile.ts` repite el patrón de `IdeaBank.tsx`; la navegación desde los avisos de `ScriptWarnings` y el editor de la
escaleta no tienen el freno de edición abierta.

### 6. Desviaciones

Entradas 23 y 24 de `decisions.md`. `contracts/ui-screens.md` alineado con US3, escenario 4 (descarga sin aprobar).

### 7. Decisiones

Agente: 23 y 24 (medio). Pendientes del creador: P1 y P2; no bloquean esta historia.

### 8. Constitución

I (motivo en lenguaje llano), II (estado real en lo descargado, dudas señaladas), III (sin gasto), V (reglas versionadas con
supuesto y fecha), VI (accesibilidad), VII (datos legibles fuera de la app), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones. Queda: US4 en adelante.

## US4 (T055–T060), Puerta A del 2026-11-09

### 1. Resumen

Una idea Short va directa al guion, sin escaleta, en tres tramos dentro del máximo de `shorts.json`, con aviso de cuánto sobra
si se edita de más. Se edita, se pide otra vez, se revisa, se aprueba y se descarga como un vídeo largo.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| AS1 sin escaleta y por qué importan los primeros segundos | Cumplido | `scripts.spec.ts`, `scripts-short.test.ts` | 2026-11-09 |
| AS2 tres tramos dentro del máximo | Cumplido con IA falsa | `outputs.test.ts`, `scripts-short.test.ts` (el esquema de la llamada rechaza el exceso) | 2026-11-09 |
| AS3 cuánto sobra | Cumplido | `review.test.ts`, `scripts.spec.ts` | 2026-11-09 |
| AS4 / FR-018 igual que un vídeo largo | Parcial | Editar, otro guion, un tramo, revisar, aprobar y descargar probados; volver a una versión llega en US5 | 2026-11-09 |
| 45 s por defecto, sin duplicar cifras | Cumplido | `scripts-short.test.ts`, `scripts.spec.ts`; máximo leído de `shorts.json` | 2026-11-09 |

### 3. Cómo se comprobó

Tras las correcciones: `lint` 0, `typecheck` 0, `test` en verde (código 0). `test:e2e` web: 42 de 43 antes del último ajuste de
nombres accesibles; después, `scripts.spec` 4 de 4. Recorrido con los proveedores falsos.

### 4. Controles

- Pasados: lint, typecheck, test, glosario, `secrets-leak`, axe claro y oscuro a 375 y 1280 px con reduced-motion (Hechos,
  guion y revisión de un Short).
- Tipos de fallo de IA: `guion_short` usa el mismo camino que `escaleta`, probado en `scripts-outline.test.ts`; sin prueba propia.
- No ejecutados: `test:installer` (no se toca el instalador); IA real (P1), incluido si cada proveedor acepta el esquema de tres
  tramos exactos. Las correcciones han pasado los controles, pero no una segunda vuelta de revisores.

### 5. Hallazgos

Corregidos (medios): el prompt no declaraba `instructions` ni separaba datos de instrucciones; títulos de tramo en el servidor
y fuera de los catálogos; el máximo se enseñaba con la fuente de otro paquete; el tramo regenerado pedía su duración actual,
o cero; cambiar el formato de una idea con guion dejaba la pantalla equivocada; decisiones sin registrar. Corregidos (menores):
comprobación de `guion_short` en un vídeo largo, del máximo por la ruta y de la descarga de un Short; reglas repetidas de
`craft.json` en el prompt; la frase de los primeros segundos desaparecía con el guion escrito; aserción del `Stepper`.

Descartados: ninguno.

Abiertos (menores): un guion que se pasa falla con el mensaje genérico de salida no entendida; los 5 s del gancho de `review.json`
no llegan a la IA, así que un Short recién escrito puede salir con ese aviso.

### 6. Desviaciones

Entradas 25 a 29 de `decisions.md`; `contracts/ai-uses.md` y `ui-screens.md` alineados.

### 7. Decisiones

Agente: 25 a 29 (medio). Pendientes del creador: P1 y P2; no bloquean esta historia.

### 8. Constitución

I (por qué en lenguaje llano), II (fecha y origen del máximo, marcas), III (coste en el botón), V (sin duplicar `shorts.json`),
VI (accesibilidad), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones. Queda: US5 en adelante.

## US5 (T061–T067), Puerta A del 2026-11-09

### 1. Resumen

Historial en todos los pasos: cada versión con fecha y origen, comparación con la actual por bloques y «Volver a esta
versión», que añade una versión y no borra ninguna. En un guion aprobado avisa antes. No gasta IA.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| AS1 todas las versiones, con fecha y origen | Cumplido | `scripts-versions.test.ts`, `scripts.spec.ts` | 2026-11-09 |
| AS2 / FR-020 qué bloques cambian | Cumplido | `compare.test.ts`, `scripts-versions.test.ts`, `scripts.spec.ts` | 2026-11-09 |
| AS3 / SC-007 una versión más y ninguna menos | Cumplido | `scripts-versions.test.ts` (versión 3 intacta), `scripts.spec.ts` (también tras recargar) | 2026-11-09 |
| AS4 / FR-017 aprobado vuelve a borrador, avisando | Cumplido | `scripts-versions.test.ts`, `scripts.spec.ts` (diálogo) | 2026-11-09 |
| FR-013 sin gasto | Cumplido | `scripts-versions.test.ts`, incluye recuperar | 2026-11-09 |
| AS4 de US4 volver a una versión en un Short | Cumplido | `scripts.spec.ts` (Short aprobado) | 2026-11-09 |

### 3. Cómo se comprobó

Tras las correcciones: `lint` 0, `typecheck` 0, `test` en verde (código 0), `test:e2e` web 44 de 44. Después solo se ajustó
un test de `compare` y un valor nulo de la fuente, con `test` y `typecheck` de nuevo en verde.

### 4. Controles

- Pasados: lint, typecheck, test, test:e2e web, glosario, `secrets-leak`, axe claro y oscuro a 375 y 1280 px con reduced-motion
  (historial, comparación y diálogo), foco en comparar, cerrar y recuperar.
- Tipos de fallo de IA: no aplica.
- No ejecutados: `test:installer` (no se toca); IA real (P1). Las correcciones han pasado los controles, pero no una segunda
  vuelta de revisores.

### 5. Hallazgos

Corregidos (grave): volver a una versión con un bloque de escaleta abierto perdía lo escrito y bloqueaba el paso; ahora la
escaleta avisa como el guion, y los pasos también quedan frenados. Corregidos (medios): la comparación ocultaba el orden, «Cambiado»
sin ver qué cambió, marcas sin pintar ni contar, detalle distinto al contrato, foco al comparar, test que decía probar el trabajo
en curso sin hacerlo. Corregidos (menores): recuperar sin prueba en FR-013 y en la escaleta, `comparableItems` de todos los tipos,
tipo duplicado a mano, cerrar la comparación, dos clics seguidos, nota de recuperado que se quedaba, `formatDate` duplicado,
separador fuera del catálogo, ids nuevos en cada escaleta, foco al aprobar dos veces.

Descartados: ninguno.

Abiertos (menores): si otra pestaña aprobó, recuperar no avisa antes (el aviso depende de lo que sabe esta pestaña); una versión
antigua que ya no valide da un error genérico al compararla, aunque la lista la tolera; recuperar la escaleta con la que se escribió
el guion mantiene el aviso de escaleta cambiada, como dice `data-model.md`.

### 6. Desviaciones

Entradas 30 y 31 de `decisions.md`; `contracts/http-api.md` alineado.

### 7. Decisiones

Agente: 30 y 31 (medio). Pendientes del creador: P1 y P2; no bloquean esta historia.

### 8. Constitución

II (se puede volver a cualquier versión; marcas también en el historial), III (sin gasto), VI (accesibilidad, foco), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migraciones. Queda: US6 en adelante.

## US6 (T068–T085), Puerta A del 2026-11-09

### 1. Resumen

La IA investiga el tema en internet y comprueba las afirmaciones del guion. La app decide sola la etiqueta de cada hecho según
los enlaces que abren y sus dominios. El creador añade hechos y fuentes propias. Sin capacidad de buscar, la pantalla lo dice y se
puede seguir. **La búsqueda real no se ha ejecutado** (T087, pendiente de P1): todo lo de abajo se ha probado con el proveedor falso.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| FR-004c etiqueta por enlaces y dominios | Cumplido (falso) | `facts.test.ts`, `scripts-facts.test.ts` | 2026-11-09 |
| FR-004d lista propia | Cumplido | `scripts-facts.test.ts`, `scripts.spec.ts` | 2026-11-09 |
| Caso límite: sin resultados | Cumplido | `scripts-facts.test.ts`, `scripts.spec.ts` (`sin_resultados`) | 2026-11-09 |
| Caso límite: fuentes que se contradicen | Cumplido | `facts.test.ts` | 2026-11-09 |
| R4 dos pasos y repetir solo el formato | Cumplido (falso) | `anthropic-web.test.ts`, `claude-web-retry.test.ts` | 2026-11-09 |
| R6 cabe en el límite propuesto | Cumplido (con precios de `pricing.json`) | `web-budget.test.ts` | 2026-11-09 |
| R7 enlaces sin red privada | Cumplido | `link-check.test.ts` | 2026-11-09 |
| SC-002, SC-011 | Ver «Prueba real (T087)» | Claude Code real; la API no pasa | 2026-11-10 |

### 3. Cómo se comprobó

Tras las correcciones: `lint` 0, `typecheck` 0, `test` 2207 pasados y 4 omitidos, `test:e2e` web 47 de 47.

### 4. Controles

- Pasados: lint, typecheck, test, test:e2e web, glosario, `secrets-leak`, axe claro y oscuro a 375 y 1280 px, teclado, reduced-motion.
- Tipos de fallo de IA: batería de contrato, W1 a W3 incluidos.
- No ejecutados: `test:installer` (no se toca); búsqueda real, `max_uses` y `--json-schema` con herramientas web (P1). Las
  correcciones han pasado los controles, pero no una segunda vuelta de revisores.

### 5. Hallazgos

Corregidos (graves): faltaban los tests de T080; con los límites propuestos investigar por la API nunca arrancaba (10 lecturas
frente a las 6 de R6; ahora 6, decisión 37).

Corregidos (medios): quitar fuentes podía subir la etiqueta; las referencias escritas creaban versiones vacías; una investigación
sin resultados vaciaba lo anterior y no decía nada; fuentes contradictorias sin etiqueta propia; reenvíos de `pause_turn` sin tope de
lecturas ni de tokens; propuesta sin respaldo que quitaba la marca; aceptar una propuesta rompía la frase; las fuentes del creador en
un hecho de la IA se perdían al reinvestigar; faltaba `DataSource` de opinión; dos prompts en el código; Claude Code repetía la búsqueda
al salir inválido; plazo único en todos los usos de la API; enlaces sin `ExternalLink`; conflicto de pestañas sin salida.

Corregidos (menores): texto de exportación, enlace con referencia, `alternatives` a los usos que escriben, veredicto por cada
afirmación, tope global de 60 s, `factSources` en el guardado, rangos reservados, solo lectura sin búsqueda, barrera anti-falsos del
release.

Abiertos (menores): `max_tokens` en el primer paso sigue con lo leído; `pricing.json` da una fecha global para el precio de búsqueda;
sin red, un enlace nuevo queda `no_abre`; `slice` puede descartar hechos si la lista ya está llena; dominio y lista miran la dirección
inicial, no la final tras redirigir.

Abiertos (medios, para el creador): decisión 38 y P3.

### 6. Desviaciones

Decisiones 33 a 40; `contracts/ai-uses.md` (6 lecturas), `contracts/ui-screens.md` y `research.md` (R5, R6) alineados.

### 7. Decisiones

Agente: 32 a 40 (medio). Pendientes del creador: P1, P2 y P3; no bloquean esta historia.

### 8. Constitución

II (nada se publica; la lista del creador se conserva), III (coste antes de gastar, nunca más de lo presupuestado), IV (salida validada),
V (conocimiento versionado, prompts con lock), VI (accesibilidad), IX (sin jerga), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. La migración de `web_searches` solo añade una columna. Queda: T087, US7 y Polish.

## US7 (T088–T093), Puerta A del 2026-11-10

### 1. Resumen

Desde un guion largo aprobado, el creador pide de 2 a 3 enfoques de Short, elige uno y se crea, sin llamar a la IA, una idea
Short enlazada y su guion sin escribir, con los hechos del vídeo largo. Los dos guiones se enlazan entre sí. Todo probado con el
proveedor falso; **la IA real no se ha probado** (va con P1).

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| FR-019 enfoques desde un guion aprobado | Cumplido (falso) | `scripts-short-from-long.test.ts` (`sin_aprobar`, enfoques guardados), `outputs.test.ts` | 2026-11-10 |
| FR-019 elegir crea idea y guion sin IA, con los hechos | Cumplido | `scripts-short-from-long.test.ts` (sin llamada ni gasto, hechos `heredada`) | 2026-11-10 |
| Escenario 1: coste a la vista y 2 o 3 enfoques con gancho y momento | Cumplido | `scripts.spec.ts` (US7) | 2026-11-10 |
| Escenario 2: idea Short que dice de qué vídeo sale y guion con «Escribir el guion · {coste}» | Cumplido | `scripts.spec.ts` («Short del vídeo «…»»), decisión 43 | 2026-11-10 |
| Escenario 3: enlace en los dos sentidos | Cumplido | `scripts.spec.ts`, `scripts-short-from-long.test.ts` | 2026-11-10 |
| Escenario 4: sin aprobar, la acción no está y se dice por qué | Cumplido | `scripts.spec.ts` | 2026-11-10 |
| Regresión 004: la idea nueva se puede medir a petición | Cumplido | `scripts-short-from-long.test.ts` | 2026-11-10 |
| `origen_cambiado` | Cumplido | `status.test.ts`, `scripts-short-from-long.test.ts`, decisión 44 | 2026-11-10 |
| Principio III: elegir no gasta; pedir enfoques con coste antes | Cumplido | tests de ruta y e2e | 2026-11-10 |
| IA real | Claude Code cumplido; API no | «Prueba real (T087)» | 2026-11-10 |

### 3. Cómo se comprobó

Tras las correcciones: `lint` 0, `typecheck` 0, `test` 2248 pasados y 4 omitidos (175 ficheros), `test:e2e` catálogo 97 de 97 y web 48 de 48.
`scripts-short-from-long.test.ts` tiene 27 casos, incluida la batería de fallos de IA.

### 4. Controles

- Pasados: lint, typecheck, test, glosario (`glossary.test.ts` de web y ui), tipos de fallo de IA (`sin_sesion`, `cupo_agotado`,
  `tiempo_agotado`, `contenido_filtrado`, `no_disponible`: los enfoques guardados no cambian), prompt con lock
  (`enfoques_short@1`).
- e2e con axe en claro y oscuro a 375 y 1280 px y zoom 200 %, teclado y reduced-motion: catálogo 97 de 97, web 48 de 48, con
  `secrets-leak` incluido. En vueltas intermedias fallaron una vez, sin repetirse y sin relación con el diff, `ideas.spec.ts` (US1
  de la 004: el texto del aviso estaba a la vez en la región de avisos y en su `role=status`) y el axe del catálogo por tiempo
  agotado (120 s); en la vuelta final pasan los dos.
- No ejecutados: `test:installer` (no se toca el instalador ni el empaquetado); IA real (P1).

### 5. Hallazgos

Dos vueltas de revisores (fidelidad, lógica, seguridad y coste, regresión; la segunda, fidelidad y lógica).

Corregidos (medios):
- `origen_cambiado` comparaba números de versión: saltaba al revisar una marca y no se quitaba nunca. Ahora compara el texto del
  momento en el guion aprobado; escribir el Short otra vez lo quita, y si el momento ya no está no se ofrece pagar por reescribirlo
  (decisión 44).
- Al pedir otros enfoques se borraban los caducados y pasados 12 los más antiguos; un guardado que no validaba se perdía entero.
  Ahora no se borra nada y lo ilegible conserva su sitio (decisión 41).
- Si se quitaba una cifra de un enfoque, la pantalla no lo decía. Ahora lo dice (decisión 42).
- «Ya has sacado un Short de este enfoque» se decidía por el título, y dos pestañas podían crear el mismo Short. Ahora el enfoque
  guarda su guion, la segunda pestaña recibe `version_cambiada` y la fecha nunca repite milisegundo (decisiones 43 y 45).
- El Short se escribía desde la última versión del guion largo aunque no estuviera aprobada (con bloques vacíos, por ejemplo).
  Ahora parte del aprobado (decisión 44).
- Decisiones con efecto visible clasificadas como «Medio» a secas: reclasificadas y elevadas al creador en P4.

Corregidos (menores): la IA no sabía qué enfoques había ya (`alreadyOffered`, que no cuenta como fuente de cifras); el banco decía
«Otro enfoque de…» en vez de «Short del vídeo…»; las indicaciones se reenviaban; contratos sin `instructions` ni el número de
enfoques; la regla «se entiende sin ver el vídeo largo» estaba en el prompt y no en `craft.json`; faltaban tests de dominio
(`liveShortAngles`, `scriptWarnings`) y el de la medida de la idea nueva; nombre accesible de «Abrir su guion».

Abiertos (menores):
- Una cifra del guion largo aprobado con marcas pendientes («Aprobar igualmente») cuenta como respaldo de un enfoque. Queda
  mitigado: al escribir el Short, el título y el gancho no eximen de marca.
- El título y el gancho del Short siguen sin contar como del creador aunque los reescriba en el banco (ratificado, decisión 46).
- El tiempo de `enfoques_short` (60 s con el guion largo entero) solo se puede ajustar con IA real (P1).

### 6. Desviaciones

Decisiones 41 a 45. `data-model.md` (`short_angles`, `source_draft_version`, `origen_cambiado`), `contracts/ai-uses.md`,
`contracts/http-api.md` y `contracts/ui-screens.md` alineados. Un Short por enfoque: para otro del mismo momento se piden enfoques
nuevos (la spec dice «tantos como quiera» de Shorts, y se cumple).

### 7. Decisiones

Agente: 41 a 45, de riesgo medio con efecto visible. El creador ratificó 41, 43, 44 y 45 el 2026-11-10 (decisión 46, cierra P4).
Pendientes del creador: P1, P2 y P3; ninguna bloquea esta historia.

### 8. Constitución

II (lo pagado no se pierde, los enfoques llevan `DataSource` de la IA, la idea sigue siendo del creador), III (coste antes de pedir
enfoques; elegir no gasta; no se ofrece pagar algo que no sirve), IV (salida validada contra los bloques del guion), V (prompt
versionado con lock; la regla de oficio en `craft.json`), VI (axe), IX (sin jerga), XI (este informe).

### 9. Cómo revertir

`git revert` del commit de esta historia. No hay migración: usa columnas de `0006_script.sql`. Queda: T087 (P1) y Polish.


## Prueba real (T087), 2026-11-10

Autorizada por el creador (P1, decisión 47) con Claude Code y API. `pnpm test:real-ai`
(`apps/server/test/real/script-ai.real.test.ts`): por cada conexión, una investigación en internet con los prompts, perfiles
y esquemas de la app, la comprobación real de los enlaces y un guion de Short con esos hechos. Los secretos los exportó el
creador en su terminal; la prueba no los imprime.

| Comprobación | Claude Code (suscripción) | API de Anthropic |
|---|---|---|
| Salida estructurada con búsqueda web | Cumple en un solo paso: `--json-schema` convive con `WebSearch`/`WebFetch`, no hace falta ir a dos pasos (R4) | No llegó al paso de formato |
| SC-011: investigación < 5 min | **61 s** (IA 61 s, enlaces < 1 s) | **No cumple**: la búsqueda agotó sus 240 s (300 s del uso menos la reserva del paso de formato) |
| Resultado de la investigación | 11 hechos (10 de una fuente o comprobados, 1 sin confirmar), 3 enlaces, 1 abre | `tiempo_agotado` |
| Guion de Short (SC-002, una muestra) | 43 s para 45 s (4 % de desvío), 5 afirmaciones marcadas, 9 s | No se llegó |
| Gasto | Cupo de la suscripción | Lo que consumió la búsqueda hasta el corte (por debajo de 1 $; el importe exacto está en la consola de Anthropic) |

**Fallo encontrado y corregido (grave):** la CLI 2.1.322 rechaza un `--json-schema` con `$schema`, que es lo que escribe Zod.
Toda salida estructurada por la suscripción fallaba como `servicio_caido`, también en la 003 y la 004, que nunca se habían
probado con IA real. Corregido en `packages/ai/src/claude-code/adapter.ts` (`cliSchema`); la CLI falsa de los tests la
rechaza ya como la real (commit `4568e38`).

**Abiertos:**
- (medio) Pocas fuentes: 11 hechos con solo 3 enlaces, y 2 no abren. Como la etiqueta la decide la app por los enlaces que
  abren (FR-004c), la mayoría quedará «sin confirmar». Conviene que el prompt de `investigacion` pida un enlace por hecho;
  sin probar con más muestras.
- (medio) La investigación por la API pasa de su límite. El creador decide no repetir la prueba y dejar la API como opción
  secundaria (decisión 47 y decisión 1 de la 002). Si se retoma: cronometrar cada llamada (ya lo hace la prueba) y bajar
  búsquedas y lecturas.
- SC-002 es una muestra: no basta para el 90 %.
- P3 (`WebFetch`): la prueba no dice qué direcciones abrió; sigue abierto.

## Polish: recorrido del quickstart (T097)

Fecha: 2026-11-12. Con la IA y YouTube falsos, cada paso del [quickstart](../quickstart.md) se recorre en un e2e con
servidor propio y carpeta temporal (`apps/web/e2e/scripts.spec.ts`, puertos 4460 a 4462). No se toca `~/YTCreator` ni
el puerto 4310.

| Paso | Dónde se recorre | Resultado |
|---|---|---|
| 1. Controles | `pnpm lint`, `typecheck`, `test` (2263), `test:e2e` (catálogo 97, web 48) | Código 0; ver la nota del catálogo |
| 2.1 US1: apuntes, coste antes de generar, mover un bloque con el teclado, aprobar y recargar | US1 | Pasa |
| 2.2 US2: escribir, editar una frase, pedir de nuevo un bloque, duración recalculada | US2 | Pasa (la duración se añade en T097) |
| 2.3 US2: cerrar la pestaña durante la generación y volver | US2 | Pasa |
| 2.4 US3: muletillas («Suena a texto de IA») y gancho largo, aprobar con pendientes, editar, descargar | US3 | Pasa (en T097 se añade que el documento y los datos se abren y dicen lo que la pantalla) |
| 2.5 US4: Short sin escaleta, tres tramos, aviso del máximo | US4 | Pasa |
| 2.6 US5: volver a una versión antigua | US5 | Pasa |
| 2.7 US6: investigar con un enlace que abre, uno roto y uno sin comprobar | US6 | Pasa |
| 2.8 US6: escenario `sin_web` (y `sin_resultados`) | dos tests propios | Pasa |
| 2.9 US6: comprobar pendientes y aceptar una propuesta | US6 | Pasa |
| 2.10 US7: Short de un guion aprobado, enlazado en el banco, coste antes de escribir | US7 | Pasa |
| 3. Comprobación de enlaces (R7) | `apps/server/test/services/link-check.test.ts` | Pasa: IP escritas y resueltas por DNS, redirecciones, esquemas y usuario en la dirección |
| 4. Lo no comprobado aquí | — | La búsqueda real se hizo en T087; SC-002 y SC-011 siguen con una sola muestra |

**Nota del catálogo:** en la primera vuelta de `test:e2e` falló una vez `theme.spec.ts` en WebKit («10 cargas con tema
guardado sin destello»). Como `test:e2e` corre el catálogo primero, la web no llegó a ejecutarse. La rama no toca el
catálogo, `packages/ui` ni `packages/tokens`. Repetido: el test pasa (6/6), el catálogo entero también (97) y la web
también (48). Se trata como inestable, igual que los dos fallos sueltos de US7.

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

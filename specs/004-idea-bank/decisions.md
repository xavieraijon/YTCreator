# Decisiones: 004 banco de ideas

Riesgo según `.specify/memory/riesgo.md`. Lo de riesgo alto no se decide aquí: va a «Pendientes del creador».

## Registro

| # | Fecha | Quién decidió | Decisión | Motivo | Alternativas | Riesgo | Tarea |
|---|-------|---------------|----------|--------|--------------|--------|-------|
| 1 | 2026-11-07 | Creador | La medida se lanza cuando la pide el creador («¿Tiene hueco?» o «Medir todas»), nunca sola | Con la Data API cada medida gasta unas 300 unidades | Medir sola al entrar | Alto | US2 |
| 2 | 2026-11-07 | Creador | Se mide también el dato concreto en inglés, y se avisa de una oportunidad sin cambiar el semáforo | Es la mejor señal de hueco del proyecto de referencia | Solo castellano | Alto | US2 |
| 3 | 2026-11-07 | Creador | Varias ideas elegidas para guion, en una cola ordenada; la 005 empieza por la primera | Encaja con un ritmo de varios vídeos al mes | Una sola elegida | Alto | US4 |
| 4 | 2026-11-07 | Agente | Reordenar con «Subir» y «Bajar» (botones accesibles), sin arrastrar y soltar | La spec admite cualquiera de las dos; arrastrar exige una dependencia nueva (principio X) | Librería de arrastrar | Medio | US4 |
| 5 | 2026-11-07 | Agente | Las tandas y las ideas van en tablas propias (`idea_batch`, `idea`), no en `proposal` | `proposal` cuelga de un recorrido y el banco cuelga del canal | `proposal.journey_id` opcional | Medio | Fase 2 |
| 6 | 2026-11-07 | Agente | Un vídeo es «casi igual» si su título contiene el 75 % de las palabras clave del dato concreto; es un supuesto sin fuente, con los umbrales en `thresholds.json` v5 | Es la regla del proyecto de referencia, y es una función pura sin IA | Juzgarlo con la IA; distancia de edición | Medio | US2 |
| 7 | 2026-11-07 | Agente | La migración `0005` rehace `background_job` (copia, borra y renombra en una transacción) para admitir `medir_ideas` y `channel_id` | SQLite no cambia un `CHECK` sin rehacer la tabla; no se pierden datos | Reutilizar `medir_nichos` | Medio | Fase 2 |
| 8 | 2026-11-07 | Agente | «Proponer ideas de vídeo», para no confundirse con «Proponer ideas» de los conceptos de canal de la 003 | El mismo texto en dos sitios con dos sentidos | Cambiar el texto de la 003 | Medio | US1 |

## Pendientes del creador

| # | Qué falta | Opciones | Recomendación | Impacto | Tarea pausada |
|---|-----------|----------|---------------|---------|---------------|

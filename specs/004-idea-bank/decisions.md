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
| 9 | 2026-11-07 | Agente | La fontanería de IA de los tres usos (esquemas, perfiles, prompts `v1`, salidas falsas y el esquema estricto de `ai-run`) se adelanta a la Fase 2, y los usos entran en `CHANNEL_OUTPUTS` | `IDEA_USES` del cuerpo de `estimate` (T010) y los `satisfies Record<AiUse, …>` lo arrastran; así pasan por el mismo presupuesto, validador de cifras y batería de contrato que la 003. Las tareas T015, T020 y T022 quedan en parte hechas y su Puerta A de US1 lo revisa | Una constante `IDEA_USES` aparte y un segundo servicio de IA | Medio | Fase 2 |
| 10 | 2026-11-07 | Agente | Las ideas propias (`origin: 'creador'`) nunca llevan «Propuesta con una versión anterior de tu perfil» | El texto del aviso habla de lo propuesto, y una idea del creador es suya sea cual sea el perfil | Avisar en todas | Bajo | Fase 2 |
| 11 | 2026-11-07 | Agente | Una medida fallida no se marca como antigua ni como de una versión anterior de la idea | No dice nada de la idea; su aviso es el del fallo | Avisar igual | Bajo | Fase 2 |
| 12 | 2026-11-07 | Agente | El validador de cifras mira solo `hook` y `why` en los usos de ideas, como dice el contrato, y nada en `busquedas_idea` | Un título como «llegar a 1.000 suscriptores» nombra el tema, no un dato de mercado; si no, se repetiría y se cobraría la llamada | Validar todos los campos | Medio | Fase 2 |
| 13 | 2026-11-07 | Agente | Las unidades de la Data API de una medida se calculan (`ideaMeasureUnits`) con los precios de `dataApi`, y no se escriben en el bloque `ideas` | Su fuente es la cuota de la Data API, no el supuesto del proyecto de referencia, y así no se desalinean | Cifras fijas en `thresholds.json` | Bajo | Fase 2 |
| 14 | 2026-11-07 | Agente | Se alinea el supuesto de la spec con R3: hay público con dos vídeos del tema general de 100.000 visitas o más, o con un casi igual que las tenga | La spec decía un vídeo y R3, T009 y `thresholds.json` dicen dos; manda R3, que es la regla del proyecto de referencia | Bajar `audienceVideos` a 1 | Medio | Fase 2 |
| 15 | 2026-11-07 | Agente | La migración `0005` (decisión 7) se mantiene en riesgo medio: no es destructiva porque copia cada columna de cada fila en la misma transacción, y la prueba compara las filas enteras antes y después | `riesgo.md` pone en alto las migraciones destructivas; esta no pierde nada | Subirla a alto | Medio | Fase 2 |
| 16 | 2026-11-07 | Agente | `pendingBatch` del banco es solo la tanda de ideas; la tanda pendiente de otro enfoque se enseñará en su idea (US3) | Cada tanda tiene su sitio en la pantalla (`ui-screens.md`) | Una sola tanda pendiente de cualquier tipo | Bajo | US3 |

## Pendientes del creador

| # | Qué falta | Opciones | Recomendación | Impacto | Tarea pausada |
|---|-----------|----------|---------------|---------|---------------|

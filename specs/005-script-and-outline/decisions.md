# Decisiones: 005 script-and-outline

Riesgo según `.specify/memory/riesgo.md`. Lo de riesgo alto no se decide aquí: va a «Pendientes del creador».

## Registro

| # | Fecha | Quién decidió | Decisión | Motivo | Alternativas | Riesgo | Tarea |
|---|-------|---------------|----------|--------|--------------|--------|-------|
| 1 | 2026-11-09 | Creador | Los hechos salen de dos vías: apuntes y fuentes del creador, e investigación de la IA en internet, como en el proyecto de referencia | Quiere las dos | Solo apuntes; sin apuntes ni marcas | Alto | US1, US6 |
| 2 | 2026-11-09 | Creador | La voz se fija por canal con trato, registro y una muestra opcional, con valores por defecto | El perfil de la 003 no guarda el tono | Indicaciones en cada guion; ajustes sin muestra | Alto | US2 |
| 3 | 2026-11-09 | Creador | Se puede sacar un Short de un guion largo aprobado, como idea enlazada | La 003 recomienda los Shorts como escaparate del vídeo largo | Solo Shorts de ideas que ya lo son | Alto | US7 |
| 4 | 2026-11-09 | Agente | FR-021 pasa a pedir una descarga de todos los guiones del canal, en lugar de incluirlos en una «exportación general» | Esa exportación no existe: hay la del perfil y la del banco, y cambiar su formato es riesgo alto | Crear una exportación general; cambiar la del perfil | Medio | Plan |
| 5 | 2026-11-09 | Agente | En la API de Anthropic, investigar son dos llamadas: buscar y luego dar forma a la respuesta | Las citas de la búsqueda están siempre activas y son incompatibles con la salida estructurada | JSON dentro del texto citado | Medio | US6 |
| 6 | 2026-11-09 | Agente | Solo un enlace que abre cuenta como respaldo; uno que bloquea robots queda «sin comprobar» y no cuenta | SC-010 no debe dar por bueno lo que no se ha visto | Contar cualquier respuesta del servidor | Medio (efecto visible) | US6 |
| 7 | 2026-11-09 | Agente | La etiqueta del hecho la calcula el dominio y exige dos dominios distintos; la IA solo puede bajarla | Dos enlaces del mismo sitio no son dos fuentes | Fiarse de la etiqueta de la IA | Medio (efecto visible) | US6 |
| 8 | 2026-11-09 | Agente | El guion usa cifras con dígitos, sin la regla de escribirlas en letra del proyecto de referencia | Aquella regla era para la voz sintética, fuera de la v1; con dígitos la detección es fiable | Cifras en letra | Medio (efecto visible) | US2 |
| 9 | 2026-11-09 | Agente | Solo se agrupan en una versión las marcas seguidas que no cambian el texto, y solo en un guion sin aprobar. Corregir, quitar del guion o aceptar una propuesta crean versión propia | 40 marcas no deben ser 40 líneas en el historial, pero ningún texto se puede perder (principio II; análisis, C1) | Agrupar todas las marcas; una versión por marca | Medio (efecto visible) | US2, US5 |
| 10 | 2026-11-09 | Creador | Aplicar las 18 correcciones del análisis entre artefactos | El creador pidió «todas» | Solo crítico y altos | Medio | Análisis |
| 11 | 2026-11-09 | Agente | Cuatro salidas para una marca: correcta, corregir, no es un dato y quitar del guion | «Quitar» podía entenderse de dos maneras, y la detección de nombres es aproximada | Solo «quitar» | Medio (efecto visible) | US2 |
| 12 | 2026-11-09 | Agente | El presupuesto se comprueba con el coste máximo; en pantalla se enseña el esperado y el máximo | Un guion puede escribir mucho más de lo esperado; el límite no debe depender de la estimación (análisis, I1) | Comprobar con el esperado | Medio (efecto visible) | Foundational, US6 |
| 13 | 2026-11-09 | Agente | Un guion escrito conserva su estado aunque cambie la escaleta, con el aviso `escaleta_cambiada` | El estado debe ser uno solo; un guion aprobado sigue siendo válido hasta que el creador decida (análisis, I2) | Volver a escaleta en borrador | Medio (efecto visible) | Foundational |
| 14 | 2026-11-09 | Agente | La tabla `script` lleva además `source_draft_version`, con la versión del guion largo de la que salió un Short | Sin ella no se puede saber si el origen cambió después (aviso `origen_cambiado`) | Comparar fechas | Medio | Foundational |
| 15 | 2026-11-09 | Agente | El título de un bloque de escaleta puede quedar vacío mientras se edita; lo que no se puede es aprobar o recibir de la IA un bloque sin título | Guardar a medias no debe perder lo escrito; la regla «aprobar: ninguno sin título» ya lo cubre (hallazgo de Puerta A) | Rechazar el guardado | Bajo | Foundational |
| 16 | 2026-11-09 | Agente | Guardar duración y apuntes también avisa si otra pestaña guardó antes, comparando `updatedAt` | Esos campos no tienen versiones y la spec dice que no se pisa el trabajo sin preguntar (hallazgo de Puerta A) | Versionar los apuntes | Bajo | Foundational |
| 17 | 2026-11-09 | Agente | Límites que el modelo de datos no fijaba: título de fuente 300, referencia 500, pistas de bloque 300, marca 600, guion de 1 a 30 bloques; y una idea sin elegir responde `validacion` | Campos de texto acotados, sin efecto visible salvo en casos extremos | Sin límite | Bajo | Foundational |

Las entradas 6 a 9 y 11 a 13 forman parte de `research.md` y del análisis que el creador aceptó (decisión 10); la P2 le pide ratificar la 8, que cambia el texto que graba.

## Pendientes del creador

| # | Qué falta | Opciones | Recomendación | Impacto | Tarea pausada |
|---|-----------|----------|---------------|---------|---------------|
| P1 | Autorizar una prueba real de la búsqueda, al terminar US6: gasta cupo de la suscripción y, con la API, céntimos reales | Probar con Claude Code; probar con Claude Code y API; no probar | Claude Code y API: una investigación y una generación por cada una, menos de 1 € | Sin ella, la búsqueda real, SC-002 y SC-011 quedan como no ejecutados | Solo la prueba real; el resto sigue con el proveedor falso |
| P2 | Ratificar que el guion escribe cifras y fechas con dígitos (decisión 8), en lugar de en letra como el proyecto de referencia | Dígitos; en letra | Dígitos: quien lee es el creador, y la detección de cifras es fiable. Cambiarlo es una versión nueva del prompt | Solo afecta a cómo salen los números en el texto generado | Ninguna (se puede cambiar después) |

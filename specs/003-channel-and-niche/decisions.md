# Decisiones: 003 canal y nicho

Riesgo según `.specify/memory/riesgo.md`. El registro empezó el 2026-11-04: las entradas de las fases 2 a 5 se escribieron
a posteriori, al adoptar el principio XI. Con la regla actual, las de riesgo alto habrían sido una pregunta antes de
implementarlas. Los motivos de esas entradas están reconstruidos después, no anotados en el momento.

## Registro

| # | Fecha | Quién decidió | Decisión | Motivo | Alternativas | Riesgo | Tarea |
|---|-------|---------------|----------|--------|--------------|--------|-------|
| 1 | 2026-11-04 | Agente | Visitas supuestas entre el 5 % y el 50 % de la mediana del nicho, 4,33 semanas al mes (`thresholds.json`) | Hacía falta una base para el rango de euros | Sin fuente, ver P1 | Alto | T083, T087 |
| 2 | 2026-11-04 | Agente | Vídeo destacado a 3 veces lo normal; vídeos de menos de 30 días fuera de «peores» | Criterio propio | Otros umbrales | Medio | T072c |
| 3 | 2026-11-04 | Agente | 4 horas por vídeo largo y 1 por Short para el aviso de ritmo | Criterio propio | Preguntárselo al creador | Alto | Fase 3 |
| 4 | 2026-11-04 | Agente | Uso de IA nuevo `recomendacion`, con su coste, para FR-010 | FR-010 lo pedía y no tenía uso ni tarea | Regla fija sin IA | Medio | T082b |
| 5 | 2026-11-04 | Agente | Motivo de los canales de referencia con regla fija | Evita otra llamada a la IA | Con IA, como decía el modelo de datos | Medio | Fase 3 |
| 6 | 2026-11-04 | Agente | Quitar el contexto de canal joven; añadir `small_channels` y `hidden_subscribers` | El puerto no da la fecha de creación | Pedir un dato más a YouTube, con coste | Medio | T072c |
| 7 | 2026-11-04 | Agente | La IA elige la categoría de ingresos, sin verse ni editarse en pantalla | Simplicidad | Mostrarla y dejar cambiarla | Alto | T090 |
| 8 | 2026-11-04 | Agente | Aviso de cambio de nicho al volver, no al elegir otro | Ver P4 | Avisar al elegir, como T085b y T091b | Medio | T085b, T091b |
| 9 | 2026-11-04 | Agente | Canal parecido: contiene 4 letras o más, o distancia hasta 2 con 5 letras o más | Hacía falta una regla para el ámbar | Otros umbrales | Medio | T092 |
| 10 | 2026-11-04 | Agente | Búsqueda de nombre sin resultados cuenta como buena noticia | Sin coincidencias no hay colisión | Tratarla como «sin comprobar» | Alto | T092 |
| 11 | 2026-11-04 | Agente | Canales parecidos solo con título, sin @ ni suscriptores | La búsqueda no los da sin más coste | Pedirlos con otra llamada | Medio | Fase 5 |
| 12 | 2026-11-04 | Agente | Volver a elegir el nombre desde `hecho`, y cambios en Inicio | FR-018b lo pedía y no tenía tarea | Ninguna | Medio | T100b |
| 13 | 2026-11-04 | Agente | Volver a la tanda anterior descarta la actual para siempre | Modelo simple | Conservar las dos, ver P3 | Alto | T082c |
| 14 | 2026-11-04 | Agente | Nicho propio hasta 6 en la lista, nombre propio hasta 12 | Dejar sitio a lo propio sobre el máximo | Sustituir una propuesta | Bajo | Fases 3 y 5 |
| 15 | 2026-11-04 | Agente | Perfil v1 con origen `ia` aunque se editara; `manual` al elegir el nombre después | Encaja con el modelo de datos | Origen mixto | Bajo | T099, T100b |
| 16 | 2026-11-01 | Agente | `spawn` con `shell: false` para yt-dlp en vez de `execFile` | Hace falta leer la salida por partes | `execFile`, como dice `tasks.md`; ver P5 | Bajo | Fase 2 |
| 17 | 2026-11-04 | Agente | Nombres del proveedor falso cambiados para no chocar con los canales falsos | Salían todos en rojo | Cambiar los canales | Bajo | Fase 5 |
| 18 | 2026-11-04 | Creador | Incorporar las dos mejoras de medida: separar formatos y comparar con lo normal del canal | Aprobadas en revisión | No incorporarlas | Medio | T072c |
| 19 | 2026-11-04 | Creador | «Ahora no» a poder cambiar de opción tras elegir el tipo de canal | Queda fuera por ahora; quien se equivoque se queda atascado | Añadirlo ahora | Medio | Backlog |
| 20 | 2026-11-04 | Creador | El rediseño de la interfaz va en una pasada posterior con Design mode | No le convence el diseño actual, pero no bloquea | Rehacerlo ahora | Medio | Backlog |
| 21 | 2026-11-04 | Agente | T124 va en US5, no antes de US4 como se aprobó | Necesita T117 para poder guardar la clave | Mantenerla en pulido | Bajo | T124 |

## Pendientes del creador

| # | Qué falta | Opciones | Recomendación | Impacto | Tarea pausada |
|---|-----------|----------|---------------|---------|---------------|
| P1 | El supuesto de visitas (entrada 1) no tiene fuente, mueve los euros en pantalla (principio V) y además no se ve: el único sello cercano es el de AIR | a) Buscar fuente; b) mantenerlo marcado claramente como supuesto; c) quitar la cifra | a, y b mientras tanto | Cifra que ve el creador | Ninguna |
| P2 | US2 AS3 pide versión nueva del concepto editado; una segunda edición pisa a la primera | a) Basta con original y última edición; b) historial completo | a, y aclararlo en la spec | Requisito parcial | Ninguna |
| P3 | Volver a la tanda anterior pierde una tanda pagada (entrada 13), y en conceptos y nombres no hay botón para volver | a) Dejarlo; b) conservar las dos | b | Coste para el creador | Ninguna |
| P4 | Quien solo vuelve a mirar los nichos y confirma debe elegir de nuevo el concepto (entrada 8) | a) Dejarlo; b) avisar solo si elige otro nicho | b | Se desvía de T085b y T091b | Ninguna |
| P5 | yt-dlp usa `spawn` y `tasks.md` dice `execFile` (entrada 16) | a) Aceptar y corregir la tarea; b) cambiar el código | a | Igual de seguro | Ninguna |
| P6 | Los canales inventados del YouTube falso siguen en la build de producción, y `release.yml` no lo vigila | a) Sacarlos y ampliar la comprobación; b) dejarlo | a | Código muerto, sin riesgo directo | Ninguna |
| P7 | 4 horas por vídeo largo y 1 por Short no tienen fuente y disparan «Este ritmo no te cabe» (entrada 3) | a) Preguntar al creador sus horas por vídeo; b) buscar fuente; c) marcarlo como estimación | a | Aviso que se afirma como hecho | Ninguna |
| P8 | La categoría de ingresos es invisible y cambia el rango de euros unas 6 veces (entrada 7) | a) Mostrarla y dejar cambiarla; b) dejarla oculta | a | Cifra que ve el creador | Ninguna |
| P9 | Un fallo de lectura de yt-dlp cuenta como «sin resultados» y puede dar verde (entrada 10) | a) Separar el vacío real del fallo; b) dejarlo | a | US3 AS4 dice «nunca verde» | Ninguna |
| P10 | El rango de RPM tiene confianza baja, no se dice, y el factor del castellano no tiene fuente | a) Mostrar la confianza y buscar fuente; b) solo mostrarla | a | Cifra que ve el creador | Ninguna |
| P11 | La puerta de entrada solo pregunta a los 20 canales con más visitas | a) Muestra que incluya canales pequeños; b) preguntar a todos, con más cuota o tiempo | a | Veredicto de cada nicho | Ninguna |
| P12 | yt-dlp no da fechas en las búsquedas, y el RSS da solo 15 vídeos por canal | a) Completar con RSS, como dice el contrato; b) leer la fecha de una muestra de vídeos; c) decir que esta medida exige clave | a | Una de las cuatro medidas, en el camino gratis | Ninguna |

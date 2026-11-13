# Decisiones: 006 publishing-package

Riesgo según `.specify/memory/riesgo.md`. Lo de riesgo alto no se decide aquí: va a «Pendientes del creador».

## Registro

| # | Fecha | Quién decidió | Decisión | Motivo | Alternativas | Riesgo | Tarea |
|---|-------|---------------|----------|--------|--------------|--------|-------|
| 1 | 2026-11-12 | Creador | Los minutos de los capítulos se estiman con el guion, editables; la 007 propondrá los reales con el audio | Antes de grabar no hay minutos reales | Solo estimación; esperar a la 007 | Alto | US2 |
| 2 | 2026-11-12 | Creador | El paquete añade el comentario fijado y una lista guiada de ajustes de YouTube Studio; TikTok y Reels fuera | Como en el proyecto de referencia, sin salir de YouTube | Solo las cinco piezas; añadir TikTok y Reels | Alto | US3 |
| 3 | 2026-11-12 | Creador | Los títulos usan solo lo medido en la 004, sin llamadas nuevas a YouTube | Sin coste de cuota | Búsqueda a petición con coste | Alto | US1 |
| 4 | 2026-11-12 | Agente | Los minutos de los capítulos los calcula el dominio con la duración de los bloques; la IA solo pone nombres y agrupa bloques | SC-003 exige el 100 % de capítulos válidos (research R3) | Minutos de la IA; solo manuales | Medio (efecto visible) | Plan |
| 5 | 2026-11-12 | Agente | Las fuentes de la descripción las pone el dominio desde la lista de hechos; una salida de la IA con direcciones web no valida | SC-004 y FR-008 (research R4) | Vigilar los enlaces de la IA | Medio (efecto visible) | Plan |
| 6 | 2026-11-12 | Agente | Tres aprobaciones: título y miniatura, descripción, y el paquete; el estado se calcula | La spec aprueba por pasos (US1, US2, US3); mismo patrón que la 005 (research R2) | Una sola aprobación final | Medio (efecto visible) | Plan |
| 7 | 2026-11-12 | Agente | Sin nombre del canal en YouTube en el perfil, la parte fija por defecto está vacía y la pantalla dice cómo añadirlo | El enlace de suscripción necesita ese nombre (research R6) | Inventar un enlace | Medio (efecto visible) | Plan |
| 8 | 2026-11-12 | Agente | La categoría se elige una vez por canal; sin elegir, se sugiere «Educación» como supuesto. «Contenido alterado o sintético» es una pregunta al creador, sin respuesta por defecto | El perfil no guarda la categoría de YouTube, y la app no sabe si el creador usó IA realista (research R12) | Que conteste la IA | Medio (efecto visible) | Plan |
| 9 | 2026-11-12 | Agente | Los hashtags solo en los Shorts; en un vídeo largo no se proponen | La spec solo los pide en el Short (FR-018); regla anti-asunción | Hashtags en los dos | Medio (efecto visible) | Plan |
| 10 | 2026-11-12 | Agente | La descripción de un Short sacado de un vídeo largo nombra el vídeo largo sin enlace | La app no conoce su dirección en YouTube (research R9) | Pedir el enlace al creador | Medio (efecto visible) | Plan |
| 11 | 2026-11-12 | Agente | Cada título de la IA señala el bloque del guion que cumple su promesa; si no existe, la salida no valida | Hace comprobable FR-005 (research R8) | Confiar en el prompt | Medio (efecto visible) | Plan |
| 12 | 2026-11-12 | Agente | En la interfaz se dice «idea de miniatura» e «indicaciones para la miniatura», no «brief» | Principio I, sin jerga | «Brief» | Medio (texto de interfaz) | Plan |
| 13 | 2026-11-13 | Agente | El título que escribe el creador admite hasta 200 caracteres; lo que propone la IA, hasta 100 | Si no, el aviso de «título por encima del máximo» nunca salta (análisis, I1) | Límite de 100 para todos | Medio (efecto visible) | Análisis |
| 14 | 2026-11-13 | Agente | El comentario fijado es opcional: vacío, no se copia ni impide aprobar | La spec no lo exige y un creador puede no quererlo (análisis, I2) | Obligatorio | Medio (efecto visible) | Análisis |
| 15 | 2026-11-13 | Agente | La spec recoge el caso del perfil sin nombre del canal en YouTube (parte fija vacía) | Alinea la spec con la decisión 7 (análisis, I3) | Dejarlo solo en el plan | Medio (efecto visible) | Análisis |
| 16 | 2026-11-13 | Agente | En la lista guiada, «contenido alterado o sintético» explica la regla y pregunta al creador | Alinea la spec con la decisión 8 (análisis, I4) | Dar una respuesta por defecto | Medio (efecto visible) | Análisis |
| 17 | 2026-11-13 | Agente | Un Short recibe de 3 a 5 títulos propuestos | FR-003 no distinguía formato (análisis, I5) | De 5 a 8 también en Short | Medio (efecto visible) | Análisis |
| 18 | 2026-11-13 | Agente | La lista de publicaciones muestra los seis estados del modelo dichos para personas | FR-002 tenía dos y el modelo seis (análisis, I6) | Agruparlos en dos | Medio (texto de interfaz) | Análisis |
| 19 | 2026-11-13 | Agente | FR-012 nombra dos reglas más: más de 3 hashtags en un Short y miniatura que repite el título | Salen de FR-018 y US1; la regla anti-asunción pide que consten (análisis, S1) | Dejarlas solo en el plan | Medio (efecto visible) | Análisis |
| 20 | 2026-11-13 | Agente | El paquete toma la última medida `medida` de la idea, aunque luego una medición falle o la idea cambie; lleva su origen, si fue parcial y si es de una versión anterior de la idea | R7 pide «la última medida `medida`»; la 004 enseña así la de una revisión anterior; principio V | Solo la medida de la revisión actual | Medio (efecto visible) | Puerta A |
| 21 | 2026-11-13 | Agente | Un hashtag admite hasta 100 caracteres, y un capítulo con minuto `manual` debe tener minuto | `data-model.md` no fija la longitud; sin minuto, `manual` no tiene sentido (R3) | Sin límite | Bajo | Puerta A |
| 22 | 2026-11-13 | Agente | El aviso `sin_fuentes` sale solo cuando ya hay descripción | Antes de escribirla no hay apartado de fuentes del que avisar | Avisar desde el principio | Medio (efecto visible) | Puerta A |
| 23 | 2026-11-13 | Agente | Las afirmaciones de `studio.json` sobre idioma y categoría van marcadas como supuesto, y el esquema obliga a fuente o supuesto; el consejo de contraste de `craft.json`, también como supuesto | No se encontró página oficial que las respalde; principio V | Dejarlas sin marca | Medio (texto de interfaz) | Puerta A |
| 24 | 2026-11-13 | Agente | En la lista, un Short dice «Título y portada» en lugar de «Título y miniatura» | Un Short no tiene miniatura (ui-screens.md) | El mismo texto para los dos | Medio (texto de interfaz) | Puerta A |

## Pendientes del creador

| # | Qué falta | Opciones | Recomendación | Impacto | Tarea pausada |
|---|-----------|----------|---------------|---------|---------------|

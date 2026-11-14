# Auditoría de novato: paquete de publicación (T072, constitución IX)

**Fecha**: 2026-11-13 · **Método**: el agente `usuario-novato` (`.claude/agents/usuario-novato.md`) hace de Marta, una
persona sin conocimientos técnicos con un canal de cocina. Recorre la publicación en el navegador integrado, sin leer
código ni documentación interna. Tiene tres objetivos: preparar, revisar, copiar, aprobar y descargar la publicación de
un vídeo largo; cambiar algo aprobado y volver atrás; y dejar aprobada la de un Short sacado de ese vídeo. Cada ronda es
una sesión nueva, sin lo que vieron las anteriores. **Montaje**: la aplicación compilada como en el e2e
(`apps/server/dist` con `web/`), en una carpeta aislada del scratchpad, con la IA simulada (`YTCREATOR_FAKE_AI=ok`) y el
YouTube falso (`YTCREATOR_FAKE_YOUTUBE=1`). La bienvenida, la cuenta de prueba, el canal con su perfil, el guion aprobado
del vídeo largo y el del Short se preparan por la API, como en el e2e (con un spec temporal que se borra después). Nada
gasta dinero ni usa servicios reales. **Umbral**: 0 graves y como mucho 3 medios.

| Ronda | Puerto | Graves | Medios | Menores | Resultado |
|---|---|---|---|---|---|
| 1 | 4351 | 1 | 6 | 10 | No pasa |
| 2 | 4352 | 1 | 3 | 9 | No pasa |
| 3 | 4353 | 0 | 5 | 10 | No pasa |
| 4 | 4354 | 0 | 6 | 15 | No pasa |
| 5 | 4355 | 0 | 5 | 11 | **Cerrada por el creador** con 4 medios abiertos (decisión 112) |

## Ronda 1: no pasa (1 grave, 6 medios, 10 menores)

Consigue los tres objetivos. Tiempo con la herramienta, desde el guion aprobado hasta tener copiadas las cinco piezas del
vídeo largo: 156 s. Marta calcula que una persona real, leyéndolo todo, tardaría de 10 a 15 minutos.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| G1 | Grave | Escribe en «Primeras líneas» del Short, no guarda, pulsa «Seguir con revisar y copiar» con el paso ya aprobado y su frase se pierde sin aviso. | Corregido (decisión 100): salir de un paso con cambios sin guardar pregunta antes, con las pestañas, «Seguir con…», otra pantalla, atrás o al cerrar. «Aprobar» ya estaba apagado con cambios sin guardar («Guarda los cambios antes de aprobar»). |
| M1 | Medio | «Mis publicaciones» no deja empezar la del Short; hay que volver a «Mis guiones». La portada solo lleva al canal. | Corregido en la lista (decisión 101): enseña los guiones aprobados sin publicación con «Preparar la publicación de «…»». Que la portada lleve a cada lista es el medio abierto de la 004 y la 005, para la pasada de interfaz con modo Design. |
| M2 | Medio | «Aprobar la publicación» sale apagado unos segundos, sin decir por qué. | Corregido (decisión 102): dice que espera a la revisión de «Antes de subirlo», o que se reintente si falló. |
| M3 | Medio | El diálogo «Quedan 3 avisos sin resolver» no dice cuáles; «Revisar los avisos» solo lo cierra. | Corregido (decisión 103): el diálogo los enumera y «Revisar los avisos» lleva a «Antes de subirlo». |
| M4 | Medio | El indicador «Paso 3 de 3» y las pestañas de pasos dicen cosas distintas. | Abierto, para la pasada de interfaz con modo Design: es cómo se ve el progreso, no lo que hace. |
| M5 | Medio | Deshacer pasa por el historial, cada versión no dice qué título tenía y volver obliga a aprobar otra vez. | Abierto en parte. Volver a aprobar es lo que pide la spec (US5, escenario 3: una versión recuperada vuelve a borrador). Que la lista de versiones enseñe su contenido va a la pasada de modo Design. |
| M6 | Medio | «Copiar» siempre falla y la página salta al abrir el recuadro de copia manual. | Abierto en parte. El fallo al copiar es del navegador integrado: en el e2e, con el permiso del portapapeles, copia el texto exacto. El salto de la página va a la pasada de modo Design. |
| m1 | Menor | «Historial de el comentario fijado». | Corregido (decisión 104): «Historial del comentario fijado». |
| m2–m10 | Menor | Avisos de fuentes y de «idea no medida» difíciles de entender, títulos repetidos en tres sitios, textos del vídeo largo en el Short, ejemplo de los títulos en las miniaturas, «Seguir con…» no sube al principio, «Próximos vídeos» sin presentar, la lista no dice si el guion tiene publicación, Esc en un diálogo del navegador integrado. | Para la pasada de interfaz con modo Design. |

Jerga que señala: «fuentes», «afirmación por comprobar», «borrador», «hashtags», y los nombres de YouTube Studio («Probar
y comparar», «Vídeo relacionado», «Contenido alterado o sintético») que nadie le explica dónde están.

## Ronda 2: no pasa (1 grave, 3 medios, 9 menores)

Consigue los tres objetivos. Tiempo con la herramienta, del guion aprobado a las cinco piezas copiadas: unos 3 minutos;
Marta calcula de 15 a 20 para una persona real. Confirma G1, M1, M2 y m1 de la ronda 1: salir con cambios sin guardar
pregunta (con «Seguir», con las pestañas y con el menú; el navegador integrado contesta «no» solo a la confirmación),
«Mis publicaciones» deja preparar la del Short y el diálogo enumera los avisos.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Grave | Con una idea de miniatura abierta para editar y sin guardar, «Aprobar título y miniatura» aprueba lo anterior; Marta cree que entró su cambio. Dice que en la portada del Short pasa igual al vaciar el momento. | Corregido en el vídeo largo (decisión 105): «Aprobar» espera, con «Guarda los cambios antes de aprobar», mientras haya un título o una idea en edición o un título propio sin añadir. En el Short no se reproduce: vaciar el momento ya cuenta como cambio y apaga «Aprobar» (decisión 91, probado en el e2e de US4). |
| 2 | Medio | El indicador de pasos no coincide con el paso que se ve. | Abierto: es M4 de la ronda 1, para la pasada de interfaz con modo Design. |
| 3 | Medio | «Revisar los avisos» lleva a «Antes de subirlo», que dice que no hay nada, y los avisos están arriba. | Corregido (decisión 103): lleva primero a los avisos de la publicación, arriba, si los hay. |
| 4 | Medio | En «Ajustes de YouTube Studio», la casilla de «Contenido alterado o sintético» no deja claro si marcarla es «sí, he usado IA» o «ya lo he hecho». | Abierto, para la pasada de interfaz con modo Design: es cómo se presenta la lista guiada. |
| 5–13 | Menor | Nombre de la publicación distinto del guion, círculos del indicador que no se pulsan, títulos repetidos, ejemplo de los títulos en las miniaturas, textos del vídeo largo en el Short, cajas estrechas al editar una idea, «Próximos vídeos» sin enlace, la descarga no dice nada, «Seguir con revisar y copiar». | Para la pasada de interfaz con modo Design. |

Jerga que señala, además de la de la ronda 1: «parte fija», «etiquetas» frente a «hashtags», «Opinión de la IA»,
«Lo cumple: «Gancho»» y `sub_confirmation=1` en el enlace de suscripción.

## Ronda 3: no pasa (0 graves, 5 medios, 10 menores, 1 a confirmar)

Consigue los tres objetivos. Tiempo con la herramienta: 217 s, con sus pruebas de editar sin guardar; Marta calcula de
10 a 15 minutos para una persona real. Confirma el grave de la ronda 2: con algo sin guardar, «Aprobar» se apaga y lo
dice, y vuelve a encenderse al deshacer el cambio. La pregunta al salir sin guardar sale en la consola con «Seguir»,
«Volver a mis publicaciones» y la flecha Atrás.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | Al pasar a «Revisar y copiar» la pantalla se queda abajo, junto a «Aprobar»; no ve los avisos ni las piezas. | Corregido (decisión 107): al cambiar de paso, sube al principio del paso nuevo. |
| 2 | Medio | El indicador de pasos no coincide con el paso que se ve. | Abierto: es M4 de la ronda 1, para la pasada de interfaz con modo Design. |
| 3 | Medio | «Guarda los cambios antes de aprobar» no dice qué falta, con cuatro «Guardar» en la página. | Corregido (decisión 106): «Antes de aprobar, guarda la descripción y los capítulos», por ejemplo. |
| 4 | Medio | En el Short, «Revisar los avisos» deja los avisos de arriba cortados. | Corregido (decisión 108). La app de esta ronda ya llevaba el foco a la lista de arriba (comprobado en el navegador: la lista tiene el foco posible y sus dos avisos), pero la cabecera fija la tapaba; ahora se centra. |
| 5 | Medio | Tras «Proponer…» el botón se apaga y no ve que la IA trabaja: el panel está arriba. | Corregido (decisión 108): el panel se centra en la pantalla al empezar. |
| 6–15 | Menor | Títulos repetidos, cajas estrechas al editar, la vista previa de la descripción no cambia hasta guardar, no sale «Guardado», textos del vídeo largo en el Short, el estado aprobado solo abajo, nombre de la publicación distinto del guion, «Próximos vídeos» sin enlace, las pestañas de pasos no parecen botones, ejemplo de los títulos en las miniaturas. | Para la pasada de interfaz con modo Design. |
| 16 | A confirmar | En el Short, una vez aprobó la portada editada sin guardar, pulsando «Aprobar» al instante tras escribir; a velocidad normal no lo reprodujo. | Corregido (decisión 106): el aviso de cambio sin guardar llega antes de pintar la pantalla, así que «Aprobar» ya está apagado cuando se ve el texto nuevo. |

Jerga que señala, además de la de las rondas anteriores: «borrador», «fotogramas», «Desarrollo» y «Cierre» como partes
del guion, y «Marcarlo mal tiene consecuencias legales», que asusta sin decir qué hacer.

## Ronda 4: no pasa (0 graves, 6 medios, 15 menores)

Consigue los tres objetivos. Tiempo con la herramienta: 236 s, con sus pruebas; Marta calcula de 15 a 25 minutos para
una persona real con la IA de verdad. Confirma lo de la ronda 3: «Aprobar» dice qué falta por guardar («Antes de
aprobar, guarda la idea de miniatura que estás editando»), «Revisar los avisos» lleva a la lista y la resalta, y salir
sin guardar pregunta. Dos de sus medios (2 y 3) los causó el arreglo de la ronda 3.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | La portada solo lleva al canal; «Mis guiones» y «Mis publicaciones» están al final de una página larga. | Abierto: es el medio de la 004 y la 005, para la pasada de interfaz con modo Design. |
| 2 | Medio | Al pulsar «Proponer ideas de miniatura» la página salta arriba, al panel de la IA, y las ideas llegan muy abajo. | Corregido (decisión 108): la página no se mueve y el botón dice debajo que la IA está escribiendo. |
| 3 | Medio | «Corregirlo» lleva al principio del paso, no a la pieza. | Corregido (decisión 109): lleva a la pieza del aviso, con el foco en su título. |
| 4 | Medio | El aviso «La descripción no tiene fuentes» no se entiende ni dice qué hacer. | Corregido (decisión 110): en llano, con «Ir al guion» y diciendo cuándo no hay que hacer nada. |
| 5 | Medio | La casilla de «Contenido alterado o sintético» no deja claro si marcarla es responder «sí». | Corregido (decisión 110): las casillas dicen que marcarlas es «ya lo he respondido en YouTube Studio». |
| 6 | Medio | El Short habla de miniatura y no dice desde dónde se sube. | Corregido en parte (decisión 110): el porqué del primer paso habla de portada, «Revisar y copiar» dice que la portada se elige en la aplicación del móvil, y la entrada desde el guion dice «ideas de miniatura (en un Short, la portada)». «Probar también» sigue hablando de títulos y miniaturas, como lo dice YouTube; se queda para la pasada con modo Design. |
| 7–21 | Menor | Títulos repetidos, cajas estrechas, rótulos de las ideas con el mismo peso, ejemplo de los títulos en las miniaturas, no sale «Guardado», Intro y Esc al editar, el indicador de pasos, primeras líneas vacías sin aviso, nombre distinto en la lista, historial sin resumen, pestañas que no parecen botones, avisos repartidos, «Próximos vídeos» sin enlace, la descarga sin explicar, y tres casillas marcadas muy seguidas de las que solo quedó una (sin confirmar). | Para la pasada de interfaz con modo Design. |

## Ronda 5: no pasa (0 graves, 5 medios, 11 menores)

Consigue los tres objetivos sin ayuda. Tiempo con la herramienta, del guion aprobado a las cinco piezas copiadas: 126 s;
Marta calcula de 10 a 15 minutos para una persona real. Confirma lo de la ronda 4: mientras la IA escribe lo dice junto
al botón, «Corregirlo» lleva a la pieza, «Revisar los avisos» lleva a los de arriba y los recuadra, las casillas de
YouTube Studio se entienden y nada se aprueba con cambios sin guardar.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| M1 | Medio | El indicador de pasos dice «Paso 3 de 3» mientras se ve otro paso, y marca «pendiente» lo que sigue aprobado. | Abierto: es M4 de la ronda 1, en las cinco rondas. Para la pasada de interfaz con modo Design. |
| M2 | Medio | Tras «Corregirlo» en una publicación aprobada hay que aprobar los tres pasos otra vez, y la idea no se resalta. | Abierto. Ya pregunta antes («Si cambias algo, dejará de estar aprobada», decisión 68); volver a aprobar es lo que pide FR-015. Resaltar el elemento exacto, para la pasada con modo Design. |
| M3 | Medio | Volver a la versión aprobada deja la publicación en borrador. | Abierto: lo pide la spec (US5, escenario 3). Cambiarlo es una decisión del creador (pendiente C2). |
| M4 | Medio | Con el momento del Short vacío, «Guardar» se apaga sin decir por qué. | Corregido (decisión 111): el campo dice que no puede quedar vacío. |
| M5 | Medio | La portada no lleva a los guiones ni a las publicaciones. | Abierto: es el medio de la 004 y la 005, para la pasada con modo Design. |
| m1–m11 | Menor | La raíz abre la bienvenida ya terminada, nombre de la publicación distinto del guion, lo copiado no avisa si cambia, no sale «Guardado», ejemplo de los títulos en las miniaturas, «Probar también» con miniaturas en el Short, Studio y móvil en el Short, títulos repetidos, dos «Ir al guion» iguales, «Aprobar igual» destacado en el diálogo, jerga. | Para la pasada de interfaz con modo Design. |

Las rondas no convergen al umbral por la misma razón que en la 005: cada auditora llega más hondo. Los cuatro medios que
quedan son de presentación (M1, M5, parte de M2) o los fija la spec (M3, M2). El creador decidió el 2026-11-13 cerrarla así (decisión 112): los medios de presentación van a la pasada con modo
Design y los que fija la spec se quedan como están.


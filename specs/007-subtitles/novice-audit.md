# Auditoría de novato: subtítulos (T077, constitución IX)

**Fecha**: 2026-11-16 · **Método**: el agente `usuario-novato` (`.claude/agents/usuario-novato.md`) hace de Marta, una
persona sin conocimientos técnicos con un canal de cocina. Recorre los subtítulos en el navegador Playwright, sin leer
código ni documentación interna. Tiene cuatro objetivos:
1. sacar los subtítulos de su vídeo `pan.mp4`;
2. escuchar alguno, corregir una palabra, cambiar una palabra en todos, aprobarlos y descargarlos;
3. poner los minutos reales de los capítulos en su publicación;
4. volver a hacerlos con otro montaje (`pan.wav`) sin perder nada y borrar el audio guardado.

Cada ronda es una sesión nueva, sin lo que vieron las anteriores.

**Montaje**: la aplicación compilada como en el e2e (`apps/server/dist` con `web/`), en una carpeta aislada del
scratchpad, con la IA simulada (`YTCREATOR_FAKE_AI=ok`), el YouTube falso (`YTCREATOR_FAKE_YOUTUBE=1`) y el
reconocimiento falso (`YTCREATOR_FAKE_SPEECH=capitulos`, a 300 ms por paso). La bienvenida, la cuenta de prueba, el canal
con su perfil, el guion aprobado y su publicación aprobada se preparan por la API, como en el e2e, con un spec temporal
que se borra después. El programa de reconocimiento «se descarga» desde el servidor falso, con ficheros de 1 MB. Nada
gasta dinero ni usa servicios reales.

**Umbral (SC-007)**: 0 graves y como mucho 3 medios.

| Ronda | Puerto | Graves | Medios | Menores | Resultado |
|---|---|---|---|---|---|
| 1 | 4371 | 1 | 4 | 9 | No pasa |
| 2 | 4372 | 0 | 4 | 10 | No pasa |
| 3 | 4373 | 0 | 4 | 8 | No pasa; tras corregir 3 de sus medios, **pendiente del creador** (P6) |

## Ronda 1: no pasa (1 grave, 4 medios, 9 menores)

Consigue los objetivos 1, 2 y 4; el 3 no. Tiempos del agente: subtítulos hechos en 1 min 20 s, de los que casi la mitad
se fueron en encontrar la pantalla, y aprobados y descargados en 2 min 35 s.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| G1 | Grave | No consigue poner los minutos reales. Las casillas que vienen marcadas al principio ya dan error. El aviso «Decide qué minuto poner» no tiene dónde escribirlo, y «Poner los minutos reales» de la publicación devuelve a la misma pantalla. | Corregido (decisión 60). La causa: se marcaba «El truco» (real 0:02) y se dejaba «Lo que necesitas» en 0:13, antes que él. Ahora solo se marcan al principio los que dejan los capítulos en orden, contando que los estimados se mueven detrás de un minuto nuevo (R3 de la 006). Un capítulo que suena antes que uno anterior lleva un campo para escribir su minuto. |
| M1 | Medio | Confirma «¿Poner los minutos marcados?» y luego se rechaza. «Un capítulo que escribiste tú» sin haber escrito ninguno. | Corregido (decisión 60). El desorden se dice antes de preguntar: cada capítulo afectado lo indica y «Poner los minutos marcados» no se puede pulsar. El error que queda (un minuto escrito demasiado cerca de otro) ya no habla de capítulos escritos por ella. |
| M2 | Medio | Los subtítulos solo se encuentran al final de la página del guion. Ni el inicio ni «Mi canal» los nombran. | Abierto. Es el medio que viene de la 004 y la 005 (el inicio no lleva a cada lista); va a la pasada de interfaz con modo Design. |
| M3 | Medio | Al rehacer con otro montaje se pierde sin aviso una corrección hecha a mano en un subtítulo. | Corregido en el aviso (decisión 60). Que la corrección no pase es lo que pide la spec: lo oído es nuevo y FR-017 solo repite los cambios en todos. Ahora el aviso lo dice: «Lo que cambiaste a mano en un subtítulo no pasa a los nuevos; tus cambios en todos sí se pueden repetir.» |
| M4 | Medio | Al aprobar dice que quedan 9 por revisar aunque los ha mirado todos. No se explica cómo se da uno por revisado. | Corregido (decisión 60). Bajo el filtro: «Un subtítulo sale de «Para revisar» cuando lo abres y pulsas «Dar por revisado».», y el diálogo de aprobar dice «no los has dado por revisados». |
| m1–m9 | Menor | El orden de la página (aprobar antes que la lista); «límites de lectura» sin explicar; «MB» y «unos 1 MB»; «Modelo de voz» y los formatos en «Modo experto»; «Oír» no indica que suena; la descarga no dice adónde va y usa el título de YouTube en el nombre; el historial no dice de qué fichero sale cada versión; «Elegir otro fichero» pasa por una pantalla intermedia; el diálogo ancho de los capítulos y el campo «Acaba» desalineado. | Para la pasada de interfaz con modo Design. «unos 1 MB» viene de los ficheros falsos (el real dice unos 580 MB, R6). |

Lo que funciona y no se toca:
- el coste y la privacidad dichos antes («Lo escucha tu propio equipo…»);
- el avance con porcentaje, que sobrevive a recargar;
- «Cambiar en todos» con su número y su rechazo claro;
- el aviso tras aprobar;
- la oferta de repetir los cambios en todos;
- el historial con «Volver a esta»;
- borrar el audio con su diálogo;
- el teclado, 375 px y el modo oscuro.

Jerga que señala: «MB», «Modelo de voz», «.srt/.vtt/.sbv», «límites de lectura», «estimado con el guion», «equipo».

## Ronda 2: no pasa (0 graves, 4 medios, 10 menores)

Consigue los cuatro objetivos sin ayuda; el 3 se intenta y no se puede, por los datos de prueba. Ya no se queda sin
salida y la publicación no cambia. Tiempos del agente: subtítulos hechos en 1,5 min (con 4 pantallas antes del botón) y
el objetivo 2 en 2 min más.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| M1 | Medio | No sabe por dónde entrar a los subtítulos. | Abierto: el mismo de la ronda 1 (M2), para la pasada de modo Design. |
| M2 | Medio | Todos los subtítulos llevan avisos amarillos que no dicen qué hacer. | Corregido (decisión 60 i): «Se lee demasiado rápido: acorta el texto o alarga el tiempo que se ve.» y «Se sale de los límites de lectura: tiene demasiadas líneas o letras, o se ve demasiado o muy poco tiempo.». Que salgan todos viene del reconocimiento falso, que comprime las palabras en 4 s. |
| M3 | Medio | «Demasiado cerca» sale después de confirmar y sin decir qué capítulo. | Corregido (decisión 60 g): la comprobación previa cuenta también el mínimo de YouTube, como el servidor, y lo dice en cada capítulo antes de pedir nada. Lo confirmaron también los revisores de la Puerta A. |
| M4 | Medio | La casilla y la caja de cada capítulo confunden, y el diálogo habla de «marcados» aunque el minuto sea escrito. | Corregido (decisión 60 h): «Poner estos minutos» y «¿Poner estos minutos?», y la caja dice «O escribe otro minuto para «…»». |
| m1–m10 | Menor | No se pueden dar todos por revisados de golpe; «Cambiar en todos» distingue mayúsculas; el historial no dice de qué fichero sale cada versión ni cuál se aprobó; «Borrar el audio» dentro de «Otro montaje»; la duración «4 s» y «0:03» en sitios distintos; no se puede oír desde el editor ni se ve que suena; no se confirma la descarga del programa ni la del fichero, y el nombre usa el título de YouTube; la página es larga y los capítulos van antes que los subtítulos; un mensaje viejo se queda arriba y la dirección inicial abrió «Todo listo». | Para la pasada de modo Design. Que el texto explique que guardar también da por revisado: corregido en la explicación bajo el filtro. |

Jerga que señala: «límites de lectura», «Modelo de voz», «MB», «equipo», «borrador», «Modo experto», «.srt», «YouTube
Studio, en Subtítulos».

## Ronda 3: no pasa (0 graves, 4 medios, 8 menores)

Consigue los objetivos 1, 2 y 4. El 3 no se puede con los datos de prueba, pero la pantalla lo explica y el botón se
queda apagado con su motivo. Tiempos del agente: subtítulos en 54 s (casi 30 s buscando la sección) y aprobados y
descargados en 1 min 19 s más.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| M1 | Medio | No sabe dónde están los subtítulos. | Abierto: el mismo de las rondas 1 y 2, para la pasada de modo Design. |
| M2 | Medio | En los capítulos, «demasiado cerca» no dice cuánto, sale también en el capítulo vecino y nada dice que, si no se puede ninguno, basta con dejarlos. | Corregido (decisión 60 j): «…o queda a menos de 10 s de él (el mínimo de YouTube entre capítulos)» y «Si no sale ninguna combinación, deja los capítulos como están: ya valen para YouTube.». |
| M3 | Medio | En el historial no se ve cuál es la versión aprobada ni de qué fichero sale cada una. | Corregido en parte (decisión 60 j): la aprobada dice «La que aprobaste». El fichero de cada versión no se guarda; va a la pasada de modo Design con el resto del historial. |
| M4 | Medio | La ayuda decía que guardar un cambio saca un subtítulo de «Para revisar», y lo cambiado con «Cambiar en todos» seguía en la lista. | Corregido (decisión 60 j): «…cuando pulsas «Editar» y luego «Guardar» o «Dar por revisado». «Cambiar en todos» no los da por revisados.». |
| m1–m8 | Menor | Orden de la página; «Oír» sin señal; nombre del fichero descargado; la duración «4 s» y «0:03»; los dos modelos de «1 MB» (datos de prueba); sin «ya está» tras descargar el programa; un aviso viejo que se queda; la dirección inicial abre «Todo listo». | Para la pasada de modo Design. |

Tras la ronda 3 quedaría abierto un medio (M1), pero sin una ronda que lo confirme. La Puerta A permite como mucho tres
rondas antes de parar, así que la decisión de cerrar la auditoría o hacer una cuarta es del creador (P6 en
`decisions.md`), como en la 006 (decisión 112).

# Auditoría de novato: guion y escaleta (T098, constitución IX)

**Fecha**: 2026-11-12 · **Método**: el agente `usuario-novato` (`.claude/agents/usuario-novato.md`) hace de Marta, una
persona sin conocimientos técnicos con un canal de cocina. Recorre el guion en el navegador integrado, sin leer código ni
documentación interna, desde la portada hasta el guion aprobado, el Short y el Short sacado del vídeo largo. Cada ronda
es una sesión nueva, sin lo que vieron las anteriores. **Montaje**: la aplicación compilada como en el e2e
(`apps/server/dist` con `web/`), en una carpeta aislada del scratchpad, con la IA simulada (`YTCREATOR_FAKE_AI=ok`) y el
YouTube falso (`YTCREATOR_FAKE_YOUTUBE=1`). La bienvenida, la cuenta de prueba, el canal con su perfil y tres ideas en el
banco se preparan por la API, como en el e2e. Nada gasta dinero ni usa servicios reales. **Umbral**: 0 graves y como
mucho 3 medios.

| Ronda | Puerto | Graves | Medios | Menores | Resultado |
|---|---|---|---|---|---|
| 1 | 4338 | 0 | 4 | 18 | No pasa |
| 2 | 4339 | 0 | 5 | 23 | No pasa |
| 3 | 4340 | 1 | 4 | 17 | No pasa |
| 4 | 4341 | 1 | 3 | 21 | No pasa |
| 5 | 4342 | 0 | 3 | 14 | **Pasa** |

Las rondas no convergían porque cada auditora iba más hondo que la anterior: los medios de cada ronda son, casi todos,
nuevos. Lo que confirmaba la ronda siguiente sobre los arreglos anteriores se anota en cada una.

## Ronda 1: no pasa (0 graves, 4 medios, 18 menores)

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| M1 | Medio | La portada solo ofrece «Ver mi canal»; «Mis guiones» está al final de una página de canal muy larga. | Abierto: es el medio n.º 1 de la ronda 2 de la 004, para la pasada de interfaz con modo Design (decisión 68 de la 004). Sale en las cinco rondas. |
| M2 | Medio | «Elegir para guion» solo mete la idea en la cola; «Preparar el guion» queda fuera de la vista. | Corregido (decisión 48): el foco y la vista van a su «Preparar el guion». |
| M3 | Medio | «Comprobar con internet» no daba señal; Marta lo pulsó tres veces y pagó tres búsquedas iguales. | Corregido (decisión 49): el contador dice que ya se buscó y dónde ver el resultado; el botón solo sale si queda algo sin buscar. |
| M4 | Medio | Las marcas «por comprobar» solo se distinguían por el color. | Corregido (decisión 49): el contador dice dónde están y lleva «Ir a la primera». El refuerzo visual, a la pasada de modo Design. |
| m1–m18 | Menor | Etiquetas «Comprobado» y «Opinión de la IA» juntas, la fuente del creador «consultada», «Sin título», segundos frente a minutos, el formulario de pedir un bloque que queda abierto, «Acto», «cola», «Descargar como datos», entre otros. | Para la pasada de interfaz con modo Design. |

## Ronda 2: no pasa (0 graves, 5 medios, 23 menores)

Confirma M2 a M4 de la ronda 1. Nuevos:

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | La portada no lleva a los guiones. | Abierto (M1). |
| 2 | Medio | Revisar no enseña el guion: se aprueba sin releerlo. | Corregido (decisión 50): dice qué revisa y tiene «Leer el guion entero». |
| 3 | Medio | «Quitar del guion» deja la frase rota y la página salta arriba. | Corregido (decisión 50): la vista se queda en el bloque. |
| 4 | Medio | «Quitar» un bloque de la escaleta lo borra sin preguntar. | Corregido (decisión 50): pregunta y dice que se recupera en el historial. |
| 5 | Medio | «Mis guiones» con guiones no deja empezar otro. | Corregido (decisión 50): «¿Otro vídeo?» con «Ir al banco de ideas». |
| 18 | Menor | El aviso con botón de la ronda 1 se quedaba pegado en el guion. | Corregido: el arreglo de M2 pasó a mover el foco (decisión 48). |

## Ronda 3: no pasa (1 grave, 4 medios, 17 menores)

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| G1 | Grave | Al volver a «Hechos» la barra marcaba todo como pendiente, y «Proponer escaleta» sustituía sin avisar la escaleta aprobada. | Corregido (decisión 51): la barra marca el progreso; con la escaleta hecha, Hechos lleva a ella. |
| M1 | Medio | La portada. | Abierto. |
| M2 | Medio | «Pedir de nuevo este bloque» borra lo escrito a mano sin decirlo. | Corregido (decisión 51): el panel lo avisa y dice que queda en el historial. |
| M3 | Medio | Los apuntes solo se guardaban al salir del campo. | Corregido (decisión 51): se guardan solos 1,5 s después de dejar de escribir. |
| M4 | Medio | «La escaleta ha cambiado» seguía tras restaurar la misma escaleta. | Corregido (decisión 51): compara bloques, no números de versión. |

## Ronda 4: no pasa (1 grave, 3 medios, 21 menores)

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| G1 | Grave | Con el guion aprobado y la escaleta reordenada, «Escribir el guion de nuevo» reescribió todo sin avisar de que se perdía lo escrito a mano. | Corregido (decisión 52): pregunta y dice qué se pierde y dónde recuperarlo; también «Proponer otra escaleta» y «Quiero otro guion». |
| M1 | Medio | La portada. | Abierto. |
| M2 | Medio | «La escaleta ha cambiado» no decía qué significaba ni qué hacer. | Corregido (decisión 52). |
| M3 | Medio | Un hecho dice a la vez «Comprobado» y «Opinión de la IA». | Abierto: decisión 36 (ampliar `DataSource` es tocar el design system); a la pasada de modo Design. |

## Ronda 5: pasa (0 graves, 3 medios, 14 menores)

Marta recorre todo lo pedido, incluido volver atrás y cambiar pasos con el guion aprobado, y dice: «casi todo lo que
borra o sustituye avisa y dice que se recupera del historial».

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | «Pedir otra escaleta» sustituye sin avisar la escaleta editada. | Corregido después de la ronda (decisión 53): «Quiero otra escaleta» lo dice antes. Comprobado por e2e, no por Marta. |
| 2 | Medio | La portada no lleva al banco ni a «Mis guiones». | Abierto (M1): pasada de modo Design. |
| 3 | Medio | En el Short, con la duración vacía, el botón queda gris sin decir por qué. | Corregido después de la ronda (decisión 53): junto al botón se dice que hay que arreglar la duración. Comprobado por test de pantalla, no por Marta. |
| 4–17 | Menor | La barra de pasos marca el progreso y no la pestaña vista (efecto de la decisión 51, y hay dos filas de pasos), «Hechos» se confunde con «ya hecho», «Es correcto» frente a «No es un dato», el formulario de pedir un bloque que queda abierto, «Acto», «Supuesto de YTCreator», el historial de la escaleta sin decir qué cambió, minutos y segundos, «unos 1 min», «Escribir el guion de nuevo» y «Quiero otro guion» que parecen lo mismo, el icono de cerrar en móvil. | Para la pasada de interfaz con modo Design. |

**Abiertos al cerrar:** 1 medio (la portada, de la 004) y los menores, todos para la pasada de interfaz con modo Design.

## Tiempo de la idea al guion aprobado (SC-001)

| Ronda | Reloj | Nota |
| --- | --- | --- |
| 1 | 4 min 43 s | La auditora estima 15 a 20 min para una persona real. |
| 2 | 4 min 51 s | |
| 3 | 6 min 19 s | Incluye unos 2 min de pruebas de «humana torpe». |
| 4 | 5 min 4 s | |
| 5 | 5 min 35 s | Con todo lo pedido; estima 15 a 25 min para una persona real. |

Los tiempos incluyen las esperas de las herramientas del agente (1 a 5 s por acción), que no se pueden separar, y no
incluyen esperas de IA: la simulada responde al instante. No miden SC-001 con IA real.

## Del montaje, no cuenta

Los textos de relleno de la IA simulada, los guiones mucho más cortos de lo pedido, la investigación sobre masa madre
para un vídeo de pan sin amasar, el nombre del canal, los enlaces `.example` y la rapidez de la IA.

## Sin ver por Marta

Las descargas (las cubre `scripts.spec.ts`, T097), las esperas y los fallos de una IA real, cerrar la pestaña a mitad de
una petición (lo cubre `scripts.spec.ts`), una conexión que no puede buscar (lo cubren dos e2e) y «Cerrar YTCreator».

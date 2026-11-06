# Auditoría de novato: canal y nicho (T127, constitución IX)

**Fecha**: 2026-11-06 · **Método**: el agente `usuario-novato` (`.claude/agents/usuario-novato.md`) hace de Marta, una
persona sin conocimientos técnicos que quiere un canal de cerámica. Recorre la aplicación en el navegador integrado,
sin leer código ni documentación interna. **Montaje**: la aplicación compilada (`apps/server/dist`) en una carpeta
aislada, en el puerto 4333, con la IA simulada (`YTCREATOR_FAKE_AI=ok`) y el YouTube falso (`YTCREATOR_FAKE_YOUTUBE=1`,
con los canales `@cocinacorta30` y `@cocinatres`). Nada gasta dinero ni usa YouTube de verdad. **Umbral**: 0 graves y
como mucho 3 medios.

## Ronda 1: no pasa (0 graves, 7 medios, 21 menores)

Recorrió entero «Crear mi canal», desde la bienvenida hasta «Tu canal», con edición, reescritura con la IA, versiones,
descarga y cambio de nombre, y Ajustes, a 375 px, 1280 px, en modo oscuro y con el teclado. No pudo hacer «Ya tengo un
canal»: con un canal creado la aplicación no ofrece ese camino (es el n.º 6).

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | Tras «Elegir este nicho» o «Elegir este concepto», «Seguir» queda muy abajo, tras otras tarjetas y bloques. | Corregido (entrada 138). El botón para seguir va dentro de la tarjeta elegida: nicho, idea y nombre. |
| 2 | Medio | Con 5 horas respondidas, el perfil guardó 6 («las de la IA») y el aviso «no te cabe» desapareció; «unas X horas en total» a veces era lo que necesita y a veces lo que tiene. | Corregido con la respuesta del creador (entrada 136). Las horas son siempre las del creador, también tras «Cambiar algo». El ritmo dice aparte «Este ritmo pide unas X horas» y «Tú tienes Y». |
| 3 | Medio | «Cambiar el nombre» metía de nuevo en el asistente («Paso 6 de 6») y su «Volver» enseñaba la idea antigua. | Corregido con la respuesta del creador (entrada 136, sustituye a la 116). Un panel dentro de «Tu canal», con los nombres, «Escribir el mío», la @ comprobada y «Cancelar». |
| 4 | Medio | Lo escrito en «Editar» se perdía sin aviso al pulsar «Ajustes». | Corregido (entrada 138). Salir con cambios sin guardar pregunta antes, dentro de la app y al cerrar la pestaña. |
| 5 | Medio (posible montaje) | Ajustes › YouTube decía a la vez «Ahora leemos YouTube con el lector» y «El lector no está preparado». | Corregido (entrada 138). Sin el lector preparado dice «Leeremos YouTube con el lector… en cuanto esté preparado». En una instalación real el instalador prepara el lector (paso 8). |
| 6 | Medio | Con un canal creado no hay forma de usar «Ya tengo un canal» ni de empezar de nuevo. | Corregido con la respuesta del creador (entrada 137). Sin función nueva (FR-028): la elección inicial y «Tu canal» dicen que por ahora hay un solo canal y que varios llegarán más adelante. |
| 7 | Medio | La descarga no avisaba de nada y no se sabía con qué abrir el `.md`. | Corregido (entrada 138). Aviso de que está en la carpeta de descargas del navegador y con qué se abre (Bloc de notas, TextEdit o Word). El formato sigue siendo el de FR-026. |
| 8–28 | Menor | Error de Intereses que no se iba, pasos que piden pulsar antes de proponer, la flecha atrás del navegador, «Pedir la opinión de la IA», tarjetas largas, «concepto» frente a «idea», lo editado sigue como «Opinión de la IA», «1 vídeos largos», «Ni/Sin cara ni voz», la casilla de niños sin ayuda, jerga del dinero, texto de «Editar», sin mensaje de éxito al terminar, «Descargar como datos», la @ con espacios, el nicho propio repetido, «Llamadas», jerga de Ajustes › YouTube, cabecera en móvil y «Decidir más tarde» con un nombre ya elegido. | Corregidos el 8, 14, 16, 17, 20, 23 y 28 (entrada 138). El resto queda para la pasada de interfaz con modo Design. |

Del montaje, no cuenta: la IA simulada contesta con cocina aunque se hable de cerámica, «Proponer otra» devuelve la misma
tanda, la página de Claude no carga y el panel de prueba no enseña la descarga.

## Ronda 2: no pasa (0 graves, 4 medios, 21 menores)

La hizo un agente nuevo, sin contexto de la ronda 1, con las correcciones de arriba y dos instalaciones limpias (4333 y
4334). Terminó los dos recorridos: «Crear mi canal» y «Ya tengo un canal» con `@cocinacorta30`. También probó Ajustes,
recargar, volver atrás, 375 px, modo oscuro y el teclado.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio (roza grave) | Con 5 horas, el enfoque de un canal existente pide 7: el aviso «no te cabe» no dice qué hacer, se aprueba sin preguntar y en el perfil el aviso desaparece, también tras «Editar» con 3 horas. | Corregido (entrada 139). El perfil calcula el aviso con el ritmo de ahora (no se guardaba, porque no tiene fuente). El aviso dice qué hacer, y elegir una idea o aprobar un enfoque que no cabe pregunta antes: «Cambiarlo antes» o «Quedarme con él igualmente». |
| 2 | Medio | Tras guardar, el aviso tapaba «Ajustes» en la cabecera y con el ratón encima no se iba. | Corregido (entrada 139). Los avisos siguen arriba (001), pero por debajo de la cabecera: `ToastProvider` admite `offsetTop` y la web le pasa la altura de la cabecera. |
| 3 | Medio | El `.md` no se abre con doble clic y se ve con # y **. | Mitigado (entrada 139): el texto dice qué elegir si el ordenador pregunta y qué son los # y **. Cambiar el formato (FR-026) es decisión del creador. |
| 4 | Medio | «¿Y dónde miro yo mi @?» en «Busca tu canal». | Corregido (entrada 139). «¿Dónde veo mi @?», con los pasos en YouTube, abierto solo si el canal no se encuentra. |
| 5–25 | Menor | Barra de pasos que junta palabras, «Volver» arriba, un clic de más para proponer, recargar y la flecha atrás, «tema» y «nicho», canales de referencia sin enlace, jerga, el panel del nombre («Usar este nombre» frente a «Quedarme con este nombre», lo elegido sigue tras «Cancelar», el foco y Esc), la cabecera sin «Tu canal», «cinco» en letras, versiones, final sin celebración, «Llamadas». | Corregidos los del panel del nombre: el texto nombra los dos botones, «Cancelar» deja elegido el nombre de antes, el foco va al panel y Esc lo cierra (entrada 139). El resto queda para la pasada de interfaz con modo Design. |

## Ronda 3: pasa (0 graves, 3 medios, 19 menores)

La hizo otro agente nuevo, sin contexto de las rondas anteriores, con las correcciones de la ronda 2 y dos instalaciones
limpias. Terminó los dos recorridos sin atascarse. Destaca como bueno que el ritmo que no cabe se avisa y pregunta antes
de aprobarlo, la ayuda «¿Dónde veo mi @?», que cambiar el nombre no toca nada hasta «Usar este nombre» y que Esc o
«Cancelar» lo cierran.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | Lo escrito en «¿Qué cambiarías?» se pierde sin aviso al pulsar «Aprobar». | Corregido después de la ronda (entrada 140). Con algo escrito, «Aprobar» se apaga y un texto dice que se usa con «Proponer otra» o se borra. e2e en `channel-existing.spec.ts`. |
| 2 | Medio | «Editar» y «Editar antes de guardar» dejan la vista al final de un formulario largo. | Corregido después de la ronda (entrada 140). El editor se abre por arriba, con el foco en el primer campo. |
| 3 | Medio | En el panel del nombre, «Nombre elegido» en uno que aún no se usa, el nombre de ahora con «Usar este nombre» y la frase «o dejarlo para más tarde». | Corregido después de la ronda (entrada 140). «Tu nombre ahora» sin botones, «Elegido, aún sin usar» con «Usar este nombre», y sin esa frase. |

**Corregidos también después de la ronda:** en la pregunta del ritmo, el botón destacado es el seguro («Cambiarlo
antes»), y el aviso de ritmo dice qué cambiar («Cambiar algo» o «Editar»). La ayuda de «¿Qué cambiarías?» ya no repite
«Opcional».

**Menores abiertos (pulido, para la pasada de interfaz con modo Design):**
- el aviso de ritmo, pequeño y de poco contraste;
- «cinco» en letras en las horas;
- avisos rojos y botones que se mueven al escribir;
- la flecha atrás del navegador en los asistentes y el paso 1 sin «Volver»;
- recargar en Preguntas borra lo escrito;
- campos de los temas estrechos al editar;
- el foco no vuelve a «Cambiar el nombre» al cerrar el panel;
- nombres distintos para lo mismo («La promesa», «Lo que estamos suponiendo», «su canal», «Proponer otra»);
- un Short con «0,2 veces lo normal» entre los que mejor funcionan;
- «Ver mi perfil actual» no mueve la vista;
- Inicio dice «Crear mi primer canal» a quien ya tiene uno;
- la cabecera del móvil solo con iconos;
- los avisos flotantes duran mucho;
- la descarga no dice el nombre del archivo;
- la versión 1 como «Propuesta de la IA que aprobaste» aunque se cambió antes de elegirla;
- jerga del dinero y de las cifras («Canales pequeños · Abierta», «programa de socios», «AIR Media-Tech», «Llamadas»);
- «Pedir la opinión de la IA»;
- frases sueltas («elige con calma», «cuando empezaste», «todo funciona sin ella»).

**Decidido por el creador:** el documento sigue siendo `.md` (FR-026), con el texto que explica con qué abrirlo
(entrada 145). Los avisos bajo la cabecera, que tocan el design system, quedan aprobados y documentados (entrada 143).
Las correcciones que añaden comportamiento (entradas 138 a 140) las dio por buenas (entrada 147).

Del montaje, no cuenta: la IA simulada habla de cocina, no sigue «¿Qué cambiarías?» y propone 7 horas teniendo 5. La
página de Claude no carga. El navegador de prueba no enseña los diálogos del sistema ni guarda descargas. Ajustes ›
YouTube dice «El lector no está preparado» con el YouTube falso, porque el lector falso no tiene versión; en una
instalación real el instalador lo prepara (paso 8) y la pantalla ya no dice que lee con él si no está.

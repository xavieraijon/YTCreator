# Auditoría de novato: instalar y elegir la IA (T159, SC-008, constitución IX)

**Fecha**: 2026-10-31 · **Método**: el agente `usuario-novato` (`.claude/agents/usuario-novato.md`) hace de Marta, una
persona sin conocimientos técnicos que nunca ha abierto la Terminal. Lee solo la sección «Instalar» del README, pega la
línea de instalación y recorre la aplicación en el navegador integrado, sin leer código ni documentación interna.
**Montaje**: release de desarrollo servida en local (`127.0.0.1:8790`), instalación en una carpeta aislada, aplicación
en el puerto 4331 con la IA simulada (`YTCREATOR_FAKE_AI=ok`). Las páginas reales de Claude y Anthropic no cargan; el
agente usa un código y una clave de prueba como si esas páginas se los hubieran dado. Nada gasta dinero.
**Umbral**: 0 graves y como mucho 3 medios.

## Ronda 1: no pasa (0 graves, 8 medios, 22 menores)

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | El README dice «abre la Terminal» sin decir cómo. | Corregido. Pasos numerados: cómo abrirla en Mac y en Linux, cómo pegar y qué esperar. El instalador termina con «Ya puedes cerrar esta ventana». |
| 2 | Medio | «Recomendado» y «Usa tu suscripción, bajo tu responsabilidad» flotan bajo las dos tarjetas: no se sabe de cuál son. | Corregido. Las etiquetas y una frase visible que explica la responsabilidad van dentro de la tarjeta de la suscripción (`RadioOption.extra`). |
| 3 | Medio | «Conectar» con el código vacío borra el campo y dice «Revisa los campos marcados» sin marcar nada. | Corregido. El campo vacío se marca («Pega aquí el código que te ha dado Claude.»), recibe el foco y no se envía nada. |
| 4 | Medio | Con un código equivocado el campo desaparece y hay que empezar de nuevo. | Corregido. Se pide un código nuevo solo, el campo sigue en su sitio y el mensaje dice «Pulsa «Pedir otro código»…». e2e nuevo. |
| 5 | Medio | «Crear mi primer canal» solo dice «Muy pronto» al pulsarlo. | Corregido. Con una IA en uso, Inicio avisa antes de pulsar: «Crear canales llega muy pronto, en la próxima versión. Tu IA ya está lista para entonces.» |
| 6 | Medio | «Conseguir mi clave» no dice qué hacer en la página de Anthropic ni qué traer. | Corregido. Tres pasos visibles: entrar, «Create Key», copiar el texto que empieza por «sk-ant-». |
| 7 | Medio | «Usar esta opción» en Ajustes no confirma nada: la tarjeta cambia y parece lo contrario. | Corregido. Aviso «Listo. Ahora YTCreator usa «…».», también al terminar el cambio desde la pantalla de conexión. |
| 8 | Medio | Borrar la única cuenta en uso no avisa de que te quedas sin IA, y después sale «Sesión caducada». | Corregido. El diálogo avisa de que te quedas sin IA conectada, y la opción sin cuentas dice «Sin cuenta conectada». |
| 9–30 | Menor | Jerga del instalador, Terminal sin movimiento, repetición al reinstalar, tooltip solo con ratón, título duplicado, «pégalo aquí» sin campo, «enlace» por «código», clave vacía o error que no se va, pantalla de cerrado sin cómo volver, caja roja en Inicio sin IA… | Corregidos el 12 (frase visible), 13, 14, 15, 20, 21 y 27. El resto queda abierto (ver abajo). |

**Menores abiertas de la ronda 1:** jerga del instalador, la Terminal sin señal de avance, el texto repetido al
reinstalar, el título duplicado, «pégalo aquí» sin campo a la vista y la caja roja de Inicio sin IA (debería ser un
aviso ámbar, y eso pide un tono de aviso en `ErrorMessage` del paquete `ui`).

## Ronda 2: pasa (0 graves, 3 medios, 17 menores)

La hizo un agente nuevo, sin contexto de la ronda 1, con la release ya corregida y el mismo montaje. Cubrió el README, la
Terminal, las dos formas de conectar (en el asistente y cambiando desde Ajustes), código y clave erróneos, «Lo haré más
tarde», volver atrás, recargar, borrar una cuenta y una clave, Ajustes, teclado, 375 px, 1280 px, modo oscuro y
«Cerrar YTCreator».

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | Un doble clic en «Empezar» hace que el segundo clic marque «Pagar solo lo que uses» en la pantalla siguiente. | Abierto. |
| 2 | Medio | Al borrar la clave en uso, Inicio dice en rojo «No tienes ninguna IA conectada.» aunque la suscripción sigue guardada y funciona. Marta lo arregla sola con «Usar esta opción». | Abierto. |
| 3 | Medio | «Lo máximo que puede costar una sola operación.» no dice qué es una operación ni si 0,50 € es poco o mucho. | Abierto. |

Del montaje, no cuenta: la IA simulada acepta una clave cortada que empiece por `sk-ant-api03-FAKE`. La aplicación de
verdad comprueba la clave con Anthropic antes de guardarla (en T158 una clave revocada se rechazó), así que una clave
cortada no daría «Funciona».

**Menores abiertas (pulido, no bloquean):**
- «bajo tu responsabilidad» suena a peligro en la opción recomendada;
- «Para quien ya paga Claude Pro o Max» no ayuda a quien no sabe qué plan tiene;
- los pasos de conectar la suscripción desaparecen tras abrir la página de Claude, y recargar vuelve al principio;
- hay dos «Pedir otro código» y pulsarlo no da señal visible;
- «cupo» y «accesos» no se entienden;
- el paso «Límites (no hace falta)» es raro como nombre;
- el pago por uso tiene dos nombres: «Pagar solo lo que uses» y «Pago por uso de Anthropic»;
- en Inicio sin IA, «Conectar una IA» lleva a Ajustes y no al asistente;
- en Ajustes sin IA, dos «Configurar» sin recomendación;
- cambiar el nombre de la cuenta no confirma «Guardado»;
- «Este valor no es válido.» y «Es demasiado alto.» no dicen qué poner;
- con pago por uso, las cuentas de suscripción salen antes que las claves;
- en móvil, la cabecera solo muestra iconos;
- «Descargando el motor» e «Instalando Claude Code» no dicen qué son ni cuánto tardan;
- «(segundos)» repetido en Modo experto;
- el título de la pestaña de cierre es la frase entera.

**Veredicto**: cumple SC-008. La ronda 2 dio 0 graves y 3 medios, en el límite del umbral. Los tres medios quedan
abiertos como mejora.

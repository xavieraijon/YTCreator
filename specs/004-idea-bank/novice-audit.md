# Auditoría de novato: banco de ideas (T065, constitución IX)

**Fecha**: 2026-11-07 · **Método**: el agente `usuario-novato` (`.claude/agents/usuario-novato.md`) hace de una
persona sin conocimientos técnicos con un canal de cocina. Recorre el banco de ideas en el navegador integrado, sin
leer código ni documentación interna. **Montaje**: la aplicación compilada como en el e2e (`apps/server/dist` con
`web/`), en una carpeta aislada del scratchpad, con la IA simulada (`YTCREATOR_FAKE_AI=ok`) y el YouTube falso
(`YTCREATOR_FAKE_YOUTUBE=1`). El canal y su perfil se preparan por la API, como en el e2e. Nada gasta dinero ni usa
YouTube de verdad. **Umbral**: 0 graves y como mucho 3 medios.

## Ronda 1: no pasa (1 grave del montaje, 5 medios, 10 menores)

Puerto 4335. Lucía recorrió todo salvo «Buscar otro enfoque»: con el YouTube falso, las ideas propuestas por la IA
simulada salen todas «Frío».

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Grave (del montaje) | Al abrir la app salía «Aún no has conectado una IA» con la cabecera en «Funciona»; el canal solo aparecía pulsando el logo. | Del montaje: la preparación por la API no terminó la bienvenida y Lucía pulsó «Lo haré más tarde» (`postponed: true`). En la ronda 2 la bienvenida queda terminada. El caso real que deja ver (aplazar y conectar luego desde Ajustes) es de la 002: pendiente P1 de `decisions.md`. |
| 2 | Medio | «Solo hay 0 vídeos casi iguales»; las cifras del nicho y de la idea no cuadran; «Vídeos en inglés» con títulos en castellano. | «Solo hay 0» corregido (decisión 64). Las cifras distintas son dos búsquedas distintas (nicho e idea), y los títulos son del YouTube falso. |
| 3 | Medio | Con un filtro puesto, la idea propia recién guardada no aparecía. | Corregido (decisión 66): guardar quita los filtros. |
| 4 | Medio | «La IA solo propuso ideas que ya tenías… Prueba con alguna indicación», con una indicación ya escrita y sin decir si se cobró. | Corregido (decisión 66). |
| 5 | Medio | «Marcar como hecha» no se podía deshacer. | Corregido (decisión 65): «Volver al banco». |
| 6 | Medio | La idea sin búsquedas parecía no poder medirse; el aviso estaba en «Modo experto». | Corregido (decisión 66): «Medir todas» dice que se puede medir con su título desde su tarjeta, donde está «Medir con el título». |
| 7–16 | Menor | Avisos que se apilan, la página que salta al mover, frases viejas en la región de anuncios, sin texto de «trabajando», nombres de la cola, «Frío» sin color, sin deshacer un descarte, tamaños de botones, vídeos que no se abren, «Ir al banco de ideas» al final de «Tu canal», márgenes en móvil. | Para la pasada de interfaz con modo Design. |

Del montaje, no cuenta: todas las ideas «Frío», ganchos repetidos de la IA simulada, el navegador de prueba no enseña
las descargas.

## Ronda 2: pasa (0 graves, 2 medios abiertos, 19 menores)

2026-11-08. Puerto 4336, y 4337 para repetir «Buscar otro enfoque» en una instalación limpia. La bienvenida queda
terminada por la API. Se comprueban los arreglos de la ronda 1: «Solo hay 0», la idea guardada con filtros, el aviso de
repetidas, «Volver al banco» y medir sin búsquedas están resueltos.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Medio | La portada no lleva al banco de ideas, y «Tu canal» lo deja al final de una página muy larga. | Abierto: pasada de interfaz con modo Design (decisión 68). |
| 2 | Medio | «Buscar otro enfoque» sin variantes nuevas: «ya habías visto», sin decir el coste, y se perdía lo escrito. | Corregido (decisión 67). Lucía lo confirma en la repetición. |
| 3 | Medio | «Próximos vídeos» no enseña el semáforo: una quemada puede quedar la primera sin aviso. | Abierto: pasada de interfaz con modo Design (decisión 68). |
| E1 | Medio | «Proponer otras variantes» abría la petición fuera de la vista y parecía no hacer nada. | Corregido (decisión 67): el cursor va a la petición, y el botón solo sale si la tarjeta puede abrirla. Comprobado por e2e y test de pantalla, no por Lucía. |
| 4–19, E3–E5 | Menor | Botón sin texto mientras la IA trabaja, «consumo» frente a «Incluido en tu suscripción», avisos que se apilan, botones de la cola sin efecto en los extremos, frases repetidas en las tarjetas, entre otros. E2 y E6 repiten los n.º 7 y 5. | Para la pasada de interfaz con modo Design. |

Del montaje, no cuenta: en el primer intento de la ronda no salían variantes porque la IA simulada usa los mismos títulos
en las tandas y en los enfoques, y Lucía ya se había quedado con toda la tanda. En la instalación limpia salen 3 y el
camino entero funciona: verlas, quedarse una, descartar otra, medirla, recargar y doble clic.

Sin ver por Lucía: una segunda tanda de variantes nuevas para la misma idea, que la IA simulada no da, y las descargas,
que cubre `ideas-queue.spec.ts`. El aviso de ideas repetidas con la IA real tampoco se ha visto.

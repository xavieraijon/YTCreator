# Auditoría de novato: `#/muestra` (T103, SC-007, constitución IX)

**Fecha**: 2026-10-26 · **Método**: un agente hace de persona profana (sin experiencia en vídeo ni en IA) y recorre el paso
«Elige el enfoque de tu vídeo» a partir de capturas en orden, en móvil (375 px) y en escritorio (1280 px).
**Umbral**: 0 graves y como mucho 3 medias en el producto.

## Ronda 1: no pasa (2 graves, 6 medias, 8 menores)

Capturas de página completa. Los hallazgos 2, 3 y 7 resultaron ser artefactos de ese tipo de captura: Playwright pinta
los elementos fijos y pegajosos fuera de sitio. Con capturas del tamaño de la pantalla no se reproducen.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Grave | Tras la propuesta no hay forma de seguir. El aviso habla del guion, pero el único botón es «Generar propuesta» otra vez. | Corregido. Con la propuesta lista, el botón principal es «Seguir al guion». |
| 2 | Grave | En móvil, el botón pegajoso tapa el campo del público. | Artefacto de la captura de página completa. El contenido se desplaza por debajo de la barra y se alcanza entero. |
| 3 | Media | En móvil, con el modo experto abierto, el botón y el «?» tapan los controles. | Artefacto (igual que el 2). |
| 4 | Media | La primera frase es una pregunta con «Empezar con una pregunta» apagado. | Corregido. La frase de ejemplo sigue al interruptor, y el e2e lo comprueba. |
| 5 | Media | No queda claro qué hace volver a generar ni si se pierden los cambios. | Corregido. «Probar otra propuesta» es secundario, va dentro de la propuesta y avisa de que la sustituye. |
| 6 | Media | La navegación del catálogo es técnica y en inglés. | Fuera del producto: es el envoltorio del catálogo, no la aplicación. Se clasifica aparte. |
| 7 | Media | En móvil, la cabecera aparece en mitad de la pantalla. | Artefacto (igual que el 2). |
| 8 | Media | En móvil, mientras se genera, el aviso de trabajo queda lejos y el botón solo muestra un indicador. | Corregido. La espera y la propuesta se desplazan a la vista al aparecer. |
| 9–16 | Menor | Redacción de «enfoque», «Modo experto» intimida, Stepper recortado, aviso sobre el selector de tema, título recortado en móvil, columnas estrechas, colores del panel de trabajo… | El título recortado se corrigió en la ronda 2. El resto queda como pulido (ver abajo). |

## Ronda 2: pasa (0 graves, 3 medias, 9 menores)

Hecha por un agente nuevo, sin contexto de la ronda 1, con 12 capturas del tamaño de la pantalla.

| # | Gravedad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| 1 | Media | «¿A quién va dirigido?» no dice si es obligatorio ni qué pasa si se deja vacío. | Corregido después de la ronda. Se marca «(opcional)» y la ayuda dice «Si lo dejas vacío, se piensa para todo el mundo». |
| 2 | Media | En móvil, el título de la propuesta se corta en una línea. | Corregido después de la ronda. Ahora es un área de texto de dos líneas que se lee entera, comprobado en captura. |
| 3 | Media | No hay forma visible de volver al paso anterior. | Abierto. La muestra es un único paso con datos de prueba. La navegación entre pasos es del flujo real (features de onboarding en adelante). |

**Menores abiertas (pulido, no bloquean):**
- el botón en carga solo muestra el indicador y no hay cancelar;
- «Modo experto» no anticipa qué contiene;
- el «?» flotante roza bordes;
- los avisos apilados ocupan mucho en móvil;
- el estado apagado del interruptor se lee poco.

**Corregidas en la revisión estética (T106–T110, 2026-10-27):** el Stepper ya no recorta etiquetas y en móvil nombra el
paso actual; el borde del panel de trabajo es continuo y más grueso; las tarjetas de enfoque usan todo el ancho.

**Fuera del producto (menores):** la barra lateral del catálogo, el selector de tema sin rótulo en móvil y el aviso «Fin de la muestra».

**Veredicto**: cumple SC-007. La ronda 2 dio 0 graves y 3 medias, y dos de esas medias se corrigieron después.

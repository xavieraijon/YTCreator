# Matriz de riesgo de YTCreator

Dice cuándo el agente actúa solo y cuándo para. La aplica la Puerta A (`/puerta-a`) y se usa al clasificar cada entrada
de `specs/NNN-nombre/decisions.md`. Principio XI de la constitución.

## Bajo: actúa y registra como «agente»

Errores triviales sin efecto funcional, nombres internos, refactor local con tests, mejoras de mensajes de log o de
documentación técnica.

## Medio: actúa, registra y destácalo en el informe

Cambios que cruzan paquetes pero respetan la spec; cambios en textos de interfaz (siempre en catálogos i18n, sin jerga y
con el glosario pasando); elección entre dos implementaciones equivalentes.

## Alto: para y pregunta

Si el creador no está, la tarea queda pausada y documentada, y se sigue con lo independiente.

- Cualquier **llamada a IA real o a YouTube real**, o gasto de cuota o dinero. Los tests no los usan nunca;
  `test:real-youtube` solo con la clave y la aprobación del creador, y con estimación de unidades antes (una búsqueda de
  la Data API cuesta 100).
- Todo lo que **publique, suba o envíe** algo fuera de la app (principio II).
- **Secretos**: claves nuevas, ampliar los sitios donde se permite `Secret.reveal()`, tocar el llavero o logs que puedan
  incluir URLs o cabeceras.
- **Alcance**: síntesis de voz, imágenes, vídeo, montaje o subida automática (fuera de la v1, principio VIII), o
  cualquier funcionalidad sin spec aprobada.
- **Constitución**: cualquier cambio de principio, versión o alcance, o una excepción en «Complexity Tracking».
- **Dependencias nuevas** (principio X): exigen justificación en el plan y visto bueno del creador.
- **Design system**: tokens, variantes, aspecto o cualquier cosa que el creador ya aprobó visualmente.
- **Datos del creador**: migraciones SQLite destructivas, borrado o cambio del formato de exportación. Nunca se tocan
  `~/YTCreator`, `~/ytc-prueba` ni el puerto 4310; se trabaja con `.dev-home`.
- **Git**: ni `push` ni PR por iniciativa propia; solo cuando el creador lo pida para cerrar la feature.
- Cualquier opción que **muestre jerga** o haga **depender lo básico del Modo experto**.

## Regla anti-asunción

- Lo que la spec no decide no se rellena con suposiciones: esa tarea se para, se registra en «Pendientes del creador» y
  se sigue con lo independiente. Si el hueco es de la spec, se propone `/speckit-clarify`.
- Un requisito no se omite alegando seguridad, coste o rendimiento: se implementa y se dice la objeción. Solo se para si
  es peligroso de verdad.
- No se añade comportamiento no pedido: una mejora útil va al backlog (principio VIII), no a la feature.
- El agente solo decide lo trivial, reversible y sin efecto visible para el creador.

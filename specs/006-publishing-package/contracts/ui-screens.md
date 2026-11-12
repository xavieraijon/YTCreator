# Contrato: pantallas del paquete de publicación

**Feature**: `006-publishing-package` | Decisiones en [research.md](../research.md) R12 a R14 y R19

Todo con `@ytcreator/ui`, sin componentes nuevos. Textos en `apps/web/src/strings/publish.es.ts`, con el test de
glosario. El aspecto se revisa en la pasada final con el modo Design: aquí cuenta que funcione y sea accesible.

**La palabra «brief»**: no se usa en la interfaz. Se dice «idea de miniatura» y, en la descarga, «Indicaciones para la
miniatura». «Etiquetas» y «capítulos» son los nombres que usa YouTube Studio y se explican la primera vez.

## Entrada

- **Guion aprobado** (`ReviewStep` de la 005): «Preparar la publicación» como acción principal. Con paquete empezado,
  «Seguir con la publicación»; aprobado, «Ver la publicación».
- **Cola del banco**: con el paquete aprobado, la etiqueta «Lista para publicar».
- **Pantalla del canal**: enlace «Mis publicaciones», junto a «Mis guiones».

## Lista (`/canal/publicaciones`)

- **Por qué importa**: «Aquí tienes lo que vas a copiar en YouTube al subir cada vídeo.»
- Una `Card` por paquete: título principal (o de trabajo), formato, estado, último cambio y «Abrir».
- Sin guiones aprobados: `EmptyState` que explica que primero hay que aprobar un guion, con «Ir a mis guiones».
- «Descargar todos» y «Ajustes de publicación».

## Paquete (`/canal/publicaciones/:id`)

`Stepper`: **Título y miniatura → Descripción → Revisar y copiar**. En un Short: **Título y portada → Descripción →
Revisar y copiar**. Cada paso tiene una acción principal, que cambia según el estado. Los avisos calculados salen arriba,
cada uno con su acción («Pedir de nuevo · {coste}», «Usar la nueva», «Ir al guion»).

### Título y miniatura

- **Por qué importa**: «La gente ve el título y la miniatura juntos, y en un segundo decide si pulsa.»
- Lo medido en la 004, como dato con su fecha (`DataSource`), si existe.
- Candidatos: texto editable, motivo con `DataSource` «Opinión de la IA», bloque del guion del que sale, número de
  caracteres y aviso si se corta en el móvil o pasa del máximo. `RadioGroup` «Principal» y `Checkbox` «Probar también»
  (hasta 2). «Escribir uno mío».
- Conceptos de miniatura: `Card` con qué se ve, texto grande, emoción, composición, colores y título con el que casa;
  `Checkbox` «Elegir» (hasta 3), editar. Explica que YouTube puede probar hasta tres y quedarse con la que más funcione.
- En un Short, en su lugar, la portada sugerida: el momento del guion y el texto en pantalla, con una frase que dice que
  la portada se elige en la app de YouTube del móvil.
- Acciones: «Proponer títulos · {coste}», «Proponer miniaturas · {coste}» (con el principal elegido), «Pedir otros» con
  indicaciones.
- **Principal**: según el estado: proponer títulos, proponer miniaturas, «Aprobar título y miniatura».

### Descripción

- **Por qué importa**: «Las dos primeras líneas son lo único que se ve sin pulsar "más": di de qué va el vídeo con las
  palabras que busca la gente.»
- Partes editables: primeras líneas, cuerpo, capítulos (nombre y minuto; el minuto calculado lleva «estimado», con una
  frase: «Ajústalos cuando tengas el vídeo montado»), fuentes (solo lectura, de la lista de hechos), hashtags (solo en un Short), parte fija
  (enlace a «Ajustes de publicación»). Etiquetas y comentario fijado, aparte.
- Cada parte tiene «Pedir de nuevo · {coste}» con indicaciones.
- **Principal**: «Proponer descripción · {coste}» y, con todo escrito, «Aprobar descripción».

### Revisar y copiar

- **Por qué importa**: «Copia cada parte en YouTube Studio en este orden. Lo que YouTube no acepta te lo avisamos antes.»
- Avisos de la revisión, cada uno con su motivo y un enlace a la pieza.
- Piezas en el orden de YouTube Studio (título, descripción montada, miniatura, etiquetas, comentario fijado), cada una
  con «Copiar» y un `Toast` «Copiado». Si el navegador no deja, el texto queda seleccionado con la frase «Pulsa Ctrl+C
  (⌘C en Mac) para copiarlo».
- Lista guiada de YouTube Studio: cuatro `Checkbox` con la respuesta para el canal y el porqué.
- Descargas: «Descargar todo» y «Descargar las indicaciones para la miniatura».
- **Principal**: «Aprobar la publicación». Con avisos, un `Dialog` dice cuántos quedan y deja aprobar igual. Con el guion
  sin aprobar, el botón está apagado y una frase lo explica.

### Historial

- Por pieza, como en la 005: versiones con fecha y origen, comparar con la actual y «Volver a esta versión».

## Ajustes de publicación (`/canal/publicaciones/ajustes`)

- Parte fija: `TextArea` con el valor por defecto y su explicación; si falta el nombre del canal en YouTube, cómo añadirlo.
- Categoría: `Select` con la sugerida marcada como tal.
- Aviso: «Cambiarla no toca las publicaciones que ya tienes.»

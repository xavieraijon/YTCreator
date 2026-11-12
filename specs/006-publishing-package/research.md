# Research: Paquete de publicación

**Feature**: `006-publishing-package` | **Date**: 2026-11-12

Cada entrada dice qué se decide, por qué y qué se descartó. Lo que cruza varias entradas está en
[data-model.md](./data-model.md) y en [contracts/](./contracts/). Se reutiliza todo lo que la 005 ya resolvió: versiones
completas (R1 de la 005), estado calculado (R2), trabajos en segundo plano (R12), dos pestañas (R18) e interfaz sin
componentes nuevos (R19).

## R1. Un paquete por guion, con piezas versionadas por separado

- **Decisión**: `publish_package` (uno por guion) y `package_version`, con una foto JSON completa por cambio y numerada
  por tipo de pieza (`kind` + `version`): `titulos`, `miniaturas`, `portada_short`, `descripcion`, `capitulos`,
  `etiquetas` y `comentario`.
- **Motivo**: FR-011 pide pedir de nuevo una sola parte sin tocar las demás (SC-005). Si cada parte tiene su propia
  versión, la regeneración solo escribe en su tipo y las otras quedan idénticas por construcción. El historial (US5) se
  ve por pieza, como pide la spec. Es el mismo patrón que `script_version`.
- **Descartado**: una sola versión con todo el paquete (una edición en las etiquetas crearía una versión de la
  descripción, y comparar sería más ruidoso); una tabla por pieza (siete repos iguales).

## R2. Tres aprobaciones y un estado calculado

- **Decisión**: el paquete guarda qué versiones se aprobaron en cada paso, como un mapa `kind → version`:
  - **Portada** (US1): `titulos` y `miniaturas`; en un Short, `titulos` y `portada_short`.
  - **Textos** (US2): `descripcion`, `capitulos` (no en Short), `etiquetas` y `comentario`.
  - **Paquete** (US3): todas, más la fecha, el número de avisos que quedaban y la versión del guion.

  El estado que ve el creador sale de una función pura (`packageStatus`): un paso está aprobado si la última versión de
  cada una de sus piezas coincide con la aprobada.
- **Motivo**: como en la 005, una columna de estado se desincroniza. Editar una pieza crea una versión que ya no coincide,
  de modo que «vuelve a borrador» (FR-015, US5 escenario 3) sale solo.
- **Orden**: «Proponer descripción» exige la portada aprobada, porque la descripción se escribe para el título principal.
  Aprobar el paquete exige los dos pasos aprobados y el guion aprobado.
- **Descartado**: una sola aprobación al final (la spec aprueba títulos y miniatura antes de la descripción, US1
  escenario 6).

## R3. Los capítulos: nombres de la IA, minutos del dominio

- **Decisión**: la IA solo propone el **nombre** de cada capítulo y qué bloques del guion agrupa. El minuto lo calcula
  `chapterTimes()` en `core`: la suma de `durationSeconds()` (R11 de la 005) de los bloques anteriores, al ritmo del canal.
  El primero es siempre 0:00. Un capítulo más corto que el mínimo de YouTube se junta con el siguiente en la propuesta.
- **Edición**: el creador puede cambiar nombre y minuto a mano. Un minuto editado queda marcado `manual` y deja de
  recalcularse. Un minuto calculado lleva la etiqueta de estimación (principio II, dato frente a estimación).
- **Para la 007**: cada capítulo guarda sus `blockIds`, de modo que la 007 podrá poner el minuto real del primer bloque
  de cada capítulo cuando tenga el audio. Esta feature no implementa ese ajuste (decisión 1 de la spec).
- **Motivo**: SC-003 exige el 100 % de capítulos válidos. Si los minutos los diera la IA, dependería de ella; con una
  función pura se garantiza y se prueba.
- **Descartado**: que la IA dé los minutos (puede equivocarse en las sumas); minutos solo manuales (más trabajo para el
  novato).

## R4. Las fuentes de la descripción las pone el dominio

- **Decisión**: la IA no escribe enlaces. `descriptionSources()` toma de la última versión de hechos que usó el guion
  aprobado los enlaces con `link = abre` y las referencias escritas del creador, sin repetir dominio y enlace, y los
  pone en el apartado de fuentes. La salida de la IA se rechaza si contiene una dirección web (`http`, `www.`), salvo la
  del vídeo largo en un Short (R9).
- **Motivo**: SC-004 exige el 100 %, y FR-008 prohíbe enlaces que no estén en la lista. Mejor imposible que vigilado.
- **Sin hechos o sin enlaces**: el apartado no aparece y la pantalla lo dice (caso límite de la spec).

## R5. La descripción se monta, no se escribe entera

- **Decisión**: la versión `descripcion` guarda las partes por separado: `firstLines`, `body`, `hashtags` y una copia de
  la parte fija del canal en ese momento (`fixedText`). El texto que se copia lo monta `assembleDescription()` en este
  orden: primeras líneas, cuerpo, capítulos, fuentes, hashtags y parte fija.
- **Motivo**: cada parte se puede editar y pedir de nuevo por separado, y la revisión mide el total sin depender de la
  IA. Guardar la copia de la parte fija cumple FR-010: cambiarla en los ajustes no altera los paquetes ya hechos; sale el
  aviso `parte_fija_cambiada`, con «Usar la nueva», que crea una versión `edicion`.
- **Hashtags**: solo en los Shorts, hasta 3 (FR-018), que son los que YouTube enseña encima del título; la revisión
  avisa si hay más. En un vídeo largo la spec no los pide: el campo queda vacío y no se propone (regla anti-asunción).

## R6. La parte fija por defecto

- **Decisión**: `channel_publish_settings` guarda `fixed_text` (≤ 1.500 caracteres). Sin fila, el valor por defecto es
  «Suscríbete para no perderte el próximo vídeo: https://www.youtube.com/@{handle}?sub_confirmation=1», con el `handle`
  del perfil de la 003. Si el perfil no tiene `handle`, el valor por defecto está vacío y la pantalla dice cómo añadirlo.
- **Motivo**: es lo que hacía el proyecto de referencia y lo que dice la Assumption de la spec. El enlace sale de un dato
  del creador, no de la IA.
- **Riesgo**: el enlace no se comprueba (no hay llamadas a YouTube, decisión 3); se construye con el formato del
  `handle`, que ya valida la 003.

## R7. Lo medido en la 004, la única fuente de datos de YouTube

- **Decisión**: los usos `titulos` y `etiquetas` reciben, si la idea tiene una medida `medida`, su `queries`, su
  veredicto y hasta 10 títulos de `similar_videos`, como **ejemplo de qué evitar copiar**. Sin medida, se escriben sin
  ese dato y la pantalla no lo oculta. No hay llamadas nuevas a YouTube (FR-021, decisión 3).
- **Motivo**: la búsqueda de la idea es lo que la gente escribe; meterla en las primeras líneas y en las etiquetas
  ayuda a que lo encuentren, sin coste.
- **Dato frente a opinión**: el motivo de cada título lleva `DataSource` «Opinión de la IA»; la búsqueda medida se
  enseña como dato con su fecha.

## R8. Títulos que no prometen lo que el guion no cuenta

- **Decisión**: cada título propuesto trae `blockId`, el bloque del guion que cumple su promesa. La salida no valida si el
  bloque no existe. La pantalla enseña de qué bloque sale. Los títulos escritos por el creador no lo necesitan.
- **Motivo**: FR-005 no se puede comprobar del todo sin IA; pedir el bloque obliga al modelo a anclarse en el guion y deja
  al creador comprobarlo en un clic.
- **Miniaturas**: cada concepto trae `titleIndex`, el título con el que casa, y el prompt pide que **no repita** las
  palabras del título (la revisión avisa si el texto grande comparte más de la mitad de sus palabras con el título
  principal).

## R9. El paquete de un Short sale en una sola petición

- **Decisión**: el uso `paquete_short` devuelve de una vez títulos, descripción breve, hasta 3 hashtags, etiquetas,
  comentario y la portada sugerida (`blockId` del momento y texto en pantalla). Se guardan como versiones separadas de
  cada tipo, con origen `ia`. Pedir de nuevo los títulos usa `titulos`, y cualquier otra parte, `parte_paquete`, igual que en un vídeo largo.
- **Short sacado de un vídeo largo**: la descripción lleva el título principal del paquete del vídeo largo si existe, y si
  no, el título de trabajo de su idea. No lleva enlace (aún no hay URL; la app no la conoce): la pantalla recuerda que se
  enlaza con «Vídeo relacionado» al subirlo (US4 escenario 3).
- **Motivo**: un Short no tiene capítulos ni conceptos de miniatura; separar en cuatro peticiones lo encarecería.

## R10. Usos de IA

- **Decisión**: cinco usos nuevos, con prompt `v1`, salida Zod y perfil: `titulos`, `miniaturas`, `descripcion` (la
  propuesta inicial de descripción, capítulos, etiquetas y comentario, en una petición), `parte_paquete` (una sola parte:
  `descripcion`, `capitulos`, `etiquetas`, `comentario` o `portada_short`, con indicaciones) y `paquete_short`.
  Detalle en [contracts/ai-uses.md](./contracts/ai-uses.md).
- **Motivo**: una petición por paso de la spec; `parte_paquete` cubre FR-011 sin multiplicar usos.
- **Escritura**: todos llevan `writing/human.md` (no es texto hablado). El comentario fijado, también.
- **Sin internet**: ninguno busca. Sin capacidades nuevas en el puerto.

## R11. Conocimiento versionado

- `packages/knowledge/publish/youtube.json`: límites y reglas de YouTube con fuente oficial y fecha: título (100
  caracteres), descripción (5.000), etiquetas (500 en total), capítulos (el primero en 0:00, al menos 3, de 10 s como
  mínimo), hashtags (los 3 primeros se ven encima del título; más de 60 se ignoran), «Probar y comparar» (hasta 3
  miniaturas y 3 títulos). Cada cifra se comprueba en la ayuda oficial al escribir el paquete; la que no se pueda abrir
  no se cita y queda como supuesto.
- `packages/knowledge/publish/craft.json`: oficio de títulos, miniaturas, descripciones y comentarios. El corte de un
  título en el móvil (unos 70 caracteres) no tiene fuente oficial: `assumption: true`.
- `packages/knowledge/publish/studio.json`: la lista guiada (R12), con las fuentes de la ayuda de YouTube sobre contenido
  alterado o sintético e idioma. Usa `made-for-kids.json` sin copiar sus cifras.
- **Motivo**: principio V. Las cifras no se repiten en el código ni en los prompts: se inyectan.

## R12. La lista guiada de YouTube Studio

- **Decisión**: `studioChecklist()` calcula, sin IA, cuatro ajustes con su respuesta y su motivo:
  - **Público infantil**: del perfil (`audience.madeForKids`), con las implicaciones de `made-for-kids.json`.
  - **Contenido alterado o sintético**: la regla de `studio.json` y una pregunta al creador («¿Has usado voz o imágenes
    realistas generadas con IA?»), sin respuesta por defecto: la app no lo sabe.
  - **Idioma**: español, con la variante de `audience.region` del perfil.
  - **Categoría**: la que el creador elige una vez por canal en `channel_publish_settings.category`, de la lista de
    `studio.json`. Sin elegir, se sugiere «Educación» marcada como supuesto, como en el proyecto de referencia.
- Las marcas de «hecho» se guardan en `publish_package.studio_done` (lista de claves). No crean versión: son una ayuda, no
  contenido generado (FR-017).
- **Descartado**: que la IA conteste (es un dato del creador y del perfil, no una opinión).

## R13. Revisión sin IA

- **Decisión**: `reviewPackage()`, función pura en `core`, con las reglas de FR-012 más dos de oficio: título por encima
  del máximo o del corte en móvil, descripción por encima del máximo, capítulos sin 0:00, menos de 3 o alguno corto,
  etiquetas por encima del límite, más de 3 hashtags en un Short, parte fija ausente, miniatura que repite el título (R8) y pieza
  vacía. Se calcula en el navegador con los paquetes que manda el servidor, como `reviewScript()`.
- **Motivo**: SC-007 (menos de 1 s) y FR-019 (sin IA).
- **Pieza vacía**: impide aprobar (caso límite de la spec); el resto, no (FR-013).

## R14. Copiar

- **Decisión**: `navigator.clipboard.writeText` con el texto montado. Si falla (permiso, contexto no seguro en un VPS sin
  HTTPS), el texto se selecciona en un `TextArea` de solo lectura y la pantalla dice cómo copiarlo con el teclado. La
  confirmación usa el `Toast` existente. Copiar no se registra en el servidor.
- **Formato**: texto plano; los capítulos como `m:ss Nombre` (o `h:mm:ss` desde una hora), uno por línea, que es lo que
  YouTube reconoce; las etiquetas separadas por comas.

## R15. Descargas

- **Decisión**: por paquete, `md` y `json`, y el brief de miniatura como un `md` aparte (`?format=brief`), pensado para
  pasárselo a un diseñador (sin datos del canal que no hagan falta). De todos los paquetes del canal, `md` y `json`. No se
  toca ninguna exportación existente (como R17 de la 005).

## R16. Cambios en el guion después de empezar

- **Decisión**: el paquete guarda la versión del guion aprobado con la que se hizo cada pieza (`draft_version` en cada
  versión). Avisos calculados: `guion_cambiado` (la versión aprobada del guion ya no es la usada), `guion_sin_aprobar` (el
  guion volvió a borrador: no se puede aprobar el paquete), `titulo_cambiado` (las miniaturas o la descripción se
  hicieron para otro título principal) y `parte_fija_cambiada`.
- **Rehacer**: cada aviso ofrece pedir de nuevo la pieza afectada, con el coste a la vista. Nada cambia solo.

## R17. Entrada y estado de la idea

- **Decisión**: `IdeaView.script` gana `packageStatus` (o `null`). La cola de la 004 muestra «Lista para publicar» si el
  paquete está aprobado. El guion aprobado muestra «Preparar la publicación» como acción principal (FR-001); con paquete
  empezado, «Seguir con la publicación». No cambia ningún estado de la idea (su paso a «hecha» sigue siendo manual).
- **Motivo**: es aditivo; no rehace `idea` ni `script`.

## R18. Trabajos y dos pestañas

- Como la 005: `background_job` con `kind = 'ia'`, `publish_package.job_id` y `job_op`; un trabajo a la vez por paquete
  (409 `en_curso`). Cada escritura lleva `baseVersion` y responde 409 `version_cambiada` si otra pestaña guardó antes.

## R19. Interfaz

- **Decisión**: sin componentes nuevos en `@ytcreator/ui`. La elección de títulos usa `RadioGroup` (principal) y
  `Checkbox` (alternativos); las miniaturas, `Card` con `Checkbox`; la lista guiada, `Checkbox`; copiar, `Button` +
  `Toast`. Si hiciera falta un componente nuevo, se para y se pregunta (riesgo alto).

## R20. Lo que sale de la app

- **Decisión**: nada. Ni subida, ni publicación, ni llamadas a YouTube (FR-016, FR-021). Copiar y descargar son acciones
  explícitas del creador. A la IA va el guion, la idea, el perfil y lo medido en la 004, como en la 005; ningún secreto.

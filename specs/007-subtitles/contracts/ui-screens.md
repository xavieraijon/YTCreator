# Contrato: pantallas de los subtítulos

**Feature**: `007-subtitles` | Decisiones en [research.md](../research.md) R3, R7, R10, R13, R15 y R18

Todo con `@ytcreator/ui`, sin componentes nuevos salvo que se pregunte antes (R18). Textos en
`apps/web/src/strings/subtitles.es.ts`, con el test de glosario. El aspecto se revisa en la pasada final con el modo
Design: aquí cuenta que funcione y sea accesible.

**Palabras**: «subtítulos» (no «transcripción»), «el programa que escucha el audio» (no «motor» ni «modelo» fuera de
«Modo experto»), «fichero de subtítulos» (no «SRT»). «Capítulos» y «minuto real» como en la 006.

## Entrada

- **Guion aprobado** (`ReviewStep` de la 005): «Hacer los subtítulos» como acción secundaria, junto a la publicación;
  con subtítulos, «Ver los subtítulos» y su estado.
- **Paquete de la 006**: en el paso de textos, junto a los capítulos estimados, «Poner los minutos reales» si hay
  subtítulos; si no, una línea: «Cuando tengas el vídeo montado, haz los subtítulos y los minutos serán los reales».

## Subtítulos (`/canal/subtitulos/:scriptId`)

**Por qué importa** (arriba, una frase): «Mucha gente ve los vídeos sin sonido: con subtítulos se entera de todo y se
queda más.»

### 1. Elegir el fichero (sin subtítulos)

- Acción principal: «Elegir el vídeo o el audio».
- Debajo: «Lo escucha tu propio equipo: el vídeo no sale de aquí y no cuesta nada».
- La primera vez, antes de elegir: «Para escuchar el audio hace falta descargar una vez un programa de unos 580 MB»,
  con «Descargarlo» como acción principal y el avance mientras baja. En «Modo experto», el modelo y su tamaño.
- Tras elegir: el nombre del fichero, su duración, «Tardará unos N minutos» (R7) y «Empezar». Si el navegador no puede
  leerlo: «Este fichero no se puede leer aquí. Exporta solo el audio desde tu editor (MP3, WAV o M4A) y elígelo».
- En un Short, si dura más de lo que admite YouTube, el aviso de la 005 antes de «Empezar».

### 2. En marcha

- La barra de avance con texto («Preparando el audio…», «Escuchando: 40 %»), anunciada con `role="status"` sin repetir
  cada paso.
- «Puedes seguir con otra cosa o cerrar: te esperamos aquí con los subtítulos».
- «Parar» (secundaria), con confirmación.
- En cola: «Hay otros subtítulos en marcha. Estos empiezan cuando terminen».

### 3. Revisar

- Acción principal según el estado: «Aprobar los subtítulos» (borrador) o «Descargar los subtítulos» (aprobados).
- Filtro «Para revisar (N)» / «Todos».
- Una lista de subtítulos: tiempo de inicio, texto y sus marcas en palabras («Escrito como en tu guion; se oyó
  “…”», «No se oyó bien», «Se lee demasiado rápido», «Cambio de la IA: …»). Cada uno con «Oír», «Editar» y, en el
  menú, «Partir aquí», «Juntar con el siguiente» y «Dar por revisado».
- Editar: el texto (hasta 2 líneas, o 1 en un Short) y el inicio y el fin como `m:ss,d`, con el aviso de límites en
  llano si se pasa, sin bloquear.
- «Cambiar en todos»: «Cambiar» y «por», con «Se cambiarán N subtítulos» antes de confirmar.
- «Revisar con la IA» (secundaria): el coste antes, como en la 005; al terminar, cada cambio con el texto de antes, su
  motivo y «Aceptar» / «Rechazar», más «Aceptar todos».
- «Historial»: las versiones con su origen dicho para personas y «Volver a esta».
- Plegado, «Elegir otro fichero» (US5) y «Borrar el audio de este equipo» (R16).
- Con un paquete de vídeo largo: «Minutos reales de los capítulos» (abajo).
- Si el guion cambió después: «El guion ha cambiado desde que se hicieron estos subtítulos» con «Elegir el fichero de
  nuevo».

### Teclado

- `Tab` recorre los subtítulos; dentro de uno, `Enter` edita, `Espacio` oye ese trozo (sin edición abierta), `Escape`
  cierra la edición sin guardar. Siguiente y anterior sin ratón. El foco vuelve al subtítulo al cerrar.
- La reproducción respeta `prefers-reduced-motion`: sin desplazamiento animado al pasar al siguiente.

### Minutos reales de los capítulos

- Una tabla: capítulo, minuto estimado, minuto real (o «No aparece en el audio») y diferencia, con una casilla por fila;
  marcadas por defecto las que cambian, salvo las escritas a mano.
- «Poner los minutos marcados» (principal). Si el paquete estaba aprobado: «Tu publicación volverá a borrador y tendrás
  que aprobarla otra vez», antes de confirmar.
- «No aparece en el audio»: escribirlo a mano o dejarlo como está.

## Errores

Los de [speech-recognizer](./speech-recognizer.md) y los de la API, cada uno con qué ha pasado y un botón para
arreglarlo.

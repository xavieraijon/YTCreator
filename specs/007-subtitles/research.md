# Research: Subtítulos

**Feature**: `007-subtitles` | **Date**: 2026-11-14

Cada entrada dice qué se decide, por qué y qué se descartó. Lo que cruza varias entradas está en
[data-model.md](./data-model.md) y en [contracts/](./contracts/). Se reutiliza lo que ya resolvieron la 003 (binario
externo fijado y comprobado, `reader-update.ts`), la 005 (versiones completas, estado calculado, trabajos en segundo
plano) y la 006 (capítulos ligados a bloques, vuelta a borrador del paquete).

## R1. El motor: whisper.cpp fijado, descargado al primer uso

- **Decisión**: `whisper-cli` de whisper.cpp en una versión fijada (la etiqueta de compilación `b5454`, publicada con la
  v1.9.5 el 2026-10-06), descrita en `installer/versions.json` como `whisperCpp`, con dirección y SHA256 por sistema:
  - **Linux** (`linux-x64`, `linux-arm64`): los paquetes oficiales `whisper-bin-ubuntu-*.tar.gz` de esa versión. Traen
    `whisper-cli` y sus bibliotecas (`libwhisper.so`, `libggml*.so`); se ejecuta con `LD_LIBRARY_PATH` en su carpeta.
  - **macOS** (`darwin-arm64`, `darwin-x64`): whisper.cpp no publica un programa para Mac (solo un `xcframework`). Un
    flujo aparte, `.github/workflows/whisper-macos.yml` (se lanza a mano), lo compila desde la misma etiqueta en
    ejecutores de macOS (Apple Silicon con Metal incrustado; Intel solo con CPU), enlazado de forma estática, y lo
    publica una sola vez en una versión propia del repositorio, `whisper-cpp-b5454`. `versions.json` fija esas
    direcciones y sus SHA256, como las de `yt-dlp` (decisión 5 del creador). No se compila en cada versión de YTCreator:
    `versions.json` no puede conocer de antemano el SHA256 de lo que se compila en esa misma versión.

  La app lo descarga la primera vez que el creador hace subtítulos (decisión 1), con el patrón de
  `reader-update.ts`: fichero temporal, comprobación del SHA256 y solo entonces se pone en su sitio en
  `APP_HOME/bin/whisper/`. Nunca «la última versión».
- **Motivo**: es el binario que fija la constitución (restricciones técnicas); funciona sin conexión y sin coste. El
  patrón de descarga fijada ya está probado con `yt-dlp`.
- **Descartado**: Homebrew en Mac (rompe la instalación de un paso, principio VII; decisión 5); compilar en el equipo del
  creador (exige herramientas de desarrollo); un módulo nativo de Node (otra dependencia con compilación propia); los
  subtítulos automáticos de YouTube (exigen subir antes el vídeo y fallan en lo que la spec quiere arreglar).

## R2. El modelo de voz

- **Decisión**: por defecto `ggml-large-v3-turbo-q5_0.bin` (unos 574 MB), del repositorio oficial de modelos de
  whisper.cpp en Hugging Face, fijado por commit y SHA256 en `installer/versions.json` (`whisperModels`). En
  «Modo experto», `ggml-small-q5_1.bin` (unos 190 MB) para equipos lentos. Además, el modelo Silero de detección de voz
  (`ggml-silero-v6.2.0.bin` de `ggml-org/whisper-vad`, menos de 1 MB) para saltar silencios y música. Se descargan al primer uso a `APP_HOME/models/`,
  diciendo antes cuánto ocupan, y la descarga se retoma con `Range` si se corta (FR-002).
- **Motivo**: `large-v3-turbo` es el que mejor reconoce el español con una velocidad razonable; la cuantización `q5_0`
  reduce a un tercio el tamaño con poca pérdida. La detección de voz evita que el modelo invente texto en silencios o en
  la música, el fallo más conocido de Whisper.
- **Descartado**: `medium` o `large-v3` completos (1,5 a 3 GB y más lentos); `base` o `tiny` (fallan en nombres y
  cifras, justo lo que la spec quiere corregir).
- **A comprobar en la prueba real**: que el modelo por defecto cumple SC-001 en un portátil corriente. Si no, el plan
  cambia el defecto a `small` y queda en `decisions.md`.

## R3. El audio sale del vídeo en el navegador

- **Decisión**: el navegador convierte el fichero que elige el creador en un WAV PCM de 16 bits, mono y 16 kHz (lo que
  pide whisper.cpp) con **mediabunny** (MPL-2.0, `Conversion` con `video: { discard: true }` y
  `audio: { numberOfChannels: 1, sampleRate: 16000 }`), leyendo el fichero por trozos con `BlobSource`, y sube solo ese
  audio: unos 1,9 MB por minuto. Antes comprueba con `canDecode()` que el navegador puede leer la pista de audio; si no,
  le pide al creador que exporte solo el audio desde su editor (MP3, WAV o M4A). El código se carga solo en la pantalla
  de subtítulos (`import()` diferido). Decisión 4 del creador.
- **Motivo**: el vídeo (cientos de MB) nunca sale del navegador, así que FR-019 se cumple por construcción y en un VPS
  la subida es pequeña. No hace falta otro binario (ffmpeg), que la constitución no admite.
- **Descartado**: ffmpeg en el servidor (enmienda de la constitución, subida del vídeo entero; decisión 4);
  `decodeAudioData` del navegador (carga el fichero entero en memoria); exigir siempre un fichero de audio (un paso más
  para el novato).
- **Dependencia nueva** (principio X): resuelve la lectura de MP4, MOV, WebM, MKV, MP3, WAV, M4A y otros con las APIs
  WebCodecs del navegador. Alternativa sin ella: un demultiplexor propio por formato, mucho más código. Mantenimiento:
  versión fijada, sin dependencias propias; solo en `apps/web`.

## R4. La subida del audio

- **Decisión**: `PUT /api/subtitles/:scriptId/audio` con el WAV como cuerpo (`audio/wav`), escrito por trozos a un
  fichero temporal en la carpeta de trabajo y renombrado al terminar: `~/YTCreator/subtitulos/<scriptId>/audio.wav`. El
  servidor comprueba la cabecera (PCM, 16 kHz, mono), la duración (hasta 3 horas, unos 345 MB) y el espacio libre. Un
  audio nuevo sustituye al anterior solo cuando el reconocimiento termina bien (US5).
- **Motivo**: un cuerpo binario sin `multipart` es lo más simple y se puede leer en flujo con Hono. La carpeta de trabajo
  es donde la constitución guarda los ficheros del creador (VII), fuera de `APP_HOME`.
- **Descartado**: guardar el audio en SQLite (base enorme, copias de seguridad lentas); subir por trozos con reanudación
  (YAGNI: 20 MB por cada 10 minutos).

## R5. El trabajo de reconocimiento

- **Decisión**: dos tipos nuevos de `background_job`: `reconocer_voz` y `descargar_motor`. La migración reconstruye
  `background_job` como hizo la 004, conservando todas las filas, y añade el estado `en_cola`. Un solo reconocimiento a
  la vez por instalación: el segundo queda `en_cola` y empieza al terminar el primero. Un trabajo que el servidor no
  terminó (apagado, cierre) aparece al arrancar como `interrumpido`, como hoy, y se puede repetir. Cancelar mata el
  proceso y no crea versión (FR-004).
- **Motivo**: reconocer usa toda la CPU o la GPU; dos a la vez van más lentos que uno detrás de otro. El estado vive en
  la base de datos, así que sobrevive a la pestaña (SC-006 de la 003).
- **Descartado**: varios en paralelo; una cola persistente aparte (la tabla de trabajos ya basta).

## R6. Cómo se llama a whisper-cli

- **Decisión**: un adaptador nuevo detrás de un puerto del dominio, `SpeechRecognizer`
  (`packages/core/src/speech/port.ts`), con dos implementaciones en un paquete nuevo `packages/speech`, como
  `packages/youtube`: `whisper` (el real) y `fake` (determinista, para las pruebas y la e2e). El real ejecuta
  `whisper-cli` sin shell y con un entorno mínimo (sin secretos), con:
  - el modelo, el idioma `es`, la detección de voz con el modelo Silero y la salida JSON completa (`-ojf`), que trae cada
    palabra con su inicio, su fin y su probabilidad;
  - una indicación inicial (`--prompt`) con los nombres propios, cifras y términos del guion, hasta unos 200 tokens, para
    que el modelo ya los escriba bien;
  - el avance que imprime (`-pp`), leído para la barra de progreso;
  - los hilos según los núcleos del equipo.

  Clasifica los fallos en `sin_motor`, `sin_modelo`, `audio_no_valido`, `sin_memoria`, `interrumpido` e `interno`.
- **Motivo**: la constitución pide que los binarios se usen solo a través de adaptadores (restricciones técnicas, IV por
  analogía). El falso deja probar todo sin el motor. La indicación inicial es la forma barata de usar el guion antes de
  corregir.
- **Descartado**: `whisper-server` como proceso permanente (memoria ocupada siempre); `--max-len` de whisper para trocear
  (no sabe de límites de lectura ni del guion: R8 lo hace el dominio).

## R7. Cuánto tardará

- **Decisión**: la estimación es la duración del audio por un factor de velocidad. El primero sale de
  `subtitles/craft.json`, por sistema y modelo, marcado como supuesto (por ejemplo, 0,15 en Apple Silicon y 1,0 en un
  procesador Intel de cuatro núcleos). Tras cada reconocimiento, la app guarda el factor medido en ese equipo y lo usa
  la siguiente vez. Se dice como «unos 3 minutos», nunca con segundos.
- **Motivo**: FR-003 pide decirlo antes de empezar; el factor real depende tanto del equipo que solo medirlo da una
  cifra fiable.
- **Descartado**: una prueba de velocidad antes de cada reconocimiento (hace esperar más).

## R8. El troceado en subtítulos

- **Decisión**: una función pura de `packages/core/src/subtitles/segment.ts` convierte las palabras con tiempo en
  subtítulos con los límites de `subtitles/craft.json`:
  - **Vídeo largo**: hasta 2 líneas de 42 caracteres, 17 caracteres por segundo, entre 0,83 y 7 segundos, y al menos
    83 ms entre dos subtítulos.
  - **Short**: 1 línea de 32 caracteres (supuesto), con el resto de límites del vídeo largo.

  Corta con esta preferencia: final de frase, pausa de más de medio segundo, coma, antes de una conjunción o
  preposición, y por último entre dos palabras cualesquiera. Nunca deja una palabra sola en una línea si puede evitarlo.
  Reparte las dos líneas para que queden parecidas. Ajusta los tiempos a los de las palabras, sin solapes.
- **Motivo**: SC-002 pide el 100 % dentro de los límites; si lo calcula el dominio, se garantiza y se prueba. Las cifras
  de lectura en español salen de la guía de subtitulado de Netflix para el español (42 caracteres por línea; 17 por
  segundo para adultos), que es la referencia más citada, y se guardan con fuente y fecha (principio V). YouTube no
  publica límites propios de lectura.
- **Descartado**: trozos de la IA (no garantizan los límites); trozos fijos por tiempo (cortan a mitad de idea).

## R9. Las correcciones desde el guion

- **Decisión**: una función pura (`subtitles/align.ts`) alinea la secuencia de palabras oídas con la del guion aprobado,
  normalizadas (minúsculas, sin tildes ni signos, cifras y números escritos con letra equivalentes), con un alineamiento
  global por programación dinámica en una banda alrededor de la diagonal. Donde el alineamiento cambia hasta 3 palabras
  oídas por hasta 3 del guion y se parecen (distancia de edición normalizada de 0,5 o menos, o el mismo número), propone
  la forma del guion y guarda la oída (FR-006). Lo que el guion no tiene (inserciones: lo improvisado) y lo que el
  guion tiene y no se dijo (borrados) no se toca nunca.
- **Motivo**: SC-004 pide el 100 % de las diferencias de escritura corregidas y ninguna frase improvisada sustituida.
  Restringir a cambios cortos y parecidos es lo que separa «se oyó mal» de «dijo otra cosa».
- **Descartado**: pedírselo a la IA (gasta cupo en cada vídeo, y la revisión de la IA ya es opcional, R11); sustituir
  frases enteras por el guion (rompe lo improvisado).

## R10. Lo que se marca para revisar

- **Decisión**: un subtítulo lleva marcas calculadas: `del_guion` (R9), `poca_seguridad` (alguna palabra con
  probabilidad media de sus fragmentos por debajo de 0,5, supuesto en `subtitles/craft.json`), `lectura_rapida` y
  `fuera_de_limites` (comprobados contra R8 cada vez que se guarda; el creador puede pasarse de los límites, FR-010) y
  `cambio_ia` (R11). El filtro «Para revisar» muestra los que tienen alguna marca sin revisar; el creador puede darla por
  revisada.
- **Motivo**: las marcas se calculan o se guardan con el subtítulo, así que el número sale siempre bien.

## R11. La revisión de la IA

- **Decisión**: un uso nuevo, `revision_subtitulos` ([ai-uses](./contracts/ai-uses.md)), con su prompt versionado. La
  IA recibe los subtítulos (identificador y texto) y el guion como referencia, y devuelve solo cambios
  `{ id, texto, motivo }`. El dominio rechaza la salida (y reintenta una vez, principio IV) si nombra un subtítulo que no
  existe o si un cambio no es de escritura: más de un 30 % de distancia de edición respecto al texto, o palabras nuevas
  que no están en el guion. Los tiempos no forman parte de la salida, así que la IA no puede tocarlos (FR-011). Un vídeo
  largo se manda en tandas de hasta 200 subtítulos dentro del mismo trabajo, con el coste de todas a la vista antes. Los
  cambios se muestran como propuesta; lo aceptado es una versión nueva con origen `ia`.
- **Motivo**: la decisión 2 del creador. Quitarle los tiempos y limitar la distancia evita que la IA reescriba lo que el
  creador dijo.

## R12. Versiones y estado

- **Decisión**: `subtitle_track` (una por guion) y `subtitle_version`, con la foto JSON completa de los subtítulos en
  cada cambio y su origen (`reconocimiento`, `edicion`, `ia`, `recuperada`, `reaplicada`). La pista guarda la versión
  aprobada, y el estado (sin hacer, en marcha, borrador, aprobados) se calcula comparándola con la última, como el
  guion en la 005. Las correcciones en bloque (FR-009) se guardan en la pista como lista para reaplicarlas (FR-017).
- **Motivo**: es el patrón de `script_version` y `package_version`, ya probado. Una foto completa por cambio hace trivial
  volver a una versión (FR-012).
- **Descartado**: guardar solo diferencias (más complejo para volver); una fila por subtítulo (miles de filas por vídeo
  sin ninguna consulta que lo pida).

## R13. Los minutos reales de los capítulos

- **Decisión**: cada bloque del guion se busca en las palabras oídas por separado, con un alineamiento local (no el
  global de R9, que no encuentra un bloque movido en el montaje); un tramo del audio solo puede ser de un bloque
  (decisión 44). El minuto real de un capítulo es el inicio de la primera palabra alineada de su primer bloque. Si se alinea menos del 30 % de las
  palabras del bloque, el capítulo consta como «no encontrado» (FR-014). La propuesta se calcula al pedirla (no se
  guarda). Al aceptarla, el servicio de paquetes de la 006 guarda una versión nueva de `capitulos` con origen `edicion`
  y, en cada capítulo aceptado, `startSeconds` con el minuto real y una marca nueva y opcional, `fromAudio: true`.
  `chapterTimes` la trata como un minuto fijo, igual que `manual`, y la interfaz dice «minuto real» en vez de
  «estimado». Un paquete aprobado vuelve a borrador por la regla FR-015 de la 006.
- **Motivo**: un campo opcional en el JSON no rompe ninguna versión guardada ni exige reconstruir `package_version`. Lo
  manual se distingue de lo real, como pide FR-015.
- **Descartado**: un origen nuevo en `package_version` (reconstruir la tabla para una etiqueta); guardar las propuestas.

## R14. El fichero que se descarga

- **Decisión**: SRT en UTF-8 por defecto; en «Modo experto», WebVTT y SBV, los otros dos formatos que YouTube Studio
  admite según su ayuda («Formatos de subtítulos admitidos»). Se genera en el dominio a partir de la última versión
  (`subtitles/export.ts`), con el título principal del paquete o, si no hay, el de la idea, sin caracteres que los
  sistemas de ficheros no admiten.
- **Motivo**: SRT es el formato más extendido que acepta YouTube; los otros solo los pide quien ya sabe para qué.

## R15. Oír cada trozo

- **Decisión**: `GET /api/subtitles/:scriptId/audio` sirve el WAV con soporte de rangos (`Range`), y la pantalla usa un
  elemento `<audio>` para saltar al inicio del subtítulo y pararse en su fin. Se maneja con teclado (reproducir el
  subtítulo enfocado, ir al siguiente y al anterior).
- **Motivo**: el navegador ya sabe reproducir WAV con rangos; no hace falta otra biblioteca.

## R16. Borrar el audio

- **Decisión**: `DELETE /api/subtitles/:scriptId/audio` borra el fichero y deja los subtítulos intactos; la pantalla
  dice entonces que para oír los trozos hay que volver a elegir el fichero (FR-019).

## R17. Exportación

- **Decisión**: los subtítulos de cada guion entran en la exportación de datos del canal como `.srt` y `.json` (todas
  las versiones), junto al guion y al paquete (FR-020). El audio no se exporta: es un fichero del creador que ya está en
  su carpeta de trabajo.
- **Cómo quedó (decisión 59)**: cada parte de la app tiene su propia exportación y cambiar el formato de una existente
  es riesgo alto, así que los subtítulos tienen la suya: `GET /channels/:id/subtitles/export`, un JSON con todas las
  versiones de cada guion y el texto SRT de la última. Cada `.srt` se sigue descargando desde sus subtítulos.

## R18. Interfaz

- **Decisión**: una pantalla nueva, `/canal/subtitulos/:scriptId`, con tres estados (elegir el fichero, en marcha,
  revisar) y la entrada desde el guion aprobado y desde su paquete ([ui-screens](./contracts/ui-screens.md)). Se monta
  con los componentes del design system que ya hay. La lista de subtítulos, el campo de tiempo `m:ss,d` y el botón de
  oír se resuelven primero con los componentes existentes; si alguno no encaja, se para y se pregunta al creador antes
  de crear un componente nuevo (principio VI, componente documentado antes de usarse).

## R19. Pruebas con el motor real

- **Decisión**: `pnpm test:real-speech`, fuera del CI, con un audio de prueba en español de un minuto hecho para el
  proyecto y su guion. Mide el tiempo (SC-001 en proporción), compara con el texto esperado y comprueba las
  correcciones (SC-004) y los minutos de los bloques (SC-005). No gasta dinero ni cupo, así que el agente puede
  ejecutarlo en local. La revisión de la IA real (R11) se prueba aparte con `pnpm test:real-ai`, con la autorización del
  creador, como la T068 de la 006.

## R20. Lo que no se hace

- Quemar subtítulos en la imagen, cortar o montar (FR-018, principio VIII).
- Traducir a otros idiomas (decisión 3).
- Reconocer varias voces por separado (quién habla): un canal de la v1 es de un solo creador.

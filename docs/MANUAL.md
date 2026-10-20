# Manual del kit CanalYT

Todo lo que hace el kit, cómo empezar de cero, cómo crear un canal nuevo y cómo producir y publicar
cada pieza. Actualizado: 2026-10-11 (recorrido profano bloques 1-9 y plan de mejoras A-H: la interfaz, servicios,
subir tus propios archivos, exportar fuera del kit, referencias y biblioteca de patrones).
Las cifras y valores de ejemplo vienen del primer canal de prueba con el que se desarrolló el kit (ya borrado); en cada canal mandan su `canal.json` y su `CANAL.md`.
Si algo de aquí choca con el código, manda el código (y hay que corregir este manual).

---

## 1. Qué es, en una frase

Un **estudio para crear canales de YouTube y producir sus vídeos**, dirigido desde Claude Code. Crear un
canal (`/nuevo-canal`): mercado, concepto, nombre, estilo, voz, marca y el equipo de agentes según la
temática. Producir (`/nuevo-video`, `/nuevo-short`): tú eliges el tema y apruebas en cada paso; Claude
mide el mercado y la saturación, investiga, escribe, dirige a los agentes, genera las imágenes, monta el
vídeo (voz, imágenes, animaciones, música, subtítulos, rótulos, miniaturas, Shorts tráiler) y te deja los
textos de publicación listos. Tú apruebas la voz (la locución se lanza desde la UI con el coste a la vista; también
puedes locutar tú en la web de tu proveedor), generas a mano lo que va con Google
(miniaturas y 1-3 animaciones) y subes el resultado.

**Reparto del trabajo**

| Claude (automático) | Tú (a mano) |
|---|---|
| Ideas medidas (saturación y mercado), investigación con fuentes, escaleta, guion, verificación | Elegir tema y duración, aprobar cada fase |
| Imágenes con klein (gratis) y revisión de cada una; prompts de Google | Fondos de miniatura (Gemini) y animaciones (Flow) |
| Locución por la API del proveedor de voz, con coste confirmado | Escuchar un bloque de prueba y aprobar (o locutar tú y dejar el mp3) |
| Montaje completo, control de calidad, subtítulos ES/EN | Ver el resultado y pedir cambios |
| Títulos, descripción con afiliación, etiquetas, textos de TikTok/Reels | Subir a YouTube, TikTok e Instagram |
| Análisis de métricas y de canales de referencia | Pasar capturas de YouTube Studio |

---

## 2. Mapa del proyecto: el kit y tu espacio de trabajo

Hay **dos carpetas**, cada una con su propio repositorio de git:

- **El kit** (el programa): el código, las plantillas, los agentes y los comandos. Se actualiza con `git pull` y es igual para todos.
- **Tu espacio de trabajo** (`~/YTCreator/`): tus canales, tus claves y tus datos. Es tuyo y el kit nunca lo toca.

En una instalación normal el kit vive **dentro** del espacio, en `~/YTCreator/programa` (una sola carpeta para la persona): el
`.gitignore` del espacio lo deja fuera (`espacio.py preparar`) y la copia de seguridad no lo copia (`espacio.programa_dentro()`).

El espacio contiene `canales/`, `analisis/`, `data/`, `.env` y `canal_activo`, y **enlaces al kit** (`.claude`, `herramientas`,
`plantillas`, `recursos`, `docs`, `.venv`, `CLAUDE.md`). Por eso se **abre el espacio en Claude Code** y las rutas de los
agentes y comandos (`canales/…`, `herramientas/…`) valen tal cual. Se elige una vez (`herramientas/espacio.py elegir <carpeta>`, o
`ui/arrancar.sh` la primera vez) y se recuerda en `CanalYT/.espacio`; `CANALYT_ESPACIO` lo cambia para un comando. Sin separar, el
espacio es la propia carpeta del kit y todo funciona igual. Detalles y migración: `docs/ui/plan-2.6-espacio-de-trabajo.md`.

Lo que sigue es el mapa **del espacio** (con los enlaces al kit incluidos):

```
CLAUDE.md                 (enlace al kit) reglas de trabajo y mapa rápido (Claude lo lee siempre)
canal_activo              nombre del canal con el que trabajan herramientas y agentes (CANAL=… lo cambia)
.env / .env.example       claves, solo en el espacio (nunca en Git); .env.example es un enlace al del kit
docs/                     del KIT
  MANUAL.md               este manual
  progreso.md             estado del kit y siguiente paso (para retomar)
  historia_kit.md         historia técnica y decisiones (por qué las herramientas son así)
  mercado.md              mercado y monetización con datos contrastados (requisitos 2027, RPM, riesgos)
  guia_subida.md          paso a paso para subir (YouTube, TikTok, Reels)
.claude/
  commands/               /nuevo-video, /nuevo-short, /nuevo-canal, /cambiar-canal
  agents/                 agentes de oficio: narrativa, guionista, verificador, director-arte,
                          estratega-youtube, asesor-tematico (sin canal dentro; leen la ficha del canal)
  skills/                 analisis-canal-youtube (análisis con datos reales, yt-dlp)
plantillas/canal/         esqueleto de un canal nuevo (marcas <<RELLENAR>>; lo copia canales.py crear)
herramientas/             los programas (ver sección 13); prueba/ = guiones de prueba del kit
recursos/                 biblioteca común: fuentes, música original, efectos de sonido (+ LICENCIAS.md)
analisis/mercado/         (del espacio) estudios de nicho, previos a crear un canal
analisis/biblioteca/      (del espacio) <tema>.md: patrones que funcionan, por temática, compartidos entre
                          canales; los leen los agentes de oficio (ver sección de agentes)
canales/
  mi-canal/               UN CANAL (= <canal> en documentos, agentes y comandos)
    CANAL.md              ficha rápida: qué es, voz, estilo, marca, equipo, reglas, dónde está cada cosa
    canal.json            configuración (voz, estilo y paletas, tipografías, colores, marca, reglas...)
    docs/                 progreso.md (estado y siguiente paso), concepto.md (REGLAS DE GUION Y DE VOZ),
                          ideas.md, historial.md, referentes.md...
    equipo/               fichas de los agentes para este canal (<rol>.md)
    marca/                avatar, banner y vistas previas
    recursos/             música, efectos o fuentes propios (si no, se usa recursos/ común)
    analisis/             análisis de canales y capturas de Studio (entrada/)
    videos/NNN-slug/      un vídeo largo;  videos/SNNN-slug/  un Short de apoyo
      guion.json · guion.md · escaleta.md · brief_visual.md · fuentes.md · estado.json
      google/  (miniaturas y animaciones hechas a mano + PROMPTS*.md)
      voz/     (locución)  img/ (imágenes de klein)  tmp/ (hojas de control)
      final.mp4 · subtitulos.srt · subtitulos_en.srt · publicacion_final.md
  _archivo/<canal>/       canales archivados: no se activan; se usan con CANAL=_archivo/<canal>
data/                     (del espacio) uso.jsonl, base de datos de la UI, ajustes, salud de la IA, tareas (local, fuera de Git)
```

Las imágenes, voces, música y vídeos **no están en Git**: guárdalos con la **copia de seguridad** (Ajustes → Este equipo, o
`herramientas/copia.py hacer`) en un disco externo o una carpeta de iCloud/Google Drive. Para recuperarlos:
`herramientas/copia.py restaurar <carpeta nueva> --desde <carpeta>-copia`, y luego `espacio.py elegir` esa carpeta y volver a pegar
las claves (la copia no lleva `.env`).

---

## 3. Servicios y costes

| Para qué | Servicio | Coste | Notas |
|---|---|---|---|
| Imágenes (principal) | Cloudflare Workers AI (FLUX.2 klein 4B) | gratis (≈ 90/día) | o en el Mac, gratis y sin límite (≈ 2 min/imagen) |
| Miniaturas y animaciones | **Google AI Pro** (Gemini / Flow, Veo) | tu suscripción | a mano: fondos de miniatura y 1-3 clips por vídeo |
| Voz del narrador | **ai33.pro** (ElevenLabs; la voz la elige cada canal) | ≈ 1 crédito/carácter | recomendado: desde la UI (pestaña «Voz y montaje») con el coste confirmado; alternativa: locutar en su web y dejar el mp3 |
| Voz alternativa | Gemini TTS ("Puck") | gratis | `GEMINI_API_KEY` |
| Tiempos de cada palabra | Azure Speech (reconocimiento, sincronía «exacta») | gratis (F0) | subtítulos, cortes y efectos |
| Tiempos de cada palabra (alternativa) | WhisperX en este ordenador (alineación forzada, sincronía «local») | gratis, sin cuota | no transcribe, así funciona también con voces que Azure entiende mal; se instala aparte (`alineacion_local.py`) |
| Voz de respaldo y de las pruebas | Azure Speech | gratis (500.000 car./mes) | `probar_kit.py` la fuerza siempre |
| Música | propia (`gen_musica.py`) | gratis | misterio, tranquilo, alegre |
| Música a medida (opcional) | **Suno** por ai33.pro (`musica_ai33.py`) | 3.600 créditos por ambiente (2 versiones) | se elige por vídeo en la UI → «Voz y montaje» → «Música»; revisar licencia y Content ID antes de publicar |
| Tipografías | Playfair Display + Source Sans 3 (Google Fonts, OFL) | gratis | `recursos/fuentes/` |
| Análisis de YouTube y mercado | yt-dlp + feed RSS público | gratis | `saturacion.py`, `mercado.py`, skill |

`cuota.py` muestra en cualquier momento lo gastado y lo que queda (Cloudflare, Azure, saldo de ai33).
**Regla:** antes de gastar créditos de pago, Claude avisa del coste y pregunta. Nunca cancelar una tarea
de ai33 en curso (no devuelve los créditos).

---

## 4. Empezar de cero (Mac nuevo o proyecto copiado)

**Para una persona sin conocimientos técnicos: el `README.md` de la raíz** (abrir la terminal y pegar una línea; detalles y
problemas en `docs/instalar.md`). La línea descarga y ejecuta el instalador del kit (`instalar.sh` en Mac/Linux,
`instalar.ps1` en Windows), que clona el repositorio en `~/YTCreator/programa`, prepara el espacio `~/YTCreator`, instala
Claude Code y guía el inicio de sesión, con la pantalla de progreso en el navegador; repetirla = reparar y actualizar
(desde Claude, `/instalar`; `/instalar comprobar` para solo revisar). No pide contraseña de administrador salvo para git
si falta: Python 3.13 con `uv`, yt-dlp dentro del `.venv` (está en `requirements.txt`),
ffmpeg y ffprobe estáticos en `programas/` del kit (fuera de Git) y Node 24 en `ui/.node`; `herramientas/sistema.py` pone
`programas/` y la carpeta de órdenes del `.venv` delante del PATH al cargarse, así que no hay que tocar el PATH del sistema.
Registro en `programas/instalar.log`. Lo de abajo es la versión manual, para técnicos.

Requisitos: Python 3.13, FFmpeg, yt-dlp, Git, Node 24 (en `ui/.node`) y Claude Code. Funciona en **Mac, Windows y Linux**: lo que
cambia según el sistema (cerrojos, python del entorno, prioridad baja, procesos, enlaces) está solo en `herramientas/sistema.py`. En
Windows el python del entorno es `.venv\Scripts\python.exe` (Claude lo escribe `.venv/Scripts/python.exe`, porque usa Git Bash) y el
espacio enlaza las carpetas del kit con uniones (`mklink /J`, sin permisos de administrador). El motor de imágenes local (MLX) solo existe
en un Mac con chip de Apple; en los demás sistemas no aparece en Servicios. Los pasos de abajo son los de Mac con Homebrew.

1. **Programas**: `brew install python@3.13 ffmpeg git` (yt-dlp se instala con `requirements.txt`)
2. **Kit**: clona `CanalYT` desde Git y entra en ella.
3. **Entorno de Python**:
   ```bash
   /opt/homebrew/opt/python@3.13/bin/python3.13 -m venv .venv
   ```
   ```bash
   .venv/bin/pip install -r requirements.txt
   ```
4. **Espacio de trabajo**: `ui/arrancar.sh` (en cualquier sistema, `python ui/arrancar.py`) pregunta la primera vez dónde guardar tus canales, claves y datos (Intro =
   `~/YTCreator`) y lo prepara. A mano: `.venv/bin/python herramientas/espacio.py elegir ~/YTCreator` y, con
   `CANALYT_ESPACIO=~/YTCreator`, `herramientas/espacio.py preparar`. Si ya tenías canales dentro del kit, `migrar` los copia
   (con `--simular` solo cuenta). Después, `git init` en el espacio para versionar tus canales.
5. **Claves**: en tu espacio, `cp .env.example .env` (o desde la UI: Ajustes → Servicios, con botón «Probar») y rellena (cada una se saca en su web; ver `docs/historia_kit.md`,
   fases 2-3):
   - `CF_ACCOUNT_ID`, `CF_API_TOKEN`: dash.cloudflare.com → token con la plantilla "Workers AI" (+ Account
     Analytics: Read para `cuota.py`).
   - `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`: recurso "Speech" en Azure, plan gratuito F0.
   - `GEMINI_API_KEY`: aistudio.google.com/apikey (proyecto sin facturación = gratis).
   - `AI33_API_KEY`: ai33.pro → API Key (solo si se usa su API).
6. **Motor de imágenes local** (opcional, respaldo gratis): ver la cabecera de `herramientas/motor_local.py`
   (`.venv-local` + `mflux`; el modelo se descarga a `modelos/`).
7. **Comprobar todo**:
   ```bash
   .venv/bin/python herramientas/probar_kit.py
   ```
   Debe acabar en "OK: el kit funciona" (≈ 1-2 min; voz gratuita de Azure, ≈ 400 caracteres la primera vez).
8. En Claude Code, abre **tu espacio de trabajo** (no la carpeta del kit) y di **"reanuda"**: Claude lee `docs/progreso.md` (kit), la ficha del
   canal activo (`canales/<canal>/CANAL.md`) y su `docs/progreso.md` → "Siguiente paso".

---

## 4b. La interfaz (UI): `ui/arrancar.py` (atajo en Mac y Linux: `ui/arrancar.sh`)

Aplicación web local en http://127.0.0.1:8765 (solo en tu ordenador). `python ui/arrancar.py [dev|compilar|comprobar]` vale en los tres
sistemas (con cualquier python: se relanza con el del `.venv`). La primera vez pregunta dónde guardar tu espacio de trabajo. Tras un cambio
en el backend se reinicia (Ctrl+C y de nuevo `ui/arrancar.sh`); tras un cambio en la pantalla, `ui/arrancar.sh compilar` y Cmd+Shift+R.

**Para ver la interfaz con un canal de ejemplo**: `ui/arrancar.sh prueba` abre http://127.0.0.1:8766 con el canal «Asombroso y Real»
(dos vídeos en fases distintas y un canal archivado), sin gasto y sin tocar tu espacio: cada arranque parte de una copia nueva de
`ui/backend/tests/espacio_de_prueba` en la carpeta temporal del sistema. Puede abrirse a la vez que la interfaz normal (8765).

**Ajustes** (en el menú) reúne todo lo de configuración:
- **Servicios**: una tarjeta por servicio (Cloudflare, Azure, ai33, Gemini). La clave se guarda en el `.env` del espacio y no se vuelve a
  mostrar. Arriba, «Siguiente paso» te dice qué clave necesaria falta y dónde conseguirla; **«Probar»** comprueba el servicio con una llamada
  gratuita (saldo, verificación del token, token de voz, lista de modelos): nunca genera nada ni gasta créditos.
- **Inteligencia artificial**: la UI va **solo con Claude**. «Conectar Claude» da los tres pasos (instalar Claude Code, `claude auth login`,
  «Probar que contesta») y avisa si la sesión es de clave de API (pago por uso) en vez de suscripción. Debajo, modelo y esfuerzo por uso
  (producción, asistente, sugerencias, revisión). Todo lo lanza `motor_ia.py`: esfuerzo explícito, entorno limpio, errores tipados y salud.
- **Modo sin gasto**: la voz, las imágenes y la música de ai33 salen **falsas** (imagen con «SIMULADO», voz de zumbido con tiempos, música
  sintetizada) y lo gratuito sin clave también; así se recorre el flujo entero sin claves ni créditos. No pisa nada real, y al desactivarlo el
  siguiente montaje las rehace de verdad. La suscripción de Claude sigue usándose.
- **Presupuesto**: tope de gasto de pago por vídeo: no deja lanzar una tarea de pago que lo pasaría (para seguir, súbelo aquí). El
  gasto se apunta al terminar cada tarea; nada si la cancelas en cola o con el modo sin gasto.
- **Límites y precios**: lo que cuesta o permite cada proveedor (créditos por imagen, por carácter, por encargo de música, neuronas de
  Cloudflare, euros por millón, cuánto es «un vídeo típico»…); se editan sin tocar código (`herramientas/proveedores.py`) y se aplican al reiniciar.
- **Este equipo**: versiones, dónde están el kit y el espacio (y si falta algún enlace) y «Probar que todo funciona» (`probar_kit.py`, gratis).

**Cuotas y gasto** (barra superior): saldo de ai33 con **conciliación** (comprados − saldo = gastado real; la diferencia con lo apuntado por las
herramientas es lo gastado fuera de ellas, p. ej. la web de ai33) y el indicador **«caben N vídeos»** según el coste de un vídeo típico.
Cada vídeo muestra su gasto y avisa si supera el tope.

**Fase J · Publicado y resultados** (en cada vídeo): URL, fecha y hora, miniatura y título finales subidos y el resultado de «Probar y comparar».
`cerrado` significa «terminé de producir»; `publicado`, que ya está subido.

## 5. Crear un canal NUEVO: `/nuevo-canal [temática]`

Las herramientas y los agentes son genéricos: **otro canal = otra carpeta en `canales/`**, hecha desde
`plantillas/canal/`. `/nuevo-canal` la crea y la rellena por fases, con tu aprobación en cada una, mirando
muestras reales (imágenes, audio, cifras). Se retoma con `/nuevo-canal continuar` (estado en
`<canal>/estado_canal.json`).

**En la UI (Asistente → «Crear el canal»)** las fases son una barra de 11 pasos; las que tienen pantalla propia se hacen con
clics, sin chat. Hoy son todos (11):
- **Paso 1, Mercado**: escribes qué te interesa → Claude propone 3-5 temas por detrás → cada uno se mide solo en YouTube
  con `mercado.py` → tarjetas con semáforo, público, sitio para canales pequeños, reparto entre los grandes e ingresos en
  rangos → «Elegir este tema».
- **Paso 2, Concepto**: al elegir el tema, Claude propone 2-3 formas de hacer el canal (promesa, temas, público, duración,
  narrador, ritmo, de qué vivirá; aviso si sería «para niños») → «Elegir este concepto» crea la carpeta del canal con
  un nombre provisional.
- **Paso 3, Nombre**: Claude propone 6-8 nombres (y rellena el concepto en `docs/concepto.md`); puedes añadir los tuyos
  con su @. Cada uno se busca solo en YouTube con `nombre_canal.py` (si su @ está libre y si al buscarlo sale alguien
  más) → semáforo → «Elegir este nombre», que renombra el canal (`canales.py renombrar`) y apunta el porqué y los
  descartados en `docs/concepto.md`. Una @ ocupada no se puede elegir.
- **Paso 4, Estilo**: Claude propone 4-5 estilos con 3-4 escenas típicas del canal → «Hacer las imágenes» (gratis: en
  internet, unas 90 al día, y si se acaba en este ordenador) → hoja con cada estilo en una fila, imágenes ampliables →
  «Elegir este estilo» (escribe `estilo` y `paletas` en `canal.json`) o «Probar otros estilos» (añade, no borra).
- **Paso 6, Marca**: Claude propone varias combinaciones de letra, colores y música → «Hacer las muestras» (gratis) pinta una miniatura
  de prueba con cada una sobre las imágenes de tu estilo y prepara la música para oírla → «Elegir esta marca» guarda letra, colores,
  textos de marca y etiquetas de los Shorts en `canal.json`.
- **Paso 5, Voz**: Claude escribe un párrafo como los del canal y propone 4-6 voces (gratis y de pago) → «Hacer las
  muestras» (gratis: el párrafo con las voces gratuitas, con su velocidad y lo que hay que escuchar con atención; de las de
  pago, su muestra oficial) → reproductor por voz. Oír una de pago con tu párrafo cuesta créditos: la pantalla dice cuánto y
  pide confirmación. «Elegir esta voz» escribe `voz`, `voces` y `estilo_voz` en `canal.json` y, si la velocidad medida se
  aleja más de un 5 % de la prevista, reajusta las palabras de cada duración.
- **Paso 7, Reglas**: Claude deja escritas las reglas de guion y voz y razona dos preguntas de YouTube (contenido sintético,
  afiliación) → las confirmas con un clic.
- **Paso 8, Equipo**: Claude escribe la ficha de cada especialista; marcas los opcionales que quieres (verificador, asesor).
- **Paso 9, Alta en YouTube**: textos para copiar, avatar y banner (gratis, `marca.py`) y «Ya lo he creado» con la dirección del canal
  (se comprueba con `yt-dlp`), o «Lo haré más tarde».
- **Paso 10, Ideas**: unas diez ideas medidas con `saturacion.py`; descartas las que no quieres y eliges la del primer vídeo.
- **Paso 11, Prueba y activación**: `probar_kit.py` con tu canal y, si quieres, queda como canal activo.

En cada paso, «Proponer otros» (con indicaciones) o «Hablar con Claude» si hace falta. Los demás pasos
siguen en el chat de debajo («Seguir creando el canal»), con las preguntas de Claude como botones. Pantalla y terminal leen
y escriben el mismo estado, así que se puede pasar de una a otra.

| Fase | Qué pasa |
|---|---|
| A · Mercado | `mercado.py --comparar` sobre 5-8 nichos y `--plan` de horas para el YPP; referentes con la skill. Nada que parezca "hecho para niños" sin decidirlo a conciencia (RPM ≈ 30 veces menor) |
| B · Concepto | 2-3 conceptos (promesa, 3-4 pilares, público, formato, narrador, monetización); al elegir, `canales.py crear <slug> "Nombre"` |
| C · Nombre | @ libre (comprobado con yt-dlp: 404 = libre), sin canales parecidos, búsqueda del nombre limpia |
| D · Estilo visual | la misma escena en 4-5 estilos (`laboratorio_estilo.py`), paletas, método de prompts |
| E · Voz | muestras reales (coste antes si son de pago), `entonacion.py`, palabras por minuto medidas |
| F · Marca | tipografías, colores, música y pantalla final |
| G · Configuración | concepto completo y `canal.json` sin marcas `<<RELLENAR>>` |
| H · Equipo | roles base (narrativa, guionista, director-arte, estratega) + opcionales (verificador, asesor-tematico) y sus **fichas** en `<canal>/equipo/`, probadas |
| I · Alta en YouTube | avatar y banner (`marca.py`), textos de alta (`docs/alta_youtube.md`); el alta la haces tú y Claude la comprueba |
| J · Ideas | 10-15 ideas medidas con `saturacion.py` |
| K · Prueba y cierre | `probar_kit.py` con el canal nuevo, `CANAL.md` rellenado, `canales.py pendientes` a cero, activar (si quieres), commit |

**Vídeo rápido, sin crear canal:** en la bienvenida de la UI (o `canales.py crear-rapido`) se crea un canal sin
nombre (`rapido-N`, etiqueta «Sin nombre») con estilo, voz gratuita, colores y música de fábrica
(`plantillas/canal_rapido.json`) y se empieza un vídeo sin pasar por las fases A-K. Sus fichas llevan marcas
`<<POR DEFECTO…>>` en vez de `<<RELLENAR>>`: los agentes aplican lo habitual de su oficio. Para convertirlo en un
canal de verdad: en su página, **«Convertir en canal»** con un nombre (o `canales.py convertir rapido-N "Nombre"`). Cambia la
carpeta al slug del nombre, vuelve a poner las marcas `<<RELLENAR>>`, quita `"rapido"` y deja el canal en la fase A de
`/nuevo-canal` (sigue en el Asistente); los vídeos hechos se quedan con su número y los valores de fábrica, hasta las fases D-G.
Para cambiar el nombre de un canal: `canales.py renombrar <viejo> <nuevo> ["Nombre"]`, nunca `mv` (la UI perdería sus vídeos).

**Cambiar de canal:** `/cambiar-canal [canal]` (o `canales.py activar <slug>`): cambia el canal de todas las
herramientas y agentes. Para un solo comando: `CANAL=<slug> .venv/bin/python herramientas/...`. Los canales
archivados (`canales/_archivo/`) no se activan: se usan con `CANAL=_archivo/<canal>`.

## 6. Producir un VÍDEO LARGO: `/nuevo-video [tema]` (el producto del canal)

10, 12 o 14 min (o a medida, nunca menos de 8), horizontal, ≈ 95-130 imágenes. Se retoma con
`/nuevo-video continuar`.

| Fase | Qué pasa |
|---|---|
| A · Arranque | lectura del proyecto, `cuota.py`, `probar_kit.py` |
| B · Tema y duración | 5 temas por pilar o 3 enfoques, cada uno con su semáforo de saturación; eliges tema y duración |
| C · Investigación | `fuentes.md` con 2 fuentes fiables por dato; comprobado / hipótesis / leyenda; enlaces de afiliación |
| D · Escaleta y guion | empaquetado: ángulo, títulos y concepto de miniatura (`estratega-youtube`, `empaquetado.md`) → **apruebas** → escaleta con pregunta → recompensa por acto (`narrativa`) → **apruebas** → guion (`guionista`, con `pilar`) → verificación → revisión de estructura → prompts (`director-arte`) → `revisar_guion.py` → copia `guion_generado.json` → **apruebas `guion.md`** |
| E · Voz | web de ai33 → `voz_archivo`, o por API con aprobación del coste (las dos gastan créditos) → `entonacion.py` → repetir solo lo marcado, preguntando |
| F · Imágenes | klein automático (boceto opcional, definitivas, revisión una a una); Google a mano para miniaturas y 1-3 animaciones |
| G · Montaje y control | `final.mp4` con pantalla final de 20 s, capítulos, Shorts tráiler, `fotogramas.py` |
| H · Miniatura y publicación | 3 miniaturas ("Probar y comparar"), subtítulos EN, `publicacion_final.md` con afiliación |
| I · Cierre | **bucle de mejora** (`comparar_guion.py` → `aprendizajes.md` → reglas nuevas en la ficha del guionista, si las apruebas), historial, 3 ideas nuevas medidas, consumo, commit; métricas después |

Estructura (ver `<canal>/docs/concepto.md`): gancho (0-30 s; en los primeros 10 s confirma la promesa
del título y la miniatura) → contexto → actos que van a más, cada uno con su pregunta, su recompensa y
un reenganche → la explicación (comprobado frente a hipótesis) → giro final → cierre con pregunta a los
comentarios y siguiente vídeo → pantalla final.

## 7. Producir un SHORT DE APOYO: `/nuevo-short [vídeo o tema]`

Los Shorts son **escaparate, no producto** (`docs/mercado.md`). Los tráileres normales salen solos de
cada vídeo largo (campo `shorts`). `/nuevo-short` es para un Short extra que empuje a un vídeo largo ya
hecho: 30-55 s, vertical, ≈ 12 imágenes, enlazado al vídeo largo ("Vídeo relacionado" en YouTube).

| Fase | Qué pasa | Tú |
|---|---|---|
| A · Enfoque | 2-3 enfoques del mismo caso, con gancho y semáforo | eliges |
| B · Guion | guion (`guionista`) → verificación si hace falta → prompts (`director-arte`) → `revisar_guion.py` | apruebas `guion.md` |
| C · Voz e imágenes | voz en la web de ai33 → `voz_archivo`; imágenes con klein, revisadas una a una | locutas |
| D · Montaje y publicación | `montar.py` → `final.mp4`, subtítulos; `publicacion_final.md` | ves, pides cambios, subes |
| E · Cierre | historial, consumo, commit | |

---

## 8. Imágenes

- **klein automático** (principal): `montar.py guion.json --solo-imagenes` (Cloudflare, ≈ 110 neuronas por
  imagen, ≈ 90/día; sin cuota sigue en el Mac). `--boceto` hace antes un storyboard gratis a baja resolución.
- El estilo sale de `canal.json` → `estilo` + la **paleta del pilar** del guion (`"pilar"`; por ejemplo:
  historia, naturaleza, universo, ciencia). El prompt de cada imagen solo describe la escena
  (`director-arte`, con el brief visual del vídeo y la ficha de plano de cada imagen).
- **Revisión** una a una a tamaño grande: anatomía, época y lugar sin anacronismos, sin texto deformado,
  estilo editorial y que cuente lo que dice la voz. `--rehacer-imagenes EE-N` (máximo 2 veces; después,
  simplificar la escena).
- **Google a mano** (lo que más luce): Claude escribe `google/PROMPTS.md`; tú generas en Gemini los fondos
  de miniatura (con un lado vacío para el texto) y en **Flow** 1-3 animaciones (`animEE-N.mp4`) desde una
  imagen de inicio; los dejas en `google/` y Claude los conecta con `"imagen"` / `"video"` (+ `"desde"`).
- **Subir tu propia imagen, clip o efecto** (desde el visor de cada imagen, en la pantalla de Montaje y
  control): sustituye la imagen de esa escena por un archivo tuyo (conserva el `prompt` para poder volver),
  un **clip de vídeo** (en vez de imagen fija; casilla para mezclar su propio audio bajo la voz, y aviso si es
  más corto que el tramo) o un **efecto de sonido** nuevo. Se valida de verdad (tipo real con `ffprobe`, tamaño
  máximo, nombre saneado) y, en el clip, se informa su duración, resolución y nº de cortes de escena
  (`scdet`) para que decidas si trae más de un plano. Gratis, nada que gaste crédito.

### Música, voz e imágenes propias, en general

Siempre que una pieza sea de pago o automática, puedes traer la tuya en su lugar sin perder el resto del
montaje: música (`<canal>/recursos/musica/<ambiente>.wav`, igualada a −18 LUFS, subida desde la UI), voz
(`"voz_archivo"`, el mp3 que tú locutes o descargues de la web de un proveedor) e imágenes (`"imagen":
"videos/NNN-slug/img/propias/EE-N.png"`, conservando el `prompt` de esa escena). `montar.py` las usa igual
que las generadas, sin volver a gastar.

## 9. La voz

La voz de cada canal está en `canal.json` → `voz` (y en su `CANAL.md`); aquí, un ejemplo.
- **Narrador (recomendado):** Claude te da el texto listo (sin `{img}` ni efectos). En la web de ai33:
  ElevenLabs → Juanjo Relatos, modelo **eleven_v4**, velocidad 1,2, sin marcas (desde el 01/10: eleven_v3 sonaba a IA
  con todas las voces, y el texto coloquial también; prueba en `videos/_pruebas/voces_2026-10-01/`). Antes: eleven_v3 con como mucho UNA marca por bloque (`[curious]`,
  `[whispers]`…; varias distintas hacen saltar el tono) o **eleven_multilingual_v2** sin marcas (más
  estable). Tono de documental sereno. Descarga el mp3 a `<canal>/videos/<pieza>/voz/` y dile a Claude el nombre:
  lo pone en `"voz_archivo"` y el montaje lo alinea y lo reparte por escenas **sin volver a pagar**.
- **Por API** (automático, recomendado desde el 30/09): en la UI, «Voz y montaje» → «Locución» (coste exacto, bloque
  de prueba y resto); en la terminal, `montar.py --previsto-voz` (coste, gratis) y `--solo-voces … --gastar-ai33`.
  Sin `--gastar-ai33`, montar.py se para antes de gastar en voz de ai33.
- **Repetir una sola escena**: `montar.py guion.json --escena-sola N --gastar-ai33` (o ↻ junto a su audio en la UI):
  otra toma solo de esa escena, con el aire de la anterior; el resto del bloque no se toca (la anterior, en `voz/anteriores/`).
- **Bloques**: cada bloque se locuta de una tirada; `canal.json` → `caracteres_bloque_voz` (p. ej. 4.000, 3 bloques
  por vídeo de 10 min: cada empalme hace que la voz arranque de nuevo) y `pausa_entre_bloques` (0,7 s).
- **Entonación** (gratis, tras cualquier locución): `entonacion.py <canal>/videos/<pieza>` marca los finales que
  suben como una pregunta, las palabras con el acento en la última sílaba ("sobrevivierá") y los **cortes** (la voz
  arranca, se calla en seco y vuelve a empezar); solo revisa las escenas con la voz al día. Da los
  bloques a repetir y su coste. Prevención al escribir: sin "…" tras palabras llanas largas y sin frases
  que acaben al cerrar una cita (`revisar_guion.py` lo avisa).
- **Efectos**: con moderación y solo entre frases; nada de efectos cómicos (`revisar_guion.py` los marca
  como error). `{pausa:ms}` para una pausa dramática.

## 10. El montaje: `montar.py`

```bash
.venv/bin/python herramientas/montar.py <canal>/videos/<pieza>/guion.json
```
Genera lo que falte (reutiliza lo que no ha cambiado) y deja `final.mp4`, subtítulos, rótulos, título en
pantalla (Shorts), música por partes (la elegida de Suno en `<vídeo>/musica/` si la hay; si no, la propia), volumen a −14 LUFS (en dos pasadas), pantalla final (`canal.json` →
`pantalla_final`; p. ej. papel crema, el nombre del canal y su lema) y Shorts, miniaturas y `publicacion.md` (¡se sobrescribe! la buena es
`publicacion_final.md`).

| Opción | Para qué |
|---|---|
| `--solo-voces 1,2` | solo la voz de esas escenas |
| `--rehacer-voces 2` | otra toma de la voz de la escena 2 |
| `--solo-imagenes` | solo imágenes + `tmp/contactos.png` |
| `--rehacer-imagenes 3,5-2,v6-1` | regenerar imágenes concretas |
| `--boceto` | storyboard a baja resolución en el Mac (gratis) + `boceto.mp4` |
| `--motor auto\|cloudflare\|local` | motor de imágenes de klein |

Campos principales de `guion.json` (detalle en la cabecera de `montar.py`): `tipo` ("short"), `formato`,
`pilar`, `duracion_objetivo`, `titulo`, `titulos`, `titulo_pantalla` (Shorts, `*palabra*` resaltada),
`voz_archivo`, `personajes` (personas y lugares que se repiten), `escenas[]` con `texto` (marcas `{img}`,
`{efecto}`, `{pausa:ms}`, `[emoción]`), `imagenes[]` (cada una con `prompt`, o `imagen`, o
`video`+`desde`, o `reutilizar`; y `movimiento`, `rotulo`), `musica`, `capitulo`; `descripcion`,
`etiquetas`, `fuentes`, `comentario_fijado`, `miniaturas`, `shorts`.

Control de calidad: `fotogramas.py guion.json` → `tmp/control.png` (un fotograma por plano).

**Montar fuera del kit:** si prefieres acabar el montaje en Final Cut, DaVinci Resolve o Premiere, botón «Exportar
para montar fuera» en la fase de montaje (o `herramientas/exportar_edicion.py guion.json`), solo con el vídeo ya
montado. Traduce `tmp/linea_tiempo.json` (no recalcula nada) a un `.zip` con la voz por escena y completa, música,
efectos, imágenes en orden, `.srt` y dos líneas de tiempo: `timeline.fcpxml` (vídeo, voz, música y efectos; Final
Cut y DaVinci) y `timeline.edl` de reserva para otros programas (solo vídeo + voz completa: un EDL no admite bien
más de dos pistas de audio). Gratis, no gasta créditos.

---

## 11. Publicar, medir y decidir

- **Subir:** `docs/guia_subida.md` con los textos de `publicacion_final.md` (descripción con fuentes,
  capítulos y enlaces de afiliación con su aviso).
- **Medir:** a las 48 h y a los 7 días, capturas de YouTube Studio (`<canal>/analisis/entrada/LEEME.md`) en
  `<canal>/analisis/entrada/` → "métricas de NNN" → el `estratega-youtube` las analiza y se anotan en
  `<canal>/docs/historial.md`. Con datos propios, sustituir los RPM y la retención supuestos de
  `herramientas/mercado_referencias.json`.
- **Decidir temas:** `saturacion.py` (¿está quemado este dato?) y `mercado.py` (¿hay sitio en este nicho?).
- **Aprender de otros:** "analiza el canal de referencia X" (skill, datos reales con yt-dlp). En la pantalla
  del vídeo, "Canales de referencia" deja el embudo, los outliers y la estructura de un vídeo ajeno a la
  vista, y **"Comparar con la referencia"** (junto a "Revisar guion", en Escaleta y guion → Lee el guion →
  Detalles técnicos) mide cuánto se parece nuestro guion al suyo (solape de secuencias de 5 palabras), para
  detectar un parecido sin copiar el texto. Un canal con cientos de vídeos avisa del cupo de Claude antes de
  analizarlo entero.
- **Patrones que funcionan, entre canales:** `analisis/biblioteca/<tema>.md` (ver sección 12) reúne lo que ha
  funcionado en algún sitio (propio o de referencia) para que los agentes lo tengan en cuenta; no entrena
  ningún modelo, es un documento de texto que se edita a mano.

## 12. Agentes (segunda opinión especializada)

Cada agente tiene dos partes: el **oficio** (`.claude/agents/<rol>.md`, común a todos los canales: método,
reglas, lo que sabemos de las herramientas) y la **ficha** del canal (`<canal>/equipo/<rol>.md`: estilo,
tono, estructura, ejemplos y lecciones de ese canal). Si chocan, manda la ficha; sin ficha, el agente se
para. Una lección nueva va al oficio si sirve para cualquier canal y a la ficha si es del canal.

| Agente | Cuándo | Entrega |
|---|---|---|
| `narrativa` | escaleta; revisión de estructura de un guion; series y enfoques | `escaleta.md` |
| `guionista` | escaleta aprobada → `guion.json` + `guion.md`; correcciones; al cerrar, reglas aprendidas de tus ediciones | guion con lista de comprobación; `aprendizajes.md` |
| `verificador` (opcional) | antes de aprobar: cada afirmación contra las fuentes | tabla en `fuentes.md` |
| `director-arte` | brief visual, prompts (estilo y paleta del canal), storyboard, revisión de imágenes una a una | cambios por id |
| `estratega-youtube` | empaquetado antes del guion, títulos, miniaturas, `publicacion.md`, métricas (diagnóstico cruzado CTR × retención), mercado | `empaquetado.md`, `publicacion_final.md`, recomendaciones |
| `asesor-tematico` (opcional) | revisión de especialista (la especialidad la dice la ficha: médico, historiador…) | cambios con fuente |
| `usuario-novato` (del kit, sin ficha) | recorre la UI como una persona sin perfil técnico que la usa por primera vez (sin leer código ni gastar) | `docs/ui/auditoria-novato-<fecha>.md` |

Todos terminan con: **Hecho / Archivos / Decisiones para el usuario / Riesgos o dudas**. Los agentes se
cargan al abrir la sesión: un cambio en `.claude/agents/` se aplica en la siguiente.

### Biblioteca de patrones (`analisis/biblioteca/`)

Notas compartidas **entre canales** del espacio, un Markdown por temática: `analisis/biblioteca/<tema>.md`
(`<tema>` es un slug corto, p. ej. `historia` o `ciencia-curiosidades`; varios canales de la misma temática
leen el mismo archivo). Cada entrada es un patrón que ha funcionado en algún sitio (propio o de referencia),
con su origen y su rendimiento, para que `narrativa`, `guionista`, `director-arte` y `estratega-youtube` lo
tengan en cuenta al proponer. **No «entrena» ni cambia ningún modelo**: es texto que un agente lee como
cualquier otro documento, igual que una ficha o `docs/historial.md`.

Formato de cada entrada:
```markdown
## <nombre corto del patrón>
- **De dónde sale:** <canal o referente>, <vídeo o URL>, <fecha>
- **Qué rendimiento tuvo:** <dato concreto: outlier ×N, viral frente a su mediana, CTR, lo que sea medible>
- **El patrón:** <2-4 líneas de qué hacer, sin copiar el texto literal de nadie>
```
Se añade a mano (o pidiéndoselo a Claude) cuando un análisis (`estructura_referencia.py`, la skill de
análisis de canales, o un vídeo propio que funcionó) deja un patrón claro que merece repetirse. Se borra
igual de a mano: es un archivo de texto en el repositorio del espacio, sin UI ni base de datos propia. Si el
archivo del tema no existe todavía, el agente lo dice y sigue sin él (no es obligatorio).

## 13. Herramientas (`herramientas/`)

| Programa | Qué hace |
|---|---|
| `montar.py` | guion.json → vídeo final completo (ver sección 10) |
| `gen_voz.py` | voz (ai33, Gemini, Azure) o locución hecha fuera (`--audio`); tiempos por palabra |
| `gen_imagen.py` / `motor_local.py` | imágenes klein (Cloudflare / Mac) |
| `alineacion_local.py` | sincronía «local» de `gen_voz.py`: tiempos de cada palabra con WhisperX (alineación forzada, en este ordenador, gratis) |
| `subtitulos.py` | subtítulos palabra a palabra, rótulos, título en pantalla, .srt (tipografías de `canal.json`) |
| `miniatura.py` | miniaturas 1280×720 con título en la tipografía del canal |
| `gen_musica.py` | música original (misterio, tranquilo, alegre) |
| `musica_ai33.py` | música DE PAGO con Suno por ai33: `--estado`, `--previsto`, `--encargar <ambiente> --gastar-ai33`, `--elegir <ambiente> N`, `--guardar-prompt` |
| `prep_sfx.py` | preparar efectos nuevos |
| `fotogramas.py` | hoja de control del vídeo montado |
| `exportar_edicion.py` | `.zip` con las pistas del montaje (voz, música, efectos, imágenes, .srt) y su línea de tiempo (FCPXML/EDL) para montar fuera del kit |
| `entonacion.py` | revisa una locución (finales que suben, acentos en la última sílaba, cortes de la voz) |
| `revisar_guion.py` | revisa un guion antes de producir (voz, duración, ritmo, estructura, reglas del canal) |
| `estructura_referencia.py` | esqueleto narrativo de un vídeo de referencia sin copiar su texto (`estructura.md`, `metricas.json`); factor MRV; `--sintesis` resume varios referentes; `--comparar guion.json URL` mide el solape con la referencia |
| `comparar_guion.py` | bucle de mejora: qué cambió el usuario entre el guion entregado (`guion_generado.json`) y el locutado, escena a escena |
| `cuota.py` | consumo y saldo de cada servicio |
| `mercado.py` | radiografía y comparativa de nichos, plan de horas para el YPP (ver `docs/mercado.md`) |
| `saturacion.py` | semáforo de saturación de un tema en YouTube (clones, recientes, público del tema amplio) |
| `probar_kit.py` | prueba completa del kit (tras cualquier cambio; voz gratuita forzada) |
| `canal.py`, `uso.py` | canal activo y lectura de su `canal.json` (rutas, recursos, `fuente()`, `color()`) y registro de consumo |
| `canales.py` | canales del kit: `lista`, `crear`, `pendientes` (marcas `<<RELLENAR>>`), `activar`, `crear-rapido` (canal sin nombre con valores de fábrica), `renombrar` (carpeta y nombre, conservando los vídeos en la UI), `convertir` (canal rápido → canal de verdad, fase A) |
| `marca.py` | avatar y banner del canal activo (textos en `canal.json` → `marca`) con vistas previas |
| `laboratorio_estilo.py` | mismas escenas con varios estilos y hoja comparativa (elegir el estilo de un canal); solo rehace una imagen si cambia su prompt o sus referencias (`prompts.json`); admite imágenes de referencia (`referencias`, `referencia_en`) y escenas mínimas para estilos de muñeco simple (`estilos_simples`, `escenas_simples`) |
| `muestras_voz.py` | voces para elegir la del canal: `buscar` (voces de ai33 con su muestra oficial, gratis), `hacer` (muestras gratis con velocidad y entonación medidas; `--gastar-ai33` = de pago, con confirmación), `coste` |
| `copia.py` | copia de seguridad del espacio (canales, imágenes, voces, vídeos, `data/`; **sin `.env`**) en una carpeta elegida: `destino <carpeta>`, `hacer` (incremental, comprueba lo copiado; lo sustituido o borrado se guarda 30 días en `_anteriores/`), `restaurar <carpeta nueva>`. En la UI: Ajustes → Este equipo → Copia de seguridad (aviso en Inicio si pasan más de 7 días) |

## 14. Chuleta de frases para Claude

| Quieres | Di |
|---|---|
| Retomar donde se quedó | "reanuda" |
| Un canal nuevo | `/nuevo-canal` o `/nuevo-canal finanzas personales para jóvenes` |
| Trabajar en otro canal | `/cambiar-canal` (lista los canales) · `/cambiar-canal mi-canal` |
| Un vídeo nuevo | `/nuevo-video` o `/nuevo-video la epidemia de baile de 1518` |
| Un Short de apoyo | `/nuevo-short 001` (el vídeo largo al que apoya) |
| Seguir uno a medias | `/nuevo-video continuar` · `/nuevo-short continuar` |
| Prompts de Google | "pásame los prompts de miniaturas y animaciones" |
| El texto para locutar | "dame el texto para ai33" |
| Cuánto queda | "mira la cuota" |
| ¿Está quemado un tema? | "mide la saturación de: el hongo que convierte hormigas en zombis" |
| ¿Qué nicho tiene hueco? | "compara nichos con mercado.py" |
| ¿Cuánto falta para monetizar? | "plan de horas del YPP" |
| Analizar un canal o un vídeo | "analiza este canal: https://youtube.com/@…" · "analiza este vídeo: …" |
| Métricas | "métricas de 001" (con las capturas en `<canal>/analisis/entrada/`) |
| Guardar el trabajo | "guarda" (progreso, estado, commit y memoria) |

## 15. Reglas de oro (aprendidas a golpes)

1. **Revisar cada imagen a tamaño grande**, nunca solo la hoja de contactos: anatomía, época, texto.
2. **Escenas sencillas**: multitudes de lejos, primeros planos de una o dos personas con las manos quietas.
3. **Sin personas de relleno** que el texto no nombre.
4. **Voz: tono constante.** Una marca de emoción por bloque, o el modelo v2 sin marcas.
5. **No gastar sin preguntar**; nunca cancelar tareas de ai33. Las pruebas, siempre con voz gratuita.
6. **`publicacion_final.md` es la buena**; `publicacion.md` se regenera al montar.
7. **Los archivos van a su carpeta** (`google/`, `voz/`); si algo no aparece, buscarlo por fecha.
8. **Título en pantalla ≠ título de YouTube ≠ lo que dice la voz**: que se sumen, no que se repitan.
9. **Ningún tema sin medir su saturación** (`saturacion.py`): tema con público, dato que casi nadie cuenta.
10. **La promesa es "…y real"**: lo comprobado, separado de las hipótesis y las leyendas; ni una cifra
    famosa sin respaldo.
11. **Nada que parezca "hecho para niños"** (personaje infantil, dibujos de TV, tono de serie infantil):
    el RPM cae ≈ 30 veces y la responsabilidad legal es nuestra.
12. **Tras tocar herramientas, `probar_kit.py`**. Y al acabar cada bloque: progreso, estado, commit, memoria.

## 16. Pendiente (a 2026-10-11)

El plan vivo y al día es **`docs/plan.md`** (lo pendiente, en orden; ahí se tacha lo hecho con fecha y
commit). Resumen: espacio limpio desde el 05/10/2026, sin canales todavía — antes de crear el primero
(decisión del usuario) queda cerrar documentación y una pasada de QA como usuario profano sobre lo nuevo
(karaoke, ondas, servicios, vídeo rápido, exportar/importar). Después, con 15-20 vídeos reales producidos:
medir rendimiento, calibrar la duración estimada del guion y partir `montar.py` en módulos más pequeños.

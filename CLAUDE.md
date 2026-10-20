# CanalYT: kit para crear y producir canales de YouTube con IA

Un kit dirigido desde Claude Code: crea canales (concepto, estilo, voz, marca y equipo de agentes según la
temática) y produce sus vídeos por fases con aprobación del usuario (investigación, guion, imágenes, voz,
montaje, miniaturas y textos de publicación). Todo es gratis salvo la voz de pago de ai33.pro: **antes de
gastar créditos (API o web de ai33), avisar del coste y preguntar**.

**Al retomar ("reanuda"):** `docs/progreso.md` (estado del kit) y `docs/plan.md` (lo que queda, en orden), `canal_activo` (del espacio) → `canales/<canal>/CANAL.md`
(ficha del canal) y `canales/<canal>/docs/progreso.md` → "Siguiente paso".

**Instalar y abrir:** se instala con **una línea en la terminal** que lanza el instalador de la raíz del kit (`instalar.sh` en
Mac/Linux, `instalar.ps1` en Windows; README.md y `docs/instalar.md`): git, Python (uv), ffmpeg, Node, pantallas, espacio,
Claude Code e inicio de sesión, en 11 pasos repetibles, con la pantalla `instalar_progreso.py` en el navegador. Claude no
instala a mano: a quien no lo tenga, darle la línea. Instalación normal: el espacio es `~/YTCreator` y el kit vive dentro,
en `~/YTCreator/programa` (fuera del git del espacio y de la copia de seguridad), con el lanzador «Abrir YTCreator» (y el
acceso del Escritorio). «Abre YTCreator» → `python ui/arrancar.py` en segundo plano y abrir http://127.0.0.1:8765.
«Actualiza YTCreator» / «Repara YTCreator» → `/instalar` (vuelve a pasar el instalador; carpeta movida: antes
`espacio.py elegir`). «Reinicia YTCreator» → parar el proceso de `ui/arrancar.py` y volver a abrirla.
«Abre YTCreator de prueba» → `python ui/arrancar.py prueba` en segundo plano (canal de prueba ya avanzado de `herramientas/demo.py` en http://127.0.0.1:8766, sin gasto; se construye la primera vez y `prueba nueva` lo rehace).

## Kit y espacio de trabajo
Dos carpetas, dos repositorios git: el **kit** (este: código, plantillas, agentes, comandos, `docs/`) y el **espacio de trabajo**
de cada persona (`~/YTCreator`: `canales/`, `analisis/`, `data/`, `.env`, `canal_activo`), que contiene enlaces al kit
(`.claude`, `herramientas`, `plantillas`, `recursos`, `docs`, `.venv`, `CLAUDE.md`). **Claude trabaja con el espacio como
directorio de trabajo**: por eso las rutas de este documento (`canales/…`, `herramientas/…`) son relativas a él. Quién es quién:
`.venv/bin/python herramientas/espacio.py`; todas las rutas salen de `herramientas/espacio.py` (nada las calcula por su cuenta).
Se elige con `espacio.py elegir <carpeta>` (queda en `.espacio` del kit) o `CANALYT_ESPACIO`; sin nada, el espacio es el propio kit.
Los cambios del kit (herramientas, agentes, plantillas, docs) se commitean en el repositorio **del kit**; los de un canal
(guion, estado, fichas, `canal.json`) en el repositorio **del espacio**. `git status` en los dos.

## Canales
Cada canal vive en su carpeta `canales/<nombre>/` (`CANAL.md`, `canal.json`, `docs/`, `equipo/`, `marca/`,
`recursos/`, `videos/`, `analisis/`). Hoy no hay ninguno (espacio a cero desde el 20/10/2026): el primero se crea con
`/nuevo-canal` o con el Asistente de la UI.
- **Canal activo**: el que dice el archivo `canal_activo`; la variable `CANAL` lo cambia para un comando.
  **`<canal>` en cualquier documento, agente o comando = `canales/<canal activo>`**, y `canal.json` a secas
  = `<canal>/canal.json`. Di siempre al empezar en qué canal se trabaja.
- Las rutas dentro de un guion.json (`videos/NNN-slug/...`) son relativas a `<canal>`; las herramientas
  también aceptan `videos/...` en la línea de comandos. Música, efectos y fuentes: primero
  `<canal>/recursos/`, si no, la biblioteca común `recursos/`.
- Común (kit): `herramientas/`, `.claude/`, `plantillas/`, `recursos/`, `docs/` (manual, mercado, progreso,
  historia), `.venv`, `modelos/`. Del espacio (tuyo): `canales/`, `analisis/` (incluye `analisis/mercado/`, estudios de
  nicho previos a crear un canal, y `analisis/biblioteca/<tema>.md`, patrones que funcionan compartidos entre
  canales de la misma temática, que leen los agentes de oficio — `docs/MANUAL.md` §12), `data/`, `.env`, `canal_activo`.
- **Canal nuevo: `/nuevo-canal`** (fases A-K con aprobación; parte de `plantillas/canal/`, con marcas
  `<<RELLENAR>>`). **Cambiar de canal: `/cambiar-canal`**. Ambos usan `herramientas/canales.py`.
- Los canales de `canales/_archivo/` no se activan: `CANAL=_archivo/<canal>` delante de cada comando.

## Reglas de trabajo
- **Responder SIEMPRE en castellano**, también las frases cortas entre herramientas.
- No dar nada por hecho: comprobar con un comando, leyendo un archivo o preguntando.
- Explicar cada paso de forma sencilla; el usuario confirma con "hecho" / "siguiente".
- Claves solo en `.env` del espacio (nunca en el chat ni en Git). Ejecutar Python con `.venv/bin/python`.
- Shell: zsh en Mac, bash en Linux, Git Bash en Windows (no confiar en la separación de palabras de `$VAR`). Lo que depende del
  sistema va solo en `herramientas/sistema.py`; en Windows el python es `.venv/Scripts/python.exe`.
- Commits en Git con la identidad que tenga configurada el repositorio (no la cambies).
- **Todo al día, siempre.** Al empezar (también con "reanuda"): `git status` **en el espacio y en el kit**; si quedó algo sin guardar (la UI
  escribe `guion.json`, `revision_imagenes.json`, `estado.json`… sin hacer commit), revisarlo y hacer commit antes
  de seguir. Al cerrar cada bloque (no solo al final de la sesión): "Siguiente paso" en el `docs/progreso.md` que
  toque, `estado.json` del vídeo, commit (revisar `git diff --cached --name-only`: nada pesado; si aparece una
  carpeta de pruebas, ampliar `.gitignore`; cada cambio al repositorio al que pertenece) y la memoria de Claude. Que `git status`
  quede limpio en los dos.
- Lo que es del kit va al kit (herramientas, oficio de los agentes, plantillas, `docs/`); lo que es de un
  canal, a su carpeta (`canal.json`, fichas, `CANAL.md`, sus `docs/`). Si cambia lo que espera un agente o
  un campo de `canal.json`, actualizar también `plantillas/canal/`.

## Documentos
Del kit (`docs/`):
- **`docs/MANUAL.md`: manual completo del kit** (empezar de cero, crear un canal, producir, imágenes, voz,
  montaje, publicación, agentes, herramientas, reglas de oro). Mantenerlo al día al cambiar el kit.
- **`docs/plan.md`: plan único del kit** (lo pendiente, en orden; lo nuevo se apunta aquí). `docs/progreso.md`: estado del kit y
  siguiente paso. `docs/historia_kit.md`: historia técnica y decisiones
  (por qué las herramientas son así).
- `docs/mercado.md`: mercado y monetización de YouTube con datos contrastados (requisitos de 2027, RPM,
  canales faceless, riesgo de "hecho para niños").
- `docs/guia_subida.md`: paso a paso para subir cada vídeo o Short (YouTube, TikTok, Reels); los textos de
  cada pieza están en su `publicacion_final.md`.
- `plantillas/LEEME.md`: cómo es la plantilla de un canal.

De cada canal (`<canal>/`):
- **`CANAL.md`**: ficha rápida (qué es, voz, estilo, marca, equipo, reglas clave, dónde está cada cosa).
- `docs/progreso.md`: estado, siguiente paso y decisiones del canal.
- `docs/concepto.md`: promesa, pilares, público, estilo visual, estructura del vídeo y **reglas de guion y
  de voz**.
- `docs/ideas.md` (banco de temas con semáforo), `docs/historial.md` (vídeos y métricas),
  `docs/referentes.md`, y los que tenga el canal (p. ej. `analisis_guiones.md`, `renombrar_canal.md`).
- `canal.json`: configuración (voz, estilo y paletas, tipografías, colores, pantalla final, marca,
  duraciones, reglas del revisor, frases obligatorias). Las herramientas son genéricas y lo leen de aquí.

Procedimientos y agentes (`.claude/`):
- `commands/`: `/nuevo-video` (vídeo largo), `/nuevo-short` (Short de apoyo, `<canal>/videos/SNNN-slug/`,
  `"tipo": "short"`), `/nuevo-canal` y `/cambiar-canal`.
- `agents/`: agentes **de oficio** `narrativa`, `guionista`, `director-arte`, `verificador`,
  `estratega-youtube` y `asesor-tematico` (opcional: especialista cuya especialidad dice la ficha), sin
  canal dentro. Cada uno lee al empezar su **ficha** del canal activo, `<canal>/equipo/<agente>.md`
  (estilo, tono, estructura, ejemplos y lecciones del canal); si chocan, manda la ficha; sin ficha, el
  agente se para. Lecciones nuevas: del oficio → agente; del canal → ficha. Aparte, `usuario-novato` (del kit, sin ficha) audita la usabilidad de la UI como un profano; el
  análisis técnico completo de la plataforma se lanza con `docs/prompt-analisis-plataforma.md`. **Los agentes y comandos se
  cargan al abrir la sesión**: un cambio en `.claude/` se aplica en la siguiente (para probarlo antes, un
  agente `general-purpose` que lea el archivo y actúe como él).
- `skills/analisis-canal-youtube/`: análisis de canales con datos reales (`yt-dlp`, el del sistema):
  referentes y el nuestro con capturas de Studio. Resultados en `<canal>/analisis/` (cuadernos `.md` en
  Git; capturas, datos crudos, miniaturas e informes HTML, fuera).

## Herramientas (`herramientas/`)
| Script | Función |
|---|---|
| `montar.py` | guion.json → final.mp4 (con pantalla final), Shorts verticales, miniaturas, subtitulos.srt, publicacion.md, `montaje.json` (con qué guion y música se montó: la UI lo usa para saber si el montaje está al día) y `montaje.log` (cada ejecución: fases con su tiempo y cada orden de ffmpeg con su error); `--boceto` = storyboard sin cuota |
| `gen_voz.py` | Voz del narrador (la de `canal.json` → `voz`: ai33/ElevenLabs de pago, Gemini o Azure gratis; opciones en `voces`) o locución hecha fuera (`--audio`); tiempos por palabra: los de la voz o, si no los da, sincronía **exacta** (reconocimiento de Azure; si entiende < 60 % de la voz, pasa a la local o, si no, a la aproximada), **local** (alineación forzada de WhisperX en este ordenador, gratis: no transcribe, funciona también con voces que Azure entiende mal) o **aproximada** (silencios + largo de las palabras, sin servicios; `--sincronia` o guion → `sincronia`). montar.py locuta varias escenas de una vez |
| `gen_imagen.py` | Imágenes FLUX.2 klein (con referencias si hay personaje fijo); `--motor auto` (los servicios elegidos: Cloudflare y, sin cuota, el Mac si está elegido), `cloudflare` o `local` |
| `adaptadores_imagen.py` | **Contrato de la capacidad «imagen»** (plan 8b-C): `SolicitudImagen` + `ProveedorImagen` (`id`, `disponible()`, `generar()`), errores tipados (`CuotaAgotada`, `ImagenFiltrada`) y `REGISTRO` con los adaptadores `cloudflare` y `local` (Mac). gen_imagen.py solo decide cuál usar y cuál de reserva. Un proveedor nuevo = una clase + una línea en `REGISTRO`. Los conectores del usuario con capacidad imagen entran como `Conector` (`--motor <id>`; en automático solo los gratis) |
| `adaptadores_voz.py` | **Contrato de la capacidad «voz»** (8b-C): `SolicitudVoz` → `RespuestaVoz` (audio, palabras, texto), `ProveedorVoz` (`id`, `de_pago`, `claves`, `disponible()`, `locutar()`) y `REGISTRO` con `azure`, `gemini` y `ai33` (de pago; único que conserva las marcas de emoción). `proveedor_de(voz)` elige por el prefijo (`ai33:`, `gemini:`, `<conector>:` de un conector de voz del usuario; el resto, Azure). gen_voz.py conserva la sincronía |
| `adaptadores_musica.py` | **Contrato de la capacidad «música»** (8b-C): `SolicitudMusica` → `RespuestaMusica` (versiones en `<vídeo>/musica/`, créditos), `ProveedorMusica` y `REGISTRO` con `sintetizador` (gratis, 1 versión) y `ai33` (Suno, de pago, 2 versiones; exige `exigir_pago_permitido`). `musica_ai33.py` sigue siendo la CLI de la UI (estado, recoger, elegir) |
| `imagen_ai33.py` | Imágenes DE PAGO con ai33 (Nano Banana 2) para las que klein hace mal (personas, manos): las usa montar.py con `"motor": "ai33"` y `--gastar-ai33` (`--solo-ai33` = solo ese lote); cola de 20, lentas, nunca se cancelan |
| `motor_local.py` | FLUX.2 klein en el Mac (mflux, `.venv-local/` + `modelos/`); lo lanza gen_imagen.py |
| `alineacion_local.py` | Sincronía local: WhisperX (alineación forzada, wav2vec2 español) en `.venv-whisperx/` + `modelos/whisperx/`; lo lanza gen_voz.py |
| `subtitulos.py` | Subtítulos .ass (palabra activa) y rótulos con las tipografías del canal; exportación .srt |
| `miniatura.py` | Miniatura 1280x720: imagen de fondo + título en la tipografía del canal |
| `gen_musica.py` | Música original (alegre, tranquilo, misterio) |
| `musica_ai33.py` | Música DE PAGO con Suno (ai33) por vídeo: un encargo por ambiente = 2 versiones (3.600 créditos), igualadas a −18 LUFS en `<vídeo>/musica/`; se elige una (`--elegir`) y montar.py la usa. Prompts: `canal.json` → `musica_ai33` o propio del vídeo (`musica.json`) |
| `fotogramas.py` | Control de calidad: un fotograma por imagen del vídeo montado |
| `cuota.py` | Cuota disponible: neuronas reales de Cloudflare, caracteres de Azure y saldo de créditos de ai33 (`--previsto-ai33 N`; `--json` para la UI) |
| `mercado.py` | Radiografía de un nicho (demanda, puerta de entrada para canales pequeños, concentración, ritmo hasta el YPP, ingresos en rangos), `--comparar` nichos y `--plan` de horas; referencias con fuente en `mercado_referencias.json`. Informe: `docs/mercado.md` |
| `nombre_canal.py` | Nombre del canal (fase C): búsqueda limpia en YouTube (canales iguales o parecidos, vídeos con el nombre en el título) y @ libre, con semáforo; `--id` para otra @, `--json`. Con `yt-dlp`, sin cuota |
| `saturacion.py` | Semáforo de saturación de un tema en YouTube (regla del hueco): clones del dato concreto, ráfaga reciente, vídeos perennes (> 1 año y ≥ 20 visitas/h) y público del tema amplio, con `yt-dlp` y sin cuota |
| `entonacion.py` | Revisa una locución (vídeo o audio): finales de frase que suben como pregunta, acentos en la última sílaba y cortes (la voz arranca, se calla y vuelve a empezar); da los bloques a repetir y su coste. Gratis |
| `revisar_guion.py` | Revisa un guion.json antes de producirlo (reglas de voz, duración, ritmo, estructura y reglas del canal) |
| `corregir_prompts.py` | Claude (director de arte, solo lectura, con la suscripción) corrige los prompts de las imágenes marcadas como mal con sus motivos, en grupos de 5 (3 a la vez); deja las propuestas en `revision_propuestas.json` (modo revisión de la UI). Gratis |
| `estructura_referencia.py` | Esqueleto narrativo de un vídeo de referencia (bloques, ritmo, gancho, bucles, giro, CTA, momentos más vistos, outlier visitas/suscriptores) sin copiar su texto, con `yt-dlp` y sin coste; deja `estructura.md` y `metricas.json` en `<canal>/analisis/estructuras/<id>/` (la transcripción solo para analizar). factor MRV (reciente, viral frente a la mediana del canal, perenne); `--sintesis [--idioma es] [--solo-outliers]`: medianas de varios referentes en `sintesis.md`; `--comparar guion.json URL`: solape de secuencias de 5 palabras con la referencia |
| `comparar_guion.py` | Bucle de mejora: diferencias escena a escena entre el guion entregado (`guion_generado.json`, copia guardada al presentarlo) y el final; el guionista las convierte en reglas de su ficha (`aprendizajes.md`) |
| `conector_ia.py` | **Conector universal de modelos de IA** (8b-D, con escape «adaptador en código»: `"codigo": "<id>.py"` junto a la descripción; el único sitio que habla con APIs de IA que no son Claude): un servicio se describe en `data/proveedores/<id>.json` (base, `clave_env`, auth, plantilla de la petición con `{dato}`, ruta del resultado, formato url/base64/binario/texto, cola con consulta repetida, coste declarado) y `ejecutar(id, datos, salida)` lo corre. Errores tipados `ClaveInvalida`/`CupoAgotado`/`TiempoAgotado`; si es de pago exige `exigir_pago_permitido` y apunta el gasto en `uso`; la clave nunca se muestra. CLI: sin argumentos lista, `validar <id>`, `probar <id> clave=valor -o salida [--gastar]` |
| `servicios.py` | **Servicios que el usuario elige usar** (Ajustes → Servicios): catálogo por capacidad (imagen, voz, música, sincronía) y elección en `data/ajustes.json` → `servicios`. **Ninguno es obligatorio** (tampoco el motor del Mac): sin servicios se sube lo propio (imágenes, locución, música). Sin elegir, se usan los conectados. Las herramientas lo consultan (`servicios.disponible`) antes de usar uno |
| `demo.py` | Canal de prueba para recorrer la UI fase a fase sin gasto: `hacer <carpeta>` copia el espacio de las pruebas y deja un vídeo publicado con resultados (J), otro por montar (G) y otro a medio guion (D), con voz e imágenes de relleno. Lo usa `ui/arrancar.py prueba` |
| `simulacion.py` | **Modo sin gasto**: con `CANALYT_SIN_GASTO=1` o `data/ajustes.json` → `sin_gasto` las herramientas de pago de ai33 (voz, imágenes, música) salen sin enviar nada (`simulacion.exigir_pago_permitido`). Las pruebas lo llevan siempre activo. Toda herramienta nueva que gaste dinero DEBE llamarlo antes de enviar |
| `motor_ia.py` | **Único sitio que lanza la IA** (hoy el CLI de Claude con la suscripción): perfiles por uso (modelo y esfuerzo explícitos, en `data/ajustes.json` → `motor_ia`), entorno limpio (borra `ANTHROPIC_API_KEY`/`BASE_URL`…, salvo modo `api`), errores tipados (sin sesión / cupo / tiempo), salud en `data/salud_ia.json`; base del adaptador para otras IA. Quien necesite lanzar la IA lo usa (`motor_ia.preparar` / `ejecutar`), nunca arma la orden a mano |
| `probar_kit.py` | Prueba rápida de todo el kit con un guion mínimo (tras cualquier cambio en las herramientas); fuerza la voz gratuita de Azure |
| `esquema.py` | Versión de esquema de `guion.json` y `estado.json`: `migrar` (al leer, en memoria), `sellar` (al escribir, nunca la rebaja) y `aviso` (archivo de una versión más nueva de YTCreator). Sin argumentos informa del espacio; `actualizar` migra en disco |
| `sistema.py` | **Lo que cambia entre Mac, Windows y Linux**, solo con la biblioteca estándar: `python_venv` (python de un entorno), `cerrojo`/`bloquear` (flock o msvcrt), `prioridad_baja` y `opciones_grupo` (nice / prioridad de Windows, grupo de procesos), `senal_grupo` (parar un grupo entero), `enlazar` (enlace o, en Windows, unión de carpetas), `adaptar_orden` (el `.venv/bin/python` de los mensajes a Claude) y `mac_apple_silicon`. Ninguna otra herramienta pregunta por el sistema |
| `archivos.py` | Escritura atómica (`escribir_json`, `escribir_texto`): temporal + fsync + `os.replace`, conserva permisos. Todo JSON o `.env` que lean a la vez la UI, el vigilante o Claude se escribe con esto; lo que se va a reescribir se lee con `leer_json` (estricto: si está dañado, `ArchivoDanado` y no se toca) |
| `canal.py` | Canal activo: su carpeta, su `canal.json` y la resolución de rutas y recursos (lo usan las demás herramientas). **Un guion se lee con `canal.leer_guion`** (errores claros y esquema migrado), nunca con `json.loads` a mano, **y se cambia con `canal.editar_guion(ruta, cambio)`** (cerrojo `tmp/guion.lock` + relectura + sellado: no pisa lo que otro guardó entre medias) |
| `canales.py` | Canales del kit: `lista`, `crear <slug> "Nombre"` (desde `plantillas/canal/`), `pendientes <slug>` (marcas `<<RELLENAR>>`), `activar <slug>`, `crear-rapido` (canal sin nombre `rapido-N` con los valores de fábrica de `plantillas/canal_rapido.json`, activo: el «vídeo rápido» de la UI), `renombrar <viejo> <nuevo> ["Nombre"]` (nunca `mv`: apunta `slugs_anteriores` y la UI conserva los vídeos) y `convertir <rapido-N> "Nombre"` (canal rápido → fase A de `/nuevo-canal`) |
| `marca.py` | Avatar y banner del canal activo (tipografía sobre papel; textos en `canal.json` → `marca`) con vistas previas, en `<canal>/marca/` |
| `prep_sfx.py` | Preparar efectos de sonido nuevos |
| `copia.py` | Copia de seguridad del espacio (sin `.env`, enlaces ni cachés) en la carpeta elegida (`data/ajustes.json` → `copia.destino`): `hacer` (incremental, BD en caliente comprobada, verifica lo copiado; lo sustituido o borrado a `_anteriores/<fecha>/`, 30 días), `restaurar <carpeta nueva>` (nunca encima de nada). UI: Ajustes → Este equipo; aviso en Inicio a los 7 días |
| `laboratorio_estilo.py` | Las mismas escenas con varios estilos y hoja comparativa, para elegir el estilo de un canal (json de prueba; sin canal activo); una imagen solo se rehace si cambia su prompt o sus referencias (`prompts.json`, con el hash de las referencias). `prueba.json`: `referencias` + `referencia_en` (solo esos estilos las reciben) y `estilos_simples` + `escenas_simples` (escenas mínimas para muñecos simples) |
| `muestras_marca.py` | Marca del canal para elegir (fase F, paso 6 de la UI): `hacer <prueba.json>` pinta una miniatura de prueba por combinación de letra y colores sobre las imágenes del estilo elegido y prepara 30 s de cada música (`muestras.json` con la huella de cada muestra). Gratis |
| `ui/backend/app/canal_cierre.py` | Pasos 7-11 del asistente de canal (reglas, equipo, alta en YouTube, ideas, prueba y activación): estado, mensaje a Claude y aprobación de cada uno |
| `muestras_voz.py` | Voces para elegir la del canal (fase E, paso 5 de la UI): `buscar` (voces de ai33 con su muestra oficial, gratis), `hacer <prueba.json>` (oficiales + párrafo con las voces gratis, velocidad y entonación medidas, en `muestras.json`), `--solo ID --gastar-ai33` (DE PAGO) y `coste` |

## Interfaz (`ui/`)
Aplicación web local (en construcción): `ui/arrancar.py` (en Mac y Linux, atajo `ui/arrancar.sh`) → http://127.0.0.1:8765 (`dev` = con recarga en
:4300). Backend FastAPI + SQLite (`data/canalyt.db`) en `ui/backend/`, frontend Angular + Material en
`ui/frontend/` con el Node 24 de `ui/.node/` (no el del sistema). **`ui/arrancar.sh comprobar`** (ruff + pytest + Vitest +
compilación) tiene que pasar antes de dar por bueno un cambio del kit; tras tocar herramientas, además `probar_kit.py`.
Contrato de toda herramienta (`docs/auditoria-tecnica.md` §11, `tests/test_herramientas.py`): `--help` sin efectos, error
= código ≠ 0 con la última línea en `ERROR: …` (sin traceback) y lo que se reescribe, leído con `archivos.leer_json`.
Los archivos del kit mandan; la BD es
índice + datos propios de la UI. Diseño, estado y pasos: `docs/ui/diseno.md`; auditoría técnica y plan:
`docs/auditoria-tecnica.md`. Diagnóstico: `data/logs/backend.log` (backend; cada línea con `[tarea N · vídeo M]` y, al acabar una tarea, su tiempo por fase:
`grep 'vídeo 3' data/logs/backend.log`), `data/tareas/<id>.log` (cada tarea) y `<vídeo>/montaje.log` (montajes y ffmpeg).
Solo atiende a este equipo: rechaza un Host que no sea local y, en lo que cambia algo, un Origin ajeno.
**Claude en la UI**: cada vídeo tiene un chat que lanza `claude -p` desde la raíz (misma sesión de claude.ai) con
permisos limitados: puede leer, editar solo `canales/`, `analisis/` y `tmp/` (nunca código, agentes, ajustes ni `.env`), usar agentes y las herramientas gratis, pero NO montar.py, voz ni
imágenes (se lanzan con los botones de la UI, que avisan del coste). Si trabajas desde ese chat, en cada punto de
aprobación termina el turno y espera.

**Barra de progreso de la UI:** una herramienta que tarda llama a `canal.progreso(paso, pasos, "etapa")` (o
`canal.progreso(etapa="…")` si no hay cifra); imprime `@progreso 7/18 Escena 7` solo si la lanza la UI
(`CANALYT_PROGRESO=1`), así que la salida en la terminal y la de `--json` no cambian. Lo que la UI tenga que **contar**
(p. ej. imágenes generadas) va por `canal.evento("imagen", ident=…, estado=…)` → `@evento {json}`, nunca leyendo el texto
de un `print` (se puede reescribir sin romper la barra).

## Formato de guion.json
Descrito en la cabecera de `herramientas/montar.py` (léela antes de escribir un guion).
Resumen: escenas con `texto` (marcas `{efecto}`, `{pausa:ms}`, `{img}`), `imagenes` (una más que
marcas `{img}`; cada una con `prompt` (+ `personaje` si hay protagonista fijo), o `imagen`, o `video` (clip
animado, p. ej. de Veo), o `reutilizar`), `movimiento`, `rotulo`, `musica`, `capitulo`; y a nivel de vídeo
`titulo`, `titulos`, `descripcion`, `etiquetas`, `fuentes`, `comentario_fijado`, `miniaturas`, `shorts`,
`pilar` (paleta de las imágenes), `estilo`, `personajes`, `referencias`, `voz_archivo`, `sincronia` (exacta/aproximada).
Imagen propia (subida desde la UI): `"imagen": "videos/NNN-slug/img/propias/EE-N.png"` en su entrada (conserva el `prompt`).
Música propia del canal: `<canal>/recursos/musica/<ambiente>.wav` (subida desde la UI, igualada a −18 LUFS).
**Versión de esquema**: `guion.json` y `estado.json` llevan `"version_esquema"` (sin él = 0). `herramientas/esquema.py` los migra
al leer (en memoria) y la app la sella al escribir; al editarlos, consérvala. Para cambiar el formato: subir la versión y añadir
su migración en `esquema.py` (con test). `esquema.py` informa del espacio y `esquema.py actualizar` los migra en disco.

## Cuotas y costes
- Cloudflare: 10.000 neuronas/día (≈ 110 por imagen klein según la analítica real; ≈ 90 imágenes/día). El
  límite parece ser una ventana móvil de 24 h, no un reinicio a las 00:00 UTC. Si se agota, error (con
  `--motor auto`, las imágenes siguen en el Mac: ≈ 2 min cada una).
- Azure F0: 500.000 caracteres/mes. Un vídeo de 6 min ≈ 7.000-8.000 caracteres.
- ai33.pro (de pago; 15 € = 3,3 M créditos): voz ≈ 1 crédito por carácter (+15 % con marcas de emoción),
  también al locutar en su web; imagen Nano Banana 2 con referencia de estilo = 1.720 créditos (≈ 0,8 cént.;
  el "presented_credits" de su lista de modelos es ≈ ⅓ del real). Su cola tarda de minutos a horas. Cancelar
  una tarea NO devuelve los créditos: esperar siempre. Música de Suno: 3.600 créditos por encargo (2 versiones,
  segundos; medido el 02/10/2026). **Antes de un lote con un modelo nuevo, lanzar UNA y
  leer su coste real.**
- Cloudflare: FLUX.2 dev ≈ 7.400 neuronas/imagen y klein 9B ≈ 1.300 (4B ≈ 110): no sirven para lotes gratis.

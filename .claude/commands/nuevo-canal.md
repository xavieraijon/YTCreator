---
description: Crea un canal nuevo del kit por fases (mercado, concepto, nombre, estilo, voz, marca, equipo de agentes, ideas y prueba), con puntos de aprobación
argument-hint: "[temática | continuar]"
---
# CREACIÓN DE UN CANAL NUEVO
Temática o instrucción opcional: $ARGUMENTS

Crea un canal de YouTube nuevo con el kit: una carpeta `canales/<slug>/` hecha desde `plantillas/canal/`,
con su concepto, su configuración, su marca y las **fichas** del equipo de agentes según la temática.
Responde SIEMPRE en castellano. Trabaja por fases y **detente en cada PUNTO DE APROBACIÓN**: el usuario
decide mirando muestras reales (imágenes, audio, cifras), no descripciones. Explica cada paso de forma
sencilla y no des nada por hecho: comprueba con un comando o leyendo el archivo.

**Estado para retomar:** hasta que exista la carpeta del canal (fase B), en `analisis/mercado/nuevo_canal.json`;
después, en `canales/<slug>/estado_canal.json` (`{"fase": "D", "completadas": [...], "notas": "..."}`; al
terminar, `"fase": "hecho"`). Guárdalo al cerrar cada fase.

**Dinero:** todo es gratis salvo la voz de ai33 (≈ 1 crédito por carácter; locutar en su web también
gasta). Antes de cualquier gasto, di el coste y pregunta. Nunca cancelar una tarea de ai33 en curso.

**Herramientas de esta tarea:** `herramientas/canales.py` (`lista`, `crear`, `pendientes`, `activar`, `renombrar`),
`mercado.py`, `saturacion.py`, `laboratorio_estilo.py`, `gen_voz.py`, `entonacion.py`, `gen_musica.py`,
`miniatura.py`, `marca.py`, `probar_kit.py`; la skill `analisis-canal-youtube`. Cada archivo de
`plantillas/canal/` explica qué va en él (marcas `<<RELLENAR>>`); si ya hay otro canal hecho en `canales/`, sirve de
referencia de nivel (no de contenido).

## FASE A - ARRANQUE Y MERCADO
- Si $ARGUMENTS es "continuar": busca `estado_canal.json` sin `"fase": "hecho"` en `canales/*/` (o
  `analisis/mercado/nuevo_canal.json`), resume en qué fase se quedó y sigue desde ahí.
- **Canal rápido convertido** (`estado_canal.json` con `"desde_rapido"`; lo hace el botón «Convertir en canal» de la UI o
  `canales.py convertir`): la carpeta ya existe, con nombre provisional, **activa** y con vídeos hechos que se conservan;
  `canal.json` lleva aún los valores de fábrica (estilo, voz, colores, música) y las fichas, marcas `<<RELLENAR>>`. Sigue las
  fases desde la A igual, pero en la B no crees la carpeta (rellena su `docs/concepto.md`), trabaja sobre ese canal y no lo
  desactives. Los vídeos ya hechos son la mejor pista de lo que quiere el usuario: míralos antes de proponer nicho y concepto.
- Lee `CLAUDE.md`, `docs/mercado.md` (requisitos del YPP, RPM por nicho, riesgo "hecho para niños") y
  `.venv/bin/python herramientas/canales.py lista` (canales que ya existen: el nuevo no debe pisarlos).
- Si no hay temática: pregunta qué le interesa al usuario y propón 3-5 nichos con una línea cada uno.
- Mide cada nicho candidato con `.venv/bin/python herramientas/mercado.py --nicho "…" --busqueda "…"`
  (2-4 búsquedas representativas, `--categoria` bien puesta) y, si hay varios, `--comparar`. Los informes
  quedan en `analisis/mercado/`. Enseña demanda, puerta de entrada para canales pequeños, concentración,
  ritmo hasta el YPP e ingresos **en rangos**, con los supuestos a la vista (rol de analista objetivo:
  si un nicho no conviene, dilo aunque sea el que le gusta al usuario).
- Propón 2-4 canales de referencia y, si el usuario quiere, analízalos con la skill
  `analisis-canal-youtube` (lo que les funciona: temas, títulos, miniaturas, duración, gancho).
- PUNTO DE APROBACIÓN: nicho elegido (y referentes, si se analizaron).

## FASE B - CONCEPTO
- Propón 2-3 conceptos para el nicho, cada uno con: **promesa** en una frase, **pilares** (3-4 temas
  unidos por la misma promesa: los canales sin hilo común no crecen), **público** (y si es "para niños":
  RPM ≈ 30 veces menor, sin comentarios; `docs/mercado.md` §1.4), **formato** (largos de 8-15 min con
  Shorts de escaparate es lo que recomienda el estudio de mercado; justifica cualquier otra cosa),
  **narrador** (en off, personaje…), ritmo de publicación sostenible y **monetización** honesta
  (anuncios cuando llegue el YPP, afiliación, patrocinios).
- PUNTO DE APROBACIÓN: concepto elegido. Entonces crea la carpeta con un nombre provisional:
  `.venv/bin/python herramientas/canales.py crear <slug> "<Nombre provisional>"` (slug en minúsculas con
  guiones) y rellena `<canal>/docs/concepto.md` (Nombre y promesa, Mercado, Pilares, Público, Formato,
  Monetización). Pasa el estado a `<canal>/estado_canal.json` y borra `analisis/mercado/nuevo_canal.json`.
  Durante el resto de fases, trabaja con `CANAL=<slug>` (no actives el canal hasta la fase K).

## FASE C - NOMBRE E IDENTIFICADOR
- Propón 6-8 nombres que digan la promesa, fáciles de decir y de escribir, y pide los del usuario.
  Lecciones: al usuario no le gustan los nombres "castizos" ni los genéricos; **mide sus propuestas antes
  de opinar**.
- Mide cada candidato con `.venv/bin/python herramientas/nombre_canal.py "<Nombre 1>" "<Nombre 2>"…` (`--id <Id>` para
  otra @, con un solo nombre): búsqueda limpia (canales que se llaman igual o parecido y vídeos con el nombre en el título,
  de 20 resultados) y @ libre (404 = no existe, probablemente libre; se confirma al crearlo en Studio), con semáforo:
  rojo (@ ocupada o canal igual), ámbar (parecidos, 3+ vídeos o > 30 letras), verde. En la UI lo mide la pantalla del
  paso 3 sola: Claude solo escribe `analisis/mercado/nombres_propuestos.json`.
- PUNTO DE APROBACIÓN: nombre y @. Si cambian, `.venv/bin/python herramientas/canales.py renombrar <viejo> <nuevo>
  "<Nombre>"` (cambia carpeta, `"nombre"` de `canal.json` y títulos de `docs/` y `equipo/`; si solo cambia el nombre, el
  mismo slug dos veces). **Nunca `mv`**: la UI perdería los vídeos, conversaciones y gastos del canal.

## FASE D - ESTILO VISUAL
- Prepara `<canal>/videos/_pruebas/estilo/prueba.json` para `herramientas/laboratorio_estilo.py`: 3-4
  escenas típicas del canal (una por pilar, con personas, un objeto y un paisaje) × 4-6 estilos distintos
  de verdad (no variaciones del mismo). Escribe las escenas con el método del agente `director-arte`
  (ficha de plano: plano, sujeto, acción, lugar, época, luz; sin negaciones ni metáforas).
- Coste: estilos × escenas imágenes, gratis (Cloudflare ≈ 90/día; sin cuota, el Mac a ≈ 2 min cada una):
  `.venv/bin/python herramientas/cuota.py` antes.
- Enseña la hoja (`hoja.jpg`) y mira cada imagen a tamaño completo antes de recomendar. Itera con
  `--solo` y `--sufijo` hasta que el usuario elija (una imagen solo se rehace si cambia su prompt). En la UI pinta la
  hoja la pantalla del paso 4: Claude solo escribe `prueba.json`. Si hay pilares, prueba una **paleta por pilar**
  (`{paleta}` DELANTE de la escena en el estilo).
- PUNTO DE APROBACIÓN: estilo (y paletas). Rellena `canal.json` → `estilo` y `paletas`, y
  `<canal>/docs/concepto.md` → "Estilo visual".

## FASE E - VOZ Y NARRADOR
- Busca voces sin gastar: `.venv/bin/python herramientas/muestras_voz.py buscar "<términos>" [--genero male|female]`
  (voces de ai33 en el idioma del canal con su muestra oficial; consulta gratuita) y las gratuitas (Gemini, Azure).
  Escribe un párrafo del canal con las reglas de voz del `guionista` y la prueba en
  `<canal>/videos/_pruebas/voz/prueba.json` (formato en la cabecera de `muestras_voz.py`; en la UI, además
  `estilo_voz`, `narrador` y `marcas`). `muestras_voz.py hacer <prueba.json>` descarga las oficiales y locuta el
  párrafo con las gratuitas, con velocidad y entonación medidas (`muestras.json`). En la UI lo lanza la pantalla del
  paso 5: Claude solo escribe `prueba.json`.
  Si usas `gen_voz.py` a mano, **pasa siempre `--voz`**: sin ella usa la voz del canal activo, que puede ser de pago.
- Una muestra de pago por API (≈ 1 crédito por carácter, +15 % con marcas; `muestras_voz.py coste` lo calcula y
  `hacer --solo ID --gastar-ai33` la hace): **solo tras decir el coste y que el usuario diga que sí**.
- Mide la velocidad real de la muestra elegida (palabras / minuto) y pasa la locución por
  `herramientas/entonacion.py` (finales que suben, acentos en la última sílaba). Ajusta
  `palabras_por_minuto` y los rangos de `duraciones` si no son 170.
- PUNTO DE APROBACIÓN: voz, marcas de emoción permitidas y un párrafo de ejemplo del tono. Rellena
  `canal.json` → `voz`, `voces`, `estilo_voz` y `duraciones`, y "Voz y narrador" del concepto.

## FASE F - MARCA: TIPOGRAFÍA, COLORES Y MÚSICA
- Tipografía de títulos entre las de `recursos/fuentes/` (o una nueva con licencia libre, en
  `<canal>/recursos/fuentes/` y anotada en `recursos/LICENCIAS.md`): prueba 2-3 miniaturas con
  `herramientas/miniatura.py` sobre una imagen de la fase D.
- Colores (`acento`, `resaltado`, `texto`, `fondo`) sacados del estilo elegido.
- Música: la común (`recursos/musica/`: alegre, tranquilo, misterio) o piezas propias del canal con
  `herramientas/gen_musica.py <ambiente> -o <canal>/recursos/musica/<ambiente>.wav --semilla N`
  (las del canal tienen prioridad). Que el usuario las escuche.
- En la UI (paso 6) Claude solo escribe `<canal>/videos/_pruebas/marca/prueba.json` (formato en la cabecera de
  `herramientas/muestras_marca.py`); `muestras_marca.py hacer` pinta las miniaturas y prepara la música (gratis).
- En la UI (pasos 7-11) Claude escribe `videos/_pruebas/{reglas,equipo,alta,ideas}/prueba.json` (formato en la cabecera de
  `ui/backend/app/canal_cierre.py`) y rellena las fichas; el resto lo hace la UI.
- PUNTO DE APROBACIÓN: tipografía, colores y música. Rellena `fuentes`, `colores`, `pantalla_final`,
  `marca` y `hashtags_shorts` de `canal.json`, y "Títulos, series y miniaturas" del concepto.

## FASE G - CONFIGURACIÓN Y REGLAS
- Completa `<canal>/docs/concepto.md` (Estructura de un vídeo, Reglas de guion, Títulos) y el resto de
  `canal.json`: `frases_obligatorias`, `reglas_texto` (las de eleven_v3 vienen de la plantilla: bórralas
  si la voz es otra; añade las de la temática), `max_emociones_escena`, `max_segundos_imagen`.
- **Cumplimiento** (`canal.json` → `cumplimiento`): decide con el usuario, y escríbelo con su motivo, si el
  canal debe declarar «contenido alterado o sintético» en YouTube (voz imitada o clonada, personas reales,
  escenas realistas que puedan confundirse con grabaciones → SÍ), si usa afiliación, y qué licencias respalda
  la música, las fuentes y las imágenes. Enlaza la política vigente de YouTube: no la des por conocida.
- `.venv/bin/python herramientas/canales.py pendientes <slug>`: en `canal.json` y `docs/concepto.md` no
  debe quedar ninguna marca `<<RELLENAR>>` (las de `ideas.md`, `referentes.md`, `alta_youtube.md` y
  `equipo/` se rellenan en sus fases).
- PUNTO DE APROBACIÓN: concepto completo y configuración (resume lo que cambia respecto a la plantilla).

## FASE H - EQUIPO DE AGENTES
- Roles base (agentes de oficio en `.claude/agents/`): `narrativa`, `guionista`, `director-arte` y
  `estratega-youtube`, siempre. Opcionales según la temática:
  - `verificador`: canales que cuentan hechos (casi todos los de divulgación). Si no, borra su ficha.
  - `asesor-tematico`: cuando la temática pide un especialista (salud, finanzas, derecho, historia
    rigurosa, ciencia, público infantil…) o tiene políticas de YouTube delicadas. Propón la especialidad.
  Explica al usuario qué roles propones y por qué.
- Rellena cada ficha de `<canal>/equipo/` con lo decidido (sección por sección; la ficha manda sobre el
  oficio, así que solo lo propio del canal, sin copiar el oficio). Modelo: `plantillas/canal/equipo/` (y el equipo de un canal ya creado).
- Prueba las fichas: **los agentes se cargan al abrir la sesión**, así que usa un agente `general-purpose`
  que lea el oficio y la ficha y actúe como ese rol, con `CANAL=<slug>`: una propuesta de enfoque
  (narrativa), un párrafo de gancho (guionista), 2 fichas de plano (director-arte) y 3 títulos
  (estratega). Corrige las fichas con lo que falle.
- Si hace falta un rol que no existe ni como opcional, proponlo como agente de oficio nuevo (con ficha
  de plantilla en `plantillas/canal/equipo/`) y pide aprobación antes de crearlo.
- PUNTO DE APROBACIÓN: roles y fichas.

## FASE I - MARCA Y ALTA EN YOUTUBE
- `CANAL=<slug> .venv/bin/python herramientas/marca.py` → avatar, banner y vistas previas en
  `<canal>/marca/`. Enséñalos (el avatar a 88 px y el banner en el móvil) e itera los textos de
  `canal.json` → `marca`.
- Rellena `<canal>/docs/alta_youtube.md` (descripción, palabras clave, audiencia, categoría, @ y
  alternativas) y pásasela al usuario: el alta la hace él en YouTube Studio.
- PUNTO DE APROBACIÓN: cuando diga "hecho", comprueba el canal con yt-dlp (nombre, @, `channel_id`) y
  pon `url` en `canal.json` (y el `channel_id` en un comentario `_url`).

## FASE J - BANCO DE IDEAS
- 10-15 ideas repartidas por pilares, con enfoque y título con las fórmulas del canal. Mide cada una con
  `.venv/bin/python herramientas/saturacion.py "dato concreto" --amplio "tema general"` (y `--en` si
  ayuda) y apunta el semáforo con fecha en `<canal>/docs/ideas.md`. Nada en ROJO como candidata.
- Rellena `<canal>/docs/referentes.md` con lo de la fase A (o déjalo para el estratega si no se analizó).
- PUNTO DE APROBACIÓN: banco de ideas y candidata para el primer vídeo.

## FASE K - PRUEBA, ACTIVACIÓN Y CIERRE
- `CANAL=<slug> .venv/bin/python herramientas/probar_kit.py` (voz gratuita de Azure forzada, sin cuota de
  imágenes): montaje, subtítulos con la tipografía del canal, pantalla final y miniatura. Mira la hoja de
  control y la pantalla final. Diagnostica cualquier fallo.
- Rellena `<canal>/CANAL.md` (ficha rápida: resumen de lo decidido en todas las fases, con la estructura de la
  plantilla).
- `.venv/bin/python herramientas/canales.py pendientes <slug>` → "Nada por rellenar".
- Pregunta si se activa ya (`canales.py activar <slug>`: cambia el canal de todas las herramientas y
  agentes) o se sigue con el actual.
- Cierre: `estado_canal.json` → `"fase": "hecho"`; `<canal>/docs/progreso.md` (decisiones de cada fase y
  "Siguiente paso": el primer vídeo); `docs/progreso.md` del kit → "Estado" → Canales; commit (revisa `git diff --cached --name-only`: sin imágenes de prueba, audio ni `.env`); memoria.
- Siguiente paso para el usuario: primer `/nuevo-video` con la idea elegida.

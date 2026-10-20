---
description: Produce un Short de apoyo del canal activo (vertical, 30-55 s) que lleva a un vídeo largo del canal
argument-hint: "[vídeo largo o tema | continuar]"
---
# PRODUCCIÓN DE UN SHORT DE APOYO
Vídeo largo, tema o instrucción opcional: $ARGUMENTS

En los canales de vídeos largos (como el canal de referencia del kit) **los Shorts son escaparate, no producto** (`<canal>/docs/concepto.md` → "Formato" y
`docs/mercado.md`: pagan el 3-14 % de un largo y, desde el 01-02-2027, solo cobran con 10 M de
visualizaciones en 90 días). Los tráileres normales ya salen de `/nuevo-video` (campo `shorts` del
guion). Este comando es para un Short **extra** que empuje a un vídeo largo ya hecho: otra escena, un
dato que no cupo o un "¿sabías que…?" del mismo caso. Responde SIEMPRE en castellano. Carpeta
`<canal>/videos/SNNN-slug/` (numeración propia de Shorts) con `estado.json`
(`{"tipo": "short", "de_video": "NNN", "fase": "B", "completadas": [...], "notas": "..."}`) al terminar
cada fase; detente en cada PUNTO DE APROBACIÓN.

**Aprobaciones desde la interfaz** (`ui/`, página del vídeo → Guía): el usuario puede aprobar o pedir
cambios allí; se guardan en `estado.json` → `"aprobaciones"` (`{"<punto>": {"fecha", "desde": "UI",
"comentario"?}}`) y `"cambios_pedidos"` (`[{"punto", "texto", "fecha", "atendido": false}]`). Al empezar
y al llegar a cada PUNTO DE APROBACIÓN, léelos: una aprobación de la UI vale como su visto bueno (sigue sin
preguntar); los cambios pedidos sin atender, aplícalos, marca `"atendido"` con la fecha y vuelve a
presentar ese punto. Cuando apruebe en el chat, anótalo también en `"aprobaciones"` (`"desde": "chat"`)
para que la UI lo refleje. Conserva los demás campos al escribir `estado.json` (también `"version_esquema"`, que pone la app). **Mantén la guía de la UI al día**: al terminar un paso que la guía no puede comprobar por archivos (p. ej. `b-temas`, `b-hueco`; los ids están en `ui/backend/app/guia.py`), añade su id a `"pasos_hechos"` (lista) de `estado.json`. Puntos (Short): `sa-aprobar`, `sb-aprobar`, `sc-aprobar`, `sd-aprobar`. **`completadas` es historial, no estado**: la UI marca como desactualizada una fase cerrada cuyo contenido ha cambiado (voz con otro texto, imágenes por rehacer, montaje anterior a lo que contiene); en el chat de la UI ese estado te llega en el contexto.

## FASE A - ARRANQUE Y ENFOQUE
- Si $ARGUMENTS es "continuar", busca el `estado.json` de Short incompleto más reciente
  (`<canal>/videos/S*/`) y sigue desde ahí.
- Si `$ARGUMENTS` trae una carpeta o el `estado.json` más reciente es de la UI (`"creado_desde": "UI"`, fase A,
  con `tema` y quizá `apoya`: el vídeo largo al que apoya), **la carpeta ya existe: úsala y no crees otra**.
- Lee `CLAUDE.md`, `<canal>/CANAL.md`, `canal.json`, `<canal>/docs/concepto.md`, `<canal>/docs/historial.md` y, del vídeo largo al que
  apoya, `guion.md` y `fuentes.md` (sin vídeo largo detrás, pregunta antes: va contra el concepto).
  Ejecuta `cuota.py`.
- Propón 2-3 enfoques, cada uno con su gancho de ≤ 10 palabras y el dato de `fuentes.md` en el que se
  apoya. Mide el dato con `herramientas/saturacion.py` (regla del hueco): nada en ROJO.
- PUNTO DE APROBACIÓN: espera mi elección (desde la UI llega en `aprobaciones["sa-aprobar"].comentario`). Crea `<canal>/videos/SNNN-slug/` (si ya existía, desde la UI, no la crees ni la renombres).

## FASE B - GUION
1. **Guion** (agente `guionista`, modo Short tráiler): `guion.json` con `"tipo": "short"`,
   `"formato": "vertical"`, `"pilar"` (el del vídeo largo), `"titulo_pantalla"` (1-2 palabras entre
   *asteriscos*), `titulo` (≤ 40 caracteres) + 2 `titulos`, `descripcion` (con el enlace al vídeo largo),
   `fuentes`, `comentario_fijado` (una pregunta), 3-5 escenas, 90-140 palabras e imagen cada 2-4 s.
   Estructura: gancho → el dato con su contexto en 2-3 golpes que van a más → giro → final que remite
   al vídeo largo ("la historia entera, en el canal"). Sin "dale a like". Y `guion.md` legible.
2. **Verificación** (agente `verificador`) si el dato no estaba ya verificado en el vídeo largo.
3. **Prompts** (agente `director-arte`, con el `brief_visual.md` del vídeo largo al que apoya): estilo del canal, composición vertical, sujeto grande y centrado,
   nada importante en el tercio inferior (subtítulos y botones de la aplicación). Reutiliza imágenes del
   vídeo largo cuando encajen (en vertical se recortan: comprueba el encuadre).
4. `.venv/bin/python herramientas/revisar_guion.py <canal>/videos/SNNN-slug/guion.json` sin ERRORES.
- PUNTO DE APROBACIÓN: enséñame `guion.md` con la duración estimada y las imágenes.

## FASE C - VOZ E IMÁGENES
- **Voz**: por defecto, locución hecha por el usuario en la web de ai33 (la voz del canal: `canal.json` → `voz` y `<canal>/CANAL.md`):
  dale el texto listo para pegar (sin `{img}`; como mucho UNA marca de emoción por bloque). Cuando deje
  el mp3 en `voz/`, `"voz_archivo": "videos/.../voz/<archivo>.mp3"`. Alternativa automática: pregunta
  qué voz (AskUserQuestion) con el coste de cada opción (`canal.json` → `voces`; ai33 ≈ 1,15 créditos ×
  caracteres, con `cuota.py --previsto-ai33 N` antes; Gemini y Azure, gratis). Tras locutar,
  `herramientas/entonacion.py <canal>/videos/SNNN-slug` (gratis) y pregunta antes de repetir lo que marque.
- **Imágenes**: klein automático (`montar.py guion.json --solo-imagenes`; ≈ 12 imágenes ≈ 1.300 neuronas;
  sin cuota, el motor local: pregúntame antes). Revisa CADA imagen a tamaño grande con los criterios del
  `director-arte` y regenera hasta 2 veces lo que falle. Lee también `revision_imagenes.json` (marcas del
  usuario en la UI, con su motivo) y corrige esos prompts antes de rehacerlas (`--rehacer-imagenes EE-N --solo`).
- PUNTO DE APROBACIÓN: dime qué voces e imágenes has rehecho y si algo me conviene mirar.

## FASE D - MONTAJE Y PUBLICACIÓN
- Si la voz del canal es de ai33 (de pago): enséñame `montar.py guion.json --previsto-voz` (gratis), PREGUNTA y
  añade `--gastar-ai33` (sin él, montar.py se para antes de locutar); o locútala con el botón de la UI.
- `montar.py guion.json` → `final.mp4` (vertical, sin pantalla final), `subtitulos.srt` y
  `publicacion.md` (textos para YouTube Shorts, TikTok y Reels).
- `herramientas/fotogramas.py guion.json` y revisa `tmp/control.png`: título legible los 3 primeros
  segundos, subtítulos y rótulos sin tapar lo importante, ritmo de imágenes.
- Traduce `subtitulos.srt` a `subtitulos_en.srt`.
- PUNTO DE APROBACIÓN: dime qué mirar en `final.mp4` (sobre todo el primer segundo) y aplica mis cambios.
- Repasa `publicacion.md` con el agente `estratega-youtube` y guarda su versión en `publicacion_final.md`.
  Al subirlo, **enlázalo al vídeo largo** (en YouTube: "Vídeo relacionado" del Short). Recuérdame que la
  subida se hace con `docs/guia_subida.md` + `publicacion_final.md`.

## FASE E - CIERRE
- Añade el Short a `<canal>/docs/historial.md` (sección "Shorts", con el vídeo al que apoya).
- Muestra el consumo y la cuota restante (`cuota.py`).
- Actualiza `<canal>/docs/progreso.md` → "Siguiente paso".
- Commit en Git (solo textos: `guion.json`, `guion.md`, `fuentes.md`, `estado.json`, `publicacion.md` y
  los `.srt`; nada de vídeo, audio ni imágenes).

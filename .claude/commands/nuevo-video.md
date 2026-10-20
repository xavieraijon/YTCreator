---
description: Produce un vídeo largo completo del canal activo por fases, con puntos de aprobación
argument-hint: "[tema | continuar]"
---
# PRODUCCIÓN DE UN VÍDEO
Tema o instrucción opcional: $ARGUMENTS

Produce un vídeo completo del canal siguiendo `CLAUDE.md`, `canal.json` y `<canal>/docs/concepto.md`. Responde
SIEMPRE en castellano. Trabaja por fases; al terminar cada una guarda el estado en
`<canal>/videos/NNN-slug/estado.json` (`{"fase": "D", "completadas": [...], "duracion_objetivo": 5, "notas": "..."}`)
para poder reanudar, y detente en cada PUNTO DE APROBACIÓN.

**Agentes** (`.claude/agents/`): `narrativa` (escaleta y estructura), `guionista` (guion.json para voz),
`director-arte` (prompts, storyboard y revisión de imágenes), `verificador` (datos) y
`estratega-youtube` (títulos, miniaturas, publicación y métricas). Úsalos donde se indica: cada uno
trabaja con el contexto de su tarea y da una segunda opinión independiente. Pásales siempre la carpeta
del vídeo, la duración objetivo y lo que ya ha aprobado el usuario. Tú coordinas, revisas su trabajo y
presentas los resultados en los puntos de aprobación. Todos terminan con el mismo bloque (Hecho /
Archivos / Decisiones para el usuario / Riesgos o dudas): no des por buena su respuesta sin comprobar
los archivos que dicen haber cambiado.

**Aprobaciones desde la interfaz** (`ui/`, página del vídeo → Guía): el usuario puede aprobar o pedir
cambios allí; se guardan en `estado.json` → `"aprobaciones"` (`{"<punto>": {"fecha", "desde": "UI",
"comentario"?}}`) y `"cambios_pedidos"` (`[{"punto", "texto", "fecha", "atendido": false}]`). Al empezar
y al llegar a cada PUNTO DE APROBACIÓN, léelos: una aprobación de la UI vale como su visto bueno (sigue sin
preguntar); los cambios pedidos sin atender, aplícalos, marca `"atendido"` con la fecha y vuelve a
presentar ese punto. Cuando apruebe en el chat, anótalo también en `"aprobaciones"` (`"desde": "chat"`)
para que la UI lo refleje. Conserva los demás campos al escribir `estado.json` (también `"version_esquema"`, que pone la app). **Mantén la guía de la UI al día**: al terminar un paso que la guía no puede comprobar por archivos (p. ej. `b-temas`, `b-hueco`; los ids están en `ui/backend/app/guia.py`), añade su id a `"pasos_hechos"` (lista) de `estado.json`. La UI también puede **pasar de fase** (botón «Pasar a la fase X» cuando la guía no tiene nada pendiente): añade la fase a `completadas`, cambia `fase` y lo anota en `historial_fases`; al continuar, sigue desde esa fase. **`completadas` es historial, no estado**: la UI da una fase por hecha solo si además sigue al día (texto locutado = texto del guion, imágenes sin rehacer, `final.mp4` posterior a su voz, imágenes y música, y `montaje.json` con la huella del guion actual); si no, la marca como desactualizada y hay que ponerla al día antes de seguir. En el chat de la UI ese estado te llega en el contexto: úsalo, no lo deduzcas de `completadas`. El montaje (fase G) también se lanza desde la UI (herramienta «Montar el vídeo», gratis). Puntos (vídeo largo): `b-aprobar`, `c-aprobar`, `d-aprobar-empaquetado`, `d-aprobar-escaleta`, `d-aprobar-guion`, `e-aprobar`, `f-aprobar`, `g-aprobar`, `h-miniatura`, `i-aprobar-aprendizajes`. En la fase J no hay aprobaciones: el usuario registra desde la UI el enlace de YouTube y las métricas.

## FASE A - ARRANQUE
- Si $ARGUMENTS es "continuar", busca el `estado.json` incompleto más reciente en `<canal>/videos/`, resume en
  qué fase se quedó y sigue desde ahí.
- Si `$ARGUMENTS` trae una carpeta (`continuar NNN-slug`) o el `estado.json` más reciente es de la UI
  (`"creado_desde": "UI"`, fase A, con `tema`), **la carpeta ya existe: úsala y no crees otra**. Parte de su
  `tema`, `duracion_objetivo` y `referencia` si los trae.
- Lee `CLAUDE.md`, `<canal>/CANAL.md`, `canal.json`, `<canal>/docs/concepto.md`, `docs/mercado.md` (resumen: §5), `<canal>/docs/historial.md`
  y `<canal>/docs/ideas.md`, y la cabecera de `herramientas/montar.py` (formato del guion).
- Ejecuta `.venv/bin/python herramientas/cuota.py` y muestra la cuota disponible (neuronas reales).
- Comprueba que todo funciona con `.venv/bin/python herramientas/probar_kit.py` (≈ 1-2 min, sin cuota
  de imágenes). Si algo falla, diagnostícalo y guíame antes de seguir.

## FASE B - TEMA Y DURACIÓN
- **Pantallas guiadas de la UI (fases A y B):** si el usuario elige desde la UI, `estado.json` trae `propuesta_elegida`,
  `titulo_provisional`, `enfoque`, `gancho`, `duracion_objetivo`, `pilar`, `hueco` y `aprobaciones["b-aprobar"]`: la fase B
  está HECHA (no la repitas; sigue en la C con ese enfoque y esa duración). Un mensaje que empieza por «MODO UI» es un
  encargo suelto de una pantalla (p. ej. escribir `propuestas.json` con 3 enfoques, que la UI mide con
  `saturacion.py`): cúmplelo exactamente, sin pedir aprobación ni conversar.
- **Fases C a I desde la UI:** igual que la B. Cada tramo llega como un encargo «MODO UI» que pide, además de los
  documentos de siempre, un JSON de resumen que la UI dibuja como tarjetas: `investigacion.json` (fase C),
  `empaquetado.json` y `escaleta.json` (fase D). Escríbelos con el formato exacto que pide el mensaje. La UI deja en
  `estado.json` la elección del usuario (`titulo_elegido`, `miniatura_elegida`) y sus aprobaciones; léelas y no vuelvas
  a preguntar. «Pedir cambios» llega como un encargo con el texto del usuario: revisa lo hecho en lugar de rehacerlo.
  Los `avisos` de esos JSON son objetos `{"texto", "gravedad": "alta|media|baja", "que_hacer"}` (la UI los ordena y los
  explica). La UI guarda un diario del vídeo: al terminar cada turno que cambie archivos, explica en 2-3 líneas qué has
  cambiado y por qué (qué avisos resolviste y cómo).
- Si `estado.json` trae `tema` (carpeta creada desde la UI), ese es el tema pedido: valóralo y propón 3 enfoques
  en vez de los 5 temas. Si trae `referencia`, lanza `herramientas/estructura_referencia.py <URL>` y pásale a
  `narrativa` su `estructura.md` (nunca la transcripción).
- Si no hay tema: propón 5 (de `<canal>/docs/ideas.md` y nuevos), cada uno con su **pilar** (los de
  `<canal>/docs/concepto.md` → "Pilares"), **enfoque** (los de la sección "Enfoques" del agente `narrativa`),
  título con una fórmula del canal, gancho y por qué puede funcionar. Reparto entre pilares: el que fije
  `<canal>/docs/concepto.md` → "Pilares"; sin repetir `<canal>/docs/historial.md`.
  Si hay tema: valora si cumple la promesa ("parece inventado y es real") y propón 3 enfoques.
- **Vídeo de referencia (opcional)**: si el usuario da la URL de un vídeo que funcionó, lanza
  `.venv/bin/python herramientas/estructura_referencia.py URL` y enséñale `<canal>/analisis/estructuras/<id>/estructura.md`
  (y si hay `alerta_outlier.txt`, que la demanda no viene de la audiencia del canal). Solo se toma la ESTRUCTURA.
  Nunca leas ni pases a ningún agente `transcripcion.txt`: con el texto delante se parafrasea. El tema sigue
  pasando por la regla del hueco y por mi aprobación.
- **Regla del hueco** (`<canal>/docs/concepto.md`): mide cada tema o enfoque con
  `.venv/bin/python herramientas/saturacion.py "dato concreto" --amplio "tema general"` y enseña el
  semáforo con sus cifras. En un vídeo largo mide también el enfoque (la pregunta-título), no solo el
  tema: "el pulpo" está muy contado, "¿qué siente un brazo de pulpo cortado?" quizá no. Nada en ROJO;
  en ÁMBAR, solo con un ángulo propio que se pueda explicar en una frase. Anótalo en `<canal>/docs/ideas.md`.
- Pregunta la **duración** (con AskUserQuestion): las de `canal.json` → `duraciones` (cada clave numérica es
  una opción) o **personalizada**, nunca por debajo de `canal.json` → `duracion_minima` (el motivo está en su
  comentario; sin esa clave, no propongas menos de 8 min). Recomienda una según el
  material y explica lo que implica con `canal.json` → `duraciones`: palabras, actos ("paradas"),
  imágenes nuevas y días de cuota (≈ 90 imágenes/día en Cloudflare; el resto, en el Mac a ≈ 2 min por
  imagen): un vídeo de 12 min son ≈ 115 imágenes, más de un día de cuota.
- PUNTO DE APROBACIÓN: espera mi elección de tema, enfoque y duración. Desde la UI llega en `aprobaciones["b-aprobar"].comentario` (p. ej. «enfoque 1, 10 min»): léela y sigue sin volver a preguntar. Crea `<canal>/videos/NNN-slug/`
  (NNN = siguiente número; si la carpeta ya existía, desde la UI, no la crees ni la renombres), guarda `duracion_objetivo` y `pilar` en `estado.json` y marca la idea como
  "en curso" en `<canal>/docs/ideas.md`.

## FASE C - INVESTIGACIÓN
- Busca en la web y verifica cada dato en al menos 2 fuentes fiables (universidades, museos, revistas
  científicas, divulgación seria). Anota los datos con sus fuentes en `<canal>/videos/NNN-slug/fuentes.md`.
  Busca material para la duración elegida (un vídeo de 12 min necesita 4-5 actos con datos buenos).
  Separa lo **comprobado** de las **hipótesis** y de las **leyendas**, y apunta las cifras famosas que
  circulan sin respaldo: la promesa del canal es "…y real".
- Busca también **enlaces de afiliación** honestos del tema (libros o audiolibros del caso) para la
  descripción; apúntalos en `fuentes.md` → "Afiliación".
- Descarta los datos dudosos y avísame si el tema tiene menos base de la esperada (o si da para
  menos minutos de los elegidos). Si algo es una leyenda o está discutido, el guion lo dirá.

## FASE D - ESCALETA Y GUION
0. **Empaquetado** (agente `estratega-youtube`): `<canal>/videos/NNN-slug/empaquetado.md` con el ángulo,
   5 títulos, el concepto de miniatura (qué muestra y qué oculta, texto de 2-4 palabras), la promesa en
   una frase que el gancho confirmará en los primeros 10 s y el riesgo de clickbait. Va ANTES de la
   escaleta: el guion tiene que cumplir lo que prometen el título y la miniatura, no al revés.
   PUNTO DE APROBACIÓN: enséñame ángulo, los 3 mejores títulos y el concepto de miniatura.
1. **Escaleta** (agente `narrativa`): `<canal>/videos/NNN-slug/escaleta.md`, escena a escena con gancho
   (que confirma la promesa de `empaquetado.md`), contexto, actos con su pregunta → recompensa y sus
   bucles abiertos, explicación (comprobado frente a hipótesis), giro final, cierre con pregunta a los
   comentarios y siguiente vídeo, los fragmentos candidatos a Short tráiler y la tabla de recompensas
   (con aviso si alguna es floja o repetida).
   Si hay vídeo de referencia, pasa a `narrativa` la ruta de su `estructura.md` y `metricas.json` (no la
   transcripción): imita la arquitectura (qué hace cada tramo, cuánto dura, dónde van preguntas, giro y
   CTA), no sus frases, y la adapta al tema y a las reglas del canal.
   PUNTO DE APROBACIÓN: enséñamela resumida, con la tabla de recompensas; es mucho más barato cambiar
   aquí que en el guion.
2. **Guion** (agente `guionista`): `guion.json` (con `duracion_objetivo`) y `guion.md` a partir de la
   escaleta aprobada, con las reglas de voz de `<canal>/docs/concepto.md`, y `"pilar"` (elige la paleta de las
   imágenes). Shorts tráiler con `"vertical": true` y `"gancho"`.
3. **Verificación** (agente `verificador`): comprueba los datos del guion; aplica sus correcciones
   (con el agente `guionista` si cambian frases enteras).
4. **Revisión de estructura** (agente `narrativa`): revisa el guion ya escrito
   (ritmo, bucles sin cerrar, datos contados con más seguridad de la que tienen, dónde se iría el
   espectador). Aplica los
   cambios que tengan sentido con el `guionista` y enséñame los que sean discutibles.
5. **Prompts** (agente `director-arte`), con el texto ya definitivo: primero el **brief visual**
   (`<canal>/videos/NNN-slug/brief_visual.md`: época, lugar, vestuario, objetos, personajes fijos; plantilla en el
   agente) y después un prompt por imagen con su ficha de plano, reutilizaciones y miniaturas, para que
   cada imagen cuente lo que dice la voz en ese tramo. Enséñame el brief antes de los prompts.
6. **Revisión automática**: `.venv/bin/python herramientas/revisar_guion.py <canal>/videos/NNN-slug/guion.json`
   sin ERRORES (los avisos, corregidos o justificados). Con vídeo de referencia, además
   `.venv/bin/python herramientas/estructura_referencia.py --comparar <canal>/videos/NNN-slug/guion.json URL`
   (sale con error si el solape pasa del 3 %: reescribe las escenas que señala).
- Muestra un resumen: duración estimada, imágenes nuevas (+ las verticales de los Shorts), neuronas
  (≈ 110 por imagen + 3 fondos de miniatura), coste de voz (ai33: ≈ 1,15 créditos × caracteres del
  texto; Azure/Gemini: gratis) y si cabe según `cuota.py --previsto-neuronas N --previsto-ai33 C` (o
  `--previsto-caracteres M` si la voz es de Azure).
- **Antes de enseñarme el guion**, guarda la copia para el bucle de mejora:
  `cp <canal>/videos/NNN-slug/guion.json <canal>/videos/NNN-slug/guion_generado.json` (el guion tal como
  sale del equipo, antes de mis cambios). Si ya existe, no la sobrescribas.
- PUNTO DE APROBACIÓN: enséñame `guion.md` y espera mi visto bueno o mis cambios.

## FASE E - VOZ
- **Voz por la API (flujo recomendado desde el 2026-09-30, a petición del usuario):** en la UI, pestaña
  «Voz y montaje» → tarjeta «Locución»: da los bloques que faltan y su coste exacto
  (`montar.py guion.json --previsto-voz`, gratis) y lanza `montar.py --solo-voces … --gastar-ai33` con el coste
  confirmado (primero un bloque de prueba, después el resto). Desde la terminal, lo mismo: enséñame el
  `--previsto-voz`, PREGUNTA, y usa `--gastar-ai33` (sin él, montar.py se para antes de gastar en voz de ai33).
  Desde el chat de Claude de la UI no se puede locutar: indica el botón.
- **Alternativa: locución hecha por el usuario en la web de ai33.**
  Dale el texto completo listo para pegar (sin `{img}` ni efectos; con marcas de emoción solo si usa
  eleven_v3, y como mucho UNA por bloque: varias marcas distintas hacen saltar el tono). Tono de
  documental sereno: si la locución sale eufórica, se repite ese bloque. Cuando deje el
  mp3 en `voz/`, pon `"voz_archivo": "videos/.../voz/<archivo>.mp3"` en el guion: montar.py lo alinea
  (reconocimiento de Azure, gratis), lo reparte por escenas y abre los huecos de los efectos, sin gastar.
  Alternativa automática (pregunta antes, con el coste): pregunta qué voz usar (AskUserQuestion), con el coste de cada opción:
  la del canal (`canal.json` → `voz`; si es ai33, de pago: ≈ 1,15 créditos × caracteres del guion) o las
  gratuitas de `canal.json` → `voces` (Gemini, Azure). Guarda la elegida
  en el `"voz"` del guion.json y, si es ai33, muestra antes `cuota.py --previsto-ai33 N`.
- Un bloque de prueba (`montar.py guion.json --solo-voces 1,2,3 --gastar-ai33` si es ai33, o el botón de la
  UI) y dime dónde escucharlo. PUNTO DE APROBACIÓN.
- Genera el resto (`--solo-voces` con todas, `--gastar-ai33` si es de pago). Revisa los avisos de voz cortada.
- **Entonación**: `.venv/bin/python herramientas/entonacion.py <canal>/videos/NNN-slug` (gratis) marca los finales
  que suben como una pregunta, las palabras con el acento en la última sílaba y los cortes (la voz arranca, se
  calla en seco y vuelve a empezar: fallo aleatorio del modelo, se arregla con otra toma), y da los bloques a repetir
  con su coste. Enséñame la lista y PREGUNTA antes de `--rehacer-voces N --gastar-ai33` (cada toma de ai33 cuesta; la
  web de ai33 también). Si un tramo falla dos veces, cambia la frase con las reglas de voz del guionista.
  Con `"voz_archivo"` (locución de la web) todo es un bloque: dime qué frases repetir en la web.
  Si una frase me suena rara aunque la herramienta no la marque, también `--rehacer-voces N`.
- **Cambios pedidos en `e-aprobar` sobre el TEXTO** (frases poco naturales, finales raros en muchas escenas):
  no repitas tomas. Encarga al guionista reescribir las escenas afectadas con sus reglas de voz y lo que pide
  el usuario (sin tocar datos verificados ni la duración), enséñame el antes/después, actualiza guion.md y marca
  el cambio como atendido. Los bloques cuyo texto cambia vuelven a salir pendientes en la tarjeta «Locución»
  (la firma cambia): dile que los locute desde allí (de pago), probando primero uno.

## FASE F - IMÁGENES
0. **Imágenes: klein automático es la vía principal** (≈ 100-130 imágenes por vídeo: a mano no es
  sostenible; `<canal>/docs/concepto.md` → "Estilo visual"). Google AI Pro a mano solo para lo que más luce:
  fondos de miniatura y 1-3 clips animados de Flow (Veo) desde una imagen de inicio (`animEE-N.mp4`).
  Para eso, escribe `google/PROMPTS.md` (prompt autónomo en el estilo del canal, con el nombre de archivo;
  para miniaturas, con un lado vacío para el texto). Cuando el usuario deje los archivos en `google/`
  (si falta alguno, búscalo por fecha), revísalos a tamaño grande y conéctalos con `"imagen"` / `"video"`
  (+ `"desde"`).
1. **Boceto (recomendado en vídeos nuevos o de 10 min)**: `montar.py guion.json --boceto` genera todas
   las imágenes a baja resolución en el Mac, sin cuota (unos 50 s cada una en un Apple Silicon de gama alta; depende del equipo), `tmp/boceto_contactos.png`
   y `boceto.mp4` con la voz. Que el agente `director-arte` revise la hoja; dime dónde ver el boceto.
   PUNTO DE APROBACIÓN (opcional: pregúntame si lo quiero, porque ocupa el portátil un rato).
2. **Definitivas**: `montar.py guion.json --solo-imagenes` (comprueba antes la cuota con `cuota.py`; si
   no cabe, por partes). Incluye las verticales de los Shorts (`img/vertical/`, ids `vEE-N`).
3. Revisa `tmp/contactos.png` con el agente `director-arte` (los criterios de revisión están en su
   sección "Revisar las imágenes": estilo del canal y paleta del pilar, anatomía, época y lugar sin
   anacronismos, sin texto deformado y que cuente lo que dice la voz). Regenera hasta 2 veces
   con `--rehacer-imagenes EE-N` (o `vEE-N`) y anota los problemas en `estado.json`. Lee también
   `revision_imagenes.json` (marcas del usuario en la UI: `"estado": "mal"` con su `"motivo"`): corrige el
   prompt de esas imágenes según el motivo (con el `director-arte`) antes de rehacerlas; para rehacer solo
   unas, `montar.py guion.json --solo-imagenes --rehacer-imagenes EE-N --solo`. Si una imagen local
   sale perfecta y hay que conservarla, su semilla está en `img/EE-N.semilla` (campo `"semilla"`).
- Si se agota la cuota de Cloudflare, `montar.py` sigue solo con el motor local (≈ 2 min por imagen en el
  Mac). Si prefiero esperar (el portátil es de trabajo), usa `--motor cloudflare`, guarda el estado y dime
  cuándo continuar según `cuota.py` (`/nuevo-video continuar`).

## FASE G - MONTAJE Y CONTROL DE CALIDAD
- Música de fondo (opcional, DE PAGO): por defecto, la propia del canal (gratis). Si el usuario quiere la de
  Suno: `herramientas/musica_ai33.py guion.json --estado` (ambientes y prompts), ajusta el prompt de cada ambiente
  a la historia (≤ 500 caracteres, instrumental, para narración), di el coste (`--previsto`, ≈ 3.600 créditos por
  ambiente) y PREGUNTA; con su sí, `--encargar <ambiente> --gastar-ai33` (o el botón de la UI) y que elija versión
  (`--elegir <ambiente> N`). montar.py usa la elegida.
- `montar.py guion.json` (genera final.mp4 con pantalla final, subtitulos.srt, Shorts, miniaturas y
  publicacion.md).
- `herramientas/fotogramas.py guion.json` y revisa `tmp/control.png`: sincronía imagen-voz, rótulos
  legibles, nada cortado, ninguna imagen de más de 10 s. Revisa también un fotograma de cada Short
  (título arriba, subtítulos, imagen vertical) y de la pantalla final.
- Corrige lo que encuentres y vuelve a montar.
- PUNTO DE APROBACIÓN: dime qué mirar al ver `final.mp4` y los Shorts, y aplica mis cambios.

## FASE H - MINIATURA Y PUBLICACIÓN
- Enséñame las 3 miniaturas y recomienda una (agente `estratega-youtube`), comprobando que título y
  miniaturas siguen cumpliendo `empaquetado.md` (si han cambiado, por qué); recuerda que las 3 se pueden
  subir a "Probar y comparar". PUNTO DE APROBACIÓN.
- **Subtítulos en inglés**: traduce `subtitulos.srt` a `subtitulos_en.srt` (mismos números y tiempos;
  traducción natural, no literal; el nombre del canal no se traduce).
- **Cumplimiento** (obligatorio antes de subir): lee `canal.json` → `cumplimiento` (contenido sintético,
  derechos de música, imágenes y voz, afiliación) y comprueba que este vídeo lo respeta: personas reales o voces
  imitadas, escenas realistas que puedan confundirse con grabaciones, música o fuentes con licencia. Si algo no
  encaja con lo declarado, dilo y que decida el usuario; las respuestas del formulario de YouTube salen de ahí,
  no de `docs/guia_subida.md`. PUNTO DE APROBACIÓN.
- Repasa `publicacion.md` con el agente `estratega-youtube` y guarda su versión en `publicacion_final.md`
  (montar.py sobrescribe `publicacion.md` cada vez que monta). Al cerrar, recuérdame que la subida se hace
  con `docs/guia_subida.md` + `publicacion_final.md`. (títulos, descripción con fuentes y
  capítulos reales, enlaces de afiliación con el aviso "(enlace de afiliado)", etiquetas, comentario
  fijado, textos de los Shorts para YouTube, TikTok y Reels y
  lista de comprobación de subida, con pantalla final y "Probar y comparar").

## FASE I - CIERRE
- **Bucle de mejora del guion**: `.venv/bin/python herramientas/comparar_guion.py <canal>/videos/NNN-slug`
  (guion entregado frente al locutado) y, con esa salida, el agente `guionista` escribe
  `<canal>/videos/NNN-slug/aprendizajes.md` (cambios de estructura y de estilo → reglas, patrones
  repetidos y propuesta para su ficha). PUNTO DE APROBACIÓN: enséñame las reglas propuestas; las que
  apruebe van a `<canal>/equipo/guionista.md` → "Reglas aprendidas de tus ediciones" (o al oficio si
  valen para cualquier canal). Si no hay `guion_generado.json` (vídeos anteriores al bucle), sáltalo y dilo.
- Añade el vídeo a `<canal>/docs/historial.md` (con la duración real y el pilar) y
  marca la idea como "usada (NNN)" en `<canal>/docs/ideas.md`.
- Muestra el consumo del vídeo y la cuota restante (`cuota.py`).
- Propón 3 ideas nuevas inspiradas en este vídeo, mídelas con `saturacion.py` y añádelas a `<canal>/docs/ideas.md`
  con su pilar y su semáforo.
- Recuérdame hacer las 4 capturas de YouTube Studio (`<canal>/analisis/entrada/LEEME.md`) a las 48 h y a los
  7 días de publicar. Si te paso métricas (CTR, retención), analízalas con el agente `estratega-youtube` y propón ajustes a
  `<canal>/docs/concepto.md` (aplícalos solo con mi aprobación).
- Actualiza `<canal>/docs/progreso.md` → "Siguiente paso" (vídeo terminado, qué falta: subirlo, métricas).
- Haz commit en Git (sin los vídeos: `<canal>/videos/*` no se sube, salvo `guion.json`,
  `guion_generado.json`, `guion.md`, `empaquetado.md`, `escaleta.md`, `fuentes.md`, `aprendizajes.md`,
  `estado.json`, `publicacion.md` y los `.srt`).

## FASE J - PUBLICADO Y RESULTADOS
- Se hace **después de subir** el vídeo (en la fase I, «Sube el vídeo»). El usuario registra en la UI el enlace y la
  fecha de publicación (`estado.json` → `"publicacion"`: `{"url", "fecha", "titulo"}`) y, a las 48 h y a los 7 días,
  los números de YouTube Studio (`"metricas"`: `{"48h": {...}, "7d": {...}}` con `visitas`, `ctr`, `retencion`,
  opcionalmente `impresiones`, `horas_vistas`, `suscriptores`, `notas`). Léelos; no los escribas tú.
- Con las métricas registradas, si el usuario lo pide: analízalas con el agente `estratega-youtube`, compáralas con
  la mediana del canal (`<canal>/docs/historial.md`), anota la duración real y las cifras en `historial.md` y
  propón ajustes a `<canal>/docs/concepto.md` (solo con su aprobación). Con la fase J completa el vídeo pasa a `cerrado`.

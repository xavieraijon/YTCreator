# Concepto del canal

> Documento de referencia para escribir guiones, crear imágenes y decidir temas.
> Estado: DEFINITIVO (confirmado por el usuario el 2026-09-23; ampliado ese mismo día: el canal
> no es solo de historia, cubre también ciencia, animales, cuerpo humano, IA y actualidad).
> **Cambio de formato (decisión del usuario, 2026-09-24):** Tok ya no habla en primera persona. Cuenta
> la historia un **narrador en tercera persona** (estilo Pocoyó) que habla de Tok, con Tok y con el
> espectador; Tok solo dice su saludo de marca, un clip fijo (`{toc_toc}`). Motivo: las frases
> telegráficas de Tok sonaban "como si tuviéramos todo el contexto"; con narrador, "mucho más natural y
> dinámico". El resto del canal (temas, público, rigor, estructura, Shorts) se mantiene.

## Nombre
**Los Viajes de Tok.** El robot se llama **Tok** (suena a reloj y al "toc, toc" de llamar a la puerta).
Descartados: "Tok en el Tiempo" (limitaba el canal a la historia; el usuario quiere también ciencia,
animales, cuerpo humano, IA y actualidad), "TokTok Time" (confusión con TikTok y con un canal infantil), "Tic-Tac" (marca
registrada), "Knock Tock Travels" (el chiste "knock knock" no se entiende en España; nombre en inglés).

## Idea en una frase
Un pequeño robot torpe y entusiasta viaja a donde haga falta (al pasado, al futuro, al fondo del
mar o al interior de tu cuerpo) para responder preguntas curiosas… y siempre acaba liándola. Un
narrador lo cuenta, le habla y nos habla a nosotros.

## Temática
Ciencia y curiosidades, historia, y tecnología e IA (elección del usuario en la FASE 6), contadas
como un viaje. Cada vídeo responde una pregunta y Tok viaja a donde está la respuesta:
- **Al pasado:** historia, cómo se inventaron las cosas, cómo se vivía.
- **Al futuro:** IA, tecnología, "¿qué pasará si…?".
- **Al presente por dentro:** la máquina también encoge a Tok (cuerpo humano, células, colmenas).
- **A cualquier lugar:** animales en su hábitat, el fondo del mar, el espacio, un laboratorio.
- **Actualidad:** noticias de ciencia y tecnología explicadas (evitando temas polémicos o trágicos).
Regla de equilibrio: en cada tanda de 4 vídeos, como máximo 2 de historia.

## Público
Todos los públicos, con humor pensado para adolescentes y adultos (12-45 años).
En YouTube se marca **"No, no está hecho para niños"**: el estilo es de dibujos, pero el tono,
el vocabulario y las referencias no son infantiles.

## Personaje protagonista (se diseña en la FASE 7)
- **Nombre:** Tok.
- **Qué es:** un robot pequeño y algo destartalado, de la época actual, con una máquina de viajar
  casera que va a cualquier época, lugar o tamaño… y funciona "casi siempre".
- **Personalidad:** curioso, muy entusiasta, se cree un experto y no lo es. Como Pocoyó, **no habla**:
  se expresa con gestos, caras (poses `sorprendido`, `confundido`, `saludo`...) y efectos de sonido
  (`{boing}`, `{error}`, `{pop}`, `{record_scratch}`...). Lo que piensa y hace lo cuenta el narrador.
- **Su única frase (desde el 2026-09-24):** el saludo de marca **"¡Toc-toc! ¿Se puede?"**, un clip fijo
  con voz robótica divertida (`recursos/sfx/toc_toc.wav`, ≈ 1,6 s). En el guion se escribe `{toc_toc}`,
  siempre entre frases. El narrador nunca dice el saludo por él.
- **Respuestas cortas (desde el 2026-09-25, petición del usuario):** Tok puede contestar al narrador con
  una frase de 1-3 palabras con su misma voz robótica, como mucho una o dos por vídeo (primera:
  `{tok_pues_si}` "¡Pues sí!", tras "¿Vienes a ver amanecer?" en S001). Se crean gratis con
  `herramientas/voz_tok.py "frase" recursos/sfx/tok_<nombre>.wav` (Gemini Puck + filtro metálico, la
  receta del saludo) y se registran en `canal.json` (`niveles_efectos`, `subtitulos_efectos`,
  `efectos_con_hueco`).
- **Gags recurrentes** (los cuenta el narrador; Tok los "actúa"):
  - La máquina falla y aterriza donde no debe (efecto `record_scratch`): "Eso no es Egipto, Tok. Eso es
    un aparcamiento."
  - Intenta usar tecnología moderna donde no toca (busca wifi en el año mil trescientos, cobertura
    dentro de un estómago) y el narrador se lo hace notar.
  - Siempre pierde una tuerca en cada viaje: se ve caer (`{pop}` o `{boing}`) y el narrador lo comenta
    de pasada ("Y sí, Tok, se te ha vuelto a caer una tuerca."). Mejor en un momento distinto de cada
    vídeo, y sin explicarlo: el espectador fiel lo pilla.
  - **Salida:** Tok pulsa el botón de su máquina y el narrador lo anuncia: **"¡Iniciando viaje!"** +
    `{whoosh}` (ver "Estructura fija").
  - **Saludo de marca al llegar a cada destino:** el narrador lo prepara ("Y Tok, como siempre, llama a
    la puerta:"), suena `{toc_toc}` y el narrador **le contesta** situando el destino: "Claro que se
    puede, Tok. Bienvenido al año mil trescientos." El juego de palabras se adapta al destino en la
    respuesta del narrador (o en la preparación: "Tok llama a la puerta de una colmena:").
- **Voz:** Tok no tiene voz propia aparte del clip. Las voces descartadas para Tok (Marta, Tristán HD)
  ya no aplican; ver "El narrador".

## El narrador (desde el 2026-09-24)
- **Quién es:** una voz en off en tercera persona, cálida, alegre y emocionada, como el narrador de
  Pocoyó. No se ve. Es cómplice del espectador y paciente con Tok.
- **Qué hace:** cuenta lo que hace Tok, **habla con Tok** ("No, Tok, tu reloj funciona perfectamente"),
  **habla con el espectador** ("¿Y quién acaba de llegar?", "¿Sabes cuánto tarda?") y **explica**: da el
  contexto antes del dato, con frases completas.
- **Voz (desde el 2026-09-24, elegida por el usuario escuchando 8 muestras):** "Daniel" de ElevenLabs en
  **ai33.pro** (de pago, ≈ 1 crédito/carácter), modelo `eleven_v3` con **marcas de emoción** en el texto
  (`videos/_pruebas/ai33/voz/6_daniel_v3_marcas.mp3`: "el tono enérgico de Puck con la naturalidad de
  Daniel"). Alternativas gratuitas en `canal.json` → `voces`: Gemini "Puck" (con `estilo_voz`) y Azure.
  Antes de locutar, `/nuevo-video` y `/nuevo-short` preguntan qué voz usar.
- **Ejemplo validado por el usuario:** `videos/_pruebas/voces/narrador.txt` (Venus: "un día dura más
  que un año"). Es la referencia de tono.

## Cómo habla el narrador
Buenas frases (así se escribe):
1. "Esto es Venus, el planeta vecino de la Tierra, siempre envuelto en nubes." (sitúa antes del dato)
2. "Y el que acaba de llegar, con su silla plegable y sus gafas de sol, es Tok." (presenta a Tok por lo
   que hace y por lo que se ve)
3. "Tok mira su reloj, ¿se habrá estropeado? No, Tok, tu reloj funciona perfectamente." (cuenta lo que
   piensa Tok y le contesta)
4. "¿Y sabes cuánto tarda Venus en dar una vuelta? ¡Doscientos cuarenta y tres días!" (pregunta al
   espectador antes de la cifra)
5. "Pero Tok, ¡estás mirando hacia el lado equivocado!" (le habla a Tok en el momento del gag)
6. "Y Tok, como siempre, llama a la puerta: {toc_toc} Claro que se puede, Tok. Bienvenido al año mil
   trescientos." (saludo preparado y contestado)
7. "Tok busca wifi por todo el castillo, pero en el año mil trescientos lo más rápido que hay es un
   caballo." (anacronismo contado de un tirón)
8. "Tok pulsa el gran botón naranja de su máquina. ¡Iniciando viaje! {whoosh}" (salida)

Malas frases (el formato de antes, ya no):
- "Venus. Nubes. Calor. Mi reloj no va." (telegráfica, en primera persona y sin contexto: parece que el
  espectador ya sabe de qué hablamos)
- "¡Uy! ¿En serio? Doscientos cuarenta y tres días." (reacción y cifra sin decir qué se mide)
- "Toc-toc, ¿se puede ver amanecer en Venus?" dicho por el narrador (el saludo es de Tok: `{toc_toc}`)

## Estilo visual (E2 "dibujos de TV infantil", elegido por el usuario el 2026-09-24)
- **Estilo E2:** dibujo 2D de serie infantil moderna: contornos negros gruesos y suaves, formas
  redondeadas, colores planos alegres, fondo de color suave y suelo de color (nunca blanco), mucho
  espacio vacío, sin sombras, sin texto. Elegido en el laboratorio de estilos
  (`videos/_pruebas/estilos/`); el de palotes negro sobre blanco quedó "soso".
- **Modelo:** FLUX.2 klein 4B (gratis; Cloudflare ≈ 95 imágenes/día y el Mac sin límite; Apache 2.0).
  klein 9B dibuja algo mejor pero da para ≈ 7 imágenes/día; ai33 (de pago) es lento y no mejora
  claramente (`docs/historia_kit.md`, en la raíz del proyecto).
- **Tok (hoja de personaje: `personaje/hoja_personaje_tok.png`):** cabeza cuadrada naranja con orejas
  redondas naranjas y dos tornillos arriba, ojos grandes blancos con pupila negra (siempre), antena
  ondulada con **bombilla amarilla encendida**, cuerpo cuadrado naranja con un reloj sencillo de dos
  agujas (sin números), brazos y piernas de palote negro, manos de guante blanco y pies ovalados blancos.
  Exactamente dos brazos y dos piernas. **Siempre se le ven los dos ojos** (petición del usuario,
  2026-09-24): en las escenas nunca de perfil puro; si mira a un lado, de tres cuartos. La vista
  `tok_lado` es solo para la hoja de giro.
- **Extremidades SIEMPRE negras y macizas** (petición del usuario, 2026-09-25). La referencia
  `tok_frente.png` tenía los brazos blancos y huecos mientras el texto pedía negros: klein mezclaba y
  salían brazos blancos, grises, huecos o de más. Se rellenaron de negro brazos y piernas en las 7 poses
  de `personaje/ref/` (`personaje/brazos_negros.py`; originales en `personaje/original/ref_brazos_blancos/`)
  y la hoja se recompone con `personaje/componer_hoja.py`; `{tok}` lo repite en el texto.
- **Referencias:** `personaje/ref/`: giro (tok_frente, tok_perfil = tres cuartos caminando, tok_lado,
  tok_espaldas) y expresiones (tok_saludo, tok_sorprendido, tok_confundido). Los guiones usan
  `tok_frente` (`canal.json` → `referencias`); las demás sirven como pose en miniaturas y pantalla final
  (`canal.json` → `poses`). La hoja de palotes anterior está en `personaje/original/ref_palotes/`.
  Script que la generó: `personaje/e2/hoja_e2.py`.
- **Receta de prompts:** describir a Tok con palabras (`{tok}` = la descripción de `canal.json`), no
  como "el robot de la referencia"; no poner escenas de ejemplo como referencia. Correcciones del
  laboratorio para klein 4B: la expresión de Tok al principio del prompt; el suelo con color y
  textura nombrados ("reddish-orange Venus ground filling the lower third"), nunca "white ground";
  los relojes "with only two hands, no numbers"; objetos con su forma exacta ("a blue folding camping
  stool without armrests"); probar otra semilla antes de reescribir.
- **Otros personajes:** en el mismo estilo de dibujos de TV (ya no palotes), descritos con forma y color.
- **Como Tok no habla, sus reacciones se ven:** cada imagen enseña lo que el narrador cuenta que hace
  Tok (mira el reloj, gira la silla, busca cobertura), con una cara clara.
- **En guion.json:** el estilo y `{tok}` vienen de `canal.json`; en cada prompt escribir `{tok}` donde
  va Tok, p. ej. `"{tok} knocking on a castle door"`, y `"personaje": true`.
- Las imágenes varían: si una sale fuera de estilo, `montar.py --rehacer-imagenes N`.

## Formatos que funcionan (de `docs/referentes.md` y `docs/analisis_guiones.md`, 2026-09-24)
Cada tema se plantea con uno de estos formatos, probados en los vídeos más vistos de canales parecidos
(Kurzgesagt, Life Noggin, Dr. Binocs, OverSimplified, Sam O'Nella, TED-Ed, MinuteEarth):
1. **"¿Qué pasaría si…?"**, mejor si le pasa **a ti** o a tu cuerpo (el formato más repetido en los
   virales). Tok hace de **conejillo de indias**: lo prueba por el espectador.
2. **"Tu cuerpo si…" / dentro de tu cuerpo** (sistema inmune, aguantar el pis, no dormir).
3. **"Por qué era un asco ser…"** (historia con humor: pirata, soldado romano, hiena macho).
4. **"¿Puedes resolverlo?"**: un reto o acertijo al espectador; Tok lo intenta y falla primero.
5. **Comparación de escala** (la estrella más grande, la Tierra el doble de grande).
6. **La pregunta cotidiana** con respuesta sorprendente (¿de dónde viene tu apellido?).
7. **"Tok contra el mito"**: el narrador enumera lo que todos creemos y el vídeo lo desmonta (o lo
   confirma) uno por uno.
La historia larga funciona en **series por partes**; cuando haya 5-6 vídeos de un tema, se sube una
**recopilación**.

## Regla del hueco: gancho SIN saturación (desde el 2026-09-27)
Origen: tras subir S001 (Venus), YouTube estaba lleno de Shorts con el mismo dato ("en Venus un día dura
más que un año": 26 clones de 40 resultados, 6 de los últimos 90 días, mediana de 22 visitas). Con un
dato así no se compite: el espectador ya lo ha visto y YouTube tiene cien vídeos iguales que enseñar.
- **Buen tema = tema AMPLIO con público × dato CONCRETO que casi nadie cuenta.** "Venus" tiene
  público; "un día dura más que un año" está quemado. Buscar el **dato de al lado**: del mismo tema
  popular, el que no sale en las listas de "datos curiosos".
- **Se mide, no se intuye**, con `herramientas/saturacion.py "dato concreto" --amplio "tema general"`
  (y `--en "…"` si hay versión en inglés). Semáforo: 🟢 VERDE hueco · 🟡 ÁMBAR competido (solo con
  ángulo propio claramente distinto) · 🔴 ROJO quemado (no se produce: cambiar de dato) · ⚪ GRIS frío
  (solo si el gancho es muy fuerte por sí mismo).
- Cada idea de `docs/ideas.md` lleva su semáforo con fecha; se vuelve a medir antes de producirla si
  tiene más de 1 mes (una ráfaga de clones puede empezar en semanas).
- **Oportunidades**: muy contado en inglés y poco en castellano (traerlo); un clon antiguo con muchas
  visitas y nada reciente (demanda probada sin competencia actual); y fechas con búsquedas propias
  (23 de abril para Cervantes, efemérides, eclipses): subir 1-2 semanas antes.
- El ángulo de Tok (narrador + Tok de conejillo de indias) NO basta por sí solo para salvar un dato
  quemado: en el feed de Shorts el espectador desliza antes de ver quién lo cuenta.

## Formato de cada vídeo
- **Duración:** se elige en cada vídeo (decisión del usuario, 2026-09-24): **3, 5, 10 minutos o
  personalizada**. Cifras orientativas en `canal.json` → `duraciones`, calculadas a **≈ 160 palabras/min**
  (ritmo medido del narrador Puck; los canales de referencia van a 130-175): 3 min ≈ 450-520 palabras y
  2 paradas; 5 min ≈ 750-880 y 3 paradas; 10 min ≈ 1.500-1.650 y 5-6 paradas. Los anuncios a mitad de vídeo solo existen a partir de 8 min. El vídeo 001 dura ≈ 5 min
  (aparcado; se reescribirá con narrador).
- **Ritmo:** 1 vídeo largo a la semana (el usuario dispone de 3-5 h semanales).
- **Shorts:** 1-2 por vídeo (20-58 s), sacados de escenas que se entiendan solas. Se suben 1-2 días
  después del vídeo largo. Desde el 2026-09-24: **imágenes verticales propias** (`"vertical": true`, a
  pantalla completa, título grande los 3 primeros segundos) y **frase de gancho propia**
  (`"gancho"`, una pregunta corta que dice el narrador antes de la escena). Ideal: que el final enlace
  con el principio para que se vea en bucle.
- **Ritmo visual:** cambio de imagen cada 3-6 s, nunca más de 8 s (marcas `{img}`); máximo 60
  imágenes nuevas por vídeo, reutilizando con otro movimiento cuando tenga sentido.
- **Rótulos:** datos clave en pantalla (año, cifra, nombre) con el campo `rotulo`.
- **Miniaturas:** 3 opciones; fondo solo de ambiente (burbujas, cielo, paisaje), porque Tok se pega
  desde su hoja de personaje en el otro lado y taparía al protagonista del fondo. Plantilla fija y
  reconocible (como Dr. Binocs o Kurzgesagt): **pregunta o promesa de 2-4 palabras enormes** (a menudo
  con "?"), **Tok siempre** con una cara muy clara y **una sola imagen central**. Variante "dos mitades"
  (normal frente a extremo, antes y después, día 1 y día 7). Las 3 miniaturas prueban hipótesis
  distintas (dato, pregunta, emoción) para "Probar y comparar".
- **Estructura fija** (todo lo dice el narrador; Tok actúa):
  1. **Gancho (0-20 s):** la **premisa** en forma de pregunta ("¿Qué pasaría si…?", o la pregunta
     cotidiana) que afecta **al espectador**, y el narrador le dice que Tok lo va a comprobar por él +
     gag rápido de Tok. Si encaja, el narrador **enumera lo que todos esperamos** ("tsunamis, terremotos,
     ¿la Tierra partida en dos?") para confirmarlo o desmontarlo al final. Nada de presentaciones largas.
  2. **Salida (≈ 5 s):** Tok pulsa el botón de la máquina y el narrador anuncia **"¡Iniciando
     viaje!"**, seguido de `{whoosh}`. Siempre igual: es la marca (decidido el 2026-09-24: lo dice el
     narrador, como el que cuenta la cuenta atrás; no es un rótulo ni un efecto).
  3. **Llegada (≈ 40 s):** el narrador prepara el saludo ("Y Tok, como siempre, llama a la puerta:"),
     suena `{toc_toc}` y el narrador le contesta con dónde (y cuándo) estamos; cómo es aquello y primer
     choque de Tok con el lugar. Aquí va **una frase de "reglas del viaje"** ("para que sea justo, Tok
     no se llevará comida", "supongamos que…"): da rigor sin ponerse serio.
  4. **3-4 paradas en escalera:** cada parada es **más fuerte que la anterior**, con marcadores claros
     de tiempo (día 1, día 3, una semana), de cantidad (un poco, mucho, demasiado) o de escala (tú, tu
     ciudad, el planeta). Cada una: contexto antes del dato, **una comparación cotidiana y dibujable** para
     lo abstracto (la vejiga es un globo, el agua aprieta como una prensa), el dato explicado con humor y
     un gag de Tok comentado por el narrador. Tok es el conejillo de indias: el narrador cuenta lo que le
     pasa ("si tú fueras Tok ahora mismo, pesarías el doble") y Tok lo sufre con caras y efectos. En el
     vídeo, al menos **un caso real, récord o prueba** que ancle el tema.
  5. **Giro final:** el dato más sorprendente, guardado para el final, o **un matiz que nadie esperaba**
     (no pasa nada; resulta que a veces ayuda); si el gancho enumeró expectativas, aquí se desmontan o
     confirman una por una.
  5b. **"¿Sabías que…?" (≈ 10 s):** sección fija con una curiosidad extra, corta y visual, antes de la
     vuelta a casa (como la de Dr. Binocs).
  6. **Vuelta a casa (≈ 30 s):** el narrador conecta el tema con el día a día del espectador y le hace
     una **pregunta concreta con opciones** para comentarios; Tok puede "votar" con un gesto ("Tok ya
     ha elegido la segunda. ¿Y tú?").
  7. **Cierre:** la máquina falla y "se ve" el siguiente destino (el narrador anuncia el próximo
     vídeo). Después el narrador pide **"dale a like y suscríbete"** con un gag con Tok (p. ej. Tok
     pulsa lo que no es y suena `{error}`; el narrador le corrige). El gag cambia en cada vídeo para que
     no canse (se apunta en `docs/historial.md`). Usado: 001 "Mi máquina funciona con eso" (formato
     antiguo, dicho por Tok). Despedida fija: el narrador dice **"¡Nos vemos en el próximo viaje!"** y
     suena `{toc_toc}` como remate (Tok ya llama a la puerta del siguiente destino).
  8. **Pantalla final (automática):** tras la despedida, 20 s sin voz con Tok saludando a la
     izquierda y la mitad derecha libre para los elementos de pantalla final de YouTube (vídeo
     recomendado + suscribirse). La genera `montar.py` desde `canal.json`.

## Shorts independientes (`/nuevo-short`, desde el 2026-09-24)
Un Short de un tema muy concreto, sin vídeo largo detrás. Carpeta `videos/SNNN-slug/` (numeración
propia). Vertical 1080x1920, **30-55 s** (≈ 100-160 palabras), una imagen nueva cada **2-4 s**
(≈ 15-20 imágenes, en vertical), sin capítulos ni pantalla final. Mismo Tok, estilo y narrador.
- **Estructura:**
  1. **Gancho (0-2 s):** el narrador lanza una pregunta o un dato imposible, ≤ 10 palabras, con el
     título grande en pantalla (`titulo_pantalla`). Nada de presentaciones.
  2. **Llegada (2-6 s):** preparación corta ("Y Tok llama a la puerta:") + `{toc_toc}` + respuesta del
     narrador que sitúa el lugar. "¡Iniciando viaje!" es opcional (solo si cabe en un segundo).
  3. **Desarrollo (6-40 s):** UN solo dato, con su contexto, contado en 2-3 golpes que van a más, con
     un chiste a mitad (el narrador le habla a Tok).
  4. **Giro (40-50 s):** la vuelta de tuerca que hace que merezca la pena verlo entero.
  5. **Final en bucle:** la última frase enlaza con la primera para que se vuelva a ver. Sin "dale a
     like y suscríbete" (rompe el bucle y los Shorts se promocionan por retención).
- Rigor igual que en los vídeos: datos con fuente; leyendas contadas como tales.
- Temas: un dato muy visual o sorprendente que se entienda sin contexto. Un buen Short puede ser la
  semilla de un vídeo largo (se apunta en `docs/ideas.md`).

## Reglas de guion
- Rigor: cada dato con fuente verificable; si algo es leyenda o está discutido, el narrador lo dice.
- Humor blanco pero no infantil: ironía, exageración, anacronismos. Nada de burlas a colectivos.
- **Narrador en tercera persona (2026-09-24):** todo el texto lo dice el narrador. Tok no habla salvo
  `{toc_toc}`; lo que Tok piensa se cuenta ("Tok mira su reloj, ¿se habrá estropeado?") y lo que hace
  se ve en la imagen. Nada de "yo" de Tok ni de informes a la "Base".
- Contexto antes del dato: primero dónde estamos y qué pasa, después la cifra. El espectador nunca
  debe tener la sensación de haberse perdido algo.
- Efectos de sonido solo entre frases, nunca a mitad (feedback del usuario). Efectos disponibles en
  `recursos/sfx/`: `whoosh`, `boing`, `pop`, `error`, `record_scratch`, `ding`, `redoble`,
  `remate_chiste`, `toc_toc` y `tok_pues_si` (voz de Tok); y desde el 2026-09-25 (kit 05): `brillo` (descubrimiento, algo mágico),
  `ping` (subraya una cifra o un rótulo), `campanilla` (acierto, "¡exacto!"), `impacto` (revelación o
  giro final), `clic` (Tok pulsa el botón de su máquina) e `interferencia` (a Tok se le cruzan los
  circuitos: confusión). Con moderación: si no hay nada que subrayar, mejor sin efecto.
- Se escribe para ser escuchado, no leído.
- **Escribir para la voz (validado por el usuario escuchando variantes, 2026-09-23; adaptado al
  narrador el 2026-09-24):**
  - El saludo es el clip `{toc_toc}`, entre frases, después de una frase del narrador que lo prepara
    y que termina en dos puntos o punto ("Y Tok, como siempre, llama a la puerta:").
  - **Nada de puntos suspensivos (…) a mitad de frase** con Gemini o Azure: la voz se para y parece
    otra frase. Con la voz de ai33 (eleven_v3) sí: son una pausa dramática ("muy… muy… despacio").
  - **Comas solo donde de verdad se hace una pausa** al hablar; cada coma es un corte audible.
  - Los años y números, en letra ("mil trescientos") para que la voz no dude.
  - Frases completas pero ágiles, de menos de 25 palabras; si una idea debe sonar de un tirón, que vaya
    en una sola frase.
- **Escribir con energía (feedback del usuario, 2026-09-24: "aburre la locución"):**
  - Nada de listas de frases cortas con punto ("Es de noche. Pasa una semana. Pasa un mes."): cada
    punto baja el tono y suena a lista. Mejor encadenadas: "Pasa una semana, pasa un mes entero, y el
    Sol sigue sin aparecer."
  - Una exclamación o una pregunta cada dos o tres frases; en cada escena, al menos una.
  - El narrador pregunta al espectador ("¿Sabes cuánto…?") antes de dar la cifra, y le habla a Tok en
    los gags ("No, Tok…", "Pero Tok, ¡…!"). Las reacciones de Tok son efectos y caras, no palabras.
  - **Marcas de emoción (voz de ai33, eleven_v3):** en inglés y entre corchetes, delante de la frase
    que colorean: `[excited]`, `[curious]`, `[surprised]`, `[amazed]`, `[playfully]`, `[cheerfully]`,
    `[whispers]`, `[laughs]`, `[explaining]`. Una por frase como mucho y no en todas (en la muestra
    aprobada, ~1 cada 1-2 frases). No se leen ni salen en los subtítulos; con otras voces se ignoran.
  - Con Gemini, la emoción la da el estilo del narrador de `canal.json` (lo lee como una indicación en
    texto). `"estilo_voz"` por escena solo si hace falta de verdad: sustituye al del canal (hay que
    escribirlo completo, en castellano y repitiendo "español de España") y parte la locución en otra
    toma, lo que puede volver a meter pausas.
  - La locución se genera de una vez y sin recortes (las pausas son las naturales del narrador); si una
    pausa es dramática, se escribe con `{pausa:ms}`.
- **Hablar al espectador (de los virales, 2026-09-24):** el narrador le habla de tú y le pone en la
  situación ("imagina que eres tú…", "si tú fueras Tok…"); las **imágenes mentales concretas y
  graciosas** valen más que las cifras solas (llevarte a ti mismo a caballito todo el día).
- **Humor seguido:** un chiste o gag cada 15-20 s, mejor visual y con reacción de Tok; en dos capas
  (lo que hace Tok, para todos; la ironía del narrador, para adultos).
- **Cambio de registro en lo serio:** si un dato es médico, triste o delicado, el narrador baja el tono,
  lo cuenta con respeto y no hace chistes sobre él; el humor vuelve en la escena siguiente.
- **Ritmo:** ≈ 150-170 palabras por minuto con el narrador; frases completas y ágiles.
- Evitar temas que YouTube restringe para anuncios (violencia explícita, tragedias recientes).
- Cada vídeo tiene que aportar algo propio (opinión, humor, conexión con hoy): la política de
  "contenido no auténtico" de YouTube no monetiza lo producido en serie sin aportación.

## Primeros 10 temas (propuesta, mezclando temáticas)
1. 🧠 ¿Qué pasa en tu cerebro cuando te quedas en blanco? (cuerpo humano, viaje al interior)
2. 🐙 El pulpo tiene nueve cerebros… y Tok fue a comprobarlo (animales, fondo del mar)
3. 🤖 ¿Puede una IA tener ideas propias? (IA, viaje al futuro y a un centro de datos)
4. 🏰 ¿Cómo se lavaban los dientes en la Edad Media? (historia)
5. 🦠 Un día dentro de tu estómago (cuerpo humano)
6. 🐝 ¿Cómo deciden las abejas dónde vivir? Votan (animales)
7. ⏳ El año en que desaparecieron diez días del calendario (historia, 1582)
8. 🚀 ¿Qué pasaría si viviéramos en Marte? (ciencia y futuro)
9. 📱 ¿Cómo sabe tu móvil dónde estás? (tecnología de hoy)
10. 🦖 ¿De qué color eran de verdad los dinosaurios? (ciencia y pasado remoto)

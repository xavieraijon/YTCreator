# Concepto del canal: "Asombroso y Real"

> Documento de referencia para elegir temas, escribir guiones, crear imágenes y publicar.
> **Estado: NUEVO (2026-09-27), decidido por el usuario tras el análisis de mercado** (`docs/mercado.md`,
> opción B): se abandona el robot Tok y el formato de Shorts sueltos. El concepto anterior está en
> `canales/_archivo/los-viajes-de-tok/docs/concepto.md`. Estado del canal: `docs/progreso.md` (de esta carpeta).

## Nombre y promesa
- **Asombroso y Real** · @AsombrosoYReal (canal renombrado desde
  @losviajesdetok el 2026-09-28).
- **Promesa (una frase):** historias y fenómenos que parecen inventados… y son reales, contados con rigor
  y con gracia. Cada vídeo responde a "¿de verdad pasó / existe esto?" con un "sí, y te lo explico".
- **Por qué este nombre:** amplio (cabe la historia, la naturaleza, el universo y la ciencia), dice la
  promesa entera y la búsqueda del nombre en YouTube está limpia (1 de 20 resultados con la frase).

## Pilares (4, unidos por la misma promesa)
| Pilar | Qué entra | Datos (mercado.py, 27-09-2026) |
|---|---|---|
| 🏺 **Historia insólita** | Casos reales increíbles del pasado, también misteriosos (epidemia de baile de 1518, el hombre que sobrevivió a dos bombas atómicas) | Mejor puerta de entrada medida: 11 evidencias, concentración 45 % |
| 🐙 **Naturaleza y animales** | Animales y fenómenos naturales que parecen imposibles | Demanda muy alta (mediana 2,6 M), 4 evidencias |
| 🌌 **Universo y espacio** | Lo asombroso del cosmos que casi nadie cuenta | Demanda muy alta pero más competido: exige dato poco contado (regla del hueco) |
| 🧠 **Cuerpo y ciencia** | Cuerpo humano, experimentos, inventos, "qué pasaría si" | 3 evidencias; conecta con el formato "qué pasaría si" |
- **Misterio**: un ingrediente transversal (casos sin resolver, enigmas con explicación), no el tema del
  canal. Siempre se separa lo comprobado de lo especulativo.
- **Reparto inicial:** 1 de cada 2 vídeos de historia insólita (mejor puerta de entrada) y el resto
  rotando los otros tres pilares. Se ajusta con las métricas propias a partir del vídeo 6-8.
- Coherencia: los datos dicen que los canales con temas sin conexión no crecen (YouTube no sabe a quién
  enseñarlos). Lo que une los pilares es la **promesa, el estilo visual, la voz y la fórmula de título**.
  Nada que no cumpla "parece inventado y es real".

## Público
Adultos y adolescentes curiosos (16-45 años), España y Latinoamérica. En YouTube: **"No, no es contenido
creado para niños"**, y esta vez el conjunto lo respalda: estilo editorial, tono adulto, sin personaje
infantil (el motivo del cambio: `docs/mercado.md` §1.4).

## Voz y narrador
- Un narrador en off de **documental sobrio** (desde el 2026-10-01, referencia: WATOP): en tercera persona, en
  pasado, declarativo; sin muletillas, sin preguntas que se responde y sin tú. Sin personaje ni mascota.
  (Antes: «documental con ironía, habla de tú»; con la voz sintética sonaba a IA.)
- Voz (desde el 2026-10-01, después): **"Juanjo Relatos"** (ElevenLabs vía ai33, `eleven_v4`, velocidad 1,2, pausas de
  0,3 s como máximo), elegida por el usuario frente a Gabo y Salva con un texto al estilo WATOP.
- Voz (desde el 2026-10-01): **"Gabo - Deep, Evocative and Resonant"** (ElevenLabs vía ai33, modelo `eleven_v4`, sin
  marcas de emoción), elegida por el usuario en una prueba de 8 tomas (`videos/_pruebas/voces_2026-10-01/`): con
  `eleven_v3` todas las voces tenían una «tonadilla» que delataba la IA. Antes:
- Voz: **"Javier Rojas - Learning & Storytelling"** (ElevenLabs vía ai33, `eleven_v3`), elegida por el usuario
  el 2026-09-28 escuchando muestras ("tiene más ritmo"); sustituye a "Daniel" (queda en `voces` → `ai33_daniel`). Menos euforia que en Tok: marcas como `[curious]`,
  `[whispers]`, `[amazed]` o `[explaining]`, como mucho una por bloque (con varias distintas salta de tono).

## Estilo visual: editorial (elegido por el usuario el 2026-09-27)
- **Ilustración editorial con textura de papel**, pinceladas visibles, luz dramática (claroscuro),
  paleta limitada y atmósfera cuidada. Muestra aprobada: `<canal>/videos/_pruebas/estilo_b/3_editorial.png`
  (hoja comparativa: `<canal>/videos/_pruebas/estilo_b/hoja_estilos.jpg`).
- **Base del prompt (klein):** la de `canal.json` → `estilo` (manda sobre este resumen): `editorial
  illustration with visible paper grain texture, painted in a {paleta}: {escena}, dramatic chiaroscuro
  lighting, …`. La paleta va DELANTE de la escena (prueba v3, 2026-09-28: detrás se perdía).
- **Paleta por pilar** (misma textura, distinto ánimo; probada el 2026-09-27: `<canal>/videos/_pruebas/paletas/hoja_paletas.jpg`):
  historia: ocre, verde azulado profundo, crema y negro · naturaleza: verdes profundos, ámbar y crema ·
  universo: azul noche, violeta y oro viejo · cuerpo y ciencia: rojo teja, turquesa y crema (reforzada: la primera versión no se notaba).
- Personas con aspecto adulto y creíble (no caricatura), **nada de sangre ni gore** (anunciantes).
- Un largo de 12 min necesita ≈ 100-130 imágenes: **klein automático** (Cloudflare gratis, ≈ 90/día, y el
  Mac sin límite) es la vía principal; Google (Gemini/Veo) a mano solo para portadas, miniaturas y 1-3
  clips animados por vídeo.

## Formato
- **Producto principal: vídeos largos de 10-14 min** (horizontal). La duración habitual del nicho es de
  ≈ 12 min; pasa de 8 min (anuncios a mitad de vídeo) y suma horas para el YPP. ≈ 1.500-2.100 palabras.
- **Ritmo de publicación:** 2 vídeos al mes para empezar (sostenible), subir a 1 por semana si la
  producción lo permite. Constancia antes que volumen. **Listón realista: 1 vídeo por semana de 8-16 min**,
  el ritmo con el que ABISMO (castellano, universo) crece estable; los referentes que publican a diario
  tienen su catálogo reciente muy por debajo de sus éxitos (`<canal>/analisis/referentes-2026-09-30-hallazgos.md`, 30/09).
- **Segundo formato: el catálogo completo** (visto en Big Space Explainer, 10× su mediana): un vídeo que
  recorre TODOS los casos de una lista cerrada y concreta ("Todas las formas en que puede acabar el
  universo", "Todos los animales que…"), un apartado por caso con su capítulo. Miniatura propia: cuadrícula
  de 6-12 ilustraciones rotuladas sobre papel (la cuadrícula ES la promesa). Solo con listas cerradas y
  concretas: con temas vagos ("todos los misterios del espacio") ese mismo canal hizo 0,1×. Sirve para
  búsquedas y para recopilaciones; como mucho 1 de cada 4 vídeos, para no diluir el formato principal.
- **Shorts: tráileres de cada largo** (1-2 por vídeo, 30-55 s, vertical), con una escena que se entienda
  sola y que remita al vídeo completo. Nunca más Shorts sueltos como producto (`docs/mercado.md` §1.2).
- **Ritmo visual:** una imagen cada 5-8 s con movimiento (zoom lento o desplazamiento); rótulos solo
  para fechas, lugares y cifras clave.

## Títulos, series y miniaturas
- **Fórmulas de título** (elegir una por vídeo, siempre promesa + curiosidad, < 60 caracteres):
  - "La [cosa] que [hecho imposible]": *La ciudad que bailó hasta morir*.
  - "El [persona] que [hecho imposible]": *El hombre que sobrevivió a dos bombas atómicas*.
  - "¿Por qué [fenómeno asombroso]?" para naturaleza, universo y ciencia.
  - "Qué pasaría si [situación]" para cuerpo y ciencia.
  - **"¿[Pregunta de escala o de imposibilidad]? ([giro que la retuerce])"** (la de ABISMO, 30/09): la
    promesa delante y un paréntesis corto que contradice o sube la apuesta. *¿Cuánto se tarda en cruzar UN
    AÑO LUZ? (la respuesta te va a doler)* (10× su mediana), *¿Por qué es imposible vivir en Titán? (Aunque
    parezca la Tierra)*. Para nosotros: *¿Cuánto duró de verdad el baile de 1518? (Nadie pudo pararlo)*. Sin
    paréntesis o con preguntas abstractas ("¿Por qué el tiempo presente no existe?") le funcionó mucho peor.
    El paréntesis nunca promete lo que el vídeo no cumple ("…y real").
- **Coletilla de canal** en la descripción y la pantalla final: "Asombroso… y real."
- **Tipografía (elegida el 2026-09-27):** Playfair Display Black en títulos, miniaturas y pantalla final;
  Source Sans 3 en subtítulos, rótulos y textos (`canal.json` → `fuentes`). Muestras
  comparadas en `<canal>/videos/_pruebas/estilo_b/miniaturas_fuentes.jpg` y `pantallas_finales.jpg`.
- **Miniatura:** una sola imagen editorial muy contrastada del momento clave, 2-4 palabras enormes que NO
  repiten el título, esquina inferior derecha libre. Cuando el vídeo gira en torno a una cifra, mejor una
  **metáfora visual de la cifra** que la escena literal (el éxito de ABISMO: una sonda avanzando por una
  carretera hecha de hojas de calendario para "un año luz"). **Mismo sistema en todas** (fondo, un solo
  objeto, tipografía, posición del texto): los dos vídeos de ABISMO que lo rompieron (flecha roja, texto
  gigante en rojo) son sus dos más flojos. **La imagen de fondo se pide con un lado vacío**
  ("subject on the left, empty dark space on the right for text"): si no, el texto tapa a los personajes.
- **Pantalla final:** papel crema con textura, "ASOMBROSO / Y REAL" y el lema "¿Te ha parecido increíble?
  Hay más."; la mitad derecha libre para el vídeo recomendado y el botón de suscribirse. 3 variantes para "Probar y comparar" (dato,
  pregunta, emoción).

## Lo que no hacemos (visto en los referentes que se hundieron, 30/09)
De los canales «modelo» de los documentos de gurús, uno ya no existe y cuatro se hundieron o pararon tras un
pico de 1-3 meses (`<canal>/analisis/referentes-2026-09-30-hallazgos.md`). Hacían justo esto, y nosotros no lo hacemos:
- Publicar a diario con plantilla de títulos en serie ("James Webb Just Detected…" × 9 de 12).
- Rótulos que imitan a un medio real (el "BREAKING NEWS" con el logo de CNN) o a una emisión en directo.
- Imágenes de IA hiperrealistas presentadas como grabaciones reales ("You wouldn't believe this if it
  wasn't caught on camera", sello "4K"): nuestro estilo es editorial e ilustrado, y lo real son los datos.
- Metraje o detalles de muertes con "WARNING REAL FOOTAGE": temas trágicos, siempre sin morbo.
- Criaturas o hechos inventados contados como reales: si algo es leyenda o hipótesis, se dice.

## Estructura de un vídeo largo
1. **Gancho (0-30 s):** confirma en 10 s la promesa del título y la miniatura (`empaquetado.md`). Dos
   aperturas que funcionan en el referente (ABISMO): **la cifra extrema y su traducción** ("…hablo de casi
   seiscientos noventa mil kilómetros por hora. Ese número, así suelto, no dice nada: déjame ponértelo en
   algo que sí puedas ver…") y **la credibilidad de frente** ("…y no es una leyenda de internet: está en
   los informes del médico que lo atendió"). La imagen más impactante del caso y la promesa en una frase ("En el verano de mil
   quinientos dieciocho, en Estrasburgo, decenas de personas se pusieron a bailar y no podían parar.
   Durante semanas. Y lo cuentan los documentos de la ciudad."; las cifras y las muertes que circulan
   están discutidas: el vídeo lo diría). Nada de presentaciones ni "bienvenidos".
2. **Contexto (≈ 1 min):** dónde, cuándo y cómo era aquello; el espectador tiene que situarse antes del
   primer dato.
3. **Desarrollo en 3-5 actos que van a más**, cada uno con un bucle abierto que se cierra después
   ("pero lo más raro no era el baile…"), un dato comprobado, una **comparación cotidiana y dibujable**
   y, si encaja, una ironía seca dicha como un hecho.
4. **La explicación:** qué sabemos hoy y qué sigue sin saberse (lo comprobado separado de las hipótesis).
5. **Giro final:** el dato más sorprendente guardado para el final.
6. **Cierre (≈ 30 s):** conexión con hoy, **pregunta concreta a los comentarios** y el siguiente vídeo
   ("si esto te ha parecido increíble, espera a…"). Después, pantalla final de 20 s.

## Reglas de guion (heredadas de lo aprendido con Tok, adaptadas)
- **Rigor:** cada dato con 2 fuentes fiables en `fuentes.md`; leyendas y especulación, dichas como tales.
  Revisión del agente `verificador` antes de producir. Es la base de la promesa "…y real".
- **Regla del hueco** (`herramientas/saturacion.py`): tema amplio con público × dato concreto que casi
  nadie cuenta. Nada en ROJO; mide el enfoque (la pregunta-título), no solo el tema.
- **Aporte propio en cada vídeo** (política de contenido no auténtico): narrativa, conexión con hoy,
  rigor y orden; nunca un pase de datos sacado de una plantilla.
- Contexto antes del dato; frases de menos de 25 palabras, encadenadas (no listas de frases cortas con
  punto, que bajan el tono); sin preguntas que se responde el narrador ni muletillas (01/10).
- Números y años en letra; comas solo donde hay pausa real; puntos suspensivos solo con la voz de ai33,
  y nunca detrás de una palabra llana larga (eleven_v3 carga la última sílaba: "sobrevivierá"). Ninguna
  frase acaba justo al cerrar una cita. Tras locutar, `herramientas/entonacion.py` (reglas en el guionista).
- Temas delicados (muerte, enfermedad, tragedias): tono respetuoso, sin chistes sobre las víctimas, sin
  imágenes explícitas; evitar tragedias recientes (anunciantes y respeto).
- Efectos de sonido con moderación y solo entre frases (`recursos/sfx/`); fuera los de Tok.

## Monetización (expectativa honesta: `docs/mercado.md`)
- Anuncios cuando se llegue al YPP (si se solicita después del 01-02-2027: 1.000 suscriptores + 8.000 h).
- **Afiliación desde el primer vídeo:** libros o audiolibros del caso (Amazon/Audible) en la descripción,
  con aviso de enlace de afiliado.
- Patrocinios cuando haya audiencia; nunca prometer ingresos ni plazos.

---
name: analisis-canal-youtube
description: "Analiza un canal de YouTube a partir de su enlace con yt-dlp (títulos, duraciones, visitas, fechas, capítulos, hashtags, miniaturas que se MIRAN, gancho literal de la transcripción, curva pública de momentos más vistos, mediana y outliers), puntúa el embudo de YouTube en 16 dimensiones con evidencia y localiza la fuga. En CanalYT se usa para dos cosas: estudiar canales de referencia (qué les funciona y qué copiar para el canal activo del kit) y diagnosticar nuestro propio canal (el activo: `<canal>/canal.json` → `url`) con las capturas de YouTube Studio. Triggers: 'analiza este canal', 'analiza el canal de referencia X', 'analiza nuestro canal', 'por qué no crece el canal', 'revisa nuestras miniaturas', 'compara con estos canales'."
---

# Análisis de canales de YouTube (adaptado a CanalYT)

> Origen: "Kit 04 · Análisis de canales de YouTube" (descargado en `~/Documents/IA/Kits`), adaptado el
> 2026-09-25: sin modo práctica, sin firma ni tarifas, rutas en `<canal>/analisis/` y dos modos propios
> (referente y nuestro canal). `yt-dlp` está instalado con Homebrew (`/opt/homebrew/bin/yt-dlp`);
> si falla con "Sign in to confirm you're not a bot" o "unable to extract", está desactualizado:
> PREGUNTA al usuario antes de ejecutar `brew upgrade yt-dlp` (es una descarga).

Le das el enlace de un canal y analizas el recorrido completo de YouTube: si le
reparten, si hacen clic, si se quedan y si vuelven y le compran. La salida es un
informe HTML con la nota de cada bloque, **dónde está la fuga**, la galería de sus
miniaturas comentada una por una, los títulos reescritos y **los próximos 10 vídeos
listos para grabar**.

**Regla fundamental: cero invención.** Cada afirmación se apoya en algo que has
extraído, en una imagen que has visto o en una frase literal que has leído. Si no lo
has podido comprobar, se marca "sin datos" y no puntúa. Un solo dato inventado
destruye la credibilidad del informe entero.

**Segunda regla: se juzga el canal, nunca la persona.** El packaging, el contenido,
el ritmo y el negocio, sí. Su aspecto, su cuerpo, su voz, su acento, su peso o su
vida privada, no — ni aunque el usuario lo pida. De su cara en una miniatura solo se
dice si cumple su función: que se reconozca la emoción a tamaño de móvil.

**Tercera regla: la curva de "momentos más vistos" no es la retención.** Es pública,
relativa y solo existe en algunos vídeos. Nómbrala así cada vez que aparezca.

**Cuarta regla: extraer con `yt-dlp` es gratis, pero leer y analizar cada vídeo gasta tu cupo de Claude.**
Los pasos de abajo ya limitan lo normal a un puñado de vídeos (`--playlist-end 6-12`). Si el usuario pide
analizar un canal entero con cientos de vídeos, o "todos" los de varios referentes, dilo antes de lanzarlo
("son N vídeos; esto va a tardar y gastar bastante cupo, ¿los reduzco a los M más relevantes o sigo con
todos?") y deja que decida, en vez de arrancar sin más.

---

## Paso 0 — ¿Qué modo?

- **Modo referente** (lo normal mientras el canal no tenga vídeos): un canal parecido de
  `<canal>/docs/referentes.md` u otro que diga el usuario. El objetivo NO es puntuarle para venderle nada,
  sino **aprender qué le funciona y qué debería copiar nuestro canal** (el activo): sus outliers y qué tienen en
  común, sus ganchos literales, su sistema de miniaturas, sus títulos, sus duraciones y cómo usa los
  Shorts. Las 4 dimensiones de Studio quedan "no disponibles" desde el principio. El informe HTML es
  opcional (pregunta); lo obligatorio es el cuaderno y el resumen de "Qué copiar para <nombre del canal>".
- **Modo nuestro canal** (la `url` de `<canal>/canal.json`): análisis completo con tono de
  entrenador. Pide las capturas de Studio (`<canal>/analisis/entrada/LEEME.md`). Con pocos vídeos o pocas
  visitas (menos de ≈ 1.000 impresiones por vídeo) dilo claramente: son indicios, no conclusiones, y la
  mediana y los outliers no tienen sentido todavía.
- **Comparar** (1-3 canales): el módulo de competidores del final.

El `[canal]` de los nombres de archivo sigue la regla del Paso 1C.

---

## Paso 1 — El enlace y el contexto

### 1A · Lo que necesitas del usuario

El contexto de nuestro canal ya está en `CLAUDE.md`, `canal.json`, `<canal>/docs/concepto.md` (público,
formato, temas) y `<canal>/docs/historial.md` (vídeos publicados y métricas): léelos y no lo preguntes. Qué
queremos conseguir: crecer como canal de divulgación con humor y llegar al programa de socios.

- En **modo referente**, pregunta solo si no está claro qué canal es o qué quiere aprender el usuario de
  él (miniaturas, ganchos, Shorts...).
- En **modo nuestro canal**, mira qué hay en `<canal>/analisis/entrada/`: si hay capturas, dilo y úsalas; si
  no, pásale el guion de `<canal>/analisis/entrada/LEEME.md` (un minuto) y di qué gana.

### 1B · Empezar sin esperar

**No te quedes parado esperando las capturas.** Arranca la extracción y dile
exactamente eso, para que no sienta que está bloqueando el trabajo. Las capturas se
incorporan cuando lleguen, en el Paso 2K.

Si no va a haber capturas (es un canal de referencia, o no las quiere dar), avisa
**antes de empezar** de que las dimensiones que dependen de Studio quedarán "sin
datos", para que no espere una nota que no vas a poder dar. El análisis se hace
completo igual: lo público de un canal de YouTube es muchísimo.

### 1C · Antes de lanzar el primer comando

- Comprueba que `yt-dlp --version` responde. Si no, díselo al usuario (se instala con
  `brew install yt-dlp`, previa confirmación suya).
- Fija el **`[canal]`** para los nombres de archivo: el handle sin `@`, en minúsculas,
  sin tildes, con puntos y guiones bajos convertidos en guion. `@HuertoEnCasa` →
  `huertoencasa`. Si no hay handle, el nombre del canal en minúsculas y con guiones.
- Crea las carpetas: `<canal>/analisis/datos/` y `<canal>/analisis/miniaturas-[canal]/`.

---

## Paso 2 — Extraer y comprobar

**Abre el cuaderno de hallazgos antes de empezar.** Crea
`<canal>/analisis/[canal]-hallazgos.md` y ve escribiendo cada dimensión en cuanto la cierres:
la evidencia literal, la nota y por qué. Dos razones: si la sesión se corta no se
pierde el trabajo (con "continúa el análisis" se retoma por la primera dimensión que
falte), y al montar el HTML no tendrás que recordar de dónde salía cada cosa.

**Narra cada fase en una línea** mientras avanzas ("Sacando el listado del canal…",
"Descargando las miniaturas…", "Leyendo el gancho del vídeo que más reventó…"). Un
análisis de canal son varios minutos: que el usuario no se quede mirando una pantalla
quieta.

Y una advertencia de método: **no vuelvas a intentar leer el canal con `WebFetch`.**
Una página de canal de YouTube devuelve solo el pie de página. Está comprobado. Los
datos entran por `yt-dlp`.

### 2A · El canal

```bash
yt-dlp --flat-playlist --playlist-items 1 --no-warnings -J "https://www.youtube.com/@HANDLE"
```

De esa respuesta te interesan: `channel` (nombre), `channel_id` (**apúntalo, hace
falta en 2C**), `channel_follower_count` (suscriptores, **vienen redondeados por
YouTube**), `description` (la descripción del canal entera), `tags` (las palabras
clave del canal) y `playlist_count` si aparece.

Lee la descripción del canal como lo que es: **la carta de presentación**. ¿Dice de
qué va el canal y para quién? ¿Hay enlaces? ¿A dónde llevan? Si hay un enlace a su
web o a su producto, **ábrelo** (`WebFetch`) y comprueba que existe y que dice lo
mismo: eso es media dimensión 16.

### 2B · Los vídeos largos recientes (la muestra base)

Una sola llamada trae los 12 vídeos más recientes con **todo** lo que hace falta:

```bash
yt-dlp --playlist-end 12 --no-warnings --print \
  "%(id)s | %(title)s | dur=%(duration)s | vis=%(view_count)s | likes=%(like_count)s | coms=%(comment_count)s | fecha=%(upload_date)s | caps=%(chapters.:99.title)s | tags=%(tags.:8)s | desc=%(description).200s" \
  "https://www.youtube.com/@HANDLE/videos"
```

Sin `--flat-playlist` yt-dlp extrae cada vídeo de verdad: por eso salen las visitas.
Tarda un par de segundos por vídeo. **Guarda la salida en
`<canal>/analisis/datos/[canal]-videos.txt`** además de leerla, para no repetirla.

Si necesitas la descripción completa de un vídeo (para juzgar la ficha técnica y los
hashtags), pídela suelta para ese vídeo: `--print "%(description)s"`.

### 2C · Los vídeos más vistos de la historia del canal

Esta es la llamada que convierte el análisis en accionable, y casi nadie la hace. Las
listas automáticas de YouTube dan el catálogo ordenado por visitas: se coge el
`channel_id` de 2A y se cambia el `UC` inicial por el prefijo.

```bash
# UULP = vídeos populares (por visitas, de más a menos)
yt-dlp --flat-playlist --playlist-end 8 --no-warnings --print "%(title)s ||| %(id)s" \
  "https://www.youtube.com/playlist?list=UULP<channel_id sin las dos primeras letras>"
```

Otros prefijos útiles con el mismo truco: `UUPS` Shorts populares · `UULF` vídeos
largos recientes · `UUSH` Shorts recientes.

**Ojo:** poner `?sort=p` en la URL del canal **no funciona**, yt-dlp lo ignora y te
devuelve el orden normal. Es `UULP` o nada.

De esos 8, coge los **3 más vistos que no estén ya** en la muestra de 2B y pídeles
los datos completos con el mismo comando de 2B pero sobre sus URLs de vídeo. Son los
que explican qué funciona en este canal, y suelen ser vídeos viejos que el dueño ha
olvidado.

Si la lista `UULP` falla o vuelve vacía (pasa en canales muy nuevos), dilo en la nota
metodológica y sigue con la muestra reciente: el análisis de outliers se hará solo
dentro de esa muestra y con menos alcance.

### 2D · Los Shorts

```bash
yt-dlp --playlist-end 6 --no-warnings --print \
  "%(id)s | %(title)s | dur=%(duration)s | vis=%(view_count)s | fecha=%(upload_date)s" \
  "https://www.youtube.com/@HANDLE/shorts"
```

Si el canal **no tiene pestaña de Shorts**, no es un error: es un **hallazgo** de la
dimensión 3. Lo mismo al revés — un canal que solo publica Shorts. Anótalo y sigue.

Lo que hay que mirar en los Shorts no es cuántas visitas tienen, sino **si tratan los
temas del canal**. Shorts de bailes o de humor en un canal de jardinería traen
suscriptores que no van a ver nunca un vídeo largo, y eso hunde el rendimiento de todo
lo que publique después.

### 2E · Las miniaturas: descargarlas y MIRARLAS

Media parte del valor del kit está aquí. Descarga las de la muestra:

```bash
curl -s -o "analisis/miniaturas-[canal]/ID.jpg" "https://i.ytimg.com/vi/ID/maxresdefault.jpg"
```

Si `maxresdefault.jpg` da 404 o pesa unos pocos bytes, usa `hqdefault.jpg` (480×360)
o `mqdefault.jpg` (320×180). Comprueba los tamaños con `ls -l` antes de darlas por
buenas.

Y ahora lo importante: **ábrelas una por una con la herramienta de lectura de
archivos y mira lo que hay dentro.** De cada miniatura escribe en el cuaderno:

- **El texto que lleva, literal, y cuántas palabras son.** Contadas, no estimadas.
- **Si ese texto se lee a tamaño de móvil.** Referencia: en el móvil una miniatura
  mide unos 210×118 px. Si a ti te cuesta leerlo en la imagen grande, en el móvil no
  se lee. Es una evidencia directa, no una opinión.
- **Cuántos focos tiene.** Uno se mira, tres son ruido.
- **Si hay cara y si se reconoce la emoción.** Sin juzgar a la persona: solo si la
  expresión se identifica a tamaño pequeño.
- **Si la esquina inferior derecha está ocupada** — ahí YouTube pinta la duración del
  vídeo y tapa lo que haya debajo.
- **Si el texto de la miniatura repite el del título.** Repetir es desperdiciar la
  mitad del espacio que tienes para convencer.
- **Colores dominantes y tipografía**, para poder juzgar después si hay un sistema
  reconocible entre todas o si cada una va a su aire.

Con las 12-15 delante, mira **el conjunto**: ¿se reconoce que son del mismo canal sin
leer el nombre? ¿O al contrario, son tan iguales entre sí que en la portada del canal
no se distingue una de otra?

### 2F · Los ganchos, palabra por palabra

Coge **3 vídeos**: el más visto de todos, uno reciente normal y uno de los hundidos.

```bash
yt-dlp --skip-download --write-auto-subs --sub-langs "es.*" --sub-format vtt \
  -o "analisis/datos/sub_%(id)s" --no-warnings "https://www.youtube.com/watch?v=ID"
```

El archivo `.vtt` es sucio (marcas de tiempo por palabra, líneas repetidas). **Lee
solo las primeras ~120 líneas** (`head -120`): cubre los primeros 20-30 segundos, que
es lo único que hace falta. No lo limpies, no lo conviertas, no escribas scripts.

De ahí saca **la frase literal con la que empieza el vídeo** y responde:
- ¿A los cuántos segundos entra en el tema? Cuéntalo con las marcas de tiempo.
- ¿Empieza con el tema, o con "hola a todos, bienvenidos a un vídeo más"?
- ¿Hay intro con logo o sintonía? ¿Cuánto dura?
- ¿Repite lo que ya prometía el título, o lo amplía y da una razón para quedarse?

Si el idioma no es español, prueba `--sub-langs "es.*,en.*"`. Si no hay subtítulos
automáticos, el gancho de ese vídeo queda **sin datos**: no lo deduzcas del título.

### 2G · La curva pública de momentos más vistos

Para esos mismos 3 vídeos:

```bash
yt-dlp --no-warnings --print "forma=%(heatmap.::10)s | arranque=%(heatmap.:4)s" \
  "https://www.youtube.com/watch?v=ID"
```

Diez puntos repartidos por el vídeo dan la forma, y los cuatro primeros tramos dan lo
que de verdad importa: **cuánto cae el arranque**. El primer tramo vale siempre 1,0
(es la referencia); lo que se lee es cuánto baja el segundo y el tercero.

Qué significa cada forma:
- **Caída fuerte en los primeros tramos** → el gancho no aguanta. Cruza con lo que
  leíste en 2F: normalmente la caída coincide con el final del saludo.
- **Meseta baja y plana** → nadie vuelve a ninguna parte; el vídeo se ve una vez de
  corrido o se abandona pronto.
- **Pico al final** → la gente salta a buscar la respuesta que el título prometía.
  Es una de las señales más útiles que existen: **el orden del vídeo está mal**, la
  respuesta debería estar arriba.
- **Picos intermedios** → hay algo ahí que funciona. Mira qué es: puede ser el
  material del próximo vídeo.

Si sale `heatmap: null`, ese vídeo no tiene curva pública (suele pasar con pocas
reproducciones). No es un fallo: se marca "sin datos" y se sigue.

**Nómbrala siempre "momentos más vistos (curva pública, relativa)". No es retención.**

### 2H · La ficha técnica de cada vídeo

De lo que ya tienes de 2B, y pidiendo la descripción completa de 3-4 vídeos, mira:

- **Las dos primeras líneas de la descripción** (~120-160 caracteres): es lo único que
  se ve antes de "Mostrar más". ¿Hay ahí algo que sume, o empieza con "Sígueme en
  Instagram"?
- **¿La descripción es la misma copiada y pegada en todos los vídeos?** Compáralas. Es
  frecuentísimo y es un hallazgo.
- **Los hashtags**: cuéntalos. YouTube muestra los 3 primeros encima del título, y
  **con más de 15 hashtags ignora todos los del vídeo**. Si te sale un vídeo con 19
  hashtags, ese vídeo no tiene hashtags en la práctica.
- **Los capítulos**: `caps=[]` significa ninguno. Hacen falta **3 o más**, el primero
  en **00:00** y cada tramo de **10 segundos mínimo** — si no, YouTube no los pinta.
  Un vídeo de 18 minutos sin capítulos es una pérdida directa.
- **Las etiquetas** (`tags`): mira si están rellenas de términos de moda mientras el
  título no lleva la frase que alguien buscaría. Es el patrón clásico de optimizar lo
  que no mueve la aguja: YouTube dice oficialmente que las etiquetas tienen un papel
  **mínimo** en el descubrimiento.
- **La longitud de los títulos**: cuéntala en caracteres. Se ven ~60-70 en escritorio
  y menos en móvil. Un título de 95 caracteres con la promesa al final es una promesa
  que nadie lee.

### 2I · Las capturas de YouTube Studio (si las hay)

Lista `<canal>/analisis/entrada/` y lee cada imagen. De cada una saca **los números literales**, y
escríbelos en el cuaderno tal cual:

- **Captura 1, Panorama general 28 días** — visualizaciones, tiempo de visualización,
  **impresiones**, **porcentaje de clics de las impresiones (CTR)**, duración media.
  Es la más valiosa: es la que dice si el problema es que no le reparten o que no le
  hacen clic.
- **Captura 2, fuentes de tráfico** — el reparto entre portada, vídeos sugeridos,
  búsqueda, Shorts y externos. Más del 70 % del tiempo de visualización de YouTube
  sale de lo que recomienda (portada + sugeridos): si a este canal casi todo le viene
  de la búsqueda, no está en el circuito de recomendaciones y eso explica el techo.
- **Captura 3, retención de un vídeo** — el porcentaje medio visto, la duración media
  en minutos y **la forma de la curva en los primeros 30 segundos**.
- **Captura 4, audiencia** — nuevos vs. recurrentes, suscriptores vs. no
  suscriptores.

Cómo se leen los números de retención (referencias de documentación de YouTube y
estudios públicos, 2026 — **van al informe como referencia, con su fuente, nunca como
dato medido del canal**):

| Duración del vídeo | Porcentaje medio visto que se considera bueno |
|---|---|
| Menos de 5 min | 50 % o más |
| 5-15 min | 40-50 % |
| 15-30 min | 30-40 % |
| Más de 30 min | 20-30 % |

Y dos cosas que hay que decir siempre al usar esa tabla: para el algoritmo pesa más la
**duración media vista en minutos** que el porcentaje (un 25 % de 40 minutos es más
tiempo que un 70 % de 6), y el CTR de impresiones se mueve entre **2 % y 10 %** en la
mitad de los canales, con una trampa importante: **cuando un vídeo se reparte a mucha
más gente el CTR baja aunque el vídeo funcione mejor que nunca**. Un CTR bajo con
impresiones altas no es lo mismo que un CTR bajo con impresiones bajas.

**Privacidad al leer capturas:** si ves correos, teléfonos o datos de terceros, avisa
al usuario y **no los incorpores** ni al informe ni al cuaderno. Las capturas **no se
incrustan** en el HTML: se citan ("captura de Studio, Panorama general 28 días").

Si falta una captura, no la supongas: apunta qué dimensiones quedan sin datos por eso
y pídesela una vez más al terminar, ya con un motivo concreto ("me falta el Panorama
general para poder decirte si la fuga está en el bloque 1 o en el 2").

### 2J · La mediana y los multiplicadores (la parte más accionable)

Un vídeo no se juzga por sus visitas: se juzga **contra la mediana de su propio
canal**. Así se separa lo que funcionó de lo que simplemente es viejo.

**Cómo se calcula, y hay que hacerlo bien:**

1. Coge los vídeos largos de la muestra con una edad de entre **28 días y 18 meses**.
   Los más nuevos todavía no han madurado y los muy viejos han acumulado visitas
   durante años: mezclarlos falsea todo.
2. **Excluye los dos más recientes** aunque pasen el filtro.
3. Ordena las visitas y coge **la mediana** (el valor de en medio), no la media: un
   solo vídeo viral desplaza la media y deja de servir para comparar.
4. **Multiplicador de cada vídeo** = sus visitas ÷ la mediana.

| Multiplicador | Lectura |
|---|---|
| **3× o más** | Funcionó de verdad. Hay que averiguar qué hizo distinto |
| 1,5× - 3× | Por encima de su media |
| 0,5× - 1,5× | Lo normal del canal |
| **Menos de 0,5×** | Se hundió. Hay que averiguar por qué |
| **10× o más** | Outlier de manual: es la mejor información que tiene el canal |

Pon **la mediana, la ventana de edad y cuántos vídeos entraron** a la vista en el
informe. Si no hay suficientes vídeos en esa ventana para una mediana decente (menos
de 5), amplía la ventana y **dilo**: un método explicado es creíble, un número suelto
no.

Y ahora la lectura, que es lo que se paga: coge los que están **por encima de 3×** y
busca **qué tienen en común**. Tema, tipo de título (¿pregunta, número, consecuencia,
error?), tipo de miniatura, duración, formato. Casi siempre hay un patrón, casi
siempre el dueño del canal no lo ha visto, y casi nunca lo ha repetido. Ese patrón es
el que ordena los próximos 10 vídeos del Paso 5.

### 2K · El cruce (donde salen los hallazgos que nadie ve)

Compara sistemáticamente y apunta cada choque:

- **Lo que dijo que vende** (Paso 1) **vs. lo que se entiende viendo el canal.** Si
  dijo que lo suyo es X y en 12 títulos X no aparece, ese es probablemente el hallazgo
  principal del informe.
- **Los títulos entre sí**: agrúpalos por tema. ¿Cuántos temas distintos hay? YouTube
  reparte por parecido: un canal de siete temas no se parece a nada y no tiene a quién
  recomendárselo.
- **El título vs. lo que entrega el vídeo** (transcripción + capítulos + curva). Un
  título que promete "en 5 minutos" en un vídeo de 18 no es clickbait de opinión: es
  clickbait demostrado.
- **La miniatura vs. el título**: ¿se repiten o se suman?
- **Lo que le funcionó vs. lo que hizo después.** Mira las fechas: después del vídeo
  que hizo 10×, ¿qué publicó? Si volvió a lo de siempre, ahí está el primer punto del
  plan.
- **Los Shorts vs. los largos**: mismos temas o mundos distintos.
- **Las fechas de subida**: vídeos por mes, huecos más largos, tendencia. Los huecos
  están **en los datos**: son evidencia, no opinión.
- **Sus propios números entre sí** (si hay Studio): impresiones → clics → retención →
  suscriptores, con la operación a la vista.

---

## Paso 3 — Puntuar las 16 dimensiones y localizar la fuga

El embudo es el de YouTube de verdad: **te reparten → hacen clic → se quedan →
vuelven y te compran.** Es secuencial: un agujero arriba estropea todo lo de abajo.

Cada dimensión de **0 a 100** con estos anclajes fijos, no a ojo:

| Nota | Significado |
|---|---|
| 0-20 | No existe |
| 21-40 | Existe pero está mal o abandonado |
| 41-60 | Cumple lo mínimo, sin nada que le diferencie |
| 61-80 | Bien hecho, con fallos concretos identificados |
| 81-100 | Referencia de su nicho |

### Bloque 1 · ¿Te reparten? (25 puntos)

**1 · Nicho y coherencia temática.** Lee los 12 títulos seguidos: ¿se puede decir de
qué va el canal? Agrúpalos por tema y cuenta los grupos. *Nota baja: siete temas sin
relación, o un canal que dice ser de una cosa y publica de otra. Nota alta: tres
temas como mucho, todos reconocibles como del mismo canal, y un espectador de ese
nicho sabría qué esperar del siguiente vídeo.* Evidencia: los títulos agrupados.

**2 · Ritmo y constancia.** Fechas reales de subida: vídeos por mes, el hueco más
largo, y la tendencia (¿acelera o se apaga?). Los canales que publican 3 o más veces
por semana crecen más rápido en los estudios públicos, pero lo que de verdad se paga
es la **constancia**: un hueco de más de 2-3 semanas rompe el hábito de la audiencia.
*Nota baja: huecos de meses, o un arranque a cuatro vídeos por semana seguido de
silencio. Nota alta: un ritmo sostenido que se puede predecir.* Evidencia: las fechas.

**3 · Formato y duración.** Reparto entre vídeo largo y Shorts, duración de cada vídeo
y su dispersión, y coherencia con el nicho y con lo que le funciona. ¿Los Shorts
tratan los temas del canal o traen suscriptores que no volverán? ¿Las duraciones son
las que pide el tema o las que salieron? *Cruza con los multiplicadores: si sus
vídeos de 8 minutos hacen 3× y los de 25 hacen 0,4×, la duración es un hallazgo, no
un detalle.*

**4 · Buscabilidad y ficha técnica.** La frase que alguien buscaría, ¿está en el
título? Y después: las dos primeras líneas de la descripción, los capítulos (≥3, el
primero en 00:00, ≥10 s cada uno), los hashtags (2-3; **más de 15 y YouTube los
ignora todos**), las etiquetas, el idioma y los subtítulos. *Nota baja: descripción
copiada y pegada en todos los vídeos, cero capítulos, 19 hashtags y las etiquetas
llenas de términos de moda. Nota alta: cada vídeo con su ficha hecha.* Evidencia: el
literal de cada campo.

### Bloque 2 · ¿Hacen clic? (25 puntos) — el bloque de más palanca

**5 · Miniatura: legibilidad.** A tamaño de móvil: un solo foco, texto de **3-5
palabras como máximo**, contraste alto, la esquina inferior derecha libre (la tapa la
duración), y si hay cara, que la emoción se reconozca. **Se juzga viendo las
imágenes**, con el número de palabras contado. *Nota baja: 11 palabras de texto que no
se leen. Nota alta: se entiende la promesa de un vistazo a 210 px.*

**6 · Miniatura: sistema y reconocibilidad.** Con todas delante: ¿se reconoce que son
del mismo canal sin leer el nombre? ¿Hay un sistema —color, tipografía, posición del
texto, tratamiento— o cada una va a su aire? Y el error contrario, que también
cuesta clics: ¿son tan iguales que en la portada del canal no se distingue una de
otra? *Cinco tipografías distintas en cinco vídeos es nota baja aunque cada miniatura
por separado esté bien.*

**7 · Títulos: promesa y curiosidad.** Longitud en caracteres, lo importante delante,
especificidad, hueco de curiosidad, número o resultado concreto. *Nota baja: el
título es el nombre de la tarea ("Trasplante de tomate a maceta de 30 litros"): no
promete nada y no abre ninguna pregunta. Nota alta: dice qué vas a conseguir y deja
algo por resolver.* Evidencia: **tres títulos suyos citados literales**.

**8 · La pareja título + miniatura.** ¿Se repiten o se suman? Si la miniatura dice lo
mismo que el título, se ha desperdiciado la mitad del espacio. Y aquí se juzga el
**clickbait**, cruzando con el bloque 3: promesa que el vídeo no cumple = retención
destruida = YouTube deja de repartirlo. *Un título que promete "en 5 minutos" en un
vídeo de 18 minutos se señala con el dato al lado, no como opinión.*

### Bloque 3 · ¿Se quedan? (25 puntos)

**9 · El gancho.** Los primeros 5-15 segundos, **leídos de la transcripción real**.
¿Entra en el tema o empieza saludando? ¿Hay intro con logo? ¿Cuántos segundos pasan
hasta la primera frase útil? Se cruza con la caída del primer tramo de la curva de
momentos más vistos. *Nota baja: 22 segundos de presentación y sintonía antes de
empezar, y la curva se derrumba justo ahí. Cita el gancho literal.*

**10 · Estructura y ritmo.** Capítulos, forma de la curva, relleno, y dónde se
derrumba y qué había en ese punto. Un pico al final es la señal más clara de que el
orden está mal: la gente salta a buscar lo que el título prometía.

**11 · Se cumple la promesa.** El título prometía X: ¿el vídeo da X, y **en qué
minuto**? Si la respuesta llega en el minuto 9 de 10, el problema no es la retención:
es el orden. Evidencia: el título, el capítulo o el momento de la transcripción donde
aparece la respuesta.

**12 · Producción que afecta a que se queden.** Solo lo que impide seguir el vídeo:
audio que no se entiende, ausencia de subtítulos donde hacen falta, texto en pantalla
ilegible, plano que no deja ver lo que se explica. **No se juzga a la persona**: nada
de su aspecto, su voz ni su forma de hablar. Si no puedes comprobarlo (no has visto
el vídeo, solo su transcripción y su miniatura), **márcalo "sin datos"**: es mejor un
hueco honesto que una nota inventada.

### Bloque 4 · ¿Vuelven y te compran? (25 puntos)

**13 · Conversión a suscriptor.** Visitas totales ÷ suscriptores, suscriptores ÷
número de vídeos, y con Studio los suscriptores ganados por vídeo. Pon la operación a
la vista. Recuerda que **los suscriptores vienen redondeados** por YouTube: redondea
el resultado y dilo.

**14 · Sesión y catálogo.** Listas de reproducción, series, tráiler del canal,
secciones de la portada, enlaces entre vídeos en las descripciones, pantallas finales.
*Un canal sin una sola lista de reproducción pierde la segunda visita: alguien a quien
le ha gustado un vídeo no encuentra qué ver después. Es de lo más barato de arreglar
y de lo que más se descuida.*

**15 · Comunidad.** Comentarios por mil visitas y likes por mil visitas (calculados
con sus datos), ¿responde?, ¿hay preguntas comerciales sin contestar? Una pregunta
comercial sin responder es una venta perdida documentada: **cítala por su contenido,
nunca con el nombre de quien la escribe.** Si no puedes comprobar si responde,
**pregúntaselo al usuario** y puntúa con lo demás mientras llega la respuesta.

**16 · Negocio y activo propio.** Qué vende, si se ve desde el canal, los enlaces y a
dónde llevan de verdad, lista de correo, patrocinios, y su situación frente al
programa de socios (1.000 suscriptores + 4.000 horas públicas en 12 meses, o 1.000 +
10 M de visitas de Shorts en 90 días; el nivel de apoyo de fans desde 500
suscriptores + 3 subidas en 90 días + 3.000 horas — **datos oficiales de YouTube, van
con su fuente**). La pregunta de fondo: **¿toda su audiencia está alquilada a YouTube
o hay algo suyo?** Y si sale el tema del RPM: varía enormemente por nicho, va como
orden de magnitud con su fuente, y siempre con la frase de que el dinero de un canal
pequeño no está en el RPM sino en lo que vende con la audiencia. **Nunca una cifra de
ingresos inventada.**

### El cálculo

- **Nota de cada bloque** = media de sus 4 dimensiones, llevada a 25:
  `(media / 100) × 25`, con un decimal. Pon la operación a la vista en el informe.
- **Nota global** = suma de los cuatro bloques, redondeada. 0-100.
- Bandas de la global: **0-39 crítico · 40-59 flojo · 60-74 aceptable · 75-89 bueno ·
  90-100 referencia**.

Reglas de puntuación:

- Cada nota va con **al menos una evidencia literal**: un título, una duración, una
  fecha, un número, lo que se ve en una miniatura. **Sin evidencia no hay nota.**
- **"Sin datos"**: si no pudiste comprobar una dimensión, no entra en la media de su
  bloque y el informe explica por qué. Nunca pongas una nota "prudente" de relleno, y
  nunca un 0 (un 0 significa "no existe", que es un dato).
- Si un bloque entero queda sin datos, la global se reescala sobre los que sí puntúan
  — `suma / (25 × nº de bloques con nota) × 100` — y se dice en el informe.
- **Si lo que falta es un trozo de una dimensión y no la dimensión entera**, no la
  dejes sin datos: sería tirar evidencia buena. Puntúa con lo probado, marca el hueco
  a la vista y di qué cambiaría si se aportara. Ejemplo: no hay datos de si responde
  los comentarios, pero sí hay comentarios y likes por mil visitas → la dimensión 15
  puntúa con eso y la pregunta queda escrita como pendiente. **Preguntar no bloquea el
  análisis.**
- Sé **exigente**. Un canal pequeño que no crece está normalmente entre **25 y 50**.
  Un 80 es un canal que ya vive de esto. Decirlo claro es el servicio que se vende.

### La fuga

La fuga es **el eslabón donde se le cae la mayoría de la gente**. No es la nota: es el
titular del informe. Se localiza con la mejor prueba disponible, en este orden:

**1) Con capturas de Studio, mandan sus números.** La cadena es:

    impresiones → clics (CTR) → retención (% y minutos) → suscriptores / sesión

| El salto que se derrumba | El bloque que lo explica |
|---|---|
| Pocas impresiones: YouTube no lo está repartiendo | Bloque 1 · Te reparten |
| Muchas impresiones y CTR por debajo del 2 % | Bloque 2 · Hacen clic |
| CTR normal y retención por debajo de su banda de duración | Bloque 3 · Se quedan |
| Retención buena y casi ningún suscriptor ni clic a nada suyo | Bloque 4 · Vuelven y te compran |

Pon la cadena entera a la vista, con sus cifras y en una sola línea, así:

    [impresiones] → [clics] ([CTR] %) → [duración media] sobre [duración del vídeo] ([% visto]) → [+suscriptores]

Los cuatro números salen de sus capturas. Si falta uno, se deja el hueco marcado en la
cadena en lugar de rellenarlo.

**2) Sin capturas**, la fuga es el **primer bloque, en orden de embudo, que baja de
15/25**. Si ninguno baja de 15, el más bajo; si hay empate, el más temprano.

**Regla anti-falso-positivo, y aquí es crítica: el dato medido manda sobre el juicio
del mecanismo.** Si sus impresiones son altas, el bloque 1 **no** es la fuga aunque su
nicho y su ficha técnica tengan mala nota: ahí esas notas son margen de mejora, no la
causa. Y al revés: un CTR del 1,4 % con 400.000 impresiones señala el bloque 2 aunque
las miniaturas "no parezcan tan malas". Una nota baja no es automáticamente la fuga.

Si varios bloques están por debajo de 15/25 —lo normal en un canal que no crece—,
**dilo**: hay más de un agujero, se nombran todos y se tapan **en orden de embudo**,
porque arreglar el de abajo sin arreglar el de arriba no cambia nada.

Resume la fuga en **una frase que el usuario pueda repetir de memoria**: "te enseñan a
mucha gente y casi nadie hace clic". **Todo el informe se ordena alrededor de la fuga,
y los próximos 10 vídeos empiezan por ahí.**

---

## Paso 4 — La prueba de la portada y los hallazgos

### La prueba de la portada

Escríbela **en primera persona**, como la diría alguien que acaba de llegar al canal
por primera vez y le ha dado tiempo a mirar cinco segundos:

> "Veo un canal que habla de plantas. Hay una miniatura con mucho texto que no llego a
> leer, otra con una foto de una maceta y otra que parece de un viaje. No sabría decir
> si esto es para alguien que empieza o para alguien que ya tiene huerto. No veo por
> dónde empezar: no hay ninguna lista. Si me gustara un vídeo, no sabría qué ver
> después."

Sale **solo** de la portada, las miniaturas y los títulos: nada de lo que averiguaste
después. Es la sección que más duele y más convence, y es completamente honesta porque
es exactamente lo que le pasa a su espectador.

### Los hallazgos

Para cada uno: **qué pasa · la evidencia literal · por qué le cuesta visitas o
clientes · cómo se corrige · prioridad (alta / media / baja)**. Un problema sin
solución al lado es una queja, no un análisis.

Errores frecuentes que debes buscar activamente:

- Nicho difuso: vídeos de temas que no tienen nada que ver entre sí
- Ritmo roto: rachas de cuatro vídeos y después meses en blanco
- Títulos que son el nombre de la tarea, sin promesa ni curiosidad
- Títulos larguísimos con lo importante al final
- Miniaturas con demasiado texto, ilegibles a tamaño de móvil
- Miniaturas sin sistema: cada una de un color y una tipografía distintos
- Texto de la miniatura que repite literalmente el título
- Ganchos que empiezan saludando y presentándose, con intro y sintonía
- La curva de momentos más vistos derrumbándose donde acaba el saludo
- Pico al final de la curva: la respuesta está enterrada
- Título que promete una duración o un resultado que el vídeo no cumple
- Descripción idéntica copiada y pegada en todos los vídeos
- Más de 15 hashtags (YouTube los ignora todos)
- Cero capítulos en vídeos largos
- Etiquetas rellenas de términos de moda mientras el título no lleva la frase que se
  busca
- Shorts de temas que el canal no trata en largo
- Ninguna lista de reproducción, ninguna sección en la portada, sin tráiler
- Nada propio: ni web, ni lista de correo; toda la audiencia alquilada a YouTube
- **Un vídeo que reventó y no se ha repetido nunca** — casi siempre está ahí, y casi
  siempre es el hallazgo más valioso del informe

---

## Paso 5 — El packaging y los próximos 10 vídeos

**En modo referente**, este paso se sustituye por **"Qué copiar para <nombre del canal>"**: 5-8
lecciones concretas con su evidencia (el outlier, el gancho literal, la miniatura), cada una traducida
a nuestro formato (narrador, estilo, duración y producto del canal: `<canal>/CANAL.md` y `<canal>/docs/concepto.md`) y con dónde se aplicaría
(`<canal>/docs/concepto.md`, un agente, `canal.json`, `<canal>/docs/ideas.md`). Propón los cambios; **no los apliques
sin la aprobación del usuario**. Los temas que te sugieran sus outliers, a `<canal>/docs/ideas.md` como
propuesta.

**En modo nuestro canal**, lo de abajo, con los formatos de `<canal>/docs/concepto.md` → "Formatos que
funcionan" y la plantilla de miniatura del canal (agentes `director-arte` y `estratega-youtube`).

Todo lo de este paso son **propuestas**, y en el informe van marcadas como tales. Se
construyen con **sus** temas, **sus** palabras y **lo que ya le funcionó a él**: nada
genérico. La prueba de que el trabajo es real es que las propuestas no valdrían para
otro canal.

### Cinco vídeos suyos, reescritos

Coge 5 vídeos reales —incluyendo alguno hundido y alguno con potencial— y para cada
uno:

- **Antes**: el título literal y la miniatura tal como es (lo que se ve en ella).
- **Después**: el título reescrito, y la miniatura **descrita para que alguien la
  pueda hacer**: qué se ve, qué texto lleva (con las palabras contadas), dónde va cada
  cosa, qué color domina.
- **Por qué**: una línea. Qué problema concreto arregla el cambio.

### Los próximos 10 vídeos

Listos para grabar. Cada uno con:

- **El título** ya redactado, con su longitud en caracteres.
- **La miniatura descrita** (mismo criterio que arriba).
- **El gancho de los 10 primeros segundos**, escrito palabra por palabra. Esto es lo
  que más se agradece y casi nadie lo entrega.
- **La duración objetivo** y por qué esa.
- **Qué bloque del embudo arregla.**

Reglas: **al menos 4 tienen que atacar la fuga**, y **al menos 2 tienen que repetir
el patrón de lo que ya le funcionó** (el outlier del Paso 2J, con otro contenido). Si
el canal tiene un vídeo a 10× y no lo ha vuelto a intentar, ese es el vídeo número 1
de la lista.

### La plantilla de ficha técnica

Una plantilla que pueda copiar y pegar en cada vídeo nuevo:

- Las **dos primeras líneas de la descripción** con la fórmula a la vista (lo que se
  ve antes de "Mostrar más").
- El **esqueleto de capítulos** para su formato habitual, con el primero en 00:00.
- Los **2-3 hashtags** que le corresponden, y la advertencia de por qué no 19.
- Los enlaces fijos: a su producto, a su lista de reproducción, a su siguiente vídeo.

---

## Paso 6 — Generar el informe HTML

Informe visual y ejecutivo. Libertad creativa en el diseño, contenido obligatorio.

### Secciones, en este orden

1. **Cabecera** — nombre del canal, handle, suscriptores, nº de vídeos, fecha del
   análisis y el modo (referente o nuestro canal). Sin firma.
2. **Titulares** — nota global /100 con su banda, los 4 bloques con su X/25 en barras,
   y **la fuga señalada** con su frase de memoria.
3. **La prueba de la portada** — en primera persona, destacada.
4. **Resumen ejecutivo** — 3 párrafos: cómo se ve el canal hoy · qué le está costando
   · qué cambia si tapa la fuga.
5. **El embudo dibujado** — los cuatro bloques en HTML y CSS, estrechándose de arriba
   abajo, con su nota y la fuga marcada. Sin imágenes ni dependencias externas.
6. **La tabla de los vídeos** — la muestra analizada: miniatura, título, duración,
   fecha, visitas, **multiplicador vs. la mediana**, likes y comentarios por mil
   visitas. Los outliers y los hundidos destacados a la vista.
7. **Los outliers** — los vídeos muy por encima y muy por debajo de la mediana, y
   **qué tienen en común los de arriba**. Con la mediana, la ventana de edad y cuántos
   vídeos entraron en el cálculo a la vista.
8. **Bloque por bloque** — las 16 dimensiones: nota, evidencia literal, qué está bien,
   qué falla, qué hacer. Las "sin datos" marcadas como tales, nunca con un 0.
9. **Miniaturas: la galería comentada** — las miniaturas de verdad, cada una con lo
   que se ve y su problema concreto. Es la sección que más convence: se ve el trabajo
   hecho sobre sus propias imágenes.
10. **Títulos: antes y después** — 5 títulos suyos y su versión reescrita, con una
    línea de por qué. Marcado como propuesta.
11. **Los ganchos, palabra por palabra** — la transcripción literal de los primeros
    segundos de 3 vídeos, con la curva de momentos más vistos al lado si existe.
12. **Los próximos 10 vídeos** — tabla con título, miniatura descrita, gancho,
    duración objetivo y qué bloque arregla.
13. **Lo que NO debe cambiar** — obligatoria. Lo que ya le funciona: si alguien hace
    algo bien y se lo cambias, le empeoras el resultado.
14. **Nota metodológica** — qué se extrajo y con qué (yt-dlp, con la fecha), cuántos
    vídeos entraron en la muestra y cómo se eligieron, qué quedó sin datos y por qué,
    que la curva de momentos más vistos es pública y relativa y **no es la
    retención**, que los suscriptores vienen redondeados por YouTube, y que no se ha
    accedido a ninguna cuenta ni a ningún dato privado más allá de las capturas que
    aportara el usuario.

### Las miniaturas dentro del HTML

Una sola forma, y es importante:

```html
<img src="miniaturas-[canal]/ID.jpg" alt="Miniatura de: [título]"
     onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/ID/mqdefault.jpg'">
```

Ruta relativa a la carpeta que está al lado, y una copia de seguridad remota por si el
HTML se mueve solo. **Nunca conviertas las imágenes a base64 dentro del HTML**: son
cientos de KB que engordan el archivo sin aportar nada.

### Requisitos del informe

- **Autocontenido en código**: CSS inline, sin dependencias, sin fuentes externas, sin
  scripts externos. Se abre en cualquier navegador. Las únicas referencias externas
  posibles son las copias de seguridad de las miniaturas.
- **No incrustes las capturas de Studio.** Son del usuario y pueden llevar datos de
  terceros: se citan ("captura de Studio, Panorama general 28 días").
- **Responsive**: se lee bien en móvil.
- **Imprimible**: `@media print` sin secciones cortadas ni colores perdidos, para
  guardarlo en PDF.
- **Navegación interna** entre secciones.
- **Cero emojis decorativos.** Tono profesional y directo.
- Que no parezca un informe genérico: **cada afirmación con su evidencia al lado**.

---

## Paso 7 — Guardar y presentar

Guarda en `<canal>/analisis/`:

- `youtube-[canal].html` — el informe.
- `[canal]-packaging.md` — los 5 vídeos reescritos, los próximos 10 y la plantilla de
  ficha técnica, en Markdown y **con casillas** `- [ ]` en los 10 vídeos para ir
  marcando. Es el archivo con el que va a trabajar.
- `[canal]-hallazgos.md` — el cuaderno: la trazabilidad del informe.
- `miniaturas-[canal]/` — las miniaturas descargadas (ya están ahí).
- `datos/` — los datos crudos, para no volver a descargar si se profundiza.

Abre el informe en el navegador (`open` en Mac, `start` en Windows).

Presenta al usuario, en este orden y corto:

1. La **nota global** y su banda.
2. **Dónde está la fuga**, en la frase de memoria.
3. **El dato que más le va a doler y más le va a servir**: su outlier. "Tu vídeo X hizo
   55 veces la mediana del canal y no has vuelto a hacer nada parecido."
4. **El vídeo número 1** de los próximos 10, con su título ya escrito.
5. Los caminos: profundizar en algo ("profundiza en las miniaturas", "dame 10 ideas
   más", "analiza 30 vídeos", "compara con estos canales") o ponerse a grabar.

---

## Módulo opcional · Comparar con competidores

Si el usuario da 1-3 enlaces de canales de su nicho ("compara con estos canales"),
saca de cada uno **solo lo público y barato** (2A, 2B con `--playlist-end 6`, y las
miniaturas de sus 3 vídeos más vistos con 2C):

| Qué se compara | Por qué importa |
|---|---|
| Suscriptores y antigüedad | El punto de partida |
| Vídeos por mes | El ritmo del nicho, no el ritmo "ideal" |
| Duración típica | Lo que el nicho aguanta de verdad |
| Mediana de visitas | Su listón real, con la misma ventana de edad |
| Tipo de título | Qué fórmula usa quien ya funciona ahí |
| Tipo de miniatura | Lo que hay que superar en la portada |

**No puntúes las 16 dimensiones de los competidores**: no es su informe, y sería
inventar la mitad. La comparación es una tabla y tres conclusiones, y va como sección
extra del HTML. Lo que sí se hace: si sus competidores tienen un patrón claro que este
canal no está usando, eso es un hallazgo del bloque 1 o del 2.

---

## Reglas de la skill

- **Cero invención.** Ni visitas, ni CTR, ni retención, ni impresiones, ni
  suscriptores, ni RPM, ni ingresos. Todo con evidencia extraída o marcado "sin datos".
- **Las tres capas nunca se mezclan**: los datos del canal son reales y se citan tal
  cual · las referencias del sector van con su fuente y su fecha y jamás disfrazadas
  de datos de este canal · lo que propones va marcado como propuesta.
- **La curva de momentos más vistos no es la retención.** Pública, relativa, y solo en
  algunos vídeos.
- **Los suscriptores vienen redondeados** por YouTube: no hagas cuentas de precisión
  falsa con ellos.
- **Se juzga el canal, nunca la persona.** Nada sobre su aspecto, su cuerpo, su voz,
  su acento ni su vida privada, ni aunque el usuario lo pida. Sí puedes decir si su
  cara en la miniatura cumple su función.
- **Honesto sin ser cruel.** Cada problema con su solución al lado. La sección "lo que
  NO debe cambiar" es obligatoria.
- **No se descargan vídeos.** Solo metadatos, subtítulos y miniaturas.
- **No se toca el canal.** Se analiza y se escriben textos: no se publica, no se
  responden comentarios, no se cambian miniaturas. No hace falta ninguna cuenta.
- **Privacidad**: ningún nombre de tercero que comente aparece en el informe; si en una
  captura hay correos, teléfonos o datos de terceros, avisa y no los incorpores; las
  capturas no se incrustan en el HTML.
- **Todo a `<canal>/analisis/`.** Nunca dejes archivos sueltos en la raíz del proyecto. Al terminar, resume
  lo aprendido en `<canal>/docs/referentes.md` (modo referente) o en `<canal>/docs/historial.md` (nuestro canal).
- **Nunca pidas al usuario que abra una terminal**: los comandos los ejecutas tú.

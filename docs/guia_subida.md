# Guía de subida (Shorts y vídeos largos)

Sirve para cualquier pieza del canal. Los TEXTOS de cada una (título, descripción, etiquetas, comentario,
textos de TikTok y Reels) están en su carpeta, en **`publicacion_final.md`** (nunca en `publicacion.md`,
que se regenera al montar). Abre los dos archivos a la vez y ve copiando bloque a bloque.

Archivos de cada pieza (`<canal>/videos/<carpeta>/`):

| Archivo | Short | Vídeo largo |
|---|---|---|
| Vídeo | `final.mp4` | `final.mp4` |
| Textos | `publicacion_final.md` | `publicacion_final.md` |
| Subtítulos | `subtitulos.srt` + `subtitulos_en.srt` | ídem |
| Miniatura | (se elige un fotograma en la app) | `miniatura_1.jpg`, `_2`, `_3` |
| Shorts sacados del vídeo | – | `short_1.mp4`, `short_2.mp4` (se suben como Shorts, con esta guía) |

> Antes de empezar: comprueba que `publicacion_final.md` existe y es de la versión final del vídeo.
> Si falta, pídemelo ("prepara la publicación de SNNN").

---

## 0. Una sola vez por canal: preparar YouTube Studio (≈ 20 min)
Origen: `docs/mercado.md` §3b y §3c. Efecto modesto pero gratis; se hace una vez y ahorra olvidos en cada subida.
Los textos concretos del canal activo están en `<canal>/docs/progreso.md` (o pídemelos).
1. **Configuración → Canal → Información básica → Palabras clave**: las búsquedas del público del canal,
   separadas por comas (máx. 500 caracteres). Revisadas a mano, sin nombres de otros canales.
2. **Personalización → Información básica → Descripción**: que diga con palabras normales lo que la gente
   busca (p. ej. "curiosidades", "historia", "ciencia"). Escrita por nosotros, no pegada de una IA.
   **Correo de contacto** (Personalización → Información de contacto): para marcas y patrocinios.
3. **Configuración → Ajustes de subida predeterminados** (se aplican a cada vídeo nuevo):
   - **Descripción**: la parte fija (coletilla del canal, "Fuentes:" y el aviso de enlaces de afiliado).
   - **Categoría**: Educación. **Idioma del vídeo y del título**: Español (España).
   - **Configuración avanzada**: **Permitir inserción** activado (otras webs pueden insertar el vídeo);
     comentarios activados; licencia estándar de YouTube (no Creative Commons: regalaría las imágenes
     a quien resube vídeos ajenos).
   - **Capítulos automáticos: desactivados.** Los capítulos los pone la descripción; los automáticos
     pueden destripar el giro final ("Aquí se revela…") y animan a saltarse partes.
   - **Sitios destacados** y **conceptos automáticos** (si aparecen): desactivados.
   - **Descripción fija**: añade al final el enlace de suscripción directa,
     `https://www.youtube.com/@<handle>?sub_confirmation=1` (abre la ventana de "Suscribirse").
4. **Personalización → Desarrollo de la marca → Marca de agua del vídeo**: el avatar del canal, con
   **"Durante todo el vídeo"** (quien lo pulsa se suscribe desde cualquier momento).
5. **Personalización → Diseño (pestaña Inicio)**: tráiler para quien no está suscrito (un vídeo largo
   o un Short tráiler cuando lo haya) y **una lista por pilar o serie** arriba, después "Vídeos" y
   "Populares". Si YouTube pone una fila de Shorts la primera, bájala o quítala: los largos son los que
   convierten en suscriptores.
6. **Configuración → Canal → Funciones avanzadas**: verifica el canal (documento de identidad; tarda
   ≈ 24 h). Sin eso no se puede apelar una reclamación ni pedir la monetización.

## A. YouTube: SHORT (≈ 10 min)

Recomendado: **subir desde el móvil** (app de YouTube), porque es el único sitio donde se elige la
portada de un Short. Si subes desde el ordenador (studio.youtube.com), la portada la elige YouTube.

**Desde la app de YouTube (móvil):**
1. Pásate `final.mp4` al móvil (AirDrop, o súbelo a Google Drive/Fotos y descárgalo en el móvil).
2. App de YouTube → **+** → **Vídeo** (o **Short**) → elige `final.mp4`. Si te ofrece recortar o
   añadir música, **no toques nada** (ya lleva su audio) → **Siguiente**.
3. **Portada**: toca el lápiz de la portada y elige el fotograma del principio, el que muestra el
   título grande en pantalla (en S001: "¿SABÍAS ESTO DE VENUS?").
4. **Título**: copia el **Principal** de `publicacion_final.md` → "Títulos".
5. **Descripción**: copia el bloque entero de "Descripción (YouTube)" (termina con los 3 hashtags).
6. **Visibilidad**: **Pública** (o **Programar** para la hora que elijas; una hora buena para empezar:
   entre las 18:00 y las 20:00 de España).
7. **Audiencia**: "No, no es contenido creado para niños".
8. **Contenido alterado o sintético** (si lo pregunta): lo que diga `canal.json` → `cumplimiento` →
   `contenido_sintetico`, con su motivo. No lo des por «No» sin mirarlo: depende de cada canal y de la política
   vigente de YouTube.
9. **Vídeo relacionado** (si aparece): un vídeo largo del mismo tema, si existe; si no, vacío.
10. **Subir**.

**Después, desde el ordenador (studio.youtube.com), en ese Short → Detalles:**
11. **Mostrar más → Etiquetas**: pega el bloque de "Etiquetas".
12. **Idioma del vídeo**: Español (España). **Categoría**: Educación.
13. **Guardar**.
14. **Subtítulos** (menú de la izquierda) → el Short → **Añadir idioma → Español** → **Subtítulos →
    Añadir → Subir archivo → "Con tiempos"** → `subtitulos.srt` → **Publicar**. Repite con **Inglés** y
    `subtitulos_en.srt`.
15. **Comentario fijado**: en la app o en youtube.com, abre el Short → Comentarios → escribe el
    "Comentario fijado" de `publicacion_final.md` → publícalo → en sus tres puntos, **Fijar**.
    (Si hay un "segundo comentario", publícalo una o dos horas después, sin fijarlo.)
16. **Primera hora**: contesta a los comentarios que lleguen (ayuda a que YouTube lo reparta).

## B. YouTube: VÍDEO LARGO (≈ 20 min)

Desde el ordenador: **studio.youtube.com → Crear → Subir vídeos → `final.mp4`**. Mientras se sube:

**Paso "Detalles":**
1. **Título**: el Principal de `publicacion_final.md`.
2. **Descripción**: el bloque completo. Debe llevar los **capítulos** (la línea `0:00 …` y las
   siguientes): así YouTube los muestra solo. Comprueba que el primero es `0:00`.
3. **Miniatura**: sube `miniatura_1.jpg` (la recomendada en `publicacion_final.md`).
4. **Probar y comparar** (junto a la miniatura): añade `miniatura_2.jpg` y `miniatura_3.jpg` para que
   YouTube pruebe las tres y se quede con la que más clics consiga.
5. **Listas de reproducción**: añádelo a la de su serie o tema (crea la lista si no existe; ver
   "Listas" en `publicacion_final.md`).
6. **Audiencia**: "No, no es contenido creado para niños".
7. **Mostrar más**:
   - **Contenido alterado o sintético**: según `canal.json` → `cumplimiento` (como en los Shorts).
   - **Etiquetas**: el bloque de "Etiquetas".
   - **Idioma**: Español (España). **Categoría**: Educación.
   - **Subtítulos**: "Subir archivo" → `subtitulos.srt` ("Con tiempos"). El inglés, en el paso 14.
   - **Comentarios**: activados.
   - **Permitir inserción**: activado (si no lo dejaste así en los ajustes predeterminados).
   - **Capítulos automáticos**: desactivado (comprueba que se aplicó el ajuste predeterminado).
   - **Publicar en el feed de suscripciones y notificar a los suscriptores**: mira lo que diga
     `<canal>/docs/progreso.md` (conviene desactivarlo en los primeros largos si los suscriptores que hay
     vinieron por otro contenido).

**Paso "Elementos del vídeo":**
8. **Pantalla final**: **Añadir** → **Importar desde vídeo** o plantilla con **1 vídeo + Suscribirse**.
   El vídeo ya trae 20 s finales preparados para ella (la mitad derecha libre); colócala en esos 20 s.
   Vídeo: "El más reciente" o "El más adecuado para el espectador".
9. **Tarjetas** (opcional): si en el guion se menciona otro vídeo del canal, una tarjeta en ese momento.

**Paso "Monetización" / "Idoneidad para anuncios"** (solo cuando el canal esté monetizado): marca con
sinceridad lo que tenga el vídeo (p. ej. una herida o un accidente contados sin detalle gráfico); si de
verdad no tiene nada, "Nada de lo anterior". Si YouTube descubre que se marca mal, deja de fiarse de las
calificaciones del canal.

**Paso "Comprobaciones"**: espera a que diga "No se han encontrado problemas".

**Paso "Visibilidad":**
10. **Programar** (recomendado) o **Pública**. **Guardar/Programar**. Sin datos propios, entre las 18:00 y
    las 20:00 de España; con datos (Estadísticas → Audiencia → "Cuándo están conectados tus
    espectadores"), **1-2 h antes** de la franja más clara, para que el vídeo ya esté repartiéndose
    cuando llega el pico.

**Después:**
11. **Subtítulos en inglés**: Studio → Subtítulos → el vídeo → Añadir idioma → Inglés → Subir archivo
    "Con tiempos" → `subtitulos_en.srt` → Publicar.
12. **Comentario fijado**: igual que en los Shorts.
13. **Shorts del vídeo** (`short_1.mp4`, `short_2.mp4`): súbelos con la sección A en los días
    siguientes (uno cada 2-3 días), poniendo **este vídeo largo como "Vídeo relacionado"**.
14. En la **pestaña Comunidad** (si está disponible): una imagen del vídeo y una pregunta (opcional).

## C. TikTok (≈ 5 min, Shorts y clips)

Sube **el mismo `final.mp4`** (nunca un vídeo descargado de YouTube o Instagram: lleva marca de agua y
TikTok lo castiga).
1. App de TikTok → **+** → **Subir** → `final.mp4` → **Siguiente** (sin sonidos ni filtros).
2. **Descripción**: el bloque "TikTok" de `publicacion_final.md` (ya lleva sus hashtags).
3. **Portada**: el fotograma con el título en pantalla.
4. **Más opciones → "Contenido generado por IA": ACTIVADO** (imágenes y voz son de IA; TikTok pide
   etiquetarlo y no penaliza hacerlo).
5. **Quién puede verlo**: Todo el mundo. **Publicar**.

## D. Instagram Reels (≈ 5 min)

1. App de Instagram → **+** → **Reel** → `final.mp4` → **Siguiente** (sin música añadida).
2. **Portada**: el fotograma con el título. **Pie**: el bloque "Instagram Reels".
3. **Configuración avanzada → "Etiqueta de IA" / "Añadir etiqueta de IA": ACTIVADA**.
4. **Compartir también en el feed**: sí. **Compartir**.

## E. Después de publicar (lo que me pasas)

- A las **48 h** y a los **7 días**: las capturas de YouTube Studio de `<canal>/analisis/entrada/LEEME.md`
  (sobre todo la **retención** de la pieza) y, si puedes, visualizaciones de TikTok y Reels.
  Déjalas en `<canal>/analisis/entrada/` y dime "métricas de SNNN". Las anoto en `<canal>/docs/historial.md` y el
  estratega propone cambios.
- **No borres ni vuelvas a subir** una pieza que arranca floja: se pierden sus datos. Los Shorts a
  veces despegan días después.
- Anota en `<canal>/docs/historial.md` (o dímelo) la fecha de publicación de cada red.

---

> Las pantallas de YouTube, TikTok e Instagram cambian a menudo de nombre o de sitio. Si un paso no
> coincide con lo que ves, hazme una captura y lo ajusto aquí.

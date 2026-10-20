# Progreso de "Asombroso y Real"

> Estado y decisiones del canal. Ficha fija del canal: `CANAL.md`. Estado del kit: `docs/progreso.md`
> (raíz del proyecto). Rutas `videos/…` relativas a esta carpeta del canal.

## Siguiente paso

**ESTADO AL 2026-10-02 (tarde). Vídeo 001 en FASE G (montaje y control).**
- Las 94 imágenes, aprobadas (las 18 rehechas con ai33 incluidas).
- **Música de Suno (nuevo):** encargados los 3 ambientes (3 × 3.600 créditos). «misterio» = versión 1 (elegida por el
  usuario tras la prueba de `videos/_pruebas/musica_2026-10-02/comparar.html`); «tranquilo» y «alegre» con 2 versiones
  cada una, **pendientes de que el usuario elija** (hasta entonces suena la propia del canal).
- **Siguiente:** UI → «Voz y montaje» → «Música»: escuchar y «Usar esta» en tranquilo y alegre → «Montar el vídeo» →
  fotogramas → ver `final.mp4` → g-aprobar → fase H. Antes de publicar: revisar licencia de Suno y Content ID.

**Estado anterior (2026-10-01, noche):**
- Voz TERMINADA y aprobada: Juanjo Relatos (eleven_v4, velocidad 1,2), guion en estilo sobrio (WATOP), 3 bloques.
- `final.mp4` montado desde la UI (11 min 21 s) — pero con las imágenes viejas.
- Imágenes: el usuario marcó 18-20 como «mal» (`revision_imagenes.json`); el director de arte (chat de la UI)
  corrigió prompts y fijó `{diligencia3}` y `{williams2}` en el brief. Unas 10 van con ai33 (≈ 17.200 créditos) y
  el resto con klein. **Siguiente:** en la UI → Imágenes → **Modo revisión** → «Rehacer N» → «Corregir prompts
  con Claude» (tarea con barra; las propuestas quedan en `revision_propuestas.json`) → Rehacer (modal con el
  coste) → revisar las nuevas con →/M y «A = quedarme con la anterior» → **Montar el vídeo otra vez** →
  fotogramas → ver `final.mp4` y aprobar (g-aprobar) → «Pasar a la fase H» (miniatura, subtítulos EN,
  publicación).
- El chat de la UI dejó una vez `estado.json` con JSON inválido (comillas de más): arreglado. Si la guía no
  carga, comprobar que `estado.json` es JSON válido.

**2026-10-01 (tarde-noche): ESTILO WATOP Y VOZ JUANJO.** Comparando con WATOP («El Everest empezó a revelar esto»),
el usuario vio que las muletillas, las preguntas que se responde el narrador y el tú hacían sonar la voz a IA.
Prueba con el texto sobrio (escenas 1-2): Gabo, Salva y Juanjo; eligió **Juanjo Relatos a velocidad 1,2** (canal.json,
pausas de 0,3 s). Reglas nuevas: oficio del guionista («Escritura humana» sobria), ficha, concepto, CANAL.md y
`canal.json` → `reglas_texto` (avisos de muletillas, preguntas respondidas y tú) + `pedir_preguntas: false`.
**El 001 reescrito entero** en ese estilo (1.877 palabras ≈ 11 min; revisor OK; mismos datos e imágenes).
Bloques de voz: 1-7, 8-13, 14-18 ≈ 12.100 créditos; el bloque 1 con Gabo queda viejo.
Bloque 1 (1-7) locutado con Juanjo por el usuario; la escena 2 salió entrecortada (`entonacion.py` ya lo marca) y se
repitió SOLA (482 créditos, `montar.py --escena-sola`, ↻ en la UI).
Voz TERMINADA y aprobada en la UI el 01/10 (escena 16 rehecha con texto nuevo, sin {pausa:500}).
**Siguiente: fase G** (en la UI: «Pasar a la fase G» → «Montar el vídeo» → fotogramas → ver final.mp4 y aprobar).

**2026-10-01 (noche, después): CORTES Y BLOQUES GRANDES.** El usuario oyó un corte (1:20 de la prueba 3-5, «Allí
esperó»): fallo aleatorio de eleven_v4 (la voz arranca, se calla en seco y vuelve a empezar). `entonacion.py` ya lo
detecta (y solo revisa escenas con la voz al día). Bloques de voz de 4.000 caracteres (`canal.json`), 0,7 s entre
bloques: el 001 son 3 bloques (1-7, 8-13, 14-18), todos pendientes, ≈ 11.600 créditos. La UI muestra la voz y los
bloques. Bloque 1 (escenas 1-7) LOCUTADO el 01/10 (4.223 créditos, 4 min 17 s, 162 ppm, Entonación sin problemas).
**Siguiente:** el usuario lo escucha; si va bien, bloques 2 y 3 (escenas 8-18, ≈ 7.300 créditos), Entonación y fase G.

**2026-10-01 (noche): VOZ NUEVA, Gabo + eleven_v4.** Al usuario la voz le sonaba a IA («tonadilla») incluso tras
reescribir el texto. Prueba de 8 tomas de las escenas 1-2 (≈ 6.800 créditos, `videos/_pruebas/voces_2026-10-01/`):
el problema era sobre todo el modelo eleven_v3. Elegida la 7: **Gabo con eleven_v4** (finalistas: Javier Rojas v4,
Martin Osborne). `canal.json` cambiado; sin marcas de emoción (no probadas con v4). El 001 tiene 10 bloques
pendientes, ≈ 11.600 créditos. Escenas 3-5 locutadas con Gabo (2.335 créditos; Entonación sin problemas; 153-165 ppm, el canal calcula con 170).
**Siguiente:** el usuario las escucha; si le convencen, locutar el resto desde la UI (escenas 1-2 y 6-18).
Pendiente aparte: probar Flow Storyboard Studio (`docs/mercado.md` §3d).

**2026-10-01: VOZ, 2 de 9 bloques locutados (esc. 1-6).** El usuario las oyó: entonación poco natural (sobre todo
finales) y pide un guion «con más artículos, más humano» (cambio pedido en `e-aprobar`, sin atender).
`entonacion.py`: 4 de 6 escenas con fallos → el problema es el texto. **Siguiente:** aplicar ese cambio
(guionista reescribe las escenas con las reglas de voz; empezar por las 1-6), enseñar antes/después, y el usuario
re-locuta desde la tarjeta «Locución» (los bloques cambiados salen pendientes). **Hecho después (01/10):** escenas 1-6 reescritas (commit a6af79b) y «Escritura humana» en el oficio del guionista + regla en la ficha + avisos de muletillas de IA en `revisar_guion.py` (`docs/escritura_humana.md`). Si la prueba suena mejor, reescribir 7-18 igual ANTES de locutar el resto. UI aclarada el 01/10 (tarjeta con
reproductores por bloque y «Repetir», «Aplicar los cambios con Claude», Entonación antes de aprobar).

**Actualizado el 2026-09-30 (noche): PRIMER VÍDEO EN CURSO, `videos/001-phineas-gage/`, fase E (voz)
(`/nuevo-video continuar`, o desde la UI: página del vídeo → Guía o el chat «Claude»).**
- Hecho: fases A-D (enfoque «mito contra documentos» con el ángulo de Chile, 🟡 ámbar; 10 min; SIN Shorts por
  ahora; guion de 1.748 palabras verificado y revisado; brief visual, paleta propia sin rojo y prompts) y **F:
  99/99 imágenes, aprobadas por el usuario en la UI el 30/09** (mezcla: personas con ai33/Nano Banana 2, el
  resto con klein; lección de la 13-2: «exactly two arms» no sirve, la causa era un prompt contradictorio).
- **Voz: por la API de ai33 (decisión del usuario 30/09, antes web).** UI → «Voz y montaje» → tarjeta
  «Locución»: 9 bloques, 9.706 caracteres ≈ **11.162 créditos (≈ 0,05 €)**. Nada locutado aún.
- **Siguiente:** 1) el usuario lanza «Probar el primer bloque» (escenas 1-3, ≈ 1.626 créditos) y lo escucha;
  2) si el tono es sereno, «Locutar los 8 bloques»; 3) `entonacion.py` (Herramientas → Entonación, gratis) y
  repetir solo lo marcado, preguntando el coste; 4) fase G, montaje y control; 5) fase H: miniaturas (con
  el empaquetado en mente: título y promesa), subtítulos EN y publicación. El 001 empezó antes del bucle de
  mejora: sin `guion_generado.json` ni `empaquetado.md` (ver abajo).
- **Método nuevo desde el 30/09** (se aplica del 002 en adelante): empaquetado antes de la escaleta, bucle de
  mejora del guion y las lecciones de los referentes (ABISMO) en `docs/concepto.md` («Títulos», «Miniatura»,
  «Gancho», «Formato: catálogo completo», «Lo que no hacemos», ritmo de 1 vídeo/semana como listón).
- Decidido: Gage y Harlow se parecen (se deja); 08-1 y 16-1 dípticos a propósito; las escenas modernas se quedan.
- Detalle en `videos/001-phineas-gage/estado.json`.

**Antes de subir el 001 (del análisis de vídeos de estrategia del 29/09, `docs/mercado.md` §3b):**
- [ ] **Studio, una sola vez** (`docs/guia_subida.md` → «0»), con estos textos:
  - *Palabras clave del canal* (≈ 430 caracteres): `curiosidades, datos curiosos, historias reales,
    historia insólita, historias increíbles, casos reales, misterios, misterios sin resolver, curiosidades
    de historia, curiosidades de ciencia, ciencia, cuerpo humano, cerebro, naturaleza, animales increíbles,
    universo, espacio, documental, documentales en español, divulgación, historias que parecen inventadas,
    Asombroso y Real`
  - *Descripción*: la de `docs/renombrar_canal.md` con una línea más tras la primera: «Curiosidades de
    historia, ciencia, naturaleza y el universo, contadas como un documental.» (así aparecen las palabras
    que la gente busca).
  - *Correo de contacto* para patrocinios, *ajustes de subida predeterminados* e *inserción permitida*.
  - (30/09, `docs/mercado.md` §3c) **capítulos automáticos desactivados** (destriparían el giro), sitios
    destacados desactivados, enlace `https://www.youtube.com/@AsombrosoYReal?sub_confirmation=1` al final
    de la descripción fija, **marca de agua "durante todo el vídeo"**, pestaña Inicio con listas por pilar
    (sin la fila de Shorts arriba) y verificación del canal (funciones avanzadas).
- Vídeo 001: empezó antes del bucle de mejora (30/09), así que **no tiene `guion_generado.json`** (el
  primer commit de su guion ya lleva los cambios aprobados) ni `empaquetado.md`; en su fase H, el
  estratega comprueba igualmente que el gancho confirma la promesa del título y la miniatura. El bucle
  empieza con el vídeo 002.
- [ ] **Prueba: no notificar a los suscriptores en los 2-3 primeros largos.** Los suscriptores actuales
  vinieron por los Shorts de Tok; si no hacen clic, las primeras horas del vídeo salen flojas. Es la opinión
  de un creador sin datos, así que se trata como prueba: anotar en `docs/historial.md` si se notificó y
  comparar las visitas de las primeras 48 h.
- [ ] **Shorts tráiler** (cuando los haya): en Studio, «Vieron / deslizaron» ≥ 70 % es aceptable y > 80 %
  bueno; por debajo del 70 %, el gancho del Short no funciona.
- [ ] **Antes del primer vídeo de universo**: analizar con la skill los referentes **Abismo** y **Late
  Science** (castellano, faceless, nicho universo; vidIQ ≈ 2.000 y 5.000 $/mes).

**Anterior (28/09, mañana).** Canal listo (concepto, estilo, paletas, método de prompts, voz Javier Rojas y
@AsombrosoYReal renombrado). El primer vídeo espera a que acabe la reorganización del kit (partes 5-6,
`docs/progreso.md`).
1. **Primer vídeo con `/nuevo-video`**: candidato Phineas Gage (🟢; brief visual y arranque del texto ya
   probados). Ojo: la paleta de ciencia pide rojo dominante y choca con la herida (valorar `"paleta"` propia
   sin rojos) y verificar las medidas de la barra (≈ 1,1 m y ≈ 3 cm; el brief de ejemplo dice "one-metre").
   Otras ideas 🟢 en `docs/ideas.md`.
2. Rol opcional `asesor-tematico`: este canal no tiene ficha (el agente se para, comprobado el 28/09). Decidir
   si se quiere (sería un divulgador de ciencia e historia) y escribir `equipo/asesor-tematico.md` desde
   `plantillas/canal/equipo/`.
3. Pendientes menores: `saturacion.py` debe contar aparte los clones largos.

## Nacimiento del canal (2026-09-27)
6. HECHO (27/09): **CONCEPTO NUEVO decidido por el usuario (opción B)**: canal **"Asombroso y Real"**
   (@AsombrosoYReal, libre; se RENOMBRA @losviajesdetok), **sin Tok**, 4 pilares (historia insólita,
   naturaleza y animales, universo, cuerpo y ciencia; el misterio es un ingrediente, no el tema),
   **estilo editorial** (`videos/_pruebas/estilo_b/3_editorial.png`), largos de 10-14 min + Shorts-tráiler,
   narrador documental con ironía. Documento: `docs/concepto.md` (el de Tok, en `docs/archivo/concepto_tok.md`).
   Nombres descartados y por qué: Expediente Z/Ñ (ocupados, canal político, connotaciones), Te lo creas o no
   (ruido de canciones, cercano a Ripley's), Juro que pasó ("muy castizo"), Mundo Verídico.
8. HECHO (27/09): prueba de paletas por pilar (`videos/_pruebas/paletas/hoja_paletas.jpg`): historia,
   naturaleza y universo bien; ciencia reforzada en canal.json. Fallos de klein: metáforas de forma
   ("cigar-shaped" = un puro), anacronismos (prismáticos en el s. XVIII, batas blancas y un móvil en 1848),
   detalles de un solo lado (venda en un ojo → en los dos) y filtro de Cloudflare con heridas.
   **Diagnóstico del usuario: los prompts no son lo bastante específicos ni profesionales.**

## Puesta a punto (2026-09-28): prompts, voz y renombrado
**SIGUIENTE (actualizado el 2026-09-28): prompts HECHO, voz HECHO, renombrado HECHO → toca el primer /nuevo-video.**
- **3. HECHO (28/09): canal renombrado a "Asombroso y Real" (@AsombrosoYReal**, comprobado con yt-dlp:
  channel_id UCOPeqty7-D8JoAo0dnq5fJA, descripción nueva). Actualizados `canal.json`, CLAUDE.md, concepto,
  MANUAL y la skill de análisis. Avatar y banner en `canal/imagen/`.
- **4. Primer /nuevo-video**: candidato Phineas Gage (🟢, brief visual y arranque del texto ya probados).

**SIGUIENTE (sesión nueva, 2026-09-28 o después):**
1. HECHO (28/09): **método de prompts de dirección de arte** en `.claude/agents/director-arte.md`: brief
   visual por vídeo (`videos/NNN/brief_visual.md`: época, lugar, vestuario prenda a prenda, objetos con su
   forma literal, anacronismos probables, personajes fijos) + ficha de plano de 8 casillas por imagen +
   escena en orden fijo (plano primero), 60-120 palabras, sin negaciones ni metáforas. `/nuevo-video` pide
   el brief en el paso 5. Probado en 3 rondas (`videos/_pruebas/paletas/v2`, `v3`; hojas
   `v2/hoja_antes_despues.jpg` y `v3/hoja_v1_v2_v3.jpg`): fuera los anacronismos; **la paleta pasa DELANTE
   de la escena en `canal.json` → `estilo`** (al final se diluía). Lecciones que quedan (en el agente): el
   rojo de ciencia se vuelve sangre en escenas de heridas, klein ignora "clean-shaven/collarless" y no
   cuenta bien, formas y "floating" en el espacio, bichos pequeños salen grandes. 2 variantes por imagen.
   (Texto original de la tarea:) Mejorar la calidad de los prompts de imagen (petición del usuario): método profesional de
   dirección de arte (sujeto, acción, composición y plano, lente/encuadre, luz, época con vestuario y
   objetos concretos, atmósfera, qué NO debe aparecer), una plantilla en `.claude/agents/director-arte.md`
   y rehacer la prueba de `videos/_pruebas/paletas/` (sobre todo ciencia: Phineas Gage, 1848) comparando
   antes/después. Considerar un "brief" por vídeo (época, lugar, vestuario, paleta) que se reutilice.
2. EN CURSO (28/09): muestras de Daniel en tono documental por API (opción B; 1.588 créditos), inicio de
   Phineas Gage en `videos/_pruebas/voz_documental/` (A sin marcas, B con [curious] y [whispers]). Salen a
   **≈ 175 ppm**, no a los 150 que usa `canal.json` → `duraciones`: pendiente decidir velocidad o ajustar el
   cálculo. OJO: locutar en la web de ai33 también gasta créditos.
   **El usuario cambió de voz (28/09): "Javier Rojas - Learning & Storytelling"**
   (`ai33:elevenlabs_eHAEFkimnYz57pupUMcq`, "tiene más ritmo"; descartada la otra, "Calm & Friendly"; muestras
   oficiales gratis en `voz_documental/javier_rojas/`). Daniel queda en `voces` → `ai33_daniel`. Buscar voces sin
   gastar: GET `api.ai33.pro/v1/shared-voices?search=…` o `/v3/voices?provider=elevenlabs&search=…`.
   HECHO: muestras de Javier con el párrafo de Gage (`voz_documental/javier_rojas/A_sin_marcas.mp3` y
   `B_con_marcas.mp3`, 1.588 créditos): **175 ppm, igual que Daniel** → `canal.json`: `palabras_por_minuto` 170
   y rangos de palabras 10 min 1650-1750, 12 min 1980-2100, 14 min 2300-2450 (guionista y revisor al día;
   probar_kit OK). El usuario eligió **B (con marcas)**, pero notó finales raros: "sobreviviera…" sonaba
   "sobrevivierá". Medido (volumen y tono por sílaba): eleven_v3 sube el final y carga la última sílaba.
   Prueba de 3 versiones de la frase (307 créditos, `javier_rojas/finales/`): **elegida la 2, frase unida**
   ("no es que sobreviviera, sino lo que le pasó después"). HECHO: reglas de voz en guionista, concepto,
   MANUAL y `canal.json` → `reglas_texto` (avisos de revisar_guion: "…" tras llana larga y frase que acaba
   al cerrar una cita) y **`herramientas/entonacion.py`** (gratis; marca finales que suben y acentos en la
   última sílaba, da bloques a repetir con coste; calibrado con las 4 tomas; en /nuevo-video, /nuevo-short
   y probar_kit). Guion de prueba ajustado a 170 ppm. **VOZ CONFIGURADA.** Créditos gastados el 28/09 en
   voz: ≈ 3.500.
   (Original:) Voz: muestra de Daniel en tono documental. Opción A: el usuario locuta en la web de ai33 un párrafo
   que Claude le pasa; opción B: API (≈ 1.500 créditos; preguntar antes).
3. El usuario renombra el canal en YouTube Studio a "Asombroso y Real" (@AsombrosoYReal).
4. Primer vídeo con `/nuevo-video` (ideas 🟢 en `docs/ideas.md`: el hombre que no podía olvidar,
   Phineas Gage, abejas que votan, árboles que se comunican, Cervantes y Shakespeare…).
5. Pendientes menores: `saturacion.py` contar aparte los clones largos; decidir qué hacer con S001/S002
   (canal antiguo).

Nota de la prueba del director de arte (28/09):
   - Para el vídeo de Phineas Gage (lo vio la prueba): la paleta de ciencia pide "red dominating" y choca
     con la herida → valorar `"paleta"` propia sin rojos; la barra real medía ≈ 1,1 m y ≈ 3 cm de grosor
     (verificar), el brief de ejemplo dice "one-metre" y "as thick as a thumb".

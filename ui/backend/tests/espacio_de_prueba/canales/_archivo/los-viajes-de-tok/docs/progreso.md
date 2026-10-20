# Progreso de "Los Viajes de Tok" (canal archivado)

> Canal archivado el 2026-09-28 (el concepto cambió a "Asombroso y Real" el 27/09). Se usa con
> `CANAL=_archivo/los-viajes-de-tok`. Rutas relativas a esta carpeta. Historia del kit: `docs/historia_kit.md`.

## Piezas terminadas y pendientes (2026-09-25)
**S001 (Venus) TERMINADO** (`videos/S001-venus-dia-ano/`, 57,4 s; Tok responde "¡Pues sí!"): imágenes de Google a mano, 3 animaciones
de Veo, voz del usuario desde la web de ai33 (`voz_archivo`). Para subir: `final.mp4`,
`publicacion_final.md` (NO `publicacion.md`), `subtitulos.srt` y `subtitulos_en.srt`.

**S002 (los 10 días de 1582) TERMINADO** (`videos/S002-diez-dias-1582/`, 53,5 s, 15 imágenes de Google + 2 animaciones de Veo;
acaba en "Por eso su fiesta es el quince de octubre": el usuario quitó la escena de Tok arrancando la hoja). Voz:
`voz/web_sin_final.mp3` (web.mp3 recortado). Publicación: `publicacion_final.md` (propuesta: subirlo el 15 de octubre).
Lección del Gem: en chats largos Tok se deforma → prompts con sus proporciones exactas, adjuntar
`personaje/ref/tok_frente.png` en cada mensaje con Tok y chat nuevo cada 5-6 imágenes (`personaje/gem_tok.md`
actualizado: el usuario debe copiar el bloque nuevo en el Gem).

**SIGUIENTE:**
0. El usuario sube S002 (con `docs/guia_subida.md` + `publicacion_final.md`), idealmente el 15 de octubre.
1. El usuario sube S001 (YouTube, TikTok, Reels) y pasa métricas a las 48 h y 7 días (capturas de Studio,
   `analisis/entrada/LEEME.md`) → agente `estratega-youtube` y `docs/historial.md`.
2. HECHO (25/09): Gem "Ilustrador de Tok" creado por el usuario; brazos y piernas negros en las 7 poses
   (`personaje/brazos_negros.py`) y hoja recompuesta (`personaje/componer_hoja.py`).
3. Siguiente pieza: nuevo Short o pasar el vídeo 001 (pulpo) al formato narrador, ya con el flujo nuevo
   (comandos actualizados: Google a mano + voz de la web de ai33). **Ojo (27/09):** el pulpo "9 cerebros"
   sale 🔴 quemado; si se retoma, cambiar el dato/enfoque. Candidatos 🟢: Cervantes y Shakespeare (ventana
   23 de abril), abejas que votan, cerebro en blanco, 3 días sin dormir, ser pirata.

## Estado al cerrar el 24/09
Estado al cerrar el 24/09:
- VOZ: Daniel (ElevenLabs eleven_v3 vía ai33, de pago) con marcas de emoción `[excited]`...; los comandos
  preguntan qué voz usar antes de locutar. Saldo ai33 ≈ 3.285.000 créditos.
- IMAGEN: E2 + FLUX.2 klein 4B (gratis). Hoja nueva de Tok (variante C) en `personaje/ref/` y
  `personaje/hoja_personaje_tok.png`. Regla: Tok SIEMPRE con los dos ojos visibles (tres cuartos, nunca
  perfil puro). Imágenes de ai33 descartadas (lentas; cancelar no devuelve créditos).
- Correcciones de klein 4B en `docs/concepto.md` → "Estilo visual" y en el agente director-arte;
  ejemplo aplicado en `personaje/e2/prueba_escenas.py` (3 escenas de S001 probadas).


Estado general: el kit tiene el formato nuevo (narrador en tercera persona con Gemini "Puck", locución
por bloques sin cortes, Tok mudo con su clip {toc_toc}, efectos por encima de la voz) y está probado
(`probar_kit.py` OK). Falta decidir el ESTILO DE IMAGEN antes de producir nada definitivo.
1. **Estilo de imagen DECIDIDO (2026-09-24 18:30): E2 + FLUX.2 klein 4B + hoja nueva de Tok.**
   - Hoja de personaje `personaje/hoja_personaje_tok.png` (idea del usuario: giro frente/tres cuartos/
     lado/espaldas + expresiones), elegida la variante C (bombilla amarilla, tornillos, orejas naranjas).
     Imágenes sueltas en `personaje/ref/` (tok_frente, perfil, lado, espaldas, saludo, sorprendido,
     confundido); la antigua de palotes en `personaje/original/ref_palotes/`. Script: `personaje/e2/hoja_e2.py`.
   - `canal.json`: estilo E2 (fondo y suelo de color, sin números) y descripción nueva de `{tok}`.
     `docs/concepto.md` → "Estilo visual" y agente `director-arte` actualizados con la receta de klein 4B.
   - Prueba OK (`personaje/e2/prueba_contactos.png`, 3 escenas de S001): suelo de color, reloj sin
     números, cara preocupada, silla sin reposabrazos. Pendiente: el guion de S001 aún describe
     `paisaje`, `silla` y `venus` en estilo palotes → agente `director-arte` para pasar sus prompts a E2
     (usar las versiones de `personaje/e2/prueba_escenas.py`).
   Historial del laboratorio (ya cerrado): El usuario dijo que las imágenes son "sosas y mal
   dibujadas; quiero dibujo simple, pero limpio".
   - Hecho/en marcha: `herramientas/laboratorio_estilo.py local klein` genera 3 estilos (E1 vector plano,
     E2 dibujos de TV infantil, E3 línea limpia + color pastel) × 3 escenas de S001 (01-3, 02-2, 04-1) en
     `videos/_pruebas/estilos/` (vertical, con la referencia de Tok). Enseñar comparativa al usuario.
   - Después, con cuota de Cloudflare (`cuota.py`; el bloqueo es una ventana móvil de 24 h, a partir de
     las 16:00 del 24/09 debería haber sitio): probar los 2 estilos favoritos con modelos mayores:
     `laboratorio_estilo.py cloudflare dev|klein9|lucid E1_...,E2_...` (ya añadidos a gen_imagen.py como
     "dev" = FLUX.2 dev, "klein9", "lucid" = Leonardo Lucid Origin, este sin referencias). Medir neuronas
     reales por modelo (analítica GraphQL, como en cuota.py) y comprobar la licencia de uso comercial de
     las imágenes de flux-2-dev y klein-9b antes de adoptarlos.
   - 2026-09-24 14:00: el usuario elige E2 (dibujos de TV) como base. Ronda buena en local:
     `videos/_pruebas/estilos/E2_dibujos_tv_klein_*_v2.png` (Tok con "exactly two arms/legs" en canal.json,
     silla azul sin reposabrazos, suelo en vez de "white ground"). Tarea programada
     `canalyt-laboratorio-modelos` (16:00, sesión nueva): prueba E2 con klein9/dev/lucid en Cloudflare y
     deja `videos/_pruebas/estilos/informe_modelos.md` + `comparativa_modelos.png` para que el usuario elija.
   - 2026-09-24 16:30 (tarea programada): klein 9B generado (3/3, más fiel al prompt, pero ≈ 1.409
     neuronas/imagen = 7/día); dev y lucid sin generar (cuota agotada; estimados 4.000-8.500 y ≈ 2.800
     neuronas/imagen). Recomendación: seguir con klein 4B (≈ 105/imagen, Apache 2.0) y afinar prompts.
     Informe: `videos/_pruebas/estilos/informe_modelos.md`. Pendiente: que el usuario elija modelo.
   - Al elegir: nueva hoja de referencia de Tok en el estilo elegido (la actual es de palotes y puede
     arrastrar el estilo antiguo), actualizar `canal.json` (estilo, personajes, referencias, poses,
     pantalla final) y `docs/concepto.md` → "Estilo visual"; revisar los prompts del director-arte.
2. **Short S001 (Venus)** `videos/S001-venus-dia-ano/`: guion con narrador aprobado en tono y ritmo
   ("ahora mejor"), voz generada (60 s), boceto en boceto.mp4. Pendiente: imágenes definitivas con el
   estilo elegido (rehacer boceto si cambia mucho), montaje, publicación. Ver su estado.json.
3. **Vídeo 001 (pulpo)** APARCADO (no cancelado): hay que reescribir el guion al formato narrador
   (agente `guionista`; el guion.json actual es del formato antiguo con Tok en primera persona), regenerar
   voces y rehacer imágenes con el estilo nuevo (las 41 hechas son del estilo antiguo). Ver estado.json.
4. **Referentes** (`docs/referentes.md`, 2026-09-24): 13 canales parecidos (Kurzgesagt, Life Noggin, Dr.
   Binocs, OverSimplified, Sam O'Nella, TED-Ed, Pocoyó, CuriosaMente…) con sus vídeos más vistos y patrones.
   `docs/analisis_guiones.md`: estructura de 4 guiones virales (Life Noggin ×2, Dr. Binocs, Kurzgesagt),
   leídos con los subtítulos al reproducirlos (sin guardar transcripciones); qué comparten y qué adoptar.
   APLICADAS todas (2026-09-24, aprobado por el usuario): formatos que funcionan, premisa en 15 s,
   expectativas y desmontaje, reglas del viaje, escalera, comparación cotidiana dibujable, caso real,
   "¿Sabías que…?" (frase obligatoria en canal.json), humor cada 15-20 s, cambio de registro, plantilla
   de miniatura; ritmo del narrador 160 palabras/min (duraciones recalculadas). Agentes narrativa,
   guionista, director-arte y estratega-youtube actualizados; ideas.md reformulado con formatos.

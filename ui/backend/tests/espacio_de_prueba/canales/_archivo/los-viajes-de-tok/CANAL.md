# Canal (archivado): "Los Viajes de Tok"

> Canal archivado el 2026-09-28. El concepto cambió a "Asombroso y Real" el 27/09 (el mismo canal de
> YouTube, renombrado a @AsombrosoYReal). Se conserva para consulta y para montar sus piezas:
> `CANAL=_archivo/los-viajes-de-tok .venv/bin/python herramientas/montar.py videos/S002-diez-dias-1582/guion.json`.
> No aparece en `/cambiar-canal` ni en `canales.py lista`. Progreso y lecciones: `docs/progreso.md`.

- **Qué era:** curiosidades para todos los públicos con Tok, un robot de lata con un reloj en el pecho, y un
  narrador en tercera persona (estilo Pocoyó). Shorts de 30-60 s.
- **Por qué se dejó:** riesgo de "hecho para niños" (RPM ≈ 30 veces menor) y Shorts sueltos que apenas
  monetizan (análisis de `docs/mercado.md`, en la raíz del proyecto).
- **Piezas:** S001 (Venus, 57,4 s) y S002 (los 10 días de 1582, 53,5 s) terminados, sin subir; 001 (pulpo)
  aparcado en el formato antiguo.
- **Voz:** narrador "Daniel" (ElevenLabs vía ai33) o Gemini "Puck"; Tok mudo salvo su clip `{toc_toc}`
  (`recursos/sfx/`, `herramientas/voz_tok.py`).
- **Estilo:** E2 "dibujos de TV infantil" con FLUX.2 klein e imágenes de Google (Gemini y Veo) a mano.

| Archivo | Qué es |
|---|---|
| `canal.json` | configuración del canal antes del cambio de concepto |
| `docs/concepto.md` | concepto de Tok (estilo, personaje, reglas de guion) |
| `docs/progreso.md` | piezas, estado al archivarlo y lecciones (Gem de Tok, estilo E2) |
| `docs/historial.md` | S001 y S002 |
| `personaje/` | hojas y referencias de Tok (`ref/tok_frente.png`), Gem y scripts de pruebas |
| `videos/` | 001, S001, S002 y las pruebas de la etapa de Tok |
| `marca/` | avatar y banner de Tok |

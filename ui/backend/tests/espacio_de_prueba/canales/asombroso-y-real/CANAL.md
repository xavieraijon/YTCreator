# Canal: "Asombroso y Real"

> Ficha rápida del canal: lo que hay que saber antes de trabajar en él. El detalle manda en los archivos
> que se citan; si algo de aquí choca con ellos, se corrige esta ficha. Estado y siguiente paso:
> `docs/progreso.md` (de esta carpeta).

- **Qué es:** historias y fenómenos que parecen inventados y son reales, contados con rigor y con gracia.
  Cada vídeo responde a "¿de verdad pasó / existe esto?" con un "sí, y te lo explico".
- **YouTube:** youtube.com/@AsombrosoYReal (channel_id UCOPeqty7-D8JoAo0dnq5fJA). Renombrado el 2026-09-28
  desde @losviajesdetok; hasta el 27/09 fue "Los Viajes de Tok" (`canales/_archivo/los-viajes-de-tok/`).
- **Pilares:** historia insólita, naturaleza y animales, universo, cuerpo y ciencia (el misterio es un
  ingrediente, no un pilar). Cada guion lleva `"pilar"`, que elige la paleta de las imágenes.
- **Público:** adultos y jóvenes hispanohablantes con curiosidad. **No es para niños** (RPM ≈ 30 veces menor
  y responsabilidad legal: nada que lo parezca).
- **Formato:** vídeos largos de 10, 12 o 14 min (nunca menos de 8), horizontales, ≈ 95-130 imágenes; Shorts
  solo de escaparate (tráileres que salen solos del vídeo y Shorts de apoyo con `/nuevo-short`).
- **Voz:** "Juanjo Relatos" (ElevenLabs vía ai33.pro, **de pago**: `ai33:elevenlabs_DdKbXdRlBmj7Ty7N0FVr`, modelo
  **eleven_v4**, velocidad 1,2, pausas de 0,3 s como máximo, sin marcas de emoción; elegida el 01/10), ≈ 170
  palabras/min. Narración sobria y declarativa, como WATOP (sin muletillas, sin preguntas que se responde, sin tú). Se locuta en bloques de ≈ 4.000 caracteres (3 por vídeo de 10 min,
  0,7 s entre bloques). Tras cada locución, `entonacion.py` (finales, acentos y cortes).
- **Estilo visual:** ilustración editorial (textura de papel, claroscuro, pinceladas) con la paleta del pilar
  delante de la escena (`canal.json` → `estilo`, `paletas`). Sin personaje fijo. Método de prompts: brief
  visual por vídeo + ficha de plano (`equipo/director-arte.md`).
- **Marca:** Playfair Display Black (títulos, miniaturas, pantalla final) y Source Sans 3 (subtítulos,
  rótulos); crema `#EFE6D2`, ocre `#C8702A`, amarillo `#F2C14E`. Avatar y banner en `marca/`
  (`herramientas/marca.py`). Pantalla final de 20 s: "ASOMBROSO | Y REAL" y lema.
- **Equipo:** narrativa, guionista, director-arte, verificador y estratega-youtube (fichas en `equipo/`).
  Sin `asesor-tematico` (opcional; sin ficha el agente se para).
- **Reglas que más importan:** ningún tema sin medir su saturación (`saturacion.py`, regla del hueco); lo
  comprobado, separado de las hipótesis y las leyendas; nada de efectos cómicos; antes de gastar créditos
  de ai33 (web o API), avisar del coste y preguntar.

## Dónde está cada cosa (rutas relativas a esta carpeta)

| Archivo | Qué es |
|---|---|
| `canal.json` | configuración que leen las herramientas (voz, estilo y paletas, tipografías, colores, duraciones, reglas del revisor) |
| `docs/concepto.md` | concepto completo: promesa, pilares, público, voz, estilo, formato, títulos, estructura y **reglas de guion y de voz** |
| `docs/progreso.md` | estado, siguiente paso y decisiones del canal |
| `docs/ideas.md` | banco de temas por pilar, con su semáforo de saturación |
| `docs/historial.md` | vídeos producidos y sus métricas |
| `docs/referentes.md` · `docs/analisis_guiones.md` | canales de referencia y guiones virales analizados (de la etapa de Tok) |
| `docs/renombrar_canal.md` | cómo se renombró el canal (hecho el 28/09) |
| `equipo/` | fichas de los agentes para este canal |
| `marca/` | avatar, banner y vistas previas |
| `analisis/` | análisis de canales y métricas (capturas de Studio en `analisis/entrada/`) |
| `videos/NNN-slug/` · `videos/SNNN-slug/` | vídeos largos y Shorts de apoyo; `videos/_pruebas/` = pruebas de estilo, paletas y voz |

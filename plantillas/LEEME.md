# Plantillas del kit

- `canal/`: esqueleto de un canal nuevo. **No se copia a mano**: lo usa `/nuevo-canal` con
  `.venv/bin/python herramientas/canales.py crear <slug> "<Nombre>"`, que lo copia en `canales/<slug>/` (del espacio de trabajo, no del kit) y
  sustituye `{{nombre}}`, `{{slug}}` y `{{fecha}}`.
- Lo demás queda con marcas `<<RELLENAR: qué va aquí>>`, que `/nuevo-canal` rellena fase a fase.
  `canales.py pendientes <slug>` lista las que quedan; mientras haya alguna en `canal.json`, las
  herramientas avisan y `marca.py` no genera nada.
- `canal_rapido.json`: valores de fábrica del **canal rápido** (`canales.py crear-rapido`, el «vídeo rápido» de la UI):
  claves con puntos de `canal.json` → valor (`null` borra la clave). Parte de la misma `canal/`; en las fichas `.md`
  las marcas pasan a `<<POR DEFECTO…>>`. **Si `canal/canal.json` gana una marca nueva, dale aquí su valor**: si no,
  `crear-rapido` se para con error (y lo detecta `test_canal_rapido_sin_campos_pendientes_y_activo`).
  `canales.py convertir` lo devuelve a `<<RELLENAR` y quita `rapido`. `canal.json` → `slugs_anteriores` (lo añade
  `canales.py renombrar`, no la plantilla) lista los nombres de carpeta que tuvo el canal, para que la UI le pase sus vídeos.
- `canal/CANAL.md` (ficha rápida del canal, se rellena en la fase K) y `canal/docs/progreso.md` (estado y
  decisiones del canal; el del kit es `docs/progreso.md` de la raíz).
- `canal/equipo/`: una ficha por rol, con las secciones que espera su agente de oficio (`.claude/agents/`).
  Base: narrativa, guionista, director-arte, estratega-youtube. Opcionales: verificador (canales que
  cuentan hechos) y asesor-tematico (temáticas que piden un especialista). Un rol nuevo = agente de oficio
  + ficha aquí.
- Si cambia lo que un agente espera de su ficha, o un campo de `canal.json`, actualiza también la
  plantilla.

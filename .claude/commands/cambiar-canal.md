---
description: Cambia el canal activo del kit (o lista los canales si no se dice cuál)
argument-hint: "[canal]"
---
# CAMBIAR DE CANAL
Canal pedido: $ARGUMENTS

Responde SIEMPRE en castellano.
1. Ejecuta `.venv/bin/python herramientas/canales.py lista` y enséñalo (el activo va marcado con `*`;
   por cada canal: nombre, URL, nº de vídeos, si `/nuevo-canal` quedó a medias y los campos sin rellenar).
2. Si no se ha dicho canal, o no coincide con ninguno, pregunta cuál (con AskUserQuestion, un canal por
   opción). Los archivados (`canales/_archivo/`) no se activan: para trabajar en uno suelto se usa
   `CANAL=_archivo/<canal>` delante de cada comando; explícalo si lo piden.
3. Si el canal tiene `/nuevo-canal` a medias o campos sin rellenar, avisa antes: sus vídeos pueden salir
   mal. Lo normal es terminarlo con `/nuevo-canal continuar`.
4. `.venv/bin/python herramientas/canales.py activar <canal>`.
5. Confirma lo que cambia: todas las herramientas (montar, revisar_guion, probar_kit, marca…) y los
   agentes (que leen `canal_activo` y la ficha `canales/<canal>/equipo/<rol>.md`) trabajan ya con ese
   canal; `<canal>` en los documentos es `canales/<canal>/`. Resume en 3-4 líneas su ficha
   (`<canal>/CANAL.md`), el "Siguiente paso" de su `docs/progreso.md` y lo último de su `docs/historial.md`, y di qué vídeo quedó a medias si
   hay un `estado.json` incompleto en `<canal>/videos/` (se retoma con `/nuevo-video continuar`).

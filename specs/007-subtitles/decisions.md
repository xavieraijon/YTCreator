# Decisiones: 007 subtitles

Riesgo según `.specify/memory/riesgo.md`. Lo de riesgo alto no se decide aquí: va a «Pendientes del creador».

## Registro

| # | Fecha | Quién decidió | Decisión | Motivo | Alternativas | Riesgo | Tarea |
|---|-------|---------------|----------|--------|--------------|--------|-------|
| 1 | 2026-11-14 | Creador | El motor de reconocimiento y su modelo se descargan la primera vez que se hacen subtítulos, con aviso del tamaño; la instalación no cambia | Instalación ligera para quien no los use | Descargarlos en la instalación | Alto | Spec, FR-002 |
| 2 | 2026-11-14 | Creador | La IA revisa los subtítulos como propuesta que el creador acepta, gastando cupo con el coste a la vista | Corrige lo que el guion no cubre sin decidir por el creador | Sin IA en los subtítulos | Alto | Spec, FR-011 |
| 3 | 2026-11-14 | Creador | Solo español; la traducción queda fuera de la v1 | YouTube ya traduce automáticamente los subtítulos subidos | Traducir con la IA | Alto | Spec, FR-021 |
| 4 | 2026-11-14 | Creador | El audio se saca del vídeo en el navegador con mediabunny y solo se sube el audio | El vídeo no sale del navegador, la subida es pequeña en un VPS y no hace falta ffmpeg | ffmpeg en el servidor (enmienda y subida del vídeo entero) | Alto (dependencia nueva) | Plan, R3 |
| 5 | 2026-11-14 | Creador | `whisper-cli` para Mac se compila en nuestro CI desde la versión fijada: flujo `whisper-macos.yml`, una vez por versión de whisper.cpp, publicado en la versión `whisper-cpp-b5454` del repositorio y fijado en `versions.json` | whisper.cpp no publica un programa para Mac y la instalación debe ser de un paso | Pedir Homebrew | Alto | Plan, R1 |
| 6 | 2026-11-14 | Agente | Modelo por defecto `large-v3-turbo-q5_0`, con `small-q5_1` en «Modo experto»; se revisa con la prueba real (SC-001) | Mejor español con velocidad razonable | `medium`, `base` | Medio (efecto visible: tamaño de la descarga) | Plan, R2 |
| 7 | 2026-11-14 | Agente | Límites de lectura de la guía de Netflix para el español (42 caracteres por línea, 17 por segundo); un Short a una línea de 32, como supuesto | Es la referencia más citada y YouTube no publica límites propios | BBC (37 caracteres) | Medio | Plan, R8 |
| 8 | 2026-11-14 | Agente | Los minutos reales viajan en el JSON de los capítulos (`fromAudio`), sin cambiar la tabla de la 006 | Ninguna versión guardada se rompe | Un origen nuevo en `package_version` | Bajo | Plan, R13 |

## Pendientes del creador

| # | Qué falta | Opciones | Recomendación | Impacto | Tarea pausada |
|---|-----------|----------|---------------|---------|---------------|

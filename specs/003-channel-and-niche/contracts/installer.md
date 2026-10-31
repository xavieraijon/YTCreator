# Contrato: instalador, paso del lector de YouTube

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R2

El instalador de la 002 gana un paso 9, «Preparar el lector de YouTube», que deja yt-dlp listo sin que el creador
instale nada a mano.

## Reglas generales

- Versión, URL y SHA256 por sistema y arquitectura fijados en `installer/versions.json`. Nunca «la última».
- Se descarga a un fichero temporal, se comprueba el SHA256 y solo entonces se mueve a `<datos>/bin/yt-dlp`
  (`yt-dlp.exe` en Windows) con permisos de ejecución.
- Si el hash no coincide o la descarga falla: se borra el temporal, se dice en lenguaje llano («No hemos podido
  preparar el lector de YouTube. Puedes seguir; lo intentaremos desde Ajustes.»), la fuente queda `no_disponible` y
  la instalación **continúa**. Este paso nunca bloquea la instalación.
- Volver a ejecutar el instalador con la misma versión ya instalada no descarga nada.
- Ajustes → «Actualizar el lector de YouTube» hace lo mismo con la versión de `versions.json` de la app instalada.

## Mensajes

| Situación | Texto |
|---|---|
| Empieza | «Preparando el lector de YouTube…» |
| Bien | «Lector de YouTube listo.» |
| Falla | El de arriba; en el log, el código (`descarga`, `hash`, `permisos`) sin rutas personales |

## Pruebas

`pnpm test:installer`: descarga simulada correcta, hash erróneo, sin red, ya instalada; en macOS, Linux y Windows.

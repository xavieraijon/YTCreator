---
description: Repara, comprueba o actualiza la instalación de YTCreator en este equipo (ejecuta el instalador)
argument-hint: (nada) = reparar · "comprobar" = solo revisar · "actualizar" = traer la versión nueva
---

# REPARAR / ACTUALIZAR YTCREATOR

$ARGUMENTS

Responde SIEMPRE en castellano, en frases sencillas: quien lee no sabe qué es una terminal.

**La instalación la hace el instalador, no Claude.** Una persona instala YTCreator pegando una línea en la terminal
(`README.md`): `instalar.sh` (Mac y Linux) o `instalar.ps1` (Windows), en la raíz del kit. Los dos hacen los mismos 11
pasos, cada uno mira primero si ya está y se pueden repetir: **repetirlo = reparar y actualizar**. Detalles y problemas
para la persona: `docs/instalar.md`. Si alguien te pide instalar YTCreator desde cero en un equipo donde aún no está,
dale la línea del README para su sistema; no lo instales tú a mano.

Cómo queda: el espacio `~/YTCreator` (`canales/`, `analisis/`, `data/`, `.env`, `Abrir YTCreator`) con el kit dentro, en
`programa/`. Llamamos **KIT** a esa carpeta y **PY** a su python (`KIT/.venv/bin/python`; en Windows,
`KIT/.venv/Scripts/python.exe`).

## Reparar o actualizar (sin argumento, «Repara YTCreator», «Actualiza YTCreator» o `actualizar`)
1. Avisa: «Vuelvo a pasar el instalador: revisa cada pieza, trae la versión nueva si la hay y, si YTCreator está abierto,
   lo reinicia. Tus canales no se tocan.» Si la carpeta YTCreator se movió de sitio, primero
   `PY KIT/herramientas/espacio.py elegir <carpeta nueva>` (el instalador respeta el espacio elegido).
2. Mira si hay cambios a mano en KIT (`git -C KIT status --porcelain --untracked-files=no`): si los hay, dilo; el
   instalador no actualiza en ese caso (solo repara). No los descartes sin que la persona lo decida.
3. Ejecuta el instalador del propio KIT en segundo plano (tarda de 1 a 20 minutos), con la salida a un archivo que vas
   leyendo para contar cada paso (✅ / ⚠️ / ❌):
   - Mac y Linux: `bash KIT/instalar.sh`
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File KIT\instalar.ps1`
   Si YTCreator está cerrado, abre su pantalla de progreso en el navegador; si está abierto, el progreso sale solo en la
   salida. Sin terminal interactiva, las preguntas (nombre del historial, entrar en Claude) se saltan: si el paso 9 dice
   «sin entrar», pídele que escriba `! claude auth login`.
4. Si falla, el instalador dice en su última línea roja qué ha pasado y qué hacer (registro: `KIT/programas/instalar.log`).
   Explícaselo en llano y, si lo puedes arreglar tú sin administrador, hazlo y vuelve a lanzarlo. Lo que exija contraseña
   (git o `libasound` en Linux con `sudo`), pídele que lo pegue con `!` delante.
5. Al acabar, cuenta qué cambió (`git -C KIT log --oneline <antes>..HEAD`, en una frase) y que YTCreator está abierto en
   http://127.0.0.1:8765.

## Comprobar (`comprobar`)
Sin instalar ni cambiar nada, revisa y cuenta en llano (✅ / ❌):
1. `PY --version` (3.13), `PY -m yt_dlp --version`, ffmpeg y ffprobe (`KIT/programas/` o del sistema),
   `KIT/ui/.node/bin/node --version` (Windows: `KIT/ui/.node/node.exe`) empieza por `v24`.
2. `PY KIT/herramientas/espacio.py` (kit y espacio correctos, `separado: True`) y `PY KIT/herramientas/esquema.py`.
3. `KIT/ui/frontend/dist/frontend/browser/index.html` existe; `claude --version` y `claude auth status`.
4. Si quieres la prueba completa sin gastar: copia `KIT/ui/backend/tests/espacio_de_prueba` a una carpeta temporal `<t>`,
   `CANALYT_ESPACIO=<t> PY -c "import sys; sys.path.insert(0,'KIT/herramientas'); import espacio; espacio.preparar()"` y
   `CANALYT_ESPACIO=<t> CANALYT_SIN_GASTO=1 PY KIT/herramientas/probar_kit.py`; borra `<t>` al acabar.
Si algo falla, propón reparar (la sección de arriba).

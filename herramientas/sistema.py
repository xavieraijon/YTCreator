"""Lo que cambia según el sistema (Mac, Linux o Windows), en un solo sitio y solo con la biblioteca estándar.

  python_venv(base)      el python del entorno virtual (.venv/bin/python o .venv\\Scripts\\python.exe)
  cerrojo(ruta)          cerrojo exclusivo de un archivo entre procesos (flock o msvcrt); lo libera el sistema si el
                         proceso muere. `bloquear(fd, esperar=False)` lanza BlockingIOError si otro lo tiene
  prioridad_baja()       prefijo de una orden para lanzarla con prioridad baja (`nice -n 10` en Mac y Linux)
  opciones_grupo()       argumentos de subprocess para lanzar un proceso en su propio grupo (para pararlo entero)
  senal_grupo(pid, n)    para un grupo: "int" (como Ctrl+C), "term" o "kill"
  grupo_vivo / comando_de / grupo_propio   para reconocer y parar procesos de una ejecución anterior
  enlazar(destino, origen)   enlace a una carpeta o archivo (en Windows, unión de carpetas si no hay permiso de enlace)
  programas_en_path()    (al importar) pone `programas/` del kit y las órdenes del `.venv` delante del PATH (ffmpeg, yt-dlp)

Ninguna otra herramienta pregunta por el sistema: si algo depende de él, va aquí."""

import os
import platform
import shutil
import signal
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path

WINDOWS = os.name == "nt"
MAC = sys.platform == "darwin"
KIT = Path(__file__).resolve().parents[1]

if WINDOWS:
    import msvcrt
else:
    import fcntl


def python_venv(base, entorno=".venv") -> Path:
    """El intérprete de un entorno virtual del kit (`.venv`, `.venv-local`, `.venv-whisperx`) dentro de `base`."""
    carpeta = Path(base) / entorno
    return carpeta / "Scripts" / "python.exe" if WINDOWS else carpeta / "bin" / "python"


def carpetas_programas(kit=KIT) -> list[Path]:
    """Dónde deja el instalador (`instalar.sh` / `instalar.ps1`) los programas sin permisos de administrador:
    `programas/` del kit (ffmpeg y ffprobe estáticos) y la carpeta de órdenes del `.venv` (yt-dlp, instalado con pip)."""
    return [Path(kit) / "programas", python_venv(kit).parent]


def programas_en_path(kit=KIT, entorno=None) -> None:
    """Pone delante del PATH las carpetas de `carpetas_programas` que existan, para que `ffmpeg` y `yt-dlp` se
    encuentren igual que si estuvieran instalados en el sistema. Se hace al importar este módulo (lo importan todas las
    herramientas y la UI), así que los procesos que lancen lo heredan."""
    entorno = os.environ if entorno is None else entorno
    actuales = entorno.get("PATH", "").split(os.pathsep)
    nuevas = [str(c) for c in carpetas_programas(kit) if c.is_dir() and str(c) not in actuales]
    if nuevas:
        entorno["PATH"] = os.pathsep.join([*nuevas, *filter(None, actuales)])


programas_en_path()


PYTHON_UNIX = ".venv/bin/python"


def orden_python() -> str:
    """Cómo se escribe el python del kit en una orden de Claude (en Windows, Claude usa Git Bash: barras normales)."""
    return ".venv/Scripts/python.exe" if WINDOWS else PYTHON_UNIX


def adaptar_orden(texto: str) -> str:
    """Los mensajes, agentes y permisos del kit escriben `.venv/bin/python`; en Windows se cambia por el suyo."""
    return texto.replace(PYTHON_UNIX, orden_python()) if WINDOWS else texto


def mac_apple_silicon() -> bool:
    """¿Es un Mac con chip de Apple? (el motor de imágenes local, MLX, solo funciona ahí)."""
    return MAC and platform.machine() == "arm64"


# ---------------------------------------------------------------------------------------------------- cerrojos
def bloquear(fd, esperar=True):
    """Cerrojo exclusivo sobre un archivo abierto (objeto o descriptor). Sin `esperar`, BlockingIOError si lo tiene
    otro proceso."""
    fd = fd if isinstance(fd, int) else fd.fileno()
    if not WINDOWS:
        fcntl.flock(fd, fcntl.LOCK_EX | (0 if esperar else fcntl.LOCK_NB))
        return
    os.lseek(fd, 0, os.SEEK_SET)          # msvcrt bloquea bytes desde la posición actual: siempre el primero
    while True:
        try:
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            return
        except OSError:
            if not esperar:
                raise BlockingIOError("el archivo lo tiene bloqueado otro proceso") from None
            time.sleep(0.1)


def desbloquear(fd):
    fd = fd if isinstance(fd, int) else fd.fileno()
    if WINDOWS:
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
    else:
        fcntl.flock(fd, fcntl.LOCK_UN)


@contextmanager
def cerrojo(ruta, esperar=True):
    """`with cerrojo(ruta):` — exclusivo entre procesos. Sin `esperar`, BlockingIOError si ya lo tiene otro. El archivo
    se abre para añadir (nunca se vacía: en Windows no se puede truncar una zona bloqueada)."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "a") as fh:
        bloquear(fh, esperar)
        try:
            yield fh
        finally:
            desbloquear(fh)


def esta_bloqueado(ruta) -> bool:
    """¿Tiene otro proceso el cerrojo de `ruta`? Lo abre solo para leer (abrirlo para escribir lo «cambia» y el
    vigilante de la UI lo notaría)."""
    try:
        fd = os.open(ruta, os.O_RDONLY)
    except FileNotFoundError:
        return False
    try:
        bloquear(fd, esperar=False)
    except BlockingIOError:
        return True
    else:
        desbloquear(fd)
        return False
    finally:
        os.close(fd)


# ---------------------------------------------------------------------------------------------------- procesos
def prioridad_baja() -> list[str]:
    """Prefijo de la orden para que una tarea pesada no ralentice el ordenador. En Windows no hay prefijo: la prioridad
    va en `opciones_grupo(baja=True)`."""
    return ["nice", "-n", "10"] if not WINDOWS and shutil.which("nice") else []


def opciones_grupo(baja=False) -> dict:
    """Argumentos de subprocess / asyncio.create_subprocess_exec para lanzar un proceso en su propio grupo, de modo
    que `senal_grupo(pid, …)` lo pare entero (python → ffmpeg…). En Windows, `baja` pone además prioridad baja."""
    if not WINDOWS:
        return {"start_new_session": True}
    banderas = subprocess.CREATE_NEW_PROCESS_GROUP | (subprocess.BELOW_NORMAL_PRIORITY_CLASS if baja else 0)
    return {"creationflags": banderas}


_SENALES = {"int": "SIGINT", "term": "SIGTERM", "kill": "SIGKILL"}


def senal_grupo(pid: int, nivel: str) -> bool:
    """Para el grupo de `pid`: "int" (como Ctrl+C, la herramienta limpia), "term" o "kill". False si ya no existe (o
    no es nuestro). En Windows, "int" es Ctrl+Break al grupo y "term"/"kill" cierran el árbol de procesos."""
    if not WINDOWS:
        try:
            os.killpg(pid, getattr(signal, _SENALES[nivel]))
            return True
        except (ProcessLookupError, PermissionError):
            return False
    if not grupo_vivo(pid):
        return False
    if nivel == "int":
        try:
            os.kill(pid, signal.CTRL_BREAK_EVENT)
            return True
        except OSError:
            return False
    r = subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, timeout=15)
    return r.returncode == 0


def grupo_vivo(pid: int) -> bool:
    """¿Sigue vivo el grupo de `pid` (en Windows, el proceso) y es de este usuario?"""
    if not WINDOWS:
        try:
            os.killpg(pid, 0)
            return True
        except (ProcessLookupError, PermissionError):     # PermissionError: existe pero es de otro usuario
            return False
    r = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"], capture_output=True, text=True,
                       timeout=15)
    return f'"{pid}"' in r.stdout


def comando_de(pid: int) -> str:
    """La orden con la que se lanzó `pid` ("" si no se sabe)."""
    if WINDOWS:
        orden = ["powershell", "-NoProfile", "-Command",
                 f"(Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}').CommandLine"]
    else:
        orden = ["ps", "-o", "command=", "-p", str(pid)]
    try:
        return subprocess.run(orden, capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def grupo_propio() -> int:
    """El grupo de este proceso (para no pararse a sí mismo)."""
    return os.getpid() if WINDOWS else os.getpgrp()


# ---------------------------------------------------------------------------------------------------- enlaces
def enlazar(destino, origen):
    """Crea `destino` como enlace a `origen`. En Windows, sin el «modo de desarrollador» no se pueden crear enlaces
    simbólicos: una carpeta se enlaza con una unión (mklink /J, no pide permisos) y un archivo se copia."""
    destino, origen = Path(destino), Path(origen)
    try:
        destino.symlink_to(origen, target_is_directory=origen.is_dir())
        return
    except OSError:
        if not WINDOWS:
            raise
    if origen.is_dir():
        r = subprocess.run(["cmd", "/c", "mklink", "/J", str(destino), str(origen)], capture_output=True, text=True)
        if r.returncode:
            raise OSError(f"no se pudo enlazar {destino} → {origen}: {r.stdout or r.stderr}".strip())
    else:
        shutil.copy2(origen, destino)


def es_enlace(ruta) -> bool:
    """¿Es un enlace (simbólico o, en Windows, una unión de carpetas)?"""
    ruta = Path(ruta)
    return ruta.is_symlink() or (WINDOWS and hasattr(ruta, "is_junction") and ruta.is_junction())

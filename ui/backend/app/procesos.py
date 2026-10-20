"""Ciclo de vida de los procesos hijos (herramientas del kit y Claude).

Cada proceso se lanza en su propio grupo (`sistema.opciones_grupo()`) para poder pararlo entero (python → ffmpeg…).
La contrapartida es que NO muere con el backend: por eso
- parar = SIGINT al grupo (como Ctrl+C: la herramienta limpia; en Windows, Ctrl+Break) → SIGTERM → SIGKILL (en Windows,
  cerrar el árbol), con esperas cortas; nunca se
  queda una tarea «en curso» para siempre porque el proceso ignore una señal;
- el PID se guarda en la BD y, al arrancar, los que siguen vivos de una ejecución anterior se paran
  (`parar_huerfano`), comprobando antes que el proceso es nuestro para no matar nunca uno ajeno con el mismo número."""

import asyncio
import logging
import time

from . import config  # noqa: F401  (pone herramientas/ en sys.path)

import sistema  # noqa: E402  (herramientas/sistema.py: lo que cambia entre Mac, Linux y Windows)

log = logging.getLogger("canalyt.procesos")

ESPERA_SIGINT = 10.0     # lo que se deja a la herramienta para terminar por las buenas
ESPERA_SIGTERM = 5.0


def senal(pgid: int, nivel: str) -> bool:
    """Manda "int", "term" o "kill" a un grupo de procesos. False si ya no existe (o no es nuestro)."""
    return sistema.senal_grupo(pgid, nivel)


async def parar(proc: asyncio.subprocess.Process, espera_sigint: float = ESPERA_SIGINT,
                espera_sigterm: float = ESPERA_SIGTERM) -> int | None:
    """Para el grupo del proceso con escalado y espera a que termine. Devuelve su código de salida."""
    for sig, espera in (("int", espera_sigint), ("term", espera_sigterm)):
        if proc.returncode is not None or not senal(proc.pid, sig):
            break
        try:
            return await asyncio.wait_for(proc.wait(), espera)
        except asyncio.TimeoutError:
            log.warning("El proceso %s no ha terminado con SIG%s: se escala", proc.pid, sig.upper())
    else:
        senal(proc.pid, "kill")
    try:
        return await asyncio.wait_for(proc.wait(), 5)
    except asyncio.TimeoutError:
        log.error("El proceso %s no termina ni con SIGKILL", proc.pid)
        return proc.returncode


def _comando(pid: int) -> str:
    return sistema.comando_de(pid)


def _grupo_vivo(pgid: int) -> bool:
    return sistema.grupo_vivo(pgid)


def parar_huerfano(pgid: int | None, firma: str) -> bool:
    """Tras un reinicio del backend: para el grupo `pgid` de una ejecución anterior si sigue vivo.

    Es nuestro si su proceso principal ejecuta `firma` (la ruta del script o el ejecutable de Claude) o si el principal
    ya murió pero el grupo sigue vivo (un número de grupo no se reutiliza mientras el grupo exista). Devuelve True si
    había algo que parar."""
    if not firma or not pgid or pgid <= 1 or pgid == sistema.grupo_propio() or not _grupo_vivo(pgid):
        return False
    comando = _comando(pgid)
    if comando and firma not in comando:      # el número lo tiene ahora otro proceso: no se toca
        return False
    log.warning("Parando procesos huérfanos de una ejecución anterior (grupo %s: %s)", pgid, comando or "sin líder")
    senal(pgid, "term")
    limite = time.monotonic() + ESPERA_SIGTERM
    while time.monotonic() < limite and _grupo_vivo(pgid):
        time.sleep(0.2)
    if _grupo_vivo(pgid):
        senal(pgid, "kill")
    return True

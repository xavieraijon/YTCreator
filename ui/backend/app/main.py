"""Backend de la interfaz del kit. Arranque: ui/arrancar.sh (o uvicorn app.main:app desde ui/backend)."""

import asyncio
import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager, suppress
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import urlsplit

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from . import chat, config
from . import medios as _medios
from .medios import limpiar_cache as limpiar_miniaturas
from .db import Sesion
from .eventos import difusor
from .rutas import ajustes, asistente, canales, claude, conectores, eventos, fases_ui, medios, sistema, tareas, videos
from .sincronizar import sincronizar_todo
from .contexto_log import ContextoPeticion, FiltroContexto
from .tareas import ejecutor
from .vigilante import vigilar

import archivos  # noqa: E402  (herramientas/, en sys.path por config)

BACKEND = Path(__file__).resolve().parent.parent
log = logging.getLogger("canalyt")


def configurar_logs():
    """Log persistente del backend en data/logs/backend.log (rotativo, 5 × 1 MB): tareas, PIDs, huérfanos y errores, para
    saber qué pasó aunque se haya cerrado la terminal. La salida de cada tarea sigue en data/tareas/<id>.log."""
    if log.handlers:
        return
    carpeta = Path(os.getenv("CANALYT_LOGS", config.RAIZ / "data" / "logs"))
    carpeta.mkdir(parents=True, exist_ok=True)
    archivo = RotatingFileHandler(carpeta / "backend.log", maxBytes=1_000_000, backupCount=5, encoding="utf-8")
    archivo.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s%(contexto)s: %(message)s"))
    terminal = logging.StreamHandler()
    terminal.setLevel(logging.WARNING)
    terminal.setFormatter(logging.Formatter("%(levelname)s %(name)s%(contexto)s: %(message)s"))
    for h in (archivo, terminal):           # «[tarea 12 · vídeo 3]» en cada línea que hable de uno (contexto_log)
        h.addFilter(FiltroContexto())
    log.addHandler(archivo)
    log.addHandler(terminal)
    log.setLevel(logging.INFO)
    log.propagate = False


def migrar():
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migraciones"))
    cfg.attributes["configurar_logs"] = False   # no pisar los logs de uvicorn
    command.upgrade(cfg, "head")


def _proteger_env():
    """El .env del espacio lleva las claves: solo legible por su dueño (600), lo haya creado quien lo haya creado."""
    env = config.RAIZ / ".env"
    try:
        if env.exists() and env.stat().st_mode & 0o077:
            env.chmod(0o600)
            log.warning("Permisos del .env corregidos a 600 (antes los podía leer cualquier usuario del Mac)")
    except OSError as e:
        log.warning("No se pudieron revisar los permisos del .env: %s", e)


@asynccontextmanager
async def ciclo(app: FastAPI):
    configurar_logs()
    log.info("Arranque del backend (pid %s): kit %s, espacio %s", os.getpid(), config.KIT, config.RAIZ)
    difusor.iniciar()
    migrar()
    _proteger_env()
    borradas = await asyncio.to_thread(limpiar_miniaturas)
    if borradas:
        log.info("Caché de miniaturas: %s antiguas borradas", borradas)
    borradas_picos = await asyncio.to_thread(
        _medios.limpiar_cache, 90, 1_000_000_000, _medios.CACHE_PICOS, "*.json")
    if borradas_picos:
        log.info("Caché de picos: %s antiguas borradas", borradas_picos)
    with Sesion() as s:
        sincronizar_todo(s)
    chat.reparar()
    parada = asyncio.Event()
    fondo = [asyncio.create_task(ejecutor.bucle(parada))]
    if os.getenv("CANALYT_VIGILANTE", "1") != "0":
        fondo.append(asyncio.create_task(vigilar(parada)))
    if os.getenv("CANALYT_CUOTAS", "1") != "0":          # los tests lo apagan: sin red
        fondo.append(asyncio.create_task(tareas.vigilar_cuotas(parada)))
        ejecutor.al_terminar.append(tareas.refrescar_cuotas)
    yield
    parada.set()
    await chat.parar_todo()                 # Claude no debe seguir editando archivos con el backend parado
    for tarea in fondo:
        with suppress(asyncio.CancelledError, asyncio.TimeoutError):
            await asyncio.wait_for(tarea, timeout=6)
    log.info("Backend parado")


# Solo este Mac. Escuchar en 127.0.0.1 no basta: cualquier web abierta en el navegador puede mandar peticiones a
# 127.0.0.1:8765 (POST sin cuerpo: cancelar, activar, avanzar fase) y, con DNS rebinding (un dominio suyo que resuelve a
# 127.0.0.1), usar toda la API, incluidas las tareas de pago y el chat con Claude. Se exige un Host local y, en lo que
# cambia algo, que el Origin (si lo hay) también lo sea.
HOSTS_LOCALES = {"127.0.0.1", "localhost", "::1", "testserver"}
SEGUROS = {"GET", "HEAD", "OPTIONS"}


def _host_local(host: str) -> bool:
    return (urlsplit(f"//{host}").hostname or "") in HOSTS_LOCALES


class SoloLocal:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            cabeceras = {k.decode("latin-1"): v.decode("latin-1") for k, v in scope["headers"]}
            origen = cabeceras.get("origin")
            if not _host_local(cabeceras.get("host", "")):
                return await _rechazar(send, 400, "Host no permitido: la interfaz solo atiende a este equipo")
            if scope["method"] not in SEGUROS and origen is not None and not _host_local(urlsplit(origen).netloc):
                return await _rechazar(send, 403, "Origen no permitido")
        await self.app(scope, receive, send)


async def _rechazar(send, codigo: int, detalle: str):
    log.warning("Petición rechazada (%s): %s", codigo, detalle)
    cuerpo = json.dumps({"detail": detalle}, ensure_ascii=False).encode()
    await send({"type": "http.response.start", "status": codigo,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(cuerpo)).encode())]})
    await send({"type": "http.response.body", "body": cuerpo})


app = FastAPI(title="CanalYT", version="0.1.0", lifespan=ciclo)
app.add_middleware(ContextoPeticion)
app.add_middleware(SoloLocal)


# Fallos que no son de una ruta concreta: dichos al usuario con lo que ha pasado y qué hacer (docs: fiabilidad, 07/10).
@app.exception_handler(archivos.ArchivoDanado)
async def _archivo_danado(_: Request, e: archivos.ArchivoDanado):
    log.warning("Archivo dañado: %s", e.ruta)
    return JSONResponse({"detail": str(e)}, status_code=409)


ERRNO_DISCO = {28: "No queda espacio en el disco", 30: "El disco está en modo solo lectura", 13: "No hay permiso para escribir"}


@app.exception_handler(OSError)
async def _sin_disco(_: Request, e: OSError):
    causa = ERRNO_DISCO.get(e.errno or 0)
    if not causa:
        raise e
    log.error("%s: %s", causa, e)
    return JSONResponse({"detail": f"{causa}: no se ha podido guardar y no se ha cambiado nada. Libera espacio (o revisa "
                                   "la carpeta de trabajo) y vuelve a intentarlo."}, status_code=507)

app.include_router(canales.router)
app.include_router(videos.router)
app.include_router(fases_ui.router)
app.include_router(eventos.router)
app.include_router(medios.router)
app.include_router(tareas.router)
app.include_router(sistema.router)
app.include_router(claude.router)
app.include_router(asistente.router)
app.include_router(ajustes.router)
app.include_router(conectores.router)


ARRANQUE = time.time()


def _codigo_cambiado():
    """Archivos .py del kit ya cargados por este proceso que han cambiado después de arrancar: el servidor
    sigue con la versión vieja (rutas nuevas → 405/404) hasta que se reinicie."""
    cambiados = []
    for m in list(sys.modules.values()):
        f = getattr(m, "__file__", None)
        if not f or ".venv" in f:
            continue
        p = Path(f)
        try:
            if p.is_relative_to(config.KIT) and p.stat().st_mtime > ARRANQUE:
                cambiados.append(str(p.relative_to(config.KIT)))
        except OSError:
            continue
    return sorted(cambiados)


@app.get("/api/salud", tags=["sistema"])
def salud():
    cambiados = _codigo_cambiado()
    return {"ok": True, "raiz": str(config.KIT), "espacio": str(config.RAIZ), "reiniciar": bool(cambiados), "cambiados": cambiados}


# Frontend compilado (ng build): se sirve desde aquí; en desarrollo se usa ng serve con proxy a /api.
if config.FRONTEND_DIST.exists():
    @app.get("/{ruta:path}", include_in_schema=False)
    def frontend(ruta: str):
        if ruta == "api" or ruta.startswith("api/"):
            raise HTTPException(404, "Esa dirección no existe")
        archivo = (config.FRONTEND_DIST / ruta).resolve()
        if ruta and archivo.is_file() and archivo.is_relative_to(config.FRONTEND_DIST):
            return FileResponse(archivo)
        return FileResponse(config.FRONTEND_DIST / "index.html")

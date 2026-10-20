import asyncio
import logging
import os
import signal
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from .. import ai33
from ..db import Sesion
from ..eventos import difusor
from ..modelos import Canal, Video
from ..sincronizar import sincronizar_todo
from .tareas import refrescar_cuotas

router = APIRouter(prefix="/api", tags=["sistema"])
log = logging.getLogger("canalyt")


class Actualizado(BaseModel):
    canales: int
    videos: int
    segundos: float
    cuotas_error: str | None


def _reindexar():
    with Sesion() as s:
        sincronizar_todo(s)
        return s.scalar(select(func.count()).select_from(Canal)), s.scalar(select(func.count()).select_from(Video))


@router.post("/actualizar", response_model=Actualizado)
async def actualizar():
    """Botón «Actualizar todo»: reindexa desde los archivos (vídeos, estado.json, imágenes hechas, pendientes y
    que se rehacen), vuelve a consultar las cuotas reales (sin caché) y la cola de ai33, y avisa a todas las
    pantallas para que se vuelvan a pedir."""
    inicio = time.time()
    ai33._cache.clear()
    (canales, videos), _ = await asyncio.gather(asyncio.to_thread(_reindexar), refrescar_cuotas())
    from .tareas import _cuotas
    difusor.publicar("cambio", canal=None)
    return Actualizado(canales=canales, videos=videos, segundos=round(time.time() - inicio, 1),
                       cuotas_error=_cuotas["error"])


# ---------------------------------------------------------------------------------------------------- cerrar y reiniciar
# ui/arrancar.py lanza el servidor con CANALYT_ORDEN = un archivo vacío. Para cerrar o reiniciar se escribe ahí la orden y
# el servidor se para como con Ctrl+C (SIGTERM: termina los trabajos y a Claude, cierra la BD); arrancar.py lee la orden
# y, si es «reiniciar», lo vuelve a lanzar. Sin CANALYT_ORDEN (dev, tests, uvicorn a mano) no se puede desde aquí.
def apagable() -> bool:
    return bool(os.getenv("CANALYT_ORDEN"))


def _parar():
    """Se llama dentro del bucle (hilo principal), así vale también en Windows."""
    signal.raise_signal(signal.SIGTERM)


def _pedir(orden: str):
    if not apagable():
        raise HTTPException(409, "Este YTCreator no se abrió con «Abrir YTCreator»: ciérralo en la ventana donde se "
                                 "arrancó (Ctrl+C) y vuelve a abrirlo.")
    Path(os.environ["CANALYT_ORDEN"]).write_text(orden, encoding="utf-8")
    log.info("Pedido desde la interfaz: %s", orden)
    asyncio.get_running_loop().call_later(0.5, _parar)          # antes, la respuesta llega al navegador
    return {"ok": True}


@router.post("/reiniciar")
async def reiniciar():
    """«Reiniciar ahora»: carga los cambios del programa. No se pierde nada (los trabajos en marcha se paran)."""
    return _pedir("reiniciar")


@router.post("/cerrar")
async def cerrar():
    """«Cerrar YTCreator»: para el servidor y deja libre el puerto."""
    return _pedir("cerrar")

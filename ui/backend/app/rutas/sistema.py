import asyncio
import time

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from .. import ai33
from ..db import Sesion
from ..eventos import difusor
from ..modelos import Canal, Video
from ..sincronizar import sincronizar_todo
from .tareas import refrescar_cuotas

router = APIRouter(prefix="/api", tags=["sistema"])


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

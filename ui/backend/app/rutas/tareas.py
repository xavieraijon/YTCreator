import asyncio
import json
import subprocess
import time
from contextlib import suppress
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import config
from ..asistente import activos, conectados, nombres, otros
from ..db import sesion
from ..eventos import difusor
from ..modelos import Tarea
from ..tareas import ACTIVAS, HERRAMIENTAS, ErrorTarea, ejecutor, leer_log, preparar

router = APIRouter(prefix="/api", tags=["tareas"])


class HerramientaOut(BaseModel):
    clave: str
    titulo: str
    descripcion: str
    pesada: bool
    necesita_video: bool


class TareaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    herramienta: str
    titulo: str
    canal: str | None
    video_id: int | None
    argumentos: dict
    pesada: bool
    estado: str
    codigo: int | None
    progreso: dict | None
    creada: datetime
    empezada: datetime | None
    terminada: datetime | None


class TareaDetalle(TareaOut):
    comando: list[str]
    lineas: list[str]


class NuevaTarea(BaseModel):
    herramienta: str
    video_id: int | None = None
    argumentos: dict = {}


@router.get("/herramientas", response_model=list[HerramientaOut])
def herramientas():
    """Lo que se puede lanzar desde la UI (todo gratis)."""
    return [HerramientaOut(clave=k, titulo=h.titulo, descripcion=h.descripcion, pesada=h.pesada,
                           necesita_video=h.necesita_video) for k, h in HERRAMIENTAS.items()]


@router.get("/tareas", response_model=list[TareaOut])
def listar(video_id: int | None = None, activas: bool = False, limite: int = 50, s: Session = Depends(sesion)):
    q = select(Tarea).order_by(Tarea.id.desc()).limit(min(limite, 200))
    if video_id is not None:
        q = q.where(Tarea.video_id == video_id)
    if activas:
        q = q.where(Tarea.estado.in_(ACTIVAS))
    return s.scalars(q).all()


# crear y cancelar son async: avisan al ejecutor y publican eventos en el hilo del bucle de eventos.
@router.post("/tareas", response_model=TareaOut, status_code=201)
async def crear(pedido: NuevaTarea, s: Session = Depends(sesion)):
    try:
        t = preparar(s, pedido.herramienta, pedido.video_id, pedido.argumentos)
    except ErrorTarea as e:
        raise HTTPException(422, str(e))
    difusor.publicar("tarea", id=t.id, estado=t.estado)
    ejecutor.avisar()
    return t


def _tarea(s, tid):
    t = s.get(Tarea, tid)
    if not t:
        raise HTTPException(404, "Esa tarea no existe")
    return t


@router.get("/tareas/{tid}", response_model=TareaDetalle)
def detalle(tid: int, s: Session = Depends(sesion)):
    t = _tarea(s, tid)
    return TareaDetalle(**TareaOut.model_validate(t).model_dump(), comando=t.comando, lineas=leer_log(t.log))


@router.post("/tareas/{tid}/cancelar", response_model=TareaOut)
async def cancelar(tid: int, s: Session = Depends(sesion)):
    t = _tarea(s, tid)
    if t.estado == "en_cola":
        # Condicional: el ejecutor puede estar marcándola «en curso» en este mismo momento (en otro hilo).
        hecho = s.execute(update(Tarea).where(Tarea.id == tid, Tarea.estado == "en_cola")
                          .values(estado="cancelada", terminada=datetime.now())).rowcount
        s.commit()
        s.refresh(t)
        if hecho:
            difusor.publicar("tarea", id=t.id, estado=t.estado)
        elif t.estado == "en_curso" and not ejecutor.cancelar_proceso(tid):
            raise HTTPException(409, "La tarea acaba de empezar y ya estaba terminando")
    elif t.estado == "en_curso":
        if not ejecutor.cancelar_proceso(tid):
            raise HTTPException(409, "La tarea ya estaba terminando")
    else:
        raise HTTPException(409, f"La tarea ya está {t.estado}")
    return t


# Cuotas: `cuota.py --json` (analítica real de Cloudflare, Azure y saldo de ai33). Se consulta cada
# CUOTAS_CADA segundos y al terminar cada tarea, y se manda a todas las pantallas por SSE ("cuotas").
_cuotas: dict = {"datos": None, "hora": 0.0, "error": None}
CUOTAS_VIGENCIA = 300
CUOTAS_CADA = 120
_bloqueo_cuotas = asyncio.Lock()


class Cuotas(BaseModel):
    datos: dict | None             # cloudflare, azure, ai33 (ver cuota.datos)
    conectados: dict[str, bool] = {}   # servicios con sus claves en el .env (asistente.conectados)
    activos: dict[str, bool] = {}      # servicios que el usuario usa (Ajustes → Servicios; asistente.activos)
    otros: list[dict] = []             # servicios usados sin cuota propia: nombre del usuario y gasto contado (asistente.otros)
    nombres: dict[str, str] = {}       # nombre de cada servicio con cuota, tal como lo ve el usuario
    error: str | None
    consultado: datetime | None


def _consultar_cuotas():
    r = subprocess.run([str(config.PYTHON), str(config.HERRAMIENTAS / "cuota.py"), "--json"], cwd=config.RAIZ,
                       capture_output=True, text=True, timeout=90)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[-400:] or f"cuota.py salió con {r.returncode}")
    return json.loads(r.stdout)


def _cuotas_out():
    hora = datetime.fromtimestamp(_cuotas["hora"]) if _cuotas["hora"] else None
    return Cuotas(datos=_cuotas["datos"], conectados=conectados(), activos=activos(), otros=otros(), nombres=nombres(), error=_cuotas["error"], consultado=hora)


async def refrescar_cuotas():
    async with _bloqueo_cuotas:        # varias peticiones a la vez: una sola consulta
        try:
            _cuotas.update(datos=await asyncio.to_thread(_consultar_cuotas), hora=time.time(), error=None)
        except Exception as e:
            _cuotas.update(error=str(e), hora=time.time())
    difusor.publicar("cuotas", **_cuotas_out().model_dump(mode="json"))


async def vigilar_cuotas(parada: asyncio.Event):
    """Cuotas al día sin que nadie pulse nada."""
    while not parada.is_set():
        await refrescar_cuotas()
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(parada.wait(), timeout=CUOTAS_CADA)


@router.get("/cuotas", response_model=Cuotas)
async def cuotas(refrescar: bool = False):
    if refrescar or not _cuotas["datos"] or time.time() - _cuotas["hora"] > CUOTAS_VIGENCIA:
        await refrescar_cuotas()
    return _cuotas_out()

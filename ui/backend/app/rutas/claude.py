"""Chat con Claude por vídeo (app/chat.py): leer la conversación, enviar un mensaje, parar y empezar otra."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import chat
from ..db import sesion
from ..modelos import Conversacion, Video

router = APIRouter(prefix="/api", tags=["claude"])


class ConversacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    video_id: int | None
    estado: str
    turnos: int
    creada: datetime
    actualizada: datetime


class ChatOut(BaseModel):
    conversacion: ConversacionOut | None
    entradas: list[dict]


class Mensaje(BaseModel):
    mensaje: str
    nueva: bool = False          # empezar una conversación nueva (Claude olvida la anterior)
    canal: str | None = None     # solo para /asistente/claude: trabajar sobre ESTE canal, no el activo (p. ej.
                                 # «Pedir otro cambio a Claude» desde la ficha de un canal que no es el activo)


def _video(s: Session, video_id: int) -> Video:
    v = s.get(Video, video_id)
    if not v:
        raise HTTPException(404, "Ese vídeo no existe")
    return v


@router.get("/videos/{video_id}/claude", response_model=ChatOut)
def ver(video_id: int, s: Session = Depends(sesion)):
    _video(s, video_id)
    c = chat.conversacion_de_video(s, video_id)
    return {"conversacion": c, "entradas": chat.leer(c.id) if c else []}


@router.post("/videos/{video_id}/claude", response_model=ConversacionOut)
async def enviar(video_id: int, datos: Mensaje, s: Session = Depends(sesion)):
    """Manda un mensaje a Claude (en segundo plano: la respuesta llega por SSE)."""
    v = _video(s, video_id)
    c = chat.conversacion_de_video(s, video_id)
    if c and datos.nueva and c.estado == "pensando":
        raise HTTPException(409, "Claude todavía está trabajando: páralo antes de empezar otra conversación")
    if not c or datos.nueva:
        c = chat.nueva(s, v)
    try:
        await chat.enviar(c.id, datos.mensaje)
    except chat.ErrorChat as e:
        raise HTTPException(409 if "todavía" in str(e) else 422, str(e))
    s.refresh(c)
    return c


@router.post("/claude/{conversacion_id}/parar")
async def parar(conversacion_id: int, s: Session = Depends(sesion)):
    if not s.get(Conversacion, conversacion_id):
        raise HTTPException(404, "Esa conversación no existe")
    return {"parado": await chat.cancelar(conversacion_id)}


class TurnoClaude(BaseModel):
    conversacion: int
    video_id: int | None
    titulo: str                  # el del vídeo, o «Tu canal (asistente)»
    estado: str                  # pensando | libre | error
    desde: datetime              # inicio del turno en marcha, o cuándo terminó
    accion: str | None = None    # lo que está haciendo ahora (su última herramienta)


@router.get("/actividad/claude", response_model=list[TurnoClaude])
def actividad_claude(s: Session = Depends(sesion)):
    """Turnos de Claude en marcha y los terminados en la última media hora: lo que la cabecera junta con las tareas
    en «Actividad» (hallazgo 26 del recorrido profano: antes decía «Nada en marcha» mientras Claude trabajaba)."""
    limite = datetime.now() - timedelta(minutes=30)
    conv = s.scalars(select(Conversacion).where(
        (Conversacion.estado == "pensando") | ((Conversacion.turnos > 0) & (Conversacion.actualizada >= limite)))
        .order_by(Conversacion.actualizada.desc()).limit(20)).all()
    res = []
    for c in conv:
        v = s.get(Video, c.video_id) if c.video_id else None
        titulo = (v.titulo or v.carpeta) if v else "Tu canal (asistente)" if c.canal == chat.ASISTENTE else "Conversación"
        res.append(TurnoClaude(conversacion=c.id, video_id=c.video_id, titulo=titulo, estado=c.estado, desde=c.actualizada,
                               accion=chat.accion_actual(c.id) if c.estado == "pensando" else None))
    return res

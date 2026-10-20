"""Pantallas guiadas de un vídeo largo y de un Short.

Enfoque (fase B del largo, A del Short; app/fases_ui.py): estado, pedir enfoques a Claude, medirlos y elegir.
El resto de fases, por tramos (app/tramos.py)."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .. import chat, diario, fases_ui, guia, tramos
from ..db import sesion
from ..eventos import difusor
from ..modelos import Video
from ..sincronizar import _leer_json, carpeta_canal, contexto_guia, leer_estado, sincronizar_canal, carpeta_video
from .claude import Mensaje  # noqa: F401  (mismo tipo de error 409/422 que el chat)

router = APIRouter(prefix="/api/videos", tags=["fases-ui"])


def _contexto(s: Session, video_id: int, fase: str | None = None):
    v = s.get(Video, video_id)
    if not v:
        raise HTTPException(404, "Ese vídeo no existe")
    carpeta_c = carpeta_canal(v.canal)
    carpeta_v = carpeta_video(v)
    estado = guia._leer(carpeta_v / "estado.json")       # estricto: dañado → aviso, nunca «vacío»
    if fase == "enfoque":
        fase = fases_ui.FASE_ENFOQUE[v.tipo]
    if fase and estado.get("fase") != fase:
        raise HTTPException(409, f"Este vídeo ya no está en la fase {fase}")
    return v, carpeta_v, (_leer_json(carpeta_c / "canal.json") or {}), estado


def _trabajo(s: Session, video_id: int) -> dict:
    c = chat.conversacion_de_video(s, video_id)
    if not c:
        return {"estado": "libre", "accion": None, "conversacion": None}
    accion = chat.accion_actual(c.id) if c.estado == "pensando" else None
    return {"estado": c.estado, "accion": accion, "conversacion": c.id}


@router.get("/{video_id}/fase-b")
def ver_fase_b(video_id: int, s: Session = Depends(sesion)):
    v, carpeta_v, cfg, estado = _contexto(s, video_id)
    return {**fases_ui.estado_b(video_id, carpeta_v, cfg, estado, v.tipo), "fase": estado.get("fase"),
            "trabajo": _trabajo(s, video_id)}


class Proponer(BaseModel):
    otros: bool = False


@router.post("/{video_id}/fase-b/proponer")
async def proponer(video_id: int, datos: Proponer, s: Session = Depends(sesion)):
    """Encarga a Claude (sin abrir el chat) los enfoques; él escribe propuestas.json."""
    v, carpeta_v, _, estado = _contexto(s, video_id, "enfoque")
    c = chat.conversacion_de_video(s, video_id) or chat.nueva(s, v)
    if c.estado == "pensando":
        raise HTTPException(409, "Claude todavía está trabajando")
    try:
        mensaje = fases_ui.mensaje_proponer_short if v.tipo == "short" else fases_ui.mensaje_proponer
        await chat.enviar(c.id, mensaje(v.canal, v.carpeta, estado, datos.otros))
    except chat.ErrorChat as e:
        raise HTTPException(409 if "todavía" in str(e) else 422, str(e))
    return {"ok": True}


@router.post("/{video_id}/fase-b/medir")
async def medir(video_id: int, s: Session = Depends(sesion)):
    _, carpeta_v, _, _ = _contexto(s, video_id, "enfoque")
    return {"lanzadas": await fases_ui.medir_pendientes(video_id, carpeta_v)}


class Eleccion(BaseModel):
    propuesta: int
    minutos: int | None = None          # un Short no tiene duración que elegir


def _escribir(s: Session, video_id: int, accion):
    v, carpeta_v, _, _ = _contexto(s, video_id)
    try:
        accion(carpeta_v / "estado.json")
    except ValueError as e:
        raise HTTPException(422, str(e))
    sincronizar_canal(s, v.canal)
    difusor.publicar("cambio", canal=v.canal)
    return {"ok": True}


@router.post("/{video_id}/fase-b/elegir")
def elegir(video_id: int, datos: Eleccion, s: Session = Depends(sesion)):
    v, carpeta_v, _, _ = _contexto(s, video_id, "enfoque")
    propuestas, _ = fases_ui.leer_propuestas(carpeta_v)
    r = _escribir(s, video_id, lambda ruta: fases_ui.elegir(ruta, datos.propuesta, datos.minutos, v.tipo))
    p = next((x for x in propuestas if x["id"] == datos.propuesta), None)
    duracion = "" if v.tipo == "short" else f" de {datos.minutos} min"
    diario.anotar(v, "usuario", "eleccion", f"Has elegido el enfoque «{p['titulo'] if p else datos.propuesta}»{duracion}",
                  p and p.get("enfoque"))
    return r


@router.post("/{video_id}/fase-a/continuar")
def continuar_a(video_id: int, s: Session = Depends(sesion)):
    v, _, _, _ = _contexto(s, video_id, "A")
    if v.tipo == "short":
        raise HTTPException(422, "En un Short la fase A es elegir el enfoque")
    r = _escribir(s, video_id, fases_ui.continuar_a)
    diario.anotar(v, "usuario", "fase", "Todo listo: has pasado a elegir el tema")
    return r


# --- Fases por tramos (app/tramos.py): C a I del largo, B a E del Short ---------------------------------------------------------------

def _ctx(s: Session, video_id: int) -> tuple[tramos.Ctx, Video, Path]:
    v = s.scalars(select(Video).where(Video.id == video_id).options(selectinload(Video.escenas),
                                                                      selectinload(Video.imagenes))).first()
    if not v:
        raise HTTPException(404, "Ese vídeo no existe")
    g = contexto_guia(v)
    return tramos.Ctx(video=v, guia=g, cfg=_leer_json(g.carpeta_canal / "canal.json") or {}), v, g.carpeta


def _tramo(s: Session, video_id: int, tid: str) -> tramos.Tramo:
    v = s.get(Video, video_id)
    if not v:
        raise HTTPException(404, "Ese vídeo no existe")
    t = tramos.buscar(tid, v.tipo)
    if not t:
        raise HTTPException(404, "Ese tramo no existe")
    return t


@router.get("/{video_id}/fase/{letra}")
async def ver_fase(video_id: int, letra: str, revision: bool = False, s: Session = Depends(sesion)):
    ctx, v, carpeta_v = _ctx(s, video_id)
    if not tramos.tramos_de(letra, v.tipo):
        raise HTTPException(404, "Esa fase no tiene pantalla guiada")
    if letra == ("B" if v.tipo == "short" else "D") and (carpeta_v / "guion.json").exists():
        ctx.revisor = await tramos.revisar(carpeta_v, v.canal)
    return {**tramos.estado_fase(ctx, letra, False, revision), "fase": ctx.estado.get("fase"), "trabajo": _trabajo(s, video_id)}


class Producir(BaseModel):
    cambios: str | None = None


async def _encargar(s: Session, v: Video, t: tramos.Tramo, ctx: tramos.Ctx, cambios: str | None):
    ctx.video.fase = ctx.estado.get("fase")
    c = chat.conversacion_de_video(s, v.id) or chat.nueva(s, v)
    if c.estado == "pensando":
        raise HTTPException(409, "Claude todavía está trabajando")
    try:
        await chat.enviar(c.id, t.mensaje(ctx, cambios))
    except chat.ErrorChat as e:
        raise HTTPException(409 if "todavía" in str(e) else 422, str(e))


@router.post("/{video_id}/tramo/{tid}/producir")
async def producir(video_id: int, tid: str, datos: Producir, s: Session = Depends(sesion)):
    ctx, v, _ = _ctx(s, video_id)
    t = _tramo(s, video_id, tid)
    if not t.mensaje:
        raise HTTPException(422, "Este tramo no se encarga a Claude")
    if ctx.estado.get("fase") != t.fase and t.fase not in (ctx.estado.get("completadas") or []):
        raise HTTPException(409, f"Este vídeo todavía no ha llegado a la fase {t.fase}")
    await _encargar(s, v, t, ctx, (datos.cambios or "").strip()[:2000] or None)
    return {"ok": True}


class EleccionTramo(BaseModel):
    eleccion: int | None = None


def _accion(s: Session, video_id: int, hacer):
    ctx, v, carpeta_v = _ctx(s, video_id)
    try:
        hacer(carpeta_v / "estado.json", ctx)
    except ValueError as e:
        raise HTTPException(422, str(e))
    sincronizar_canal(s, v.canal)
    difusor.publicar("cambio", canal=v.canal)
    return {"ok": True}


@router.post("/{video_id}/tramo/{tid}/aprobar")
def aprobar_tramo(video_id: int, tid: str, datos: EleccionTramo, s: Session = Depends(sesion)):
    t = _tramo(s, video_id, tid)
    if not t.aprobacion:
        raise HTTPException(422, "Este tramo no se aprueba")
    r = _accion(s, video_id, lambda ruta, ctx: tramos.aprobar_tramo(ruta, ctx.video.tipo, t, ctx, datos.eleccion))
    v, carpeta_v, _, estado = _contexto(s, video_id)
    apr = leer_estado(carpeta_v).get("aprobaciones", {}).get(t.aprobacion, {})
    diario.anotar(v, "usuario", "aprobacion", f"Has aprobado «{t.titulo}»", apr.get("comentario"))
    return r


class CambiosTramo(BaseModel):
    texto: str


@router.post("/{video_id}/tramo/{tid}/cambios")
async def cambios_tramo(video_id: int, tid: str, datos: CambiosTramo, s: Session = Depends(sesion)):
    """Anota los cambios (como en la guía) y encarga a Claude aplicarlos en segundo plano."""
    t = _tramo(s, video_id, tid)
    texto = " ".join(datos.texto.split())[:2000]
    if not texto:
        raise HTTPException(422, "Escribe qué quieres cambiar")
    _accion(s, video_id, lambda ruta, ctx: tramos.pedir_cambios_tramo(ruta, ctx.video.tipo, t, texto))
    ctx, v, _ = _ctx(s, video_id)
    diario.anotar(v, "usuario", "cambios", f"Has pedido cambios en «{t.titulo}»", texto)
    if t.mensaje:
        await _encargar(s, v, t, ctx, texto)
    else:
        ctx.video.fase = ctx.estado.get("fase")
        c = chat.conversacion_de_video(s, v.id) or chat.nueva(s, v)
        if c.estado == "pensando":
            raise HTTPException(409, "Claude todavía está trabajando")
        await chat.enviar(c.id, tramos.msg_cambios(ctx, t, texto))
    return {"ok": True}


@router.post("/{video_id}/tramo/{tid}/completar")
def completar_tramo(video_id: int, tid: str, s: Session = Depends(sesion)):
    t = _tramo(s, video_id, tid)
    r = _accion(s, video_id, lambda ruta, ctx: tramos.completar_tramo(ruta, ctx.video.tipo, t, ctx))
    diario.anotar(s.get(Video, video_id), "usuario", "fase", f"Has marcado como hecho «{t.titulo}»")
    return r


@router.post("/{video_id}/fase/{letra}/cerrar")
def cerrar_fase(video_id: int, letra: str, s: Session = Depends(sesion)):
    """Pasa a la fase siguiente cuando todos los tramos de la fase están hechos."""
    def hacer(ruta, ctx):
        est = tramos.estado_fase(ctx, letra, False)
        if ctx.estado.get("fase") != letra or not est["completa"]:
            raise ValueError("La fase todavía tiene algo por hacer")
        tramos.cerrar_fase(ruta, ctx.video.tipo, letra)
    r = _accion(s, video_id, hacer)
    diario.anotar(s.get(Video, video_id), "usuario", "fase", f"Has dado por terminada la fase {letra}")
    return r


# --- Fase J: publicación y resultados ----------------------------------------------------------------

class Publicacion(BaseModel):
    url: str
    fecha: str


@router.post("/{video_id}/publicacion")
def registrar_publicacion(video_id: int, datos: Publicacion, s: Session = Depends(sesion)):
    r = _accion(s, video_id, lambda ruta, ctx: tramos.registrar_publicacion(ruta, "largo", ctx, datos.url, datos.fecha))
    diario.anotar(s.get(Video, video_id), "usuario", "publicacion", "Has registrado la publicación en YouTube", datos.url)
    return r


class Metricas(BaseModel):
    visitas: float | None = None
    ctr: float | None = None
    retencion: float | None = None
    impresiones: float | None = None
    horas_vistas: float | None = None
    suscriptores: float | None = None
    notas: str | None = None


@router.post("/{video_id}/metricas/{momento}")
def registrar_metricas(video_id: int, momento: str, datos: Metricas, s: Session = Depends(sesion)):
    r = _accion(s, video_id, lambda ruta, ctx: tramos.registrar_metricas(ruta, "largo", ctx, momento, datos.model_dump()))
    diario.anotar(s.get(Video, video_id), "usuario", "metricas", f"Has registrado los resultados de {momento}",
                  f"Visitas {datos.visitas}, CTR {datos.ctr} %, retención {datos.retencion} %")
    return r

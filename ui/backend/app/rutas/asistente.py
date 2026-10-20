"""Asistente «desde cero» (app/asistente.py): estado de los pasos y chat con Claude para crear el canal."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

import canal as kit_canal

from .. import asistente, canal_cierre, canal_guiado, chat, config, referencias_estilo
from ..db import sesion
from ..modelos import Tarea, Video
from .claude import ChatOut, ConversacionOut, Mensaje
from .videos import _recibir

router = APIRouter(prefix="/api/asistente", tags=["asistente"])


@router.get("")
def ver_estado(s: Session = Depends(sesion)):
    activo = kit_canal.ACTIVO.read_text(encoding="utf-8").strip() if kit_canal.ACTIVO.exists() else ""
    videos = s.scalars(select(Video).where(Video.canal == activo)).all() if activo else []
    return asistente.estado(videos, {v.id: v.estado_real or {} for v in videos})


@router.get("/guia-subida")
def guia_subida():
    """El texto de docs/guia_subida.md (el paso «Publicarlo»)."""
    f = config.KIT / "docs" / "guia_subida.md"
    return {"texto": f.read_text(encoding="utf-8") if f.exists() else ""}


@router.get("/claude", response_model=ChatOut)
def ver_chat(s: Session = Depends(sesion)):
    c = chat.conversacion_de_asistente(s)
    return {"conversacion": c, "entradas": chat.leer(c.id) if c else []}


@router.post("/claude", response_model=ConversacionOut)
async def enviar(datos: Mensaje, s: Session = Depends(sesion)):
    c = chat.conversacion_de_asistente(s)
    if c and datos.nueva and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando: páralo antes de empezar otra conversación")
    if not c or datos.nueva:
        c = chat.nueva_asistente(s)
    if datos.canal and not (kit_canal.CANALES / datos.canal).is_dir():
        raise HTTPException(422, "Ese canal no existe")
    try:
        await chat.enviar(c.id, datos.mensaje, canal_forzado=datos.canal)
    except chat.ErrorChat as e:
        raise HTTPException(409 if "todavía" in str(e) else 422, str(e))
    s.refresh(c)
    return c


# --------------------------------------------------------------------------- crear el canal paso a paso

def _trabajo(s: Session) -> dict:
    c = chat.conversacion_de_asistente(s)
    if not c:
        return {"estado": "libre", "accion": None, "conversacion": None}
    accion = chat.accion_amable(c.id) if c.estado == "pensando" else None
    return {"estado": c.estado, "accion": accion, "conversacion": c.id}


def _tarea_del_paso(s: Session, creacion: dict | None) -> dict | None:
    """La última tarea del paso actual (p. ej. las imágenes de los estilos), para enseñar su barra o su error."""
    herramientas = {"D": ("estilo_canal",), "E": ("voz_canal", "voz_canal_ai33"),
                                                             "F": ("marca_canal",), "I": ("marca_alta",),
                                                             "K": ("probar_kit",)}.get((creacion or {}).get("fase"))
    if not herramientas or not (creacion or {}).get("carpeta"):
        return None
    t = s.scalars(select(Tarea).where(Tarea.herramienta.in_(herramientas), Tarea.canal == creacion["slug"])
                  .order_by(Tarea.id.desc()).limit(1)).first()
    return {"id": t.id, "estado": t.estado, "herramienta": t.herramienta} if t else None


@router.get("/canal")
def ver_canal(s: Session = Depends(sesion)):
    """Los 11 pasos de la creación y, en el paso actual si tiene pantalla (mercado, concepto, nombre, estilo, voz), sus
    propuestas."""
    creacion = asistente.canal_en_creacion()
    return {**canal_guiado.estado(creacion), "trabajo": _trabajo(s), "tarea": _tarea_del_paso(s, creacion)}


class Proponer(BaseModel):
    intereses: str = Field("", max_length=600)
    otros: bool = False


async def _encargar(s: Session, mensaje: str):
    """Un turno «MODO UI» para Claude en la conversación del asistente (sin abrir el chat)."""
    c = chat.conversacion_de_asistente(s) or chat.nueva_asistente(s)
    if c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")
    try:
        await chat.enviar(c.id, mensaje)
    except chat.ErrorChat as e:
        raise HTTPException(409 if "todavía" in str(e) else 422, str(e))


def _en_paso(fase: str, nombre: str) -> dict | None:
    creacion = asistente.canal_en_creacion()
    try:
        canal_guiado.en_paso(creacion, fase, nombre)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return creacion


@router.post("/canal/mercado/proponer")
async def proponer_nichos(datos: Proponer, s: Session = Depends(sesion)):
    """Encarga a Claude (sin abrir el chat) los nichos; él escribe analisis/mercado/nichos_propuestos.json."""
    creacion = asistente.canal_en_creacion()
    try:
        canal_guiado.puede_proponer(creacion)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if (c := chat.conversacion_de_asistente(s)) and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")
    intereses = " ".join(datos.intereses.split())
    canal_guiado.guardar_intereses(intereses)
    await _encargar(s, canal_guiado.mensaje_proponer(intereses, datos.otros, creacion))
    return {"ok": True}


@router.post("/canal/mercado/medir")
async def medir_nichos():
    return {"lanzadas": await canal_guiado.medir_pendientes()}


class Eleccion(BaseModel):
    propuesta: int


@router.post("/canal/mercado/elegir")
def elegir_nicho(datos: Eleccion):
    try:
        canal_guiado.elegir(datos.propuesta)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


class AjusteEstilo(BaseModel):
    comentario: str = Field("", max_length=600)


class Indicaciones(BaseModel):
    indicaciones: str = Field("", max_length=600)
    otros: bool = False


@router.post("/canal/concepto/proponer")
async def proponer_conceptos(datos: Indicaciones, s: Session = Depends(sesion)):
    """Encarga a Claude 2-3 conceptos para el tema elegido (analisis/mercado/conceptos_propuestos.json)."""
    creacion = _en_paso("B", "Concepto")
    if (c := chat.conversacion_de_asistente(s)) and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")
    texto = " ".join(datos.indicaciones.split())
    canal_guiado.guardar_indicaciones("indicaciones_concepto", texto)
    await _encargar(s, canal_guiado.mensaje_concepto(texto, datos.otros, creacion))
    return {"ok": True}


@router.post("/canal/concepto/elegir")
def elegir_concepto(datos: Eleccion):
    """Crea la carpeta del canal con el nombre provisional y pasa al nombre."""
    try:
        return {"ok": True, "slug": canal_guiado.elegir_concepto(datos.propuesta)}
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/canal/nombre/proponer")
async def proponer_nombres(datos: Indicaciones, s: Session = Depends(sesion)):
    """Encarga a Claude 6-8 nombres (y que rellene docs/concepto.md con el concepto elegido)."""
    creacion = _en_paso("C", "Nombre")
    if (c := chat.conversacion_de_asistente(s)) and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")
    texto = " ".join(datos.indicaciones.split())
    canal_guiado.guardar_indicaciones("indicaciones_nombre", texto)
    await _encargar(s, canal_guiado.mensaje_nombres(texto, datos.otros, creacion))
    return {"ok": True}


class NombrePropio(BaseModel):
    nombre: str = Field(..., max_length=60)
    arroba: str | None = Field(None, max_length=40)


@router.post("/canal/nombre/anadir")
async def anadir_nombre(datos: NombrePropio):
    """Un nombre del usuario: se guarda y se mide como los de Claude."""
    try:
        ident = canal_guiado.anadir_nombre(datos.nombre, datos.arroba)
    except ValueError as e:
        raise HTTPException(422, str(e))
    await canal_guiado.medir_pendientes("nombres")
    return {"ok": True, "id": ident}


@router.post("/canal/nombre/medir")
async def medir_nombres():
    return {"lanzadas": await canal_guiado.medir_pendientes("nombres")}


@router.post("/canal/nombre/elegir")
def elegir_nombre(datos: Eleccion):
    """Renombra el canal con el nombre elegido y pasa al estilo visual."""
    try:
        return {"ok": True, "slug": canal_guiado.elegir_nombre(datos.propuesta)}
    except ValueError as e:
        raise HTTPException(409, str(e))


class DireccionReferencia(BaseModel):
    direccion: str = Field(..., max_length=2000)


def _carpeta_estilo(creacion: dict):
    return canal_guiado.carpeta_pruebas(creacion, "estilo")


def _referencias_ahora(creacion: dict) -> dict:
    return {"referencias": canal_guiado.referencias_del_estilo(creacion)}


@router.put("/canal/estilo/referencia")
async def subir_referencia(request: Request):
    """Imagen de referencia del estilo (el archivo, tal cual, en el cuerpo): las pruebas se pintan parecidas a ella. Gratis."""
    creacion = _en_paso("D", "Estilo visual")
    estilo = _carpeta_estilo(creacion)
    parcial = estilo / "referencias" / "subida.part"
    try:
        await _recibir(request, parcial, referencias_estilo.MAX_BYTES, "La imagen")
        try:
            await asyncio.to_thread(referencias_estilo.guardar, estilo, parcial)
        except referencias_estilo.ErrorReferencia as e:
            raise HTTPException(422, str(e))
    finally:
        parcial.unlink(missing_ok=True)
    return _referencias_ahora(creacion)


@router.post("/canal/estilo/referencia")
async def referencia_por_direccion(datos: DireccionReferencia):
    """Lo mismo, bajando la imagen de una dirección de internet."""
    creacion = _en_paso("D", "Estilo visual")
    estilo = _carpeta_estilo(creacion)
    parcial = estilo / "referencias" / "descarga.part"
    try:
        try:
            await asyncio.to_thread(referencias_estilo.descargar, datos.direccion, parcial)
            await asyncio.to_thread(referencias_estilo.guardar, estilo, parcial)
        except referencias_estilo.ErrorReferencia as e:
            raise HTTPException(422, str(e))
    finally:
        parcial.unlink(missing_ok=True)
    return _referencias_ahora(creacion)


class NotaReferencia(BaseModel):
    descripcion: str = Field("", max_length=2000)


@router.put("/canal/estilo/referencia/{nombre}/descripcion")
def describir_referencia(nombre: str, datos: NotaReferencia):
    """Lo que el usuario quiere de esa imagen de referencia (se le pasa a Claude al pedir estilos). Vacía = sin descripción."""
    creacion = _en_paso("D", "Estilo visual")
    try:
        referencias_estilo.anotar(_carpeta_estilo(creacion), nombre, datos.descripcion)
    except referencias_estilo.ErrorReferencia as e:
        raise HTTPException(404, str(e))
    return _referencias_ahora(creacion)


@router.delete("/canal/estilo/referencia/{nombre}")
def quitar_referencia(nombre: str):
    creacion = _en_paso("D", "Estilo visual")
    try:
        referencias_estilo.quitar(_carpeta_estilo(creacion), nombre)
    except referencias_estilo.ErrorReferencia as e:
        raise HTTPException(404, str(e))
    return _referencias_ahora(creacion)


@router.post("/canal/estilo/proponer")
async def proponer_estilos(datos: Indicaciones, s: Session = Depends(sesion)):
    """Encarga a Claude escenas y estilos (<canal>/videos/_pruebas/estilo/prueba.json); con `otros`, una tanda más."""
    creacion = _en_paso("D", "Estilo visual")
    if (c := chat.conversacion_de_asistente(s)) and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")
    texto = " ".join(datos.indicaciones.split())
    canal_guiado.guardar_indicaciones("indicaciones_estilo", texto)
    await _encargar(s, canal_guiado.mensaje_estilo(texto, datos.otros, creacion))
    return {"ok": True}


@router.post("/canal/estilo/{estilo}/ajustar")
async def ajustar_estilo(estilo: str, datos: AjusteEstilo, s: Session = Depends(sesion)):
    """Encarga a Claude corregir el prompt de UN estilo mirando sus imágenes (hechas o subidas) frente a la referencia."""
    creacion = _en_paso("D", "Estilo visual")
    _sin_imagenes_en_marcha(s, creacion)
    prueba, _ = canal_guiado.leer_estilos(creacion)
    if not any(x["id"] == estilo for x in (prueba or {}).get("estilos", [])):
        raise HTTPException(404, "Ese estilo no existe")
    await _encargar(s, canal_guiado.mensaje_ajuste(estilo, " ".join(datos.comentario.split()), creacion))
    return {"ok": True}


def _sin_imagenes_en_marcha(s: Session, creacion: dict):
    t = _tarea_del_paso(s, creacion)
    if t and t["estado"] in ("en_cola", "en_curso"):
        raise HTTPException(409, "Espera a que acaben de hacerse las imágenes")
    if (c := chat.conversacion_de_asistente(s)) and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")


@router.delete("/canal/estilos")
def empezar_estilos_de_cero(s: Session = Depends(sesion)):
    """Quita todos los estilos probados para empezar de cero (también las imágenes de referencia)."""
    creacion = _en_paso("D", "Estilo visual")
    _sin_imagenes_en_marcha(s, creacion)
    canal_guiado.empezar_estilos_de_cero(creacion)
    return {"ok": True}


@router.delete("/canal/estilo/{estilo}")
def quitar_estilo(estilo: str, s: Session = Depends(sesion)):
    """Quita un estilo que no gusta, con sus imágenes."""
    creacion = _en_paso("D", "Estilo visual")
    _sin_imagenes_en_marcha(s, creacion)
    try:
        canal_guiado.quitar_estilo(creacion, estilo)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True}


@router.put("/canal/estilo/{estilo}/imagen/{escena}")
async def subir_imagen_de_estilo(estilo: str, escena: str, request: Request, s: Session = Depends(sesion)):
    """Imagen hecha por el usuario con otra herramienta a partir del texto de esa escena (el archivo, en el cuerpo). Gratis."""
    creacion = _en_paso("D", "Estilo visual")
    _sin_imagenes_en_marcha(s, creacion)
    carpeta = _carpeta_estilo(creacion)
    parcial = carpeta / f"subida_{estilo[:40]}.part"
    try:
        await _recibir(request, parcial, referencias_estilo.MAX_BYTES, "La imagen")
        try:
            await asyncio.to_thread(canal_guiado.guardar_imagen_propia, creacion, estilo, escena, parcial)
        except ValueError as e:
            raise HTTPException(422, str(e))
    finally:
        parcial.unlink(missing_ok=True)
    return {"ok": True}


class EleccionEstilo(BaseModel):
    estilo: str = Field(..., max_length=40)


@router.post("/canal/estilo/elegir")
def elegir_estilo(datos: EleccionEstilo):
    """Escribe el estilo y sus paletas en canal.json y pasa a la voz."""
    try:
        return {"ok": True, "estilo": canal_guiado.elegir_estilo(datos.estilo)}
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/canal/voz/proponer")
async def proponer_voces(datos: Indicaciones, s: Session = Depends(sesion)):
    """Encarga a Claude un párrafo y voces (<canal>/videos/_pruebas/voz/prueba.json); con `otros`, unas voces más."""
    creacion = _en_paso("E", "Voz")
    if (c := chat.conversacion_de_asistente(s)) and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")
    texto = " ".join(datos.indicaciones.split())
    canal_guiado.guardar_indicaciones("indicaciones_voz", texto)
    await _encargar(s, canal_guiado.mensaje_voz(texto, datos.otros, creacion))
    return {"ok": True}


class EleccionVoz(BaseModel):
    voz: str = Field(..., max_length=40)


@router.post("/canal/voz/elegir")
def elegir_voz(datos: EleccionVoz):
    """Escribe la voz en canal.json y en el concepto y pasa a la marca."""
    try:
        return {"ok": True, "voz": canal_guiado.elegir_voz(datos.voz)}
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/canal/marca/proponer")
async def proponer_marca(datos: Indicaciones, s: Session = Depends(sesion)):
    """Encarga a Claude combinaciones de tipografía, colores y música (<canal>/videos/_pruebas/marca/prueba.json)."""
    creacion = _en_paso("F", "Marca")
    if (c := chat.conversacion_de_asistente(s)) and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")
    texto = " ".join(datos.indicaciones.split())
    canal_guiado.guardar_indicaciones("indicaciones_marca", texto)
    await _encargar(s, canal_guiado.mensaje_marca(texto, datos.otros, creacion))
    return {"ok": True}


class EleccionMarca(BaseModel):
    marca: str = Field(..., max_length=40)


@router.post("/canal/marca/elegir")
def elegir_marca(datos: EleccionMarca):
    """Escribe tipografía, colores, música y textos de marca en canal.json y pasa a las reglas."""
    try:
        return {"ok": True, "marca": canal_guiado.elegir_marca(datos.marca)}
    except ValueError as e:
        raise HTTPException(409, str(e))


# --------------------------------------------------------------------------- pasos 7-11 (canal_cierre.py)

async def _proponer(s: Session, fase: str, nombre: str, clave: str, mensaje, datos: Indicaciones):
    creacion = _en_paso(fase, nombre)
    if (c := chat.conversacion_de_asistente(s)) and c.estado == "pensando":
        raise HTTPException(409, "El asistente todavía está trabajando")
    texto = " ".join(datos.indicaciones.split())
    canal_guiado.guardar_indicaciones(clave, texto)
    await _encargar(s, mensaje(texto, datos.otros, creacion))
    return {"ok": True}


def _aprobar(funcion, *args):
    try:
        return {"ok": True, "resultado": funcion(*args)}
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/canal/reglas/proponer")
async def proponer_reglas(datos: Indicaciones, s: Session = Depends(sesion)):
    return await _proponer(s, "G", "Reglas", "indicaciones_reglas", canal_cierre.mensaje_reglas, datos)


class EleccionReglas(BaseModel):
    sintetico: bool
    afiliacion: bool


@router.post("/canal/reglas/elegir")
def elegir_reglas(datos: EleccionReglas):
    return _aprobar(canal_cierre.elegir_reglas, datos.sintetico, datos.afiliacion)


@router.post("/canal/equipo/proponer")
async def proponer_equipo(datos: Indicaciones, s: Session = Depends(sesion)):
    return await _proponer(s, "H", "Especialistas", "indicaciones_equipo", canal_cierre.mensaje_equipo, datos)


class EleccionEquipo(BaseModel):
    opcionales: list[str] = Field(default_factory=list, max_length=6)


@router.post("/canal/equipo/elegir")
def elegir_equipo(datos: EleccionEquipo):
    return _aprobar(canal_cierre.elegir_equipo, datos.opcionales)


@router.post("/canal/alta/proponer")
async def proponer_alta(datos: Indicaciones, s: Session = Depends(sesion)):
    return await _proponer(s, "I", "Marca y alta", "indicaciones_alta", canal_cierre.mensaje_alta, datos)


class DireccionCanal(BaseModel):
    url: str = Field(..., max_length=200)


@router.post("/canal/alta/confirmar")
async def confirmar_alta(datos: DireccionCanal):
    try:
        return {"ok": True, "resultado": await canal_cierre.confirmar_alta(datos.url)}
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/canal/alta/saltar")
def saltar_alta():
    return _aprobar(canal_cierre.saltar_alta)


@router.post("/canal/ideas/proponer")
async def proponer_ideas(datos: Indicaciones, s: Session = Depends(sesion)):
    return await _proponer(s, "J", "Ideas", "indicaciones_ideas", canal_cierre.mensaje_ideas, datos)


@router.post("/canal/ideas/medir")
async def medir_ideas():
    _en_paso("J", "Ideas")
    return {"lanzadas": await canal_guiado.medir_pendientes("ideas")}


class EleccionIdeas(BaseModel):
    candidata: int
    descartadas: list[int] = Field(default_factory=list, max_length=30)


@router.post("/canal/ideas/elegir")
def elegir_ideas(datos: EleccionIdeas):
    return _aprobar(canal_cierre.elegir_ideas, datos.candidata, datos.descartadas)


@router.post("/canal/cierre/proponer")
async def proponer_cierre(datos: Indicaciones, s: Session = Depends(sesion)):
    return await _proponer(s, "K", "Prueba y cierre", "indicaciones_cierre", canal_cierre.mensaje_cierre, datos)


class Cierre(BaseModel):
    activar: bool = False


@router.post("/canal/cierre/terminar")
def terminar(datos: Cierre, s: Session = Depends(sesion)):
    creacion = asistente.canal_en_creacion()
    t = s.scalars(select(Tarea).where(Tarea.herramienta == "probar_kit",
                                      Tarea.canal == (creacion or {}).get("slug"))
                  .order_by(Tarea.id.desc()).limit(1)).first()
    return _aprobar(canal_cierre.terminar, datos.activar, bool(t and t.estado == "hecha"))

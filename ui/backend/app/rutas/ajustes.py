"""Ajustes: claves de los servicios (.env), presupuesto por vídeo y gasto de cada vídeo.
Las claves se escriben desde aquí (en local, sin pasar por ningún chat) y NUNCA se devuelven: solo si están rellenas."""

import re
import platform
import shutil
import sys

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import asistente, config, gasto, probar_claves
from ..db import sesion

import motor_ia  # noqa: E402  (herramientas/, en sys.path por config)
import archivos  # noqa: E402
import copia  # noqa: E402
import espacio  # noqa: E402
import proveedores  # noqa: E402
import servicios  # noqa: E402
import simulacion  # noqa: E402

router = APIRouter(prefix="/api", tags=["ajustes"])

# Solo se pueden escribir las claves de los servicios del catálogo y de los conectores válidos (herramientas/servicios.py).
VALOR_OK = re.compile(r"^[\w\-.:/=+@]{1,300}$")


def _env_texto() -> str:
    try:
        return (config.RAIZ / ".env").read_text(encoding="utf-8")
    except OSError:
        return ""


@router.get("/ajustes")
def ver():
    ajustes = gasto.leer_ajustes()
    return {
        "entorno": [
            {"texto": "Sistema", "valor": f"{platform.system()} {platform.machine()}"},
            {"texto": "Python", "valor": sys.version.split()[0]},
            {"texto": "ffmpeg", "valor": "instalado" if shutil.which("ffmpeg") else "falta"},
            {"texto": "yt-dlp", "valor": "instalado" if shutil.which("yt-dlp") else "falta"},
        ],
        "espacio": espacio.estado(),
        "tope_euros_video": ajustes.get("tope_euros_video"),
        "sin_gasto": bool(ajustes.get("sin_gasto")),
        "sin_gasto_activo": simulacion.activa(),           # también si lo fuerza el entorno (pruebas)
    }


class Clave(BaseModel):
    clave: str
    valor: str


@router.put("/ajustes/clave")
def guardar_clave(c: Clave):
    if c.clave not in servicios.claves_permitidas():
        raise HTTPException(422, "Esa clave no se puede cambiar desde aquí")
    valor = c.valor.strip()
    if valor and not VALOR_OK.match(valor):
        raise HTTPException(422, "El valor tiene caracteres no válidos (solo letras, números y - _ . : / = + @)")
    lineas = _env_texto().splitlines()
    patron = re.compile(rf"^\s*{re.escape(c.clave)}\s*=")
    nueva = f"{c.clave}={valor}"
    if any(patron.match(l) for l in lineas):
        lineas = [nueva if patron.match(l) else l for l in lineas]
    else:
        lineas.append(nueva)
    # Atómico y con permisos 600 desde el primer byte: un corte a mitad no deja el .env truncado (sin claves)
    archivos.escribir_texto(config.RAIZ / ".env", "\n".join(lineas) + "\n", permisos=0o600)
    return {"ok": True, "rellena": bool(valor)}


def _servicios():
    return {"servicios": asistente.lista_servicios(), "capacidades": servicios.CAPACIDADES,
            "resumen": servicios.resumen(config.RAIZ / ".env")}


@router.get("/servicios")
def ver_servicios():
    """Los servicios que se pueden usar, si el usuario los usa y si están conectados (nunca las claves). Ninguno es
    obligatorio: lo que no cubra ninguno se hace subiendo lo propio."""
    return _servicios()


class Eleccion(BaseModel):
    activo: bool


@router.put("/servicios/{sid}")
def elegir_servicio(sid: str, e: Eleccion):
    if sid not in servicios.catalogo():
        raise HTTPException(404, "Servicio desconocido")
    elegidos = {**servicios.elecciones(), sid: e.activo}
    gasto.guardar_ajustes({"servicios": elegidos})
    return _servicios()


@router.post("/ajustes/probar/{servicio}")
def probar_servicio(servicio: str):
    """Comprueba la clave de un servicio con una llamada gratuita (nunca genera nada ni gasta créditos)."""
    try:
        return probar_claves.probar(servicio)
    except KeyError:
        raise HTTPException(404, "Servicio desconocido")


@router.get("/ajustes/proveedores")
def ver_proveedores():
    """Límites y precios de los proveedores (de fábrica y los cambiados por el usuario)."""
    return proveedores.todos()


class ValorProveedor(BaseModel):
    clave: str
    valor: float | None = None        # None = volver al de fábrica


@router.put("/ajustes/proveedores")
def guardar_proveedor(v: ValorProveedor):
    if v.clave not in proveedores.VALORES:
        raise HTTPException(422, "Ese límite o precio no existe")
    propios = dict(gasto.leer_ajustes().get("proveedores") or {})
    if v.valor is None:
        propios.pop(v.clave, None)
    else:
        n = proveedores.valor_valido(v.valor)
        if n is None:
            raise HTTPException(422, "Escribe un número mayor que 0")
        propios[v.clave] = n
    gasto.guardar_ajustes({"proveedores": propios})
    return proveedores.todos()


class Presupuesto(BaseModel):
    tope_euros_video: float | None = None


@router.put("/ajustes/presupuesto")
def guardar_presupuesto(p: Presupuesto):
    if p.tope_euros_video is not None and not (0 < p.tope_euros_video <= 1000):
        raise HTTPException(422, "El tope debe estar entre 0 y 1.000 €")
    return gasto.guardar_ajustes({"tope_euros_video": p.tope_euros_video})


@router.get("/videos/{video_id}/gasto")
def gasto_video(video_id: int, s: Session = Depends(sesion)):
    from .tareas import _cuotas
    tarifa = ((_cuotas.get("datos") or {}).get("ai33") or {}).get("euros_por_millon")
    return gasto.resumen_video(s, video_id, tarifa)


# --- Motor de IA (herramientas/motor_ia.py) ----------------------------------------------------------

@router.get("/ia/salud")
def ia_salud():
    """Qué IA se usa, si está disponible y cómo contestó la última vez (ok, cupo, sesion, tiempo, error)."""
    return motor_ia.salud()


@router.get("/ia/conexion")
def ia_conexion():
    """Pasos para conectar Claude: instalado, con sesión y con qué cuenta. No llama al modelo (no gasta cupo)."""
    return motor_ia.conexion()


@router.post("/ia/probar")
def ia_probar():
    """La llamada mínima (modelo más barato, una palabra). No gasta nada que importe; actualiza la salud."""
    r = motor_ia.probar()
    return {**r, "salud": motor_ia.salud()}


class PerfilIA(BaseModel):
    modelo: str | None = None
    esfuerzo: str | None = None


class AjustesIA(BaseModel):
    modo: str | None = None
    perfiles: dict[str, PerfilIA] | None = None


@router.put("/ajustes/ia")
def guardar_ia(a: AjustesIA):
    """Modo (suscripción o API) y modelo/esfuerzo por uso. Valida antes de guardar; lo no enviado no se toca."""
    actual = gasto.leer_ajustes().get("motor_ia")
    actual = dict(actual) if isinstance(actual, dict) else {}
    try:
        if a.modo is not None:
            if a.modo not in ("suscripcion", "api"):
                raise ValueError("Elige un modo: suscripción o pago por uso")
            actual["modo"] = a.modo
        perfiles = dict(actual.get("perfiles") or {})
        for uso, p in (a.perfiles or {}).items():
            if uso not in motor_ia.PERFILES or uso == "prueba":
                raise ValueError(f"Uso desconocido: {uso}")
            nuevo = dict(perfiles.get(uso) or {})
            if p.modelo:
                nuevo["modelo"] = motor_ia.modelo_valido(p.modelo)
            if p.esfuerzo:
                nuevo["esfuerzo"] = motor_ia.esfuerzo_valido(p.esfuerzo)
            perfiles[uso] = nuevo
        actual["perfiles"] = perfiles
    except ValueError as e:
        raise HTTPException(422, str(e))
    gasto.guardar_ajustes({"motor_ia": actual})
    return motor_ia.salud()


class SinGasto(BaseModel):
    activo: bool


@router.put("/ajustes/sin-gasto")
def guardar_sin_gasto(d: SinGasto):
    """Interruptor del «Modo sin gasto»: con él ninguna herramienta envía nada de pago a ai33 (voz, imágenes ni música)."""
    gasto.guardar_ajustes({"sin_gasto": d.activo})
    return {"sin_gasto": d.activo, "sin_gasto_activo": simulacion.activa()}


class DestinoCopia(BaseModel):
    destino: str


@router.get("/ajustes/copia")
def ver_copia():
    """Copia de seguridad: carpeta elegida, si está conectada, la última copia y si toca avisar (nunca o > 7 días)."""
    return copia.estado(destino=(gasto.leer_ajustes().get("copia") or {}).get("destino") or "")


@router.put("/ajustes/copia")
def guardar_copia(d: DestinoCopia):
    """Carpeta donde guardar la copia. Tiene que existir (si es un disco, conectado) y no estar dentro del espacio ni del kit."""
    try:
        destino = copia.validar_destino(d.destino)
    except copia.ErrorCopia as e:
        raise HTTPException(400, str(e))
    gasto.guardar_ajustes({"copia": {**(gasto.leer_ajustes().get("copia") or {}), "destino": str(destino)}})
    return copia.estado(destino=str(destino))

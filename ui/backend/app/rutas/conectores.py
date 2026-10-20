"""Conectar un servicio (plan 8b-A): el usuario describe un servicio de IA en `data/proveedores/<id>.json` (herramientas/
conector_ia.py), con su formulario o dejando que Claude lo redacte a partir de la documentación del servicio. La clave se guarda
aparte (PUT /api/ajustes/clave) y nunca se devuelve. Una prueba de un conector de pago exige aceptar su coste."""

import asyncio
import json
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config

import archivos  # noqa: E402  (herramientas/, en sys.path por config)
import conector_ia  # noqa: E402
import motor_ia  # noqa: E402
import servicios  # noqa: E402

router = APIRouter(prefix="/api", tags=["conectores"])

#: Qué datos lleva la solicitud de cada capacidad en la prueba (los `{dato}` de la descripción).
DATOS_PRUEBA = {"imagen": {"prompt": "a small red circle on white background, flat, no text", "ancho": 512, "alto": 512, "n": 1},
                "voz": {"texto": "Hola, esto es una prueba.", "voz": "default"},
                "musica": {"prompt": "calm short ambient loop"}}


def _ver(spec: dict) -> dict:
    """Lo que enseña la pantalla de un conector: su descripción (sin claves: solo el NOMBRE de la variable) y su estado."""
    return {**spec, "de_pago": conector_ia.de_pago(spec),
            "clave_rellena": bool(spec.get("clave_env") and servicios.claves_rellenas().get(spec["clave_env"])),
            "datos_prueba": DATOS_PRUEBA.get(servicios.CAPACIDADES_CONECTOR.get(spec["capacidad"], spec["capacidad"]), {})}


@router.get("/conectores")
def listar():
    return {"conectores": conector_ia.listar(), "capacidades": servicios.CAPACIDADES,
            "reservados": sorted(servicios.CATALOGO)}


@router.get("/conectores/{sid}")
def ver(sid: str):
    try:
        return _ver(conector_ia.cargar(sid))
    except conector_ia.ErrorConector as e:
        raise HTTPException(404, str(e))


class Descripcion(BaseModel):
    spec: dict


def _comprobar(spec: dict) -> list[str]:
    problemas = conector_ia.validar(spec)
    if not problemas and spec["id"] in servicios.CATALOGO:
        problemas.append(f"«{spec['id']}» ya es un servicio de YTCreator: elige otro identificador")
    if not problemas and servicios.CAPACIDADES_CONECTOR.get(spec["capacidad"], spec["capacidad"]) not in servicios.CAPACIDADES:
        problemas.append("«capacidad» debe ser imagen, voz o musica")
    return problemas


@router.post("/conectores/validar")
def validar(d: Descripcion):
    return {"problemas": _comprobar(d.spec)}


@router.put("/conectores")
def guardar(d: Descripcion):
    problemas = _comprobar(d.spec)
    if problemas:
        raise HTTPException(422, "; ".join(problemas))
    conector_ia.CARPETA.mkdir(parents=True, exist_ok=True)
    archivos.escribir_json(conector_ia.CARPETA / f"{d.spec['id']}.json", d.spec)
    return _ver(conector_ia.cargar(d.spec["id"]))


@router.delete("/conectores/{sid}")
def borrar(sid: str):
    if not conector_ia.ID_VALIDO.match(sid):
        raise HTTPException(404, "Conector desconocido")
    ruta = conector_ia.CARPETA / f"{sid}.json"
    if not ruta.exists():
        raise HTTPException(404, "Conector desconocido")
    ruta.unlink()            # la clave del .env se queda: es del usuario
    return {"ok": True}


class Prueba(BaseModel):
    datos: dict | None = None
    gastar: bool = False


@router.post("/conectores/{sid}/probar")
async def probar(sid: str, p: Prueba):
    """Una llamada mínima. Un conector de pago solo se prueba con `gastar` (la pantalla enseña el coste antes)."""
    try:
        spec = conector_ia.cargar(sid)
    except conector_ia.ErrorConector as e:
        raise HTTPException(404, str(e))
    cap = servicios.CAPACIDADES_CONECTOR.get(spec["capacidad"], spec["capacidad"])
    datos = p.datos or DATOS_PRUEBA.get(cap, {})
    with tempfile.TemporaryDirectory() as tmp:
        try:
            r = await asyncio.to_thread(conector_ia.probar, sid, datos, Path(tmp) / "prueba.bin", p.gastar)
        except conector_ia.ErrorConector as e:
            return {"ok": False, "mensaje": str(e), "coste": 0}
        except SystemExit as e:                  # modo sin gasto: sale con «ERROR: …» sin enviar nada
            return {"ok": False, "mensaje": str(e).removeprefix("ERROR: "), "coste": 0}
    return {"ok": True, "mensaje": "El servicio ha contestado bien.", "coste": r.coste}


class Integrar(BaseModel):
    capacidad: str
    documentacion: str
    nombre: str | None = None


_EJEMPLO = {"id": "mi-servicio", "nombre": "Mi servicio", "capacidad": "imagen", "base": "https://api.ejemplo.com",
            "clave_env": "MI_SERVICIO_API_KEY", "auth": {"tipo": "bearer"}, "coste": {"cantidad": 0.04, "unidad": "USD"},
            "peticion": {"metodo": "POST", "ruta": "/v1/imagenes", "tipo": "json",
                         "cuerpo": {"prompt": "{prompt}", "width": "{ancho}", "height": "{alto}"}},
            "respuesta": {"formato": "url", "donde": "data.0.url"}}


def encargo(i: Integrar) -> str:
    return (
        "Eres el integrador de servicios de YTCreator. Con la documentación de un servicio de IA que te pega el usuario, "
        "redacta SU DESCRIPCIÓN para el conector universal: un único objeto JSON, sin texto alrededor, con este formato "
        f"(ejemplo):\n{json.dumps(_EJEMPLO, ensure_ascii=False)}\n"
        "Reglas: «clave_env» es el NOMBRE de la variable (MAYÚSCULAS), nunca una clave; «base» es https; las cadenas pueden "
        "llevar {dato} de la solicitud (imagen: prompt, ancho, alto, n; voz: texto, voz; musica: prompt). Si el servicio "
        "trabaja en cola añade «cola» (consulta, estado, hecho, fallo, donde) y «respuesta.id_tarea». «respuesta.formato»: "
        "url, base64, binario o texto. Pon «coste» si el servicio cobra por llamada (no inventes cifras: si no la sabes, "
        "pon 0.01 y dilo en «descripcion»). No escribas ninguna clave real.\n"
        f"Capacidad: {i.capacidad}. Nombre: {i.nombre or '(el del servicio)'}.\n\nDOCUMENTACIÓN:\n{i.documentacion[:20000]}")


def extraer(texto: str) -> dict:
    m = re.search(r"\{.*\}", texto, re.S)
    if not m:
        raise ValueError("Claude no devolvió una descripción")
    return json.loads(m.group(0))


@router.post("/conectores/integrar")
async def integrar(i: Integrar):
    """Claude redacta la descripción a partir de la documentación (sin herramientas, con la suscripción). No guarda nada:
    devuelve la propuesta y sus problemas para que el usuario la revise, la guarde y la pruebe."""
    if not i.documentacion.strip():
        raise HTTPException(422, "Pega la documentación del servicio")
    try:
        texto, _ = await asyncio.to_thread(motor_ia.ejecutar, "sugerencia", encargo(i), cwd=config.RAIZ, tiempo=300,
                                           vetadas=motor_ia.HERRAMIENTAS_VETADAS)
    except motor_ia.LimiteAgotado as e:
        raise HTTPException(502, f"Se ha agotado el cupo de tu suscripción de Claude: {e}")
    except motor_ia.SinSesion as e:
        raise HTTPException(502, f"Claude no tiene sesión iniciada ({e})")
    except motor_ia.ErrorIA as e:
        raise HTTPException(502, f"No se pudo consultar a Claude: {e}")
    try:
        spec = extraer(texto)
    except ValueError:
        raise HTTPException(502, "Claude no ha devuelto una descripción válida: prueba otra vez o añade más documentación")
    return {"spec": spec, "problemas": _comprobar(spec)}

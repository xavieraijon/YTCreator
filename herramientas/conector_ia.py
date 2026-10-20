"""Conector universal de modelos de IA (plan 8b-D): el ÚNICO sitio que habla con APIs de IA que no son Claude (que lo hace
motor_ia.py). Une cualquier servicio con las capacidades del kit (imagen, voz, música, vídeo, texto…) sin escribir código: el
servicio se describe en `data/proveedores/<id>.json` y este módulo lo ejecuta.

Descripción (todas las cadenas admiten `{dato}` de la solicitud; si la cadena ES solo `{dato}`, conserva su tipo):

    {
      "id": "mi-servicio", "nombre": "Mi servicio", "capacidad": "imagen",
      "base": "https://api.ejemplo.com",
      "clave_env": "EJEMPLO_API_KEY",                       # nombre de la variable del .env (nunca el valor)
      "auth": {"tipo": "bearer"},                           # bearer | cabecera (+ "cabecera": "x-api-key") | query (+ "parametro")
      "coste": {"cantidad": 0.04, "unidad": "USD"},         # por llamada; 0 o sin él = gratis
      "peticion": {"metodo": "POST", "ruta": "/v1/imagenes", "tipo": "json",      # json | formulario
                   "cuerpo": {"model": "m1", "prompt": "{prompt}", "width": "{ancho}"}},
      "respuesta": {"formato": "url", "donde": "data.0.url", "id_tarea": null},   # url | base64 | binario | texto
      "cola": {"consulta": {"metodo": "GET", "ruta": "/v1/tareas/{id_tarea}"},    # solo si el servicio trabaja en cola
               "estado": "status", "hecho": ["done"], "fallo": ["failed"], "donde": "result.url",
               "intervalo": 5, "max_seg": 1800},
      "errores": {"clave": [401, 403], "cupo": [429]}       # opcional; estos son los valores por defecto
    }

`donde` es una ruta con puntos y números (`data.0.url`). La clave solo viaja a `base` (la descarga de un resultado a otra
dirección va sin ella). Errores tipados: ClaveInvalida, CupoAgotado, TiempoAgotado y ErrorConector. Un conector de pago respeta
el modo sin gasto (`simulacion.exigir_pago_permitido`) ANTES de enviar y apunta su coste en `uso`. `probar` hace una llamada
mínima y enseña el coste: el que añade un conector lo lanza antes de darlo por bueno.

Adaptador en código (para el servicio raro que la descripción no cubre): la descripción lleva `"codigo": "<id>.py"` y, junto a
ella en `data/proveedores/`, ese archivo define `ejecutar(datos, clave, salida) -> Resultado` (o un dict con `archivo` /
`texto`). Con él, `base`, `peticion` y `respuesta` son opcionales. Todo lo demás (clave del .env, modo sin gasto, apunte del
gasto, errores tipados, clave nunca en un mensaje) lo sigue haciendo este módulo; el archivo puede importar y lanzar
ClaveInvalida / CupoAgotado / TiempoAgotado / ErrorConector. Es código del propio usuario en su equipo: se ejecuta tal cual.

    .venv/bin/python herramientas/conector_ia.py                       lista los conectores
    .venv/bin/python herramientas/conector_ia.py validar <id>          comprueba la descripción (sin red)
    .venv/bin/python herramientas/conector_ia.py probar <id> clave=valor … -o salida [--gastar]
"""

import argparse
import base64
import importlib.util
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
import espacio  # noqa: E402
import simulacion  # noqa: E402
import uso  # noqa: E402

CARPETA = espacio.DATOS / "proveedores"
ID_VALIDO = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
FORMATOS = ("url", "base64", "binario", "texto")
AUTH = ("bearer", "cabecera", "query")
ERRORES_POR_DEFECTO = {"clave": [401, 403], "cupo": [429]}
REINTENTOS = 3


class ErrorConector(Exception):
    """Fallo genérico del servicio o de la descripción."""


class ClaveInvalida(ErrorConector):
    pass


class CupoAgotado(ErrorConector):
    pass


class TiempoAgotado(ErrorConector):
    pass


@dataclass
class Resultado:
    archivo: Path | None = None
    texto: str | None = None
    coste: float = 0
    tarea: str | None = None
    crudo: dict = field(default_factory=dict)


# --- Descripciones ----------------------------------------------------------------------------------------------------

def validar(spec: dict) -> list[str]:
    """Problemas de una descripción (lista vacía = válida). No usa la red."""
    if not isinstance(spec, dict):
        return ["la descripción no es un objeto"]
    p = []
    if not ID_VALIDO.match(str(spec.get("id", ""))):
        p.append("«id»: minúsculas, números y guiones (máx. 41)")
    if not str(spec.get("capacidad", "")).strip():
        p.append("falta «capacidad» (imagen, voz, música…)")
    codigo = spec.get("codigo")
    if codigo is not None and codigo != f"{spec.get('id')}.py":
        p.append("«codigo» es el archivo del adaptador, <id>.py, junto a esta descripción")
    elif codigo and not (CARPETA / codigo).is_file():
        p.append(f"falta el archivo del adaptador {codigo} en data/proveedores/")
    base = str(spec.get("base", ""))
    if not (codigo and not base) and not (base.startswith("https://") or re.match(r"^http://(localhost|127\.0\.0\.1)(:|/|$)", base)):
        p.append("«base» debe ser una dirección https://")
    if not re.match(r"^[A-Z][A-Z0-9_]*$", str(spec.get("clave_env", ""))) and spec.get("clave_env") is not None:
        p.append("«clave_env» es el NOMBRE de la variable del .env (MAYÚSCULAS), nunca la clave")
    auth = spec.get("auth") or {"tipo": "bearer"}
    if auth.get("tipo") not in AUTH:
        p.append(f"«auth.tipo» debe ser uno de {', '.join(AUTH)}")
    elif auth["tipo"] == "cabecera" and not auth.get("cabecera"):
        p.append("«auth.cabecera» falta (nombre de la cabecera)")
    elif auth["tipo"] == "query" and not auth.get("parametro"):
        p.append("«auth.parametro» falta (nombre del parámetro)")
    if codigo:
        return _coste_y_clave(spec, p)
    pet = spec.get("peticion")
    if not isinstance(pet, dict) or not str(pet.get("ruta", "")).startswith("/"):
        p.append("«peticion.ruta» debe empezar por /")
    elif pet.get("metodo", "POST").upper() not in ("GET", "POST", "PUT"):
        p.append("«peticion.metodo»: GET, POST o PUT")
    resp = spec.get("respuesta")
    if not isinstance(resp, dict) or resp.get("formato") not in FORMATOS:
        p.append(f"«respuesta.formato» debe ser uno de {', '.join(FORMATOS)}")
    elif resp["formato"] != "binario" and not (resp.get("donde") or spec.get("cola")):
        p.append("«respuesta.donde» falta (dónde está el resultado)")
    cola = spec.get("cola")
    if cola is not None:
        if not isinstance(cola, dict) or not all(cola.get(k) for k in ("consulta", "estado", "hecho", "donde")):
            p.append("«cola» necesita consulta, estado, hecho y donde")
        elif not (spec.get("respuesta") or {}).get("id_tarea"):
            p.append("con «cola», «respuesta.id_tarea» dice dónde está el número de la tarea")
    return _coste_y_clave(spec, p)


def _coste_y_clave(spec: dict, p: list[str]) -> list[str]:
    coste = spec.get("coste")
    if coste is not None and (not isinstance(coste, dict) or not isinstance(coste.get("cantidad", 0), (int, float))
                              or coste.get("cantidad", 0) < 0):
        p.append("«coste.cantidad» debe ser un número ≥ 0")
    return p


def cargar(sid: str) -> dict:
    if not ID_VALIDO.match(sid or ""):
        raise ErrorConector(f"identificador no válido: «{sid}»")
    ruta = CARPETA / f"{sid}.json"
    try:
        spec = json.loads(ruta.read_text(encoding="utf-8"))
    except OSError:
        raise ErrorConector(f"no existe el conector «{sid}» ({ruta.name} en data/proveedores/)")
    except ValueError as e:
        raise ErrorConector(f"{ruta.name} no es un JSON válido: {e}")
    problemas = validar(spec)
    if problemas:
        raise ErrorConector(f"{ruta.name}: " + "; ".join(problemas))
    if spec["id"] != sid:
        raise ErrorConector(f"{ruta.name}: su «id» ({spec['id']}) no coincide con el nombre del archivo")
    return spec


def listar() -> list[dict]:
    salida = []
    for ruta in sorted(CARPETA.glob("*.json")) if CARPETA.exists() else []:
        try:
            spec = cargar(ruta.stem)
            salida.append({"id": spec["id"], "nombre": spec.get("nombre", spec["id"]), "capacidad": spec["capacidad"],
                           "de_pago": de_pago(spec), "conectado": clave_de(spec) is not None or not spec.get("clave_env"),
                           "valido": True, "problema": None})
        except ErrorConector as e:
            salida.append({"id": ruta.stem, "nombre": ruta.stem, "capacidad": None, "de_pago": False, "conectado": False,
                           "valido": False, "problema": str(e)})
    return salida


def de_pago(spec: dict) -> bool:
    return float((spec.get("coste") or {}).get("cantidad") or 0) > 0


def clave_de(spec: dict) -> str | None:
    """El valor de la clave (del .env o el entorno) o None. Quien lo llama NUNCA lo muestra."""
    nombre = spec.get("clave_env")
    if not nombre:
        return None
    load_dotenv(espacio.ENV)
    return (os.getenv(nombre) or "").strip() or None


# --- Plantillas ---------------------------------------------------------------------------------------------------------

_MARCA = re.compile(r"\{([a-z_][a-z0-9_]*)\}")


def rellenar(valor, datos: dict):
    """Sustituye {dato} en cadenas, listas y objetos. Una cadena que es solo «{dato}» conserva el tipo del dato."""
    if isinstance(valor, str):
        completa = _MARCA.fullmatch(valor)
        if completa:
            return _dato(completa.group(1), datos)
        return _MARCA.sub(lambda m: str(_dato(m.group(1), datos)), valor)
    if isinstance(valor, list):
        return [rellenar(v, datos) for v in valor]
    if isinstance(valor, dict):
        return {k: rellenar(v, datos) for k, v in valor.items()}
    return valor


def _dato(nombre, datos):
    if nombre not in datos:
        raise ErrorConector(f"falta el dato «{nombre}» (la descripción lo usa como {{{nombre}}})")
    return datos[nombre]


def extraer(obj, ruta: str):
    """Valor en una ruta con puntos y números (`data.0.url`); None si no está."""
    for parte in str(ruta).split("."):
        if isinstance(obj, list) and parte.isdigit() and int(parte) < len(obj):
            obj = obj[int(parte)]
        elif isinstance(obj, dict) and parte in obj:
            obj = obj[parte]
        else:
            return None
    return obj


# --- Ejecución ----------------------------------------------------------------------------------------------------------

def _cabeceras_y_params(spec, clave):
    auth, cab, params = spec.get("auth") or {"tipo": "bearer"}, {}, {}
    if clave:
        if auth["tipo"] == "bearer":
            cab["Authorization"] = f"Bearer {clave}"
        elif auth["tipo"] == "cabecera":
            cab[auth["cabecera"]] = clave
        else:
            params[auth["parametro"]] = clave
    return cab, params


def _enviar(spec, clave, pet, datos):
    cab, params = _cabeceras_y_params(spec, clave)
    args = {"headers": cab, "params": params, "timeout": 180}
    cuerpo = rellenar(pet.get("cuerpo"), datos) if pet.get("cuerpo") is not None else None
    if cuerpo is not None:
        args["json" if pet.get("tipo", "json") == "json" else "data"] = cuerpo
    ruta = rellenar(pet["ruta"], datos)
    errores = {**ERRORES_POR_DEFECTO, **(spec.get("errores") or {})}
    ultimo = ""
    for intento in range(1, REINTENTOS + 1):
        try:
            r = requests.request(pet.get("metodo", "POST").upper(), spec["base"].rstrip("/") + ruta, **args)
        except requests.RequestException as e:
            ultimo = f"conexión: {type(e).__name__}"          # sin el texto de e: podría llevar la clave en la dirección
        else:
            if r.status_code in errores["clave"]:
                raise ClaveInvalida(f"{spec['nombre'] if 'nombre' in spec else spec['id']} rechaza la clave "
                                    f"({r.status_code}): revísala en Ajustes → Servicios")
            if r.status_code in errores["cupo"]:
                raise CupoAgotado(f"límite o demasiadas peticiones ({r.status_code})")
            if r.ok:
                return r
            if 400 <= r.status_code < 500:
                raise ErrorConector(f"el servicio rechazó la petición ({r.status_code}): {r.text[:200]}")
            ultimo = f"HTTP {r.status_code}"
        if intento < REINTENTOS:
            time.sleep(3 * intento)
    raise ErrorConector(f"tras {REINTENTOS} intentos: {ultimo}")


def _json(r):
    try:
        return r.json()
    except ValueError:
        raise ErrorConector(f"la respuesta no es JSON: {r.text[:200]}")


def _guardar(spec, valor, salida: Path | None, res: Resultado):
    formato = spec["respuesta"]["formato"]
    if formato == "texto":
        res.texto = str(valor)
        return
    if salida is None:
        raise ErrorConector("este conector devuelve un archivo y falta dónde guardarlo")
    if formato == "base64":
        datos = base64.b64decode(re.sub(r"^data:[^,]*,", "", str(valor)))
    elif formato == "url":
        if not str(valor).startswith(("https://", "http://localhost", "http://127.0.0.1")):
            raise ErrorConector("el servicio devolvió una dirección de descarga que no es https")
        try:
            d = requests.get(str(valor), timeout=180)         # sin la clave: la descarga puede ser de otro dominio
            d.raise_for_status()
        except requests.RequestException as e:
            raise ErrorConector(f"no se pudo bajar el resultado ({type(e).__name__}); ya estaba hecho: revisa la tarea {res.tarea}")
        datos = d.content
    else:
        datos = valor
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_bytes(datos)
    res.archivo = salida


def ejecutar(sid: str, datos: dict, salida=None) -> Resultado:
    """Una llamada al servicio `sid` con los `datos` de la capacidad; el archivo resultante va a `salida`."""
    spec = cargar(sid)
    salida = Path(salida) if salida else None
    clave = clave_de(spec)
    if spec.get("clave_env") and not clave:
        raise ClaveInvalida(f"falta {spec['clave_env']} en el .env (Ajustes → Servicios)")
    coste = float((spec.get("coste") or {}).get("cantidad") or 0)
    if coste > 0:
        simulacion.exigir_pago_permitido(spec.get("nombre", sid))
    res = Resultado(coste=coste)
    if spec.get("codigo"):
        _por_codigo(spec, clave, datos, salida, res)
        if coste > 0:
            uso.registrar(f"conector:{sid}", coste, f"{(spec.get('coste') or {}).get('unidad', '')} · {salida.name if salida else ''}")
        return res
    resp = _enviar(spec, clave, spec["peticion"], datos)
    cuerpo = resp.content if spec["respuesta"]["formato"] == "binario" else _json(resp)
    cola = spec.get("cola")
    if cola:
        res.tarea = str(extraer(cuerpo, spec["respuesta"]["id_tarea"]) or "")
        if not res.tarea:
            raise ErrorConector("el servicio aceptó el encargo pero no devolvió su número de tarea; puede haberse cobrado")
        if coste > 0:
            uso.registrar(f"conector:{sid}", coste, f"{(spec.get('coste') or {}).get('unidad', '')} · tarea {res.tarea}")
            coste = 0                                          # ya apuntado: se pagó al encargar
        cuerpo = _esperar(spec, clave, {**datos, "id_tarea": res.tarea}, res.tarea)
        valor = extraer(cuerpo, cola["donde"])
    elif spec["respuesta"]["formato"] == "binario":
        valor = cuerpo
    else:
        valor = extraer(cuerpo, spec["respuesta"]["donde"])
    if valor in (None, ""):
        raise ErrorConector("la respuesta no trae el resultado donde dice la descripción (respuesta.donde)")
    res.crudo = cuerpo if isinstance(cuerpo, dict) else {}
    _guardar(spec, valor, salida, res)
    if coste > 0:
        uso.registrar(f"conector:{sid}", coste, f"{(spec.get('coste') or {}).get('unidad', '')} · {salida.name if salida else ''}")
    return res


def _por_codigo(spec, clave, datos, salida, res: Resultado):
    """Corre el adaptador en código de `spec` y vuelca su resultado en `res`. Cualquier fallo suyo sale como ErrorConector y
    ningún mensaje lleva la clave."""
    def limpio(e):
        t = f"{type(e).__name__}: {e}" if not isinstance(e, ErrorConector) else str(e)
        return t.replace(clave, "***") if clave else t
    if salida:
        salida.parent.mkdir(parents=True, exist_ok=True)
    try:
        modulo_spec = importlib.util.spec_from_file_location(f"conector_{spec['id']}", CARPETA / spec["codigo"])
        modulo = importlib.util.module_from_spec(modulo_spec)
        modulo_spec.loader.exec_module(modulo)
        r = modulo.ejecutar(datos, clave, salida)
    except ErrorConector as e:
        raise type(e)(limpio(e)) from None
    except Exception as e:
        raise ErrorConector(f"el adaptador en código «{spec['codigo']}» falló: {limpio(e)[:300]}") from None
    if isinstance(r, Resultado):
        r = {"archivo": r.archivo, "texto": r.texto, "tarea": r.tarea, "crudo": r.crudo}
    if not isinstance(r, dict):
        raise ErrorConector(f"el adaptador «{spec['codigo']}» debe devolver un Resultado o un dict con archivo/texto")
    archivo = r.get("archivo")
    if archivo and not Path(archivo).is_file():
        raise ErrorConector(f"el adaptador «{spec['codigo']}» dice haber dejado {Path(archivo).name} pero no existe")
    if not archivo and not r.get("texto"):
        raise ErrorConector(f"el adaptador «{spec['codigo']}» no devolvió ni archivo ni texto")
    res.archivo = Path(archivo) if archivo else None
    res.texto, res.tarea, res.crudo = r.get("texto"), r.get("tarea"), r.get("crudo") or {}


def _esperar(spec, clave, datos, tarea):
    cola = spec["cola"]
    inicio, intervalo = time.time(), max(1, float(cola.get("intervalo", 5)))
    while True:
        try:
            d = _json(_enviar(spec, clave, cola["consulta"], datos))
        except ClaveInvalida:
            raise
        except ErrorConector:
            d = {}                                             # un corte al consultar no pierde el encargo
        estado = extraer(d, cola["estado"])
        if estado in cola["hecho"]:
            return d
        if estado in cola.get("fallo", []):
            raise ErrorConector(f"el servicio falló con la tarea {tarea}: {str(extraer(d, cola.get('error', 'error')))[:200]}")
        if time.time() - inicio > float(cola.get("max_seg", 1800)):
            raise TiempoAgotado(f"la tarea {tarea} lleva demasiado sin terminar; puede estar hecha: consúltala de nuevo")
        time.sleep(intervalo)


def probar(sid: str, datos: dict, salida, gastar=False) -> Resultado:
    """Llamada mínima de prueba. Un conector de pago solo se prueba con gastar=True (el coste se enseña antes)."""
    spec = cargar(sid)
    if de_pago(spec) and not gastar:
        c = spec["coste"]
        raise ErrorConector(f"probar «{sid}» cuesta {c['cantidad']} {c.get('unidad', '')} por llamada; repite con --gastar "
                            "si el usuario lo ha aceptado")
    return ejecutar(sid, datos, salida)


def main():
    p = argparse.ArgumentParser(description="Conector universal de modelos de IA (data/proveedores/<id>.json)")
    p.add_argument("orden", nargs="?", choices=("validar", "probar"))
    p.add_argument("id", nargs="?")
    p.add_argument("datos", nargs="*", help="clave=valor de la solicitud (probar)")
    p.add_argument("-o", "--salida")
    p.add_argument("--gastar", action="store_true", help="aceptar el coste de una llamada de pago")
    a = p.parse_args()
    try:
        if not a.orden:
            for c in listar():
                print(f"{c['id']:24} {c['capacidad'] or '?':10} {'de pago' if c['de_pago'] else 'gratis':8} "
                      f"{'conectado' if c['conectado'] else 'sin clave'}" + ("" if c["valido"] else f"  ERROR: {c['problema']}"))
            return
        if not a.id:
            sys.exit("ERROR: falta el identificador del conector")
        if a.orden == "validar":
            cargar(a.id)
            print(f"OK: {a.id} es válido")
            return
        datos = dict(d.split("=", 1) for d in a.datos if "=" in d)
        r = probar(a.id, datos, a.salida, a.gastar)
        print(f"OK: {r.archivo or (r.texto or '')[:200]} (coste {r.coste})")
    except ErrorConector as e:
        sys.exit(f"ERROR: {e}")


if __name__ == "__main__":
    main()

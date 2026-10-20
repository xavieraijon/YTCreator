"""Probar cada servicio con la clave guardada, sin gastar: solo endpoints de verificación o de consulta gratuitos
(saldo de ai33, verificación del token de Cloudflare, emisión de token de Azure Speech, lista de modelos de Gemini).
Nunca devuelve ni registra la clave. Resultado: {"ok": bool, "estado": ok|falta|rechazada|red|error, "mensaje": str}."""

import re

import requests

from . import config

TIMEOUT = 15
REGION_OK = re.compile(r"^[a-z0-9]{2,30}$")


def _env() -> dict[str, str]:
    try:
        lineas = (config.RAIZ / ".env").read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    res = {}
    for l in lineas:
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", l)
        if m and not l.lstrip().startswith("#"):
            res[m.group(1)] = m.group(2).strip("'\"")
    return res


def _r(ok: bool, estado: str, mensaje: str) -> dict:
    return {"ok": ok, "estado": estado, "mensaje": mensaje}


def _falta(*nombres: str) -> dict:
    return _r(False, "falta", "Falta rellenar: " + ", ".join(nombres) + ". Guárdala arriba y vuelve a probar.")


def _por_codigo(codigo: int, ok_texto: str, rechazo: str) -> dict:
    if codigo == 200:
        return _r(True, "ok", ok_texto)
    if codigo in (401, 403):
        return _r(False, "rechazada", rechazo)
    if codigo == 429:
        return _r(False, "error", "El servicio dice que hay demasiadas peticiones; espera un minuto y repite.")
    return _r(False, "error", f"El servicio contestó con error {codigo}.")


def _ai33(e):
    if not e.get("AI33_API_KEY"):
        return _falta("AI33_API_KEY")
    r = requests.get("https://api.ai33.pro/v1/credits", headers={"xi-api-key": e["AI33_API_KEY"]}, timeout=TIMEOUT)
    if r.status_code == 200:
        try:
            return _r(True, "ok", f"Clave válida. Saldo: {int(r.json()['credits']):,} créditos.".replace(",", "."))
        except (ValueError, KeyError, TypeError):
            return _r(True, "ok", "Clave válida.")
    return _por_codigo(r.status_code, "", "ai33 no reconoce esa clave. Cópiala de nuevo desde ai33.pro → API Key.")


def _cloudflare(e):
    falta = [k for k in ("CF_ACCOUNT_ID", "CF_API_TOKEN") if not e.get(k)]
    if falta:
        return _falta(*falta)
    cuenta = e["CF_ACCOUNT_ID"]
    if not re.fullmatch(r"[0-9a-fA-F]{32}", cuenta):
        return _r(False, "rechazada", "El identificador de cuenta debe tener 32 caracteres (letras a-f y números).")
    cab = {"Authorization": f"Bearer {e['CF_API_TOKEN']}"}
    r = requests.get(f"https://api.cloudflare.com/client/v4/accounts/{cuenta}/tokens/verify", headers=cab, timeout=TIMEOUT)
    if r.status_code != 200:                                   # un token de usuario (no de cuenta) se verifica aquí
        r = requests.get("https://api.cloudflare.com/client/v4/user/tokens/verify", headers=cab, timeout=TIMEOUT)
    if r.status_code != 200:
        return _por_codigo(r.status_code, "", "Cloudflare no acepta ese token. Créalo de nuevo con permiso «Workers AI».")
    try:
        estado = r.json()["result"]["status"]
    except (ValueError, KeyError, TypeError):
        estado = "active"
    if estado != "active":
        return _r(False, "rechazada", f"El token existe pero su estado es «{estado}».")
    return _r(True, "ok", "Token activo. (No se ha generado ninguna imagen: eso gastaría cupo.)")


def _azure(e):
    falta = [k for k in ("AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION") if not e.get(k)]
    if falta:
        return _falta(*falta)
    region = e["AZURE_SPEECH_REGION"].lower()
    if not REGION_OK.match(region):
        return _r(False, "rechazada", "La región solo lleva letras minúsculas y números (p. ej. westeurope).")
    r = requests.post(f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken",
                      headers={"Ocp-Apim-Subscription-Key": e["AZURE_SPEECH_KEY"]}, timeout=TIMEOUT)
    return _por_codigo(r.status_code, "Clave y región válidas (se ha pedido un token de acceso, que es gratis).",
                       "Azure rechaza la clave o no corresponde a esa región. Revisa ambas en el recurso Speech.")


def _gemini(e):
    if not e.get("GEMINI_API_KEY"):
        return _falta("GEMINI_API_KEY")
    r = requests.get("https://generativelanguage.googleapis.com/v1beta/models", params={"pageSize": 1},
                     headers={"x-goog-api-key": e["GEMINI_API_KEY"]}, timeout=TIMEOUT)
    if r.status_code == 400:                                   # Google devuelve 400 para una clave inválida
        return _r(False, "rechazada", "Google no reconoce esa clave. Cópiala de nuevo desde aistudio.google.com/apikey.")
    return _por_codigo(r.status_code, "Clave válida (solo se ha pedido la lista de modelos, que es gratis).",
                       "Google rechaza esa clave. Cópiala de nuevo desde aistudio.google.com/apikey.")


def _local(_e: dict) -> dict:
    import servicios  # herramientas/ (en sys.path por config)
    if servicios.motor_local_instalado():
        return _r(True, "ok", "Instalado y listo (no se ha generado nada).")
    return _r(False, "falta", "No está instalado en este ordenador. Se instala aparte: ver herramientas/motor_local.py.")


# Por el id del catálogo (herramientas/servicios.py). La música incluida no necesita prueba.
SERVICIOS = {"cloudflare": _cloudflare, "azure": _azure, "ai33": _ai33, "gemini": _gemini, "local": _local}


def probar(servicio: str) -> dict:
    if servicio not in SERVICIOS:
        raise KeyError(servicio)
    try:
        return SERVICIOS[servicio](_env())
    except requests.Timeout:
        return _r(False, "red", "El servicio no contesta a tiempo. Mira tu conexión y repite.")
    except requests.RequestException:
        return _r(False, "red", "No se pudo conectar con el servicio. Mira tu conexión y repite.")

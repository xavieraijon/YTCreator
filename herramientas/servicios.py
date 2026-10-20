"""Servicios que el usuario elige usar (bloque B de docs/plan-mejoras-usuario.md). NINGUNO es obligatorio, tampoco el motor de
imágenes de este Mac: sin servicios se produce subiendo los recursos propios (imágenes, locución, música). Solo Claude, ffmpeg y
yt-dlp son imprescindibles, y eso no está aquí (lo comprueba la UI en app/asistente.py).

La elección vive en `data/ajustes.json` → `"servicios": {"cloudflare": true, "local": false, ...}` (Ajustes → Servicios).
Un servicio que nunca se ha elegido ni descartado cuenta como activo si ya está conectado (sus claves en el .env, o el motor
del Mac instalado): así una instalación que ya funcionaba sigue igual. `CANALYT_AJUSTES` cambia el fichero (pruebas).

    servicios.py            → lista los servicios, si están activos y conectados (sin enseñar claves)
"""

import argparse
import json
import os
import re
from pathlib import Path

import espacio
import sistema

CAPACIDADES = {"imagen": "Imágenes", "voz": "Voz", "musica": "Música", "sincronia": "Sincronía exacta de la voz"}
# sincronia: Azure (reconocimiento) o WhisperX (alineación forzada, local); sin ninguno, la aproximada (sin servicios)

# id → nombre, qué hace, tipo (gratis, pago, local, incluido), para qué sirve, y sus claves: (clave, qué es, dónde conseguirla)
CATALOGO: dict[str, dict] = {
    "cloudflare": {
        "nombre": "Cloudflare Workers AI", "hace": ("imagen",), "tipo": "gratis",
        "descripcion": "Imágenes gratis con FLUX.2 klein: unas 90 al día con la cuenta gratuita.",
        "claves": (("CF_ACCOUNT_ID", "Identificador de cuenta", "Cloudflare → Workers AI"),
                   ("CF_API_TOKEN", "Token de API", "Cloudflare → Mi perfil → Tokens de API")),
    },
    "local": {
        "nombre": "Motor de imágenes de este Mac", "hace": ("imagen",), "tipo": "local",
        "descripcion": "El mismo modelo que Cloudflare, en tu ordenador: gratis y sin cuota, unos 2 minutos por imagen. "
                       "Ocupa 4,3 GB y necesita un Mac con Apple Silicon y 16 GB de memoria. Se instala aparte.",
        "claves": (),
    },
    "ai33": {
        "nombre": "ai33.pro", "hace": ("imagen", "voz", "musica"), "tipo": "pago",
        "descripcion": "De pago, por créditos: voces de ElevenLabs, imágenes de más calidad (personas, manos) y música de "
                       "Suno. Cada gasto se confirma antes.",
        "claves": (("AI33_API_KEY", "Clave de API", "ai33.pro → API Key"),),
    },
    "azure": {
        "nombre": "Azure Speech", "hace": ("voz", "sincronia"), "tipo": "gratis",
        "descripcion": "Voz gratis (500.000 caracteres al mes) y la sincronía exacta: el momento de cada palabra, también "
                       "en voces de otros servicios o en una locución subida.",
        "claves": (("AZURE_SPEECH_KEY", "Clave de Azure Speech", "Azure → recurso Speech (F0, gratuito)"),
                   ("AZURE_SPEECH_REGION", "Región (p. ej. westeurope)", "La región del recurso Speech")),
    },
    "gemini": {
        "nombre": "Gemini", "hace": ("voz",), "tipo": "gratis",
        "descripcion": "Otra voz gratis, con el nivel gratuito de Google AI Studio.",
        "claves": (("GEMINI_API_KEY", "Clave de Gemini", "aistudio.google.com/apikey, en un proyecto sin facturación"),),
    },
    "sintetizador": {
        "nombre": "Música incluida en YTCreator", "hace": ("musica",), "tipo": "incluido",
        "descripcion": "Ambientes sencillos (alegre, tranquilo, misterio) que hace el propio programa: sin IA ni servicios.",
        "claves": (),
    },
    "whisperx": {
        "nombre": "Alineación local (WhisperX)", "hace": ("sincronia",), "tipo": "local",
        "descripcion": "Sincronía exacta en este ordenador (alineación forzada, sin transcribir): funciona también con "
                       "voces que Azure entiende mal. Gratis y sin cuota, menos de un segundo por escena. Ocupa ~1,7 GB "
                       "y necesita Python 3.13. Se instala aparte.",
        "claves": (),
    },
}

TODAS_LAS_CLAVES = {c for s in CATALOGO.values() for c, _, _ in s["claves"]}
CAPACIDADES_CONECTOR = {"musica": "musica", "música": "musica"}   # nombres alternativos que acepta un conector


def conectores() -> list[dict]:
    """Los conectores del usuario (data/proveedores/<id>.json, ver conector_ia.py) con una capacidad del kit y descripción
    válida, con la forma de una entrada del catálogo. Sin catálogo ni red: solo lee sus archivos."""
    try:
        import conector_ia
        lista = conector_ia.listar()
    except Exception:       # un archivo roto no debe tumbar la lista de servicios
        return []
    salida = []
    for c in lista:
        cap = CAPACIDADES_CONECTOR.get(c["capacidad"], c["capacidad"])
        if not c["valido"] or cap not in CAPACIDADES or c["id"] in CATALOGO:
            continue
        spec = conector_ia.cargar(c["id"])
        clave = spec.get("clave_env")
        salida.append({
            "id": c["id"], "nombre": c["nombre"], "hace": (cap,), "tipo": "pago" if c["de_pago"] else "gratis",
            "descripcion": spec.get("descripcion") or "Servicio conectado por ti.",
            "claves": ((clave, "Clave de API", spec.get("ayuda_clave") or "La de tu cuenta en ese servicio"),) if clave else (),
            "conector": True,
        })
    return salida


def catalogo() -> dict[str, dict]:
    """El catálogo fijo y, detrás, los conectores del usuario."""
    fijo = {k: v for k, v in CATALOGO.items() if k != "local" or sistema.mac_apple_silicon()}   # MLX: solo Mac M
    return {**fijo, **{c["id"]: c for c in conectores()}}


def claves_permitidas() -> set[str]:
    """Las claves que la app puede escribir en el .env: las del catálogo y las que declaran los conectores válidos."""
    return TODAS_LAS_CLAVES | {c for s in conectores() for c, _, _ in s["claves"]}


def _ruta_ajustes() -> Path:
    return Path(os.environ.get("CANALYT_AJUSTES") or espacio.AJUSTES)


def elecciones() -> dict[str, bool]:
    """Lo que el usuario ha elegido expresamente (los que no aparecen, sin elegir)."""
    try:
        d = json.loads(_ruta_ajustes().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    e = d.get("servicios") if isinstance(d, dict) else None
    if not isinstance(e, dict):
        return {}
    conocidos = catalogo()
    return {k: v for k, v in e.items() if k in conocidos and isinstance(v, bool)}


def claves_rellenas(env: Path | None = None) -> dict[str, bool]:
    """Qué claves tienen valor (True/False), en el .env (el del espacio, u otro en pruebas) o en el entorno, como las
    leen las herramientas (load_dotenv no pisa el entorno). Nunca devuelve valores."""
    res = {c: True for c in claves_permitidas() if os.environ.get(c, "").strip()}
    try:
        lineas = (env or espacio.ENV).read_text(encoding="utf-8").splitlines()
    except OSError:
        return res
    for linea in lineas:
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", linea)
        if m and not linea.lstrip().startswith("#"):
            res[m.group(1)] = res.get(m.group(1), False) or bool(m.group(2).strip("'\""))
    return res


def motor_local_instalado() -> bool:
    """El motor del Mac está listo: su entorno (.venv-local) y un modelo cuantizado en modelos/ (ver motor_local.py).
    CANALYT_SIN_MOTOR_LOCAL=1 hace como si no estuviera (las pruebas: nunca cargan el modelo de verdad)."""
    if os.environ.get("CANALYT_SIN_MOTOR_LOCAL"):
        return False
    return sistema.python_venv(espacio.KIT, ".venv-local").exists() and any((espacio.KIT / "modelos").glob("flux2-klein-4b-q*"))


def alineacion_local_instalada() -> bool:
    """La alineación local está lista: su entorno (.venv-whisperx), ver alineacion_local.py.
    CANALYT_SIN_ALINEACION_LOCAL=1 hace como si no estuviera (las pruebas: nunca cargan el modelo de verdad)."""
    if os.environ.get("CANALYT_SIN_ALINEACION_LOCAL"):
        return False
    return sistema.python_venv(espacio.KIT, ".venv-whisperx").exists()


def conectado(sid: str, rellenas: dict[str, bool] | None = None) -> bool:
    """Tiene lo que necesita para funcionar: sus claves, o estar instalado. Lo incluido siempre lo está."""
    if sid == "local":
        return motor_local_instalado()
    if sid == "whisperx":
        return alineacion_local_instalada()
    rellenas = claves_rellenas() if rellenas is None else rellenas
    return all(rellenas.get(c) for c, _, _ in catalogo()[sid]["claves"])


def todos(env: Path | None = None) -> list[dict]:
    """Cada servicio con su elección y su estado. `activo` = elegido (o, sin elegir, conectado); `disponible` = activo y
    conectado: es el que de verdad se puede usar."""
    rellenas, elegidos = claves_rellenas(env), elecciones()
    lista = []
    for sid, s in catalogo().items():
        con = conectado(sid, rellenas)
        activo = elegidos.get(sid, con)
        lista.append({
            "id": sid, "nombre": s["nombre"], "hace": list(s["hace"]), "tipo": s["tipo"], "descripcion": s["descripcion"],
            "claves": [{"clave": c, "texto": t, "ayuda": a, "rellena": bool(rellenas.get(c))} for c, t, a in s["claves"]],
            "activo": activo, "elegido": sid in elegidos, "conectado": con, "disponible": activo and con,
            "conector": bool(s.get("conector")),
        })
    return lista


def disponible(sid: str, env: Path | None = None) -> bool:
    return next((s["disponible"] for s in todos(env) if s["id"] == sid), False)


def resumen(env: Path | None = None) -> dict[str, list[str]]:
    """Por capacidad, los servicios disponibles (lista vacía = esa parte se hace subiendo lo tuyo)."""
    disponibles = [s for s in todos(env) if s["disponible"]]
    return {cap: [s["id"] for s in disponibles if cap in s["hace"]] for cap in CAPACIDADES}


def main():
    argparse.ArgumentParser(description="Lista los servicios y si están activos y conectados (sin enseñar claves).").parse_args()
    for s in todos():
        estado = "disponible" if s["disponible"] else "activo, sin conectar" if s["activo"] else "no se usa"
        print(f"{s['nombre']:32} {', '.join(CAPACIDADES[c] for c in s['hace']):40} {estado}")


if __name__ == "__main__":
    main()

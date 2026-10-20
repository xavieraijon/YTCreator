"""Música de fondo de un vídeo con Suno por ai33 (DE PAGO): qué ambientes usa el guion, con qué prompt, las
versiones encargadas y cuál se usa al montar. Todo pasa por herramientas/musica_ai33.py (lo mismo que en la
terminal); aquí solo se lee su --estado y se lanzan sus acciones gratis (elegir versión, guardar prompt). El
encargo de pago es la tarea `musica_ai33`, con el coste confirmado por el usuario."""

import json
import os
import re
import subprocess

import proveedores  # noqa: E402  (herramientas/, en sys.path por config)

from . import config
from .modelos import Video
from .sincronizar import carpeta_canal, carpeta_video

AMBIENTE = re.compile(r"^[a-z0-9_-]{1,40}$")


class ErrorMusica(ValueError):
    pass


def _guion(video: Video):
    guion = carpeta_video(video) / "guion.json"
    if not guion.exists():
        raise ErrorMusica("El vídeo todavía no tiene guion")
    return guion


def _ejecutar(video: Video, *args) -> str:
    cmd = [str(config.PYTHON), str(config.HERRAMIENTAS / "musica_ai33.py"), str(_guion(video)), *args]
    r = subprocess.run(cmd, cwd=config.RAIZ, capture_output=True, text=True, timeout=60,
                       env={**os.environ, "CANAL": video.canal})
    if r.returncode != 0:
        mensaje = (r.stderr or r.stdout).strip().splitlines()
        raise ErrorMusica((mensaje[-1] if mensaje else "musica_ai33.py falló").removeprefix("ERROR: "))
    return r.stdout


def estado(video: Video) -> dict:
    """{creditos_por_encargo, euros_por_encargo, ambientes: [{ambiente, escenas, prompt, prompt_propio, propia,
    versiones: [{n, archivo, duracion}], elegida, fecha, creditos}]} (rutas de versiones relativas al vídeo)."""
    import imagen_ai33                                   # herramientas/ (config la pone en sys.path)
    try:
        datos = json.loads(_ejecutar(video, "--estado"))
    except json.JSONDecodeError:
        raise ErrorMusica("No se pudo leer el estado de la música")
    datos["euros_por_encargo"] = round(imagen_ai33.euros(datos["creditos_por_encargo"]), 3)
    datos["max_prompt"] = proveedores.valor("suno.max_prompt")   # la UI ya no lo fija a mano
    # De dónde sale la «propia»: la del canal (subida o hecha para él) o la incluida en el programa (recursos/ del kit).
    canal_rel = (carpeta_canal(video.canal) / "recursos").relative_to(config.RAIZ).as_posix()
    for a in datos["ambientes"]:
        a["origen_propia"] = None if not a["propia"] else "canal" if a["propia"].startswith(canal_rel) else "incluida"
    return datos


def _ambiente(video: Video, ambiente: str) -> dict:
    if not AMBIENTE.match(ambiente or ""):
        raise ErrorMusica("Ambiente no válido")
    a = next((a for a in estado(video)["ambientes"] if a["ambiente"] == ambiente), None)
    if not a:
        raise ErrorMusica(f"El guion no usa el ambiente «{ambiente}»")
    return a


def elegir(video: Video, ambiente: str, n: int):
    a = _ambiente(video, ambiente)
    if n and n not in [v["n"] for v in a["versiones"]]:
        raise ErrorMusica(f"«{ambiente}» no tiene versión {n}")
    _ejecutar(video, "--elegir", ambiente, str(int(n)))


def guardar_prompt(video: Video, ambiente: str, texto: str):
    _ambiente(video, ambiente)
    texto = " ".join((texto or "").split())
    maximo = proveedores.valor("suno.max_prompt")              # leído ahora: un cambio en Ajustes vale sin reiniciar
    if len(texto) > maximo:
        raise ErrorMusica(f"La descripción tiene {len(texto)} caracteres (el servicio admite {maximo})")
    _ejecutar(video, "--guardar-prompt", ambiente, texto)


def propia(video: Video, ambiente: str):
    """Archivo de la música propia del canal (o del kit) para ese ambiente, para escucharla en la UI."""
    a = _ambiente(video, ambiente)
    if not a["propia"]:
        raise ErrorMusica(f"No hay música propia para «{ambiente}»")
    return config.RAIZ / a["propia"]


def validar_encargo(video: Video, a: dict, activa: bool):
    """Tarea DE PAGO: el usuario confirma los créditos de UN encargo; si han cambiado, no se lanza."""
    if not a.get("confirmado"):
        raise ErrorMusica("La música de Suno es de pago: hay que confirmar el coste")
    if activa:
        raise ErrorMusica("Ya hay un encargo de música en marcha para este vídeo: espera a que termine")
    datos = estado(video)
    if a.get("previsto") != datos["creditos_por_encargo"]:
        raise ErrorMusica(f"El coste ha cambiado ({datos['creditos_por_encargo']} créditos): vuelve a confirmar")
    _ambiente(video, a.get("ambiente") or "")

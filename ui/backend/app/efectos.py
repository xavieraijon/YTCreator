"""Efectos de sonido del guion (bloque B/G): qué marcas `{nombre}` usa el texto, en qué escenas, y si hay un archivo
para cada uno (propio del canal o incluido en el kit). Subir/quitar el propio pasa por app/propios.py."""
import re

from . import config
from .modelos import Video
from .sincronizar import carpeta_canal, carpeta_video

import archivos  # noqa: E402  (herramientas/, en sys.path por config)

MARCA = re.compile(r"\{([a-z0-9_]+)(?::(\d+))?\}", re.IGNORECASE)   # como herramientas/gen_voz.py → MARCA
RESERVADOS = {"pausa", "img"}                                        # marcas especiales de montar.py, no efectos


class ErrorEfectos(ValueError):
    pass


def estado(video: Video) -> dict:
    """{efectos: [{nombre, escenas, origen_propio}]}; origen_propio: "canal" (propio), "incluido" (biblioteca del
    kit) o null (no hay archivo: montar.py fallará si no se sube uno)."""
    ruta = carpeta_video(video) / "guion.json"
    if not ruta.exists():
        raise ErrorEfectos("El vídeo todavía no tiene guion")
    guion = archivos.leer_json(ruta)
    usados: dict[str, set[int]] = {}
    for n, e in enumerate(guion.get("escenas") or [], 1):
        for m in MARCA.finditer(e.get("texto") or ""):
            nombre = m.group(1).lower()
            if nombre in RESERVADOS:
                continue
            usados.setdefault(nombre, set()).add(n)
    carpeta_c = carpeta_canal(video.canal)
    efectos = []
    for nombre, escenas in sorted(usados.items()):
        if (carpeta_c / "recursos" / "sfx" / f"{nombre}.wav").exists():
            origen = "canal"
        elif (config.RAIZ / "recursos" / "sfx" / f"{nombre}.wav").exists():
            origen = "incluido"
        else:
            origen = None
        efectos.append({"nombre": nombre, "escenas": sorted(escenas), "origen_propio": origen})
    return {"efectos": efectos}

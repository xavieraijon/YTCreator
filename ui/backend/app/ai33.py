"""Imágenes de pago con ai33 (herramientas/imagen_ai33.py) vistas desde la UI: qué falta por mandar, qué
tareas esperan en su cola y cuánto costaría. Consultar la cola no gasta nada."""

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import imagen_ai33          # herramientas/imagen_ai33.py
import sistema              # herramientas/sistema.py

from .modelos import Video
from .sincronizar import _leer_json, carpeta_canal, carpeta_video

_cache: dict = {}           # tarea → (hora, estado): la cola se consulta como mucho cada 30 s
VIGENCIA = 30


def _carpeta(video: Video):
    return carpeta_video(video)


def config(video: Video):
    c = carpeta_canal(video.canal)
    return imagen_ai33.config(_leer_json(_carpeta(video) / "guion.json") or {}, _leer_json(c / "canal.json") or {})


def en_marcha(video: Video) -> bool:
    """¿Hay un lote de ai33 corriendo para este vídeo? (lo dice su candado img/ai33.lock)."""
    return sistema.esta_bloqueado(_carpeta(video) / "img" / "ai33.lock")


def por_mandar(video: Video, apuntadas: dict) -> list[str]:
    """Imágenes con "motor": "ai33" que faltan o tienen una versión antigua y no están ya en la cola."""
    return [i.ident for i in video.imagenes
            if i.motor == "ai33" and (not i.existe or i.desactualizada) and i.ident not in apuntadas]


def _estado(tarea):
    ahora = time.time()
    if tarea in _cache and ahora - _cache[tarea][0] < VIGENCIA:
        return _cache[tarea][1]
    estado = imagen_ai33.consultar(tarea)
    _cache[tarea] = (ahora, estado)
    return estado


def cola(video: Video, vivo=True):
    apuntadas = imagen_ai33.tareas_apuntadas(_carpeta(video) / "img")
    estados = {}
    if vivo and apuntadas:
        with ThreadPoolExecutor(max_workers=8) as ex:
            estados = dict(zip(apuntadas, ex.map(lambda a: _estado(apuntadas[a]["tarea"]), apuntadas)))
    cfg = config(video)
    faltan = por_mandar(video, apuntadas)
    previsto = len(faltan) * cfg["creditos_por_imagen"]
    return {
        "modelo": cfg["modelo"],
        "creditos_por_imagen": cfg["creditos_por_imagen"],
        "en_marcha": en_marcha(video),
        "por_mandar": faltan,
        "previsto_creditos": previsto,
        "previsto_euros": round(imagen_ai33.euros(previsto), 2),
        "apuntadas": [
            {"ident": ident, "tarea": d["tarea"], "estimado": d.get("estimado"),
             "mandada": datetime.fromtimestamp(d["mandada"]) if d.get("mandada") else None,
             "minutos": int((time.time() - d["mandada"]) / 60) if d.get("mandada") else None,
             "estado": estados.get(ident, {}).get("status"), "progreso": estados.get(ident, {}).get("progress")}
            for ident, d in sorted(apuntadas.items())
        ],
    }

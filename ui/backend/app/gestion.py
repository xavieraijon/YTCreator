"""Gestión de los vídeos de un canal (bloque 5 del recorrido profano): archivar (reversible, el vídeo sigue en su sitio y
sale de «en marcha») y mover a la papelera del espacio (data/papelera/<canal>/, fuera de git), de donde se puede
restaurar. Nada se borra para siempre desde la UI."""

import json
import shutil
from datetime import datetime
from pathlib import Path

import archivos  # noqa: E402  (herramientas/, en sys.path por config)
import espacio  # noqa: E402

from .sincronizar import titulo_humano

META = ".papelera.json"


def papelera(canal: str) -> Path:
    return espacio.DATOS / "papelera" / canal


def _leer(ruta: Path) -> dict:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def archivar(carpeta_v: Path, archivado: bool) -> None:
    """Archivado = `aparcado` en estado.json (el campo que ya entienden Claude y el índice), con la fecha."""
    ruta = carpeta_v / "estado.json"
    estado = archivos.leer_json(ruta)                 # dañado → ArchivoDanado: no se escribe encima
    if archivado:
        estado.update({"aparcado": True, "archivado": datetime.now().isoformat(timespec="seconds")})
    else:
        estado.pop("aparcado", None)
        estado.pop("archivado", None)
    archivos.escribir_json(ruta, estado)


def a_papelera(canal: str, carpeta_v: Path) -> Path:
    """Mueve la carpeta del vídeo a la papelera del canal (con un nombre único) y deja anotado de dónde venía."""
    destino_base = papelera(canal)
    destino_base.mkdir(parents=True, exist_ok=True)
    destino = destino_base / f"{carpeta_v.name}__{datetime.now():%Y%m%d-%H%M%S}"
    titulo = titulo_humano(_leer(carpeta_v / "estado.json"), _leer(carpeta_v / "guion.json"))
    shutil.move(str(carpeta_v), str(destino))
    archivos.escribir_json(destino / META, {"carpeta": carpeta_v.name, "canal": canal, "titulo": titulo,
                                            "borrado": datetime.now().isoformat(timespec="seconds")})
    return destino


def listar(canal: str) -> list[dict]:
    base = papelera(canal)
    res = []
    for d in sorted(base.iterdir(), reverse=True) if base.is_dir() else []:
        meta = _leer(d / META)
        if d.is_dir() and meta.get("carpeta"):
            res.append({"nombre": d.name, "carpeta": meta["carpeta"], "titulo": meta.get("titulo") or meta["carpeta"],
                        "borrado": meta.get("borrado")})
    return res


def restaurar(canal: str, nombre: str, videos: Path) -> str:
    """Devuelve el vídeo a su carpeta original; si ya hay otra con ese nombre, no pisa nada."""
    if "/" in nombre or nombre.startswith("."):
        raise ValueError("Nombre no válido")
    origen = papelera(canal) / nombre
    meta = _leer(origen / META)
    if not origen.is_dir() or not meta.get("carpeta"):
        raise ValueError("Ese vídeo no está en la papelera")
    destino = videos / meta["carpeta"]
    if destino.exists():
        raise ValueError(f"Ya hay un vídeo en «{meta['carpeta']}»: no se puede restaurar encima")
    (origen / META).unlink()
    videos.mkdir(parents=True, exist_ok=True)
    shutil.move(str(origen), str(destino))
    return meta["carpeta"]

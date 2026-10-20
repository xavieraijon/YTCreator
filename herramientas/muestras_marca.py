"""Muestras para elegir la marca del canal (fase F, paso 6 de la UI): miniaturas de prueba con cada tipografía y
cada paleta propuestas, sobre las imágenes del estilo elegido, y la música para escuchar. Gratis.

Uso:
    .venv/bin/python herramientas/muestras_marca.py hacer <canal>/videos/_pruebas/marca/prueba.json

La prueba (la escribe Claude):
    {"titulo": "Texto de la miniatura con *acento*",
     "propuestas": [{"id": "a", "nombre": "…", "porque": "…", "fuente": "PlayfairDisplay-Black.ttf",
                     "fuente_nombre": "Playfair Display Black", "acento": "#RRGGBB", "resaltado": "#RRGGBB",
                     "texto": "#RRGGBB", "fondo": "#RRGGBB", "musica": "misterio"}],
     "recomendada": "a", "marca": {"monograma": "…", "titulo": "…", "lema": "…", "pilares": "…"},
     "pantalla_final": {"titulo": "…", "lema": "…"}, "hashtags": ["#…"]}
Los fondos son las imágenes del estilo elegido (estado_canal.json → estilo.imagenes). Salidas, en la misma carpeta:
<id>-<n>.jpg por propuesta y fondo, musica_<ambiente>.mp3 y muestras.json (con qué se hizo cada una)."""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402
import espacio  # noqa: E402

MANIFIESTO = "muestras.json"
ID = re.compile(r"[A-Za-z0-9_-]{1,40}")
COLOR = re.compile(r"#[0-9A-Fa-f]{6}")
MAX_FONDOS = 3


def leer_prueba(ruta: Path) -> dict:
    """La prueba validada; ValueError con el motivo si no sirve."""
    try:
        d = json.loads(ruta.read_text(encoding="utf-8"))
    except OSError:
        raise ValueError(f"no existe {ruta}")
    except json.JSONDecodeError as e:
        raise ValueError(f"{ruta.name} no es un JSON válido: {e}")
    if not isinstance(d, dict) or not str(d.get("titulo") or "").strip():
        raise ValueError("falta el texto de la miniatura («titulo»)")
    props = d.get("propuestas")
    if not isinstance(props, list) or not props:
        raise ValueError("falta la lista de propuestas («propuestas»)")
    for p in props:
        if not isinstance(p, dict) or not ID.fullmatch(str(p.get("id", ""))):
            raise ValueError(f"propuesta sin id válido: {p}")
        if not str(p.get("fuente") or "").endswith((".ttf", ".otf")) or "/" in str(p["fuente"]):
            raise ValueError(f"{p['id']}: «fuente» debe ser un archivo de recursos/fuentes/")
        for c in ("acento", "resaltado", "texto", "fondo"):
            if not COLOR.fullmatch(str(p.get(c) or "")):
                raise ValueError(f"{p['id']}: «{c}» debe ser un color #RRGGBB")
    return d


def carpeta_canal(carpeta: Path) -> Path:
    """<canal>/videos/_pruebas/marca → <canal>."""
    return carpeta.parents[2]


def fondos(carpeta: Path) -> list[Path]:
    estado = carpeta_canal(carpeta) / "estado_canal.json"
    e = archivos.leer_json(estado) if estado.exists() else {}
    rutas = [canal.CANALES / r for r in (e.get("estilo") or {}).get("imagenes") or []]
    return [r for r in rutas if r.exists()][:MAX_FONDOS]


def huella(titulo: str, p: dict, fondo: Path) -> str:
    base = json.dumps([titulo, p["fuente"], p["resaltado"], fondo.name, int(fondo.stat().st_mtime)])
    return hashlib.sha1(base.encode()).hexdigest()[:12]


def recurso(tipo: str, nombre: str, carpeta: Path | None = None) -> Path:
    """Como canal.recurso, pero sin exigir canal activo si se da la carpeta de pruebas (<canal>/videos/_pruebas/marca)."""
    if carpeta is not None:
        propio = carpeta_canal(carpeta) / "recursos" / tipo / nombre
        if propio.exists():
            return propio
    return espacio.KIT / "recursos" / tipo / nombre


def fuente(nombre: str, carpeta: Path | None = None) -> Path:
    ruta = recurso("fuentes", nombre, carpeta)
    if not ruta.exists():
        raise ValueError(f"no existe la tipografía {nombre} (recursos/fuentes/)")
    return ruta


def musica(ambiente: str, destino: Path):
    origen = recurso("musica", f"{ambiente}.wav", destino.parent)
    if not origen.exists():
        raise ValueError(f"no existe la música «{ambiente}»")
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(origen), "-t", "30", "-b:a", "96k",
                        str(destino)], capture_output=True, text=True)
    if r.returncode != 0:
        raise ValueError(f"ffmpeg no pudo preparar «{ambiente}»: {r.stderr.strip()[-200:]}")


def hacer(ruta: Path) -> int:
    import miniatura
    prueba = leer_prueba(ruta)
    prueba["titulo"] = prueba["titulo"].strip()
    carpeta = ruta.parent
    imagenes = fondos(carpeta)
    if not imagenes:
        raise ValueError("el estilo elegido no tiene imágenes (paso anterior)")
    hechos = archivos.leer_json(carpeta / MANIFIESTO) if (carpeta / MANIFIESTO).exists() else {}
    props = prueba["propuestas"]
    total = len(props) * len(imagenes)
    fallos = n = 0
    for p in props:
        for i, fondo in enumerate(imagenes, 1):
            canal.progreso(n, total, p.get("nombre") or p["id"])
            n += 1
            salida = carpeta / f"{p['id']}-{i}.jpg"
            clave = huella(prueba["titulo"], p, fondo)
            if salida.exists() and (hechos.get(salida.name) or {}).get("huella") == clave:
                continue
            try:
                miniatura.FUENTE = fuente(p["fuente"], carpeta)
                miniatura.AMARILLO = tuple(int(p["resaltado"][k:k + 2], 16) for k in (1, 3, 5))
                miniatura.crear(fondo, prueba["titulo"], salida)
                hechos[salida.name] = {"huella": clave, "error": None}
            except (ValueError, SystemExit) as e:           # miniatura.py sale con sys.exit
                fallos += 1
                hechos[salida.name] = {"huella": None, "error": str(getattr(e, "code", e)).removeprefix("ERROR: ")}
                print(f"{salida.name}: {hechos[salida.name]['error']}")
            archivos.escribir_json(carpeta / MANIFIESTO, hechos)
            canal.evento("muestra", ident=salida.name, estado="error" if hechos[salida.name]["error"] else "hecha")
    for ambiente in dict.fromkeys(str(p.get("musica") or "") for p in props):
        destino = carpeta / f"musica_{ambiente}.mp3"
        if ambiente and ID.fullmatch(ambiente) and not destino.exists():
            try:
                musica(ambiente, destino)
            except ValueError as e:
                fallos += 1
                print(f"música {ambiente}: {e}")
    canal.progreso(total, total, "Hecho")
    return fallos


def main():
    p = argparse.ArgumentParser(description="Muestras de marca (tipografía, colores y música) para elegir la del canal")
    sub = p.add_subparsers(dest="orden", required=True)
    h = sub.add_parser("hacer", help="Miniaturas de prueba y música de una prueba (gratis)")
    h.add_argument("prueba", help="<canal>/videos/_pruebas/marca/prueba.json")
    a = p.parse_args()
    try:
        fallos = hacer(canal.ruta(a.prueba))
    except ValueError as e:
        sys.exit(f"ERROR: {e}")
    if fallos:
        sys.exit(f"ERROR: {fallos} muestra(s) no se pudieron hacer (el motivo está arriba); las demás están hechas")


if __name__ == "__main__":
    main()

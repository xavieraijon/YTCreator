"""Archivos de los canales para el navegador: imágenes, audio, vídeo y subtítulos, solo dentro de canales/ y
con una lista cerrada de extensiones. Las imágenes grandes se sirven también como miniatura (caché en
data/miniaturas/); el audio, como onda de picos (caché en data/picos/)."""

import array
import hashlib
import json
import subprocess
import time
import uuid
from pathlib import Path

from PIL import Image

import canal as kit_canal

from . import config

IMAGENES = {".png", ".jpg", ".jpeg", ".webp"}
AUDIOS = {".mp3", ".wav", ".m4a"}
EXTENSIONES = IMAGENES | AUDIOS | {".mp4", ".mov", ".webm", ".srt"}
CACHE = config.RAIZ / "data" / "miniaturas"
CACHE_PICOS = config.RAIZ / "data" / "picos"
ANCHOS = (240, 480, 960)
FRECUENCIA_PICOS = 11025  # Hz: de sobra para una onda de amplitud, no para oír


def resolver(ruta: str) -> Path | None:
    """Ruta relativa a canales/ → archivo, o None si sale de canales/, no existe o no está permitido."""
    base = kit_canal.CANALES.resolve()
    p = (base / ruta).resolve()
    if not p.is_relative_to(base) or not p.is_file() or p.suffix.lower() not in EXTENSIONES:
        return None
    return p


def miniatura(p: Path, ancho: int) -> Path:
    """JPEG reducido de una imagen (se rehace si la original cambia)."""
    ancho = min(ANCHOS, key=lambda a: abs(a - ancho))
    st = p.stat()
    clave = hashlib.sha1(f"{p}|{st.st_mtime_ns}|{st.st_size}|{ancho}".encode()).hexdigest()
    destino = CACHE / f"{clave}.jpg"
    if not destino.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        # Un temporal por petición: dos a la vez (la rejilla y «Detalles técnicos» piden la misma) no se pisan.
        temporal = destino.with_name(f"{clave}.{uuid.uuid4().hex}.tmp")
        try:
            with Image.open(p) as im:
                im.thumbnail((ancho, ancho * 4))
                im.convert("RGB").save(temporal, "JPEG", quality=82)
            temporal.replace(destino)
        finally:
            temporal.unlink(missing_ok=True)
    return destino


def picos(p: Path, n: int = 200) -> list[float]:
    """Onda de amplitud de un audio: `n` picos entre 0 y 1 (caché en data/picos/, se rehace si el original
    cambia). Decodifica una vez con ffmpeg a PCM mono y los agrupa; sirve para cualquier audio del kit (voz,
    música, efectos), generado ahora o antes de tener esta función."""
    st = p.stat()
    clave = hashlib.sha1(f"{p}|{st.st_mtime_ns}|{st.st_size}|{n}".encode()).hexdigest()
    destino = CACHE_PICOS / f"{clave}.json"
    if destino.exists():
        return json.loads(destino.read_text(encoding="utf-8"))
    CACHE_PICOS.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "s16le", "-ac", "1",
                        "-ar", str(FRECUENCIA_PICOS), "pipe:1"], capture_output=True, check=False)
    if r.returncode != 0:
        raise ValueError(f"ffmpeg no pudo leer {p.name}: {r.stderr.decode(errors='replace')[-300:]}")
    muestras = array.array("h", r.stdout)
    if not muestras:
        resultado = [0.0] * n
    else:
        por_grupo = max(1, len(muestras) // n)
        resultado = []
        for i in range(0, len(muestras), por_grupo):
            grupo = muestras[i:i + por_grupo]
            resultado.append(max(abs(m) for m in grupo) / 32768)
        resultado = resultado[:n]
        resultado += [0.0] * (n - len(resultado))  # audio muy corto: completar con silencio
    # Un temporal por petición: dos a la vez no se pisan (igual que miniatura()).
    temporal = destino.with_name(f"{clave}.{uuid.uuid4().hex}.tmp")
    try:
        temporal.write_text(json.dumps(resultado), encoding="utf-8")
        temporal.replace(destino)
    finally:
        temporal.unlink(missing_ok=True)
    return resultado


def limpiar_cache(max_dias: int = 90, max_bytes: int = 1_000_000_000, carpeta: Path | None = None,
                  patron: str = "*.jpg") -> int:
    """Al arrancar: una caché (miniaturas o picos) no crece sin límite. Fuera las de más de `max_dias` y, si aun
    así pasa de `max_bytes`, las más antiguas. Un archivo borrado se rehace solo la próxima vez que se pida.
    Devuelve cuántos borra."""
    carpeta = carpeta if carpeta is not None else CACHE
    if not carpeta.exists():
        return 0
    limite = time.time() - max_dias * 86400
    archivos = []
    for f in carpeta.glob(patron):
        try:
            st = f.stat()
        except OSError:
            continue
        archivos.append((st.st_mtime, st.st_size, f))
    archivos.sort()
    total = sum(t for _, t, _ in archivos)
    borradas = 0
    for mtime, tamano, f in archivos:
        if mtime >= limite and total <= max_bytes:
            break
        f.unlink(missing_ok=True)
        total -= tamano
        borradas += 1
    return borradas


def listar_medios(carpeta_c: Path, carpeta_v: Path, guion: dict):
    """Lo que se puede ver u oír de un vídeo, agrupado: vídeos montados, audio, hojas de control,
    miniaturas de YouTube y subtítulos. Rutas relativas al canal."""

    def item(p: Path, nombre=None):
        st = p.stat()
        return {"nombre": nombre or p.name, "ruta": str(p.relative_to(carpeta_c)), "bytes": st.st_size,
                "modificado": st.st_mtime}

    def existentes(*patrones):
        vistos = []
        for patron in patrones:
            vistos += [p for p in sorted(carpeta_v.glob(patron)) if p.is_file() and p not in vistos]
        return vistos

    videos = [item(p) for p in existentes("final.mp4", "short_*.mp4", "boceto.mp4")]
    audio = []
    if guion.get("voz_archivo"):
        voz = carpeta_c / guion["voz_archivo"]
        if voz.exists():
            audio.append(item(voz, f"Locución completa ({voz.name})"))
    hojas_nombres = {"contactos.png": "Hoja de contactos", "boceto_contactos.png": "Hoja del boceto",
                     "control.png": "Control de calidad (fotogramas)"}
    hojas = [item(p, hojas_nombres.get(p.name, p.name))
             for p in existentes("tmp/contactos*.png", "tmp/boceto_contactos.png", "tmp/control.png")]
    miniaturas = [item(p) for p in existentes("miniatura_*.jpg", "miniatura_*.png")]
    subtitulos = [item(p) for p in existentes("*.srt")]
    exportaciones = [item(p, "Para montar fuera (.zip)") for p in existentes("exportacion.zip")]
    return {"videos": videos, "audio": audio, "hojas": hojas, "miniaturas": miniaturas,
            "subtitulos": subtitulos, "exportaciones": exportaciones}


def audio_escena(carpeta_c: Path, carpeta_v: Path, numero: int):
    """Voz de una escena (voz/NN.wav), si existe."""
    p = carpeta_v / "voz" / f"{numero:02d}.wav"
    return str(p.relative_to(carpeta_c)) if p.exists() else None


def palabras_escena(carpeta_v: Path, numero: int) -> list[dict] | None:
    """Momento de cada palabra de la voz de una escena (voz/NN.json → "palabras"), para el karaoke. None si
    la escena no tiene ese archivo (voz sin locutar, o locución propia aún sin repartir)."""
    p = carpeta_v / "voz" / f"{numero:02d}.json"
    try:
        datos = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return datos.get("palabras") or None

"""Recursos propios subidos desde la UI (bloque B de docs/plan-mejoras-usuario.md): se puede producir sin ningún servicio
subiendo las imágenes, la locución (app/voz.py), la música, los efectos y clips de vídeo. Nada se borra para siempre: lo
sustituido va a `anteriores/`.

- Imagen propia de un hueco del guion (EE-N): `<vídeo>/img/propias/EE-N.png` y `"imagen"` en su entrada de guion.json, que
  montar.py usa en lugar de generarla. La descripción (`prompt`) se conserva: quitar la propia vuelve a generarla.
- Música propia de un ambiente: `<canal>/recursos/musica/<ambiente>.wav`, igualada a −18 LUFS como la de Suno. La usan
  todos los vídeos del canal salvo los que tengan elegida una versión de Suno (montar.py → ruta_musica).
- Efecto propio: `<canal>/recursos/sfx/<nombre>.wav`, recortado de silencio en los bordes y normalizado como
  herramientas/prep_sfx.py (CLI), para que suene justo en su instante y montar.py calcule bien su volumen medio. Se
  referencia en el guion con la marca `{nombre}`.
- Clip de vídeo propio de un hueco del guion (EE-N): `<vídeo>/video/propias/EE-N.mp4`, recodificado a h264/aac estándar;
  `"video"` (y, si se quiere mezclar su sonido bajo la voz, `"audio_clip": true`) en su entrada de guion.json, que
  montar.py monta en lugar de una imagen fija."""

import json as _json
import re
import subprocess
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from . import revision
from .modelos import Video
from .sincronizar import carpeta_canal, carpeta_video
from .voz import _apartar             # a anteriores/ con la fecha; dos en el mismo segundo no se pisan

import canal as kit_canal  # noqa: E402

EXT_IMAGEN = {".png", ".jpg", ".jpeg", ".webp"}
EXT_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
EXT_VIDEO = {".mp4", ".mov", ".webm", ".m4v"}
MAX_IMAGEN = 40 * 1024 * 1024          # 40 MB
MAX_MUSICA = 200 * 1024 * 1024         # 200 MB
MAX_EFECTO = 20 * 1024 * 1024          # 20 MB: un efecto es un sonido muy corto
MAX_VIDEO = 500 * 1024 * 1024          # 500 MB: un clip de pocos segundos
LADO_MAX = 4096                        # una foto de móvil enorme se reduce: el vídeo no pasa de 1920
LUFS = -18                             # como la música de Suno (herramientas/musica_ai33.py)
PICO_EFECTO_DB = -3.0                  # como herramientas/prep_sfx.py
UMBRAL_SILENCIO = "-50dB"              # como herramientas/prep_sfx.py
FUNDIDO_FINAL_EFECTO = 0.03            # como herramientas/prep_sfx.py
NOMBRES_RESERVADOS = {"pausa", "img"}  # marcas especiales de montar.py: no valen como nombre de efecto


def _ffprobe_info(ruta: Path) -> dict:
    """Flujos reales de un archivo (no por su extensión): {video, audio, duracion, ancho, alto}. {} si no se puede leer."""
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(ruta)],
                        capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        return {}
    try:
        datos = _json.loads(r.stdout)
    except ValueError:
        return {}
    video = next((s for s in datos.get("streams", []) if s.get("codec_type") == "video"), None)
    audio = next((s for s in datos.get("streams", []) if s.get("codec_type") == "audio"), None)
    try:
        duracion = float(datos.get("format", {}).get("duration") or (video or audio or {}).get("duration") or 0)
    except (TypeError, ValueError):
        duracion = 0.0
    return {"video": bool(video), "audio": bool(audio), "duracion": duracion,
            "ancho": video.get("width") if video else None, "alto": video.get("height") if video else None}


class ErrorPropio(ValueError):
    pass


def extension(nombre: str, permitidas: set[str]) -> str:
    ext = Path(nombre or "").suffix.lower()
    if ext not in permitidas:
        raise ErrorPropio(f"Sube un archivo {', '.join(sorted(e[1:] for e in permitidas))}; «{nombre}» no lo es")
    return ext


def _cambiar_guion(video: Video, ident: str, cambio):
    ruta = carpeta_video(video) / "guion.json"
    if not ruta.exists():
        raise ErrorPropio("El vídeo todavía no tiene guion")

    def aplicar(guion):                              # dañado → ArchivoDanado: no se toca
        try:
            spec = revision._spec(guion, ident)
        except ValueError as e:
            raise ErrorPropio(str(e))
        cambio(spec)
    kit_canal.editar_guion(ruta, aplicar)            # cerrojo y relectura: no pisa lo guardado entre medias


# --- Imágenes ---------------------------------------------------------------------------------------------------------

def guardar_imagen(video: Video, ident: str, parcial: Path) -> dict:
    """Comprueba que es una imagen de verdad (no por la extensión), la guarda en PNG y la pone en su hueco del guion."""
    if ident.startswith("v"):
        raise ErrorPropio("Por ahora solo se pueden subir las imágenes del vídeo, no las verticales de los Shorts")
    try:
        with Image.open(parcial) as im:
            im.verify()
        with Image.open(parcial) as im:
            im = im.convert("RGB")
            im.thumbnail((LADO_MAX, LADO_MAX))
            ancho, alto = im.size
            carpeta = carpeta_video(video) / "img" / "propias"
            carpeta.mkdir(parents=True, exist_ok=True)
            destino = carpeta / f"{ident}.png"
            temporal = carpeta / f"{ident}.png.part"
            im.save(temporal, "PNG")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ErrorPropio(f"No es una imagen que se pueda leer ({type(e).__name__})")
    _apartar(destino)
    temporal.replace(destino)
    relativa = destino.relative_to(carpeta_canal(video.canal)).as_posix()
    _cambiar_guion(video, ident, lambda spec: spec.__setitem__("imagen", relativa))
    return {"ident": ident, "imagen": relativa, "ancho": ancho, "alto": alto}


def quitar_imagen(video: Video, ident: str):
    """Vuelve a generarla desde su descripción; la propia pasa a img/propias/anteriores/."""
    def cambio(spec):
        if "imagen" not in spec:
            raise ErrorPropio(f"{ident} no tiene una imagen propia")
        if "prompt" not in spec:
            raise ErrorPropio(f"{ident} no tiene descripción para generarla: sube otra imagen en su lugar")
        spec.pop("imagen")
    _cambiar_guion(video, ident, cambio)
    _apartar(carpeta_video(video) / "img" / "propias" / f"{ident}.png")


# --- Música -----------------------------------------------------------------------------------------------------------

def _ruta_musica(video: Video, ambiente: str) -> Path:
    from .musica import AMBIENTE
    if not AMBIENTE.match(ambiente):
        raise ErrorPropio("Ambiente no válido")
    return carpeta_canal(video.canal) / "recursos" / "musica" / f"{ambiente}.wav"


def guardar_musica(video: Video, ambiente: str, parcial: Path) -> dict:
    """La música propia del canal para ese ambiente, igualada a −18 LUFS (si ffmpeg no la lee, no es un audio)."""
    destino = _ruta_musica(video, ambiente)
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_name(f"{ambiente}.part.wav")
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(parcial), "-vn", "-af", f"loudnorm=I={LUFS}:TP=-2:LRA=11",
                        "-ar", "48000", "-ac", "2", str(temporal)], capture_output=True, text=True, timeout=600)
    if r.returncode != 0 or not temporal.exists() or temporal.stat().st_size < 48000:
        temporal.unlink(missing_ok=True)
        raise ErrorPropio("No es un audio que se pueda leer, o está vacío")
    _apartar(destino)
    temporal.replace(destino)
    return {"ambiente": ambiente, "archivo": destino.name}


def quitar_musica(video: Video, ambiente: str):
    destino = _ruta_musica(video, ambiente)
    if not destino.exists():
        raise ErrorPropio(f"El canal no tiene música propia para «{ambiente}»")
    _apartar(destino)


# --- Efectos ------------------------------------------------------------------------------------------------------

NOMBRE_EFECTO = re.compile(r"^[a-z0-9_]{1,40}$")  # el de la marca {nombre} del guion (herramientas/gen_voz.py → MARCA)


def _ruta_efecto(canal_slug: str, nombre: str) -> Path:
    if not NOMBRE_EFECTO.match(nombre) or nombre in NOMBRES_RESERVADOS:
        raise ErrorPropio(f"Nombre de efecto no válido: solo minúsculas, números y _ (ni «{'», «'.join(NOMBRES_RESERVADOS)}»)")
    return carpeta_canal(canal_slug) / "recursos" / "sfx" / f"{nombre}.wav"


def guardar_efecto(canal_slug: str, nombre: str, parcial: Path) -> dict:
    """Efecto de sonido propio del canal: recortado de silencio en los bordes y normalizado a PICO_EFECTO_DB, como
    herramientas/prep_sfx.py (CLI). ffprobe comprueba antes que es un audio de verdad, no por su extensión."""
    destino = _ruta_efecto(canal_slug, nombre)
    info = _ffprobe_info(parcial)
    if not info.get("audio"):
        raise ErrorPropio("No es un audio que se pueda leer (sin flujo de audio)")
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_name(f"{nombre}.part.wav")
    recorte = ("aresample=48000,"
               f"silenceremove=start_periods=1:start_threshold={UMBRAL_SILENCIO},"
               f"areverse,silenceremove=start_periods=1:start_threshold={UMBRAL_SILENCIO},areverse")
    # "-v error" calla también volumedetect (loguea en nivel info): -hide_banner/-nostats, como montar.py → volumen_medio_db
    pico = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(parcial), "-af", f"{recorte},volumedetect",
                           "-f", "null", "-"], capture_output=True, text=True, timeout=120)
    try:
        pico_db = float(pico.stderr.split("max_volume:")[1].split("dB")[0])
    except (IndexError, ValueError):
        raise ErrorPropio("No se pudo analizar el audio (archivo dañado o silencio total)")
    filtros = f"{recorte},volume={PICO_EFECTO_DB - pico_db:.2f}dB"
    if info["duracion"] > FUNDIDO_FINAL_EFECTO * 4:
        filtros += f",areverse,afade=t=in:d={FUNDIDO_FINAL_EFECTO},areverse"
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(parcial), "-af", filtros,
                        "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(temporal)],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0 or not temporal.exists() or temporal.stat().st_size < 2000:
        temporal.unlink(missing_ok=True)
        raise ErrorPropio("No se pudo preparar el efecto (archivo dañado o silencio total)")
    _apartar(destino)
    temporal.replace(destino)
    duracion = _ffprobe_info(destino).get("duracion", 0.0)
    return {"nombre": nombre, "archivo": destino.name, "duracion": round(duracion, 2)}


def quitar_efecto(canal_slug: str, nombre: str):
    destino = _ruta_efecto(canal_slug, nombre)
    if not destino.exists():
        raise ErrorPropio(f"El canal no tiene un efecto propio «{nombre}»")
    _apartar(destino)


# --- Clips de vídeo -------------------------------------------------------------------------------------------------

def _cortes(ruta: Path, umbral: float = 0.3) -> int:
    """Nº de cortes de escena que detecta ffmpeg (filtro scdet): para avisar si el clip trae varios planos."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(ruta),
                        "-vf", f"scdet=threshold={umbral}", "-f", "null", "-"],
                       capture_output=True, text=True, timeout=120)
    return r.stderr.count("lavfi.scd.score")


def _fotograma(clip: Path, destino_png: Path):
    """Primer fotograma del clip, como hace montar.py al generar una imagen (hoja de contactos, miniaturas, control de
    calidad). Si fallara, no bloquea la subida: solo faltará ese adelanto hasta el siguiente montaje."""
    destino_png.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(clip), "-vframes", "1", str(destino_png)],
                   capture_output=True, text=True, timeout=60)
    destino_png.with_suffix(".firma").unlink(missing_ok=True)  # sin firma: si se quita el clip, se marca como desactualizada


def guardar_clip(video: Video, ident: str, parcial: Path, mezclar_audio: bool = False) -> dict:
    """Clip de vídeo propio para un hueco del guion, en lugar de una imagen fija. ffprobe comprueba que tiene un
    flujo de vídeo de verdad (no por su extensión); se recodifica a .mp4 h264 (+ aac si trae sonido) para que
    montar.py lo lea sin sorpresas. La descripción (`prompt`) se conserva: quitar el clip vuelve a generar la imagen."""
    if ident.startswith("v"):
        raise ErrorPropio("Por ahora solo se pueden subir clips del vídeo, no los verticales de los Shorts")
    info = _ffprobe_info(parcial)
    if not info.get("video"):
        raise ErrorPropio("No es un vídeo que se pueda leer (sin flujo de vídeo)")
    carpeta = carpeta_video(video) / "video" / "propias"
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / f"{ident}.mp4"
    temporal = carpeta / f"{ident}.part.mp4"            # acaba en .mp4 (no en .part): ffmpeg adivina el formato por la extensión
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(parcial),
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20"]
    cmd += (["-c:a", "aac", "-b:a", "160k"] if info["audio"] else ["-an"])
    cmd += [str(temporal)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if r.returncode != 0 or not temporal.exists():
        temporal.unlink(missing_ok=True)
        raise ErrorPropio("No se pudo convertir el vídeo (archivo dañado o formato no admitido)")
    _apartar(destino)
    temporal.replace(destino)
    duracion = _ffprobe_info(destino).get("duracion", 0.0)
    relativa = destino.relative_to(carpeta_canal(video.canal)).as_posix()
    _fotograma(destino, carpeta_video(video) / "img" / f"{ident}.png")
    cortes = _cortes(destino) if duracion > 0.5 else 0

    def cambio(spec):
        spec["video"] = relativa
        if mezclar_audio and info["audio"]:
            spec["audio_clip"] = True
        else:
            spec.pop("audio_clip", None)

    _cambiar_guion(video, ident, cambio)
    return {"ident": ident, "video": relativa, "duracion": round(duracion, 2),
            "ancho": info["ancho"], "alto": info["alto"], "con_audio": info["audio"],
            "audio_mezclado": bool(mezclar_audio and info["audio"]), "cortes_de_escena": cortes}


def quitar_clip(video: Video, ident: str):
    """Vuelve a generar la imagen desde su descripción; el clip propio pasa a video/propias/anteriores/."""
    def cambio(spec):
        if "video" not in spec:
            raise ErrorPropio(f"{ident} no tiene un clip propio")
        if "prompt" not in spec:
            raise ErrorPropio(f"{ident} no tiene descripción para generar una imagen: sube otro clip en su lugar")
        spec.pop("video")
        spec.pop("audio_clip", None)
    _cambiar_guion(video, ident, cambio)
    _apartar(carpeta_video(video) / "video" / "propias" / f"{ident}.mp4")
    cache = carpeta_video(video) / "img" / f"{ident}.png"      # el fotograma del clip ya no vale: que se regenere
    cache.unlink(missing_ok=True)
    cache.with_suffix(".firma").unlink(missing_ok=True)

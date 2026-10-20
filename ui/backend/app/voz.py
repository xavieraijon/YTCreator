"""Voz de un vídeo por la API de ai33 (DE PAGO): qué bloques faltan y cuánto costarían, con el mismo cálculo que
montar.py (`--previsto-voz`, gratis: no llama a ningún servicio). La locución la lanza la tarea `voz_ai33`
(montar.py --solo-voces … --gastar-ai33) solo con el coste confirmado por el usuario.

Locución hecha fuera (p. ej. en la web de ai33): se sube con `guardar_externa` a `<vídeo>/voz/externa.<ext>` y queda en
guion.json → "voz_archivo"; la tarea gratuita `voz_externa` (montar.py --solo-voces <todas>) la reparte por escenas con los
tiempos de cada palabra. `quitar_externa` vuelve a la voz del canal (el archivo pasa a voz/anteriores/: no se borra).

Pantalla de karaoke (escuchar y corregir escena a escena): otra toma de una sola escena con la voz del canal es la
tarea gratuita `voz_escena` (montar.py --escena-sola N, sin --gastar-ai33; `prevista_escena` calcula el coste antes
para comprobar que esa voz no es de pago). Marcar una escena como «suena mal» sin corregirla aún (`marcar_mal`,
`desmarcar`, `revision`) se guarda en `<vídeo>/revision_voz.json`, aparte del guion."""

import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

from . import config
from .modelos import Video
from .sincronizar import carpeta_canal, carpeta_video

import archivos  # noqa: E402  (herramientas/, en sys.path por config)
import canal as kit_canal  # noqa: E402
import servicios  # noqa: E402

EXT_AUDIO = (".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac")
MAX_LOCUCION = 300 * 1024 * 1024        # 300 MB: una locución de 20 min en wav ronda los 200

ESCENAS = re.compile(r"^\d{1,3}(,\d{1,3})*$")


class ErrorVoz(ValueError):
    pass


def prevista(video: Video, escenas: str = "", rehacer: bool = False) -> dict:
    """{bloques: [{escenas, caracteres, hecho, de_pago}], pendientes, caracteres_de_pago, creditos, euros, voz}.
    Con `rehacer`, el coste de repetir esas escenas aunque ya estén locutadas (otra toma)."""
    import imagen_ai33                                   # herramientas/ (config la pone en sys.path)
    escenas = (escenas or "").replace(" ", "")
    if escenas and not ESCENAS.match(escenas):
        raise ErrorVoz("Escenas separadas por comas (p. ej. 1,2,3)")
    guion = carpeta_video(video) / "guion.json"
    if not guion.exists():
        raise ErrorVoz("El vídeo todavía no tiene guion")
    cmd = [str(config.PYTHON), str(config.HERRAMIENTAS / "montar.py"), str(guion), "--previsto-voz"]
    if escenas:
        cmd += ["--solo-voces", escenas]
    if escenas and rehacer:
        cmd += ["--rehacer-voces", escenas]
    r = subprocess.run(cmd, cwd=config.RAIZ, capture_output=True, text=True, timeout=120,
                       env={**os.environ, "CANAL": video.canal})
    if r.returncode != 0:
        raise ErrorVoz((r.stderr or r.stdout).strip()[-300:] or "montar.py --previsto-voz falló")
    try:
        datos = json.loads(r.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        raise ErrorVoz("No se pudo calcular el coste de la voz")
    if not escenas:
        # Bloques locutados en los que solo ha cambiado el texto de UNA escena: se locuta esa sola (↻), no el
        # bloque entero, así que no cuentan como pendientes (montar.py --escena-sola lo admite).
        for b in datos["bloques"]:
            if not b["hecho"] and len(b.get("cambiadas") or []) == 1:
                b["solo_escena"] = b["cambiadas"][0]
                datos["pendientes"] -= 1
                if b["de_pago"]:
                    datos["caracteres_de_pago"] -= b["caracteres"]
        datos["creditos"] = round(datos["caracteres_de_pago"] * 1.15)
    datos["euros"] = round(imagen_ai33.euros(datos["creditos"]), 3)
    try:                                                 # nombre legible de la voz del canal (y su modelo)
        cfg = json.loads((carpeta_canal(video.canal) / "canal.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cfg = {}
    if datos.get("voz") == cfg.get("voz"):
        datos["nombre_voz"] = cfg.get("nombre_voz")
    datos["modelo"] = cfg.get("modelo_voz_ai33") if (datos.get("voz") or "").startswith("ai33:") else None
    datos["externa"] = externa(video)
    return datos


def _duracion(ruta: Path) -> float | None:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(ruta)], capture_output=True, text=True, timeout=30)
    try:
        return float(r.stdout.strip()) if r.returncode == 0 else None
    except ValueError:
        return None


def _ruta_externa(video: Video) -> Path | None:
    try:
        rel = archivos.leer_json(carpeta_video(video) / "guion.json").get("voz_archivo")
    except (OSError, ValueError, AttributeError):
        return None
    return carpeta_canal(video.canal) / rel if rel else None


def externa(video: Video) -> dict | None:
    """{archivo, existe, duracion} de la locución hecha fuera del guion ("voz_archivo"), o None si usa la voz del canal."""
    ruta = _ruta_externa(video)
    if not ruta:
        return None
    return {"archivo": ruta.name, "existe": ruta.is_file(), "duracion": _duracion(ruta) if ruta.is_file() else None}


def _cambiar_guion(video: Video, cambio):
    """Lee guion.json estricto (si está dañado, ArchivoDanado: no se toca), aplica `cambio` y lo guarda sellado."""
    ruta = carpeta_video(video) / "guion.json"
    if not ruta.exists():
        raise ErrorVoz("El vídeo todavía no tiene guion")
    kit_canal.editar_guion(ruta, lambda guion: [cambio(guion)])    # cerrojo y relectura; siempre se guarda


SINCRONIAS = ("exacta", "aproximada")


def sincronia(video: Video) -> dict:
    """Cómo se saca el momento de cada palabra en las voces que no lo dan (Gemini, ai33, una locución subida): la elegida
    para este vídeo (guion.json → "sincronia") o, sin elegir, la exacta si se usa Azure y si no la aproximada."""
    ruta = carpeta_video(video) / "guion.json"
    try:
        elegida = archivos.leer_json(ruta).get("sincronia")
    except (OSError, ValueError, AttributeError):
        elegida = None
    exacta = servicios.disponible("azure", config.RAIZ / ".env")
    elegida = elegida if elegida in SINCRONIAS else None
    return {"elegida": elegida, "efectiva": elegida or ("exacta" if exacta else "aproximada"), "exacta_posible": exacta}


def elegir_sincronia(video: Video, valor: str | None) -> dict:
    """Guarda la sincronía del vídeo (None = la de por defecto). No rehace voces ya hechas: vale para las próximas."""
    if valor is not None and valor not in SINCRONIAS:
        raise ErrorVoz("Elige la sincronía exacta o la aproximada")
    _cambiar_guion(video, lambda g: g.__setitem__("sincronia", valor) if valor else g.pop("sincronia", None))
    return sincronia(video)


def _apartar(ruta: Path):
    """La locución anterior, a voz/anteriores/ con la fecha (nada se borra para siempre)."""
    if ruta.is_file():
        base = ruta.parent / "anteriores" / f"{ruta.stem}-{time.strftime('%Y%m%d-%H%M%S')}"
        destino, n = base.with_suffix(ruta.suffix), 1
        while destino.exists():                     # dos en el mismo segundo: ninguna pisa a la otra
            n += 1
            destino = base.with_name(f"{base.name}-{n}{ruta.suffix}")
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(ruta, destino)


def comprobar_nombre(nombre: str) -> str:
    ext = Path(nombre or "").suffix.lower()
    if ext not in EXT_AUDIO:
        raise ErrorVoz(f"Sube un audio ({', '.join(e[1:] for e in EXT_AUDIO)}); «{nombre}» no lo es")
    return ext


def guardar_externa(video: Video, parcial: Path, ext: str) -> dict:
    """Coloca el audio ya recibido (`parcial`, en la carpeta voz/) como la locución del vídeo y lo apunta en guion.json.
    Si no es un audio que ffmpeg entienda, se descarta y no cambia nada."""
    duracion = _duracion(parcial)
    if not duracion or duracion < 1:
        parcial.unlink(missing_ok=True)
        raise ErrorVoz("Ese archivo no es un audio que se pueda leer (o dura menos de un segundo)")
    voz = carpeta_video(video) / "voz"
    for viejo in voz.glob("externa.*"):
        if viejo.suffix.lower() in EXT_AUDIO:
            _apartar(viejo)
    destino = voz / f"externa{ext}"
    parcial.replace(destino)
    rel = destino.relative_to(carpeta_canal(video.canal)).as_posix()
    _cambiar_guion(video, lambda g: g.__setitem__("voz_archivo", rel))
    return {"archivo": destino.name, "existe": True, "duracion": duracion}


def quitar_externa(video: Video):
    """Vuelve a la voz del canal: quita "voz_archivo" del guion y aparta el archivo a voz/anteriores/."""
    actual = _ruta_externa(video)
    _cambiar_guion(video, lambda g: g.pop("voz_archivo", None))
    if actual and actual.resolve().is_relative_to(carpeta_video(video).resolve()):   # lo de fuera del vídeo, ni tocarlo
        _apartar(actual)


def escenas_pendientes(datos: dict, solo_primero: bool = False) -> str:
    """Las escenas de los bloques que faltan (o solo las del primero, para probar la voz)."""
    bloques = [b for b in datos["bloques"] if not b["hecho"] and not b.get("solo_escena")]
    if solo_primero:
        bloques = bloques[:1]
    return ",".join(str(i) for b in bloques for i in b["escenas"])


def escenas_hechas(datos: dict, escenas: str) -> str:
    """Valida que las escenas a repetir son bloques ya locutados y devuelve sus bloques enteros (montar.py
    rehace el bloque completo de cada escena)."""
    pedidas = {int(x) for x in (escenas or "").replace(" ", "").split(",") if x.isdigit()}
    if not pedidas:
        raise ErrorVoz("Faltan las escenas a repetir")
    bloques = [b for b in datos["bloques"] if pedidas & set(b["escenas"])]
    if not bloques or not all(b["hecho"] for b in bloques):
        raise ErrorVoz("Solo se repiten bloques ya locutados (los que faltan se locutan con el botón de arriba)")
    return ",".join(str(i) for b in bloques for i in b["escenas"])


def editar_texto_escena(video: Video, escena: int, texto: str):
    """Cambia el texto de una escena en el guion (lo demás de la escena no se toca). montar.py compara con
    la voz ya locutada: si solo cambió esta escena de un bloque ya hecho, `prevista` ofrece rehacerla sola
    (--escena-sola), sin tocar el resto del bloque."""
    texto = (texto or "").strip()
    if not texto:
        raise ErrorVoz("El texto de la escena no puede quedar vacío")

    def cambio(guion):
        escenas = guion.get("escenas") or []
        if not 1 <= escena <= len(escenas):
            raise ErrorVoz(f"Este guion no tiene la escena {escena}")
        escenas[escena - 1]["texto"] = texto
    _cambiar_guion(video, cambio)


ARCHIVO_REVISION = "revision_voz.json"


def _revision_leer_para_escribir(carpeta_v: Path) -> dict:
    """Las marcas de «suena mal» para modificarlas: si el archivo está dañado, ArchivoDanado (no se pierden)."""
    return archivos.leer_json(carpeta_v / ARCHIVO_REVISION)


def revision(carpeta_v: Path) -> dict:
    """{numero: {"estado": "mal", "motivo", "fecha"}} de las escenas pendientes de revisar la voz."""
    try:
        return json.loads((carpeta_v / ARCHIVO_REVISION).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def marcar_mal(video: Video, escena: int, motivo: str):
    """Marca una escena como «suena mal» (lista de pendientes de la fase de voz); no toca el guion ni la voz."""
    motivo = (motivo or "").strip()
    if not motivo:
        raise ErrorVoz("Falta decir qué suena mal")
    carpeta_v = carpeta_video(video)
    datos = _revision_leer_para_escribir(carpeta_v)
    datos[str(escena)] = {"estado": "mal", "motivo": motivo[:300], "fecha": time.strftime("%Y-%m-%dT%H:%M:%S")}
    archivos.escribir_json(carpeta_v / ARCHIVO_REVISION, datos)


def desmarcar(video: Video, escena: int):
    """Quita una escena de la lista de pendientes (ya se corrigió, o no hacía falta)."""
    carpeta_v = carpeta_video(video)
    datos = _revision_leer_para_escribir(carpeta_v)
    if datos.pop(str(escena), None) is not None:
        archivos.escribir_json(carpeta_v / ARCHIVO_REVISION, datos)


def prevista_escena(video: Video, escena: int) -> dict:
    """Coste de otra toma de UNA escena de un bloque ya locutado (montar.py --escena-sola N --previsto-voz)."""
    guion = carpeta_video(video) / "guion.json"
    r = subprocess.run([str(config.PYTHON), str(config.HERRAMIENTAS / "montar.py"), str(guion), "--escena-sola",
                        str(int(escena)), "--previsto-voz"], cwd=config.RAIZ, capture_output=True, text=True,
                       timeout=120, env={**os.environ, "CANAL": video.canal})
    if r.returncode != 0:
        raise ErrorVoz((r.stderr or r.stdout).strip().splitlines()[-1][-300:] if (r.stderr or r.stdout).strip()
                       else "montar.py --escena-sola falló")
    import imagen_ai33
    datos = json.loads(r.stdout.strip().splitlines()[-1])
    datos["euros"] = round(imagen_ai33.euros(datos["creditos"]), 3)
    return datos

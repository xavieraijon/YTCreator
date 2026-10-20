"""Monta un vídeo completo a partir de un guion.json: voz, imágenes animadas, rótulos, efectos, música,
subtítulos, Shorts, miniaturas y textos de publicación.

Uso:
    .venv/bin/python herramientas/montar.py videos/001-pulpo/guion.json
    .venv/bin/python herramientas/montar.py videos/001-pulpo/guion.json --solo-imagenes      # revisar antes
    .venv/bin/python herramientas/montar.py videos/001-pulpo/guion.json --solo-voces 1,2    # probar la voz
    .venv/bin/python herramientas/montar.py videos/001-pulpo/guion.json --rehacer-imagenes 3,5-2
    .venv/bin/python herramientas/montar.py videos/001-pulpo/guion.json --solo-imagenes --rehacer-imagenes 13-2 --solo
        (solo esa imagen; las demás que falten, no; hoja en tmp/contactos_rehechas.png)
    .venv/bin/python herramientas/montar.py videos/001-pulpo/guion.json --rehacer-voces 2   # otra toma
    .venv/bin/python herramientas/montar.py videos/001-pulpo/guion.json --motor local      # imágenes en el Mac
    .venv/bin/python herramientas/montar.py videos/001-pulpo/guion.json --boceto           # storyboard sin cuota
Antes de producir: .venv/bin/python herramientas/revisar_guion.py videos/001-pulpo/guion.json

Lo propio del canal (voz, estilo, personajes, referencias, colores, pantalla final, hashtags) viene de
canal.json; el guion solo necesita esos campos si quiere cambiarlos.

Formato del guion (rutas relativas a la raíz del proyecto):
{
  "titulo": "¿El pulpo tiene nueve cerebros?",
  "duracion_objetivo": 5,                            # minutos (3, 5, 10 o los que sean); lo usa revisar_guion.py
  "titulos": ["opción 1", "opción 2", "opción 3"],   # alternativas para publicacion.md
  "formato": "horizontal",
  "referencias": [...], "estilo": "...",             # opcionales: por defecto, los de canal.json
  "pilar": "historia",                              # historia | naturaleza | universo | ciencia: elige la
                                                    # paleta de canal.json → "paletas" ({paleta} del estilo)
  "personajes": {"abeja": "a stick-figure bee ..."}, # los de ESTE vídeo ({abeja}); se suman a los del
                                                     # canal ({tok}), que no hace falta repetir
  "musica": "alegre",                                # por defecto (recursos/musica/<nombre>.wav o ruta)
  "descripcion": "...", "etiquetas": ["..."], "fuentes": ["https://..."],
  "comentario_fijado": "...",
  "miniaturas": [{"prompt": "fondo sin Tok", "texto": "¿*9* cerebros?", "lado": "izquierda",
                  "pose": "sorprendido"}, ...],      # pose: patrón "poses" de canal.json
                                                     # en vez de "prompt", "fondo": "ruta.png" (ya hecha)
  "pantalla_final": {"texto": "..."},                # opcional: cambia la de canal.json; false la quita
  "tipo": "short",                                   # solo para un Short independiente (/nuevo-short):
                                                     # con "formato": "vertical", sin pantalla final ni
                                                     # capítulos, y publicacion.md para Shorts/TikTok/Reels
  "titulo_pantalla": "El pulpo piensa con los *brazos*",   # título grande los 3 primeros segundos
  "ai33": {"modelo": "gemini-3.1-flash-image-preview",   # opcional: imágenes con "motor": "ai33"
           "referencias_estilo": ["videos/NNN-slug/img/07-5.png"]},   # (ver imagen_ai33.py)
  "version_esquema": 1,                           # lo pone la app (herramientas/esquema.py); sin él = 0, se migra al leer
  "voz_archivo": "videos/NNN-slug/voz/web.mp3",   # opcional: locución hecha fuera (web de ai33...) de todo
                                                   # el texto; no se gasta voz: solo se alinea y se reparte
  "sincronia": "aproximada",                      # opcional: "exacta" (Azure) o "aproximada" (silencios, sin servicios)
                                                   # para las voces que no dan el momento de cada palabra
  "shorts": [{"escenas": [4, 6], "titulo": "...", "descripcion": "...",
              "vertical": true,                      # imágenes verticales propias (img/vertical/)
              "gancho": "¿Sabías que...?"}],         # frase propia antes de la primera escena
  "escenas": [
    {"texto": "Frase uno.{img} Frase dos con {boing}efecto.",
     "musica": "tranquilo",                          # opcional: cambia la música desde aquí
     "capitulo": "La llegada",                       # opcional: capítulo de YouTube
     "estilo_voz": "curious",                        # opcional: emoción de la voz en esta escena
     "imagenes": [                                   # una por tramo entre marcas {img}
       {"prompt": "{tok} ...", "personaje": true, "movimiento": "zoom_in", "rotulo": "Año 1582",
        "semilla": 123},                             # opcional: repite una imagen local (img/EE-N.semilla)
       {"prompt": "...", "motor": "ai33"},           # DE PAGO: la genera ai33 (p. ej. Nano Banana 2) en vez
                                                     # de klein; necesita --gastar-ai33 (imagen_ai33.py)
       {"reutilizar": "02-1", "movimiento": "zoom_out"},
       {"video": "videos/NNN-slug/google/anim_02-3.mp4", "desde": 0.5,
        "audio_clip": true}                          # mezcla el sonido del clip bajo la voz (si no, mudo)
     ]}
  ]
}
Clips animados: "video" es un .mp4 que se pone en ese tramo en lugar de una imagen fija; se encuadra a la
pantalla (recorte centrado), empieza en "desde" (segundos, 0 por defecto), se corta al largo del tramo y,
si es más corto, se congela en su último fotograma (aviso en consola; el audio, si se mezcla, se queda en
silencio el resto del tramo). Su sonido no se usa salvo con "audio_clip": true (se mezcla bajo la voz, a
NIVEL_CLIP_DB de media, sin corte brusco). Su primer fotograma se guarda como img/EE-N.png (hoja de
contactos, miniaturas y control de calidad).
Si una escena tiene una sola imagen, puede llevar "prompt"/"imagen"/"personaje"/"movimiento"/"rotulo"
directamente, sin "imagenes". Cada imagen se identifica como "EE-N" (escena, número) e img/EE-N.png.

Voz y efectos: {nombre} reproduce recursos/sfx/<nombre>.wav y abre en la voz un silencio del largo
del efecto (ponerlos entre frases). {ding:300} fija el silencio; {ding:0} va encima de la voz.
{img} cambia de imagen en ese punto (no suena nada). Imágenes de más de MAX_PLANO s dan aviso.

Música: cada escena usa su "musica" o la de la anterior. "ninguna" = sin música. Fundidos de 1,5 s.
Si el vídeo tiene música elegida de Suno (<vídeo>/musica/<ambiente>.mp3, herramientas/musica_ai33.py), va esa.

Pantalla final: al final del vídeo largo se añaden unos segundos sin voz (20 por defecto) con el
personaje en la mitad izquierda y la derecha libre para los elementos de pantalla final de YouTube.

Salida en la carpeta del guion: final.mp4, subtitulos.srt, miniatura_N.jpg, short_N.mp4,
publicacion.md, tmp/linea_tiempo.json (para fotogramas.py) y tmp/contactos.png. Con --boceto:
boceto/, tmp/boceto_contactos.png y boceto.mp4. En montaje.log queda cada ejecución: sus fases con lo que tardaron
y cada orden de ffmpeg (con su error si falló).
"""

import argparse
import difflib
import hashlib
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402
import gen_imagen  # noqa: E402
import gen_voz  # noqa: E402
import imagen_ai33  # noqa: E402
import espacio  # noqa: E402
import proveedores  # noqa: E402
import servicios  # noqa: E402
import simulacion  # noqa: E402
import subtitulos  # noqa: E402

RAIZ = espacio.ESPACIO       # el espacio de trabajo: los vídeos se muestran y se montan con rutas relativas a él
DIR_FUENTES = RAIZ / "recursos" / "fuentes"   # biblioteca común (libass busca aquí por nombre de familia)
FPS = 30
TAMANOS = {"horizontal": (1920, 1080), "vertical": (1080, 1920)}
PAUSA_ESCENA = 0.35        # silencio tras la voz de cada escena
# Silencio al pasar de un bloque de voz al siguiente (otra locución: la voz arranca de nuevo y necesita aire).
PAUSA_BLOQUE = canal.get("pausa_entre_bloques", PAUSA_ESCENA)
ZOOM = 0.12                # cuánto se acerca/aleja la cámara (12 %)
MOVIMIENTOS = ["zoom_in", "derecha", "zoom_out", "izquierda", "abajo", "arriba"]   # rotación por defecto
MOVIMIENTOS_VALIDOS = MOVIMIENTOS + ["fijo"]
NIVEL_SFX_DB = -33.0       # volumen medio de los efectos (la voz ronda -23 dB: quedan 10 dB por debajo)
NIVEL_CLIP_DB = -30.0      # volumen medio del audio de un clip propio con "audio_clip": true, bajo la voz
FUNDIDO = 0.25             # fundido encadenado entre imágenes, en segundos
PAUSA_SFX_MAX = 1.2        # silencio automático máximo que abre un efecto en la voz
PAUSA_SFX_INICIO = 0.4     # al empezar una escena la voz no espera a que acabe el efecto
VOLUMEN_MUSICA = 0.18      # validado por el usuario
FUNDIDO_MUSICA = 1.5       # segundos de fundido al cambiar de música
LUFS_OBJETIVO = -14        # volumen de referencia de YouTube
MAX_PLANO = 8.0            # ninguna imagen debería estar más tiempo en pantalla
MARCA_IMAGEN = "img"
MAX_BLOQUE_VOZ = 1500      # caracteres que se locutan de una vez (canal.json: "caracteres_bloque_voz")
CREDITOS_CARACTER_AI33 = proveedores.valor("ai33.creditos_por_caracter")   # voz de ai33 (cuota.py)


LOG_FFMPEG = None          # <vídeo>/montaje.log (lo abre abrir_log): cada orden de ffmpeg, su fase y su error
MAX_LOG_FFMPEG = 2_000_000  # bytes; al pasarse se queda la mitad más reciente


def abrir_log(carpeta, argumentos):
    """Empieza en <vídeo>/montaje.log el registro de esta ejecución (se añade a las anteriores) para poder responder
    «¿por qué falló este montaje?» aunque la salida de la tarea ya no esté a mano."""
    global LOG_FFMPEG, _inicio_fase
    LOG_FFMPEG = carpeta / "montaje.log"
    try:
        if LOG_FFMPEG.stat().st_size > MAX_LOG_FFMPEG:
            datos = LOG_FFMPEG.read_bytes()[-MAX_LOG_FFMPEG // 2:]
            LOG_FFMPEG.write_bytes(datos[datos.find(b"\n") + 1:])
    except OSError:
        pass
    _inicio_fase = None
    _escribir_log(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} montar.py {shlex.join(argumentos)}\n")


def _escribir_log(texto):
    if not LOG_FFMPEG:
        return
    try:
        with open(LOG_FFMPEG, "a", encoding="utf-8") as f:
            f.write(texto)
    except OSError:
        pass              # el log nunca tumba un montaje


_inicio_fase = None        # (nombre, instante) de la fase en curso


def fase(porcentaje, nombre):
    """Cambio de fase: mueve la barra de la UI y apunta en montaje.log cuánto tardó la anterior."""
    global _inicio_fase
    ahora = time.monotonic()
    if _inicio_fase:
        _escribir_log(f"-- {_inicio_fase[0]}: {ahora - _inicio_fase[1]:.1f} s\n")
    _inicio_fase = (nombre, ahora) if nombre != "Hecho" else None
    if nombre != "Hecho":
        _escribir_log(f"-- {nombre} ({time.strftime('%H:%M:%S')})\n")
    canal.progreso(porcentaje, 100, nombre)


def registrar_orden(cmd, codigo, segundos, error=""):
    """Una orden de ffmpeg/ffprobe en montaje.log; si falló, con el final de su error."""
    linea = f"[{time.strftime('%H:%M:%S')}] {shlex.join(map(str, cmd))}\n    código {codigo}, {segundos:.1f} s\n"
    if codigo != 0 and error:
        linea += "".join(f"    | {x}\n" for x in error[-4000:].splitlines())
    _escribir_log(linea)


def correr(cmd):
    """subprocess.run de ffmpeg/ffprobe con la salida capturada, apuntado en montaje.log."""
    t = time.monotonic()
    r = subprocess.run(cmd, capture_output=True, text=True)
    registrar_orden(cmd, r.returncode, time.monotonic() - t, r.stderr)
    return r


def ffmpeg(*args):
    r = correr(["ffmpeg", "-v", "error", "-y", *map(str, args)])
    if r.returncode != 0:
        sys.exit(f"ERROR ffmpeg: {r.stderr[-800:]}")


ruta = canal.ruta          # rutas de guion: absolutas, relativas al directorio actual o a la carpeta del canal


def ruta_sfx(nombre):
    return canal.recurso("sfx", f"{nombre}.wav")


CARPETA_VIDEO = None       # la fija main(): la música elegida para el vídeo manda sobre la del canal


def ruta_musica(nombre):
    """Ruta suelta, o el ambiente: primero el elegido para el vídeo (<vídeo>/musica/<ambiente>.mp3, de Suno con
    herramientas/musica_ai33.py), luego la música propia del canal (<canal>/recursos/musica/<ambiente>.wav) y, si el
    usuario usa la «Música incluida» (Ajustes → Servicios), la del kit. Sin ninguna: None (el vídeo va sin música)."""
    if "/" in nombre:
        return ruta(nombre)
    if CARPETA_VIDEO and (CARPETA_VIDEO / "musica" / f"{nombre}.mp3").exists():
        return CARPETA_VIDEO / "musica" / f"{nombre}.mp3"
    archivo = canal.recurso("musica", f"{nombre}.wav")
    if archivo.is_relative_to(canal.carpeta()) or servicios.disponible("sintetizador"):
        return archivo
    if nombre not in _sin_musica:
        _sin_musica.add(nombre)
        print(f"  Aviso: sin música «{nombre}» (no usas la música incluida y el canal no tiene la suya)")
    return None


_sin_musica: set = set()       # ambientes ya avisados como «sin música» en este montaje


_volumenes: dict = {}      # volumen medio de cada efecto, medido una vez por montaje


def volumen_medio_db(archivo):
    if archivo not in _volumenes:
        r = correr(["ffmpeg", "-hide_banner", "-nostats", "-i", str(archivo), "-af", "volumedetect",
                    "-f", "null", "-"]).stderr
        _volumenes[archivo] = float(r.split("mean_volume:")[1].split("dB")[0])
    return _volumenes[archivo]


def huella(*partes):
    return hashlib.sha1("\x1f".join(map(str, partes)).encode()).hexdigest()[:12]


def duracion_s(archivo):
    r = correr(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(archivo)])
    return float(r.stdout.strip())


# ---------- 1. Voz ----------

def expandir_efectos(texto):
    """Convierte cada {efecto} que necesita hueco en {efecto}{pausa:ms}, para que suene en un silencio de
    la voz. Solo los de canal.json → "efectos_con_hueco" (voces, como el saludo de Tok): el resto suena
    por encima de la voz sin cortarla, porque los huecos rompían el ritmo del narrador. {efecto:ms}
    fuerza un hueco concreto en cualquier efecto."""
    marca = gen_voz.MARCA
    con_hueco = canal.get("efectos_con_hueco")

    def sustituir(m):
        nombre, valor = m.group(1).lower(), m.group(2)
        if nombre in ("pausa", MARCA_IMAGEN):
            return m.group(0)
        if valor is None and con_hueco is not None and nombre not in con_hueco:
            return m.group(0)                        # suena encima de la voz
        sfx = ruta_sfx(nombre)
        if valor is not None:
            ms = int(valor)
        elif texto[m.end():].lstrip().startswith("{pausa"):
            ms = 0                                   # ya lleva una pausa escrita a mano
        elif sfx.exists():
            al_inicio = gen_voz.contar_palabras(marca.sub(" ", texto[:m.start()])) == 0
            if con_hueco is not None and nombre in con_hueco:
                ms = int(duracion_s(sfx) * 1000) + 150   # una voz (saludo): hueco completo
            else:
                ms = int(min(duracion_s(sfx), PAUSA_SFX_INICIO if al_inicio else PAUSA_SFX_MAX) * 1000)
        else:
            ms = 0
        return f"{{{nombre}}}" + (f"{{pausa:{ms}}}" if ms else "")

    return marca.sub(sustituir, texto)


def ajustes_voz(guion, escena=None):
    """(voz, velocidad, estilo, pausa_max) de una escena. Por defecto, los de canal.json; el guion y
    cada escena pueden cambiarlos ("voz", "velocidad", "estilo_voz", "pausa_max"). Los Shorts
    independientes usan "velocidad_short" y la pausa máxima de Short."""
    escena = escena or {}
    short = guion.get("tipo") == "short"
    voz = guion.get("voz", gen_voz.VOZ_DEFECTO)
    velocidad = guion.get("velocidad_short" if short else "velocidad",
                          canal.get("velocidad_short") if short else None) or guion.get("velocidad", gen_voz.VELOCIDAD_DEFECTO)
    # El estilo del canal solo vale para la voz del canal (otra voz puede no admitirlo).
    estilo = escena.get("estilo_voz") or guion.get("estilo_voz") or (
        canal.get("estilo_voz") if voz == canal.get("voz") else None)
    pausa_max = guion.get("pausa_max", (canal.get("pausa_max") or {}).get("short" if short else "video"))
    return voz, velocidad, estilo, pausa_max


def sintetizar_aislado(texto, wav, voz, velocidad, estilo=None, pausa_max=None, audio=None):
    """Genera la voz en un proceso aparte: si la librería nativa de Azure se cierra de golpe
    (segmentation fault esporádico), el montaje no muere y se reintenta."""
    txt = wav.with_suffix(".txt")
    txt.parent.mkdir(parents=True, exist_ok=True)
    txt.write_text(texto, encoding="utf-8")
    cmd = [sys.executable, str(Path(__file__).with_name("gen_voz.py")), "-f", str(txt), "-o", str(wav),
           "--voz", voz, "--velocidad", velocidad, "--estilo", estilo or "ninguno",
           "--pausa-max", str(pausa_max or 0)] + (["--audio", str(audio)] if audio else []) \
        + (["--sincronia", SINCRONIA] if SINCRONIA else [])
    for intento in range(1, 4):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            txt.unlink()
            return
        if r.returncode > 0:            # error normal (clave, texto...): no tiene sentido reintentar
            sys.exit(r.stdout + r.stderr)
        print(f"  Aviso: la librería de Azure se cerró (código {r.returncode}); reintento {intento}/3")
    sys.exit("ERROR: la generación de voz falló 3 veces seguidas")


def bloques_voz(guion):
    """Grupos de escenas seguidas que se locutan DE UNA VEZ (entonación continua, sin cortes entre
    escenas). Un bloque se cierra al pasar de MAX_BLOQUE_VOZ caracteres o si cambian los ajustes de
    voz (p. ej. otro "estilo_voz" en una escena). Devuelve [[índices de escena (1..n)], ...]."""
    if guion.get("voz_archivo"):                    # locución hecha fuera: todo el guion es un bloque
        return [list(range(1, len(guion["escenas"]) + 1))]
    maximo = canal.get("caracteres_bloque_voz", MAX_BLOQUE_VOZ)
    bloques, actual, largo, ajustes = [], [], 0, None
    for i, escena in enumerate(guion["escenas"], 1):
        aj = ajustes_voz(guion, escena)
        n = len(escena["texto"])
        if actual and (largo + n > maximo or aj != ajustes):
            bloques.append(actual)
            actual, largo = [], 0
        actual.append(i)
        largo += n
        ajustes = aj
    if actual:
        bloques.append(actual)
    return bloques


def marcas_propias(texto_expandido):
    """Nº de marcas (no {pausa}) que gen_voz.py devolverá para este texto, en orden."""
    return sum(1 for m in gen_voz.MARCA.finditer(texto_expandido) if m.group(1).lower() != "pausa")


def repartir_bloque(carpeta, bloque, textos, wav_bloque):
    """Corta la locución de un bloque en una voz por escena (voz/NN.wav + .json). Cada corte va en
    mitad del silencio entre la última palabra de una escena y la primera de la siguiente; dentro
    del bloque no se añade pausa entre escenas ("pausa_tras": 0)."""
    d = json.loads(wav_bloque.with_suffix(".json").read_text(encoding="utf-8"))
    with wave.open(str(wav_bloque)) as w:
        params, audio = w.getparams(), w.readframes(w.getnframes())
    frecuencia, total = params.framerate, d["duracion"]
    n_pal = [gen_voz.contar_palabras(gen_voz.MARCA.sub(" ", t)) for t in textos]
    n_mar = [marcas_propias(expandir_efectos(t)) for t in textos]
    pal, marcas = d["palabras"], d["marcas"]
    # Las palabras de gen_voz pueden unir dos \w+ ("Toc-toc,"): se reparten por conteo acumulado.
    acumulado, limites_pal, k = 0, [], 0
    for n in n_pal:
        objetivo = acumulado + n
        while k < len(pal) and acumulado < objetivo:
            acumulado += max(1, gen_voz.contar_palabras(pal[k]["texto"]))
            k += 1
        limites_pal.append(k)
    cortes = [0.0]
    for j in range(len(bloque) - 1):
        ultima, primera = limites_pal[j] - 1, limites_pal[j]
        fin_ant = pal[ultima]["fin"] if 0 <= ultima < len(pal) else cortes[-1]
        ini_sig = pal[primera]["inicio"] if primera < len(pal) else total
        cortes.append(round((fin_ant + ini_sig) / 2, 3))
    cortes.append(total)
    datos, desde_pal, desde_mar = [], 0, 0
    for j, i in enumerate(bloque):
        t0, t1 = cortes[j], cortes[j + 1]
        suyas = pal[desde_pal:limites_pal[j]]
        mias = marcas[desde_mar:desde_mar + n_mar[j]]
        desde_pal, desde_mar = limites_pal[j], desde_mar + n_mar[j]
        escena = {
            "voz": d.get("voz"), "estilo": d.get("estilo"), "duracion": round(t1 - t0, 3),
            "palabras": [dict(p, inicio=round(p["inicio"] - t0, 3), fin=round(p["fin"] - t0, 3)) for p in suyas],
            # Una marca que cae antes del corte (efecto al empezar la escena) suena al empezarla.
            "marcas": [dict(m, t=round(max(0.0, m["t"] - t0), 3)) for m in mias],
            "pausa_tras": PAUSA_BLOQUE if j == len(bloque) - 1 else 0.0,
            "bloque": [bloque[0], bloque[-1]],
            "texto": textos[j],
        }
        wav = carpeta / "voz" / f"{i:02d}.wav"
        with wave.open(str(wav), "wb") as w:
            w.setparams(params)
            w.writeframes(audio[int(t0 * frecuencia) * 2:int(t1 * frecuencia) * 2])
        archivos.escribir_json(wav.with_suffix(".json"), escena, indent=1, final_linea=False)
        datos.append(escena)
    return datos


def voces_previstas(guion, carpeta, rehacer, solo=None):
    """Bloques de voz (bloques_voz) con su firma y si hay que locutarlos: la base de preparar_voces y del
    cálculo del coste (--previsto-voz). "de_pago": se locutan con ai33 (voz "ai33:…", sin voz_archivo)."""
    bloques = []
    for bloque in bloques_voz(guion):
        if solo and not any(i in solo for i in bloque):
            continue
        escenas = [guion["escenas"][i - 1] for i in bloque]
        voz, velocidad, estilo, pausa_max = ajustes_voz(guion, escenas[0])
        texto = " ".join(expandir_efectos(e["texto"]) for e in escenas)
        externo = ruta(guion["voz_archivo"]) if guion.get("voz_archivo") else None
        if externo and not externo.exists():
            sys.exit(f"ERROR: no existe la locución 'voz_archivo' {externo}")
        h = huella(texto, voz, velocidad, gen_voz.VERSION, estilo, pausa_max, "bloque",
                   *([str(externo), externo.stat().st_mtime] if externo else []))
        firmas = [carpeta / "voz" / f"{i:02d}.firma" for i in bloque]
        # Hecho = firma al día Y la locución y sus tiempos en disco (sin el .wav, ffmpeg fallaba con un error críptico).
        hecho = all(f.exists() and f.read_text() == h and f.with_suffix(".wav").exists() and f.with_suffix(".json").exists()
                    for f in firmas) and not any(i in rehacer for i in bloque)
        bloques.append({"bloque": bloque, "escenas": escenas, "ajustes": (voz, velocidad, estilo, pausa_max),
                        "texto": texto, "externo": externo, "huella": h, "firmas": firmas, "hecho": hecho,
                        "nombre": f"{bloque[0]:02d}" + (f"-{bloque[-1]:02d}" if len(bloque) > 1 else ""),
                        "caracteres": len(" ".join(re.sub(r"\{[^}]*\}", " ", texto).split())),
                        "de_pago": voz.startswith("ai33:") and not externo})
    return bloques


def preparar_voces(guion, carpeta, rehacer, solo=None):
    """Voz de cada escena. Las escenas se locutan por bloques (bloques_voz) y se reparten después;
    un bloque se reutiliza si ninguna de sus escenas ha cambiado ni se pide rehacer. La voz de ai33 es DE
    PAGO: sin --gastar-ai33 no se locuta nada (se avisa del coste y se para)."""
    datos = {}
    previstas = voces_previstas(guion, carpeta, rehacer, solo)
    de_pago = [b for b in previstas if not b["hecho"] and b["de_pago"]]
    if de_pago and not GASTAR_AI33:
        caracteres = sum(b["caracteres"] for b in de_pago)
        creditos = f"{round(caracteres * CREDITOS_CARACTER_AI33):,}".replace(",", ".")
        sys.exit(f"ERROR: faltan {len(de_pago)} bloques de voz DE PAGO (ai33, {caracteres} caracteres, "
                 f"≈ {creditos} créditos): no se locutan sin --gastar-ai33 (preguntar antes; --previsto-voz "
                 f"da el detalle)")
    por_hacer, hechos = sum(not b["hecho"] for b in previstas), 0
    for b in previstas:
        bloque, escenas, texto, externo, h, firmas, nombre = (b["bloque"], b["escenas"], b["texto"], b["externo"],
                                                              b["huella"], b["firmas"], b["nombre"])
        voz, velocidad, estilo, pausa_max = b["ajustes"]
        if b["hecho"]:
            print(f"  voz {nombre}: reutilizada")
            for i in bloque:
                datos[i] = json.loads((carpeta / "voz" / f"{i:02d}.json").read_text(encoding="utf-8"))
            continue
        wav_bloque = carpeta / "voz" / "bloques" / f"{nombre}.wav"
        canal.progreso(hechos, por_hacer, f"Locutando el bloque {nombre} (escenas {bloque[0]}-{bloque[-1]})"
                       + (" con ai33" if b["de_pago"] else ""))
        sintetizar_aislado(texto, wav_bloque, voz, velocidad, estilo, pausa_max, externo)
        hechos += 1
        canal.progreso(hechos, por_hacer, f"Bloque {nombre} hecho: repartiendo por escenas")
        for i, d in zip(bloque, repartir_bloque(carpeta, bloque, [e["texto"] for e in escenas], wav_bloque)):
            datos[i] = d
        for f in firmas:
            f.write_text(h)
        if simulacion.es_simulada(wav_bloque):          # voz de relleno (modo sin gasto): cada escena queda marcada
            for i in bloque:
                simulacion.marca(carpeta / "voz" / f"{i:02d}.wav").write_text("simulada\n")
        print(f"  voz {nombre}: " + (f"tomada de {externo.name}" if externo else f"generada ({len(bloque)} escenas de una vez)"))
    for i, d in datos.items():
        palabras_texto = gen_voz.contar_palabras(gen_voz.MARCA.sub(" ", guion["escenas"][i - 1]["texto"]))
        if d["duracion"] < 0.25 * palabras_texto or not d["palabras"]:
            print(f"  Aviso: la voz {i:02d} parece cortada ({d['duracion']:.1f} s para {palabras_texto} palabras)")
    return [datos[i] for i in sorted(datos)]


def igualar_silencios(wav, d, anterior):
    """Da a una toma suelta el mismo aire antes de la primera palabra y después de la última que tenía la
    escena dentro de su bloque (gen_voz recorta la toma casi a ras: sin esto, la escena empalma pegada a la
    anterior). Reescribe el wav y devuelve los datos con los tiempos movidos."""
    def aire(x):
        p = x.get("palabras") or []
        return (p[0]["inicio"], x["duracion"] - p[-1]["fin"]) if p else (0.0, 0.0)
    (ini_a, fin_a), (ini_n, fin_n) = aire(anterior), aire(d)
    antes, despues = max(0.0, ini_a - ini_n), max(0.0, fin_a - fin_n)
    if antes < 0.01 and despues < 0.01:
        return d
    with wave.open(str(wav)) as w:
        params, audio = w.getparams(), w.readframes(w.getnframes())
    hueco = lambda s: b"\0" * (int(s * params.framerate) * params.sampwidth * params.nchannels)
    with wave.open(str(wav), "wb") as w:
        w.setparams(params)
        w.writeframes(hueco(antes) + audio + hueco(despues))
    mover = lambda x, k: dict(x, **{k: round(x[k] + antes, 3)})
    return dict(d, duracion=round(d["duracion"] + antes + despues, 3),
                palabras=[mover(mover(p, "inicio"), "fin") for p in d["palabras"]],
                marcas=[mover(m, "t") for m in d.get("marcas", [])])


def escenas_cambiadas(guion, carpeta, b):
    """En un bloque locutado entero cuyo texto ha cambiado, qué escenas ya no dicen lo que dice su audio
    (comparando el texto con las palabras reconocidas). None si el bloque no estaba locutado entero."""
    existentes = [f for f in b["firmas"] if f.exists()]
    if len(existentes) != len(b["bloque"]) or len({f.read_text() for f in existentes}) != 1:
        return None
    cambiadas = []
    for i in b["bloque"]:
        js = carpeta / "voz" / f"{i:02d}.json"
        if not js.exists():
            return None
        datos = json.loads(js.read_text(encoding="utf-8"))
        if "texto" in datos:                        # el texto con el que se locutó (desde el 01/10): exacto
            if datos["texto"] != guion["escenas"][i - 1]["texto"]:
                cambiadas.append(i)
            continue
        oido = [gen_voz.normalizar(p["texto"]) for p in datos["palabras"]]
        escrito = [gen_voz.normalizar(w) for w in
                   re.sub(r"\{[^}]*\}|\[[^]]*\]", " ", guion["escenas"][i - 1]["texto"]).split()]
        if difflib.SequenceMatcher(None, oido, escrito).ratio() < 0.85:
            cambiadas.append(i)
    return cambiadas


def rehacer_escena_sola(guion, carpeta, n, previsto=False):
    """Otra toma de UNA escena de un bloque ya locutado, sin tocar las demás (2026-10-01: la escena 2 del 001
    salió entrecortada y las otras seis del bloque estaban bien). Se locuta sola con los ajustes de su bloque
    y sustituye voz/NN.wav y .json (la anterior va a voz/anteriores/); la firma del bloque no cambia. El
    empalme con las escenas vecinas coincide con un cambio de imagen. Con `previsto`, solo el coste (JSON)."""
    if not 1 <= n <= len(guion["escenas"]):
        sys.exit(f"ERROR: no existe la escena {n}")
    b = next(b for b in voces_previstas(guion, carpeta, set()) if n in b["bloque"])
    texto_nuevo = False
    if not b["hecho"]:
        # ¿Solo ha cambiado el texto de ESTA escena? (01/10: «si una escena falla dos veces, cambia la frase»).
        cambiadas = escenas_cambiadas(guion, carpeta, b)
        if cambiadas is None:
            sys.exit(f"ERROR: el bloque de la escena {n} ({b['nombre']}) no está locutado: se locuta entero "
                     "(--solo-voces)")
        otras = [i for i in cambiadas if i != n]
        if otras:
            sys.exit(f"ERROR: en el bloque {b['nombre']} también ha cambiado la escena {otras[0]}: se locuta el "
                     "bloque entero (--solo-voces)")
        texto_nuevo = True
    if b["externo"]:
        sys.exit("ERROR: la voz es una locución hecha fuera (voz_archivo): repite la frase en la web de ai33")
    voz, velocidad, estilo, pausa_max = b["ajustes"]
    texto = expandir_efectos(guion["escenas"][n - 1]["texto"])
    caracteres = len(" ".join(re.sub(r"\{[^}]*\}", " ", texto).split()))
    creditos = round(caracteres * CREDITOS_CARACTER_AI33) if b["de_pago"] else 0
    if previsto:
        print(json.dumps({"escenas": [n], "caracteres_de_pago": caracteres if b["de_pago"] else 0,
                          "creditos": creditos, "voz": voz}, ensure_ascii=False))
        return
    if b["de_pago"] and not GASTAR_AI33:
        sys.exit(f"ERROR: la escena {n} es DE PAGO (ai33, {caracteres} caracteres, ≈ {creditos} créditos): "
                 "no se locuta sin --gastar-ai33 (preguntar antes)")
    dir_voz = carpeta / "voz"
    wav, js = dir_voz / f"{n:02d}.wav", dir_voz / f"{n:02d}.json"
    anterior = json.loads(js.read_text(encoding="utf-8"))
    nuevo = dir_voz / "sueltas" / f"{n:02d}.wav"
    canal.progreso(0, 2, f"Locutando la escena {n}" + (" con ai33" if b["de_pago"] else ""))
    sintetizar_aislado(texto, nuevo, voz, velocidad, estilo, pausa_max)
    canal.progreso(1, 2, "Igualando los silencios con las escenas vecinas")
    d = json.loads(nuevo.with_suffix(".json").read_text(encoding="utf-8"))
    archivo = dir_voz / "anteriores"
    archivo.mkdir(exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(wav, archivo / f"{n:02d}_{marca}.wav")
    shutil.copy2(js, archivo / f"{n:02d}_{marca}.json")
    shutil.copy2(nuevo, wav)
    d = igualar_silencios(wav, d, anterior)
    d.update({"pausa_tras": anterior.get("pausa_tras", 0.0), "bloque": anterior.get("bloque"), "escena_sola": True,
              "texto": guion["escenas"][n - 1]["texto"]})
    archivos.escribir_json(js, d, indent=1, final_linea=False)
    if texto_nuevo:                 # el bloque vuelve a estar al día con el texto nuevo de esta escena
        for f in b["firmas"]:
            f.write_text(b["huella"])
    canal.progreso(2, 2, "Hecho")
    print(f"  voz {n:02d}: generada sola ({d['duracion']:.1f} s; la anterior, en voz/anteriores/)"
          + (" con su texto nuevo" if texto_nuevo else ""))


# ---------- 2. Imágenes ----------

def construir_prompt(guion, prompt):
    """Sustituye {personaje} por su descripción y aplica el estilo del canal."""
    for nombre, descripcion in guion.get("personajes", {}).items():
        prompt = prompt.replace("{" + nombre + "}", descripcion)
    estilo = guion.get("estilo", "")
    if "{paleta}" in estilo:   # paleta del pilar del vídeo (canal.json → "paletas"), o la propia del guion
        paletas = canal.get("paletas", {})
        estilo = estilo.replace("{paleta}", guion.get("paleta") or paletas.get(guion.get("pilar", ""), paletas.get("defecto", "")))
    if "{escena}" in estilo:
        return estilo.replace("{escena}", prompt)
    return f"{estilo}: {prompt}" if estilo else prompt   # el modelo da más peso al principio


def imagenes_de(escena):
    """Lista de especificaciones de imagen de una escena (admite el formato corto de una sola)."""
    if escena.get("imagenes"):
        return escena["imagenes"]
    return [{k: escena[k] for k in ("prompt", "imagen", "video", "desde", "audio_clip", "reutilizar",
                                    "personaje", "movimiento", "rotulo")
             if k in escena}]


def cambios_de_imagen(escena):
    return len(re.findall(r"\{" + MARCA_IMAGEN + r"\}", escena["texto"]))


def validar(guion):
    errores = []
    for i, escena in enumerate(guion["escenas"], 1):
        specs = imagenes_de(escena)
        if len(specs) != cambios_de_imagen(escena) + 1:
            errores.append(f"escena {i:02d}: {len(specs)} imágenes pero {cambios_de_imagen(escena)} marcas "
                           f"{{{MARCA_IMAGEN}}} (debe haber una imagen más que marcas)")
        for k, spec in enumerate(specs, 1):
            if not any(x in spec for x in ("prompt", "imagen", "video", "reutilizar")):
                errores.append(f"imagen {i:02d}-{k}: falta 'prompt', 'imagen', 'video' o 'reutilizar'")
            if spec.get("video") and not ruta(spec["video"]).exists():
                errores.append(f"imagen {i:02d}-{k}: no existe el vídeo {spec['video']}")
            if spec.get("movimiento") and spec["movimiento"] not in MOVIMIENTOS_VALIDOS:
                errores.append(f"imagen {i:02d}-{k}: movimiento '{spec['movimiento']}' no válido")
    if errores:
        sys.exit("ERROR en el guion:\n  " + "\n  ".join(errores))


def hoja_de_contactos(imagenes, salida, etiquetas=None, columnas=4, ancho=480):
    """Todas las imágenes en una sola, numeradas, para revisarlas de un vistazo."""
    miniaturas = []
    for img in imagenes:
        with Image.open(img) as im:
            im = im.convert("RGB")
            miniaturas.append(im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS))
    alto = max(m.height for m in miniaturas)
    filas = math.ceil(len(miniaturas) / columnas)
    hoja = Image.new("RGB", (columnas * ancho, filas * alto), (255, 255, 255))
    dibujo = ImageDraw.Draw(hoja)
    fuente = ImageFont.truetype(str(DIR_FUENTES / "Nunito-Bold.ttf"), 22)
    for k, m in enumerate(miniaturas):
        x, y = (k % columnas) * ancho, (k // columnas) * alto
        hoja.paste(m, (x, y))
        texto = etiquetas[k] if etiquetas else f"{k + 1:02d}"
        caja = dibujo.textbbox((x + 8, y + 4), texto, font=fuente)
        dibujo.rectangle((caja[0] - 6, caja[1] - 4, caja[2] + 6, caja[3] + 4), fill=(0, 0, 0))
        dibujo.text((x + 8, y + 4), texto, font=fuente, fill=(255, 255, 255))
    hoja.save(salida)
    return salida


# Sincronía de las voces que no dan el momento de cada palabra: "exacta" (Azure) o "aproximada" (sin servicios), del
# guion ("sincronia"). Sin ella, gen_voz.py elige (exacta si se usa Azure). No entra en la huella: cambiarla no rehace
# (ni vuelve a pagar) voces ya hechas; vale para las que se locuten o suban a partir de ahora.
SINCRONIA = None
GASTAR_AI33 = False        # --gastar-ai33: permiso para generar (pagar) las imágenes con "motor": "ai33"


# --solo: solo se generan las imágenes pedidas en --rehacer-imagenes (ids o escenas); las demás que falten o
# hayan cambiado se dejan como están (la UI rehace así una imagen marcada sin gastar cuota en el resto).
SOLO: set = set()


def fuera_de_solo(ident, escena):
    return bool(SOLO) and ident not in SOLO and str(escena) not in SOLO


def es_ai33(spec):
    return spec.get("motor") == "ai33" and "prompt" in spec and not any(
        k in spec for k in ("video", "imagen", "reutilizar"))


def firma_ai33(guion, spec, formato, cfg):
    """Firma de una imagen de ai33: prompt, formato, modelo y referencias de estilo (si cambian, se rehace)."""
    refs = [ruta(r) for r in cfg["referencias_estilo"]]
    return huella(construir_prompt(guion, spec["prompt"]), formato, "ai33", cfg["modelo"], cfg["resolucion"], *refs)


def preparar_ai33(guion, carpeta, rehacer, formato):
    """Manda a ai33 (todas a la vez) las imágenes con "motor": "ai33" que falten o hayan cambiado."""
    cfg = imagen_ai33.config(guion, canal.config())
    pendientes = []
    for i, escena in enumerate(guion["escenas"], 1):
        for k, spec in enumerate(imagenes_de(escena), 1):
            ident = f"{i:02d}-{k}"
            if not es_ai33(spec) or fuera_de_solo(ident, i):
                continue
            img = carpeta / "img" / f"{ident}.png"
            h = firma_ai33(guion, spec, formato, cfg)
            forzar = ident in rehacer or str(i) in rehacer
            if img.exists() and img.with_suffix(".firma").exists() and img.with_suffix(".firma").read_text() == h \
                    and not forzar:
                continue
            pendientes.append({"ident": ident, "prompt": construir_prompt(guion, spec["prompt"]), "salida": img,
                               "formato": formato, "firma": h})
    if not pendientes:
        return
    previsto = f'{len(pendientes) * cfg["creditos_por_imagen"]:,}'.replace(",", ".")
    ids = ", ".join(p["ident"] for p in pendientes)
    if not GASTAR_AI33:     # sin permiso de gasto: se saltan y se sigue con las gratis
        print(f"  AVISO: {len(pendientes)} imágenes con \"motor\": \"ai33\" pendientes ({ids}): DE PAGO, "
              f"≈ {previsto} créditos ({cfg['modelo']}). No se generan sin --gastar-ai33 (preguntar antes).",
              flush=True)
        return len(pendientes)
    refs = [ruta(r) for r in cfg["referencias_estilo"]]
    for r in refs:
        if not r.exists():
            sys.exit(f"ERROR: no existe la referencia de estilo {r}")
    print(f"  ai33: {len(pendientes)} imágenes ({cfg['modelo']}, ≈ {previsto} créditos), todas a la vez; "
          "tardan de 10 a 50 min. NO cancelar (no devuelve créditos).", flush=True)
    hechas, errores, gastado = imagen_ai33.lote(pendientes, cfg, refs, carpeta / "img")
    if errores:
        print(f"  AVISO: ai33 no devolvió {', '.join(errores)}: se reintentarán en la próxima pasada", flush=True)
    print(f"  ai33: {len(hechas)} hechas, {len(errores)} con error, {gastado:,} créditos cobrados en esta pasada".replace(",", ".")
          if not errores else f"  ai33: {len(hechas)} hechas, con error: {', '.join(errores)} ({gastado} créditos)",
          flush=True)


def preparar_imagenes(guion, carpeta, rehacer, destino="img", tamano=None):
    """Devuelve {id: ruta} de todas las imágenes, generando las que falten o hayan cambiado.
    destino/tamano: el boceto las genera en otra carpeta y a baja resolución (y con klein también las
    de "motor": "ai33", que en el boceto no se pagan)."""
    formato = guion.get("formato", "horizontal")
    if destino == "img":
        preparar_ai33(guion, carpeta, rehacer, formato)
    rutas = {}
    for i, escena in enumerate(guion["escenas"], 1):
        for k, spec in enumerate(imagenes_de(escena), 1):
            ident = f"{i:02d}-{k}"
            if spec.get("video"):
                # Primer fotograma (desde "desde") como imagen fija: contactos, miniaturas, control.
                img = carpeta / destino / f"{ident}.png"
                img.parent.mkdir(parents=True, exist_ok=True)
                h = huella(str(ruta(spec["video"])), ruta(spec["video"]).stat().st_mtime, spec.get("desde", 0))
                firma = img.with_suffix(".firma")
                if not (img.exists() and firma.exists() and firma.read_text() == h):
                    ffmpeg("-ss", f"{spec.get('desde', 0)}", "-i", ruta(spec["video"]), "-frames:v", "1", img)
                    firma.write_text(h)
                print(f"  imagen {ident}: clip {Path(spec['video']).name}")
                canal.evento("imagen", ident=ident, estado="clip")
                rutas[ident] = img
                continue
            if spec.get("imagen"):
                img = ruta(spec["imagen"])
                if not img.exists():
                    sys.exit(f"ERROR: imagen {ident}: no existe {img}")
                rutas[ident] = img
                canal.evento("imagen", ident=ident, estado="propia")
                continue
            if spec.get("reutilizar"):
                if spec["reutilizar"] not in rutas:
                    sys.exit(f"ERROR: imagen {ident}: 'reutilizar' apunta a {spec['reutilizar']}, "
                             "que no existe o va después")
                rutas[ident] = rutas[spec["reutilizar"]]
                canal.evento("imagen", ident=ident, estado="reutilizada")
                continue
            img = carpeta / destino / f"{ident}.png"
            firma = img.with_suffix(".firma")
            if destino == "img" and es_ai33(spec):     # ya la ha traído preparar_ai33 (o sigue pendiente)
                if not img.exists():
                    print(f"  imagen {ident}: FALTA (pendiente de ai33)")
                    canal.evento("imagen", ident=ident, estado="falta")
                    continue
                al_dia = firma.exists() and firma.read_text() == firma_ai33(
                    guion, spec, formato, imagen_ai33.config(guion, canal.config()))
                print(f"  imagen {ident}: reutilizada" + (" (ai33)" if al_dia else " (versión antigua; pendiente de ai33)"))
                canal.evento("imagen", ident=ident, estado="reutilizada")
                rutas[ident] = img
                continue
            refs = [ruta(r) for r in guion.get("referencias", [])] if spec.get("personaje") else []
            prompt = construir_prompt(guion, spec["prompt"])
            semilla = spec.get("semilla")
            h = huella(prompt, formato, *refs, *([semilla] if semilla is not None else []))
            forzar = ident in rehacer or str(i) in rehacer
            if destino == "img" and fuera_de_solo(ident, i):
                if img.exists():
                    rutas[ident] = img
                continue
            if img.exists() and firma.exists() and firma.read_text() == h and not forzar:
                print(f"  imagen {ident}: reutilizada")
                canal.evento("imagen", ident=ident, estado="reutilizada")
            else:
                gen_imagen.generar(prompt, img, formato, refs, semilla=semilla, tamano=tamano)
                firma.write_text(h)
                print(f"  imagen {ident}: generada")
                canal.evento("imagen", ident=ident, estado="generada")
            rutas[ident] = img
    return rutas


# ---------- 3. Línea de tiempo ----------

def duraciones(datos_voz):
    """Duración de cada escena ajustada a fotogramas enteros, para que audio y vídeo no se desfasen."""
    return [math.ceil((d["duracion"] + d.get("pausa_tras", PAUSA_ESCENA)) * FPS) / FPS for d in datos_voz]


def planos(guion, escenas_idx, datos_voz, durs, rutas):
    """Cada plano: una imagen en pantalla desde 'inicio' hasta 'fin' (segundos del vídeo)."""
    lista, t = [], 0.0
    for i, d, dur in zip(escenas_idx, datos_voz, durs):
        escena = guion["escenas"][i - 1]
        cortes = sorted(m["t"] for m in d["marcas"] if m["nombre"] == MARCA_IMAGEN)
        limites = [0.0] + cortes + [dur]
        for k, spec in enumerate(imagenes_de(escena), 1):
            n_global = len(lista)
            inicio, fin = round(t + limites[k - 1], 3), round(t + limites[k], 3)
            if spec.get("video"):
                archivo = ruta(spec["video"])
                disponible = duracion_s(archivo) - spec.get("desde", 0)
                if disponible < fin - inicio - 0.05:      # margen: los cortes no caen siempre en fotograma exacto
                    print(f"  Aviso: clip {archivo.name} más corto que su tramo ({disponible:.1f} s de "
                         f"{fin - inicio:.1f} s; se congela en el último fotograma)")
            lista.append({
                "id": f"{i:02d}-{k}", "escena": i, "imagen": str(rutas[f"{i:02d}-{k}"]),
                "inicio": inicio, "fin": fin,
                "movimiento": spec.get("movimiento") or MOVIMIENTOS[n_global % len(MOVIMIENTOS)],
                "rotulo": spec.get("rotulo"),
                "video": str(ruta(spec["video"])) if spec.get("video") else None,
                "desde": spec.get("desde", 0),
                "audio_clip": bool(spec.get("video") and spec.get("audio_clip")),
            })
        t += dur
    return lista


# ---------- 4. Audio ----------

def musicas_por_escena(guion):
    """Música de cada escena (ruta o None), heredando la de la escena anterior."""
    actual, resultado = guion.get("musica"), []
    for escena in guion["escenas"]:
        actual = escena.get("musica", actual)
        archivo = None
        if actual and actual != "ninguna":
            archivo = ruta_musica(actual)
            if archivo and not archivo.exists():
                sys.exit(f"ERROR: no existe la música {archivo}")
        resultado.append(archivo)
    return resultado


def tramos_musica(musicas, durs):
    """Lista de (archivo, inicio, fin) agrupando escenas seguidas con la misma música."""
    tramos, t = [], 0.0
    for archivo, dur in zip(musicas, durs):
        if tramos and tramos[-1][0] == archivo:
            tramos[-1][2] = t + dur
        else:
            tramos.append([archivo, t, t + dur])
        t += dur
    return [tuple(x) for x in tramos if x[0]]


def mezclar_audio(guion, voces, datos_voz, durs, musicas, salida, planos=None):
    entradas, filtros, etiquetas = [], [], []
    # Voz: cada escena rellenada con silencio hasta su duración exacta y encadenada.
    for i, (wav, dur) in enumerate(zip(voces, durs)):
        entradas += ["-i", wav]
        filtros.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={dur:.4f}[v{i}]")
    n = len(durs)
    filtros.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[voz]")

    # Audio de los clips con "audio_clip": true, cada uno en su tramo (desde 'desde', mezclado bajo la voz).
    idx = n
    for p in planos or []:
        if not p.get("audio_clip"):
            continue
        dur_tramo = p["fin"] - p["inicio"]
        ms = int(round(p["inicio"] * 1000))
        entradas += ["-ss", f"{p['desde']}", "-i", p["video"]]
        ganancia = NIVEL_CLIP_DB - volumen_medio_db(p["video"])
        filtros.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{dur_tramo:.4f},"
                       f"apad=whole_dur={dur_tramo:.4f},volume={ganancia:.1f}dB,adelay={ms}|{ms}[c{idx}]")
        etiquetas.append(f"[c{idx}]")
        idx += 1

    # Efectos: cada marca {nombre} en su instante absoluto.
    inicio_escena, faltan = 0.0, set()
    for d, dur in zip(datos_voz, durs):
        for m in d["marcas"]:
            if m["nombre"] == MARCA_IMAGEN:
                continue
            sfx = ruta_sfx(m['nombre'])
            if not sfx.exists():
                faltan.add(m["nombre"])
                continue
            ms = int(round((inicio_escena + m["t"]) * 1000))
            entradas += ["-i", sfx]
            nivel = (canal.get("niveles_efectos") or {}).get(m["nombre"], NIVEL_SFX_DB)   # voces (toc_toc) más altas
            ganancia = nivel - volumen_medio_db(sfx)
            filtros.append(f"[{idx}:a]volume={ganancia:.1f}dB,adelay={ms}|{ms}[s{idx}]")
            etiquetas.append(f"[s{idx}]")
            idx += 1
        inicio_escena += dur
    if faltan:
        print(f"  Aviso: marcas sin efecto en recursos/sfx/: {', '.join(sorted(faltan))}")

    total = sum(durs)
    filtros.append("[voz]asplit=2[voz_mezcla][voz_guia]")
    capas = ["[voz_mezcla]"] + etiquetas
    partes = tramos_musica(musicas, durs)
    if partes:
        vol = guion.get("volumen_musica", VOLUMEN_MUSICA)
        f = FUNDIDO_MUSICA
        etiquetas_mus = []
        for k, (musica, ini, fin) in enumerate(partes):
            # Cada tramo se alarga medio fundido por cada lado para que los cambios se solapen.
            a_ini = max(0.0, ini - f / 2)
            a_fin = min(total, fin + f / 2)
            largo = a_fin - a_ini
            fundido_ini = f"afade=t=in:d={f}," if a_ini > 0 else ""
            fundido_fin = f if a_fin < total else 2.0
            ms = int(round(a_ini * 1000))
            entradas += ["-stream_loop", "-1", "-i", musica]
            filtros.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},"
                           f"atrim=0:{largo:.4f},{fundido_ini}"
                           f"afade=t=out:st={max(0, largo - fundido_fin):.4f}:d={fundido_fin},"
                           f"adelay={ms}|{ms}[m{k}]")
            etiquetas_mus.append(f"[m{k}]")
            idx += 1
        filtros.append("".join(etiquetas_mus) + f"amix=inputs={len(etiquetas_mus)}:normalize=0,"
                       f"apad=whole_dur={total:.4f}[mus]")
        # La música baja sola mientras hay voz (sidechain) y vuelve a subir en las pausas.
        filtros.append("[mus][voz_guia]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[musd]")
        capas.append("[musd]")
    else:
        filtros.append("[voz_guia]anullsink")
    filtros.append("".join(capas) + f"amix=inputs={len(capas)}:normalize=0:duration=first[mix]")
    # Volumen en dos pasadas: primero se mide la mezcla entera y luego se corrige con esa medida (lineal).
    # En una sola pasada loudnorm va corrigiendo sobre la marcha y el principio queda a otro volumen.
    norma = f"loudnorm=I={LUFS_OBJETIVO}:TP=-1.5:LRA=11"
    r = correr(["ffmpeg", "-hide_banner", "-nostats", "-y", *map(str, entradas), "-filter_complex",
                ";".join(filtros + [f"[mix]{norma}:print_format=json[medida]"]), "-map", "[medida]",
                "-t", f"{total:.4f}", "-f", "null", "-"])
    try:
        m = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
        norma += (f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
                  f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    except (ValueError, KeyError):
        print("  Aviso: no se pudo medir el volumen; se normaliza en una sola pasada")
    filtros.append(f"[mix]{norma},aresample=48000[mezcla]")
    ffmpeg(*entradas, "-filter_complex", ";".join(filtros), "-map", "[mezcla]",
           "-t", f"{total:.4f}", "-c:a", "pcm_s16le", salida)


# ---------- 5. Vídeo ----------

def caja(movimiento, p, ancho_img, alto_img, aspecto):
    """Recorte (x0, y0, x1, y1) de la imagen para el instante p (0 a 1) del plano."""
    w = min(ancho_img, alto_img * aspecto)          # mayor recorte con el aspecto del vídeo
    h = w / aspecto
    suave = (1 - math.cos(math.pi * p)) / 2       # arranca y frena suavemente
    if movimiento == "fijo":
        x, y = (ancho_img - w) / 2, (alto_img - h) / 2
        return (x, y, x + w, y + h)
    if movimiento in ("zoom_in", "zoom_out"):
        z = 1 + ZOOM * (suave if movimiento == "zoom_in" else 1 - suave)
        cw, ch = w / z, h / z
        cx, cy = ancho_img / 2, alto_img / 2
        return (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
    cw, ch = w / (1 + ZOOM), h / (1 + ZOOM)
    libre_x, libre_y = ancho_img - cw, alto_img - ch
    x, y = libre_x / 2, libre_y / 2
    if movimiento == "derecha":
        x = libre_x * suave
    elif movimiento == "izquierda":
        x = libre_x * (1 - suave)
    elif movimiento == "abajo":
        y = libre_y * suave
    elif movimiento == "arriba":
        y = libre_y * (1 - suave)
    return (x, y, x + cw, y + ch)


def fotogramas_clip(plano, tamano, n):
    """Genera n fotogramas RGB de un clip de vídeo, encuadrados a 'tamano' (recorte centrado), leyéndolos
    de uno en uno. Si el clip se acaba antes, repite su último fotograma."""
    ancho, alto = tamano
    paso = ancho * alto * 3
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{plano['desde']}", "-i", plano["video"], "-an",
           "-vf", f"fps={FPS},scale={ancho}:{alto}:force_original_aspect_ratio=increase:flags=lanczos,crop={ancho}:{alto}",
           "-frames:v", str(n), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    t = time.monotonic()
    # stderr a un archivo temporal (no a una tubería: si se llenara mientras leemos stdout, ffmpeg se quedaría parado)
    errores = tempfile.TemporaryFile()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errores)
    ultimo, hechos = None, 0
    while hechos < n:
        datos = proc.stdout.read(paso)
        if len(datos) < paso:
            break
        ultimo = Image.frombytes("RGB", tamano, datos)
        hechos += 1
        yield ultimo
    proc.stdout.close()
    proc.wait()
    errores.seek(0)
    registrar_orden(cmd, proc.returncode, time.monotonic() - t, errores.read().decode("utf-8", "replace"))
    errores.close()
    if ultimo is None:
        sys.exit(f"ERROR: no se pudo leer el clip {plano['video']} desde el segundo {plano['desde']}")
    for _ in range(n - hechos):
        yield ultimo


def fotogramas(lista_planos, tamano, lienzo=None, posicion=(0, 0)):
    """Genera los fotogramas de todos los planos; cada plano empieza fundiéndose con el último
    fotograma del anterior. Con 'lienzo', la imagen animada se pega encima (Shorts verticales)."""
    ancho, alto = tamano
    n_fundido = round(FUNDIDO * FPS)
    ultimo, cache = None, {}
    for plano in lista_planos:
        n = round(plano["fin"] * FPS) - round(plano["inicio"] * FPS)
        clip = fotogramas_clip(plano, tamano, n) if plano.get("video") else None
        if clip is None and plano["imagen"] not in cache:
            with Image.open(plano["imagen"]) as original:
                cache = {plano["imagen"]: original.convert("RGB")}
        img = None if clip else cache[plano["imagen"]]
        for f in range(n):
            p = f / max(1, n - 1)
            frame = next(clip) if clip else img.resize(tamano, Image.BICUBIC,
                                                    box=caja(plano["movimiento"], p, img.width, img.height, ancho / alto))
            if ultimo is not None and f < n_fundido:
                frame = Image.blend(ultimo, frame, (f + 1) / (n_fundido + 1))
            if f == n - 1:
                ultimo = frame
            if lienzo is not None:
                completo = lienzo.copy()
                completo.paste(frame, posicion)
                frame = completo
            yield frame.tobytes()


def renderizar(lista_planos, tamano_salida, audio, ass, salida, tamano_img=None, lienzo=None, posicion=(0, 0),
               rango=None):
    """`rango` (desde, hasta): parte de la barra de progreso de la UI que ocupa este render (el montaje entero
    es 0-100 y el vídeo, lo que más tarda, casi todo)."""
    tamano_img = tamano_img or tamano_salida
    cmd = ["ffmpeg", "-v", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{tamano_salida[0]}x{tamano_salida[1]}",
           "-r", str(FPS), "-i", "-", "-i", str(audio),
           "-vf", f"subtitles={ass.relative_to(RAIZ)}:fontsdir={DIR_FUENTES.relative_to(RAIZ)}",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(salida)]
    t = time.monotonic()
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, cwd=RAIZ)
    total = round(lista_planos[-1]["fin"] * FPS) - round(lista_planos[0]["inicio"] * FPS)
    try:
        for k, frame in enumerate(fotogramas(lista_planos, tamano_img, lienzo, posicion), 1):
            proc.stdin.write(frame)
            if k % (FPS * 10) == 0 or k == total:
                print(f"\r  vídeo: {k}/{total} fotogramas", end="", flush=True)
            if rango and os.environ.get("CANALYT_PROGRESO") and (k % FPS == 0 or k == total):
                print(flush=True)                  # cierra la línea «\r vídeo: …» antes del @progreso
                canal.progreso(rango[0] + round((rango[1] - rango[0]) * k / total), 100,
                               f"Vídeo: {k // FPS} de {total // FPS} s")
        proc.stdin.close()
    except BrokenPipeError:
        pass
    error = proc.stderr.read().decode("utf-8", "replace")
    registrar_orden(cmd, proc.wait(), time.monotonic() - t, error)
    if proc.returncode != 0:
        sys.exit(f"\nERROR ffmpeg: {error[-800:]}")
    print()


# ---------- 6. Shorts ----------

def lienzo_short(titulo):
    """Fondo blanco vertical con el título arriba (fuente de título del canal; palabras entre * en el color de acento)."""
    ancho, alto = TAMANOS["vertical"]
    lienzo = Image.new("RGB", (ancho, alto), (255, 255, 255))
    dibujo = ImageDraw.Draw(lienzo)
    acento, negro = canal.color("acento", "#F58C32"), canal.color("texto", "#141414")
    palabras = [(w.strip("*").upper(), acento if w.startswith("*") else negro)
                for w in re.findall(r"\*[^*]+\*|\S+", titulo)]
    for tam in range(110, 40, -4):
        fuente = ImageFont.truetype(str(canal.fuente("titulo")[0]), tam)
        espacio = dibujo.textlength(" ", font=fuente)
        lineas, actual, w_actual = [], [], 0
        for texto, color in palabras:
            w = dibujo.textlength(texto, font=fuente)
            if actual and w_actual + espacio + w > ancho - 120:
                lineas.append(actual)
                actual, w_actual = [], 0
            actual.append((texto, color, w))
            w_actual += (espacio if len(actual) > 1 else 0) + w
        lineas.append(actual)
        if len(lineas) <= 3 and all(w <= ancho - 120 for _, _, w in sum(lineas, [])):
            break
    y = 180 + (3 - len(lineas)) * tam * 0.5
    for linea in lineas:
        ancho_linea = sum(w for _, _, w in linea) + espacio * (len(linea) - 1)
        x = (ancho - ancho_linea) / 2
        for texto, color, w in linea:
            dibujo.text((x, y), texto, font=fuente, fill=color)
            x += w + espacio
        y += tam * 1.05
    return lienzo


def origen(guion, ident):
    """Id de la imagen que se genera de verdad (sigue las cadenas de 'reutilizar')."""
    specs = {f"{i:02d}-{k}": s for i, e in enumerate(guion["escenas"], 1) for k, s in enumerate(imagenes_de(e), 1)}
    while "reutilizar" in specs[ident]:
        ident = specs[ident]["reutilizar"]
    return ident, specs[ident]


def imagenes_verticales(guion, carpeta, rehacer=()):
    """Versión vertical (768x1344) de las imágenes de las escenas de los Shorts con "vertical": true.
    Mismo prompt que la horizontal: el modelo recompone la escena para el formato vertical.
    Devuelve {id: ruta}; las imágenes dadas con "imagen" se quedan en horizontal (se recortan al centro)."""
    rutas = {}
    for cfg in guion.get("shorts", []):
        if not cfg.get("vertical"):
            continue
        a, b = cfg["escenas"]
        for i in range(a, b + 1):
            for k, _ in enumerate(imagenes_de(guion["escenas"][i - 1]), 1):
                ident = f"{i:02d}-{k}"
                base, spec = origen(guion, ident)
                if "prompt" not in spec:
                    continue
                img = carpeta / "img" / "vertical" / f"{base}.png"
                firma = img.with_suffix(".firma")
                refs = [ruta(r) for r in guion.get("referencias", [])] if spec.get("personaje") else []
                prompt = construir_prompt(guion, spec["prompt"])
                h = huella(prompt, "vertical", *refs)
                if base not in rutas:
                    if img.exists() and firma.exists() and firma.read_text() == h and f"v{base}" not in rehacer:
                        print(f"  imagen vertical {base}: reutilizada")
                        canal.evento("imagen", ident=base, estado="reutilizada", vertical=True)
                    else:
                        gen_imagen.generar(prompt, img, "vertical", refs)
                        firma.write_text(h)
                        print(f"  imagen vertical {base}: generada")
                        canal.evento("imagen", ident=base, estado="generada", vertical=True)
                rutas[ident] = img
    return rutas


def voz_gancho(guion, carpeta, n, texto):
    """Frase propia del Short para el primer segundo (no está en el vídeo largo)."""
    voz, velocidad, estilo, pausa_max = ajustes_voz(guion)
    wav = carpeta / "voz" / f"short_{n}_gancho.wav"
    firma = wav.with_suffix(".firma")
    texto = expandir_efectos(texto)
    h = huella(texto, voz, velocidad, gen_voz.VERSION, *([estilo, pausa_max] if estilo or pausa_max else []))
    if not (wav.exists() and firma.exists() and firma.read_text() == h):
        sintetizar_aislado(texto, wav, voz, velocidad, estilo, pausa_max)
        firma.write_text(h)
    return wav, json.loads(wav.with_suffix(".json").read_text(encoding="utf-8"))


def montar_short(guion, carpeta, n, cfg, datos_todos, durs_todos, lista_planos, musicas, tmp, verticales):
    """Short de 20-60 s a partir de escenas del vídeo largo. Con "vertical": true, imágenes verticales a
    pantalla completa y el título como rótulo al principio; si no, la imagen horizontal en una franja
    bajo el título. Con "gancho": "frase", esa frase suena antes de la primera escena."""
    a, b = cfg["escenas"]
    idx = list(range(a, b + 1))
    datos = [datos_todos[i - 1] for i in idx]
    durs = [durs_todos[i - 1] for i in idx]
    voces = [carpeta / "voz" / f"{i:02d}.wav" for i in idx]
    mus = [musicas[i - 1] for i in idx]
    inicio = sum(durs_todos[:a - 1])
    extra = 0.0
    if cfg.get("gancho"):
        wav, d = voz_gancho(guion, carpeta, n, cfg["gancho"])
        extra = math.ceil((d["duracion"] + PAUSA_ESCENA) * FPS) / FPS
        voces, datos, durs, mus = [wav] + voces, [d] + datos, [extra] + durs, [mus[0]] + mus
    sub_planos = [dict(p, inicio=round(p["inicio"] - inicio + extra, 3), fin=round(p["fin"] - inicio + extra, 3))
                  for p in lista_planos if a <= p["escena"] <= b]
    sub_planos[0]["inicio"] = 0.0                  # la primera imagen ya está mientras suena el gancho
    total = sum(durs)
    if not 15 <= total <= 60:
        print(f"  Aviso: el Short {n} dura {total:.0f} s (lo ideal para Shorts es 30-60 s, máximo 60)")
    audio = tmp / f"short_{n}.wav"
    mezclar_audio(guion, voces, datos, durs, mus, audio, sub_planos)
    offsets = [sum(durs[:k]) for k in range(len(durs))]
    rotulos = [(p["inicio"], p["fin"], p["rotulo"]) for p in sub_planos if p.get("rotulo")]
    salida = carpeta / f"short_{n}.mp4"
    if cfg.get("vertical"):
        titulo = None
        if cfg.get("titulo"):
            fin_titulo = min(3.0, total)
            titulo = (0.0, fin_titulo, cfg["titulo"])
            rotulos = [r for r in rotulos if r[0] >= fin_titulo]     # no pisar el título
        for p in sub_planos:
            p["imagen"] = str(verticales.get(p["id"], p["imagen"]))
        ass = subtitulos.generar_ass(list(zip(datos, offsets)), tmp / f"short_{n}.ass", "vertical", rotulos,
                                     titulo, subtitulos_de_efectos(datos, offsets))
        renderizar(sub_planos, TAMANOS["vertical"], audio, ass, salida)
    else:
        ass = subtitulos.generar_ass(list(zip(datos, offsets)), tmp / f"short_{n}.ass", "vertical", rotulos,
                                     extras=subtitulos_de_efectos(datos, offsets))
        ancho = TAMANOS["vertical"][0]
        tamano_img = (ancho, round(ancho * 9 / 16))
        renderizar(sub_planos, TAMANOS["vertical"], audio, ass, salida, tamano_img,
                   lienzo_short(cfg.get("titulo", "")), (0, 560))
    return salida, total


# ---------- 7. Pantalla final ----------

def es_short(guion):
    """Short independiente (/nuevo-short): vertical, sin pantalla final ni capítulos."""
    return guion.get("tipo") == "short"


def textura_papel(lienzo):
    """Papel: grano fino y un viñeteado suave hacia los bordes (fondo de la pantalla final)."""
    ancho, alto = lienzo.size
    grano = Image.effect_noise((ancho // 2, alto // 2), 22).resize((ancho, alto)).filter(ImageFilter.GaussianBlur(1.2))
    lienzo = Image.blend(lienzo, Image.merge("RGB", [grano] * 3), 0.07)
    borde = tuple(round(c * 0.86) for c in lienzo.getpixel((ancho // 2, alto // 2)))
    luz = Image.new("L", (ancho, alto), 0)
    ImageDraw.Draw(luz).ellipse((-ancho * 0.25, -alto * 0.35, ancho * 1.25, alto * 1.35), fill=255)
    return Image.composite(lienzo, Image.new("RGB", (ancho, alto), borde), luz.filter(ImageFilter.GaussianBlur(alto // 5)))


def pantalla_final_marca(lienzo, cfg):
    """Nombre del canal en la mitad izquierda ("titulo": líneas separadas por |, *palabras* en el color
    de acento), una línea de acento y un "lema" corto debajo. La mitad derecha queda libre para YouTube."""
    ancho, alto = lienzo.size
    dibujo = ImageDraw.Draw(lienzo)
    acento, tinta = canal.color("acento", "#F58C32"), canal.color("texto", "#141414")
    lineas = [linea.strip() for linea in cfg["titulo"].split("|")]
    x, zona = round(ancho * 0.0625), ancho * 0.44
    tam = round(alto * 0.11)
    fuente = ImageFont.truetype(str(canal.fuente("titulo")[0]), tam)
    while tam > 20 and max(dibujo.textlength(l.replace("*", ""), font=fuente) for l in lineas) > zona:
        tam -= 4
        fuente = ImageFont.truetype(str(canal.fuente("titulo")[0]), tam)
    lema = cfg.get("lema")
    fuente_lema = ImageFont.truetype(str(canal.fuente("texto")[0]), round(alto * 0.043))
    alto_bloque = tam * 1.08 * len(lineas) + (alto * 0.05 + fuente_lema.size if lema else 0)
    y = (alto - alto_bloque) / 2
    abajo = y
    for linea in lineas:
        cx = x
        for resaltado, normal in re.findall(r"\*([^*]+)\*|([^*]+)", linea):
            trozo = resaltado or normal
            dibujo.text((cx, y), trozo, font=fuente, fill=acento if resaltado else tinta)
            abajo = max(abajo, dibujo.textbbox((cx, y), trozo, font=fuente)[3])   # borde real de las letras
            cx += dibujo.textlength(trozo, font=fuente)
        y += tam * 1.08
    y = abajo + alto * 0.035
    dibujo.line((x, y, x + ancho * 0.135, y), fill=acento, width=max(3, alto // 180))
    if lema:
        dibujo.text((x, y + alto * 0.025), lema, font=fuente_lema, fill=tinta)


def pantalla_final(guion, tmp):
    """Últimos segundos del vídeo, sin voz, reservados para los elementos de pantalla final de YouTube:
    el personaje saluda en la mitad izquierda y la derecha queda libre para el vídeo recomendado y el
    botón de suscripción. Se configura en canal.json ("pantalla_final") y el guion puede cambiarla o
    quitarla con "pantalla_final": false. Devuelve (imagen, duración, música) o None."""
    cfg = guion.get("pantalla_final", canal.get("pantalla_final"))
    if not cfg or es_short(guion) or guion.get("formato") == "vertical":   # los Shorts no tienen pantalla final
        return None
    cfg = {**(canal.get("pantalla_final") or {}), **(cfg if isinstance(cfg, dict) else {})}
    ancho, alto = TAMANOS[guion.get("formato", "horizontal")]
    lienzo = Image.new("RGB", (ancho, alto), canal.color("fondo", "#FFFFFF"))
    mitad = ancho // 2
    if cfg.get("papel"):
        lienzo = textura_papel(lienzo)
    if cfg.get("titulo"):
        pantalla_final_marca(lienzo, cfg)
    if cfg.get("pose"):
        with Image.open(canal.pose(cfg["pose"])) as pose:
            # El fondo de la hoja es casi blanco: se lleva a blanco puro para que no se note el recorte.
            pose = pose.convert("RGB").point(lambda v: 255 if v > 232 else v)
            escala = min(alto * 0.62 / pose.height, mitad * 0.8 / pose.width)
            pose = pose.resize((round(pose.width * escala), round(pose.height * escala)), Image.LANCZOS)
        lienzo.paste(pose, ((mitad - pose.width) // 2, alto - pose.height - round(alto * 0.06)))
    if cfg.get("texto"):
        dibujo = ImageDraw.Draw(lienzo)
        acento, negro = canal.color("acento", "#F58C32"), canal.color("texto", "#141414")
        palabras = []       # (texto, color, va pegado a la anterior); "*próximo viaje*!" → 3 piezas
        for resaltado, cola, normal in re.findall(r"\*([^*]+)\*(\S*)|(\S+)", cfg["texto"]):
            for w in (resaltado.split() if resaltado else [normal]):
                palabras.append((w, acento if resaltado else negro, False))
            if cola:
                palabras.append((cola, negro, True))
        fuente = ImageFont.truetype(str(DIR_FUENTES / "LuckiestGuy-Regular.ttf"), round(alto * 0.065))
        espacio = dibujo.textlength(" ", font=fuente)
        lineas, actual, w_actual = [], [], 0
        for texto, color, pegado in palabras:          # a lo ancho de la mitad izquierda
            w = dibujo.textlength(texto, font=fuente)
            hueco = 0 if pegado or not actual else espacio
            if actual and not pegado and w_actual + hueco + w > mitad * 0.85:
                lineas.append(actual)
                actual, w_actual, hueco = [], 0, 0
            actual.append((texto, color, w, hueco))
            w_actual += hueco + w
        lineas.append(actual)
        y = alto * 0.08
        for linea in lineas:
            x = (mitad - sum(w + h for _, _, w, h in linea)) / 2
            for texto, color, w, hueco in linea:
                x += hueco
                dibujo.text((x, y), texto, font=fuente, fill=color)
                x += w
            y += fuente.size * 1.1
    imagen = tmp / "pantalla_final.png"
    lienzo.save(imagen)
    musica = cfg.get("musica")
    archivo = None
    if musica and musica != "ninguna":
        archivo = ruta_musica(musica)
    return imagen, float(cfg.get("duracion", 20)), archivo


# ---------- 8. Publicación ----------

def tiempo_capitulo(s):
    s = int(s)
    return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def preparar_miniaturas(guion, carpeta):
    import miniatura
    configs = guion.get("miniaturas") or ([guion["miniatura"]] if guion.get("miniatura") else [])
    salidas = []
    for n, cfg in enumerate(configs, 1):
        if cfg.get("fondo"):                      # imagen ya hecha (p. ej. una del vídeo)
            fondo = ruta(cfg["fondo"])
            if not fondo.exists():
                sys.exit(f"ERROR: miniatura {n}: no existe el fondo {fondo}")
        else:
            fondo = carpeta / "img" / f"miniatura_{n}_fondo.png"
            firma = fondo.with_suffix(".firma")
            prompt = construir_prompt(guion, cfg["prompt"])
            refs = [ruta(r) for r in guion.get("referencias", [])] if "{tok}" in cfg["prompt"] else []
            h = huella(prompt, *refs)
            if not (fondo.exists() and firma.exists() and firma.read_text() == h):
                gen_imagen.generar(prompt, fondo, "horizontal", refs)
                firma.write_text(h)
        # El personaje se pega desde su hoja (siempre perfecto y en su sitio); la IA solo hace el fondo.
        pose = canal.pose(cfg["pose"]) if cfg.get("pose") else None
        if pose and not pose.exists():
            sys.exit(f"ERROR: no existe la pose {pose}")
        salida, _, _ = miniatura.crear(fondo, cfg["texto"], carpeta / f"miniatura_{n}.jpg",
                                       cfg.get("lado", "izquierda"), pose)
        salidas.append(salida)
    return salidas


def publicacion_short(guion, durs, carpeta, miniaturas):
    """publicacion.md de un Short independiente: YouTube Shorts, TikTok y Reels."""
    total = sum(durs)
    avisos = [] if 15 <= total <= 60 else [f"El Short dura {total:.0f} s (debe durar menos de 60 s)."]
    hashtags = " ".join(canal.get("hashtags_shorts", ["#shorts"]))
    descripcion = guion.get("descripcion", "").strip()
    if guion.get("fuentes"):
        descripcion += "\n\nFuentes:\n" + "\n".join(f"- {f}" for f in guion["fuentes"])
    titulos = [guion.get("titulo", "")] + [t for t in guion.get("titulos", []) if t != guion.get("titulo")]
    texto = [f"# Publicación del Short: {guion.get('titulo', '')}", "", f"Duración: {total:.0f} s", "",
             "## Títulos (elige uno; en Shorts se ven unos 40 caracteres)"]
    texto += [f"- ({len(t)} car.) {t}" for t in titulos]
    texto += ["", "## Descripción (YouTube)", "```text", descripcion + "\n\n" + hashtags, "```",
              "", "## TikTok e Instagram Reels (texto del post)", "```text",
              guion.get("titulo", "") + "\n\n" + guion.get("descripcion", "").strip() + "\n\n" + hashtags
              + " #aprendeentiktok #ciencia", "```"]
    if guion.get("etiquetas"):
        texto += ["", "## Etiquetas", "```text", ", ".join(guion["etiquetas"]), "```"]
    if guion.get("comentario_fijado"):
        texto += ["", "## Comentario fijado", "```text", guion["comentario_fijado"], "```"]
    if miniaturas:
        texto += ["", "## Portada"] + [f"- `{m.name}`" for m in miniaturas]
    texto += ["", "## Lista de comprobación al subir",
              "- [ ] Subir `final.mp4` desde el móvil o desde YouTube Studio (se detecta como Short: vertical y < 60 s)",
              "- [ ] Portada: elegir el fotograma del título (o la portada de arriba si la hay)",
              "- [ ] Título y descripción de arriba",
              "- [ ] Audiencia: \"No, no es contenido creado para niños\"",
              "- [ ] Contenido alterado o sintético: \"No\" (dibujos, nada que parezca real)",
              "- [ ] Vídeo relacionado: enlazar el vídeo largo del canal que más se parezca al tema",
              "- [ ] Subtítulos: `subtitulos.srt` (y `subtitulos_en.srt` si existe)",
              "- [ ] TikTok y Reels: subir el mismo `final.mp4` con el texto de arriba (sin marca de agua de otra red)",
              "- [ ] Publicar el comentario fijado"]
    if avisos:
        texto += ["", "## Avisos"] + [f"- {a}" for a in avisos]
    salida = carpeta / "publicacion.md"
    salida.write_text("\n".join(texto) + "\n", encoding="utf-8")
    return salida, avisos


def escribir_publicacion(guion, durs, carpeta, miniaturas, shorts, extra=0.0):
    """publicacion.md: todo lo que hay que copiar en YouTube Studio al subir el vídeo.
    extra: segundos que se añaden tras la última escena (pantalla final)."""
    if es_short(guion):
        return publicacion_short(guion, durs, carpeta, miniaturas)
    offsets = [sum(durs[:i]) for i in range(len(durs))]
    total = sum(durs) + extra
    capitulos = [(offsets[i], e["capitulo"]) for i, e in enumerate(guion["escenas"]) if e.get("capitulo")]
    avisos = []
    if capitulos:
        if capitulos[0][0] > 0:
            capitulos.insert(0, (0.0, "Intro"))
        cortos = [n for (t, n), (t2, _) in zip(capitulos, capitulos[1:] + [(total, "")]) if t2 - t < 10]
        if len(capitulos) < 3:
            avisos.append("YouTube necesita al menos 3 capítulos: no se mostrarán.")
        if cortos:
            avisos.append(f"Capítulos de menos de 10 s (YouTube los ignora): {', '.join(cortos)}")
    descripcion = guion.get("descripcion", "").strip()
    if capitulos:
        descripcion += "\n\n" + "\n".join(f"{tiempo_capitulo(t)} {n}" for t, n in capitulos)
    if guion.get("fuentes"):
        descripcion += "\n\nFuentes:\n" + "\n".join(f"- {f}" for f in guion["fuentes"])
    etiquetas = guion.get("etiquetas", [])
    if etiquetas:
        descripcion += "\n\n" + " ".join("#" + e.replace(" ", "") for e in etiquetas[:3])
    if len(descripcion) > 5000:
        avisos.append(f"La descripción tiene {len(descripcion)} caracteres (máximo 5.000).")
    if len(", ".join(etiquetas)) > 500:
        avisos.append("Las etiquetas pasan de 500 caracteres.")

    titulos = [guion.get("titulo", "")] + [t for t in guion.get("titulos", []) if t != guion.get("titulo")]
    texto = [f"# Publicación: {guion.get('titulo', '')}", "",
             f"Duración: {tiempo_capitulo(total)}", "", "## Títulos (elige uno; máx. 100 caracteres)"]
    for t in titulos:
        texto.append(f"- ({len(t)} car.) {t}")
    texto += ["", "## Miniaturas"] + [f"- `{m.name}`" for m in miniaturas]
    texto += ["", "## Descripción", "```text", descripcion, "```", "",
              "## Etiquetas (separadas por comas)", "```text", ", ".join(etiquetas), "```"]
    if guion.get("comentario_fijado"):
        texto += ["", "## Comentario fijado (publícalo y fíjalo nada más subir)", "```text",
                  guion["comentario_fijado"], "```"]
    for n, (archivo, dur, cfg) in enumerate(shorts, 1):
        desc = cfg.get("descripcion", "").strip() + f"\n\nVídeo completo en el canal: {guion.get('titulo', '')}"
        texto += ["", f"## Short {n}: `{archivo.name}` ({dur:.0f} s)",
                  "Título (YouTube Shorts, TikTok y Reels):", "```text", cfg.get("titulo", "").replace("*", ""),
                  "```", "Descripción:", "```text", desc + "\n" + " ".join(canal.get("hashtags_shorts", ["#shorts"])), "```"]
    texto += ["", "## Lista de comprobación al subir",
              "- [ ] Vídeo `final.mp4` y la miniatura elegida",
              "- [ ] Miniaturas: activar \"Probar y comparar\" con las 3 (YouTube elige la de más tiempo de visualización)",
              "- [ ] Título, descripción y etiquetas de arriba",
              "- [ ] Audiencia: \"No, no es contenido creado para niños\"",
              "- [ ] Contenido alterado o sintético: \"No\" (dibujos, nada que parezca real)",
              "- [ ] Subtítulos (opcional): subir `subtitulos.srt` como Español (ayuda al SEO; los del "
              "vídeo ya van incrustados) y `subtitulos_en.srt` como Inglés si existe",
              "- [ ] Pantalla final (los últimos segundos del vídeo están reservados para ella): elemento "
              "\"Vídeo recomendado automáticamente\" a la derecha + botón Suscribirse",
              "- [ ] Tarjetas: al vídeo anterior del canal, si encaja con el tema",
              "- [ ] Publicar a las 18:00 hora de España (orientativo; cuando haya datos, usar "
              "Analytics → Público → \"Cuándo están conectados tus espectadores\")",
              "- [ ] Publicar el comentario fijado",
              "- [ ] Shorts: subirlos 1-2 días después del vídeo largo, enlazándolo como \"vídeo relacionado\""]
    if avisos:
        texto += ["", "## Avisos"] + [f"- {a}" for a in avisos]
    salida = carpeta / "publicacion.md"
    salida.write_text("\n".join(texto) + "\n", encoding="utf-8")
    return salida, avisos


def subtitulos_de_efectos(datos_voz, offsets):
    """Subtítulos de los efectos que son voz (canal.json → "subtitulos_efectos", p. ej. el saludo de
    Tok {toc_toc}): (inicio, fin, texto) mientras suena el efecto."""
    textos = {k: v for k, v in (canal.get("subtitulos_efectos") or {}).items() if not k.startswith("_")}
    extras = []
    for d, desplazamiento in zip(datos_voz, offsets):
        for m in d["marcas"]:
            if m["nombre"] in textos and ruta_sfx(m['nombre']).exists():
                ini = desplazamiento + m["t"]
                extras.append((ini, ini + duracion_s(ruta_sfx(m['nombre'])), textos[m["nombre"]]))
    return extras


def rotulos_y_titulo(guion, lista, total):
    """Rótulos de los planos y, si el guion tiene "titulo_pantalla", el título grande de los primeros
    segundos (Shorts); los rótulos que empezarían debajo del título se quitan."""
    rotulos = [(p["inicio"], p["fin"], p["rotulo"]) for p in lista if p.get("rotulo")]
    if not guion.get("titulo_pantalla"):
        return rotulos, None
    fin_titulo = min(3.0, total)
    return [r for r in rotulos if r[0] >= fin_titulo], (0.0, fin_titulo, guion["titulo_pantalla"])


# ---------- Boceto ----------

TAMANO_BOCETO = {"horizontal": (672, 384), "vertical": (384, 672)}


def boceto(guion, carpeta, tmp, rehacer):
    """Storyboard barato antes de gastar cuota: todas las imágenes a baja resolución con el motor local
    (≈ 50 s cada una en el M1 Pro), hoja de contactos y, si las voces ya existen, boceto.mp4 (960x540) con voz,
    efectos, música y subtítulos para ver el ritmo. Nada de esto se reutiliza en el vídeo final."""
    formato = guion.get("formato", "horizontal")
    gen_imagen.MOTOR = "local"
    rutas = preparar_imagenes(guion, carpeta, rehacer, "boceto", TAMANO_BOCETO[formato])
    unicas = {k: v for k, v in rutas.items() if v not in list(rutas.values())[:list(rutas).index(k)]}
    hoja = hoja_de_contactos(list(unicas.values()), tmp / "boceto_contactos.png", list(unicas))
    print(f"OK: {len(unicas)} imágenes de boceto; hoja de contactos en {hoja.relative_to(RAIZ)}")
    n_esc = len(guion["escenas"])
    if not all((carpeta / "voz" / f"{i:02d}.wav").exists() for i in range(1, n_esc + 1)):
        print("  (sin boceto.mp4: faltan voces; genera antes las voces con --solo-voces)")
        return hoja
    datos_voz = preparar_voces(guion, carpeta, set())
    durs = duraciones(datos_voz)
    lista = planos(guion, range(1, n_esc + 1), datos_voz, durs, rutas)
    offsets = [sum(durs[:i]) for i in range(n_esc)]
    rotulos, titulo = rotulos_y_titulo(guion, lista, sum(durs))
    ass = subtitulos.generar_ass(list(zip(datos_voz, offsets)), tmp / "boceto.ass", formato, rotulos, titulo,
                                 subtitulos_de_efectos(datos_voz, offsets))
    audio = tmp / "boceto.wav"
    voces = [carpeta / "voz" / f"{i:02d}.wav" for i in range(1, n_esc + 1)]
    mezclar_audio(guion, voces, datos_voz, durs, musicas_por_escena(guion), audio, lista)
    ancho, alto = TAMANOS[formato]
    salida = carpeta / "boceto.mp4"
    renderizar(lista, (ancho // 2, alto // 2), audio, ass, salida)
    print(f"OK: {salida.relative_to(RAIZ)} ({sum(durs):.0f} s)")
    return salida


# ---------- Principal ----------

def montar(guion_ruta, rehacer_imagenes=(), rehacer_voces=(), solo_imagenes=False, solo_voces=None,
           solo_boceto=False, solo_ai33=False, previsto_voz=False, escena_sola=None):
    guion_ruta, guion = canal.leer_guion(guion_ruta, completo=True)
    global SINCRONIA
    SINCRONIA = guion.get("sincronia") if guion.get("sincronia") in ("exacta", "aproximada") else None
    carpeta = guion_ruta.parent
    global CARPETA_VIDEO
    CARPETA_VIDEO = carpeta
    tmp = carpeta / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    formato = guion.get("formato", "horizontal")
    if formato not in TAMANOS:
        sys.exit(f"ERROR: formato '{formato}' no válido")
    if es_short(guion) and formato != "vertical":
        sys.exit("ERROR: un Short (\"tipo\": \"short\") debe tener \"formato\": \"vertical\"")
    if not guion.get("escenas"):
        sys.exit("ERROR: el guion no tiene escenas")
    validar(guion)
    if not simulacion.activa():            # fuera del modo sin gasto, las salidas falsas de antes se generan de verdad
        for f in simulacion.limpiar_simuladas(carpeta):
            print(f"  (salida simulada retirada: {f})")
    rehacer_imagenes = {str(x) for x in rehacer_imagenes}
    if not previsto_voz:                   # el previsto solo calcula (y su salida es JSON para la UI)
        abrir_log(carpeta, sys.argv[1:])

    inicio = time.time()
    if escena_sola:
        return rehacer_escena_sola(guion, carpeta, escena_sola, previsto_voz)
    if previsto_voz:
        previstas = voces_previstas(guion, carpeta, set(rehacer_voces), set(solo_voces or []))
        pendientes = [b for b in previstas if not b["hecho"]]
        pago = sum(b["caracteres"] for b in pendientes if b["de_pago"])
        print(json.dumps({
            "bloques": [{"escenas": b["bloque"], "caracteres": b["caracteres"], "hecho": b["hecho"],
                         "de_pago": b["de_pago"],
                         **({"cambiadas": escenas_cambiadas(guion, carpeta, b)} if not b["hecho"] else {})}
                        for b in previstas],
            "pendientes": len(pendientes), "caracteres_de_pago": pago,
            "creditos": round(pago * CREDITOS_CARACTER_AI33), "voz": previstas[0]["ajustes"][0] if previstas else None,
        }, ensure_ascii=False))
        return None
    if solo_voces:
        datos = preparar_voces(guion, carpeta, set(rehacer_voces), set(solo_voces))
        for i, d in zip(sorted(solo_voces), datos):
            print(f"  voz {i:02d}: {d['duracion']:.1f} s → {(carpeta / 'voz' / f'{i:02d}.wav').relative_to(RAIZ)}")
        return None
    if solo_boceto:
        return boceto(guion, carpeta, tmp, rehacer_imagenes)
    if solo_ai33:           # solo el lote de pago (lo lanza la UI con confirmación del coste)
        if not GASTAR_AI33:
            sys.exit("ERROR: --solo-ai33 necesita --gastar-ai33 (DE PAGO: preguntar antes)")
        preparar_ai33(guion, carpeta, rehacer_imagenes, formato)
        print("OK: lote de ai33 terminado")
        return None
    if solo_imagenes:
        rutas = preparar_imagenes(guion, carpeta, rehacer_imagenes)
        if not SOLO:
            rutas.update({f"v{k}": v for k, v in imagenes_verticales(guion, carpeta, rehacer_imagenes).items()})
        unicas = {k: v for k, v in rutas.items() if not any(v == w for w in list(rutas.values())[:list(rutas).index(k)])}
        if SOLO:            # solo las rehechas, en otra hoja: la completa (contactos.png) no se pisa
            unicas = {k: v for k, v in unicas.items() if not fuera_de_solo(k, int(k[:2]))}
        hoja = hoja_de_contactos(list(unicas.values()), tmp / ("contactos_rehechas.png" if SOLO else "contactos.png"),
                                 list(unicas))
        print(f"OK: {len(unicas)} imágenes; hoja de contactos en {hoja.relative_to(RAIZ)}")
        return hoja

    fase(0, "Voces")
    print("1/6 Voces")
    datos_voz = preparar_voces(guion, carpeta, set(rehacer_voces))
    fase(3, "Imágenes")
    print("2/6 Imágenes")
    rutas = preparar_imagenes(guion, carpeta, rehacer_imagenes)
    durs = duraciones(datos_voz)
    n_esc = len(guion["escenas"])
    lista = planos(guion, range(1, n_esc + 1), datos_voz, durs, rutas)
    largos = [f"{p['id']} ({p['fin'] - p['inicio']:.1f} s)" for p in lista if p["fin"] - p["inicio"] > MAX_PLANO]
    if largos:
        print(f"  Aviso: imágenes más de {MAX_PLANO:.0f} s en pantalla: {', '.join(largos)}")
    musicas = musicas_por_escena(guion)
    voces = [carpeta / "voz" / f"{i:02d}.wav" for i in range(1, n_esc + 1)]
    # La pantalla final va solo en el vídeo largo (los Shorts usan lista, durs y musicas sin ella).
    lista_v, voces_v, datos_v, durs_v, musicas_v = lista, voces, datos_voz, durs, musicas
    final = pantalla_final(guion, tmp)
    if final:
        imagen_final, dur_final, musica_final = final
        silencio = tmp / "silencio.wav"
        ffmpeg("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "0.1", silencio)
        t0 = sum(durs)
        lista_v = lista + [{"id": "final", "escena": n_esc + 1, "imagen": str(imagen_final),
                            "inicio": round(t0, 3), "fin": round(t0 + dur_final, 3),
                            "movimiento": "fijo", "rotulo": None}]
        voces_v, datos_v = voces + [silencio], datos_voz + [{"duracion": 0.0, "palabras": [], "marcas": []}]
        durs_v, musicas_v = durs + [dur_final], musicas + [musica_final or musicas[-1]]
    (tmp / "linea_tiempo.json").write_text(json.dumps(
        {"duracion": sum(durs_v), "escenas": [{"n": i + 1, "inicio": sum(durs_v[:i]), "fin": sum(durs_v[:i + 1])}
                                              for i in range(len(durs_v))], "planos": lista_v},
        ensure_ascii=False, indent=1), encoding="utf-8")

    fase(8, "Subtítulos")
    print("3/6 Subtítulos")
    offsets = [sum(durs[:i]) for i in range(n_esc)]
    rotulos, titulo = rotulos_y_titulo(guion, lista, sum(durs))
    ass = subtitulos.generar_ass(list(zip(datos_voz, offsets)), tmp / "subtitulos.ass", formato, rotulos, titulo,
                                 subtitulos_de_efectos(datos_voz, offsets))
    subtitulos.generar_srt(list(zip(datos_voz, offsets)), carpeta / "subtitulos.srt")
    fase(9, "Audio: voz, efectos y música")
    print("4/6 Audio (voz + efectos + música)")
    audio = tmp / "audio.wav"
    mezclar_audio(guion, voces_v, datos_v, durs_v, musicas_v, audio, lista_v)
    fase(12, "Vídeo")
    print("5/6 Vídeo")
    salida = carpeta / "final.mp4"
    parcial = tmp / "final.mp4"     # final.mp4 solo aparece entero: la UI no lo da por montado a medias
    renderizar(lista_v, TAMANOS[formato], audio, ass, parcial, rango=(12, 96))
    os.replace(parcial, salida)
    registrar_montaje(carpeta)

    fase(96, "Shorts, miniaturas y publicación")
    print("6/6 Shorts, miniaturas y publicación")
    shorts = []
    verticales = imagenes_verticales(guion, carpeta, rehacer_imagenes)
    for n, cfg in enumerate(guion.get("shorts", []), 1):
        archivo, dur = montar_short(guion, carpeta, n, cfg, datos_voz, durs, lista, musicas, tmp, verticales)
        shorts.append((archivo, dur, cfg))
        print(f"  short {n}: {archivo.relative_to(RAIZ)} ({dur:.0f} s)")
    minis = preparar_miniaturas(guion, carpeta)
    pub, avisos = escribir_publicacion(guion, durs, carpeta, minis, shorts, sum(durs_v) - sum(durs))
    for aviso in avisos:
        print(f"  Aviso: {aviso}")
    print(f"OK: {salida.relative_to(RAIZ)} ({sum(durs_v):.1f} s, {len(lista)} imágenes en pantalla) "
          f"en {time.time() - inicio:.0f} s")
    print(f"    {pub.relative_to(RAIZ)}, {len(minis)} miniaturas, {len(shorts)} Shorts")
    fase(100, "Hecho")
    return salida


def huella_escenas(escenas):
    """Huella de las escenas tal como están en guion.json: la UI la compara con la de montaje.json para saber si el
    vídeo montado es anterior al guion actual (ui/backend/app/guia.py, Contexto.montaje)."""
    return huella(json.dumps(escenas, sort_keys=True, ensure_ascii=False))


def musica_elegida(carpeta):
    """{ambiente: versión elegida} de la música de Suno del vídeo (musica/musica.json)."""
    try:
        datos = json.loads((carpeta / "musica" / "musica.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {a: d["elegida"] for a, d in sorted(datos.items()) if isinstance(d, dict) and d.get("elegida")}


def registrar_montaje(carpeta):
    """montaje.json: con qué guion y qué música se montó final.mp4 (voces e imágenes se comparan por fecha)."""
    escenas = json.loads((carpeta / "guion.json").read_text(encoding="utf-8")).get("escenas") or []
    archivos.escribir_json(carpeta / "montaje.json", {"fecha": time.strftime("%Y-%m-%dT%H:%M:%S"),
                                                      "escenas": huella_escenas(escenas),
                                                      "musica": musica_elegida(carpeta)})


def main():
    p = argparse.ArgumentParser(description="Monta un vídeo a partir de un guion.json")
    p.add_argument("guion", help="Ruta del guion.json")
    p.add_argument("--rehacer-imagenes", default="",
                   help="Imágenes a regenerar: número de escena (todas sus imágenes), id EE-N o vEE-N "
                        "(versión vertical de un Short), p. ej. 3,5-2,v6-1")
    p.add_argument("--rehacer-voces", default="", help="Escenas cuya voz regenerar (otra toma), p. ej. 2")
    p.add_argument("--solo-imagenes", action="store_true",
                   help="Genera solo las imágenes y una hoja de contactos para revisarlas")
    p.add_argument("--solo-voces", default="", help="Genera solo la voz de estas escenas, p. ej. 1,2")
    p.add_argument("--boceto", action="store_true",
                   help="Storyboard: imágenes a baja resolución en el Mac (sin cuota) y boceto.mp4 si hay voces")
    p.add_argument("--motor", default=gen_imagen.MOTOR,
                   help="Motor de imágenes: auto (Cloudflare y, sin cuota, el Mac), cloudflare, local o el id de un "
                        "servicio de imágenes conectado")
    p.add_argument("--solo-ai33", action="store_true",
                   help="Solo el lote de imágenes de ai33 (con --gastar-ai33), sin las de klein")
    p.add_argument("--solo", action="store_true",
                   help="Con --rehacer-imagenes: genera SOLO esas (las demás que falten o hayan cambiado, no)")
    p.add_argument("--gastar-ai33", action="store_true",
                   help="Permite gastar en ai33 (DE PAGO): las imágenes con \"motor\": \"ai33\" y la voz del canal "
                        "si es de ai33 (preguntar antes)")
    p.add_argument("--previsto-voz", action="store_true",
                   help="Sin gastar: JSON con los bloques de voz, cuáles faltan y los créditos de ai33 que costarían "
                        "(con --solo-voces / --rehacer-voces, solo esos)")
    p.add_argument("--escena-sola", type=int,
                   help="Otra toma de UNA escena de un bloque ya locutado, sin tocar las demás (con --gastar-ai33 si "
                        "es de pago; con --previsto-voz, solo el coste)")
    a = p.parse_args()
    global GASTAR_AI33
    gen_imagen.MOTOR = a.motor
    GASTAR_AI33 = a.gastar_ai33

    def numeros(txt):
        return [int(x) for x in txt.split(",") if x.strip()]

    def ident(x):              # "3" → "3" (escena entera), "5-2" → "05-2", "v5-2" → "v05-2" (vertical)
        x = x.strip()
        if x.startswith("v"):
            return "v" + x[1:].zfill(4)
        return x.lstrip("0") if "-" not in x else x.zfill(4)

    rehacer_img = [ident(x) for x in a.rehacer_imagenes.split(",") if x.strip()]
    if a.solo:
        if not rehacer_img:
            sys.exit("ERROR: --solo necesita --rehacer-imagenes con las imágenes a generar")
        SOLO.update(rehacer_img)
    try:
        montar(a.guion, rehacer_img, numeros(a.rehacer_voces), a.solo_imagenes, numeros(a.solo_voces) or None,
               a.boceto, a.solo_ai33, a.previsto_voz, a.escena_sola)
    except archivos.ArchivoDanado as e:          # p. ej. el registro de lo pagado en ai33: se para sin tocarlo
        _escribir_log(f"!! Terminó con error: {e}\n")
        sys.exit(f"ERROR: {e}")
    except SystemExit as e:       # el motivo del fallo, también en montaje.log
        if e.code not in (0, None):
            _escribir_log(f"!! Terminó con error: {str(e.code)[-2000:]}\n")
        raise
    except BaseException as e:
        _escribir_log(f"!! Se cortó: {type(e).__name__}: {e}\n")
        raise
    _escribir_log("== Terminado\n")


if __name__ == "__main__":
    main()

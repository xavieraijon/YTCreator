"""Alineación forzada con WhisperX (wav2vec2 en español): sincronía LOCAL de la voz, sin ningún servicio.

A diferencia de la sincronía «exacta» (reconocimiento de Azure), esto no transcribe: alinea el texto del guion,
que ya conocemos, contra el audio. Por eso funciona también con voces que el reconocimiento entiende mal (probado
el 08/10 con `say -v Eddy`, que Azure solo entendía al 23 %: WhisperX alineó sus 66 palabras sin problema).
Gratis y sin cuota, en este ordenador.

Medido el 08/10 con las 510 palabras de 5 escenas de una voz de ai33 (ElevenLabs), frente a sus tiempos nativos:
mediana 0,03-0,04 s y p90 0,12-0,18 s de error por palabra — mejor que la aproximada del kit, parecida a la
exacta de Azure cuando esta sí entiende la voz.

Todo vive dentro del proyecto: entorno en .venv-whisperx/ y modelo en modelos/whisperx/ (ninguno se sube a Git).

No se ejecuta a mano: gen_voz.py lo lanza con .venv-whisperx/bin/python cuando la sincronía es "local" (o de
respaldo, si la exacta entiende menos del 60 % de la voz). Carga el modelo una vez y atiende peticiones, una por
línea JSON en la entrada estándar: {"texto", "audio_b64"} (el audio: PCM 16 bits mono a 24000 Hz, en base64);
responde {"ok": true, "reconocidas": [[palabra, inicio, fin], ...], "segundos": N} o {"ok": false, "error": "..."}
por la salida estándar, en el mismo formato que usa gen_voz.alinear() con lo reconocido por Azure. Termina al
cerrarse la entrada.

Prioridad mínima de CPU (nice 19), como el motor local de imágenes. Medido el 08/10 en un M1 Pro: modelo cargado
en 1-2 s (ya en caché) y cada escena de 15-30 palabras alineada en menos de 1 s.

Instalación (una vez; Python 3.13, no el del sistema: en Mac el de Homebrew, en Windows `py -3.13`, en Linux python3.13):
    /opt/homebrew/opt/python@3.13/bin/python3.13 -m venv .venv-whisperx
    PIP_CACHE_DIR=modelos/pip-cache .venv-whisperx/bin/pip install whisperx
    .venv-whisperx/bin/python herramientas/alineacion_local.py --preparar      # descarga el modelo (~360 MB)
En Windows, `.venv-whisperx\\Scripts\\python.exe` en lugar de `.venv-whisperx/bin/python` (sistema.python_venv).
Medido el 08/10: entorno (PyTorch incluido) 1,3 GB + modelo 0,37 GB ≈ 1,7 GB en total.
"""

import argparse
import base64
import json
import os
import sys
import tempfile
import time
import unicodedata
import wave
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODELOS = RAIZ / "modelos" / "whisperx"
IDIOMA = "es"
FRECUENCIA = 24000              # PCM 16 bits mono, igual que gen_voz.py

# Todo dentro del proyecto: el modelo de alineación (wav2vec2) se cachea vía torch hub, y sin telemetría.
os.environ["TORCH_HOME"] = str(MODELOS)
os.environ["HF_HOME"] = str(MODELOS / "hf")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


def responder(datos):
    sys.stdout.write(json.dumps(datos, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def normalizar(palabra):
    """Minúsculas y sin tildes (igual que gen_voz.normalizar), para que lo reconocido encaje con el texto."""
    palabra = unicodedata.normalize("NFD", palabra.lower())
    return "".join(c for c in palabra if unicodedata.category(c) != "Mn")


def preparar():
    """Descarga el modelo de alineación en español (una sola vez) y dice cuánto ocupa."""
    import whisperx

    whisperx.load_align_model(language_code=IDIOMA, device="cpu")
    ocupa = sum(f.stat().st_size for f in MODELOS.rglob("*") if f.is_file())
    print(f"OK: modelo de alineación descargado en {MODELOS} ({ocupa / 1e6:.0f} MB)")


def cargar():
    import whisperx

    return whisperx.load_align_model(language_code=IDIOMA, device="cpu")


def alinear(modelo_a, metadata, texto, audio):
    """[(palabra_normalizada, inicio, fin), ...] con los tiempos de WhisperX, a partir de un texto conocido y su
    PCM 16 bits mono a FRECUENCIA Hz (mismo formato que gen_voz.reconocer_palabras, para usar con gen_voz.alinear)."""
    import whisperx

    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(FRECUENCIA)
            w.writeframes(audio)
        onda = whisperx.load_audio(tmp.name)
    duracion = len(audio) / 2 / FRECUENCIA
    segmento = [{"start": 0.0, "end": duracion, "text": texto}]
    resultado = whisperx.align(segmento, modelo_a, metadata, onda, "cpu", return_char_alignments=False)
    reconocidas = []
    for seg in resultado["segments"]:
        for w in seg.get("words", []):
            if "start" in w and "end" in w:
                reconocidas.append((normalizar(w["word"]), round(w["start"], 3), round(w["end"], 3)))
    return reconocidas


def servir():
    if hasattr(os, "nice"):           # en Windows no hay nice: corre con la prioridad que le dio quien lo lanzó
        os.nice(19)
    try:
        modelo_a, metadata = cargar()
    except Exception as e:  # noqa: BLE001 - se informa al proceso padre
        responder({"ok": False, "error": f"no se pudo cargar el modelo de alineación: {e}"})
        return
    responder({"ok": True, "listo": True})
    for linea in sys.stdin:
        if not linea.strip():
            continue
        p = json.loads(linea)
        inicio = time.time()
        try:
            audio = base64.b64decode(p["audio_b64"])
            reconocidas = alinear(modelo_a, metadata, p["texto"], audio)
            responder({"ok": True, "reconocidas": reconocidas, "segundos": round(time.time() - inicio, 1)})
        except Exception as e:  # noqa: BLE001
            responder({"ok": False, "error": str(e)})


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--preparar", action="store_true", help="descarga el modelo de alineación (una vez)")
    preparar() if p.parse_args().preparar else servir()

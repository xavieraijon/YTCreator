"""Prepara efectos de sonido para el montaje: recorta silencios, normaliza y convierte a WAV.

Uso:
    .venv/bin/python herramientas/prep_sfx.py entrada.mp3 recursos/sfx/pop.wav
    .venv/bin/python herramientas/prep_sfx.py entrada.mp3 salida.wav --pico -6

- Quita el silencio inicial (para que el efecto suene justo en su fotograma) y el final.
- Normaliza por pico (por defecto -3 dBFS); el volumen de mezcla se ajusta luego en el montaje.
- Salida: WAV PCM 16 bits, 48 kHz, estéreo (el formato de trabajo de los vídeos).
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sistema  # noqa: E402,F401  (ffmpeg y yt-dlp instalados por /instalar, en el PATH)

UMBRAL = "-50dB"
FUNDIDO_FINAL = 0.03


MARGEN_MEDIDA = 12.0  # volumedetect no mide por encima de 0 dB: se atenúa antes y se compensa


def pico_db(ruta, filtros=None):
    medida = f"volume=-{MARGEN_MEDIDA}dB,volumedetect"
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-i", str(ruta),
           "-af", f"{filtros},{medida}" if filtros else medida]
    salida = subprocess.run(cmd + ["-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"max_volume: (-?[\d.]+) dB", salida)
    if not m:
        sys.exit(f"ERROR: no se pudo medir el volumen de {ruta}")
    return float(m.group(1)) + MARGEN_MEDIDA


def preparar(entrada, salida, pico_objetivo=-3.0):
    entrada, salida = Path(entrada), Path(salida)
    if not entrada.exists():
        sys.exit(f"ERROR: no existe {entrada}")
    recorte = (
        "aresample=48000,"  # remuestrear antes de medir: el cambio de frecuencia altera el pico
        f"silenceremove=start_periods=1:start_threshold={UMBRAL},"
        f"areverse,silenceremove=start_periods=1:start_threshold={UMBRAL},areverse"
    )
    ganancia = pico_objetivo - pico_db(entrada, recorte)
    duracion_aprox = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(entrada)],
        capture_output=True, text=True).stdout.strip() or 0)
    filtros = f"{recorte},volume={ganancia:.2f}dB"
    if duracion_aprox > FUNDIDO_FINAL * 4:
        filtros += f",areverse,afade=t=in:d={FUNDIDO_FINAL},areverse"

    salida.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(entrada), "-af", filtros,
         "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(salida)],
        capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"ERROR ffmpeg: {r.stderr[:300]}")
    return salida, ganancia


def main():
    p = argparse.ArgumentParser(description="Prepara un efecto de sonido para el montaje")
    p.add_argument("entrada")
    p.add_argument("salida", help="Ruta .wav de salida")
    p.add_argument("--pico", type=float, default=-3.0, help="Pico objetivo en dBFS (por defecto -3)")
    a = p.parse_args()
    ruta, ganancia = preparar(a.entrada, a.salida, a.pico)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(ruta)], capture_output=True, text=True).stdout.strip()
    print(f"OK: {ruta} ({float(dur):.2f} s, ganancia {ganancia:+.1f} dB)")


if __name__ == "__main__":
    main()

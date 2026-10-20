"""Genera música de fondo original (100 % propia, sin licencias) con un sintetizador sencillo en Python.

Uso:
    .venv/bin/python herramientas/gen_musica.py alegre -o recursos/musica/alegre.wav
    .venv/bin/python herramientas/gen_musica.py tranquilo -o recursos/musica/tranquilo.wav --semilla 7
    .venv/bin/python herramientas/gen_musica.py misterio -o recursos/musica/misterio.wav

Ambientes: alegre (tema principal), tranquilo (fondo para explicar), misterio (giros finales).
La pieza dura 16 compases y enlaza bien consigo misma, para que montar.py la repita en bucle.
La misma semilla da siempre la misma pieza; otra semilla, otra melodía con el mismo ambiente.
"""

import argparse
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sistema  # noqa: E402,F401  (ffmpeg y yt-dlp instalados por /instalar, en el PATH)

SR = 44100
NOTAS = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}

# Cada ambiente: tempo, acordes (4 por vuelta, 1 compás cada uno), escala de la melodía e instrumentos.
AMBIENTES = {
    "alegre": {
        "bpm": 118, "acordes": [("C", "maj"), ("G", "maj"), ("A", "min"), ("F", "maj")],
        "escala": ["C", "D", "E", "G", "A"], "melodia": "marimba", "acompanamiento": "pizzicato",
        "bajo": True, "bateria": "ligera", "densidad": 0.75,
    },
    "tranquilo": {
        "bpm": 84, "acordes": [("F", "maj"), ("C", "maj"), ("D", "min"), ("A#", "maj")],
        "escala": ["F", "G", "A", "C", "D"], "melodia": "caja_musica", "acompanamiento": "pad",
        "bajo": True, "bateria": None, "densidad": 0.45,
    },
    "misterio": {
        "bpm": 92, "acordes": [("D", "min"), ("A#", "maj"), ("G", "min"), ("A", "maj")],
        "escala": ["D", "E", "F", "A", "A#", "C#"], "melodia": "pizzicato", "acompanamiento": "pad",
        "bajo": True, "bateria": "pasos", "densidad": 0.5,
    },
}
INTERVALOS = {"maj": [0, 4, 7], "min": [0, 3, 7]}


def frecuencia(nota, octava):
    return 440.0 * 2 ** ((NOTAS[nota] + 12 * (octava + 1) - 69) / 12)


def envolvente(n, ataque, caida):
    t = np.arange(n) / SR
    env = np.exp(-t / caida)
    a = max(1, int(ataque * SR))
    env[:a] *= np.linspace(0, 1, a)
    return env


# ---------- Instrumentos (todos sintetizados) ----------

def marimba(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.05)
    return 0.5 * s * envolvente(n, 0.003, 0.35)


def caja_musica(f, dur):
    n = int(max(dur, 1.2) * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.01 * t) + 0.15 * np.sin(2 * np.pi * f * 5.4 * t)
    return 0.35 * s * envolvente(n, 0.002, 0.6)


def pizzicato(f, dur):
    """Cuerda pulsada (Karplus-Strong)."""
    n = int(max(dur, 0.4) * SR)
    periodo = max(2, int(SR / f))
    rng = np.random.default_rng(int(f * 1000))
    buf = rng.uniform(-1, 1, periodo)
    salida = np.empty(n)
    for i in range(n):
        salida[i] = buf[i % periodo]
        buf[i % periodo] = 0.996 * 0.5 * (buf[i % periodo] + buf[(i + 1) % periodo])
    return 0.4 * salida * envolvente(n, 0.001, 0.4)


def pad(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * d * t) for d in (0.997, 1.0, 1.003)) / 3
    env = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4).clip(0)
    return 0.18 * s * env


def bajo(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * f * 2 * t)
    return 0.45 * s * envolvente(n, 0.005, 0.5)


def bombo(dur=0.25):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 110 * np.exp(-t / 0.04) + 45
    return 0.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.08)


def charles(dur=0.06, semilla=0):
    n = int(dur * SR)
    ruido = np.random.default_rng(semilla).uniform(-1, 1, n)
    ruido = np.diff(ruido, prepend=0)          # quita graves: suena más "metálico"
    return 0.12 * ruido * np.exp(-np.arange(n) / SR / 0.015)


INSTRUMENTOS = {"marimba": marimba, "caja_musica": caja_musica, "pizzicato": pizzicato, "pad": pad}


# ---------- Composición ----------

def componer(nombre, semilla):
    cfg = AMBIENTES[nombre]
    rng = np.random.default_rng(semilla)
    pulso = 60 / cfg["bpm"]
    compas = 4 * pulso
    vueltas = 4                                  # 4 vueltas x 4 acordes = 16 compases
    total = int(vueltas * len(cfg["acordes"]) * compas * SR) + SR
    mezcla = {"izq": np.zeros(total), "der": np.zeros(total)}

    def poner(señal, t, pan=0.0, vol=1.0):
        i = int(t * SR)
        fin = min(total, i + len(señal))
        señal = señal[:fin - i] * vol
        mezcla["izq"][i:fin] += señal * (1 - pan) / 2 * 2 ** 0.5
        mezcla["der"][i:fin] += señal * (1 + pan) / 2 * 2 ** 0.5

    # Melodía: dos frases (A y B) que se repiten A A B A, para que suene a canción y no a azar.
    def frase():
        notas, t = [], 0.0
        while t < len(cfg["acordes"]) * 4 - 0.01:
            duracion = rng.choice([0.5, 0.5, 1.0, 1.0, 1.5, 2.0]) if rng.random() < cfg["densidad"] else 1.0
            duracion = min(duracion, len(cfg["acordes"]) * 4 - t)
            silencio = rng.random() > cfg["densidad"] + 0.2
            nota = rng.choice(cfg["escala"])
            octava = 5 if rng.random() < 0.7 else 6
            notas.append((t, duracion, None if silencio else (nota, octava)))
            t += duracion
        return notas

    a, b = frase(), frase()
    melodia = INSTRUMENTOS[cfg["melodia"]]
    acomp = INSTRUMENTOS[cfg["acompanamiento"]]
    for v, fr in enumerate([a, a, b, a]):
        inicio_vuelta = v * len(cfg["acordes"]) * compas
        for t, dur, nota in fr:
            if nota:
                poner(melodia(frecuencia(*nota), dur * pulso), inicio_vuelta + t * pulso, pan=0.2, vol=0.9)
        for k, (raiz, tipo) in enumerate(cfg["acordes"]):
            t0 = inicio_vuelta + k * compas
            notas_acorde = [(NOTAS[raiz] + i) % 12 for i in INTERVALOS[tipo]]
            nombres = [next(n for n, v_ in NOTAS.items() if v_ == x) for x in notas_acorde]
            if cfg["acompanamiento"] == "pad":
                for nn in nombres:
                    poner(pad(frecuencia(nn, 4), compas), t0, pan=-0.3)
            else:
                for p in range(4):                   # arpegio: una nota del acorde por pulso
                    nn = nombres[p % 3]
                    poner(acomp(frecuencia(nn, 4), pulso), t0 + p * pulso, pan=-0.35, vol=0.7)
            if cfg["bajo"]:
                poner(bajo(frecuencia(raiz, 2), compas * 0.9), t0, vol=0.8)
                if nombre == "alegre":
                    poner(bajo(frecuencia(raiz, 2), pulso), t0 + 2.5 * pulso, vol=0.6)
            if cfg["bateria"] == "ligera" and v > 0:     # la batería entra en la segunda vuelta
                for p in range(4):
                    if p in (0, 2):
                        poner(bombo(), t0 + p * pulso, vol=0.8)
                    for m in (0, 0.5):
                        poner(charles(semilla=k * 8 + p), t0 + (p + m) * pulso, pan=0.4, vol=0.9)
            elif cfg["bateria"] == "pasos":
                for p in (0, 2):
                    poner(bombo(0.3), t0 + p * pulso, vol=0.45)

    duracion_pieza = vueltas * len(cfg["acordes"]) * compas
    estereo = np.stack([mezcla["izq"], mezcla["der"]], axis=1)
    # La cola que pasa del final se suma al principio: así el bucle enlaza sin corte.
    fin = int(duracion_pieza * SR)
    cola = estereo[fin:]
    estereo = estereo[:fin]
    estereo[:len(cola)] += cola
    return estereo / (np.abs(estereo).max() + 1e-9) * 0.8


def guardar(estereo, salida):
    salida = Path(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    crudo = salida.with_suffix(".crudo.wav")
    with wave.open(str(crudo), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((estereo * 32767).astype("<i2").tobytes())
    # Un poco de reverberación y volumen estándar (-18 LUFS; el montaje la baja aún más bajo la voz).
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(crudo), "-af",
                        "aecho=0.8:0.6:60|110:0.25|0.15,loudnorm=I=-18:TP=-2,aresample=48000",
                        "-c:a", "pcm_s16le", str(salida)], capture_output=True, text=True)
    crudo.unlink()
    if r.returncode != 0:
        sys.exit(f"ERROR ffmpeg: {r.stderr[:300]}")
    return salida


def main():
    p = argparse.ArgumentParser(description="Genera música de fondo original")
    p.add_argument("ambiente", choices=AMBIENTES)
    p.add_argument("-o", "--salida", required=True, help="Ruta .wav")
    p.add_argument("--semilla", type=int, default=1, help="Cambia la melodía (por defecto 1)")
    a = p.parse_args()
    ruta = guardar(componer(a.ambiente, a.semilla), a.salida)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                          str(ruta)], capture_output=True, text=True).stdout.strip()
    print(f"OK: {ruta} ({float(dur):.1f} s, {a.ambiente}, semilla {a.semilla})")


if __name__ == "__main__":
    main()

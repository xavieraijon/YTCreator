"""Convierte texto en voz y guarda los tiempos de cada palabra. Tres motores:
- Azure AI Speech (nivel gratuito F0): voces "es-ES-...".
- Gemini TTS (nivel gratuito de Google AI Studio, sin tarjeta; GEMINI_API_KEY en .env): voces
  "gemini:<Nombre>" (p. ej. "gemini:Puck"). El estilo es una indicación en texto ("narrador alegre...").
  No acepta velocidad: el ritmo se pide en el estilo.
- ai33.pro (DE PAGO, por créditos; AI33_API_KEY en .env): voces "ai33:<voice_id>" de su biblioteca
  (p. ej. "ai33:elevenlabs_eHAEFkimnYz57pupUMcq"), con el modelo de canal.json "modelo_voz_ai33"
  (eleven_v3: admite marcas de emoción) y la velocidad "velocidad_ai33" (0,5-1,5). ≈ 1 crédito/carácter.
Las voces que no dan los tiempos por palabra (Gemini, ai33, MAI-Voice-2) se alinean con el reconocimiento de
voz de Azure (F0: 5 h/mes), con la alineación local de WhisperX (gratis, en este ordenador; ver
herramientas/alineacion_local.py) o, sin ningún servicio, con la sincronía aproximada.

Uso:
    .venv/bin/python herramientas/gen_voz.py "Hola, bienvenidos al canal" -o salida.wav
    .venv/bin/python herramientas/gen_voz.py -f guion.txt -o salida.wav --voz es-ES-AlvaroNeural --velocidad 0%
    .venv/bin/python herramientas/gen_voz.py --listar            # voces es-ES disponibles

Marcas dentro del texto:
    {pausa:700}   silencio de 700 ms. Todo el texto se locuta de una vez (entonación continua) y el
                  silencio se inserta después cortando el audio entre dos palabras (las voces HD
                  entonan raro tras un <break> de SSML, y locutar por trozos suena a frases sueltas).
    {boing}       marca con nombre (suele ser el nombre de un efecto). Suena donde se escribe:
                  al empezar la palabra siguiente o, si justo detrás hay una {pausa}, al empezar
                  el silencio (montar.py añade esa pausa sola, del largo del efecto).
    [excited]     marca de emoción de eleven_v3 (en inglés: [excited], [whispers], [laughs]...). Solo
                  se envía a ai33; los demás motores, los subtítulos y los recuentos la ignoran.

Además del audio (.wav o .mp3) se escribe un .json con el mismo nombre:
    {"duracion": s, "palabras": [{"texto", "inicio", "fin"}], "marcas": [{"nombre", "t"}]}
Lee AZURE_SPEECH_KEY y AZURE_SPEECH_REGION del archivo .env del espacio de trabajo.
"""

import argparse
import array
import atexit
import base64
import difflib
import json
import re
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import wave
from pathlib import Path

import azure.cognitiveservices.speech as sdk

sys.path.insert(0, str(Path(__file__).resolve().parent))
import adaptadores_voz  # noqa: E402
import archivos  # noqa: E402
import canal  # noqa: E402
import servicios  # noqa: E402
import simulacion  # noqa: E402
import sistema  # noqa: E402
import uso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
# Voz del canal (canal.json). Si su cuota F0 se agota, usar VOZ_RESPALDO con --voz.
VOZ_DEFECTO = canal.get("voz", "es-ES-Tristan:DragonHDLatestNeural")
VELOCIDAD_DEFECTO = canal.get("velocidad", "+12%")
VOZ_RESPALDO = canal.get("voz_respaldo", "es-ES-AlvaroNeural")
ESTILO_DEFECTO = canal.get("estilo_voz")          # estilo emocional (solo voces que lo admiten)
PAUSA_MAX_DEFECTO = canal.get("pausa_max", {}).get("video")   # silencio máximo entre palabras (s)
IDIOMA_RECONOCIMIENTO = canal.get("idioma", "es-ES")
MODELO_AI33 = adaptadores_voz.MODELO_AI33        # main() los cambia para una toma (--modelo, --velocidad-ai33)
VELOCIDAD_AI33 = adaptadores_voz.VELOCIDAD_AI33
FRECUENCIA = adaptadores_voz.FRECUENCIA
MARGEN_INICIO = 0.05           # silencio que se conserva antes de la primera palabra de cada tramo
MARGEN_FINAL = 0.12            # y después de la última
# Subir este número cuando cambie cómo se genera la voz: montar.py rehará las voces guardadas.
VERSION = 6
# Las voces HD a veces acentúan mal la última palabra de una locución ("carteró"). Se añade una
# frase de relleno al final de cada tramo, para que la palabra real no sea la última, y se recorta.
COLA = ["Y", "seguimos."]
MARCA = re.compile(r"\{([a-z0-9_]+)(?::(\d+))?\}", re.IGNORECASE)
EMOCION = adaptadores_voz.EMOCION
configuracion, quitar_emociones = adaptadores_voz.configuracion, adaptadores_voz.quitar_emociones


def contar_palabras(texto):
    return len(re.findall(r"\w+", EMOCION.sub(" ", texto)))


def partir_en_tramos(texto):
    """Divide el texto por las pausas (solo para situarlas; se locuta todo junto). Cada tramo:
    texto, marcas internas (con nº de palabras previas en el tramo), marcas finales (suenan al
    empezar el silencio) y pausa posterior en s."""
    tramos, actual, marcas, pos = [], "", [], 0

    def cerrar(pausa):
        n = contar_palabras(actual)
        tramos.append({
            "texto": re.sub(r"\s+", " ", actual).strip(),
            "marcas": [m for m in marcas if m[1] < n],
            "marcas_finales": [m[0] for m in marcas if m[1] >= n],
            "pausa": pausa,
        })

    for m in MARCA.finditer(texto):
        actual += texto[pos:m.start()]
        nombre, valor = m.group(1).lower(), m.group(2)
        if nombre == "pausa":
            cerrar(int(valor or 500) / 1000)
            actual, marcas = "", []
        else:
            marcas.append((nombre, contar_palabras(actual)))
        pos = m.end()
    actual += texto[pos:]
    cerrar(0.0)
    return tramos


def quitar_cola(audio, palabras):
    """Recorta la frase de relleno COLA. Devuelve (audio, palabras) sin ella."""
    n = len(COLA)
    if len(palabras) <= n or [p["texto"] for p in palabras[-n:]] != COLA:
        print("Aviso: no se encontró la frase de relleno; se deja el tramo entero")
        return audio, palabras
    reales, primera_cola = palabras[:-n], palabras[-n]
    corte = min(reales[-1]["fin"] + MARGEN_FINAL, primera_cola["inicio"] - 0.02)
    return audio[:muestras(corte)], reales


def normalizar(palabra):
    """Minúsculas y sin tildes, para comparar lo reconocido con el texto."""
    palabra = unicodedata.normalize("NFD", palabra.lower())
    return "".join(c for c in palabra if unicodedata.category(c) != "Mn")


def reconocer_palabras(audio):
    """Tiempos de cada palabra de un audio PCM, con el reconocimiento de voz de Azure (F0: 5 h/mes).
    Devuelve [(palabra_normalizada, inicio, fin)]."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        temporal = Path(f.name)
    with wave.open(str(temporal), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(FRECUENCIA)
        w.writeframes(audio)
    cfg = configuracion()
    cfg.speech_recognition_language = IDIOMA_RECONOCIMIENTO
    cfg.request_word_level_timestamps()
    cfg.output_format = sdk.OutputFormat.Detailed
    cfg.set_property(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "2000")
    reconocedor = sdk.SpeechRecognizer(speech_config=cfg, audio_config=sdk.audio.AudioConfig(filename=str(temporal)))
    palabras, fin, errores = [], threading.Event(), []

    def reconocido(e):
        for w in json.loads(e.result.json).get("NBest", [{}])[0].get("Words", []):
            palabras.append((normalizar(w["Word"]), w["Offset"] / 1e7, (w["Offset"] + w["Duration"]) / 1e7))

    def cancelado(e):
        if e.result.cancellation_details.reason != sdk.CancellationReason.EndOfStream:
            errores.append(e.result.cancellation_details.error_details)
        fin.set()

    reconocedor.recognized.connect(reconocido)
    reconocedor.session_stopped.connect(lambda e: fin.set())
    reconocedor.canceled.connect(cancelado)
    reconocedor.start_continuous_recognition()
    fin.wait(300)
    reconocedor.stop_continuous_recognition()
    del reconocedor
    temporal.unlink(missing_ok=True)
    if errores:
        sys.exit(f"ERROR en el reconocimiento de voz (tiempos por palabra): {errores[0]}")
    uso.registrar("azure_stt", round(len(audio) / 2 / FRECUENCIA, 1))
    return palabras


class AlineadorLocal:
    """Proceso de alineacion_local.py (WhisperX) abierto mientras dure este programa (el modelo se carga una vez)."""
    _proceso = None

    @classmethod
    def reconocer(cls, texto, audio):
        """[(palabra_normalizada, inicio, fin), ...], en el mismo formato que reconocer_palabras (Azure)."""
        if cls._proceso is None:
            python = sistema.python_venv(RAIZ, ".venv-whisperx")
            if not python.exists():
                sys.exit("ERROR: falta la alineación local (.venv-whisperx); ver herramientas/alineacion_local.py")
            print("Alineación local: cargando WhisperX (prioridad baja)...")
            cls._proceso = subprocess.Popen([str(python), str(RAIZ / "herramientas" / "alineacion_local.py")],
                                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            atexit.register(cls.cerrar)
            cls._leer()
        peticion = {"texto": texto, "audio_b64": base64.b64encode(audio).decode("ascii")}
        cls._proceso.stdin.write(json.dumps(peticion, ensure_ascii=False) + "\n")
        cls._proceso.stdin.flush()
        return [tuple(r) for r in cls._leer()["reconocidas"]]

    @classmethod
    def _leer(cls):
        linea = cls._proceso.stdout.readline()
        if not linea:
            sys.exit("ERROR: la alineación local se ha cerrado inesperadamente")
        respuesta = json.loads(linea)
        if not respuesta["ok"]:
            sys.exit(f"ERROR (alineación local): {respuesta['error']}")
        return respuesta

    @classmethod
    def cerrar(cls):
        if cls._proceso and cls._proceso.poll() is None:
            cls._proceso.stdin.close()
            cls._proceso.wait(timeout=60)


RECONOCIDAS_MINIMO = 0.6      # por debajo, el reconocimiento no ha entendido la voz: sus tiempos serían inventados


def proporcion_reconocida(texto, reconocidas):
    """Parte de las subpalabras del texto que el reconocimiento ha oído tal cual (0-1). Con una voz que entiende mal
    (medido el 07/10 con una voz del sistema del Mac: la oyó casi como inglés), «exacta» sería interpolar casi todo."""
    sub = [normalizar(w) for ficha in texto.split() for w in re.findall(r"\w+", ficha)]
    if not sub:
        return 1.0
    emparejador = difflib.SequenceMatcher(None, sub, [w for w, _, _ in reconocidas], autojunk=False)
    return sum(b.size for b in emparejador.get_matching_blocks()) / len(sub)


def alinear(texto, reconocidas, duracion):
    """Palabras del texto (con su puntuación) con los tiempos de lo reconocido. Se alinean por
    subpalabras (\\w+) normalizadas; las que el reconocedor no oyó bien se interpolan."""
    fichas = texto.split()
    sub = [(k, normalizar(w)) for k, ficha in enumerate(fichas) for w in re.findall(r"\w+", ficha)]
    tiempos = [None] * len(sub)
    emparejador = difflib.SequenceMatcher(None, [s for _, s in sub], [w for w, _, _ in reconocidas], autojunk=False)
    for bloque in emparejador.get_matching_blocks():
        for i in range(bloque.size):
            _, ini, fin = reconocidas[bloque.b + i]
            tiempos[bloque.a + i] = (ini, fin)
    # Interpolar los huecos entre las subpalabras conocidas (o los extremos del audio).
    conocidos = [i for i, t in enumerate(tiempos) if t]
    for i, t in enumerate(tiempos):
        if t:
            continue
        antes = max((j for j in conocidos if j < i), default=None)
        despues = min((j for j in conocidos if j > i), default=None)
        t0 = tiempos[antes][1] if antes is not None else 0.0
        t1 = tiempos[despues][0] if despues is not None else duracion
        a = antes if antes is not None else -1
        b = despues if despues is not None else len(sub)
        paso = (t1 - t0) / (b - a)
        tiempos[i] = (t0 + paso * (i - a - 0.5) + paso * 0.05, t0 + paso * (i - a + 0.5) - paso * 0.05)
    palabras = []
    for k, ficha in enumerate(fichas):
        suyos = [tiempos[i] for i, (j, _) in enumerate(sub) if j == k]
        if not suyos:                           # signo suelto: se pega a la palabra anterior
            if palabras:
                palabras[-1]["texto"] += ficha
            continue
        palabras.append({"texto": ficha, "inicio": round(min(t[0] for t in suyos), 3),
                         "fin": round(max(t[1] for t in suyos), 3)})
    return palabras


def tramos_con_voz(audio, ventana=0.02, silencio_min=0.25, tramo_min=0.06):
    """[(inicio, fin)] en segundos de lo que suena, por la energía en ventanas de 20 ms. Dos tramos separados por menos de
    `silencio_min` se unen (las oclusivas y las respiraciones cortas no son pausas)."""
    import numpy as np
    n = int(FRECUENCIA * ventana)
    a = np.frombuffer(audio[: len(audio) // (2 * n) * 2 * n], dtype=np.int16).astype(np.float32)
    if not a.size:
        return []
    rms = np.sqrt((a.reshape(-1, n) ** 2).mean(axis=1))
    umbral = max(300.0, 0.12 * float(np.percentile(rms, 95)))
    tramos, inicio = [], None
    for i, sonando in enumerate(rms > umbral):
        if sonando and inicio is None:
            inicio = i
        elif not sonando and inicio is not None:
            tramos.append([inicio * ventana, i * ventana])
            inicio = None
    if inicio is not None:
        tramos.append([inicio * ventana, len(rms) * ventana])
    unidos = []
    for t in tramos:
        if unidos and t[0] - unidos[-1][1] < silencio_min:
            unidos[-1][1] = t[1]
        else:
            unidos.append(t)
    return [(round(a0, 3), round(b0, 3)) for a0, b0 in unidos if b0 - a0 >= tramo_min]


def _en_voz(v, tramos):
    """Segundo con voz número `v` (contando solo lo que suena en `tramos`) → segundo del audio."""
    for a, b in tramos:
        if v <= b - a:
            return a + v
        v -= b - a
    return tramos[-1][1]


def alinear_aproximado(texto, audio):
    """Sincronía APROXIMADA, sin ningún servicio: el momento de cada palabra se estima con los silencios del audio y el
    largo de cada palabra. Cada final de frase (. , ; : ? !) se lleva a la pausa más cercana a donde «debería» caer; dentro
    de cada frase, las palabras se reparten por su número de letras sobre el tiempo con voz. Menos precisa que la exacta
    (Azure), pero las pausas y los cambios de imagen caen en su frase."""
    fichas = texto.split()
    palabras = []                                   # (texto, peso); un signo suelto se pega a la palabra anterior
    for f in fichas:
        letras = len(re.findall(r"\w", f))
        if not letras and palabras:
            palabras[-1] = (palabras[-1][0] + f, palabras[-1][1])
        elif letras:
            palabras.append((f, letras + 1))
    tramos = tramos_con_voz(audio)
    if not palabras:
        return []
    if not tramos:
        tramos = [(0.0, len(audio) / 2 / FRECUENCIA)]

    total_voz = sum(b - a for a, b in tramos)
    pesos = [p for _, p in palabras]
    total = sum(pesos)
    # Fin de cada frase: posición proporcional → la pausa más cercana (cada pausa, una sola vez y en orden).
    finales = [i for i, (t, _) in enumerate(palabras[:-1]) if re.search(r"[.,;:?!…]$", t.rstrip("»\"')"))]
    pausas = [(tramos[k][1], tramos[k + 1][0]) for k in range(len(tramos) - 1)]
    # Primero los finales fuertes (. ? !) y luego, con las pausas que queden entre ellos, los débiles (, ; :).
    asignada = {}                                   # índice de palabra → índice de pausa
    fuertes = [i for i in finales if re.search(r"[.?!…]$", palabras[i][0].rstrip("»\"')"))]
    for grupo in (fuertes, [i for i in finales if i not in fuertes]):
        for i in grupo:
            t = _en_voz(sum(pesos[: i + 1]) / total * total_voz, tramos)
            desde = max((k for j, k in asignada.items() if j < i), default=-1)
            hasta = min((k for j, k in asignada.items() if j > i), default=len(pausas))
            cerca = [k for k in range(desde + 1, hasta) if abs(sum(pausas[k]) / 2 - t) < 1.5]
            if cerca:
                asignada[i] = min(cerca, key=lambda k: abs(sum(pausas[k]) / 2 - t))
    cortes = {i: pausas[k] for i, k in asignada.items()}   # índice de palabra → (fin de su frase, inicio de la siguiente)
    # Frases: [primera, última] palabra con su intervalo; dentro, reparto por letras sobre lo que suena.
    resultado, inicio_frase, t_ini = [], 0, tramos[0][0]
    for i in sorted(cortes) + [len(palabras) - 1]:
        t_fin = cortes[i][0] if i in cortes else tramos[-1][1]
        dentro = [(max(a, t_ini), min(b, t_fin)) for a, b in tramos if b > t_ini and a < t_fin] or [(t_ini, t_fin)]
        voz_frase = sum(b - a for a, b in dentro)
        suma, peso_frase = 0.0, sum(pesos[inicio_frase: i + 1])
        for j in range(inicio_frase, i + 1):
            ini = _en_voz(suma / peso_frase * voz_frase, dentro)
            suma += pesos[j]
            fin = _en_voz(suma / peso_frase * voz_frase, dentro)
            resultado.append({"texto": palabras[j][0], "inicio": round(ini, 3), "fin": round(max(ini, fin - 0.02), 3)})
        inicio_frase = i + 1
        t_ini = cortes[i][1] if i in cortes else t_fin
    return resultado


def acortar_silencios(audio, palabras, maximo):
    """Deja como mucho `maximo` s de silencio entre dos palabras seguidas (ritmo más vivo).
    Devuelve (audio, palabras) con los tiempos corregidos."""
    if not maximo or len(palabras) < 2:
        return audio, palabras
    quitar = []                                 # (desde, hasta) en segundos del audio original
    for a, b in zip(palabras, palabras[1:]):
        hueco = b["inicio"] - a["fin"]
        if hueco > maximo:
            quitar.append((a["fin"] + maximo / 2, b["inicio"] - maximo / 2))
    if not quitar:
        return audio, palabras
    nuevo, previo = bytearray(), 0.0
    for desde, hasta in quitar:
        nuevo += audio[muestras(previo):muestras(desde)]
        previo = hasta

    nuevo += audio[muestras(previo):]

    def mover(t):
        return round(t - sum(min(hasta, max(t, desde)) - desde for desde, hasta in quitar), 3)

    return bytes(nuevo), [dict(p, inicio=mover(p["inicio"]), fin=mover(p["fin"])) for p in palabras]


def muestras(segundos):
    return int(round(segundos * FRECUENCIA)) * 2   # 2 bytes por muestra


def inicio_sonido(audio, umbral=600):
    """Segundo en que empieza a sonar algo (amplitud > umbral, unos -35 dB)."""
    valores = array.array("h", audio)
    for i, v in enumerate(valores):
        if abs(v) > umbral:
            return i / FRECUENCIA
    return 0.0


def leer_audio(ruta):
    """Audio de un archivo cualquiera (mp3, wav...) como PCM 16 bits mono a FRECUENCIA Hz."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(ruta), "-f", "s16le", "-ac", "1", "-ar", str(FRECUENCIA),
                        "pipe:1"], capture_output=True)
    if r.returncode != 0 or not r.stdout:
        sys.exit(f"ERROR: no se pudo leer el audio {ruta}: {r.stderr[:300]}")
    return r.stdout


def sintetizar(texto, salida, voz=VOZ_DEFECTO, velocidad=VELOCIDAD_DEFECTO, tono="0%", estilo=ESTILO_DEFECTO,
               pausa_max=PAUSA_MAX_DEFECTO, audio_externo=None, sincronia=None):
    """audio_externo: locución ya hecha (p. ej. descargada de la web de ai33) del mismo texto; no se
    llama a ninguna API de voz: solo se sacan los tiempos (reconocimiento de Azure) y se abren las pausas."""
    salida = Path(salida)
    if salida.suffix.lower() not in (".wav", ".mp3"):
        sys.exit(f"ERROR: extensión no soportada '{salida.suffix}'. Usa .wav o .mp3")
    salida.parent.mkdir(parents=True, exist_ok=True)

    # Todo el texto se locuta de una vez (entonación continua, como un locutor leyendo el párrafo)
    # y las pausas se abren después cortando el audio en el silencio que hay entre palabras.
    tramos = partir_en_tramos(texto)
    completo = " ".join(t["texto"] for t in tramos if t["texto"])
    if not completo:
        sys.exit("ERROR: el texto no tiene nada que locutar")
    enviado = f"{completo} {' '.join(COLA)}"
    proveedor, voz_servicio = adaptadores_voz.proveedor_de(voz)
    falsa = (not audio_externo and simulacion.activa()
             and (proveedor.de_pago or simulacion.falta_clave(*proveedor.claves)))      # modo sin gasto: voz de relleno
    if not falsa and not audio_externo and not proveedor.disponible():
        sys.exit(f"ERROR: la voz elegida es de {servicios.catalogo()[proveedor.id]['nombre']}, que no usas (Ajustes → "
                 "Servicios). Elige otra voz para el canal o sube tu locución.")
    if falsa:
        for destino in (salida, salida.with_suffix(".wav")):
            simulacion.proteger(destino)
        enviado = quitar_emociones(enviado)
        audio, pal = simulacion.voz_falsa(enviado, FRECUENCIA)
        simulacion.marca(salida).write_text("simulada\n")
    elif audio_externo:
        audio, pal, enviado = leer_audio(audio_externo), [], quitar_emociones(completo)
    else:
        sol = adaptadores_voz.SolicitudVoz(enviado, voz_servicio, salida.name, velocidad, tono, estilo,
                                           velocidad_ai33=VELOCIDAD_AI33)
        if proveedor.id == "ai33":
            sol.modelo = MODELO_AI33
        respuesta = proveedor.locutar(sol)
        audio, pal, enviado = respuesta.audio, respuesta.palabras, respuesta.texto
    if not pal:
        # Las voces que no informan de las palabras (Gemini, ai33, una locución subida): sincronía exacta (reconocimiento
        # de Azure), local (alineación forzada de WhisperX, en este ordenador) o aproximada (sin servicios). Sin elegir,
        # la exacta si se usa Azure, si no la local si está instalada, si no la aproximada.
        sincronia = sincronia or ("exacta" if servicios.disponible("azure") else
                                  "local" if servicios.disponible("whisperx") else "aproximada")
        if sincronia == "exacta":
            if not servicios.disponible("azure"):
                sys.exit("ERROR: la sincronía exacta necesita Azure Speech (Ajustes → Servicios). Elige la local o la "
                         "aproximada para este vídeo o conecta el servicio.")
            reconocidas = reconocer_palabras(audio)
            entendido = proporcion_reconocida(enviado, reconocidas)
            if entendido < RECONOCIDAS_MINIMO:
                if servicios.disponible("whisperx"):
                    print(f"Aviso: el reconocimiento solo ha entendido el {entendido:.0%} de las palabras de esta voz; "
                          "uso la sincronía local (WhisperX no necesita entenderla, solo alinearla).")
                    sincronia = "local"
                    pal = alinear(enviado, AlineadorLocal.reconocer(enviado, audio), len(audio) / 2 / FRECUENCIA)
                else:
                    print(f"Aviso: el reconocimiento solo ha entendido el {entendido:.0%} de las palabras de esta voz; "
                          "uso la sincronía aproximada (con tan poco, la exacta sería peor).")
                    sincronia, pal = "aproximada", alinear_aproximado(enviado, audio)
            else:
                pal = alinear(enviado, reconocidas, len(audio) / 2 / FRECUENCIA)
        elif sincronia == "local":
            if not servicios.disponible("whisperx"):
                sys.exit("ERROR: la sincronía local necesita WhisperX instalado (ver herramientas/alineacion_local.py). "
                         "Elige la exacta o la aproximada para este vídeo.")
            pal = alinear(enviado, AlineadorLocal.reconocer(enviado, audio), len(audio) / 2 / FRECUENCIA)
        else:
            pal = alinear_aproximado(enviado, audio)
    if not audio_externo:
        audio, pal = quitar_cola(audio, pal)
    audio, pal = acortar_silencios(audio, pal, pausa_max)
    dur = len(audio) / 2 / FRECUENCIA
    # El inicio se decide por el sonido real, no por la primera palabra: si Azure no informa bien
    # de alguna palabra, recortar por los tiempos se la comería.
    corte_ini = max(0.0, inicio_sonido(audio) - MARGEN_INICIO)
    corte_fin = min(dur, pal[-1]["fin"] + MARGEN_FINAL) if pal else dur

    # Número de palabras (\w+) antes de cada palabra de Azure, para situar pausas y marcas.
    previas, acumulado = [], 0
    for p in pal:
        previas.append(acumulado)
        acumulado += max(1, contar_palabras(p["texto"]))

    def indice(n):
        """Índice de la palabra de Azure que empieza en la palabra número n del texto."""
        return next((k for k, a in enumerate(previas) if a >= n), len(pal))

    cortes, marcas_src, n = [], [], 0          # tiempos en el audio original
    for tramo in tramos:
        for nombre, local in tramo["marcas"]:
            k = indice(n + local)
            marcas_src.append((nombre, pal[k]["inicio"] if k < len(pal) else corte_fin))
        n += contar_palabras(tramo["texto"])
        k = indice(n)
        fin_previa = pal[k - 1]["fin"] if k > 0 else corte_ini
        marcas_src += [(nombre, fin_previa) for nombre in tramo["marcas_finales"]]
        if tramo["pausa"]:
            if k == 0:
                t_corte = corte_ini
            elif k >= len(pal):
                t_corte = corte_fin
            else:                               # en mitad del silencio entre dos palabras
                t_corte = (pal[k - 1]["fin"] + pal[k]["inicio"]) / 2
            cortes.append((t_corte, tramo["pausa"]))

    def a_salida(t):
        """Convierte un tiempo del audio original al audio final (con pausas insertadas)."""
        return round(max(0.0, t - corte_ini) + sum(p for c, p in cortes if c < t), 3)

    pcm, previo = bytearray(), corte_ini
    for t_corte, pausa in cortes:
        pcm += audio[muestras(previo):muestras(t_corte)]
        pcm += bytes(muestras(pausa))
        previo = t_corte
    pcm += audio[muestras(previo):muestras(corte_fin)]

    palabras = [{"texto": p["texto"], "inicio": a_salida(p["inicio"]), "fin": a_salida(p["fin"])} for p in pal]
    marcas = [{"nombre": nombre, "t": a_salida(t)} for nombre, t in marcas_src]

    wav = salida.with_suffix(".wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(FRECUENCIA)
        w.writeframes(bytes(pcm))
    if salida.suffix.lower() == ".mp3":
        r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-b:a", "160k", str(salida)],
                           capture_output=True, text=True)
        wav.unlink()
        if r.returncode != 0:
            sys.exit(f"ERROR ffmpeg: {r.stderr[:300]}")

    datos = {
        "voz": voz, "velocidad": velocidad, "estilo": estilo, "pausa_max": pausa_max,
        "duracion": round(len(pcm) / 2 / FRECUENCIA, 3),
        "palabras": palabras, "marcas": sorted(marcas, key=lambda m: m["t"]),
        **({"simulada": True} if falsa else {}),
        **({"sincronia": sincronia} if sincronia else {}),
    }
    archivos.escribir_json(salida.with_suffix(".json"), datos, indent=1, final_linea=False)
    return salida, datos


def listar_voces(locale="es-ES"):
    s = sdk.SpeechSynthesizer(speech_config=configuracion(), audio_config=None)
    r = s.get_voices_async(locale).get()
    for v in r.voices:
        estilos = ", ".join(v.style_list or [])
        genero = "Female" if v.gender == sdk.SynthesisVoiceGender.Female else "Male"
        print(f"{v.short_name:45} {genero:7} {estilos}")


def main():
    global MODELO_AI33, VELOCIDAD_AI33
    p = argparse.ArgumentParser(description="Texto a voz con Azure AI Speech (+ tiempos por palabra)")
    p.add_argument("texto", nargs="?", help="Texto a locutar (admite marcas {pausa:ms} y {nombre})")
    p.add_argument("-f", "--fichero", help="Leer el texto de un archivo .txt")
    p.add_argument("-o", "--salida", help="Ruta del audio (.wav o .mp3)")
    p.add_argument("--voz", default=VOZ_DEFECTO, help="Voz (por defecto %(default)s)")
    p.add_argument("--velocidad", default=VELOCIDAD_DEFECTO, help="Ej.: +10%%, -5%% (por defecto %(default)s)")
    p.add_argument("--tono", default="0%", help="Ej.: +5%%, -10%%")
    p.add_argument("--estilo", help="Estilo emocional, solo en voces que lo admiten (por defecto, el del "
                                    "canal con la voz del canal; 'ninguno' para quitarlo)")
    p.add_argument("--pausa-max", type=float, default=PAUSA_MAX_DEFECTO,
                   help="Silencio máximo entre palabras en s (por defecto %(default)s; 0 = no acortar)")
    p.add_argument("--sincronia", choices=("exacta", "local", "aproximada"),
                   help="Cómo sacar el momento de cada palabra en las voces que no lo dan: exacta (Azure), local "
                        "(alineación forzada de WhisperX, en este ordenador: ver herramientas/alineacion_local.py) o "
                        "aproximada (silencios y largo de las palabras, sin servicios). Por defecto, exacta si se usa "
                        "Azure, si no local si está instalada, si no aproximada")
    p.add_argument("--audio", help="Locución ya hecha de este texto (mp3/wav): no se genera voz, solo se sacan "
                                   "los tiempos y se abren las pausas y huecos de los efectos")
    p.add_argument("--listar", action="store_true", help="Listar voces es-ES y salir")
    p.add_argument("--modelo", help="Modelo de ai33 para esta toma (por defecto, el de canal.json: "
                                    f"{MODELO_AI33}); p. ej. eleven_multilingual_v2 o eleven_v4")
    p.add_argument("--velocidad-ai33", type=float, help="Velocidad de ai33 para esta toma (0,7-1,2; por defecto, "
                                                         f"la de canal.json: {VELOCIDAD_AI33})")
    a = p.parse_args()
    if a.modelo:
        MODELO_AI33 = a.modelo
    if a.velocidad_ai33:
        VELOCIDAD_AI33 = a.velocidad_ai33

    if a.listar:
        listar_voces()
        return
    if a.fichero:
        texto = Path(a.fichero).read_text(encoding="utf-8").strip()
    else:
        texto = (a.texto or "").strip()
    if not texto or not a.salida:
        p.error("indica el texto (o -f fichero) y -o salida")

    inicio = time.time()
    estilo = a.estilo or (ESTILO_DEFECTO if a.voz == VOZ_DEFECTO else None)
    estilo = None if estilo == "ninguno" else estilo
    ruta, datos = sintetizar(texto, a.salida, a.voz, a.velocidad, a.tono, estilo, a.pausa_max or None, a.audio,
                             a.sincronia)
    print(f"OK: {ruta} ({datos['duracion']:.1f} s de audio, {len(datos['palabras'])} palabras, "
          f"{len(datos['marcas'])} marcas) en {time.time() - inicio:.1f} s")


if __name__ == "__main__":
    main()

"""Contrato de la capacidad «voz» y sus adaptadores (plan 8b-C).

Quien necesita locutar un texto (gen_voz.py) no habla con un servicio concreto: arma una `SolicitudVoz` y se la da al
proveedor que corresponde a la voz del canal (`proveedor_de(voz)`: el prefijo `ai33:` o `gemini:`; sin prefijo, Azure).
Cada proveedor cumple `ProveedorVoz`: `disponible()` (elegido por el usuario y conectado, servicios.py) y `locutar(sol)`,
que devuelve una `RespuestaVoz` (audio PCM 16 bits mono a FRECUENCIA Hz, el momento de cada palabra si el servicio lo da,
y el coste que ha registrado en uso.py). Los fallos son `SystemExit("ERROR: …")`, como el resto de herramientas.

Adaptadores hoy: `azure` (gratis, da los tiempos por palabra), `gemini` (gratis) y `ai33` (DE PAGO: llama antes a
`simulacion.exigir_pago_permitido`). Para añadir otro: una clase con estos miembros y una línea en REGISTRO.
"""

import os
import re
import subprocess
import sys
import time
import base64
import io
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from xml.sax.saxutils import escape

import azure.cognitiveservices.speech as sdk
import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal  # noqa: E402
import espacio  # noqa: E402
import servicios  # noqa: E402
import simulacion  # noqa: E402
import uso  # noqa: E402

FRECUENCIA = 24000             # PCM 16 bits mono
REINTENTOS = 3
MODELO_GEMINI = canal.get("modelo_voz_gemini", "gemini-3.8-flash-tts")
URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/interactions"
MODELO_AI33 = canal.get("modelo_voz_ai33", "eleven_v3")
VELOCIDAD_AI33 = canal.get("velocidad_ai33", 1)
URL_AI33 = "https://api.ai33.pro"
EMOCION = re.compile(r"\[[a-z][a-z ,'-]{0,40}\]", re.IGNORECASE)   # [excited], [laughs softly]
APERTURA = "¿¡«\"'(“‘"


@dataclass
class SolicitudVoz:
    texto: str                      # puede llevar marcas de emoción [excited]: solo ai33 las entiende, los demás las quitan
    voz: str                        # sin el prefijo del servicio
    nombre: str = ""                # del archivo de salida, para el registro de consumo
    velocidad: str = "+12%"         # Azure
    tono: str = "0%"                # Azure
    estilo: str | None = None       # Azure y Gemini
    modelo: str | None = None       # ai33 y Gemini (None = el de canal.json)
    velocidad_ai33: float | None = None


@dataclass
class RespuestaVoz:
    audio: bytes                    # PCM 16 bits mono a FRECUENCIA Hz
    palabras: list                  # [{"texto", "inicio", "fin"}] si el servicio las da; [] si no (gen_voz las sincroniza)
    texto: str                      # el texto que de verdad se ha locutado (sin marcas de emoción)


class ProveedorVoz(Protocol):
    id: str
    de_pago: bool
    claves: tuple

    def disponible(self) -> bool: ...

    def locutar(self, sol: SolicitudVoz) -> RespuestaVoz: ...


def configuracion():
    load_dotenv(espacio.ENV)
    clave = os.getenv("AZURE_SPEECH_KEY", "").strip()
    region = os.getenv("AZURE_SPEECH_REGION", "").strip()
    if not clave or not region:
        sys.exit("ERROR: faltan AZURE_SPEECH_KEY o AZURE_SPEECH_REGION en .env")
    cfg = sdk.SpeechConfig(subscription=clave, region=region)
    cfg.set_speech_synthesis_output_format(sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm)
    return cfg


def quitar_emociones(texto):
    return re.sub(r"\s{2,}", " ", EMOCION.sub(" ", texto)).strip()


def construir_ssml(texto, voz, velocidad, tono, estilo):
    idioma = "-".join(voz.split("-")[:2])
    cuerpo = f'<prosody rate="{velocidad}" pitch="{tono}">{escape(texto)}</prosody>'
    if estilo:
        cuerpo = f'<mstts:express-as style="{estilo}">{cuerpo}</mstts:express-as>'
    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{idioma}">'
        f'<voice name="{voz}">{cuerpo}</voice></speak>'
    )


def unir_puntuacion(eventos):
    """Pega los signos sueltos a su palabra: '¿' a la siguiente, '.' ',' '?' a la anterior."""
    palabras, pendiente = [], ""
    for texto, inicio, fin, es_signo in eventos:
        if es_signo and re.search(r"\w", texto):
            # Azure a veces marca como "signo" un trozo con palabras ("¡Toc, toc! ¿") y con un
            # tiempo que no es el suyo. Se trata como palabra que ocupa desde la anterior hasta ahí.
            abre = re.search(r"[" + re.escape(APERTURA) + r"\s]*$", texto).group()
            texto, inicio = texto[:len(texto) - len(abre)].strip(), palabras[-1]["fin"] if palabras else 0.0
            palabras.append({"texto": pendiente + texto, "inicio": inicio, "fin": fin})
            pendiente = abre.strip()
            continue
        if not es_signo:
            palabras.append({"texto": pendiente + texto, "inicio": inicio, "fin": fin})
            pendiente = ""
        elif all(c in APERTURA for c in texto):
            pendiente += texto
        elif palabras:
            palabras[-1]["texto"] += texto
    return palabras


class Locutor:
    """Un único sintetizador por proceso: crear y destruir uno por tramo provocaba cierres
    esporádicos (segmentation fault) de la librería nativa de Azure."""

    def __init__(self, cfg):
        self.eventos = []
        self.sintetizador = sdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
        self.sintetizador.synthesis_word_boundary.connect(self._palabra)

    def _palabra(self, e):
        self.eventos.append((
            e.text, e.audio_offset / 1e7, e.audio_offset / 1e7 + e.duration.total_seconds(),
            e.boundary_type == sdk.SpeechSynthesisBoundaryType.Punctuation))


def locutar_gemini(texto, voz, estilo, modelo=MODELO_GEMINI):
    """Sintetiza con Gemini TTS. Devuelve PCM 16 bits mono a FRECUENCIA Hz."""
    load_dotenv(espacio.ENV)
    clave = os.getenv("GEMINI_API_KEY", "").strip()
    if not clave:
        sys.exit("ERROR: falta GEMINI_API_KEY en .env (clave gratuita de aistudio.google.com/apikey)")
    contenido = {"type": "text", "text": texto}
    if estilo:
        contenido["annotations"] = [{"type": "speech_metadata", "style": estilo}]
    cuerpo = {"model": modelo, "input": [{"type": "user_input", "content": [contenido]}],
              "response_format": {"type": "audio", "mime_type": "audio/wav"},
              "generation_config": {"speech_config": [{"voice": voz}]}}
    for intento in range(1, 6):
        try:
            r = requests.post(URL_GEMINI, json=cuerpo, timeout=600,
                              headers={"x-goog-api-key": clave, "Content-Type": "application/json"})
        except requests.RequestException as e:
            error = f"conexión: {e}"
        else:
            if r.ok:
                break
            error = f"HTTP {r.status_code}: {r.text[:300]}"
            if r.status_code not in (429, 500, 502, 503, 504):
                sys.exit(f"ERROR Gemini TTS {error}")
        if intento == 5:
            sys.exit(f"ERROR Gemini TTS tras 5 intentos (¿límite gratuito del día?): {error}")
        espera = 30 * intento
        print(f"Aviso: Gemini TTS {error[:120]}. Reintento en {espera} s ({intento}/5)...")
        time.sleep(espera)
    datos = _buscar_audio(r.json())
    if not datos:
        sys.exit("ERROR: Gemini TTS no devolvió audio")
    with wave.open(io.BytesIO(base64.b64decode(datos))) as w:
        if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (FRECUENCIA, 1, 2):
            sys.exit(f"ERROR: formato de audio inesperado de Gemini: {w.getframerate()} Hz, {w.getnchannels()} canales")
        return w.readframes(w.getnframes())


def locutar_ai33(texto, voz, modelo=MODELO_AI33, velocidad=VELOCIDAD_AI33):
    """Sintetiza con ai33.pro (tarea asíncrona: se envía, se consulta hasta que acaba y se descarga el
    mp3). Devuelve (PCM 16 bits mono a FRECUENCIA Hz, créditos gastados)."""
    simulacion.exigir_pago_permitido("ai33 (voz)")
    load_dotenv(espacio.ENV)
    clave = os.getenv("AI33_API_KEY", "").strip()
    if not clave:
        sys.exit("ERROR: falta AI33_API_KEY en .env (ai33.pro → API Key)")
    cab = {"xi-api-key": clave}
    campos = {"text": texto, "voice_id": voz, "model_id": modelo, "speed": str(velocidad),
              "with_transcript": "false"}
    for intento in range(1, 6):
        try:
            r = requests.post(f"{URL_AI33}/v3/text-to-speech", headers=cab, timeout=120,
                              files={k: (None, v) for k, v in campos.items()})
        except requests.ReadTimeout:
            # Salió y no llegó respuesta: puede estar aceptada (y cobrada). Repetirla podría cobrarla dos veces.
            sys.exit("ERROR ai33: se mandó la locución y no ha contestado; puede haberse cobrado. Míralo en la web de ai33 antes de repetirlo.")
        except requests.RequestException as e:          # no llegó a salir (sin conexión): se puede repetir
            error = f"conexión: {e}"
        else:
            try:
                cuerpo = r.json()
            except ValueError:
                cuerpo = None
            if r.ok and isinstance(cuerpo, dict) and cuerpo.get("success"):
                break
            error = f"HTTP {r.status_code}: {r.text[:300]}"
            if r.status_code not in (429, 500, 502, 503, 504):
                sys.exit(f"ERROR ai33 {error}")
        if intento == 5:
            sys.exit(f"ERROR ai33 tras 5 intentos: {error}")
        print(f"Aviso: ai33 {error[:120]}. Reintento en {10 * intento} s ({intento}/5)...")
        time.sleep(10 * intento)
    tarea, limite = cuerpo.get("task_id"), time.time() + 900
    if not tarea:
        sys.exit("ERROR ai33: ha aceptado la locución pero no ha devuelto su número de encargo; puede haberse cobrado. Míralo en la web de ai33 antes de repetirlo.")
    while True:
        time.sleep(4)
        try:
            d = requests.get(f"{URL_AI33}/v1/task/{tarea}", headers=cab, timeout=60).json()
        except (requests.RequestException, ValueError):
            continue
        if d.get("status") == "done":
            break
        if d.get("status") == "error":
            sys.exit(f"ERROR ai33 (tarea {tarea}): {d.get('error_message')}")
        if time.time() > limite:
            sys.exit(f"ERROR ai33: la tarea {tarea} no terminó en 15 min")
    url = (d.get("metadata") or {}).get("audio_url")
    if not url:
        sys.exit(f"ERROR ai33: la tarea {tarea} no devolvió audio")
    for intento in range(1, 4):             # su CDN es lenta (≈ 40 s por archivo)
        try:
            mp3 = requests.get(url, timeout=300)
            mp3.raise_for_status()
            break
        except requests.RequestException as e:
            if intento == 3:
                sys.exit(f"ERROR ai33 al descargar el audio: {e}")
            time.sleep(5)
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", str(FRECUENCIA),
                        "pipe:1"], input=mp3.content, capture_output=True)
    if r.returncode != 0:
        sys.exit(f"ERROR ffmpeg al convertir el audio de ai33: {r.stderr[:300]}")
    return r.stdout, d.get("credit_cost")


def _buscar_audio(o):
    """El audio (base64) dentro de la respuesta de Gemini, esté donde esté."""
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("data", "audio", "inline_data") and isinstance(v, str) and len(v) > 1000:
                return v
            encontrado = _buscar_audio(v)
            if encontrado:
                return encontrado
    elif isinstance(o, list):
        for v in o:
            encontrado = _buscar_audio(v)
            if encontrado:
                return encontrado
    return None


def locutar_azure(locutor, ssml):
    """Sintetiza un tramo. Devuelve (pcm_bytes, palabras)."""
    for intento in range(1, REINTENTOS + 1):
        locutor.eventos = eventos = []
        r = locutor.sintetizador.speak_ssml_async(ssml).get()
        if r.reason == sdk.ResultReason.SynthesizingAudioCompleted:
            return r.audio_data, unir_puntuacion(eventos)
        detalle = r.cancellation_details
        error = f"{detalle.reason}: {detalle.error_details}"
        if detalle.error_code in (sdk.CancellationErrorCode.AuthenticationFailure,
                                  sdk.CancellationErrorCode.BadRequest,
                                  sdk.CancellationErrorCode.Forbidden):
            sys.exit(f"ERROR: {error}")
        if intento == REINTENTOS:
            sys.exit(f"ERROR tras {REINTENTOS} intentos: {error}")
        print(f"Aviso: {error}. Reintentando ({intento}/{REINTENTOS})...")
        time.sleep(3 * intento)


class Azure:
    id, de_pago, claves = "azure", False, ("AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION")

    def disponible(self):
        return servicios.disponible("azure")

    def locutar(self, sol):
        texto = quitar_emociones(sol.texto)
        locutor = Locutor(configuracion())
        audio, palabras = locutar_azure(locutor, construir_ssml(texto, sol.voz, sol.velocidad, sol.tono, sol.estilo))
        uso.registrar("azure", len(texto), sol.nombre)
        return RespuestaVoz(audio, palabras, texto)


class Gemini:
    id, de_pago, claves = "gemini", False, ("GEMINI_API_KEY",)

    def disponible(self):
        return servicios.disponible("gemini")

    def locutar(self, sol):
        texto = quitar_emociones(sol.texto)
        audio = locutar_gemini(texto, sol.voz, sol.estilo, sol.modelo or MODELO_GEMINI)
        uso.registrar("gemini", len(texto), sol.nombre)
        return RespuestaVoz(audio, [], texto)


class Ai33:
    id, de_pago, claves = "ai33", True, ("AI33_API_KEY",)

    def disponible(self):
        return servicios.disponible("ai33")

    def locutar(self, sol):
        # Las marcas de emoción solo las entiende (y no las lee) eleven_v3 de ai33.
        audio, creditos = locutar_ai33(sol.texto, sol.voz, sol.modelo or MODELO_AI33,
                                       sol.velocidad_ai33 or VELOCIDAD_AI33)
        uso.registrar("ai33", creditos, sol.nombre)
        return RespuestaVoz(audio, [], quitar_emociones(sol.texto))


class Conector:
    """Un servicio de voz conectado por el usuario (conector_ia.py). Recibe los datos texto, voz, velocidad y modelo, y debe
    devolver un archivo de audio de cualquier formato que ffmpeg lea. No da tiempos por palabra: gen_voz los sincroniza."""

    def __init__(self, sid):
        import conector_ia
        self.id = sid
        spec = conector_ia.cargar(sid)
        self.de_pago = conector_ia.de_pago(spec)
        self.claves = (spec["clave_env"],) if spec.get("clave_env") else ()

    def disponible(self):
        return servicios.disponible(self.id)

    def locutar(self, sol):
        import tempfile

        import conector_ia
        texto = quitar_emociones(sol.texto)
        datos = {"texto": texto, "voz": sol.voz, "velocidad": sol.velocidad_ai33 or 1, "modelo": sol.modelo or ""}
        with tempfile.TemporaryDirectory() as tmp:
            archivo = Path(tmp) / "voz.audio"
            try:
                conector_ia.ejecutar(self.id, datos, archivo)
            except (conector_ia.ErrorConector, OSError) as e:      # incluye ClaveInvalida, CupoAgotado y TiempoAgotado
                sys.exit(f"ERROR: {e}")
            r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(archivo), "-f", "s16le", "-ac", "1",
                                "-ar", str(FRECUENCIA), "pipe:1"], capture_output=True)
        if r.returncode != 0 or not r.stdout:
            sys.exit(f"ERROR: el servicio «{self.id}» no ha devuelto un audio que se pueda leer")
        return RespuestaVoz(r.stdout, [], texto)


REGISTRO: dict[str, ProveedorVoz] = {p.id: p for p in (Azure(), Gemini(), Ai33())}


def conectores_de_usuario():
    """Los conectores de voz del usuario (sean o no utilizables ahora)."""
    return {s["id"] for s in servicios.conectores() if "voz" in s["hace"]}


def proveedor_de(voz):
    """(proveedor, voz sin prefijo) de la voz de canal.json: «ai33:ID», «gemini:Nombre», «<conector>:ID» o una voz de Azure."""
    prefijo, _, resto = voz.partition(":")
    if prefijo in ("ai33", "gemini"):
        return REGISTRO[prefijo], resto
    if resto and prefijo in conectores_de_usuario():
        return Conector(prefijo), resto
    return REGISTRO["azure"], voz

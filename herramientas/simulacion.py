"""Modo sin gasto: ninguna herramienta puede gastar créditos de pago (ai33: voz, imágenes y música de Suno).

Se activa con la variable `CANALYT_SIN_GASTO=1` (las pruebas la ponen siempre: una prueba nunca debe pagar) o con
`data/ajustes.json` → `"sin_gasto": true` (interruptor «Modo sin gasto» de Ajustes, para probar el flujo con calma).

Lo que NO bloquea: lo gratuito (Cloudflare, Azure, Gemini, yt-dlp) y la IA del usuario (su suscripción, no un pago por llamada).
Quien va a gastar llama a `exigir_pago_permitido(servicio)` ANTES de enviar nada: sale con un mensaje claro y no toca la red.
`CANALYT_AJUSTES` cambia el fichero de ajustes (pruebas).
"""

import json
import os
import sys
from pathlib import Path

import archivos  # noqa: E402
import espacio  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]


def _ajustes() -> dict:
    try:
        d = json.loads(Path(os.environ.get("CANALYT_AJUSTES") or espacio.AJUSTES).read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def activa() -> bool:
    if os.environ.get("CANALYT_SIN_GASTO", "").strip().lower() in ("1", "true", "si", "sí"):
        return True
    return bool(_ajustes().get("sin_gasto"))


MENSAJE = ("MODO SIN GASTO: esta acción gastaría créditos de {servicio} y está bloqueada. "
           "Se desactiva en Ajustes → «Modo sin gasto» (o quitando CANALYT_SIN_GASTO).")


def mensaje(servicio: str = "pago") -> str:
    return MENSAJE.format(servicio=servicio)


def exigir_pago_permitido(servicio: str = "ai33") -> None:
    """Sale del programa (SystemExit con mensaje) si el modo sin gasto está activo. Llamar antes de cualquier envío de pago."""
    if activa():
        sys.exit("ERROR: " + mensaje(servicio))


# --- Salidas falsas -----------------------------------------------------------------------------------------------
# Con el modo sin gasto activo, lo que costaría dinero (voz, imágenes y música de ai33) y lo gratuito a lo que le falta la
# clave (Cloudflare, Azure, Gemini) se sustituye por una salida falsa y reconocible: así se recorre el flujo entero sin
# claves ni créditos. Cada salida falsa lleva un «<nombre>.simulada» al lado; al desactivar el modo, `limpiar_simuladas`
# las borra para que se generen de verdad. Una salida falsa NUNCA pisa un archivo real.

def falta_clave(*nombres: str) -> bool:
    """¿Falta alguna de estas claves en el entorno o en .env?"""
    try:
        from dotenv import dotenv_values
        env = {**dotenv_values(espacio.ENV), **os.environ}
    except ImportError:
        env = dict(os.environ)
    return any(not (env.get(n) or "").strip() for n in nombres)


def marca(ruta) -> Path:
    return Path(ruta).with_suffix(".simulada")


def es_simulada(ruta) -> bool:
    return marca(ruta).exists()


def proteger(ruta) -> None:
    """Sale con un mensaje si `ruta` ya es un archivo real (no simulado): una salida falsa no lo sustituye."""
    ruta = Path(ruta)
    if ruta.exists() and not es_simulada(ruta):
        sys.exit(f"ERROR: MODO SIN GASTO: {ruta.name} ya existe y es real; no se sustituye por una salida falsa. "
                 "Desactiva el modo en Ajustes si quieres rehacerlo de verdad.")


def imagen_falsa(prompt: str, salida, ancho: int, alto: int) -> Path:
    """Imagen de relleno con un color propio de cada prompt y la leyenda «SIMULADO»."""
    import hashlib
    from PIL import Image, ImageDraw
    salida = Path(salida)
    proteger(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(prompt.encode()).digest()
    base = tuple(70 + h[i] % 120 for i in range(3))
    imagen = Image.new("RGB", (ancho, alto), base)
    d = ImageDraw.Draw(imagen)
    for k in range(0, ancho + alto, 80):                      # rayas diagonales: no se confunde con una imagen real
        d.line([(k, 0), (k - alto, alto)], fill=tuple(min(255, c + 25) for c in base), width=26)
    d.rectangle([0, alto // 2 - 70, ancho, alto // 2 + 70], fill=(20, 20, 20))
    d.text((ancho // 2, alto // 2 - 30), "SIMULADO · MODO SIN GASTO", fill=(255, 255, 255), anchor="mm", font_size=max(24, ancho // 28))
    d.text((ancho // 2, alto // 2 + 28), " ".join(prompt.split())[:80], fill=(210, 210, 210), anchor="mm", font_size=max(16, ancho // 55))
    imagen.save(salida)
    marca(salida).write_text("simulada\n")
    return salida


def voz_falsa(texto: str, frecuencia: int = 24000):
    """Locución falsa: un zumbido suave por palabra. Devuelve (PCM 16 bits mono, [{texto, inicio, fin}])."""
    import numpy as np
    palabras, t = [], 0.25
    for w in texto.split():
        dur = 0.09 + 0.055 * len(w)
        palabras.append({"texto": w, "inicio": round(t, 3), "fin": round(t + dur, 3)})
        t += dur + (0.22 if w[-1] in ".!?…" else 0.10 if w[-1] in ",;:" else 0.04)
    total = int((t + 0.25) * frecuencia)
    x = np.zeros(total)
    for p in palabras:
        i, f = int(p["inicio"] * frecuencia), int(p["fin"] * frecuencia)
        n = max(1, f - i)
        env = np.sin(np.linspace(0, np.pi, n)) ** 2
        x[i:f] = 0.12 * env * np.sin(2 * np.pi * 140 * np.arange(n) / frecuencia)
    return (x * 32767).astype("<i2").tobytes(), palabras


def limpiar_simuladas(carpeta) -> list[str]:
    """Borra las salidas falsas de un vídeo (y sus firmas), para que se generen de verdad. Devuelve lo borrado."""
    carpeta = Path(carpeta)
    borrados = []
    for m in sorted(carpeta.rglob("*.simulada")):
        for f in m.parent.glob(m.stem + ".*"):                 # img/01-1.png, .firma, .semilla… / voz/03.wav, .json, .firma
            f.unlink(missing_ok=True)
            borrados.append(str(f.relative_to(carpeta)))
    estado = carpeta / "musica" / "musica.json"               # música de Suno simulada: fuera sus versiones y su elección
    try:
        datos = json.loads(estado.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        datos = {}
    cambiado = False
    for ambiente, e in list(datos.items()):
        if isinstance(e, dict) and e.get("simulada"):
            (carpeta / "musica" / f"{ambiente}.mp3").unlink(missing_ok=True)
            for k in ("versiones", "elegida", "tarea", "creditos", "fecha", "simulada", "prompt_enviado", "estilo_suno"):
                e.pop(k, None)
            cambiado = True
    if cambiado:
        archivos.escribir_json(estado, datos)
    return borrados

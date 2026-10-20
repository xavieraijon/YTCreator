"""Límites y precios de los proveedores (Cloudflare, Azure, ai33, Suno) en UN sitio, editable sin tocar código.

Los valores de fábrica son los medidos o publicados a septiembre-octubre de 2026; cambian cuando el proveedor cambia su plan o
el usuario compra a otro precio. Se sobrescriben en `data/ajustes.json` → `"proveedores": {"ai33.creditos_por_imagen": 1500}`
(o desde Ajustes → «Límites y precios»). Quien los usa los lee al arrancar su proceso: tras cambiar uno, se reinicia la UI.
`CANALYT_AJUSTES` cambia el fichero (pruebas). Un valor que no es un número positivo se ignora y manda el de fábrica.
"""

import json
import os
from pathlib import Path

import espacio  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]

# clave → (de fábrica, para qué, unidad, de dónde sale)
VALORES = {
    "cloudflare.neuronas_dia": (10_000, "Neuronas gratis de Workers AI al día", "neuronas", "Plan gratuito de Cloudflare"),
    "cloudflare.neuronas_imagen_klein": (110, "Neuronas que gasta una imagen klein", "neuronas", "Medido en la analítica (23/09/2026)"),
    "cloudflare.neuronas_imagen_schnell": (173, "Neuronas que gasta una imagen schnell", "neuronas", "Medido en la analítica (23/09/2026)"),
    "azure.caracteres_mes": (500_000, "Caracteres gratis de voz neural al mes", "caracteres", "Recurso Speech F0"),
    "ai33.creditos_por_caracter": (1.15, "Créditos por carácter de voz (con marcas de emoción)", "créditos", "Medido"),
    "ai33.creditos_por_imagen": (1720, "Créditos por imagen (con 1 referencia de estilo)", "créditos", "Medido"),
    "ai33.creditos_por_encargo_musica": (3600, "Créditos por encargo de música a Suno (2 versiones)", "créditos", "Medido"),
    "ai33.cola_maxima": (20, "Tareas activas a la vez en ai33", "tareas", "Límite de cuenta (error 429)"),
    "ai33.euros_por_millon_creditos": (4.545, "Euros que cuesta un millón de créditos", "€", "15 € = 3,3 M créditos (24/09/2026)"),
    "ai33.creditos_comprados": (3_300_000, "Créditos comprados en total (para conciliar el saldo)", "créditos", "Compra del 24/09/2026"),
    "video.caracteres_de_pago": (8_000, "Caracteres de voz de pago de un vídeo típico", "caracteres", "Un vídeo de 6-7 min"),
    "video.imagenes_ai33": (12, "Imágenes de ai33 de un vídeo típico", "imágenes", "Las que klein hace mal"),
    "video.ambientes_musica": (3, "Encargos de música de Suno de un vídeo típico", "encargos", "Un ambiente por tono"),
    "suno.max_prompt": (500, "Caracteres máximos del prompt de música", "caracteres", "Límite de Suno"),
}


def _propios() -> dict:
    try:
        d = json.loads(Path(os.environ.get("CANALYT_AJUSTES") or espacio.AJUSTES).read_text(encoding="utf-8"))
        p = d.get("proveedores") if isinstance(d, dict) else None
        return p if isinstance(p, dict) else {}
    except (OSError, ValueError):
        return {}


def valor_valido(v):
    """El número positivo que representa `v`, o None."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not (0 < v < 1e9):
        return None
    return int(v) if float(v).is_integer() else float(v)


def valor(clave: str):
    """El valor vigente de una clave: el del usuario si es válido y, si no, el de fábrica."""
    fabrica = VALORES[clave][0]
    propio = valor_valido(_propios().get(clave))
    return fabrica if propio is None else propio


def todos() -> list[dict]:
    propios = _propios()
    return [{"clave": c, "texto": t, "unidad": u, "origen": o, "defecto": f, "valor": valor(c),
             "cambiado": valor_valido(propios.get(c)) not in (None, f)} for c, (f, t, u, o) in VALORES.items()]

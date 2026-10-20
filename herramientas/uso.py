"""Registro del consumo de las capas gratuitas (Cloudflare Workers AI y Azure Speech).

Cada llamada a gen_imagen.py o gen_voz.py añade una línea a data/uso.jsonl; cuota.py la resume.
Las neuronas de Cloudflare son una ESTIMACIÓN con los precios publicados (la API no las devuelve).
"""

import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import proveedores  # noqa: E402

import espacio  # noqa: E402

RAIZ = espacio.ESPACIO
REGISTRO = espacio.DATOS / "uso.jsonl"

# Precios publicados (developers.cloudflare.com/workers-ai/platform/pricing, consultado 2026-09-23).
NEURONAS_POR_TESELA = {"klein": 5.37, "schnell": 4.80}   # por tesela de 512x512


def teselas(ancho, alto):
    return math.ceil(ancho / 512) * math.ceil(alto / 512)


# Consumo real medido en la analítica de Cloudflare (2026-09-23, 107 imágenes klein): ≈ 108 por imagen,
# casi independiente del tamaño y de las referencias; la fórmula por teselas daba la mitad.
NEURONAS_REALES_POR_IMAGEN = {"klein": proveedores.valor("cloudflare.neuronas_imagen_klein"),
                              "schnell": proveedores.valor("cloudflare.neuronas_imagen_schnell")}


def neuronas_imagen(modelo, ancho, alto, referencias=()):
    """Estimación calibrada: el mayor entre la fórmula por teselas y el consumo real medido."""
    total = teselas(ancho, alto) + sum(teselas(w, h) for w, h in referencias)
    if modelo not in NEURONAS_POR_TESELA:       # modelos en prueba: el dato real lo da cuota.py (analítica)
        return NEURONAS_REALES_POR_IMAGEN.get(modelo, 110)
    return max(round(total * NEURONAS_POR_TESELA[modelo], 1), NEURONAS_REALES_POR_IMAGEN[modelo])


def registrar(servicio, cantidad, detalle=""):
    REGISTRO.parent.mkdir(parents=True, exist_ok=True)
    linea = {"t": time.time(), "servicio": servicio, "cantidad": cantidad, "detalle": detalle}
    with REGISTRO.open("a", encoding="utf-8") as f:
        f.write(json.dumps(linea, ensure_ascii=False) + "\n")


def leer():
    if not REGISTRO.exists():
        return []
    return [json.loads(l) for l in REGISTRO.read_text(encoding="utf-8").splitlines() if l.strip()]

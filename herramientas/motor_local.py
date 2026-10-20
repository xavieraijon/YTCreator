"""Motor de imágenes LOCAL: FLUX.2 klein 4B en el Mac (Apple Silicon, MLX) con mflux. Gratis y sin cuota.

Es el mismo modelo que usa Cloudflare, así que el estilo y las referencias del personaje funcionan igual.
Todo vive dentro del proyecto: entorno en .venv-local/ y modelo en modelos/ (ninguno se sube a Git).

No se ejecuta a mano: gen_imagen.py lo lanza con .venv-local/bin/python cuando el motor es "local" (o
"auto" y Cloudflare se ha quedado sin cuota). Carga el modelo una vez y atiende peticiones, una por línea
JSON en la entrada estándar: {"prompt", "salida", "ancho", "alto", "referencias", "semilla"}; responde
{"ok": true, "segundos": N, "semilla": S, "memoria_gb": G} o {"ok": false, "error": "..."} por la salida estándar. Termina al cerrarse
la entrada, y con él se libera toda la memoria.

Para no molestar al resto del portátil (M1 Pro, 16 GB): prioridad mínima de CPU (nice 19), caché de MLX
limitada, VAE por teselas y modelo cuantizado a 4 bits. Medido el 24/09/2026 a 1344x768: ≈ 2 min por
imagen, 4,1 GB en reposo y 8,1 GB de pico (a 8 bits: 7,6 y 11,6 GB, misma calidad a simple vista; sin
teselas, 17,5 GB de pico). Con MOTOR_LOCAL_BITS=8 se usa la versión de 8 bits si está preparada.

Instalación (una vez; solo en un Mac con chip de Apple, por MLX: en otros sistemas no se ofrece, ver servicios.py):
    /opt/homebrew/opt/python@3.13/bin/python3.13 -m venv .venv-local
    PIP_CACHE_DIR=modelos/pip-cache .venv-local/bin/pip install mflux==0.20.0
    .venv-local/bin/python herramientas/motor_local.py --preparar      # descarga (~16 GB) y cuantiza (4,3 GB)
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODELOS = RAIZ / "modelos"
BITS = int(os.getenv("MOTOR_LOCAL_BITS", "4"))
CUANTIZADO = MODELOS / f"flux2-klein-4b-q{BITS}"
REPO = "black-forest-labs/FLUX.2-klein-4B"
ARCHIVOS = ["scheduler/*", "text_encoder/*", "tokenizer/*", "transformer/*", "vae/*", "model_index.json"]

# Todo dentro del proyecto: cachés de Hugging Face y sin telemetría.
os.environ["HF_HOME"] = str(MODELOS / "hf")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


def responder(datos):
    sys.stdout.write(json.dumps(datos, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def preparar():
    """Descarga el modelo original y guarda la versión cuantizada en modelos/ (se hace una sola vez)."""
    import subprocess

    from huggingface_hub import snapshot_download

    snapshot_download(REPO, allow_patterns=ARCHIVOS)
    if CUANTIZADO.exists():
        print(f"Ya existe {CUANTIZADO}")
        return
    subprocess.run([str(Path(sys.executable).parent / "mflux-save"), "--model", "flux2-klein-4b",
                    "--quantize", str(BITS), "--path", str(CUANTIZADO)], check=True)
    print(f"OK: modelo cuantizado a {BITS} bits en {CUANTIZADO}")


def cargar():
    import mlx.core as mx
    from mflux.models.common.config import ModelConfig
    from mflux.models.common.vae.tiling_config import TilingConfig
    from mflux.models.flux2.variants import Flux2KleinEdit

    mx.set_cache_limit(1024**3)   # la caché de MLX crece sin límite si no se acota
    if CUANTIZADO.exists():
        modelo = Flux2KleinEdit(model_config=ModelConfig.flux2_klein_4b(), model_path=str(CUANTIZADO))
    else:
        os.environ["HF_HUB_OFFLINE"] = "1"   # nunca descargar a escondidas: eso lo hace --preparar
        modelo = Flux2KleinEdit(model_config=ModelConfig.flux2_klein_4b(), quantize=BITS)
    modelo.tiling_config = TilingConfig(vae_decode_tile_size=512)   # el VAE entero causa el pico de memoria
    return modelo


def sin_referencias(edicion):
    """Versión texto-a-imagen que comparte los pesos ya cargados (la de edición falla sin referencias)."""
    import mlx.nn as nn
    from mflux.models.flux2.variants import Flux2Klein

    texto = Flux2Klein.__new__(Flux2Klein)
    nn.Module.__init__(texto)
    dict.update(texto, edicion)              # submódulos (transformer, vae, text_encoder, prompt_cache...)
    texto.__dict__.update(edicion.__dict__)  # atributos normales (config, tokenizers, callbacks...)
    return texto


def servir():
    os.nice(19)
    import mlx.core as mx

    try:
        modelo = cargar()
    except Exception as e:  # noqa: BLE001 - se informa al proceso padre
        responder({"ok": False, "error": f"no se pudo cargar el modelo local: {e}"})
        return
    texto = None
    responder({"ok": True, "listo": True})
    for linea in sys.stdin:
        if not linea.strip():
            continue
        p = json.loads(linea)
        inicio = time.time()
        try:
            semilla = p.get("semilla")
            semilla = int.from_bytes(os.urandom(4), "big") if semilla is None else semilla
            comun = {"seed": semilla, "prompt": p["prompt"],
                     "width": p["ancho"], "height": p["alto"], "guidance": 1.0, "num_inference_steps": 4}
            if p.get("referencias"):
                imagen = modelo.generate_image(**comun, image_paths=[Path(r) for r in p["referencias"]],
                                               scheduler="flow_match_euler_discrete")
            else:
                texto = texto or sin_referencias(modelo)
                imagen = texto.generate_image(**comun)
            imagen.image.save(p["salida"])
            mx.clear_cache()
            responder({"ok": True, "segundos": round(time.time() - inicio, 1), "semilla": semilla,
                       "memoria_gb": round(mx.get_peak_memory() / 1e9, 1)})
        except Exception as e:  # noqa: BLE001
            responder({"ok": False, "error": str(e)})


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--preparar", action="store_true", help="descarga y cuantiza el modelo (una vez)")
    preparar() if p.parse_args().preparar else servir()

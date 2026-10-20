"""Genera imágenes con FLUX.2 klein: en Cloudflare Workers AI (capa gratuita: 10.000 neuronas/día; si se
agotan, da error, nunca cobra) o en local, en el Mac (motor_local.py: gratis y sin cuota, pero más lento).

Uso:
    .venv/bin/python herramientas/gen_imagen.py "prompt en inglés" -o salida.png
    .venv/bin/python herramientas/gen_imagen.py "prompt" -o salida.png --formato vertical
    .venv/bin/python herramientas/gen_imagen.py "the same owl riding a bike" -o salida.png --ref personaje/ref/buho.png
    .venv/bin/python herramientas/gen_imagen.py "prompt" -o salida.png --modelo schnell     # rápido, solo cuadrado

Modelos:
    klein   (por defecto) FLUX.2 klein 4B: medidas a elección y hasta 4 imágenes de referencia
            para mantener el mismo personaje. ~20 s por imagen.
    schnell FLUX.1 schnell: 1024x1024, ~2 s, sin referencias.
Ninguno de los dos es determinista: el mismo prompt da imágenes distintas en cada ejecución.

Motores (--motor, o la variable MOTOR_IMAGEN; el mismo en montar.py):
    auto        (por defecto) los que el usuario usa (Ajustes → Servicios, herramientas/servicios.py): Cloudflare y, si
                se agota la cuota, el Mac; si solo usa el Mac, el Mac. Si no usa ninguno, error: las imágenes se suben.
    cloudflare  solo Cloudflare (si se agota, error).
    local       solo el Mac (necesita .venv-local y el modelo en modelos/; ver motor_local.py) y que esté elegido.

Semillas: en local cada imagen guarda la semilla usada en <salida>.semilla; con --semilla N (o
"semilla" en el guion) se repite exactamente esa imagen. Una imagen con semilla se genera siempre en
local (la API de Cloudflare no documenta semilla).

Lee CF_ACCOUNT_ID y CF_API_TOKEN del archivo .env del espacio de trabajo.
"""

import argparse
import os
import sys
import time
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import adaptadores_imagen  # noqa: E402
import simulacion  # noqa: E402

MAX_REFERENCIAS = 4
MOTORES = ("auto", "cloudflare", "local")      # además, el id de un conector de imagen del usuario (data/proveedores/)
MOTOR = os.getenv("MOTOR_IMAGEN", "auto")
CuotaAgotada, ImagenFiltrada, MotorLocal = adaptadores_imagen.CuotaAgotada, adaptadores_imagen.ImagenFiltrada, adaptadores_imagen.MotorLocal
MODELOS, FORMATOS = adaptadores_imagen.MODELOS, adaptadores_imagen.FORMATOS
CLOUDFLARE, LOCAL = adaptadores_imagen.REGISTRO["cloudflare"], adaptadores_imagen.REGISTRO["local"]


def _conectores_gratis():
    """Conectores de imagen del usuario, gratis y listos: entran en el modo automático. Los de pago, solo si se piden."""
    return [c for c in adaptadores_imagen.conectores_de_usuario().values() if not c.de_pago and c.disponible()]


def generar(prompt, salida, formato="horizontal", referencias=(), modelo="klein", semilla=None, tamano=None):
    """tamano=(ancho, alto) sustituye al del formato (solo en local; lo usa el boceto de montar.py)."""
    global MOTOR
    if len(referencias) > MAX_REFERENCIAS:
        sys.exit(f"ERROR: como máximo {MAX_REFERENCIAS} imágenes de referencia")
    elegido = None
    if MOTOR not in MOTORES:
        elegido = adaptadores_imagen.conectores_de_usuario().get(MOTOR)
        if elegido is None:
            sys.exit(f"ERROR: «{MOTOR}» no es un motor de imágenes: usa auto, cloudflare, local o un servicio conectado.")
    if simulacion.activa() and (elegido.de_pago if elegido else
                                MOTOR != "local" and simulacion.falta_clave("CF_ACCOUNT_ID", "CF_API_TOKEN")):
        ancho, alto = tamano or FORMATOS[formato]       # modo sin gasto y sin clave de Cloudflare: imagen de relleno
        return simulacion.imagen_falsa(prompt, salida, ancho, alto)
    gratis = _conectores_gratis()
    if MOTOR == "auto" and not CLOUDFLARE.disponible():
        if gratis and not LOCAL.disponible():
            elegido = gratis[0]                         # el usuario solo usa servicios que ha conectado
        elif not LOCAL.disponible():
            sys.exit("ERROR: no usas ningún servicio de imágenes gratis (Ajustes → Servicios). Elige uno o sube tus imágenes.")
        else:
            MOTOR = "local"                             # el usuario solo usa el Mac
    ancho, alto = tamano or FORMATOS[formato]
    sol = adaptadores_imagen.SolicitudImagen(prompt, salida, formato, ancho, alto, list(referencias), semilla, modelo)
    if elegido:
        try:
            return elegido.generar(sol)
        except CuotaAgotada as e:
            sys.exit(f"ERROR: el servicio «{elegido.id}» ha agotado su cupo o recibe demasiadas peticiones: {e}")
    if MOTOR == "local" or ((semilla is not None or tamano) and MOTOR == "auto"):
        return LOCAL.generar(sol)
    try:
        return CLOUDFLARE.generar(sol)
    except ImagenFiltrada:
        # Solo esta imagen va al Mac (≈ 1 min); el motor sigue siendo Cloudflare para las demás.
        if not LOCAL.disponible():
            sys.exit("ERROR: el filtro de Cloudflare rechaza esta imagen. Cambia su descripción o sube la imagen.")
        print("Aviso: el filtro de Cloudflare rechaza esta imagen; la genero en el Mac (motor local).")
        sol.semilla, sol.modelo = None, "klein"
        return LOCAL.generar(sol)
    except CuotaAgotada as e:
        for otro in gratis if MOTOR == "auto" else []:
            print(f"Aviso: cuota de Cloudflare agotada; sigo con «{otro.id}».")
            try:
                return otro.generar(sol)
            except CuotaAgotada:
                continue
        if MOTOR != "auto" or not LOCAL.disponible():
            sys.exit(f"ERROR: límite gratuito diario agotado o demasiadas peticiones: {e}")
        print("Aviso: cuota de Cloudflare agotada; sigo con el motor local (más lento, sin cuota).")
        MOTOR = "local"
        sol.semilla = None
        return LOCAL.generar(sol)


def main():
    global MOTOR
    p = argparse.ArgumentParser(description="Genera una imagen con FLUX.2 (Cloudflare o local)")
    p.add_argument("prompt", help="Descripción de la imagen (mejor en inglés; añade 'no text')")
    p.add_argument("-o", "--salida", required=True, help="Ruta del archivo .png/.jpg")
    p.add_argument("--formato", choices=FORMATOS, default="horizontal")
    p.add_argument("--ref", action="append", default=[], help="Imagen de referencia (repetible, máx. 4)")
    p.add_argument("--modelo", choices=MODELOS, default="klein")
    p.add_argument("--motor", default=MOTOR, help="auto, cloudflare, local o el id de un servicio de imágenes conectado")
    p.add_argument("--semilla", type=int, help="Repetir una imagen local concreta (ver <salida>.semilla)")
    a = p.parse_args()
    MOTOR = a.motor
    formato = "cuadrado" if a.modelo == "schnell" else a.formato

    inicio = time.time()
    ruta = generar(a.prompt, a.salida, formato, a.ref, a.modelo, a.semilla)
    with Image.open(ruta) as img:
        print(f"OK: {ruta} ({img.width}x{img.height}, {a.modelo}, {MOTOR}) en {time.time() - inicio:.1f} s")


if __name__ == "__main__":
    main()

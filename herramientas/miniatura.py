"""Crea la miniatura de YouTube (1280x720, JPG < 2 MB): imagen de fondo + título grande.

Uso:
    .venv/bin/python herramientas/miniatura.py fondo.png "¿Cómo NO se *ROMPE* el cuello?" -o miniatura.jpg
    .venv/bin/python herramientas/miniatura.py fondo.png "Texto" -o miniatura.jpg --lado derecha
    .venv/bin/python herramientas/miniatura.py fondo.png "Texto" -o m.jpg --personaje personaje/ref/tok_sorprendido.png

- Las palabras entre *asteriscos* salen en amarillo; el resto en blanco. Todo con borde negro grueso.
- El texto se ajusta solo al mayor tamaño que quepa (máx. 3 líneas) en su mitad de la imagen.
- Consejo: 2-5 palabras. En móvil la miniatura se ve del tamaño de un sello.
"""

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = canal.fuente("titulo")[0]      # canal.json → fuentes.titulo
ANCHO, ALTO = 1280, 720
BLANCO = (255, 255, 255)
AMARILLO = canal.color("resaltado", "#FFD23F")      # el mismo que los subtítulos
MAX_LINEAS = 3
PESO_MAX = 2 * 1024 * 1024     # límite de YouTube


def cubrir(img, ancho, alto):
    """Escala y recorta la imagen para llenar ancho x alto sin deformarla."""
    escala = max(ancho / img.width, alto / img.height)
    img = img.resize((round(img.width * escala), round(img.height * escala)), Image.LANCZOS)
    x, y = (img.width - ancho) // 2, (img.height - alto) // 2
    return img.crop((x, y, x + ancho, y + alto))


def degradado(lado):
    """Capa negra semitransparente en el lado del texto, para que se lea sobre cualquier fondo."""
    capa = Image.new("L", (ANCHO, ALTO))
    px = capa.load()
    for x in range(ANCHO):
        d = x / ANCHO if lado == "derecha" else 1 - x / ANCHO
        alfa = int(170 * max(0.0, (d - 0.35) / 0.65) ** 1.3)
        for y in range(ALTO):
            px[x, y] = alfa
    return capa


def palabras_con_color(titulo):
    """'Hola *MUNDO*' -> [('Hola', blanco), ('MUNDO', amarillo)]."""
    resultado, pegar = [], ""
    for trozo in re.split(r"(\*[^*]+\*)", titulo):
        color = AMARILLO if trozo.startswith("*") else BLANCO
        for palabra in trozo.strip("*").split():
            if not re.search(r"\w", palabra):       # signo suelto ("¿", "!"): se pega a su palabra
                if palabra in "¿¡" or not resultado:
                    pegar += palabra
                else:
                    resultado[-1] = (resultado[-1][0] + palabra, resultado[-1][1])
                continue
            resultado.append(((pegar + palabra).upper(), color))
            pegar = ""
    return resultado


def repartir(palabras, fuente, ancho_max, dibujo):
    """Reparte las palabras en líneas que no pasen de ancho_max. None si no caben en MAX_LINEAS."""
    espacio = dibujo.textlength(" ", font=fuente)
    lineas, actual, ancho_actual = [], [], 0.0
    for palabra, color in palabras:
        w = dibujo.textlength(palabra, font=fuente)
        if w > ancho_max:
            return None
        nuevo = ancho_actual + (espacio if actual else 0) + w
        if actual and nuevo > ancho_max:
            lineas.append(actual)
            actual, nuevo = [], w
        actual.append((palabra, color, w))
        ancho_actual = nuevo
    if actual:
        lineas.append(actual)
    return lineas if len(lineas) <= MAX_LINEAS else None


def silueta(p):
    """Máscara opaca del personaje: todo lo que no es el blanco exterior (incluye el blanco de los ojos,
    las manos y los pies, que quedan dentro del contorno)."""
    lineas = ImageChops.invert(p.convert("L")).point(lambda v: 255 if v > 40 else 0)
    lineas = lineas.filter(ImageFilter.MaxFilter(5))            # cierra pequeños huecos del trazo
    relleno = lineas.copy()
    borde = Image.new("L", (relleno.width + 2, relleno.height + 2), 0)
    borde.paste(relleno, (1, 1))
    ImageDraw.floodfill(borde, (0, 0), 128)                      # el exterior queda marcado con 128
    exterior = borde.crop((1, 1, relleno.width + 1, relleno.height + 1)).point(lambda v: 255 if v == 128 else 0)
    return ImageChops.invert(exterior).filter(ImageFilter.GaussianBlur(1))


def pegar_personaje(img, personaje, lado):
    """Pega una imagen del personaje (dibujo sobre fondo blanco), opaco, en el lado contrario al texto."""
    with Image.open(personaje) as original:
        p = original.convert("RGB")
    p = p.crop(ImageChops.invert(p.convert("L")).point(lambda v: 255 if v > 20 else 0).getbbox())
    escala = ALTO * 0.84 / p.height
    p = p.resize((round(p.width * escala), round(p.height * escala)), Image.LANCZOS)
    x = ANCHO - p.width - 50 if lado == "izquierda" else 50
    img.paste(p, (x, ALTO - p.height - 30), silueta(p))
    return img


def crear(fondo, titulo, salida, lado="izquierda", personaje=None):
    fondo = Path(fondo)
    if not fondo.exists():
        sys.exit(f"ERROR: no existe {fondo}")
    palabras = palabras_con_color(titulo)
    if not palabras:
        sys.exit("ERROR: el título está vacío")

    with Image.open(fondo) as original:
        img = cubrir(original.convert("RGB"), ANCHO, ALTO)
    img = ImageEnhance.Color(img).enhance(1.25)
    img = ImageEnhance.Contrast(img).enhance(1.1)
    if personaje:
        img = pegar_personaje(img, personaje, lado)
    # El degradado oscuro solo ayuda sobre fondos oscuros; sobre blanco (estilo del canal) ensucia.
    zona = img.crop((0, 0, ANCHO // 2, ALTO) if lado == "izquierda" else (ANCHO // 2, 0, ANCHO, ALTO))
    if zona.convert("L").resize((1, 1), Image.BOX).getpixel((0, 0)) < 170:
        img.paste(Image.new("RGB", (ANCHO, ALTO)), mask=degradado(lado))

    margen = 50
    ancho_caja, alto_caja = ANCHO * 0.48 - margen, ALTO - 2 * margen
    dibujo = ImageDraw.Draw(img)
    for tam in range(170, 40, -4):
        fuente = ImageFont.truetype(str(FUENTE), tam)
        lineas = repartir(palabras, fuente, ancho_caja, dibujo)
        interlinea = tam * 1.02
        if lineas and interlinea * len(lineas) <= alto_caja:
            break
    else:
        sys.exit("ERROR: el título es demasiado largo para la miniatura; acórtalo")

    borde = max(5, tam // 16)     # más fino que antes: con fuentes de trazo fino el borde grueso mancha
    espacio = dibujo.textlength(" ", font=fuente)
    y = (ALTO - interlinea * len(lineas)) / 2
    posiciones = []
    for linea in lineas:
        ancho_linea = sum(w for _, _, w in linea) + espacio * (len(linea) - 1)
        x = margen if lado == "izquierda" else ANCHO - margen - ancho_linea
        for palabra, color, w in linea:
            posiciones.append((x, y, palabra, color))
            x += w + espacio
        y += interlinea

    # Sombra difuminada para despegar el texto del fondo.
    sombra = Image.new("L", (ANCHO, ALTO))
    ds = ImageDraw.Draw(sombra)
    for x, y, palabra, _ in posiciones:
        ds.text((x + borde, y + borde), palabra, font=fuente, fill=200, stroke_width=borde, stroke_fill=200)
    img.paste(Image.new("RGB", (ANCHO, ALTO)), mask=sombra.filter(ImageFilter.GaussianBlur(borde)))
    for x, y, palabra, color in posiciones:
        dibujo.text((x, y), palabra, font=fuente, fill=color, stroke_width=borde, stroke_fill=(0, 0, 0))

    salida = Path(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    for calidad in (92, 85, 75):
        img.save(salida, "JPEG", quality=calidad, optimize=True)
        if salida.stat().st_size <= PESO_MAX:
            break
    return salida, tam, len(lineas)


def main():
    p = argparse.ArgumentParser(description="Miniatura de YouTube con título grande")
    p.add_argument("fondo", help="Imagen de fondo")
    p.add_argument("titulo", help="Título corto; *palabras* en amarillo")
    p.add_argument("-o", "--salida", required=True, help="Ruta .jpg")
    p.add_argument("--lado", choices=["izquierda", "derecha"], default="izquierda",
                   help="Lado del texto (deja el personaje en el otro)")
    p.add_argument("--personaje", help="Imagen del personaje (fondo blanco) para pegar en el otro lado")
    a = p.parse_args()
    ruta, tam, n = crear(a.fondo, a.titulo, a.salida, a.lado, a.personaje)
    print(f"OK: {ruta} ({ANCHO}x{ALTO}, {ruta.stat().st_size / 1024:.0f} KB, letra {tam} px, {n} líneas)")


if __name__ == "__main__":
    main()

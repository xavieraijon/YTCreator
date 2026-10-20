"""Avatar (800x800) y banner (2048x1152) del canal activo: tipografía sobre papel o sobre una ilustración.

Uso:
    .venv/bin/python herramientas/marca.py                 # canal activo
    CANAL=otro-canal .venv/bin/python herramientas/marca.py

Usa la misma marca que la pantalla final de los vídeos: colores y fuentes de canal.json y la textura de
papel de montar.py. No usa cuota de imágenes. Los textos salen de canal.json → "marca":
    "marca": {
      "monograma": "A*R*",                    # avatar: 1-3 letras; *entre asteriscos* = color de acento
      "titulo": "ASOMBROSO *Y REAL*",          # banner: nombre, con la parte de acento entre asteriscos
      "lema": "Historias que parecen inventadas… y son reales",
      "pilares": "Historia insólita  ·  Naturaleza  ·  Universo",  # opcional: debajo, fuera de la zona segura
      "fondo_banner": "marca/fondos/banner.png",  # opcional: ilustración de fondo (ruta dentro del canal)
      "fondo_avatar": "marca/fondos/avatar.png"   # opcional: ilustración del avatar (sin letras)
    }
Con fondo, el texto va en crema y el acento en el color "resaltado", con un velo oscuro detrás de la zona
segura y sombra suave para que se lea sobre cualquier imagen (fondos oscuros: p. ej. klein con la paleta
del canal). El avatar con fondo es la ilustración recortada con un aro fino del color "resaltado".
Salidas en <canal>/marca/: avatar.png, banner.png y vistas previas (previa_*.png: el avatar en círculo y
a 88 px, el recorte del banner en el móvil y la zona segura marcada).
"""

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal                                   # noqa: E402
from montar import textura_papel               # noqa: E402

BANNER = (2048, 1152)
ZONA_SEGURA = (406, 407, 1641, 745)   # 1235x338 centrada: lo único que se ve en todos los dispositivos


def partes(texto, tinta, acento):
    """'ASOMBROSO *Y REAL*' → [('ASOMBROSO ', tinta), ('Y REAL', acento)]."""
    return [(t, acento if i % 2 else tinta) for i, t in enumerate(re.split(r"\*", texto)) if t]


def centrar(dibujo, y, texto, fuente, ancho, color, x0=0):
    w = dibujo.textlength(texto, font=fuente)
    dibujo.text((x0 + (ancho - w) / 2, y), texto, font=fuente, fill=color)


def cubrir(img, tam):
    """Escala y recorta al centro para llenar tam (como background-size: cover)."""
    r = max(tam[0] / img.width, tam[1] / img.height)
    img = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS)
    x, y = (img.width - tam[0]) // 2, (img.height - tam[1]) // 2
    return img.crop((x, y, x + tam[0], y + tam[1]))


def texto_con_sombra(img, xy, texto, fuente, color, difuminado):
    capa = Image.new("L", img.size, 0)
    ImageDraw.Draw(capa).text((xy[0] + 4, xy[1] + 6), texto, font=fuente, fill=230)
    img.paste((0, 0, 0), mask=capa.filter(ImageFilter.GaussianBlur(difuminado)))
    ImageDraw.Draw(img).text(xy, texto, font=fuente, fill=color)


def fondo(cfg, clave):
    if not cfg.get(clave):
        return None
    ruta = canal.carpeta() / cfg[clave]
    if not ruta.exists():
        sys.exit(f"ERROR: canal.json → marca → {clave}: no existe {cfg[clave]}")
    return Image.open(ruta).convert("RGB")


def guardar_avatar(img, salida):
    lado = img.width
    img.save(salida / "avatar.png")
    mascara = Image.new("L", (lado, lado))
    ImageDraw.Draw(mascara).ellipse((0, 0, lado - 1, lado - 1), fill=255)
    previa = Image.new("RGB", (lado, lado), (255, 255, 255))
    previa.paste(img, mask=mascara)
    previa.save(salida / "previa_avatar_circulo.png")
    previa.resize((88, 88), Image.LANCZOS).save(salida / "previa_avatar_88px.png")


def avatar(cfg, salida):
    """Monograma con la línea de acento debajo (legible en el círculo de 88 px), o la ilustración de fondo."""
    lado = 800
    ilustracion = fondo(cfg, "fondo_avatar")
    if ilustracion:
        # algo de zoom: el círculo de YouTube recorta las esquinas y a 44-88 px manda el centro
        img = cubrir(ilustracion, (round(lado * 1.12),) * 2)
        m = (img.width - lado) // 2
        img = img.crop((m, m, m + lado, m + lado))
        ImageDraw.Draw(img).ellipse((14, 14, lado - 14, lado - 14), outline=RESALTADO, width=9)
        return guardar_avatar(img, salida)
    img = textura_papel(Image.new("RGB", (lado, lado), FONDO))
    d = ImageDraw.Draw(img)
    fuente = ImageFont.truetype(TITULO, 360)
    letras = partes(cfg["monograma"], TINTA, ACENTO)
    sep = 30
    anchos = [d.textlength(t, font=fuente) for t, _ in letras]
    x = (lado - (sum(anchos) + sep * (len(letras) - 1))) / 2
    caja = d.textbbox((0, 0), "".join(t for t, _ in letras), font=fuente)
    y = (lado - (caja[3] - caja[1])) / 2 - caja[1] - 30
    for (texto, color), w in zip(letras, anchos):
        d.text((x, y), texto, font=fuente, fill=color)
        x += w + sep
    base = y + caja[3] + 45
    d.line((lado / 2 - 150, base, lado / 2 + 150, base), fill=ACENTO, width=10)
    guardar_avatar(img, salida)


def banner(cfg, salida):
    """Nombre, línea de acento y lema dentro de la zona segura; los pilares, visibles en TV y ordenador."""
    ilustracion = fondo(cfg, "fondo_banner")
    x0, y0, x1, y1 = ZONA_SEGURA
    if ilustracion:   # texto claro sobre la ilustración, con un velo oscuro detrás de la zona segura
        img = cubrir(ilustracion, BANNER)
        velo = Image.new("L", BANNER, 0)
        ImageDraw.Draw(velo).ellipse((x0 - 120, y0 - 90, x1 + 120, y1 + 110), fill=150)
        img.paste((8, 22, 24), mask=velo.filter(ImageFilter.GaussianBlur(110)))
        tinta, acento = FONDO, RESALTADO
        escribir = lambda xy, t, f, c, dif=16: texto_con_sombra(img, xy, t, f, c, dif)
    else:
        img = textura_papel(Image.new("RGB", BANNER, FONDO))
        tinta, acento = TINTA, ACENTO
        escribir = lambda xy, t, f, c, dif=0: ImageDraw.Draw(img).text(xy, t, font=f, fill=c)
    d = ImageDraw.Draw(img)
    ancho = x1 - x0
    tam = 130
    fuente = ImageFont.truetype(TITULO, tam)
    trozos = partes(cfg["titulo"], tinta, acento)
    while sum(d.textlength(t, font=fuente) for t, _ in trozos) > ancho * 0.94:
        tam -= 4
        fuente = ImageFont.truetype(TITULO, tam)
    total = sum(d.textlength(t, font=fuente) for t, _ in trozos)
    fuente_lema = ImageFont.truetype(TEXTO, 44)
    caja = d.textbbox((0, 0), "".join(t for t, _ in trozos), font=fuente)
    alto_bloque = (caja[3] - caja[1]) + 30 + 8 + 26 + fuente_lema.size
    y = y0 + ((y1 - y0) - alto_bloque) / 2 - caja[1]
    x = x0 + (ancho - total) / 2
    for texto, color in trozos:
        escribir((x, y), texto, fuente, color)
        x += d.textlength(texto, font=fuente)
    linea_y = y + caja[3] + 30
    d.line((BANNER[0] / 2 - 120, linea_y, BANNER[0] / 2 + 120, linea_y), fill=acento, width=8)
    if cfg.get("lema"):
        escribir(((BANNER[0] - d.textlength(cfg["lema"], font=fuente_lema)) / 2, linea_y + 26),
                 cfg["lema"], fuente_lema, tinta, 10)
    if cfg.get("pilares"):   # por debajo de la zona segura: solo en ordenador y TV
        fuente_pilares = ImageFont.truetype(TEXTO, 34)
        escribir(((BANNER[0] - d.textlength(cfg["pilares"], font=fuente_pilares)) / 2, y1 + 70),
                 cfg["pilares"], fuente_pilares, acento, 8)
    img.save(salida / "banner.png")
    img.crop(ZONA_SEGURA).save(salida / "previa_banner_movil.png")
    marcado = img.copy()
    ImageDraw.Draw(marcado).rectangle(ZONA_SEGURA, outline=(220, 40, 40), width=4)
    marcado.save(salida / "previa_banner_zona.png")


if __name__ == "__main__":
    # sin opciones: --help solo muestra la ayuda (antes se ignoraba y se ejecutaba todo)
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    cfg = canal.get("marca")
    if not cfg or not cfg.get("monograma") or not cfg.get("titulo"):
        sys.exit("ERROR: falta canal.json → \"marca\" con \"monograma\" y \"titulo\" (ver la cabecera de este script)")
    if "<<RELLENAR" in str(cfg):
        sys.exit("ERROR: canal.json → \"marca\" tiene textos sin rellenar (<<RELLENAR…>>)")
    FONDO, TINTA, ACENTO = canal.color("fondo", "#EFE6D2"), canal.color("texto", "#1B1B1B"), canal.color("acento", "#C8702A")
    RESALTADO = canal.color("resaltado", "#F2C14E")
    TITULO, TEXTO = str(canal.fuente("titulo")[0]), str(canal.fuente("texto")[0])
    for f in (TITULO, TEXTO):
        if not Path(f).exists():
            sys.exit(f"ERROR: no existe la tipografía {Path(f).name} (canal.json → \"fuentes\"; fase F de /nuevo-canal)")
    salida = canal.carpeta() / "marca"
    salida.mkdir(parents=True, exist_ok=True)
    avatar(cfg, salida)
    banner(cfg, salida)
    print(f"OK: {salida.relative_to(canal.RAIZ)}/avatar.png, banner.png y vistas previas")

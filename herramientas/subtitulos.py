"""Genera subtítulos .ass con la palabra activa resaltada, a partir del .json de gen_voz.py.

Uso:
    .venv/bin/python herramientas/subtitulos.py voz.json -o voz.ass
    .venv/bin/python herramientas/subtitulos.py voz.json -o voz.ass --formato vertical

Quemar en un vídeo (fontsdir para que libass encuentre las fuentes del canal):
    ffmpeg -i video.mp4 -vf "subtitles=voz.ass:fontsdir=recursos/fuentes" salida.mp4
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal  # noqa: E402
import espacio  # noqa: E402

DIR_FUENTES = espacio.ESPACIO / "recursos" / "fuentes"

FORMATOS = {
    # ancho, alto, tamaño de letra, margen inferior, tamaño del rótulo, margen superior del rótulo
    "horizontal": (1920, 1080, 78, 110, 72, 60),
    "vertical": (1080, 1920, 92, 520, 80, 470),
}
COLOR_ROTULO = canal.color_ass("acento", "#F58C32")        # color de acento del canal
MAX_PALABRAS = 3
MAX_CARACTERES = 22
FIN_DE_FRASE = ".,;:?!…"
COLOR_ACTIVO = canal.color_ass("resaltado", "#FFD23F")     # palabra activa
HUECO_UNION = 0.35            # si la pausa entre bloques es menor, el bloque anterior se alarga
COLA = 0.15                   # tiempo extra en pantalla tras la última palabra de un bloque


def agrupar(palabras):
    """Parte la lista de palabras en bloques cortos, cortando tras signos de puntuación."""
    bloques, actual = [], []
    for p in palabras:
        texto = " ".join(x["texto"] for x in actual + [p])
        if actual and (len(actual) >= MAX_PALABRAS or len(texto) > MAX_CARACTERES):
            bloques.append(actual)
            actual = []
        actual.append(p)
        if p["texto"][-1] in FIN_DE_FRASE:
            bloques.append(actual)
            actual = []
    if actual:
        bloques.append(actual)
    return bloques


def tiempo_ass(s):
    s = max(0.0, s)
    cs = int(round(s * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def limpiar(texto):
    return texto.replace("\\", "").replace("{", "(").replace("}", ")")


def eventos_de(palabras, desplazamiento=0.0):
    bloques = agrupar(palabras)
    eventos = []
    for i, bloque in enumerate(bloques):
        fin_bloque = bloque[-1]["fin"] + COLA
        if i + 1 < len(bloques):
            siguiente = bloques[i + 1][0]["inicio"]
            fin_bloque = siguiente if siguiente - bloque[-1]["fin"] < HUECO_UNION else min(fin_bloque, siguiente)
        for j, activa in enumerate(bloque):
            ini = activa["inicio"] if j else bloque[0]["inicio"]
            fin = bloque[j + 1]["inicio"] if j + 1 < len(bloque) else fin_bloque
            partes = []
            for k, p in enumerate(bloque):
                t = limpiar(p["texto"])
                if k == j:
                    t = (f"{{\\c{COLOR_ACTIVO}\\fscx100\\fscy100\\t(0,80,\\fscx112\\fscy112)}}"
                         f"{t}{{\\r}}")
                partes.append(t)
            eventos.append((ini + desplazamiento, fin + desplazamiento, " ".join(partes)))
    return eventos


def texto_titulo(titulo):
    """Título con las palabras entre *asteriscos* en el color de resaltado, en mayúsculas."""
    return re.sub(r"\*([^*]+)\*", lambda m: f"{{\\c{COLOR_ACTIVO}}}{m.group(1)}{{\\r}}",
                  limpiar(titulo.upper().replace("{", "(").replace("}", ")")))


MAX_CAR_TITULO = 14   # caracteres por línea del título grande (fuente de título al 10 % del ancho)


def lineas_titulo(titulo):
    """Parte el título en líneas equilibradas de como mucho MAX_CAR_TITULO caracteres (las *marcas* no
    cuentan). Se parte aquí y no se deja al programa de subtítulos porque la animación de entrada cambia
    el tamaño y el corte automático saltaba de una línea a dos a mitad de la animación."""
    palabras = titulo.split()
    largo = lambda ps: len(" ".join(ps).replace("*", ""))
    n = max(1, -(-largo(palabras) // MAX_CAR_TITULO))           # líneas necesarias (redondeo arriba)
    mejor = None
    def repartir(resto, k):
        if k == 1:
            yield [resto]
            return
        for i in range(1, len(resto) - k + 2):
            for cola in repartir(resto[i:], k - 1):
                yield [resto[:i]] + cola
    for k in range(n, min(len(palabras), n + 2) + 1):
        for reparto in repartir(palabras, k):
            peor = max(largo(l) for l in reparto)
            if mejor is None or peor < mejor[0]:
                mejor = (peor, reparto)
        if mejor and mejor[0] <= MAX_CAR_TITULO:
            break
    lineas, abierto = [], False
    for ps in mejor[1]:
        linea = " ".join(ps)
        if abierto:
            linea = "*" + linea
        abierto = linea.count("*") % 2 == 1
        if abierto:
            linea += "*"
        lineas.append(linea)
    return lineas


def generar_ass(segmentos, salida, formato="horizontal", rotulos=(), titulo=None, extras=()):
    """segmentos: lista de (datos_json_de_gen_voz, desplazamiento_en_segundos).
    rotulos: lista de (inicio, fin, texto) que se muestran arriba, con la fuente de rótulos.
    titulo: (inicio, fin, texto) grande en la parte de arriba (Shorts verticales); *palabras* resaltadas.
    extras: (inicio, fin, texto) como subtítulo normal pero todo resaltado (efectos que son voz: el
    saludo de Tok)."""
    ancho, alto, letra, margen, letra_rot, margen_rot = FORMATOS[formato]
    letra_tit = round(ancho * 0.1)
    cabecera = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {ancho}
PlayResY: {alto}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,{canal.fuente('subtitulo')[1]},{letra},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,1,0,1,{letra // 11},{letra // 20},2,80,80,{margen},1
Style: Rotulo,{canal.fuente('rotulo')[1]},{letra_rot},{COLOR_ROTULO},{COLOR_ROTULO},&H00000000,&H96000000,0,0,0,0,100,100,1,0,1,{letra_rot // 10},{letra_rot // 18},8,80,80,{margen_rot},1
Style: Titulo,{canal.fuente('titulo')[1]},{letra_tit},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,2,0,1,{letra_tit // 15},{letra_tit // 16},8,70,70,{round(alto * 0.09)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lineas = []
    for datos, desplazamiento in segmentos:
        for ini, fin, texto in eventos_de(datos["palabras"], desplazamiento):
            lineas.append(f"Dialogue: 0,{tiempo_ass(ini)},{tiempo_ass(fin)},Sub,,0,0,0,,{texto}")
    for ini, fin, texto in extras:
        lineas.append(f"Dialogue: 0,{tiempo_ass(ini)},{tiempo_ass(fin)},Sub,,0,0,0,,{{\\c{COLOR_ACTIVO}}}{limpiar(texto)}")
    for ini, fin, texto in rotulos:
        # Aparece con un pequeño "pop" y desaparece fundiéndose.
        efecto = "{\\fad(120,200)\\fscx60\\fscy60\\t(0,150,\\fscx100\\fscy100)}"
        lineas.append(f"Dialogue: 1,{tiempo_ass(ini)},{tiempo_ass(fin)},Rotulo,,0,0,0,,{efecto}{limpiar(texto)}")
    if titulo:
        ini, fin, texto = titulo
        # \\q2: sin corte automático (las líneas ya vienen partidas) para que no salte al crecer.
        efecto = "{\\q2\\fad(0,250)\\fscx80\\fscy80\\t(0,180,\\fscx100\\fscy100)}"
        partido = "\\N".join(texto_titulo(l) for l in lineas_titulo(texto))
        lineas.append(f"Dialogue: 2,{tiempo_ass(ini)},{tiempo_ass(fin)},Titulo,,0,0,0,,{efecto}{partido}")
    salida = Path(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(cabecera + "\n".join(lineas) + "\n", encoding="utf-8")
    return salida


def tiempo_srt(s):
    ms = int(round(max(0.0, s) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def generar_srt(segmentos, salida, max_caracteres=42):
    """Subtítulos .srt por frases (para subirlos a YouTube como subtítulos opcionales)."""
    bloques = []
    for datos, desplazamiento in segmentos:
        actual = []
        for p in datos["palabras"]:
            if actual and len(" ".join(x["texto"] for x in actual + [p])) > max_caracteres:
                bloques.append((actual, desplazamiento))
                actual = []
            actual.append(p)
            if p["texto"][-1] in ".?!…":
                bloques.append((actual, desplazamiento))
                actual = []
        if actual:
            bloques.append((actual, desplazamiento))
    lineas = []
    for n, (b, d) in enumerate(bloques, 1):
        lineas += [str(n), f"{tiempo_srt(b[0]['inicio'] + d)} --> {tiempo_srt(b[-1]['fin'] + d + 0.2)}",
                   " ".join(p["texto"] for p in b), ""]
    salida = Path(salida)
    salida.write_text("\n".join(lineas), encoding="utf-8")
    return salida


def main():
    p = argparse.ArgumentParser(description="Subtítulos .ass con palabra activa resaltada")
    p.add_argument("json", nargs="+", help="Uno o varios .json de gen_voz.py (se encadenan)")
    p.add_argument("-o", "--salida", required=True, help="Ruta del .ass")
    p.add_argument("--formato", choices=FORMATOS, default="horizontal")
    a = p.parse_args()

    segmentos, desplazamiento = [], 0.0
    for ruta in a.json:
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
        segmentos.append((datos, desplazamiento))
        desplazamiento += datos["duracion"]
    ruta = generar_ass(segmentos, a.salida, a.formato)
    print(f"OK: {ruta}")


if __name__ == "__main__":
    main()

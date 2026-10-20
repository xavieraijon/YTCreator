"""Revisa un guion.json ANTES de gastar voz o imágenes: reglas de escritura para la voz, duración,
ritmo de imágenes, estructura del canal, Shorts, miniaturas y datos de publicación.

Uso:
    .venv/bin/python herramientas/revisar_guion.py videos/002-tema/guion.json

Devuelve código 1 si hay ERRORES (hay que corregirlos) y 0 si solo hay AVISOS (revisar a criterio).
Las estimaciones de tiempo usan las palabras por minuto de canal.json ("palabras_por_minuto", ≈ 170 con la voz actual); tras generar la voz,
montar.py da los tiempos reales.

Campos que usa del guion además del formato de montar.py:
    "duracion_objetivo": 5          # minutos; elige las cifras de "duraciones" de canal.json
    "tipo": "short"                 # Short independiente: reglas de Short (canal.json → duraciones.short)
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal  # noqa: E402
from gen_voz import EMOCION, MARCA, contar_palabras  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
MAX_PLANO, MIN_PLANO = 8.0, 2.0
FIN_FRASE = ".?!"


class Informe:
    def __init__(self):
        self.errores, self.avisos = [], []

    def error(self, donde, texto):
        self.errores.append(f"{donde}: {texto}")

    def aviso(self, donde, texto):
        self.avisos.append(f"{donde}: {texto}")


def limpio(texto):
    return re.sub(r"\s+", " ", EMOCION.sub(" ", MARCA.sub(" ", texto))).strip()


def imagenes_de(escena):
    if escena.get("imagenes"):
        return escena["imagenes"]
    return [{k: escena[k] for k in ("prompt", "imagen", "video", "desde", "reutilizar", "personaje", "movimiento", "rotulo")
             if k in escena}]


# Muletillas que delatan un texto de IA (2026-10-01: lista de Wikipedia «Signs of AI writing» y estudios de
# frecuencia en español). Ninguna está prohibida por sí sola, pero suenan a plantilla: decirlo con palabras
# concretas. Ver «Escritura humana» en .claude/agents/guionista.md.
MULETILLAS_IA = [
    r"\bcrucial(es)?\b", r"\bfascinante(s)?\b", r"\bsumerg\w+", r"\badentr(a|é|ar|emos|émonos)\w*",
    r"\bdesentra[ñn]\w+", r"\bintrincad\w+", r"\bsin precedentes\b", r"\bun antes y un después\b",
    r"\bhuella (imborrable|indeleble)\b", r"\b(es|son|como) (un )?testimonio (vivo )?de\b", r"\bcabe (destacar|señalar|mencionar)\b",
    r"\bes importante (destacar|señalar|recordar)\b", r"\ben (definitiva|resumen|conclusión)\b",
    r"\ba lo largo de la historia\b", r"\bexplorar(emos)?\b", r"\bprofundiz\w+", r"\bdesafíos?\b",
    r"\bun viaje (fascinante|apasionante|increíble)\b", r"\ben el corazón de\b", r"\btapiz\b",
    r"\balguna vez te has preguntado\b", r"\ben este v[ií]deo\b", r"\bmisterios? (que|sin) \w+ (resolver|explicar)\b",
    r"\bfundamental(es)?\b", r"\bclave\b(?! de sol)", r"\bresuena\w*",
    # transiciones que cortan la tensión (2026-10-03, prompt de guion de un creador de referencia): mejor abrir
    # la pregunta siguiente o escalar el problema que anunciar el cambio de tema
    r"\bahora (vamos a ver|veamos|pasemos a)\b", r"\bpasemos a\b", r"\bantes de continuar\b",
    r"\bcontinuemos con\b",
]
MULETILLA = re.compile("|".join(MULETILLAS_IA), re.IGNORECASE)
NO_SOLO = re.compile(r"\bno (solo|sólo|solamente|es|era|fue)\b[^.?!]{0,80}?,?\s*sino\b", re.IGNORECASE)


def revisar_texto(inf, donde, texto, voz=""):
    """Reglas de escritura para la voz (docs/concepto.md)."""
    plano = EMOCION.sub("", MARCA.sub("", texto))
    ai33 = voz.startswith("ai33:")
    if re.search(r"(…|\.\.\.)\s*[a-záéíóúñ]", plano) and not ai33:   # eleven_v3 los usa como pausa dramática
        inf.error(donde, "puntos suspensivos a mitad de frase (la voz se para y parece otra frase)")
    if not ai33 and EMOCION.search(texto):
        inf.aviso(donde, "marcas de emoción [..]: solo las usa la voz de ai33; con esta voz se ignoran")
    for m in re.finditer(r"\d[\d.,:]*", plano):
        inf.aviso(donde, f"número en cifras «{m.group()}»: escríbelo en letra para que la voz no dude")
    # Reglas propias del canal (canal.json → "reglas_texto"): expresiones regulares sobre el texto con marcas.
    for regla in canal.get("reglas_texto", []):
        if isinstance(regla, dict) and re.search(regla["patron"], texto, re.IGNORECASE):
            (inf.error if regla.get("nivel") == "error" else inf.aviso)(donde, regla["mensaje"])
    # Con eleven_v3, varias marcas de emoción DISTINTAS en la misma escena hacen saltar el tono.
    distintas = {m.group(0).lower() for m in EMOCION.finditer(texto)}
    if ai33 and len(distintas) > canal.get("max_emociones_escena", 99):
        inf.aviso(donde, f"{len(distintas)} marcas de emoción distintas ({', '.join(sorted(distintas))}): "
                         "con eleven_v3 la voz salta de tono; deja una")
    for m in MARCA.finditer(texto):
        nombre = m.group(1).lower()
        if nombre in ("img", "pausa"):
            continue
        if not canal.recurso("sfx", f"{nombre}.wav").exists():
            inf.error(donde, f"el efecto {{{nombre}}} no existe en recursos/sfx/ (del canal ni del kit)")
        antes = MARCA.sub("", texto[:m.start()]).rstrip()
        despues = MARCA.sub("", texto[m.end():]).lstrip()
        if antes and antes[-1] not in FIN_FRASE + ",;:" and despues[:1].islower():
            inf.aviso(donde, f"efecto {{{nombre}}} a mitad de frase (deben ir entre frases)")
    frases = [f for f in re.split(r"(?<=[.?!])\s+", limpio(texto)) if f]
    # Energía: varias frases cortas seguidas con punto suenan a lista (cada punto baja el tono).
    racha = 0
    for frase in frases:
        corta_plana = frase.endswith(".") and contar_palabras(frase) <= 6
        racha = racha + 1 if corta_plana else 0
        if racha == 3:
            inf.aviso(donde, f"tres frases cortas seguidas con punto (suena a lista): «…{frase[:40]}»; "
                             "encadénalas con comas o una exclamación")
    # Canales de narración sobria (canal.json → "pedir_preguntas": false) no piden una pregunta por escena.
    if canal.get("pedir_preguntas", True) and len(frases) >= 3 and not any(f.endswith(("!", "?")) for f in frases):
        inf.aviso(donde, "ninguna exclamación ni pregunta: la locución sonará plana")
    for frase in frases:
        comas = frase.count(",")
        if comas >= 4:
            inf.aviso(donde, f"frase con {comas} comas (cada coma es una pausa audible): «{frase[:60]}…»")
        if contar_palabras(frase) > 32:
            inf.aviso(donde, f"frase muy larga ({contar_palabras(frase)} palabras) para escucharla: «{frase[:60]}…»")
    for m in MULETILLA.finditer(plano):
        inf.aviso(donde, f"«{m.group()}» suena a texto de IA: dilo con palabras concretas (guionista → Escritura humana)")


def revisar(guion):
    inf = Informe()
    short = guion.get("tipo") == "short"
    # en un Short la imagen cambia cada 2-4 s; en un largo, lo que diga el canal (por defecto 8 s)
    max_plano = 5.0 if short else canal.get("max_segundos_imagen", MAX_PLANO)
    ppm = canal.get("palabras_por_minuto", 180)
    seg_palabra = 60 / ppm
    escenas = guion.get("escenas", [])
    if not escenas:
        inf.error("guion", "no tiene escenas")
        return inf, {}

    # --- Texto, imágenes y tiempos por escena ---
    palabras_total, nuevas, ids = 0, 0, set()
    contrastes = sum(len(NO_SOLO.findall(limpio(e.get("texto", "")))) for e in escenas)
    if contrastes > 2:      # «no es X, sino Y»: una vez es un recurso; muchas, el tic más reconocible de la IA
        inf.aviso("guion", f"{contrastes} contrastes «no es X, sino Y» / «no solo… sino»: deja uno o dos, como mucho")
    tiempos_escena = []
    for i, escena in enumerate(escenas, 1):
        donde = f"escena {i:02d}"
        texto = escena.get("texto", "")
        revisar_texto(inf, donde, texto, guion.get("voz") or canal.get("voz", ""))
        tramos = re.split(r"\{img\}", texto)
        specs = imagenes_de(escena)
        if len(specs) != len(tramos):
            inf.error(donde, f"{len(specs)} imágenes para {len(tramos) - 1} marcas {{img}} (debe haber una más)")
        if escena.get("estilo_voz") and len(escena["estilo_voz"].split()) < 3:
            inf.aviso(donde, f"estilo_voz «{escena['estilo_voz']}» parece de Azure; con el narrador de Gemini se "
                             "escribe completo (y parte la locución en otra toma: mejor evitarlo)")
        palabras = contar_palabras(limpio(texto))
        palabras_total += palabras
        tiempos_escena.append(palabras * seg_palabra)
        for k, (tramo, spec) in enumerate(zip(tramos, specs), 1):
            ident = f"{i:02d}-{k}"
            ids.add(ident)
            seg = contar_palabras(limpio(tramo)) * seg_palabra
            if seg > max_plano:
                inf.aviso(ident, f"≈ {seg:.1f} s en pantalla (máximo {max_plano:.0f}): añade un {{img}}")
            elif seg < MIN_PLANO and len(tramos) > 1 and "{" not in tramo:
                inf.aviso(ident, f"≈ {seg:.1f} s en pantalla: quizá demasiado rápido")
            if "prompt" in spec:
                nuevas += 1
                prompt = spec["prompt"]
                personajes = [p for p in guion.get("personajes", {}) if "{" + p + "}" in prompt]
                # Solo los personajes del canal tienen imágenes de referencia ("referencias"); los propios
                # del vídeo (p. ej. {venus}) se dibujan solo con su descripción.
                con_referencias = [p for p in personajes if p in canal.get("personajes", {})]
                if con_referencias and not spec.get("personaje"):
                    inf.aviso(ident, "sale un personaje pero falta \"personaje\": true (no usará sus referencias)")
                if spec.get("personaje") and not personajes:
                    inf.aviso(ident, "\"personaje\": true pero el prompt no usa ningún {personaje} del canal")
                sin_texto = re.search(r"\b(no|without)\s+(text|letters|words)\b|\bblank\b", prompt, re.IGNORECASE)
                if re.search(r"\b(text|letters|sign|label|words)\b", prompt, re.IGNORECASE) and not sin_texto:
                    inf.aviso(ident, "el prompt pide texto: la IA lo deforma (mejor un rótulo)")
            elif "reutilizar" in spec and spec["reutilizar"] not in ids:
                inf.error(ident, f"reutiliza {spec['reutilizar']}, que no existe o va después")
            elif not any(x in spec for x in ("prompt", "imagen", "video", "reutilizar")):
                inf.error(ident, "falta prompt, imagen, video o reutilizar")

    if short:
        return revisar_short(inf, guion, palabras_total, nuevas, tiempos_escena)

    # --- Pilar (paleta del estilo) ---
    paletas = {k for k in canal.get("paletas", {}) if not k.startswith("_") and k != "defecto"}
    if paletas and "{paleta}" in canal.get("estilo", "") and not guion.get("paleta"):
        if not guion.get("pilar"):
            inf.aviso("guion", f"falta \"pilar\" ({', '.join(sorted(paletas))}): se usará la paleta por defecto")
        elif guion["pilar"] not in paletas:
            inf.error("guion", f"pilar «{guion['pilar']}» desconocido; los de canal.json: {', '.join(sorted(paletas))}")

    # --- Duración y cifras según la duración elegida ---
    minutos = guion.get("duracion_objetivo")
    objetivo = canal.get("duraciones", {}).get(str(minutos)) if minutos else None
    if not minutos:
        inf.aviso("guion", "falta \"duracion_objetivo\" (minutos): no se comprueba la duración")
    elif objetivo:
        lo, hi = objetivo["palabras"]
        if not lo * 0.9 <= palabras_total <= hi * 1.1:
            inf.error("duración", f"{palabras_total} palabras; para {minutos} min deberían ser {lo}-{hi}")
        if nuevas > objetivo["imagenes"] * 1.15:
            inf.aviso("imágenes", f"{nuevas} imágenes nuevas (para {minutos} min se calculan ≈ {objetivo['imagenes']})")
    else:                                      # duración personalizada
        lo, hi = round(minutos * ppm * 0.9), round(minutos * ppm * 1.1)
        if not lo <= palabras_total <= hi:
            inf.error("duración", f"{palabras_total} palabras; para {minutos} min deberían ser {lo}-{hi}")

    # --- Estructura del canal ---
    # Se busca en el texto con las marcas (así una frase obligatoria puede ser un efecto: "{efecto}").
    textos = [e.get("texto", "") for e in escenas]
    tercio = max(1, len(textos) // 3)
    zonas = {"principio": " ".join(textos[:tercio + 1]), "final": " ".join(textos[-2:]), "cualquiera": " ".join(textos)}
    for frase in canal.get("frases_obligatorias", []):
        if "video" not in frase.get("tipos", ["video"]):
            continue
        if frase["texto"].lower() not in zonas.get(frase.get("donde", "cualquiera"), zonas["cualquiera"]).lower():
            inf.aviso("estructura", f"no aparece «{frase['texto']}» ({frase.get('motivo', '')}) en {frase.get('donde', 'el guion')}")
    gancho = tiempos_escena[0]
    if gancho > 25:
        inf.aviso("gancho", f"la primera escena dura ≈ {gancho:.0f} s: el gancho debe resolverse en 20 s")

    # --- Capítulos ---
    capitulos = [(sum(tiempos_escena[:i]), e["capitulo"]) for i, e in enumerate(escenas) if e.get("capitulo")]
    total = sum(tiempos_escena)
    if len(capitulos) < 3:
        inf.error("capítulos", f"{len(capitulos)} capítulos: YouTube necesita al menos 3")
    for (t, n), (t2, _) in zip(capitulos, capitulos[1:] + [(total, "")]):
        if t2 - t < 10:
            inf.error("capítulos", f"«{n}» dura ≈ {t2 - t:.0f} s (YouTube ignora los de menos de 10 s)")
    if capitulos and capitulos[0][0] > 0:
        inf.aviso("capítulos", "el primero no empieza en 0:00 (montar.py añadirá «Intro»)")

    # --- Shorts ---
    for n, short in enumerate(guion.get("shorts", []), 1):
        a, b = short.get("escenas", [0, 0])
        if not (1 <= a <= b <= len(escenas)):
            inf.error(f"short {n}", f"escenas {a}-{b} fuera de rango")
            continue
        seg = sum(tiempos_escena[a - 1:b]) + contar_palabras(short.get("gancho", "")) * seg_palabra
        if not 20 <= seg <= 58:
            inf.error(f"short {n}", f"≈ {seg:.0f} s (debe durar 20-58 s: máximo 60 con margen)")
        if not short.get("titulo"):
            inf.error(f"short {n}", "falta el título")
        if not short.get("vertical"):
            inf.aviso(f"short {n}", "sin \"vertical\": true se monta con la imagen horizontal en una franja")
        if not short.get("gancho"):
            inf.aviso(f"short {n}", "sin \"gancho\": empieza como la escena del vídeo largo, sin frase inicial propia")

    # --- Miniaturas y publicación ---
    minis = guion.get("miniaturas", [])
    if len(minis) != 3:
        inf.aviso("miniaturas", f"{len(minis)} miniaturas (se usan 3 para «Probar y comparar» de YouTube)")
    for n, m in enumerate(minis, 1):
        palabras = len(m.get("texto", "").replace("*", "").split())
        if palabras > 4:
            inf.aviso(f"miniatura {n}", f"{palabras} palabras (máximo 3-4: se ve del tamaño de un sello)")
        if "*" not in m.get("texto", ""):
            inf.aviso(f"miniatura {n}", "ninguna palabra resaltada con *asteriscos*")
        if m.get("pose") and any("{" + p + "}" in m.get("prompt", "") for p in canal.get("personajes", {})):
            inf.aviso(f"miniatura {n}", "el fondo lleva al personaje y además se pega la pose: saldría dos veces")
    for campo in ("titulo", "descripcion", "etiquetas", "fuentes", "comentario_fijado"):
        if not guion.get(campo):
            inf.error("publicación", f"falta «{campo}»")
    if len(guion.get("titulos", [])) < 2:
        inf.aviso("publicación", "faltan títulos alternativos (\"titulos\": 2)")
    for t in [guion.get("titulo", "")] + guion.get("titulos", []):
        if len(t) > 70:
            inf.aviso("publicación", f"título de {len(t)} caracteres (en móvil se corta hacia los 70): «{t}»")

    resumen = {"palabras": palabras_total, "minutos": total / 60, "imagenes_nuevas": nuevas,
               "escenas": len(escenas), "capitulos": len(capitulos), "shorts": len(guion.get("shorts", []))}
    return inf, resumen


def revisar_short(inf, guion, palabras, nuevas, tiempos_escena):
    """Reglas de un Short independiente (/nuevo-short)."""
    cfg = canal.get("duraciones", {}).get("short", {"palabras": [100, 160], "imagenes": 20, "segundos": [30, 55]})
    total = sum(tiempos_escena)
    if guion.get("formato") != "vertical":
        inf.error("formato", "un Short necesita \"formato\": \"vertical\"")
    lo, hi = cfg["palabras"]
    if not lo <= palabras <= hi:
        inf.error("duración", f"{palabras} palabras (≈ {total:.0f} s); un Short necesita {lo}-{hi} (≈ {cfg['segundos'][0]}-{cfg['segundos'][1]} s)")
    if nuevas > cfg["imagenes"] * 1.2:
        inf.aviso("imágenes", f"{nuevas} imágenes nuevas (se calculan ≈ {cfg['imagenes']})")
    primera = re.split(r"(?<=[.?!])\s+", limpio(guion["escenas"][0].get("texto", "")))[0]
    if contar_palabras(primera) > 12:
        inf.aviso("gancho", f"la primera frase tiene {contar_palabras(primera)} palabras: en un Short el gancho "
                            "va en el primer segundo y medio (una pregunta o un dato imposible, ≤ 10 palabras)")
    if not guion.get("titulo_pantalla"):
        inf.aviso("gancho", "falta \"titulo_pantalla\" (título grande los 3 primeros segundos)")
    textos = " ".join(e.get("texto", "") for e in guion["escenas"]).lower()
    for frase in canal.get("frases_obligatorias", []):
        if "short" in frase.get("tipos", []) and frase["texto"].lower() not in textos:
            inf.aviso("estructura", f"no aparece «{frase['texto']}» ({frase.get('motivo', '')})")
    if any(e.get("capitulo") for e in guion["escenas"]):
        inf.aviso("capítulos", "los Shorts no tienen capítulos (se ignoran)")
    if guion.get("shorts"):
        inf.aviso("shorts", "un Short no genera otros Shorts (se ignoran)")
    for campo in ("titulo", "descripcion", "fuentes"):
        if not guion.get(campo):
            inf.error("publicación", f"falta «{campo}»")
    for t in [guion.get("titulo", "")] + guion.get("titulos", []):
        if len(t) > 50:
            inf.aviso("publicación", f"título de {len(t)} caracteres (en Shorts se ven ≈ 40): «{t}»")
    resumen = {"palabras": palabras, "minutos": total / 60, "imagenes_nuevas": nuevas,
               "escenas": len(guion["escenas"]), "capitulos": 0, "shorts": 0}
    return inf, resumen


def main():
    p = argparse.ArgumentParser(description="Revisa un guion.json antes de producirlo")
    p.add_argument("guion", help="Ruta del guion.json")
    a = p.parse_args()
    ruta, guion = canal.leer_guion(a.guion, completo=True)
    inf, r = revisar(guion)
    if r:
        print(f"{r['escenas']} escenas · {r['palabras']} palabras · ≈ {r['minutos']:.1f} min · "
              f"{r['imagenes_nuevas']} imágenes nuevas · {r['capitulos']} capítulos · {r['shorts']} Shorts")
    for e in inf.errores:
        print(f"ERROR  {e}")
    for w in inf.avisos:
        print(f"aviso  {w}")
    if not inf.errores and not inf.avisos:
        print("OK: sin errores ni avisos")
    sys.exit(1 if inf.errores else 0)


if __name__ == "__main__":
    main()

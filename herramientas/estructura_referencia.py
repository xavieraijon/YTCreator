"""Esqueleto narrativo de un vídeo de referencia (ritmo, gancho, bucles, giro, cierre) SIN copiar su texto.

Uso:
    .venv/bin/python herramientas/estructura_referencia.py URL [URL...]
    .venv/bin/python herramientas/estructura_referencia.py URL --bloque 45 --umbral-outlier 8
    .venv/bin/python herramientas/estructura_referencia.py --sintesis [--idioma es] [--solo-outliers]
    .venv/bin/python herramientas/estructura_referencia.py --comparar videos/002-tema/guion.json URL

Qué hace (sin coste: yt-dlp sin sesión, sin créditos ni cuota; si el vídeo no tiene subtítulos se detiene):
  1. Descarga subtítulos (json3, con tiempos; prefiere el idioma original) y metadatos.
  2. Divide el vídeo en bloques (capítulos si hay 3 o más; si no, de --bloque segundos) y mide por bloque:
     palabras por minuto, preguntas, cifras, marcadores de bucle abierto, de giro y de llamada a la acción.
  3. Marca gancho, promesa, cuerpo y cierre con reglas simples (son heurísticas: las confirma `narrativa`) y
     cruza los bloques con el mapa público de "momentos más vistos".
  4. Guarda en <canal>/analisis/estructuras/<id>/: metricas.json, transcripcion.txt (SOLO para analizar),
     estructura.md (sin frases del original salvo el gancho, hasta 30 s) y alerta_outlier.txt si el vídeo
     supera --umbral-outlier veces sus suscriptores con al menos --min-visitas.

El agente `narrativa` recibe estructura.md y metricas.json, NUNCA transcripcion.txt: con el texto delante, el
modelo parafrasea aunque se le pida lo contrario.

Modo --sintesis: medianas de ritmo, preguntas, cifras, bucles y llamadas a la acción de los vídeos ya analizados
(sintesis.md). Cada análisis incluye además el factor MRV (reciente, viral frente a su canal, perenne).

Modo --comparar: mide el solapamiento de secuencias de 5 palabras entre nuestro guion.json y la transcripción
de la referencia. Código de salida 1 si pasa de --max-solape (3 % por defecto). Solo detecta copia en el MISMO
idioma: una traducción literal de una referencia en otro idioma no se ve con esta medida.
"""

import argparse
import datetime as dt
import statistics
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal  # noqa: E402

YTDLP = "yt-dlp"
GANCHO_S = 30
DIAS_RECIENTE = 180      # factor MRV: «reciente»
VECES_MEDIANA = 3        # factor MRV: «viral» = visitas ≥ 3 veces la mediana de su canal
PERENNE_DIAS, PERENNE_VPH = 365, 20   # demanda sostenida: igual que saturacion.py
N_GRAMA = 5
REINTENTOS = 4

# Marcadores por idioma. Se cuentan, nunca se citan. Con un idioma sin lista se usan el castellano y el inglés.
MARCADORES = {
    "es": {
        "bucle": r"más adelante|ahora (te )?(cuento|explico|vamos)|antes de (eso|nada)|al final (del vídeo|te)|"
                 r"quédate hasta|(te )?lo (cuento|explico) (luego|después)|pero eso no es todo|todavía (hay|falta)",
        "giro": r"sin embargo|pero (resulta|lo que)|lo que (nadie|casi nadie)|y (aquí|ahí) está|"
                r"lo (peor|curioso|sorprendente|increíble) (es|fue)|al contrario|en realidad",
        "cta": r"suscr[ií]b|suscríbete|dale (a )?(like|me gusta)|campana|enlace|descripci[oó]n|comenta|"
               r"consultor[ií]a|agenda|link",
    },
    "en": {
        "bucle": r"later in (this|the) video|stay (until|till) the end|more on that|before we (get|go)|"
                 r"i('ll| will) (explain|show) (you )?(that )?(later|in a)|but that('s| is) not all",
        "giro": r"however|but (it turns out|here's)|what (nobody|no one)|the (twist|catch|problem) is|"
                r"in (fact|reality)|actually|on the contrary",
        "cta": r"subscribe|like (the|this) video|bell|link (in|below)|description|comment|"
               r"book a call|consult",
    },
}
PREGUNTA = re.compile(r"[¿?]")
CIFRA = re.compile(r"\b\d[\d.,]*\b")


def ejecutar(args, intentos=1, espera=6):
    """Lanza yt-dlp; reintenta con espera creciente (YouTube responde 429 a ráfagas de subtítulos)."""
    for n in range(1, intentos + 1):
        r = subprocess.run([YTDLP, "--no-warnings", "--no-playlist", *args], capture_output=True, text=True)
        if r.returncode == 0 or n == intentos:
            return r
        time.sleep(espera * n)
    return r


def id_de(url):
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def info_video(url):
    r = ejecutar(["-J", "--skip-download", url], intentos=2)
    if r.returncode != 0:
        sys.exit(f"ERROR: yt-dlp no pudo leer {url} (¿sin conexión?): {r.stderr.strip()[:300]}")
    return json.loads(r.stdout)


def mediana_canal(info):
    """Mediana de visitas de los últimos vídeos del canal (sin este), del feed RSS público (15 últimos).
    None si el feed no responde o hay menos de 5. (El listado de yt-dlp ya no trae visitas: vale "NA".)"""
    cid = info.get("channel_id")
    if not cid:
        return None
    try:
        with urllib.request.urlopen(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}", timeout=20) as r:
            xml = r.read().decode("utf-8", "replace")
    except OSError:
        return None
    v = [int(n) for vid, n in re.findall(r"<yt:videoId>([^<]+)</yt:videoId>.*?<media:statistics views=\"(\d+)\"", xml, re.S)
         if vid != info["id"]]
    return statistics.median(v) if len(v) >= 5 else None


def mrv(info, visitas, med):
    """Factor MRV (mejorable, reciente, viral). Reciente y viral se miden; «mejorable» lo decide el usuario."""
    dias = None
    if info.get("upload_date"):
        dias = (dt.date.today() - dt.datetime.strptime(info["upload_date"], "%Y%m%d").date()).days
    r = {"dias": dias, "visitas_por_dia": round(visitas / max(1, dias)) if dias is not None else None,
         "visitas_por_hora": round(visitas / (max(1, dias) * 24), 1) if dias is not None else None,
         "mediana_canal": med, "veces_mediana": round(visitas / med, 1) if med else None}
    r["reciente"] = dias is not None and dias <= DIAS_RECIENTE
    r["viral"] = bool(med and visitas >= VECES_MEDIANA * med)
    r["perenne"] = bool(dias and dias >= PERENNE_DIAS and r["visitas_por_hora"] >= PERENNE_VPH)
    return r


def descargar_subtitulos(info, carpeta):
    """Devuelve (ruta del json3, idioma). Prefiere el subtítulo original; acepta el primero que llegue."""
    idioma = (info.get("language") or "").split("-")[0] or "es"
    langs = [f"{idioma}-orig", idioma] + [x for x in ("es", "en") if x != idioma]
    salida = str(carpeta / "%(id)s")
    for lang in langs:
        ejecutar(["--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", lang,
                  "--sub-format", "json3", "-o", salida, info["webpage_url"]], intentos=REINTENTOS)
        archivos = sorted(carpeta.glob(f"{info['id']}.*.json3"))
        if archivos:
            ar = archivos[0]
            return ar, ar.name.split(".")[-2].split("-")[0]
    sys.exit("ERROR: el vídeo no tiene subtítulos (o YouTube los bloqueó con 429; espera unos minutos y repite). "
             "No se usa transcripción por voz: es un coste de infraestructura que la v1 no cubre.")


def palabras_con_tiempo(ruta):
    """Lista de (segundo, palabra) a partir de un json3, sin marcas como [música]."""
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    out = []
    for ev in datos.get("events", []):
        base = ev.get("tStartMs", 0)
        for seg in ev.get("segs", []) or []:
            texto = re.sub(r"\[[^\]]*\]|♪", " ", seg.get("utf8", ""))
            for w in texto.split():
                out.append(((base + seg.get("tOffsetMs", 0)) / 1000, w))
    return out


def normaliza(texto):
    texto = unicodedata.normalize("NFD", texto.lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9ñ]+", texto)


def bloques(duracion, capitulos, tam):
    """Rangos [(inicio, fin, titulo)]: capítulos si hay 3 o más; si no, bloques de `tam` segundos."""
    if capitulos and len(capitulos) >= 3:
        rangos = [(c["start_time"], c["end_time"], c.get("title", "")) for c in capitulos]
        if rangos[0][1] - rangos[0][0] > GANCHO_S * 2:   # el gancho no es todo el primer capítulo
            ini, fin, t = rangos[0]
            rangos[:1] = [(ini, ini + GANCHO_S, t), (ini + GANCHO_S, fin, t)]
        return rangos
    n = max(1, round(duracion / tam))
    paso = duracion / n
    return [(i * paso, (i + 1) * paso, "") for i in range(n)]


def medir(palabras, ini, fin, lex):
    ws = [w for t, w in palabras if ini <= t < fin]
    texto = " ".join(ws)
    minutos = max((fin - ini) / 60, 1e-9)
    return {
        "inicio": round(ini), "fin": round(fin), "palabras": len(ws), "ppm": round(len(ws) / minutos),
        "preguntas": len(PREGUNTA.findall(texto)), "cifras": len(CIFRA.findall(texto)),
        "bucle": len(re.findall(lex["bucle"], texto, re.I)), "giro": len(re.findall(lex["giro"], texto, re.I)),
        "cta": len(re.findall(lex["cta"], texto, re.I)),
    }


def calor(heatmap, ini, fin):
    if not heatmap:
        return None
    v = [h["value"] for h in heatmap if h["start_time"] < fin and h["end_time"] > ini]
    return round(sum(v) / len(v), 2) if v else None


def mmss(s):
    return f"{int(s) // 60}:{int(s) % 60:02d}"


def etiquetar(bl, duracion):
    """Funciones por posición y señales (heurística; las confirma `narrativa`)."""
    resto = [b for b in bl if b["inicio"] >= GANCHO_S]
    primer_cta = next((b for b in resto if b["cta"] and b["inicio"] > duracion * 0.8), None)
    inicio_cierre = primer_cta["inicio"] if primer_cta else duracion * 0.92
    candidatos = [b for b in resto if duracion * 0.5 <= b["inicio"] < inicio_cierre and b["giro"]]
    giro = max(candidatos, key=lambda b: b["giro"]) if candidatos else None
    for b in bl:
        if b["inicio"] < GANCHO_S:
            f = "gancho"
        elif b["inicio"] >= inicio_cierre:
            f = "cierre"
        elif b["inicio"] < duracion * 0.15:
            f = "promesa/contexto"
        else:
            f = "cuerpo"
        if giro is b:
            f += " + giro probable"
        b["funcion"] = f
    return inicio_cierre


def mrv_texto(m):
    if m["dias"] is None:
        return "sin fecha de subida"
    viral = (f"{'sí' if m['viral'] else 'no'} ({m['veces_mediana']}× la mediana de su canal)" if m["veces_mediana"]
             else "sin datos del canal")
    return (f"reciente {'sí' if m['reciente'] else 'no'} (hace {m['dias']} días, {m['visitas_por_hora']} visitas/h) · "
            f"viral {viral} · mejorable: lo decides tú (¿duración, calidad, idioma o mercado mejorables?)"
            + (" · perenne (más de un año y aún con demanda)" if m["perenne"] else ""))


def senales(b):
    s = []
    if b["preguntas"]:
        s.append(f"{b['preguntas']} pregunta(s)")
    if b["bucle"]:
        s.append(f"abre {b['bucle']} bucle(s)")
    if b["giro"]:
        s.append(f"{b['giro']} marcador(es) de giro")
    if b["cifras"]:
        s.append(f"{b['cifras']} cifra(s)")
    if b["cta"]:
        s.append(f"{b['cta']} llamada(s) a la acción")
    return ", ".join(s) or "sin señales"


def analizar(url, args):
    info = info_video(url)
    vid = info["id"]
    destino = canal.carpeta() / "analisis" / "estructuras" / vid
    destino.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        ruta_subs, idioma = descargar_subtitulos(info, Path(tmp))
        palabras = palabras_con_tiempo(ruta_subs)
    if len(palabras) < 50:
        sys.exit(f"ERROR: {vid}: la transcripción tiene {len(palabras)} palabras; no hay material para analizar.")
    lex = MARCADORES.get(idioma) or {k: f"{MARCADORES['es'][k]}|{MARCADORES['en'][k]}" for k in MARCADORES["es"]}
    duracion = info.get("duration") or palabras[-1][0]
    heat = info.get("heatmap") or []
    bl = []
    for ini, fin, titulo in bloques(duracion, info.get("chapters"), args.bloque):
        b = medir(palabras, ini, fin, lex)
        b["capitulo"], b["calor"] = titulo, calor(heat, ini, fin)
        bl.append(b)
    inicio_cierre = etiquetar(bl, duracion)

    visitas, subs = info.get("view_count") or 0, info.get("channel_follower_count")
    ratio = round(visitas / subs, 1) if subs else None
    outlier = bool(ratio and ratio >= args.umbral_outlier and visitas >= args.min_visitas)
    titulo = info.get("title", "")
    pt = set(normaliza(titulo)) - {"de", "la", "el", "en", "y", "a", "que", "con", "me", "un", "una", "los", "las", "the", "of", "to", "and", "in", "how", "i"}
    ini_gancho = {n for n in normaliza(" ".join(w for t, w in palabras if t < GANCHO_S))}
    confirma = round(len(pt & ini_gancho) / len(pt), 2) if pt else None
    gancho = " ".join(w for t, w in palabras if t < GANCHO_S)

    m_rv = mrv(info, visitas, None if args.sin_canal else mediana_canal(info))
    ppm_total = round(len(palabras) / (duracion / 60))
    metricas = {"id": vid, "url": info["webpage_url"], "titulo": titulo, "canal": info.get("channel"), "idioma": idioma,
                "duracion_s": round(duracion), "visitas": visitas, "suscriptores": subs, "ratio_visitas_suscriptores": ratio,
                "outlier": outlier, "ppm": ppm_total, "palabras": len(palabras), "con_capitulos": bool(info.get("chapters")),
                "con_heatmap": bool(heat), "mrv": m_rv, "gancho_comparte_palabras_con_titulo": confirma,
                "cierre_desde_s": round(inicio_cierre), "bloques": bl}
    (destino / "metricas.json").write_text(json.dumps(metricas, ensure_ascii=False, indent=2), encoding="utf-8")

    lineas, ult = [], None
    for t, w in palabras:
        m = int(t // 15)
        if m != ult:
            lineas.append(f"\n[{mmss(t)}] ")
            ult = m
        lineas.append(w + " ")
    (destino / "transcripcion.txt").write_text(
        f"# SOLO PARA ANALIZAR. NO COPIAR NI PEGAR EN EL GUION. NO SE LA PASES A `narrativa`.\n# {titulo} · {info.get('channel')}\n"
        + "".join(lineas) + "\n", encoding="utf-8")

    md = [f"# Estructura: {titulo}", "",
          f"- Canal: {info.get('channel')} · {mmss(duracion)} · {visitas:,} visitas".replace(",", ".")
          + (f" · {subs:,} suscriptores (ratio {ratio} visitas por suscriptor)".replace(",", ".") if subs else " · suscriptores ocultos"),
          f"- Idioma: {idioma} · ritmo medio {ppm_total} palabras/min · "
          f"{'con' if metricas['con_capitulos'] else 'sin'} capítulos · {'con' if heat else 'sin'} mapa de momentos más vistos",
          f"- Outlier: {'SÍ' if outlier else 'no'} (umbral {args.umbral_outlier}× y {args.min_visitas:,} visitas)".replace(",", "."),
          f"- Factor MRV: {mrv_texto(m_rv)}",
          f"- Palabras clave del título que aparecen en los primeros {GANCHO_S} s: {int(confirma * 100)} % "
          f"({'coincide con la promesa' if confirma >= 0.5 else 'poca coincidencia: puede ser un título que reformula o una promesa que se confirma después; léelo'}; solo mide palabras)"
          if confirma is not None else "", "",
          "> Heurística: las funciones se deducen de la posición y de marcadores léxicos; `narrativa` las confirma. "
          "Las preguntas dependen de que los subtítulos traigan puntuación; las cifras, de que vengan en dígitos.", "",
          f"## Gancho literal (0-{GANCHO_S} s; para estudiar, no se reutiliza)", "", f"> {gancho}", "",
          "## Bloques", "", "| Tiempo | Función | ppm | Señales | Calor |", "|---|---|---|---|---|"]
    for b in bl:
        nombre = f"{b['capitulo']} · " if b["capitulo"] else ""
        md.append(f"| {mmss(b['inicio'])}-{mmss(b['fin'])} | {nombre}{b['funcion']} | {b['ppm']} | {senales(b)} | "
                  f"{b['calor'] if b['calor'] is not None else '—'} |")
    con_calor = [b for b in bl if b["calor"] is not None]
    if con_calor:
        fuerte, flojo = max(con_calor, key=lambda b: b["calor"]), min(con_calor, key=lambda b: b["calor"])
        md += ["", "## Retención (mapa público de momentos más vistos)", "",
               f"- Más visto: {mmss(fuerte['inicio'])}-{mmss(fuerte['fin'])} ({fuerte['funcion']}, {senales(fuerte)})",
               f"- Menos visto: {mmss(flojo['inicio'])}-{mmss(flojo['fin'])} ({flojo['funcion']}, {senales(flojo)})"]
    ctas = [f"{mmss(b['inicio'])} ({int(b['inicio'] / duracion * 100)} %)" for b in bl if b["cta"]]
    md += ["", "## Llamadas a la acción", "", "- Bloques con CTA: " + (", ".join(ctas) or "ninguno"),
           f"- El cierre empieza hacia {mmss(inicio_cierre)} ({int(inicio_cierre / duracion * 100)} % del vídeo)", ""]
    (destino / "estructura.md").write_text("\n".join(x for x in md if x is not None), encoding="utf-8")
    alerta = destino / "alerta_outlier.txt"
    if outlier:
        alerta.write_text(f"{titulo}: {visitas} visitas con {subs} suscriptores (×{ratio}). Demanda real, no solo audiencia propia.\n",
                          encoding="utf-8")
    elif alerta.exists():
        alerta.unlink()
    print(f"{vid} · {titulo[:60]} · {len(bl)} bloques · outlier: {'SÍ' if outlier else 'no'}\n  → {destino}/estructura.md")
    if args.mostrar:
        print("\n" + (destino / "estructura.md").read_text(encoding="utf-8"))
    return destino, idioma


def ngramas(ws, n=N_GRAMA):
    return [" ".join(ws[i:i + n]) for i in range(len(ws) - n + 1)]


def comparar(ruta_guion, url, args):
    from revisar_guion import limpio  # noqa: E402  (importa gen_voz: solo en este modo)
    info = info_video(url)
    transcripcion = canal.carpeta() / "analisis" / "estructuras" / info["id"] / "transcripcion.txt"
    if transcripcion.exists():
        texto = re.sub(r"^#.*$|\[\d+:\d{2}\]", " ", transcripcion.read_text(encoding="utf-8"), flags=re.M)
        idioma = (info.get("language") or "es").split("-")[0]
    else:
        with tempfile.TemporaryDirectory() as tmp:
            ruta, idioma = descargar_subtitulos(info, Path(tmp))
            texto = " ".join(w for _, w in palabras_con_tiempo(ruta))
    ref = set(ngramas(normaliza(texto)))
    _, guion = canal.leer_guion(ruta_guion)
    total = comunes = 0
    por_escena = []
    for i, e in enumerate(guion["escenas"], 1):
        g = ngramas(normaliza(limpio(e.get("texto", ""))))
        c = [x for x in g if x in ref]
        total, comunes = total + len(g), comunes + len(c)
        if len(c) >= 2:
            por_escena.append((i, len(c), len(g)))
    pct = 100 * comunes / total if total else 0
    print(f"Solape de secuencias de {N_GRAMA} palabras con «{info.get('title', '')[:50]}»: {pct:.1f} % ({comunes}/{total})")
    for i, c, g in por_escena:
        print(f"  escena {i}: {c} de {g} secuencias coinciden")
    if idioma != "es":
        print(f"aviso  la referencia está en «{idioma}»: esta medida no detecta una traducción literal.")
    if pct > args.max_solape:
        print(f"ERROR  solape {pct:.1f} % por encima del {args.max_solape} %: reescribe las escenas señaladas.")
        sys.exit(1)
    print("OK: sin solape sospechoso")


def sintesis(args):
    """Patrón común de varios referentes: medianas de ritmo, gancho, bucles, cifras y llamadas a la acción."""
    carpeta = canal.carpeta() / "analisis" / "estructuras"
    ids = [id_de(u) or u for u in args.urls]
    todos = [json.loads(f.read_text(encoding="utf-8")) for f in sorted(carpeta.glob("*/metricas.json"))]
    ms = [m for m in todos if (not ids or m["id"] in ids) and (m["outlier"] or not args.solo_outliers)
          and (not args.idioma or m["idioma"] == args.idioma)]
    if not ms:
        sys.exit("ERROR: no hay vídeos analizados que cumplan el filtro. Lanza antes el análisis con la URL.")
    filas = []
    for m in ms:
        b, d = m["bloques"], m["duracion_s"]
        minutos = d / 60
        cta = next((x["inicio"] / d for x in b if x["cta"]), None)
        filas.append({"id": m["id"], "titulo": m["titulo"][:48], "idioma": m["idioma"], "min": minutos, "ppm": m["ppm"],
                      "preg": sum(x["preguntas"] for x in b) / minutos, "cifras": sum(x["cifras"] for x in b) / minutos,
                      "bucles": sum(x["bucle"] for x in b) / minutos * 10, "cta1": cta, "cierre": m["cierre_desde_s"] / d,
                      "ratio": m["ratio_visitas_suscriptores"]})

    def med(k, escala=1, nd=0):
        v = [f[k] * escala for f in filas if f[k] is not None]
        return f"{statistics.median(v):.{nd}f}" if v else "—"
    idiomas = sorted({f["idioma"] for f in filas})
    md = [f"# Síntesis de {len(filas)} vídeos de referencia", "",
          f"Idiomas: {', '.join(idiomas)}. {'Muestra pequeña (< 3): no es un patrón, es una anécdota.' if len(filas) < 3 else ''}",
          "Las preguntas dependen de la puntuación de los subtítulos y las cifras de que vengan en dígitos: compara "
          "solo vídeos del mismo idioma.", "",
          "## Medianas", "",
          f"- Duración: {med('min', nd=1)} min · ritmo: {med('ppm')} palabras/min",
          f"- Preguntas por minuto: {med('preg', nd=1)} · cifras por minuto: {med('cifras', nd=1)} · "
          f"bucles abiertos por cada 10 min: {med('bucles', nd=1)}",
          f"- Primera llamada a la acción: {med('cta1', 100)} % del vídeo · el cierre empieza hacia el {med('cierre', 100)} %",
          f"- Visitas por suscriptor: {med('ratio', nd=1)}", "",
          "## Por vídeo", "", "| Vídeo | Idioma | Min | ppm | Preg/min | Cifras/min | CTA1 | Cierre | Visitas/susc. |",
          "|---|---|---|---|---|---|---|---|---|"]
    for f in filas:
        md.append(f"| {f['titulo']} | {f['idioma']} | {f['min']:.0f} | {f['ppm']} | {f['preg']:.1f} | {f['cifras']:.1f} | "
                  f"{'—' if f['cta1'] is None else format(f['cta1'] * 100, '.0f') + ' %'} | {f['cierre'] * 100:.0f} % | "
                  f"{'—' if f['ratio'] is None else f['ratio']} |")
    (carpeta / "sintesis.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md if args.mostrar else md[:14]) + f"\n\n→ {carpeta / 'sintesis.md'}")


def main():
    p = argparse.ArgumentParser(description="Esqueleto narrativo de un vídeo de referencia, sin copiar su texto")
    p.add_argument("urls", nargs="*", help="URL(s) de vídeos de referencia")
    p.add_argument("--bloque", type=int, default=60, help="Segundos por bloque si no hay capítulos (60)")
    p.add_argument("--umbral-outlier", type=float, default=5, help="Visitas/suscriptores para marcar outlier (5)")
    p.add_argument("--min-visitas", type=int, default=10000, help="Visitas mínimas para marcar outlier (10000)")
    p.add_argument("--sin-canal", action="store_true", help="No pedir las visitas del canal (más rápido; sin factor viral)")
    p.add_argument("--sintesis", action="store_true",
                   help="Resume los vídeos ya analizados (o los de las URLs) en sintesis.md; con --solo-outliers, solo los outliers")
    p.add_argument("--idioma", help="Con --sintesis: solo vídeos de este idioma (es, en…)")
    p.add_argument("--solo-outliers", action="store_true", help="Con --sintesis: solo vídeos marcados como outlier")
    p.add_argument("--mostrar", action="store_true", help="Imprime estructura.md (o sintesis.md) entero al terminar (lo usa la UI)")
    p.add_argument("--comparar", metavar="GUION", help="Compara este guion.json con la transcripción de la URL")
    p.add_argument("--max-solape", type=float, default=3.0, help="Solape máximo aceptado, en %% (3)")
    a = p.parse_args()
    if a.sintesis:
        sintesis(a)
        return
    if not a.urls and not a.sintesis:
        p.error("falta la URL del vídeo de referencia")
    if a.comparar:
        comparar(a.comparar, a.urls[0], a)
    else:
        for u in a.urls:
            analizar(u, a)


if __name__ == "__main__":
    main()

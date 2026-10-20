"""Radiografía del mercado de un nicho de YouTube con datos públicos reales, para decidir canal y temas.

Uso:
    .venv/bin/python herramientas/mercado.py --nicho "curiosidades de ciencia" \
        --busqueda "qué pasaría si" --busqueda "curiosidades del espacio" --categoria educacion
    .venv/bin/python herramientas/mercado.py --comparar analisis/mercado/nichos.json

Qué mide (sin cuota ni claves: búsquedas con yt-dlp y el feed RSS público de cada canal):
  1. DEMANDA: visitas de lo que YouTube enseña al buscar el nicho.
  2. PUERTA DE ENTRADA: ¿YouTube reparte visitas a canales pequeños o nuevos? Es la señal más útil para
     un canal que empieza: si solo ganan los grandes, el nicho está cerrado aunque tenga demanda.
  3. CONCENTRACIÓN: qué parte de las visitas se llevan los 3 canales más fuertes.
  4. RITMO Y MONETIZACIÓN: de los canales observados, cuáles cumplirían el Programa de Socios (YPP) al
     ritmo que llevan, y qué ingresos por anuncios darían sus visitas con RPM prudentes.

Qué NO hace: no predice ingresos ni éxito. Los RPM son rangos de estudios con su fuente y confianza
(`herramientas/mercado_referencias.json`); la retención es un supuesto; los resultados de búsqueda sin
sesión favorecen a canales ya establecidos; el RSS solo da los 15 últimos vídeos. Todo sale como
rango y con los supuestos a la vista. Los umbrales de los semáforos son provisionales (2026-09-27).

Salida: informe en `analisis/mercado/AAAA-MM-DD-slug.md` (se versiona) y datos crudos en
`analisis/datos/mercado-*.json` (no se versionan). Con `--json` (un nicho), además, un resumen con los semáforos
y un veredicto de conjunto por la salida estándar: lo usa el asistente guiado de la UI (paso Mercado).
"""

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import re
import statistics
import subprocess
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import espacio  # noqa: E402

RAIZ = espacio.ESPACIO
REF = json.loads((Path(__file__).resolve().parent / "mercado_referencias.json").read_text())
YTDLP = "yt-dlp"
N_BUSQUEDA = 40
TOP_CANALES = 10       # los que más visitas suman en la búsqueda
MUESTRA_CANALES = 14   # más otros repartidos por el resto de la lista (ahí salen los pequeños)
HOY = dt.date.today()
FECHA_2027 = dt.date(2027, 2, 1)
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015",
      "m": "http://search.yahoo.com/mrss/"}

# Umbrales provisionales de los semáforos
DEMANDA_ALTA, DEMANDA_MEDIA = 50_000, 5_000          # mediana de visitas en búsqueda
PEQUENO = 10_000                                      # suscriptores de un canal "pequeño"
NUEVO_MESES = 24                                      # canal "nuevo"
EVIDENCIA_VISITAS = 10_000                            # vídeo de canal pequeño que "pasa la puerta"
CONC_ALTA, CONC_MEDIA = 0.70, 0.40                    # parte de visitas de los 3 primeros


# ---------------------------------------------------------------------------------------------- datos
def ytdlp_json(url, n):
    r = subprocess.run([YTDLP, "--no-update", "--no-warnings", "--flat-playlist", "-J",
                        "--playlist-end", str(n), url], capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout)


def buscar(q):
    d = ytdlp_json(f"ytsearch{N_BUSQUEDA}:{q}", N_BUSQUEDA)
    if d is None:
        sys.exit(f"ERROR: yt-dlp falló al buscar «{q}» (¿sin conexión o yt-dlp desactualizado?)")
    return [e for e in d.get("entries", []) if e.get("id") and e.get("channel_id")]


def rss(canal_id):
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={canal_id}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
                                    timeout=30) as r:
            raiz = ET.fromstring(r.read())
    except Exception:
        return None, []
    creado = raiz.find("a:published", NS)
    creado = dt.date.fromisoformat(creado.text[:10]) if creado is not None else None
    videos = []
    for e in raiz.findall("a:entry", NS):
        stats = e.find("m:group/m:community/m:statistics", NS)
        videos.append({"id": e.find("yt:videoId", NS).text,
                       "fecha": dt.date.fromisoformat(e.find("a:published", NS).text[:10]),
                       "visitas": int(stats.get("views")) if stats is not None else 0,
                       "titulo": e.find("a:title", NS).text or ""})
    return creado, videos


def datos_canal(canal_id):
    base = f"https://www.youtube.com/channel/{canal_id}"
    cortos = ytdlp_json(f"{base}/shorts", 30) or {}
    largos = ytdlp_json(f"{base}/videos", 30) or {}
    creado, recientes = rss(canal_id)
    ids_cortos = {e["id"] for e in cortos.get("entries", []) or []}
    # visitas de la pestaña de Shorts (las 3 más nuevas fuera: aún están creciendo)
    visitas_cortos = [e.get("view_count") for e in (cortos.get("entries", []) or [])[3:] if e.get("view_count")]
    duracion = {e["id"]: e.get("duration") for e in largos.get("entries", []) or []}
    for v in recientes:
        v["short"] = v["id"] in ids_cortos
        v["duracion"] = duracion.get(v["id"])
    subs = cortos.get("channel_follower_count") or largos.get("channel_follower_count")
    nombre = cortos.get("channel") or largos.get("channel") or canal_id
    return {"id": canal_id, "nombre": nombre, "subs": subs, "creado": creado and str(creado),
            "recientes": recientes, "n_shorts_tab": len(ids_cortos), "visitas_shorts_tab": visitas_cortos}


# ------------------------------------------------------------------------------------------ métricas
def mediana(xs, defecto=None):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else defecto


def ritmo(canal):
    """Vídeos al mes (largos y Shorts) y mediana de visitas de los que tienen ≥ 7 días."""
    vs = canal["recientes"]
    res = {}
    for tipo, es_short in (("largo", False), ("short", True)):
        grupo = [v for v in vs if v["short"] == es_short]
        maduros = [v for v in grupo if (HOY - v["fecha"]).days >= 7 and v["visitas"] > 0]
        if len(vs) >= 2:
            dias = max(7, (HOY - min(v["fecha"] for v in vs)).days)
        else:
            dias = 90
        med = mediana([v["visitas"] for v in maduros]) if len(maduros) >= 2 else None
        if med is None and es_short and canal["visitas_shorts_tab"]:
            med = mediana(canal["visitas_shorts_tab"])
        if med is None and not grupo:
            med = 0  # no publica de este tipo
        dur = mediana([v["duracion"] for v in grupo if v.get("duracion")])
        res[tipo] = {"al_mes": len(grupo) * 30 / dias, "mediana": med, "duracion_min": dur / 60 if dur else None}
    res["ultimo"] = str(max((v["fecha"] for v in vs), default="")) if vs else None
    return res


def ypp_al_ritmo(r, retencion):
    """Visitas de Shorts en 90 días y horas de largos en 12 meses al ritmo actual (sin crecimiento).
    None si falta la mediana de visitas (todos los vídeos recientes tienen menos de 7 días)."""
    if r["short"]["mediana"] is None or r["largo"]["mediana"] is None:
        return None, None
    shorts_90 = r["short"]["al_mes"] * 3 * r["short"]["mediana"]
    min_vistos = (r["largo"]["duracion_min"] or 6) * retencion
    horas_12m = r["largo"]["al_mes"] * 12 * r["largo"]["mediana"] * min_vistos / 60
    return shorts_90, horas_12m


def cumple(shorts_90, horas, umbral):
    if shorts_90 is None:
        return None
    return shorts_90 >= umbral["shorts_90_dias"] or horas >= umbral["horas_12_meses"]


def meses(fecha_txt):
    if not fecha_txt:
        return None
    return (HOY - dt.date.fromisoformat(fecha_txt)).days / 30.4


def semaforo(valor, alto, medio, invertido=False):
    nivel = "Alta" if valor >= alto else "Media" if valor >= medio else "Baja"
    return nivel, {"Alta": "🔴" if invertido else "🟢", "Media": "🟡",
                   "Baja": "🟢" if invertido else "🔴"}[nivel]


def analizar(nicho, busquedas, categoria, idioma):
    resultados = {q: buscar(q) for q in busquedas}
    todos = [e for rs in resultados.values() for e in rs]
    # canales: los que más visitas suman en las búsquedas
    suma = {}
    for e in todos:
        suma.setdefault(e["channel_id"], [0, 0, e.get("channel")])
        suma[e["channel_id"]][0] += e.get("view_count") or 0
        suma[e["channel_id"]][1] += 1
    orden = sorted(suma, key=lambda c: -suma[c][0])
    resto = orden[TOP_CANALES:]
    paso = max(1, len(resto) / MUESTRA_CANALES)
    elegidos = orden[:TOP_CANALES] + list(dict.fromkeys(resto[int(i * paso)] for i in range(min(MUESTRA_CANALES, len(resto)))))
    with cf.ThreadPoolExecutor(4) as ex:
        canales = list(ex.map(datos_canal, elegidos))

    retencion = REF["supuestos_herramienta"]["retencion_media_largo"]["medio"]
    for c in canales:
        c["ritmo"] = ritmo(c)
        c["en_busqueda"] = {"visitas": suma[c["id"]][0], "apariciones": suma[c["id"]][1]}
        s90, h12 = ypp_al_ritmo(c["ritmo"], retencion)
        c["ypp"] = {"shorts_90": s90, "horas_12m": h12,
                    "cumple_hoy": cumple(s90, h12, REF["ypp"]["actual"]),
                    "cumple_2027": cumple(s90, h12, REF["ypp"]["desde_2027_02_01"])}
        c["edad_meses"] = meses(c["creado"])
        # multiplicador: visitas medianas de sus largos recientes / suscriptores. > 1 = YouTube le trae
        # público nuevo (lo que buscan todos los métodos de "outliers"); << 0,05 = vive de su audiencia
        med = c["ritmo"]["largo"]["mediana"]
        c["multiplicador"] = med / c["subs"] if med and c["subs"] else None

    # 1. demanda
    visitas_busqueda = [e.get("view_count") or 0 for e in todos]
    dem = mediana(visitas_busqueda, 0)
    # 2. puerta de entrada: canales pequeños con vídeos que pasan de EVIDENCIA_VISITAS, o nuevos que crecen
    subs_de = {c["id"]: c["subs"] for c in canales}
    evidencias = []
    for e in todos:
        s = subs_de.get(e["channel_id"])
        if s is not None and s < PEQUENO and (e.get("view_count") or 0) >= EVIDENCIA_VISITAS:
            evidencias.append(f"{e.get('channel')} ({f(s)} subs): «{(e.get('title') or '')[:60]}» "
                              f"{f(e['view_count'])} visitas")
    for c in canales:
        if c["edad_meses"] is not None and c["edad_meses"] <= NUEVO_MESES and (c["subs"] or 0) >= PEQUENO:
            evidencias.append(f"{c['nombre']}: canal de {c['edad_meses']:.0f} meses con {f(c['subs'])} subs")
    evidencias = list(dict.fromkeys(evidencias))
    for c in canales:
        if (c["subs"] or 0) < 200_000 and (c["multiplicador"] or 0) >= 1:
            evidencias.append(f"{c['nombre']}: sus vídeos recientes tienen de mediana {c['multiplicador']:.1f} × "
                              f"sus {f(c['subs'])} suscriptores (público nuevo)")
    evidencias = list(dict.fromkeys(evidencias))
    duracion_habitual = mediana([c["ritmo"]["largo"]["duracion_min"] for c in canales
                                 if c["ritmo"]["largo"]["duracion_min"] and c["ritmo"]["largo"]["mediana"]])
    # 3. concentración
    total = sum(visitas_busqueda) or 1
    top3 = sum(sorted((v[0] for v in suma.values()), reverse=True)[:3]) / total
    # 4. economía
    rpm_largo = REF["rpm_usd"]["largo_castellano" if idioma == "es" else "largo_mercado_global"][categoria]
    rpm_short = REF["rpm_usd"]["short"]["general"]
    medianos = [c for c in canales if c["subs"] and 1_000 <= c["subs"] < 100_000]
    medianos = [c for c in medianos if c["ypp"]["shorts_90"] is not None]
    def visitas_mes(c):
        r = c["ritmo"]
        return r["largo"]["al_mes"] * r["largo"]["mediana"], r["short"]["al_mes"] * r["short"]["mediana"]
    vm = [visitas_mes(c) for c in medianos]
    vm_largo, vm_short = mediana([v[0] for v in vm], 0), mediana([v[1] for v in vm], 0)
    ingresos = {k: vm_largo * rpm_largo[k] / 1000 + vm_short * rpm_short[k] / 1000 for k in ("bajo", "medio", "alto")}

    return {"nicho": nicho, "busquedas": busquedas, "categoria": categoria, "idioma": idioma,
            "fecha": str(HOY), "demanda": dem, "grandes_en_busqueda": sum(1 for v in visitas_busqueda if v >= 100_000),
            "n_resultados": len(todos), "evidencias": evidencias, "top3": top3,
            "canales": canales, "duracion_habitual": duracion_habitual, "n_medianos": len(medianos), "vm_largo": vm_largo, "vm_short": vm_short,
            "ingresos_mes": ingresos, "rpm_largo": rpm_largo, "rpm_short": rpm_short, "retencion": retencion,
            "resultados": {q: [{k: e.get(k) for k in ("id", "title", "channel", "channel_id", "view_count", "duration")}
                               for e in rs] for q, rs in resultados.items()}}


# ------------------------------------------------------------------------------------------- informe
def f(n, dec=0):
    if n is None:
        return "¿?"
    return f"{n:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def resumen(a):
    dem = semaforo(a["demanda"], DEMANDA_ALTA, DEMANDA_MEDIA)
    pue = semaforo(len(a["evidencias"]), 3, 1)
    con = semaforo(a["top3"], CONC_ALTA, CONC_MEDIA, invertido=True)
    # solo canales < 100.000 subs: los grandes cumplen siempre y no dicen nada de un canal que empieza
    pequenos = [c for c in a["canales"] if c["subs"] is not None and c["subs"] < 100_000
                and c["ypp"]["cumple_hoy"] is not None]
    hoy = sum(1 for c in pequenos if c["ypp"]["cumple_hoy"])
    y27 = sum(1 for c in pequenos if c["ypp"]["cumple_2027"])
    n = len(pequenos)
    return dem, pue, con, hoy, y27, n


_COLOR = {"🟢": "verde", "🟡": "ambar", "🔴": "rojo"}


def incompleto(a):
    """Sin los últimos vídeos de ningún canal (el feed RSS no respondió: el 12/10/2026 dio 404 un rato y la pestaña
    de vídeos de yt-dlp no da visitas ni fechas), no hay ritmo, edad, YPP ni ingresos: no son ceros, son «sin datos»."""
    return not any(c["recientes"] for c in a["canales"])


def veredicto(a):
    """Semáforo de conjunto para un canal que empieza, en el orden de lectura de `comparar`: primero la puerta de
    entrada (sin sitio no hay nada que hacer), luego la demanda y la concentración."""
    dem, pue, con, *_ = resumen(a)
    if pue[0] == "Baja" and incompleto(a):
        return "ambar", "No se ha podido medir bien si hay sitio para canales nuevos: faltan datos de YouTube."
    if pue[0] == "Baja":
        return "rojo", "Casi solo ganan los canales grandes: difícil para un canal que empieza."
    if dem[0] == "Baja":
        return "ambar", "Hay sitio para canales pequeños, pero se busca poco."
    if pue[0] == "Alta" and con[0] != "Alta":
        return "verde", "Se busca y YouTube reparte visitas a canales pequeños."
    return "ambar", "Hay sitio, pero con competencia fuerte: hará falta un enfoque propio."


def resumen_json(a, md=None):
    """Lo que necesita la interfaz (`--json`): semáforos con su color y las cifras en rangos, sin los datos crudos."""
    dem, pue, con, hoy, y27, n = resumen(a)
    color, motivo = veredicto(a)
    grandes = sorted((c for c in a["canales"] if c["subs"]), key=lambda c: -(c["en_busqueda"]["visitas"] or 0))
    return {"nicho": a["nicho"], "busquedas": a["busquedas"], "categoria": a["categoria"], "fecha": a["fecha"],
            "semaforo": color, "motivo": motivo,
            "demanda": {"nivel": dem[0].lower(), "color": _COLOR[dem[1]], "mediana": a["demanda"],
                        "grandes": a["grandes_en_busqueda"], "resultados": a["n_resultados"]},
            "puerta": {"nivel": pue[0].lower(), "color": _COLOR[pue[1]], "evidencias": a["evidencias"][:5],
                       "n_evidencias": len(a["evidencias"])},
            "concentracion": {"nivel": con[0].lower(), "color": _COLOR[con[1]], "top3": round(a["top3"], 3)},
            "incompleto": incompleto(a),
            "ypp": None if incompleto(a) else {"hoy": hoy, "y2027": y27, "n": n},
            "ingresos_mes": None if incompleto(a) else {k: round(v) for k, v in a["ingresos_mes"].items()},
            "n_medianos": a["n_medianos"],
            "duracion_habitual": a.get("duracion_habitual") and round(a["duracion_habitual"], 1),
            "canales": [{"nombre": c["nombre"], "subs": c["subs"], "id": c["id"]} for c in grandes[:5]],
            "informe": md and str(md.relative_to(RAIZ))}


def informe(a):
    dem, pue, con, hoy, y27, n = resumen(a)
    marca = lambda v: "¿?" if v is None else "✅" if v else "—"
    L = [f"# Mercado: {a['nicho']} ({a['fecha']})", "",
         f"Búsquedas: {', '.join('«' + q + '»' for q in a['busquedas'])} · categoría de RPM: "
         f"`{a['categoria']}` · idioma: `{a['idioma']}`", "",
         "> Radiografía con datos públicos, NO una previsión. Los ingresos son rangos con RPM de estudios "
         "(ver `herramientas/mercado_referencias.json`, confianza indicada allí) y supuestos a la vista.", "",
         "## Resumen", "",
         "| Dimensión | Nivel | Dato |", "|---|---|---|",
         f"| Demanda | {dem[1]} {dem[0]} | mediana de {f(a['demanda'])} visitas en {a['n_resultados']} resultados; "
         f"{a['grandes_en_busqueda']} con ≥ 100.000 |",
         f"| Puerta de entrada | {pue[1]} {'Abierta' if pue[0] == 'Alta' else 'Entreabierta' if pue[0] == 'Media' else 'Cerrada'} "
         f"| {len(a['evidencias'])} evidencias: canales pequeños (< {f(PEQUENO)} subs) con vídeos de ≥ {f(EVIDENCIA_VISITAS)} visitas, "
         f"nuevos (≤ {NUEVO_MESES} meses) con ≥ {f(PEQUENO)} subs, o < 200.000 subs cuyas visitas superan a sus suscriptores |",
         f"| Concentración | {con[1]} {con[0]} | los 3 canales más fuertes suman el {a['top3']:.0%} de las visitas de la búsqueda |",
         f"| Duración habitual de los largos | — | {f(a.get('duracion_habitual'), 1)} min (mediana de los canales observados) |",
         f"| Canales < 100.000 subs que llegan al YPP a su ritmo | — | hoy: {hoy} de {n}; con los requisitos de 2027: {y27} de {n} |",
         f"| Ingresos/mes de un canal mediano del nicho | — | {f(a['ingresos_mes']['bajo'])} – {f(a['ingresos_mes']['alto'])} $ "
         f"(medio {f(a['ingresos_mes']['medio'])} $), con {a['n_medianos']} canales de 1.000-100.000 subs |", ""]
    if incompleto(a):
        L += ["⚠️ Sin los últimos vídeos de ningún canal (YouTube no los ha dado): el ritmo, la edad, el YPP y los "
              "ingresos salen vacíos o a 0, y la puerta de entrada solo cuenta lo que se ve en la búsqueda.", ""]
    elif a["n_medianos"] < 3:
        L += [f"⚠️ Solo {a['n_medianos']} canales medianos observados: la estimación de ingresos es muy débil.", ""]

    L += ["## Puerta de entrada: evidencias", ""]
    L += [f"- {e}" for e in a["evidencias"][:12]] or ["- Ninguna: en lo que enseña la búsqueda solo tienen tracción canales grandes."]
    L += ["", "## Canales observados", "",
          "| Canal | Subs | Edad | Largos/mes · mediana | Multiplicador | Shorts/mes · mediana | YPP hoy · 2027 |",
          "|---|---|---|---|---|---|---|"]
    for c in sorted(a["canales"], key=lambda c: -(c["subs"] or 0)):
        r = c["ritmo"]
        edad = f"{c['edad_meses'] / 12:.1f} años" if c["edad_meses"] is not None else "¿?"
        L.append(f"| {c['nombre'][:28]} | {f(c['subs'])} | {edad} | {r['largo']['al_mes']:.1f} · {f(r['largo']['mediana'])} "
                 f"| {'¿?' if c.get('multiplicador') is None else format(c['multiplicador'], '.2f')} "
                 f"| {r['short']['al_mes']:.1f} · {f(r['short']['mediana'])} "
                 f"| {marca(c['ypp']['cumple_hoy'])} · {marca(c['ypp']['cumple_2027'])} |")
    y = REF["ypp"]
    L += ["", "## Supuestos y límites", "",
          f"- YPP actual: {f(y['actual']['suscriptores'])} subs + {f(y['actual']['horas_12_meses'])} h en 12 meses o "
          f"{f(y['actual']['shorts_90_dias'])} visualizaciones de Shorts en 90 días. Desde el 01-02-2027 (solicitudes nuevas): "
          f"{f(y['desde_2027_02_01']['horas_12_meses'])} h o {f(y['desde_2027_02_01']['shorts_90_dias'])} "
          f"(≈ {f(y['desde_2027_02_01']['shorts_90_dias'] / 90)} visualizaciones de Shorts AL DÍA).",
          f"- «Al ritmo actual» = vídeos al mes × mediana de visitas de sus últimos 15 vídeos (RSS), sin crecimiento. "
          f"Horas = visitas × duración × retención supuesta del {a['retencion']:.0%} (la real solo la da Studio). "
          "Las visitas de un vídeo siguen creciendo tras publicarse: los de < 7 días no cuentan en la mediana.",
          f"- RPM usados (USD/1.000): largo {a['rpm_largo']['bajo']}-{a['rpm_largo']['alto']} (medio {a['rpm_largo']['medio']}); "
          f"Shorts {a['rpm_short']['bajo']}-{a['rpm_short']['alto']}. Solo anuncios: patrocinios, afiliación, "
          "miembros y otras plataformas van aparte.",
          "- La búsqueda sin sesión favorece a canales establecidos y no refleja el feed de Shorts ni la "
          "página principal, que es por donde llega la mayor parte del tráfico de canales nuevos.",
          "- Sesgo de supervivencia: solo se ven canales que YouTube ya enseña; los que no despegaron no salen.", ""]
    return "\n".join(L)


def plan(visitas_semana_actual=0):
    """Cuántas visitas de largos hacen falta para las horas del YPP, antes y después del 01-02-2027."""
    y = REF["ypp"]
    semanas = max(0, (FECHA_2027 - HOY).days / 7)
    L = [f"# Plan de horas para el YPP ({HOY})", "",
         f"Quedan **{semanas:.1f} semanas** hasta el 01-02-2027. Quien entre antes se queda con los requisitos "
         f"actuales ({f(y['actual']['horas_12_meses'])} h); después harán falta {f(y['desde_2027_02_01']['horas_12_meses'])} h "
         "(y 1.000 suscriptores en ambos casos).", "",
         "Visitas de vídeos largos necesarias según los minutos que se ve de media cada visita:", "",
         "| Minutos vistos de media | Visitas para 4.000 h | Por semana hasta feb. 2027 | Visitas para 8.000 h | Por semana en 12 meses |",
         "|---|---|---|---|---|"]
    for m in (2, 4, 6, 8):
        v4 = y["actual"]["horas_12_meses"] * 60 / m
        v8 = y["desde_2027_02_01"]["horas_12_meses"] * 60 / m
        L.append(f"| {m} | {f(v4)} | {f(v4 / semanas) if semanas else '—'} | {f(v8)} | {f(v8 / 52)} |")
    L += ["", "Cómo leerlo: minutos vistos = duración × retención (un vídeo de 10 min con un 40 % de retención = 4 min). "
          "Subir la duración media vista reduce las visitas necesarias más que cualquier otra palanca. "
          "Las visualizaciones de Shorts NO suman horas (la vía de Shorts es otra: "
          f"{f(y['actual']['shorts_90_dias'])} en 90 días, {f(y['desde_2027_02_01']['shorts_90_dias'])} desde 2027).",
          "Referencia honesta: entre los canales que SÍ llegaron a 1.000 suscriptores, la mediana tardó 16 meses "
          "(vidIQ, sesgo de supervivencia). Llegar antes de febrero de 2027 desde cero es posible pero poco probable; "
          "no merece la pena forzarlo a costa de calidad (riesgo de 'contenido no auténtico')."]
    return "\n".join(L)


def slug(t):
    t = unicodedata.normalize("NFKD", t.lower())
    return re.sub(r"[^a-z0-9]+", "-", "".join(c for c in t if not unicodedata.combining(c))).strip("-")[:40]


def guardar(a, texto):
    carpeta = espacio.ANALISIS / "mercado"
    datos = espacio.ANALISIS / "datos"
    carpeta.mkdir(parents=True, exist_ok=True)
    datos.mkdir(parents=True, exist_ok=True)
    md = carpeta / f"{a['fecha']}-{slug(a['nicho'])}.md"
    md.write_text(texto + "\n")
    (datos / f"mercado-{a['fecha']}-{slug(a['nicho'])}.json").write_text(
        json.dumps(a, ensure_ascii=False, indent=1, default=str))
    return md


def comparar(analisis):
    L = [f"# Comparativa de nichos ({HOY})", "",
         "| Nicho | Demanda | Puerta de entrada | Concentración | Canales < 100k subs que llegan al YPP (hoy · 2027) | Ingresos/mes canal mediano (USD, n) |",
         "|---|---|---|---|---|---|"]
    for a in analisis:
        dem, pue, con, hoy, y27, n = resumen(a)
        L.append(f"| {a['nicho']} | {dem[1]} {f(a['demanda'])} | {pue[1]} {len(a['evidencias'])} evid. | "
                 f"{con[1]} {a['top3']:.0%} | {hoy}/{n} · {y27}/{n} | {f(a['ingresos_mes']['bajo'])}-{f(a['ingresos_mes']['alto'])} (n={a['n_medianos']}) |")
    L += ["", "Orden de lectura para un canal nuevo: primero **puerta de entrada** (¿hay sitio?), luego "
          "**demanda**, luego **concentración**, y la economía al final: un nicho que paga mucho y está "
          "cerrado da 0 €.", ""]
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--nicho", help="nombre del nicho")
    ap.add_argument("--busqueda", action="append", default=[], help="búsqueda representativa (repetible, 2-4)")
    ap.add_argument("--categoria", default="educacion", choices=["educacion", "entretenimiento", "kids"],
                    help="familia de RPM (kids = si YouTube lo clasifica 'hecho para niños')")
    ap.add_argument("--idioma", default="es", choices=["es", "global"])
    ap.add_argument("--comparar", help="JSON con una lista de {nicho, busquedas, categoria}")
    ap.add_argument("--plan", action="store_true", help="visitas necesarias para las horas del YPP (sin buscar nada)")
    ap.add_argument("--json", action="store_true",
                    help="un nicho: resumen en JSON con los semáforos (para la interfaz); el informe se guarda igual")
    args = ap.parse_args()

    if args.plan:
        print(plan())
        return
    if args.comparar:
        nichos = json.loads(Path(args.comparar).read_text())
        res = []
        for n in nichos:
            print(f"… {n['nicho']}", file=sys.stderr)
            a = analizar(n["nicho"], n["busquedas"], n.get("categoria", "educacion"), n.get("idioma", "es"))
            print(f"   {guardar(a, informe(a)).relative_to(RAIZ)}", file=sys.stderr)
            res.append(a)
        texto = comparar(res)
        salida = espacio.ANALISIS / "mercado" / f"{HOY}-comparativa.md"
        salida.write_text(texto + "\n")
        print(texto)
        print(f"Informes en {salida.parent.relative_to(RAIZ)}/", file=sys.stderr)
        return
    if not args.nicho or not args.busqueda:
        ap.error("hace falta --nicho y al menos una --busqueda (o --comparar)")
    a = analizar(args.nicho, args.busqueda, args.categoria, args.idioma)
    texto = informe(a)
    if args.json:
        print(json.dumps(resumen_json(a, guardar(a, texto)), ensure_ascii=False))
        return
    print(texto)
    print(f"Guardado en {guardar(a, texto).relative_to(RAIZ)}", file=sys.stderr)


if __name__ == "__main__":
    main()

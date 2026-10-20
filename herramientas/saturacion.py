"""Mide si un tema está saturado en YouTube antes de producirlo (regla del hueco).

Uso:
    .venv/bin/python herramientas/saturacion.py "venus un día dura más que un año" --amplio "venus planeta"
    .venv/bin/python herramientas/saturacion.py "abejas votan dónde vivir" --amplio "abejas" \
        --en "bees vote new home"

Idea: un buen tema tiene DEMANDA (el tema amplio tiene público) y POCA OFERTA del dato concreto
(pocos vídeos en castellano cuentan ya exactamente eso, y pocos se han subido en los últimos meses).
- `tema` (obligatorio): cómo buscaría la gente el dato CONCRETO, en castellano.
- `--amplio`: el tema general del que cuelga (mide la demanda: ¿hay público?).
- `--en`: la misma búsqueda en inglés. Mucho en inglés y poco en castellano = oportunidad.

Qué hace: busca en YouTube con yt-dlp (sin descargar nada, sin cuota), cuenta los "clones" (resultados
cuyo título contiene casi todas las palabras clave del tema), saca la fecha de publicación de los
primeros clones (≈ 2 s por vídeo) y da un semáforo:
  ROJO     quemado: muchos clones y ráfaga reciente, o muchos clones que nadie ve. Descartar o cambiar
           de dato (buscar el dato "de al lado" que nadie cuenta).
  ÁMBAR    competido: muchos clones pero con visitas. Solo con un ángulo claramente distinto.
  VERDE    hueco: pocos clones y el tema amplio tiene público.
  GRIS     frío: pocos clones pero tampoco hay público visible. Tema de nicho: solo si el gancho es muy
           fuerte por sí mismo.
Los umbrales son una primera versión (2026-09-27): ajustarlos con las métricas reales del canal.
YouTube personaliza poco las búsquedas de yt-dlp (sin sesión), pero los resultados cambian con el tiempo:
el informe lleva fecha.
"""

import argparse
import datetime as dt
import os
import json
import re
import statistics
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sistema  # noqa: E402,F401  (ffmpeg y yt-dlp instalados por /instalar, en el PATH)

YTDLP = "yt-dlp"
N_BUSQUEDA = 40          # resultados que se miran por búsqueda
N_FECHAS = 12            # clones de los que se saca la fecha (≈ 2 s cada uno)
DIAS_RECIENTE = 90       # "subido hace poco"
CLONES_ALTO = 12         # de 40: a partir de aquí, el dato está muy contado
CLONES_BAJO = 5          # hasta aquí, el dato está poco contado
RAFAGA = 4               # clones recientes (de los que se mira la fecha) que indican ráfaga
VISITAS_MUERTO = 1000    # mediana de visitas de los clones por debajo de la cual "nadie los ve"
PERENNE_DIAS = 365         # un vídeo más viejo que esto...
PERENNE_VPH = 20           # ...que aún saca estas visitas por hora tiene demanda sostenida (heurística, no medida)
DEMANDA_TOP = 100_000    # un resultado del tema amplio con más visitas = hay público

VACIAS = set("""a al algo ante con de del el en entre es esta este esto hay la las lo los mas más me mi
mis muy no o para pero por porque que qué se sin sobre su sus tan te tu tus un una unos unas y ya como
cómo cual cuál cuando cuándo donde dónde quien quién the of a an in on is are to and or what why how""".split())


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", texto.lower())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9ñ ]+", " ", texto)


def claves(consulta):
    return [p for p in normalizar(consulta).split() if p not in VACIAS]


def es_clon(titulo, palabras):
    """El título contiene al menos el 75 % de las palabras clave (raíz de 4 letras, para plurales)."""
    t = normalizar(titulo)
    aciertos = sum(1 for p in palabras if p[:4] in t)
    return aciertos >= max(1, round(len(palabras) * 0.75))


def buscar(consulta, n=N_BUSQUEDA):
    salida = subprocess.run(
        [YTDLP, "--no-update", "--no-warnings", "--flat-playlist", "-J", f"ytsearch{n}:{consulta}"],
        capture_output=True, text=True, timeout=120)
    if salida.returncode != 0:
        sys.exit(f"ERROR: yt-dlp falló con «{consulta}» (¿sin conexión?): {salida.stderr.strip()[:300]}")
    return [e for e in json.loads(salida.stdout).get("entries", []) if e.get("id")]


def fechas(ids):
    if not ids:
        return {}
    salida = subprocess.run(
        [YTDLP, "--no-update", "--no-warnings", "--skip-download", "--ignore-errors",
         "--print", "%(id)s %(upload_date)s", *[f"https://www.youtube.com/watch?v={i}" for i in ids]],
        capture_output=True, text=True, timeout=60 + 10 * len(ids))
    res = {}
    for linea in salida.stdout.splitlines():
        partes = linea.split()
        if len(partes) == 2 and partes[1].isdigit():
            res[partes[0]] = dt.datetime.strptime(partes[1], "%Y%m%d").date()
    return res


def visitas(e):
    return e.get("view_count") or 0


def fmt(n):
    return f"{n:,.0f}".replace(",", ".")


def medir_concreto(consulta):
    palabras = claves(consulta)
    res = buscar(consulta)
    clones = [e for e in res if es_clon(e.get("title") or "", palabras)]
    hoy = dt.date.today()
    f = fechas([e["id"] for e in clones[:N_FECHAS]])
    recientes = [e for e in clones[:N_FECHAS] if e["id"] in f and (hoy - f[e["id"]]).days <= DIAS_RECIENTE]
    ritmo = []  # visitas al día de los clones con fecha
    for e in clones[:N_FECHAS]:
        if e["id"] in f:
            ritmo.append(visitas(e) / max(1, (hoy - f[e["id"]]).days))
    perennes = sum(1 for e in clones[:N_FECHAS] if e["id"] in f and (hoy - f[e["id"]]).days >= PERENNE_DIAS
                   and visitas(e) / ((hoy - f[e["id"]]).days * 24) >= PERENNE_VPH)
    return {
        "consulta": consulta, "palabras": palabras, "total": len(res), "clones": clones, "perennes": perennes,
        "cortos": sum(1 for e in clones if (e.get("duration") or 0) <= 180),
        "mediana": statistics.median([visitas(e) for e in clones]) if clones else 0,
        "maximo": max([visitas(e) for e in clones], default=0),
        "con_fecha": len(f), "recientes": len(recientes),
        "ritmo": statistics.median(ritmo) if ritmo else 0, "fechas": f,
    }


def medir_amplio(consulta):
    res = buscar(consulta, 20)
    v = sorted((visitas(e) for e in res), reverse=True)
    return {"consulta": consulta, "mediana": statistics.median(v) if v else 0,
            "grandes": sum(1 for x in v if x >= DEMANDA_TOP), "maximo": v[0] if v else 0}


def veredicto(c, a):
    """(color, motivo para la terminal, motivo en lenguaje llano para la interfaz: sin «clon», «ráfaga» ni «tema amplio»)."""
    n = len(c["clones"])
    hay_demanda = a is None or a["grandes"] >= 2 or c["maximo"] >= DEMANDA_TOP
    parecidos = f"{n} vídeo{'s' if n != 1 else ''} casi igual{'es' if n != 1 else ''}"
    if n >= CLONES_ALTO:
        if c["recientes"] >= RAFAGA:
            return ("ROJO", f"{n} clones y {c['recientes']} subidos en los últimos {DIAS_RECIENTE} días: ráfaga en curso",
                    f"Ya hay {parecidos} y {c['recientes']} son de los últimos {DIAS_RECIENTE} días: ahora mismo lo está contando mucha gente.")
        if c["mediana"] < VISITAS_MUERTO:
            return ("ROJO", f"{n} clones con una mediana de {fmt(c['mediana'])} visitas: quemado, nadie los ve",
                    f"Ya hay {parecidos} y casi nadie los ve (unas {fmt(c['mediana'])} visitas cada uno): está agotado.")
        return ("ÁMBAR", f"{n} clones pero con visitas: solo con un ángulo claramente distinto",
                f"Ya hay {parecidos}, pero se ven: solo merece la pena con un enfoque claramente distinto.")
    if n <= CLONES_BAJO:
        if hay_demanda:
            return ("VERDE", f"solo {n} clon{'es' if n != 1 else ''} y el tema amplio tiene público: hueco",
                    f"Solo {parecidos} y el tema en general tiene público: hay hueco.")
        return ("GRIS", f"solo {n} clon{'es' if n != 1 else ''}, pero tampoco se ve público: tema frío o de nicho",
                f"Solo {parecidos}, pero tampoco se ve público para el tema: puede ser de nicho.")
    if c["recientes"] >= RAFAGA:
        return ("ÁMBAR", f"{n} clones y {c['recientes']} recientes: se está llenando, hay que ir con ángulo propio",
                f"Ya hay {parecidos} y {c['recientes']} son recientes: se está llenando, hace falta un enfoque propio.")
    return ("VERDE" if hay_demanda else "GRIS",
            f"{n} clones, sin ráfaga reciente" + ("" if hay_demanda else ", pero sin público visible"),
            f"Hay {parecidos}, pero ninguno reciente" + (": hay sitio." if hay_demanda else ", y no se ve mucho público."))


def progreso(paso, pasos, etapa):
    """Barra de la UI (solo si la tarea la lanza la UI: CANALYT_PROGRESO=1)."""
    if os.environ.get("CANALYT_PROGRESO"):
        print(f"@progreso {paso}/{pasos} {etapa}", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tema", help="búsqueda del dato concreto, en castellano")
    ap.add_argument("--amplio", help="búsqueda del tema general (demanda)")
    ap.add_argument("--en", help="la misma búsqueda del dato en inglés")
    ap.add_argument("--json", action="store_true", help="salida en JSON")
    args = ap.parse_args()

    pasos = 1 + bool(args.amplio) + bool(args.en)
    progreso(0, pasos, f"Buscando «{args.tema}» en YouTube")
    c = medir_concreto(args.tema)
    if args.amplio:
        progreso(1, pasos, f"Midiendo el público de «{args.amplio}»")
    a = medir_amplio(args.amplio) if args.amplio else None
    if args.en:
        progreso(pasos - 1, pasos, f"Buscando en inglés «{args.en}»")
    en = medir_concreto(args.en) if args.en else None
    progreso(pasos, pasos, "Hecho")
    color, motivo, motivo_llano = veredicto(c, a)

    if args.json:
        limpio = {k: v for k, v in c.items() if k not in ("clones", "fechas")}
        limpio["n_clones"] = len(c["clones"])
        print(json.dumps({"fecha": str(dt.date.today()), "concreto": limpio, "amplio": a,
                          "en": en and {"n_clones": len(en["clones"]), "mediana": en["mediana"]},
                          "semaforo": color, "motivo": motivo, "motivo_llano": motivo_llano},
                         ensure_ascii=False, indent=2))
        return

    print(f"# Saturación: «{args.tema}» ({dt.date.today()})\n")
    print(f"Palabras clave: {', '.join(c['palabras'])}")
    print(f"Clones: {len(c['clones'])} de {c['total']} resultados ({c['cortos']} de ≤ 3 min)")
    print(f"Visitas de los clones: mediana {fmt(c['mediana'])}, máximo {fmt(c['maximo'])}")
    print(f"Recientes (≤ {DIAS_RECIENTE} días): {c['recientes']} de {c['con_fecha']} con fecha;"
          f" ritmo mediano {fmt(c['ritmo'])} visitas/día")
    print(f"Perennes (> {PERENNE_DIAS} días y ≥ {PERENNE_VPH} visitas/h): {c['perennes']} de {c['con_fecha']} con fecha"
          + (" — demanda sostenida, no solo moda" if c["perennes"] else ""))
    if a:
        print(f"Tema amplio «{a['consulta']}»: {a['grandes']} de 20 con ≥ {fmt(DEMANDA_TOP)} visitas;"
              f" mediana {fmt(a['mediana'])}, máximo {fmt(a['maximo'])}")
    if en:
        print(f"En inglés «{en['consulta']}»: {len(en['clones'])} clones, mediana {fmt(en['mediana'])},"
              f" máximo {fmt(en['maximo'])}")
        if len(en["clones"]) >= CLONES_ALTO and len(c["clones"]) <= CLONES_BAJO:
            print("  → Muy contado en inglés y poco en castellano: oportunidad de traerlo.")
    print(f"\n**Semáforo: {color}** — {motivo}\n")
    if c["clones"]:
        print("Clones más arriba en la búsqueda:")
        for e in c["clones"][:10]:
            fecha = c["fechas"].get(e["id"], "¿?")
            print(f"- {fmt(visitas(e)):>10} · {fecha} · {int(e.get('duration') or 0):>4} s ·"
                  f" {(e.get('channel') or '')[:22]} · {(e.get('title') or '')[:70]}")


if __name__ == "__main__":
    main()

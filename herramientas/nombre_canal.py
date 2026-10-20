"""Mide si el nombre de un canal está libre en YouTube (fase C de /nuevo-canal): búsqueda limpia y @ libre.

Uso:
    .venv/bin/python herramientas/nombre_canal.py "Desastres de Dinero" "Dinero en Llamas"
    .venv/bin/python herramientas/nombre_canal.py "Desastres de Dinero" --id DesastresDinero --json

Para cada nombre, con yt-dlp (sin descargar nada, sin cuota):
- **Búsqueda limpia**: busca el nombre (20 resultados) y cuenta los canales que se llaman igual o casi igual y los
  vídeos cuyo título lo contiene. Si al buscar tu nombre salen otros, a tu público le costará encontrarte.
- **@ libre**: abre https://www.youtube.com/@<Id> (el identificador sale del nombre, sin espacios ni tildes; `--id`
  para dar otro, solo con un nombre). Un 404 es que está libre; si responde, ya es de alguien.
Semáforo:
  ROJO     la @ está cogida o hay un canal que se llama igual: descartarlo.
  ÁMBAR    la @ está libre, pero hay canales parecidos o 3 vídeos o más con ese nombre en el título, o el nombre es
           largo (> 30 letras): se puede, sabiendo que la búsqueda no sale limpia.
  VERDE    la @ está libre y la búsqueda sale limpia.
Las búsquedas de YouTube cambian con el tiempo: el resultado lleva fecha. La @ solo se reserva al crear el canal.
"""

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal  # noqa: E402

YTDLP = "yt-dlp"
N_BUSQUEDA = 20
VIDEOS_MUCHOS = 3        # vídeos con el nombre en el título a partir de los cuales la búsqueda no sale limpia
LARGO_MAXIMO = 30        # letras: más, y no cabe bien en la miniatura ni en la @ (de 3 a 30 caracteres)

VACIAS = set("a al de del el en la las lo los y o u e con por para sin sobre tu tus mi mis su sus un una the of and".split())


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", str(texto or "").lower())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9ñ]+", " ", texto).split())


def claves(nombre):
    palabras = normalizar(nombre).split()
    return [p for p in palabras if p not in VACIAS] or palabras


def identificador(nombre):
    """«Desastres de Dinero» → DesastresDeDinero (las letras y números de la @, como mucho 30)."""
    t = unicodedata.normalize("NFKD", nombre)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return "".join(p[:1].upper() + p[1:] for p in re.split(r"[^A-Za-z0-9]+", t) if p)[:LARGO_MAXIMO]


def _contiene(texto, palabras):
    """Todas las palabras clave (raíz de 5 letras, para plurales: «desastre» = «desastres»)."""
    t = normalizar(texto)
    return all(p[:5] in t for p in palabras)


def _yt_dlp(*args):
    try:
        return subprocess.run([YTDLP, "--no-update", "--no-warnings", *args], capture_output=True, text=True,
                              timeout=120)
    except FileNotFoundError:
        sys.exit("ERROR: falta yt-dlp (lo instala Claude: «Instala YTCreator», docs/instalar.md)")
    except subprocess.TimeoutExpired:
        sys.exit("ERROR: YouTube no responde (¿sin conexión?)")


def buscar(nombre):
    r = _yt_dlp("--flat-playlist", "-J", f"ytsearch{N_BUSQUEDA}:{nombre}")
    if r.returncode != 0:
        sys.exit(f"ERROR: no se pudo buscar «{nombre}» en YouTube (¿sin conexión?): {r.stderr.strip()[-200:]}")
    try:
        return [e for e in json.loads(r.stdout).get("entries") or [] if e.get("id")]
    except ValueError:
        sys.exit(f"ERROR: YouTube devolvió algo que no se entiende al buscar «{nombre}»")


def arroba_libre(ident):
    """True = libre (404), False = de alguien."""
    r = _yt_dlp("--flat-playlist", "--playlist-items", "1", "--print", "channel", f"https://www.youtube.com/@{ident}")
    if r.returncode == 0:
        return False
    if "404" in r.stderr:
        return True
    sys.exit(f"ERROR: no se pudo comprobar la @{ident} (¿sin conexión?): {r.stderr.strip()[-200:]}")


def medir(nombre, ident=None):
    nombre = " ".join(nombre.split())
    ident = ident or identificador(nombre)
    palabras, exacto = claves(nombre), normalizar(nombre).replace(" ", "")      # «QuantumFracture» = «Quantum Fracture»
    canales, videos = {}, []
    for e in buscar(nombre):
        canal_yt = e.get("channel") or e.get("uploader") or ""
        if canal_yt and _contiene(canal_yt, palabras):
            igual = normalizar(canal_yt).replace(" ", "") == exacto
            canales[canal_yt] = canales.get(canal_yt) or igual
        elif _contiene(e.get("title"), palabras):
            videos.append({"titulo": e.get("title"), "canal": canal_yt})
    libre = arroba_libre(ident) if len(ident) >= 3 else None
    iguales = [c for c, igual in canales.items() if igual]
    parecidos = [c for c, igual in canales.items() if not igual]
    largo = len(nombre) > LARGO_MAXIMO
    if libre is False or iguales:
        semaforo = "rojo"
        motivo = (f"La @{ident} ya es de otro canal." if libre is False else f"Ya hay un canal que se llama «{iguales[0]}».")
    elif libre is None:
        semaforo, motivo = "rojo", "El nombre es demasiado corto para una @ (mínimo 3 letras)."
    elif parecidos or len(videos) >= VIDEOS_MUCHOS or largo:
        semaforo = "ambar"
        if parecidos:
            motivo = f"La @ está libre, pero hay un canal parecido: «{parecidos[0]}»."
        elif len(videos) >= VIDEOS_MUCHOS:
            motivo = f"La @ está libre, pero {len(videos)} vídeos llevan ese nombre en el título: no saldrás el primero."
        else:
            motivo = f"La @ está libre, pero el nombre es largo ({len(nombre)} letras): costará leerlo en la miniatura."
    else:
        semaforo, motivo = "verde", "La @ está libre y al buscar el nombre no sale nadie más."
    return {"nombre": nombre, "id": ident, "arroba_libre": libre, "canales_iguales": iguales,
            "canales_parecidos": parecidos, "videos": len(videos), "ejemplos": videos[:3],
            "semaforo": semaforo, "motivo": motivo, "fecha": str(dt.date.today())}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("nombres", nargs="+", help="nombres a medir, entre comillas")
    ap.add_argument("--id", help="identificador (@) que se quiere, sin la @ (solo con un nombre)")
    ap.add_argument("--json", action="store_true", help="salida en JSON (una lista)")
    a = ap.parse_args()
    if a.id and len(a.nombres) > 1:
        sys.exit("ERROR: --id solo vale con un nombre")
    if a.id and not re.fullmatch(r"[A-Za-z0-9._-]{3,30}", a.id.lstrip("@")):
        sys.exit("ERROR: la @ va de 3 a 30 caracteres: letras, números, punto, guion o guion bajo")
    resultados = []
    for i, nombre in enumerate(a.nombres):
        canal.progreso(i, len(a.nombres), f"Buscando «{nombre}» en YouTube")
        resultados.append(medir(nombre, a.id and a.id.lstrip("@")))
    canal.progreso(len(a.nombres), len(a.nombres), "Hecho")
    if a.json:
        print(json.dumps(resultados, ensure_ascii=False))
        return
    for r in resultados:
        print(f"\n{r['nombre']}  →  {r['semaforo'].upper()}: {r['motivo']}")
        print(f"  @{r['id']}: {'libre' if r['arroba_libre'] else 'ocupada' if r['arroba_libre'] is False else '—'}")
        if r["canales_iguales"] or r["canales_parecidos"]:
            print(f"  Canales con ese nombre: {', '.join(r['canales_iguales'] + r['canales_parecidos'])}")
        print(f"  Vídeos con el nombre en el título: {r['videos']} de {N_BUSQUEDA}")
        for e in r["ejemplos"]:
            print(f"    · {e['titulo']} ({e['canal']})")


if __name__ == "__main__":
    main()

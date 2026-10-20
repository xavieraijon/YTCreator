"""Muestras de voz para elegir la del canal (fase E de /nuevo-canal y paso «Voz» del asistente de la UI).

Uso:
    .venv/bin/python herramientas/muestras_voz.py buscar "narrador documental grave" [--genero male] [--json]
        voces de ai33 en el idioma del canal con su muestra oficial (consulta gratuita: no gasta créditos); primero las
        nativas, luego las multilingües (hablan el idioma, a menudo con acento)
    .venv/bin/python herramientas/muestras_voz.py hacer <canal>/videos/_pruebas/voz/prueba.json [--solo ID]
        por cada voz de la prueba: su muestra oficial (ai33: se descarga, gratis) y el párrafo del canal locutado
        con las voces gratis (Gemini, Azure), con su velocidad (palabras por minuto) y su entonación medidas
    .venv/bin/python herramientas/muestras_voz.py hacer <prueba.json> --solo ID --gastar-ai33
        DE PAGO: el párrafo con una voz de ai33 (≈ 1,15 créditos por carácter). Solo tras decir el coste y que el
        usuario diga que sí; `coste` lo calcula sin gastar:
    .venv/bin/python herramientas/muestras_voz.py coste <prueba.json>

prueba.json (lo escribe Claude):
    {"texto": "párrafo del canal, escrito con las reglas de voz del guionista",
     "voces": [{"id": "kore", "voz": "gemini:Kore", "nombre": "Kore", "porque": "…", "estilo": "cómo habla (Gemini)",
                "velocidad": "+0%" (Azure), "muestra_oficial": "https://… (ai33, la que da `buscar`)"}],
     "recomendado": "kore"}
Deja junto a la prueba <id>.mp3 (+ su .json de tiempos), <id>_oficial.mp3 y muestras.json (lo hecho: con qué texto,
voz y estilo, para no repetir lo que no ha cambiado, y lo medido). Una voz que falla no para las demás.
"""

import argparse
import hashlib
import json
import math
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402
import espacio  # noqa: E402
import proveedores  # noqa: E402
import servicios  # noqa: E402

MANIFIESTO = "muestras.json"
URL_AI33 = "https://api.ai33.pro"
ID = re.compile(r"[A-Za-z0-9_-]{1,40}")
MAX_OFICIAL = 10_000_000                     # bytes de una muestra oficial
MARCAS = re.compile(r"\{[^}]*\}|\[[^\]]*\]")  # {pausa:…}, {efecto}, [excited]: no se locutan ni se cobran


def leer_prueba(ruta: Path) -> dict:
    """La prueba validada; ValueError con el motivo si no sirve."""
    try:
        d = json.loads(ruta.read_text(encoding="utf-8"))
    except OSError:
        raise ValueError(f"no existe {ruta}")
    except json.JSONDecodeError as e:
        raise ValueError(f"{ruta.name} no es un JSON válido: {e}")
    if not isinstance(d, dict) or not str(d.get("texto") or "").strip():
        raise ValueError("falta el párrafo de muestra («texto»)")
    voces = d.get("voces")
    if not isinstance(voces, list) or not voces:
        raise ValueError("falta la lista de voces («voces»)")
    for v in voces:
        if not isinstance(v, dict) or not ID.fullmatch(str(v.get("id", ""))) or not str(v.get("voz") or "").strip():
            raise ValueError(f"voz sin id válido o sin «voz»: {v}")
    return d


def motor(voz: str) -> str:
    return "ai33" if voz.startswith("ai33:") else "gemini" if voz.startswith("gemini:") else "azure"


def caracteres(texto: str) -> int:
    return len(MARCAS.sub("", texto).strip())


def coste_ai33(texto: str) -> int:
    """Créditos que cuesta locutar el párrafo con ai33 (lo mismo que cobra al locutar en su web)."""
    return math.ceil(caracteres(texto) * proveedores.valor("ai33.creditos_por_caracter"))


def huella(texto: str, v: dict) -> str:
    """Lo que hace distinta una muestra: si cambia, se vuelve a locutar."""
    clave = json.dumps([texto, v["voz"], v.get("estilo"), v.get("velocidad")], ensure_ascii=False)
    return hashlib.sha256(clave.encode()).hexdigest()[:16]


def _clave_ai33() -> str:
    load_dotenv(espacio.ENV)
    clave = os.getenv("AI33_API_KEY", "").strip()
    if not clave:
        sys.exit("ERROR: falta AI33_API_KEY en .env (ai33.pro → API Key)")
    return clave


def buscar(texto: str, genero: str | None, idioma: str) -> list[dict]:
    """Voces de ElevenLabs en ai33 del idioma del canal (su filtro de idioma es flojo: se vuelve a filtrar aquí)."""
    if not servicios.disponible("ai33"):
        sys.exit("ERROR: no usas ai33 (Ajustes → Servicios): sus voces no se pueden elegir")
    cab = {"xi-api-key": _clave_ai33()}
    lengua = idioma.split("-")[0]
    salida = []
    for pagina in (1, 2, 3):
        params = {"provider": "elevenlabs", "language": lengua, "locale": idioma, "page_size": 50, "page": pagina}
        if texto:
            params["search"] = texto
        try:
            r = requests.get(f"{URL_AI33}/v3/voices", headers=cab, params=params, timeout=60)
            d = r.json()
        except (requests.RequestException, ValueError) as e:
            sys.exit(f"ERROR: ai33 no ha contestado a la búsqueda de voces: {e}")
        if not r.ok or not isinstance(d, dict):
            sys.exit(f"ERROR: ai33 ha rechazado la búsqueda (HTTP {r.status_code})")
        datos = d.get("data") or []
        for x in datos:
            if x.get("locale") != idioma and idioma not in str(x.get("languages") or ""):
                continue
            if genero and x.get("gender") != genero:
                continue
            salida.append({"voz": f"ai33:{x['voice_id']}", "nombre": x.get("name"), "descripcion": x.get("description"),
                           "genero": x.get("gender"), "edad": x.get("age"), "acento": x.get("accent"),
                           "nativa": x.get("locale") == idioma, "muestra_oficial": x.get("preview_url")})
        if len(datos) < 50:
            break
    # Primero las nativas: una voz de otro idioma que también habla este suele arrastrar su acento.
    return sorted(salida, key=lambda v: not v["nativa"])


def bajar_oficial(url: str, destino: Path) -> None:
    """La muestra oficial de una voz de ai33 (un mp3 público de su biblioteca): no gasta créditos."""
    if urlparse(url).scheme != "https":
        raise ValueError("la muestra oficial no es una dirección https")
    r = requests.get(url, timeout=120, stream=True)
    r.raise_for_status()
    datos = b""
    for trozo in r.iter_content(65536):
        datos += trozo
        if len(datos) > MAX_OFICIAL:
            raise ValueError("la muestra oficial es demasiado grande")
    temporal = destino.with_name(f".{destino.name}.tmp")
    temporal.write_bytes(datos)
    os.replace(temporal, destino)


def medir(audio: Path, datos: dict) -> dict:
    """Duración, palabras por minuto y avisos de entonación (entonacion.py) de una muestra."""
    import entonacion
    dur = datos.get("duracion") or 0
    palabras = datos.get("palabras") or []
    malas = [r for r in entonacion.revisar(entonacion.cargar_audio(audio), palabras) if r[2]]
    avisos = [f"{p['inicio']:.1f} s «{p['texto']}»: {'; '.join(problemas)}" for p, _, problemas in malas]
    return {"duracion": round(dur, 1), "ppm": round(len(palabras) / dur * 60) if dur else None, "avisos": avisos[:6]}


def hacer(ruta: Path, solo: str | None, pagar: bool) -> int:
    prueba = leer_prueba(ruta)
    carpeta = ruta.parent
    texto = prueba["texto"].strip()
    voces = [v for v in prueba["voces"] if not solo or v["id"] == solo]
    if solo and not voces:
        raise ValueError(f"no hay ninguna voz «{solo}» en la prueba")
    if pagar and (not solo or motor(voces[0]["voz"]) != "ai33"):
        raise ValueError("--gastar-ai33 va con --solo y una voz de ai33 (una muestra de pago cada vez)")
    hechos = archivos.leer_json(carpeta / MANIFIESTO) if (carpeta / MANIFIESTO).exists() else {}
    fallos = 0
    for i, v in enumerate(voces, 1):
        canal.progreso(i - 1, len(voces), v.get("nombre") or v["id"])
        h = hechos.get(v["id"]) or {}
        h["voz"] = v["voz"]
        oficial = carpeta / f"{v['id']}_oficial.mp3"
        if v.get("muestra_oficial") and (h.get("oficial_url") != v["muestra_oficial"] or not oficial.exists()):
            try:
                bajar_oficial(v["muestra_oficial"], oficial)
                h.update({"oficial": oficial.name, "oficial_url": v["muestra_oficial"]})
                print(f"{v['id']}: muestra oficial descargada")
            except (requests.RequestException, ValueError) as e:
                print(f"{v['id']}: no se pudo bajar la muestra oficial ({e})")
        audio = carpeta / f"{v['id']}.mp3"
        clave = huella(texto, v)
        al_dia = audio.exists() and h.get("huella") == clave
        if motor(v["voz"]) == "ai33" and not pagar:
            if not al_dia:
                print(f"{v['id']}: voz de pago; el párrafo no se locuta sin --gastar-ai33")
        elif not al_dia:
            import gen_voz
            try:
                _, datos = gen_voz.sintetizar(texto, audio, v["voz"], v.get("velocidad") or "+0%", "0%",
                                              v.get("estilo"), None, None, "aproximada")
                h.update({"huella": clave, "archivo": audio.name, "error": None, **medir(audio, datos)})
                print(f"{v['id']}: {h['duracion']} s, {h['ppm']} palabras/min, {len(h['avisos'])} aviso(s)")
            except SystemExit as e:                       # gen_voz sale con sys.exit: que no pare las demás voces
                fallos += 1
                h["error"] = str(e.code).removeprefix("ERROR: ")
                print(f"{v['id']}: {h['error']}")
        hechos[v["id"]] = h
        archivos.escribir_json(carpeta / MANIFIESTO, hechos)
        canal.evento("muestra", ident=v["id"], estado="error" if h.get("error") else "hecha")
    canal.progreso(len(voces), len(voces), "Hecho")
    return fallos


def main():
    p = argparse.ArgumentParser(description="Muestras de voz para elegir la del canal (buscar, hacer, coste)")
    sub = p.add_subparsers(dest="orden", required=True)
    b = sub.add_parser("buscar", help="Voces de ai33 del idioma del canal con su muestra oficial (gratis)")
    b.add_argument("texto", nargs="?", default="", help="Qué buscar (p. ej. «narrador documental»)")
    b.add_argument("--genero", choices=("male", "female"), help="Solo voces de hombre o de mujer")
    b.add_argument("--json", action="store_true", help="Salida en JSON")
    h = sub.add_parser("hacer", help="Muestras de las voces de una prueba (gratis, salvo --gastar-ai33)")
    h.add_argument("prueba", help="<canal>/videos/_pruebas/voz/prueba.json")
    h.add_argument("--solo", help="Solo esta voz (su id en la prueba)")
    h.add_argument("--gastar-ai33", action="store_true", help="DE PAGO: locutar el párrafo con la voz de ai33 de --solo")
    c = sub.add_parser("coste", help="Créditos que costaría el párrafo con una voz de ai33 (sin gastar)")
    c.add_argument("prueba")
    a = p.parse_args()

    if a.orden == "buscar":
        voces = buscar(a.texto.strip(), a.genero, canal.get("idioma", "es-ES"))
        if a.json:
            print(json.dumps(voces, ensure_ascii=False, indent=1))
        else:
            for v in voces:
                origen = "" if v["nativa"] else ", MULTILINGÜE: puede tener acento"
                print(f"{v['voz']}  {v['nombre']} ({v['genero']}, {v['edad']}, {v['acento']}{origen}): {v['descripcion']}")
            print(f"{len(voces)} voces")
        return
    ruta = canal.ruta(a.prueba)
    try:
        if a.orden == "coste":
            texto = leer_prueba(ruta)["texto"]
            print(json.dumps({"caracteres": caracteres(texto), "creditos": coste_ai33(texto)}))
            return
        fallos = hacer(ruta, a.solo, a.gastar_ai33)
    except ValueError as e:
        sys.exit(f"ERROR: {e}")
    if fallos:
        sys.exit(f"ERROR: {fallos} voz(es) no se pudieron locutar (el motivo está arriba); las demás están hechas")


if __name__ == "__main__":
    main()

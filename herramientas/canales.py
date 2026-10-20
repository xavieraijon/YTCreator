"""Canales del kit: listarlos, crear uno desde la plantilla, activarlo y ver qué le falta por rellenar.
Lo usan /nuevo-canal y /cambiar-canal.

Uso:
    .venv/bin/python herramientas/canales.py lista                 # canales, el activo marcado con *
    .venv/bin/python herramientas/canales.py crear mi-canal "Mi Canal"
    .venv/bin/python herramientas/canales.py pendientes mi-canal   # marcas <<RELLENAR: …>> que quedan
    .venv/bin/python herramientas/canales.py activar mi-canal      # escribe el archivo canal_activo
    .venv/bin/python herramientas/canales.py crear-rapido          # canal rápido (rapido-N) con valores de fábrica, activo
    .venv/bin/python herramientas/canales.py renombrar viejo nuevo ["Nombre"]   # cambia el slug (y el nombre)
    .venv/bin/python herramientas/canales.py convertir rapido-1 "Mi Canal" [--slug mi-canal]   # canal rápido → canal

"crear" copia plantillas/canal/ en canales/<slug>/ y sustituye {{nombre}}, {{slug}} y {{fecha}}; lo demás
queda con marcas <<RELLENAR: qué va aquí>> que /nuevo-canal rellena fase a fase. No activa el canal.
Los canales de canales/_archivo/ no se listan ni se activan (usa CANAL=_archivo/<canal> para uno suelto).
"renombrar" mueve la carpeta y apunta el slug viejo en canal.json → "slugs_anteriores": así la UI conserva sus vídeos
(con el mismo id), conversaciones y gastos (no renombres la carpeta a mano). "convertir" hace de un canal rápido un canal
propio que se termina con /nuevo-canal continuar (ver convertir()).
"""

import argparse
import datetime
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402

PLANTILLA = canal.RAIZ / "plantillas" / "canal"
RAPIDO = canal.RAIZ / "plantillas" / "canal_rapido.json"
MARCA = re.compile(r"<<RELLENAR.*?>>", re.DOTALL)
SLUG = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
RELLENAR, POR_DEFECTO = "<<RELLENAR:", "<<POR DEFECTO (canal rápido; aplica lo habitual de tu oficio), aquí iría:"


def activo():
    return canal.ACTIVO.read_text(encoding="utf-8").strip() if canal.ACTIVO.exists() else ""


def pendientes(carpeta):
    """[(archivo relativo, nº de línea, marca)] de las marcas <<RELLENAR>> que quedan en el canal."""
    res = []
    for p in sorted(carpeta.rglob("*")):
        if p.suffix not in (".md", ".json") or "videos" in p.relative_to(carpeta).parts:
            continue
        texto = p.read_text(encoding="utf-8")   # entero: una marca puede ocupar varias líneas
        res += [(p.relative_to(carpeta), texto.count("\n", 0, m.start()) + 1, " ".join(m.group().split()))
                for m in MARCA.finditer(texto)]
    return res


def lista():
    act = activo()
    nombres = canal.canales()
    if not nombres:
        print("No hay canales (crea uno con /nuevo-canal).")
    for n in nombres:
        carpeta = canal.CANALES / n
        cfg = json.loads((carpeta / "canal.json").read_text(encoding="utf-8"))
        videos = [v for v in (carpeta / "videos").glob("[0-9S]*") if v.is_dir()] if (carpeta / "videos").exists() else []
        estado = carpeta / "estado_canal.json"
        fase = json.loads(estado.read_text(encoding="utf-8")).get("fase") if estado.exists() else None
        faltan = len(pendientes(carpeta))
        extra = [f"{len(videos)} vídeos/Shorts"]
        if fase and fase != "hecho":
            extra.append(f"/nuevo-canal en la fase {fase}")
        if faltan:
            extra.append(f"{faltan} campos sin rellenar")
        print(f"{'*' if n == act else ' '} {n:24} {cfg.get('nombre', '?'):28} {url if (url := cfg.get('url', '')) and not MARCA.search(url) else '(sin URL todavía)'}")
        print(f"  {'':24} {' · '.join(extra)}")
    archivados = sorted(p.parent.name for p in (canal.CANALES / "_archivo").glob("*/canal.json"))
    if archivados:
        print(f"\nArchivados (CANAL=_archivo/<canal>): {', '.join(archivados)}")


def crear(slug, nombre):
    if not SLUG.fullmatch(slug):
        sys.exit("ERROR: el slug va en minúsculas, sin tildes y con guiones (p. ej. 'misterios-del-mar')")
    destino = canal.CANALES / slug
    if destino.exists():
        sys.exit(f"ERROR: ya existe {destino.relative_to(canal.RAIZ)}")
    shutil.copytree(PLANTILLA, destino)
    valores = {"{{nombre}}": nombre, "{{slug}}": slug, "{{fecha}}": datetime.date.today().isoformat()}
    for p in destino.rglob("*"):
        if p.is_file() and p.suffix in (".md", ".json"):
            texto = p.read_text(encoding="utf-8")
            for k, v in valores.items():
                texto = texto.replace(k, v)
            p.write_text(texto, encoding="utf-8")
    json.loads((destino / "canal.json").read_text(encoding="utf-8"))   # la plantilla debe seguir siendo JSON válido
    for sub in ("marca", "recursos", "videos", "analisis/entrada"):
        (destino / sub).mkdir(parents=True, exist_ok=True)
    print(f"OK: {destino.relative_to(canal.RAIZ)}/ creado desde la plantilla ({len(pendientes(destino))} campos por rellenar). "
          f"No está activo: `canales.py activar {slug}` cuando toque.")


def _poner(cfg, clave, valor):
    """canal.json["a.b.c"] = valor; None borra la clave (la plantilla dice «o borra la clave»)."""
    *camino, ultima = clave.split(".")
    for k in camino:
        cfg = cfg[k]
    if valor is None and ultima != "url":
        cfg.pop(ultima, None)
    else:
        cfg[ultima] = valor


def voz_rapida(voces):
    """La voz del canal rápido: la de un servicio de voz gratuito que se use (Azure o Gemini); sin ninguno, la de Azure."""
    import servicios
    for sid in ("azure", "gemini"):
        if voces.get(sid) and servicios.disponible(sid):
            return voces[sid]
    return voces["azure"]


def crear_rapido():
    """Canal rápido (vídeo rápido sin canal, bloque E): plantillas/canal/ con los valores de fábrica de
    plantillas/canal_rapido.json, sin campos por rellenar, marcado con "rapido": true. En los .md, las marcas RELLENAR
    pasan a POR DEFECTO (no cuentan como pendientes; al convertirlo en canal vuelven a ser RELLENAR). Lo activa.
    Devuelve el slug (rapido-1, rapido-2…)."""
    n = 1
    while (canal.CANALES / f"rapido-{n}").exists():
        n += 1
    slug = f"rapido-{n}"
    destino = canal.CANALES / slug
    shutil.copytree(PLANTILLA, destino)
    valores = {"{{nombre}}": "Canal sin nombre", "{{slug}}": slug, "{{fecha}}": datetime.date.today().isoformat()}
    for p in destino.rglob("*"):
        if p.is_file() and p.suffix == ".md":
            texto = p.read_text(encoding="utf-8")
            for k, v in valores.items():
                texto = texto.replace(k, v)
            p.write_text(texto.replace(RELLENAR, POR_DEFECTO), encoding="utf-8")
    ruta = destino / "canal.json"
    texto = ruta.read_text(encoding="utf-8")
    for k, v in valores.items():
        texto = texto.replace(k, v)
    cfg = json.loads(texto)
    for clave, valor in json.loads(RAPIDO.read_text(encoding="utf-8")).items():
        if not clave.startswith("_"):
            _poner(cfg, clave, valor)
    cfg["voz"] = voz_rapida(cfg.get("voces", {}))
    cfg["rapido"] = True
    if MARCA.search(json.dumps(cfg, ensure_ascii=False)):
        shutil.rmtree(destino)
        sys.exit("ERROR: plantillas/canal/canal.json tiene una marca RELLENAR sin valor en plantillas/canal_rapido.json")
    ruta.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for sub in ("marca", "recursos", "videos", "analisis/entrada"):
        (destino / sub).mkdir(parents=True, exist_ok=True)
    canal.ACTIVO.write_text(slug + "\n", encoding="utf-8")
    return slug


def slug_de(nombre, maximo=40):
    """«Misterios del Mar» → misterios-del-mar (sin tildes, como mucho `maximo` letras, sin cortar palabras)."""
    t = unicodedata.normalize("NFKD", nombre.lower())
    t = re.sub(r"[^a-z0-9]+", "-", "".join(c for c in t if not unicodedata.combining(c))).strip("-")
    if len(t) > maximo:
        t = t[:maximo].rsplit("-", 1)[0] or t[:maximo]
    return t or "mi-canal"


def _cambiar_textos(carpeta, cambios):
    """Cambia textos en los .md del canal; los de los vídeos no (lo ya hecho se queda como se hizo)."""
    for p in carpeta.rglob("*.md"):
        if "videos" in p.relative_to(carpeta).parts:
            continue
        texto = original = p.read_text(encoding="utf-8")
        for viejo, nuevo in cambios.items():
            texto = texto.replace(viejo, nuevo)
        if texto != original:
            archivos.escribir_texto(p, texto)


def renombrar(viejo, nuevo, nombre=None):
    """Cambia el slug de un canal (su carpeta) y, si se da, su nombre (canal.json y títulos de docs/ y equipo/).
    El slug viejo queda en canal.json → "slugs_anteriores" ANTES de mover la carpeta: la UI pasa al nuevo los vídeos (con
    su id), tareas, conversaciones y gastos. Si era el canal activo, lo sigue siendo. Devuelve la carpeta nueva."""
    if viejo not in canal.canales():
        sys.exit(f"ERROR: el canal '{viejo}' no existe. Canales: {', '.join(canal.canales()) or 'ninguno'}")
    if not SLUG.fullmatch(nuevo):
        sys.exit("ERROR: el slug va en minúsculas, sin tildes y con guiones (p. ej. 'misterios-del-mar')")
    if nuevo != viejo and (canal.CANALES / nuevo).exists():
        sys.exit(f"ERROR: ya existe canales/{nuevo}")
    nombre = " ".join((nombre or "").split()) or None
    origen = canal.CANALES / viejo
    ruta = origen / "canal.json"
    try:
        cfg = archivos.leer_json(ruta)
    except archivos.ArchivoDanado as e:
        sys.exit(f"ERROR: {e}")
    antes = cfg.get("nombre")
    if nombre and antes and nombre != antes:
        cfg["nombre"] = nombre
        cfg["_comentario"] = str(cfg.get("_comentario", "")).replace(f'"{antes}"', f'"{nombre}"')
    if nuevo != viejo:
        cfg["slugs_anteriores"] = [s for s in cfg.get("slugs_anteriores") or [] if s != nuevo] + [viejo]
        cfg["_comentario"] = str(cfg.get("_comentario", "")).replace(f"pendientes {viejo}", f"pendientes {nuevo}")
    archivos.escribir_json(ruta, cfg)
    if nombre and antes and nombre != antes:
        _cambiar_textos(origen, {antes: nombre})
    if nuevo == viejo:
        return origen
    destino = canal.CANALES / nuevo
    era_activo = activo() == viejo
    origen.rename(destino)
    if era_activo:
        archivos.escribir_texto(canal.ACTIVO, nuevo + "\n")
    return destino


def convertir(rapido, nombre, slug=None):
    """Canal rápido → canal propio (bloque E): le pone nombre y slug (`renombrar`: los vídeos hechos se conservan),
    devuelve las marcas POR DEFECTO de las fichas a RELLENAR, quita "rapido" y deja estado_canal.json en la fase A para
    que /nuevo-canal continuar (o el Asistente de la UI) lo termine. canal.json conserva los valores de fábrica hasta que
    las fases D-G los cambien, así que los vídeos se pueden seguir montando. Devuelve el slug nuevo."""
    carpeta = canal.CANALES / rapido
    try:
        cfg = archivos.leer_json(carpeta / "canal.json") if (carpeta / "canal.json").exists() else None
    except archivos.ArchivoDanado as e:
        sys.exit(f"ERROR: {e}")
    if cfg is None or rapido.startswith("_"):
        sys.exit(f"ERROR: el canal '{rapido}' no existe")
    if cfg.get("rapido") is not True:
        sys.exit(f"ERROR: '{rapido}' no es un canal rápido (ya tiene identidad propia)")
    nombre = " ".join((nombre or "").split())
    if len(nombre) < 2:
        sys.exit("ERROR: falta el nombre del canal (aunque sea provisional: se decide en la fase de nombre)")
    if slug is None:
        base = slug = slug_de(nombre)
        n = 2
        while slug != rapido and (canal.CANALES / slug).exists():
            slug, n = f"{base}-{n}", n + 1
    destino = renombrar(rapido, slug, nombre)
    _cambiar_textos(destino, {POR_DEFECTO: RELLENAR})
    cfg = archivos.leer_json(destino / "canal.json")
    cfg.pop("rapido", None)
    archivos.escribir_json(destino / "canal.json", cfg)
    archivos.escribir_json(destino / "estado_canal.json", {
        "fase": "A", "completadas": [], "desde_rapido": rapido,
        "notas": (f"Convertido desde el canal rápido {rapido} el {datetime.date.today().isoformat()}. La carpeta ya existe "
                  "(en la fase B no se crea: se rellena docs/concepto.md). canal.json lleva aún los valores de fábrica "
                  "(estilo, voz, colores, música): las fases D-G los sustituyen. Los vídeos ya hechos se conservan. Si "
                  "cambia el slug, `canales.py renombrar`.")})
    return slug


def activar(slug):
    if slug not in canal.canales():
        sys.exit(f"ERROR: el canal '{slug}' no existe. Canales: {', '.join(canal.canales()) or 'ninguno'}")
    canal.ACTIVO.write_text(slug + "\n", encoding="utf-8")
    faltan = pendientes(canal.CANALES / slug)
    print(f"OK: canal activo = {slug}" + (f" (ojo: {len(faltan)} campos sin rellenar)" if faltan else ""))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("lista")
    c = sub.add_parser("crear")
    c.add_argument("slug")
    c.add_argument("nombre")
    sub.add_parser("crear-rapido")
    r = sub.add_parser("renombrar")
    r.add_argument("viejo")
    r.add_argument("nuevo")
    r.add_argument("nombre", nargs="?")
    c = sub.add_parser("convertir")
    c.add_argument("rapido")
    c.add_argument("nombre")
    c.add_argument("--slug")
    for orden in ("pendientes", "activar"):
        sub.add_parser(orden).add_argument("slug")
    a = ap.parse_args()
    if a.orden == "lista":
        lista()
    elif a.orden == "crear-rapido":
        slug = crear_rapido()
        print(f"OK: canal rápido {slug} creado con los valores de fábrica y activo.")
    elif a.orden == "renombrar":
        destino = renombrar(a.viejo, a.nuevo, a.nombre)
        print(f"OK: canales/{a.viejo} → {destino.relative_to(canal.RAIZ)}/ (la UI conserva sus vídeos)")
    elif a.orden == "convertir":
        slug = convertir(a.rapido, a.nombre, a.slug)
        print(f"OK: canales/{a.rapido} es ahora canales/{slug}/ ({len(pendientes(canal.CANALES / slug))} campos por rellenar). "
              "Termínalo con /nuevo-canal continuar.")
    elif a.orden == "crear":
        crear(a.slug, a.nombre)
    elif a.orden == "activar":
        activar(a.slug)
    else:
        carpeta = canal.CANALES / a.slug
        if not (carpeta / "canal.json").exists():
            sys.exit(f"ERROR: el canal '{a.slug}' no existe")
        res = pendientes(carpeta)
        for archivo, linea, marca in res:
            print(f"{archivo}:{linea}: {marca}")
        print(f"{len(res)} campos por rellenar" if res else "Nada por rellenar.")


if __name__ == "__main__":
    main()

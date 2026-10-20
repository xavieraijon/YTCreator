"""Dónde está cada cosa: el kit (código, plantillas, agentes) y el espacio de trabajo (canales, claves, datos).

Nadie más calcula estas rutas. `CANALYT_ESPACIO` apunta a la carpeta de trabajo de la persona; sin ella, el espacio ES la raíz
del kit (todo sigue funcionando como antes, sin migrar). Con un espacio aparte, `preparar()` crea en él enlaces al kit
(`.claude`, `herramientas`, `plantillas`, `recursos`, `docs`, `.venv`, `CLAUDE.md`): así las rutas relativas de los agentes y
comandos (`canales/…`, `herramientas/…`) valen igual y Claude trabaja con esa carpeta como directorio de trabajo.

    .venv/bin/python herramientas/espacio.py             # dice dónde están el kit y el espacio
    .venv/bin/python herramientas/espacio.py preparar    # crea o repara las carpetas y los enlaces del espacio
    .venv/bin/python herramientas/espacio.py elegir ~/YTCreator # recuerda el espacio (lo usan la UI y todos los comandos)
    .venv/bin/python herramientas/espacio.py migrar --simular    # qué copiaría del kit al espacio (sin copiar)
    .venv/bin/python herramientas/espacio.py migrar              # COPIA canales, datos, claves y análisis al espacio y lo verifica

`migrar` copia, no mueve: el original no se toca (se borra tú, cuando lo decidas). Se ejecuta con `CANALYT_ESPACIO` apuntando al
destino; el origen es el kit (o `--origen`).
"""

import argparse
import os
import shutil
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sistema  # noqa: E402

KIT = Path(__file__).resolve().parents[1]
RECUERDO = KIT / ".espacio"          # el espacio elegido, para que lo recuerden la UI y cualquier comando (no se versiona)


def _elegido() -> str:
    try:
        return RECUERDO.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


#: Por este orden: la variable `CANALYT_ESPACIO`, lo recordado en `.espacio` (comando `elegir`) y, si no, el propio kit.
ESPACIO = Path(os.environ.get("CANALYT_ESPACIO") or _elegido() or KIT).expanduser().resolve()

CANALES = ESPACIO / "canales"
DATOS = ESPACIO / "data"
ENV = ESPACIO / ".env"
ACTIVO = ESPACIO / "canal_activo"
ANALISIS = ESPACIO / "analisis"
AJUSTES = DATOS / "ajustes.json"

#: Lo que el espacio enlaza desde el kit (nombre → se enlaza a KIT/nombre).
ENLACES = (".claude", "herramientas", "plantillas", "recursos", "docs", ".venv", "CLAUDE.md", ".env.example")
#: Lo que es propio del espacio y se crea vacío.
CARPETAS = ("canales", "data", "analisis")

GITIGNORE = """# Secretos y datos locales
.env
data/

# Enlaces al kit (no son del espacio)
""" + "\n".join("/" + n for n in ENLACES) + """

# Archivos pesados de cada vídeo (se guardan los textos: guion, fuentes, estado, publicación)
**/videos/*/tmp/
**/videos/*/voz/
**/videos/*/img/
**/videos/**/*.mp4
**/videos/**/*.jpg
**/videos/**/*.jpeg
**/videos/**/*.png
**/videos/**/*.mp3
**/videos/**/*.wav
**/videos/*/boceto/
**/videos/*/*.log
**/videos/*/musica/*.mp3
**/marca/v2/
**/personaje/e2/*.png
**/personaje/e2/*.semilla
**/videos/*/voz/bloques/
**/videos/*/img/ai33.lock
**/videos/_pruebas/

# Análisis de canales: se guardan los cuadernos .md; las capturas de Studio son privadas y lo demás se regenera
analisis/entrada/*
!analisis/entrada/LEEME.md
analisis/datos/
analisis/miniaturas-*/
analisis/*.html
canales/*/analisis/entrada/*
!canales/*/analisis/entrada/LEEME.md
canales/*/analisis/datos/
canales/*/analisis/estructuras/*/transcripcion.txt
canales/*/analisis/miniaturas-*/
canales/*/analisis/*.html
.DS_Store
__pycache__/
*.pyc
"""


def es_kit() -> bool:
    """¿El espacio es la propia carpeta del kit (sin separar)?"""
    return ESPACIO == KIT


def programa_dentro(carpeta: Path | None = None) -> str | None:
    """Ruta relativa del kit dentro del espacio (la instalación normal: `~/YTCreator/programa`) o None si está fuera de él
    (o si el espacio es el propio kit). Lo que recorre el espacio entero (git, copia de seguridad) se la salta."""
    carpeta = Path(carpeta or ESPACIO).resolve()
    if KIT == carpeta or not KIT.is_relative_to(carpeta):
        return None
    return KIT.relative_to(carpeta).as_posix()


def elegir(ruta) -> Path:
    """Recuerda `ruta` como el espacio de trabajo (en `.espacio`, junto al kit) y lo prepara. Devuelve la ruta absoluta."""
    destino = Path(ruta).expanduser().resolve()
    if destino != KIT and destino.is_relative_to(KIT):
        raise ValueError("El espacio no puede estar dentro del kit.")
    RECUERDO.write_text(str(destino) + "\n", encoding="utf-8")
    return destino


def estado() -> dict:
    """Qué hay y qué falta en el espacio: rutas, enlaces rotos y carpetas ausentes."""
    faltan = [] if es_kit() else [n for n in ENLACES if not (ESPACIO / n).exists()]
    return {"kit": str(KIT), "espacio": str(ESPACIO), "separado": not es_kit(), "enlaces_que_faltan": faltan,
            "carpetas_que_faltan": [c for c in CARPETAS if not (ESPACIO / c).is_dir()],
            "env": ENV.exists()}


def preparar() -> list[str]:
    """Crea las carpetas propias, los enlaces al kit y el .gitignore. No pisa nada que ya exista. Devuelve lo hecho."""
    hecho = []
    ESPACIO.mkdir(parents=True, exist_ok=True)
    for c in CARPETAS:
        if not (ESPACIO / c).is_dir():
            (ESPACIO / c).mkdir(parents=True)
            hecho.append(f"carpeta {c}/")
    if not es_kit():
        for n in ENLACES:
            destino, origen = ESPACIO / n, KIT / n
            enlace = sistema.es_enlace(destino)
            if not origen.exists() or enlace and destino.resolve() == origen.resolve():
                continue
            if destino.exists() or enlace:
                if enlace:                                    # un enlace roto o a otro sitio: se rehace
                    destino.unlink() if destino.is_symlink() else destino.rmdir()   # rmdir quita la unión, no su contenido
                elif sistema.WINDOWS and destino.is_file() and origen.is_file():  # en Windows sin permiso de enlace, un archivo es una copia
                    if destino.read_bytes() != origen.read_bytes():
                        shutil.copy2(origen, destino)
                        hecho.append(f"copia {n} ← {origen} (actualizada)")
                    continue
                else:
                    hecho.append(f"AVISO: {n} ya existe y no es un enlace; no se toca")
                    continue
            sistema.enlazar(destino, origen)
            hecho.append(f"enlace {n} → {origen}")
        ignorar = ESPACIO / ".gitignore"
        if not ignorar.exists():
            ignorar.write_text(GITIGNORE, encoding="utf-8")
            hecho.append(".gitignore")
        programa = programa_dentro()
        if programa and f"/{programa}/" not in ignorar.read_text(encoding="utf-8").splitlines():
            with ignorar.open("a", encoding="utf-8") as f:     # el programa tiene su propio repositorio
                f.write(f"\n# El programa (YTCreator), con su propio repositorio\n/{programa}/\n")
            hecho.append(f".gitignore: /{programa}/")
    return hecho


# --- migrar ---------------------------------------------------------------------------------------------------------

#: Lo que se copia del origen (kit) al espacio: (nombre, es un fichero suelto).
MIGRAR = (("canales", False), ("analisis", False), ("data", False), (".env", True), ("canal_activo", True))
#: De `data/`, lo que no se copia a mano: la base de datos se copia con la API de SQLite (consistente aunque la UI esté abierta).
BD = "canalyt.db"


def _ficheros(base: Path) -> dict[str, int]:
    """Ruta relativa → tamaño de todos los ficheros bajo `base` (un fichero suelto cuenta como él mismo)."""
    if base.is_file():
        return {".": base.stat().st_size}
    return {str(p.relative_to(base)): p.stat().st_size for p in base.rglob("*") if p.is_file() and not p.is_symlink()}


def plan(origen: Path) -> list[dict]:
    """Qué se copiaría: nombre, ficheros y bytes de cada parte que exista en el origen."""
    res = []
    for nombre, _ in MIGRAR:
        ruta = origen / nombre
        if not ruta.exists():
            continue
        f = {k: v for k, v in _ficheros(ruta).items() if not (nombre == "data" and k.startswith(BD))}
        res.append({"nombre": nombre, "ficheros": len(f), "bytes": sum(f.values())})
    if (origen / "data" / BD).exists():
        res.append({"nombre": f"data/{BD}", "ficheros": 1, "bytes": (origen / "data" / BD).stat().st_size})
    return res


def _reescribir_rutas(bd: Path, origen: Path, destino: Path) -> int:
    """En la copia de la base de datos, las rutas de canales/, data/ y analisis/ de las tareas viejas apuntan al espacio nuevo
    (las del código, `herramientas/` y `.venv`, siguen en el kit). Devuelve las filas tocadas."""
    con = sqlite3.connect(bd)
    tocadas = 0
    try:
        for c in ("comando", "log"):
            for sub in ("canales", "analisis", "data"):
                viejo, nuevo = f"{origen}/{sub}", f"{destino}/{sub}"
                cur = con.execute(f"UPDATE tarea SET {c} = replace({c}, ?, ?) WHERE {c} LIKE ?", (viejo, nuevo, f"%{viejo}%"))
                tocadas += cur.rowcount
        con.commit()
    except sqlite3.Error:
        pass                                    # una base sin tabla `tarea` (o distinta) no impide migrar
    finally:
        con.close()
    return tocadas


def migrar(origen: Path, destino: Path) -> dict:
    """Copia lo propio del origen al destino y lo verifica. No borra ni modifica el origen. Sale con ValueError si no es seguro."""
    origen, destino = Path(origen).resolve(), Path(destino).resolve()
    if origen == destino:
        raise ValueError("El origen y el destino son la misma carpeta: apunta CANALYT_ESPACIO a una carpeta nueva.")
    if destino.is_relative_to(origen) or origen.is_relative_to(destino):
        raise ValueError("El espacio no puede estar dentro del kit (ni el kit dentro del espacio).")
    if (destino / "canales").is_dir() and any((destino / "canales").iterdir()):
        raise ValueError(f"{destino}/canales ya tiene contenido: no se mezcla. Elige una carpeta vacía.")
    destino.mkdir(parents=True, exist_ok=True)
    for nombre, suelto in MIGRAR:
        ruta, salida = origen / nombre, destino / nombre
        if not ruta.exists():
            continue
        if suelto:
            shutil.copy2(ruta, salida)
        else:
            shutil.copytree(ruta, salida, symlinks=True, dirs_exist_ok=True,
                            ignore=(lambda d, nombres, nombre=nombre, ruta=ruta:
                                    [n for n in nombres if n.startswith(BD)] if nombre == "data" and Path(d) == ruta else []))
    if (destino / ".env").exists():
        (destino / ".env").chmod(0o600)
    tocadas = 0
    if (origen / "data" / BD).exists():
        (destino / "data").mkdir(exist_ok=True)
        with sqlite3.connect(f"file:{origen / 'data' / BD}?mode=ro", uri=True) as a, sqlite3.connect(destino / "data" / BD) as b:
            a.backup(b)                         # copia consistente aunque la UI esté escribiendo
        tocadas = _reescribir_rutas(destino / "data" / BD, origen, destino)
    return {"origen": str(origen), "destino": str(destino), "verificacion": verificar(origen, destino), "rutas_reescritas": tocadas}


def verificar(origen: Path, destino: Path) -> dict:
    """Compara lo copiado con el original: ficheros que faltan, tamaños distintos y la integridad de la base de datos."""
    faltan, distintos, total = [], [], 0
    for nombre, _ in MIGRAR:
        if not (origen / nombre).exists():
            continue
        a = {k: v for k, v in _ficheros(origen / nombre).items() if not (nombre == "data" and k.startswith(BD))}
        b = _ficheros(destino / nombre) if (destino / nombre).exists() else {}
        for k, v in a.items():
            total += 1
            if k not in b:
                faltan.append(f"{nombre}/{k}")
            elif b[k] != v:
                distintos.append(f"{nombre}/{k}")
    bd_ok = None
    if (origen / "data" / BD).exists():
        try:
            con = sqlite3.connect(destino / "data" / BD)
            bd_ok = con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            con.close()
        except sqlite3.Error:
            bd_ok = False
    return {"ficheros": total, "faltan": faltan, "distintos": distintos, "bd_ok": bd_ok,
            "ok": not faltan and not distintos and bd_ok in (None, True)}


def _mb(n):
    return f"{n / 1e6:,.0f} MB".replace(",", ".")


def main():
    orden = sys.argv[1] if len(sys.argv) > 1 else None
    if orden in ("-h", "--help"):
        print(__doc__)
        return
    if orden not in (None, "preparar", "elegir", "migrar"):
        sys.exit(f"ERROR: orden desconocida «{orden}» (preparar, elegir <carpeta>, migrar; sin nada, el estado). "
                 "Más en: espacio.py --help")
    if len(sys.argv) > 1 and sys.argv[1] == "preparar":
        for linea in preparar() or ["Nada que hacer: el espacio ya está preparado."]:
            print(linea)
        return
    if len(sys.argv) > 1 and sys.argv[1] == "elegir":
        if len(sys.argv) < 3:
            sys.exit("ERROR: falta la carpeta: espacio.py elegir <carpeta>")
        try:
            destino = elegir(sys.argv[2])
        except ValueError as e:
            sys.exit(f"ERROR: {e}")
        print(f"Espacio de trabajo: {destino}")
        os.environ["CANALYT_ESPACIO"] = str(destino)
        print("Reinicia la UI si estaba abierta. Si la carpeta es nueva: espacio.py preparar (con CANALYT_ESPACIO puesto) "
              "o migrar desde el kit.")
        return
    if len(sys.argv) > 1 and sys.argv[1] == "migrar":
        p = argparse.ArgumentParser(prog="espacio.py migrar")
        p.add_argument("orden")
        p.add_argument("--origen", default=str(KIT), help="Carpeta de la que copiar (por defecto, el kit)")
        p.add_argument("--simular", action="store_true", help="Solo cuenta lo que se copiaría")
        a = p.parse_args()
        origen = Path(a.origen).expanduser().resolve()
        print(f"Origen:  {origen}\nDestino: {ESPACIO}")
        partes = plan(origen)
        for x in partes:
            print(f"  {x['nombre']}: {x['ficheros']} ficheros, {_mb(x['bytes'])}")
        print(f"  Total: {_mb(sum(x['bytes'] for x in partes))}")
        if a.simular:
            print("(simulación: no se ha copiado nada)")
            return
        try:
            r = migrar(origen, ESPACIO)
        except ValueError as e:
            sys.exit(f"ERROR: {e}")
        v = r["verificacion"]
        print(f"Copiado. Verificación: {v['ficheros']} ficheros comparados, {len(v['faltan'])} faltan, "
              f"{len(v['distintos'])} con otro tamaño, base de datos {'íntegra' if v['bd_ok'] else 'SIN COMPROBAR' if v['bd_ok'] is None else 'DAÑADA'}; "
              f"{r['rutas_reescritas']} rutas de tareas antiguas reescritas.")
        for x in (v["faltan"] + v["distintos"])[:10]:
            print(f"  ! {x}")
        for linea in preparar():
            print(linea)
        sys.exit(0 if v["ok"] else 1)
    for k, v in estado().items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()

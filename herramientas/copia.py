"""Copia de seguridad del espacio de trabajo en una carpeta que elige el usuario (disco externo, iCloud Drive, Google Drive…).

Copia lo que no está en ninguna otra parte: imágenes, voces, música y vídeos de cada canal, `data/` (la base de datos de la UI,
ajustes, papelera, chats) y el historial git del espacio. **No copia `.env`** (las claves se vuelven a pegar en Ajustes) ni los
enlaces al kit ni el programa (si vive dentro del espacio, en `programa/`), ni lo que se rehace solo (`data/logs`, `data/miniaturas`, `data/picos`).

    .venv/bin/python herramientas/copia.py                      # destino elegido y fecha de la última copia
    .venv/bin/python herramientas/copia.py destino /Volumes/Disco   # recuerda dónde copiar (data/ajustes.json → copia.destino)
    .venv/bin/python herramientas/copia.py hacer                # copia ahora (incremental) y lo comprueba
    .venv/bin/python herramientas/copia.py restaurar ~/YTCreator2 [--desde /Volumes/Disco/YTCreator-copia]

- La copia queda en `<destino>/<nombre del espacio>-copia/`. La carpeta elegida tiene que existir: si no está (disco sin
  conectar), se para sin crear nada.
- Incremental: solo copia lo nuevo o lo que ha cambiado (tamaño o fecha). Lo que se sustituye o se ha borrado del espacio no se
  pierde: pasa a `_anteriores/<fecha>/` dentro de la copia y se borra a los 30 días.
- La base de datos se copia con la copia en caliente de SQLite (vale con la UI abierta) y se comprueba su integridad.
- Al acabar compara lo copiado (que esté todo y con su tamaño) y apunta el resultado en `copia.json` (en la copia) y en
  `data/copia.json` (en el espacio: así la UI avisa si pasan más de 7 días aunque el disco no esté conectado).
- `restaurar` copia la copia a una carpeta NUEVA o vacía (nunca encima del espacio); luego `espacio.py elegir` y `preparar`.
"""

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402
import espacio  # noqa: E402

BD = "data/canalyt.db"
#: Lo que no se copia (rutas relativas al espacio): las claves y lo que se rehace solo.
FUERA = {".env", "data/logs", "data/miniaturas", "data/picos", "data/copia.json",
         BD, BD + "-wal", BD + "-shm", BD + "-journal"}
BASURA = {".DS_Store", "Thumbs.db"}
ANTERIORES = "_anteriores"
REGISTRO = "copia.json"
DIAS_ANTERIORES = 30
DIAS_AVISO = 7
MARGEN = 200 * 1024 * 1024          # espacio libre que se deja de sobra en el destino


class ErrorCopia(ValueError):
    """La copia no se puede hacer (destino que no está, sin sitio…). No se ha tocado nada del espacio."""


def _estado_espacio() -> Path:
    return espacio.DATOS / REGISTRO


def _ajustes() -> Path:
    return Path(os.environ.get("CANALYT_AJUSTES") or espacio.AJUSTES)      # la variable: pruebas sin tocar los reales


def destino_guardado() -> str:
    try:
        return (archivos.leer_json(_ajustes()).get("copia") or {}).get("destino") or ""
    except (archivos.ArchivoDanado, AttributeError):
        return ""


def _dentro(a: Path, b: Path) -> bool:
    return a == b or b in a.parents


def validar_destino(carpeta: str | Path) -> Path:
    """La carpeta elegida, resuelta. Tiene que existir y no estar dentro del espacio ni del kit."""
    if not str(carpeta).strip():
        raise ErrorCopia("Falta la carpeta donde guardar la copia (Ajustes → Este equipo).")
    d = Path(carpeta).expanduser()
    if not d.is_absolute():
        raise ErrorCopia(f"La carpeta tiene que ser una ruta completa (empieza por / o ~): {carpeta}")
    d = d.resolve()
    if not d.is_dir():
        raise ErrorCopia(f"No encuentro la carpeta {d}. Si es un disco externo, ¿está conectado?")
    for nombre, raiz in (("del espacio de trabajo", espacio.ESPACIO), ("del kit", espacio.KIT)):
        if _dentro(d, raiz.resolve()):
            raise ErrorCopia(f"La copia no puede ir dentro {nombre} ({raiz}): elige otra carpeta, mejor en otro disco.")
    if not os.access(d, os.W_OK):
        raise ErrorCopia(f"No se puede escribir en {d}.")
    return d


def guardar_destino(carpeta: str) -> Path:
    d = validar_destino(carpeta)
    ajustes = archivos.leer_json(_ajustes())
    ajustes = ajustes if isinstance(ajustes, dict) else {}
    ajustes["copia"] = {**(ajustes.get("copia") or {}), "destino": str(d)}
    archivos.escribir_json(_ajustes(), ajustes, final_linea=False)
    return d


def raiz_copia(destino: Path, origen: Path | None = None) -> Path:
    return destino / f"{(origen or espacio.ESPACIO).name}-copia"


def ultima() -> dict | None:
    try:
        d = archivos.leer_json(_estado_espacio())
    except archivos.ArchivoDanado:
        return None
    return d if isinstance(d, dict) and d.get("fecha") else None


def estado(ahora: datetime | None = None, destino: str | None = None) -> dict:
    """Lo que enseña la UI: destino, si está conectado, la última copia y si toca avisar (nunca o hace más de 7 días)."""
    ahora = ahora or datetime.now()
    destino = destino_guardado() if destino is None else destino
    u = ultima()
    dias = None
    if u:
        try:
            dias = (ahora - datetime.fromisoformat(u["fecha"])).days
        except ValueError:
            pass
    return {"destino": destino, "conectado": bool(destino) and Path(destino).is_dir(), "ultima": u, "dias": dias,
            "aviso": dias is None or dias >= DIAS_AVISO, "dias_aviso": DIAS_AVISO, "dias_anteriores": DIAS_ANTERIORES}


def _fuera(rel: str) -> bool:
    return any(rel == f or rel.startswith(f + "/") for f in FUERA)


def _fuera_de(origen: Path):
    """Lo que no se copia de `origen`: lo de FUERA y, si el programa vive dentro del espacio, el programa (se vuelve a descargar)."""
    programa = espacio.programa_dentro(origen)
    return lambda rel: _fuera(rel) or rel == programa


def _ficheros(base: Path, saltar=_fuera) -> dict[str, os.stat_result]:
    """Ruta relativa → stat de cada fichero de `base`, sin enlaces simbólicos (los enlaces al kit no son del espacio)."""
    res = {}
    for carpeta, subcarpetas, nombres in os.walk(base):
        c = Path(carpeta)
        rel_c = c.relative_to(base).as_posix()
        rel_c = "" if rel_c == "." else rel_c + "/"
        subcarpetas[:] = [n for n in subcarpetas if not (c / n).is_symlink() and not saltar(rel_c + n)]
        for n in nombres:
            p = c / n
            if n in BASURA or p.is_symlink() or saltar(rel_c + n):
                continue
            try:
                res[rel_c + n] = p.stat()
            except OSError:
                continue              # borrado mientras se recorría
    return res


def _igual(a: os.stat_result, b: os.stat_result) -> bool:
    return a.st_size == b.st_size and abs(a.st_mtime - b.st_mtime) <= 2      # 2 s: discos FAT/exFAT


def _hash(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(1 << 20), b""):
            h.update(trozo)
    return h.hexdigest()


def _bd_integra(ruta: Path) -> bool:
    try:
        with sqlite3.connect(f"file:{ruta}?mode=ro", uri=True) as c:
            return c.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    except sqlite3.Error:
        return False


def _retirar(raiz: Path, rel: str, sello: str):
    """Lleva la versión de la copia a _anteriores/<sello>/ (se sustituye o ya no está en el espacio)."""
    viejo = raiz / rel
    nuevo = raiz / ANTERIORES / sello / rel
    nuevo.parent.mkdir(parents=True, exist_ok=True)
    os.replace(viejo, nuevo)


def _copiar(origen: Path, destino: Path):
    destino.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporal = tempfile.mkstemp(dir=destino.parent, prefix=f".{destino.name}.", suffix=".copia")
    os.close(descriptor)
    try:
        shutil.copy2(origen, temporal)
        os.replace(temporal, destino)
    except BaseException:
        Path(temporal).unlink(missing_ok=True)
        raise


def _purgar(raiz: Path, ahora: datetime) -> list[str]:
    borradas = []
    carpeta = raiz / ANTERIORES
    if not carpeta.is_dir():
        return borradas
    for c in sorted(carpeta.iterdir()):
        try:
            fecha = datetime.strptime(c.name, "%Y-%m-%d_%H%M%S")
        except ValueError:
            continue                  # algo que no ha puesto la copia: no se toca
        if ahora - fecha > timedelta(days=DIAS_ANTERIORES):
            shutil.rmtree(c)
            borradas.append(c.name)
    return borradas


def _vaciar_carpetas(raiz: Path):
    for carpeta, _, _ in sorted(os.walk(raiz), key=lambda t: -len(t[0])):
        c = Path(carpeta)
        if c != raiz and ANTERIORES not in c.relative_to(raiz).parts and not any(c.iterdir()):
            c.rmdir()


def _mb(n: int) -> str:
    return f"{n / 1024 / 1024:,.1f} MB".replace(",", ".")


def hacer(destino: str | Path | None = None, origen: Path | None = None, ahora: datetime | None = None) -> dict:
    origen = (origen or espacio.ESPACIO).resolve()
    ahora = ahora or datetime.now()
    d = validar_destino(destino if destino is not None else destino_guardado())
    raiz = raiz_copia(d, origen)
    if raiz.exists() and any(raiz.iterdir()) and not (raiz / REGISTRO).exists():
        raise ErrorCopia(f"{raiz} ya existe y no es una copia del kit: no la toco. Elige otra carpeta o vacíala.")
    sello = ahora.strftime("%Y-%m-%d_%H%M%S")
    canal.progreso(etapa="Buscando lo que ha cambiado")
    fuentes = _ficheros(origen, saltar=_fuera_de(origen))
    actuales = _ficheros(raiz, saltar=lambda rel: rel in (ANTERIORES, REGISTRO, ".trabajo"))
    copiar = [rel for rel, st in fuentes.items() if rel not in actuales or not _igual(st, actuales[rel])]
    sobran = [rel for rel in actuales if rel not in fuentes and rel != BD]

    # La base de datos, en caliente (la UI puede estar abierta) a un temporal de la copia; solo se cambia si es distinta.
    trabajo = raiz / ".trabajo"
    bd_nueva = None
    if (origen / BD).exists():
        trabajo.mkdir(parents=True, exist_ok=True)
        bd_nueva = trabajo / "canalyt.db"
        bd_nueva.unlink(missing_ok=True)
        canal.progreso(etapa="Copiando la base de datos")
        with sqlite3.connect(f"file:{origen / BD}?mode=ro", uri=True) as a, sqlite3.connect(bd_nueva) as b:
            a.backup(b)
        if not _bd_integra(bd_nueva):
            raise ErrorCopia("La base de datos de la UI no ha pasado la comprobación de integridad: no se ha copiado nada.")
        if (raiz / BD).exists() and _hash(raiz / BD) == _hash(bd_nueva):
            bd_nueva.unlink()
            bd_nueva = None

    falta = sum(fuentes[rel].st_size for rel in copiar) + (bd_nueva.stat().st_size if bd_nueva else 0)
    libre = shutil.disk_usage(d).free
    if falta + MARGEN > libre:
        shutil.rmtree(trabajo, ignore_errors=True)
        raise ErrorCopia(f"No cabe: hay que copiar {_mb(falta)} y en {d} quedan {_mb(libre)} libres.")

    raiz.mkdir(exist_ok=True)
    for i, rel in enumerate(copiar, 1):
        if i == 1 or i % 20 == 0 or i == len(copiar):
            canal.progreso(i, len(copiar), "Copiando archivos")
        if (raiz / rel).exists():
            _retirar(raiz, rel, sello)
        try:
            _copiar(origen / rel, raiz / rel)
        except FileNotFoundError:
            continue                  # se borró del espacio mientras se copiaba: queda para la siguiente
    bd_retirada = False
    if bd_nueva:
        if (raiz / BD).exists():
            _retirar(raiz, BD, sello)
            bd_retirada = True
        (raiz / BD).parent.mkdir(parents=True, exist_ok=True)
        os.replace(bd_nueva, raiz / BD)
    for rel in sobran:
        _retirar(raiz, rel, sello)
    shutil.rmtree(trabajo, ignore_errors=True)
    _vaciar_carpetas(raiz)
    purgadas = _purgar(raiz, ahora)

    canal.progreso(etapa="Comprobando la copia")
    copiados = _ficheros(raiz, saltar=lambda rel: rel in (ANTERIORES, REGISTRO))
    faltan = sorted(rel for rel in fuentes if rel not in copiados and (origen / rel).exists())
    distintos = sorted(rel for rel in fuentes if rel in copiados and copiados[rel].st_size != fuentes[rel].st_size
                       and (origen / rel).exists() and (origen / rel).stat().st_size == fuentes[rel].st_size)
    bd_ok = _bd_integra(raiz / BD) if (origen / BD).exists() else None
    r = {
        "fecha": ahora.isoformat(timespec="seconds"),
        "destino": str(d),
        "raiz": str(raiz),
        "ficheros": len(fuentes) + (1 if bd_ok is not None else 0),
        "bytes": sum(st.st_size for st in fuentes.values()) + ((raiz / BD).stat().st_size if bd_ok is not None else 0),
        "copiados": len(copiar) + (1 if bd_nueva else 0),
        "retirados": len(sobran) + bd_retirada + len([rel for rel in copiar if (raiz / ANTERIORES / sello / rel).exists()]),
        "anteriores_borradas": purgadas,
        "faltan": faltan[:50],
        "distintos": distintos[:50],
        "bd_ok": bd_ok,
        "ok": not faltan and not distintos and bd_ok is not False,
    }
    archivos.escribir_json(raiz / REGISTRO, {**r, "espacio": str(origen)})
    archivos.escribir_json(origen / "data" / REGISTRO, r)
    return r


def restaurar(nueva: str | Path, desde: str | Path | None = None) -> dict:
    """Copia la copia (sin `_anteriores`) a una carpeta nueva o vacía. No toca el espacio actual."""
    if desde:
        raiz = Path(desde).expanduser().resolve()
    else:
        raiz = raiz_copia(validar_destino(destino_guardado()))
    if not (raiz / REGISTRO).is_file():
        raise ErrorCopia(f"{raiz} no es una copia del kit (no tiene {REGISTRO}).")
    destino = Path(nueva).expanduser().resolve()
    if destino.exists() and (not destino.is_dir() or any(destino.iterdir())):
        raise ErrorCopia(f"{destino} ya existe y no está vacía: restaura en una carpeta nueva (nunca encima de nada).")
    fuentes = _ficheros(raiz, saltar=lambda rel: rel in (ANTERIORES, REGISTRO, ".trabajo"))
    destino.mkdir(parents=True, exist_ok=True)
    for i, rel in enumerate(sorted(fuentes), 1):
        if i == 1 or i % 20 == 0 or i == len(fuentes):
            canal.progreso(i, len(fuentes), "Restaurando")
        (destino / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(raiz / rel, destino / rel)
    faltan = [rel for rel, st in fuentes.items() if not (destino / rel).is_file() or (destino / rel).stat().st_size != st.st_size]
    bd_ok = _bd_integra(destino / BD) if (destino / BD).exists() else None
    viejo = archivos.leer_json(raiz / REGISTRO).get("espacio")
    if bd_ok and viejo and viejo != str(destino):
        espacio._reescribir_rutas(destino / BD, Path(viejo), destino)      # las tareas viejas, al espacio restaurado
    return {"desde": str(raiz), "destino": str(destino), "ficheros": len(fuentes), "faltan": faltan[:50], "bd_ok": bd_ok,
            "ok": not faltan and bd_ok is not False}


def main():
    p = argparse.ArgumentParser(prog="copia.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("orden", nargs="?", choices=("hacer", "destino", "restaurar"), help="Sin orden: el estado de la copia")
    p.add_argument("carpeta", nargs="?", help="destino: la carpeta donde guardar la copia; restaurar: la carpeta NUEVA")
    p.add_argument("--destino", help="hacer: copiar a esta carpeta (sin guardarla) en vez de la elegida")
    p.add_argument("--desde", help="restaurar: la carpeta de la copia (…-copia); por defecto, la del destino elegido")
    p.add_argument("--json", action="store_true", help="Resultado en JSON (para la UI)")
    a = p.parse_args()
    try:
        if a.orden == "destino":
            if not a.carpeta:
                raise ErrorCopia("Falta la carpeta: copia.py destino <carpeta>")
            d = guardar_destino(a.carpeta)
            print(json.dumps({"destino": str(d)}) if a.json else f"La copia se guardará en {raiz_copia(d)}")
            return
        if a.orden == "hacer":
            r = hacer(a.destino)
            if a.json:
                print(json.dumps(r, ensure_ascii=False))
            else:
                print(f"Copia en {r['raiz']}: {r['ficheros']} archivos ({_mb(r['bytes'])}), {r['copiados']} copiados ahora, "
                      f"{r['retirados']} versiones anteriores guardadas {DIAS_ANTERIORES} días en {ANTERIORES}/.")
                print("Comprobación: " + ("todo copiado" if r["ok"] else f"{len(r['faltan'])} faltan, "
                                          f"{len(r['distintos'])} con otro tamaño") +
                      (", base de datos íntegra" if r["bd_ok"] else ", BASE DE DATOS DAÑADA" if r["bd_ok"] is False else "") + ".")
                for x in (r["faltan"] + r["distintos"])[:10]:
                    print(f"  ! {x}")
                print("Las claves (.env) no se copian: si restauras, vuelve a pegarlas en Ajustes.")
            if not r["ok"]:
                raise ErrorCopia("La copia no ha quedado completa: repítela (lo ya copiado no se vuelve a copiar).")
            return
        if a.orden == "restaurar":
            if not a.carpeta:
                raise ErrorCopia("Falta la carpeta nueva: copia.py restaurar <carpeta>")
            r = restaurar(a.carpeta, a.desde)
            if a.json:
                print(json.dumps(r, ensure_ascii=False))
            else:
                print(f"Restaurados {r['ficheros']} archivos en {r['destino']}.")
                print(f"Para usarlo: .venv/bin/python herramientas/espacio.py elegir {r['destino']} y después "
                      "espacio.py preparar (con CANALYT_ESPACIO puesto). Luego pega las claves en Ajustes.")
            if not r["ok"]:
                raise ErrorCopia(f"Restauración incompleta: {len(r['faltan'])} archivos no han quedado bien.")
            return
        e = estado()
        if a.json:
            print(json.dumps(e, ensure_ascii=False))
            return
        print(f"Destino: {e['destino'] or '(sin elegir: copia.py destino <carpeta>)'}"
              + ("" if not e["destino"] or e["conectado"] else " (no está: ¿disco sin conectar?)"))
        u = e["ultima"]
        print(f"Última copia: {u['fecha']} ({e['dias']} días), {u['ficheros']} archivos, {_mb(u['bytes'])}, "
              f"{'bien' if u.get('ok') else 'INCOMPLETA'}" if u else "Última copia: nunca")
    except (ErrorCopia, archivos.ArchivoDanado, OSError, sqlite3.Error) as e:
        sys.exit(f"ERROR: {e}")


if __name__ == "__main__":
    main()

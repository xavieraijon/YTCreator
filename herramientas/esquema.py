"""Versión de esquema de los JSON de cada vídeo (guion.json y estado.json) y su migración.

Cada archivo lleva `"version_esquema": N`; sin el campo es la versión 0 (todo lo creado antes del 07/10/2026). Al leer,
`migrar` aplica en memoria, en orden, las migraciones que falten hasta la versión actual; la app sella la versión al
escribir (`sellar`), sin rebajarla nunca. Un archivo de una versión MÁS NUEVA que la de este kit (p. ej. una carpeta
copiada de otra instalación más actualizada) no se toca: `migrar` lo devuelve igual y `aviso` lo explica.

Para cambiar el formato: sube VERSIONES[tipo], añade la función `_<tipo>_<n>_a_<n+1>` a MIGRACIONES y un test en
ui/backend/tests/test_esquema.py. Una migración recibe una copia y devuelve el dict nuevo; no lee ni escribe archivos.

Uso:
    .venv/bin/python herramientas/esquema.py               # qué versión tiene cada guion.json y estado.json del espacio
    .venv/bin/python herramientas/esquema.py actualizar    # los migra y sella en disco (escritura atómica)
"""

import copy
import json
import sys
from pathlib import Path

CAMPO = "version_esquema"
ARCHIVOS = {"guion": "guion.json", "estado": "estado.json"}


# --- Migraciones ------------------------------------------------------------------------------------------------------

def _estado_0_a_1(e: dict) -> dict:
    """Versión base: las listas y diccionarios que la app y los comandos dan por supuestos."""
    for campo in ("completadas", "pasos_hechos", "cambios_pedidos", "historial_fases"):
        if not isinstance(e.get(campo), list):
            e[campo] = list(e[campo]) if isinstance(e.get(campo), (tuple, set)) else []
    if not isinstance(e.get("aprobaciones"), dict):
        e["aprobaciones"] = {}
    return e


def _guion_0_a_1(g: dict) -> dict:
    """Versión base: `escenas` siempre es una lista."""
    if not isinstance(g.get("escenas"), list):
        g["escenas"] = []
    return g


VERSIONES = {"guion": 1, "estado": 1}
MIGRACIONES = {"guion": {0: _guion_0_a_1}, "estado": {0: _estado_0_a_1}}


# --- API ----------------------------------------------------------------------------------------------------------------

def version(datos: dict) -> int:
    v = datos.get(CAMPO, 0) if isinstance(datos, dict) else 0
    return v if isinstance(v, int) and v >= 0 else 0


def migrar(tipo: str, datos: dict | None) -> dict:
    """El dict en la versión actual (una copia si hay que cambiar algo). Uno de una versión más nueva, igual."""
    datos = datos if isinstance(datos, dict) else {}
    v, actual = version(datos), VERSIONES[tipo]
    if v >= actual:
        return datos
    nuevo = copy.deepcopy(datos)
    while v < actual:
        nuevo = MIGRACIONES[tipo][v](nuevo)
        v += 1
    nuevo[CAMPO] = actual
    return nuevo


def sellar(tipo: str, datos: dict) -> dict:
    """Antes de escribir: migra y deja la versión (nunca rebaja la de un archivo más nuevo)."""
    datos = migrar(tipo, datos)
    datos[CAMPO] = max(version(datos), VERSIONES[tipo])
    return datos


def aviso(tipo: str, datos: dict | None) -> str | None:
    """Texto para el usuario si el archivo es de una versión más nueva de YTCreator; None si no."""
    if isinstance(datos, dict) and version(datos) > VERSIONES[tipo]:
        que = "su guion" if tipo == "guion" else "su estado"
        return (f"Este vídeo se guardó con una versión más nueva de YTCreator ({que} tiene el formato {version(datos)}; "
                f"este programa entiende hasta el {VERSIONES[tipo]}). Actualiza YTCreator antes de seguir: con esta "
                "versión algunas cosas pueden no verse bien.")
    return None


# --- Línea de órdenes ---------------------------------------------------------------------------------------------------

def _archivos(canales: Path):
    for tipo, nombre in ARCHIVOS.items():
        for ruta in sorted(canales.glob(f"**/videos/*/{nombre}")):
            yield tipo, ruta


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import argparse
    import espacio
    import archivos
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("orden", nargs="?", choices=["actualizar"], help="actualizar: migrarlos en disco")
    actualizar = p.parse_args().orden == "actualizar"
    canales = espacio.ESPACIO / "canales"
    cuenta = {"al_dia": 0, "migrados": 0, "mas_nuevos": 0, "ilegibles": 0}
    for tipo, ruta in _archivos(canales):
        rel = ruta.relative_to(espacio.ESPACIO)
        try:
            datos = json.loads(ruta.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            cuenta["ilegibles"] += 1
            print(f"  ILEGIBLE {rel}: {e}")
            continue
        v = version(datos)
        if v > VERSIONES[tipo]:
            cuenta["mas_nuevos"] += 1
            print(f"  MÁS NUEVO {rel}: formato {v} (este kit entiende hasta el {VERSIONES[tipo]}); no se toca")
        elif v == VERSIONES[tipo]:
            cuenta["al_dia"] += 1
        else:
            cuenta["migrados"] += 1
            print(f"  {'migrado' if actualizar else 'por migrar'} {rel}: {v} → {VERSIONES[tipo]}")
            if actualizar:
                archivos.escribir_json(ruta, sellar(tipo, datos))
    print(f"{cuenta['al_dia']} al día · {cuenta['migrados']} {'migrados' if actualizar else 'por migrar'} · "
          f"{cuenta['mas_nuevos']} de una versión más nueva · {cuenta['ilegibles']} ilegibles")
    if cuenta["migrados"] and not actualizar:
        print("Para migrarlos en disco: .venv/bin/python herramientas/esquema.py actualizar")


if __name__ == "__main__":
    main()

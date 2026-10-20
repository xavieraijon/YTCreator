"""Bucle de mejora del guion: compara el guion tal como lo entregó Claude (guion_generado.json, copia que se
guarda al presentarlo para su aprobación) con el guion final (guion.json, el que se locutó) y enseña, escena
a escena, qué cambió el usuario. El agente guionista lo convierte después en reglas (aprendizajes.md).

Uso:
    .venv/bin/python herramientas/comparar_guion.py videos/002-tema            # carpeta del vídeo
    .venv/bin/python herramientas/comparar_guion.py generado.json final.json   # dos guiones cualesquiera

Solo compara el texto que se oye (sin marcas {img}, {pausa}, efectos) y los campos de publicación (título,
títulos, miniaturas); las imágenes y los prompts no cuentan. Sin coste: no usa ningún servicio.
"""

import argparse
import difflib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal  # noqa: E402

MARCAS = re.compile(r"\{[^}]*\}")


def texto(escena):
    return re.sub(r"\s+", " ", MARCAS.sub(" ", escena.get("texto", ""))).strip()


def diferencias(antes, despues):
    """Diferencias por palabras: [-quitado-] {+añadido+}. Devuelve '' si no hay cambios."""
    a, b = antes.split(), despues.split()
    trozos, hay = [], False
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal":
            trozos.append(" ".join(a[i1:i2]))
            continue
        hay = True
        if i2 > i1:
            trozos.append("[-" + " ".join(a[i1:i2]) + "-]")
        if j2 > j1:
            trozos.append("{+" + " ".join(b[j1:j2]) + "+}")
    return " ".join(trozos) if hay else ""


def comparar(generado, final):
    lineas, cambios = [], 0
    ea, eb = generado.get("escenas", []), final.get("escenas", [])
    palabras_a = sum(len(texto(e).split()) for e in ea)
    palabras_b = sum(len(texto(e).split()) for e in eb)
    lineas.append(f"Escenas: {len(ea)} → {len(eb)} · palabras habladas: {palabras_a} → {palabras_b}")
    for campo in ("titulo", "titulos", "miniaturas"):
        va, vb = generado.get(campo), final.get(campo)
        if va != vb:
            cambios += 1
            lineas.append(f"\n## {campo}\n- antes: {json.dumps(va, ensure_ascii=False)}\n"
                          f"- ahora: {json.dumps(vb, ensure_ascii=False)}")
    # Emparejar escenas por su texto (el usuario puede quitar, añadir o mover escenas).
    ta, tb = [texto(e) for e in ea], [texto(e) for e in eb]
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ta, tb, autojunk=False).get_opcodes():
        if op == "equal":
            continue
        if op == "replace" and i2 - i1 == j2 - j1:
            for k in range(i2 - i1):
                d = diferencias(ta[i1 + k], tb[j1 + k])
                if d:
                    cambios += 1
                    lineas.append(f"\n## Escena {j1 + k + 1} (antes {i1 + k + 1})\n{d}")
            continue
        for k in range(i1, i2):
            cambios += 1
            lineas.append(f"\n## Escena quitada (antes {k + 1})\n[-{ta[k]}-]")
        for k in range(j1, j2):
            cambios += 1
            lineas.append(f"\n## Escena nueva ({k + 1})\n{{+{tb[k]}+}}")
    lineas.append(f"\n{cambios} cambios." if cambios else "\nSin cambios: el guion final es el que se entregó.")
    return "\n".join(lineas)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("rutas", nargs="+", help="carpeta del vídeo, o guion_generado.json y guion.json")
    args = ap.parse_args()
    if len(args.rutas) == 1:
        carpeta = canal.ruta(args.rutas[0])
        rutas = [carpeta / "guion_generado.json", carpeta / "guion.json"]
    elif len(args.rutas) == 2:
        rutas = [canal.ruta(r) for r in args.rutas]
    else:
        ap.error("una carpeta o dos guiones")
    for r in rutas:
        if not r.exists():
            sys.exit(f"ERROR: no existe {r}" + (" (se guarda al presentar el guion para su aprobación: "
                                         "fase D de /nuevo-video)" if r.name == "guion_generado.json" else ""))
    generado, final = (canal.leer_guion(r)[1] for r in rutas)
    print(comparar(generado, final))


if __name__ == "__main__":
    main()

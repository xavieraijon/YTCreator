"""Prueba rápida del kit completo: revisar el guion, montar (voz, subtítulos, audio, vídeo, pantalla
final, Short vertical con gancho, miniatura y publicación), hoja de control y boceto; y un Short
independiente (/nuevo-short: vertical, sin pantalla final, publicación para Shorts/TikTok/Reels).

Uso (tras cualquier cambio en las herramientas):
    .venv/bin/python herramientas/probar_kit.py

Usa el guion de herramientas/prueba/ con imágenes ya existentes (no gasta cuota de imágenes) y trabaja
en <canal>/videos/_pruebas/kit/ (fuera de Git). Gasta ≈ 400 caracteres de voz de Azure la primera vez (después,
la voz se reutiliza si el texto no cambia). Tarda ≈ 1-2 minutos.
La voz se FUERZA a la gratuita de Azure (canal.json → voces.azure): la del canal puede ser de pago
(ai33) y una prueba nunca debe gastar créditos (el 2026-09-27 se gastaron 721 por no forzarla).
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PY = sys.executable
sys.path.insert(0, str(RAIZ / "herramientas"))
import canal  # noqa: E402

# Guiones de prueba del kit; se montan con la configuración del canal activo, en su carpeta de pruebas.
ORIGEN = RAIZ / "herramientas" / "prueba" / "guion.json"
CARPETA = canal.carpeta() / "videos" / "_pruebas" / "kit"
ORIGEN_SHORT = RAIZ / "herramientas" / "prueba" / "short.json"
CARPETA_SHORT = canal.carpeta() / "videos" / "_pruebas" / "kit_short"

VOZ_GRATIS = canal.get("voces", {}).get("azure", "es-ES-Marta:MAI-Voice-2")


def copiar_con_voz_gratis(origen, destino):
    """Copia un guion de prueba poniéndole la voz gratuita (nunca la de pago del canal)."""
    guion = json.loads(origen.read_text(encoding="utf-8"))
    guion["voz"] = VOZ_GRATIS
    destino.write_text(json.dumps(guion, ensure_ascii=False, indent=1), encoding="utf-8")


def paso(nombre, *args, permitir_fallo=False):
    inicio = time.time()
    r = subprocess.run([PY, *map(str, args)], cwd=canal.RAIZ, capture_output=True, text=True)
    estado = "OK" if r.returncode == 0 else ("AVISO" if permitir_fallo else "FALLO")
    print(f"[{estado}] {nombre} ({time.time() - inicio:.0f} s)")
    if r.returncode != 0 and not permitir_fallo:
        print(r.stdout[-2000:] + r.stderr[-2000:])
        sys.exit(1)
    return r.stdout


def duracion(archivo):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=width,height",
                        "-of", "json", str(archivo)], capture_output=True, text=True)
    d = json.loads(r.stdout)
    video = next(s for s in d["streams"] if "width" in s)
    return float(d["format"]["duration"]), video["width"], video["height"]


def main():
    # sin opciones: --help solo muestra la ayuda (antes se ignoraba y se ejecutaba todo)
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    CARPETA.mkdir(parents=True, exist_ok=True)
    guion = CARPETA / "guion.json"
    copiar_con_voz_gratis(ORIGEN, guion)
    print(paso("revisar_guion", "herramientas/revisar_guion.py", guion, permitir_fallo=True).strip())
    paso("montar (vídeo, Short, miniatura, publicación)", "herramientas/montar.py", guion)
    paso("fotogramas de control", "herramientas/fotogramas.py", guion)
    paso("entonación", "herramientas/entonacion.py", CARPETA)
    paso("boceto", "herramientas/montar.py", guion, "--boceto")

    errores = []
    esperados = ["final.mp4", "short_1.mp4", "miniatura_1.jpg", "subtitulos.srt", "publicacion.md",
                 "boceto.mp4", "tmp/control.png", "tmp/pantalla_final.png"]
    for nombre in esperados:
        if not (CARPETA / nombre).exists():
            errores.append(f"falta {nombre}")
    if not errores:
        dur, w, h = duracion(CARPETA / "final.mp4")
        linea = json.loads((CARPETA / "tmp" / "linea_tiempo.json").read_text(encoding="utf-8"))
        if abs(dur - linea["duracion"]) > 0.5:
            errores.append(f"final.mp4 dura {dur:.1f} s y la línea de tiempo {linea['duracion']:.1f} s")
        if (w, h) != (1920, 1080):
            errores.append(f"final.mp4 mide {w}x{h}")
        if linea["planos"][-1]["id"] != "final":
            errores.append("falta la pantalla final")
        dur_s, w, h = duracion(CARPETA / "short_1.mp4")
        if (w, h) != (1080, 1920) or not 15 <= dur_s <= 60:
            errores.append(f"short_1.mp4: {w}x{h}, {dur_s:.0f} s")
        pub = (CARPETA / "publicacion.md").read_text(encoding="utf-8")
        for texto in ("Probar y comparar", "#shorts", "0:00"):
            if texto not in pub:
                errores.append(f"publicacion.md no contiene «{texto}»")
        print(f"final.mp4: {dur:.1f} s · short_1.mp4: {dur_s:.1f} s")

    CARPETA_SHORT.mkdir(parents=True, exist_ok=True)
    guion_short = CARPETA_SHORT / "guion.json"
    copiar_con_voz_gratis(ORIGEN_SHORT, guion_short)
    # Clip animado sintético (horizontal y más corto que su tramo: prueba el encuadre y el congelado).
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24:duration=2",
                    "-pix_fmt", "yuv420p", str(CARPETA_SHORT / "clip_prueba.mp4")], check=True)
    paso("montar Short independiente", "herramientas/montar.py", guion_short)
    dur_i, w, h = duracion(CARPETA_SHORT / "final.mp4")
    linea = json.loads((CARPETA_SHORT / "tmp" / "linea_tiempo.json").read_text(encoding="utf-8"))
    if (w, h) != (1080, 1920):
        errores.append(f"Short independiente: {w}x{h}")
    if not any(p.get("video") for p in linea["planos"]):
        errores.append("el Short independiente no ha usado el clip de vídeo de prueba")
    if linea["planos"][-1]["id"] == "final":
        errores.append("el Short independiente no debe llevar pantalla final")
    if "TikTok" not in (CARPETA_SHORT / "publicacion.md").read_text(encoding="utf-8"):
        errores.append("publicacion.md del Short sin textos para TikTok/Reels")
    if "Titulo," not in (CARPETA_SHORT / "tmp" / "subtitulos.ass").read_text(encoding="utf-8").split("[Events]")[1]:
        errores.append("el Short independiente no lleva el título en pantalla")
    print(f"Short independiente: {dur_i:.1f} s")
    if errores:
        print("FALLO:\n  " + "\n  ".join(errores))
        sys.exit(1)
    print(f"OK: el kit funciona con el canal {canal.carpeta().name}. Resultados en {CARPETA.relative_to(canal.RAIZ)}")


if __name__ == "__main__":
    main()

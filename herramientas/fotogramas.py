"""Control de calidad: un fotograma de cada imagen del vídeo montado, en una hoja de contactos.

Uso:
    .venv/bin/python herramientas/fotogramas.py videos/001-pulpo/guion.json
    .venv/bin/python herramientas/fotogramas.py videos/001-pulpo/guion.json --video short_1.mp4

Lee tmp/linea_tiempo.json (lo escribe montar.py) y extrae el fotograma del centro de cada plano,
etiquetado con su id y su minuto. Salida: tmp/control.png. Avisa de planos de más de 8 s.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from montar import MAX_PLANO, RAIZ, hoja_de_contactos, tiempo_capitulo  # noqa: E402
import canal  # noqa: E402


def main():
    p = argparse.ArgumentParser(description="Hoja de fotogramas del vídeo montado")
    p.add_argument("guion", help="Ruta del guion.json")
    p.add_argument("--video", default="final.mp4", help="Vídeo de la carpeta del guion (por defecto final.mp4)")
    a = p.parse_args()
    carpeta = canal.leer_guion(a.guion)[0].parent
    video = carpeta / a.video
    if not video.exists():
        sys.exit(f"ERROR: no existe {video}: monta el vídeo antes")
    try:
        linea = json.loads((carpeta / "tmp" / "linea_tiempo.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        sys.exit("ERROR: falta tmp/linea_tiempo.json (lo deja montar.py): vuelve a montar el vídeo")
    if a.video != "final.mp4":
        sys.exit("ERROR: por ahora solo se revisa final.mp4 (los Shorts reutilizan sus mismas imágenes)")

    destino = carpeta / "tmp" / "control"
    destino.mkdir(parents=True, exist_ok=True)
    imagenes, etiquetas = [], []
    for k, plano in enumerate(linea["planos"]):
        canal.progreso(k, len(linea["planos"]), f"Plano {plano['id']}")
        t = (plano["inicio"] + plano["fin"]) / 2
        salida = destino / f"{plano['id']}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1",
                        "-vf", "scale=640:-1", str(salida)], check=True)
        imagenes.append(salida)
        dur = plano["fin"] - plano["inicio"]
        etiquetas.append(f"{plano['id']}  {tiempo_capitulo(t)}  {dur:.1f}s" + ("  ¡LARGO!" if dur > MAX_PLANO and plano["id"] != "final" else ""))
    hoja = hoja_de_contactos(imagenes, carpeta / "tmp" / "control.png", etiquetas, columnas=4, ancho=480)
    largos = [e for e in etiquetas if "LARGO" in e]
    print(f"OK: {hoja.relative_to(RAIZ)} ({len(imagenes)} planos)")
    if largos:
        print(f"Aviso: planos de más de {MAX_PLANO:.0f} s: " + "; ".join(largos))


if __name__ == "__main__":
    main()

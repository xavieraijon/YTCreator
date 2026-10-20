"""Canal de prueba con todo ya hecho, para recorrer la interfaz fase a fase sin gastar nada.

    .venv/bin/python herramientas/demo.py hacer <carpeta>

Copia en <carpeta> (la borra antes) el espacio de las pruebas (ui/backend/tests/espacio_de_prueba: canal «Asombroso y
Real») y lo deja así:
  · 001-phineas-gage: montado de verdad en el modo sin gasto (voz e imágenes de relleno), publicado y con sus
    resultados a las 48 h y a los 7 días: fase J, todas las anteriores hechas.
  · 002-…: con la investigación, el título y la escaleta; falta el guion (fase D).
  · 003-phineas-gage-para-montar: voz, imágenes y control hechos; falta montar (fase G: el botón «Montar» funciona).
El guion de 001 se recorta a 3 escenas (≈ 2 min) y la voz del canal pasa a la gratuita, para que montar sea rápido y
nada sea de pago. Tarda unos 3 minutos. Lo usa `ui/arrancar.py prueba` (solo la primera vez o con `prueba nueva`).
"""

import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import sistema  # noqa: E402

KIT = Path(__file__).resolve().parent.parent
EJEMPLO = KIT / "ui" / "backend" / "tests" / "espacio_de_prueba"
CANAL = "asombroso-y-real"
ESCENAS = 3
PASOS = {   # ids de la guía (ui/backend/app/guia.py) por fase: se dan por aprobados en los vídeos de prueba
    "A": ["a-cuota", "a-probar"],
    "B": ["b-referencia", "b-temas", "b-hueco", "b-aprobar"],
    "C": ["c-fuentes", "c-separar", "c-afiliacion", "c-aprobar"],
    "D": ["d-empaquetado", "d-aprobar-empaquetado", "d-escaleta", "d-aprobar-escaleta", "d-guion", "d-verificar",
          "d-estructura", "d-brief", "d-prompts", "d-revisar", "d-solape", "d-aprobar-guion"],
    "E": ["e-locucion", "e-texto", "e-entonacion", "e-aprobar"],
    "F": ["f-google", "f-boceto", "f-generar", "f-revisar", "f-marcadas", "f-aprobar"],
    "G": ["g-musica", "g-montar", "g-control", "g-aprobar"],
    "H": ["h-miniatura", "h-subtitulos", "h-publicacion"],
    "I": ["i-aprendizajes", "i-aprobar-aprendizajes", "i-historial", "i-ideas", "i-subir"],
    "J": ["j-publicado", "j-48h", "j-7d"],
}


def _herramienta(entorno, *orden):
    r = subprocess.run([str(sistema.python_venv(KIT)), str(KIT / "herramientas" / orden[0]), *orden[1:]],
                       cwd=KIT, env=entorno, capture_output=True, text=True)
    if r.returncode:
        ultima = (r.stdout + r.stderr).strip().splitlines()[-1:] or ["sin salida"]
        sys.exit(f"ERROR: {orden[0]} ha fallado: {ultima[0]}")


def _hecho_hasta(estado, fase, ahora):
    """Fases anteriores a `fase` completadas y todos sus pasos aprobados desde la UI."""
    fases = list(PASOS)
    previas = fases[:fases.index(fase)]
    estado["fase"] = fase
    estado["completadas"] = previas
    pasos = [p for f in previas for p in PASOS[f]]
    estado["aprobaciones"] = {p: {"fecha": ahora, "desde": "UI"} for p in pasos}
    estado["pasos_hechos"] = pasos
    estado.pop("historial_fases", None)
    return estado


def hacer(destino: Path):
    if not EJEMPLO.is_dir():
        sys.exit(f"ERROR: no está el espacio de ejemplo {EJEMPLO}")
    shutil.rmtree(destino, ignore_errors=True)
    shutil.copytree(EJEMPLO, destino)
    (destino / ".demo").write_text("canal de prueba de herramientas/demo.py: se puede borrar y rehacer\n")
    entorno = {**os.environ, "CANALYT_ESPACIO": str(destino), "CANALYT_SIN_GASTO": "1", "CANAL": CANAL}
    entorno.pop("CANALYT_PROGRESO", None)
    _herramienta(entorno, "espacio.py", "preparar")
    canal = destino / "canales" / CANAL
    videos = canal / "videos"

    print("1/4 Canal con voz gratuita", flush=True)
    cfg = archivos.leer_json(canal / "canal.json")
    cfg["voz"] = cfg.get("voz_respaldo", "es-ES-Marta:MAI-Voice-2")
    archivos.escribir_json(canal / "canal.json", cfg)

    print(f"2/4 Vídeo 001 recortado a {ESCENAS} escenas y montado sin gasto (unos 2 minutos)", flush=True)
    v1 = videos / "001-phineas-gage"
    guion = archivos.leer_json(v1 / "guion.json")
    guion["escenas"] = guion["escenas"][:ESCENAS]
    for escena in guion["escenas"]:
        for img in escena.get("imagenes", []):
            img.pop("motor", None)          # nada de ai33: todas de relleno
    archivos.escribir_json(v1 / "guion.json", guion)
    for sobra in ("revision_imagenes.json", "revision_propuestas.json", "motores.json"):
        (v1 / sobra).unlink(missing_ok=True)
    shutil.rmtree(v1 / "musica", ignore_errors=True)        # sin la de Suno: la música común del kit
    _herramienta(entorno, "montar.py", "videos/001-phineas-gage/guion.json", "--solo-imagenes")
    _herramienta(entorno, "montar.py", "videos/001-phineas-gage/guion.json")
    _herramienta(entorno, "entonacion.py", "videos/001-phineas-gage")
    _herramienta(entorno, "fotogramas.py", "videos/001-phineas-gage/guion.json")

    print("3/4 Vídeo 003: la misma copia, a falta de montar", flush=True)
    v3 = videos / "003-phineas-gage-para-montar"
    shutil.copytree(v1, v3)
    for sobra in ("final.mp4", "montaje.json", "montaje.log", "publicacion.md", "subtitulos.srt", "tmp/control.png"):
        (v3 / sobra).unlink(missing_ok=True)
    for sobra in [*v3.glob("miniatura_*.jpg"), v3 / "tmp" / "control"]:
        shutil.rmtree(sobra) if sobra.is_dir() else sobra.unlink()
    guion["titulo"] = "Phineas Gage (copia de prueba para montar)"
    archivos.escribir_json(v3 / "guion.json", guion)
    ahora = datetime.now().replace(microsecond=0)
    e3 = archivos.leer_json(v3 / "estado.json")
    e3.pop("cambios_pedidos", None)
    e3["notas"] = "Vídeo de prueba: voz, imágenes y control hechos (de relleno, sin gasto). Falta montarlo: pulsa «Montar»."
    archivos.escribir_json(v3 / "estado.json", _hecho_hasta(e3, "G", ahora.isoformat()))

    print("4/4 Vídeo 001 publicado, con resultados e historial", flush=True)
    shutil.copy(v1 / "subtitulos.srt", v1 / "subtitulos_en.srt")
    shutil.copy(v1 / "publicacion.md", v1 / "publicacion_final.md")
    archivos.escribir_texto(v1 / "aprendizajes.md",
                            "# Aprendizajes del guion (vídeo de prueba)\n\n"
                            "- Empezar las frases por el verbo: los complementos largos al principio suenan a pregunta.\n"
                            "- Más artículos y conectores hablados: el texto suena menos a libro.\n")
    publicado = ahora - timedelta(days=10)
    e1 = _hecho_hasta(archivos.leer_json(v1 / "estado.json"), "J", ahora.isoformat())
    e1["completadas"] = list(PASOS)
    e1["notas"] = "Vídeo de prueba: montado sin gasto (voz e imágenes de relleno) y con una publicación y unos resultados inventados."
    e1["publicacion"] = {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "fecha": publicado.isoformat(timespec="minutes"),
                         "titulo": guion["titulo"], "registrada": publicado.isoformat()}
    e1["metricas"] = {
        "48h": {"visitas": 412, "ctr": 6.1, "retencion": 41.5, "impresiones": 6750, "suscriptores": 9,
                "registrada": (publicado + timedelta(hours=49)).isoformat()},
        "7d": {"visitas": 1830, "ctr": 5.4, "retencion": 38.2, "impresiones": 33900, "horas_vistas": 41.3,
               "suscriptores": 27, "notas": "Datos inventados del canal de prueba.",
               "registrada": (publicado + timedelta(days=7)).isoformat()},
    }
    archivos.escribir_json(v1 / "estado.json", e1)
    historial = canal / "docs" / "historial.md"
    fila = (f"| 001 | {publicado:%d/%m/%Y} | {v1.name} | {guion['titulo']} | ciencia | 2:20 | — | — | sí | 5,4 % | 38,2 % |\n")
    texto = historial.read_text(encoding="utf-8").replace("|---|---|---|---|---|---|---|---|---|---|---|\n",
                                                          "|---|---|---|---|---|---|---|---|---|---|---|\n" + fila, 1)
    archivos.escribir_texto(historial, texto)
    print(f"OK: canal de prueba listo en {destino}")


def main():
    if len(sys.argv) != 3 or sys.argv[1] != "hacer":
        print(__doc__)
        if len(sys.argv) > 1 and sys.argv[1] not in ("-h", "--help"):
            sys.exit("ERROR: uso: demo.py hacer <carpeta>")
        return
    destino = Path(sys.argv[2]).expanduser().resolve()
    if destino == KIT or KIT in destino.parents or (destino / "canales").is_dir() and not (destino / ".demo").exists():
        sys.exit(f"ERROR: {destino} no parece una carpeta de prueba (tiene canales propios o es el kit): no se borra")
    hacer(destino)


if __name__ == "__main__":
    main()

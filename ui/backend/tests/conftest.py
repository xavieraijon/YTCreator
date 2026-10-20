import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

KIT = Path(__file__).resolve().parents[3]


def _construir_espacio() -> Path:
    """Espacio de trabajo temporal con los canales de prueba (`espacio_de_prueba/`, solo textos) y unos medios diminutos
    generados aquí. Las pruebas no tocan ni dependen del espacio real ni de archivos pesados sin versionar."""
    destino = Path(tempfile.mkdtemp(prefix="canalyt_espacio_"))
    shutil.copytree(Path(__file__).parent / "espacio_de_prueba", destino, dirs_exist_ok=True)
    os.environ["CANALYT_ESPACIO"] = str(destino)
    sys.path.insert(0, str(KIT / "herramientas"))
    import espacio
    espacio.preparar()
    from PIL import Image
    video = destino / "canales" / "_archivo" / "los-viajes-de-tok" / "videos" / "S002-diez-dias-1582"
    for ruta in ("img/03-2.png", "img/03-4.png", "tmp/control.png"):
        (video / ruta).parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (640, 360), (90, 60, 120)).save(video / ruta)
    (video / "voz").mkdir(exist_ok=True)
    ffmpeg = ["ffmpeg", "-v", "error", "-y"]
    subprocess.run([*ffmpeg, "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=3", "-pix_fmt", "yuv420p", str(video / "final.mp4")], check=True)
    subprocess.run([*ffmpeg, "-f", "lavfi", "-i", "sine=frequency=220:duration=2", str(video / "voz" / "web_sin_final.mp3")], check=True)
    return destino


_ESPACIO = _construir_espacio()

# Base de datos temporal: se fija antes de importar la app.
_DB = Path(os.environ.get("TMPDIR", "/tmp")) / "canalyt_test.db"
os.environ["CANALYT_DB"] = f"sqlite:///{_DB}"
os.environ["CANALYT_VIGILANTE"] = "0"     # el vigilante se prueba aparte
os.environ["CANALYT_CUOTAS"] = "0"        # sin consultas de cuota periódicas (red)
os.environ["CANALYT_AJUSTES"] = str(Path(os.environ.get("TMPDIR", "/tmp")) / "canalyt_test_ajustes.json")   # ni ajustes ni salud reales
os.environ["CANALYT_SIN_MOTOR_LOCAL"] = "1"     # el motor de imágenes del Mac nunca se carga en las pruebas (servicios.py)
os.environ["CANALYT_SIN_ALINEACION_LOCAL"] = "1"  # la alineación local (WhisperX) tampoco, por lo mismo
os.environ["CANALYT_SALUD_IA"] = str(Path(os.environ.get("TMPDIR", "/tmp")) / "canalyt_test_salud_ia.json")
os.environ["CANALYT_ESPACIO"] = str(_ESPACIO)   # las pruebas trabajan en un espacio temporal, nunca en el real
os.environ["CANALYT_SIN_GASTO"] = "1"      # una prueba nunca paga: las herramientas de ai33 se niegan a enviar nada
def _claude_inofensivo() -> str:
    """Un «claude» que no hace nada: si una prueba olvida poner su ejecutable falso, nunca se lanza el CLI de verdad (que
    gastaría suscripción y escribiría en carpetas reales)."""
    ruta = Path(os.environ.get("TMPDIR", "/tmp")) / "canalyt_claude_inofensivo"
    ruta.write_text("#!/bin/sh\necho 'claude de pruebas: no hay CLI real en las pruebas' >&2\nexit 1\n")
    ruta.chmod(0o755)
    return str(ruta)


os.environ["CANALYT_CLAUDE"] = _claude_inofensivo()
os.environ["CANALYT_DIARIO"] = "0"        # sin escribir diario.jsonl en carpetas reales (se activa en sus pruebas)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture()
def cliente():
    from app.db import motor
    motor.dispose()           # conexiones de la prueba anterior (también las de los hilos de fondo)
    for sufijo in ("", "-wal", "-shm"):
        Path(f"{_DB}{sufijo}").unlink(missing_ok=True)
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c

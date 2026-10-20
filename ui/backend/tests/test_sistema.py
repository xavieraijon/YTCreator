"""herramientas/sistema.py: lo que cambia entre Mac, Linux y Windows (cerrojos, python del entorno, órdenes de Claude)."""

import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

import servicios
import sistema

HERRAMIENTAS = Path(sistema.__file__).resolve().parent


def _otro_proceso_con_el_cerrojo(ruta):
    """Un proceso aparte que toma el cerrojo y lo mantiene hasta que se le cierra la entrada."""
    codigo = textwrap.dedent(f"""
        import sys
        sys.path.insert(0, {str(HERRAMIENTAS)!r})
        import sistema
        with sistema.cerrojo({str(ruta)!r}):
            print("dentro", flush=True)
            sys.stdin.read()
    """)
    proc = subprocess.Popen([sys.executable, "-c", codigo], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    assert proc.stdout.readline().strip() == "dentro"
    return proc


def test_el_cerrojo_excluye_a_otro_proceso_y_se_libera(tmp_path):
    ruta = tmp_path / "tmp" / "guion.lock"
    assert not sistema.esta_bloqueado(ruta)                 # no existe: libre
    proc = _otro_proceso_con_el_cerrojo(ruta)
    try:
        assert sistema.esta_bloqueado(ruta)
        with pytest.raises(BlockingIOError):
            with sistema.cerrojo(ruta, esperar=False):
                pass
    finally:
        proc.stdin.close()
        proc.wait(10)
    assert not sistema.esta_bloqueado(ruta)
    with sistema.cerrojo(ruta, esperar=False):              # ya libre: se toma
        pass


def test_el_cerrojo_no_vacia_el_archivo(tmp_path):
    ruta = tmp_path / "ai33.lock"
    ruta.write_text("algo")
    with sistema.cerrojo(ruta):
        pass
    assert ruta.read_text() == "algo"


@pytest.mark.parametrize("windows, esperado", [(False, ".venv/bin/python"), (True, ".venv/Scripts/python.exe")])
def test_python_del_entorno_segun_el_sistema(monkeypatch, tmp_path, windows, esperado):
    monkeypatch.setattr(sistema, "WINDOWS", windows)
    assert sistema.python_venv(tmp_path) == tmp_path / esperado
    assert sistema.python_venv(tmp_path, ".venv-local").parent.parent == tmp_path / ".venv-local"
    assert sistema.orden_python() == esperado


def test_las_ordenes_de_claude_se_traducen_solo_en_windows(monkeypatch):
    orden = "Bash(.venv/bin/python herramientas/cuota.py:*)"
    assert sistema.adaptar_orden(orden) == orden
    monkeypatch.setattr(sistema, "WINDOWS", True)
    assert sistema.adaptar_orden(orden) == "Bash(.venv/Scripts/python.exe herramientas/cuota.py:*)"


def test_sin_prioridad_baja_por_prefijo_en_windows(monkeypatch):
    if sys.platform != "win32":
        assert sistema.prioridad_baja() == ["nice", "-n", "10"]
        assert sistema.opciones_grupo() == {"start_new_session": True}
    monkeypatch.setattr(sistema, "WINDOWS", True)
    assert sistema.prioridad_baja() == []


def test_el_motor_del_mac_solo_aparece_en_un_mac_con_chip_de_apple(monkeypatch):
    monkeypatch.setattr(sistema, "mac_apple_silicon", lambda: False)
    assert "local" not in servicios.catalogo()
    assert servicios.disponible("local") is False
    monkeypatch.setattr(sistema, "mac_apple_silicon", lambda: True)
    assert "local" in servicios.catalogo()


def test_enlazar_una_carpeta(tmp_path):
    origen = tmp_path / "kit" / "docs"
    origen.mkdir(parents=True)
    (origen / "a.md").write_text("hola")
    sistema.enlazar(tmp_path / "docs", origen)
    assert sistema.es_enlace(tmp_path / "docs")
    assert (tmp_path / "docs" / "a.md").read_text() == "hola"


def test_los_programas_de_instalar_van_delante_en_el_path(tmp_path):
    (tmp_path / "programas").mkdir()
    entorno = {"PATH": "/usr/bin"}
    sistema.programas_en_path(tmp_path, entorno)
    assert entorno["PATH"].split(os.pathsep) == [str(tmp_path / "programas"), "/usr/bin"]   # sin .venv: no se añade
    sistema.programas_en_path(tmp_path, entorno)                                             # dos veces: no se repite
    assert entorno["PATH"].count(str(tmp_path / "programas")) == 1

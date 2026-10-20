"""«Cerrar YTCreator» y «Reiniciar ahora»: el servidor deja la orden a ui/arrancar.py y se para; sin arrancar.py, no se puede."""
import importlib.util
import sys
from pathlib import Path

from app.rutas import sistema

ARRANCAR = Path(__file__).resolve().parents[2] / "arrancar.py"


def test_sin_arrancar_no_se_puede(cliente, monkeypatch):
    monkeypatch.delenv("CANALYT_ORDEN", raising=False)
    assert cliente.get("/api/salud").json()["apagable"] is False
    r = cliente.post("/api/cerrar")
    assert r.status_code == 409
    assert "Ctrl+C" in r.json()["detail"]


def test_deja_la_orden_y_se_para(cliente, monkeypatch, tmp_path):
    orden = tmp_path / "orden"
    orden.write_text("")
    monkeypatch.setenv("CANALYT_ORDEN", str(orden))
    paradas = []
    monkeypatch.setattr(sistema, "_parar", lambda: paradas.append(1))
    salud = cliente.get("/api/salud").json()
    assert salud["apagable"] is True and salud["arranque"] > 0
    assert cliente.post("/api/reiniciar").json() == {"ok": True}
    assert orden.read_text() == "reiniciar"
    assert cliente.post("/api/cerrar").status_code == 200
    assert orden.read_text() == "cerrar"


def _arrancar():
    spec = importlib.util.spec_from_file_location("arrancar_prueba", ARRANCAR)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_arrancar_reinicia_hasta_que_se_cierra(tmp_path):
    """Servidor falso: la 1.ª vez pide reiniciar, la 2.ª cerrar. arrancar.py lo lanza dos veces y acaba bien."""
    veces = tmp_path / "veces"
    falso = tmp_path / "servidor.py"
    falso.write_text(
        "import os, pathlib\n"
        f"v = pathlib.Path({str(veces)!r}); n = len(v.read_text()) if v.exists() else 0; v.write_text('x' * (n + 1))\n"
        "pathlib.Path(os.environ['CANALYT_ORDEN']).write_text('reiniciar' if n == 0 else 'cerrar')\n")
    arrancar = _arrancar()
    assert arrancar._servir([sys.executable, str(falso)], {}, tmp_path) == 0
    assert veces.read_text() == "xx"


def test_arrancar_sin_orden_devuelve_el_codigo(tmp_path):
    """Si el servidor se para solo (o con Ctrl+C), no se relanza."""
    falso = tmp_path / "servidor.py"
    falso.write_text("raise SystemExit(3)\n")
    assert _arrancar()._servir([sys.executable, str(falso)], {}, tmp_path) == 3

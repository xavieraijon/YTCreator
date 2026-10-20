"""Gasto de ai33 honrado: se apunta al terminar (nunca al lanzar), nada en modo sin gasto y el tope por vídeo bloquea."""
import pytest
from sqlalchemy import select

import simulacion
from app import gasto, tareas
from app.db import Sesion
from app.modelos import Gasto
from tests.test_tareas import _esperar
from tests.test_tramos import video  # noqa: F401  (fixture)

PAGO = {"confirmado": True, "previsto": 3600}


@pytest.fixture()
def pago_falso(tmp_path, monkeypatch):
    """«musica_ai33» y una pesada que la retiene en cola, con scripts que no hablan con nadie (nunca ai33)."""
    monkeypatch.setenv("CANALYT_TAREAS", str(tmp_path / "logs"))
    monkeypatch.setattr(gasto, "AJUSTES", tmp_path / "ajustes.json")
    eco = tmp_path / "eco.py"
    eco.write_text("print('OK: música', flush=True)\n")
    lento = tmp_path / "lento.py"
    lento.write_text("import time\nprint('empiezo', flush=True)\ntime.sleep(30)\n")
    monkeypatch.setitem(tareas.HERRAMIENTAS, "musica_ai33", tareas.Herramienta("Música", str(eco), True, False))
    monkeypatch.setitem(tareas.HERRAMIENTAS, "lento", tareas.Herramienta("Lento", str(lento), True, False))


def _gasto(tid):
    with Sesion() as s:
        return sum(g.creditos for g in s.scalars(select(Gasto).where(Gasto.tarea_id == tid)))


def test_cancelar_en_cola_no_apunta_nada(cliente, video, pago_falso, monkeypatch):  # noqa: F811
    monkeypatch.setattr(simulacion, "activa", lambda: False)     # como si pagara (el script falso no envía nada)
    vid, _ = video
    a = cliente.post("/api/tareas", json={"herramienta": "lento"}).json()
    _esperar(cliente, a["id"], {"en_curso"})
    b = cliente.post("/api/tareas", json={"herramienta": "musica_ai33", "video_id": vid, "argumentos": PAGO}).json()
    assert _gasto(b["id"]) == 0                                   # al lanzar, nada
    assert cliente.post(f"/api/tareas/{b['id']}/cancelar").json()["estado"] == "cancelada"
    cliente.post(f"/api/tareas/{a['id']}/cancelar")
    _esperar(cliente, a["id"], {"cancelada", "error", "hecha"})
    assert _gasto(b["id"]) == 0 and cliente.get(f"/api/videos/{vid}/gasto").json()["creditos"] == 0


def test_se_apunta_al_terminar_y_nunca_sin_gasto(cliente, video, pago_falso, monkeypatch):  # noqa: F811
    vid, _ = video
    t = cliente.post("/api/tareas", json={"herramienta": "musica_ai33", "video_id": vid, "argumentos": PAGO}).json()
    assert _esperar(cliente, t["id"], {"hecha", "error"})["estado"] == "hecha"
    assert _gasto(t["id"]) == 0                                   # modo sin gasto (conftest): simuló, no se apunta
    monkeypatch.setattr(simulacion, "activa", lambda: False)
    t = cliente.post("/api/tareas", json={"herramienta": "musica_ai33", "video_id": vid, "argumentos": PAGO}).json()
    _esperar(cliente, t["id"], {"hecha", "error"})
    assert _gasto(t["id"]) == 3600
    assert cliente.get(f"/api/videos/{vid}/gasto").json()["creditos"] == 3600


def test_el_tope_bloquea_y_ajustes_danados_no_se_ignoran(cliente, video, pago_falso, monkeypatch):  # noqa: F811
    monkeypatch.setattr(simulacion, "activa", lambda: False)
    vid, _ = video
    assert cliente.put("/api/ajustes/presupuesto", json={"tope_euros_video": 0.01}).status_code == 200
    r = cliente.post("/api/tareas", json={"herramienta": "musica_ai33", "video_id": vid, "argumentos": PAGO})
    assert r.status_code == 422 and "tope" in r.json()["detail"]
    assert gasto.creditos_previstos("voz_canal_ai33", PAGO) == 3600     # la voz del canal también cuenta
    gasto.AJUSTES.write_text("{roto")
    assert cliente.get(f"/api/videos/{vid}/gasto").status_code == 409  # dañado: se avisa, nunca «sin tope»
    r = cliente.post("/api/tareas", json={"herramienta": "musica_ai33", "video_id": vid, "argumentos": PAGO})
    assert r.status_code == 409

"""Actividad (bloque 4 del recorrido profano): los turnos de Claude se ven junto a las tareas, con su vídeo y lo que hacen."""
from tests.test_chat import _esperar, _falso, _video


def test_un_turno_de_claude_sale_en_la_actividad(cliente, tmp_path, monkeypatch):
    _falso(tmp_path, monkeypatch, espera=1.5)
    vid = _video(cliente)
    assert cliente.post(f"/api/videos/{vid}/claude", json={"mensaje": "Hola"}).status_code == 200
    activos = [t for t in cliente.get("/api/actividad/claude").json() if t["video_id"] == vid]
    assert activos and activos[0]["estado"] == "pensando" and activos[0]["titulo"]
    _esperar(cliente, vid)
    t = next(t for t in cliente.get("/api/actividad/claude").json() if t["video_id"] == vid)
    assert t["estado"] == "libre" and t["accion"] is None          # terminado hace poco: sigue en la lista

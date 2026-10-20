"""Gestión de vídeos (bloque 5 del recorrido profano): archivar es reversible y borrar va a una papelera recuperable."""
import json

import pytest


@pytest.fixture()
def canal(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    import espacio
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    monkeypatch.setattr(espacio, "DATOS", tmp_path / "data")
    c = tmp_path / "canales" / "prueba"
    c.mkdir(parents=True)
    (c / "canal.json").write_text("{}")
    d = cliente.post("/api/canales/prueba/videos", json={"tema": "un vídeo de prueba"}).json()
    return c, d["id"], d["carpeta"]


def _videos(cliente):
    return {v["carpeta"]: v for v in cliente.get("/api/videos", params={"canal": "prueba"}).json()}


def test_archivar_y_recuperar(cliente, canal):
    c, vid, carpeta = canal
    assert cliente.post(f"/api/videos/{vid}/archivar", json={"archivado": True}).status_code == 200
    assert _videos(cliente)[carpeta]["aparcado"] is True
    assert "archivado" in json.loads((c / "videos" / carpeta / "estado.json").read_text())
    cliente.post(f"/api/videos/{vid}/archivar", json={"archivado": False})
    estado = json.loads((c / "videos" / carpeta / "estado.json").read_text())
    assert _videos(cliente)[carpeta]["aparcado"] is False and "archivado" not in estado and estado["fase"] == "B"


def test_papelera_y_restaurar(cliente, canal, tmp_path):
    c, vid, carpeta = canal
    assert cliente.delete(f"/api/videos/{vid}").status_code == 200
    assert not (c / "videos" / carpeta).exists() and carpeta not in _videos(cliente)
    p = cliente.get("/api/canales/prueba/papelera").json()
    assert len(p) == 1 and p[0]["carpeta"] == carpeta and p[0]["titulo"] == "Un vídeo de prueba"
    assert (tmp_path / "data" / "papelera" / "prueba" / p[0]["nombre"] / "estado.json").exists()
    r = cliente.post(f"/api/canales/prueba/papelera/{p[0]['nombre']}/restaurar")
    assert r.status_code == 200 and r.json()["carpeta"] == carpeta
    assert (c / "videos" / carpeta / "estado.json").exists() and not (c / "videos" / carpeta / ".papelera.json").exists()
    assert carpeta in _videos(cliente) and cliente.get("/api/canales/prueba/papelera").json() == []


def test_restaurar_no_pisa_nada(cliente, canal):
    c, vid, carpeta = canal
    cliente.delete(f"/api/videos/{vid}")
    nombre = cliente.get("/api/canales/prueba/papelera").json()[0]["nombre"]
    (c / "videos" / carpeta).mkdir()
    assert cliente.post(f"/api/canales/prueba/papelera/{nombre}/restaurar").status_code == 422
    assert cliente.post("/api/canales/prueba/papelera/..%2Fx/restaurar").status_code in (404, 405, 422)   # nunca 200


def test_cambiar_nombre_y_enlace_del_canal(cliente, canal):
    import json as _json
    c, _, _ = canal
    r = cliente.patch("/api/canales/prueba", json={"nombre": "  Gatos   y ciencia ", "url": "https://www.youtube.com/@gatosyciencia"})
    assert r.status_code == 200, r.text
    cfg = _json.loads((c / "canal.json").read_text())
    assert cfg["nombre"] == "Gatos y ciencia" and cfg["url"] == "https://www.youtube.com/@gatosyciencia"
    assert cliente.get("/api/canales/prueba").json()["nombre"] == "Gatos y ciencia"
    assert cliente.patch("/api/canales/prueba", json={"url": "https://evil.example/x"}).status_code == 422
    assert cliente.patch("/api/canales/prueba", json={"nombre": "x"}).status_code == 422
    assert cliente.patch("/api/canales/no-existe", json={"nombre": "Algo"}).status_code == 404

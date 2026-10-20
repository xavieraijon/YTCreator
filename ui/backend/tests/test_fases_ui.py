"""Fases A y B con pantalla propia: continuar, proponer (Claude falso), medir (saturación falsa) y elegir."""
import json
import time

import pytest

from app import config
from tests.test_chat import _falso

CANAL_JSON = {"palabras_por_minuto": 170, "duraciones": {"10": {"palabras": [1650, 1750], "imagenes": 95},
                                                          "12": {"palabras": [1980, 2100], "imagenes": 115},
                                                          "14": {"palabras": [2300, 2450], "imagenes": 130}}}
PROPUESTAS = {"propuestas": [
    {"id": 1, "titulo": "Una parte del cerebro se ha dormido", "pilar": "ciencia", "enfoque": "Ondas de sueño despierto",
     "gancho": "Mira un punto fijo.", "porque": "Casi nadie lo cuenta.", "dato": "ondas de sueño despiertos",
     "amplio": "cerebro", "en": "brain sleep waves awake", "recomendada": True, "campo_raro": "no entra"},
    {"id": 2, "titulo": "Pensar en nada sí es posible", "pilar": "ciencia", "enfoque": "La mente vacía", "gancho": "g",
     "porque": "p", "dato": "pensar en nada", "amplio": "mente", "en": ""},
]}


@pytest.fixture()
def video(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    c = tmp_path / "canales" / "prueba"
    c.mkdir(parents=True)
    (c / "canal.json").write_text(json.dumps(CANAL_JSON))
    d = cliente.post("/api/canales/prueba/videos", json={"tema": "Qué le pasa a la mente en blanco"}).json()
    return d["id"], c / "videos" / d["carpeta"]


def _estado(carpeta):
    return json.loads((carpeta / "estado.json").read_text())


def test_un_video_nuevo_empieza_en_el_tema(cliente, video):
    """La fase A no es un paso del usuario: el vídeo largo nace en la B (hallazgo 13 del recorrido profano)."""
    vid, carpeta = video
    e = _estado(carpeta)
    assert e["fase"] == "B" and e["completadas"] == ["A"] and "a-cuota" in e["pasos_hechos"]
    assert cliente.post(f"/api/videos/{vid}/fase-a/continuar").status_code == 409


def test_continuar_a_pasa_a_la_b_en_videos_antiguos(cliente, video):
    vid, carpeta = video
    e = _estado(carpeta)
    e.update({"fase": "A", "completadas": [], "pasos_hechos": []})
    (carpeta / "estado.json").write_text(json.dumps(e))
    assert cliente.post(f"/api/videos/{vid}/fase-a/continuar").status_code == 200    # el botón antiguo sigue valiendo
    e = _estado(carpeta)
    assert e["fase"] == "B" and e["completadas"] == ["A"] and "a-cuota" in e["pasos_hechos"]


def test_un_video_antiguo_en_la_fase_a_pasa_solo_a_la_b(cliente, video):
    """Hallazgo 55: un vídeo largo de antes, parado en la fase A, se pone en la B al leerlo (como los nuevos)."""
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal
    vid, carpeta = video
    e = _estado(carpeta)
    e.update({"fase": "A", "completadas": [], "pasos_hechos": []})
    (carpeta / "estado.json").write_text(json.dumps(e))
    with Sesion() as s:
        sincronizar_canal(s, "prueba")
    e = _estado(carpeta)
    assert e["fase"] == "B" and e["completadas"] == ["A"] and e["historial_fases"][-1]["desde"].startswith("UI (automático")
    assert cliente.get(f"/api/videos/{vid}").json()["fase"] == "B"


def test_estado_b_limpia_las_propuestas_y_calcula_las_duraciones(cliente, video):
    vid, carpeta = video
    d = cliente.get(f"/api/videos/{vid}/fase-b").json()
    assert d["propuestas"] == [] and d["error"] is None and d["tema"].startswith("Qué le pasa")
    assert [x["minutos"] for x in d["duraciones"]] == [10, 12, 14]
    diez = d["duraciones"][0]
    assert diez["palabras"] == 1700 and diez["imagenes"] == 95 and diez["dias_imagenes"] == 2 and diez["creditos_voz"] == 10900
    (carpeta / "propuestas.json").write_text(json.dumps(PROPUESTAS))
    d = cliente.get(f"/api/videos/{vid}/fase-b").json()
    assert [p["id"] for p in d["propuestas"]] == [1, 2] and "campo_raro" not in d["propuestas"][0]
    assert d["propuestas"][0]["recomendada"] is True and d["por_medir"] == [1, 2]
    (carpeta / "propuestas.json").write_text("{ roto")
    assert "no se puede leer" in cliente.get(f"/api/videos/{vid}/fase-b").json()["error"]


def test_medir_con_saturacion_falsa_y_elegir(cliente, video, tmp_path, monkeypatch):
    vid, carpeta = video
    falso = tmp_path / "herr"
    falso.mkdir()
    (falso / "saturacion.py").write_text(
        "import json, sys\n"
        "rojo = 'nada' in sys.argv[1]\n"
        "print(json.dumps({'concreto': {'n_clones': 14 if rojo else 4, 'recientes': 6, 'perennes': 1, 'mediana': 900},\n"
        "  'amplio': {'grandes': 7, 'maximo': 3000000}, 'en': {'n_clones': 12},\n"
        "  'semaforo': 'ROJO' if rojo else 'VERDE', 'motivo': 'muy contado' if rojo else 'hueco'}))\n")
    monkeypatch.setattr(config, "HERRAMIENTAS", falso)
    (carpeta / "propuestas.json").write_text(json.dumps(PROPUESTAS))
    assert cliente.post(f"/api/videos/{vid}/fase-b/medir").json() == {"lanzadas": 2}
    fin = time.time() + 15
    while time.time() < fin:
        d = cliente.get(f"/api/videos/{vid}/fase-b").json()
        if all(p["medida"] for p in d["propuestas"]):
            break
        time.sleep(0.2)
    m = {p["id"]: p["medida"] for p in d["propuestas"]}
    assert m[1]["semaforo"] == "verde" and m[1]["clones"] == 4 and m[1]["demanda"] == "alta" and m[1]["en_ingles"] == 12
    assert m[2]["semaforo"] == "rojo" and m[2]["motivo"] == "muy contado"
    assert cliente.post(f"/api/videos/{vid}/fase-b/medir").json() == {"lanzadas": 0}   # ya medidas: no se repite

    assert cliente.post(f"/api/videos/{vid}/fase-b/elegir", json={"propuesta": 9, "minutos": 10}).status_code == 422
    assert cliente.post(f"/api/videos/{vid}/fase-b/elegir", json={"propuesta": 1, "minutos": 11}).status_code == 422
    assert cliente.post(f"/api/videos/{vid}/fase-b/elegir", json={"propuesta": 1, "minutos": 12}).status_code == 200
    e = _estado(carpeta)
    assert e["fase"] == "C" and e["completadas"] == ["A", "B"] and e["duracion_objetivo"] == 12 and e["pilar"] == "ciencia"
    assert e["aprobaciones"]["b-aprobar"]["desde"] == "UI" and "12 min" in e["aprobaciones"]["b-aprobar"]["comentario"]
    assert e["hueco"].startswith("VERDE") and e["titulo_provisional"].startswith("Una parte")
    g = cliente.get(f"/api/videos/{vid}/guia").json()
    assert g["fase_actual"] == "C"
    assert cliente.post(f"/api/videos/{vid}/fase-b/elegir", json={"propuesta": 1, "minutos": 12}).status_code == 409


def test_proponer_manda_el_encargo_a_claude_sin_chat(cliente, video, tmp_path, monkeypatch):
    vid, carpeta = video
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post(f"/api/videos/{vid}/fase-b/proponer", json={}).status_code == 200
    fin = time.time() + 10
    while time.time() < fin:
        t = cliente.get(f"/api/videos/{vid}/fase-b").json()["trabajo"]
        if t["estado"] == "libre" and t["conversacion"]:
            break
        time.sleep(0.1)
    prompt = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "MODO UI" in prompt and "propuestas.json" in prompt and "NO midas la saturación" in prompt
    assert "Qué le pasa a la mente en blanco" in prompt and "3 enfoques" in prompt
    cliente.post(f"/api/videos/{vid}/fase-b/proponer", json={"otros": True})
    time.sleep(0.5)
    assert "distintas y sobrescribe" in json.loads(registro.read_text().splitlines()[1])["args"][1]

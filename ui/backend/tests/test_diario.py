"""Diario del vídeo: acciones del usuario, turnos de Claude con sus cambios y avisos con gravedad."""
import json
import time

import pytest

from app import diario
from tests.test_chat import _falso
from tests.test_fases_ui import CANAL_JSON


@pytest.fixture()
def video(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.delenv("CANALYT_DIARIO", raising=False)
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    c = tmp_path / "canales" / "prueba"
    c.mkdir(parents=True)
    (c / "canal.json").write_text(json.dumps(CANAL_JSON))
    d = cliente.post("/api/canales/prueba/videos", json={"tema": "Mente en blanco", "duracion": 10}).json()
    return d["id"], c / "videos" / d["carpeta"]


def _diario(cliente, vid):
    return cliente.get(f"/api/videos/{vid}/diario").json()


def test_resumen_de_cambios_legible():
    antes = {"escaleta.json": json.dumps({"avisos": ["Recompensa floja", "Bucle abierto", "Tercero"], "resumen": "a"}),
             "guion.json": json.dumps({"escenas": [{"texto": "uno"}, {"texto": "dos"}]}), "x.md": "a\nb\n"}
    despues = {"escaleta.json": json.dumps({"avisos": ["Bucle abierto"], "resumen": "a"}),
               "guion.json": json.dumps({"escenas": [{"texto": "uno"}, {"texto": "DOS"}, {"texto": "tres"}]}),
               "x.md": "a\nc\n", "nuevo.md": "hola\n"}
    c = {x["archivo"]: x for x in diario.diferencias(antes, despues)}
    assert c["escaleta.json"]["resumen"] == ["Avisos: se quitaron 2: Recompensa floja; Tercero"]
    assert c["guion.json"]["resumen"] == ["Escenas: 1 escena(s) modificada(s), 1 añadida(s) (la 2)"]
    assert c["x.md"]["resumen"] == ["1 líneas añadidas, 1 quitadas"] and "-b" in c["x.md"]["diff"] and "+c" in c["x.md"]["diff"]
    assert c["nuevo.md"]["tipo"] == "creado"
    assert '-    "Recompensa floja",' in c["escaleta.json"]["diff"]          # JSON comparado en bonito, línea a línea
    assert diario.diferencias({"estado.json": "{}"}, {"estado.json": "{}"}) == []


def test_el_resumen_de_claude_sale_sin_marcas_de_markdown():
    assert diario._plano("## Hecho\n- **Escena 3**: cambié `guion.json`\n1. otra") == "Hecho\nEscena 3: cambié guion.json\notra"


def test_las_acciones_del_usuario_quedan_en_el_diario(cliente, video):
    vid, carpeta = video
    (carpeta / "propuestas.json").write_text(json.dumps({"propuestas": [
        {"id": 1, "titulo": "Una parte del cerebro", "enfoque": "Ondas", "dato": "a"}]}))
    cliente.post(f"/api/videos/{vid}/fase-b/elegir", json={"propuesta": 1, "minutos": 10})
    (carpeta / "fuentes.md").write_text("x")
    cliente.post(f"/api/videos/{vid}/tramo/c-investigar/cambios", json={"texto": "  Más   fuentes "})
    d = _diario(cliente, vid)
    assert [e["tipo"] for e in d][:2] == ["cambios", "eleccion"]                       # lo más reciente primero
    assert d[0]["titulo"] == "Has pedido cambios en «Revisa la investigación»" and d[0]["detalle"] == "Más fuentes" and d[0]["fase"] == "C"
    assert d[1]["titulo"].startswith("Has elegido el enfoque «Una parte del cerebro»") and d[1]["detalle"] == "Ondas"
    assert d[1]["quien"] == "usuario"


def test_un_turno_de_claude_registra_que_cambio(cliente, video, tmp_path, monkeypatch):
    vid, carpeta = video
    (carpeta / "escaleta.json").write_text(json.dumps({"avisos": ["Aviso 1", "Aviso 2"], "actos": []}))
    _falso(tmp_path, monkeypatch)
    # el «claude» falso cambia un archivo durante su turno: se escribe antes de que el diario mire «después»
    falso = tmp_path / "claude"
    contenido = falso.read_text().replace("time.sleep(", f"open({str(carpeta / 'escaleta.json')!r}, 'w').write(json.dumps({{'avisos': ['Aviso 2'], 'actos': []}}))\ntime.sleep(", 1)
    falso.write_text(contenido)
    cliente.post(f"/api/videos/{vid}/claude", json={"mensaje": "Revisa los avisos de la escaleta, por favor"})
    fin = time.time() + 10
    while time.time() < fin:
        d = _diario(cliente, vid)
        if d:
            break
        time.sleep(0.1)
    e = d[0]
    assert e["quien"] == "claude" and e["titulo"] == "Claude respondió a tu mensaje" and e["pedido"].startswith("Revisa los avisos")
    assert e["detalle"] == "He leído CLAUDE.md."              # su última respuesta de texto, sin marcas de markdown
    assert e["cambios"][0]["archivo"] == "escaleta.json" and e["cambios"][0]["resumen"] == ["Avisos: se quitaron 1: Aviso 1"]
    assert "-" in e["cambios"][0]["diff"]

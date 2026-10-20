"""Shorts con pantallas guiadas: enfoque en la fase A, tramos de la B a la E y nada de tramos de vídeo largo."""
import json
import time

import pytest

from tests.test_chat import _falso
from tests.test_fases_ui import CANAL_JSON, PROPUESTAS


@pytest.fixture()
def short(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    c = tmp_path / "canales" / "prueba"
    c.mkdir(parents=True)
    (c / "canal.json").write_text(json.dumps(CANAL_JSON))
    largo = cliente.post("/api/canales/prueba/videos", json={"tema": "Mente en blanco"}).json()
    d = cliente.post("/api/canales/prueba/videos",
                     json={"tema": "El cerebro se duerme a ratos", "tipo": "short", "apoya": largo["carpeta"]}).json()
    return d["id"], c / "videos" / d["carpeta"], largo


def _estado(carpeta):
    return json.loads((carpeta / "estado.json").read_text())


def _poner(carpeta, **campos):
    e = _estado(carpeta)
    e.update(campos)
    (carpeta / "estado.json").write_text(json.dumps(e))


def _esperar_libre(cliente, url):
    fin = time.time() + 10
    while time.time() < fin:
        t = cliente.get(url).json()["trabajo"]
        if t["estado"] == "libre" and t["conversacion"]:
            return
        time.sleep(0.1)


def test_el_short_elige_enfoque_en_la_fase_a_sin_duracion(cliente, short):
    vid, carpeta, largo = short
    assert _estado(carpeta)["fase"] == "A"
    assert cliente.post(f"/api/videos/{vid}/fase-a/continuar").status_code == 422     # su fase A es el enfoque
    (carpeta / "propuestas.json").write_text(json.dumps(PROPUESTAS))
    d = cliente.get(f"/api/videos/{vid}/fase-b").json()
    assert d["tipo"] == "short" and d["apoya"] == largo["carpeta"] and d["duraciones"] == []
    assert cliente.post(f"/api/videos/{vid}/fase-b/elegir", json={"propuesta": 1}).status_code == 200
    e = _estado(carpeta)
    assert e["fase"] == "B" and e["completadas"] == ["A"] and "duracion_objetivo" not in e
    assert e["aprobaciones"]["sa-aprobar"]["desde"] == "UI" and "min" not in e["aprobaciones"]["sa-aprobar"]["comentario"]
    assert "sa-enfoques" in e["pasos_hechos"] and e["gancho"] == "Mira un punto fijo."
    assert cliente.get(f"/api/videos/{vid}/guia").json()["fase_actual"] == "B"


def test_proponer_un_short_lee_el_video_largo(cliente, short, tmp_path, monkeypatch):
    vid, _, largo = short
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post(f"/api/videos/{vid}/fase-b/proponer", json={}).status_code == 200
    _esperar_libre(cliente, f"/api/videos/{vid}/fase-b")
    p = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "Short, fase A" in p and "nuevo-short.md" in p and f"videos/{largo['carpeta']}/" in p and "propuestas.json" in p


def test_tramos_del_short_de_la_b_a_la_e(cliente, short, tmp_path, monkeypatch):
    vid, carpeta, largo = short
    _poner(carpeta, fase="B", completadas=["A"], enfoque="Ondas", gancho="Mira un punto fijo.")
    a = cliente.get(f"/api/videos/{vid}/fase/B").json()["actual"]
    assert a["id"] == "sb-guion" and a["job"] and a["boton"] == "Escribir el guion del Short"
    # Un Short no acepta tramos ni fases de vídeo largo
    assert cliente.get(f"/api/videos/{vid}/fase/F").status_code == 404
    assert cliente.post(f"/api/videos/{vid}/tramo/d-guion/producir", json={}).status_code == 404
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post(f"/api/videos/{vid}/tramo/sb-guion/producir", json={}).status_code == 200
    _esperar_libre(cliente, f"/api/videos/{vid}/fase/B")
    p = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "MODO UI · Short" in p and "nuevo-short.md" in p and f"videos/{largo['carpeta']}/guion.md" in p
    # C: con la voz hecha fuera (voz_archivo) e imágenes generadas, se aprueba y pasa a la D
    _poner(carpeta, fase="C", completadas=["A", "B"])
    (carpeta / "voz").mkdir()
    (carpeta / "voz" / "locucion.mp3").write_bytes(b"x")
    (carpeta / "guion.json").write_text(json.dumps({
        "tipo": "short", "formato": "vertical", "voz_archivo": f"videos/{carpeta.name}/voz/locucion.mp3",
        "escenas": [{"texto": "Hola {img}", "imagenes": [{"id": "01-1", "prompt": "un cerebro"}]}]}))
    from app.sincronizar import sincronizar_canal
    from app.db import Sesion
    with Sesion() as s:
        sincronizar_canal(s, "prueba")
    f = cliente.get(f"/api/videos/{vid}/fase/C").json()
    assert [t["id"] for t in f["tramos"]] == ["sc-voz", "sc-imagenes"] and f["tramos"][0]["estado"] == "hecho"
    luces = cliente.get(f"/api/videos/{vid}/fase/C?revision=true").json()["tramos"][0]["detalle"]["luces"]
    assert [(l["titulo"], l["valor"], l["color"]) for l in luces] == [("Locución", "Archivo propio", "verde")]
    # E: cerrar y marcar la subida deja el Short cerrado
    _poner(carpeta, fase="E", completadas=["A", "B", "C", "D"])
    (carpeta.parent.parent / "docs").mkdir()
    (carpeta.parent.parent / "docs" / "historial.md").write_text(f"## Shorts\n- {carpeta.name}")
    f = cliente.get(f"/api/videos/{vid}/fase/E").json()
    assert f["actual"]["id"] == "se-subir" and f["actual"]["completable"] is True
    assert cliente.post(f"/api/videos/{vid}/tramo/se-subir/completar").status_code == 200
    assert _estado(carpeta)["fase"] == "cerrado"


def test_una_fase_de_montaje_cerrada_sin_video_no_cuenta_como_montado(cliente, short):
    """Hallazgo 41: el Asistente decía «1 vídeo terminado» por una fase de montaje cerrada sin vídeo (Inicio, «0 montados»)."""
    vid, carpeta, _ = short
    _poner(carpeta, fase="E", completadas=["A", "B", "C", "D"])
    from app.sincronizar import sincronizar_canal
    from app.db import Sesion
    with Sesion() as s:
        sincronizar_canal(s, "prueba")
    fases = {f["letra"]: f for f in cliente.get(f"/api/videos/{vid}/guia").json()["fases"]}
    assert fases["D"]["estado"] == "desactualizada" and "Falta el vídeo montado" in fases["D"]["avisos"][0]
    paso = next(p for p in cliente.get("/api/asistente").json()["pasos"] if p["id"] == "video")
    assert paso["hecho"] is False and "terminado" not in paso["resumen"]


def test_el_contexto_del_chat_habla_con_los_nombres_de_la_pantalla(cliente, short):
    """Hallazgo 40: Claude mandaba a una «pestaña Herramientas» que no existe y hablaba de «fase E», carpetas y proveedores."""
    from app import chat
    from app.estado_video import texto
    vid, carpeta, largo = short
    cfg = carpeta.parent.parent / "canal.json"
    cfg.write_text(json.dumps({**json.loads(cfg.read_text()), "nombre": "Canal de Prueba"}))
    v = cliente.get(f"/api/videos/{vid}").json()
    c = chat.contexto("prueba", carpeta.name, "short", "El cerebro se duerme a ratos", v["estado_real"])
    assert "«Canal de Prueba»" in c and "Herramientas» del vídeo" not in c
    assert "Locutar: fase «Voz e imágenes»" in c and "botón «Montar el Short»" in c and "nunca por letra" in c
    l = chat.contexto("prueba", largo["carpeta"], "largo", "Mente en blanco", None)
    assert "Locutar: fase «Voz»" in l and "«Montaje y control»" in l and "«Arranque" not in l
    assert "(fase " not in texto(v["estado_real"])
    for ctx in (c, chat.contexto_asistente(None)):                        # los dos chats: botones y nada de terminal
        assert "```opciones" in ctx and "nunca le pidas que ejecute nada en una terminal" in ctx
    assert "comando exacto" not in chat.contexto_asistente("prueba")

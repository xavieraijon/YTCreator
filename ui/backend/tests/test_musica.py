"""Música de fondo con Suno: estado, prompt propio, elegir versión, tarea de pago con coste confirmado y el paso de
la guía. Sin llamar a ai33 (las versiones se simulan con archivos)."""
import json
import shutil

import pytest

from app import config

ARCHIVO = "_archivo/los-viajes-de-tok"
GUION = {"titulo": "prueba", "musica": "misterio", "escenas": [
    {"texto": "Uno.", "imagenes": [{"prompt": "a red apple"}]},
    {"texto": "Dos.", "musica": "alegre", "imagenes": [{"prompt": "a green pear"}]},
    {"texto": "Tres.", "musica": "ninguna", "imagenes": [{"prompt": "a blue plum"}]},
]}


@pytest.fixture()
def video(cliente):
    carpeta = config.RAIZ / "canales" / ARCHIVO / "videos" / "995-prueba-musica"
    carpeta.mkdir(parents=True)
    (carpeta / "estado.json").write_text(json.dumps({"fase": "G", "completadas": ["A", "B", "C", "D", "E", "F"]}))
    (carpeta / "guion.json").write_text(json.dumps(GUION))
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal
    with Sesion() as s:
        sincronizar_canal(s, ARCHIVO)
    vid = next(v["id"] for v in cliente.get("/api/videos", params={"canal": ARCHIVO}).json()
               if v["carpeta"] == carpeta.name)
    yield carpeta, vid
    shutil.rmtree(carpeta, ignore_errors=True)


def _ambiente(datos, nombre):
    return next(a for a in datos["ambientes"] if a["ambiente"] == nombre)


def test_estado_prompt_propio_y_propia(cliente, video):
    carpeta, vid = video
    d = cliente.get(f"/api/videos/{vid}/musica").json()
    assert [a["ambiente"] for a in d["ambientes"]] == ["misterio", "alegre"]          # «ninguna» no cuenta
    assert _ambiente(d, "misterio")["escenas"] == [1] and d["creditos_por_encargo"] == 3600
    assert d["max_prompt"] == 500                                                      # de proveedores.py, no fijo en la UI
    assert "No vocals" in _ambiente(d, "misterio")["prompt"]                           # base por defecto del kit
    assert not _ambiente(d, "misterio")["prompt_propio"] and _ambiente(d, "misterio")["elegida"] is None

    r = cliente.put(f"/api/videos/{vid}/musica/alegre/prompt", json={"prompt": "  Light   folk  guitar "})
    assert _ambiente(r.json(), "alegre")["prompt"] == "Light folk guitar" and _ambiente(r.json(), "alegre")["prompt_propio"]
    assert cliente.put(f"/api/videos/{vid}/musica/alegre/prompt", json={"prompt": "x" * 501}).status_code == 422
    assert cliente.put(f"/api/videos/{vid}/musica/jazz/prompt", json={"prompt": "x"}).status_code == 422
    r = cliente.put(f"/api/videos/{vid}/musica/alegre/prompt", json={"prompt": ""})      # vuelve al del canal
    assert not _ambiente(r.json(), "alegre")["prompt_propio"]

    assert cliente.get(f"/api/videos/{vid}/musica/misterio/propia").status_code == 200    # recursos/musica del kit


def test_elegir_version_y_paso_de_la_guia(cliente, video):
    carpeta, vid = video
    assert cliente.post(f"/api/videos/{vid}/musica/misterio/elegir", json={"n": 1}).status_code == 422   # no hay
    (carpeta / "musica").mkdir()
    for amb in ("misterio", "alegre"):
        (carpeta / "musica" / f"{amb}_v1.mp3").write_bytes(b"uno")
        (carpeta / "musica" / f"{amb}_v2.mp3").write_bytes(b"dos")
    (carpeta / "musica" / "musica.json").write_text(json.dumps({amb: {"versiones": [
        {"n": 1, "archivo": f"musica/{amb}_v1.mp3", "duracion": 180.0},
        {"n": 2, "archivo": f"musica/{amb}_v2.mp3", "duracion": 175.0}]} for amb in ("misterio", "alegre")}))
    r = cliente.post(f"/api/videos/{vid}/musica/misterio/elegir", json={"n": 2})
    assert _ambiente(r.json(), "misterio")["elegida"] == 2
    assert (carpeta / "musica" / "misterio.mp3").read_bytes() == b"dos"                # la que usa montar.py

    paso = lambda: next(p for f in cliente.get(f"/api/videos/{vid}/guia").json()["fases"]
                        for p in f["pasos"] if p["id"] == "g-musica")
    assert paso()["estado"] != "hecho"                                                 # falta «alegre»
    cliente.post(f"/api/videos/{vid}/musica/alegre/elegir", json={"n": 1})
    assert paso()["estado"] == "hecho"
    r = cliente.post(f"/api/videos/{vid}/musica/alegre/elegir", json={"n": 0})          # vuelve a la propia
    assert _ambiente(r.json(), "alegre")["elegida"] is None and not (carpeta / "musica" / "alegre.mp3").exists()


def test_encargo_de_pago_exige_confirmar_el_coste(cliente, video):
    carpeta, vid = video
    lanzar = lambda a: cliente.post("/api/tareas", json={"herramienta": "musica_ai33", "video_id": vid, "argumentos": a})
    assert lanzar({"ambiente": "misterio"}).status_code == 422                           # sin confirmar
    assert lanzar({"ambiente": "misterio", "confirmado": True, "previsto": 1000}).status_code == 422   # otro coste
    assert lanzar({"ambiente": "jazz", "confirmado": True, "previsto": 3600}).status_code == 422       # no está

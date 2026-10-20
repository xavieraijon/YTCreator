"""Versión de esquema de guion.json y estado.json (herramientas/esquema.py): migrar al leer, sellar al escribir, no
rebajar nunca y avisar de archivos de una versión más nueva de YTCreator."""
import json
import os
import subprocess
import sys

import pytest

import esquema
from app import config


def test_un_estado_sin_version_se_migra_en_memoria_sin_tocar_el_original():
    viejo = {"fase": "C", "completadas": None, "aprobaciones": "mal"}
    nuevo = esquema.migrar("estado", viejo)
    assert nuevo[esquema.CAMPO] == esquema.VERSIONES["estado"] == 1
    assert nuevo["completadas"] == [] and nuevo["aprobaciones"] == {} and nuevo["pasos_hechos"] == [] and nuevo["fase"] == "C"
    assert viejo == {"fase": "C", "completadas": None, "aprobaciones": "mal"}      # copia: el dict leído no cambia
    assert esquema.migrar("estado", nuevo) is nuevo                                    # ya al día: ni se copia
    assert esquema.migrar("guion", None) == {"escenas": [], esquema.CAMPO: 1}


def test_las_migraciones_se_encadenan_en_orden(monkeypatch):
    monkeypatch.setitem(esquema.VERSIONES, "estado", 3)
    monkeypatch.setitem(esquema.MIGRACIONES, "estado", {
        **esquema.MIGRACIONES["estado"],
        1: lambda e: {**e, "pasos": e.get("pasos", "") + "1"},
        2: lambda e: {**e, "pasos": e["pasos"] + "2"}})
    assert esquema.migrar("estado", {})["pasos"] == "12"
    assert esquema.migrar("estado", {esquema.CAMPO: 2, "pasos": "x"}) == {esquema.CAMPO: 3, "pasos": "x2"}


def test_un_archivo_de_una_version_mas_nueva_no_se_toca_ni_se_rebaja():
    futuro = {esquema.CAMPO: 99, "campo_nuevo": [1, 2]}
    assert esquema.migrar("estado", futuro) is futuro
    assert esquema.sellar("estado", dict(futuro))[esquema.CAMPO] == 99
    assert "versión más nueva de YTCreator" in esquema.aviso("estado", futuro)
    assert esquema.aviso("estado", {}) is None and esquema.aviso("guion", {esquema.CAMPO: 1}) is None


@pytest.fixture()
def video(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    from tests.test_fases_ui import CANAL_JSON
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    c = tmp_path / "canales" / "prueba"
    c.mkdir(parents=True)
    (c / "canal.json").write_text(json.dumps(CANAL_JSON))
    d = cliente.post("/api/canales/prueba/videos", json={"tema": "Mente en blanco"}).json()
    return d["id"], c / "videos" / d["carpeta"]


def _estado(carpeta):
    return json.loads((carpeta / "estado.json").read_text())


def test_la_app_sella_la_version_al_crear_y_al_escribir(cliente, video):
    vid, carpeta = video
    assert _estado(carpeta)[esquema.CAMPO] == 1                       # al crear el vídeo
    e = _estado(carpeta)
    del e[esquema.CAMPO]
    (carpeta / "estado.json").write_text(json.dumps(e))               # como lo escribiría Claude sin el campo
    assert cliente.post(f"/api/videos/{vid}/aprobaciones", json={"punto": "b-aprobar"}).status_code == 200
    assert _estado(carpeta)[esquema.CAMPO] == 1


def test_un_video_de_una_version_mas_nueva_avisa_en_pantalla(cliente, video):
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal
    vid, carpeta = video
    (carpeta / "estado.json").write_text(json.dumps({**_estado(carpeta), esquema.CAMPO: 7}))
    with Sesion() as s:
        sincronizar_canal(s, "prueba")
    real = cliente.get(f"/api/videos/{vid}").json()["estado_real"]
    assert "versión más nueva" in real["esquema"] and real["vista"]   # se avisa y la pantalla sigue funcionando
    assert _estado(carpeta)[esquema.CAMPO] == 7                        # leerlo no lo rebaja


def test_la_linea_de_ordenes_informa_y_actualiza(tmp_path):
    v = tmp_path / "canales" / "c" / "videos"
    for carpeta, estado in (("001-a", {"fase": "B"}), ("002-b", {"fase": "B", esquema.CAMPO: 1}),
                            ("003-c", {"fase": "B", esquema.CAMPO: 9})):
        (v / carpeta).mkdir(parents=True)
        (v / carpeta / "estado.json").write_text(json.dumps(estado))
    (v / "001-a" / "guion.json").write_text(json.dumps({"escenas": []}))
    entorno = {**os.environ, "CANALYT_ESPACIO": str(tmp_path)}
    orden = [sys.executable, str(config.HERRAMIENTAS / "esquema.py")]
    informe = subprocess.run(orden, env=entorno, capture_output=True, text=True, check=True).stdout
    assert "1 al día · 2 por migrar · 1 de una versión más nueva" in informe
    assert esquema.CAMPO not in json.loads((v / "001-a" / "estado.json").read_text())   # solo informa
    subprocess.run(orden + ["actualizar"], env=entorno, capture_output=True, text=True, check=True)
    assert json.loads((v / "001-a" / "estado.json").read_text())[esquema.CAMPO] == 1
    assert json.loads((v / "001-a" / "guion.json").read_text())[esquema.CAMPO] == 1
    assert json.loads((v / "003-c" / "estado.json").read_text())[esquema.CAMPO] == 9      # el más nuevo, intacto

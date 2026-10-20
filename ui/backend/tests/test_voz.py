"""Voz de pago (ai33) desde la UI: coste previsto con montar.py --previsto-voz y confirmación exacta del coste.
Nada de esto locuta (montar.py sin --gastar-ai33 se para antes de gastar)."""
import os
import subprocess

from app import config, voz


def _video(cliente, canal="asombroso-y-real"):
    vs = cliente.get("/api/videos", params={"canal": canal}).json()
    return next(v for v in vs if v["carpeta"].startswith("001-"))


def test_montar_no_gasta_en_voz_sin_permiso():
    guion = config.RAIZ / "canales" / "asombroso-y-real" / "videos" / "001-phineas-gage" / "guion.json"
    r = subprocess.run([str(config.PYTHON), str(config.HERRAMIENTAS / "montar.py"), str(guion), "--solo-voces", "1"],
                       cwd=config.RAIZ, capture_output=True, text=True, env={**os.environ, "CANAL": "asombroso-y-real"})
    salida = r.stdout + r.stderr
    if "reutilizada" in salida:          # si algún día la voz ya está hecha, no hay nada que probar
        return
    assert "DE PAGO" in salida and "--gastar-ai33" in salida and "generada" not in salida


def test_prevista_y_confirmacion(cliente):
    v = _video(cliente)
    d = cliente.get(f"/api/videos/{v['id']}/voz").json()
    assert d["bloques"] and d["creditos"] == round(d["caracteres_de_pago"] * 1.15)
    if not d["pendientes"]:
        return
    assert d["prueba"]["escenas"] == next(b["escenas"] for b in d["bloques"] if not b["hecho"])
    base = {"herramienta": "voz_ai33", "video_id": v["id"]}
    r = cliente.post("/api/tareas", json={**base, "argumentos": {"solo_primero": True}})
    assert r.status_code == 422 and "confirmar" in r.json()["detail"]
    r = cliente.post("/api/tareas", json={**base, "argumentos": {"solo_primero": True, "confirmado": True,
                                                                     "previsto": d["prueba"]["creditos"] + 1}})
    assert r.status_code == 422 and "ha cambiado" in r.json()["detail"]


def test_argumentos_de_la_tarea():
    from app.tareas import HERRAMIENTAS
    h = HERRAMIENTAS["voz_ai33"]
    assert h.argumentos("g.json", {"escenas": "1,2,3"}) == ["g.json", "--solo-voces", "1,2,3", "--gastar-ai33"]
    assert voz.escenas_pendientes({"bloques": [{"escenas": [1, 2], "hecho": True}, {"escenas": [3, 4], "hecho": False},
                                               {"escenas": [5], "hecho": False}]}, solo_primero=True) == "3,4"


def test_repetir_un_bloque_hecho():
    from app.tareas import HERRAMIENTAS
    h = HERRAMIENTAS["voz_ai33"]
    assert h.argumentos("g.json", {"escenas": "1,2,3", "rehacer": "2"}) == \
        ["g.json", "--solo-voces", "1,2,3", "--rehacer-voces", "1,2,3", "--gastar-ai33"]
    datos = {"bloques": [{"escenas": [1, 2, 3], "hecho": True}, {"escenas": [4, 5], "hecho": False}]}
    assert voz.escenas_hechas(datos, "2") == "1,2,3"          # se rehace el bloque entero
    for malo in ("4", "", "x"):
        try:
            voz.escenas_hechas(datos, malo)
            raise AssertionError(f"«{malo}» debería dar ErrorVoz")
        except voz.ErrorVoz:
            pass


def test_escena_sola():
    from app.tareas import HERRAMIENTAS
    h = HERRAMIENTAS["voz_ai33"]
    assert h.argumentos("g.json", {"escenas": "2", "escena_sola": 2}) == ["g.json", "--escena-sola", "2", "--gastar-ai33"]


# --- Locución hecha fuera (subida desde la UI) -------------------------------------------------------------------------

import json  # noqa: E402

import pytest  # noqa: E402


@pytest.fixture()
def video_externa(cliente):
    """El vídeo 001 con su guion restaurado al acabar (la subida lo cambia)."""
    v = _video(cliente)
    carpeta = config.RAIZ / "canales" / "asombroso-y-real" / "videos" / v["carpeta"]
    original = (carpeta / "guion.json").read_bytes()
    yield v, carpeta
    (carpeta / "guion.json").write_bytes(original)
    for f in [*(carpeta / "voz").glob("externa*"), *(carpeta / "voz" / "anteriores").glob("externa*")]:
        f.unlink()


def _audio(tmp_path, segundos=2):
    ruta = tmp_path / "locucion.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency=200:duration={segundos}", str(ruta)],
                   check=True)
    return ruta.read_bytes()


def test_subir_una_locucion_hecha_fuera(cliente, video_externa, tmp_path):
    v, carpeta = video_externa
    r = cliente.put(f"/api/videos/{v['id']}/voz/archivo", params={"nombre": "Mi locución.MP3"}, content=_audio(tmp_path))
    assert r.status_code == 200, r.text
    assert r.json()["archivo"] == "externa.mp3" and 1.5 < r.json()["duracion"] < 2.5
    guion = json.loads((carpeta / "guion.json").read_text(encoding="utf-8"))
    assert guion["voz_archivo"] == f"videos/{v['carpeta']}/voz/externa.mp3" and guion["version_esquema"] >= 1
    d = cliente.get(f"/api/videos/{v['id']}/voz").json()
    assert d["externa"]["archivo"] == "externa.mp3"
    assert d["creditos"] == 0 and not any(b["de_pago"] for b in d["bloques"])     # hecha fuera: nada que pagar
    assert len(d["bloques"]) == 1                                                  # toda la locución, un bloque
    # Otra encima: la anterior se aparta (no se borra) y la nueva manda
    assert cliente.put(f"/api/videos/{v['id']}/voz/archivo", params={"nombre": "otra.mp3"},
                       content=_audio(tmp_path, 3)).status_code == 200
    assert len(list((carpeta / "voz" / "anteriores").glob("externa-*.mp3"))) == 1
    # La tarea gratuita que la reparte por escenas
    from app.tareas import HERRAMIENTAS
    n = len(guion["escenas"])
    assert HERRAMIENTAS["voz_externa"].argumentos(carpeta / "guion.json", {}) == \
        [str(carpeta / "guion.json"), "--solo-voces", ",".join(str(i) for i in range(1, n + 1))]
    # Quitarla: vuelve la voz del canal y el archivo queda en voz/anteriores/
    assert cliente.delete(f"/api/videos/{v['id']}/voz/archivo").status_code == 204
    assert "voz_archivo" not in json.loads((carpeta / "guion.json").read_text(encoding="utf-8"))
    assert not list((carpeta / "voz").glob("externa.*"))
    assert len(list((carpeta / "voz" / "anteriores").glob("externa-*.mp3"))) == 2
    assert cliente.get(f"/api/videos/{v['id']}/voz").json()["externa"] is None
    r = cliente.post("/api/tareas", json={"herramienta": "voz_externa", "video_id": v["id"]})
    assert r.status_code == 422 and "súbela" in r.json()["detail"]


@pytest.mark.parametrize("nombre, contenido, motivo", [
    ("notas.txt", b"hola", "Sube un audio"),
    ("falsa.mp3", b"esto no es un mp3" * 100, "no es un audio"),
    ("vacia.mp3", b"", "No ha llegado"),
])
def test_una_subida_mala_no_cambia_nada(cliente, video_externa, nombre, contenido, motivo):
    v, carpeta = video_externa
    antes = (carpeta / "guion.json").read_bytes()
    r = cliente.put(f"/api/videos/{v['id']}/voz/archivo", params={"nombre": nombre}, content=contenido)
    assert r.status_code == 422 and motivo in r.json()["detail"]
    assert (carpeta / "guion.json").read_bytes() == antes
    assert not list((carpeta / "voz").glob("externa*"))


# --- Karaoke: editar una escena, rehacer solo su voz y marcar «suena mal» ---------------------------------------------


def test_argumentos_voz_escena():
    from app.tareas import HERRAMIENTAS
    h = HERRAMIENTAS["voz_escena"]
    assert h.argumentos("g.json", {"escena_sola": 2}) == ["g.json", "--escena-sola", "2"]
    try:
        h.argumentos("g.json", {})
        raise AssertionError("sin escena_sola debería dar ErrorTarea")
    except Exception as e:
        assert "escena" in str(e)


@pytest.fixture()
def video_guion(cliente):
    """El vídeo 001 con su guion restaurado al acabar (los tests de esta sección lo editan)."""
    v = _video(cliente)
    carpeta = config.RAIZ / "canales" / "asombroso-y-real" / "videos" / v["carpeta"]
    original = (carpeta / "guion.json").read_bytes()
    yield v, carpeta
    (carpeta / "guion.json").write_bytes(original)
    (carpeta / "revision_voz.json").unlink(missing_ok=True)


def test_editar_texto_de_una_escena(cliente, video_guion):
    v, carpeta = video_guion
    r = cliente.put(f"/api/videos/{v['id']}/escena/1/texto", json={"texto": "Un texto nuevo para la escena uno."})
    assert r.status_code == 200, r.text
    guion = json.loads((carpeta / "guion.json").read_text(encoding="utf-8"))
    assert guion["escenas"][0]["texto"] == "Un texto nuevo para la escena uno."
    # Vacío no se admite, y no toca el guion
    antes = (carpeta / "guion.json").read_bytes()
    r = cliente.put(f"/api/videos/{v['id']}/escena/1/texto", json={"texto": "   "})
    assert r.status_code == 422 and "vacío" in r.json()["detail"]
    assert (carpeta / "guion.json").read_bytes() == antes
    # Una escena que no existe
    r = cliente.put(f"/api/videos/{v['id']}/escena/999/texto", json={"texto": "x"})
    assert r.status_code == 422 and "no tiene la escena" in r.json()["detail"]


def test_voz_escena_rechaza_voz_de_pago(monkeypatch):
    """Si la escena es de un bloque de pago (ai33), la tarea gratuita `voz_escena` no vale: hay que confirmar
    el coste con voz_ai33. (Con un bloque ya locutado y gratis, `_validar_voz_escena` no se queja.)"""
    from app import tareas, voz

    def gratis(video, escena):
        return {"creditos": 0}
    monkeypatch.setattr(voz, "prevista_escena", gratis)
    tareas._validar_voz_escena(None, None, {"escena_sola": 1})      # no levanta nada

    def de_pago(video, escena):
        return {"creditos": 120}
    monkeypatch.setattr(voz, "prevista_escena", de_pago)
    try:
        tareas._validar_voz_escena(None, None, {"escena_sola": 1})
        raise AssertionError("una escena de pago debería dar ErrorTarea")
    except tareas.ErrorTarea as e:
        assert "de pago" in str(e)


def test_marcar_y_quitar_suena_mal(cliente, video_guion):
    v, carpeta = video_guion
    r = cliente.put(f"/api/videos/{v['id']}/voz/escena/1/revision", json={"motivo": "La voz corta la frase"})
    assert r.status_code == 200, r.text
    datos = json.loads((carpeta / "revision_voz.json").read_text(encoding="utf-8"))
    assert datos["1"]["estado"] == "mal" and datos["1"]["motivo"] == "La voz corta la frase"
    d = cliente.get(f"/api/videos/{v['id']}").json()
    escena = next(e for e in d["escenas"] if e["numero"] == 1)
    assert escena["suena_mal"]["motivo"] == "La voz corta la frase"
    # Sin motivo, se quita de la lista
    r = cliente.put(f"/api/videos/{v['id']}/voz/escena/1/revision", json={"motivo": ""})
    assert r.status_code == 200, r.text
    assert json.loads((carpeta / "revision_voz.json").read_text(encoding="utf-8")) == {}
    d = cliente.get(f"/api/videos/{v['id']}").json()
    assert next(e for e in d["escenas"] if e["numero"] == 1)["suena_mal"] is None

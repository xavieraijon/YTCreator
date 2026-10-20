"""Marcar imágenes mal/bien y rehacerlas con el servicio elegido, sin lanzar herramientas de verdad."""
import dataclasses
import json
import shutil

import pytest
from PIL import Image

from app import config, tareas

ARCHIVO = "_archivo/los-viajes-de-tok"
GUION = {"titulo": "prueba", "escenas": [
    {"texto": "Uno.{img} Dos.", "imagenes": [{"prompt": "a red apple", "semilla": 7},
                                            {"prompt": "a man with {tok}", "motor": "ai33"}]},
    {"texto": "Tres.", "imagenes": [{"reutilizar": "01-1"}]},
]}


@pytest.fixture()
def video(cliente, tmp_path, monkeypatch):
    carpeta = config.RAIZ / "canales" / ARCHIVO / "videos" / "996-prueba-revision"
    (carpeta / "img").mkdir(parents=True)
    (carpeta / "estado.json").write_text(json.dumps({"fase": "F", "completadas": ["A", "B", "C", "D", "E"]}))
    (carpeta / "guion.json").write_text(json.dumps(GUION, ensure_ascii=False, indent=2))     # sin salto final
    Image.new("RGB", (32, 18)).save(carpeta / "img" / "01-1.png")
    # Las tareas no lanzan montar.py: un script que no hace nada.
    monkeypatch.setenv("CANALYT_TAREAS", str(tmp_path / "logs"))
    nada = tmp_path / "nada.py"
    nada.write_text("print('OK')\n")
    for clave in ("rehacer_imagen", "rehacer_imagen_ai33"):
        monkeypatch.setitem(tareas.HERRAMIENTAS, clave, dataclasses.replace(tareas.HERRAMIENTAS[clave], script=str(nada)))
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal
    with Sesion() as s:
        sincronizar_canal(s, ARCHIVO)
    vid = next(v["id"] for v in cliente.get("/api/videos", params={"canal": ARCHIVO}).json()
               if v["carpeta"] == carpeta.name)
    yield carpeta, vid
    shutil.rmtree(carpeta, ignore_errors=True)


def _img(cliente, vid, ident):
    return next(i for i in cliente.get(f"/api/videos/{vid}").json()["imagenes"] if i["ident"] == ident)


def test_marcar_mal_con_motivo_y_bien(cliente, video):
    carpeta, vid = video
    url = f"/api/videos/{vid}/imagenes/01-1/revision"
    assert cliente.post(url, json={"estado": "mal"}).status_code == 422                 # sin motivo, no
    assert cliente.post(url, json={"estado": "mal", "motivo": " Tres   brazos "}).status_code == 200
    r = _img(cliente, vid, "01-1")["revision"]
    assert r["estado"] == "mal" and r["motivo"] == "Tres brazos"
    assert cliente.post(url, json={"estado": "bien"}).status_code == 200
    assert _img(cliente, vid, "01-1")["revision"]["estado"] == "bien"
    assert cliente.post(f"/api/videos/{vid}/imagenes/02-1/revision",
                        json={"estado": "mal", "motivo": "x", "motor": "ai33"}).status_code == 422   # reutiliza


def test_cambiar_prompt_y_servicio_conserva_el_formato(cliente, video):
    carpeta, vid = video
    r = cliente.post(f"/api/videos/{vid}/imagenes/01-1/revision",
                     json={"estado": "mal", "motivo": "fruta equivocada", "prompt": "a  green pear", "motor": "ai33"})
    assert r.json()["cambios"] == ["prompt cambiado", "servicio klein → ai33"]
    texto = (carpeta / "guion.json").read_text(encoding="utf-8")
    assert not texto.endswith("\n")                                         # mismo formato que tenía
    spec = json.loads(texto)["escenas"][0]["imagenes"][0]
    assert spec["prompt"] == "a green pear" and spec["motor"] == "ai33"
    assert json.loads(texto)["escenas"][0]["imagenes"][1]["prompt"] == "a man with {tok}"   # lo demás, igual
    cliente.post(f"/api/videos/{vid}/imagenes/01-1/revision", json={"estado": "mal", "motivo": "otra vez", "motor": "klein"})
    assert "motor" not in json.loads((carpeta / "guion.json").read_text())["escenas"][0]["imagenes"][0]


def test_rehacer_con_klein_guarda_la_anterior_y_quita_la_semilla(cliente, video):
    carpeta, vid = video
    cliente.post(f"/api/videos/{vid}/imagenes/01-1/revision", json={"estado": "mal", "motivo": "tres brazos"})
    # El servicio tiene que coincidir con el del guion: 01-2 es de ai33.
    r = cliente.post("/api/tareas", json={"herramienta": "rehacer_imagen", "video_id": vid,
                                          "argumentos": {"ids": "01-2", "motor": "cloudflare"}})
    assert r.status_code == 422
    r = cliente.post("/api/tareas", json={"herramienta": "rehacer_imagen", "video_id": vid,
                                          "argumentos": {"ids": "01-1", "motor": "local"}})
    assert r.status_code == 201, r.text
    t = cliente.get(f"/api/tareas/{r.json()['id']}").json()
    assert "01-1" in t["titulo"]
    assert t["comando"][-5:] == ["--rehacer-imagenes", "01-1", "--solo", "--motor", "local"]
    assert "semilla" not in json.loads((carpeta / "guion.json").read_text())["escenas"][0]["imagenes"][0]
    anteriores = list((carpeta / "img" / "anteriores").glob("01-1_*.png"))
    assert len(anteriores) == 1
    marca = json.loads((carpeta / "revision_imagenes.json").read_text())["01-1"]
    assert marca["rehecha_desde"] and marca["historial"][-1]["accion"] == "rehacer con este ordenador (gratis)"
    rev = _img(cliente, vid, "01-1")["revision"]
    assert rev["anteriores"][0].startswith("videos/996-prueba-revision/img/anteriores/")


def test_rehacer_con_ai33_pide_confirmar_el_coste(cliente, video, monkeypatch, tmp_path):
    carpeta, vid = video
    base = {"herramienta": "rehacer_imagen_ai33", "video_id": vid}
    assert cliente.post("/api/tareas", json={**base, "argumentos": {"ids": "01-2"}}).status_code == 422
    # Confirmado el coste, la tarea se crea; aquí se cambia `montar.py` por un script inofensivo (no se lanza nada real).
    from app import tareas
    inofensivo = tmp_path / "inofensivo.py"
    inofensivo.write_text("print('OK')\n")
    import dataclasses
    monkeypatch.setitem(tareas.HERRAMIENTAS, "rehacer_imagen_ai33",
                        dataclasses.replace(tareas.HERRAMIENTAS["rehacer_imagen_ai33"], script=str(inofensivo)))
    r = cliente.post("/api/tareas", json={**base, "argumentos": {"ids": "01-2", "confirmado": True, "previsto": 1}})
    assert r.status_code == 201


def test_la_guia_no_da_por_buenas_las_imagenes_con_marcas(cliente, video):
    carpeta, vid = video
    def paso(pid):
        g = cliente.get(f"/api/videos/{vid}/guia").json()
        return next(p for f in g["fases"] for p in f["pasos"] if p["id"] == pid)
    assert paso("f-marcadas")["estado"] == "hecho"
    cliente.post(f"/api/videos/{vid}/imagenes/01-1/revision", json={"estado": "mal", "motivo": "tres brazos"})
    assert paso("f-marcadas")["estado"] == "pendiente"
    cliente.post(f"/api/videos/{vid}/imagenes/01-1/revision", json={"estado": "bien"})
    assert paso("f-marcadas")["estado"] == "hecho"


def test_modo_revision_lote_y_quedarme_con_la_anterior(cliente, video):
    """Modo revisión: etiquetas en la marca, aplicar en lote (servicio) y «me quedo con la anterior»."""
    carpeta, vid = video
    url = f"/api/videos/{vid}/imagenes/01-1/revision"
    assert cliente.post(url, json={"estado": "mal", "motivo": "Cantidad incorrecta",
                                   "etiquetas": ["cantidad"]}).status_code == 200
    marcas = json.loads((carpeta / "revision_imagenes.json").read_text())
    assert marcas["01-1"]["etiquetas"] == ["cantidad"]
    assert _img(cliente, vid, "01-1")["voz"] == "Uno."               # lo que dice la voz en esa imagen
    r = cliente.post(f"/api/videos/{vid}/revision/lote/aplicar",
                     json={"cambios": [{"ident": "01-1", "prompt": "two red apples", "motor": "ai33"}]})
    assert r.status_code == 200 and "prompt cambiado" in r.json()["cambios"]["01-1"]
    spec = json.loads((carpeta / "guion.json").read_text())["escenas"][0]["imagenes"][0]
    assert spec["prompt"] == "two red apples" and spec["motor"] == "ai33"
    assert _img(cliente, vid, "01-1")["revision"]["estado"] == "mal"   # sigue en la bandeja hasta rehacerla
    # Sin versión anterior, no hay a qué volver.
    assert cliente.post(f"/api/videos/{vid}/imagenes/01-1/restaurar").status_code == 422
    anteriores = carpeta / "img" / "anteriores"
    anteriores.mkdir()
    Image.new("RGB", (32, 18), "red").save(anteriores / "01-1_20260101T000000.png")
    assert cliente.post(f"/api/videos/{vid}/imagenes/01-1/restaurar").status_code == 200
    with Image.open(carpeta / "img" / "01-1.png") as im:
        assert im.getpixel((0, 0)) == (255, 0, 0)                       # vuelve la anterior
    assert len(list(anteriores.glob("01-1_*.png"))) == 2                 # la que había, guardada
    i = _img(cliente, vid, "01-1")
    assert i["revision"]["estado"] == "bien" and not i["desactualizada"]  # al día: montar.py no la rehace


def test_marcar_bien_una_desactualizada_la_deja_al_dia(cliente, video):
    """Hecha con un prompt anterior al del guion y aprobada: «Está bien» la acepta tal cual (no queda «a rehacer»)."""
    carpeta, vid = video
    (carpeta / "img" / "01-1.firma").write_text("firma-de-un-prompt-viejo")
    assert _img(cliente, vid, "01-1")["desactualizada"]
    assert cliente.post(f"/api/videos/{vid}/imagenes/01-1/revision", json={"estado": "bien"}).status_code == 200
    assert not _img(cliente, vid, "01-1")["desactualizada"]
    historial = json.loads((carpeta / "revision_imagenes.json").read_text())["01-1"]["historial"]
    assert historial[-1]["accion"].startswith("aceptada tal cual")
    # Si ya estaba al día, marcarla otra vez no añade nada.
    assert cliente.post(f"/api/videos/{vid}/imagenes/01-1/revision", json={"estado": "bien"}).status_code == 200
    assert len(json.loads((carpeta / "revision_imagenes.json").read_text())["01-1"]["historial"]) == len(historial) + 1


def test_escritura_atomica_conserva_permisos_y_no_deja_temporales(tmp_path):
    import archivos
    ruta = tmp_path / "estado.json"
    archivos.escribir_json(ruta, {"fase": "A"})
    ruta.chmod(0o644)
    archivos.escribir_json(ruta, {"fase": "B"})
    assert json.loads(ruta.read_text()) == {"fase": "B"} and ruta.read_text().endswith("\n")
    assert ruta.stat().st_mode & 0o777 == 0o644
    secreto = tmp_path / ".env"
    archivos.escribir_texto(secreto, "CLAVE=x\n", permisos=0o600)
    assert secreto.stat().st_mode & 0o777 == 0o600
    assert sorted(p.name for p in tmp_path.iterdir()) == [".env", "estado.json"]


def test_escritura_atomica_si_falla_no_toca_el_original(tmp_path):
    import archivos
    ruta = tmp_path / "guion.json"
    archivos.escribir_json(ruta, {"ok": True})
    with pytest.raises(TypeError):
        archivos.escribir_json(ruta, {"mal": object()})        # no serializable
    assert json.loads(ruta.read_text()) == {"ok": True}
    assert [p.name for p in tmp_path.iterdir()] == ["guion.json"]

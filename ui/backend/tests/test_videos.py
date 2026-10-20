import json
import shutil

import pytest

from app import config

ARCHIVO = "_archivo/los-viajes-de-tok"


def _videos(cliente, **params):
    return cliente.get("/api/videos", params=params).json()


def test_indexa_los_videos_del_archivo(cliente):
    carpetas = {v["carpeta"] for v in _videos(cliente, canal=ARCHIVO)}
    assert {"001-pulpo-nueve-cerebros", "S001-venus-dia-ano", "S002-diez-dias-1582"} <= carpetas
    assert "_pruebas" not in carpetas


def test_detalle_de_un_short_cerrado(cliente):
    s002 = next(v for v in _videos(cliente, canal=ARCHIVO) if v["carpeta"] == "S002-diez-dias-1582")
    d = cliente.get(f"/api/videos/{s002['id']}").json()
    assert d["tipo"] == "short"
    assert [f["estado"] for f in d["fases"]] == ["hecha"] * 5          # cerrado: todas hechas
    assert d["escenas_total"] == len(d["escenas"]) > 0
    assert d["imagenes_total"] == len(d["imagenes"]) > 0
    assert d["imagenes_hechas"] > 0 and d["tiene_final"] is True
    assert "guion.md" in d["documentos"]
    assert len(d["notas"]) > 3                                      # notas separadas por " | "
    assert all("{" not in e["texto"] and "[excited]" not in e["texto"] for e in d["escenas"])


def test_largo_aparcado_con_fase_actual(cliente):
    pulpo = next(v for v in _videos(cliente, canal=ARCHIVO) if v["carpeta"].startswith("001-"))
    d = cliente.get(f"/api/videos/{pulpo['id']}").json()
    assert d["tipo"] == "largo" and d["aparcado"] is True
    estados = {f["letra"]: f["estado"] for f in d["fases"]}
    assert estados["E"] == "hecha" and estados["F"] == "actual" and estados["G"] == "pendiente"
    assert any(i["origen"] == "reutilizar" for i in d["imagenes"])


def test_en_curso_no_incluye_archivados_ni_cerrados(cliente):
    assert all(not v["canal"].startswith("_archivo/") for v in _videos(cliente, en_curso=True))


def test_documento_permitido_y_no_permitido(cliente):
    s002 = next(v for v in _videos(cliente, canal=ARCHIVO) if v["carpeta"] == "S002-diez-dias-1582")
    r = cliente.get(f"/api/videos/{s002['id']}/documentos/guion.md")
    assert r.status_code == 200 and r.json()["texto"]
    assert cliente.get(f"/api/videos/{s002['id']}/documentos/estado.json").status_code == 404
    assert cliente.get(f"/api/videos/{s002['id']}/documentos/..%2F..%2Fcanal.json").status_code == 404


def test_detalle_de_canal_con_ficha(cliente):
    d = cliente.get(f"/api/canales/{ARCHIVO}").json()
    assert d["slug"] == ARCHIVO and d["archivado"] is True
    assert cliente.get("/api/canales/no-existe").status_code == 404


@pytest.fixture()
def video_temporal():
    """Un vídeo de prueba dentro del canal archivado (se borra al terminar)."""
    carpeta = config.RAIZ / "canales" / ARCHIVO / "videos" / "999-prueba-ui"
    carpeta.mkdir()
    (carpeta / "estado.json").write_text(json.dumps({"fase": "D", "completadas": ["A", "B", "C"]}))
    yield carpeta
    shutil.rmtree(carpeta, ignore_errors=True)


def test_resincronizar_conserva_el_id_y_borra_lo_que_desaparece(cliente, video_temporal):
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal

    with Sesion() as s:
        sincronizar_canal(s, ARCHIVO)
    v = next(v for v in _videos(cliente, canal=ARCHIVO) if v["carpeta"] == "999-prueba-ui")
    assert v["fase"] == "D" and v["titulo"] is None and v["escenas_total"] == 0

    (video_temporal / "estado.json").write_text(json.dumps({"fase": "E", "completadas": ["A", "B", "C", "D"]}))
    with Sesion() as s:
        sincronizar_canal(s, ARCHIVO)
    v2 = next(x for x in _videos(cliente, canal=ARCHIVO) if x["carpeta"] == "999-prueba-ui")
    assert v2["id"] == v["id"] and v2["fase"] == "E"

    shutil.rmtree(video_temporal)
    with Sesion() as s:
        sincronizar_canal(s, ARCHIVO)
    assert "999-prueba-ui" not in {x["carpeta"] for x in _videos(cliente, canal=ARCHIVO)}


def test_estado_json_roto_no_rompe_el_indice(cliente, video_temporal):
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal

    (video_temporal / "estado.json").write_text("{a medio escribir")
    with Sesion() as s:
        sincronizar_canal(s, ARCHIVO)
    v = next(v for v in _videos(cliente, canal=ARCHIVO) if v["carpeta"] == "999-prueba-ui")
    assert v["fase"] is None


def test_prompts_por_escena_con_el_prompt_final(cliente):
    pulpo = next(v for v in _videos(cliente, canal=ARCHIVO) if v["carpeta"].startswith("001-"))
    d = cliente.get(f"/api/videos/{pulpo['id']}").json()
    p = cliente.get(f"/api/videos/{pulpo['id']}/prompts").json()
    assert len(p["escenas"]) == d["escenas_total"]
    assert [i["ident"] for e in p["escenas"] for i in e["imagenes"]] == [i["ident"] for i in d["imagenes"]]
    con_prompt = [i for e in p["escenas"] for i in e["imagenes"] if i["prompt"]]
    assert con_prompt and all(i["prompt_final"] and "{" not in i["prompt_final"] for i in con_prompt)
    assert p["estilo"] and "{escena}" in p["estilo"]
    finales = {i["ident"]: i["prompt_final"] for e in p["escenas"] for i in e["imagenes"]}
    assert all(i["prompt_final"] == finales[i["ident"]] for i in d["imagenes"])   # el detalle trae el mismo
    assert d["guia"]["aspecto"] == "16:9" and d["guia"]["modelo"]
    listas = sum(i["existe"] and not i["desactualizada"] for i in d["imagenes"])
    assert d["imagenes_hechas"] == listas                     # «listas»: existen y al día (no las que se rehacen)
    assert all(i["en_cola"] is False for i in d["imagenes"])


def test_guia_manual_con_la_referencia_de_estilo(cliente, video_temporal):
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal

    ref = f"videos/{video_temporal.name}/img/07-5.png"
    (video_temporal / "guion.json").write_text(json.dumps({"ai33": {"referencias_estilo": [ref]}, "escenas": []}))
    with Sesion() as s:
        sincronizar_canal(s, ARCHIVO)
    v = next(v for v in _videos(cliente, canal=ARCHIVO) if v["carpeta"] == video_temporal.name)
    g = cliente.get(f"/api/videos/{v['id']}").json()["guia"]
    assert g["referencias"] == [{"nombre": "07-5.png", "ruta": ref, "existe": False}]
    assert g["instruccion"].startswith("The first attached image is the style reference.")
    assert "paper grain texture" in g["instruccion"] and g["instruccion"].endswith("New scene: ")
    assert g["aspecto"] == "16:9"

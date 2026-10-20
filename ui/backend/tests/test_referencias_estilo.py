"""Imagen de referencia del paso «Estilo visual»: subir, añadir por dirección, quitar, que llegue a prueba.json y a
laboratorio_estilo.py, y lo que se le dice a Claude."""
import io
import json

import pytest
from PIL import Image

import laboratorio_estilo as lab
from app import canal_guiado, referencias_estilo
from tests.test_canal_guiado import ESTILOS, _en_fase_d, espacio  # noqa: F401  (fixture)


def _png(lado=40) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (lado, lado), "white").save(b, "PNG")
    return b.getvalue()


@pytest.fixture()
def pruebas(cliente, espacio, tmp_path):  # noqa: F811
    carpeta = _en_fase_d(tmp_path)
    p = carpeta / "videos" / "_pruebas" / "estilo"
    p.mkdir(parents=True)
    (p / "prueba.json").write_text(json.dumps(ESTILOS))
    return p


def test_subir_y_quitar_referencias(cliente, pruebas):
    r = cliente.put("/api/asistente/canal/estilo/referencia", params={"nombre": "x.png"}, content=_png())
    assert r.status_code == 200
    refs = r.json()["referencias"]
    assert [x["nombre"] for x in refs] == ["ref-1.png"] and refs[0]["url"].startswith("ruina/videos/_pruebas/estilo/referencias/ref-1.png?v=")
    assert json.loads((pruebas / "prueba.json").read_text())["referencias"] == ["referencias/ref-1.png"]
    assert cliente.get("/api/asistente/canal").json()["estilos"]["referencias"][0]["nombre"] == "ref-1.png"
    r = cliente.delete("/api/asistente/canal/estilo/referencia/ref-1.png")
    assert r.json() == {"referencias": []}
    assert "referencias" not in json.loads((pruebas / "prueba.json").read_text())
    assert cliente.delete("/api/asistente/canal/estilo/referencia/ref-9.png").status_code == 404
    assert cliente.delete("/api/asistente/canal/estilo/referencia/..%2Fprueba.json").status_code in (404, 405, 422)


def test_lo_que_no_es_imagen_se_rechaza_y_el_limite_es_cuatro(cliente, pruebas):
    r = cliente.put("/api/asistente/canal/estilo/referencia", params={"nombre": "x.png"}, content=b"no soy una imagen")
    assert r.status_code == 422
    assert not list((pruebas / "referencias").glob("*.part"))
    for _ in range(4):
        assert cliente.put("/api/asistente/canal/estilo/referencia", params={"nombre": "x.png"}, content=_png()).status_code == 200
    r = cliente.put("/api/asistente/canal/estilo/referencia", params={"nombre": "x.png"}, content=_png())
    assert r.status_code == 422 and "4" in r.json()["detail"]


def test_por_direccion(cliente, pruebas, monkeypatch):
    def falsa(url, parcial):
        parcial.parent.mkdir(parents=True, exist_ok=True)
        parcial.write_bytes(_png())
    monkeypatch.setattr(referencias_estilo, "descargar", falsa)
    r = cliente.post("/api/asistente/canal/estilo/referencia", json={"direccion": "https://ejemplo.com/a.png"})
    assert r.status_code == 200 and len(r.json()["referencias"]) == 1


@pytest.mark.parametrize("url", ["http://127.0.0.1:8765/x.png", "http://localhost/x.png", "file:///etc/passwd",
                                 "http://10.0.0.5/x.png", "ftp://ejemplo.com/x.png", "sin esquema"])
def test_direcciones_que_no_son_de_internet(tmp_path, url):
    with pytest.raises(referencias_estilo.ErrorReferencia):
        referencias_estilo.descargar(url, tmp_path / "x.part")


def test_fuera_del_paso_no_se_toca(cliente, espacio):  # noqa: F811
    assert cliente.put("/api/asistente/canal/estilo/referencia", params={"nombre": "x.png"}, content=_png()).status_code == 409


def test_la_tarea_reimpone_las_referencias_reales(pruebas):
    (pruebas / "referencias").mkdir()
    Image.new("RGB", (8, 8)).save(pruebas / "referencias" / "ref-1.png")
    p = json.loads((pruebas / "prueba.json").read_text())
    p["referencias"] = ["inventada.png"]            # Claude reescribió el archivo
    (pruebas / "prueba.json").write_text(json.dumps(p))
    referencias_estilo.fijar(pruebas)
    assert json.loads((pruebas / "prueba.json").read_text())["referencias"] == ["referencias/ref-1.png"]


def test_laboratorio_escenas_simples_y_referencias(tmp_path):
    prueba = {"estilos_simples": ["S"], "escenas_simples": {"a": "a stick figure"}, "referencia_en": ["S"],
              "referencias": ["referencias/ref-1.png"]}
    assert lab.escena_de("a", "compleja", "S", prueba) == "a stick figure"
    assert lab.escena_de("a", "compleja", "R", prueba) == "compleja"
    assert lab.escena_de("b", "otra", "S", prueba) == "otra"
    (tmp_path / "referencias").mkdir()
    Image.new("RGB", (8, 8)).save(tmp_path / "referencias" / "ref-1.png")
    assert len(lab.referencias_de(prueba, "S", tmp_path)) == 1
    assert lab.referencias_de(prueba, "R", tmp_path) == []          # el estilo realista no las recibe
    refs = lab.referencias_de(prueba, "S", tmp_path)
    antes = lab.huella_de("p", refs)
    assert lab.huella_de("p", []) == "p" and antes != "p"
    Image.new("RGB", (8, 8), "red").save(tmp_path / "referencias" / "ref-1.png")
    assert lab.huella_de("p", lab.referencias_de(prueba, "S", tmp_path)) != antes


def test_el_encargo_a_claude(pruebas):
    creacion = {"slug": "ruina", "nombre": "Ruina"}
    sin = canal_guiado.mensaje_estilo("stickman con cara de perro", False, creacion)
    assert "NO hay imagen de referencia" in sin and "escenas_simples" in sin and "estilos_simples" in sin
    Image.new("RGB", (8, 8)).save(pruebas.parent / "x.png")
    (pruebas / "referencias").mkdir()
    Image.new("RGB", (8, 8)).save(pruebas / "referencias" / "ref-1.png")
    con = canal_guiado.mensaje_estilo("stickman", False, creacion)
    assert "ha subido 1 imagen" in con and "referencia_en" in con and "NO hay imagen" not in con


def _con_imagenes(pruebas):
    ids = list(json.loads((pruebas / "prueba.json").read_text())["estilos"])
    huellas = {}
    for i in ids:
        f = pruebas / f"{i}_klein_banco.png"
        f.write_bytes(_png())
        huellas[f.name] = "p"
    (pruebas / "prompts.json").write_text(json.dumps(huellas))
    return ids


def test_quitar_un_estilo_borra_sus_imagenes(cliente, pruebas):
    ids = _con_imagenes(pruebas)
    assert len(ids) >= 2
    assert cliente.delete(f"/api/asistente/canal/estilo/{ids[0]}").status_code == 200
    assert not (pruebas / f"{ids[0]}_klein_banco.png").exists()
    assert (pruebas / f"{ids[1]}_klein_banco.png").exists()
    assert ids[0] not in json.loads((pruebas / "prueba.json").read_text())["estilos"]
    huellas = json.loads((pruebas / "prompts.json").read_text())
    assert f"{ids[0]}_klein_banco.png" not in huellas and f"{ids[1]}_klein_banco.png" in huellas
    assert ids[0] not in [x["id"] for x in cliente.get("/api/asistente/canal").json()["estilos"]["estilos"]]
    assert cliente.delete(f"/api/asistente/canal/estilo/{ids[0]}").status_code == 404


def test_empezar_de_cero_limpia_todo(cliente, pruebas):
    ids = _con_imagenes(pruebas)
    (pruebas / "referencias").mkdir()
    Image.new("RGB", (8, 8)).save(pruebas / "referencias" / "ref-1.png")
    assert cliente.delete("/api/asistente/canal/estilos").status_code == 200
    assert not (pruebas / "prueba.json").exists()
    assert not list(pruebas.glob("*_klein_*.png"))
    assert not (pruebas / "referencias" / "ref-1.png").exists()
    e = cliente.get("/api/asistente/canal").json()["estilos"]
    assert e["estilos"] == [] and e["referencias"] == []
    assert ids


def test_quitar_estilos_fuera_del_paso(cliente, espacio):  # noqa: F811
    assert cliente.delete("/api/asistente/canal/estilos").status_code == 409
    assert cliente.delete("/api/asistente/canal/estilo/x").status_code == 409


def test_descripcion_de_la_referencia(cliente, pruebas):
    cliente.put("/api/asistente/canal/estilo/referencia", params={"nombre": "x.png"}, content=_png())
    r = cliente.put("/api/asistente/canal/estilo/referencia/ref-1.png/descripcion", json={"descripcion": "  solo el trazo,\n con cara de perro "})
    assert r.json()["referencias"][0]["descripcion"] == "solo el trazo, con cara de perro"
    assert cliente.get("/api/asistente/canal").json()["estilos"]["referencias"][0]["descripcion"] == "solo el trazo, con cara de perro"
    creacion = {"slug": "ruina", "nombre": "Ruina"}
    assert "solo el trazo, con cara de perro" in canal_guiado.mensaje_estilo("stickman", False, creacion)
    assert cliente.put("/api/asistente/canal/estilo/referencia/ref-9.png/descripcion", json={"descripcion": "x"}).status_code == 404
    r = cliente.put("/api/asistente/canal/estilo/referencia/ref-1.png/descripcion", json={"descripcion": ""})
    assert r.json()["referencias"][0]["descripcion"] == ""
    cliente.put("/api/asistente/canal/estilo/referencia/ref-1.png/descripcion", json={"descripcion": "otra"})
    cliente.delete("/api/asistente/canal/estilo/referencia/ref-1.png")
    cliente.put("/api/asistente/canal/estilo/referencia", params={"nombre": "x.png"}, content=_png())
    assert cliente.get("/api/asistente/canal").json()["estilos"]["referencias"][0]["descripcion"] == ""


def test_imagen_propia_de_un_estilo(cliente, pruebas):
    e = cliente.get("/api/asistente/canal").json()["estilos"]
    est = e["estilos"][0]
    escena = e["escenas"][0]["id"]
    assert est["pedidos"][escena] and escena not in est["imagenes"]
    faltan = e["faltan"]
    url = f"/api/asistente/canal/estilo/{est['id']}/imagen/{escena}"
    assert cliente.put(url, content=b"no soy una imagen").status_code == 422
    assert cliente.put(url, content=_png(60)).status_code == 200
    e = cliente.get("/api/asistente/canal").json()["estilos"]
    assert escena in e["estilos"][0]["imagenes"] and e["faltan"] == faltan - 1
    assert cliente.put(f"/api/asistente/canal/estilo/{est['id']}/imagen/no_existe", content=_png()).status_code == 422


def test_prompt_con_anatomia_y_referencia():
    prueba = {"paleta": "p"}
    sin = lab.prompt_de("{escena}, flat vector, {paleta}", "a stick figure", prueba, False, True)
    assert sin.startswith("a stick figure, flat vector, p.") and "exactly one head, two arms and two legs" in sin
    assert "reference image" not in sin
    con = lab.prompt_de("{escena}, flat vector.", "a stick figure", prueba, True, True)
    assert "Copy the visual style of the reference image" in con and ".." not in con


def test_el_encargo_pide_precision(pruebas):
    m = canal_guiado.mensaje_estilo("stickman", False, {"slug": "ruina", "nombre": "Ruina"})
    assert "PRECISIÓN" in m and "ESTÁTICAS" in m


def test_anatomia_solo_si_el_estilo_tiene_cuerpo():
    p = {"estilos_con_cuerpo": ["A"]}
    assert lab.lleva_cuerpo(p, "A") and not lab.lleva_cuerpo(p, "B")
    assert "Correct anatomy" in lab.prompt_de("{escena}", "x", p, False, True)
    assert lab.prompt_de("{escena}", "un faro", p) == "un faro"


def test_ajustar_un_estilo(cliente, pruebas, monkeypatch):
    enviados = []

    async def falso(s, mensaje):
        enviados.append(mensaje)
    from app.rutas import asistente
    monkeypatch.setattr(asistente, "_encargar", falso)
    (pruebas / "E1_tinta_klein_banco.png").write_bytes(_png())
    r = cliente.post("/api/asistente/canal/estilo/E1_tinta/ajustar", json={"comentario": " tiene tres  brazos "})
    assert r.status_code == 200
    m = enviados[0]
    assert "E1_tinta_klein_banco.png" in m and "tiene tres brazos" in m and "SOLO ese estilo" in m
    assert cliente.post("/api/asistente/canal/estilo/nada/ajustar", json={"comentario": ""}).status_code == 404

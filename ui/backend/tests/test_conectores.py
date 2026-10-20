"""Conectar un servicio (plan 8b-A): los conectores del usuario entran en el catálogo, se eligen, guardan su clave y se prueban
sin gastar. Sin red: `conector_ia.requests` está sustituido."""
import json

import conector_ia
import pytest
import servicios


def spec(**extra):
    base = {"id": "demo", "nombre": "Demo", "capacidad": "imagen", "base": "https://api.ejemplo.com",
            "clave_env": "DEMO_API_KEY", "auth": {"tipo": "bearer"},
            "peticion": {"metodo": "POST", "ruta": "/v1/img", "cuerpo": {"prompt": "{prompt}"}},
            "respuesta": {"formato": "url", "donde": "data.0.url"}}
    base.update(extra)
    return base


@pytest.fixture
def espacio_c(tmp_path, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "RAIZ", tmp_path)
    monkeypatch.setattr(conector_ia, "CARPETA", tmp_path / "proveedores")
    monkeypatch.setenv("CANALYT_AJUSTES", str(tmp_path / "ajustes.json"))
    monkeypatch.setattr(servicios, "motor_local_instalado", lambda: False)
    monkeypatch.delenv("DEMO_API_KEY", raising=False)
    monkeypatch.setattr(conector_ia, "load_dotenv", lambda *a, **k: None)
    monkeypatch.setattr(servicios.espacio, "ENV", tmp_path / ".env")
    (tmp_path / ".env").write_text("")
    return tmp_path


def test_guardar_valida_y_entra_en_el_catalogo(cliente, espacio_c):
    assert cliente.put("/api/conectores", json={"spec": spec(base="http://x.com")}).status_code == 422
    assert cliente.put("/api/conectores", json={"spec": spec(id="ai33")}).status_code == 422          # ya es del programa
    assert cliente.put("/api/conectores", json={"spec": spec(capacidad="video")}).status_code == 422
    assert cliente.put("/api/conectores", json={"spec": spec()}).status_code == 200
    d = cliente.get("/api/servicios").json()
    demo = next(s for s in d["servicios"] if s["id"] == "demo")
    assert demo["conector"] and demo["hace"] == ["imagen"] and not demo["conectado"] and demo["tipo"] == "gratis"
    assert demo["claves"] == [{"clave": "DEMO_API_KEY", "texto": "Clave de API", "ayuda": "La de tu cuenta en ese servicio",
                               "rellena": False}]


def test_la_clave_del_conector_se_guarda_y_no_se_devuelve(cliente, espacio_c):
    assert cliente.put("/api/ajustes/clave", json={"clave": "DEMO_API_KEY", "valor": "secreta-1"}).status_code == 422
    cliente.put("/api/conectores", json={"spec": spec()})
    assert cliente.put("/api/ajustes/clave", json={"clave": "DEMO_API_KEY", "valor": "secreta-1"}).status_code == 200
    d = cliente.get("/api/servicios").json()
    demo = next(s for s in d["servicios"] if s["id"] == "demo")
    assert demo["conectado"] and demo["disponible"] and d["resumen"]["imagen"] == ["demo"]
    assert "secreta-1" not in json.dumps(d) and "secreta-1" not in json.dumps(cliente.get("/api/conectores/demo").json())


def test_elegir_y_borrar_un_conector(cliente, espacio_c):
    cliente.put("/api/conectores", json={"spec": spec()})
    d = cliente.put("/api/servicios/demo", json={"activo": False}).json()
    assert next(s for s in d["servicios"] if s["id"] == "demo")["elegido"]
    assert cliente.delete("/api/conectores/demo").status_code == 200
    assert cliente.get("/api/conectores/demo").status_code == 404
    assert all(s["id"] != "demo" for s in cliente.get("/api/servicios").json()["servicios"])
    assert cliente.delete("/api/conectores/demo").status_code == 404


def test_un_archivo_roto_no_tumba_la_lista(cliente, espacio_c):
    (espacio_c / "proveedores").mkdir()
    (espacio_c / "proveedores" / "roto.json").write_text("{no")
    assert cliente.get("/api/servicios").status_code == 200
    roto = next(c for c in cliente.get("/api/conectores").json()["conectores"] if c["id"] == "roto")
    assert not roto["valido"]


def test_probar_de_pago_exige_aceptar_el_coste_y_el_modo_sin_gasto_no_envia(cliente, espacio_c, monkeypatch):
    monkeypatch.setenv("DEMO_API_KEY", "k")
    cliente.put("/api/conectores", json={"spec": spec(coste={"cantidad": 0.04, "unidad": "USD"})})
    monkeypatch.setattr(conector_ia.requests, "request", lambda *a, **k: pytest.fail("no debe enviar"))
    r = cliente.post("/api/conectores/demo/probar", json={}).json()
    assert not r["ok"] and "--gastar" in r["mensaje"]
    r = cliente.post("/api/conectores/demo/probar", json={"gastar": True}).json()        # modo sin gasto de las pruebas
    assert not r["ok"] and r["coste"] == 0


def test_probar_gratis_funciona(cliente, espacio_c, monkeypatch):
    monkeypatch.setenv("DEMO_API_KEY", "k")
    cliente.put("/api/conectores", json={"spec": spec()})

    class R:
        status_code, ok, content = 200, True, b"PNG"
        def raise_for_status(self): pass
        def json(self): return {"data": [{"url": "https://c.ejemplo.com/a.png"}]}
    monkeypatch.setattr(conector_ia.requests, "request", lambda *a, **k: R())
    monkeypatch.setattr(conector_ia.requests, "get", lambda *a, **k: R())
    assert cliente.post("/api/conectores/demo/probar", json={}).json()["ok"]


def test_integrar_devuelve_la_propuesta_sin_guardar(cliente, espacio_c, monkeypatch):
    from app.rutas import conectores
    monkeypatch.setattr(conectores.motor_ia, "ejecutar", lambda *a, **k: ("Aquí va:\n" + json.dumps(spec(base="http://mal.com")), {}))
    r = cliente.post("/api/conectores/integrar", json={"capacidad": "imagen", "documentacion": "POST /v1/img"}).json()
    assert r["spec"]["id"] == "demo" and r["problemas"]
    assert cliente.get("/api/conectores/demo").status_code == 404
    assert cliente.post("/api/conectores/integrar", json={"capacidad": "imagen", "documentacion": " "}).status_code == 422
    monkeypatch.setattr(conectores.motor_ia, "ejecutar", lambda *a, **k: ("no sé", {}))
    assert cliente.post("/api/conectores/integrar", json={"capacidad": "imagen", "documentacion": "x"}).status_code == 502


def test_cabecera_enseña_el_conector_con_su_nombre_y_su_gasto(cliente, espacio_c, monkeypatch):
    """Plan 8b-B: un servicio conectado sin cuota consultable sale en la cabecera con el nombre del usuario y lo gastado."""
    import uso
    from app.rutas import tareas
    monkeypatch.setattr(tareas, "_consultar_cuotas", lambda: {})
    monkeypatch.setattr(uso, "REGISTRO", espacio_c / "uso.jsonl")
    assert cliente.put("/api/conectores", json={"spec": spec(nombre="Mi servicio")}).status_code == 200
    assert cliente.get("/api/cuotas", params={"refrescar": True}).json()["otros"] == []         # sin clave: no sale
    (espacio_c / ".env").write_text("DEMO_API_KEY=abc\n")
    uso.registrar("conector:demo", 0.04, "USD · a.png")
    uso.registrar("conector:demo", 0.04, "USD · b.png")
    r = cliente.get("/api/cuotas", params={"refrescar": True}).json()
    assert r["otros"] == [{"id": "demo", "nombre": "Mi servicio", "hace": ["Imágenes"], "de_pago": False,
                           "gastado_total": 0.08, "gastado_hoy": 0.08, "unidad": "USD"}]
    assert r["nombres"]["ai33"] == "ai33.pro"

"""Conector universal de IA (plan 8b-D): descripciones, plantillas, ejecución síncrona y en cola, errores tipados y modo sin
gasto. Sin red ni gasto: `requests` está sustituido."""
import base64
import json

import conector_ia as c
import pytest


class Resp:
    def __init__(self, estado=200, datos=None, contenido=b"", texto=""):
        self.status_code, self._d, self.content, self.text = estado, datos, contenido, texto or json.dumps(datos)
        self.ok = estado < 400

    def raise_for_status(self):
        if not self.ok:
            raise c.requests.HTTPError(self.status_code)

    def json(self):
        if self._d is None:
            raise ValueError("no json")
        return self._d


def spec(**extra):
    base = {"id": "demo", "nombre": "Demo", "capacidad": "imagen", "base": "https://api.ejemplo.com",
            "clave_env": "DEMO_API_KEY", "auth": {"tipo": "bearer"},
            "peticion": {"metodo": "POST", "ruta": "/v1/img", "cuerpo": {"prompt": "{prompt}", "n": "{n}"}},
            "respuesta": {"formato": "url", "donde": "data.0.url"}}
    base.update(extra)
    return base


@pytest.fixture
def entorno(tmp_path, monkeypatch):
    monkeypatch.setattr(c, "CARPETA", tmp_path / "proveedores")
    (tmp_path / "proveedores").mkdir()
    monkeypatch.setenv("DEMO_API_KEY", "secreta-123")
    monkeypatch.delenv("CANALYT_SIN_GASTO", raising=False)
    monkeypatch.setattr(c, "load_dotenv", lambda *a, **k: None)
    apuntes = []
    monkeypatch.setattr(c.uso, "registrar", lambda *a: apuntes.append(a))
    monkeypatch.setattr(c.time, "sleep", lambda s: None)

    def guardar(s):
        (tmp_path / "proveedores" / f"{s['id']}.json").write_text(json.dumps(s), encoding="utf-8")
    guardar.apuntes = apuntes
    return guardar


def test_validar_acepta_y_rechaza():
    assert c.validar(spec()) == []
    assert c.validar(spec(base="http://inseguro.com"))
    assert c.validar(spec(clave_env="secreta-123"))            # una clave en lugar de su nombre
    assert c.validar(spec(respuesta={"formato": "pdf"}))
    assert c.validar(spec(cola={"consulta": {"ruta": "/t"}}))
    assert c.validar(spec(id="Mal Id"))


def test_rellenar_conserva_tipos_y_exige_datos():
    assert c.rellenar({"a": "{n}", "b": "x {n}"}, {"n": 3}) == {"a": 3, "b": "x 3"}
    with pytest.raises(c.ErrorConector, match="falta el dato"):
        c.rellenar("{nada}", {})
    assert c.extraer({"d": [{"u": 1}]}, "d.0.u") == 1 and c.extraer({}, "d.0") is None


def test_llamada_sincrona_baja_la_url_sin_la_clave(entorno, tmp_path, monkeypatch):
    entorno(spec())
    visto = []

    def peticion(metodo, url, **kw):
        visto.append((url, kw))
        return Resp(datos={"data": [{"url": "https://cdn.ejemplo.com/a.png"}]})
    monkeypatch.setattr(c.requests, "request", peticion)
    monkeypatch.setattr(c.requests, "get", lambda u, **kw: Resp(contenido=b"PNG"))
    r = c.ejecutar("demo", {"prompt": "un búho", "n": 1}, tmp_path / "o" / "a.png")
    assert r.archivo.read_bytes() == b"PNG"
    url, kw = visto[0]
    assert url == "https://api.ejemplo.com/v1/img" and kw["json"] == {"prompt": "un búho", "n": 1}
    assert kw["headers"]["Authorization"] == "Bearer secreta-123"


def test_base64_y_texto(entorno, tmp_path, monkeypatch):
    entorno(spec(respuesta={"formato": "base64", "donde": "img"}))
    monkeypatch.setattr(c.requests, "request", lambda *a, **k: Resp(datos={"img": base64.b64encode(b"XYZ").decode()}))
    assert c.ejecutar("demo", {"prompt": "p", "n": 1}, tmp_path / "b.bin").archivo.read_bytes() == b"XYZ"
    entorno(spec(capacidad="texto", respuesta={"formato": "texto", "donde": "out"}))
    monkeypatch.setattr(c.requests, "request", lambda *a, **k: Resp(datos={"out": "hola"}))
    assert c.ejecutar("demo", {"prompt": "p", "n": 1}).texto == "hola"


def test_errores_tipados(entorno, tmp_path, monkeypatch):
    entorno(spec())
    for estado, clase in ((401, c.ClaveInvalida), (429, c.CupoAgotado), (400, c.ErrorConector)):
        monkeypatch.setattr(c.requests, "request", lambda *a, e=estado, **k: Resp(e, {"error": "x"}))
        with pytest.raises(clase) as ex:
            c.ejecutar("demo", {"prompt": "p", "n": 1}, tmp_path / "x.png")
        assert "secreta-123" not in str(ex.value)


def test_sin_clave_falla_antes_de_enviar(entorno, tmp_path, monkeypatch):
    entorno(spec())
    monkeypatch.delenv("DEMO_API_KEY")
    monkeypatch.setattr(c.requests, "request", lambda *a, **k: pytest.fail("no debe enviar"))
    with pytest.raises(c.ClaveInvalida, match="DEMO_API_KEY"):
        c.ejecutar("demo", {"prompt": "p", "n": 1}, tmp_path / "x.png")


def test_conector_de_pago_respeta_el_modo_sin_gasto(entorno, tmp_path, monkeypatch):
    entorno(spec(coste={"cantidad": 0.04, "unidad": "USD"}))
    monkeypatch.setenv("CANALYT_SIN_GASTO", "1")
    monkeypatch.setattr(c.requests, "request", lambda *a, **k: pytest.fail("no debe enviar"))
    with pytest.raises(SystemExit):
        c.ejecutar("demo", {"prompt": "p", "n": 1}, tmp_path / "x.png")
    assert entorno.apuntes == []


def test_conector_de_pago_apunta_el_uso_y_probar_exige_gastar(entorno, tmp_path, monkeypatch):
    monkeypatch.setattr(c.simulacion, "activa", lambda: False)
    entorno(spec(coste={"cantidad": 0.04, "unidad": "USD"}))
    monkeypatch.setattr(c.requests, "request", lambda *a, **k: Resp(datos={"data": [{"url": "https://c.ejemplo.com/a"}]}))
    monkeypatch.setattr(c.requests, "get", lambda u, **kw: Resp(contenido=b"1"))
    with pytest.raises(c.ErrorConector, match="--gastar"):
        c.probar("demo", {"prompt": "p", "n": 1}, tmp_path / "x.png")
    r = c.probar("demo", {"prompt": "p", "n": 1}, tmp_path / "x.png", gastar=True)
    assert r.coste == 0.04 and entorno.apuntes == [("conector:demo", 0.04, "USD · x.png")]


def test_cola_espera_hasta_hecho(entorno, tmp_path, monkeypatch):
    entorno(spec(respuesta={"formato": "url", "id_tarea": "id"},
                 cola={"consulta": {"metodo": "GET", "ruta": "/t/{id_tarea}"}, "estado": "st", "hecho": ["done"],
                       "fallo": ["failed"], "donde": "out.url"}))
    estados = iter(["working", "working", "done"])

    def peticion(metodo, url, **kw):
        if metodo == "POST":
            return Resp(datos={"id": "T9"})
        assert url.endswith("/t/T9")
        return Resp(datos={"st": next(estados), "out": {"url": "https://c.ejemplo.com/f"}})
    monkeypatch.setattr(c.requests, "request", peticion)
    monkeypatch.setattr(c.requests, "get", lambda u, **kw: Resp(contenido=b"F"))
    r = c.ejecutar("demo", {"prompt": "p", "n": 1}, tmp_path / "f.png")
    assert r.tarea == "T9" and r.archivo.read_bytes() == b"F"


def test_cola_fallo_y_tiempo(entorno, tmp_path, monkeypatch):
    base = spec(respuesta={"formato": "url", "id_tarea": "id"},
                cola={"consulta": {"metodo": "GET", "ruta": "/t/{id_tarea}"}, "estado": "st", "hecho": ["done"],
                      "fallo": ["failed"], "donde": "u", "max_seg": 0})
    entorno(base)
    monkeypatch.setattr(c.requests, "request", lambda m, u, **k: Resp(datos={"id": "T"} if m == "POST" else {"st": "failed"}))
    with pytest.raises(c.ErrorConector, match="falló"):
        c.ejecutar("demo", {"prompt": "p", "n": 1}, tmp_path / "f.png")
    monkeypatch.setattr(c.requests, "request", lambda m, u, **k: Resp(datos={"id": "T"} if m == "POST" else {"st": "working"}))
    with pytest.raises(c.TiempoAgotado):
        c.ejecutar("demo", {"prompt": "p", "n": 1}, tmp_path / "f.png")


def test_listar_marca_los_invalidos(entorno):
    entorno(spec())
    (c.CARPETA / "roto.json").write_text("{no", encoding="utf-8")
    por_id = {x["id"]: x for x in c.listar()}
    assert por_id["demo"]["valido"] and por_id["demo"]["conectado"] and not por_id["demo"]["de_pago"]
    assert not por_id["roto"]["valido"]


# --- Adaptador en código (escape para el servicio raro) ----------------------------------------------------------------

CODIGO_BUENO = '''
import conector_ia

def ejecutar(datos, clave, salida):
    assert clave == "secreta-123"
    if datos.get("fallar") == "cupo":
        raise conector_ia.CupoAgotado("sin cupo con " + clave)
    if datos.get("fallar") == "raro":
        raise RuntimeError("explotó con " + clave)
    salida.write_bytes(b"IMG:" + datos["prompt"].encode())
    return {"archivo": salida}
'''


def con_codigo(entorno, tmp_path, codigo=CODIGO_BUENO, **extra):
    s = {"id": "raro", "nombre": "Raro", "capacidad": "imagen", "clave_env": "DEMO_API_KEY", "codigo": "raro.py", **extra}
    entorno(s)
    (tmp_path / "proveedores" / "raro.py").write_text(codigo, encoding="utf-8")
    return s


def test_validar_codigo_no_pide_base_ni_peticion(entorno, tmp_path):
    s = con_codigo(entorno, tmp_path)
    assert c.validar(s) == []
    assert c.validar({**s, "codigo": "../fuera.py"})
    (tmp_path / "proveedores" / "raro.py").unlink()
    assert any("falta el archivo" in p for p in c.validar(s))


def test_adaptador_en_codigo_produce_el_archivo(entorno, tmp_path):
    con_codigo(entorno, tmp_path)
    r = c.ejecutar("raro", {"prompt": "búho"}, tmp_path / "o" / "a.png")
    assert r.archivo.read_bytes() == "IMG:búho".encode()


def test_adaptador_en_codigo_tipa_errores_y_no_muestra_la_clave(entorno, tmp_path):
    con_codigo(entorno, tmp_path)
    with pytest.raises(c.CupoAgotado) as e:
        c.ejecutar("raro", {"prompt": "p", "fallar": "cupo"}, tmp_path / "a.png")
    assert "secreta-123" not in str(e.value)
    with pytest.raises(c.ErrorConector, match="falló") as e:
        c.ejecutar("raro", {"prompt": "p", "fallar": "raro"}, tmp_path / "a.png")
    assert "secreta-123" not in str(e.value)


def test_adaptador_en_codigo_de_pago_respeta_sin_gasto_y_apunta(entorno, tmp_path, monkeypatch):
    con_codigo(entorno, tmp_path, coste={"cantidad": 0.1, "unidad": "USD"})
    monkeypatch.setenv("CANALYT_SIN_GASTO", "1")
    with pytest.raises(SystemExit):
        c.ejecutar("raro", {"prompt": "p"}, tmp_path / "a.png")
    assert entorno.apuntes == []
    monkeypatch.setattr(c.simulacion, "activa", lambda: False)
    monkeypatch.delenv("CANALYT_SIN_GASTO")
    c.ejecutar("raro", {"prompt": "p"}, tmp_path / "a.png")
    assert entorno.apuntes == [("conector:raro", 0.1, "USD · a.png")]


def test_adaptador_en_codigo_con_resultado_vacio(entorno, tmp_path):
    con_codigo(entorno, tmp_path, codigo="def ejecutar(datos, clave, salida):\n    return {}\n")
    with pytest.raises(c.ErrorConector, match="ni archivo ni texto"):
        c.ejecutar("raro", {"prompt": "p"}, tmp_path / "a.png")

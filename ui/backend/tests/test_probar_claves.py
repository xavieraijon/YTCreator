"""Probar claves: solo llamadas gratuitas, sin red real (requests simulado) y sin mostrar jamás la clave."""

import requests

from app import config, probar_claves


class _Resp:
    def __init__(self, codigo=200, datos=None):
        self.status_code, self._d = codigo, datos or {}

    def json(self):
        return self._d


def _env(tmp_path, monkeypatch, texto):
    (tmp_path / ".env").write_text(texto)
    monkeypatch.setattr(config, "RAIZ", tmp_path)


def _sin_red(monkeypatch, respuesta):
    llamadas = []

    def falso(url, **kw):
        llamadas.append((url, kw))
        if isinstance(respuesta, Exception):
            raise respuesta
        return respuesta
    monkeypatch.setattr(requests, "get", falso)
    monkeypatch.setattr(requests, "post", falso)
    return llamadas


def test_sin_clave_no_toca_la_red(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch, "AI33_API_KEY=\n")
    llamadas = _sin_red(monkeypatch, _Resp())
    for s in probar_claves.SERVICIOS:
        if s != "local":                         # el motor del Mac no tiene clave: se mira si está instalado
            r = probar_claves.probar(s)
            assert r["estado"] == "falta" and not r["ok"]
    assert llamadas == []


def test_motor_del_mac_se_prueba_mirando_si_esta_instalado(monkeypatch):
    import servicios
    llamadas = _sin_red(monkeypatch, _Resp())
    monkeypatch.setattr(servicios, "motor_local_instalado", lambda: False)
    assert probar_claves.probar("local")["estado"] == "falta"
    monkeypatch.setattr(servicios, "motor_local_instalado", lambda: True)
    assert probar_claves.probar("local")["ok"] is True and llamadas == []


def test_ai33_ok_y_rechazada(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch, "AI33_API_KEY=secreta123\n")
    _sin_red(monkeypatch, _Resp(200, {"credits": 1720}))
    r = probar_claves.probar("ai33")
    assert r["ok"] and "1.720" in r["mensaje"] and "secreta123" not in str(r)
    _sin_red(monkeypatch, _Resp(401))
    assert probar_claves.probar("ai33")["estado"] == "rechazada"


def test_cloudflare_valida_formato_y_token(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch, "CF_ACCOUNT_ID=corto\nCF_API_TOKEN=t\n")
    llamadas = _sin_red(monkeypatch, _Resp())
    assert probar_claves.probar("cloudflare")["estado"] == "rechazada" and llamadas == []
    _env(tmp_path, monkeypatch, f"CF_ACCOUNT_ID={'a' * 32}\nCF_API_TOKEN=t\n")
    _sin_red(monkeypatch, _Resp(200, {"result": {"status": "active"}}))
    assert probar_claves.probar("cloudflare")["ok"]
    _sin_red(monkeypatch, _Resp(200, {"result": {"status": "expired"}}))
    assert not probar_claves.probar("cloudflare")["ok"]


def test_azure_y_gemini(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch, "AZURE_SPEECH_KEY=k\nAZURE_SPEECH_REGION=westeurope\nGEMINI_API_KEY=g\n")
    llamadas = _sin_red(monkeypatch, _Resp(200))
    assert probar_claves.probar("azure")["ok"] and "westeurope.api.cognitive" in llamadas[0][0]
    assert probar_claves.probar("gemini")["ok"]
    _sin_red(monkeypatch, _Resp(400))
    assert probar_claves.probar("gemini")["estado"] == "rechazada"
    _env(tmp_path, monkeypatch, "AZURE_SPEECH_KEY=k\nAZURE_SPEECH_REGION=https://malo.com/\n")
    assert probar_claves.probar("azure")["estado"] == "rechazada"      # la región no puede colar otro host


def test_fallos_de_red(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch, "GEMINI_API_KEY=g\n")
    _sin_red(monkeypatch, requests.Timeout())
    assert probar_claves.probar("gemini")["estado"] == "red"
    _sin_red(monkeypatch, requests.ConnectionError())
    assert probar_claves.probar("gemini")["estado"] == "red"


def test_ruta(cliente, tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch, "")
    assert cliente.post("/api/ajustes/probar/Inventado").status_code == 404
    r = cliente.post("/api/ajustes/probar/ai33").json()
    assert r["estado"] == "falta"


def test_limites_y_precios_editables(cliente):
    import proveedores
    lista = cliente.get("/api/ajustes/proveedores").json()
    f = next(x for x in lista if x["clave"] == "ai33.creditos_por_imagen")
    assert f["valor"] == f["defecto"] == 1720 and not f["cambiado"]
    r = cliente.put("/api/ajustes/proveedores", json={"clave": "ai33.creditos_por_imagen", "valor": 1500}).json()
    assert next(x for x in r if x["clave"] == "ai33.creditos_por_imagen")["valor"] == 1500
    assert proveedores.valor("ai33.creditos_por_imagen") == 1500
    assert cliente.put("/api/ajustes/proveedores", json={"clave": "ai33.creditos_por_imagen", "valor": -3}).status_code == 422
    assert cliente.put("/api/ajustes/proveedores", json={"clave": "inventada", "valor": 3}).status_code == 422
    cliente.put("/api/ajustes/proveedores", json={"clave": "ai33.creditos_por_imagen", "valor": None})
    assert proveedores.valor("ai33.creditos_por_imagen") == 1720

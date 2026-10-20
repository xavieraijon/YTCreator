"""Bloque B (docs/plan-mejoras-usuario.md): el usuario elige qué servicios usa y ninguno es obligatorio. Sin elegir, se usan
los que ya tienen su clave (una instalación que funcionaba sigue igual)."""
import json

import servicios


def _espacio(tmp_path, monkeypatch, env: str, ajustes: dict | None = None):
    from app import config
    monkeypatch.setattr(config, "RAIZ", tmp_path)
    monkeypatch.setenv("CANALYT_AJUSTES", str(tmp_path / "ajustes.json"))
    monkeypatch.setattr(servicios, "motor_local_instalado", lambda: False)
    (tmp_path / ".env").write_text(env)
    if ajustes is not None:
        (tmp_path / "ajustes.json").write_text(json.dumps(ajustes))


def test_sin_elegir_se_usan_los_conectados(cliente, tmp_path, monkeypatch):
    _espacio(tmp_path, monkeypatch, "AI33_API_KEY=secreto-777\nCF_ACCOUNT_ID=a\n")
    d = cliente.get("/api/servicios").json()
    por_id = {s["id"]: s for s in d["servicios"]}
    assert por_id["ai33"]["activo"] and por_id["ai33"]["disponible"]
    assert not por_id["cloudflare"]["activo"]                     # le falta el token
    assert not por_id["local"]["activo"]                          # no instalado: nunca entra solo
    assert por_id["sintetizador"]["disponible"]                   # incluido en el programa
    assert d["resumen"] == {"imagen": ["ai33"], "voz": ["ai33"], "musica": ["ai33", "sintetizador"], "sincronia": []}
    assert "secreto-777" not in json.dumps(d)                    # nunca el valor


def test_elegir_y_dejar_de_usar(cliente, tmp_path, monkeypatch):
    _espacio(tmp_path, monkeypatch, "AI33_API_KEY=k\n")
    d = cliente.put("/api/servicios/ai33", json={"activo": False}).json()
    ai33 = next(s for s in d["servicios"] if s["id"] == "ai33")
    assert ai33["elegido"] and not ai33["activo"] and not ai33["disponible"] and ai33["conectado"]
    assert d["resumen"]["voz"] == []                              # sin servicio de voz: la locución se sube
    d = cliente.put("/api/servicios/azure", json={"activo": True}).json()
    azure = next(s for s in d["servicios"] if s["id"] == "azure")
    assert azure["activo"] and not azure["disponible"]            # elegido, pero falta su clave
    assert json.loads((tmp_path / "ajustes.json").read_text())["servicios"] == {"ai33": False, "azure": True}
    assert cliente.put("/api/servicios/inventado", json={"activo": True}).status_code == 404


def test_sin_ningun_servicio_el_kit_esta_listo_igual(cliente, tmp_path, monkeypatch):
    """Sin .env ni servicios: «listo» solo depende de Claude, ffmpeg y yt-dlp."""
    from app import asistente
    _espacio(tmp_path, monkeypatch, "", {"servicios": {"sintetizador": False}})
    k = asistente.kit()
    assert {i["id"] for i in k["items"]} == {"yt-dlp", "ffmpeg", "claude"}
    assert k["listo"] == all(i["ok"] for i in k["items"])


def test_las_claves_permitidas_son_las_del_catalogo(cliente):
    assert cliente.put("/api/ajustes/clave", json={"clave": "PATH", "valor": "x"}).status_code == 422
    assert servicios.TODAS_LAS_CLAVES == {"CF_ACCOUNT_ID", "CF_API_TOKEN", "AI33_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION",
                                         "GEMINI_API_KEY"}

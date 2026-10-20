"""El asistente «desde cero»: estado de los pasos (de los archivos) y el chat del canal con permisos propios."""
import json
import re
import time


from app import asistente, chat, config
from tests.test_chat import _falso


def test_las_fases_del_canal_son_las_del_comando():
    texto = (config.RAIZ / ".claude" / "commands" / "nuevo-canal.md").read_text(encoding="utf-8")
    del_comando = re.findall(r"^## FASE ([A-Z]) - (.+)$", texto, re.M)
    assert [(l, n.lower()) for l, n in asistente.FASES_CANAL] == [(l, n.lower()) for l, n in del_comando]


def test_kit_no_enseña_valores_ni_exige_servicios(tmp_path, monkeypatch):
    """Bloque B: ningún servicio es obligatorio. Solo salen los que se usan, y nunca cuentan para «listo»."""
    monkeypatch.setattr(config, "RAIZ", tmp_path)
    monkeypatch.setenv("CANALYT_AJUSTES", str(tmp_path / "ajustes.json"))
    (tmp_path / ".env").write_text("CF_ACCOUNT_ID=abc\nCF_API_TOKEN=\n# AZURE_SPEECH_KEY=zzz\nAI33_API_KEY='x'\n")
    k = asistente.kit()
    por_id = {i["id"]: i for i in k["items"]}
    assert por_id["ai33"]["ok"] is True and not por_id["ai33"]["requerido"]   # con su clave: se usa
    assert "cloudflare" not in por_id and "azure" not in por_id                 # sin clave y sin elegir: no se usan
    assert "abc" not in json.dumps(k)
    assert k["listo"] == all(i["ok"] for i in k["items"] if i["id"] in ("yt-dlp", "ffmpeg", "claude"))
    (tmp_path / "ajustes.json").write_text(json.dumps({"servicios": {"cloudflare": True, "ai33": False}}))
    por_id = {i["id"]: i for i in asistente.kit()["items"]}
    assert por_id["cloudflare"]["ok"] is False and "ai33" not in por_id          # elegido sin clave: se avisa, sin exigir


def test_estado_sin_canal_y_con_canal_a_medias(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    monkeypatch.setattr(kit_canal, "ACTIVO", tmp_path / "canal_activo")
    monkeypatch.setattr(config, "RAIZ", tmp_path)
    (tmp_path / "canales").mkdir()
    e = cliente.get("/api/asistente").json()
    assert e["actual"] == "kit" or e["actual"] == "canal"
    assert [p["id"] for p in e["pasos"]] == ["kit", "canal", "video", "publicar"]
    assert e["canal"]["hay_canal"] is False and e["canal"]["creacion"] is None
    # canal a medias en fase D
    c = tmp_path / "canales" / "nuevo"
    c.mkdir()
    (c / "canal.json").write_text(json.dumps({"nombre": "Nuevo"}))
    (c / "estado_canal.json").write_text(json.dumps({"fase": "D", "completadas": ["A", "B", "C"]}))
    (tmp_path / "canal_activo").write_text("nuevo\n")
    e = cliente.get("/api/asistente").json()
    assert e["canal"]["creacion"]["slug"] == "nuevo" and e["canal"]["creacion"]["fase"] == "D"
    assert e["pasos"][1]["hecho"] is False and e["pasos"][1]["resumen"] == "Paso 4 de 11: Estilo visual"
    # cerrado
    (c / "estado_canal.json").write_text(json.dumps({"fase": "hecho"}))
    e = cliente.get("/api/asistente").json()
    assert e["canal"]["hay_canal"] is True and e["canal"]["creacion"] is None and e["pasos"][1]["hecho"] is True
    # «hecho» según estado_canal.json pero con marcas <<RELLENAR>> (creado a mano o cortado a medias): no está listo
    (c / "CANAL.md").write_text("- **Qué es:** <<RELLENAR: la promesa en una frase>>\n")
    e = cliente.get("/api/asistente").json()
    assert e["pasos"][1]["hecho"] is False and "falta 1 campo por rellenar" in e["pasos"][1]["resumen"] and e["actual"] in ("kit", "canal")


def _esperar(cliente, segundos=10):
    fin = time.time() + segundos
    while time.time() < fin:
        d = cliente.get("/api/asistente/claude").json()
        if d["conversacion"] and d["conversacion"]["estado"] == "libre":
            return d
        time.sleep(0.1)
    raise AssertionError(d)


def test_chat_del_asistente_tiene_permisos_propios(cliente, tmp_path, monkeypatch):
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.get("/api/asistente/claude").json() == {"conversacion": None, "entradas": []}
    assert cliente.post("/api/asistente/claude", json={"mensaje": " "}).status_code == 422
    assert cliente.post("/api/asistente/claude", json={"mensaje": "/nuevo-canal"}).status_code == 200
    d = _esperar(cliente)
    assert d["conversacion"]["video_id"] is None and d["entradas"][0]["texto"] == "/nuevo-canal"
    a = json.loads(registro.read_text().splitlines()[0])["args"]
    permitidas = a[a.index("--allowedTools") + 1:a.index("--disallowedTools")]
    prohibidas = a[a.index("--disallowedTools") + 1:]
    for h in ("canales.py crear", "canales.py activar", "marca.py", "laboratorio_estilo.py", "mercado.py"):
        assert f"Bash(.venv/bin/python herramientas/{h}:*)" in permitidas or f"Bash(.venv/bin/python herramientas/{h}" in " ".join(permitidas)
    for h in ("montar", "gen_voz", "imagen_ai33", "gen_imagen", "probar_kit"):
        assert f"Bash(.venv/bin/python herramientas/{h}.py:*)" in prohibidas
        assert not any(f"/{h}.py" in p for p in permitidas)
    assert "Read(./.env)" in prohibidas and "Bash(git push:*)" in prohibidas
    sistema = a[a.index("--append-system-prompt") + 1]
    assert "/nuevo-canal" in sistema and "gen_voz.py" in sistema
    # el chat de un vídeo sigue sin poder crear canales
    assert chat.PERMITIDAS.count("Bash(.venv/bin/python herramientas/canales.py crear:*)") == 0


def test_pedir_cambio_desde_un_canal_que_no_es_el_activo(cliente, tmp_path, monkeypatch):
    """«Pedir otro cambio a Claude» en la ficha de un canal: trabaja sobre ESE canal, no el activo (hallazgo del
    recorrido profano)."""
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    monkeypatch.setattr(kit_canal, "ACTIVO", tmp_path / "canal_activo")
    (tmp_path / "canales").mkdir()
    (tmp_path / "canales" / "otro").mkdir()
    (tmp_path / "canal_activo").write_text("activo\n")
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post("/api/asistente/claude", json={"mensaje": "quiero otra voz", "canal": "inexistente"}).status_code == 422
    assert cliente.post("/api/asistente/claude", json={"mensaje": "quiero otra voz", "canal": "otro"}).status_code == 200
    _esperar(cliente)
    assert json.loads(registro.read_text().splitlines()[0])["canal"] == "otro"   # no "activo"

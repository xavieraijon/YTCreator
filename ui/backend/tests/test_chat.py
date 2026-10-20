"""Chat con Claude desde la UI, con un «claude» falso que emite stream-json (sin gastar la suscripción)."""
import json
import stat
import time


from app import chat

ARCHIVO = "_archivo/los-viajes-de-tok"


def _falso(tmp_path, monkeypatch, espera=0.0):
    """Un ejecutable que imita `claude -p … --output-format stream-json` y guarda sus argumentos y su CANAL."""
    registro = tmp_path / "llamadas.jsonl"
    eventos = [
        {"type": "system", "subtype": "init", "session_id": "ses-1"},
        {"type": "stream_event", "parent_tool_use_id": None,
         "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Voy"}}},
        {"type": "assistant", "parent_tool_use_id": None, "message": {"content": [
            {"type": "tool_use", "id": "t1", "name": "Read", "input": {"file_path": "__RAIZ__/CLAUDE.md"}}]}},
        {"type": "assistant", "parent_tool_use_id": None, "message": {"content": [
            {"type": "tool_use", "id": "t2", "name": "Bash",
             "input": {"command": ".venv/bin/python herramientas/montar.py x"}}]}},
        {"type": "user", "parent_tool_use_id": None, "message": {"content": [
            {"type": "tool_result", "tool_use_id": "t2", "is_error": True, "content": "Permission denied"}]}},
        {"type": "assistant", "parent_tool_use_id": "t9", "message": {"content": [
            {"type": "text", "text": "texto de un agente: no se enseña"}]}},
        {"type": "assistant", "parent_tool_use_id": None, "message": {"content": [
            {"type": "text", "text": "He leído **CLAUDE.md**."}]}},
        {"type": "result", "subtype": "success", "is_error": False, "duration_ms": 2400, "num_turns": 3,
         "session_id": "ses-1", "permission_denials": [
             {"tool_name": "Bash", "tool_input": {"command": ".venv/bin/python herramientas/montar.py x"}}]},
    ]
    (tmp_path / "eventos.json").write_text(json.dumps(eventos))
    guion = tmp_path / "claude"
    guion.write_text(
        "#!/usr/bin/env python3\nimport json, os, sys, time\n"
        f"open({str(registro)!r}, 'a').write(json.dumps({{'args': sys.argv[1:], 'canal': os.environ.get('CANAL')}}) + '\\n')\n"
        f"time.sleep({espera})\n"
        f"for e in json.load(open({str(tmp_path / 'eventos.json')!r})):\n"
        "    print(json.dumps(e).replace('__RAIZ__', os.getcwd()), flush=True)\n")
    guion.chmod(guion.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("CANALYT_CLAUDE", str(guion))
    monkeypatch.setattr(chat, "CARPETA", tmp_path / "conversaciones")
    return registro


def _video(cliente):
    videos = cliente.get("/api/videos", params={"canal": ARCHIVO}).json()
    return next(v["id"] for v in videos if v["carpeta"].startswith("001-"))


def _esperar(cliente, vid, estado="libre", segundos=10):
    fin = time.time() + segundos
    while time.time() < fin:
        d = cliente.get(f"/api/videos/{vid}/claude").json()
        if d["conversacion"] and d["conversacion"]["estado"] == estado:
            return d
        time.sleep(0.1)
    raise AssertionError(f"la conversación no llegó a «{estado}»: {d}")


def test_turno_completo_y_permisos(cliente, tmp_path, monkeypatch):
    registro = _falso(tmp_path, monkeypatch)
    vid = _video(cliente)
    assert cliente.get(f"/api/videos/{vid}/claude").json() == {"conversacion": None, "entradas": []}
    assert cliente.post(f"/api/videos/{vid}/claude", json={"mensaje": "   "}).status_code == 422

    r = cliente.post(f"/api/videos/{vid}/claude", json={"mensaje": "/nuevo-video continuar"})
    assert r.status_code == 200, r.text
    d = _esperar(cliente, vid)
    tipos = [e["t"] for e in d["entradas"]]
    assert tipos == ["usuario", "herramienta", "herramienta", "fallo", "texto", "aviso", "fin"]
    e = d["entradas"]
    assert e[1]["resumen"] == "Lee CLAUDE.md"                              # ruta relativa a la raíz del kit
    assert e[2]["resumen"].startswith("Ejecuta .venv/bin/python herramientas/montar.py")
    assert e[4]["texto"] == "He leído **CLAUDE.md**."                      # el texto de los agentes no sale
    assert "montar.py" not in e[5]["texto"] and "botón" in e[5]["texto"]      # el aviso, sin jerga
    assert "No permitido desde la UI" in e[5]["detalle"] and "montar.py" in e[5]["detalle"]
    assert e[6]["segundos"] == 2 and d["conversacion"]["turnos"] == 1

    llamada = json.loads(registro.read_text().splitlines()[0])
    a = llamada["args"]
    assert llamada["canal"] == ARCHIVO                                     # CANAL = canal del vídeo
    assert a[a.index("--permission-mode") + 1] == "default"                # nunca hereda el modo sin permisos
    assert "--strict-mcp-config" in a and "--resume" not in a
    permitidas = a[a.index("--allowedTools") + 1:a.index("--disallowedTools")]
    prohibidas = a[a.index("--disallowedTools") + 1:]
    assert "Bash" not in permitidas                                        # Bash solo con patrones concretos
    assert "Edit" not in permitidas and "Write" not in permitidas          # editar, solo por carpetas
    assert "Edit(./canales/**)" in permitidas
    assert "Bash(.venv/bin/python herramientas/revisar_guion.py:*)" in permitidas
    assert not any(h in p for p in permitidas for h in ("montar", "gen_voz", "imagen_ai33", "gen_imagen"))
    for h in ("montar", "gen_voz", "imagen_ai33", "gen_imagen"):
        assert f"Bash(.venv/bin/python herramientas/{h}.py:*)" in prohibidas
    assert "Read(./.env)" in prohibidas and "Bash(git push:*)" in prohibidas
    sistema = a[a.index("--append-system-prompt") + 1]
    assert "001-" in sistema and "/nuevo-video continuar" in sistema

    # El segundo mensaje continúa la misma sesión; «nueva» empieza otra sin --resume.
    cliente.post(f"/api/videos/{vid}/claude", json={"mensaje": "sigue"})
    _esperar(cliente, vid)
    a2 = json.loads(registro.read_text().splitlines()[1])["args"]
    assert a2[a2.index("--resume") + 1] == "ses-1"
    cid = d["conversacion"]["id"]
    r = cliente.post(f"/api/videos/{vid}/claude", json={"mensaje": "otra cosa", "nueva": True})
    assert r.json()["id"] != cid
    d3 = _esperar(cliente, vid)
    assert d3["entradas"][0]["texto"] == "otra cosa"
    assert "--resume" not in json.loads(registro.read_text().splitlines()[2])["args"]


def test_ocupado_y_parar(cliente, tmp_path, monkeypatch):
    _falso(tmp_path, monkeypatch, espera=30)
    vid = _video(cliente)
    cid = cliente.post(f"/api/videos/{vid}/claude", json={"mensaje": "hola"}).json()["id"]
    _esperar(cliente, vid, "pensando")
    r = cliente.post(f"/api/videos/{vid}/claude", json={"mensaje": "¿y?"})
    assert r.status_code == 409
    time.sleep(0.3)                                                        # que el proceso haya arrancado
    assert cliente.post(f"/api/claude/{cid}/parar").json() == {"parado": True}
    d = _esperar(cliente, vid)
    assert d["entradas"][-1] == {**d["entradas"][-1], "t": "aviso", "texto": "Parado por ti."}


def test_resumen_de_herramientas():
    assert chat.resumir_herramienta("Task", {"subagent_type": "guionista", "description": "Escribir el guion"}) \
        == "Encarga a guionista: Escribir el guion"
    assert chat.resumir_herramienta("WebSearch", {"query": "Phineas Gage Chile"}) == "Busca en la web «Phineas Gage Chile»"


def test_frase_amable_sin_rutas():
    assert chat.frase_amable("Task", {"subagent_type": "director-arte"}) == "Consultando al Director de Arte…"
    for nombre, e in (("Write", {"file_path": "analisis/mercado/x.json"}), ("Read", {"file_path": "docs/concepto.md"}),
                      ("Bash", {"command": "yt-dlp foo"})):
        f = chat.frase_amable(nombre, e)
        assert "/" not in f and ".json" not in f and ".md" not in f


def test_claude_solo_edita_canales_y_analisis():
    """Auditoría del 18/10 (#2): aunque un texto de una web se lo pida, Claude no edita el código, los agentes, los
    ajustes ni las claves; los vetos llevan también la ruta absoluta del espacio y del kit (enlaces) y mandan."""
    from app import config
    for lista_p, lista_v in ((chat.PERMITIDAS, chat.PROHIBIDAS),
                             (chat.PERMITIDAS_ASISTENTE, chat.PROHIBIDAS_ASISTENTE)):
        assert not {"Edit", "Write", "MultiEdit", "NotebookEdit"} & set(lista_p)
        editables = {r for r in lista_p if r.startswith(("Edit(", "Write("))}     # «Edit» cubre Write y MultiEdit
        assert editables == {f"Edit(./{c}/**)" for c in ("canales", "analisis", "tmp")}
        for c in ("herramientas", ".claude", "data", "plantillas", "docs", "ui"):
            assert f"Edit(./{c}/**)" in lista_v
            for raiz in (config.RAIZ, config.KIT):
                assert f"Edit(/{raiz}/{c}/**)" in lista_v
        for h in ("Read", "Edit"):
            assert f"{h}(./.env)" in lista_v and f"{h}(**/.env)" in lista_v
            assert f"{h}(/{config.RAIZ}/.env)" in lista_v

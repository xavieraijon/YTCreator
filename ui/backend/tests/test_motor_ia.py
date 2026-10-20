"""motor_ia: perfiles, entorno limpio, errores tipados, salud y rutas, con un «claude» falso (sin gastar la suscripción)."""
import json
import stat

import pytest

import motor_ia
from app import chat


@pytest.fixture(autouse=True)
def aislado(tmp_path, monkeypatch):
    monkeypatch.setenv("CANALYT_AJUSTES", str(tmp_path / "ajustes.json"))
    monkeypatch.setenv("CANALYT_SALUD_IA", str(tmp_path / "salud.json"))
    for v in ("CANALYT_IA_MODELO", "CANALYT_IA_ESFUERZO", "CANALYT_IA_MODO", "CANALYT_IA_PROVEEDOR"):
        monkeypatch.delenv(v, raising=False)


def _falso(tmp_path, monkeypatch, sobre, codigo=0, espera=0):
    """Un ejecutable que guarda sus argumentos y el entorno que ve, y contesta con un sobre JSON."""
    registro = tmp_path / "registro.json"
    guion = tmp_path / "claude"
    guion.write_text(
        "#!/usr/bin/env python3\nimport json, os, sys, time\n"
        f"json.dump({{'args': sys.argv[1:], 'api': os.environ.get('ANTHROPIC_API_KEY'), 'esfuerzo': os.environ.get('CLAUDE_EFFORT')}},"
        f" open({str(registro)!r}, 'w'))\n"
        f"time.sleep({espera})\nprint({json.dumps(sobre)!r})\nsys.exit({codigo})\n")
    guion.chmod(guion.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("CANALYT_CLAUDE", str(guion))
    return registro


def test_perfiles_de_fabrica_y_ajustes(tmp_path, monkeypatch):
    assert motor_ia.perfil("produccion").modelo == "sonnet" and motor_ia.perfil("produccion").esfuerzo == "medium"
    assert motor_ia.perfil("asistente").modelo == "sonnet"
    (tmp_path / "ajustes.json").write_text(json.dumps({"motor_ia": {"perfiles": {"produccion": {"modelo": "sonnet", "esfuerzo": "low"}}}}))
    p = motor_ia.perfil("produccion")
    assert (p.modelo, p.esfuerzo) == ("sonnet", "low")
    monkeypatch.setenv("CANALYT_IA_ESFUERZO", "max")                      # el entorno manda sobre todo
    assert motor_ia.perfil("produccion").esfuerzo == "max"
    (tmp_path / "ajustes.json").write_text(json.dumps({"motor_ia": {"perfiles": {"produccion": {"modelo": "gpt-9"}}}}))
    monkeypatch.delenv("CANALYT_IA_ESFUERZO")
    assert motor_ia.perfil("produccion").modelo == "sonnet"             # un ajuste mal escrito no tumba nada
    with pytest.raises(ValueError):
        motor_ia.perfil("inventado")
    with pytest.raises(ValueError):
        motor_ia.modelo_valido("modelo raro")
    assert motor_ia.modelo_valido("claude-opus-5-5") == "claude-opus-5-5"


def test_la_orden_lleva_modelo_y_esfuerzo_siempre():
    a = motor_ia.proveedor().orden("sugerencia", "hola", salida="json", permitidas=["Read"], vetadas=["Bash"], sesion="s1",
                                   sistema="eres X")
    assert a[a.index("--model") + 1] == "sonnet" and a[a.index("--effort") + 1] == "medium"
    assert a[a.index("--resume") + 1] == "s1" and a[a.index("--allowedTools") + 1] == "Read"
    c = chat.comando("hola", None, "sistema")
    assert c[c.index("--model") + 1] == "sonnet" and c[c.index("--effort") + 1] == "medium" and "--resume" not in c
    c = chat.comando("hola", None, "sistema", asistente=True)
    assert c[c.index("--model") + 1] == "sonnet"


def test_el_entorno_no_puede_facturar_por_uso(monkeypatch):
    for v, x in (("ANTHROPIC_API_KEY", "k"), ("ANTHROPIC_BASE_URL", "http://x"), ("CLAUDE_EFFORT", "max"),
                 ("MAX_THINKING_TOKENS", "9999"), ("CLAUDE_CODE_USE_BEDROCK", "1"), ("OTRA", "y")):
        monkeypatch.setenv(v, x)
    e = motor_ia.entorno({"CANAL": "c"})
    assert "ANTHROPIC_API_KEY" not in e and "ANTHROPIC_BASE_URL" not in e and "CLAUDE_EFFORT" not in e
    assert "MAX_THINKING_TOKENS" not in e and "CLAUDE_CODE_USE_BEDROCK" not in e
    assert e["OTRA"] == "y" and e["CANAL"] == "c"
    monkeypatch.setenv("CANALYT_IA_MODO", "api")                           # el usuario lo pide expresamente
    assert motor_ia.entorno()["ANTHROPIC_API_KEY"] == "k" and "CLAUDE_EFFORT" not in motor_ia.entorno()


def test_clasificar_fallos():
    assert isinstance(motor_ia.clasificar("You've hit your weekly limit, resets on Oct 8 at 7:00"), motor_ia.LimiteAgotado)
    assert isinstance(motor_ia.clasificar("Has agotado tu límite semanal; se renueva el jueves"), motor_ia.LimiteAgotado)
    assert isinstance(motor_ia.clasificar("Not logged in · Please run /login"), motor_ia.SinSesion)
    assert motor_ia.clasificar("algo raro") is None and motor_ia.clasificar("") is None
    assert "renueva" in motor_ia.describir(motor_ia.clasificar("Has agotado tu límite; se renueva el jueves"))


def test_ejecutar_ok_anota_la_salud_y_limpia_el_entorno(tmp_path, monkeypatch):
    registro = _falso(tmp_path, monkeypatch, {"type": "result", "is_error": False, "result": "hecho", "duration_ms": 10})
    monkeypatch.setenv("ANTHROPIC_API_KEY", "secreta")
    monkeypatch.setenv("CLAUDE_EFFORT", "max")
    texto, sobre = motor_ia.ejecutar("sugerencia", "dime algo")
    assert texto == "hecho"
    visto = json.loads(registro.read_text())
    assert visto["api"] is None and visto["esfuerzo"] is None and "--effort" in visto["args"]
    assert motor_ia.salud()["estado"] == "ok"


def test_ejecutar_cupo_sesion_y_tiempo(tmp_path, monkeypatch):
    _falso(tmp_path, monkeypatch, {"is_error": True, "result": "You've hit your limit · resets Oct 8, 7am"}, codigo=1)
    with pytest.raises(motor_ia.LimiteAgotado):
        motor_ia.ejecutar("sugerencia", "x")
    assert motor_ia.salud()["estado"] == "cupo" and "resets" in motor_ia.salud()["mensaje"]
    _falso(tmp_path, monkeypatch, {"is_error": True, "result": "Not logged in · Please run /login"}, codigo=1)
    with pytest.raises(motor_ia.SinSesion):
        motor_ia.ejecutar("sugerencia", "x")
    assert motor_ia.salud()["estado"] == "sesion"
    _falso(tmp_path, monkeypatch, {"result": "tarde"}, espera=3)
    with pytest.raises(motor_ia.TiempoAgotado):
        motor_ia.ejecutar("sugerencia", "x", tiempo=1)
    assert motor_ia.salud()["estado"] == "tiempo"
    _falso(tmp_path, monkeypatch, {"is_error": True, "result": "algo rarísimo"}, codigo=1)
    with pytest.raises(motor_ia.ErrorIA):
        motor_ia.ejecutar("sugerencia", "x")


def test_rutas_de_salud_prueba_y_ajustes(cliente, tmp_path, monkeypatch):
    _falso(tmp_path, monkeypatch, {"type": "result", "is_error": False, "result": "ok"})
    assert cliente.get("/api/ia/salud").json()["estado"] == "desconocido"
    r = cliente.post("/api/ia/probar").json()
    assert r["ok"] is True and r["salud"]["estado"] == "ok" and r["salud"]["proveedor"] == "claude"
    assert cliente.put("/api/ajustes/ia", json={"modo": "gratis"}).status_code == 422
    assert cliente.put("/api/ajustes/ia", json={"perfiles": {"produccion": {"modelo": "inventado"}}}).status_code == 422
    assert cliente.put("/api/ajustes/ia", json={"perfiles": {"prueba": {"modelo": "opus"}}}).status_code == 422
    ok = cliente.put("/api/ajustes/ia", json={"modo": "api", "perfiles": {"produccion": {"esfuerzo": "xhigh"}}})
    assert ok.status_code == 200 and ok.json()["perfiles"]["produccion"]["esfuerzo"] == "xhigh" and ok.json()["modo"] == "api"
    _falso(tmp_path, monkeypatch, {"is_error": True, "result": "Has agotado tu límite; se renueva el jueves"}, codigo=1)
    assert cliente.post("/api/ia/probar").json()["estado"] == "cupo"


def test_proveedor_no_soportado(monkeypatch):
    monkeypatch.setenv("CANALYT_IA_PROVEEDOR", "gemini")
    with pytest.raises(motor_ia.ErrorIA):
        motor_ia.proveedor()
    assert motor_ia.salud()["estado"] == "error" and motor_ia.disponible() is False


def test_conexion_de_claude(cliente, tmp_path, monkeypatch):
    """Instalado / con sesión / de pago por uso, leídos de `--version` y `auth status` (sin llamar al modelo)."""
    def falso(salida_auth, version="2.1.0 (Claude Code)"):
        guion = tmp_path / "claude"
        guion.write_text("#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo '%s'; exit 0; fi\n"
                         "if [ \"$1\" = \"auth\" ]; then echo '%s'; exit 0; fi\nexit 1\n" % (version, salida_auth))
        guion.chmod(0o755)
        monkeypatch.setenv("CANALYT_CLAUDE", str(guion))
    falso('{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", "subscriptionType": "pro"}')
    r = cliente.get("/api/ia/conexion").json()
    assert r["instalado"] and r["version"] == "2.1.0" and r["con_sesion"] and r["suscripcion"] == "pro" and not r["por_uso"]
    falso('{"loggedIn": true, "authMethod": "api_key", "apiProvider": "firstParty"}')
    assert cliente.get("/api/ia/conexion").json()["por_uso"] is True
    falso('{"loggedIn": false}')
    r = cliente.get("/api/ia/conexion").json()
    assert r["instalado"] and not r["con_sesion"]
    monkeypatch.setenv("CANALYT_CLAUDE", str(tmp_path / "no-existe"))
    assert cliente.get("/api/ia/conexion").json()["instalado"] is False

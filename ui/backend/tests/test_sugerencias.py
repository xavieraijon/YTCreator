"""Sugerir un prompt con Claude, con un «claude» falso (sin gastar la suscripción)."""
import json
import stat

import pytest

from app import sugerencias


def _falso(tmp_path, monkeypatch, resultado, codigo=0):
    """Un ejecutable que se comporta como `claude -p … --output-format json` y guarda sus argumentos."""
    args = tmp_path / "args.json"
    guion = tmp_path / "claude"
    salida = json.dumps({"type": "result", "is_error": False, "duration_ms": 1500, "result": resultado})
    guion.write_text(f"#!/usr/bin/env python3\nimport json, sys\njson.dump(sys.argv[1:], open({str(args)!r}, 'w'))\n"
                     f"print({salida!r})\nsys.exit({codigo})\n")
    guion.chmod(guion.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("CANALYT_CLAUDE", str(guion))
    return args


def test_extraer_tolera_texto_y_bloques():
    d = sugerencias._extraer('Aquí va:\n```json\n{"prompt": "a  cat", "explicacion": "x", "servicio": "ai33"}\n```')
    assert d == {"prompt": "a cat", "explicacion": "x", "servicio": "ai33"}
    with pytest.raises(sugerencias.ErrorSugerencia):
        sugerencias._extraer("sin json")


def test_sugerir_solo_lectura_y_con_la_imagen(cliente, tmp_path, monkeypatch):
    args = _falso(tmp_path, monkeypatch, '{"prompt": "two arms only", "explicacion": "Tenía tres brazos.", "servicio": "ai33"}')
    videos = cliente.get("/api/videos", params={"canal": "_archivo/los-viajes-de-tok"}).json()
    vid = next(v["id"] for v in videos if v["carpeta"].startswith("001-"))
    img = next(i for i in cliente.get(f"/api/videos/{vid}").json()["imagenes"] if i["origen"] == "prompt")
    url = f"/api/videos/{vid}/imagenes/{img['ident']}/sugerir"
    assert cliente.post(url, json={"motivo": "  "}).status_code == 422
    r = cliente.post(url, json={"motivo": "tres brazos"})
    assert r.status_code == 200, r.text
    assert r.json() == {"prompt": "two arms only", "explicacion": "Tenía tres brazos.", "servicio": "ai33", "segundos": 2}
    a = json.load(open(args))
    encargo = a[a.index("-p") + 1]
    assert "tres brazos" in encargo and f"img/{img['ident']}.png" in encargo and img["prompt"] in encargo
    permitidas = a[a.index("--allowedTools") + 1:a.index("--disallowedTools")]
    assert permitidas == ["Read", "Glob", "Grep"] and "Write" in a and "Bash" in a


def test_error_de_claude(cliente, tmp_path, monkeypatch):
    _falso(tmp_path, monkeypatch, "no sé", codigo=0)
    videos = cliente.get("/api/videos", params={"canal": "_archivo/los-viajes-de-tok"}).json()
    vid = next(v["id"] for v in videos if v["carpeta"].startswith("001-"))
    img = next(i for i in cliente.get(f"/api/videos/{vid}").json()["imagenes"] if i["origen"] == "prompt")
    r = cliente.post(f"/api/videos/{vid}/imagenes/{img['ident']}/sugerir", json={"motivo": "mal"})
    assert r.status_code == 502 and "formato" in r.json()["detail"]

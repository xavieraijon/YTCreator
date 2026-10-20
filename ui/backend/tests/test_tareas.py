import time

import pytest

from app import tareas


@pytest.fixture()
def eco(tmp_path, monkeypatch):
    """Herramientas falsas y rápidas (scripts temporales), en lugar de las del kit."""
    monkeypatch.setenv("CANALYT_TAREAS", str(tmp_path / "logs"))
    eco = tmp_path / "eco.py"
    eco.write_text("import sys\nfor i in (1, 2, 3):\n    print(f'  imagen 01-{i}: generada', flush=True)\n"
                   "print('OK: fin')\n")
    lento = tmp_path / "lento.py"
    lento.write_text("import time\nprint('empiezo', flush=True)\ntime.sleep(30)\n")
    monkeypatch.setitem(tareas.HERRAMIENTAS, "eco", tareas.Herramienta("Eco", str(eco), False, False))
    monkeypatch.setitem(tareas.HERRAMIENTAS, "lento", tareas.Herramienta("Lento", str(lento), True, False))
    monkeypatch.setitem(tareas.HERRAMIENTAS, "lento2", tareas.Herramienta("Lento 2", str(lento), True, False))
    return tmp_path


def _esperar(cliente, tid, estados, segundos=15):
    fin = time.time() + segundos
    while time.time() < fin:
        t = cliente.get(f"/api/tareas/{tid}").json()
        if t["estado"] in estados:
            return t
        time.sleep(0.2)
    raise AssertionError(f"la tarea {tid} sigue en {t['estado']}")


def test_lista_blanca_y_validacion(cliente):
    assert {h["clave"] for h in cliente.get("/api/herramientas").json()} >= {"imagenes", "revisar_guion", "cuota"}
    assert cliente.post("/api/tareas", json={"herramienta": "rm -rf /"}).status_code == 422
    assert cliente.post("/api/tareas", json={"herramienta": "revisar_guion"}).status_code == 422  # sin vídeo
    r = cliente.post("/api/tareas", json={"herramienta": "saturacion", "argumentos": {"dato": "a\nb"}})
    assert r.status_code == 422


def test_rehacer_solo_admite_ids(cliente):
    videos = cliente.get("/api/videos").json()
    con_guion = next(v for v in videos if v["escenas_total"])
    r = cliente.post("/api/tareas", json={"herramienta": "imagenes", "video_id": con_guion["id"],
                                          "argumentos": {"rehacer": "01-1; rm -rf ~"}})
    assert r.status_code == 422


def test_ejecuta_y_guarda_la_salida(cliente, eco):
    t = cliente.post("/api/tareas", json={"herramienta": "eco"}).json()
    fin = _esperar(cliente, t["id"], {"hecha", "error"})
    assert fin["estado"] == "hecha" and fin["codigo"] == 0
    assert fin["lineas"][-1] == "OK: fin"
    assert "imagen 01-3: generada" in "\n".join(fin["lineas"])


def test_cancelar_y_una_pesada_a_la_vez(cliente, eco):
    a = cliente.post("/api/tareas", json={"herramienta": "lento"}).json()
    b = cliente.post("/api/tareas", json={"herramienta": "lento2"}).json()
    _esperar(cliente, a["id"], {"en_curso"})
    time.sleep(0.5)
    assert cliente.get(f"/api/tareas/{b['id']}").json()["estado"] == "en_cola"   # espera a la primera
    assert cliente.post(f"/api/tareas/{b['id']}/cancelar").json()["estado"] == "cancelada"
    cliente.post(f"/api/tareas/{a['id']}/cancelar")
    assert _esperar(cliente, a["id"], {"cancelada", "error", "hecha"})["estado"] == "cancelada"


def _video_001(cliente):
    return next((v for v in cliente.get("/api/videos").json() if v["carpeta"].startswith("001-phineas")), None)


def test_ai33_pide_confirmacion_y_cifra_exacta(cliente):
    v = _video_001(cliente)
    if not v:
        pytest.skip("sin el vídeo 001")
    cola = cliente.get(f"/api/videos/{v['id']}/ai33", params={"vivo": False}).json()
    assert cola["creditos_por_imagen"] > 0 and cola["previsto_euros"] >= 0
    r = cliente.post("/api/tareas", json={"herramienta": "imagenes_ai33", "video_id": v["id"]})
    assert r.status_code == 422                                   # sin confirmar, nada
    r = cliente.post("/api/tareas", json={"herramienta": "imagenes_ai33", "video_id": v["id"],
                                          "argumentos": {"confirmado": True, "previsto": 9999}})
    assert r.status_code == 422                                   # cifra que no coincide, nada


def test_estructura_referencia_valida_la_url():
    arg = tareas._estructura
    assert arg(None, {"url": "https://www.youtube.com/watch?v=YzD6Dz423Y8"}) == [
        "https://www.youtube.com/watch?v=YzD6Dz423Y8", "--mostrar"]
    for mala in ("", "https://evil.example/watch?v=YzD6Dz423Y8", "https://www.youtube.com/watch?v=corto",
                 "https://www.youtube.com/watch?v=YzD6Dz423Y8\n--exec", "-o /tmp/x"):
        with pytest.raises(tareas.ErrorTarea):
            arg(None, {"url": mala})
    assert arg(None, {"sintesis": True, "idioma": "es", "solo_outliers": True}) == [
        "--sintesis", "--mostrar", "--idioma", "es", "--solo-outliers"]
    with pytest.raises(tareas.ErrorTarea):
        arg(None, {"sintesis": True, "idioma": "es; rm"})


def test_comparar_referencia_valida_la_url():
    arg = tareas._comparar_referencia
    assert arg("guion.json", {"url": "https://www.youtube.com/watch?v=YzD6Dz423Y8"}) == [
        "--comparar", "guion.json", "https://www.youtube.com/watch?v=YzD6Dz423Y8"]
    for mala in ("", "https://evil.example/watch?v=YzD6Dz423Y8", "https://www.youtube.com/watch?v=YzD6Dz423Y8\n--exec"):
        with pytest.raises(tareas.ErrorTarea):
            arg("guion.json", {"url": mala})


def test_comparar_referencia_en_la_lista_blanca(cliente):
    assert "comparar_referencia" in {h["clave"] for h in cliente.get("/api/herramientas").json()}
    r = cliente.post("/api/tareas", json={"herramienta": "comparar_referencia"})
    assert r.status_code == 422                                   # sin vídeo, nada
    v = _video_001(cliente)
    if not v:
        pytest.skip("sin el vídeo 001")
    r = cliente.post("/api/tareas", json={"herramienta": "comparar_referencia", "video_id": v["id"],
                                          "argumentos": {"url": "nada"}})
    assert r.status_code == 422


def test_estructura_referencia_en_la_lista_blanca(cliente):
    assert "estructura_referencia" in {h["clave"] for h in cliente.get("/api/herramientas").json()}
    r = cliente.post("/api/tareas", json={"herramienta": "estructura_referencia", "argumentos": {"url": "nada"}})
    assert r.status_code == 422
    r = cliente.post("/api/tareas", json={"herramienta": "estructura_referencia",
                                          "argumentos": {"url": "https://youtu.be/YzD6Dz423Y8", "canal": "no-existe"}})
    assert r.status_code == 422


def test_modo_sin_gasto_veta_las_herramientas_de_pago(cliente, monkeypatch, tmp_path):
    """Las pruebas corren sin gasto (conftest) y ninguna herramienta de ai33 llega a enviar nada; el interruptor se guarda."""
    import adaptadores_voz
    import imagen_ai33
    import musica_ai33
    import requests

    def no_debe_llamarse(*a, **k):
        raise AssertionError("se ha intentado enviar algo a la red de pago")
    monkeypatch.setattr(requests, "post", no_debe_llamarse)
    with pytest.raises(SystemExit) as e:
        adaptadores_voz.locutar_ai33("hola", "voz")
    assert "SIN GASTO" in str(e.value)
    with pytest.raises(SystemExit):
        imagen_ai33._mandar({}, {"prompt": "x", "formato": "16:9", "ident": "01-1"}, {"modelo": "m", "resolucion": "1k"}, [])
    with pytest.raises(SystemExit):
        musica_ai33.encargar({"escenas": []}, tmp_path, "misterio", prompt="x")
    a = cliente.get("/api/ajustes").json()
    assert a["sin_gasto_activo"] is True                        # forzado por el entorno de las pruebas
    assert cliente.put("/api/ajustes/sin-gasto", json={"activo": True}).json()["sin_gasto"] is True
    assert cliente.get("/api/ajustes").json()["sin_gasto"] is True


def test_la_barra_de_imagenes_cuenta_eventos_no_texto(cliente, tmp_path, monkeypatch):
    """La barra cuenta los «@evento» de canal.evento (no el texto para personas) y estos no van a la salida."""
    monkeypatch.setenv("CANALYT_TAREAS", str(tmp_path / "logs"))
    script = tmp_path / "boceto_falso.py"
    script.write_text(
        "import json\n"
        "for i, estado in ((1, 'generada'), (2, 'generada'), (3, 'reutilizada')):\n"
        "    print(f'  imagen 01-{i}: texto cualquiera', flush=True)\n"
        "    print('@evento ' + json.dumps({'tipo': 'imagen', 'ident': f'01-{i}', 'estado': estado}), flush=True)\n"
        "print('@evento {roto', flush=True)\n")
    monkeypatch.setitem(tareas.HERRAMIENTAS, "imagenes", tareas.Herramienta(
        "Imágenes", str(script), False, True, lambda g, a: [], progreso_imagenes=True))
    v = _video_001(cliente)
    t = cliente.post("/api/tareas", json={"herramienta": "imagenes", "video_id": v["id"]}).json()
    fin = _esperar(cliente, t["id"], {"hecha", "error"})
    assert fin["estado"] == "hecha"
    assert not any(l.startswith("@evento") for l in fin["lineas"])
    assert "  imagen 01-3: texto cualquiera" in fin["lineas"]
    assert fin["progreso"]["total"] >= 3 and fin["progreso"]["hecho"] == 2     # la reutilizada no cuenta


def test_el_log_del_backend_dice_tarea_y_tiempo_por_fase(cliente, eco, monkeypatch):
    """Observabilidad: la línea final de una tarea en backend.log lleva su tarea y lo que tardó cada fase."""
    import logging

    from app.contexto_log import FiltroContexto
    fases = eco / "fases.py"
    fases.write_text("import time\nfor e in ('Voces', 'Vídeo: 1 de 2 s', 'Vídeo: 2 de 2 s'):\n"
                     "    print('@progreso - ' + e, flush=True)\n    time.sleep(0.05)\n")
    monkeypatch.setitem(tareas.HERRAMIENTAS, "fases", tareas.Herramienta("Fases", str(fases), False, False))
    lineas = []
    h = logging.Handler()
    h.emit = lambda r: lineas.append(h.format(r))
    h.addFilter(FiltroContexto())
    h.setFormatter(logging.Formatter("%(contexto)s %(message)s"))
    tareas.log.addHandler(h)
    try:
        t = cliente.post("/api/tareas", json={"herramienta": "fases"}).json()
        _esperar(cliente, t["id"], {"hecha", "error"})
        fin = time.time() + 5
        while not any("hecha" in x for x in lineas) and time.time() < fin:
            time.sleep(0.05)
    finally:
        tareas.log.removeHandler(h)
    final = next(x for x in lineas if "hecha" in x)
    assert final.startswith(f" [tarea {t['id']}] Tarea {t['id']} (fases): hecha, código 0. Tiempo: ")
    assert "(Voces " in final and " · Vídeo " in final

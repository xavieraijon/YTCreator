"""Fiabilidad: lo que pasa cuando algo va mal (archivo dañado, disco lleno, sin red, servicio que responde mal).
Que nada se pierda, que la app siga en pie y que el usuario lea qué ha pasado y qué hacer."""
import errno
import json

import pytest

from tests.test_fases_ui import CANAL_JSON, PROPUESTAS


@pytest.fixture()
def video(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    c = tmp_path / "canales" / "prueba"
    c.mkdir(parents=True)
    (c / "canal.json").write_text(json.dumps(CANAL_JSON))
    d = cliente.post("/api/canales/prueba/videos", json={"tema": "Mente en blanco"}).json()
    return d["id"], c / "videos" / d["carpeta"]


def _sincronizar():
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal
    with Sesion() as s:
        sincronizar_canal(s, "prueba")


DANADO = '{"fase": "C", "completadas": ["A", "B"'          # cortado a medias (un editor o Claude a medio escribir)


# --- Archivo dañado ------------------------------------------------------------------------------------------------------

def test_un_estado_danado_no_tumba_la_app_y_se_dice(cliente, video):
    vid, carpeta = video
    (carpeta / "estado.json").write_text(DANADO)
    _sincronizar()
    r = cliente.get(f"/api/videos/{vid}")
    assert r.status_code == 200
    real = r.json()["estado_real"]
    assert real and "dañado" in (real.get("archivo_danado") or "")
    assert cliente.get("/api/videos", params={"canal": "prueba"}).status_code == 200
    assert cliente.get("/api/asistente").status_code == 200
    assert r.json()["fase"] == "B"                                   # conserva lo último que se supo
    from app.estado_video import texto
    from tests.test_glosario import es_jerga
    assert texto(real).startswith("ATENCIÓN: No se puede leer el estado del vídeo")   # Claude lo sabe
    assert not es_jerga(real["archivo_danado"])                        # sin nombres de archivo


def test_campos_con_un_tipo_inesperado_no_tumban_la_sincronizacion(cliente, video):
    """estado.json lo escribe también Claude: unas notas en lista (o un número donde va un texto) tumbaban el arranque."""
    vid, carpeta = video
    estado = json.loads((carpeta / "estado.json").read_text())
    estado.update({"notas": ["Primera nota.", "Segunda nota."], "pilar": 7, "duracion_objetivo": "diez"})
    (carpeta / "estado.json").write_text(json.dumps(estado))
    _sincronizar()
    v = cliente.get(f"/api/videos/{vid}").json()
    assert v["notas"] == ["Primera nota.", "Segunda nota."] and v["pilar"] == "7" and v["duracion_objetivo"] is None


def test_con_el_estado_danado_no_se_escribe_encima(cliente, video):
    vid, carpeta = video
    (carpeta / "estado.json").write_text(DANADO)
    (carpeta / "propuestas.json").write_text(json.dumps(PROPUESTAS))
    for metodo, url, cuerpo in (("post", f"/api/videos/{vid}/aprobaciones", {"punto": "b-aprobar"}),
                                ("post", f"/api/videos/{vid}/fase-b/elegir", {"propuesta": 1, "minutos": 10}),
                                ("post", f"/api/videos/{vid}/archivar", {"archivado": True})):
        r = getattr(cliente, metodo)(url, json=cuerpo)
        assert r.status_code in (409, 422), (url, r.status_code, r.text)
        assert "dañado" in r.json()["detail"], r.json()
        assert "estado del vídeo" in r.json()["detail"] and ".json" not in r.json()["detail"]
        assert (carpeta / "estado.json").read_text() == DANADO          # intacto: se puede reparar


def test_un_guion_danado_se_dice_y_la_fase_sigue_abriendo(cliente, video):
    vid, carpeta = video
    e = json.loads((carpeta / "estado.json").read_text())
    (carpeta / "estado.json").write_text(json.dumps({**e, "fase": "D", "completadas": ["A", "B", "C"]}))
    (carpeta / "guion.json").write_text('{"escenas": [{"texto": "hola"')
    _sincronizar()
    real = cliente.get(f"/api/videos/{vid}").json()["estado_real"]
    assert "guion" in (real.get("archivo_danado") or "")
    assert cliente.get(f"/api/videos/{vid}/fase/D").status_code == 200


def test_un_canal_json_danado_no_tumba_la_lista(cliente, video, tmp_path):
    (tmp_path / "canales" / "prueba" / "canal.json").write_text("{nombre: sin comillas}")
    _sincronizar()
    assert cliente.get("/api/canales").status_code == 200
    vid, _ = video
    assert cliente.get(f"/api/videos/{vid}").status_code == 200


# --- Disco lleno ---------------------------------------------------------------------------------------------------------

def test_disco_lleno_al_escribir_deja_el_original_y_no_deja_temporales(tmp_path, monkeypatch):
    import archivos
    import os
    ruta = tmp_path / "estado.json"
    ruta.write_text('{"fase": "B"}')

    def lleno(*a, **k):
        raise OSError(errno.ENOSPC, "No space left on device")
    monkeypatch.setattr(os, "fsync", lleno)
    with pytest.raises(OSError):
        archivos.escribir_json(ruta, {"fase": "C"})
    assert ruta.read_text() == '{"fase": "B"}'
    assert [p.name for p in tmp_path.iterdir()] == ["estado.json"]


def test_disco_lleno_en_la_app_se_explica(cliente, video, monkeypatch):
    import archivos
    vid, carpeta = video
    antes = (carpeta / "estado.json").read_text()

    def lleno(*a, **k):
        raise OSError(errno.ENOSPC, "No space left on device")
    monkeypatch.setattr(archivos, "escribir_json", lleno)
    r = cliente.post(f"/api/videos/{vid}/aprobaciones", json={"punto": "b-aprobar"})
    assert r.status_code == 507, r.text
    assert "espacio" in r.json()["detail"].lower()
    assert (carpeta / "estado.json").read_text() == antes


# --- Servicio de pago que responde mal (ai33 de mentira: sin red y sin gastar) ------------------------------------------

class _Resp:
    def __init__(self, codigo=200, cuerpo=None, texto="", contenido=b""):
        self.status_code, self._cuerpo, self.text, self.content = codigo, cuerpo, texto, contenido
        self.ok = 200 <= codigo < 300

    def json(self):
        if self._cuerpo is None:
            raise ValueError("no es JSON")
        return self._cuerpo


@pytest.fixture()
def ai33(monkeypatch, tmp_path):
    import imagen_ai33
    import simulacion
    import uso
    monkeypatch.setattr(simulacion, "exigir_pago_permitido", lambda *a: None)
    monkeypatch.setattr(simulacion, "activa", lambda: False)
    monkeypatch.setattr(imagen_ai33, "cabeceras", lambda: {"xi-api-key": "falsa"})
    monkeypatch.setattr(imagen_ai33.time, "sleep", lambda s: None)
    gastos = []
    monkeypatch.setattr(uso, "registrar", lambda *a, **k: gastos.append(a))
    imagen_ai33._gastos = gastos
    return imagen_ai33


def _peticion(tmp_path, ident="01-1"):
    return {"ident": ident, "prompt": "un gato", "salida": tmp_path / "img" / f"{ident}.png", "formato": "horizontal",
            "firma": "f1"}


CFG = {"modelo": "gemini-x", "resolucion": "1K"}


def test_una_pagina_de_error_al_mandar_no_tumba_el_lote(ai33, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(ai33.requests, "post", lambda *a, **k: _Resp(502, None, "<html>Bad gateway</html>"))
    hechas, errores, cobrado = ai33.lote([_peticion(tmp_path)], CFG, [], tmp_path / "img")
    assert (hechas, errores, cobrado) == ([], ["01-1"], 0)
    assert "ERROR al mandar: 502" in capsys.readouterr().out


def test_aceptada_sin_numero_de_encargo_avisa_y_no_se_repite(ai33, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(ai33.requests, "post", lambda *a, **k: _Resp(200, {"success": True, "estimated_credits": 1720}))
    hechas, errores, _ = ai33.lote([_peticion(tmp_path)], CFG, [], tmp_path / "img")
    assert errores == ["01-1"] and not hechas
    assert "puede haberse cobrado" in capsys.readouterr().out
    assert ai33._gastos and ai33._gastos[0][1] == 1720                 # lo cobrado queda apuntado


def test_una_descarga_que_no_es_imagen_no_se_da_por_buena_y_queda_para_recoger(ai33, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(ai33.requests, "post", lambda *a, **k: _Resp(200, {"success": True, "task_id": "t-1",
                                                                         "estimated_credits": 1720}))
    hecha = {"status": "done", "metadata": {"result_images": [{"imageUrl": "https://x/1.png"}]}}

    def get(url, **k):
        return _Resp(200, hecha) if "/task/" in url else _Resp(200, contenido=b"<html>error</html>")
    monkeypatch.setattr(ai33.requests, "get", get)
    hechas, errores, cobrado = ai33.lote([_peticion(tmp_path)], CFG, [], tmp_path / "img")
    assert (hechas, errores, cobrado) == ([], ["01-1"], 1720)
    assert not (tmp_path / "img" / "01-1.png").exists() and not (tmp_path / "img" / "01-1.firma").exists()
    assert "sin volver a pagarla" in capsys.readouterr().out
    assert ai33.tareas_apuntadas(tmp_path / "img")["01-1"]["tarea"] == "t-1"   # se recoge en la próxima pasada
    # la próxima pasada la recoge sin mandarla otra vez (no se paga dos veces)
    monkeypatch.setattr(ai33.requests, "post", lambda *a, **k: pytest.fail("no debe volver a mandarla"))
    monkeypatch.setattr(ai33.requests, "get", lambda url, **k: _Resp(200, hecha) if "/task/" in url
                        else _Resp(200, contenido=b"\x89PNG\r\n\x1a\n imagen"))
    hechas, errores, cobrado = ai33.lote([_peticion(tmp_path)], CFG, [], tmp_path / "img")
    assert (hechas, errores, cobrado) == (["01-1"], [], 0)
    assert (tmp_path / "img" / "01-1.png").read_bytes().startswith(b"\x89PNG")
    assert (tmp_path / "img" / "01-1.firma").read_text() == "f1"


def test_un_envio_sin_respuesta_no_se_repite_solo_porque_podria_cobrarse_dos_veces(ai33, tmp_path, monkeypatch, capsys):
    import requests
    envios = []

    def post(*a, **k):
        envios.append(1)
        raise requests.ReadTimeout("sin respuesta")
    monkeypatch.setattr(ai33.requests, "post", post)
    hechas, errores, _ = ai33.lote([_peticion(tmp_path)], CFG, [], tmp_path / "img")
    assert errores == ["01-1"] and len(envios) == 1
    assert "puede haberse cobrado" in capsys.readouterr().out


def test_la_voz_de_pago_reintenta_sin_conexion_pero_no_tras_un_envio_sin_respuesta(monkeypatch):
    import adaptadores_voz
    import requests
    import simulacion
    monkeypatch.setattr(simulacion, "exigir_pago_permitido", lambda *a: None)
    monkeypatch.setenv("AI33_API_KEY", "falsa")
    monkeypatch.setattr(adaptadores_voz, "load_dotenv", lambda *a, **k: None)
    monkeypatch.setattr(adaptadores_voz.time, "sleep", lambda s: None)
    envios = []

    def sin_respuesta(*a, **k):
        envios.append(1)
        raise requests.ReadTimeout("sin respuesta")
    monkeypatch.setattr(adaptadores_voz.requests, "post", sin_respuesta)
    with pytest.raises(SystemExit, match="puede haberse cobrado"):
        adaptadores_voz.locutar_ai33("Hola", "voz")
    assert len(envios) == 1                                   # no se repite: podría cobrarse dos veces

    envios.clear()

    def sin_conexion(*a, **k):
        envios.append(1)
        raise requests.ConnectionError("sin red")
    monkeypatch.setattr(adaptadores_voz.requests, "post", sin_conexion)
    with pytest.raises(SystemExit, match="tras 5 intentos"):
        adaptadores_voz.locutar_ai33("Hola", "voz")
    assert len(envios) == 5                                   # no llegó a salir: se puede reintentar

    monkeypatch.setattr(adaptadores_voz.requests, "post", lambda *a, **k: _Resp(200, {"success": True}))
    with pytest.raises(SystemExit, match="no ha devuelto su número de encargo"):
        adaptadores_voz.locutar_ai33("Hola", "voz")

"""Pantalla web de progreso de la instalación (herramientas/instalar_progreso.py): estado de los 11 pasos, el pequeño
servidor HTTP que lo sirve y que `detener` no falle si no hay nada que parar."""
import json
import socket
import threading

import pytest

import instalar_progreso as ip


@pytest.fixture(autouse=True)
def _en_una_carpeta_temporal(tmp_path, monkeypatch):
    """Nunca tocar `programas/` del kit real ni el puerto 8765 de verdad."""
    monkeypatch.setattr(ip, "PROGRAMAS", tmp_path)
    monkeypatch.setattr(ip, "ESTADO", tmp_path / "instalar_progreso.json")
    monkeypatch.setattr(ip, "PIDFILE", tmp_path / "instalar_progreso.pid")


def test_el_estado_inicial_tiene_los_11_pasos_hechos_hasta_el_que_esta_en_marcha():
    e = ip._inicial()
    assert len(e["pasos"]) == 11 and e["listo"] is False and e["nota"] == ""
    assert [p["estado"] for p in e["pasos"]] == ["ok", "ok", "marcha"] + ["pendiente"] * 8
    assert [p["estado"] for p in ip._inicial(5)["pasos"]][:6] == ["ok"] * 4 + ["marcha", "pendiente"]


def test_nota_pone_y_quita_el_aviso():
    ip._escribir(ip._inicial())
    ip.nota("Vuelve a la terminal")
    assert ip._leer()["nota"] == "Vuelve a la terminal"
    ip.nota()
    assert ip._leer()["nota"] == ""


def test_paso_actualiza_un_paso_y_rechaza_uno_que_no_existe():
    ip._escribir(ip._inicial())
    ip.paso(4, "ok", "ffmpeg instalado")
    e = ip._leer()
    assert e["pasos"][3] == {"numero": 4, "titulo": "ffmpeg (monta los vídeos)", "estado": "ok", "texto": "ffmpeg instalado"}
    assert e["pasos"][4]["estado"] == "pendiente"      # los demás, intactos
    with pytest.raises(SystemExit, match="no existe el paso 99"):
        ip.paso(99, "ok")


def test_listo_marca_el_estado_como_terminado():
    ip._escribir(ip._inicial())
    ip.listo()
    assert ip._leer()["listo"] is True


def test_detener_sin_pidfile_no_falla():
    ip.detener()    # nada que parar: no debe lanzar ni escribir nada


def _puerto_libre() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_el_servidor_sirve_la_pagina_y_el_estado(monkeypatch):
    puerto = _puerto_libre()
    monkeypatch.setattr(ip, "PUERTO", puerto)
    ip._escribir(ip._inicial())
    from http.server import ThreadingHTTPServer
    servidor = ThreadingHTTPServer(("127.0.0.1", puerto), ip._Handler)
    hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
    hilo.start()
    try:
        import urllib.request
        pagina = urllib.request.urlopen(f"http://127.0.0.1:{puerto}/", timeout=5).read().decode("utf-8")
        assert "Instalando YTCreator" in pagina
        estado = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{puerto}/estado.json", timeout=5).read())
        assert len(estado["pasos"]) == 11
    finally:
        servidor.shutdown()
        hilo.join(timeout=5)

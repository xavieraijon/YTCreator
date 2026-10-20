"""Imagen y voz con servicios conectados por el usuario (plan 8b): los conectores entran como adaptadores de los contratos y
gen_imagen / gen_voz los eligen. Sin red ni gasto: `conector_ia.requests` está sustituido."""
import io
import json
import subprocess

import adaptadores_imagen as ai
import adaptadores_voz as av
import conector_ia
import gen_imagen
import pytest
import servicios
from PIL import Image

from tests.test_conector_ia import Resp
from tests.test_conectores import espacio_c, spec  # noqa: F401


def png():
    b = io.BytesIO()
    Image.new("RGB", (8, 6), "red").save(b, "PNG")
    return b.getvalue()


def conectar(carpeta, monkeypatch, **extra):
    d = carpeta / "proveedores"
    d.mkdir(exist_ok=True)
    (d / "demo.json").write_text(json.dumps(spec(**extra)))
    monkeypatch.setenv("DEMO_API_KEY", "k")
    monkeypatch.setattr(servicios, "claves_rellenas", lambda env=None: {"DEMO_API_KEY": True})
    monkeypatch.delenv("CANALYT_SIN_GASTO", raising=False)
    monkeypatch.setattr(conector_ia.simulacion, "activa", lambda: False)


def test_el_conector_de_imagen_genera_con_los_datos_de_la_solicitud(espacio_c, monkeypatch, tmp_path):  # noqa: F811
    conectar(espacio_c, monkeypatch, peticion={"metodo": "POST", "ruta": "/i", "cuerpo": {
        "p": "{prompt}", "w": "{ancho}", "h": "{alto}", "s": "{semilla}", "r": "{referencia_base64}"}},
        respuesta={"formato": "base64", "donde": "img"})
    visto = {}

    def peticion(m, u, **kw):
        visto.update(kw["json"])
        import base64
        return Resp(datos={"img": base64.b64encode(png()).decode()})
    monkeypatch.setattr(conector_ia.requests, "request", peticion)
    c = ai.conectores_de_usuario()["demo"]
    ruta = c.generar(ai.SolicitudImagen("un búho", tmp_path / "a.jpg", "vertical", semilla=7))
    assert visto["p"] == "un búho" and (visto["w"], visto["h"], visto["s"], visto["r"]) == (768, 1344, 7, "")
    assert Image.open(ruta).size == (8, 6) and not (tmp_path / "a.conector").exists()


def test_cupo_agotado_es_cuota_agotada_y_el_motor_automatico_no_gasta(espacio_c, monkeypatch, tmp_path):  # noqa: F811
    conectar(espacio_c, monkeypatch, coste={"cantidad": 0.04, "unidad": "USD"})
    c = ai.conectores_de_usuario()["demo"]
    assert c.de_pago
    monkeypatch.setattr(conector_ia.requests, "request", lambda *a, **k: Resp(429, {"error": "x"}))
    with pytest.raises(ai.CuotaAgotada):
        c.generar(ai.SolicitudImagen("p", tmp_path / "a.png"))
    assert gen_imagen._conectores_gratis() == []                 # de pago: solo si se pide por su nombre


def test_gen_imagen_usa_el_conector_pedido_y_rechaza_motores_desconocidos(espacio_c, monkeypatch, tmp_path):  # noqa: F811
    conectar(espacio_c, monkeypatch)
    llamadas = []
    monkeypatch.setattr(ai.Conector, "generar", lambda self, sol: llamadas.append((self.id, sol.prompt)) or sol.salida)
    monkeypatch.setattr(gen_imagen, "MOTOR", "demo")
    assert gen_imagen.generar("p", tmp_path / "a.png") == tmp_path / "a.png" and llamadas == [("demo", "p")]
    monkeypatch.setattr(gen_imagen, "MOTOR", "nada")
    with pytest.raises(SystemExit, match="no es un motor"):
        gen_imagen.generar("p", tmp_path / "b.png")


def test_el_conector_de_pago_en_modo_sin_gasto_da_imagen_de_relleno(espacio_c, monkeypatch, tmp_path):  # noqa: F811
    conectar(espacio_c, monkeypatch, coste={"cantidad": 0.04, "unidad": "USD"})
    monkeypatch.setattr(conector_ia.simulacion, "activa", lambda: True)
    monkeypatch.setattr(gen_imagen.simulacion, "activa", lambda: True)
    monkeypatch.setattr(gen_imagen, "MOTOR", "demo")
    monkeypatch.setattr(conector_ia.requests, "request", lambda *a, **k: pytest.fail("no debe enviar"))
    assert gen_imagen.generar("p", tmp_path / "a.png").exists()


def test_la_voz_con_prefijo_de_conector(espacio_c, monkeypatch):  # noqa: F811
    conectar(espacio_c, monkeypatch, capacidad="voz", respuesta={"formato": "binario"},
             peticion={"metodo": "POST", "ruta": "/v", "cuerpo": {"t": "{texto}", "v": "{voz}"}})
    proveedor, voz = av.proveedor_de("demo:lucia")
    assert (proveedor.id, voz, proveedor.de_pago, proveedor.claves) == ("demo", "lucia", False, ("DEMO_API_KEY",))
    assert av.proveedor_de("es-ES-AlvaroNeural")[0].id == "azure"
    visto = {}

    def peticion(m, u, **kw):
        visto.update(kw["json"])
        return Resp(contenido=b"AUDIO")
    monkeypatch.setattr(conector_ia.requests, "request", peticion)
    monkeypatch.setattr(av.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0, b"\1\0\2\0", b""))
    r = proveedor.locutar(av.SolicitudVoz("Hola [excited] mundo", "lucia", "v.wav"))
    assert visto["v"] == "lucia" and "[excited]" not in visto["t"] and r.audio == b"\1\0\2\0" and r.palabras == []

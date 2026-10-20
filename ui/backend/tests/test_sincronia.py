"""Bloque B: sin servicios también se produce. La sincronía voz-texto aproximada (silencios y largo de las palabras) no
necesita a Azure, y las herramientas se niegan con un mensaje claro a usar un servicio que el usuario no ha elegido."""
import json
import subprocess

import numpy as np
import pytest
import requests

import gen_imagen
import gen_voz
import servicios
import simulacion
from app import config

F = gen_voz.FRECUENCIA


def _tono(seg):
    t = np.arange(int(F * seg)) / F
    return (8000 * np.sin(2 * np.pi * 220 * t)).astype(np.int16)


def _silencio(seg):
    return np.zeros(int(F * seg), dtype=np.int16)


@pytest.fixture
def sin_servicios(monkeypatch, tmp_path):
    """Ni claves, ni red, ni motor del Mac, ni modo sin gasto: como alguien que no ha conectado nada."""
    import espacio
    def no_red(*a, **k):
        raise AssertionError("se ha tocado la red")
    monkeypatch.setattr(requests, "post", no_red)
    monkeypatch.setattr(requests, "get", no_red)
    monkeypatch.setattr(espacio, "ENV", tmp_path / ".env")
    monkeypatch.setenv("CANALYT_AJUSTES", str(tmp_path / "ajustes.json"))
    monkeypatch.setattr(servicios, "motor_local_instalado", lambda: False)
    monkeypatch.setattr(simulacion, "activa", lambda: False)
    for v in servicios.TODAS_LAS_CLAVES:
        monkeypatch.delenv(v, raising=False)


def test_cada_frase_cae_en_su_tramo_de_voz():
    audio = np.concatenate([_silencio(0.3), _tono(1.0), _silencio(0.5), _tono(2.0), _silencio(0.6), _tono(1.0)]).tobytes()
    assert gen_voz.tramos_con_voz(audio) == [(0.3, 1.3), (1.8, 3.8), (4.4, 5.4)]
    pal = gen_voz.alinear_aproximado("Hola mundo. Esta frase es bastante más larga, sigue un poco. Fin aquí.", audio)
    inicio = {p["texto"]: p["inicio"] for p in pal}
    assert inicio["Hola"] == 0.3 and inicio["Esta"] == 1.8 and inicio["Fin"] == 4.4
    assert all(a["inicio"] <= a["fin"] <= b["inicio"] for a, b in zip(pal, pal[1:]))      # en orden, sin solaparse
    assert gen_voz.alinear_aproximado("", audio) == [] and gen_voz.alinear_aproximado("Sin voz.", b"") != []


def test_locucion_subida_sin_azure_sale_con_sincronia_aproximada(sin_servicios, tmp_path):
    mp3 = tmp_path / "locucion.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=200:duration=2", str(mp3)], check=True)
    _, datos = gen_voz.sintetizar("Una frase corta. Y otra.", tmp_path / "v.wav", audio_externo=mp3)
    assert datos["sincronia"] == "aproximada" and [p["texto"] for p in datos["palabras"]] == ["Una", "frase", "corta.", "Y", "otra."]
    with pytest.raises(SystemExit) as e:                               # la exacta, sin Azure: lo dice claro
        gen_voz.sintetizar("Una frase.", tmp_path / "w.wav", audio_externo=mp3, sincronia="exacta")
    assert "sincronía exacta" in str(e.value)


def test_una_voz_de_un_servicio_que_no_se_usa_no_se_intenta(sin_servicios, tmp_path):
    with pytest.raises(SystemExit) as e:
        gen_voz.sintetizar("Hola.", tmp_path / "v.wav", voz="gemini:Puck")
    assert "que no usas" in str(e.value) and "sube tu locución" in str(e.value)


def test_sin_servicios_de_imagen_el_error_dice_que_se_suben(sin_servicios, tmp_path, monkeypatch):
    monkeypatch.setattr(gen_imagen, "MOTOR", "auto")
    with pytest.raises(SystemExit) as e:
        gen_imagen.generar("a fox", tmp_path / "01-1.png")
    assert "sube tus imágenes" in str(e.value)
    monkeypatch.setattr(gen_imagen, "MOTOR", "local")                 # el Mac, sin elegir o sin instalar: tampoco
    with pytest.raises(SystemExit) as e:
        gen_imagen.generar("a fox", tmp_path / "01-1.png")
    assert "este Mac" in str(e.value)


def test_elegir_la_sincronia_de_un_video(cliente, monkeypatch, tmp_path):
    monkeypatch.setattr(servicios, "disponible", lambda sid, env=None: False)      # sin Azure
    v = next(x for x in cliente.get("/api/videos").json() if x["carpeta"].startswith("001"))
    guion = config.RAIZ / "canales" / v["canal"] / "videos" / v["carpeta"] / "guion.json"
    original = guion.read_bytes()
    try:
        assert cliente.get(f"/api/videos/{v['id']}/voz/sincronia").json() == \
            {"elegida": None, "efectiva": "aproximada", "exacta_posible": False}
        r = cliente.put(f"/api/videos/{v['id']}/voz/sincronia", json={"sincronia": "exacta"}).json()
        assert r["elegida"] == "exacta" and json.loads(guion.read_text())["sincronia"] == "exacta"
        cliente.put(f"/api/videos/{v['id']}/voz/sincronia", json={"sincronia": None})
        assert "sincronia" not in json.loads(guion.read_text())
        assert cliente.put(f"/api/videos/{v['id']}/voz/sincronia", json={"sincronia": "otra"}).status_code == 422
    finally:
        guion.write_bytes(original)


def test_si_el_reconocimiento_no_entiende_la_voz_se_usa_la_aproximada(sin_servicios, tmp_path, monkeypatch, capsys):
    """Medido el 07/10: Azure entiende el 100 % de una voz de ai33 y el 23 % de una voz del sistema del Mac (la oye casi
    como inglés). Con tan poco, la «exacta» interpolaría casi todo: peor que la aproximada."""
    texto = "En el verano de mil quinientos dieciocho una mujer salió a la calle."
    oido_bien = [(gen_voz.normalizar(w), 0, 0) for w in texto.replace(".", "").split()]
    oido_mal = [(w, 0, 0) for w in "he operado el domingo stress beck out sunny overno".split()]
    assert gen_voz.proporcion_reconocida(texto, oido_bien) == 1.0
    assert gen_voz.proporcion_reconocida(texto, oido_mal) < gen_voz.RECONOCIDAS_MINIMO
    monkeypatch.setattr(servicios, "disponible", lambda sid, env=None: sid == "azure")
    monkeypatch.setattr(gen_voz, "reconocer_palabras", lambda audio: oido_mal)
    mp3 = tmp_path / "l.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=200:duration=3", str(mp3)], check=True)
    _, datos = gen_voz.sintetizar(texto, tmp_path / "v.wav", audio_externo=mp3, sincronia="exacta")
    assert datos["sincronia"] == "aproximada" and "solo ha entendido" in capsys.readouterr().out

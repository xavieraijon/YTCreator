"""Salidas falsas del modo sin gasto: se recorre voz, imágenes y música sin claves ni red, y nunca pisan algo real."""

import wave

import pytest
import requests
from PIL import Image

import gen_imagen
import gen_voz
import imagen_ai33
import musica_ai33
import simulacion


@pytest.fixture(autouse=True)
def sin_red_ni_claves(monkeypatch, tmp_path):
    def no_red(*a, **k):
        raise AssertionError("se ha tocado la red")
    monkeypatch.setattr(requests, "post", no_red)
    monkeypatch.setattr(requests, "get", no_red)
    import espacio
    monkeypatch.setattr(espacio, "ENV", tmp_path / ".env")          # .env inexistente (ni el real ni sus claves)
    for v in ("CF_ACCOUNT_ID", "CF_API_TOKEN", "AI33_API_KEY", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "GEMINI_API_KEY"):
        monkeypatch.delenv(v, raising=False)


def test_imagen_sin_clave_de_cloudflare(tmp_path):
    r = gen_imagen.generar("a fox at dawn", tmp_path / "img" / "01-1.png", "horizontal")
    assert Image.open(r).size == (1344, 768) and simulacion.es_simulada(r)


def test_una_imagen_real_no_se_pisa(tmp_path):
    real = tmp_path / "01-1.png"
    Image.new("RGB", (8, 8)).save(real)
    with pytest.raises(SystemExit) as e:
        gen_imagen.generar("x", real, "horizontal")
    assert "real" in str(e.value)
    assert not simulacion.es_simulada(real)


def test_lote_de_ai33_simulado_no_deja_firma_ni_gasta(tmp_path):
    pet = [{"ident": "02-1", "prompt": "p", "salida": tmp_path / "img" / "02-1.png", "formato": "vertical", "firma": "f"}]
    hechas, errores, gastado = imagen_ai33.lote(pet, {}, [], tmp_path / "img")
    assert hechas == ["02-1"] and errores == [] and gastado == 0
    assert Image.open(pet[0]["salida"]).size == (768, 1344)
    assert not pet[0]["salida"].with_suffix(".firma").exists()


@pytest.mark.parametrize("voz", ["ai33:abc", "es-ES-AlvaroNeural", "gemini:Puck"])
def test_voz_falsa_con_tiempos(tmp_path, voz):
    ruta, datos = gen_voz.sintetizar("Hola, esto es una prueba. Sigue {pausa:300} aquí.", tmp_path / "v.wav", voz=voz)
    assert datos["simulada"] and datos["duracion"] > 1 and [p["texto"] for p in datos["palabras"]][:2] == ["Hola,", "esto"]
    assert all(a["fin"] <= b["inicio"] + 1e-6 for a, b in zip(datos["palabras"], datos["palabras"][1:]))
    with wave.open(str(ruta)) as w:
        assert w.getframerate() == 24000
    assert simulacion.es_simulada(ruta)


def test_musica_falsa_y_limpieza(tmp_path):
    guion = {"escenas": [{"texto": "x", "musica": "alegre"}]}
    assert musica_ai33.encargar(guion, tmp_path, "alegre", prompt="suave") == 0
    e = musica_ai33.leer_estado(tmp_path)["alegre"]
    assert e["simulada"] and len(e["versiones"]) == 2 and (tmp_path / e["versiones"][0]["archivo"]).exists()
    musica_ai33.elegir(tmp_path, "alegre", 1)
    img = simulacion.imagen_falsa("x", tmp_path / "img" / "01-1.png", 64, 36)
    borrados = simulacion.limpiar_simuladas(tmp_path)
    assert not img.exists() and not (tmp_path / "musica" / "alegre.mp3").exists() and not (tmp_path / "musica" / "alegre_v1.mp3").exists()
    assert "versiones" not in musica_ai33.leer_estado(tmp_path)["alegre"] and borrados


def test_con_claves_no_se_falsea_lo_gratuito(monkeypatch, tmp_path):
    monkeypatch.setenv("CF_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CF_API_TOKEN", "t")
    assert not simulacion.falta_clave("CF_ACCOUNT_ID", "CF_API_TOKEN")
    with pytest.raises(AssertionError):                           # intenta la red real de Cloudflare (gratis)
        gen_imagen.generar("x", tmp_path / "a.png", "horizontal")


def test_consultar_ai33_sin_clave_no_tumba_el_backend(monkeypatch, tmp_path):
    """El backend importa imagen_ai33: sin clave, consultar devuelve «?» en vez de hacer sys.exit."""
    import imagen_ai33
    monkeypatch.delenv("AI33_API_KEY", raising=False)
    monkeypatch.setattr(imagen_ai33.espacio, "ENV", tmp_path / "no-existe.env")
    r = imagen_ai33.consultar("tarea-x")
    assert r["status"] == "?" and "AI33_API_KEY" in r["error_message"]

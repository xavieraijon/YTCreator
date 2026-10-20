"""Contrato de la capacidad «voz» (plan 8b-C): el registro, la elección por prefijo y el comportamiento de cada adaptador."""
import adaptadores_voz as av
import pytest


def test_el_registro_cumple_el_contrato():
    assert set(av.REGISTRO) == {"azure", "gemini", "ai33"}
    for pid, p in av.REGISTRO.items():
        assert p.id == pid and callable(p.disponible) and callable(p.locutar) and p.claves
    assert [p.id for p in av.REGISTRO.values() if p.de_pago] == ["ai33"]


def test_la_voz_elige_su_proveedor_por_el_prefijo():
    assert av.proveedor_de("ai33:abc123")[0].id == "ai33" and av.proveedor_de("ai33:abc123")[1] == "abc123"
    assert av.proveedor_de("gemini:Kore") == (av.REGISTRO["gemini"], "Kore")
    # las voces de Azure llevan «:» en el nombre y no son un prefijo
    assert av.proveedor_de("es-ES-Tristan:DragonHDLatestNeural") == (av.REGISTRO["azure"], "es-ES-Tristan:DragonHDLatestNeural")
    assert av.proveedor_de("es-ES-AlvaroNeural")[0].id == "azure"


def test_las_marcas_de_emocion_solo_las_conserva_ai33(monkeypatch):
    vistos = {}

    def falso_ai33(texto, voz, modelo, velocidad):
        vistos["ai33"] = (texto, modelo, velocidad)
        return b"\0\0", 12

    def falso_gemini(texto, voz, estilo, modelo):
        vistos["gemini"] = texto
        return b"\0\0"
    monkeypatch.setattr(av, "locutar_ai33", falso_ai33)
    monkeypatch.setattr(av, "locutar_gemini", falso_gemini)
    monkeypatch.setattr(av.uso, "registrar", lambda *a, **k: None)
    sol = av.SolicitudVoz("Hola [excited] mundo", "v", "a.wav", modelo="eleven_v4", velocidad_ai33=1.1)
    r = av.REGISTRO["ai33"].locutar(sol)
    assert vistos["ai33"] == ("Hola [excited] mundo", "eleven_v4", 1.1) and r.texto == "Hola mundo" and r.palabras == []
    r = av.REGISTRO["gemini"].locutar(sol)
    assert vistos["gemini"] == "Hola mundo" and r.texto == "Hola mundo"


def test_ai33_no_envia_nada_en_modo_sin_gasto(monkeypatch):
    monkeypatch.setattr(av.requests, "post", lambda *a, **k: pytest.fail("se ha enviado algo a la red de pago"))
    with pytest.raises(SystemExit, match="SIN GASTO"):
        av.REGISTRO["ai33"].locutar(av.SolicitudVoz("hola", "v"))

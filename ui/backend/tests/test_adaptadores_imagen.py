"""Contrato de la capacidad «imagen» (plan 8b-C): los proveedores del registro lo cumplen y gen_imagen los orquesta."""
import io
import base64

import pytest
from PIL import Image

import adaptadores_imagen as ai
import gen_imagen


def test_el_registro_cumple_el_contrato():
    assert set(ai.REGISTRO) == {"cloudflare", "local"}
    for pid, p in ai.REGISTRO.items():
        assert p.id == pid and callable(p.disponible) and callable(p.generar)


def test_solicitud_toma_las_medidas_del_formato():
    s = ai.SolicitudImagen("x", "a.png", "vertical")
    assert (s.ancho, s.alto) == (768, 1344) and s.referencias == []


class _Proveedor:
    def __init__(self, id, falla=None):
        self.id, self.falla, self.llamadas = id, falla, []

    def disponible(self):
        return True

    def generar(self, sol):
        self.llamadas.append(sol)
        if self.falla:
            raise self.falla
        return sol.salida


@pytest.mark.parametrize("error", [ai.CuotaAgotada("tope"), ai.ImagenFiltrada("flagged")])
def test_un_fallo_tipado_pasa_al_siguiente_proveedor(monkeypatch, tmp_path, error):
    nube, mac = _Proveedor("cloudflare", error), _Proveedor("local")
    monkeypatch.setattr(gen_imagen, "CLOUDFLARE", nube)
    monkeypatch.setattr(gen_imagen, "LOCAL", mac)
    monkeypatch.setattr(gen_imagen, "MOTOR", "auto")
    monkeypatch.setattr(gen_imagen.simulacion, "activa", lambda: False)
    assert gen_imagen.generar("x", tmp_path / "a.png", semilla=None) == tmp_path / "a.png"
    assert len(nube.llamadas) == 1 and len(mac.llamadas) == 1


def test_cloudflare_escribe_el_archivo_y_tipa_la_cuota(monkeypatch, tmp_path):
    monkeypatch.setenv("CF_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CF_API_TOKEN", "t")
    buf = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buf, "PNG")

    class R:
        ok, status_code, text = True, 200, ""
        def json(self): return {"result": {"image": base64.b64encode(buf.getvalue()).decode()}}

    monkeypatch.setattr(ai.requests, "post", lambda *a, **k: R())
    monkeypatch.setattr(ai.uso, "registrar", lambda *a, **k: None)
    ruta = ai.REGISTRO["cloudflare"].generar(ai.SolicitudImagen("x", tmp_path / "o.png"))
    assert Image.open(ruta).size == (8, 8)

    class Cuota(R):
        ok, status_code, text = False, 429, "neurons"

    monkeypatch.setattr(ai.requests, "post", lambda *a, **k: Cuota())
    with pytest.raises(ai.CuotaAgotada):
        ai.REGISTRO["cloudflare"].generar(ai.SolicitudImagen("x", tmp_path / "p.png"))

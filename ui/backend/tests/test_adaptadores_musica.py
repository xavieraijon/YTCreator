"""Contrato de la capacidad «música» (plan 8b-C): el registro y el comportamiento de cada adaptador sin gastar nada."""
import adaptadores_musica as am
import pytest


def test_el_registro_cumple_el_contrato():
    assert set(am.REGISTRO) == {"sintetizador", "ai33"}
    for pid, p in am.REGISTRO.items():
        assert p.id == pid and callable(p.disponible) and callable(p.componer)
    assert [p.id for p in am.REGISTRO.values() if p.de_pago] == ["ai33"]


def test_el_sintetizador_deja_una_version_gratis(tmp_path):
    r = am.REGISTRO["sintetizador"].componer(am.SolicitudMusica("tranquilo", tmp_path))
    assert r.creditos == 0 and [v["n"] for v in r.versiones] == [1]
    assert (tmp_path / r.versiones[0]["archivo"]).exists()


def test_el_sintetizador_rechaza_un_ambiente_desconocido(tmp_path):
    with pytest.raises(SystemExit, match="ERROR"):
        am.REGISTRO["sintetizador"].componer(am.SolicitudMusica("inventado", tmp_path))


def test_ai33_en_modo_sin_gasto_no_cobra(tmp_path, monkeypatch):
    monkeypatch.setenv("CANALYT_SIN_GASTO", "1")
    guion = {"musica": "misterio", "escenas": [{"texto": "x"}]}
    r = am.REGISTRO["ai33"].componer(am.SolicitudMusica("misterio", tmp_path, guion))
    assert r.creditos == 0 and [v["n"] for v in r.versiones] == [1, 2]

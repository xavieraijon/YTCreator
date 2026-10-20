"""Conciliación del saldo de ai33 con lo apuntado y el coste de un vídeo típico (sin red: el saldo se simula)."""

import cuota


def test_concilia_saldo_y_cabe_un_video(monkeypatch):
    monkeypatch.setattr(cuota, "creditos_ai33", lambda: 3_119_373)
    monkeypatch.setattr(cuota, "gastado_ai33", lambda: (0, 150_110))
    monkeypatch.setattr(cuota, "neuronas_reales", lambda desde: None)
    a = cuota.datos()[0]["ai33"]
    assert a["gastado_real"] == 180_627 and a["sin_registrar"] == 30_517
    assert a["coste_video"] == round(8000 * 1.15 + 12 * 1720 + 3 * 3600)          # 40.640
    assert a["videos_que_caben"] == 3_119_373 // a["coste_video"] == 76


def test_sin_saldo_no_inventa_nada(monkeypatch):
    monkeypatch.setattr(cuota, "creditos_ai33", lambda: None)
    monkeypatch.setattr(cuota, "neuronas_reales", lambda desde: None)
    a = cuota.datos()[0]["ai33"]
    assert a["gastado_real"] is None and a["sin_registrar"] is None and a["videos_que_caben"] is None

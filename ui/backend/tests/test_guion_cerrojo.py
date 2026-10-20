"""Auditoría del 18/10 (#1): toda escritura de guion.json pasa por canal.editar_guion (cerrojo + relectura), así que dos
escritores a la vez no se pisan: no se pierde ningún cambio."""
import json
import threading

import pytest

from app import config  # noqa: F401  (pone herramientas/ en sys.path)
import archivos  # noqa: E402
import canal as kit_canal  # noqa: E402


def _guion(tmp_path):
    ruta = tmp_path / "videos" / "001-x" / "guion.json"
    ruta.parent.mkdir(parents=True)
    ruta.write_text(json.dumps({"escenas": [{"texto": "hola", "imagenes": [{"prompt": "a"}]}]}) + "\n")
    return ruta


def test_dos_escritores_no_pierden_cambios(tmp_path):
    ruta = _guion(tmp_path)

    def escribir(quien):
        for n in range(40):
            kit_canal.editar_guion(ruta, lambda g, m=f"{quien}-{n}": g.setdefault("marcas", []).append(m) or True)

    hilos = [threading.Thread(target=escribir, args=(q,)) for q in ("ui", "vigilante", "claude")]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    guion = json.loads(ruta.read_text())
    assert len(guion["marcas"]) == 120 and len(set(guion["marcas"])) == 120
    assert guion["version_esquema"] >= 1 and ruta.read_text().endswith("\n")     # sellado, conserva el salto final
    assert not (ruta.parent / "guion.json.lock").exists()                         # el cerrojo, en tmp/ (fuera de Git)


def test_sin_cambios_no_reescribe_y_danado_no_se_toca(tmp_path):
    ruta = _guion(tmp_path)
    antes = ruta.read_text()
    assert kit_canal.editar_guion(ruta, lambda g: False) is False
    assert ruta.read_text() == antes
    ruta.write_text("{roto")
    with pytest.raises(archivos.ArchivoDanado):
        kit_canal.editar_guion(ruta, lambda g: g.update(x=1))
    assert ruta.read_text() == "{roto"


def test_un_error_en_el_cambio_no_escribe_nada(tmp_path):
    ruta = _guion(tmp_path)
    antes = ruta.read_text()

    def falla(g):
        g["escenas"].clear()
        raise ValueError("no")
    with pytest.raises(ValueError):
        kit_canal.editar_guion(ruta, falla)
    assert ruta.read_text() == antes

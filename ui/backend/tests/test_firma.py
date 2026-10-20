"""La firma que calcula la UI debe ser la misma que la de montar.py (si no, marcaría imágenes de más o de menos)."""
import json

import pytest

import canal as kit_canal
from app import firma


def _guiones_del_activo():
    return sorted((kit_canal.CANALES / kit_canal.carpeta().name / "videos").glob("[0-9]*/guion.json"))


@pytest.mark.skipif(not _guiones_del_activo(), reason="el canal activo no tiene vídeos con guion")
def test_firma_igual_que_montar():
    import montar
    ruta = _guiones_del_activo()[0]
    guion = json.loads(ruta.read_text(encoding="utf-8"))
    cfg = kit_canal.config()
    completo_ui = firma.completar(cfg, guion)
    completo_kit = kit_canal.completar_guion(guion)
    comprobadas = 0
    for escena in guion["escenas"]:
        for spec in montar.imagenes_de(escena):
            if "prompt" not in spec or any(k in spec for k in ("video", "imagen", "reutilizar")):
                continue
            formato = completo_kit.get("formato", "horizontal")
            if montar.es_ai33(spec):
                kit = montar.firma_ai33(completo_kit, spec, formato, montar.imagen_ai33.config(completo_kit, cfg))
            else:
                refs = [montar.ruta(r) for r in completo_kit.get("referencias", [])] if spec.get("personaje") else []
                semilla = spec.get("semilla")
                kit = montar.huella(montar.construir_prompt(completo_kit, spec["prompt"]), formato, *refs,
                                    *([semilla] if semilla is not None else []))
            assert firma.esperada(cfg, completo_ui, spec, kit_canal.carpeta()) == kit
            comprobadas += 1
    assert comprobadas > 0


def test_firma_ai33_igual_que_montar():
    import montar
    ruta = _guiones_del_activo()[0]
    guion = json.loads(ruta.read_text(encoding="utf-8"))
    guion["ai33"] = {"referencias_estilo": [str(ruta.parent.relative_to(kit_canal.carpeta()) / "guion.json")]}
    spec = {"prompt": "a man with a {nadie} hat", "motor": "ai33"}
    cfg = kit_canal.config()
    kit = montar.firma_ai33(kit_canal.completar_guion(guion), spec, "horizontal",
                            montar.imagen_ai33.config(kit_canal.completar_guion(guion), cfg))
    assert firma.esperada(cfg, firma.completar(cfg, guion), spec, kit_canal.carpeta()) == kit

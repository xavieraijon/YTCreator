"""Bloque 2 del recorrido profano: el estado de cada fase sale del contenido de los archivos (guion → voz → imágenes →
montaje), no de la marca `completadas`. Si cambia lo de antes, lo de después deja de verse hecho."""
import json
import os
import time

import pytest

from app import estado_video, guia, tramos

HASTA_F = ["A", "B", "C", "D", "E", "F"]


def _escribir(ruta, datos, hace=0):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(datos, ensure_ascii=False) if not isinstance(datos, str) else datos, encoding="utf-8")
    if hace:
        t = time.time() - hace
        os.utime(ruta, (t, t))


@pytest.fixture()
def video(tmp_path):
    """Un vídeo en la fase G: guion de 3 escenas locutadas hace una hora, voz aprobada hace 50 min y montado hace 30."""
    canal, v = tmp_path / "canal", tmp_path / "canal" / "videos" / "001-x"
    _escribir(canal / "canal.json", {"voz": "ai33:narrador"})
    escenas = [{"texto": f"Escena número {i}."} for i in (1, 2, 3)]
    _escribir(v / "guion.json", {"escenas": escenas})
    for i, e in enumerate(escenas, 1):
        _escribir(v / "voz" / f"{i:02d}.wav", "audio", hace=3600)
        _escribir(v / "voz" / f"{i:02d}.json", {"voz": "ai33:narrador", "texto": e["texto"]}, hace=3600)
    _escribir(v / "final.mp4", "video", hace=1800)
    _escribir(v / "montaje.json", {"escenas": guia.huella_escenas(escenas), "musica": {}}, hace=1800)
    aprobada = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - 3000))     # después de locutar
    _escribir(v / "estado.json", {"fase": "G", "completadas": HASTA_F, "aprobaciones": {"e-aprobar": {"fecha": aprobada}}})
    return canal, v


def _ctx(canal, v):
    return guia.Contexto(carpeta=v, carpeta_canal=canal, estado=json.loads((v / "estado.json").read_text()),
                         guion=json.loads((v / "guion.json").read_text()), imagenes=[])


def _fases(g):
    return {f["letra"]: f for f in g["fases"]}


def test_huellas_iguales_que_montar(tmp_path):
    import montar
    escenas = [{"texto": "Hola {pausa:300} ñandú", "imagenes": [{"prompt": "a"}]}]
    assert guia.huella_escenas(escenas) == montar.huella_escenas(escenas)
    _escribir(tmp_path / "musica" / "musica.json", {"misterio": {"elegida": 2}, "alegre": {"elegida": None}, "nota": "x"})
    ctx = guia.Contexto(carpeta=tmp_path, carpeta_canal=tmp_path, estado={}, guion={}, imagenes=[])
    assert ctx.musica_elegida_por_ambiente() == montar.musica_elegida(tmp_path) == {"misterio": 2}


def test_todo_al_dia(video):
    ctx = _ctx(*video)
    assert ctx.voz == {"sin_voz": [], "cambiadas": []} and ctx.montaje == {"existe": True, "al_dia": True, "motivos": []}
    g = guia.construir("largo", ctx)
    f = _fases(g)
    assert f["E"]["estado"] == "hecha" and f["G"]["estado"] == "actual" and not f["E"]["avisos"]
    assert g["siguiente"]["id"] == "g-aprobar"         # montaje al día: lo tuyo (aprobarlo) va primero


def test_guion_editado_desactualiza_voz_y_montaje(video):
    canal, v = video
    guion = json.loads((v / "guion.json").read_text())
    guion["escenas"][1]["texto"] = "Escena número dos, reescrita."
    _escribir(v / "guion.json", guion)
    ctx = _ctx(canal, v)
    assert ctx.voz["cambiadas"] == [2]
    g = guia.construir("largo", ctx)
    f = _fases(g)
    assert f["E"]["estado"] == "desactualizada"
    assert f["E"]["avisos"] == ["Has cambiado el texto de la escena 2 después de locutar: hay que volver a locutar (≈ 33 créditos)."]
    assert "el guion ha cambiado desde el montaje" in f["G"]["avisos"][0]
    # La aprobación de la voz ya no vale y lo siguiente es ponerla al día (antes que el montaje).
    e_aprobar = next(p for p in f["E"]["pasos"] if p["id"] == "e-aprobar")
    assert e_aprobar["estado"] != "hecho" and e_aprobar["aprobacion"]["caducada"]
    assert g["siguiente"]["fase"] == "E"
    assert guia.situacion("largo", g, ctx.estado)["montado"] is False
    e = estado_video.calcular("largo", ctx)
    assert e["vista"] == "E" and e["montaje"] == "desactualizado" and e["paso"] == 4      # sin la A, que no es un paso
    assert "Desactualizado · Voz" in estado_video.texto(e)
    with pytest.raises(ValueError, match="Antes hay que poner al día la fase E"):
        guia.avanzar(v / "estado.json", "largo", g)


def test_otra_toma_de_voz_caduca_la_aprobacion(video):
    canal, v = video
    _escribir(v / "estado.json", {"fase": "G", "completadas": HASTA_F, "aprobaciones": {
        "e-aprobar": {"fecha": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - 7200))}}})
    _escribir(v / "voz" / "02.wav", "otra toma")                      # ahora: después de aprobar y de montar
    ctx = _ctx(canal, v)
    f = _fases(guia.construir("largo", ctx))
    assert f["E"]["estado"] == "desactualizada" and f["E"]["avisos"][0].startswith("La voz ha cambiado desde que lo aprobaste")
    assert ctx.montaje["motivos"] == ["la voz ha cambiado después de montarlo"]


def test_no_se_aprueba_un_montaje_viejo(video):
    canal, v = video
    _escribir(v / "voz" / "01.wav", "otra toma")
    ctx = tramos.Ctx(video=type("V", (), {"tipo": "largo", "escenas_total": 3})(), guia=_ctx(canal, v), cfg={})
    t = next(x for x in tramos.TRAMOS["G"] if x.id == "g-montaje")
    assert t.titular(tramos.producido(t, ctx)) == "Monta el vídeo"
    with pytest.raises(ValueError, match="Vuelve a montar"):
        tramos.aprobar_tramo(v / "estado.json", "largo", t, ctx)


def test_un_video_publicado_no_se_revisa(video):
    canal, v = video
    estado = json.loads((v / "estado.json").read_text())
    estado.update({"fase": "J", "completadas": HASTA_F + ["G", "H", "I"], "publicacion": {"url": "https://youtu.be/x"}})
    _escribir(v / "estado.json", estado)
    _escribir(v / "voz" / "01.wav", "otra toma")
    assert guia.vigencia("largo", _ctx(canal, v)) == {}

"""Bloque 1 del recorrido profano (docs/ui/auditoria-usuario-profano.md): lo que la UI enseña ha de ser verdad.
Título humano, «listo para subir» según la guía, titulares según lo que existe y una sola fuente para las cifras."""
import json
from types import SimpleNamespace

from app import asistente, guia, tramos
from app.sincronizar import titulo_humano


def test_titulo_humano_nunca_es_la_carpeta():
    assert titulo_humano({"tema": "por qué los gatos  siempre caen de pie"}, {}) == "Por qué los gatos siempre caen de pie"
    assert titulo_humano({"tema": "x", "titulo_provisional": "El gato que no caía"}, {}) == "El gato que no caía"
    assert titulo_humano({"tema": "x", "titulo_provisional": "y"}, {"titulo": "Del guion"}) == "Del guion"
    assert titulo_humano({"titulo_elegido": "El elegido", "tema": "x"}, {"titulo": "Del guion"}) == "El elegido"
    assert titulo_humano({}, {"titulo": "  "}) is None


def _ctx(tmp_path, estado, final=False):
    if final:
        (tmp_path / "final.mp4").write_bytes(b"")
    return guia.Contexto(carpeta=tmp_path, carpeta_canal=tmp_path, estado=estado, guion={}, imagenes=[])


def _situacion(ctx):
    return guia.situacion("largo", guia.construir("largo", ctx), ctx.estado)


def test_situacion_sale_de_la_guia_no_de_final_mp4(tmp_path):
    hasta_f = ["A", "B", "C", "D", "E", "F"]
    # Montado pero sin aprobar: ni producido ni listo para subir (antes: «listo para subir» por tener final.mp4).
    s = _situacion(_ctx(tmp_path, {"fase": "G", "completadas": hasta_f}, final=True))
    assert s == {"montado": False, "listo_para_subir": False, "publicado": False}
    s = _situacion(_ctx(tmp_path, {"fase": "G", "completadas": hasta_f, "aprobaciones": {"g-aprobar": {}}}))
    assert s["montado"] and not s["listo_para_subir"]
    s = _situacion(_ctx(tmp_path, {"fase": "I", "completadas": hasta_f + ["G", "H"]}))
    assert s == {"montado": True, "listo_para_subir": True, "publicado": False}
    s = _situacion(_ctx(tmp_path, {"fase": "J", "completadas": hasta_f + ["G", "H", "I"],
                                   "publicacion": {"url": "https://youtu.be/x"}}))
    assert s == {"montado": True, "listo_para_subir": False, "publicado": True}


def test_asistente_usa_la_situacion_de_la_guia(tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    monkeypatch.setattr(kit_canal, "ACTIVO", tmp_path / "canal_activo")
    (tmp_path / "canales" / "c").mkdir(parents=True)
    (tmp_path / "canales" / "c" / "canal.json").write_text(json.dumps({"nombre": "C"}))
    (tmp_path / "canal_activo").write_text("c")
    monkeypatch.setattr(asistente, "kit", lambda: {"items": [], "listo": True})
    v = SimpleNamespace(id=1, carpeta="001-x", titulo="Un vídeo", fase="G", tipo="largo", aparcado=False,
                        tiene_final=True, completadas=["A", "B", "C", "D", "E", "F"])
    sin_aprobar = {1: {"montado": False, "listo_para_subir": False, "publicado": False}}
    e = asistente.estado([v], sin_aprobar)
    paso = {p["id"]: p for p in e["pasos"]}
    assert not paso["video"]["hecho"] and paso["video"]["resumen"] == "1 vídeo en producción"
    assert not paso["publicar"]["hecho"] and paso["publicar"]["resumen"] == "Ninguno está listo para subir todavía"
    assert e["video"]["en_curso"][0]["titulo"] == "Un vídeo" and e["video"]["publicables"] == []
    listo = {1: {"montado": True, "listo_para_subir": True, "publicado": False}}
    e = asistente.estado([v], listo)
    paso = {p["id"]: p for p in e["pasos"]}
    assert paso["video"]["hecho"] and paso["publicar"]["resumen"] == "1 listo para subir"
    assert e["video"]["en_curso"] == [] and e["actual"] == "publicar"


def test_titular_segun_lo_que_existe():
    t = next(x for x in tramos.TRAMOS["D"] if x.id == "d-guion")
    assert t.titular(False) == "Escribe el guion" and t.titular(True) == "Lee el guion"
    sin_antes = next(x for x in tramos.TRAMOS["H"] if x.id == "h-miniatura")
    assert sin_antes.titular(False) == sin_antes.titular(True) == "Elige la miniatura"


def test_cifras_de_la_investigacion_de_una_sola_fuente(tmp_path):
    (tmp_path / "investigacion.json").write_text(json.dumps({
        "resumen": "r", "comprobados": 22, "hipotesis": 4, "leyendas": 2, "fuentes": "9", "veredicto": "suficiente",
        "datos": [{"texto": "a", "estado": "comprobado"}, {"texto": "b", "estado": "Hipótesis"},
                  {"texto": "c", "estado": "leyenda"}, {"texto": "d", "estado": "raro"}]}))
    ctx = tramos.Ctx(video=None, guia=_ctx(tmp_path, {}), cfg={})
    d = tramos.datos_investigacion(ctx)
    assert d["conteo"] == {"comprobados": 1, "hipotesis": 2, "leyendas": 1, "fuentes": 9}
    assert [x["estado"] for x in d["datos"]] == ["comprobado", "hipotesis", "leyenda", "hipotesis"]
    luces = {l["titulo"]: l["valor"] for l in tramos.luces_investigacion(ctx)}
    assert luces["Datos comprobados"] == "1" and luces["Hipótesis y leyendas"] == "2 y 1"

"""Fases C a I con pantalla guiada: tramos, luces, aprobar con elección, cambios y cierre de fase."""
import json
import time

import pytest

from app import config
from tests.test_chat import _falso
from tests.test_fases_ui import CANAL_JSON


@pytest.fixture()
def video(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    c = tmp_path / "canales" / "prueba"
    c.mkdir(parents=True)
    (c / "canal.json").write_text(json.dumps(CANAL_JSON))
    d = cliente.post("/api/canales/prueba/videos", json={"tema": "Mente en blanco", "duracion": 10}).json()
    return d["id"], c / "videos" / d["carpeta"]


def _poner(carpeta, **campos):
    e = json.loads((carpeta / "estado.json").read_text())
    e.update(campos)
    (carpeta / "estado.json").write_text(json.dumps(e))


def _fase(cliente, vid, letra):
    return cliente.get(f"/api/videos/{vid}/fase/{letra}").json()


def test_fase_c_investigar_y_aprobar_cierra_la_fase(cliente, video):
    vid, carpeta = video
    _poner(carpeta, fase="C", completadas=["A", "B"], titulo_provisional="Una parte del cerebro")
    f = _fase(cliente, vid, "C")
    a = f["actual"]
    assert [t["estado"] for t in f["tramos"]] == ["actual"] and a["id"] == "c-investigar" and a["job"] is True
    assert a["producido"] is False and a["aprobable"] is False and a["luces"] == [] and a["boton"] == "Investigar el tema"
    (carpeta / "fuentes.md").write_text("# Fuentes")
    (carpeta / "investigacion.json").write_text(json.dumps({
        "resumen": "Da para 10 min.", "comprobados": 12, "hipotesis": 3, "leyendas": 2, "fuentes": 9, "actos_posibles": 4,
        "veredicto": "suficiente", "avisos": ["Una cifra circula sin respaldo"],
        "datos": [{"texto": "Dato 1", "estado": "comprobado", "fuentes": ["[BPS]"]}], "afiliacion": []}))
    a = _fase(cliente, vid, "C")["actual"]
    assert a["producido"] and a["aprobable"] and a["docs"] == ["fuentes.md"]
    assert {l["titulo"]: l["color"] for l in a["luces"]}["¿Da para el vídeo?"] == "verde"
    assert a["datos"]["datos"][0]["estado"] == "comprobado" and [x["texto"] for x in a["datos"]["avisos"]] == ["Una cifra circula sin respaldo"] and a["datos"]["avisos"][0]["gravedad"] == "sin_clasificar"
    assert cliente.post(f"/api/videos/{vid}/tramo/c-investigar/aprobar", json={}).status_code == 200
    e = json.loads((carpeta / "estado.json").read_text())
    assert e["aprobaciones"]["c-aprobar"]["desde"] == "UI" and e["fase"] == "D" and "C" in e["completadas"]
    assert cliente.get(f"/api/videos/{vid}/guia").json()["fase_actual"] == "D"


def test_fase_d_empaquetado_con_eleccion_escaleta_y_guion(cliente, video, tmp_path, monkeypatch):
    vid, carpeta = video
    falso = tmp_path / "herr"
    falso.mkdir()
    (falso / "revisar_guion.py").write_text(
        "print('3 escenas · 40 palabras · ≈ 0.2 min · 3 imágenes nuevas · 0 capítulos · 0 Shorts')\n"
        "print('ERROR  escena 01: demasiado larga')\nprint('aviso  escena 02: suena a IA')\nprint('aviso  escena 03: coma')\n")
    monkeypatch.setattr(config, "HERRAMIENTAS", falso)
    _poner(carpeta, fase="D", completadas=["A", "B", "C"], aprobaciones={"c-aprobar": {"fecha": "x", "desde": "UI"}})
    (carpeta / "empaquetado.md").write_text("# Empaquetado")
    (carpeta / "empaquetado.json").write_text(json.dumps({
        "angulo": "A", "promesa": "P", "riesgo_clickbait": "medio", "riesgo_nota": "Cuidado.",
        "titulos": [{"texto": "Título uno", "por_que": "x", "recomendado": True}, {"texto": "Título dos", "por_que": "y"}],
        "miniatura": {"muestra": "Un ojo", "oculta": "La mente", "texto": "EN BLANCO"}}))
    a = _fase(cliente, vid, "D")
    assert [t["estado"] for t in a["tramos"]] == ["actual", "pendiente", "pendiente"] and a["actual"]["id"] == "d-empaquetado"
    assert a["actual"]["datos"]["titulos"][0]["recomendado"] and {l["color"] for l in a["actual"]["luces"]} >= {"ambar"}
    assert cliente.post(f"/api/videos/{vid}/tramo/d-empaquetado/aprobar", json={"eleccion": 9}).status_code == 422
    assert cliente.post(f"/api/videos/{vid}/tramo/d-empaquetado/aprobar", json={"eleccion": 2}).status_code == 200
    e = json.loads((carpeta / "estado.json").read_text())
    assert e["titulo_elegido"] == "Título dos" and "Título 2" in e["aprobaciones"]["d-aprobar-empaquetado"]["comentario"]
    assert e["fase"] == "D"                                           # faltan escaleta y guion
    f = _fase(cliente, vid, "D")
    assert [t["estado"] for t in f["tramos"]] == ["hecho", "actual", "pendiente"] and f["actual"]["id"] == "d-escaleta"
    (carpeta / "escaleta.md").write_text("# Escaleta")
    (carpeta / "escaleta.json").write_text(json.dumps({"resumen": "r", "avisos": ["Recompensa floja en el acto 2"],
                                                       "actos": [{"titulo": "Acto 1", "pregunta": "¿?", "recompensa": "R", "minutos": 2}]}))
    a = _fase(cliente, vid, "D")["actual"]
    assert a["datos"]["actos"][0]["titulo"] == "Acto 1" and [x["texto"] for x in a["datos"]["avisos"]] == ["Recompensa floja en el acto 2"]
    cliente.post(f"/api/videos/{vid}/tramo/d-escaleta/aprobar", json={})
    # guion: sin prompts de imágenes aún no está producido
    for n in ("guion.md", "verificacion.md", "revision_estructura.md", "brief_visual.md"):
        (carpeta / n).write_text("x")
    (carpeta / "guion.json").write_text(json.dumps({"titulo": "T", "escenas": [{"texto": "Hola.", "imagenes": [{"prompt": "un ojo"}]}]}))
    from app.sincronizar import sincronizar_canal
    from app.db import Sesion
    with Sesion() as s:
        sincronizar_canal(s, "prueba")
    a = _fase(cliente, vid, "D")["actual"]
    assert a["id"] == "d-guion" and a["producido"] is True
    col = {l["titulo"]: l for l in a["luces"]}
    assert col["Revisión automática"]["color"] == "rojo" and col["Revisión automática"]["valor"] == "1 error"
    assert a["datos"]["avisos"] == ["escena 02: suena a IA", "escena 03: coma"] and a["datos"]["errores"] == ["escena 01: demasiado larga"]
    assert all(p["hecho"] for p in a["datos"]["pasos"] if p["texto"] != "Copia para aprender de tus cambios")
    cliente.post(f"/api/videos/{vid}/tramo/d-guion/aprobar", json={})
    e = json.loads((carpeta / "estado.json").read_text())
    assert e["fase"] == "E" and e["completadas"][-1] == "D"


def test_producir_y_cambios_mandan_el_encargo_a_claude(cliente, video, tmp_path, monkeypatch):
    vid, carpeta = video
    registro = _falso(tmp_path, monkeypatch)
    _poner(carpeta, fase="C", completadas=["A", "B"], enfoque="Ondas de sueño")
    assert cliente.post(f"/api/videos/{vid}/tramo/c-investigar/producir", json={}).status_code == 200
    fin = time.time() + 10
    while time.time() < fin:
        t = cliente.get(f"/api/videos/{vid}/fase/C").json()["trabajo"]
        if t["estado"] == "libre" and t["conversacion"]:
            break
        time.sleep(0.1)
    p = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "MODO UI" in p and "investigacion.json" in p and "fuentes.md" in p and "Ondas de sueño" in p
    assert cliente.post(f"/api/videos/{vid}/tramo/e-voz/producir", json={}).status_code == 422   # ese no lo produce Claude
    assert cliente.post(f"/api/videos/{vid}/tramo/d-escaleta/producir", json={}).status_code == 409   # fase C
    (carpeta / "fuentes.md").write_text("x")
    cliente.post(f"/api/videos/{vid}/tramo/c-investigar/cambios", json={"texto": "  Más   fuentes académicas "})
    time.sleep(0.6)
    p2 = json.loads(registro.read_text().splitlines()[1])["args"][1]
    assert "Más fuentes académicas" in p2 and "revísalo en lugar de rehacerlo" in p2
    e = json.loads((carpeta / "estado.json").read_text())
    assert e["cambios_pedidos"][0]["punto"] == "c-aprobar" and "c-aprobar" not in (e.get("aprobaciones") or {})
    assert _fase(cliente, vid, "C")["actual"]["cambios_pendientes"] == ["Más fuentes académicas"]


def test_fases_con_pantallas_de_trabajo_e_a_i(cliente, video):
    vid, carpeta = video
    _poner(carpeta, fase="E", completadas=["A", "B", "C", "D"])
    a = _fase(cliente, vid, "E")["actual"]
    assert a["id"] == "e-voz" and a["vista"] == "voz" and a["job"] is False and a["aprobable"] is False
    (carpeta / "voz").mkdir()
    (carpeta / "voz" / "01.wav").write_bytes(b"x")
    assert _fase(cliente, vid, "E")["actual"]["aprobable"] is True
    cliente.post(f"/api/videos/{vid}/tramo/e-voz/aprobar", json={})
    assert json.loads((carpeta / "estado.json").read_text())["fase"] == "F"
    # H: miniatura con elección y publicación con «cerrar»
    _poner(carpeta, fase="H", completadas=["A", "B", "C", "D", "E", "F", "G"])
    assert cliente.post(f"/api/videos/{vid}/tramo/h-miniatura/aprobar", json={"eleccion": 2}).status_code == 422   # no hay miniaturas
    for n in (1, 2, 3):
        (carpeta / f"miniatura_{n}.jpg").write_bytes(b"x")
    assert cliente.post(f"/api/videos/{vid}/tramo/h-miniatura/aprobar", json={"eleccion": 2}).status_code == 200
    e = json.loads((carpeta / "estado.json").read_text())
    assert e["miniatura_elegida"] == 2 and e["fase"] == "H"
    f = _fase(cliente, vid, "H")
    assert f["actual"]["id"] == "h-publicacion" and f["completa"] is False
    assert cliente.post(f"/api/videos/{vid}/fase/H/cerrar").status_code == 422
    (carpeta / "subtitulos_en.srt").write_text("x")
    (carpeta / "publicacion_final.md").write_text("x")
    f = _fase(cliente, vid, "H")
    assert f["completa"] is True and f["actual"] is None
    assert cliente.post(f"/api/videos/{vid}/fase/H/cerrar").status_code == 200
    assert json.loads((carpeta / "estado.json").read_text())["fase"] == "I"
    # I: subir cierra el vídeo
    for n in ("aprendizajes.md",):
        (carpeta / n).write_text("x")
    cliente.post(f"/api/videos/{vid}/tramo/i-aprendizajes/aprobar", json={})
    _poner(carpeta, fase="I")
    (carpeta.parent.parent / "docs").mkdir()
    (carpeta.parent.parent / "docs" / "historial.md").write_text(carpeta.name)
    from app.sincronizar import sincronizar_canal
    from app.db import Sesion
    with Sesion() as s:
        sincronizar_canal(s, "prueba")
    f = _fase(cliente, vid, "I")
    assert f["actual"]["id"] == "i-subir" and f["actual"]["completable"] is True
    cliente.post(f"/api/videos/{vid}/tramo/i-subir/completar")
    assert json.loads((carpeta / "estado.json").read_text())["fase"] == "J"
    # J: publicación y métricas; con la última, el vídeo pasa a cerrado
    assert cliente.post(f"/api/videos/{vid}/publicacion", json={"url": "https://ejemplo.com/x", "fecha": "2026-10-01T18:00"}).status_code == 422
    assert cliente.post(f"/api/videos/{vid}/metricas/48h", json={"visitas": 10, "ctr": 5, "retencion": 40}).status_code == 422   # sin publicación
    ok = cliente.post(f"/api/videos/{vid}/publicacion", json={"url": "https://www.youtube.com/watch?v=abcdefghijk", "fecha": "2026-10-01T18:00"})
    assert ok.status_code == 200
    assert cliente.post(f"/api/videos/{vid}/metricas/48h", json={"visitas": 120, "ctr": 140, "retencion": 40}).status_code == 422   # CTR > 100
    assert cliente.post(f"/api/videos/{vid}/metricas/48h", json={"visitas": 120, "ctr": 5.4, "retencion": 41}).status_code == 200
    e = json.loads((carpeta / "estado.json").read_text())
    assert e["publicacion"]["url"].endswith("abcdefghijk") and e["metricas"]["48h"]["ctr"] == 5.4 and e["fase"] == "J"
    assert cliente.post(f"/api/videos/{vid}/metricas/7d", json={"visitas": 900, "ctr": 4.8, "retencion": 38}).status_code == 200
    assert json.loads((carpeta / "estado.json").read_text())["fase"] == "cerrado"


def test_volver_a_una_fase_hecha_no_pierde_nada(cliente, video, tmp_path, monkeypatch):
    vid, carpeta = video
    registro = _falso(tmp_path, monkeypatch)
    _poner(carpeta, fase="E", completadas=["A", "B", "C", "D"], aprobaciones={"c-aprobar": {"fecha": "x", "desde": "UI"}})
    (carpeta / "fuentes.md").write_text("# Fuentes")
    (carpeta / "investigacion.json").write_text(json.dumps({"veredicto": "suficiente", "comprobados": 12, "actos_posibles": 4,
                                                            "datos": [{"texto": "Dato", "estado": "comprobado"}]}))
    f = cliente.get(f"/api/videos/{vid}/fase/C?revision=true").json()
    assert f["revision"] is True and f["completa"] is True and f["tramos"][0]["estado"] == "hecho"
    d = f["tramos"][0]["detalle"]
    assert d["id"] == "c-investigar" and d["producido"] and d["datos"]["datos"][0]["texto"] == "Dato" and d["luces"]
    # D con tres tramos: todos con su detalle
    f = cliente.get(f"/api/videos/{vid}/fase/D?revision=true").json()
    assert [t["id"] for t in f["tramos"]] == ["d-empaquetado", "d-escaleta", "d-guion"] and all("detalle" in t for t in f["tramos"])
    # pedir cambios y regenerar en una fase hecha: se permite y NO mueve la fase
    assert cliente.post(f"/api/videos/{vid}/tramo/c-investigar/producir", json={"cambios": "más fuentes"}).status_code == 200
    fin = time.time() + 10               # que el Claude falso haya escrito su registro (con carga puede tardar)
    while time.time() < fin and not (registro.exists() and registro.read_text().strip()):
        time.sleep(0.1)
    assert "más fuentes" in json.loads(registro.read_text().splitlines()[0])["args"][1]
    e = json.loads((carpeta / "estado.json").read_text())
    assert e["fase"] == "E" and e["completadas"] == ["A", "B", "C", "D"]
    # una fase que aún no se ha alcanzado no se puede encargar
    assert cliente.post(f"/api/videos/{vid}/tramo/h-publicacion/producir", json={}).status_code == 409


def test_avisos_con_gravedad_ordenados_y_resumidos(cliente, video):
    vid, carpeta = video
    _poner(carpeta, fase="D", completadas=["A", "B", "C"], aprobaciones={"c-aprobar": {"fecha": "x", "desde": "UI"},
                                                                          "d-aprobar-empaquetado": {"fecha": "x", "desde": "UI"}})
    (carpeta / "empaquetado.md").write_text("x")
    (carpeta / "escaleta.md").write_text("x")
    (carpeta / "escaleta.json").write_text(json.dumps({"actos": [], "avisos": [
        {"texto": "Pulir una transición", "gravedad": "baja"},
        {"texto": "La recompensa del acto 3 repite la del 1", "gravedad": "alta", "que_hacer": "Cambiar el acto 3"},
        {"texto": "Aviso antiguo, sin clasificar"}, {"texto": "Mejorar el gancho", "gravedad": "media"}]}))
    a = _fase(cliente, vid, "D")["actual"]
    assert [x["gravedad"] for x in a["datos"]["avisos"]] == ["alta", "media", "baja", "sin_clasificar"]
    assert a["datos"]["avisos"][0]["que_hacer"] == "Cambiar el acto 3"
    luz = a["luces"][0]
    assert luz["titulo"] == "Avisos del narrador" and luz["color"] == "rojo"
    assert luz["valor"] == "1 importante, 1 a revisar, 1 menor, 1 sin clasificar"


def test_gasto_por_video_y_ajustes(cliente, video, monkeypatch, tmp_path):
    from app import gasto
    from app.db import Sesion
    from app.modelos import Tarea
    from datetime import datetime
    monkeypatch.setattr(gasto, "AJUSTES", tmp_path / "ajustes.json")
    vid, _ = video
    with Sesion() as s:
        t = Tarea(herramienta="musica_ai33", titulo="Música", canal="prueba", video_id=vid, argumentos={"confirmado": True, "previsto": 3600},
                  comando=[], estado="hecha", creada=datetime.now())
        s.add(t)
        s.commit()
        assert gasto.registrar(s, t).creditos == 3600
        libre = Tarea(herramienta="montar", titulo="Montar", video_id=vid, argumentos={}, comando=[], estado="hecha", creada=datetime.now())
        s.add(libre)
        s.commit()
        assert gasto.registrar(s, libre) is None
    g = cliente.get(f"/api/videos/{vid}/gasto").json()
    assert g["creditos"] == 3600 and g["euros"] > 0 and g["superado"] is False
    assert cliente.put("/api/ajustes/presupuesto", json={"tope_euros_video": 0.01}).status_code == 200
    assert cliente.get(f"/api/videos/{vid}/gasto").json()["superado"] is True
    assert cliente.put("/api/ajustes/presupuesto", json={"tope_euros_video": -3}).status_code == 422
    a = cliente.get("/api/ajustes").json()
    assert a["tope_euros_video"] == 0.01
    assert all("valor" not in c for s in cliente.get("/api/servicios").json()["servicios"] for c in s["claves"])
    assert cliente.put("/api/ajustes/clave", json={"clave": "OTRA", "valor": "x"}).status_code == 422
    assert cliente.put("/api/ajustes/clave", json={"clave": "AI33_API_KEY", "valor": "a b\nc"}).status_code == 422

"""La guía paso a paso: fiel a los comandos del kit, con el estado deducido de los archivos, y las aprobaciones
guardadas en estado.json (que Claude lee al continuar)."""
import json
import re
import shutil

import pytest

from app import config, fases, guia

ARCHIVO = "_archivo/los-viajes-de-tok"


@pytest.mark.parametrize("tipo,comando", [("largo", "nuevo-video.md"), ("short", "nuevo-short.md")])
def test_las_fases_son_las_de_los_comandos(tipo, comando):
    texto = (config.RAIZ / ".claude" / "commands" / comando).read_text(encoding="utf-8")
    del_comando = re.findall(r"^## FASE ([A-Z]) - ", texto, re.M)
    assert [f.letra for f in guia.de(tipo)] == del_comando == [l for l, _ in fases.de(tipo)]
    assert [f.nombre for f in guia.de(tipo)] == [n for _, n in fases.de(tipo)]
    # Cada fase con un punto de aprobación en el comando tiene al menos uno en la guía (salvo A y I).
    ids = [p.id for f in guia.de(tipo) for p in f.pasos]
    assert len(ids) == len(set(ids))


@pytest.fixture()
def video_prueba(cliente):
    carpeta = config.RAIZ / "canales" / ARCHIVO / "videos" / "998-prueba-guia"
    carpeta.mkdir()
    (carpeta / "estado.json").write_text(json.dumps(
        {"fase": "D", "completadas": ["A", "B", "C"], "duracion_objetivo": 10, "notas": "hola"}))
    (carpeta / "escaleta.md").write_text("# Escaleta")
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal
    with Sesion() as s:
        sincronizar_canal(s, ARCHIVO)
    vid = next(v["id"] for v in cliente.get("/api/videos", params={"canal": ARCHIVO}).json()
               if v["carpeta"] == carpeta.name)
    yield carpeta, vid
    shutil.rmtree(carpeta, ignore_errors=True)


def _paso(g, pid):
    return next(p for f in g["fases"] for p in f["pasos"] if p["id"] == pid)


def test_guia_con_estado_de_los_archivos(cliente, video_prueba):
    carpeta, vid = video_prueba
    g = cliente.get(f"/api/videos/{vid}/guia").json()
    assert g["fase_actual"] == "D" and g["comando"] == "/nuevo-video continuar"
    assert [f["estado"] for f in g["fases"]][:5] == ["hecha", "hecha", "hecha", "actual", "pendiente"]
    assert _paso(g, "b-aprobar")["aprobacion"]["estado"] == "aprobado"          # fase cerrada: aprobada antes
    assert _paso(g, "d-escaleta")["estado"] == "hecho"                          # existe escaleta.md
    assert _paso(g, "d-guion")["estado"] == "pendiente"                         # no hay guion.json
    assert _paso(g, "d-aprobar-escaleta")["aprobacion"]["estado"] == "esperando"
    assert g["siguiente"]["id"] == "d-aprobar-escaleta"                         # lo tuyo va primero


def test_aprobar_pedir_cambios_y_retirar(cliente, video_prueba):
    carpeta, vid = video_prueba
    r = cliente.post(f"/api/videos/{vid}/cambios", json={"punto": "d-aprobar-escaleta", "texto": "  Más  corto  "})
    assert _paso(r.json(), "d-aprobar-escaleta")["aprobacion"]["estado"] == "cambios"
    estado = json.loads((carpeta / "estado.json").read_text())
    assert estado["cambios_pedidos"][0]["texto"] == "Más corto" and estado["notas"] == "hola"   # no pisa nada

    r = cliente.post(f"/api/videos/{vid}/aprobaciones", json={"punto": "d-aprobar-escaleta", "comentario": "ok"})
    a = _paso(r.json(), "d-aprobar-escaleta")["aprobacion"]
    assert a["estado"] == "aprobado" and a["comentario"] == "ok" and not a["cambios"]
    estado = json.loads((carpeta / "estado.json").read_text())
    assert estado["aprobaciones"]["d-aprobar-escaleta"]["desde"] == "UI"
    assert estado["cambios_pedidos"][0]["atendido"]                             # aprobar cierra los cambios

    r = cliente.delete(f"/api/videos/{vid}/aprobaciones/d-aprobar-escaleta")
    assert _paso(r.json(), "d-aprobar-escaleta")["aprobacion"]["estado"] == "esperando"

    assert cliente.post(f"/api/videos/{vid}/aprobaciones", json={"punto": "d-guion"}).status_code == 422
    assert cliente.post(f"/api/videos/{vid}/cambios", json={"punto": "d-aprobar-guion", "texto": " "}).status_code == 422


@pytest.mark.parametrize("tipo,comando", [("largo", "nuevo-video.md"), ("short", "nuevo-short.md")])
def test_los_comandos_conocen_los_puntos_de_aprobacion(tipo, comando):
    """Claude lee y escribe las aprobaciones de la UI por su id: el comando debe listarlos todos."""
    texto = (config.RAIZ / ".claude" / "commands" / comando).read_text(encoding="utf-8")
    assert '"aprobaciones"' in texto and '"cambios_pedidos"' in texto
    for pid in guia._ids_aprobacion(tipo):
        assert f"`{pid}`" in texto, pid


def test_aprobar_tema_se_puede_en_cuanto_empieza_la_fase_b_y_los_pasos_de_claude_se_marcan(cliente, video_prueba):
    carpeta, vid = video_prueba
    estado = json.loads((carpeta / "estado.json").read_text())
    estado.update({"fase": "A", "completadas": [], "creado_desde": "UI", "tema": "x"})
    estado.pop("duracion_objetivo", None)
    (carpeta / "estado.json").write_text(json.dumps(estado))
    assert _paso(cliente.get(f"/api/videos/{vid}/guia").json(), "b-aprobar")["aprobacion"]["estado"] == "pendiente"
    estado.update({"fase": "B", "pasos_hechos": ["b-temas", "b-hueco"]})
    (carpeta / "estado.json").write_text(json.dumps(estado))
    g = cliente.get(f"/api/videos/{vid}/guia").json()
    assert _paso(g, "b-aprobar")["aprobacion"]["estado"] == "esperando"          # sin duracion_objetivo todavía
    assert _paso(g, "b-temas")["estado"] == "hecho" and _paso(g, "b-hueco")["estado"] == "hecho"
    assert g["siguiente"]["id"] == "b-aprobar"
    assert cliente.post(f"/api/videos/{vid}/aprobaciones", json={"punto": "b-aprobar", "comentario": "enfoque 1, 10 min"}).status_code == 200

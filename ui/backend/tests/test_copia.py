"""Copia de seguridad del espacio (herramientas/copia.py, punto 1 de docs/plan.md): incremental, sin `.env` ni enlaces, lo
sustituido o borrado a `_anteriores/` (30 días), base de datos en caliente comprobada, y restaurar solo en carpeta nueva."""

import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

import copia

KIT = Path(__file__).resolve().parents[3]


@pytest.fixture
def origen(tmp_path):
    e = tmp_path / "MiEspacio"
    (e / "canales" / "c" / "videos" / "001-x" / "img").mkdir(parents=True)
    (e / "canales" / "c" / "videos" / "001-x" / "img" / "01-1.png").write_bytes(b"png" * 100)
    (e / "canales" / "c" / "videos" / "001-x" / "guion.json").write_text("{}")
    (e / "data" / "logs").mkdir(parents=True)
    (e / "data" / "logs" / "backend.log").write_text("log")
    (e / "data" / "picos").mkdir()
    (e / "data" / "picos" / "a.json").write_text("[]")
    (e / ".env").write_text("CLAVE=secreta")
    (e / ".DS_Store").write_text("x")
    (e / "herramientas").symlink_to(KIT / "herramientas")
    with sqlite3.connect(e / "data" / "canalyt.db") as c:
        c.execute("create table t (x)")
        c.execute("insert into t values (1)")
    return e


@pytest.fixture
def destino(tmp_path):
    d = tmp_path / "Disco"
    d.mkdir()
    return d


def test_copia_lo_del_espacio_sin_claves_ni_enlaces_ni_caches(origen, destino):
    r = copia.hacer(destino, origen=origen)
    raiz = destino / "MiEspacio-copia"
    assert r["ok"] and r["bd_ok"] and r["raiz"] == str(raiz)
    assert (raiz / "canales/c/videos/001-x/img/01-1.png").read_bytes() == b"png" * 100
    assert (raiz / "data/canalyt.db").exists()
    for fuera in (".env", "herramientas", "data/logs", "data/picos", ".DS_Store"):
        assert not (raiz / fuera).exists(), fuera
    assert json.loads((raiz / "copia.json").read_text())["espacio"] == str(origen.resolve())
    assert json.loads((origen / "data/copia.json").read_text())["fecha"] == r["fecha"]


def test_el_programa_dentro_del_espacio_no_se_copia(origen, destino, monkeypatch):
    (origen / "programa" / ".venv").mkdir(parents=True)
    (origen / "programa" / ".venv" / "pesado.bin").write_bytes(b"x" * 1000)
    monkeypatch.setattr(copia.espacio, "KIT", (origen / "programa").resolve())
    assert copia.hacer(destino, origen=origen)["ok"]
    assert not (destino / "MiEspacio-copia" / "programa").exists()
    assert (destino / "MiEspacio-copia" / "canales/c/videos/001-x/guion.json").exists()


def test_incremental_y_lo_sustituido_o_borrado_va_a_anteriores(origen, destino):
    t0 = datetime(2026, 10, 1, 10, 0, 0)
    copia.hacer(destino, origen=origen, ahora=t0)
    r = copia.hacer(destino, origen=origen, ahora=t0 + timedelta(hours=1))
    assert r["copiados"] == 0 and r["retirados"] == 0            # nada cambiado: nada se copia (ni la BD)
    img = origen / "canales/c/videos/001-x/img/01-1.png"
    img.write_bytes(b"nueva")
    (origen / "canales/c/videos/001-x/guion.json").unlink()
    t2 = t0 + timedelta(days=1)
    r = copia.hacer(destino, origen=origen, ahora=t2)
    raiz = destino / "MiEspacio-copia"
    viejas = raiz / "_anteriores" / t2.strftime("%Y-%m-%d_%H%M%S") / "canales/c/videos/001-x"
    assert r["copiados"] == 1 and r["retirados"] == 2 and r["ok"]
    assert (raiz / "canales/c/videos/001-x/img/01-1.png").read_bytes() == b"nueva"
    assert (viejas / "img/01-1.png").read_bytes() == b"png" * 100
    assert (viejas / "guion.json").exists() and not (raiz / "canales/c/videos/001-x/guion.json").exists()
    # A los 30 días se vacía; lo que no ha puesto la copia no se toca.
    (raiz / "_anteriores" / "mio").mkdir()
    r = copia.hacer(destino, origen=origen, ahora=t2 + timedelta(days=31))
    assert r["anteriores_borradas"] == [t2.strftime("%Y-%m-%d_%H%M%S")]
    assert (raiz / "_anteriores" / "mio").exists()


def test_la_base_de_datos_cambiada_se_vuelve_a_copiar(origen, destino):
    t0 = datetime(2026, 10, 1)
    copia.hacer(destino, origen=origen, ahora=t0)
    with sqlite3.connect(origen / "data/canalyt.db") as c:
        c.execute("insert into t values (2)")
    r = copia.hacer(destino, origen=origen, ahora=t0 + timedelta(minutes=5))
    with sqlite3.connect(destino / "MiEspacio-copia/data/canalyt.db") as c:
        assert c.execute("select count(*) from t").fetchone()[0] == 2
    assert r["copiados"] == 1 and r["retirados"] == 1


def test_destinos_que_no_valen(origen, destino, tmp_path):
    with pytest.raises(copia.ErrorCopia, match="¿está conectado"):
        copia.hacer(tmp_path / "NoEsta", origen=origen)
    assert not (tmp_path / "NoEsta").exists()                     # nunca la crea
    with pytest.raises(copia.ErrorCopia, match="ruta completa"):
        copia.validar_destino("relativa/carpeta")
    with pytest.raises(copia.ErrorCopia, match="dentro del kit"):
        copia.validar_destino(KIT / "docs")
    (destino / "MiEspacio-copia").mkdir()
    (destino / "MiEspacio-copia" / "otra-cosa.txt").write_text("de otro")
    with pytest.raises(copia.ErrorCopia, match="no es una copia"):
        copia.hacer(destino, origen=origen)


def test_sin_sitio_no_copia_nada(origen, destino, monkeypatch):
    monkeypatch.setattr(copia.shutil, "disk_usage", lambda p: type("U", (), {"free": 10})())
    with pytest.raises(copia.ErrorCopia, match="No cabe"):
        copia.hacer(destino, origen=origen)
    assert not (destino / "MiEspacio-copia" / "canales").exists()


def test_restaurar_solo_en_carpeta_nueva(origen, destino, tmp_path):
    with sqlite3.connect(origen / "data/canalyt.db") as c:
        c.execute("create table tarea (comando, log)")
        c.execute("insert into tarea values (?, ?)", (f"{origen.resolve()}/canales/c/x", f"{origen.resolve()}/data/tareas/1.log"))
    copia.hacer(destino, origen=origen)
    raiz = destino / "MiEspacio-copia"
    ocupada = tmp_path / "Ocupada"
    ocupada.mkdir()
    (ocupada / "algo").write_text("x")
    with pytest.raises(copia.ErrorCopia, match="no está vacía"):
        copia.restaurar(ocupada, raiz)
    r = copia.restaurar(tmp_path / "Nuevo", raiz)
    assert r["ok"] and r["bd_ok"]
    assert (tmp_path / "Nuevo/canales/c/videos/001-x/img/01-1.png").exists()
    assert not (tmp_path / "Nuevo/copia.json").exists() and not (tmp_path / "Nuevo/.env").exists()
    nuevo = (tmp_path / "Nuevo").resolve()
    with sqlite3.connect(nuevo / "data/canalyt.db") as c:                # las tareas viejas apuntan al espacio restaurado
        assert c.execute("select comando, log from tarea").fetchone() == (f"{nuevo}/canales/c/x", f"{nuevo}/data/tareas/1.log")


def test_destino_guardado_y_aviso(tmp_path, monkeypatch, destino):
    monkeypatch.setenv("CANALYT_AJUSTES", str(tmp_path / "ajustes.json"))
    (tmp_path / "ajustes.json").write_text(json.dumps({"tope_euros_video": 3}))
    monkeypatch.setattr(copia.espacio, "DATOS", tmp_path / "data")
    e = copia.estado()
    assert e["destino"] == "" and e["ultima"] is None and e["aviso"]
    copia.guardar_destino(str(destino))
    assert json.loads((tmp_path / "ajustes.json").read_text()) == {"tope_euros_video": 3, "copia": {"destino": str(destino.resolve())}}
    (tmp_path / "data").mkdir()
    (tmp_path / "data/copia.json").write_text(json.dumps({"fecha": "2026-10-01T10:00:00", "ok": True}))
    assert not copia.estado(datetime(2026, 10, 5))["aviso"]
    e = copia.estado(datetime(2026, 10, 9))
    assert e["aviso"] and e["dias"] == 7 and e["conectado"]


def test_linea_de_ordenes_da_error_claro(tmp_path):
    r = subprocess.run([sys.executable, str(KIT / "herramientas/copia.py"), "hacer", "--destino", str(tmp_path / "no")],
                       capture_output=True, text=True, env={**os.environ, "CANALYT_AJUSTES": str(tmp_path / "a.json")})
    assert r.returncode == 1 and "Traceback" not in r.stderr
    assert r.stderr.strip().splitlines()[-1].startswith("ERROR: No encuentro la carpeta")


def test_api_destino_y_tarea(cliente, tmp_path, monkeypatch, destino):
    from app import gasto
    monkeypatch.setattr(gasto, "AJUSTES", tmp_path / "ajustes.json")
    assert cliente.get("/api/ajustes/copia").json()["destino"] == ""
    r = cliente.post("/api/tareas", json={"herramienta": "copia"})
    assert r.status_code == 422 and "Falta la carpeta" in r.json()["detail"]      # sin destino no se encola
    r = cliente.put("/api/ajustes/copia", json={"destino": str(tmp_path / "NoEsta")})
    assert r.status_code == 400 and "¿está conectado" in r.json()["detail"]
    r = cliente.put("/api/ajustes/copia", json={"destino": str(destino)}).json()
    assert r["destino"] == str(destino.resolve()) and r["conectado"]
    assert json.loads((tmp_path / "ajustes.json").read_text())["copia"]["destino"] == str(destino.resolve())

"""Kit y espacio de trabajo separados: las rutas salen de espacio.py y un espacio aparte funciona con enlaces al kit."""

import os
import re
import subprocess
import sys
from pathlib import Path

import espacio

KIT = Path(espacio.__file__).resolve().parents[1]


def _correr(espacio_dir, *args, codigo=None):
    env = {**os.environ, "CANALYT_ESPACIO": str(espacio_dir)}
    for v in ("CANAL", "CANALYT_DB", "CANALYT_CHATS", "CANALYT_AJUSTES", "CANALYT_SALUD_IA"):
        env.pop(v, None)
    cmd = [sys.executable, *args] if codigo is None else [sys.executable, "-c", codigo]
    return subprocess.run(cmd, cwd=KIT, env=env, capture_output=True, text=True)


def test_ninguna_herramienta_calcula_las_rutas_del_espacio_por_su_cuenta():
    """canales/, data/, .env y canal_activo se piden a espacio.py; si no, un espacio aparte escribiría en el kit."""
    malos = []
    for f in sorted((KIT / "herramientas").glob("*.py")):
        if f.name == "espacio.py":
            continue
        for n, linea in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r'RAIZ\s*/\s*"(canales|data|analisis|canal_activo|\.env)"|parent\.parent\s*/\s*"\.env"', linea):
                malos.append(f"{f.name}:{n}: {linea.strip()}")
    assert not malos, "\n".join(malos)


def test_sin_espacio_el_espacio_es_el_kit(monkeypatch):
    assert espacio.es_kit() or os.environ.get("CANALYT_ESPACIO")
    assert espacio.KIT == KIT


def test_preparar_crea_carpetas_y_enlaces(tmp_path):
    destino = tmp_path / "YT Creator"            # con un espacio en el nombre, como puede pasar en otro Mac
    r = _correr(destino, "herramientas/espacio.py", "preparar")
    assert r.returncode == 0, r.stderr
    for c in ("canales", "data", "analisis"):
        assert (destino / c).is_dir()
    for n in (".claude", "herramientas", "plantillas", "recursos", "docs", "CLAUDE.md"):
        assert (destino / n).is_symlink() and (destino / n).resolve() == (KIT / n).resolve()
    assert ".env" in (destino / ".gitignore").read_text()
    assert "Nada que hacer" in _correr(destino, "herramientas/espacio.py", "preparar").stdout     # idempotente


def test_programa_dentro_del_espacio(tmp_path, monkeypatch):
    """La instalación normal: ~/YTCreator con el programa en ~/YTCreator/programa, fuera del git del espacio."""
    esp = (tmp_path / "YTCreator").resolve()
    kit = esp / "programa"
    (kit / "herramientas").mkdir(parents=True)
    monkeypatch.setattr(espacio, "KIT", kit)
    monkeypatch.setattr(espacio, "ESPACIO", esp)
    assert espacio.programa_dentro() == "programa"
    assert espacio.programa_dentro(tmp_path) == "YTCreator/programa"
    assert espacio.programa_dentro(kit) is None and espacio.programa_dentro(tmp_path / "otra") is None
    espacio.preparar()
    assert (esp / "herramientas").resolve() == kit / "herramientas"
    assert "/programa/" in (esp / ".gitignore").read_text().splitlines()
    assert espacio.preparar() == []                      # idempotente: no lo apunta dos veces


def test_un_espacio_aparte_lleva_sus_rutas_y_no_toca_el_kit(tmp_path):
    destino = tmp_path / "esp"
    _correr(destino, "herramientas/espacio.py", "preparar")
    # una herramienta cualquiera ve los canales, los datos y el .env del espacio
    r = _correr(destino, codigo="import sys; sys.path.insert(0, 'herramientas'); import canal, uso, espacio;"
                              "print(canal.CANALES, uso.REGISTRO, espacio.ENV, canal.RAIZ)")
    assert r.returncode == 0, r.stderr
    esperado = destino.resolve()
    assert r.stdout.split() == [str(esperado / "canales"), str(esperado / "data" / "uso.jsonl"),
                                str(esperado / ".env"), str(esperado)]
    # la UI también: base de datos y raíz de trabajo en el espacio, código en el kit
    r = _correr(destino, codigo="import sys; sys.path.insert(0, 'ui/backend');"
                              "from app import config; print(config.DB_URL, config.RAIZ, config.KIT, config.PYTHON)")
    assert r.returncode == 0, r.stderr
    db, raiz, kit, py = r.stdout.split()
    assert db == f"sqlite:///{esperado}/data/canalyt.db" and raiz == str(esperado)
    assert kit == str(KIT) and py == str(KIT / ".venv" / "bin" / "python")


def test_canal_nuevo_en_un_espacio_aparte(tmp_path):
    """/nuevo-canal parte de plantillas/ (enlace al kit) y escribe el canal en el espacio, no en el kit."""
    destino = tmp_path / "esp"
    _correr(destino, "herramientas/espacio.py", "preparar")
    def en_el_kit():                       # el kit limpio no tiene canales/ (vive en el espacio)
        return sorted(p.name for p in (KIT / "canales").iterdir()) if (KIT / "canales").exists() else []
    antes = en_el_kit()
    r = _correr(destino, "herramientas/canales.py", "crear", "canal-de-prueba", "Canal de prueba")
    assert r.returncode == 0, r.stdout + r.stderr
    assert (destino / "canales" / "canal-de-prueba" / "canal.json").exists()
    assert en_el_kit() == antes
    assert _correr(destino, "herramientas/canales.py", "activar", "canal-de-prueba").returncode == 0
    assert (destino / "canal_activo").read_text().strip() == "canal-de-prueba"
    assert not (KIT / "canales" / "canal-de-prueba").exists()


def _origen_de_prueba(tmp_path):
    import sqlite3
    o = tmp_path / "kit"
    (o / "canales" / "mi-canal" / "videos" / "001-x").mkdir(parents=True)
    (o / "canales" / "mi-canal" / "canal.json").write_text('{"nombre": "Mi canal"}')
    (o / "canales" / "mi-canal" / "videos" / "001-x" / "guion.json").write_text("{}")
    (o / "analisis" / "mercado").mkdir(parents=True)
    (o / "analisis" / "mercado" / "nicho.md").write_text("# nicho")
    (o / "data").mkdir()
    (o / "data" / "uso.jsonl").write_text('{"servicio": "azure"}\n')
    (o / ".env").write_text("AI33_API_KEY=secreta\n")
    (o / "canal_activo").write_text("mi-canal\n")
    con = sqlite3.connect(o / "data" / "canalyt.db")
    con.execute("CREATE TABLE tarea (id INTEGER PRIMARY KEY, comando TEXT, log TEXT)")
    con.execute("INSERT INTO tarea VALUES (1, ?, ?)", (f'["{o}/.venv/bin/python", "{o}/herramientas/montar.py", "{o}/canales/mi-canal/videos/001-x/guion.json"]',
                                                       f"{o}/data/tareas/1.log"))
    con.commit()
    con.close()
    return o


def test_migrar_copia_verifica_y_no_toca_el_origen(tmp_path):
    o, d = _origen_de_prueba(tmp_path), tmp_path / "espacio"
    antes = {p: p.stat().st_mtime_ns for p in o.rglob("*") if p.is_file()}
    r = espacio.migrar(o, d)
    assert r["verificacion"]["ok"] and r["verificacion"]["bd_ok"] and r["verificacion"]["ficheros"] >= 5
    assert (d / "canales" / "mi-canal" / "canal.json").exists() and (d / "canal_activo").read_text() == "mi-canal\n"
    assert (d / ".env").read_text() == "AI33_API_KEY=secreta\n" and oct((d / ".env").stat().st_mode & 0o777) == "0o600"
    assert (d / "analisis" / "mercado" / "nicho.md").exists() and (d / "data" / "uso.jsonl").exists()
    assert {p: p.stat().st_mtime_ns for p in o.rglob("*") if p.is_file()} == antes          # el original, intacto
    import sqlite3
    comando, log = sqlite3.connect(d / "data" / "canalyt.db").execute("SELECT comando, log FROM tarea").fetchone()
    assert f"{d.resolve()}/canales/mi-canal" in comando and f"{o}/herramientas/montar.py" in comando   # datos al espacio, código al kit
    assert log == f"{d.resolve()}/data/tareas/1.log" and r["rutas_reescritas"] == 2


def test_migrar_no_mezcla_ni_se_pisa_a_si_mismo(tmp_path):
    import pytest
    o = _origen_de_prueba(tmp_path)
    with pytest.raises(ValueError):
        espacio.migrar(o, o)
    with pytest.raises(ValueError):
        espacio.migrar(o, o / "dentro")
    d = tmp_path / "espacio"
    espacio.migrar(o, d)
    with pytest.raises(ValueError):                              # ya hay canales: no se mezcla
        espacio.migrar(o, d)


def test_verificar_detecta_lo_que_falta(tmp_path):
    o, d = _origen_de_prueba(tmp_path), tmp_path / "espacio"
    espacio.migrar(o, d)
    (d / "canales" / "mi-canal" / "videos" / "001-x" / "guion.json").unlink()
    (d / "data" / "uso.jsonl").write_text("otra cosa más larga")
    v = espacio.verificar(o, d)
    assert not v["ok"] and any("guion.json" in x for x in v["faltan"]) and any("uso.jsonl" in x for x in v["distintos"])


def test_elegir_recuerda_el_espacio_y_lo_ve_cualquier_comando(tmp_path, monkeypatch):
    """`.espacio` en el kit: lo lee espacio.py sin variable de entorno (UI y comandos sueltos)."""
    guardado = espacio.RECUERDO.read_text() if espacio.RECUERDO.exists() else None
    destino = tmp_path / "mi espacio"
    try:
        assert espacio.elegir(destino) == destino.resolve() and espacio.RECUERDO.read_text().strip() == str(destino.resolve())
        env = {k: v for k, v in os.environ.items() if k != "CANALYT_ESPACIO"}
        r = subprocess.run([sys.executable, "herramientas/espacio.py"], cwd=KIT, env=env, capture_output=True, text=True)
        assert f"espacio: {destino.resolve()}" in r.stdout
        import pytest
        with pytest.raises(ValueError):
            espacio.elegir(KIT / "dentro")
    finally:
        if guardado is None:
            espacio.RECUERDO.unlink(missing_ok=True)
        else:
            espacio.RECUERDO.write_text(guardado)


def test_ajustes_dice_donde_estan_el_kit_y_el_espacio(cliente):
    e = cliente.get("/api/ajustes").json()["espacio"]
    assert e["kit"] == str(KIT) and e["espacio"] and e["enlaces_que_faltan"] == [] and "separado" in e

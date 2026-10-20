"""Contrato de las herramientas del kit (punto 9 del plan, auditoría del 07/10): `--help` solo muestra la ayuda, un guion
que no existe o está dañado termina con «ERROR: …» y código 1 (nunca un traceback), y lo que guarda lo ya pagado
(ai33_tareas.json, musica.json) no se da por vacío si está dañado: se para sin tocarlo."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import archivos
import canal
import imagen_ai33
import musica_ai33

KIT = Path(__file__).resolve().parents[3]
HERRAMIENTAS = sorted(p for p in (KIT / "herramientas").glob("*.py"))
VIDEO = Path(os.environ["CANALYT_ESPACIO"]) / "canales" / "asombroso-y-real" / "videos" / "001-phineas-gage"
SIN_RED = {"HTTPS_PROXY": "http://127.0.0.1:9", "HTTP_PROXY": "http://127.0.0.1:9"}


def _lanzar(*args, cwd=None):
    return subprocess.run([sys.executable, *map(str, args)], cwd=cwd or os.environ["CANALYT_ESPACIO"],
                          env={**os.environ, **SIN_RED}, capture_output=True, text=True, timeout=60)


def _foto(raiz: Path):
    return {p: p.stat().st_mtime_ns for p in raiz.rglob("*") if p.is_file() and "__pycache__" not in p.parts}


@pytest.mark.parametrize("herramienta", HERRAMIENTAS, ids=lambda p: p.stem)
def test_help_solo_muestra_la_ayuda(herramienta):
    """Antes: marca.py regeneraba la marca del canal, probar_kit.py lanzaba la prueba entera, motor_local.py arrancaba el
    servidor del Mac y estructura_referencia.py se rompía con un «%» sin escapar."""
    espacio = Path(os.environ["CANALYT_ESPACIO"])
    antes = _foto(espacio / "canales")
    r = _lanzar(herramienta, "--help")
    assert "Traceback" not in r.stderr, r.stderr[-500:]
    if r.returncode == 0 and not r.stdout.strip():
        pytest.skip("biblioteca sin línea de órdenes")       # p. ej. imagen_ai33.py, archivos.py: se importan
    assert r.returncode == 0, r.stderr[-500:]
    assert len(r.stdout) > 80 and "\nseparado: " not in r.stdout and " al día · " not in r.stdout   # la ayuda, no la orden
    assert _foto(espacio / "canales") == antes, "--help no debe escribir nada"


@pytest.mark.parametrize("orden", [
    ["revisar_guion.py", "{g}"], ["fotogramas.py", "{g}"], ["montar.py", "{g}"], ["montar.py", "{g}", "--previsto-voz"],
    ["musica_ai33.py", "{g}", "--estado"], ["corregir_prompts.py", "{g}", "--ids", "01-1"], ["comparar_guion.py", "{g}", "{g}"],
    ["entonacion.py", "{c}"],
], ids=lambda o: " ".join(o[:1] + o[2:3]))
@pytest.mark.parametrize("caso", ["no_existe", "danado"])
def test_un_guion_malo_da_un_error_claro(orden, caso, tmp_path):
    carpeta = tmp_path / "videos" / "001-x"
    if caso == "danado":
        carpeta.mkdir(parents=True)
        (carpeta / "guion.json").write_text('{"escenas": [', encoding="utf-8")
    guion = carpeta / "guion.json"
    r = _lanzar(KIT / "herramientas" / orden[0], *[a.format(g=guion, c=carpeta) for a in orden[1:]])
    salida = (r.stderr + r.stdout).strip()
    assert r.returncode == 1 and "Traceback" not in salida, salida[-600:]
    assert salida.splitlines()[-1].startswith("ERROR: ")
    if caso == "danado" and orden[0] != "entonacion.py":
        assert "dañado (línea 1, columna" in salida


def test_leer_guion_migra_y_avisa_de_una_version_mas_nueva(tmp_path, capsys):
    g = tmp_path / "guion.json"
    g.write_text(json.dumps({"titulo": "x"}), encoding="utf-8")
    ruta, guion = canal.leer_guion(g)
    assert ruta == g and guion["escenas"] == [] and guion["version_esquema"] >= 1     # migrado al leer
    g.write_text(json.dumps({"version_esquema": 99, "escenas": []}), encoding="utf-8")
    canal.leer_guion(g)
    assert "versión más nueva" in capsys.readouterr().err
    g.write_text("[1, 2]", encoding="utf-8")
    with pytest.raises(canal.GuionNoValido, match="no es un guion"):
        canal.leer_guion(g)


def test_el_registro_de_lo_pagado_en_ai33_no_se_da_por_vacio(tmp_path):
    img = tmp_path / "img"
    img.mkdir()
    registro = img / "ai33_tareas.json"
    registro.write_text('{"03-1": {"tarea": "abc"', encoding="utf-8")
    with pytest.raises(archivos.ArchivoDanado, match="imágenes ya pagadas"):
        imagen_ai33._leer_registro(img)                 # quien lo reescribe, para
    assert imagen_ai33.tareas_apuntadas(img) == {}      # la pantalla del vídeo sigue en pie
    assert registro.read_text(encoding="utf-8") == '{"03-1": {"tarea": "abc"'


def test_musica_json_danado_no_se_pisa(tmp_path):
    carpeta = tmp_path / "videos" / "001-x"
    (carpeta / "musica").mkdir(parents=True)
    (carpeta / "guion.json").write_text(json.dumps({"escenas": [{"texto": "Hola.", "musica": "misterio"}]}))
    danado = '{"misterio": {"tarea": "pagada-1"'
    (carpeta / "musica" / "musica.json").write_text(danado, encoding="utf-8")
    with pytest.raises(archivos.ArchivoDanado):
        musica_ai33.leer_estado(carpeta)
    r = _lanzar(KIT / "herramientas" / "musica_ai33.py", carpeta / "guion.json", "--guardar-prompt", "misterio", "otro")
    assert r.returncode == 1 and "Traceback" not in r.stderr
    assert r.stderr.strip().splitlines()[-1].startswith("ERROR: No se puede leer la música del vídeo")
    assert (carpeta / "musica" / "musica.json").read_text(encoding="utf-8") == danado


@pytest.mark.parametrize("args", [["Uno", "Dos", "--id", "UnoDos"], ["Uno", "--id", "a b"]], ids=["id-con-dos", "id-mala"])
def test_nombre_canal_valida_la_arroba_sin_salir_a_youtube(args):
    """nombre_canal.py: una @ mala para antes de buscar nada (sin red ni traceback)."""
    r = _lanzar(KIT / "herramientas" / "nombre_canal.py", *args)
    assert r.returncode == 1 and "Traceback" not in r.stderr
    assert r.stderr.strip().splitlines()[-1].startswith("ERROR: ")


def test_nombre_canal_semaforo(monkeypatch):
    """La @ y la búsqueda deciden el semáforo (yt-dlp falso: sin red)."""
    import nombre_canal
    resultados = [{"id": "1", "channel": "Quantum Fracture", "title": "x"},
                  {"id": "2", "channel": "Otro", "title": "Dinero en llamas: la quiebra"}]
    monkeypatch.setattr(nombre_canal, "buscar", lambda nombre: resultados)
    monkeypatch.setattr(nombre_canal, "arroba_libre", lambda ident: ident != "Cogida")
    assert nombre_canal.medir("QuantumFracture")["semaforo"] == "rojo"          # mismo nombre sin espacios
    assert nombre_canal.medir("Cogida")["semaforo"] == "rojo"
    m = nombre_canal.medir("Quantum")
    assert m["semaforo"] == "ambar" and m["canales_parecidos"] == ["Quantum Fracture"]   # @ libre, canal parecido
    m = nombre_canal.medir("Dinero en Llamas")
    assert m["semaforo"] == "verde" and m["videos"] == 1 and m["id"] == "DineroEnLlamas"
    assert nombre_canal.medir("Quantum Física")["semaforo"] == "verde"
    assert nombre_canal.medir("Ruína Ilustrada", "RuinaIlus")["id"] == "RuinaIlus"

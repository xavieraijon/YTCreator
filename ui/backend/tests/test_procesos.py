"""Ciclo de vida de los procesos: parar con escalado, huérfanos tras un reinicio y tareas que ignoran Ctrl+C."""

import asyncio
import subprocess
import sys
import time
from datetime import datetime

import pytest

from app import procesos, tareas
from app.db import Sesion
from app.modelos import Tarea

from test_tareas import _esperar

TERCO = ("import signal, time\n"
         "signal.signal(signal.SIGINT, signal.SIG_IGN)\n"
         "{extra}"
         "print('listo', flush=True)\n"
         "time.sleep(60)\n")


@pytest.mark.parametrize("ignora_sigterm", [False, True])
def test_parar_escala_si_el_proceso_ignora_las_senales(tmp_path, ignora_sigterm):
    script = tmp_path / "terco.py"
    script.write_text(TERCO.format(extra="signal.signal(signal.SIGTERM, signal.SIG_IGN)\n" if ignora_sigterm else ""))

    async def probar():
        proc = await asyncio.create_subprocess_exec(sys.executable, str(script), stdout=asyncio.subprocess.PIPE,
                                                    start_new_session=True)
        await proc.stdout.readline()                      # ya ha instalado sus manejadores
        inicio = time.monotonic()
        codigo = await procesos.parar(proc, espera_sigint=0.3, espera_sigterm=0.3)
        return codigo, time.monotonic() - inicio

    codigo, segundos = asyncio.run(probar())
    assert codigo == (-9 if ignora_sigterm else -15)
    assert segundos < 3


def test_huerfano_solo_se_para_si_es_nuestro(tmp_path):
    script = tmp_path / "huerfano_montar.py"
    script.write_text(TERCO.format(extra=""))
    proc = subprocess.Popen([sys.executable, str(script)], stdout=subprocess.PIPE, start_new_session=True)
    try:
        proc.stdout.readline()
        assert not procesos.parar_huerfano(proc.pid, "otro_script.py")     # el PID lo tiene un proceso ajeno
        assert proc.poll() is None
        assert not procesos.parar_huerfano(proc.pid, "")                   # sin firma, nunca
        assert procesos.parar_huerfano(proc.pid, str(script))
        proc.wait(timeout=10)
        assert not procesos.parar_huerfano(proc.pid, str(script))          # ya no hay nada que parar
    finally:
        if proc.poll() is None:
            proc.kill()


def test_al_arrancar_la_tarea_en_curso_con_proceso_vivo_se_para_y_queda_interrumpida(cliente, tmp_path):
    script = tmp_path / "montar_huerfano.py"
    script.write_text(TERCO.format(extra=""))
    proc = subprocess.Popen([sys.executable, str(script)], stdout=subprocess.PIPE, start_new_session=True)
    proc.stdout.readline()
    with Sesion() as s:
        t = Tarea(herramienta="montar", titulo="Montar · huérfana", argumentos={}, pesada=True, estado="en_curso",
                  comando=["nice", "-n", "10", sys.executable, str(script)], creada=datetime.now(), pid=proc.pid)
        s.add(t)
        s.commit()
        tid = t.id
    try:
        tareas.ejecutor._marcar_interrumpidas()
        proc.wait(timeout=10)
        with Sesion() as s:
            t = s.get(Tarea, tid)
            assert t.estado == "interrumpida" and t.pid is None
    finally:
        if proc.poll() is None:
            proc.kill()


def test_cancelar_una_tarea_que_ignora_ctrl_c(cliente, tmp_path, monkeypatch):
    monkeypatch.setenv("CANALYT_TAREAS", str(tmp_path / "logs"))
    script = tmp_path / "terco.py"
    script.write_text(TERCO.format(extra=""))
    monkeypatch.setitem(tareas.HERRAMIENTAS, "terco", tareas.Herramienta("Terco", str(script), False, False))
    # parar() lee la espera por defecto al definirse: se sustituye por una con la espera corta
    original = procesos.parar
    monkeypatch.setattr(procesos, "parar", lambda proc, **k: original(proc, **({"espera_sigint": 0.5} | k)))
    t = cliente.post("/api/tareas", json={"herramienta": "terco"}).json()
    en_curso = _esperar(cliente, t["id"], {"en_curso"})
    for _ in range(50):                                    # que haya impreso «listo» (manejadores puestos)
        if "listo" in cliente.get(f"/api/tareas/{t['id']}").json()["lineas"]:
            break
        time.sleep(0.1)
    assert cliente.post(f"/api/tareas/{t['id']}/cancelar").status_code == 200
    fin = _esperar(cliente, t["id"], {"cancelada", "error", "hecha"})
    assert fin["estado"] == "cancelada" and en_curso["estado"] == "en_curso"

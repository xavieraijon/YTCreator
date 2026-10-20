"""Observabilidad (punto 8 del plan): cada línea del log del backend dice de qué tarea y vídeo habla, y al acabar una
tarea queda cuánto tardó cada fase. Para responder «¿por qué falló este vídeo?» con un grep en backend.log."""

import asyncio
import logging

from app import contexto_log
from app.contexto_log import Cronometro, FiltroContexto, con, duracion


def _formatear(registro_log):
    h = logging.Handler()
    h.addFilter(FiltroContexto())
    h.setFormatter(logging.Formatter("%(name)s%(contexto)s: %(message)s"))
    registro = logging.LogRecord("canalyt.x", logging.INFO, __file__, 1, registro_log, None, None)
    h.filter(registro)
    return h.format(registro)


def test_cada_linea_lleva_su_tarea_y_su_video():
    assert _formatear("nada") == "canalyt.x: nada"
    with con(tarea=12, video=3):
        assert _formatear("hola") == "canalyt.x [tarea 12 · vídeo 3]: hola"
        with con(video=None):                       # un None no borra lo que ya había
            assert _formatear("x") == "canalyt.x [tarea 12 · vídeo 3]: x"
    with con(tarea=5):
        assert _formatear("x") == "canalyt.x [tarea 5]: x"
    assert _formatear("fuera") == "canalyt.x: fuera"


def test_dos_tareas_a_la_vez_no_se_mezclan():
    vistos = {}

    async def tarea(n):
        with con(tarea=n):
            await asyncio.sleep(0.01)
            vistos[n] = await asyncio.to_thread(_formatear, "x")   # también en los hilos (to_thread)

    async def ambas():
        await asyncio.gather(tarea(1), tarea(2))

    asyncio.run(ambas())
    assert vistos == {1: "canalyt.x [tarea 1]: x", 2: "canalyt.x [tarea 2]: x"}


def test_las_peticiones_de_un_video_llevan_su_id():
    capturado = {}

    async def app(scope, receive, send):
        capturado[scope["path"]] = _formatear("x")

    mw = contexto_log.ContextoPeticion(app)
    for ruta in ("/api/videos/7/claude", "/api/videos/7", "/api/canales/a/videos", "/api/tareas/3"):
        asyncio.run(mw({"type": "http", "path": ruta}, None, None))
    assert capturado["/api/videos/7/claude"] == capturado["/api/videos/7"] == "canalyt.x [vídeo 7]: x"
    assert capturado["/api/canales/a/videos"] == capturado["/api/tareas/3"] == "canalyt.x: x"


def test_duracion_en_palabras():
    assert [duracion(s) for s in (4.4, 60, 185, 3600, 3725)] == ["4 s", "1 min", "3 min 5 s", "1 h", "1 h 2 min"]


def test_tiempo_por_fase_con_las_etapas_de_progreso():
    t = [0.0]
    c = Cronometro(reloj=lambda: t[0])
    c.etapa("Voces")
    t[0] = 60
    c.etapa("Imágenes")
    t[0] = 65
    for s in range(0, 120, 10):                    # los avisos de avance dentro de una fase no la parten
        c.etapa(f"Vídeo: {s} de 120 s")
        t[0] += 10
    c.etapa("Hecho")                              # «Hecho» no es una fase
    assert c.resumen() == "Tiempo: 3 min 5 s (Voces 1 min · Imágenes 5 s · Vídeo 2 min)"


def test_sin_fases_solo_el_total():
    t = [0.0]
    c = Cronometro(reloj=lambda: t[0])
    t[0] = 7
    assert c.resumen() == "Tiempo: 7 s"
    c.etapa("Una sola")
    t[0] = 9
    assert c.resumen() == "Tiempo: 9 s"

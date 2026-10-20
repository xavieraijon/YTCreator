"""Contexto de cada línea del log del backend: la tarea y el vídeo de los que habla («[tarea 12 · vídeo 3]»), para
responder «¿por qué falló este vídeo?» con un grep en data/logs/backend.log. Lo ponen el ejecutor de tareas (`con`)
y, en las peticiones a /api/videos/<id>/…, el middleware `ContextoPeticion`. Un ContextVar viaja con cada tarea de
asyncio y con asyncio.to_thread, así que no se mezclan los contextos de dos tareas a la vez."""

import logging
import re
import time
from contextlib import contextmanager
from contextvars import ContextVar

_contexto: ContextVar[dict | None] = ContextVar("contexto_log", default=None)
_RUTA_VIDEO = re.compile(r"/videos/(\d+)(?:/|$)")


@contextmanager
def con(**datos):
    """Mientras dura el bloque, las líneas del log llevan estos datos (tarea=…, video=…); los None no cuentan."""
    token = _contexto.set({**(_contexto.get() or {}), **{k: v for k, v in datos.items() if v is not None}})
    try:
        yield
    finally:
        _contexto.reset(token)


class FiltroContexto(logging.Filter):
    """Añade %(contexto)s al registro: « [tarea 12 · vídeo 3]» o nada."""

    def filter(self, registro):
        c = _contexto.get() or {}
        partes = [f"{nombre} {c[clave]}" for clave, nombre in (("tarea", "tarea"), ("video", "vídeo")) if clave in c]
        registro.contexto = f" [{' · '.join(partes)}]" if partes else ""
        return True


class ContextoPeticion:
    """Middleware ASGI: las peticiones a /api/videos/<id>/… registran con el vídeo en su contexto."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        m = _RUTA_VIDEO.search(scope.get("path", "")) if scope["type"] == "http" else None
        if not m:
            return await self.app(scope, receive, send)
        with con(video=int(m.group(1))):
            await self.app(scope, receive, send)


def duracion(segundos: float) -> str:
    """«45 s», «3 min 5 s», «1 h 2 min»."""
    s = round(segundos)
    if s < 60:
        return f"{s} s"
    if s < 3600:
        return f"{s // 60} min" + (f" {s % 60} s" if s % 60 else "")
    return f"{s // 3600} h" + (f" {s % 3600 // 60} min" if s % 3600 // 60 else "")


class Cronometro:
    """Tiempo por fase de una tarea, a partir de sus líneas @progreso: la fase es el texto de la etapa hasta los dos
    puntos («Vídeo: 5 de 60 s» → «Vídeo»), para que los avisos de avance dentro de una fase no la partan."""

    def __init__(self, reloj=time.monotonic):
        self._reloj = reloj
        self._inicio = reloj()
        self._actual: tuple[str, float] | None = None
        self.fases: dict[str, float] = {}      # en el orden en que empezaron; si una fase vuelve, se suma

    def etapa(self, texto: str):
        nombre = texto.split(":")[0].strip()[:60]
        if not nombre or (self._actual and self._actual[0] == nombre):
            return
        self._cerrar()
        self._actual = (nombre, self._reloj())

    def _cerrar(self):
        if self._actual:
            nombre, desde = self._actual
            self.fases[nombre] = self.fases.get(nombre, 0.0) + self._reloj() - desde
            self._actual = None

    def resumen(self) -> str:
        """«Tiempo: 5 min 3 s (Voces 1 min · Vídeo 4 min 3 s)»; sin fases, solo el total."""
        self._cerrar()
        total = self._reloj() - self._inicio
        fases = [(n, s) for n, s in self.fases.items() if n.lower() != "hecho"]
        detalle = " · ".join(f"{n} {duracion(s)}" for n, s in fases[:12])
        if len(fases) > 12:
            detalle += f" · y {len(fases) - 12} más"
        return f"Tiempo: {duracion(total)}" + (f" ({detalle})" if len(fases) > 1 else "")

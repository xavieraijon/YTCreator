"""Vigila canales/ y canal_activo: cuando cambia un archivo (lo toque Claude Code, una herramienta o el
usuario), reindexa ese canal y avisa al frontend."""

import asyncio
import logging
from pathlib import Path

from watchfiles import Change, DefaultFilter, awatch

import canal as kit_canal

from .db import Sesion
from .eventos import difusor
from .sincronizar import canal_de_ruta, sincronizar_canal, sincronizar_todo

log = logging.getLogger("canalyt.vigilante")

# Lo que cambia mucho y no afecta al índice.
IGNORAR_CARPETAS = {"tmp", "boceto", "_pruebas", "__pycache__", "voz", ".git"}
IGNORAR_SUFIJOS = (".log", ".tmp", ".part", ".firma", ".semilla", ".wav", ".lock", "ai33_tareas.json")


class Filtro(DefaultFilter):
    def __call__(self, cambio: Change, ruta: str) -> bool:
        if not super().__call__(cambio, ruta):
            return False
        p = Path(ruta)
        # Solo las carpetas DENTRO de canales/: el espacio puede vivir bajo una carpeta llamada «tmp» (o «voz»…).
        try:
            partes = set(p.relative_to(kit_canal.CANALES).parts)
        except ValueError:
            try:
                partes = set(p.resolve().relative_to(kit_canal.CANALES.resolve()).parts)
            except ValueError:
                partes = {p.name}
        return not (IGNORAR_CARPETAS & partes or p.name.endswith(IGNORAR_SUFIJOS))


async def vigilar(parada: asyncio.Event):
    rutas = [kit_canal.CANALES] + ([kit_canal.ACTIVO] if kit_canal.ACTIVO.exists() else [])
    async for cambios in awatch(*rutas, watch_filter=Filtro(), stop_event=parada, recursive=True,
                                debounce=800, step=200):
        tocados = {Path(r) for _, r in cambios}
        if any(p == kit_canal.ACTIVO for p in tocados):
            await asyncio.to_thread(_todo)
            difusor.publicar("cambio", canal=None)
            continue
        canales = {c for p in tocados if (c := canal_de_ruta(p))}
        for slug in sorted(canales):
            try:
                await asyncio.to_thread(_canal, slug)
            except Exception:     # un json a medio escribir no debe parar el vigilante
                log.exception("No se pudo reindexar %s", slug)
                continue
            difusor.publicar("cambio", canal=slug)


def _todo():
    with Sesion() as s:
        sincronizar_todo(s)


def _canal(slug):
    with Sesion() as s:
        sincronizar_canal(s, slug)

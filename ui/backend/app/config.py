"""Rutas y configuración del backend. Las herramientas del kit (herramientas/*.py) se importan desde aquí para no duplicar
su lógica.

  KIT   = la carpeta del código (herramientas, ui, plantillas, agentes).
  RAIZ  = la carpeta de TRABAJO (canales, .env, data): el espacio de `herramientas/espacio.py`. Sin `CANALYT_ESPACIO`
          es la misma carpeta que el kit. Los subprocesos y Claude se lanzan con esta carpeta como directorio de trabajo."""

import os
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parents[3]           # CanalYT/ (el código)
HERRAMIENTAS = KIT / "herramientas"
FRONTEND_DIST = KIT / "ui" / "frontend" / "dist" / "frontend" / "browser"

if str(HERRAMIENTAS) not in sys.path:
    sys.path.insert(0, str(HERRAMIENTAS))

import espacio  # noqa: E402  (herramientas/)
import sistema  # noqa: E402  (herramientas/)

PYTHON = sistema.python_venv(KIT)                   # .venv/bin/python (Mac, Linux) o .venv\Scripts\python.exe

RAIZ = espacio.ESPACIO                               # el espacio de trabajo

# Base de datos: data/ ya está fuera de Git. CANALYT_DB la cambia (tests).
DB_URL = os.getenv("CANALYT_DB", f"sqlite:///{espacio.DATOS / 'canalyt.db'}")

# Conversaciones con Claude (entradas del chat): junto a la base de datos, para que un servidor de pruebas con
# otra BD (CANALYT_DB) no mezcle sus conversaciones con las de verdad. CANALYT_CHATS la cambia.
def _carpeta_chats() -> Path:
    propia = os.getenv("CANALYT_CHATS")
    if propia:
        return Path(propia)
    if DB_URL.startswith("sqlite:///") and os.getenv("CANALYT_DB"):
        bd = Path(DB_URL.removeprefix("sqlite:///"))
        return bd.parent / f"{bd.stem}-claude"
    return espacio.DATOS / "claude"


CHATS = _carpeta_chats()

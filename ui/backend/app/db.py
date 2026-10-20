"""Motor de SQLAlchemy sobre SQLite (modo WAL: lecturas mientras se escribe)."""

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config


class Base(DeclarativeBase):
    pass


def crear_motor(url=None):
    url = url or config.DB_URL
    if url.startswith("sqlite:///"):
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    motor = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(motor, "connect")
    def _pragmas(conexion, _):
        cur = conexion.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    return motor


motor = crear_motor()
Sesion = sessionmaker(bind=motor, expire_on_commit=False)


def sesion():
    """Dependencia de FastAPI: una sesión por petición."""
    with Sesion() as s:
        yield s

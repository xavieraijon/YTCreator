"""Tablas de la base de datos. Las de índice (canal, video, escena, imagen) se rehacen desde los archivos del
kit, que son la fuente de verdad; las propias de la UI (tareas, gastos, métricas…) llegan en pasos siguientes.
Los vídeos conservan su id entre sincronizaciones (se actualizan por canal + carpeta), para que las tablas
propias de la UI puedan apuntar a ellos."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Canal(Base):
    __tablename__ = "canal"

    slug: Mapped[str] = mapped_column(String, primary_key=True)     # "mi-canal", "_archivo/…"
    nombre: Mapped[str] = mapped_column(String)
    url: Mapped[str | None] = mapped_column(String)
    activo: Mapped[bool] = mapped_column(Boolean, default=False)
    archivado: Mapped[bool] = mapped_column(Boolean, default=False)
    pendientes: Mapped[int] = mapped_column(Integer, default=0)     # marcas <<RELLENAR>>
    videos: Mapped[int] = mapped_column(Integer, default=0)
    fase_creacion: Mapped[str | None] = mapped_column(String)       # /nuevo-canal a medias
    rapido: Mapped[bool] = mapped_column(Boolean, default=False)    # canal rápido (canal.json → "rapido"): sin nombre aún
    actualizado: Mapped[datetime] = mapped_column(DateTime)


class Video(Base):
    __tablename__ = "video"
    __table_args__ = (UniqueConstraint("canal", "carpeta"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canal: Mapped[str] = mapped_column(String, index=True)          # slug del canal (sin FK: la tabla canal se rehace)
    carpeta: Mapped[str] = mapped_column(String)                    # "001-pulpo-nueve-cerebros", "S002-…"
    tipo: Mapped[str] = mapped_column(String)                       # largo | short
    titulo: Mapped[str | None] = mapped_column(String)
    pilar: Mapped[str | None] = mapped_column(String)
    duracion_objetivo: Mapped[float | None] = mapped_column(Float)  # minutos
    fase: Mapped[str | None] = mapped_column(String)                # letra, "cerrado" o None (sin estado.json)
    completadas: Mapped[list] = mapped_column(JSON, default=list)
    aparcado: Mapped[bool] = mapped_column(Boolean, default=False)
    notas: Mapped[str | None] = mapped_column(Text)
    pendiente: Mapped[dict | None] = mapped_column(JSON)
    extra: Mapped[dict | None] = mapped_column(JSON)                # otros campos de estado.json
    escenas_total: Mapped[int] = mapped_column(Integer, default=0)
    palabras: Mapped[int] = mapped_column(Integer, default=0)
    duracion_estimada: Mapped[float | None] = mapped_column(Float)  # minutos (palabras / palabras_por_minuto)
    imagenes_total: Mapped[int] = mapped_column(Integer, default=0)
    imagenes_hechas: Mapped[int] = mapped_column(Integer, default=0)         # listas: existen y al día
    imagenes_desactualizadas: Mapped[int] = mapped_column(Integer, default=0)   # montar.py las rehará
    tiene_final: Mapped[bool] = mapped_column(Boolean, default=False)
    documentos: Mapped[list] = mapped_column(JSON, default=list)    # .md presentes en la carpeta
    estado_real: Mapped[dict | None] = mapped_column(JSON)           # app/estado_video.py: lo que ven todas las pantallas
    modificado: Mapped[datetime] = mapped_column(DateTime)          # último cambio en sus archivos de texto
    actualizado: Mapped[datetime] = mapped_column(DateTime)         # última sincronización

    escenas: Mapped[list["Escena"]] = relationship(back_populates="video", cascade="all, delete-orphan",
                                                   order_by="Escena.numero")
    imagenes: Mapped[list["Imagen"]] = relationship(back_populates="video", cascade="all, delete-orphan",
                                                    order_by="Imagen.orden")


class Escena(Base):
    __tablename__ = "escena"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("video.id", ondelete="CASCADE"), index=True)
    numero: Mapped[int] = mapped_column(Integer)
    capitulo: Mapped[str | None] = mapped_column(String)
    texto: Mapped[str] = mapped_column(Text)                        # sin marcas {…} ni [emoción]
    palabras: Mapped[int] = mapped_column(Integer)

    video: Mapped[Video] = relationship(back_populates="escenas")


class Imagen(Base):
    __tablename__ = "imagen"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("video.id", ondelete="CASCADE"), index=True)
    orden: Mapped[int] = mapped_column(Integer)
    ident: Mapped[str] = mapped_column(String)                      # "EE-N" (o "vEE-N" en verticales)
    escena: Mapped[int] = mapped_column(Integer)
    origen: Mapped[str] = mapped_column(String)                     # prompt | imagen | video | reutilizar
    prompt: Mapped[str | None] = mapped_column(Text)
    fuente: Mapped[str | None] = mapped_column(String)              # "imagen"/"video" del guion o id reutilizado
    ruta: Mapped[str | None] = mapped_column(String)                # archivo a enseñar, relativo al canal
    existe: Mapped[bool] = mapped_column(Boolean, default=False)
    desactualizada: Mapped[bool] = mapped_column(Boolean, default=False)   # su .firma no es la del prompt
    motor: Mapped[str] = mapped_column(String, default="klein")     # klein | ai33 (de pago)

    video: Mapped[Video] = relationship(back_populates="imagenes")


class Tarea(Base):
    """Herramienta del kit lanzada desde la UI (propia de la UI: no se rehace desde los archivos)."""
    __tablename__ = "tarea"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    herramienta: Mapped[str] = mapped_column(String)                # clave de tareas.HERRAMIENTAS
    titulo: Mapped[str] = mapped_column(String)                     # "Revisar guion · 001-phineas-gage"
    canal: Mapped[str | None] = mapped_column(String)
    video_id: Mapped[int | None] = mapped_column(Integer, index=True)   # sin FK: el vídeo puede desaparecer
    argumentos: Mapped[dict] = mapped_column(JSON, default=dict)
    comando: Mapped[list] = mapped_column(JSON, default=list)       # lo que se ejecutó, para el historial
    pesada: Mapped[bool] = mapped_column(Boolean, default=False)    # una pesada a la vez
    estado: Mapped[str] = mapped_column(String, index=True)         # en_cola|en_curso|hecha|error|cancelada|interrumpida
    codigo: Mapped[int | None] = mapped_column(Integer)             # código de salida
    progreso: Mapped[dict | None] = mapped_column(JSON)             # {"hecho": 12, "total": 40, "texto": "…"}
    log: Mapped[str | None] = mapped_column(String)                 # data/tareas/<id>.log
    pid: Mapped[int | None] = mapped_column(Integer)                # grupo de procesos mientras corre (huérfanos)
    creada: Mapped[datetime] = mapped_column(DateTime)
    empezada: Mapped[datetime | None] = mapped_column(DateTime)
    terminada: Mapped[datetime | None] = mapped_column(DateTime)


class Conversacion(Base):
    """Conversación con Claude desde la UI (una por vídeo; las entradas, en data/claude/<id>.jsonl)."""
    __tablename__ = "conversacion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int | None] = mapped_column(Integer, index=True)   # sin FK: el vídeo puede desaparecer
    canal: Mapped[str | None] = mapped_column(String)
    titulo: Mapped[str | None] = mapped_column(String)
    sesion: Mapped[str | None] = mapped_column(String)              # session_id del CLI (--resume)
    estado: Mapped[str] = mapped_column(String, default="libre")    # libre | pensando | error
    pid: Mapped[int | None] = mapped_column(Integer)                # grupo de procesos del turno en marcha
    turnos: Mapped[int] = mapped_column(Integer, default=0)
    creada: Mapped[datetime] = mapped_column(DateTime)
    actualizada: Mapped[datetime] = mapped_column(DateTime)


class Gasto(Base):
    """Gasto de pago (créditos de ai33) lanzado desde la UI; sirve para saber cuánto cuesta cada vídeo."""
    __tablename__ = "gasto"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime)
    servicio: Mapped[str] = mapped_column(String)                   # ai33
    herramienta: Mapped[str] = mapped_column(String)                # voz_ai33, musica_ai33, imagenes_ai33…
    creditos: Mapped[int] = mapped_column(Integer)
    video_id: Mapped[int | None] = mapped_column(Integer, index=True)   # sin FK: el vídeo puede desaparecer
    canal: Mapped[str | None] = mapped_column(String)
    tarea_id: Mapped[int | None] = mapped_column(Integer)
    nota: Mapped[str | None] = mapped_column(String)

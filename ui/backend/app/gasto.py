"""Gasto de pago de ai33 por vídeo (tabla `gasto`) y el tope de presupuesto por vídeo (data/ajustes.json).
Se apunta al TERMINAR una tarea de pago que llegó a ejecutarse (el ejecutor llama a `apuntar_al_terminar`), con el coste que
confirmó el usuario. No se apunta nada si se canceló en cola, si no llegó a arrancar o si corrió en modo sin gasto (la
herramienta simula y no envía). Si arrancó y falló o se canceló a medias, cuenta igual (ai33 no devuelve créditos), con nota.
El tope por vídeo bloquea en `comprobar_tope` (lo llama `tareas.preparar`) la tarea que lo haría pasar."""

import os
from datetime import datetime

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .modelos import Gasto, Tarea

import archivos  # noqa: E402  (herramientas/, en sys.path por config)
import proveedores  # noqa: E402

CREDITOS_IMAGEN_AI33 = proveedores.valor("ai33.creditos_por_imagen")           # Nano Banana 2 con referencia de estilo (CLAUDE.md → Cuotas)
AJUSTES: Path | None = None            # las pruebas lo fijan; si no, CANALYT_AJUSTES o data/ajustes.json


def ruta_ajustes() -> Path:
    return AJUSTES or Path(os.environ.get("CANALYT_AJUSTES") or config.RAIZ / "data" / "ajustes.json")


def creditos_previstos(herramienta: str, argumentos: dict | None) -> int:
    """Créditos que gasta una tarea de pago, según lo que el usuario confirmó (0 si es gratis)."""
    a = argumentos or {}
    if not a.get("confirmado"):
        return 0
    previsto = int(a.get("previsto") or 0)
    if herramienta in ("voz_ai33", "musica_ai33", "voz_canal_ai33"):
        return previsto
    if herramienta in ("imagenes_ai33", "rehacer_imagen_ai33"):
        return previsto * CREDITOS_IMAGEN_AI33
    return 0


def creditos_de(t: Tarea) -> int:
    return creditos_previstos(t.herramienta, t.argumentos)


def registrar(s: Session, t: Tarea, nota: str | None = None) -> Gasto | None:
    creditos = creditos_de(t)
    if creditos <= 0:
        return None
    g = Gasto(fecha=datetime.now(), servicio="ai33", herramienta=t.herramienta, creditos=creditos,
              video_id=t.video_id, canal=t.canal, tarea_id=t.id, nota=f"{t.titulo}{nota or ''}")
    s.add(g)
    s.commit()
    return g


def apuntar_al_terminar(s: Session, t: Tarea, estado: str, arranco: bool, simulada: bool) -> Gasto | None:
    """Al acabar una tarea: apunta su coste solo si su proceso llegó a arrancar y no corría en modo sin gasto."""
    if simulada or not arranco or estado not in ("hecha", "error", "cancelada"):
        return None
    if s.scalars(select(Gasto).where(Gasto.tarea_id == t.id)).first():      # nunca dos veces la misma tarea
        return None
    return registrar(s, t, None if estado == "hecha" else f" (sin terminar, {estado}: quizá no se gastó todo)")


def euros(creditos: int) -> float:
    return round(creditos * proveedores.valor("ai33.euros_por_millon_creditos") / 1_000_000, 2)


def comprobar_tope(s: Session, video_id: int, herramienta: str, argumentos: dict) -> None:
    """ErrorTope si con esta tarea el vídeo pasaría su tope: lo apuntado + lo de pago en cola o en marcha + lo nuevo."""
    tope = leer_ajustes().get("tope_euros_video")
    nuevo = creditos_previstos(herramienta, argumentos)
    if not tope or nuevo <= 0:
        return
    apuntado = sum(g.creditos for g in s.scalars(select(Gasto).where(Gasto.video_id == video_id)))
    activas = s.scalars(select(Tarea).where(Tarea.video_id == video_id, Tarea.estado.in_(("en_cola", "en_curso")))).all()
    comprometido = apuntado + sum(creditos_de(t) for t in activas)
    total = euros(comprometido + nuevo)
    if total > float(tope):
        raise ErrorTope(f"Con esta tarea el gasto de este vídeo llegaría a {total:.2f} €, por encima de su tope de "
                        f"{float(tope):.2f} € (lleva {euros(comprometido):.2f} €). No se lanza: si quieres seguir, sube el "
                        "tope en Ajustes → Gasto.")


class ErrorTope(Exception):
    pass


def leer_ajustes() -> dict:
    """data/ajustes.json, estricto: si no existe, {}; si está dañado, ArchivoDanado (nunca «sin tope» en silencio)."""
    d = archivos.leer_json(ruta_ajustes())
    return d if isinstance(d, dict) else {}


def guardar_ajustes(cambios: dict) -> dict:
    ruta = ruta_ajustes()
    actuales = archivos.leer_json(ruta)               # dañado → ArchivoDanado: no se pierden los demás ajustes
    d = {**(actuales if isinstance(actuales, dict) else {}), **cambios}
    archivos.escribir_json(ruta, d, final_linea=False)
    return d


def resumen_video(s: Session, video_id: int, euros_por_millon: float | None = None) -> dict:
    filas = s.scalars(select(Gasto).where(Gasto.video_id == video_id).order_by(Gasto.id)).all()
    creditos = sum(g.creditos for g in filas)
    # La cifra viva de cuota.py si la hay; si no, la de Ajustes, leída ahora (un cambio vale sin reiniciar).
    tarifa = euros_por_millon or proveedores.valor("ai33.euros_por_millon_creditos")
    euros = round(creditos * tarifa / 1_000_000, 2)
    tope = leer_ajustes().get("tope_euros_video")
    return {
        "creditos": creditos, "euros": euros, "tope_euros": tope,
        "superado": bool(tope) and euros >= float(tope),
        "partidas": [{"fecha": g.fecha.isoformat(timespec="minutes"), "herramienta": g.herramienta, "creditos": g.creditos,
                      "euros": round(g.creditos * tarifa / 1_000_000, 2), "nota": g.nota} for g in filas],
    }

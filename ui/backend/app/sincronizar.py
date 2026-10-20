"""Archivos del kit → índice de la base de datos. Los archivos mandan: esto solo lee."""

import json
import logging
import re
import threading
from datetime import datetime
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

import canal as kit_canal          # herramientas/canal.py
import canales as kit_canales      # herramientas/canales.py
import esquema                     # herramientas/esquema.py
import archivos                    # herramientas/archivos.py

from . import estado_video, firma, guia
from .modelos import Canal, Conversacion, Escena, Gasto, Imagen, Tarea, Video

# Una sincronización a la vez (arranque, vigilante y peticiones pueden coincidir).
_candado = threading.Lock()

# Documentos .md de un vídeo: estos primero y en este orden; los demás (verificacion.md…), detrás por nombre.
DOCUMENTOS = ("empaquetado.md", "escaleta.md", "guion.md", "fuentes.md", "brief_visual.md", "publicacion_final.md",
              "publicacion.md")
NOMBRE_DOCUMENTO = re.compile(r"^[\w.-]+\.md$")
# Campos de estado.json que ya tienen su sitio en la UI; los demás se enseñan tal cual ("extra").
log = logging.getLogger("canalyt.sincronizar")

CAMPOS_ESTADO = {"fase", "completadas", "duracion_objetivo", "pilar", "notas", "pendiente", "aparcado", "tipo",
                 "actualizado", "pendiente_aprobacion", "aprobaciones", "cambios_pedidos", "pasos_hechos"}
_MARCAS = re.compile(r"\{[^}]*\}|\[[a-z ]+\]")


def _texto(x) -> str | None:
    """Un campo de texto de estado.json o guion.json tal como venga (los escribe también Claude): una lista se une con
    « | » (el corte de las notas) y cualquier otro tipo se pasa a texto. Así un tipo inesperado no tumba la sincronización."""
    if x is None or isinstance(x, str):
        return x
    if isinstance(x, list):
        return " | ".join(str(i) for i in x)
    return str(x)


def _numero(x) -> float | None:
    try:
        return float(x) if x is not None and not isinstance(x, bool) else None
    except (TypeError, ValueError):
        return None


def carpeta_canal(slug):
    return kit_canal.CANALES / slug


def carpeta_video(video) -> Path:
    """Carpeta de un vídeo del índice (canales/<canal>/videos/<carpeta>)."""
    return carpeta_canal(video.canal) / "videos" / video.carpeta


def _leer_json(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def danados(carpeta_v: Path) -> list[str]:
    """Los JSON del vídeo que existen pero no se pueden leer, dichos para el usuario («el estado del vídeo»…)."""
    res = []
    for nombre in ("estado.json", "guion.json"):
        try:
            archivos.leer_json(carpeta_v / nombre)
        except archivos.ArchivoDanado:
            res.append(archivos.QUE_ES[nombre])
        except OSError:
            pass
    return res


def leer_estado(carpeta_v: Path) -> dict:
    """estado.json del vídeo en la versión de esquema actual (vacío si falta o no se puede leer)."""
    return esquema.migrar("estado", _leer_json(carpeta_v / "estado.json"))


def leer_guion(carpeta_v: Path) -> dict:
    """guion.json del vídeo en la versión de esquema actual (vacío si falta o no se puede leer)."""
    return esquema.migrar("guion", _leer_json(carpeta_v / "guion.json"))


def contexto_guia(v) -> guia.Contexto:
    """Lo que necesita la guía de un vídeo del índice (con sus imágenes cargadas): la única forma de construirlo."""
    carpeta_v = carpeta_video(v)
    return guia.Contexto(carpeta=carpeta_v, carpeta_canal=carpeta_canal(v.canal),
                         estado=leer_estado(carpeta_v),
                         guion=leer_guion(carpeta_v), imagenes=list(v.imagenes))


def titulo_humano(estado: dict, guion: dict) -> str | None:
    """El título que ve el usuario: el elegido en «Título y miniatura», el del guion, el del enfoque elegido o el
    tema que escribió al crear el vídeo (con mayúscula inicial). Nunca el nombre de la carpeta."""
    for t in (estado.get("titulo_elegido"), guion.get("titulo"), estado.get("titulo_provisional"), estado.get("tema")):
        if isinstance(t, str) and t.strip():
            t = " ".join(t.split())
            return t[0].upper() + t[1:]
    return None


def _datos_canal(carpeta, slug, activo, archivado):
    cfg = _leer_json(carpeta / "canal.json") or {}
    url = cfg.get("url") or None
    if url and kit_canales.MARCA.search(url):
        url = None
    estado = _leer_json(carpeta / "estado_canal.json") or {}
    fase = estado.get("fase")
    return Canal(
        slug=slug,
        nombre=cfg.get("nombre") or slug,
        url=url,
        activo=activo,
        archivado=archivado,
        pendientes=len(kit_canales.pendientes(carpeta)),
        videos=len(carpetas_video(carpeta)),
        fase_creacion=fase if fase and fase != "hecho" else None,
        rapido=cfg.get("rapido") is True,
        actualizado=datetime.now(),
    )


def carpetas_video(carpeta):
    """Carpetas de vídeos y Shorts de un canal (NNN-slug y SNNN-slug; no _pruebas)."""
    videos = carpeta / "videos"
    return sorted(v for v in videos.glob("[0-9S]*") if v.is_dir()) if videos.exists() else []


def _texto_limpio(texto):
    return " ".join(_MARCAS.sub(" ", texto or "").split())


def _imagenes_de(escena):
    """Las imágenes de una escena: su lista "imagenes" o la escena misma si lleva una sola."""
    if escena.get("imagenes"):
        return escena["imagenes"]
    if any(k in escena for k in ("prompt", "imagen", "video", "reutilizar")):
        return [escena]
    return []


def documentos(carpeta_v):
    presentes = {p.name for p in carpeta_v.glob("*.md") if NOMBRE_DOCUMENTO.match(p.name)}
    return [d for d in DOCUMENTOS if d in presentes] + sorted(presentes - set(DOCUMENTOS))


def _desactualizada(png, esperada):
    """La imagen existe pero montar.py la rehará: su .firma no es la del prompt actual."""
    if esperada is None or not png.exists():
        return False
    f = png.with_suffix(".firma")
    try:
        return f.read_text().strip() != esperada
    except OSError:
        return True


def _imagen(carpeta_c, carpeta_v, ident, num_escena, orden, datos, esperada=None):
    if "video" in datos:
        origen, fuente = "video", datos["video"]
    elif "imagen" in datos:
        origen, fuente = "imagen", datos["imagen"]
    elif "reutilizar" in datos:
        origen, fuente = "reutilizar", datos["reutilizar"]
    else:
        origen, fuente = "prompt", None
    png = carpeta_v / "img" / f"{ident}.png"
    if origen == "imagen" and (carpeta_c / fuente).exists() and not png.exists():
        archivo = carpeta_c / fuente
    elif origen == "reutilizar":
        archivo = carpeta_v / "img" / f"{fuente}.png"
    else:
        archivo = png
    return Imagen(
        orden=orden, ident=ident, escena=num_escena, origen=origen, prompt=datos.get("prompt"),
        fuente=fuente, ruta=str(archivo.relative_to(carpeta_c)), existe=archivo.exists(),
        desactualizada=origen == "prompt" and _desactualizada(png, esperada),
        motor="ai33" if origen == "prompt" and datos.get("motor") == "ai33" else "klein",
    )


def _modificado(carpeta_v):
    textos = [p for p in carpeta_v.iterdir() if p.is_file() and p.suffix in (".json", ".md")]
    return datetime.fromtimestamp(max((p.stat().st_mtime for p in textos), default=carpeta_v.stat().st_mtime))


def _rellenar_video(v, carpeta_c, carpeta_v, ppm, cfg=None):
    estado = leer_estado(carpeta_v)
    guion = leer_guion(carpeta_v)
    rotos = danados(carpeta_v)
    if "el estado del vídeo" in rotos:
        # Con el estado ilegible, el índice conserva lo último que se supo (no lo da por un vídeo recién creado).
        estado = {"fase": v.fase, "completadas": list(v.completadas or []), "aparcado": bool(v.aparcado),
                  "titulo_provisional": v.titulo}
    escenas = guion.get("escenas") or []
    cfg = cfg or {}
    completo = firma.completar(cfg, guion)

    v.tipo = "short" if (estado.get("tipo") or guion.get("tipo")) == "short" or carpeta_v.name.startswith("S") else "largo"
    if v.tipo == "largo" and estado.get("fase") == "A":
        # La fase A (comprobar el kit) ya no es un paso del usuario: los vídeos de antes pasan solos a la B, como los
        # nuevos al crearse (hallazgos 13 y 55 del recorrido profano).
        from .fases_ui import continuar_a
        try:
            continuar_a(carpeta_v / "estado.json", "UI (automático, vídeo antiguo)")
            estado = leer_estado(carpeta_v) or estado
        except (OSError, ValueError) as e:
            log.warning("no se pudo pasar %s a la fase B: %s", carpeta_v.name, e)
    v.titulo = titulo_humano(estado, guion)
    v.pilar = _texto(estado.get("pilar") or guion.get("pilar"))
    v.duracion_objetivo = _numero(estado.get("duracion_objetivo") or guion.get("duracion_objetivo"))
    v.fase = _texto(estado.get("fase"))
    v.completadas = list(estado.get("completadas") or [])
    v.aparcado = bool(estado.get("aparcado"))
    v.notas = _texto(estado.get("notas"))
    v.pendiente = estado.get("pendiente")
    v.extra = {k: val for k, val in estado.items() if k not in CAMPOS_ESTADO} or None

    v.escenas.clear()
    v.imagenes.clear()
    orden = 0
    for n, e in enumerate(escenas, 1):
        texto = _texto_limpio(e.get("texto"))
        v.escenas.append(Escena(numero=n, capitulo=_texto(e.get("capitulo")), texto=texto, palabras=len(texto.split())))
        for i, datos in enumerate(_imagenes_de(e), 1):
            orden += 1
            esperada = None
            if datos.get("prompt") and not any(k in datos for k in ("video", "imagen", "reutilizar")):
                try:
                    esperada = firma.esperada(cfg, completo, datos, carpeta_c)
                except Exception:      # guion a medio escribir: sin firma no se marca nada
                    esperada = None
            v.imagenes.append(_imagen(carpeta_c, carpeta_v, f"{n:02d}-{i}", n, orden, datos, esperada))

    v.escenas_total = len(v.escenas)
    v.palabras = sum(e.palabras for e in v.escenas)
    v.duracion_estimada = round(v.palabras / ppm, 1) if v.palabras else None
    v.imagenes_total = len(v.imagenes)
    v.imagenes_hechas = sum(i.existe and not i.desactualizada for i in v.imagenes)   # listas: al día
    v.imagenes_desactualizadas = sum(i.desactualizada for i in v.imagenes)
    v.tiene_final = (carpeta_v / "final.mp4").exists()
    v.documentos = documentos(carpeta_v)
    try:
        v.estado_real = estado_video.calcular(v.tipo, guia.Contexto(carpeta=carpeta_v, carpeta_canal=carpeta_c, estado=estado,
                                                                    guion=guion, imagenes=list(v.imagenes)))
    except Exception:                    # un archivo a medio escribir no puede tumbar la sincronización entera
        log.exception("Sin estado real para %s", carpeta_v)
        v.estado_real = None
    if rotos and v.estado_real is not None:
        v.estado_real = {**v.estado_real, "archivo_danado": (
            f"No se puede leer {' ni '.join(rotos)}: su archivo está dañado. No se ha cambiado nada; pide a Claude en el "
            "chat que lo repare (o restaura una copia). Hasta entonces, lo que se ve puede no estar al día.")}
    nuevo = esquema.aviso("estado", estado) or esquema.aviso("guion", guion)
    if nuevo and v.estado_real is not None:          # archivos de una versión más nueva de YTCreator: se dice en pantalla
        v.estado_real = {**v.estado_real, "esquema": nuevo}
    v.modificado = _modificado(carpeta_v)
    v.actualizado = datetime.now()


def sincronizar_videos(s: Session, slug):
    """Pone al día los vídeos de un canal: actualiza los que existen (mismo id), crea los nuevos y borra
    los que ya no están en disco."""
    carpeta_c = carpeta_canal(slug)
    cfg = _leer_json(carpeta_c / "canal.json") or {}
    ppm = cfg.get("palabras_por_minuto") or 150
    existentes = {v.carpeta: v for v in s.scalars(select(Video).where(Video.canal == slug))}
    vistos = set()
    for carpeta_v in carpetas_video(carpeta_c):
        v = existentes.get(carpeta_v.name) or Video(canal=slug, carpeta=carpeta_v.name)
        if v.id is None:
            s.add(v)
        _rellenar_video(v, carpeta_c, carpeta_v, ppm, cfg)
        vistos.add(carpeta_v.name)
    for nombre, v in existentes.items():
        if nombre not in vistos:
            s.delete(v)


def slugs_en_disco():
    activos = [(n, False) for n in kit_canal.canales()]
    archivados = [(f"_archivo/{p.parent.name}", True)
                  for p in sorted((kit_canal.CANALES / "_archivo").glob("*/canal.json"))]
    return activos + archivados


def _heredar_slugs_anteriores(s: Session, slugs):
    """Un canal renombrado (`canales.py renombrar`/`convertir`) dice en canal.json → "slugs_anteriores" cómo se llamaba:
    sus vídeos (con el mismo id), tareas, conversaciones y gastos pasan al nombre nuevo antes de que nada los borre."""
    for slug in slugs:
        cfg = _leer_json(carpeta_canal(slug) / "canal.json") or {}
        viejos = [v for v in cfg.get("slugs_anteriores") or [] if isinstance(v, str) and v not in slugs]
        if not viejos:
            continue
        repetidos = select(Video.carpeta).where(Video.canal.in_(viejos))
        s.execute(delete(Video).where(Video.canal == slug, Video.carpeta.in_(repetidos)))
        for tabla in (Video, Tarea, Conversacion, Gasto):
            s.execute(update(tabla).where(tabla.canal.in_(viejos)).values(canal=slug))


def sincronizar_canales(s: Session):
    """Rehace la tabla canal a partir de canales/ (activos y archivados)."""
    activo = kit_canales.activo()
    filas = [_datos_canal(carpeta_canal(n), n, n == activo, arch) for n, arch in slugs_en_disco()]
    _heredar_slugs_anteriores(s, [c.slug for c in filas])
    s.execute(delete(Canal))
    s.add_all(filas)
    return filas


def sincronizar_todo(s: Session):
    with _candado:
        filas = sincronizar_canales(s)
        slugs = [c.slug for c in filas]
        for slug in slugs:
            sincronizar_videos(s, slug)
        s.execute(delete(Video).where(Video.canal.not_in(slugs)))
        s.commit()
    return len(filas)


def sincronizar_canal(s: Session, slug):
    """Tras un cambio en disco: la lista de canales (barata) y los vídeos de ese canal."""
    with _candado:
        sincronizar_canales(s)
        if carpeta_canal(slug).exists():
            sincronizar_videos(s, slug)
        else:
            s.execute(delete(Video).where(Video.canal == slug))
        s.commit()


def canal_de_ruta(ruta: Path):
    """Slug del canal al que pertenece un archivo de canales/ (o None)."""
    try:
        partes = ruta.resolve().relative_to(kit_canal.CANALES.resolve()).parts
    except ValueError:
        return None
    if not partes:
        return None
    if partes[0] == "_archivo":
        return f"_archivo/{partes[1]}" if len(partes) > 1 else None
    return partes[0]

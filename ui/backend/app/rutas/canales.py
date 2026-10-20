import json
import re
import unicodedata
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, computed_field
from sqlalchemy import select
from sqlalchemy.orm import Session

import archivos  # noqa: E402  (herramientas/)
import canal as kit_canal
import esquema  # noqa: E402

from ..asistente import fase_canal
from ..db import sesion
from ..modelos import Canal
from ..sincronizar import carpeta_canal, sincronizar_todo

router = APIRouter(prefix="/api/canales", tags=["canales"])


class CanalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    slug: str
    nombre: str
    url: str | None
    activo: bool
    archivado: bool
    pendientes: int
    videos: int
    fase_creacion: str | None
    rapido: bool = False
    actualizado: datetime

    @computed_field
    @property
    def creacion(self) -> str | None:
        """La creación a medias dicha para el usuario: «Paso 2 de 11: Concepto» (hallazgo 46), sin letras."""
        return fase_canal(self.fase_creacion)


class CanalDetalle(CanalOut):
    ficha: str | None          # CANAL.md


@router.get("", response_model=list[CanalOut])
def listar(s: Session = Depends(sesion)):
    return s.scalars(select(Canal).order_by(Canal.archivado, Canal.slug)).all()


@router.post("/{slug}/activar", response_model=list[CanalOut])
def activar(slug: str, s: Session = Depends(sesion)):
    """Escribe canal_activo (lo mismo que `canales.py activar`)."""
    if slug not in kit_canal.canales():
        raise HTTPException(404, f"El canal '{slug}' no existe o está archivado")
    archivos.escribir_texto(kit_canal.ACTIVO, slug + "\n")
    sincronizar_todo(s)
    return listar(s)


@router.post("/rapido", response_model=CanalOut, status_code=201)
def crear_rapido(s: Session = Depends(sesion)):
    """Vídeo rápido sin canal (bloque E): crea un canal sin nombre con los valores de fábrica y lo activa (lo mismo que
    `canales.py crear-rapido`). La UI abre después el diálogo de vídeo nuevo sobre él."""
    import canales as kit_canales
    from ..eventos import difusor
    try:
        slug = kit_canales.crear_rapido()
    except SystemExit as e:
        raise HTTPException(500, str(e.code).removeprefix("ERROR: "))
    kit_canal.carpeta.cache_clear()
    sincronizar_todo(s)
    difusor.publicar("cambio", canal=slug)
    return s.get(Canal, slug)


class Conversion(BaseModel):
    nombre: str


@router.post("/{slug}/convertir", response_model=CanalOut)
def convertir(slug: str, datos: Conversion, s: Session = Depends(sesion)):
    """«Convertir en canal» (bloque E): el canal rápido pasa a ser un canal con nombre (lo mismo que `canales.py
    convertir`): carpeta renombrada (los vídeos conservan su id), fichas por rellenar y /nuevo-canal en la fase A, que
    sigue el Asistente. No mientras una tarea o Claude trabajen en ese canal: moverían archivos a medias."""
    import canales as kit_canales
    from ..eventos import difusor
    from ..chat import ASISTENTE
    from ..modelos import Conversacion, Tarea
    from ..tareas import ACTIVAS
    nombre = " ".join(datos.nombre.split())
    if not 2 <= len(nombre) <= 80:
        raise HTTPException(422, "El nombre ha de tener entre 2 y 80 caracteres")
    c = s.get(Canal, slug)
    if not c or c.archivado:
        raise HTTPException(404, f"El canal '{slug}' no existe o está archivado")
    if not c.rapido:
        raise HTTPException(409, "Este canal ya tiene identidad propia: no es un canal rápido")
    if (s.scalars(select(Tarea).where(Tarea.canal == slug, Tarea.estado.in_(ACTIVAS))).first()
            or s.scalars(select(Conversacion).where(Conversacion.canal.in_((slug, ASISTENTE)),
                                                       Conversacion.estado == "pensando")).first()):
        raise HTTPException(409, "Hay una tarea o una conversación con Claude en marcha en este canal: espera a que acabe")
    try:
        nuevo = kit_canales.convertir(slug, nombre)
    except SystemExit as e:
        raise HTTPException(422, str(e.code).removeprefix("ERROR: "))
    kit_canal.carpeta.cache_clear()
    sincronizar_todo(s)
    difusor.publicar("cambio", canal=nuevo)
    return s.get(Canal, nuevo)


class EstructuraOut(BaseModel):
    id: str
    titulo: str
    canal: str | None
    idioma: str | None
    duracion_s: int
    visitas: int
    ratio: float | None
    outlier: bool
    mrv: dict | None


ID_VIDEO = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _carpeta_estructuras(slug):
    if slug not in kit_canal.canales():
        raise HTTPException(404, f"El canal '{slug}' no existe o está archivado")
    return carpeta_canal(slug) / "analisis" / "estructuras"


@router.get("/{slug}/estructuras", response_model=list[EstructuraOut])
def estructuras(slug: str):
    """Vídeos de referencia analizados con estructura_referencia.py (los más recientes primero)."""
    salida = []
    for f in sorted(_carpeta_estructuras(slug).glob("*/metricas.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            m = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        salida.append(EstructuraOut(id=m["id"], titulo=m["titulo"], canal=m.get("canal"), idioma=m.get("idioma"),
                                    duracion_s=m["duracion_s"], visitas=m["visitas"],
                                    ratio=m.get("ratio_visitas_suscriptores"), outlier=bool(m.get("outlier")),
                                    mrv=m.get("mrv")))
    return salida


@router.get("/{slug}/estructuras/{vid}")
def estructura(slug: str, vid: str):
    """El estructura.md de un vídeo de referencia (nunca su transcripción)."""
    if not ID_VIDEO.match(vid):
        raise HTTPException(422, "Id de vídeo no válido")
    f = _carpeta_estructuras(slug) / vid / "estructura.md"
    if not f.exists():
        raise HTTPException(404, "Ese vídeo no está analizado")
    return {"id": vid, "texto": f.read_text(encoding="utf-8")}


class NuevoVideo(BaseModel):
    tipo: str = "largo"                       # largo | short
    tema: str
    referencia: str | None = None             # URL de un vídeo de referencia (se analiza en la fase B)
    duracion: int | None = None               # minutos (solo largo); None = se decide con Claude
    apoya: str | None = None                  # carpeta del vídeo largo al que apoya un Short


def _slug_texto(texto, maximo=40):
    t = unicodedata.normalize("NFKD", texto.lower())
    t = re.sub(r"[^a-z0-9]+", "-", "".join(c for c in t if not unicodedata.combining(c))).strip("-")
    if len(t) > maximo:
        t = t[:maximo].rsplit("-", 1)[0] or t[:maximo]
    return t or "sin-titulo"


def _siguiente_numero(videos, prefijo):
    """Siguiente NNN (o SNNN) de la carpeta de vídeos; los 9xx son de pruebas y no cuentan."""
    usados = [int(m.group(1)) for p in videos.glob(f"{prefijo}[0-9][0-9][0-9]-*")
              if (m := re.match(rf"^{prefijo}(\d{{3}})-", p.name)) and int(m.group(1)) < 900]
    return max(usados, default=0) + 1


@router.post("/{slug}/videos", status_code=201)
def crear_video(slug: str, datos: NuevoVideo, s: Session = Depends(sesion)):
    """Crea la carpeta de un vídeo o Short nuevo con su estado.json (un vídeo largo empieza ya en la fase B: la A se
    comprueba sola). Claude la usa al continuar; el nombre de la carpeta no se cambia después."""
    from ..tareas import URL_YOUTUBE
    if slug not in kit_canal.canales():
        raise HTTPException(404, f"El canal '{slug}' no existe o está archivado")
    if datos.tipo not in ("largo", "short"):
        raise HTTPException(422, "El tipo es «largo» o «short»")
    tema = " ".join(datos.tema.split())
    if not 3 <= len(tema) <= 150:
        raise HTTPException(422, "El tema ha de tener entre 3 y 150 caracteres")
    if datos.referencia and not URL_YOUTUBE.match(datos.referencia.strip()):
        raise HTTPException(422, "La referencia ha de ser la URL de un vídeo de YouTube")
    if datos.duracion is not None and not (datos.tipo == "largo" and 8 <= datos.duracion <= 60):
        raise HTTPException(422, "La duración de un vídeo largo va de 8 a 60 minutos")
    videos = carpeta_canal(slug) / "videos"
    if datos.apoya and not (datos.tipo == "short" and re.match(r"^\d{3}-[a-z0-9-]+$", datos.apoya)
                            and (videos / datos.apoya).is_dir()):
        raise HTTPException(422, "El vídeo al que apoya no existe")
    prefijo = "S" if datos.tipo == "short" else ""
    videos.mkdir(exist_ok=True)
    nombre = f"{prefijo}{_siguiente_numero(videos, prefijo):03d}-{_slug_texto(tema)}"
    carpeta = videos / nombre
    carpeta.mkdir()
    estado = {"fase": "A", "completadas": [], "tipo": datos.tipo, "tema": tema,
              "notas": f"Creado desde la UI el {datetime.now():%Y-%m-%d}. Tema pedido: {tema}.",
              "creado_desde": "UI"}
    if datos.tipo == "largo":
        # La fase A (comprobar cuotas y herramientas) no es un paso del usuario: se da por hecha al crear el vídeo y la
        # pantalla del tema avisa solo si falta algo (docs/ui/auditoria-usuario-profano.md, hallazgo 13).
        ahora = datetime.now().isoformat(timespec="seconds")
        estado.update({"fase": "B", "completadas": ["A"], "pasos_hechos": ["a-cuota"],
                       "historial_fases": [{"de": "A", "a": "B", "fecha": ahora, "desde": "UI (automático)"}]})
    if datos.duracion:
        estado["duracion_objetivo"] = datos.duracion
    if datos.referencia:
        estado["referencia"] = datos.referencia.strip()
    if datos.apoya:
        estado["apoya"] = datos.apoya
    archivos.escribir_json(carpeta / "estado.json", esquema.sellar("estado", estado))
    from ..sincronizar import sincronizar_canal
    sincronizar_canal(s, slug)
    s.commit()
    from ..modelos import Video
    v = s.scalars(select(Video).where(Video.canal == slug, Video.carpeta == nombre)).one()
    return {"id": v.id, "carpeta": nombre, "tipo": datos.tipo}


class CambioCanal(BaseModel):
    nombre: str | None = None
    url: str | None = None


_URL_CANAL = re.compile(r"^https://(www\.)?youtube\.com/(@[\w.-]+|channel/[\w-]+|c/[\w.-]+)/?$")


@router.patch("/{slug}")
def cambiar(slug: str, datos: CambioCanal, s: Session = Depends(sesion)):
    """Lo básico del canal desde la UI (hallazgo 34): el nombre y el enlace de YouTube, en canal.json. Lo demás (voz,
    estilo, reglas) se le pide a Claude desde la página del canal, porque toca varios archivos y fichas."""
    carpeta = carpeta_canal(slug)
    ruta = carpeta / "canal.json"
    if slug not in kit_canal.canales() or not ruta.exists():
        raise HTTPException(404, f"El canal '{slug}' no existe o está archivado")
    cfg = archivos.leer_json(ruta)
    if datos.nombre is not None:
        nombre = " ".join(datos.nombre.split())
        if not 2 <= len(nombre) <= 80:
            raise HTTPException(422, "El nombre ha de tener entre 2 y 80 caracteres")
        cfg["nombre"] = nombre
    if datos.url is not None:
        url = datos.url.strip()
        if url and not _URL_CANAL.match(url):
            raise HTTPException(422, "El enlace ha de ser el de tu canal: https://www.youtube.com/@tucanal")
        cfg["url"] = url or None
    archivos.escribir_json(ruta, cfg)
    from ..eventos import difusor
    from ..sincronizar import sincronizar_canal
    sincronizar_canal(s, slug)
    difusor.publicar("cambio", canal=slug)
    return {"ok": True}


@router.get("/{slug}/papelera")
def ver_papelera(slug: str):
    """Vídeos del canal en la papelera (data/papelera/<canal>/), lo más reciente primero."""
    from .. import gestion
    return gestion.listar(slug)


@router.post("/{slug}/papelera/{nombre}/restaurar")
def restaurar(slug: str, nombre: str, s: Session = Depends(sesion)):
    from .. import gestion
    from ..eventos import difusor
    from ..sincronizar import sincronizar_canal
    if slug not in kit_canal.canales():
        raise HTTPException(404, f"El canal '{slug}' no existe o está archivado")
    try:
        carpeta = gestion.restaurar(slug, nombre, carpeta_canal(slug) / "videos")
    except ValueError as e:
        raise HTTPException(422, str(e))
    sincronizar_canal(s, slug)
    difusor.publicar("cambio", canal=slug)
    return {"carpeta": carpeta}


@router.get("/{slug:path}", response_model=CanalDetalle)
def detalle(slug: str, s: Session = Depends(sesion)):
    c = s.get(Canal, slug)
    if not c:
        raise HTTPException(404, f"El canal '{slug}' no existe")
    ficha = carpeta_canal(slug) / "CANAL.md"
    return CanalDetalle(**CanalOut.model_validate(c).model_dump(),
                        ficha=ficha.read_text(encoding="utf-8") if ficha.exists() else None)

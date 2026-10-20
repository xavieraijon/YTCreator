import asyncio
import re
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi import Path as ParametroRuta
from pydantic import BaseModel, ConfigDict, computed_field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import ai33, chat, diario, fases, firma, gestion, guia, medios, revision, sugerencias
from ..eventos import difusor
from ..db import sesion
from ..modelos import Canal, Video
from ..sincronizar import (NOMBRE_DOCUMENTO, _imagenes_de, _leer_json, _texto_limpio, carpeta_canal, contexto_guia, leer_guion,
                           sincronizar_canal, carpeta_video)

# Id de imagen de un guion («EE-N», «vEE-N» en verticales): llega a rutas de archivo (img/<ident>.png), nunca otra cosa.
Ident = Annotated[str, ParametroRuta(pattern=r"^v?\d{2}-\d{1,3}$")]

router = APIRouter(prefix="/api/videos", tags=["videos"])


class VideoResumen(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    canal: str
    carpeta: str
    tipo: str
    titulo: str | None
    pilar: str | None
    duracion_objetivo: float | None
    fase: str | None
    completadas: list[str]
    aparcado: bool
    escenas_total: int
    palabras: int
    duracion_estimada: float | None
    imagenes_total: int
    imagenes_hechas: int
    imagenes_desactualizadas: int
    tiene_final: bool
    modificado: datetime
    estado_real: dict | None = None          # app/estado_video.py: la única cuenta de dónde está y qué le falta

    @computed_field
    @property
    def fase_nombre(self) -> str | None:
        if self.fase == "cerrado":
            return "Cerrado"
        return dict(fases.de(self.tipo)).get(self.fase or "")


class Fase(BaseModel):
    letra: str
    nombre: str
    estado: str                # hecha | desactualizada | actual | pendiente
    avisos: list[str] = []     # por qué una fase ya hecha ha dejado de estar al día


class EscenaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    numero: int
    capitulo: str | None
    texto: str
    palabras: int
    audio: str | None = None       # voz/NN.wav (ruta relativa al canal)
    tiempos: list[dict] | None = None   # voz/NN.json → "palabras" ([{texto,inicio,fin}]), para el karaoke
    suena_mal: dict | None = None   # {motivo, fecha}, si está en la lista de pendientes de voz (revision_voz.json)


class Medio(BaseModel):
    nombre: str
    ruta: str                      # relativa al canal
    bytes: int
    modificado: float


class Medios(BaseModel):
    videos: list[Medio]
    audio: list[Medio]
    hojas: list[Medio]
    miniaturas: list[Medio]
    subtitulos: list[Medio]
    exportaciones: list[Medio]


class ImagenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ident: str
    escena: int
    origen: str
    prompt: str | None
    fuente: str | None
    ruta: str | None
    existe: bool
    desactualizada: bool
    motor: str
    prompt_final: str | None = None    # el que recibe el modelo (personajes, estilo y paleta)
    en_cola: bool = False              # pagada y esperando en la cola de ai33 (img/ai33_tareas.json)
    revision: dict | None = None       # marca de la UI (revision_imagenes.json): mal / rehecha / bien
    voz: str | None = None             # lo que dice la voz mientras está en pantalla (su tramo entre {img})


class ReferenciaEstilo(BaseModel):
    nombre: str
    ruta: str                      # relativa al canal
    existe: bool


class GuiaManual(BaseModel):
    """Lo necesario para generar las imágenes a mano (Gemini…) igual que las de ai33."""
    referencias: list[ReferenciaEstilo]    # guion.json → "ai33" → "referencias_estilo"
    instruccion: str | None                # la de imagen_ai33.py, para pegar en Gemini con la referencia adjunta primero
    aspecto: str                           # 16:9, 9:16…
    modelo: str


class VideoDetalle(VideoResumen):
    notas: list[str]
    pendiente: dict | None
    extra: dict | None
    documentos: list[str]
    fases: list[Fase]
    escenas: list[EscenaOut]
    imagenes: list[ImagenOut]
    medios: Medios
    palabras_por_minuto: int
    guia: GuiaManual


# Las notas de estado.json son un texto que se va alargando: se parte por " | " (formato antiguo) o por
# frases, y cada fecha "28/09:" abre un apunte nuevo.
_CORTE_NOTAS = re.compile(r" \| |(?<=[.)])\s+(?=\d{1,2}/\d{1,2}\b|[A-ZÁÉÍÓÚÑ¿¡])")


def partir_notas(notas: str | None) -> list[str]:
    return [n.strip() for n in _CORTE_NOTAS.split(notas or "") if n and n.strip()]


def _fases(v: Video):
    if v.estado_real:          # el estado real (guía + contenido de los archivos)
        return [Fase(**f) for f in v.estado_real["fases"]]
    cerrado = v.fase == "cerrado"
    res = []
    for letra, nombre in fases.de(v.tipo):
        if cerrado or letra in v.completadas:
            estado = "hecha"
        elif letra == v.fase:
            estado = "actual"
        else:
            estado = "pendiente"
        res.append(Fase(letra=letra, nombre=nombre, estado=estado))
    return res


@router.get("", response_model=list[VideoResumen])
def listar(canal: str | None = None, en_curso: bool = False, s: Session = Depends(sesion)):
    """Vídeos de un canal (o de todos). en_curso: sin cerrar, sin aparcar y de canales no archivados."""
    q = select(Video).order_by(Video.modificado.desc())
    if canal:
        q = q.where(Video.canal == canal)
    if en_curso:
        activos = select(Canal.slug).where(Canal.archivado.is_(False))
        q = q.where(Video.canal.in_(activos), Video.aparcado.is_(False),
                    (Video.fase.is_(None)) | (Video.fase != "cerrado"))
    return s.scalars(q).all()


def _tras_cambio(s, v):
    """Tras escribir en los archivos de un vídeo: reindexar su canal y avisar a las pantallas (sin esperar al vigilante)."""
    sincronizar_canal(s, v.canal)
    difusor.publicar("cambio", canal=v.canal)


def _video(s, video_id, cargar=False):
    q = select(Video).where(Video.id == video_id)
    if cargar:
        q = q.options(selectinload(Video.escenas), selectinload(Video.imagenes))
    v = s.scalars(q).first()
    if not v:
        raise HTTPException(404, "Ese vídeo no existe")
    return v


# Lo mismo que imagen_ai33.PREFIJO_ESTILO (misma técnica, textura, paleta y luz), pero para pegar en Gemini:
# dice qué adjunto es la referencia (el primero) y que no copie su escena, porque a mano tiende a repetirla.
_ESTILO = ("same painterly editorial technique, same paper grain texture, same limited palette, "
           "same chiaroscuro lighting. Do not copy its scene, characters or composition. New scene: ")
_INSTRUCCION_MANUAL = {
    True: "The first attached image is the style reference. Match exactly its illustration style: " + _ESTILO,
    False: "The first attached images are the style references. Match exactly their illustration style: "
           + _ESTILO.replace("copy its", "copy their"),
}


def _revision(marcas, v, carpeta_v, ident):
    r = revision.estado_de(marcas.get(ident), carpeta_v / "img" / f"{ident}.png")
    if r:       # rutas relativas al canal (las sirve /api/medios)
        r["anteriores"] = [f"videos/{v.carpeta}/{a}" for a in r["anteriores"]]
    return r


def _guia(cfg, completo, carpeta_c):
    import imagen_ai33             # herramientas/ (config.py lo pone en sys.path): misma frase y formatos
    c = firma.config_ai33(cfg, completo)
    refs = [ReferenciaEstilo(nombre=Path(r).name, ruta=r, existe=(carpeta_c / r).exists())
            for r in c.get("referencias_estilo") or []]
    instruccion = None
    if refs:
        instruccion = _INSTRUCCION_MANUAL[len(refs) == 1]
    aspecto = imagen_ai33.ASPECTO.get(completo.get("formato", "horizontal"), "16:9")
    return GuiaManual(referencias=refs, instruccion=instruccion, aspecto=aspecto, modelo=c["modelo"])


def _final(cfg, completo, prompt):
    try:
        return firma.prompt_final(cfg, completo, prompt) if prompt else None
    except (AttributeError, TypeError, KeyError, ValueError):     # guion a medio escribir
        return None


@router.get("/{video_id}", response_model=VideoDetalle)
def detalle(video_id: int, s: Session = Depends(sesion)):
    v = _video(s, video_id, cargar=True)
    datos = VideoResumen.model_validate(v).model_dump()
    carpeta_c = carpeta_canal(v.canal)
    carpeta_v = carpeta_video(v)
    guion = leer_guion(carpeta_v)
    cfg = _leer_json(carpeta_c / "canal.json") or {}
    ppm = cfg.get("palabras_por_minuto") or 150
    completo = firma.completar(cfg, guion)
    import imagen_ai33
    en_cola = set(imagen_ai33.tareas_apuntadas(carpeta_v / "img")) if carpeta_v.exists() else set()
    marcas = revision.leer(carpeta_v)
    from .. import voz as _voz
    revision_voz = _voz.revision(carpeta_v)
    tramos = {}                    # EE-N → texto de la voz de ese tramo (el guion parte la escena con {img})
    for n, e in enumerate(guion.get("escenas") or [], 1):
        for k, tramo in enumerate((e.get("texto") or "").split("{img}"), 1):
            tramos[f"{n:02d}-{k}"] = _texto_limpio(tramo)
    return VideoDetalle(
        **datos,
        notas=partir_notas(v.notas),
        pendiente=v.pendiente,
        extra=v.extra,
        documentos=v.documentos,
        fases=_fases(v),
        escenas=[EscenaOut.model_validate(e).model_copy(
            update={"audio": medios.audio_escena(carpeta_c, carpeta_v, e.numero),   # también de una locución propia ya repartida
                    "tiempos": medios.palabras_escena(carpeta_v, e.numero),
                    "suena_mal": revision_voz.get(str(e.numero))})
            for e in v.escenas],
        imagenes=[ImagenOut.model_validate(i).model_copy(update={"prompt_final": _final(cfg, completo, i.prompt),
                                                                 "en_cola": i.ident in en_cola,
                                                                 "revision": _revision(marcas, v, carpeta_v, i.ident),
                                                                 "voz": tramos.get(i.ident)})
                  for i in v.imagenes],
        medios=Medios(**medios.listar_medios(carpeta_c, carpeta_v, guion)) if carpeta_v.exists()
        else Medios(videos=[], audio=[], hojas=[], miniaturas=[], subtitulos=[]),
        palabras_por_minuto=ppm,
        guia=_guia(cfg, completo, carpeta_c),
    )


class Documento(BaseModel):
    nombre: str
    texto: str


@router.get("/{video_id}/documentos/{nombre}", response_model=Documento)
def documento(video_id: int, nombre: str, s: Session = Depends(sesion)):
    if not NOMBRE_DOCUMENTO.match(nombre):      # solo un .md de la carpeta del vídeo, sin rutas
        raise HTTPException(404, "Documento no permitido")
    v = _video(s, video_id)
    p = carpeta_video(v) / nombre
    if not p.exists():
        raise HTTPException(404, f"{nombre} no existe en este vídeo")
    return Documento(nombre=nombre, texto=p.read_text(encoding="utf-8"))


class TareaAi33(BaseModel):
    ident: str
    tarea: str
    estimado: int | None
    mandada: datetime | None
    minutos: int | None
    estado: str | None          # doing | done | error | ? (sin respuesta)
    progreso: int | None


class ColaAi33(BaseModel):
    modelo: str
    creditos_por_imagen: int
    en_marcha: bool
    por_mandar: list[str]
    previsto_creditos: int
    previsto_euros: float
    apuntadas: list[TareaAi33]


@router.get("/{video_id}/ai33", response_model=ColaAi33)
def cola_ai33(video_id: int, vivo: bool = True, s: Session = Depends(sesion)):
    """Imágenes de pago (ai33) de este vídeo: las que faltan por mandar, coste previsto y su cola (sin gastar)."""
    return ai33.cola(_video(s, video_id, cargar=True), vivo)


class PromptImagen(BaseModel):
    ident: str
    origen: str                    # prompt | imagen | video | reutilizar
    motor: str                     # klein | ai33
    prompt: str | None             # tal cual está en guion.json
    prompt_final: str | None       # el que recibe el modelo: personajes sustituidos, estilo y paleta
    rotulo: str | None
    movimiento: str | None
    fuente: str | None             # la imagen reutilizada, o el archivo propio / clip


class EscenaPrompts(BaseModel):
    numero: int
    capitulo: str | None
    texto: str
    imagenes: list[PromptImagen]


class MiniaturaPrompt(BaseModel):
    numero: int
    texto: str | None
    lado: str | None
    prompt: str | None
    prompt_final: str | None
    fondo: str | None


class Prompts(BaseModel):
    estilo: str | None             # plantilla del canal con la paleta ya puesta ({escena} = el prompt)
    personajes: dict[str, str]
    escenas: list[EscenaPrompts]
    miniaturas: list[MiniaturaPrompt]


@router.get("/{video_id}/prompts", response_model=Prompts)
def prompts(video_id: int, s: Session = Depends(sesion)):
    """Los prompts de guion.json por escenas (leídos del disco), en bruto y tal como los recibe el modelo."""
    v = _video(s, video_id)
    carpeta_c = carpeta_canal(v.canal)
    cfg = _leer_json(carpeta_c / "canal.json") or {}
    guion = leer_guion(carpeta_video(v))
    completo = firma.completar(cfg, guion)

    def final(p):
        return _final(cfg, completo, p)

    escenas = []
    for n, e in enumerate(guion.get("escenas") or [], 1):
        imagenes = []
        for i, d in enumerate(_imagenes_de(e), 1):
            origen = next((k for k in ("video", "imagen", "reutilizar") if k in d), "prompt")
            imagenes.append(PromptImagen(
                ident=f"{n:02d}-{i}", origen=origen, motor="ai33" if d.get("motor") == "ai33" else "klein",
                prompt=d.get("prompt"), prompt_final=final(d.get("prompt")), rotulo=d.get("rotulo"),
                movimiento=d.get("movimiento"), fuente=d.get(origen) if origen != "prompt" else None))
        escenas.append(EscenaPrompts(numero=n, capitulo=e.get("capitulo"), texto=_texto_limpio(e.get("texto")),
                                     imagenes=imagenes))

    minis = guion.get("miniaturas") or ([guion["miniatura"]] if guion.get("miniatura") else [])
    estilo = final("{escena}") if completo.get("estilo") else None
    return Prompts(
        estilo=estilo,
        personajes=completo.get("personajes") or {},
        escenas=escenas,
        miniaturas=[MiniaturaPrompt(numero=k, texto=m.get("texto"), lado=m.get("lado"), prompt=m.get("prompt"),
                                    prompt_final=final(m.get("prompt")), fondo=m.get("fondo"))
                    for k, m in enumerate(minis, 1)],
    )


# --- Guía paso a paso y aprobaciones (app/guia.py) ----------------------------------------------------

def _contexto(s, video_id):
    v = _video(s, video_id, cargar=True)
    return v, contexto_guia(v)


class Archivo(BaseModel):
    archivado: bool


@router.post("/{video_id}/archivar")
def archivar(video_id: int, datos: Archivo, s: Session = Depends(sesion)):
    """Archivar (o recuperar) un vídeo: sigue en su carpeta, pero sale de «en marcha» y se agrupa aparte."""
    v = _video(s, video_id)
    carpeta_v = carpeta_video(v)
    if not (carpeta_v / "estado.json").exists():
        raise HTTPException(404, "A este vídeo le falta su archivo de estado")
    gestion.archivar(carpeta_v, datos.archivado)
    diario.anotar(v, "usuario", "fase", "Has archivado el vídeo" if datos.archivado else "Has recuperado el vídeo del archivo")
    _tras_cambio(s, v)
    return {"ok": True}


def _ocupado(s, v) -> str | None:
    """Qué impide mover el vídeo ahora (una tarea o Claude trabajando en él)."""
    from ..modelos import Tarea
    if s.scalars(select(Tarea).where(Tarea.video_id == v.id, Tarea.estado.in_(("en_cola", "en_curso")))).first():
        return "Hay una tarea en marcha en este vídeo: espera a que termine o párala"
    c = chat.conversacion_de_video(s, v.id)
    if c and c.estado == "pensando":
        return "Claude está trabajando en este vídeo: espera a que termine o páralo"
    return None


@router.delete("/{video_id}")
def a_papelera(video_id: int, s: Session = Depends(sesion)):
    """Mueve el vídeo a la papelera del canal (data/papelera/, recuperable desde la página del canal)."""
    v = _video(s, video_id)
    if motivo := _ocupado(s, v):
        raise HTTPException(409, motivo)
    canal = v.canal
    gestion.a_papelera(canal, carpeta_video(v))
    sincronizar_canal(s, canal)
    difusor.publicar("cambio", canal=canal)
    return {"ok": True}


@router.get("/{video_id}/diario")
def ver_diario(video_id: int, limite: int = 60, s: Session = Depends(sesion)):
    """Qué ha pasado en este vídeo (decisiones, cambios y trabajo de Claude), lo más reciente primero."""
    v = _video(s, video_id)
    return diario.leer(carpeta_video(v), min(max(limite, 1), 200))


@router.get("/{video_id}/guia")
def ver_guia(video_id: int, s: Session = Depends(sesion)):
    """Fases con sus pasos (quién los hace y si están hechos), puntos de aprobación y el siguiente paso."""
    v, ctx = _contexto(s, video_id)
    return guia.construir(v.tipo, ctx)


class Aprobacion(BaseModel):
    punto: str
    comentario: str | None = None


class CambiosPedidos(BaseModel):
    punto: str
    texto: str


def _escribir(s, video_id, accion):
    """Cambia estado.json, reindexa ese canal y avisa a las pantallas; devuelve la guía al día."""
    v, ctx = _contexto(s, video_id)
    ruta = ctx.carpeta / "estado.json"
    if not ruta.exists():
        raise HTTPException(404, "A este vídeo le falta su archivo de estado")
    try:
        accion(ruta, v.tipo)
    except ValueError as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)
    return ver_guia(video_id, s)


def _paso(tipo, punto):
    return next((p.texto for f in guia.de(tipo) for p in f.pasos if p.id == punto), punto)


@router.post("/{video_id}/aprobaciones")
def aprobar(video_id: int, datos: Aprobacion, s: Session = Depends(sesion)):
    r = _escribir(s, video_id, lambda ruta, tipo: guia.aprobar(ruta, tipo, datos.punto, datos.comentario))
    v = _video(s, video_id)
    diario.anotar(v, "usuario", "aprobacion", f"Has aprobado «{_paso(v.tipo, datos.punto)}»", datos.comentario)
    return r


@router.post("/{video_id}/fase/avanzar")
def avanzar_fase(video_id: int, s: Session = Depends(sesion)):
    """Cierra la fase en curso (si no le queda nada pendiente) y pasa a la siguiente."""
    v, ctx = _contexto(s, video_id)
    actual = guia.construir(v.tipo, ctx)
    r = _escribir(s, video_id, lambda ruta, tipo: guia.avanzar(ruta, tipo, actual))
    diario.anotar(v, "usuario", "fase", f"Has pasado de la fase {actual['fase_actual']} a la siguiente")
    return r


@router.delete("/{video_id}/aprobaciones/{punto}")
def retirar_aprobacion(video_id: int, punto: str, s: Session = Depends(sesion)):
    r = _escribir(s, video_id, lambda ruta, tipo: guia.retirar(ruta, tipo, punto))
    v = _video(s, video_id)
    diario.anotar(v, "usuario", "aprobacion", f"Has retirado la aprobación de «{_paso(v.tipo, punto)}»")
    return r


@router.post("/{video_id}/cambios")
def pedir_cambios(video_id: int, datos: CambiosPedidos, s: Session = Depends(sesion)):
    r = _escribir(s, video_id, lambda ruta, tipo: guia.pedir_cambios(ruta, tipo, datos.punto, datos.texto))
    v = _video(s, video_id)
    diario.anotar(v, "usuario", "cambios", f"Has pedido cambios en «{_paso(v.tipo, datos.punto)}»", " ".join(datos.texto.split())[:600])
    return r


# --- Revisión de imágenes (app/revision.py) ---------------------------------------------------------------

class Revision(BaseModel):
    estado: str                    # mal | bien
    motivo: str | None = None
    prompt: str | None = None      # prompt nuevo (del guion, con los {personajes}); None = no se toca
    motor: str | None = None       # klein | ai33; None = no se toca
    etiquetas: list[str] | None = None   # fallos marcados en el modo revisión (anatomía, cantidad…)


@router.post("/{video_id}/imagenes/{ident}/revision")
def revisar_imagen(video_id: int, ident: Ident, datos: Revision, s: Session = Depends(sesion)):
    """Marca una imagen como mal (con el motivo) o bien; opcionalmente cambia su prompt o su servicio en
    guion.json, para rehacerla después con la tarea «rehacer_imagen» o «rehacer_imagen_ai33»."""
    v = _video(s, video_id)
    carpeta = carpeta_video(v)
    try:
        cambios = revision.editar_guion(carpeta / "guion.json", ident, datos.prompt, datos.motor) \
            if datos.prompt is not None or datos.motor is not None else []
        revision.marcar(carpeta, ident, datos.estado, datos.motivo, cambios, datos.etiquetas)
        if datos.estado == "bien" and not cambios:
            # «Está bien» = me quedo con esta imagen tal cual: si se hizo con un prompt anterior al del guion,
            # se deja al día (si no, la UI la daría por «a rehacer» y un lote de ai33 la volvería a pagar).
            revision.dejar_al_dia(carpeta, ident, firma.esperada_de(carpeta_canal(v.canal), carpeta, ident))
    except ValueError as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)
    return {"cambios": cambios}



# --- Modo revisión: corregir y rehacer en lote, y «me quedo con la anterior» ---------------------------

class Lote(BaseModel):
    ids: list[str]


@router.post("/{video_id}/revision/lote/sugerir")
async def sugerir_lote(video_id: int, datos: Lote, s: Session = Depends(sesion)):
    """Claude (director de arte, solo lectura) corrige de una vez los prompts de las imágenes marcadas como mal,
    con sus motivos; coherentes entre sí (≈ 1-3 min). No escribe nada: la UI aplica lo que el usuario acepte."""
    v = _video(s, video_id, cargar=True)
    carpeta_c = carpeta_canal(v.canal)
    carpeta_v = carpeta_video(v)
    marcas = revision.leer(carpeta_v)
    textos = {e.numero: e.texto for e in v.escenas}
    lista = []
    for ident in dict.fromkeys(datos.ids):
        img = next((i for i in v.imagenes if i.ident == ident), None)
        if not img or img.origen != "prompt" or not img.prompt:
            raise HTTPException(422, f"{ident} no se genera desde una descripción (es un archivo propio o reutiliza otra)")
        motivo = (marcas.get(ident) or {}).get("motivo")
        if not motivo:
            raise HTTPException(422, f"{ident} no está marcada como mal con un motivo")
        lista.append({"ident": ident, "prompt": img.prompt, "motivo": motivo, "motor": img.motor,
                      "texto": textos.get(img.escena, "")})
    if not lista:
        raise HTTPException(422, "No hay imágenes que corregir")
    encargo = sugerencias.instrucciones_lote(
        v.canal, v.carpeta, lista, hay_brief=(carpeta_v / "brief_visual.md").exists(),
        hay_ficha=(carpeta_c / "equipo" / "director-arte.md").exists())
    try:
        return await sugerencias.sugerir_lote(f"{video_id}/lote", encargo)
    except sugerencias.ErrorSugerencia as e:
        raise HTTPException(502, str(e))


class CambioLote(BaseModel):
    ident: str
    prompt: str | None = None
    motor: str | None = None


class AplicarLote(BaseModel):
    cambios: list[CambioLote]


@router.get("/{video_id}/revision/propuestas")
def ver_propuestas(video_id: int, s: Session = Depends(sesion)):
    """Prompts corregidos por Claude (tarea «corregir_prompts») que aún valen para el prompt actual."""
    v = _video(s, video_id)
    carpeta = carpeta_video(v)
    return revision.propuestas(carpeta, leer_guion(carpeta))


@router.post("/{video_id}/revision/lote/aplicar")
def aplicar_lote(video_id: int, datos: AplicarLote, s: Session = Depends(sesion)):
    """Escribe en guion.json los prompts y servicios aceptados (las imágenes siguen marcadas como mal y con el
    motivo; el historial apunta qué cambió). Después la UI lanza un rehacer por servicio."""
    v = _video(s, video_id)
    carpeta = carpeta_video(v)
    marcas = revision.leer(carpeta)
    hechos = {}
    try:
        for c in datos.cambios:
            cambios = revision.editar_guion(carpeta / "guion.json", c.ident, c.prompt, c.motor)
            m = marcas.get(c.ident) or {}
            revision.marcar(carpeta, c.ident, "mal", m.get("motivo") or "marcada en el modo revisión", cambios,
                            m.get("etiquetas"))
            hechos[c.ident] = cambios
        revision.quitar_propuestas(carpeta, [c.ident for c in datos.cambios])
    except ValueError as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)
    return {"cambios": hechos}


@router.post("/{video_id}/imagenes/{ident}/restaurar")
def restaurar_anterior(video_id: int, ident: Ident, s: Session = Depends(sesion)):
    """«Me quedo con la anterior»: vuelve a la versión anterior y la deja al día para montar.py."""
    v = _video(s, video_id)
    carpeta = carpeta_video(v)
    try:
        revision.restaurar(carpeta, ident, firma.esperada_de(carpeta_canal(v.canal), carpeta, ident))
    except ValueError as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)
    return {"ok": True}


class PedirSugerencia(BaseModel):
    motivo: str


@router.post("/{video_id}/imagenes/{ident}/sugerir")
async def sugerir_prompt(video_id: int, ident: Ident, datos: PedirSugerencia, s: Session = Depends(sesion)):
    """Claude (como director de arte, solo lectura) mira la imagen y propone un prompt corregido (≈ 30 s)."""
    motivo = " ".join((datos.motivo or "").split())
    if not motivo:
        raise HTTPException(422, "Di primero qué está mal: Claude lo necesita para corregir la descripción")
    v = _video(s, video_id, cargar=True)
    img = next((i for i in v.imagenes if i.ident == ident), None)
    if not img or img.origen != "prompt" or not img.prompt:
        raise HTTPException(422, f"{ident} no se genera desde una descripción (es un archivo propio o reutiliza otra)")
    carpeta_c = carpeta_canal(v.canal)
    carpeta_v = carpeta_video(v)
    escena = next((e for e in v.escenas if e.numero == img.escena), None)
    encargo = sugerencias.instrucciones(
        v.canal, v.carpeta, ident, img.prompt, motivo, img.motor, escena.texto if escena else "",
        hay_brief=(carpeta_v / "brief_visual.md").exists(),
        hay_ficha=(carpeta_c / "equipo" / "director-arte.md").exists())
    try:
        return await sugerencias.sugerir(f"{video_id}/{ident}", encargo)
    except sugerencias.ErrorSugerencia as e:
        raise HTTPException(502, str(e))


# --- Música de fondo con Suno (ai33, DE PAGO el encargo; lo demás gratis) ---------------------------------

class Eleccion(BaseModel):
    n: int


class PromptMusica(BaseModel):
    prompt: str


@router.get("/{video_id}/musica")
def musica_estado(video_id: int, s: Session = Depends(sesion)):
    """Ambientes del guion, su prompt, las versiones encargadas a Suno y cuál se usa al montar (gratis)."""
    from .. import musica
    try:
        return musica.estado(_video(s, video_id))
    except musica.ErrorMusica as e:
        raise HTTPException(422, str(e))


@router.post("/{video_id}/musica/{ambiente}/elegir")
def musica_elegir(video_id: int, ambiente: str, datos: Eleccion, s: Session = Depends(sesion)):
    """La versión que se usa al montar (0 = volver a la música propia del canal)."""
    from .. import musica
    v = _video(s, video_id)
    try:
        musica.elegir(v, ambiente, datos.n)
    except musica.ErrorMusica as e:
        raise HTTPException(422, str(e))
    difusor.publicar("cambio", canal=v.canal)
    return musica.estado(v)


@router.put("/{video_id}/musica/{ambiente}/prompt")
def musica_prompt(video_id: int, ambiente: str, datos: PromptMusica, s: Session = Depends(sesion)):
    """Prompt propio del vídeo para ese ambiente («» = volver al del canal)."""
    from .. import musica
    v = _video(s, video_id)
    try:
        musica.guardar_prompt(v, ambiente, datos.prompt)
    except musica.ErrorMusica as e:
        raise HTTPException(422, str(e))
    difusor.publicar("cambio", canal=v.canal)
    return musica.estado(v)


@router.get("/{video_id}/musica/{ambiente}/propia")
def musica_propia(video_id: int, ambiente: str, picos: int | None = None, s: Session = Depends(sesion)):
    """La música propia del canal para ese ambiente (puede estar fuera de canales/, si es la incluida en el
    kit: no la sirve /api/medios). Con ?picos=N, su onda de amplitud (igual que /api/medios)."""
    from fastapi.responses import FileResponse
    from .. import musica
    try:
        p = musica.propia(_video(s, video_id), ambiente)
    except musica.ErrorMusica as e:
        raise HTTPException(404, str(e))
    if picos:
        try:
            return {"picos": medios.picos(p, picos)}
        except ValueError as e:
            raise HTTPException(500, str(e)) from e
    return FileResponse(p, headers={"Cache-Control": "no-cache"})


async def _recibir(request: Request, parcial: Path, maximo: int, que: str):
    """El archivo tal cual, en el cuerpo de la petición, a `parcial` por trozos (sin cargarlo entero en memoria)."""
    parcial.parent.mkdir(parents=True, exist_ok=True)
    recibidos = 0
    with open(parcial, "wb") as f:
        async for trozo in request.stream():
            recibidos += len(trozo)
            if recibidos > maximo:
                raise HTTPException(413, f"{que} pasa de {maximo // 1024 // 1024} MB: redúcelo y vuelve a subirlo")
            f.write(trozo)
    if not recibidos:
        raise HTTPException(422, f"No ha llegado {que.lower()}")


@router.put("/{video_id}/voz/archivo")
async def subir_locucion(video_id: int, request: Request, nombre: str, s: Session = Depends(sesion)):
    """Locución hecha fuera (el audio, tal cual, en el cuerpo de la petición): queda como la voz del vídeo. Gratis."""
    from .. import voz
    v = _video(s, video_id)
    try:
        ext = voz.comprobar_nombre(nombre)
    except voz.ErrorVoz as e:
        raise HTTPException(422, str(e))
    parcial = carpeta_video(v) / "voz" / f"externa{ext}.part"
    try:
        await _recibir(request, parcial, voz.MAX_LOCUCION, "El audio")
        try:
            datos = await asyncio.to_thread(voz.guardar_externa, v, parcial, ext)
        except voz.ErrorVoz as e:
            raise HTTPException(422, str(e))
    finally:
        parcial.unlink(missing_ok=True)
    _tras_cambio(s, v)
    return datos


@router.put("/{video_id}/imagenes/{ident}/propia")
async def subir_imagen(video_id: int, ident: Ident, request: Request, nombre: str, s: Session = Depends(sesion)):
    """Imagen propia para un hueco del guion: se usa al montar en lugar de generarla. Gratis."""
    from .. import propios
    v = _video(s, video_id)
    try:
        ext = propios.extension(nombre, propios.EXT_IMAGEN)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    parcial = carpeta_video(v) / "img" / "propias" / f"{ident}.subida{ext}"
    try:
        await _recibir(request, parcial, propios.MAX_IMAGEN, "La imagen")
        try:
            datos = await asyncio.to_thread(propios.guardar_imagen, v, ident, parcial)
        except propios.ErrorPropio as e:
            raise HTTPException(422, str(e))
    finally:
        parcial.unlink(missing_ok=True)
    _tras_cambio(s, v)
    return datos


@router.delete("/{video_id}/imagenes/{ident}/propia", status_code=204)
def quitar_imagen(video_id: int, ident: Ident, s: Session = Depends(sesion)):
    """Vuelve a generarla desde su descripción; la propia pasa a img/propias/anteriores/ (no se borra)."""
    from .. import propios
    v = _video(s, video_id)
    try:
        propios.quitar_imagen(v, ident)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)


@router.put("/{video_id}/musica/{ambiente}/propia")
async def subir_musica(video_id: int, ambiente: str, request: Request, nombre: str, s: Session = Depends(sesion)):
    """Música propia del canal para ese ambiente (igualada a −18 LUFS). Gratis."""
    from .. import propios
    v = _video(s, video_id)
    try:
        ext = propios.extension(nombre, propios.EXT_AUDIO)
        propios._ruta_musica(v, ambiente)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    parcial = carpeta_video(v) / "musica" / f"{ambiente}.subida{ext}"
    try:
        await _recibir(request, parcial, propios.MAX_MUSICA, "El audio")
        try:
            datos = await asyncio.to_thread(propios.guardar_musica, v, ambiente, parcial)
        except propios.ErrorPropio as e:
            raise HTTPException(422, str(e))
    finally:
        parcial.unlink(missing_ok=True)
    _tras_cambio(s, v)
    return datos


@router.delete("/{video_id}/musica/{ambiente}/propia", status_code=204)
def quitar_musica(video_id: int, ambiente: str, s: Session = Depends(sesion)):
    """La música propia del canal para ese ambiente pasa a recursos/musica/anteriores/ (no se borra)."""
    from .. import propios
    v = _video(s, video_id)
    try:
        propios.quitar_musica(v, ambiente)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)


@router.put("/{video_id}/video/{ident}/propia")
async def subir_clip(video_id: int, ident: Ident, request: Request, nombre: str, mezclar_audio: bool = False,
                      s: Session = Depends(sesion)):
    """Clip de vídeo propio para un hueco del guion: se usa al montar en lugar de una imagen fija. `mezclar_audio` mezcla
    el sonido propio del clip bajo la voz (si lo trae); si no, se descarta, como hasta ahora. Gratis."""
    from .. import propios
    v = _video(s, video_id)
    try:
        ext = propios.extension(nombre, propios.EXT_VIDEO)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    parcial = carpeta_video(v) / "video" / "propias" / f"{ident}.subida{ext}"
    try:
        await _recibir(request, parcial, propios.MAX_VIDEO, "El vídeo")
        try:
            datos = await asyncio.to_thread(propios.guardar_clip, v, ident, parcial, mezclar_audio)
        except propios.ErrorPropio as e:
            raise HTTPException(422, str(e))
    finally:
        parcial.unlink(missing_ok=True)
    _tras_cambio(s, v)
    return datos


@router.delete("/{video_id}/video/{ident}/propia", status_code=204)
def quitar_clip(video_id: int, ident: Ident, s: Session = Depends(sesion)):
    """Vuelve a generar la imagen desde su descripción; el clip propio pasa a video/propias/anteriores/ (no se borra)."""
    from .. import propios
    v = _video(s, video_id)
    try:
        propios.quitar_clip(v, ident)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)


@router.get("/{video_id}/efectos")
def efectos_estado(video_id: int, s: Session = Depends(sesion)):
    """Marcas {nombre} que usa el guion, en qué escenas, y si hay archivo para cada una (propio del canal, incluido en
    el kit, o ninguno). Gratis."""
    from .. import efectos
    try:
        return efectos.estado(_video(s, video_id))
    except efectos.ErrorEfectos as e:
        raise HTTPException(422, str(e))


@router.get("/{video_id}/efectos/{nombre}")
def efecto_propio(video_id: int, nombre: str, s: Session = Depends(sesion)):
    """El efecto propio del canal (está fuera de canales/: no lo sirve /api/medios)."""
    from fastapi.responses import FileResponse
    from .. import propios
    v = _video(s, video_id)
    try:
        ruta = propios._ruta_efecto(v.canal, nombre)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    if not ruta.exists():
        raise HTTPException(404, f"El canal no tiene un efecto propio «{nombre}»")
    return FileResponse(ruta)


@router.put("/{video_id}/efectos/{nombre}")
async def subir_efecto(video_id: int, nombre: str, request: Request, archivo: str, s: Session = Depends(sesion)):
    """Efecto de sonido propio del canal (recursos/sfx/<nombre>.wav), referenciado en el guion con la marca {nombre}.
    Gratis."""
    from .. import propios
    v = _video(s, video_id)
    try:
        ext = propios.extension(archivo, propios.EXT_AUDIO)
        propios._ruta_efecto(v.canal, nombre)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    parcial = carpeta_canal(v.canal) / "recursos" / "sfx" / f"{nombre}.subida{ext}"
    try:
        await _recibir(request, parcial, propios.MAX_EFECTO, "El audio")
        try:
            datos = await asyncio.to_thread(propios.guardar_efecto, v.canal, nombre, parcial)
        except propios.ErrorPropio as e:
            raise HTTPException(422, str(e))
    finally:
        parcial.unlink(missing_ok=True)
    _tras_cambio(s, v)
    return datos


@router.delete("/{video_id}/efectos/{nombre}", status_code=204)
def quitar_efecto(video_id: int, nombre: str, s: Session = Depends(sesion)):
    """El efecto propio del canal pasa a recursos/sfx/anteriores/ (no se borra)."""
    from .. import propios
    v = _video(s, video_id)
    try:
        propios.quitar_efecto(v.canal, nombre)
    except propios.ErrorPropio as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)


@router.delete("/{video_id}/voz/archivo", status_code=204)
def quitar_locucion(video_id: int, s: Session = Depends(sesion)):
    """Vuelve a la voz del canal; la locución propia pasa a voz/anteriores/ (no se borra)."""
    from .. import voz
    v = _video(s, video_id)
    try:
        voz.quitar_externa(v)
    except voz.ErrorVoz as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)


class Sincronia(BaseModel):
    sincronia: str | None = None        # "exacta", "aproximada" o None (la de por defecto)


@router.get("/{video_id}/voz/sincronia")
def ver_sincronia(video_id: int, s: Session = Depends(sesion)):
    from .. import voz
    return voz.sincronia(_video(s, video_id))


@router.put("/{video_id}/voz/sincronia")
def elegir_sincronia(video_id: int, c: Sincronia, s: Session = Depends(sesion)):
    """Sincronía de la voz de este vídeo. No rehace ni vuelve a pagar voces ya hechas: vale para las próximas."""
    from .. import voz
    v = _video(s, video_id)
    try:
        datos = voz.elegir_sincronia(v, c.sincronia)
    except voz.ErrorVoz as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)
    return datos


class TextoEscena(BaseModel):
    texto: str


@router.put("/{video_id}/escena/{numero}/texto")
def editar_escena(video_id: int, numero: int, c: TextoEscena, s: Session = Depends(sesion)):
    """Corrige el texto de una escena a mano, sin pasar por Claude. Solo el texto: no toca imágenes ni voz;
    rehacer la voz de esa escena es un paso aparte (voz_escena o voz_ai33 con «escena_sola»)."""
    from .. import voz
    v = _video(s, video_id)
    try:
        voz.editar_texto_escena(v, numero, c.texto)
    except voz.ErrorVoz as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)


class SuenaMal(BaseModel):
    motivo: str | None = None      # None (o vacío) = quitarla de la lista de pendientes


@router.put("/{video_id}/voz/escena/{numero}/revision")
def marcar_escena(video_id: int, numero: int, c: SuenaMal, s: Session = Depends(sesion)):
    """Marca una escena como «suena mal» (con el motivo) o la quita de la lista de pendientes de voz. No toca
    el guion ni la voz: solo apunta qué hay que revisar."""
    from .. import voz
    v = _video(s, video_id)
    try:
        if (c.motivo or "").strip():
            voz.marcar_mal(v, numero, c.motivo)
        else:
            voz.desmarcar(v, numero)
    except voz.ErrorVoz as e:
        raise HTTPException(422, str(e))
    _tras_cambio(s, v)


@router.get("/{video_id}/voz")
def voz_prevista(video_id: int, repetir: str = "", escena: int = 0, s: Session = Depends(sesion)):
    """Bloques de voz, cuáles faltan y su coste en ai33 (gratis: no locuta nada). Incluye el coste de probar
    solo el primer bloque que falta. Con `repetir` (escenas), el coste de otra toma de esos bloques ya hechos."""
    from .. import voz
    v = _video(s, video_id)
    try:
        if escena:
            return voz.prevista_escena(v, escena)
        if repetir:
            escenas = voz.escenas_hechas(voz.prevista(v), repetir)
            d = voz.prevista(v, escenas, rehacer=True)
            return {k: d[k] for k in ("creditos", "euros", "caracteres_de_pago")} | \
                   {"escenas": [int(x) for x in escenas.split(",")]}
        datos = voz.prevista(v)
        primero = voz.escenas_pendientes(datos, solo_primero=True)
        datos["prueba"] = voz.prevista(v, primero) if primero else None
        if datos["prueba"]:
            datos["prueba"] = {k: datos["prueba"][k] for k in ("creditos", "euros", "caracteres_de_pago")} | \
                              {"escenas": [int(x) for x in primero.split(",")]}
    except voz.ErrorVoz as e:
        raise HTTPException(422, str(e))
    return datos

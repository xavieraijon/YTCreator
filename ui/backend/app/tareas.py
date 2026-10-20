"""Herramientas del kit lanzadas desde la UI: lista blanca, cola y ejecución.

- Solo herramientas GRATIS de la lista (sin comandos libres ni gasto de ai33; eso llega en la fase 2 con
  confirmación de coste). Cada una se ejecuta como en la terminal: `[nice -n 10] .venv/bin/python
  herramientas/<script>.py …` desde la raíz del kit y con CANAL=<canal del vídeo>.
- Una tarea PESADA a la vez (imágenes, boceto, fotogramas, probar_kit); las ligeras, en paralelo.
- La salida va a data/tareas/<id>.log y al frontend por SSE ({"tipo": "tarea", …}), agrupada cada medio
  segundo para no saturar la cola de eventos. Cancelar = SIGINT al grupo de procesos (como Ctrl+C), y SIGTERM/SIGKILL
  si no termina (procesos.py). El PID se guarda en la tarea: si el backend muere, al arrancar se paran los huérfanos.
- El progreso de las imágenes llega como eventos estructurados (`canal.evento` → «@evento {"tipo": "imagen", "ident":
  "03-2", "estado": "generada"}»), no del texto que se imprime para las personas: cambiar un print no rompe la barra.
"""

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable

from sqlalchemy import select

from . import config, contexto_log, gasto, procesos
from .db import Sesion
from .eventos import difusor
from .modelos import Tarea, Video
from .sincronizar import carpeta_video, sincronizar_canal

import simulacion  # noqa: E402  (herramientas/, en sys.path por config)
import sistema  # noqa: E402


log = logging.getLogger("canalyt.tareas")


def _resincronizar(canal: str):
    with Sesion() as s:
        sincronizar_canal(s, canal)
    difusor.publicar("cambio", canal=canal)

IDS_IMAGEN = re.compile(r"^(v?\d{2}-\d+)(,v?\d{2}-\d+)*$")
# Progreso común a todas las herramientas (2026-10-01): «@progreso 7/18 Escena 7» (paso de un total) o
# «@progreso - Uniendo las escenas» (etapa sin cifra). No se guardan en la salida: solo mueven la barra.
LINEA_PROGRESO = re.compile(r"^@progreso\s+(?:(\d+)/(\d+)|-)\s*(.*)$")
# Eventos estructurados de las herramientas (canal.evento): «@evento {json}». Tampoco van a la salida.
LINEA_EVENTO = re.compile(r"^@evento\s+(.*)$")
URL_YOUTUBE = re.compile(r"^https://(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/)|youtu\.be/)[A-Za-z0-9_-]{11}([&?][\w=&%.-]{0,100})?$")
IDIOMA = re.compile(r"^[a-z]{2}$")
TEXTO_LIBRE = re.compile(r"^[^\n\r\x00]{1,150}$")


class ErrorTarea(ValueError):
    """Petición de tarea no válida (herramienta desconocida, falta el vídeo, argumento raro…)."""


@dataclass
class Herramienta:
    titulo: str
    script: str
    pesada: bool
    necesita_video: bool
    argumentos: Callable[[Path | None, dict], list[str]] = field(default=lambda guion, a: [])
    progreso_imagenes: bool = False
    descripcion: str = ""
    validar: Callable | None = None      # (sesión, vídeo, argumentos): comprobaciones extra antes de encolar
    subtitulo: Callable[[dict], str] | None = None   # añade algo al título de la tarea (p. ej. las imágenes)


def _saturacion(guion, a):
    dato = (a.get("dato") or "").strip()
    amplio = (a.get("amplio") or "").strip()
    if not TEXTO_LIBRE.match(dato):
        raise ErrorTarea("Falta el dato concreto (hasta 150 caracteres)")
    if amplio and not TEXTO_LIBRE.match(amplio):
        raise ErrorTarea("El tema general no es válido (hasta 150 caracteres)")
    return [dato] + (["--amplio", amplio] if amplio else [])


def _estructura(guion, a):
    """Esqueleto de un vídeo de referencia (URL de YouTube) o síntesis de los ya analizados (`sintesis`)."""
    if a.get("sintesis"):
        idioma = (a.get("idioma") or "").strip()
        if idioma and not IDIOMA.match(idioma):
            raise ErrorTarea("Idioma de dos letras (es, en…)")
        return ["--sintesis", "--mostrar"] + (["--idioma", idioma] if idioma else []) + (["--solo-outliers"] if a.get("solo_outliers") else [])
    url = (a.get("url") or "").strip()
    if not URL_YOUTUBE.match(url):
        raise ErrorTarea("Pega la URL de un vídeo de YouTube (https://www.youtube.com/watch?v=…)")
    return [url, "--mostrar"]


def _comparar_referencia(guion, a):
    """Solape de este guion con la transcripción del vídeo de referencia elegido en la fase B (bloque H)."""
    url = (a.get("url") or "").strip()
    if not URL_YOUTUBE.match(url):
        raise ErrorTarea("Este vídeo no tiene un vídeo de referencia válido")
    return ["--comparar", str(guion), url]


def _imagenes(guion, a):
    args = [str(guion), "--solo-imagenes", "--motor", "cloudflare"]
    rehacer = (a.get("rehacer") or "").replace(" ", "")
    if rehacer:
        if not IDS_IMAGEN.match(rehacer):
            raise ErrorTarea("Ids a rehacer con el formato EE-N separados por comas (p. ej. 01-2,03-5)")
        args += ["--rehacer-imagenes", rehacer]
    return args


def _corregir_prompts(guion, a):
    ids = (a.get("ids") or "").replace(" ", "")
    if not ids or not IDS_IMAGEN.match(ids) or "v" in ids:
        raise ErrorTarea("Imágenes con el formato EE-N separadas por comas (p. ej. 14-5,15-1)")
    return [str(guion), "--ids", ids]


def _ids_rehacer(a):
    ids = (a.get("ids") or "").replace(" ", "")
    if not ids or not IDS_IMAGEN.match(ids) or ids.startswith("v"):
        raise ErrorTarea("Imágenes con el formato EE-N separadas por comas (p. ej. 13-2)")
    return ids


def _rehacer_klein(guion, a):
    motor = a.get("motor") or "cloudflare"
    if motor not in ("cloudflare", "local"):
        raise ErrorTarea("Servicio de imágenes gratis no válido")
    return [str(guion), "--solo-imagenes", "--rehacer-imagenes", _ids_rehacer(a), "--solo", "--motor", motor]


def _rehacer_ai33(guion, a):
    return [str(guion), "--solo-ai33", "--gastar-ai33", "--rehacer-imagenes", _ids_rehacer(a), "--solo"]


def _preparar_rehacer(servicio):
    """Antes de encolar: cada imagen debe usar ese servicio en guion.json (la UI lo cambia al elegirlo), se
    quita su semilla si es de klein (si no, saldría igual), y se guarda la actual en img/anteriores/."""
    def validar(s, video, a):
        from . import revision
        if servicio not in ("cloudflare", "local", "ai33"):
            raise ErrorTarea("Servicio de imágenes no válido")
        ids = _ids_rehacer(a).split(",")
        carpeta = carpeta_video(video)
        guion = carpeta / "guion.json"
        motor = "ai33" if servicio == "ai33" else "klein"
        for ident in ids:
            try:
                if revision.motor_de(guion, ident) != motor:
                    raise ErrorTarea(f"{ident} no está configurada para {motor}: elige el servicio al marcarla")
            except ValueError as e:
                raise ErrorTarea(str(e))
        if servicio == "ai33":
            _validar_rehacer_ai33(s, video, a, ids)
        for ident in ids:
            if motor == "klein":
                revision.editar_guion(guion, ident, quitar_semilla=True)
            revision.antes_de_rehacer(carpeta, ident, {"cloudflare": "el servicio gratis", "local": "este ordenador (gratis)",
                                                      "ai33": "el servicio de pago"}[servicio])
    return validar


def _validar_rehacer_ai33(s, video, a, ids):
    from . import ai33
    if not a.get("confirmado") or a.get("previsto") != len(ids):
        raise ErrorTarea("Rehacer de pago: hay que confirmar el coste de esas imágenes")
    activa = s.scalars(select(Tarea).where(Tarea.video_id == video.id,
                                           Tarea.herramienta.in_(("imagenes_ai33", "rehacer_imagen_ai33")),
                                           Tarea.estado.in_(ACTIVAS))).first()
    if activa or ai33.en_marcha(video):
        raise ErrorTarea("Ya hay un lote de imágenes de pago en marcha para este vídeo: espera a que termine")


def _voz_ai33(guion, a):
    escenas = (a.get("escenas") or "").replace(" ", "")
    if not escenas or not re.match(r"^\d{1,3}(,\d{1,3})*$", escenas):
        raise ErrorTarea("Faltan las escenas a locutar")
    if a.get("escena_sola"):                             # otra toma de UNA escena, sin tocar su bloque
        return [str(guion), "--escena-sola", str(int(a["escena_sola"])), "--gastar-ai33"]
    if a.get("rehacer"):                                 # otra toma de bloques ya locutados
        return [str(guion), "--solo-voces", escenas, "--rehacer-voces", escenas, "--gastar-ai33"]
    return [str(guion), "--solo-voces", escenas, "--gastar-ai33"]


def _validar_voz_ai33(s, video, a):
    """DE PAGO: el usuario confirma unos créditos para unas escenas; si el cálculo ha cambiado, no se lanza."""
    from . import voz
    if not a.get("confirmado"):
        raise ErrorTarea("La voz profesional es de pago: hay que confirmar el coste")
    activa = s.scalars(select(Tarea).where(Tarea.video_id == video.id, Tarea.herramienta == "voz_ai33",
                                           Tarea.estado.in_(ACTIVAS))).first()
    if activa:
        raise ErrorTarea("Ya hay una locución de pago en cola o en marcha para este vídeo")
    try:
        if a.get("escena_sola"):
            previsto = voz.prevista_escena(video, int(a["escena_sola"]))
            if previsto["creditos"] != a.get("previsto"):
                raise ErrorTarea(f"El coste ha cambiado ({previsto['creditos']} créditos): vuelve a confirmar")
            a["escenas"] = str(int(a["escena_sola"]))
            return
        datos = voz.prevista(video)
        if a.get("rehacer"):
            escenas = voz.escenas_hechas(datos, str(a["rehacer"]))
        else:
            escenas = voz.escenas_pendientes(datos, solo_primero=bool(a.get("solo_primero")))
            if not escenas:
                raise ErrorTarea("No falta ninguna voz por locutar")
        previsto = voz.prevista(video, escenas, rehacer=bool(a.get("rehacer")))
    except voz.ErrorVoz as e:
        raise ErrorTarea(str(e))
    if previsto["creditos"] != a.get("previsto"):
        raise ErrorTarea(f"El coste ha cambiado ({previsto['creditos']} créditos): vuelve a confirmar")
    a["escenas"] = escenas


def _voz_escena(guion, a):
    """Otra toma de UNA escena de un bloque ya locutado, con la voz del canal (gratis si el canal usa una voz
    gratis; si usa ai33, esta tarea no vale: hay que confirmar el coste con `voz_ai33`)."""
    if not a.get("escena_sola"):
        raise ErrorTarea("Falta la escena a repetir")
    return [str(guion), "--escena-sola", str(int(a["escena_sola"]))]


def _validar_voz_escena(s, video, a):
    from . import voz
    try:
        previsto = voz.prevista_escena(video, int(a.get("escena_sola") or 0))
    except (voz.ErrorVoz, ValueError, TypeError) as e:
        raise ErrorTarea(str(e))
    if previsto.get("creditos"):
        raise ErrorTarea("Esta voz es de pago: confírmala con el botón de la voz profesional")


def _voz_externa(guion, a):
    """Todas las escenas: con "voz_archivo", montar.py las trata como un solo bloque (la locución entera)."""
    import canal as kit_canal
    try:
        n = len(kit_canal.leer_guion(guion)[1]["escenas"])
    except kit_canal.GuionNoValido as e:          # es un SystemExit: en el backend, un error de la petición
        raise ErrorTarea(str(e).removeprefix("ERROR: ")) from None
    return [str(guion), "--solo-voces", ",".join(str(i) for i in range(1, n + 1))]


def _validar_voz_externa(s, video, a):
    from . import voz
    if not voz.externa(video):
        raise ErrorTarea("Este vídeo no tiene una locución propia: súbela antes")


def _validar_ai33(s, video, a):
    """Tarea DE PAGO: el usuario confirma un número de imágenes y un coste; si ha cambiado, no se lanza."""
    from . import ai33
    if not a.get("confirmado"):
        raise ErrorTarea("Las imágenes de calidad son de pago: hay que confirmar el coste")
    if ai33.en_marcha(video):
        raise ErrorTarea("Ya hay un lote de imágenes de pago en marcha para este vídeo")
    activa = s.scalars(select(Tarea).where(Tarea.video_id == video.id, Tarea.herramienta == "imagenes_ai33",
                                           Tarea.estado.in_(ACTIVAS))).first()
    if activa:
        raise ErrorTarea("Ya hay un lote de imágenes de pago en cola o en marcha para este vídeo")
    cola = ai33.cola(video, vivo=False)
    if len(cola["por_mandar"]) != a.get("previsto"):
        raise ErrorTarea(f"El número de imágenes ha cambiado ({len(cola['por_mandar'])}): vuelve a confirmar")
    if not cola["por_mandar"] and not cola["apuntadas"]:
        raise ErrorTarea("No hay imágenes de pago pendientes")


def _musica_ai33(guion, a):
    ambiente = a.get("ambiente") or ""
    if not re.match(r"^[a-z0-9_-]{1,40}$", ambiente):
        raise ErrorTarea("Falta el ambiente de la música")
    return [str(guion), "--encargar", ambiente, "--gastar-ai33"]


def _validar_musica_ai33(s, video, a):
    from . import musica
    activa = s.scalars(select(Tarea).where(Tarea.video_id == video.id, Tarea.herramienta == "musica_ai33",
                                           Tarea.estado.in_(ACTIVAS))).first()
    try:
        musica.validar_encargo(video, a, bool(activa))
    except musica.ErrorMusica as e:
        raise ErrorTarea(str(e))


def _validar_copia(s, video, a):
    """Antes de encolar: que haya carpeta elegida y esté (disco conectado); el error se ve al pulsar, no en el registro."""
    import copia
    from .gasto import leer_ajustes
    try:
        copia.validar_destino((leer_ajustes().get("copia") or {}).get("destino") or "")
    except copia.ErrorCopia as e:
        raise ErrorTarea(str(e))


def _prueba_estilo(a):
    """La prueba de estilo del paso 4 de «Crear el canal»: <canal>/videos/_pruebas/estilo/prueba.json."""
    import canal as kit_canal
    if a.get("canal") not in kit_canal.canales():
        raise ErrorTarea("Falta el canal (o no existe)")
    return kit_canal.CANALES / a["canal"] / "videos" / "_pruebas" / "estilo" / "prueba.json"


def _validar_estilo(s, video, a):
    ruta = _prueba_estilo(a)
    if not ruta.exists():
        raise ErrorTarea("Todavía no hay estilos propuestos: pide primero a Claude que los proponga")
    from . import referencias_estilo
    referencias_estilo.fijar(ruta.parent)      # Claude reescribe la prueba: las referencias reales mandan


def _prueba_voz(a):
    """La prueba de voz del paso 5 de «Crear el canal»: <canal>/videos/_pruebas/voz/prueba.json."""
    import canal as kit_canal
    if a.get("canal") not in kit_canal.canales():
        raise ErrorTarea("Falta el canal (o no existe)")
    return kit_canal.CANALES / a["canal"] / "videos" / "_pruebas" / "voz" / "prueba.json"


def _prueba_marca(a):
    """La prueba de marca del paso 6 de «Crear el canal»: <canal>/videos/_pruebas/marca/prueba.json."""
    import canal as kit_canal
    if a.get("canal") not in kit_canal.canales():
        raise ErrorTarea("Falta el canal (o no existe)")
    return kit_canal.CANALES / a["canal"] / "videos" / "_pruebas" / "marca" / "prueba.json"


def _leer_prueba_marca(a) -> dict:
    import muestras_marca
    try:
        return muestras_marca.leer_prueba(_prueba_marca(a))
    except ValueError:
        raise ErrorTarea("Todavía no hay combinaciones de marca propuestas: pide primero a Claude que las proponga") from None


def _leer_prueba_voz(a) -> dict:
    import muestras_voz
    try:
        return muestras_voz.leer_prueba(_prueba_voz(a))
    except ValueError:
        raise ErrorTarea("Todavía no hay voces propuestas: pide primero a Claude que las proponga") from None


def _validar_voz_canal_ai33(s, video, a):
    """DE PAGO: el párrafo de muestra con UNA voz de ai33; el usuario confirma sus créditos (si cambian, no se lanza)."""
    import muestras_voz
    prueba = _leer_prueba_voz(a)
    v = next((x for x in prueba["voces"] if x["id"] == a.get("voz")), None)
    if not v or muestras_voz.motor(v["voz"]) != "ai33":
        raise ErrorTarea("Esa voz no es de pago o ya no está en la prueba")
    if not a.get("confirmado"):
        raise ErrorTarea("La muestra con esta voz es de pago: hay que confirmar el coste")
    creditos = muestras_voz.coste_ai33(prueba["texto"])
    if creditos != a.get("previsto"):
        raise ErrorTarea(f"El coste ha cambiado ({creditos} créditos): vuelve a confirmar")
    activa = s.scalars(select(Tarea).where(Tarea.canal == a["canal"], Tarea.herramienta == "voz_canal_ai33",
                                           Tarea.estado.in_(ACTIVAS))).first()
    if activa:
        raise ErrorTarea("Ya hay una muestra de pago en cola o en marcha: espera a que termine")


#: Las que gastan créditos de ai33: su coste se apunta al terminar (gasto.apuntar_al_terminar) y cuentan para el tope
#: del vídeo. En «modo sin gasto» se crean igual, pero la herramienta simula sin enviar y no se apunta nada.
DE_PAGO = frozenset({"imagenes_ai33", "rehacer_imagen_ai33", "voz_ai33", "musica_ai33", "voz_canal_ai33"})

HERRAMIENTAS: dict[str, Herramienta] = {
    "cuota": Herramienta("Cuotas", "cuota.py", False, False,
                         descripcion="Cuánto queda de imágenes gratis, voz gratis y saldo de pago"),
    "revisar_guion": Herramienta("Revisar guion", "revisar_guion.py", False, True,
                                 lambda g, a: [str(g)], descripcion="Reglas de voz, duración, ritmo y muletillas de IA"),
    "entonacion": Herramienta("Entonación", "entonacion.py", False, True,
                              lambda g, a: [str(g.parent)], descripcion="Finales que suben, acentos raros y cortes de la voz (gratis)"),
    "saturacion": Herramienta("Saturación", "saturacion.py", False, False, _saturacion,
                              descripcion="Semáforo: si el tema ya está muy contado en YouTube (gratis)"),
    "estructura_referencia": Herramienta("Vídeo de referencia", "estructura_referencia.py", False, False, _estructura,
                                         descripcion="Esqueleto narrativo de un vídeo de referencia sin copiar su texto "
                                                     "(gratis)"),
    "comparar_referencia": Herramienta("Comparar con la referencia", "estructura_referencia.py", False, True,
                                       _comparar_referencia,
                                       descripcion="Solape de secuencias de 5 palabras entre este guion y la "
                                                   "transcripción de la referencia (gratis); avisa si pasa del 3 %"),
    "montar": Herramienta("Montar el vídeo", "montar.py", True, True, lambda g, a: [str(g)],
                          descripcion="Monta el vídeo con subtítulos, miniaturas y textos de publicación. Gratis: "
                                      "no gasta créditos"),
    "corregir_prompts": Herramienta("Claude corrige las descripciones", "corregir_prompts.py", False, True, _corregir_prompts,
                                    subtitulo=lambda a: f"{len((a.get('ids') or '').split(','))} imágenes",
                                    descripcion="Claude (director de arte) corrige las descripciones de las marcadas como "
                                                "mal; gratis (tu suscripción). Deja propuestas para aceptar"),
    "fotogramas": Herramienta("Fotogramas de control", "fotogramas.py", True, True,
                              lambda g, a: [str(g)], descripcion="Un fotograma por imagen del vídeo montado, para revisarlo"),
    "exportar_edicion": Herramienta("Exportar para montar fuera", "exportar_edicion.py", True, True,
                                    lambda g, a: [str(g)],
                                    descripcion="Voz, imágenes, música, efectos y subtítulos en un .zip con línea de "
                                                "tiempo (FCPXML/EDL) para DaVinci Resolve, Final Cut o Premiere. "
                                                "Gratis: no gasta créditos"),
    "boceto": Herramienta("Boceto", "montar.py", True, True, lambda g, a: [str(g), "--boceto"],
                          progreso_imagenes=True, descripcion="Todas las imágenes en baja calidad en este ordenador (sin cuota)"),
    "imagenes": Herramienta("Imágenes gratis", "montar.py", True, True, _imagenes,
                            progreso_imagenes=True,
                            descripcion="Las que faltan o han cambiado; gratis, se para al agotar la cuota"),
    "imagenes_ai33": Herramienta("Imágenes de pago", "montar.py", False, True,
                                 lambda g, a: [str(g), "--solo-ai33", "--gastar-ai33"], progreso_imagenes=True,
                                 descripcion="DE PAGO: las marcadas como de calidad; lentas (esperan en la cola del servicio)",
                                 validar=_validar_ai33),
    "rehacer_imagen": Herramienta("Rehacer gratis", "montar.py", True, True, _rehacer_klein,
                                  progreso_imagenes=True, subtitulo=lambda a: a.get("ids", ""),
                                  descripcion="Solo las imágenes indicadas, gratis (en internet o en este ordenador)",
                                  validar=lambda s, v, a: _preparar_rehacer(a.get("motor") or "cloudflare")(s, v, a)),
    "rehacer_imagen_ai33": Herramienta("Rehacer de pago", "montar.py", False, True, _rehacer_ai33,
                                       progreso_imagenes=True, subtitulo=lambda a: a.get("ids", ""),
                                       descripcion="DE PAGO: solo las imágenes indicadas, con más calidad",
                                       validar=_preparar_rehacer("ai33")),
    "voz_ai33": Herramienta("Voz profesional", "montar.py", False, True, _voz_ai33,
                            subtitulo=lambda a: f"escenas {a.get('escenas', '')}",
                            descripcion="DE PAGO: locuta con la voz del canal los bloques que faltan",
                            validar=_validar_voz_ai33),
    "voz_escena": Herramienta("Rehacer esta escena", "montar.py", False, True, _voz_escena,
                             subtitulo=lambda a: f"escena {a.get('escena_sola', '')}",
                             descripcion="Otra toma de una sola escena con la voz del canal (gratis)",
                             validar=_validar_voz_escena),
    "voz_externa": Herramienta("Preparar la locución propia", "montar.py", False, True, _voz_externa,
                               descripcion="Reparte la locución hecha fuera por escenas, con los tiempos de cada palabra (gratis)",
                               validar=_validar_voz_externa),
    "musica_ai33": Herramienta("Música a medida", "musica_ai33.py", False, True, _musica_ai33,
                               subtitulo=lambda a: f"«{a.get('ambiente', '')}»",
                               descripcion="DE PAGO: encarga un ambiente de música (2 versiones)",
                               validar=_validar_musica_ai33),
    "estilo_canal": Herramienta("Imágenes de los estilos", "laboratorio_estilo.py", True, False,
                                lambda g, a: [str(_prueba_estilo(a)), "--motor", "auto"],
                                validar=_validar_estilo,
                                descripcion="Las mismas escenas con cada estilo propuesto, para elegir el del canal "
                                            "(gratis: en internet o en este ordenador)"),
    "voz_canal": Herramienta("Muestras de las voces", "muestras_voz.py", False, False,
                             lambda g, a: ["hacer", str(_prueba_voz(a))],
                             validar=lambda s, v, a: _leer_prueba_voz(a),
                             descripcion="El párrafo del canal con cada voz gratis propuesta y las muestras oficiales "
                                         "de las de pago (gratis)"),
    "voz_canal_ai33": Herramienta("Muestra de una voz de pago", "muestras_voz.py", False, False,
                                  lambda g, a: ["hacer", str(_prueba_voz(a)), "--solo", str(a["voz"]),
                                                "--gastar-ai33"],
                                  validar=_validar_voz_canal_ai33,
                                  descripcion="DE PAGO: el párrafo del canal con una de las voces de pago"),
    "marca_canal": Herramienta("Muestras de la marca", "muestras_marca.py", False, False,
                               lambda g, a: ["hacer", str(_prueba_marca(a))],
                               validar=lambda s, v, a: _leer_prueba_marca(a),
                               descripcion="Una miniatura de prueba por combinación de tipografía y colores, y la "
                                           "música para escuchar (gratis)"),
    "marca_alta": Herramienta("Avatar y banner del canal", "marca.py", False, False,
                              descripcion="El avatar y el banner del canal con los textos y colores elegidos (gratis)"),
    "copia": Herramienta("Copia de seguridad", "copia.py", True, False, lambda g, a: ["hacer"], validar=_validar_copia,
                         descripcion="Copia el espacio (imágenes, voces, vídeos, datos; sin las claves) a la carpeta elegida"),
    "probar_kit": Herramienta("Comprobar que todo funciona", "probar_kit.py", True, False,
                              descripcion="Prueba rápida de todas las herramientas (con la voz gratis)"),
}

ACTIVAS = ("en_cola", "en_curso")


def carpeta_logs():
    p = Path(os.getenv("CANALYT_TAREAS", config.RAIZ / "data" / "tareas"))
    p.mkdir(parents=True, exist_ok=True)
    return p


def preparar(s, herramienta: str, video_id: int | None, argumentos: dict) -> Tarea:
    """Valida la petición y crea la tarea en cola (sin lanzarla)."""
    h = HERRAMIENTAS.get(herramienta)
    if not h:
        raise ErrorTarea(f"Herramienta no permitida: {herramienta}")
    guion, canal, titulo = None, None, h.titulo
    video = s.get(Video, video_id) if video_id else None
    if h.necesita_video:
        if not video:
            raise ErrorTarea("Esta herramienta necesita un vídeo")
        guion = carpeta_video(video) / "guion.json"
        if not guion.exists():
            raise ErrorTarea("Ese vídeo todavía no tiene guion")
    if h.validar:
        h.validar(s, video, argumentos or {})
    if herramienta in DE_PAGO and video and not simulacion.activa():
        try:
            gasto.comprobar_tope(s, video.id, herramienta, argumentos or {})
        except gasto.ErrorTope as e:
            raise ErrorTarea(str(e)) from None
    if video:
        canal, titulo = video.canal, f"{h.titulo} · «{video.titulo or video.carpeta}»"
    elif (argumentos or {}).get("canal"):     # herramienta de canal sin vídeo (p. ej. un vídeo de referencia)
        import canal as kit_canal
        if argumentos["canal"] not in kit_canal.canales():
            raise ErrorTarea("Ese canal no existe o está archivado")
        canal = argumentos["canal"]
    if h.subtitulo and h.subtitulo(argumentos or {}):
        titulo = f"{h.titulo} {h.subtitulo(argumentos or {})} · {f'«{video.titulo or video.carpeta}»' if video else ''}".rstrip(" ·")
    comando = [*sistema.prioridad_baja(), str(config.PYTHON), str(config.HERRAMIENTAS / h.script),
               *h.argumentos(guion, argumentos or {})]
    t = Tarea(herramienta=herramienta, titulo=titulo, canal=canal, video_id=video.id if video else None,
              argumentos=argumentos or {}, comando=comando, pesada=h.pesada, estado="en_cola",
              creada=datetime.now())
    s.add(t)
    s.commit()
    return t


class Ejecutor:
    """Lanza las tareas en cola: las ligeras en cuanto llegan; las pesadas, de una en una."""

    def __init__(self):
        self._despertar = asyncio.Event()
        self._procesos: dict[int, asyncio.subprocess.Process] = {}
        self._corriendo: dict[int, asyncio.Task] = {}
        self._canceladas: set[int] = set()
        self._fondo: set[asyncio.Task] = set()  # referencias (si no, el recolector puede llevarse la tarea a medias)
        self.al_terminar: list = []            # corrutinas sin argumentos que se lanzan al acabar cada tarea

    def _lanzar(self, corrutina):
        tarea = asyncio.get_running_loop().create_task(corrutina)
        self._fondo.add(tarea)
        tarea.add_done_callback(self._fondo.discard)

    def avisar(self):
        self._despertar.set()

    async def bucle(self, parada: asyncio.Event):
        await asyncio.to_thread(self._marcar_interrumpidas)
        while not parada.is_set():
            for datos in await asyncio.to_thread(self._pendientes_sync):
                difusor.publicar("tarea", id=datos[0], estado="en_curso")
                self._corriendo[datos[0]] = asyncio.create_task(self._ejecutar(*datos))
            espera = asyncio.create_task(self._despertar.wait())
            fin = asyncio.create_task(parada.wait())
            await asyncio.wait({espera, fin}, timeout=5, return_when=asyncio.FIRST_COMPLETED)
            espera.cancel()
            fin.cancel()
            self._despertar.clear()
        # Al parar el backend se paran sus tareas (con esperas cortas: el arranque de uvicorn no espera mucho).
        vivos = list(self._procesos.items())
        self._canceladas.update(tid for tid, _ in vivos)
        await asyncio.gather(*(procesos.parar(p, espera_sigint=2, espera_sigterm=1.5) for _, p in vivos),
                             return_exceptions=True)
        if self._corriendo:
            await asyncio.wait(list(self._corriendo.values()), timeout=2)

    def _marcar_interrumpidas(self):
        """Al arrancar: lo que estaba en curso se cortó con el backend. Si su proceso sigue vivo (el backend murió sin
        poder pararlo), se para ahora: si no, seguiría escribiendo o gastando en paralelo a una tarea nueva."""
        with Sesion() as s:
            for t in s.scalars(select(Tarea).where(Tarea.estado == "en_curso")):
                script = next((c for c in t.comando or [] if c.endswith(".py")), None)   # [nice -n 10] python <script> …
                if script and procesos.parar_huerfano(t.pid, script):
                    log.warning("Tarea %s (%s): su proceso seguía vivo tras el reinicio y se ha parado", t.id, t.titulo)
                t.estado, t.terminada, t.pid = "interrumpida", datetime.now(), None
            s.commit()

    @staticmethod
    def _guardar_pid(tid, pid):
        with Sesion() as s:
            t = s.get(Tarea, tid)
            if t:
                t.pid = pid
                s.commit()

    def _pendientes_sync(self):
        """Marca en curso las tareas que pueden empezar y devuelve sus datos (en un hilo: toca la BD)."""
        with Sesion() as s:
            cola = s.scalars(select(Tarea).where(Tarea.estado == "en_cola").order_by(Tarea.id)).all()
            pesada_en_curso = s.scalars(select(Tarea).where(Tarea.estado == "en_curso",
                                                            Tarea.pesada.is_(True))).first() is not None
            lanzar = []
            for t in cola:
                if t.id in self._corriendo:
                    continue
                if t.pesada:
                    if pesada_en_curso:
                        continue
                    pesada_en_curso = True
                t.estado, t.empezada = "en_curso", datetime.now()
                t.log = str(carpeta_logs() / f"{t.id}.log")
                lanzar.append((t.id, list(t.comando), t.canal, t.herramienta, t.video_id, t.log))
            s.commit()
        return lanzar

    async def _ejecutar(self, tid, comando, canal, herramienta, video_id, ruta_log):
        with contexto_log.con(tarea=tid, video=video_id):     # cada línea del log, con su tarea y su vídeo
            await self._ejecutar_con_contexto(tid, comando, canal, herramienta, video_id, ruta_log)

    async def _ejecutar_con_contexto(self, tid, comando, canal, herramienta, video_id, ruta_log):
        h = HERRAMIENTAS[herramienta]
        # Imágenes: el total son las que esta tarea va a GENERAR (no las 99 del guion, que casi todas se
        # reutilizan) y solo cuentan las líneas «generada» (01/10: «36 de 99» al rehacer las marcadas mal).
        # El boceto sí las genera todas.
        total, todas = None, herramienta == "boceto"
        if h.progreso_imagenes and video_id:
            with Sesion() as s:
                v = s.get(Video, video_id)
                pendiente = lambda i: i.origen == "prompt" and (not i.existe or i.desactualizada)
                if not v:
                    pass
                elif todas:
                    total = v.imagenes_total
                elif herramienta == "imagenes_ai33":
                    total = sum(1 for i in v.imagenes if i.motor == "ai33" and pendiente(i))
                else:
                    ids = set()
                    if "--rehacer-imagenes" in comando:
                        ids = {x for x in comando[comando.index("--rehacer-imagenes") + 1].split(",") if x}
                    if "--solo" in comando:                   # solo esas (rehacer una imagen marcada)
                        total = len(ids)
                    else:                                     # las pendientes de klein + las que se piden
                        pend = {i.ident for i in v.imagenes if i.motor != "ai33" and pendiente(i)}
                        total = len(pend | ids) or None
        entorno = {**os.environ, "PYTHONUNBUFFERED": "1", "CANALYT_PROGRESO": "1"}   # @progreso para la barra
        if canal:
            entorno["CANAL"] = canal
        hechas, ultima, pendientes = set(), "", []
        paso = {"suele": self._suele_tardar(herramienta, video_id)}   # @progreso de la herramienta
        estado, codigo, proc = "error", None, None
        # De pago: se apunta al terminar si su proceso arrancó (ai33 no devuelve lo ya enviado), nunca si simula.
        simulada = herramienta in DE_PAGO and simulacion.activa()
        reloj = contexto_log.Cronometro()        # tiempo por fase, con las etapas de @progreso
        try:
            # limit: una línea sin \n muy larga (barras que reescriben con \r) no debe romper la lectura
            proc = await asyncio.create_subprocess_exec(
                *comando, cwd=config.RAIZ, env=entorno, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT, **sistema.opciones_grupo(baja=True),
                limit=16 * 1024 * 1024)
            self._procesos[tid] = proc
            self._guardar_pid(tid, proc.pid)
            log.info("Tarea %s (%s) en marcha: pid %s", tid, herramienta, proc.pid)
            ultimo_envio = 0.0
            with open(ruta_log, "w", encoding="utf-8") as f:
                async for bruto in proc.stdout:
                    # tqdm y similares reescriben la línea con \r: nos quedamos con el último trozo
                    linea = bruto.decode("utf-8", "replace").rstrip("\n").split("\r")[-1].rstrip()
                    if not linea:
                        continue
                    if (m := LINEA_PROGRESO.match(linea)):
                        paso |= {"etapa": m.group(3).strip()[:120]}
                        reloj.etapa(paso["etapa"])
                        if m.group(1):
                            paso |= {"paso": int(m.group(1)), "pasos": int(m.group(2))}
                        ahora = asyncio.get_running_loop().time()
                        if ahora - ultimo_envio >= 0.3:
                            self._publicar_progreso(tid, pendientes, hechas, total, ultima, paso)
                            pendientes, ultimo_envio = [], ahora
                        continue
                    if (m := LINEA_EVENTO.match(linea)):
                        try:
                            ev = json.loads(m.group(1))
                        except json.JSONDecodeError:
                            ev = {}
                        # el boceto genera todas; lo demás solo cuenta las que se generan de verdad
                        if ev.get("tipo") == "imagen" and ev.get("ident") and (todas or ev.get("estado") == "generada"):
                            hechas.add(str(ev["ident"]))
                        continue
                    f.write(linea + "\n")
                    f.flush()
                    pendientes.append(linea)
                    ultima = linea
                    ahora = asyncio.get_running_loop().time()
                    if ahora - ultimo_envio >= 0.5:
                        self._publicar_progreso(tid, pendientes, hechas, total, ultima, paso)
                        pendientes, ultimo_envio = [], ahora
            codigo = await proc.wait()
            estado = "cancelada" if tid in self._canceladas else ("hecha" if codigo == 0 else "error")
        except Exception as e:           # no se pudo lanzar o falló la lectura de su salida
            log.exception("Tarea %s", tid)
            with open(ruta_log, "a", encoding="utf-8") as f:
                f.write(f"ERROR en la tarea: {e}\n")
            pendientes.append(f"ERROR en la tarea: {e}")
        finally:
            if proc is not None and proc.returncode is None:   # nunca se deja un proceso vivo y sin lector
                codigo = await procesos.parar(proc, espera_sigint=2, espera_sigterm=2)
            self._procesos.pop(tid, None)
            self._corriendo.pop(tid, None)
            self._canceladas.discard(tid)
            tiempos = reloj.resumen()
            if estado == "hecha" and paso.get("pasos"):    # terminada: la barra, llena
                paso["paso"] = paso["pasos"]
            progreso = self._progreso(hechas, total, ultima, paso)
            with Sesion() as s:
                t = s.get(Tarea, tid)
                if t:
                    t.estado, t.codigo, t.terminada, t.progreso, t.pid = estado, codigo, datetime.now(), progreso, None
                    s.commit()
                    if herramienta in DE_PAGO:
                        try:
                            gasto.apuntar_al_terminar(s, t, estado, arranco=proc is not None, simulada=simulada)
                        except Exception:
                            log.exception("No se pudo apuntar el gasto de la tarea %s", tid)
            if canal:           # lo que ha cambiado (voz/ no lo vigila el vigilante): el estado real, al día
                try:
                    await asyncio.to_thread(_resincronizar, canal)
                except Exception:
                    log.exception("No se pudo resincronizar %s tras la tarea %s", canal, tid)
            difusor.publicar("tarea", id=tid, estado=estado, codigo=codigo, lineas=pendientes, progreso=progreso)
            self.avisar()      # quizá había una pesada esperando
            log.info("Tarea %s (%s): %s, código %s. %s", tid, herramienta, estado, codigo, tiempos)
            for aviso in self.al_terminar:     # p. ej. volver a leer las cuotas (una tarea las gasta)
                self._lanzar(aviso())

    @staticmethod
    def _progreso(hechas, total, ultima, paso=None):
        """{texto: última línea, hecho/total: imágenes, paso/pasos/etapa: @progreso, suele: segundos}."""
        p = {"texto": ultima[-200:]} | (paso or {})
        if total:
            p |= {"hecho": min(len(hechas), total), "total": total}
        return p

    @staticmethod
    def _suele_tardar(herramienta, video_id):
        """Mediana de lo que tardaron las últimas veces que salió bien (mejor si es del mismo vídeo)."""
        with Sesion() as s:
            hechas = s.scalars(select(Tarea).where(Tarea.herramienta == herramienta, Tarea.estado == "hecha",
                                                   Tarea.empezada.is_not(None), Tarea.terminada.is_not(None))
                               .order_by(Tarea.id.desc()).limit(20)).all()
        propias = [t for t in hechas if t.video_id == video_id] or hechas
        tiempos = sorted((t.terminada - t.empezada).total_seconds() for t in propias[:5])
        return round(tiempos[len(tiempos) // 2]) if tiempos else None

    def _publicar_progreso(self, tid, lineas, hechas, total, ultima, paso=None):
        progreso = self._progreso(hechas, total, ultima, paso)
        difusor.publicar("tarea", id=tid, estado="en_curso", lineas=lineas, progreso=progreso)
        with Sesion() as s:        # para quien abra la página a mitad
            t = s.get(Tarea, tid)
            if t:
                t.progreso = progreso
                s.commit()

    def cancelar_proceso(self, tid) -> bool:
        """Empieza a parar la tarea (SIGINT → SIGTERM → SIGKILL, procesos.parar); el estado final lo pone _ejecutar."""
        proc = self._procesos.get(tid)
        if not proc or proc.returncode is not None or tid in self._canceladas:
            return False
        self._canceladas.add(tid)
        self._lanzar(procesos.parar(proc))
        return True


ejecutor = Ejecutor()


def leer_log(ruta, max_lineas=400):
    try:
        lineas = Path(ruta).read_text(encoding="utf-8", errors="replace").splitlines()
    except (OSError, TypeError):
        return []
    return lineas[-max_lineas:]

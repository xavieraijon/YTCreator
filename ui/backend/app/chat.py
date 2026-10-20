"""Claude dentro de la UI: una conversación por vídeo con el CLI `claude -p` en tiempo real.

- Usa la sesión de claude.ai (la suscripción del usuario; sin API de pago), desde la raíz del kit: carga
  CLAUDE.md, los agentes y los comandos (/nuevo-video continuar funciona igual que en la terminal), con
  CANAL=<canal del vídeo>. Cada mensaje es un `claude -p … --output-format stream-json`; los siguientes
  continúan la misma sesión con `--resume <session_id>`.
- Permisos: modo `default` explícito (no hereda el modo sin permisos de otra sesión) y lista blanca: leer,
  buscar, editar solo `canales/`, `analisis/` y `tmp/` (nunca código, agentes, ajustes ni `.env`), web, agentes y SOLO las herramientas gratis del kit por Bash. En
  modo -p lo que no está permitido se deniega solo. Todo lo que gasta o es pesado (montar.py, voz, imágenes)
  está prohibido: se lanza desde los botones de la UI, que avisan del coste. Sin MCP (--strict-mcp-config).
- Lo que ve la UI se guarda como "entradas" en data/claude/<id>.jsonl (texto del usuario, texto de Claude,
  herramientas usadas con un resumen, avisos, errores y fin de turno) y se emite por SSE
  ({"tipo": "claude", "conversacion": id, "evento": "entrada" | "delta" | "estado", …}).
- CANALYT_CLAUDE cambia el ejecutable (tests con uno falso). Cancelar = SIGINT al grupo de procesos y SIGTERM/SIGKILL
  si no para (procesos.py). El PID se guarda en la conversación: al arrancar se paran los turnos huérfanos y al cerrar
  el backend se paran los que estén en marcha (si no, Claude seguiría editando archivos sin que nadie lo vea).
"""

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from . import config, diario, procesos

import motor_ia  # noqa: E402  (herramientas/, en sys.path por config)
import sistema  # noqa: E402
from .db import Sesion
from .eventos import difusor
from .modelos import Conversacion, Video
from .sugerencias import ejecutable  # noqa: F401  (se reexporta)

log = logging.getLogger("canalyt.chat")

CARPETA = config.CHATS
MAX_MENSAJE = 20_000
TIEMPO_MAXIMO = 3 * 3600            # un turno largo (un agente escribiendo un guion) cabe de sobra

GRATIS = ["revisar_guion", "saturacion", "entonacion", "cuota", "comparar_guion", "fotogramas", "mercado",
         "estructura_referencia"]
# Edita solo lo de los canales y los análisis del espacio (y tmp/ de las hojas de contactos): nunca el código, los
# agentes, los ajustes ni las claves, aunque se lo pida un texto de una web que haya leído. Las reglas «Edit» valen para
# todas las herramientas que escriben (el CLI ignora las «Write(ruta)»: comprobado el 18/10 con 2.1.302); los vetos
# van también con la ruta absoluta del espacio y del kit (en un espacio aparte `herramientas/`, `.claude/`… son enlaces
# al kit) y mandan sobre lo permitido.
EDITABLES = ["canales", "analisis", "tmp"]
NO_EDITABLES = ["herramientas", ".claude", "data", "plantillas", "recursos", "docs", "ui", "modelos", ".venv"]


def _absoluta(raiz: Path, ruta: str) -> str:
    return f"/{raiz}/{ruta}"                         # «//ruta» = absoluta en las reglas de Claude Code


def _reglas_edicion() -> tuple[list[str], list[str]]:
    raices = list(dict.fromkeys([config.RAIZ, config.KIT]))
    permitidas = [f"Edit(./{c}/**)" for c in EDITABLES]
    vetadas = [f"Edit({r})" for r in [f"./{c}/**" for c in NO_EDITABLES] + ["./CLAUDE.md", "./canal_activo"]
               + [_absoluta(raiz, f"{c}/**") for raiz in raices for c in NO_EDITABLES]]
    claves = ["./.env", "**/.env"] + [_absoluta(raiz, ".env") for raiz in raices]
    vetadas += [f"{h}({r})" for h in ("Read", "Edit") for r in claves]
    return permitidas, vetadas


_EDICION, _VETOS_EDICION = _reglas_edicion()
PERMITIDAS = (["Read", "Glob", "Grep", "WebSearch", "WebFetch", "Task", "Agent", "TodoWrite", "Skill"]
              + _EDICION
              + [f"Bash(.venv/bin/python herramientas/{h}.py:*)" for h in GRATIS]
              + ["Bash(.venv/bin/python herramientas/canales.py lista:*)",
                 "Bash(.venv/bin/python herramientas/canales.py pendientes:*)",
                 "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git add:*)",
                 "Bash(git commit:*)", "Bash(ls:*)"])
PROHIBIDAS = ([f"Bash(.venv/bin/python herramientas/{h}.py:*)"
               for h in ("montar", "gen_voz", "gen_imagen", "imagen_ai33", "motor_local", "gen_musica",
                         "probar_kit", "marca", "laboratorio_estilo")]
              + ["Bash(.venv/bin/python herramientas/muestras_voz.py hacer:*)"]          # locuta: lo lanza la UI
              + ["Bash(git push:*)", "NotebookEdit"] + _VETOS_EDICION)

# El asistente de canal (/nuevo-canal) además crea la carpeta del canal, prueba estilo y marca y busca voces (gratis);
# sigue sin poder gastar créditos ni locutar (las muestras de voz las hace la UI con el botón del paso «Voz»).
EXTRA_ASISTENTE = ["canales", "marca", "laboratorio_estilo", "miniatura", "gen_musica"]
PERMITIDAS_ASISTENTE = PERMITIDAS + [f"Bash(.venv/bin/python herramientas/{h}.py:*)" for h in EXTRA_ASISTENTE
                                     if h != "canales"] + [
    "Bash(.venv/bin/python herramientas/canales.py crear:*)", "Bash(.venv/bin/python herramientas/canales.py activar:*)",
    "Bash(.venv/bin/python herramientas/canales.py renombrar:*)",
    "Bash(.venv/bin/python herramientas/muestras_voz.py buscar:*)",
    "Bash(.venv/bin/python herramientas/muestras_voz.py coste:*)"]
PROHIBIDAS_ASISTENTE = [p for p in PROHIBIDAS if not any(f"/{h}.py" in p for h in EXTRA_ASISTENTE)]
ASISTENTE = "asistente"          # Conversacion.canal de la conversación del asistente (video_id vacío)

NOMBRES_BLOQUEADOS = {"montar", "gen_voz", "imagen_ai33", "gen_imagen"}

_procesos: dict[int, asyncio.subprocess.Process] = {}
_registros: dict[int, dict] = {}        # conversación → lo que el diario necesita al terminar el turno
_cancelados: set[int] = set()
_fondo: set[asyncio.Task] = set()       # referencias a los turnos y paradas en marcha (que el GC no se los lleve)


def _lanzar(corrutina) -> None:
    tarea = asyncio.get_running_loop().create_task(corrutina)
    _fondo.add(tarea)
    tarea.add_done_callback(_fondo.discard)


class ErrorChat(ValueError):
    pass


# --------------------------------------------------------------------------- entradas (lo que ve la UI)

def archivo(conversacion_id: int) -> Path:
    return CARPETA / f"{conversacion_id}.jsonl"


def leer(conversacion_id: int) -> list[dict]:
    try:
        lineas = archivo(conversacion_id).read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    entradas = []
    for l in lineas:
        try:
            entradas.append(json.loads(l))
        except json.JSONDecodeError:
            continue
    return entradas


def _guardar(conversacion_id: int, entrada: dict) -> dict:
    entrada = {"fecha": datetime.now().isoformat(timespec="seconds"), **entrada}
    CARPETA.mkdir(parents=True, exist_ok=True)
    with archivo(conversacion_id).open("a", encoding="utf-8") as f:
        f.write(json.dumps(entrada, ensure_ascii=False) + "\n")
    difusor.publicar("claude", conversacion=conversacion_id, evento="entrada", entrada=entrada)
    return entrada


def _relativa(ruta: str) -> str:
    """La ruta relativa al espacio de trabajo. Se prueba primero tal cual (sin seguir enlaces: en un espacio aparte,
    `CLAUDE.md` o `herramientas/` son enlaces al kit y al resolverlos saldrían del espacio)."""
    p = Path(ruta)
    for candidata in (p, p.resolve() if p.is_absolute() else p):
        try:
            return str(candidata.relative_to(config.RAIZ))
        except (ValueError, OSError):
            continue
    return ruta


def resumir_herramienta(nombre: str, entrada: dict) -> str:
    """Una línea en castellano de lo que hace Claude con cada herramienta."""
    e = entrada or {}
    ruta = _relativa(str(e.get("file_path") or e.get("path") or ""))
    if nombre == "Read":
        return f"Lee {ruta}"
    if nombre == "Write":
        return f"Escribe {ruta}"
    if nombre in ("Edit", "MultiEdit"):
        return f"Edita {ruta}"
    if nombre == "Glob":
        return f"Busca archivos {e.get('pattern', '')}"
    if nombre == "Grep":
        return f"Busca «{e.get('pattern', '')}»" + (f" en {ruta}" if ruta else "")
    if nombre == "Bash":
        return f"Ejecuta {' '.join(str(e.get('command', '')).split())[:160]}"
    if nombre in ("Task", "Agent"):
        agente = e.get("subagent_type") or "agente"
        return f"Encarga a {agente}: {e.get('description', '')}".rstrip(": ")
    if nombre == "WebSearch":
        return f"Busca en la web «{e.get('query', '')}»"
    if nombre == "WebFetch":
        return f"Abre {e.get('url', '')}"
    if nombre == "Skill":
        return f"Usa la skill {e.get('skill', '')}"
    if nombre == "TodoWrite":
        return "Actualiza su lista de pasos"
    return nombre


AGENTES_AMABLES = {
    "narrativa": "Consultando a la responsable de narrativa…", "guionista": "Consultando al guionista…",
    "director-arte": "Consultando al Director de Arte…", "verificador": "Comprobando datos con el verificador…",
    "estratega-youtube": "Consultando al estratega de YouTube…", "asesor-tematico": "Consultando al asesor de la temática…",
}


def frase_amable(nombre: str, entrada: dict) -> str:
    """Lo que ve el usuario mientras trabaja el asistente: sin rutas ni nombres de archivo, solo qué está haciendo."""
    e = entrada or {}
    if nombre in ("Task", "Agent"):
        return AGENTES_AMABLES.get(str(e.get("subagent_type") or ""), "Consultando a un especialista del equipo…")
    if nombre in ("WebSearch", "WebFetch"):
        return "Buscando información en internet…"
    if nombre == "Bash":
        return "Midiendo datos reales de YouTube…"
    if nombre in ("Write", "Edit", "MultiEdit"):
        return "Poniendo por escrito las propuestas…"
    if nombre in ("Read", "Glob", "Grep"):
        return "Repasando lo que ya hemos decidido…"
    if nombre == "Skill":
        return "Aplicando nuestro método de trabajo…"
    return "Trabajando en ello…"


def _texto_resultado(contenido) -> str:
    if isinstance(contenido, list):
        contenido = " ".join(c.get("text", "") for c in contenido if isinstance(c, dict))
    return " ".join(str(contenido or "").split())[:300]


# --------------------------------------------------------------------------- el encargo

# Común a los dos chats (vídeo y asistente). El bloque `opciones` lo pinta la UI como botones (compartido/opciones.ts).
REGLAS_RESPUESTA = """- NADA TÉCNICO: nunca rutas, nombres de archivo, scripts, comandos ni código en lo que le escribes; nunca le pidas que \
ejecute nada en una terminal ni que te pegue su salida. Si algo no lo puedes hacer tú desde aquí, dile qué botón de qué \
pantalla lo hace; si no hay ninguno, dilo sin tecnicismos y propón seguir con lo que sí se puede.
- PREGUNTAS CON OPCIONES: cuando le pidas que elija o confirme algo, termina el mensaje con un bloque así (una opción por \
línea, 2-6, frases cortas tal como las diría él; ★ delante de la que recomiendas):
```opciones
★ Sí, sigue con el nombre
Quiero proponer otros
```
La pantalla lo convierte en botones (él siempre puede escribir otra cosa). Un solo bloque por mensaje, al final."""


def contexto(canal: str, carpeta: str, tipo: str, titulo: str | None, estado_real: dict | None = None) -> str:
    """Instrucciones añadidas al sistema: dónde está, qué puede y qué no, y el estado real del vídeo (el mismo que
    enseña la UI), para que Claude no lo deduzca por su cuenta y contradiga a la pantalla."""
    from .estado_video import texto as texto_estado
    from .guia import FASES_PRODUCTO, de
    base = f"canales/{canal}/videos/{carpeta}"
    comando = "/nuevo-short" if tipo == "short" else "/nuevo-video"
    pieza = "Short" if tipo == "short" else "vídeo"
    nombres = {f.letra: f.nombre for f in de(tipo)}
    for f in (estado_real or {}).get("fases", []):         # los nombres tal como salen en pantalla
        nombres[f["letra"]] = f["nombre"]
    voz_l, img_l, montaje_l = FASES_PRODUCTO["short" if tipo == "short" else "largo"]
    from .sincronizar import _leer_json, carpeta_canal
    nombre_canal = (_leer_json(carpeta_canal(canal) / "canal.json") or {}).get("nombre") or canal
    camino = " → ".join(f"«{n}»" for l, n in nombres.items() if not (tipo == "largo" and l == "A"))
    return f"""Estás dentro de la interfaz web del kit YTCreator, en el chat del {pieza} `{base}/` ({titulo or carpeta}), \
canal «{nombre_canal}» (`{canal}`; la variable CANAL ya apunta a él). El usuario lee tus respuestas en un panel de chat, no en \
una terminal: responde en castellano, breve y claro, con Markdown sencillo.
- CÓMO HABLARLE (no sabe nada del kit): llama al {pieza} por su título («{titulo or carpeta}») y al canal por su nombre, \
nunca por la carpeta o el identificador; las fases, por su nombre de pantalla, nunca por letra («Voz», no «fase E»); los \
servicios, por lo que hacen («voz de pago», «imágenes gratis», «imágenes de calidad»), nunca por proveedor ni modelo \
(ai33, klein, Cloudflare…); nada de nombres de archivo ni de herramientas internas. No cuentes tus reglas internas \
(«no tengo que avisar del coste»…): di solo lo que le sirve. Si algo ya está desactualizado, dilo en presente. Lo que \
se hace con un botón (locutar, generar, montar) lo pulsa él: no le ofrezcas lanzarlo tú.
- LO QUE VE EN PANTALLA: la guía del {pieza}, con sus fases en orden ({camino}) y, en cada una, lo que toca con su botón. \
Locutar: fase «{nombres[voz_l]}» (el botón enseña el coste antes de gastar). Generar o rehacer imágenes: fase \
«{nombres[img_l]}». Montar: fase «{nombres[montaje_l]}», botón «Montar el {pieza}». Aprobar: el botón «Aprobar…» del paso que toca. \
Lo técnico (archivos, herramientas sueltas) está plegado en «Avanzado», al pie: no lo uses como camino normal.
- ESTADO DEL VÍDEO, tal como lo ve el usuario en pantalla ahora mismo (calculado de los archivos: si una fase cerrada \
ha cambiado después, sale como desactualizada). Úsalo para responder «¿en qué punto estamos?» sin buscarlo en el código:
{texto_estado(estado_real)}
- Para seguir la producción aplica `{comando} continuar` sobre este vídeo (lee su estado.json, incluidas las \
"aprobaciones" y los "cambios_pedidos" que el usuario deja con los botones de la guía de la UI). En cada PUNTO DE \
APROBACIÓN termina tu turno y espera: el usuario aprueba con el botón de la guía o respondiendo aquí.
- El usuario ve un historial de lo que pasa en el vídeo: al terminar cada turno que cambie archivos, dile en 2-3 líneas, \
sin jerga, qué has cambiado y por qué (qué avisos has resuelto y cómo, qué has decidido). Sin esa explicación, no entiende \
qué ha pasado.
- Mantén la guía de la UI al día: cuando termines un paso que ella no puede comprobar por archivos (p. ej. proponer \
temas o medir la saturación), añade su id (están en `ui/backend/app/guia.py`) a `"pasos_hechos"` en estado.json, \
conservando los demás campos. Y no mandes al usuario a un botón de aprobar que no esté activo: si no puede, dile que \
responda aquí y anota tú su aprobación en `"aprobaciones"` (`"desde": "chat"`).
- Puedes leer, buscar, editar archivos del proyecto, buscar en la web y usar los agentes del kit.
- Herramientas por Bash: SOLO las gratuitas y escritas exactamente así, desde la raíz y sin `cd` ni rutas \
absolutas: `.venv/bin/python herramientas/<revisar_guion|saturacion|entonacion|cuota|comparar_guion|fotogramas|mercado|estructura_referencia>.py …`; \
también `git status/diff/log/add/commit` (nunca push) y `ls`. Para copiar un archivo, léelo y escríbelo.
- NO puedes gastar créditos ni lanzar trabajos pesados: montar.py, gen_voz.py, imagen_ai33.py y gen_imagen.py están \
bloqueados. Cuando haga falta generar imágenes, locutar o montar, dile al usuario en qué fase de la guía y con qué botón \
(ver «LO QUE VE EN PANTALLA»), con el coste si es de pago, y espera a que te diga que está hecho.
- Si una herramienta se te deniega, no insistas: explica qué necesitabas y ofrece la alternativa.
{REGLAS_RESPUESTA}"""


def contexto_asistente(canal: str | None) -> str:
    return f"""Estás dentro del asistente de la interfaz web del kit YTCreator, que lleva al usuario desde cero: kit → canal → \
primer vídeo → publicar. Aquí te toca la parte del CANAL: aplica `/nuevo-canal` (con `continuar` si ya hay estado en \
`analisis/mercado/nuevo_canal.json` o `canales/<slug>/estado_canal.json`). {'La variable CANAL apunta a `' + canal + '`.' if canal else 'Todavía no hay canal: CANAL no está definida.'} \
El usuario lee tus respuestas en un panel de chat, no en una terminal: responde en castellano, breve y claro, con \
Markdown sencillo y explicando cada paso de forma sencilla.
- En cada PUNTO DE APROBACIÓN termina tu turno y espera; guarda el estado al cerrar cada fase. Enseña muestras reales \
(imágenes, cifras), no descripciones.
- Puedes leer, buscar, editar archivos del proyecto, buscar en la web y usar los agentes del kit.
- Herramientas por Bash: SOLO las escritas exactamente así, desde la raíz y sin `cd` ni rutas absolutas: \
`.venv/bin/python herramientas/<mercado|saturacion|estructura_referencia|cuota|entonacion|marca|laboratorio_estilo|miniatura|gen_musica>.py …` \
y `.venv/bin/python herramientas/canales.py <lista|pendientes|crear|activar|renombrar> …` y \
`.venv/bin/python herramientas/muestras_voz.py <buscar|coste> …` (buscar voces sin gastar); también \
`git status/diff/log/add/commit` (nunca push) y `ls`. Para cambiar el slug de un canal usa `canales.py renombrar <viejo> \
<nuevo> "Nombre"` (nunca `mv`: la interfaz perdería sus vídeos).
- NO puedes gastar créditos ni locutar: gen_voz.py, montar.py, imagen_ai33.py, gen_imagen.py y probar_kit.py están \
bloqueados. Tampoco puedes usar yt-dlp directamente (solo a través de las herramientas permitidas). Las comprobaciones \
que el procedimiento hace con yt-dlp: haz lo que puedas con las herramientas permitidas y la búsqueda \
web, di con claridad qué queda sin comprobar y sigue; nunca le pases comandos para que los ejecute él. Las muestras de voz las \
hace la interfaz (paso «Voz», con su botón; las de pago, tras confirmar el coste).
- Las fases, por su nombre (Mercado, Concepto, Nombre…), nunca por letra.
- No actives el canal hasta la fase K (si viene de un canal rápido convertido, ya está activo: déjalo así). Cuando el canal esté hecho, dile al usuario que vuelva al asistente: el siguiente \
paso es «Producir el primer vídeo».
- Si una herramienta se te deniega, no insistas: explica qué necesitabas y ofrece la alternativa.
{REGLAS_RESPUESTA}"""


def comando(mensaje: str, sesion: str | None, sistema: str, asistente: bool = False) -> list[str]:
    """La orden del CLI, armada por `motor_ia` (modelo y esfuerzo explícitos según el uso)."""
    return motor_ia.proveedor().orden(
        "asistente" if asistente else "produccion", mensaje, salida="stream-json",
        extra=["--verbose", "--include-partial-messages", "--permission-mode", "default", "--strict-mcp-config"],
        sistema=sistema, permitidas=PERMITIDAS_ASISTENTE if asistente else PERMITIDAS,
        vetadas=PROHIBIDAS_ASISTENTE if asistente else PROHIBIDAS, sesion=sesion)


# --------------------------------------------------------------------------- conversaciones

def _publicar_estado(c: Conversacion):
    difusor.publicar("claude", conversacion=c.id, evento="estado", estado=c.estado, video_id=c.video_id)


def accion_actual(conversacion_id: int) -> str | None:
    """Lo último que está haciendo Claude en un turno en marcha (el resumen de su última herramienta)."""
    herr = [e for e in leer(conversacion_id) if e.get("t") == "herramienta" and not e.get("sub")]
    return herr[-1]["resumen"] if herr else None


def accion_amable(conversacion_id: int) -> str | None:
    """Como `accion_actual`, pero en lenguaje llano (sin rutas ni archivos) para el asistente de creación del canal."""
    herr = [e for e in leer(conversacion_id) if e.get("t") == "herramienta" and not e.get("sub")]
    return (herr[-1].get("amable") or "Trabajando en ello…") if herr else None


def conversacion_de_video(s, video_id: int) -> Conversacion | None:
    return s.scalars(select(Conversacion).where(Conversacion.video_id == video_id)
                     .order_by(Conversacion.id.desc())).first()


def nueva(s, v: Video) -> Conversacion:
    ahora = datetime.now()
    c = Conversacion(video_id=v.id, canal=v.canal, titulo=v.titulo or v.carpeta, estado="libre", creada=ahora,
                     actualizada=ahora, turnos=0)
    s.add(c)
    s.commit()
    return c


def conversacion_de_asistente(s) -> Conversacion | None:
    return s.scalars(select(Conversacion).where(Conversacion.video_id.is_(None), Conversacion.canal == ASISTENTE)
                     .order_by(Conversacion.id.desc())).first()


def nueva_asistente(s) -> Conversacion:
    ahora = datetime.now()
    c = Conversacion(video_id=None, canal=ASISTENTE, titulo="Asistente: crear el canal", estado="libre", creada=ahora,
                     actualizada=ahora, turnos=0)
    s.add(c)
    s.commit()
    return c


async def enviar(conversacion_id: int, mensaje: str, canal_forzado: str | None = None) -> None:
    """Guarda el mensaje del usuario y lanza el turno de Claude en segundo plano. `canal_forzado` (solo
    asistente): trabajar sobre ese canal en vez del activo (p. ej. «Pedir otro cambio a Claude» desde la
    ficha de un canal que no es el activo)."""
    mensaje = (mensaje or "").strip()
    if not mensaje:
        raise ErrorChat("Escribe algo para Claude")
    if len(mensaje) > MAX_MENSAJE:
        raise ErrorChat(f"Mensaje demasiado largo (máx. {MAX_MENSAJE} caracteres)")
    with Sesion() as s:
        c = s.get(Conversacion, conversacion_id)
        if not c:
            raise ErrorChat("Esa conversación no existe")
        if c.estado == "pensando" or conversacion_id in _procesos:
            raise ErrorChat("Claude todavía está con el mensaje anterior: espera o páralo")
        asistente = c.video_id is None and c.canal == ASISTENTE
        v = s.get(Video, c.video_id) if c.video_id else None
        if not v and not asistente:
            raise ErrorChat("El vídeo de esta conversación ya no existe")
        c.estado = "pensando"
        c.actualizada = datetime.now()
        s.commit()
        _publicar_estado(c)
        carpeta_v = None
        fase_v = None
        if not asistente:
            from .sincronizar import carpeta_video
            carpeta_v = carpeta_video(v)
            fase_v = v.fase
        if asistente:
            from .asistente import canal_para_chat
            canal = canal_forzado or canal_para_chat()
            args = comando(mensaje, c.sesion, contexto_asistente(canal), asistente=True)
        else:
            args = comando(mensaje, c.sesion, contexto(v.canal, v.carpeta, v.tipo, v.titulo, v.estado_real))
            canal = v.canal
    if carpeta_v is not None:               # el diario compara los documentos del vídeo antes y después del turno
        _registros[conversacion_id] = {"antes": diario.instantanea(carpeta_v), "pedido": mensaje, "carpeta": carpeta_v,
                                       "fase": fase_v, "inicio": datetime.now(), "texto": None}
    _guardar(conversacion_id, {"t": "usuario", "texto": mensaje})
    _lanzar(_turno(conversacion_id, args, canal, asistente_turno=asistente))


async def cancelar(conversacion_id: int) -> bool:
    """Empieza a parar el turno (SIGINT → SIGTERM → SIGKILL); el estado final lo pone _turno."""
    proceso = _procesos.get(conversacion_id)
    if not proceso or proceso.returncode is not None:
        return False
    if conversacion_id not in _cancelados:
        _cancelados.add(conversacion_id)
        _lanzar(procesos.parar(proceso))
    return True


async def parar_todo() -> None:
    """Al cerrar el backend: para los turnos en marcha (con esperas cortas)."""
    vivos = list(_procesos.items())
    _cancelados.update(cid for cid, _ in vivos)
    await asyncio.gather(*(procesos.parar(p, espera_sigint=2, espera_sigterm=1.5) for _, p in vivos),
                         return_exceptions=True)


def _guardar_pid(conversacion_id: int, pid: int | None) -> None:
    with Sesion() as s:
        c = s.get(Conversacion, conversacion_id)
        if c:
            c.pid = pid
            s.commit()


async def _turno(conversacion_id: int, args: list[str], canal: str | None, asistente_turno: bool = False) -> None:
    estado_final, sesion, inicio = "libre", None, datetime.now()
    herramientas: dict[str, str] = {}          # id de tool_use → nombre (para los resultados)
    denegadas: list[str] = []
    proceso = None
    try:
        proceso = await asyncio.create_subprocess_exec(
            *args, cwd=config.RAIZ, stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE, env=motor_ia.entorno({"CANAL": canal} if canal else None),
            **sistema.opciones_grupo(),
            limit=16 * 1024 * 1024)
        _procesos[conversacion_id] = proceso
        _guardar_pid(conversacion_id, proceso.pid)
        # stderr se lee EN PARALELO: si Claude escribe mucho por stderr y nadie lo lee, se bloquean los dos
        lector_error = asyncio.create_task(proceso.stderr.read())
        resultado = None
        async def leer_salida():
            nonlocal sesion, resultado
            async for linea in proceso.stdout:
                try:
                    e = json.loads(linea)
                except json.JSONDecodeError:
                    continue
                sesion = e.get("session_id") or sesion
                resultado = _procesar(conversacion_id, e, herramientas) or resultado
        await asyncio.wait_for(leer_salida(), timeout=TIEMPO_MAXIMO)
        error = (await lector_error).decode(errors="replace").strip()
        codigo = await proceso.wait()
        if conversacion_id in _cancelados:
            _guardar(conversacion_id, {"t": "aviso", "texto": "Parado por ti."})
        elif resultado is None or codigo != 0 or resultado.get("is_error"):
            estado_final = "error"
            detalle = str((resultado or {}).get("result") or "") if (resultado or {}).get("is_error") else ""
            detalle = detalle or error
            exc = motor_ia.clasificar(detalle, codigo)
            motor_ia.registrar_resultado(detalle, "asistente" if asistente_turno else "produccion", error=True, codigo=codigo or 1)
            _guardar(conversacion_id, {"t": "error", "texto": motor_ia.describir(exc) if exc
                                       else (detalle[-500:] or f"Claude terminó con código {codigo}")})
        else:
            motor_ia.registrar_resultado("", "asistente" if asistente_turno else "produccion")
        if resultado is not None:
            if resultado.get("is_error") and conversacion_id not in _cancelados:
                estado_final = "error"
            for d in resultado.get("permission_denials") or []:
                nombre = d.get("tool_name", "")
                denegadas.append(resumir_herramienta(nombre, d.get("tool_input") or {}))
            if denegadas:
                # Lo que intentó, aparte (la UI lo enseña al pasar el ratón): el aviso, sin jerga.
                _guardar(conversacion_id, {"t": "aviso", "texto": "Claude intentó algo que desde aquí no puede hacer; "
                                           "lo resuelve de otra forma o te dice qué botón usar.",
                                           "detalle": "No permitido desde la UI: " + "; ".join(dict.fromkeys(denegadas))})
            _guardar(conversacion_id, {"t": "fin", "segundos": round((resultado.get("duration_ms") or 0) / 1000),
                                       "turnos": resultado.get("num_turns")})
    except asyncio.TimeoutError:
        estado_final = "error"
        motor_ia.anotar("tiempo", "el turno pasó de 3 horas", "produccion")
        _cancelados.add(conversacion_id)
        await procesos.parar(proceso)
        _guardar(conversacion_id, {"t": "error", "texto": "El turno ha pasado de 3 horas y se ha parado."})
    except Exception as e:                      # noqa: BLE001 — que la conversación nunca se quede "pensando"
        log.exception("turno de Claude")
        estado_final = "error"
        _guardar(conversacion_id, {"t": "error", "texto": f"No se pudo hablar con Claude: {e}"})
    finally:
        if proceso is not None and proceso.returncode is None:     # nunca un Claude vivo y sin lector
            await procesos.parar(proceso, espera_sigint=2, espera_sigterm=2)
        _procesos.pop(conversacion_id, None)
        reg = _registros.pop(conversacion_id, None)
        if reg:
            try:
                diario.registrar_turno(reg["carpeta"], reg["pedido"], reg["antes"], reg["fase"], reg["texto"], estado_final,
                                       conversacion_id in _cancelados, round((datetime.now() - reg["inicio"]).total_seconds()))
            except Exception:                    # noqa: BLE001 — el diario nunca debe dejar la conversación colgada
                log.exception("diario")
        _cancelados.discard(conversacion_id)
        with Sesion() as s:
            c = s.get(Conversacion, conversacion_id)
            if c:
                c.estado = estado_final
                c.pid = None
                c.sesion = sesion or c.sesion
                c.turnos = (c.turnos or 0) + 1
                c.actualizada = datetime.now()
                s.commit()
                _publicar_estado(c)
        log.info("turno de Claude %s: %s en %ss", conversacion_id, estado_final, (datetime.now() - inicio).seconds)


def _procesar(conversacion_id: int, e: dict, herramientas: dict) -> dict | None:
    """Traduce un evento del stream a entradas de la UI. Devuelve el evento `result` si lo es."""
    tipo = e.get("type")
    sub = e.get("parent_tool_use_id") is not None          # dentro de un agente
    if tipo == "stream_event" and not sub:
        ev = e.get("event") or {}
        delta = ev.get("delta") or {}
        if ev.get("type") == "content_block_delta" and delta.get("type") == "text_delta":
            difusor.publicar("claude", conversacion=conversacion_id, evento="delta", texto=delta.get("text", ""))
        return None
    if tipo == "assistant":
        for bloque in (e.get("message") or {}).get("content") or []:
            if bloque.get("type") == "text" and bloque.get("text", "").strip() and not sub:
                _guardar(conversacion_id, {"t": "texto", "texto": bloque["text"]})
                if conversacion_id in _registros:
                    _registros[conversacion_id]["texto"] = bloque["text"]
            elif bloque.get("type") == "tool_use":
                herramientas[bloque.get("id")] = bloque.get("name", "")
                _guardar(conversacion_id, {"t": "herramienta", "id": bloque.get("id"), "sub": sub,
                                           "nombre": bloque.get("name"),
                                           "resumen": resumir_herramienta(bloque.get("name", ""), bloque.get("input") or {}),
                                           "amable": frase_amable(bloque.get("name", ""), bloque.get("input") or {})})
        return None
    if tipo == "user":
        for bloque in (e.get("message") or {}).get("content") or []:
            if isinstance(bloque, dict) and bloque.get("type") == "tool_result" and bloque.get("is_error"):
                texto = _texto_resultado(bloque.get("content"))
                _guardar(conversacion_id, {"t": "fallo", "id": bloque.get("tool_use_id"), "sub": sub,
                                           "texto": texto})
        return None
    if tipo == "result":
        return e
    return None


def reparar() -> None:
    """Al arrancar: las conversaciones que se quedaron «pensando» (el servidor se paró a medias) quedan libres."""
    with Sesion() as s:
        colgadas = s.scalars(select(Conversacion).where(Conversacion.estado == "pensando")).all()
        firma = Path(motor_ia.ejecutable()).name
        for c in colgadas:
            if procesos.parar_huerfano(c.pid, firma):
                log.warning("Conversación %s: Claude seguía trabajando tras el reinicio y se ha parado", c.id)
            c.estado, c.pid = "libre", None
            _guardar(c.id, {"t": "aviso", "texto": "El servidor se reinició mientras Claude trabajaba: su último "
                                                   "turno quedó a medias. Pídele que continúe."})
        s.commit()

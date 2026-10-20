"""Fases A y B con pantallas propias en la UI (piloto de la interfaz guiada). Aquí, lo que hacen sin chat:

- Fase A: comprobar el kit y dejar pasar a la B (`continuar_a`).
- Fase B: Claude (en segundo plano, solo para proponer) escribe `propuestas.json`; la UI MIDE cada propuesta con
  `saturacion.py` (el semáforo sale de la herramienta, no de Claude) en `propuestas_medidas.json`; el usuario elige
  enfoque y duración con un clic (`elegir`), que equivale a aprobar `b-aprobar` y pasa a la fase C.
- Shorts: la elección del enfoque es su fase A (`FASE_ENFOQUE`), con el mismo mecanismo y sin duración (un Short dura
  30-55 s); elegir aprueba `sa-aprobar` y pasa a la B (guion), que sigue con los tramos de app/tramos.py.
El estado sigue en estado.json y los archivos de la carpeta del vídeo: Claude y la guía antigua lo leen igual."""

import asyncio
import re
import json
import logging
import math
from pathlib import Path

from . import config
from .guia import _ahora, _guardar, _leer

log = logging.getLogger("canalyt.fases_ui")

SEMAFOROS = {"VERDE": "verde", "ÁMBAR": "ambar", "AMBAR": "ambar", "ROJO": "rojo", "GRIS": "gris"}
DURACIONES = (10, 12, 14)
IMAGENES_POR_DIA = 90           # klein por Cloudflare (CLAUDE.md → Cuotas)
CREDITOS_POR_PALABRA = 6.4      # ≈ 5,6 caracteres por palabra + 15 % de las marcas de emoción (medido con el 001)
CAMPOS_PROPUESTA = ("titulo", "pilar", "enfoque", "gancho", "porque", "dato", "amplio", "en")
MAX_PROPUESTAS = 8
FASE_ENFOQUE = {"largo": "B", "short": "A"}     # fase en la que se elige el enfoque

_midiendo: set[tuple[int, int]] = set()          # (video_id, id de propuesta) en marcha
_tareas: set[asyncio.Task] = set()


# --------------------------------------------------------------------------- fase A

def continuar_a(ruta: Path, desde: str = "UI"):
    """Cierra la fase A y pasa a la B (la guía antigua lo haría con «Pasar a la fase B»)."""
    estado = _leer(ruta)
    if estado.get("fase") != "A":
        raise ValueError("Este vídeo no está en la fase A")
    estado["completadas"] = list(dict.fromkeys((estado.get("completadas") or []) + ["A"]))
    estado["fase"] = "B"
    estado["pasos_hechos"] = list(dict.fromkeys((estado.get("pasos_hechos") or []) + ["a-cuota"]))
    estado.setdefault("historial_fases", []).append({"de": "A", "a": "B", "fecha": _ahora(), "desde": desde})
    _guardar(ruta, estado)


# --------------------------------------------------------------------------- fase B: leer

def _mayuscula(texto: str) -> str:
    """Las frases que se enseñan empiezan en mayúscula aunque Claude las dé en minúscula («el fenómeno…»)."""
    return texto[:1].upper() + texto[1:] if texto else texto


def _texto(valor, maximo=400):
    return " ".join(str(valor or "").split())[:maximo]


def leer_propuestas(carpeta: Path) -> tuple[list[dict], str | None]:
    """(propuestas limpias, error). Claude escribe el archivo: se acepta solo el formato esperado."""
    ruta = carpeta / "propuestas.json"
    if not ruta.exists():
        return [], None
    try:
        crudo = json.loads(ruta.read_text(encoding="utf-8"))
        lista = crudo["propuestas"] if isinstance(crudo, dict) else crudo
        assert isinstance(lista, list) and lista
    except (OSError, ValueError, KeyError, AssertionError):
        return [], "Claude dejó un archivo de propuestas que no se puede leer."
    salida = []
    for i, p in enumerate(lista[:MAX_PROPUESTAS], 1):
        if not isinstance(p, dict) or not _texto(p.get("titulo")):
            continue
        # Solo las frases que se leen; pilar y búsquedas se usan como claves y consultas tal cual.
        limpia = {c: _mayuscula(_texto(p.get(c))) if c in ("titulo", "enfoque", "gancho", "porque") else _texto(p.get(c))
                  for c in CAMPOS_PROPUESTA}
        limpia["id"] = int(p["id"]) if str(p.get("id", "")).isdigit() else i
        limpia["recomendada"] = bool(p.get("recomendada"))
        salida.append(limpia)
    if not salida:
        return [], "Claude no dejó ninguna propuesta válida."
    if not any(p["recomendada"] for p in salida):
        salida[0]["recomendada"] = True
    return salida, None


def leer_medidas(carpeta: Path) -> dict:
    try:
        return json.loads((carpeta / "propuestas_medidas.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def duraciones(cfg: dict) -> list[dict]:
    res = []
    for m in DURACIONES:
        d = (cfg.get("duraciones") or {}).get(str(m)) or {}
        palabras = sum(d.get("palabras") or [0, 0]) // 2 or round(m * (cfg.get("palabras_por_minuto") or 170))
        imagenes = d.get("imagenes") or round(m * 9.5)
        res.append({"minutos": m, "palabras": palabras, "imagenes": imagenes,
                    "dias_imagenes": max(1, math.ceil(imagenes / IMAGENES_POR_DIA)),
                    "creditos_voz": round(palabras * CREDITOS_POR_PALABRA, -2), "recomendada": m == 10})
    return res


def estado_b(video_id: int, carpeta: Path, cfg: dict, estado: dict, tipo: str = "largo") -> dict:
    propuestas, error = leer_propuestas(carpeta)
    medidas = leer_medidas(carpeta)
    for p in propuestas:
        m = medidas.get(str(p["id"]))
        p["medida"] = {**m, "motivo": _llano(m.get("motivo") or "")} if m and m.get("dato") == p["dato"] else None
        p["midiendo"] = (video_id, p["id"]) in _midiendo
    elegida = estado.get("propuesta_elegida")
    short = tipo == "short"
    return {"tipo": tipo, "apoya": estado.get("apoya") if short else None,
            "tema": estado.get("tema"), "referencia": estado.get("referencia"), "propuestas": propuestas,
            "error": error, "duraciones": [] if short else duraciones(cfg),
            "elegido": {"propuesta": elegida, "minutos": estado.get("duracion_objetivo")} if elegida else None,
            "por_medir": [p["id"] for p in propuestas if p["dato"] and not p["medida"] and not p["midiendo"]]}


# --------------------------------------------------------------------------- fase B: pedir a Claude

ESQUEMA = """{"propuestas": [
  {"id": 1, "titulo": "título del vídeo (fórmula del canal)", "pilar": "historia|naturaleza|universo|ciencia",
   "enfoque": "el ángulo en una frase", "gancho": "la primera frase del vídeo",
   "porque": "por qué funcionará, en una frase para alguien que no conoce el kit y sin jerga",
   "recomendada": true,
   "dato": "cómo buscaría la gente el dato concreto, en castellano",
   "amplio": "el tema general del que cuelga", "en": "la misma búsqueda en inglés (opcional)"}
]}"""


def mensaje_proponer(canal: str, carpeta: str, estado: dict, otros: bool) -> str:
    base = f"canales/{canal}/videos/{carpeta}"
    tema = estado.get("tema")
    n = "3 enfoques distintos de ese tema" if tema else "5 temas"
    return f"""MODO UI · fase B, paso «proponer». No me hables ni pidas aprobación: el usuario lo verá en pantalla.
Vídeo: {base}/ · tema pedido: {('«' + tema + '»') if tema else '(ninguno: propón temas del banco de ideas y nuevos)'}.
1. Lee CLAUDE.md, canales/{canal}/CANAL.md, docs/concepto.md, docs/historial.md y docs/ideas.md del canal (no repitas \
temas ya hechos).
2. Propón {n}, siguiendo la fase B de .claude/commands/nuevo-video.md (pilar, enfoque, título con una fórmula del canal, \
gancho y por qué puede funcionar; debe cumplir la promesa del canal).{' Hay un vídeo de referencia: ' + estado['referencia'] + ' (lanza herramientas/estructura_referencia.py con esa URL y úsala).' if estado.get('referencia') else ''}
3. Escribe SOLO el archivo {base}/propuestas.json con este formato exacto (sin comentarios):
{ESQUEMA}
Marca UNA como recomendada. NO midas la saturación ni pongas semáforos: la interfaz los mide con tus campos \
«dato», «amplio» y «en».{' Ya propusiste otras (están en propuestas.json): propón distintas y sobrescribe el archivo.' if otros else ''}
4. Termina con 2-3 líneas para el usuario, sin jerga: qué has propuesto y por qué (las verá en el historial del vídeo)."""


def mensaje_proponer_short(canal: str, carpeta: str, estado: dict, otros: bool) -> str:
    """Fase A de .claude/commands/nuevo-short.md: 3 enfoques con gancho corto y el dato del vídeo largo en el que se apoyan."""
    base = f"canales/{canal}/videos/{carpeta}"
    apoya = estado.get("apoya")
    largo = (f"Vídeo largo al que apoya: canales/{canal}/videos/{apoya}/ (lee su guion.md y su fuentes.md: el dato de cada "
             "enfoque sale de ahí, ya verificado)." if apoya else
             "Este Short NO tiene vídeo largo detrás (va contra el concepto del canal): propón igualmente, apoyándote en "
             "datos que puedas verificar, y di en «porque» de cada propuesta que convendría tener antes el vídeo largo.")
    return f"""MODO UI · Short, fase A, paso «proponer». No me hables ni pidas aprobación: el usuario lo verá en pantalla.
Short: {base}/ (la carpeta ya existe: no crees otra) · tema pedido: «{estado.get('tema') or '—'}».
{largo}
1. Lee CLAUDE.md, canales/{canal}/CANAL.md, canal.json, docs/concepto.md y docs/historial.md del canal.
2. Propón 3 enfoques siguiendo la fase A de .claude/commands/nuevo-short.md: cada uno con su gancho de 10 palabras o \
menos y el dato concreto en el que se apoya. «titulo» = título del Short (40 caracteres o menos); «pilar» = el del vídeo largo.
3. Escribe SOLO el archivo {base}/propuestas.json con este formato exacto (sin comentarios):
{ESQUEMA}
Marca UNA como recomendada. NO midas la saturación ni pongas semáforos: la interfaz los mide con tus campos \
«dato», «amplio» y «en».{' Ya propusiste otras (están en propuestas.json): propón distintas y sobrescribe el archivo.' if otros else ''}
4. Termina con 2-3 líneas para el usuario, sin jerga: qué has propuesto y por qué (las verá en el historial del vídeo)."""


# --------------------------------------------------------------------------- fase B: medir

def _llano(motivo: str) -> str:
    """Medidas guardadas antes de `motivo_llano` (hallazgo 45): sin las palabras de la herramienta. Solo si las tiene."""
    if not re.search(r"\bclon|ráfaga|tema amplio", motivo):
        return motivo
    for viejo, nuevo in (("clones", "vídeos casi iguales"), ("clon", "vídeo casi igual"), ("ráfaga reciente", "vídeos recientes"),
                         ("ráfaga en curso", "lo está contando mucha gente"), ("el tema amplio", "el tema en general"),
                         ("hueco", "hay hueco")):
        motivo = motivo.replace(viejo, nuevo)
    return motivo[:1].upper() + motivo[1:]


def _mapear(salida: dict, dato: str) -> dict:
    c = salida.get("concreto") or {}
    a = salida.get("amplio") or {}
    maximo = a.get("maximo") or c.get("maximo") or 0
    grandes = a.get("grandes", 0)
    demanda = "alta" if (grandes >= 5 or maximo >= 1_000_000) else "media" if (grandes >= 2 or maximo >= 100_000) else "baja"
    return {"dato": dato, "semaforo": SEMAFOROS.get(str(salida.get("semaforo", "")).upper(), "gris"),
            "motivo": salida.get("motivo_llano") or _llano(salida.get("motivo") or ""), "clones": c.get("n_clones", 0), "recientes": c.get("recientes", 0),
            "perennes": c.get("perennes", 0), "mediana": c.get("mediana", 0), "demanda": demanda,
            "en_ingles": (salida.get("en") or {}).get("n_clones"), "fecha": _ahora()}


async def _medir_una(video_id: int, carpeta: Path, p: dict, bloqueo: asyncio.Lock):
    args = [str(config.PYTHON), str(config.HERRAMIENTAS / "saturacion.py"), p["dato"], "--json"]
    if p["amplio"]:
        args += ["--amplio", p["amplio"]]
    if p["en"]:
        args += ["--en", p["en"]]
    try:
        proc = await asyncio.create_subprocess_exec(*args, cwd=config.RAIZ, stdout=asyncio.subprocess.PIPE,
                                                    stderr=asyncio.subprocess.PIPE)
        fuera, errores = await asyncio.wait_for(proc.communicate(), timeout=360)
        if proc.returncode != 0:                # el motivo (p. ej. «yt-dlp falló… ¿sin conexión?»), al log
            ultima = errores.decode("utf-8", "replace").strip().splitlines()
            raise RuntimeError(ultima[-1] if ultima else f"saturacion.py salió con {proc.returncode}")
        medida = _mapear(json.loads(fuera), p["dato"])
    except Exception as e:                      # noqa: BLE001 — una propuesta sin medir no debe tumbar a las demás
        log.warning("no se pudo medir «%s»: %s", p["dato"], e)
        medida = {"dato": p["dato"], "semaforo": "gris", "motivo": "No se pudo medir ahora. Vuelve a intentarlo.",
                  "clones": 0, "recientes": 0, "perennes": 0, "mediana": 0, "demanda": "baja", "fecha": _ahora()}
    async with bloqueo:                         # el archivo lo escriben varias tareas: de una en una
        medidas = leer_medidas(carpeta)
        medidas[str(p["id"])] = medida
        _guardar(carpeta / "propuestas_medidas.json", medidas)
    _midiendo.discard((video_id, p["id"]))


async def medir_pendientes(video_id: int, carpeta: Path) -> int:
    """Lanza en segundo plano la medición de las propuestas sin medir (2 a la vez). Devuelve cuántas lanza."""
    propuestas, _ = leer_propuestas(carpeta)
    medidas = leer_medidas(carpeta)
    pendientes = [p for p in propuestas if p["dato"] and (video_id, p["id"]) not in _midiendo
                  and not ((medidas.get(str(p["id"])) or {}).get("dato") == p["dato"])]
    for p in pendientes:
        _midiendo.add((video_id, p["id"]))
    if not pendientes:
        return 0
    cola, bloqueo = list(pendientes), asyncio.Lock()

    async def trabajador():
        while cola:
            await _medir_una(video_id, carpeta, cola.pop(0), bloqueo)

    async def todos():
        await asyncio.gather(trabajador(), trabajador())

    t = asyncio.create_task(todos())
    _tareas.add(t)
    t.add_done_callback(_tareas.discard)
    return len(pendientes)


# --------------------------------------------------------------------------- fase B (o A de un Short): elegir

def elegir(ruta: Path, propuesta: int, minutos: int | None, tipo: str = "largo"):
    short = tipo == "short"
    fase = FASE_ENFOQUE["short" if short else "largo"]
    estado = _leer(ruta)
    if estado.get("fase") != fase:
        raise ValueError(f"Este vídeo no está en la fase {fase}")
    if not short and minutos not in DURACIONES:
        raise ValueError("Elige 10, 12 o 14 minutos")
    propuestas, _ = leer_propuestas(ruta.parent)
    p = next((x for x in propuestas if x["id"] == propuesta), None)
    if not p:
        raise ValueError("Esa propuesta no existe")
    medida = leer_medidas(ruta.parent).get(str(p["id"])) or {}
    estado.update({"propuesta_elegida": p["id"], "titulo_provisional": p["titulo"], "enfoque": p["enfoque"],
                   "gancho": p["gancho"]})
    if not short:
        estado["duracion_objetivo"] = minutos
    if p["pilar"]:
        estado["pilar"] = p["pilar"]
    if medida:
        estado["hueco"] = f"{medida['semaforo'].upper()} ({medida.get('fecha', '')[:10]}): {medida['motivo']}"
    if short:
        punto, pasos, siguiente = "sa-aprobar", ["sa-enfoques"], "B"
        comentario = f"Enfoque {p['id']}: «{p['titulo']}»"
    else:
        punto, pasos, siguiente = "b-aprobar", ["b-temas", "b-hueco"], "C"
        comentario = f"Enfoque {p['id']}: «{p['titulo']}», {minutos} min"
    estado.setdefault("aprobaciones", {})[punto] = {"fecha": _ahora(), "desde": "UI", "comentario": comentario}
    estado["pasos_hechos"] = list(dict.fromkeys((estado.get("pasos_hechos") or []) + pasos))
    hechas = ["A"] if short else ["A", "B"]
    estado["completadas"] = list(dict.fromkeys((estado.get("completadas") or []) + hechas))
    estado["fase"] = siguiente
    estado.setdefault("historial_fases", []).append({"de": fase, "a": siguiente, "fecha": _ahora(), "desde": "UI"})
    _guardar(ruta, estado)

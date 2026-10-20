"""Pasos 7-11 de «Crear el canal» (fases G-K de .claude/commands/nuevo-canal.md), con el mismo patrón que canal_guiado.py:
Claude PROPONE en segundo plano (escribe <canal>/videos/_pruebas/<paso>/prueba.json y rellena las fichas del canal), la UI
MIDE con las herramientas del kit y el usuario APRUEBA con un clic.

- Paso 7 (G, Reglas): Claude completa docs/concepto.md y canal.json y escribe reglas/prueba.json (resumen legible y dos
  preguntas sí/no con su motivo: contenido sintético y afiliación); aprobar escribe `cumplimiento` en canal.json.
- Paso 8 (H, Equipo): Claude rellena las fichas de equipo/ (las de los roles opcionales que recomienda) y las prueba con
  un agente; equipo/prueba.json da el porqué de cada rol; aprobar borra la ficha de los opcionales que el usuario quita.
- Paso 9 (I, Alta en YouTube): la tarea «marca_alta» (marca.py) hace avatar y banner; Claude rellena docs/alta_youtube.md
  y alta/prueba.json (textos para copiar); «ya lo he creado» comprueba el canal con yt-dlp y escribe `url` en canal.json.
- Paso 10 (J, Ideas): Claude escribe ideas/prueba.json; la UI mide cada idea con `saturacion.py --json`; aprobar escribe
  el banco en docs/ideas.md con el semáforo y la fecha, y guarda la candidata del primer vídeo.
- Paso 11 (K, Prueba y activación): la tarea «probar_kit» comprueba el montaje; Claude rellena CANAL.md y
  docs/progreso.md; terminar exige no dejar marcas <<RELLENAR>>, cierra la creación y, si se pide, activa el canal."""

import datetime as dt
import json
import re
import shutil
from pathlib import Path

from . import asistente, canal_guiado as g, config

import archivos  # noqa: E402  (herramientas/, en sys.path por config)
import canal as kit_canal  # noqa: E402
import canales as kit_canales  # noqa: E402

CIERRE = {"G", "H", "I", "J", "K"}
MAX_RESUMEN = 8
MAX_IDEAS = 15
MIN_IDEAS = 5

BASE = {"narrativa": "Estructura de los vídeos", "guionista": "Guion", "director-arte": "Dirección de arte",
        "estratega-youtube": "Títulos, miniaturas y YouTube"}
OPCIONALES = {"verificador": "Verificación de datos", "asesor-tematico": "Asesor de la temática"}
ROLES = {**BASE, **OPCIONALES}
SEMAFOROS = {"VERDE": "verde", "ÁMBAR": "ambar", "ROJO": "rojo", "GRIS": "gris"}
MARCA_RELLENAR = re.compile(r"<<RELLENAR")
URL_CANAL = re.compile(r"https://(?:www\.)?youtube\.com/(?:@[\w.\-]{3,30}|channel/UC[\w\-]{22})/?")


def _norm(texto: str) -> str:
    return re.sub(r"\W+", "", texto.lower())


def _carpeta(creacion: dict) -> Path:
    return kit_canal.CANALES / creacion["slug"]


def _prueba(creacion: dict, que: str) -> tuple[dict | None, str | None]:
    """El JSON que dejó Claude para el paso: (contenido, error). Sin archivo, (None, None)."""
    ruta = g.carpeta_pruebas(creacion, que) / "prueba.json"
    if not ruta.exists():
        return None, None
    try:
        crudo = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None, "Claude dejó un archivo que no se puede leer."
    if not isinstance(crudo, dict):
        return None, "Claude dejó un archivo que no se puede leer."
    return crudo, None


def _marcas_pendientes(creacion: dict, *rutas: str, sin: str | None = None) -> list[dict]:
    """Las marcas <<RELLENAR>> que quedan en esos archivos del canal (todo el canal si no se dice cuáles)."""
    res = []
    for archivo, linea, marca in kit_canales.pendientes(_carpeta(creacion)):
        if rutas and str(archivo) not in rutas:
            continue
        if sin and sin in marca:
            continue
        res.append({"archivo": str(archivo), "linea": linea, "marca": marca[:160]})
    return res


# --------------------------------------------------------------------------- paso 7: reglas y cumplimiento

ESQUEMA_REGLAS = """{"resumen": ["3-6 frases cortas, sin jerga, de las reglas que cambian respecto a la plantilla (de guion, de voz, de duración)"],
 "sintetico": {"respuesta": true, "motivo": "¿hay que declarar «contenido alterado o sintético» en YouTube? true si hay voz imitada o clonada, personas reales o escenas realistas que puedan confundirse con grabaciones; por qué, en una frase"},
 "afiliacion": {"respuesta": false, "motivo": "¿llevará enlaces de afiliado? por qué, en una frase"},
 "licencias": "de dónde salen la música, las fuentes tipográficas y las imágenes, y qué permite su licencia (recursos/LICENCIAS.md)"}"""


def leer_reglas(creacion: dict) -> tuple[dict | None, str | None]:
    crudo, error = _prueba(creacion, "reglas")
    if not crudo:
        return None, error

    def pregunta(clave):
        p = crudo.get(clave) if isinstance(crudo.get(clave), dict) else {}
        return {"respuesta": bool(p.get("respuesta")), "motivo": g._texto(p.get("motivo"), 300)}

    return {"resumen": g._lista(crudo.get("resumen"), MAX_RESUMEN, 300), "sintetico": pregunta("sintetico"),
            "afiliacion": pregunta("afiliacion"), "licencias": g._texto(crudo.get("licencias"), 400)}, None


CAMPOS_CUMPLIMIENTO = ("contenido_sintetico", "motivo_sintetico", "afiliacion", "licencias")


def _pendientes_del_asistente(creacion: dict) -> list[dict]:
    """Marcas que debe rellenar el asistente: las del bloque `cumplimiento` las escribe la respuesta del usuario."""
    try:
        lineas = (_carpeta(creacion) / "canal.json").read_text(encoding="utf-8").splitlines()
    except OSError:
        lineas = []
    res = []
    for m in _marcas_pendientes(creacion, "canal.json", "docs/concepto.md", sin="fase I"):
        texto = lineas[m["linea"] - 1] if m["archivo"] == "canal.json" and 0 < m["linea"] <= len(lineas) else ""
        if any(f'"{c}"' in texto for c in CAMPOS_CUMPLIMIENTO):
            continue
        res.append(m)
    return res


def estado_reglas(creacion: dict) -> dict:
    prueba, error = leer_reglas(creacion)
    e = g._leer(g.ruta_estado(creacion))
    return {"indicaciones": e.get("indicaciones_reglas"), "prueba": prueba, "error": error,
            "pendientes": _pendientes_del_asistente(creacion)}


def mensaje_reglas(indicaciones: str, otros: bool, creacion: dict) -> str:
    slug = creacion["slug"]
    ruta = f"canales/{slug}/videos/_pruebas/reglas/prueba.json"
    return f"""MODO UI · creación de canal, paso «Reglas» (fase G), «proponer reglas». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase G de .claude/commands/nuevo-canal.md, canales/{slug}/docs/concepto.md, canales/{slug}/canal.json y canales/{slug}/estado_canal.json (todo lo decidido hasta ahora).
2. Completa canales/{slug}/docs/concepto.md (Estructura de un vídeo, Reglas de guion, Títulos) y el resto de canal.json: `frases_obligatorias`, `reglas_texto` (las de eleven_v3 de la plantilla se borran si la voz es otra; añade las de la temática), `max_emociones_escena`, `max_segundos_imagen`. NO toques `cumplimiento` (lo escribe la interfaz con la respuesta del usuario) ni `url`. No debe quedar ninguna marca <<RELLENAR>> en canal.json (salvo `url`) ni en docs/concepto.md. Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».
3. Escribe SOLO esta propuesta en {ruta} con este formato exacto (sin comentarios):
{ESQUEMA_REGLAS}
Comprueba la política vigente de YouTube sobre contenido sintético antes de decidir: cambia con el tiempo.
4. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué reglas has puesto y qué le preguntas."""


def elegir_reglas(sintetico: bool, afiliacion: bool) -> dict:
    """Punto de aprobación de la fase G: `cumplimiento` en canal.json (con el motivo de cada respuesta)."""
    creacion = asistente.canal_en_creacion()
    g.en_paso(creacion, "G", "Reglas")
    prueba, _ = leer_reglas(creacion)
    if not prueba:
        raise ValueError("Aún no hemos propuesto las reglas")
    carpeta = _carpeta(creacion)
    c = archivos.leer_json(carpeta / "canal.json")
    previo = c.get("cumplimiento") if isinstance(c.get("cumplimiento"), dict) else {}
    c["cumplimiento"] = {**{k: v for k, v in previo.items() if k == "_comentario"},
                         "contenido_sintetico": "si" if sintetico else "no",
                         "motivo_sintetico": prueba["sintetico"]["motivo"] or "Decidido por el usuario",
                         "afiliacion": bool(afiliacion), "licencias": prueba["licencias"]}
    archivos.escribir_json(carpeta / "canal.json", c)
    if (faltan := _pendientes_del_asistente(creacion)):
        raise ValueError(f"Aún quedan {len(faltan)} campos sin rellenar en el concepto o la configuración: pídele al "
                         "asistente que los complete")
    ruta = g.ruta_estado(creacion)
    e = g._leer(ruta)
    e["reglas"] = {"sintetico": sintetico, "afiliacion": afiliacion}
    g._aprobar(e, "G", "H", f"Fase G: reglas y cumplimiento aprobados en la UI (contenido sintético: "
                            f"{'sí' if sintetico else 'no'}; afiliación: {'sí' if afiliacion else 'no'}); escritos en "
                            "canal.json (cumplimiento) y docs/concepto.md")
    archivos.escribir_json(ruta, e)
    return e["reglas"]


# --------------------------------------------------------------------------- paso 8: equipo de agentes

ESQUEMA_EQUIPO = """{"roles": [{"id": "narrativa|guionista|director-arte|estratega-youtube|verificador|asesor-tematico",
            "porque": "por qué este canal necesita a este especialista, en una frase sin jerga",
            "recomendado": true}],
 "pruebas": [{"rol": "id del rol", "resultado": "qué salió al probar su ficha y qué corregiste, en una frase"}]}"""


def leer_equipo(creacion: dict) -> tuple[list[dict] | None, list[dict], str | None]:
    crudo, error = _prueba(creacion, "equipo")
    if not crudo:
        return None, [], error
    roles = {}
    for r in crudo.get("roles") if isinstance(crudo.get("roles"), list) else []:
        if isinstance(r, dict) and r.get("id") in ROLES:
            roles[r["id"]] = {"porque": g._texto(r.get("porque")), "recomendado": r.get("recomendado") is not False}
    pruebas = [{"rol": p["rol"], "resultado": g._texto(p.get("resultado"))}
               for p in crudo.get("pruebas") if isinstance(p, dict) and p.get("rol") in ROLES] \
        if isinstance(crudo.get("pruebas"), list) else []
    return [{"id": i, "nombre": ROLES[i], "base": i in BASE, **roles.get(i, {"porque": "", "recomendado": i in BASE})}
            for i in ROLES], pruebas, None


def estado_equipo(creacion: dict) -> dict:
    roles, pruebas, error = leer_equipo(creacion)
    e = g._leer(g.ruta_estado(creacion))
    if roles is not None:
        faltan = {m["archivo"] for m in _marcas_pendientes(creacion)}
        for r in roles:
            ficha = f"equipo/{r['id']}.md"
            r["ficha"] = (_carpeta(creacion) / ficha).exists()
            r["rellena"] = r["ficha"] and ficha not in faltan
    return {"indicaciones": e.get("indicaciones_equipo"), "roles": roles or [], "pruebas": pruebas, "error": error}


def mensaje_equipo(indicaciones: str, otros: bool, creacion: dict) -> str:
    slug = creacion["slug"]
    ruta = f"canales/{slug}/videos/_pruebas/equipo/prueba.json"
    return f"""MODO UI · creación de canal, paso «Equipo» (fase H), «proponer equipo». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase H de .claude/commands/nuevo-canal.md, canales/{slug}/docs/concepto.md, canales/{slug}/canal.json y las fichas de plantilla de canales/{slug}/equipo/.
2. Decide qué roles necesita este canal: narrativa, guionista, director-arte y estratega-youtube siempre; `verificador` si cuenta hechos; `asesor-tematico` si la temática pide un especialista (propón su especialidad) o tiene políticas de YouTube delicadas. Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».
3. Rellena cada ficha de los roles que recomiendas (canales/{slug}/equipo/<rol>.md), sección por sección, solo con lo propio del canal (la ficha manda sobre el oficio; no copies el oficio). Las fichas de los opcionales que NO recomiendas se dejan como están (el usuario podrá quitarlas). No debe quedar <<RELLENAR>> en las fichas de los recomendados.
4. Prueba cada ficha rellenada: los agentes se cargan al abrir la sesión, así que lanza un agente `general-purpose` que lea el oficio (.claude/agents/<rol>.md) y la ficha y actúe como ese rol, con CANAL={slug}: una propuesta de enfoque (narrativa), un párrafo de gancho (guionista), 2 fichas de plano (director-arte), 3 títulos (estratega), un dato comprobado (verificador). Corrige las fichas con lo que falle.
5. Escribe SOLO esto en {ruta} con este formato exacto (sin comentarios), con los 6 roles:
{ESQUEMA_EQUIPO}
6. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué equipo has montado y por qué."""


def elegir_equipo(opcionales: list[str]) -> list[str]:
    """Punto de aprobación de la fase H: se quedan los roles base y los opcionales marcados; la ficha de los demás se borra."""
    creacion = asistente.canal_en_creacion()
    g.en_paso(creacion, "H", "Especialistas")
    est = estado_equipo(creacion)
    if not est["roles"]:
        raise ValueError("Aún no hemos propuesto el equipo")
    quedan = [i for i in OPCIONALES if i in opcionales]
    por_rol = {r["id"]: r for r in est["roles"]}
    for i in [*BASE, *quedan]:
        if not por_rol[i]["rellena"]:
            raise ValueError(f"La ficha de «{ROLES[i]}» aún no está rellenada: pídele al asistente que la complete")
    for i in OPCIONALES:
        if i not in quedan:
            (_carpeta(creacion) / "equipo" / f"{i}.md").unlink(missing_ok=True)
    ruta = g.ruta_estado(creacion)
    e = g._leer(ruta)
    e["equipo"] = [*BASE, *quedan]
    g._aprobar(e, "H", "I", "Fase H: equipo aprobado en la UI (" + ", ".join(e["equipo"]) + "); fichas en equipo/")
    archivos.escribir_json(ruta, e)
    return e["equipo"]


# --------------------------------------------------------------------------- paso 9: marca y alta en YouTube

ESQUEMA_ALTA = """{"nombre": "nombre del canal tal como se escribe en YouTube", "arroba": "identificador sin @",
 "descripcion": "descripción del canal, máximo 1.000 caracteres: promesa en la primera línea, 2-3 ejemplos de vídeos, pilares y una razón para suscribirse",
 "palabras_clave": ["8-12 palabras clave"], "categoria": "categoría de YouTube", "audiencia": "no es contenido para niños (o sí) y por qué, en una frase"}"""


def leer_alta(creacion: dict) -> tuple[dict | None, str | None]:
    crudo, error = _prueba(creacion, "alta")
    if not crudo:
        return None, error
    return {"nombre": g._texto(crudo.get("nombre"), 100), "arroba": g._texto(crudo.get("arroba"), 40).lstrip("@"),
            "descripcion": g._texto(crudo.get("descripcion"), 1000),
            "palabras_clave": g._lista(crudo.get("palabras_clave"), 15, 60),
            "categoria": g._texto(crudo.get("categoria"), 60), "audiencia": g._texto(crudo.get("audiencia"), 300)}, None


def estado_alta(creacion: dict) -> dict:
    prueba, error = leer_alta(creacion)
    marca = _carpeta(creacion) / "marca"
    e = g._leer(g.ruta_estado(creacion))
    return {"indicaciones": e.get("indicaciones_alta"), "prueba": prueba, "error": error,
            "avatar": g._medio(marca / "avatar.png"), "banner": g._medio(marca / "banner.png"),
            "previas": [m for f in ("previa_avatar.png", "previa_banner.png") if (m := g._medio(marca / f))]}


def mensaje_alta(indicaciones: str, otros: bool, creacion: dict) -> str:
    slug = creacion["slug"]
    ruta = f"canales/{slug}/videos/_pruebas/alta/prueba.json"
    return f"""MODO UI · creación de canal, paso «Alta en YouTube» (fase I), «preparar los textos». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase I de .claude/commands/nuevo-canal.md, canales/{slug}/docs/concepto.md, canales/{slug}/canal.json, canales/{slug}/docs/alta_youtube.md y la @ comprobada en canales/{slug}/estado_canal.json.
2. Rellena canales/{slug}/docs/alta_youtube.md (descripción, palabras clave, audiencia, categoría, @ y 2 alternativas por si ya no está libre). El avatar y el banner los hace la interfaz con los textos de canal.json → marca: NO los generes. Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».
3. Escribe SOLO esto en {ruta} con este formato exacto (sin comentarios):
{ESQUEMA_ALTA}
4. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué has preparado."""


async def confirmar_alta(url: str) -> dict:
    """Punto de aprobación de la fase I: el usuario dice que ya creó el canal; se comprueba con yt-dlp y se guarda `url`."""
    creacion = asistente.canal_en_creacion()
    g.en_paso(creacion, "I", "Marca y alta")
    url = url.strip()
    if not URL_CANAL.fullmatch(url):
        raise ValueError("Pega la dirección del canal tal como sale en YouTube, por ejemplo https://www.youtube.com/@minombre")
    yt = shutil.which("yt-dlp")
    if not yt:
        raise ValueError("Falta yt-dlp en este ordenador para comprobar el canal")
    try:
        crudo = await g._lanzar([yt, "-J", "--flat-playlist", "--playlist-items", "0", "--no-warnings", url.rstrip("/")])
        info = json.loads(crudo)
    except (RuntimeError, ValueError, TimeoutError):
        raise ValueError("No he podido ver ese canal en YouTube. Mira que la dirección esté bien y que el canal ya "
                         "esté publicado, y vuelve a intentarlo") from None
    ident = str(info.get("channel_id") or info.get("id") or "")
    if not ident.startswith("UC"):
        raise ValueError("Esa dirección no parece un canal de YouTube")
    nombre = str(info.get("channel") or info.get("uploader") or info.get("title") or "").strip()
    carpeta = _carpeta(creacion)
    c = archivos.leer_json(carpeta / "canal.json")
    c["url"] = url.rstrip("/")
    c["_url"] = f"channel_id {ident}; alta comprobada el {dt.date.today()}"
    archivos.escribir_json(carpeta / "canal.json", c)
    ruta = g.ruta_estado(creacion)
    e = g._leer(ruta)
    e["alta"] = {"url": c["url"], "channel_id": ident, "nombre": nombre}
    g._aprobar(e, "I", "J", f"Fase I: canal creado en YouTube y comprobado ({nombre or c['url']}, {ident}); "
                            "`url` en canal.json; avatar y banner en marca/")
    archivos.escribir_json(ruta, e)
    return {"nombre": nombre, "channel_id": ident,
            "coincide": bool(nombre) and _norm(nombre) == _norm(creacion["nombre"])}


def saltar_alta():
    """El usuario crea el canal en YouTube más tarde: se sigue sin `url` (queda vacía, sin marca pendiente)."""
    creacion = asistente.canal_en_creacion()
    g.en_paso(creacion, "I", "Marca y alta")
    carpeta = _carpeta(creacion)
    c = archivos.leer_json(carpeta / "canal.json")
    if MARCA_RELLENAR.search(str(c.get("url") or "")):
        c["url"] = ""
        archivos.escribir_json(carpeta / "canal.json", c)
    ruta = g.ruta_estado(creacion)
    e = g._leer(ruta)
    e["alta"] = {"saltada": True}
    g._aprobar(e, "I", "J", "Fase I: el alta en YouTube se hará más tarde (textos en docs/alta_youtube.md; "
                            "falta poner `url` en canal.json)")
    archivos.escribir_json(ruta, e)


# --------------------------------------------------------------------------- paso 10: banco de ideas

ESQUEMA_IDEAS = """{"ideas": [{"id": 1, "titulo": "título con las fórmulas del canal", "dato": "búsqueda del dato concreto, en castellano, como la haría el público",
           "amplio": "búsqueda del tema general (demanda)", "en": "la misma búsqueda del dato en inglés (opcional)",
           "pilar": "emoji + nombre del pilar", "enfoque": "ángulo del vídeo en una frase sin jerga"}],
 "recomendada": 1}"""


def _clave_idea(p: dict) -> str:
    return f"{p['dato'].lower()}|{p['amplio'].lower()}|{p['en'].lower()}"


def leer_ideas(creacion: dict | None = None) -> tuple[list[dict], str | None]:
    creacion = creacion or asistente.canal_en_creacion()
    if not creacion or not creacion.get("slug"):
        return [], None
    crudo, error = _prueba(creacion, "ideas")
    if not crudo:
        return [], error
    ideas, vistos = [], set()
    for x in crudo.get("ideas") if isinstance(crudo.get("ideas"), list) else []:
        if not isinstance(x, dict) or not isinstance(x.get("id"), int) or x["id"] in vistos:
            continue
        p = {"id": x["id"], "titulo": g._texto(x.get("titulo"), 140), "dato": g._texto(x.get("dato"), 140),
             "amplio": g._texto(x.get("amplio"), 140), "en": g._texto(x.get("en"), 140),
             "pilar": g._texto(x.get("pilar"), 60) or "Otras", "enfoque": g._texto(x.get("enfoque"), 240)}
        if p["titulo"] and p["dato"]:
            vistos.add(p["id"])
            ideas.append(p)
    ideas = ideas[:MAX_IDEAS]
    for p in ideas:
        p["recomendada"] = p["id"] == crudo.get("recomendada")
    return ideas, (None if ideas else "Claude dejó un archivo de ideas que no se puede leer.")


def leer_medidas_ideas() -> dict:
    return g._leer(g._mercado() / "ideas_medidas.json")


async def _medir_idea(p: dict) -> dict:
    args = [str(config.PYTHON), str(config.HERRAMIENTAS / "saturacion.py"), p["dato"], "--json"]
    if p["amplio"]:
        args += ["--amplio", p["amplio"]]
    if p["en"]:
        args += ["--en", p["en"]]
    crudo = await g._lanzar(args)
    m = json.loads(crudo[crudo.index("{"):])
    return {"semaforo": SEMAFOROS.get(m["semaforo"], "gris"), "motivo": m.get("motivo_llano") or m["motivo"],
            "fecha": m["fecha"]}


def estado_ideas(creacion: dict) -> dict:
    ideas, error = leer_ideas(creacion)
    medidas = leer_medidas_ideas()
    e = g._leer(g.ruta_estado(creacion))
    for p in ideas:
        m = medidas.get(str(p["id"])) or {}
        p["medida"] = m if m.get("clave") == _clave_idea(p) and m.get("ok") else None
        p["midiendo"] = p["id"] in g._midiendo["ideas"]
    return {"indicaciones": e.get("indicaciones_ideas"), "ideas": ideas, "error": error,
            "por_medir": [p["id"] for p in ideas if not p["medida"] and not p["midiendo"]],
            "minimo": MIN_IDEAS}


def mensaje_ideas(indicaciones: str, otros: bool, creacion: dict) -> str:
    slug = creacion["slug"]
    ruta = f"canales/{slug}/videos/_pruebas/ideas/prueba.json"
    tanda = (f" Ya hay ideas en {ruta}: CONSERVA las que hay (con sus ids) y AÑADE 5 nuevas con ids nuevos, "
             "distintas de todas las anteriores." if otros else "")
    return f"""MODO UI · creación de canal, paso «Ideas» (fase J), «proponer ideas». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase J de .claude/commands/nuevo-canal.md, canales/{slug}/docs/concepto.md (pilares, fórmulas de título y regla del hueco), canales/{slug}/docs/ideas.md y analisis/biblioteca/ si hay algo de la temática.
2. Propón 10-15 ideas repartidas por pilares, con enfoque y título con las fórmulas del canal. Lo famoso suele estar quemado: busca casos menos conocidos, el «dato de al lado», casos locales y outliers en inglés. Un «0 clones» suele ser una frase de búsqueda mala: pon en `dato` el nombre con el que la gente lo busca. Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».{tanda}
3. Rellena el encabezado de canales/{slug}/docs/ideas.md (la promesa y los pilares con su emoji; NO toques la marca de «una sección por pilar»: la tabla la escribe la interfaz con las mediciones) y canales/{slug}/docs/referentes.md con lo de la fase A (estado_canal.json → nicho, y analisis/mercado/).
4. Escribe SOLO las ideas en {ruta} con este formato exacto (sin comentarios):
{ESQUEMA_IDEAS}
Marca UNA como recomendada para el primer vídeo. NO midas tú las ideas: la interfaz lo hace con la herramienta.
5. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué ideas has propuesto y cuál te gusta más."""


def _fila(p: dict, medida: dict | None, candidata: bool) -> str:
    icono = {"verde": "🟢", "ambar": "🟡", "rojo": "🔴", "gris": "⚪"}.get((medida or {}).get("semaforo"), "⚪")
    hueco = f"{icono} {(medida or {}).get('motivo', 'sin medir').rstrip('.')} ({(medida or {}).get('fecha', 'sin medir')})"
    return (f"| {p['dato']} | {p['titulo']} — {p['enfoque']} | {hueco} | "
            f"{'en curso' if candidata else 'pendiente'} |").replace("\n", " ")


def elegir_ideas(candidata: int, descartadas: list[int]) -> dict:
    """Punto de aprobación de la fase J: el banco medido a docs/ideas.md y la candidata al estado."""
    creacion = asistente.canal_en_creacion()
    g.en_paso(creacion, "J", "Ideas")
    est = estado_ideas(creacion)
    quedan = [p for p in est["ideas"] if p["id"] not in descartadas]
    if len(quedan) < MIN_IDEAS:
        raise ValueError(f"El banco necesita al menos {MIN_IDEAS} ideas")
    cand = next((p for p in quedan if p["id"] == candidata), None)
    if not cand:
        raise ValueError("Esa idea no está en el banco")
    if not cand["medida"]:
        raise ValueError("Mide la idea del primer vídeo antes de elegirla")
    if cand["medida"]["semaforo"] == "rojo":
        raise ValueError("Esa idea está muy vista en YouTube: elige otra como primer vídeo")
    carpeta = _carpeta(creacion)
    ideas_md = carpeta / "docs" / "ideas.md"
    texto = ideas_md.read_text(encoding="utf-8")
    pilares: dict[str, list[dict]] = {}
    for p in quedan:
        pilares.setdefault(p["pilar"], []).append(p)
    secciones = "\n\n".join(
        f"## {pilar}\n\n| Idea | Enfoque / título | Hueco (fecha) | Estado |\n|---|---|---|---|\n" +
        "\n".join(_fila(p, p["medida"], p["id"] == candidata) for p in lista)
        for pilar, lista in pilares.items())
    marca = re.search(r"<<RELLENAR: una sección.*?>>", texto, re.S)
    if marca:
        texto = texto[:marca.start()] + secciones + "\n"
    else:
        texto = texto.rstrip() + f"\n\n{secciones}\n"
    if MARCA_RELLENAR.search(texto):
        raise ValueError("Falta rellenar el encabezado del banco de ideas: pídele al asistente que lo complete")
    archivos.escribir_texto(ideas_md, texto)
    ruta = g.ruta_estado(creacion)
    e = g._leer(ruta)
    e["candidata"] = {"id": cand["id"], "titulo": cand["titulo"], "dato": cand["dato"], "pilar": cand["pilar"],
                      "enfoque": cand["enfoque"], "semaforo": cand["medida"]["semaforo"]}
    g._aprobar(e, "J", "K", f"Fase J: banco de {len(quedan)} ideas medidas (docs/ideas.md); candidata al primer "
                            f"vídeo: «{cand['titulo']}» ({cand['medida']['semaforo']})")
    archivos.escribir_json(ruta, e)
    return e["candidata"]


# --------------------------------------------------------------------------- paso 11: prueba, activación y cierre

def estado_cierre(creacion: dict) -> dict:
    e = g._leer(g.ruta_estado(creacion))
    return {"indicaciones": e.get("indicaciones_cierre"), "pendientes": _marcas_pendientes(creacion),
            "candidata": e.get("candidata"),
            "activo": kit_canal.ACTIVO.exists() and kit_canal.ACTIVO.read_text(encoding="utf-8").strip() == creacion["slug"]}


def mensaje_cierre(indicaciones: str, otros: bool, creacion: dict) -> str:
    slug = creacion["slug"]
    return f"""MODO UI · creación de canal, paso «Prueba y cierre» (fase K), «dejar la ficha del canal». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase K de .claude/commands/nuevo-canal.md, canales/{slug}/estado_canal.json (todo lo decidido) y canales/{slug}/canal.json.
2. Rellena canales/{slug}/CANAL.md (ficha rápida: resumen de lo decidido en todas las fases, con la estructura de la plantilla) y canales/{slug}/docs/progreso.md (decisiones de cada fase y «Siguiente paso»: hacer el primer vídeo con la idea candidata de estado_canal.json). Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».
3. Ejecuta `.venv/bin/python herramientas/canales.py pendientes {slug}`: tiene que decir «Nada por rellenar». Si queda algo, complétalo (si es la `url` del canal y el usuario no ha creado el canal en YouTube todavía, déjala vacía: "").
4. NO ejecutes probar_kit.py ni cambies el canal activo: lo hace la interfaz.
5. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué has dejado escrito."""


def terminar(activar: bool, prueba_ok: bool) -> str:
    """Punto de aprobación de la fase K: cierra la creación (fase «hecho») y, si se pide, activa el canal."""
    creacion = asistente.canal_en_creacion()
    g.en_paso(creacion, "K", "Prueba y cierre")
    if not prueba_ok:
        raise ValueError("Antes de cerrar, haz la prueba del canal y espera a que salga bien")
    if (faltan := _marcas_pendientes(creacion)):
        raise ValueError(f"Aún quedan {len(faltan)} campos sin rellenar en las fichas del canal: pídele al asistente que "
                         "los complete")
    slug = creacion["slug"]
    ruta = g.ruta_estado(creacion)
    e = g._leer(ruta)
    g._aprobar(e, "K", "hecho", "Fase K: prueba del montaje superada y creación cerrada en la UI" +
               ("; canal activado" if activar else "; el canal sigue sin activarse"))
    archivos.escribir_json(ruta, e)
    if activar:
        g._sin_salida(kit_canales.activar, slug)
    return slug


g._midiendo["ideas"] = set()
g.MEDIR["ideas"] = (lambda: leer_ideas()[0], leer_medidas_ideas, _clave_idea, _medir_idea, "ideas_medidas.json",
                    "la idea")

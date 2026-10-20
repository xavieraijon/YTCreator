"""Creación del canal con pantallas propias (punto 8 del plan). Mismo patrón que las fases guiadas de un vídeo
(app/fases_ui.py): Claude PROPONE en segundo plano y escribe un JSON; la UI MIDE cada propuesta con la herramienta del
kit (las cifras salen de la herramienta, no de Claude) y el usuario ELIGE con un clic, que equivale al punto de
aprobación de .claude/commands/nuevo-canal.md.

- Paso 1 (fase A, Mercado): Claude escribe analisis/mercado/nichos_propuestos.json; la UI mide cada nicho con
  `mercado.py --json` en nichos_medidos.json; elegir guarda el nicho en el estado de la creación y pasa a la B.
- Paso 2 (fase B, Concepto): Claude escribe conceptos_propuestos.json (2-3, sin medir); elegir crea la carpeta del
  canal con el nombre provisional (`canales.py crear`), lleva allí el estado y pasa a la C.
- Paso 3 (fase C, Nombre): Claude escribe nombres_propuestos.json (y rellena docs/concepto.md con el concepto
  elegido); el usuario puede añadir los suyos (nombres_propios.json); la UI mide cada uno con `nombre_canal.py --json`
  (búsqueda limpia y @ libre) en nombres_medidos.json; elegir renombra el canal (`canales.py renombrar`, nunca mv),
  apunta la @ en docs/concepto.md y pasa a la D.
- Paso 4 (fase D, Estilo): Claude escribe <canal>/videos/_pruebas/estilo/prueba.json (formato de
  laboratorio_estilo.py, más la presentación de cada estilo); el usuario lanza las imágenes como una tarea normal
  («estilo_canal», con barra y cuota) y las ve por estilo × escena; elegir escribe `estilo` y `paletas` en canal.json
  y pasa a la E.
- Paso 5 (fase E, Voz): Claude escribe <canal>/videos/_pruebas/voz/prueba.json (formato de muestras_voz.py: un
  párrafo del canal y las voces, las de ai33 con su muestra oficial) y rellena el «Estilo visual» del concepto; la
  tarea «voz_canal» baja las muestras oficiales y locuta el párrafo con las voces gratis, midiendo palabras por minuto
  y entonación; una muestra de pago va aparte («voz_canal_ai33», con su coste confirmado); elegir escribe `voz`,
  `voces`, `estilo_voz`, `palabras_por_minuto` y `duraciones` en canal.json y la «Voz y narrador» del concepto, y
  pasa a la F.
- Paso 6 (fase F, Marca): Claude escribe <canal>/videos/_pruebas/marca/prueba.json (formato de muestras_marca.py:
  2-3 combinaciones de tipografía, colores y música, y los textos de marca); la tarea «marca_canal» pinta una miniatura
  de prueba por combinación sobre las imágenes del estilo elegido y prepara la música para escuchar (gratis); elegir
  escribe `fuentes`, `colores`, `marca`, `pantalla_final` y `hashtags_shorts` en canal.json y pasa a la G.
Cada elección borra las propuestas de los pasos siguientes (para que no aparezcan las de un canal anterior). Los
archivos de trabajo de los pasos 1-3 viven en analisis/mercado/ (solo hay una creación a la vez); desde el 4, en las
pruebas del propio canal (<canal>/videos/_pruebas/), como en .claude/commands/nuevo-canal.md.

El estado es el de siempre (lo leen igual Claude con «/nuevo-canal continuar» y el asistente): antes de la carpeta,
analisis/mercado/nuevo_canal.json; con carpeta, canales/<slug>/estado_canal.json."""

import asyncio
import contextlib
import io
import json
import logging
import re
from pathlib import Path

from . import asistente, config, referencias_estilo
from .guia import _ahora

import archivos  # noqa: E402  (herramientas/, en sys.path por config)
import canal as kit_canal  # noqa: E402
import canales as kit_canales  # noqa: E402

log = logging.getLogger("canalyt.canal_guiado")

CATEGORIAS = ("educacion", "entretenimiento", "kids")
MAX_NICHOS = 6
MAX_CONCEPTOS = 3
MAX_ESTILOS = 8                                  # por tanda (con «otra tanda» se acumulan en el mismo archivo)
MAX_ESCENAS = 4
MAX_VOCES = 8                                    # las últimas (con «otras voces» se acumulan en el mismo archivo)
MAX_NOMBRES = 8                                  # los de Claude; los propios van aparte
ID_PROPIOS = 101                                 # los nombres del usuario empiezan aquí (no chocan con los de Claude)
GUIADOS = {"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"}              # fases de la creación con pantalla propia; las demás, por el chat
SIGUIENTES = {"A": ("conceptos_propuestos.json", "nombres_propuestos.json", "nombres_propios.json",
                    "nombres_medidos.json"),
              "B": ("nombres_propuestos.json", "nombres_propios.json", "nombres_medidos.json")}

_midiendo: dict[str, set[int]] = {"nichos": set(), "nombres": set()}      # ids de propuesta en marcha
_tareas: set[asyncio.Task] = set()


def _mercado() -> Path:
    return config.RAIZ / "analisis" / "mercado"


def ruta_estado(creacion: dict | None = None) -> Path:
    creacion = creacion if creacion is not None else asistente.canal_en_creacion()
    if creacion and creacion["carpeta"]:
        return kit_canal.CANALES / creacion["slug"] / "estado_canal.json"
    return _mercado() / "nuevo_canal.json"


def _leer(ruta: Path) -> dict:
    return archivos.leer_json(ruta) if ruta.exists() else {}      # dañado → ArchivoDanado, nunca {}


def _texto(valor, maximo=300) -> str:
    texto = " ".join(str(valor or "").split())[:maximo]
    return texto[:1].upper() + texto[1:]


# --------------------------------------------------------------------------- paso 1: leer

def leer_propuestas() -> tuple[list[dict], str | None]:
    """(nichos limpios, error). Claude escribe el archivo: se acepta solo el formato esperado."""
    ruta = _mercado() / "nichos_propuestos.json"
    if not ruta.exists():
        return [], None
    try:
        crudo = json.loads(ruta.read_text(encoding="utf-8"))
        lista = crudo["nichos"] if isinstance(crudo, dict) else crudo
        assert isinstance(lista, list) and lista
    except (OSError, ValueError, KeyError, AssertionError):
        return [], "Claude dejó un archivo de propuestas que no se puede leer."
    salida = []
    for i, p in enumerate(lista[:MAX_NICHOS], 1):
        if not isinstance(p, dict) or not _texto(p.get("nicho")):
            continue
        busquedas = [" ".join(str(b).split())[:80] for b in (p.get("busquedas") or []) if str(b).strip()][:4]
        categoria = str(p.get("categoria") or "").strip().lower()
        salida.append({"id": int(p["id"]) if str(p.get("id", "")).isdigit() else i, "nicho": _texto(p["nicho"], 80),
                       "porque": _texto(p.get("porque")), "publico": _texto(p.get("publico"), 200),
                       "busquedas": busquedas, "categoria": categoria if categoria in CATEGORIAS else "educacion",
                       "recomendado": bool(p.get("recomendado"))})
    if not salida:
        return [], "Claude no dejó ningún nicho válido."
    if not any(p["recomendado"] for p in salida):
        salida[0]["recomendado"] = True
    return salida, None


def _clave(p: dict) -> str:
    """Lo que se midió: si Claude cambia el nicho o sus búsquedas, la medida vieja ya no vale."""
    return f"{p['nicho']}|{'|'.join(p['busquedas'])}|{p['categoria']}"


def leer_medidas() -> dict:
    try:
        return json.loads((_mercado() / "nichos_medidos.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def estado_mercado() -> dict:
    estado = _leer(ruta_estado())
    propuestas, error = leer_propuestas()
    medidas = leer_medidas()
    for p in propuestas:
        m = medidas.get(str(p["id"]))
        p["medida"] = m if m and m.get("clave") == _clave(p) else None
        p["midiendo"] = p["id"] in _midiendo["nichos"]
    return {"intereses": estado.get("intereses"), "propuestas": propuestas, "error": error,
            "elegido": estado.get("nicho"),
            "por_medir": [p["id"] for p in propuestas if len(p["busquedas"]) >= 1 and not p["medida"] and not p["midiendo"]]}


# --------------------------------------------------------------------------- pasos 2 y 3: leer

def _lista(valor, maximo=4, largo=120) -> list[str]:
    return [_texto(x, largo) for x in (valor if isinstance(valor, list) else []) if str(x or "").strip()][:maximo]


def _crudo(nombre: str, clave: str) -> tuple[list | None, str | None]:
    ruta = _mercado() / nombre
    if not ruta.exists():
        return None, None
    try:
        crudo = json.loads(ruta.read_text(encoding="utf-8"))
        lista = crudo[clave] if isinstance(crudo, dict) else crudo
        assert isinstance(lista, list) and lista
        return lista, None
    except (OSError, ValueError, KeyError, AssertionError):
        return None, "Claude dejó un archivo de propuestas que no se puede leer."


def leer_conceptos() -> tuple[list[dict], str | None]:
    lista, error = _crudo("conceptos_propuestos.json", "conceptos")
    if lista is None:
        return [], error
    salida = []
    for i, p in enumerate(lista[:MAX_CONCEPTOS], 1):
        if not isinstance(p, dict) or not _texto(p.get("nombre")) or not _texto(p.get("promesa")):
            continue
        salida.append({"id": int(p["id"]) if str(p.get("id", "")).isdigit() else i, "nombre": _texto(p["nombre"], 60),
                       "promesa": _texto(p["promesa"], 200), "pilares": _lista(p.get("pilares")),
                       "publico": _texto(p.get("publico"), 200), "para_ninos": bool(p.get("para_ninos")),
                       "formato": _texto(p.get("formato"), 200), "narrador": _texto(p.get("narrador"), 200),
                       "ritmo": _texto(p.get("ritmo"), 120), "monetizacion": _texto(p.get("monetizacion"), 200),
                       "recomendado": bool(p.get("recomendado"))})
    if not salida:
        return [], "Claude no dejó ningún concepto válido."
    if not any(p["recomendado"] for p in salida):
        salida[0]["recomendado"] = True
    return salida, None


def _arroba(valor) -> str | None:
    a = str(valor or "").strip().lstrip("@")
    return a if re.fullmatch(r"[A-Za-z0-9._-]{3,30}", a) else None


def leer_nombres() -> tuple[list[dict], str | None]:
    """Los de Claude y, detrás, los del usuario (`propio`)."""
    lista, error = _crudo("nombres_propuestos.json", "nombres")
    salida = []
    for i, p in enumerate((lista or [])[:MAX_NOMBRES], 1):
        if isinstance(p, dict) and _texto(p.get("nombre"), 40):
            salida.append({"id": int(p["id"]) if str(p.get("id", "")).isdigit() and int(p["id"]) < ID_PROPIOS else i,
                           "nombre": _texto(p["nombre"], 40), "arroba": _arroba(p.get("arroba")),
                           "porque": _texto(p.get("porque")), "recomendado": bool(p.get("recomendado")), "propio": False})
    if lista is not None and not salida:
        error = "Claude no dejó ningún nombre válido."
    if salida and not any(p["recomendado"] for p in salida):
        salida[0]["recomendado"] = True
    propios = _leer(_mercado() / "nombres_propios.json").get("nombres") or []
    salida += [{**p, "porque": "Lo has propuesto tú.", "recomendado": False, "propio": True} for p in propios]
    return salida, error


def _clave_nombre(p: dict) -> str:
    return f"{p['nombre']}|{p['arroba'] or ''}"


def leer_medidas_nombres() -> dict:
    try:
        return json.loads((_mercado() / "nombres_medidos.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def estado_concepto() -> dict:
    e = _leer(ruta_estado())
    propuestas, error = leer_conceptos()
    return {"indicaciones": e.get("indicaciones_concepto"), "propuestas": propuestas, "error": error}


def estado_nombre() -> dict:
    propuestas, error = leer_nombres()
    medidas = leer_medidas_nombres()
    for p in propuestas:
        m = medidas.get(str(p["id"]))
        p["medida"] = m if m and m.get("clave") == _clave_nombre(p) else None
        p["midiendo"] = p["id"] in _midiendo["nombres"]
    return {"propuestas": propuestas, "error": error,
            "por_medir": [p["id"] for p in propuestas if not p["medida"] and not p["midiendo"]]}


# --------------------------------------------------------------------------- paso 4: leer

def carpeta_pruebas(creacion: dict, que: str) -> Path:
    return kit_canal.CANALES / creacion["slug"] / "videos" / "_pruebas" / que


def leer_estilos(creacion: dict) -> tuple[dict | None, str | None]:
    """(prueba limpia, error). La prueba es la de laboratorio_estilo.py; la presentación de cada estilo (nombre y
    porqué para el usuario) va en "presentacion" y el recomendado en "recomendado"."""
    ruta = carpeta_pruebas(creacion, "estilo") / "prueba.json"
    if not ruta.exists():
        return None, None
    try:
        crudo = json.loads(ruta.read_text(encoding="utf-8"))
        assert isinstance(crudo.get("escenas"), dict) and crudo["escenas"]
        assert isinstance(crudo.get("estilos"), dict) and crudo["estilos"]
    except (OSError, ValueError, AssertionError, AttributeError):
        return None, "Claude dejó un archivo de estilos que no se puede leer."
    import laboratorio_estilo
    carpeta = ruta.parent
    # Las referencias las fija el programa (el usuario las sube), no lo que Claude haya escrito en el archivo
    crudo["referencias"] = [f"referencias/{p.name}" for p in referencias_estilo.listar(carpeta)]
    escenas = {str(k): str(v) for k, v in list(crudo["escenas"].items())[:MAX_ESCENAS] if str(v).strip()}
    textos = crudo.get("escenas_es") if isinstance(crudo.get("escenas_es"), dict) else {}
    presentacion = crudo.get("presentacion") if isinstance(crudo.get("presentacion"), dict) else {}
    estilos = []
    for ident, plantilla in crudo["estilos"].items():
        ident = str(ident)
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", ident) or not isinstance(plantilla, str):
            continue
        try:
            refs = laboratorio_estilo.referencias_de(crudo, ident, carpeta)
            pedidos = {e: laboratorio_estilo.prompt_de(plantilla, laboratorio_estilo.escena_de(e, texto, ident, crudo), crudo,
                                                       bool(refs), laboratorio_estilo.lleva_cuerpo(crudo, ident))
                       for e, texto in escenas.items()}
            prompts = {e: laboratorio_estilo.huella_de(p, refs) for e, p in pedidos.items()}
        except ValueError:                                  # sin {escena}: laboratorio_estilo.py no lo pintaría
            continue
        info = presentacion.get(ident) if isinstance(presentacion.get(ident), dict) else {}
        estilos.append({"id": ident, "nombre": _texto(info.get("nombre") or ident.replace("_", " "), 40),
                        "porque": _texto(info.get("porque")), "plantilla": plantilla, "prompts": prompts, "pedidos": pedidos,
                        "con_referencia": bool(refs), "recomendado": ident == crudo.get("recomendado")})
    if not estilos or not escenas:
        return None, "Claude no dejó ningún estilo válido."
    if not any(x["recomendado"] for x in estilos):
        estilos[0]["recomendado"] = True
    paletas = crudo.get("paletas") if isinstance(crudo.get("paletas"), dict) else {}
    return {"escenas": [{"id": e, "texto": _texto(textos.get(e) or e.replace("_", " "), 160)} for e in escenas],
            "estilos": estilos[-MAX_ESTILOS:] if len(estilos) > MAX_ESTILOS else estilos,
            "paleta": str(crudo.get("paleta") or "").strip(),       # tal cual: es la que se pintó en las pruebas
            "paletas": {str(k): str(v).strip() for k, v in paletas.items() if isinstance(v, str) and v.strip()}}, None


def _borrar_imagenes_estilo(carpeta: Path, ident: str | None):
    """Quita de la carpeta las imágenes de un estilo (todas si ident es None) y sus huellas en prompts.json."""
    import laboratorio_estilo
    hechos = _leer(carpeta / laboratorio_estilo.MANIFIESTO)
    prefijo = f"{ident}_" if ident else ""
    for f in carpeta.glob(f"{prefijo}*.png"):
        if ident is None and not re.search(r"_(klein|ai33)_", f.name):
            continue
        if ident and not re.fullmatch(re.escape(ident) + r"_[A-Za-z0-9]+_.+\.png", f.name):
            continue
        f.unlink(missing_ok=True)
        hechos.pop(f.name, None)
    archivos.escribir_json(carpeta / laboratorio_estilo.MANIFIESTO, hechos)


def quitar_estilo(creacion: dict, ident: str):
    """Quita un estilo de las pruebas (y sus imágenes). Si era el último, el paso vuelve a pedir estilos."""
    carpeta = carpeta_pruebas(creacion, "estilo")
    ruta = carpeta / "prueba.json"
    try:
        prueba = archivos.leer_json(ruta)
    except archivos.ArchivoDanado:
        raise ValueError("El archivo de estilos no se puede leer")
    if not isinstance(prueba, dict) or ident not in (prueba.get("estilos") or {}):
        raise ValueError("Ese estilo ya no está")
    prueba["estilos"].pop(ident)
    for clave in ("presentacion", "referencia_en", "fichas"):
        if isinstance(prueba.get(clave), dict):
            prueba[clave].pop(ident, None)
    if isinstance(prueba.get("referencia_en"), list):
        prueba["referencia_en"] = [x for x in prueba["referencia_en"] if x != ident]
    for clave in ("estilos_simples", "estilos_con_cuerpo"):
        if isinstance(prueba.get(clave), list):
            prueba[clave] = [x for x in prueba[clave] if x != ident]
    if prueba.get("recomendado") == ident:
        prueba.pop("recomendado")
    if prueba["estilos"]:
        archivos.escribir_json(ruta, prueba)
    else:
        ruta.unlink(missing_ok=True)
    _borrar_imagenes_estilo(carpeta, ident)


def empezar_estilos_de_cero(creacion: dict):
    """Quita todo lo del paso: propuestas, imágenes e imágenes de referencia subidas."""
    carpeta = carpeta_pruebas(creacion, "estilo")
    (carpeta / "prueba.json").unlink(missing_ok=True)
    if carpeta.is_dir():
        _borrar_imagenes_estilo(carpeta, None)
        for ref in referencias_estilo.listar(carpeta):
            ref.unlink(missing_ok=True)
        (referencias_estilo.carpeta_de(carpeta) / "notas.json").unlink(missing_ok=True)


def guardar_imagen_propia(creacion: dict, ident: str, escena: str, parcial: Path):
    """Pone la imagen que el usuario ha hecho fuera (con otra herramienta) como la de ese estilo y escena: cuenta como
    hecha mientras el estilo no cambie. Lanza ValueError si el estilo o la escena no existen o no es una imagen."""
    import laboratorio_estilo
    from PIL import Image, UnidentifiedImageError
    prueba, _ = leer_estilos(creacion)
    estilo = next((x for x in (prueba or {}).get("estilos", []) if x["id"] == ident), None)
    if not estilo or escena not in estilo["prompts"]:
        raise ValueError("Ese estilo o esa escena no existe")
    carpeta = carpeta_pruebas(creacion, "estilo")
    nombre = laboratorio_estilo.nombre_imagen(ident, escena)
    try:
        with Image.open(parcial) as im:
            im.verify()
        with Image.open(parcial) as im:
            im = im.convert("RGB")
            im.thumbnail((2048, 2048))
            temporal = carpeta / (nombre + ".part")
            im.save(temporal, "PNG")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValueError("No es una imagen que se pueda leer")
    temporal.replace(carpeta / nombre)
    hechos = _leer(carpeta / laboratorio_estilo.MANIFIESTO)
    hechos[nombre] = estilo["prompts"][escena]
    archivos.escribir_json(carpeta / laboratorio_estilo.MANIFIESTO, hechos)


def referencias_del_estilo(creacion: dict) -> list[dict]:
    """Las imágenes de referencia que ha subido el usuario (nombre y dirección para enseñarlas)."""
    carpeta = carpeta_pruebas(creacion, "estilo")
    notas = referencias_estilo.leer_notas(carpeta)
    return [{"nombre": p.name, "url": f"{p.relative_to(kit_canal.CANALES).as_posix()}?v={int(p.stat().st_mtime)}",
             "descripcion": notas.get(p.name, "")}
            for p in referencias_estilo.listar(carpeta)]


def estado_estilo(creacion: dict) -> dict:
    """Los estilos con su imagen por escena: solo cuenta la que se hizo con el prompt de ahora (prompts.json)."""
    import laboratorio_estilo
    carpeta = carpeta_pruebas(creacion, "estilo")
    e = _leer(ruta_estado(creacion))
    prueba, error = leer_estilos(creacion)
    if not prueba:
        return {"indicaciones": e.get("indicaciones_estilo"), "escenas": [], "estilos": [], "error": error,
                "faltan": 0, "referencias": referencias_del_estilo(creacion)}
    hechos = _leer(carpeta / laboratorio_estilo.MANIFIESTO)
    faltan = 0
    for x in prueba["estilos"]:
        x["imagenes"] = {}
        for escena, prompt in x.pop("prompts").items():
            nombre = laboratorio_estilo.nombre_imagen(x["id"], escena)
            f = carpeta / nombre
            if f.exists() and hechos.get(nombre, prompt) == prompt:
                ruta = f.relative_to(kit_canal.CANALES).as_posix()
                x["imagenes"][escena] = f"{ruta}?v={int(f.stat().st_mtime)}"
            else:
                faltan += 1
        x.pop("plantilla")
    return {"indicaciones": e.get("indicaciones_estilo"), **prueba, "error": error, "faltan": faltan,
            "referencias": referencias_del_estilo(creacion)}


# --------------------------------------------------------------------------- paso 5: leer

def leer_voces(creacion: dict) -> tuple[dict | None, str | None]:
    """(prueba limpia, error). La prueba es la de muestras_voz.py (párrafo y voces); además, lo que Claude propone
    para el concepto: cómo habla el narrador, quién cuenta y las marcas de emoción."""
    import muestras_voz
    ruta = carpeta_pruebas(creacion, "voz") / "prueba.json"
    if not ruta.exists():
        return None, None
    try:
        crudo = muestras_voz.leer_prueba(ruta)
    except ValueError:
        return None, "Claude dejó un archivo de voces que no se puede leer."
    voces = []
    for v in crudo["voces"][-MAX_VOCES:]:
        motor = muestras_voz.motor(v["voz"])
        voces.append({"id": v["id"], "voz": v["voz"].strip(), "nombre": _texto(v.get("nombre") or v["id"], 40),
                      "porque": _texto(v.get("porque")), "motor": motor, "de_pago": motor == "ai33",
                      "estilo": str(v.get("estilo") or "").strip() or None,
                      "velocidad": str(v.get("velocidad") or "").strip() or None,
                      "huella": muestras_voz.huella(crudo["texto"].strip(), v),
                      "con_oficial": bool(str(v.get("muestra_oficial") or "").strip()),
                      "recomendado": v["id"] == crudo.get("recomendado")})
    if not any(x["recomendado"] for x in voces):
        voces[0]["recomendado"] = True
    return {"texto": crudo["texto"].strip(), "estilo_voz": _texto(crudo.get("estilo_voz")),
            "narrador": _texto(crudo.get("narrador")), "marcas": str(crudo.get("marcas") or "").strip()[:200],
            "voces": voces}, None


def _medio(f: Path) -> str | None:
    return f"{f.relative_to(kit_canal.CANALES).as_posix()}?v={int(f.stat().st_mtime)}" if f.exists() else None


def estado_voz(creacion: dict) -> dict:
    """Las voces con su muestra oficial y la del párrafo del canal (solo cuenta la hecha con el texto, la voz y el
    estilo de ahora), lo medido y lo que costaría una muestra de pago."""
    import muestras_voz
    import proveedores
    carpeta = carpeta_pruebas(creacion, "voz")
    e = _leer(ruta_estado(creacion))
    prueba, error = leer_voces(creacion)
    if not prueba:
        return {"indicaciones": e.get("indicaciones_voz"), "texto": None, "voces": [], "error": error, "faltan": 0,
                "coste_ai33": None}
    hechos = _leer(carpeta / muestras_voz.MANIFIESTO)
    faltan = 0
    for x in prueba["voces"]:
        h = hechos.get(x["id"]) or {}
        al_dia = h.get("huella") == x.pop("huella")
        con_oficial = x.pop("con_oficial")
        x["muestra"] = _medio(carpeta / f"{x['id']}.mp3") if al_dia else None
        x["oficial"] = _medio(carpeta / h["oficial"]) if h.get("oficial") else None
        x.update({"ppm": h.get("ppm") if x["muestra"] else None, "duracion": h.get("duracion") if x["muestra"] else None,
                  "avisos": (h.get("avisos") or []) if x["muestra"] else [],
                  "error": h.get("error") if not x["muestra"] else None})
        if not x["muestra"] and (not x["de_pago"] or (con_oficial and not x["oficial"])):
            faltan += 1                                  # las de pago solo esperan su muestra oficial (gratis), si la hay
    creditos = muestras_voz.coste_ai33(prueba["texto"])
    euros = round(creditos * proveedores.valor("ai33.euros_por_millon_creditos") / 1_000_000, 2)
    return {"indicaciones": e.get("indicaciones_voz"), **prueba, "error": error, "faltan": faltan,
            "coste_ai33": {"creditos": creditos, "euros": euros}}


# --------------------------------------------------------------------------- paso 6: leer

AMBIENTES = ("alegre", "tranquilo", "misterio")


def leer_marcas(creacion: dict) -> tuple[dict | None, str | None]:
    """(prueba limpia, error). La prueba es la de muestras_marca.py; además, los textos de marca que Claude propone."""
    import muestras_marca
    ruta = carpeta_pruebas(creacion, "marca") / "prueba.json"
    if not ruta.exists():
        return None, None
    try:
        crudo = muestras_marca.leer_prueba(ruta)
        for p in crudo["propuestas"]:
            muestras_marca.fuente(p["fuente"], ruta.parent)
    except ValueError:
        return None, "Claude dejó un archivo de marca que no se puede leer."
    props = [{"id": p["id"], "nombre": _texto(p.get("nombre") or p["id"], 40), "porque": _texto(p.get("porque")),
              "fuente": p["fuente"], "fuente_nombre": str(p.get("fuente_nombre") or "").strip(),
              "colores": {c: p[c].upper() for c in ("acento", "resaltado", "texto", "fondo")},
              "musica": p["musica"] if p.get("musica") in AMBIENTES else "tranquilo",
              "recomendada": p["id"] == crudo.get("recomendada")} for p in crudo["propuestas"]]
    if not any(x["recomendada"] for x in props):
        props[0]["recomendada"] = True
    marca = crudo.get("marca") if isinstance(crudo.get("marca"), dict) else {}
    final = crudo.get("pantalla_final") if isinstance(crudo.get("pantalla_final"), dict) else {}
    hashtags = [h.strip() for h in crudo.get("hashtags") or [] if re.fullmatch(r"#\w{2,40}", str(h).strip())][:6]
    return {"titulo": crudo["titulo"].strip(), "propuestas": props,
            "marca": {k: str(marca.get(k) or "").strip()[:120] for k in ("monograma", "titulo", "lema", "pilares")},
            "pantalla_final": {k: str(final.get(k) or "").strip()[:120] for k in ("titulo", "lema")},
            "hashtags": hashtags}, None


def estado_marca(creacion: dict) -> dict:
    """Las combinaciones con sus miniaturas de prueba (solo cuentan las hechas con la tipografía, el color y el
    texto de ahora) y su música."""
    import muestras_marca
    carpeta = carpeta_pruebas(creacion, "marca")
    e = _leer(ruta_estado(creacion))
    prueba, error = leer_marcas(creacion)
    if not prueba:
        return {"indicaciones": e.get("indicaciones_marca"), "propuestas": [], "error": error, "faltan": 0}
    hechos = _leer(carpeta / muestras_marca.MANIFIESTO)
    fondos = muestras_marca.fondos(carpeta)
    faltan = 0
    for x in prueba["propuestas"]:
        crudo = {"fuente": x["fuente"], "resaltado": x["colores"]["resaltado"]}
        x["miniaturas"] = []
        for i, fondo in enumerate(fondos, 1):
            f = carpeta / f"{x['id']}-{i}.jpg"
            h = hechos.get(f.name) or {}
            if f.exists() and h.get("huella") == muestras_marca.huella(prueba["titulo"], crudo, fondo):
                x["miniaturas"].append(_medio(f))
            else:
                faltan += 1
        m = carpeta / f"musica_{x['musica']}.mp3"
        x["audio"] = _medio(m)
        faltan += 0 if x["audio"] else 1
    return {"indicaciones": e.get("indicaciones_marca"), **prueba, "error": error, "faltan": faltan,
            "sin_fondos": not fondos}


def estado(creacion: dict | None) -> dict:
    """Los 11 pasos de la creación con su estado (hecho / actual / pendiente) y si tienen pantalla propia, lo ya
    elegido (tema y concepto) y, en el paso actual si tiene pantalla, sus propuestas."""
    hechas = set((creacion or {}).get("completadas") or [])
    actual = (creacion or {}).get("fase") or "A"
    pasos = [{"letra": l, "nombre": asistente._PARA_USUARIO.get(l, n), "guiado": l in GUIADOS,
              "estado": "hecho" if l in hechas else "actual" if l == actual else "pendiente"}
             for l, n in asistente.FASES_CANAL]
    from . import canal_cierre as cc
    e = _leer(ruta_estado(creacion)) if creacion else {}
    concepto = e.get("concepto")
    tiene = bool((creacion or {}).get("carpeta"))
    return {"pasos": pasos, "actual": actual, "creacion": creacion, "nicho": e.get("nicho"),
            "concepto": {"nombre": concepto["nombre"], "promesa": concepto["promesa"]} if concepto else None,
            "mercado": estado_mercado() if actual == "A" else None,
            "conceptos": estado_concepto() if actual == "B" else None,
            "nombres": estado_nombre() if actual == "C" else None,
            "estilos": estado_estilo(creacion) if actual == "D" and (creacion or {}).get("carpeta") else None,
            "voces": estado_voz(creacion) if actual == "E" and (creacion or {}).get("carpeta") else None,
            "marcas": estado_marca(creacion) if actual == "F" and tiene else None,
            "reglas": cc.estado_reglas(creacion) if actual == "G" and tiene else None,
            "equipo": cc.estado_equipo(creacion) if actual == "H" and tiene else None,
            "alta": cc.estado_alta(creacion) if actual == "I" and tiene else None,
            "ideas": cc.estado_ideas(creacion) if actual == "J" and tiene else None,
            "cierre": cc.estado_cierre(creacion) if actual == "K" and tiene else None}


# --------------------------------------------------------------------------- paso 1: pedir a Claude

ESQUEMA = """{"nichos": [
  {"id": 1, "nicho": "nombre corto del nicho", "porque": "por qué puede funcionar, en una frase sin jerga",
   "publico": "quién lo vería, en una frase", "busquedas": ["2-4 búsquedas que haría ese público en YouTube"],
   "categoria": "educacion|entretenimiento|kids", "recomendado": true}
]}"""


def guardar_intereses(intereses: str):
    ruta = ruta_estado()
    e = _leer(ruta)
    e.setdefault("fase", "A")
    e.setdefault("completadas", [])
    e["intereses"] = intereses
    ruta.parent.mkdir(parents=True, exist_ok=True)
    archivos.escribir_json(ruta, e)


def mensaje_proponer(intereses: str, otros: bool, creacion: dict | None) -> str:
    rapido = ""
    if creacion and creacion["carpeta"]:
        rapido = (f"\nEs un canal rápido convertido (canales/{creacion['slug']}/): mira antes sus vídeos hechos "
                  "(videos/*/guion.md), son la mejor pista de lo que quiere el usuario.")
    return f"""MODO UI · creación de canal, paso «Mercado» (fase A), «proponer nichos». No me hables ni pidas \
aprobación: el usuario lo verá en pantalla.
Lo que le interesa al usuario: «{intereses or '(no lo ha dicho: propón nichos variados con buen mercado)'}».{rapido}
1. Lee CLAUDE.md, docs/mercado.md (requisitos del YPP, RPM por nicho, riesgo «hecho para niños») y la salida de \
`.venv/bin/python herramientas/canales.py lista` (el canal nuevo no debe pisar a uno que ya existe).
2. Propón de 3 a 5 nichos siguiendo la fase A de .claude/commands/nuevo-canal.md, cada uno con 2-4 búsquedas \
representativas (lo que escribiría su público en YouTube) y su categoría de RPM.
3. Escribe SOLO el archivo analisis/mercado/nichos_propuestos.json con este formato exacto (sin comentarios):
{ESQUEMA}
Marca UNO como recomendado. NO lances mercado.py ni midas nada: la interfaz mide cada nicho con tus búsquedas.\
{' Ya propusiste otros (están en ese archivo): propón distintos y sobrescríbelo.' if otros else ''}
4. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué has propuesto y por qué."""


def puede_proponer(creacion: dict | None):
    if creacion and creacion["fase"] != "A":
        raise ValueError("La creación del canal ya pasó del paso de mercado")


def en_paso(creacion: dict | None, fase: str, nombre: str):
    if (creacion or {}).get("fase", "A") != fase:
        raise ValueError(f"La creación del canal no está en el paso «{nombre}»")


# --------------------------------------------------------------------------- paso 2: pedir a Claude

ESQUEMA_CONCEPTOS = """{"conceptos": [
  {"id": 1, "nombre": "nombre provisional del canal", "promesa": "qué se lleva el espectador de cada vídeo, en una frase",
   "pilares": ["3-4 temas unidos por la promesa"], "publico": "quién lo ve (edad, qué busca)", "para_ninos": false,
   "formato": "duración de los vídeos y Shorts", "narrador": "quién cuenta y con qué tono",
   "ritmo": "vídeos por semana, sostenible", "monetizacion": "de qué vivirá, honesto", "recomendado": true}
]}"""


def mensaje_concepto(indicaciones: str, otros: bool, creacion: dict | None) -> str:
    nicho = (_leer(ruta_estado(creacion)).get("nicho") or {}) if creacion else {}
    tema = f"«{nicho['nicho']}» (público: {nicho.get('publico') or 'sin decir'})" if nicho.get("nicho") else \
        "el que dicen las notas del estado de la creación"
    informe = f" El informe de mercado está en {nicho['informe']}: léelo." if nicho.get("informe") else ""
    return f"""MODO UI · creación de canal, paso «Concepto» (fase B), «proponer conceptos». No me hables ni pidas \
aprobación: el usuario lo verá en pantalla.
Tema elegido en el paso anterior: {tema}.{informe}
Lo que pide el usuario para el concepto: «{indicaciones or '(nada en concreto)'}».
1. Lee CLAUDE.md, docs/mercado.md (formato que recomienda, riesgo «hecho para niños») y la fase B de \
.claude/commands/nuevo-canal.md.
2. Propón de 2 a 3 conceptos distintos para ese tema siguiendo la fase B.
3. Escribe SOLO el archivo analisis/mercado/conceptos_propuestos.json con este formato exacto (sin comentarios):
{ESQUEMA_CONCEPTOS}
Marca UNO como recomendado. Escribe para alguien que no sabe de YouTube: frases cortas, sin jerga (nada de RPM, YPP, \
CTR ni rutas). NO crees la carpeta del canal ni toques el estado: la interfaz lo hace cuando el usuario elige.\
{' Ya propusiste otros (están en ese archivo): propón distintos y sobrescríbelo.' if otros else ''}
4. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué has propuesto y por qué."""


# --------------------------------------------------------------------------- paso 3: pedir a Claude

ESQUEMA_NOMBRES = """{"nombres": [
  {"id": 1, "nombre": "Nombre del canal", "arroba": "IdSinEspacios (opcional: si no, sale del nombre)",
   "porque": "qué dice el nombre, en una frase", "recomendado": true}
]}"""


def mensaje_nombres(indicaciones: str, otros: bool, creacion: dict) -> str:
    propios = [p["nombre"] for p in leer_nombres()[0] if p["propio"]]
    return f"""MODO UI · creación de canal, paso «Nombre» (fase C), «proponer nombres». No me hables ni pidas \
aprobación: el usuario lo verá en pantalla. El canal está en canales/{creacion['slug']}/ (nombre provisional \
«{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase C de .claude/commands/nuevo-canal.md y canales/{creacion['slug']}/estado_canal.json \
(→ "concepto": el concepto que eligió el usuario; "nicho": el tema).
2. Si canales/{creacion['slug']}/docs/concepto.md aún tiene marcas <<RELLENAR en «Promesa», «Mercado», «Pilares», \
«Público», «Formato» o «Monetización», rellénalas con ese concepto (y el informe de mercado, si lo hay). No toques \
las demás marcas: son de pasos posteriores.
3. Propón de 6 a 8 nombres siguiendo la fase C (que digan la promesa, fáciles de decir y de escribir; ni castizos ni \
genéricos). Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».\
{f' Los que ha propuesto él (no los repitas): {", ".join(propios)}.' if propios else ''}
4. Escribe el archivo analisis/mercado/nombres_propuestos.json con este formato exacto (sin comentarios):
{ESQUEMA_NOMBRES}
Marca UNO como recomendado. NO midas nada con yt-dlp ni renombres el canal: la interfaz mide cada nombre (búsqueda \
limpia y @ libre) y renombra cuando el usuario elige.\
{' Ya propusiste otros (están en ese archivo): propón distintos y sobrescríbelo.' if otros else ''}
5. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué nombres te gustan más y por qué."""


def guardar_indicaciones(clave: str, texto: str):
    ruta = ruta_estado()
    e = _leer(ruta)
    e[clave] = texto
    archivos.escribir_json(ruta, e)


def anadir_nombre(nombre: str, arroba: str | None) -> int:
    """Un nombre del usuario: se mide igual que los de Claude."""
    en_paso(asistente.canal_en_creacion(), "C", "Nombre")
    nombre = _texto(nombre, 40)
    if len(nombre) < 2:
        raise ValueError("Escribe un nombre")
    if arroba and not _arroba(arroba):
        raise ValueError("La @ va de 3 a 30 caracteres: letras, números, punto, guion o guion bajo")
    ruta = _mercado() / "nombres_propios.json"
    propios = _leer(ruta).get("nombres") or []
    if any(p["nombre"].lower() == nombre.lower() for p in leer_nombres()[0]):
        raise ValueError("Ese nombre ya está en la lista")
    nuevo = {"id": max([p["id"] for p in propios] + [ID_PROPIOS - 1]) + 1, "nombre": nombre, "arroba": _arroba(arroba)}
    archivos.escribir_json(ruta, {"nombres": propios + [nuevo]})
    return nuevo["id"]


# --------------------------------------------------------------------------- medir (temas y nombres)

async def _lanzar(args: list[str]) -> str:
    """Salida de la herramienta; si falla, RuntimeError con su última línea de error."""
    proc = await asyncio.create_subprocess_exec(*args, cwd=config.RAIZ, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.PIPE)
    fuera, errores = await asyncio.wait_for(proc.communicate(), timeout=900)
    if proc.returncode != 0:
        ultima = errores.decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError(ultima[-1] if ultima else f"{Path(args[1]).name} salió con {proc.returncode}")
    return fuera.decode("utf-8", "replace")


async def _medir_nicho(p: dict) -> dict:
    args = [str(config.PYTHON), str(config.HERRAMIENTAS / "mercado.py"), "--nicho", p["nicho"],
            "--categoria", p["categoria"], "--json"]
    for b in p["busquedas"]:
        args += ["--busqueda", b]
    lineas = [l for l in (await _lanzar(args)).splitlines() if l.startswith("{")]
    return json.loads(lineas[-1])


async def _medir_nombre(p: dict) -> dict:
    args = [str(config.PYTHON), str(config.HERRAMIENTAS / "nombre_canal.py"), p["nombre"], "--json"]
    if p["arroba"]:
        args += ["--id", p["arroba"]]
    lineas = [l for l in (await _lanzar(args)).splitlines() if l.startswith("[")]
    return json.loads(lineas[-1])[0]


MEDIR = {  # tipo → (propuestas, medidas, clave, medir una, archivo de medidas, qué se mide)
    "nichos": (lambda: leer_propuestas()[0], leer_medidas, _clave, _medir_nicho, "nichos_medidos.json", "el nicho"),
    "nombres": (lambda: leer_nombres()[0], leer_medidas_nombres, _clave_nombre, _medir_nombre, "nombres_medidos.json",
                "el nombre"),
}


async def _medir_una(tipo: str, p: dict, bloqueo: asyncio.Lock):
    _, medidas_de, clave, medir, archivo, que = MEDIR[tipo]
    try:
        medida = {**await medir(p), "ok": True}
    except Exception as e:                      # noqa: BLE001 — uno sin medir no debe tumbar a los demás
        log.warning("no se pudo medir %s «%s»: %s", que, p.get("nicho") or p.get("nombre"), e)
        medida = {"ok": False, "semaforo": "gris", "motivo": "No se pudo medir ahora. Vuelve a intentarlo."}
    medida.update({"clave": clave(p), "medido": _ahora()})
    async with bloqueo:                         # el archivo lo escriben varias tareas: de una en una
        medidas = medidas_de()
        medidas[str(p["id"])] = medida
        archivos.escribir_json(_mercado() / archivo, medidas)
    _midiendo[tipo].discard(p["id"])


async def medir_pendientes(tipo: str = "nichos") -> int:
    """Lanza en segundo plano la medición de lo que falta por medir (2 a la vez). Devuelve cuántos lanza."""
    propuestas, medidas_de, clave, *_ = MEDIR[tipo]
    medidas = medidas_de()
    pendientes = [p for p in propuestas() if (tipo != "nichos" or p["busquedas"]) and p["id"] not in _midiendo[tipo]
                  and (medidas.get(str(p["id"])) or {}).get("clave") != clave(p)]
    for p in pendientes:
        _midiendo[tipo].add(p["id"])
    if not pendientes:
        return 0
    cola, bloqueo = list(pendientes), asyncio.Lock()

    async def trabajador():
        while cola:
            await _medir_una(tipo, cola.pop(0), bloqueo)

    async def todos():
        await asyncio.gather(trabajador(), trabajador())

    t = asyncio.create_task(todos())
    _tareas.add(t)
    t.add_done_callback(_tareas.discard)
    return len(pendientes)


# --------------------------------------------------------------------------- elegir (puntos de aprobación)

def _aprobar(e: dict, fase: str, siguiente: str, nota: str):
    e["completadas"] = list(dict.fromkeys((e.get("completadas") or []) + [fase]))
    e["fase"] = siguiente
    e["notas"] = re.sub(r"\s+", " ", f"{e.get('notas') or ''} {nota}.").strip()
    e.setdefault("historial_fases", []).append({"de": fase, "a": siguiente, "fecha": _ahora(), "desde": "UI"})


def _limpiar_siguientes(fase: str):
    for nombre in SIGUIENTES.get(fase, ()):
        (_mercado() / nombre).unlink(missing_ok=True)


def elegir(propuesta: int):
    """Punto de aprobación de la fase A: el nicho elegido (con lo medido) queda en el estado y se pasa al concepto."""
    creacion = asistente.canal_en_creacion()
    puede_proponer(creacion)
    p = next((x for x in leer_propuestas()[0] if x["id"] == propuesta), None)
    if not p:
        raise ValueError("Ese nicho no existe")
    m = leer_medidas().get(str(p["id"])) or {}
    medida = m if m.get("clave") == _clave(p) and m.get("ok") else None
    ruta = ruta_estado(creacion)
    e = _leer(ruta)
    e["nicho"] = {"id": p["id"], "nicho": p["nicho"], "publico": p["publico"], "busquedas": p["busquedas"],
                  "categoria": p["categoria"], "semaforo": (medida or {}).get("semaforo"),
                  "motivo": (medida or {}).get("motivo"), "informe": (medida or {}).get("informe")}
    nota = f"Fase A: nicho «{p['nicho']}» elegido en la UI"
    if medida:
        informe = f"; informe en {medida['informe']}" if medida.get("informe") else ""
        nota += f" (mercado {medida['semaforo']}: {medida['motivo'].rstrip('.')}{informe})"
    _aprobar(e, "A", "B", nota)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    archivos.escribir_json(ruta, e)
    _limpiar_siguientes("A")


def _sin_salida(funcion, *args):
    """Una función de canales.py desde el backend: su «OK…» no va a la consola y su sys.exit("ERROR…") es un
    ValueError con el texto para el usuario."""
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            return funcion(*args)
    except SystemExit as e:
        raise ValueError(str(e.code).removeprefix("ERROR: ")) from None


def _slug_libre(nombre: str, propio: str | None = None) -> str:
    base = slug = kit_canales.slug_de(nombre)
    n = 2
    while slug != propio and (kit_canal.CANALES / slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


def elegir_concepto(propuesta: int) -> str:
    """Punto de aprobación de la fase B: crea la carpeta del canal con el nombre provisional (si no la tiene: un canal
    rápido convertido ya la tiene), lleva allí el estado y pasa al nombre. Devuelve el slug."""
    creacion = asistente.canal_en_creacion()
    en_paso(creacion, "B", "Concepto")
    p = next((x for x in leer_conceptos()[0] if x["id"] == propuesta), None)
    if not p:
        raise ValueError("Ese concepto no existe")
    viejo = ruta_estado(creacion)
    e = _leer(viejo)
    if creacion["carpeta"]:
        slug = creacion["slug"]
    else:
        slug = _slug_libre(p["nombre"])
        _sin_salida(kit_canales.crear, slug, p["nombre"])
    e["concepto"] = {k: v for k, v in p.items() if k != "recomendado"}
    _aprobar(e, "B", "C", f"Fase B: concepto «{p['nombre']}» elegido en la UI (promesa: {p['promesa'].rstrip('.')}; "
                          f"pilares: {', '.join(p['pilares'])}); carpeta canales/{slug}/")
    archivos.escribir_json(kit_canal.CANALES / slug / "estado_canal.json", e)
    if viejo != kit_canal.CANALES / slug / "estado_canal.json":
        viejo.unlink(missing_ok=True)
    _limpiar_siguientes("B")
    return slug


def _apuntar_nombre(carpeta: Path, nombre: dict, descartados: list[dict]):
    """La @ y el porqué en docs/concepto.md, si siguen sin rellenar (si Claude ya los escribió, no se tocan)."""
    ruta = carpeta / "docs" / "concepto.md"
    if not ruta.exists():
        return
    texto = original = ruta.read_text(encoding="utf-8")
    m = nombre.get("medida") or {}
    libre = f"libre el {m['fecha']}" if m.get("arroba_libre") and m.get("fecha") else "sin comprobar"
    texto = re.sub(r"<<RELLENAR: @identificador.*?>>", f"@{m.get('id') or nombre['arroba'] or ''} ({libre}, "
                   "comprobado con nombre_canal.py)", texto, count=1, flags=re.DOTALL)
    otros = "; ".join(f"«{d['nombre']}» ({d['medida']['semaforo']}: {d['medida']['motivo'].rstrip('.')})"
                      for d in descartados if d.get("medida", {}).get("ok"))[:900]
    porque = (f"{nombre['porque'].rstrip('.')}. Búsqueda en YouTube: {m.get('motivo', 'sin medir').rstrip('.')}. "
              f"Elegido en la UI{'; descartados: ' + otros if otros else ''}.")
    texto = re.sub(r"(\*\*Por qué este nombre:\*\*) <<RELLENAR.*?>>", lambda x: f"{x.group(1)} {porque}", texto,
                   count=1, flags=re.DOTALL)
    if texto != original:
        archivos.escribir_texto(ruta, texto)


def elegir_nombre(propuesta: int) -> str:
    """Punto de aprobación de la fase C: renombra el canal (`canales.py renombrar`, que conserva lo de la UI), apunta
    la @ en el concepto y pasa al estilo visual. Una @ que ya es de otro no se puede elegir. Devuelve el slug nuevo."""
    creacion = asistente.canal_en_creacion()
    en_paso(creacion, "C", "Nombre")
    if not creacion["carpeta"]:
        raise ValueError("El canal todavía no tiene carpeta: elige antes el concepto")
    nombres = estado_nombre()["propuestas"]
    p = next((x for x in nombres if x["id"] == propuesta), None)
    if not p:
        raise ValueError("Ese nombre no existe")
    m = p["medida"] if p["medida"] and p["medida"].get("ok") else {}
    if m.get("arroba_libre") is False:
        raise ValueError(f"La @{m.get('id')} ya es de otro canal: elige otro nombre o añádelo con otra @")
    viejo = creacion["slug"]
    nuevo = _slug_libre(p["nombre"], propio=viejo)
    carpeta = _sin_salida(kit_canales.renombrar, viejo, nuevo, p["nombre"])
    _apuntar_nombre(carpeta, p, [x for x in nombres if x["id"] != propuesta])
    ruta = carpeta / "estado_canal.json"
    e = _leer(ruta)
    e["nombre"] = {"nombre": p["nombre"], "arroba": m.get("id") or p["arroba"], "semaforo": m.get("semaforo"),
                   "motivo": m.get("motivo")}
    nota = f"Fase C: nombre «{p['nombre']}» elegido en la UI"
    if m:
        nota += f" (@{m.get('id')}: {m['motivo'].rstrip('.')}; canales/{nuevo}/)"
    _aprobar(e, "C", "D", nota)
    archivos.escribir_json(ruta, e)
    return nuevo


# --------------------------------------------------------------------------- paso 4: pedir a Claude y elegir

ESQUEMA_ESTILOS = """{"formato": "horizontal",
 "escenas": {"id_corto": "ficha de plano en inglés (plano, sujeto, acción, lugar, época, luz)"},
 "escenas_es": {"id_corto": "la misma escena contada en castellano en una frase, para el usuario"},
 "estilos": {"E1_nombre": "prompt de estilo en inglés con {paleta} DELANTE de {escena}"},
 "presentacion": {"E1_nombre": {"nombre": "nombre corto en castellano", "porque": "por qué encaja, en una frase"}},
 "recomendado": "E1_nombre",
 "paleta": "paleta por defecto en inglés (sustituye {paleta})",
 "paletas": {"pilar": "paleta en inglés para ese pilar (opcional)"},
 "fichas": {"E1_nombre": "ficha del estilo en inglés, palabras concretas: medium, line (weight, colour), fill, body/head proportions, face design, background, shading"},
 "estilos_con_cuerpo": ["E1_nombre"],
 "estilos_simples": ["E3_nombre"],
 "escenas_simples": {"id_corto": "escena mínima en inglés para los estilos simples: un personaje, un objeto, nada más"},
 "referencia_en": ["E3_nombre"]}"""

REGLAS_SIMPLES = (
    "Si lo que pide el usuario es un muñeco o dibujo SIMPLE (palitos, stickman, clipart, trazo mínimo, fondo liso, "
    "minimalista), ese estilo debe salir de verdad simple y para eso: (a) anótalo en «estilos_simples» y da en "
    "«escenas_simples» una escena MÍNIMA por cada escena (un personaje y, como mucho, un objeto; sin plano, época, "
    "ropa, luz, multitudes ni paisaje: p. ej. «a stick figure standing next to a gold coin»); (b) el prompt del estilo "
    "empieza por {escena} y termina repitiendo lo esencial (p. ej. «{escena}, simple flat vector stick figure, thick "
    "black outline, solid plain white background, nothing else in the image»); (c) si hay más estilos simples, distínguelos "
    "por el trazo o el color, no por añadir decorado. Los estilos ricos (ilustración, óleo, fotografía…) siguen con las "
    "escenas normales.")

REGLAS_PRECISION = (
    "PRECISIÓN (el modelo de imagen es pequeño, no admite prompt negativo y falla con acciones y varios miembros): "
    "(1) escenas ESTÁTICAS y fáciles de dibujar: pose simple (de pie, sentado, señalando con un brazo), máximo 1-2 "
    "personajes, sin multitudes, sin manos ocupadas con varios objetos, sin acciones que crucen brazos o piernas; el "
    "objeto importante, grande y aislado. (2) Apunta en «estilos_con_cuerpo» los estilos cuyas escenas llevan personajes con cuerpo (personas, muñecos, "
    "animales): el programa les añade solo la frase de anatomía correcta (una cabeza, dos brazos, dos piernas); en "
    "los demás (paisaje, objeto, logo) no la añadas. No uses negaciones («no extra arms»), el modelo las ignora. (3) Antes de escribir cada prompt, rellena su ficha en «fichas» y construye el prompt desde ella. Cada prompt de estilo describe con "
    "palabras CONCRETAS y medibles, no con adjetivos vagos: tipo de trazo y grosor, color del trazo y del relleno, "
    "proporciones del cuerpo y la cabeza, rasgos de la cara, tipo de fondo, tipo de sombreado (o ninguno). (4) Una "
    "sola frase por idea, en inglés, en este orden: sujeto y pose → técnica y trazo → color/paleta → fondo → cierre "
    "repitiendo lo esencial. (5) Cuanto más simple el estilo, más corto y más literal el prompt.")


def _referencias_encargo(carpeta: str, n: int, notas: dict[str, str] | None = None) -> str:
    if n:
        texto = (f"El usuario ha subido {n} imagen(es) de referencia en {carpeta}/referencias/ (ref-1.png…). ÁBRELAS con Read "
                 "y míralas: describe en los prompts de los estilos que deban parecerse lo que ves (trazo, proporciones, "
                 "color, fondo, rasgos del personaje; con palabras concretas, no «similar a la imagen»: el programa ya añade al final del prompt la orden de copiar su estilo) y anota esos estilos en «referencia_en» (los demás no las reciben). "
                 "No toques la clave «referencias»: la gestiona el programa.")
        if notas:
            texto += (" El usuario ha escrito además lo que quiere de cada una (es SU indicación sobre la imagen, tenla muy "
                      "en cuenta y recógela en los prompts): "
                      + "; ".join(f"{k}: «{v}»" for k, v in sorted(notas.items())) + ".")
        return texto
    return ("NO hay imagen de referencia: no escribas «como tu imagen», «como la de referencia» ni nada que prometa "
            "parecerse a una imagen que no tienes. Si el usuario menciona una imagen o una dirección, dile en el «porque» "
            "del estilo que se ha interpretado solo con palabras y que puede subirla en esta pantalla para acercarlo.")


def mensaje_estilo(indicaciones: str, otros: bool, creacion: dict) -> str:
    slug = creacion["slug"]
    carpeta = f"canales/{slug}/videos/_pruebas/estilo"
    ruta = f"{carpeta}/prueba.json"
    n_refs = len(referencias_estilo.listar(carpeta_pruebas(creacion, "estilo")))
    notas_refs = referencias_estilo.leer_notas(carpeta_pruebas(creacion, "estilo"))
    tanda = (f" Ya hay estilos en {ruta}: CONSERVA las escenas y los estilos que hay (con sus nombres) y AÑADE de 3 a "
             "4 estilos nuevos, distintos de todos los anteriores; cambia «recomendado» solo si uno nuevo es mejor."
             if otros else "")
    return f"""MODO UI · creación de canal, paso «Estilo visual» (fase D), «proponer estilos». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase D de .claude/commands/nuevo-canal.md, el método de escenas del agente director-arte (.claude/agents/director-arte.md: ficha de plano, sin negaciones ni metáforas), canales/{slug}/docs/concepto.md y canales/{slug}/estado_canal.json (concepto y tema elegidos).
2. Escribe de 3 a 4 escenas típicas del canal (una por pilar: con personas, un objeto y un paisaje) y de 4 a 5 estilos distintos de verdad (no variaciones del mismo). Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».{tanda}
{REGLAS_SIMPLES}
{REGLAS_PRECISION}
{_referencias_encargo(carpeta, n_refs, notas_refs)}
3. Escribe SOLO el archivo {ruta} con este formato exacto (sin comentarios; ids de estilo y escena con letras, números y guiones bajos; «estilos_simples», «escenas_simples» y «referencia_en» solo si hacen falta):
{ESQUEMA_ESTILOS}
Marca UNO como recomendado. NO generes imágenes ni lances laboratorio_estilo.py ni toques canal.json: la interfaz pinta las imágenes cuando el usuario lo pide y guarda el estilo cuando elige.
4. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué estilos has propuesto y cuál te gusta más."""


def mensaje_ajuste(estilo: str, comentario: str, creacion: dict) -> str:
    """Bucle de corrección de UN estilo: Claude mira las imágenes que salieron (hechas por el programa o subidas por el
    usuario desde otra herramienta) frente a la referencia y reescribe solo el prompt de ese estilo."""
    import laboratorio_estilo
    slug = creacion["slug"]
    carpeta = f"canales/{slug}/videos/_pruebas/estilo"
    prueba, _ = leer_estilos(creacion)
    hechas = [f"{carpeta}/{laboratorio_estilo.nombre_imagen(estilo, e['id'])}" for e in (prueba or {}).get("escenas", [])
              if (carpeta_pruebas(creacion, "estilo") / laboratorio_estilo.nombre_imagen(estilo, e["id"])).is_file()]
    n_refs = len(referencias_estilo.listar(carpeta_pruebas(creacion, "estilo")))
    notas = referencias_estilo.leer_notas(carpeta_pruebas(creacion, "estilo"))
    return f"""MODO UI · creación de canal, paso «Estilo visual» (fase D), «ajustar un estilo». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee {carpeta}/prueba.json y fíjate en el estilo «{estilo}» (su prompt, su ficha en «fichas» y si está en «estilos_con_cuerpo» o «estilos_simples»).
2. ÁBRELAS con Read y míralas: {('las imágenes de ese estilo: ' + ', '.join(hechas)) if hechas else 'aún no hay imágenes de ese estilo (trabaja solo con la referencia y lo que pide el usuario)'}.{(' Y las ' + str(n_refs) + ' imágenes de referencia en ' + carpeta + '/referencias/ (ref-1.png…).') if n_refs else ' No hay imagen de referencia.'}{(' Lo que el usuario dijo de cada referencia: ' + '; '.join(f'{k}: «{v}»' for k, v in sorted(notas.items())) + '.') if notas else ''}
3. Lo que dice el usuario que está mal: «{comentario or '(nada: júzgalo tú)'}». Compara cada imagen con la referencia y con lo que pide el estilo: trazo, proporciones, color, fondo, diseño del personaje, anatomía (miembros de más o de menos), cosas inventadas, detalles que sobran.
4. Corrige SOLO ese estilo en {carpeta}/prueba.json: reescribe su prompt (y su ficha, y sus escenas mínimas si es de «estilos_simples»). Cada fallo que veas, arréglalo con palabras concretas y en positivo (el modelo no admite prompt negativo y ignora «no»): describe lo que SÍ debe verse, más corto y más literal si el fallo es de sobra de detalles. Conserva {{escena}} (y {{paleta}} si lo usa), los demás estilos y todas las demás claves; no toques «referencias».
5. NO generes imágenes ni lances laboratorio_estilo.py. Termina con 2 líneas para el usuario, sin jerga ni rutas: qué fallaba y qué has cambiado."""


def elegir_estilo(estilo: str) -> str:
    """Punto de aprobación de la fase D: el estilo (plantilla del prompt) y sus paletas a canal.json; las imágenes
    que se hicieron con él quedan en el estado (las usa el paso de marca para las miniaturas de prueba)."""
    creacion = asistente.canal_en_creacion()
    en_paso(creacion, "D", "Estilo visual")
    prueba, _ = leer_estilos(creacion)
    x = next((s for s in (prueba or {}).get("estilos", []) if s["id"] == estilo), None)
    if not x:
        raise ValueError("Ese estilo no existe")
    hechas = next(s for s in estado_estilo(creacion)["estilos"] if s["id"] == estilo)["imagenes"]
    imagenes = [v.split("?")[0] for v in hechas.values()]
    if not imagenes:
        raise ValueError("Ese estilo aún no tiene imágenes: genéralas y míralas antes de elegir")
    carpeta = kit_canal.CANALES / creacion["slug"]
    config_canal = archivos.leer_json(carpeta / "canal.json")
    config_canal["estilo"] = x["plantilla"]
    if "{paleta}" in x["plantilla"]:
        anteriores = config_canal.get("paletas") if isinstance(config_canal.get("paletas"), dict) else {}
        comentario = {"_comentario": anteriores["_comentario"]} if "_comentario" in anteriores else {}
        config_canal["paletas"] = {**comentario, "defecto": prueba["paleta"] or "natural colour palette",
                                   **prueba["paletas"]}
    else:
        config_canal.pop("paletas", None)
    archivos.escribir_json(carpeta / "canal.json", config_canal)
    ruta = ruta_estado(creacion)
    e = _leer(ruta)
    e["estilo"] = {"id": x["id"], "nombre": x["nombre"], "imagenes": imagenes}
    _aprobar(e, "D", "E", f"Fase D: estilo «{x['nombre']}» ({x['id']}) elegido en la UI entre "
                          f"{len(prueba['estilos'])}; escrito en canal.json (estilo y paletas); pruebas en "
                          "videos/_pruebas/estilo/")
    archivos.escribir_json(ruta, e)
    return x["id"]


# --------------------------------------------------------------------------- paso 5: pedir a Claude y elegir

ESQUEMA_VOCES = """{"texto": "párrafo de 60-90 palabras como los del canal, con sus reglas de voz",
 "voces": [{"id": "id_corto", "voz": "ai33:elevenlabs_… | gemini:Nombre | es-ES-…:MAI-Voice-2",
            "nombre": "nombre corto para el usuario", "porque": "por qué encaja, en una frase",
            "estilo": "cómo habla (solo Gemini: acento, registro, ritmo)", "velocidad": "+0% (solo Azure)",
            "muestra_oficial": "https://… (solo ai33: la que da `muestras_voz.py buscar`)"}],
 "recomendado": "id_corto",
 "estilo_voz": "cómo habla el narrador, en una frase (acento, registro, ritmo, qué NO es)",
 "narrador": "quién cuenta, con qué tono y cómo trata al espectador, en una frase",
 "marcas": "marcas de emoción permitidas con ai33, p. ej. [curious], [whispers]; vacío si no se usan"}"""


def mensaje_voz(indicaciones: str, otros: bool, creacion: dict) -> str:
    slug = creacion["slug"]
    ruta = f"canales/{slug}/videos/_pruebas/voz/prueba.json"
    tanda = (f" Ya hay voces en {ruta}: CONSERVA el párrafo y las voces que hay (con sus ids) y AÑADE de 2 a 3 voces "
             "nuevas, distintas de las anteriores; cambia «recomendado» solo si una nueva es mejor." if otros else "")
    return f"""MODO UI · creación de canal, paso «Voz» (fase E), «proponer voces». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase E de .claude/commands/nuevo-canal.md, las reglas de escritura para la voz del agente guionista (.claude/agents/guionista.md), canales/{slug}/docs/concepto.md, canales/{slug}/canal.json (estilo elegido) y canales/{slug}/estado_canal.json (concepto, nombre y estilo elegidos).
2. Si en canales/{slug}/docs/concepto.md la sección «Estilo visual» sigue con <<RELLENAR…>>, rellénala con el estilo elegido en el paso anterior (descripción, muestra aprobada en videos/_pruebas/estilo/, paletas, personaje fijo sí/no y lo que nunca sale).
3. Busca voces de pago SIN GASTAR con `.venv/bin/python herramientas/muestras_voz.py buscar "<términos>" [--genero male|female]` (consulta gratuita; las descripciones suelen estar en inglés: busca «narrator», «documentary», «storyteller», «calm»…; prefiere las nativas). Propón de 4 a 6 voces en total: 2-3 de ai33 (de pago, con su muestra oficial) y 2-3 gratis (gemini:… con un «estilo» que diga cómo habla, y es-ES-… de Azure). Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».{tanda}
4. Escribe SOLO el archivo {ruta} con este formato exacto (sin comentarios; ids con letras, números, guiones y guiones bajos):
{ESQUEMA_VOCES}
Marca UNA como recomendada. NO locutes nada ni lances gen_voz.py ni `muestras_voz.py hacer`, ni toques canal.json: la interfaz hace las muestras cuando el usuario lo pide (las de pago, solo si acepta su coste) y guarda la voz cuando elige.
5. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué voces has propuesto y cuál te gusta más."""


def _escalar_duraciones(duraciones: dict, antes: float, ahora: int) -> dict:
    """Los rangos de palabras de cada duración, a la velocidad medida (los segundos e imágenes no cambian)."""
    f = ahora / antes
    salida = {}
    for k, v in duraciones.items():
        if isinstance(v, dict) and isinstance(v.get("palabras"), list):
            v = {**v, "palabras": [int(round(n * f / 10) * 10) for n in v["palabras"]]}
        salida[k] = v
    return salida


def _apuntar_voz(carpeta: Path, x: dict, prueba: dict, alternativa: str | None):
    """«Voz y narrador» del concepto, si sigue sin rellenar (si Claude ya la escribió, no se toca)."""
    ruta = carpeta / "docs" / "concepto.md"
    if not ruta.exists():
        return
    texto = original = ruta.read_text(encoding="utf-8")
    pago = "de pago, ai33" if x["de_pago"] else "gratis"
    medida = f", {x['ppm']} palabras/min medidas" if x.get("ppm") else ""
    voz = (f"{x['nombre']} (`{x['voz']}`, {pago}{medida}), elegida en la UI el {_ahora()[:10]}: "
           f"{x['porque'].rstrip('.') or 'la que mejor encaja'}"
           + (f"; alternativa gratuita: `{alternativa}`" if alternativa and alternativa != x["voz"] else ""))
    cambios = [(r"(- Voz: )<<RELLENAR.*?>>", voz),
               (r"(- )<<RELLENAR: quién cuenta.*?>>", prueba["narrador"].rstrip(".")),
               (r"(- Marcas de emoción permitidas: )<<RELLENAR.*?>>", prueba["marcas"] or "ninguna")]
    for patron, valor in cambios:
        if valor:
            texto = re.sub(patron, lambda m, v=valor: m.group(1) + v, texto, count=1, flags=re.DOTALL)
    if texto != original:
        archivos.escribir_texto(ruta, texto)


def elegir_voz(voz: str) -> str:
    """Punto de aprobación de la fase E: la voz a canal.json (con su velocidad medida, que reajusta las palabras de
    cada duración) y al concepto. Hace falta haberla oído: su muestra o, si es de pago, al menos la oficial."""
    creacion = asistente.canal_en_creacion()
    en_paso(creacion, "E", "Voz")
    prueba, _ = leer_voces(creacion)
    x = next((v for v in estado_voz(creacion)["voces"] if v["id"] == voz), None) if prueba else None
    if not x:
        raise ValueError("Esa voz no existe")
    if not x["muestra"] and not x["oficial"]:
        raise ValueError("Esa voz aún no tiene muestra: hazla y escúchala antes de elegir")
    carpeta = kit_canal.CANALES / creacion["slug"]
    c = archivos.leer_json(carpeta / "canal.json")
    c["voz"] = x["voz"]
    voces = c.get("voces") if isinstance(c.get("voces"), dict) else {}
    c["voces"] = {**voces, x["motor"]: x["voz"]}               # «azure» sigue siempre (probar_kit.py la fuerza)
    estilo = x["estilo"] if x["motor"] == "gemini" else prueba["estilo_voz"]
    if estilo:
        c["estilo_voz"] = estilo
    if x["motor"] == "azure":
        c["velocidad"] = x["velocidad"] or "+0%"                 # la de la muestra: con ella se midió
    nota = ""
    antes = c.get("palabras_por_minuto")
    if x.get("ppm") and isinstance(antes, (int, float)) and antes and abs(x["ppm"] - antes) / antes > 0.05:
        c["palabras_por_minuto"] = x["ppm"]
        if isinstance(c.get("duraciones"), dict):
            c["duraciones"] = _escalar_duraciones(c["duraciones"], antes, x["ppm"])
        nota = f"; {x['ppm']} palabras/min medidas (antes {antes}): palabras de cada duración reajustadas"
    archivos.escribir_json(carpeta / "canal.json", c)
    _apuntar_voz(carpeta, x, prueba, c["voces"].get("azure"))
    ruta = ruta_estado(creacion)
    e = _leer(ruta)
    e["voz"] = {"id": x["id"], "nombre": x["nombre"], "voz": x["voz"], "de_pago": x["de_pago"], "ppm": x.get("ppm"),
                "muestra": (x["muestra"] or x["oficial"]).split("?")[0]}
    _aprobar(e, "E", "F", f"Fase E: voz «{x['nombre']}» ({x['voz']}) elegida en la UI entre {len(prueba['voces'])}"
                          f"{nota}; escrita en canal.json (voz, voces, estilo_voz); muestras en videos/_pruebas/voz/")
    archivos.escribir_json(ruta, e)
    return x["id"]


# --------------------------------------------------------------------------- paso 6: pedir a Claude y elegir

ESQUEMA_MARCA = """{"titulo": "texto de miniatura de ejemplo, 2-5 palabras, *palabra de acento* entre asteriscos",
 "propuestas": [{"id": "id_corto", "nombre": "nombre corto para el usuario", "porque": "por qué encaja, en una frase",
                 "fuente": "archivo de recursos/fuentes/ (p. ej. PlayfairDisplay-Black.ttf)",
                 "fuente_nombre": "familia interna (p. ej. Playfair Display Black)",
                 "acento": "#RRGGBB", "resaltado": "#RRGGBB", "texto": "#RRGGBB", "fondo": "#RRGGBB",
                 "musica": "alegre|tranquilo|misterio"}],
 "recomendada": "id_corto",
 "marca": {"monograma": "1-3 letras, *acento entre asteriscos*", "titulo": "NOMBRE del canal en el banner, *acento*",
           "lema": "promesa del canal en una frase", "pilares": "pilares separados por '  ·  '"},
 "pantalla_final": {"titulo": "NOMBRE en una o dos líneas separadas por |, *acento*", "lema": "frase de despedida"},
 "hashtags": ["#tema", "#NombreDelCanal"]}"""


def mensaje_marca(indicaciones: str, otros: bool, creacion: dict) -> str:
    slug = creacion["slug"]
    ruta = f"canales/{slug}/videos/_pruebas/marca/prueba.json"
    tanda = (f" Ya hay combinaciones en {ruta}: CONSERVA las que hay (con sus ids) y AÑADE 2 nuevas, distintas de "
             "todas las anteriores; cambia «recomendada» solo si una nueva es mejor." if otros else "")
    return f"""MODO UI · creación de canal, paso «Marca» (fase F), «proponer marca». No me hables ni pidas aprobación: el usuario lo verá en pantalla. El canal es canales/{slug}/ («{creacion['nombre']}»).
1. Lee CLAUDE.md, la fase F de .claude/commands/nuevo-canal.md, canales/{slug}/docs/concepto.md, canales/{slug}/canal.json (estilo y paletas elegidos) y canales/{slug}/estado_canal.json. Mira una de las imágenes del estilo elegido (estado_canal.json → estilo.imagenes, en canales/) para sacar los colores de ella.
2. Propón de 2 a 3 combinaciones distintas de verdad de tipografía (SOLO las de recursos/fuentes/), colores (acento, resaltado, texto y fondo; que el texto se lea sobre el fondo y el resaltado destaque sobre las imágenes) y música. Lo que pide el usuario: «{indicaciones or '(nada en concreto)'}».{tanda}
3. Escribe SOLO el archivo {ruta} con este formato exacto (sin comentarios):
{ESQUEMA_MARCA}
Marca UNA como recomendada. NO generes miniaturas ni música ni toques canal.json: la interfaz pinta las muestras cuando el usuario lo pide y guarda la marca cuando elige.
4. Termina con 2-3 líneas para el usuario, sin jerga ni rutas: qué combinaciones has propuesto y cuál te gusta más."""


def elegir_marca(marca: str) -> str:
    """Punto de aprobación de la fase F: tipografía, colores, música y textos de marca a canal.json."""
    creacion = asistente.canal_en_creacion()
    en_paso(creacion, "F", "Marca")
    est = estado_marca(creacion)
    x = next((p for p in est["propuestas"] if p["id"] == marca), None)
    if not x:
        raise ValueError("Esa combinación no existe")
    if not x["miniaturas"]:
        raise ValueError("Esa combinación aún no tiene miniatura de prueba: hazla y mírala antes de elegir")
    carpeta = kit_canal.CANALES / creacion["slug"]
    c = archivos.leer_json(carpeta / "canal.json")
    fuentes = c.get("fuentes") if isinstance(c.get("fuentes"), dict) else {}
    nombre_fuente = x["fuente_nombre"] or Path(x["fuente"]).stem.replace("-", " ")
    c["fuentes"] = {**fuentes, "titulo": {"archivo": x["fuente"], "nombre": nombre_fuente}}
    colores = c.get("colores") if isinstance(c.get("colores"), dict) else {}
    c["colores"] = {**colores, **x["colores"]}
    for clave, valores in (("marca", est["marca"]), ("pantalla_final", est["pantalla_final"])):
        previo = c.get(clave) if isinstance(c.get(clave), dict) else {}
        c[clave] = {**previo, **{k: v for k, v in valores.items() if v}}
    c["pantalla_final"]["musica"] = x["musica"]
    if est["hashtags"]:
        c["hashtags_shorts"] = list(dict.fromkeys(["#shorts"] + est["hashtags"]))
    archivos.escribir_json(carpeta / "canal.json", c)
    ruta = ruta_estado(creacion)
    e = _leer(ruta)
    e["marca"] = {"id": x["id"], "nombre": x["nombre"], "fuente": x["fuente"], "colores": x["colores"],
                  "musica": x["musica"]}
    _aprobar(e, "F", "G", f"Fase F: marca «{x['nombre']}» ({x['fuente']}, {x['colores']['acento']}, música "
                          f"{x['musica']}) elegida en la UI entre {len(est['propuestas'])}; escrita en canal.json "
                          "(fuentes, colores, marca, pantalla_final); pruebas en videos/_pruebas/marca/")
    archivos.escribir_json(ruta, e)
    return x["id"]

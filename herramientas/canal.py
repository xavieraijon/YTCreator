"""Canal activo: su carpeta, su configuración (canal.json) y la resolución de rutas.

El kit es común y cada canal vive en su carpeta, canales/<canal>/ (canal.json, docs/, equipo/, marca/,
recursos/, videos/, analisis/). Todo lo propio del canal (voz, estilo, colores, hashtags, pantalla final,
duraciones) se lee de su canal.json. Canal activo, por este orden:
  1. variable CANAL: nombre del canal ("mi-canal"), su carpeta o su canal.json;
  2. archivo canal_activo en el espacio de trabajo (herramientas/espacio.py) (una línea con el nombre del canal).
    CANAL=otro-canal .venv/bin/python herramientas/montar.py videos/001-tema/guion.json
"""

import json
import os
import re
import sys
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import espacio  # noqa: E402
import esquema  # noqa: E402
import sistema  # noqa: E402

RAIZ = espacio.ESPACIO      # el espacio de trabajo (si no se separa, la raíz del kit)
CANALES = espacio.CANALES
ACTIVO = espacio.ACTIVO


@lru_cache(maxsize=1)
def carpeta():
    """Carpeta del canal activo. Sale con un mensaje claro si no hay canal activo o no existe."""
    valor = os.getenv("CANAL") or (ACTIVO.read_text(encoding="utf-8").strip() if ACTIVO.exists() else "")
    if not valor:
        sys.exit("ERROR: no hay canal activo (archivo canal_activo o variable CANAL). "
                 f"Canales: {', '.join(canales()) or 'ninguno'}")
    p = Path(valor)
    if p.name == "canal.json":
        p = p.parent
    for candidato in (p, Path.cwd() / p, RAIZ / p, CANALES / valor):
        if candidato.is_absolute() and (candidato / "canal.json").exists():
            return candidato.resolve()
    sys.exit(f"ERROR: el canal '{valor}' no existe (se busca canales/<canal>/canal.json). "
             f"Canales: {', '.join(canales()) or 'ninguno'}")


def canales():
    """Nombres de los canales del kit (sin los archivados, que empiezan por _)."""
    return sorted(p.parent.name for p in CANALES.glob("*/canal.json") if not p.parent.name.startswith("_"))


def ruta(p):
    """Resuelve una ruta de un guion o de la línea de comandos: absoluta; relativa al directorio actual si
    existe; si no, relativa a la carpeta del canal (videos/NNN-slug/... funciona desde cualquier sitio)."""
    p = Path(p)
    if p.is_absolute():
        return p
    if (Path.cwd() / p).exists():
        return (Path.cwd() / p).resolve()
    return carpeta() / p


def recurso(tipo, nombre):
    """Recurso compartido (musica, sfx, fuentes): primero el del canal (canales/<canal>/recursos/<tipo>/),
    si no, el de la biblioteca común del kit (recursos/<tipo>/)."""
    propio = carpeta() / "recursos" / tipo / nombre
    return propio if propio.exists() else RAIZ / "recursos" / tipo / nombre


# Campos que un guion.json puede traer y, si no los trae, se toman del canal.
HEREDABLES = ("voz", "velocidad", "estilo", "personajes", "referencias")


@lru_cache(maxsize=1)
def config():
    texto = (carpeta() / "canal.json").read_text(encoding="utf-8")
    if "<<RELLENAR" in texto:   # canal a medio crear con /nuevo-canal (plantillas/canal/)
        print(f"AVISO: {carpeta().name}/canal.json tiene {texto.count('<<RELLENAR')} campos sin rellenar "
              "(herramientas/canales.py pendientes <canal>)", file=sys.stderr)
    return json.loads(texto)


def progreso(paso=None, pasos=None, etapa=""):
    """Mueve la barra de progreso de la UI («@progreso 7/18 Escena 7» o «@progreso - Uniendo»). Solo cuando la
    tarea la lanza la UI (CANALYT_PROGRESO=1): en la terminal no ensucia la salida ni rompe a quien la lee."""
    if not os.environ.get("CANALYT_PROGRESO"):
        return
    cifra = f"{paso}/{pasos}" if pasos else "-"
    print(f"@progreso {cifra} {etapa}".rstrip(), flush=True)


def evento(tipo, **datos):
    """Evento estructurado para la UI («@evento {"tipo": "imagen", "ident": "03-2", "estado": "generada"}»): lo que la
    barra de progreso necesita contar, sin depender del texto que se imprime para las personas. Igual que `progreso`,
    solo cuando la tarea la lanza la UI (CANALYT_PROGRESO=1)."""
    if not os.environ.get("CANALYT_PROGRESO"):
        return
    print("@evento " + json.dumps({"tipo": tipo, **datos}, ensure_ascii=False), flush=True)


def get(clave, defecto=None):
    return config().get(clave, defecto)


class GuionNoValido(SystemExit):
    """El guion no existe, no se puede leer o no es JSON válido. Es un SystemExit: en una herramienta termina con
    código 1 y «ERROR: …» en stderr, sin traceback; quien importe el kit puede capturarlo."""


def leer_guion(p, completo=False):
    """(ruta, guion) de un guion.json: la ruta resuelta como `ruta()`, y el guion en la versión de esquema actual
    (con `completo`, además con lo heredado del canal: `completar_guion`). Si es de una versión más nueva de
    YTCreator, avisa en stderr. Toda herramienta que reciba un guion lo lee con esto, no con json.loads a mano."""
    r = ruta(p)
    try:
        p = r.resolve().relative_to(espacio.ESPACIO.resolve())      # en los mensajes, la ruta corta
    except ValueError:
        pass
    if not r.is_file():
        raise GuionNoValido(f"ERROR: no existe el guion {p}")
    try:
        datos = json.loads(r.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise GuionNoValido(f"ERROR: {p} está dañado (línea {e.lineno}, columna {e.colno}: {e.msg}). Corrígelo "
                            "(o pide a Claude que lo arregle) y vuelve a lanzarlo.") from None
    except (OSError, UnicodeDecodeError) as e:
        raise GuionNoValido(f"ERROR: no se pudo leer {p}: {e}") from None
    if not isinstance(datos, dict):
        raise GuionNoValido(f"ERROR: {p} no es un guion (tendría que ser un objeto con \"escenas\")")
    if aviso := esquema.aviso("guion", datos):
        print(f"Aviso: {aviso}", file=sys.stderr, flush=True)
    return r, (completar_guion(datos) if completo else esquema.migrar("guion", datos))


@contextmanager
def _cerrojo_guion(r):
    """Cerrojo exclusivo por guion (tmp/guion.lock del vídeo, ya fuera de Git): la UI, el vigilante y las herramientas
    que lo reescriben esperan su turno. Lo libera el sistema aunque el proceso muera."""
    with sistema.cerrojo(r.parent / "tmp" / "guion.lock"):
        yield


def editar_guion(p, cambio):
    """Cambia un guion.json sin perder lo que otro haya guardado entre medias: dentro del cerrojo lo relee (estricto:
    si está dañado, archivos.ArchivoDanado y no se toca), lo migra, llama a `cambio(guion)` y, si no lanza nada y
    devuelve algo distinto de False, lo guarda sellado (atómico). Devuelve lo que devuelva `cambio`. Toda escritura
    de un guion pasa por aquí (la UI, el vigilante y las herramientas); Claude edita con su herramienta, que ya se
    niega a escribir si el archivo cambió desde que lo leyó."""
    r = ruta(p)
    if not r.is_file():
        raise FileNotFoundError(f"no existe el guion {r}")
    with _cerrojo_guion(r):
        texto = r.read_text(encoding="utf-8")
        guion = archivos.leer_json(r)
        if not isinstance(guion, dict):
            raise ValueError(f"{r.name} no es un guion (tendría que ser un objeto con \"escenas\")")
        guion = esquema.migrar("guion", guion)
        resultado = cambio(guion)
        if resultado is not False:
            archivos.escribir_json(r, esquema.sellar("guion", guion), final_linea=texto.endswith("\n"))
    return resultado


def completar_guion(guion):
    """Devuelve el guion con los campos heredables del canal que no traiga, en la versión de esquema actual
    (esquema.py). Los "personajes" se suman: el guion añade los de su vídeo (p. ej. {"abeja": "..."}) y conserva los
    del canal ({tok})."""
    guion = esquema.migrar("guion", guion)
    completo = {**{k: config()[k] for k in HEREDABLES if k in config()}, **guion}
    completo["personajes"] = {**config().get("personajes", {}), **guion.get("personajes", {})}
    return completo


# Tipografías por papel. Por defecto, las del kit original (así un canal.json sin "fuentes" sigue igual).
FUENTES_POR_DEFECTO = {
    "titulo": {"archivo": "LuckiestGuy-Regular.ttf", "nombre": "Luckiest Guy"},
    "subtitulo": {"archivo": "Nunito-Black.ttf", "nombre": "Nunito Black"},
    "rotulo": {"archivo": "Baloo2-ExtraBold.ttf", "nombre": "Baloo 2 ExtraBold"},
    "texto": {"archivo": "Nunito-Bold.ttf", "nombre": "Nunito"},
}


def fuente(papel):
    """(ruta del .ttf, nombre de familia) de la tipografía de un papel: titulo, subtitulo, rotulo o texto.
    El nombre es el que usan los subtítulos .ass (libass busca la fuente por nombre en recursos/fuentes)."""
    cfg = {**FUENTES_POR_DEFECTO.get(papel, FUENTES_POR_DEFECTO["texto"]), **get("fuentes", {}).get(papel, {})}
    return recurso("fuentes", cfg["archivo"]), cfg["nombre"]


def color(nombre, defecto):
    """Color del canal como tupla RGB ('#F58C32' → (245, 140, 50)). Sin rellenar (<<RELLENAR>>), el de defecto."""
    valor = get("colores", {}).get(nombre, defecto)
    if not re.fullmatch(r"#?[0-9A-Fa-f]{6}", valor):
        valor = defecto
    valor = valor.lstrip("#")
    return tuple(int(valor[i:i + 2], 16) for i in (0, 2, 4))


def color_ass(nombre, defecto):
    """Color del canal en formato ASS (&H00BBGGRR&)."""
    r, g, b = color(nombre, defecto)
    return f"&H00{b:02X}{g:02X}{r:02X}&"


def pose(nombre):
    """Ruta de la imagen de una pose del personaje (fondo blanco), según el patrón de canal.json."""
    if not get("poses"):
        sys.exit("ERROR: el canal no tiene personaje fijo (canal.json → \"poses\")")
    return ruta(get("poses").format(pose=nombre))

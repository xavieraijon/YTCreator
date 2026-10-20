"""motor_ia: el ÚNICO sitio que arma y lanza la IA del kit (hoy, el CLI de Claude con la suscripción del usuario).

Por qué existe
--------------
La orden del CLI se armaba a mano en cuatro sitios (chat de la UI, sugerencias de prompts, corregir_prompts y la comprobación
del asistente) y los cuatro tenían los mismos defectos:

  1. Sin `--model` ni `--effort`: el tiempo y la calidad de cada encargo dependían del entorno con el que se arrancó el servidor
     (AS Video Studio midió 606 s sin `--effort` frente a 67 s con `low` para el mismo texto).
  2. Entorno heredado tal cual: con `ANTHROPIC_API_KEY`, un token o una pasarela en el entorno, el CLI deja de usar la
     suscripción y factura por uso SIN avisar. Aquí se borran del entorno del proceso hijo.
  3. Errores como texto crudo: «sin sesión», «cupo agotado» y «tiempo agotado» llegaban como un trozo de JSON o stderr.
  4. Nada de salud: «con sesión» no es «funciona».

Y es la base del adaptador multi-IA: quien llama pide un USO («produccion», «asistente», «sugerencia», «revision») y el motor
decide modelo, esfuerzo, entorno y cómo clasificar el fallo. Para soportar otra IA (ChatGPT, Gemini…) se añade un adaptador a
`ADAPTADORES` con la misma interfaz y se elige en `data/ajustes.json` → `motor_ia.proveedor`.

Configuración (de más a menos prioridad)
----------------------------------------
  - Variables de entorno `CANALYT_IA_MODELO` y `CANALYT_IA_ESFUERZO` (todo, pruebas), `CANALYT_IA_MODO` (`suscripcion`|`api`).
  - `data/ajustes.json` → `motor_ia`: `{"proveedor": "claude", "modo": "suscripcion",
    "perfiles": {"produccion": {"modelo": "opus", "esfuerzo": "high"}}}`.
  - Los perfiles por defecto de `PERFILES`.
  - `CANALYT_CLAUDE` cambia el ejecutable (las pruebas usan uno falso); `CANALYT_AJUSTES` y `CANALYT_SALUD_IA` cambian los ficheros.

Reglas que se aplican siempre
-----------------------------
  - Esfuerzo y modelo explícitos y validados (un alias mal escrito solo se descubre después de pagar el arranque y la espera).
  - Un tiempo agotado y un cupo agotado NO se reintentan: volverían a fallar.
  - Un estado de salud malo se queda hasta que una llamada vuelve a salir bien; nadie adivina cuándo se renueva un cupo.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import espacio  # noqa: E402
from sistema import adaptar_orden  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]

# ------------------------------------------------------------------ errores


class ErrorIA(RuntimeError):
    """Base de los fallos de la IA. `estado` es el de la salud: cupo | sesion | tiempo | error."""
    estado = "error"


class TiempoAgotado(ErrorIA):
    estado = "tiempo"


class LimiteAgotado(ErrorIA):
    """Se acabó el cupo de la suscripción. El mensaje del CLI lleva la fecha de renovación: se enseña tal cual."""
    estado = "cupo"


class SinSesion(ErrorIA):
    estado = "sesion"


# ------------------------------------------------------------------ perfiles

MODELOS = ("haiku", "sonnet", "opus")
ESFUERZOS = ("low", "medium", "high", "xhigh", "max")
_MODELO_COMPLETO = re.compile(r"^claude-[a-z0-9][a-z0-9.\-]*$")        # el catálogo cambia más rápido que este fichero


@dataclass(frozen=True)
class Perfil:
    modelo: str
    esfuerzo: str
    tiempo_max_s: int


#: Un perfil por USO. «produccion» es el chat de un vídeo (donde Claude escribe guiones, escaletas e investiga): un turno puede
#: durar horas. Defecto elegido por el usuario (04/10/2026): sonnet/medium; se sube en Ajustes si un vídeo lo pide. Los demás son respuestas cortas.
PERFILES: dict[str, Perfil] = {
    "produccion": Perfil("sonnet", "medium", 3 * 3600),
    "asistente": Perfil("sonnet", "medium", 3 * 3600),
    "sugerencia": Perfil("sonnet", "medium", 600),
    "revision": Perfil("sonnet", "high", 900),
    "prueba": Perfil("haiku", "low", 90),
}


def modelo_valido(valor) -> str:
    v = str(valor or "").strip().lower()
    if v in MODELOS or _MODELO_COMPLETO.match(v):
        return v
    raise ValueError(f"Modelo no válido: «{valor}» (usa {', '.join(MODELOS)} o un id completo)")


def esfuerzo_valido(valor) -> str:
    v = str(valor or "").strip().lower()
    if v in ESFUERZOS:
        return v
    raise ValueError(f"Esfuerzo no válido: «{valor}» (usa {', '.join(ESFUERZOS)})")


def _ruta_ajustes() -> Path:
    return Path(os.environ.get("CANALYT_AJUSTES") or espacio.AJUSTES)


def _ajustes() -> dict:
    try:
        d = json.loads(_ruta_ajustes().read_text(encoding="utf-8"))
        return d.get("motor_ia") if isinstance(d, dict) and isinstance(d.get("motor_ia"), dict) else {}
    except (OSError, ValueError):
        return {}


def perfil(uso: str) -> Perfil:
    """El perfil de un uso: ajustes del usuario por encima de los de fábrica, y el entorno por encima de todo."""
    if uso not in PERFILES:
        raise ValueError(f"Uso desconocido: {uso} ({', '.join(PERFILES)})")
    base = PERFILES[uso]
    propio = (_ajustes().get("perfiles") or {}).get(uso) or {}
    modelo, esfuerzo, tiempo = base.modelo, base.esfuerzo, base.tiempo_max_s
    try:
        if propio.get("modelo"):
            modelo = modelo_valido(propio["modelo"])
        if propio.get("esfuerzo"):
            esfuerzo = esfuerzo_valido(propio["esfuerzo"])
        if isinstance(propio.get("tiempo_max_s"), (int, float)) and propio["tiempo_max_s"] > 0:
            tiempo = int(propio["tiempo_max_s"])
    except ValueError:
        pass                                            # un ajuste mal escrito no tumba la herramienta: manda el de fábrica
    if os.environ.get("CANALYT_IA_MODELO"):
        modelo = modelo_valido(os.environ["CANALYT_IA_MODELO"])
    if os.environ.get("CANALYT_IA_ESFUERZO"):
        esfuerzo = esfuerzo_valido(os.environ["CANALYT_IA_ESFUERZO"])
    return Perfil(modelo, esfuerzo, tiempo)


# ------------------------------------------------------------------ entorno

#: Variables que le cambian el razonamiento al CLI. `--effort` ya las pisa, pero `MAX_THINKING_TOKENS` actúa por su cuenta y el
#: servidor se arranca a veces desde una sesión que las trae puestas: se quitan para que tarde lo mismo desde donde se lance.
ENTORNO_RAZONAMIENTO = ("CLAUDE_EFFORT", "MAX_THINKING_TOKENS")

#: Las que sacan la llamada FUERA de la suscripción: una clave de API, un token, una pasarela o un proveedor en la nube.
ENTORNO_PAGO_POR_USO = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
                        "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY")


def modo() -> str:
    """`suscripcion` (por defecto: ninguna variable heredada puede facturar por uso) o `api` (el usuario lo pide expresamente)."""
    m = (os.environ.get("CANALYT_IA_MODO") or _ajustes().get("modo") or "suscripcion").strip().lower()
    return m if m in ("suscripcion", "api") else "suscripcion"


def entorno(extra: dict | None = None) -> dict:
    """El entorno del proceso hijo: el del servidor sin lo que cambiaría el razonamiento ni (en modo suscripción) el pago."""
    env = dict(os.environ)
    for v in ENTORNO_RAZONAMIENTO:
        env.pop(v, None)
    if modo() == "suscripcion":
        for v in ENTORNO_PAGO_POR_USO:
            env.pop(v, None)
    env.update(extra or {})
    return env


# ------------------------------------------------------------------ clasificar fallos

_LIMITE_QUE = ("limit", "límite", "limite", "quota", "cuota")
_LIMITE_COMO = ("reset", "renov", "reach", "hit your", "has alcanzado", "has agotado", "agotado", "exceed", "superado",
                "upgrade", "usage")
_SESION = ("not logged in", "no estás", "no estas", "please log in", "/login", "login required", "authenticat", "oauth",
           "token expired", "expired", "credential", "unauthorized", "401", "sesión", "sesion", "caduc")


def clasificar(texto: str, codigo: int = 0):
    """Convierte lo que dijo el CLI (stderr o el `result` de un sobre con `is_error`) en una excepción tipada, o None si no
    reconoce nada. Se casa por PAREJAS de palabras y no por frases enteras: el texto exacto cambia con cada versión del CLI."""
    t = " ".join(str(texto or "").split())
    if not t:
        return None
    bajo = t.lower()
    if any(q in bajo for q in _LIMITE_QUE) and any(c in bajo for c in _LIMITE_COMO):
        return LimiteAgotado(t[:400])
    if any(s in bajo for s in _SESION):
        return SinSesion(t[:400])
    return None


# ------------------------------------------------------------------ el adaptador de Claude


def ejecutable() -> str:
    propio = os.environ.get("CANALYT_CLAUDE")
    if propio:
        return propio
    return shutil.which("claude") or str(Path.home() / ".local" / "bin" / "claude")


class Claude:
    """CLI de Claude Code. Otro proveedor implementa lo mismo (`nombre`, `disponible`, `orden`)."""
    nombre = "claude"
    etiqueta = "Claude Code"

    def disponible(self) -> bool:
        e = ejecutable()
        return bool(shutil.which(e) or Path(e).exists())

    def orden(self, uso, instruccion, *, salida="json", permitidas=(), vetadas=(), sesion=None, sistema=None,
              extra=()) -> list[str]:
        p = perfil(uso)
        instruccion, sistema = adaptar_orden(instruccion), sistema and adaptar_orden(sistema)    # Windows
        permitidas, vetadas = [adaptar_orden(x) for x in permitidas], [adaptar_orden(x) for x in vetadas]
        args = [ejecutable(), "-p", instruccion, "--output-format", salida, "--model", p.modelo, "--effort", p.esfuerzo]
        args += list(extra)
        if sistema:
            args += ["--append-system-prompt", sistema]
        if permitidas:
            args += ["--allowedTools", *permitidas]
        if vetadas:
            args += ["--disallowedTools", *vetadas]
        if sesion:
            args += ["--resume", sesion]
        return args


ADAPTADORES = {"claude": Claude()}


def proveedor():
    nombre = str(os.environ.get("CANALYT_IA_PROVEEDOR") or _ajustes().get("proveedor") or "claude").strip().lower()
    if nombre not in ADAPTADORES:
        raise ErrorIA(f"Proveedor de IA no soportado todavía: «{nombre}». Disponibles: {', '.join(ADAPTADORES)}")
    return ADAPTADORES[nombre]


@dataclass
class Orden:
    args: list
    env: dict
    perfil: Perfil
    uso: str
    extra: dict = field(default_factory=dict)


def preparar(uso, instruccion, **kw) -> Orden:
    """Todo lo que hace falta para lanzar el proceso: argumentos, entorno limpio y perfil. Quien llama lo lanza (asyncio o no)."""
    prov = proveedor()
    return Orden(args=prov.orden(uso, instruccion, **kw), env=entorno(), perfil=perfil(uso), uso=uso)


def disponible() -> bool:
    try:
        return proveedor().disponible()
    except ErrorIA:
        return False


# ------------------------------------------------------------------ salud


def _ruta_salud() -> Path:
    return Path(os.environ.get("CANALYT_SALUD_IA") or espacio.DATOS / "salud_ia.json")


_cerrojo = threading.Lock()


def _cuenta() -> str:
    return os.environ.get("CLAUDE_CONFIG_DIR") or "defecto"


def anotar(estado: str, mensaje: str = "", uso: str = "") -> None:
    """Apunta cómo respondió la IA la última vez (ok, cupo, sesion, tiempo, error). Nunca debe romper la llamada."""
    try:
        with _cerrojo:
            ruta = _ruta_salud()
            try:
                d = json.loads(ruta.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                d = {}
            d[_cuenta()] = {"proveedor": proveedor().nombre, "estado": estado, "mensaje": str(mensaje)[:400], "uso": uso,
                            "cuando": datetime.now().isoformat(timespec="seconds")}
            ruta.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=ruta.parent, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(d, fh, ensure_ascii=False, indent=1)
            os.replace(tmp, ruta)
    except Exception:                                   # noqa: BLE001 — la salud es informativa
        pass


def salud() -> dict:
    """Lo último que se sabe de la IA: {proveedor, etiqueta, disponible, estado, mensaje, cuando}."""
    try:
        prov = proveedor()
    except ErrorIA as e:
        return {"proveedor": None, "etiqueta": "—", "disponible": False, "estado": "error", "mensaje": str(e), "cuando": None}
    try:
        d = json.loads(_ruta_salud().read_text(encoding="utf-8")).get(_cuenta()) or {}
    except (OSError, ValueError):
        d = {}
    return {"proveedor": prov.nombre, "etiqueta": prov.etiqueta, "disponible": prov.disponible(),
            "estado": d.get("estado") or "desconocido", "mensaje": d.get("mensaje") or "", "cuando": d.get("cuando"),
            "modo": modo(), "perfiles": {u: vars(perfil(u)) for u in PERFILES if u != "prueba"}}


def describir(exc: Exception) -> str:
    """El fallo, dicho en cristiano para quien mira la pantalla (el mensaje del CLI ya trae la fecha de renovación)."""
    if isinstance(exc, LimiteAgotado):
        return f"Se ha agotado el cupo de tu suscripción de IA. Vuelve a probar cuando se renueve. Detalle: {exc}"
    if isinstance(exc, SinSesion):
        return f"La IA no tiene sesión iniciada o ha caducado: entra de nuevo con tu cuenta. Detalle: {exc}"
    if isinstance(exc, TiempoAgotado):
        return f"La IA tardó demasiado en contestar. {exc}"
    return str(exc)


def registrar_resultado(texto: str, uso: str = "", error: bool = False, codigo: int = 0) -> None:
    """Para quien lanza el proceso por su cuenta (streaming): anota el resultado. Si hay fallo conocido, lo devuelve tipado."""
    if not error and codigo == 0:
        anotar("ok", "", uso)
        return
    exc = clasificar(texto, codigo)
    anotar(exc.estado if exc else "error", str(exc) if exc else str(texto)[:300], uso)


# ------------------------------------------------------------------ una llamada de una sola respuesta


def ejecutar(uso, instruccion, *, cwd=None, tiempo=None, **kw):
    """Una llamada síncrona de una respuesta (`--output-format json`). -> (texto, sobre). Lanza TiempoAgotado, LimiteAgotado,
    SinSesion o ErrorIA. Anota la salud. Sin reintentos."""
    o = preparar(uso, instruccion, salida="json", **kw)
    limite = tiempo or o.perfil.tiempo_max_s
    try:
        r = subprocess.run(o.args, cwd=cwd, env=o.env, capture_output=True, text=True, timeout=limite,
                           stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        anotar("tiempo", f"más de {limite} s sin contestar", uso)
        raise TiempoAgotado(f"La IA no contestó en {limite} s")
    except OSError as e:
        anotar("error", str(e), uso)
        raise ErrorIA(f"No se pudo lanzar la IA: {e}")
    try:
        sobre = json.loads(r.stdout)
    except ValueError:
        sobre = {}
    texto = str(sobre.get("result") or "")
    if r.returncode != 0 or sobre.get("is_error") or not sobre:
        detalle = texto or (r.stderr or r.stdout or "").strip()
        exc = clasificar(detalle, r.returncode) or ErrorIA(detalle[-300:] or f"salió con código {r.returncode}")
        anotar(exc.estado, str(exc), uso)
        raise exc
    anotar("ok", "", uso)
    return texto, sobre


#: Sin herramientas el CLI contesta en un solo turno: para una prueba o para redactar no hay nada que leer ni escribir.
HERRAMIENTAS_VETADAS = ("Bash", "Read", "Write", "Edit", "NotebookEdit", "Glob", "Grep", "WebFetch", "WebSearch", "Task",
                        "Agent", "TodoWrite")


def conexion() -> dict:
    """Los pasos para conectar Claude con la plataforma, sin gastar nada: ¿está instalado el CLI? ¿hay sesión iniciada? ¿con qué
    cuenta (suscripción o clave de pago por uso)? Lo contesta `claude --version` y `claude auth status`, que no llaman al modelo."""
    exe = ejecutable()
    res = {"instalado": False, "version": None, "con_sesion": False, "metodo": None, "suscripcion": None, "por_uso": False}
    if not (shutil.which(exe) or Path(exe).exists()):
        return res

    def correr(*args):
        try:
            return subprocess.run([exe, *args], env=entorno(), capture_output=True, text=True, timeout=20, stdin=subprocess.DEVNULL)
        except (OSError, subprocess.TimeoutExpired):
            return None
    v = correr("--version")
    if v is None or v.returncode != 0:
        return res
    res.update(instalado=True, version=(v.stdout.strip().split() or [None])[0])
    a = correr("auth", "status")
    try:
        d = json.loads(a.stdout) if a is not None else {}
    except ValueError:
        d = {}
    if isinstance(d, dict) and d.get("loggedIn"):
        metodo = str(d.get("authMethod") or "")
        res.update(con_sesion=True, metodo=metodo or None, suscripcion=d.get("subscriptionType"),
                   por_uso=metodo != "claude.ai" or d.get("apiProvider") not in (None, "firstParty"))
    return res


def probar() -> dict:
    """La llamada mínima que dice si la IA contesta (modelo más barato, una palabra). Es lo que hay tras el botón «Probar»."""
    inicio = time.time()
    try:
        ejecutar("prueba", "Responde solo: ok", tiempo=perfil("prueba").tiempo_max_s, vetadas=HERRAMIENTAS_VETADAS)
    except ErrorIA as e:
        return {"ok": False, "estado": e.estado, "mensaje": str(e), "segundos": round(time.time() - inicio, 1)}
    return {"ok": True, "estado": "ok", "mensaje": "", "segundos": round(time.time() - inicio, 1)}

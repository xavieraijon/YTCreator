"""Claude sugiere un prompt corregido para una imagen marcada como mal: actúa como el director de arte (lee su
oficio, la ficha del canal y el brief del vídeo), MIRA la imagen, y responde con el prompt y la explicación.

Usa el CLI `claude -p` con la sesión de claude.ai (la suscripción del usuario, sin API de pago), desde la raíz
del kit (carga CLAUDE.md) y SOLO con herramientas de lectura: no puede tocar ningún archivo. Tarda ≈ 30 s.
CANALYT_CLAUDE cambia el ejecutable (los tests usan uno falso)."""

import asyncio
import json
import re

from . import config

import motor_ia  # noqa: E402  (herramientas/, en sys.path por config)

TIEMPO_MAXIMO = 300
LECTURA = ["Read", "Glob", "Grep"]
PROHIBIDAS = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Agent"]
_en_marcha: set[str] = set()


class ErrorSugerencia(RuntimeError):
    pass


def ejecutable() -> str:
    return motor_ia.ejecutable()


def instrucciones(canal: str, carpeta_video: str, ident: str, prompt: str, motivo: str, motor: str,
                  texto_escena: str, hay_brief: bool, hay_ficha: bool) -> str:
    """El encargo para Claude (rutas relativas a la raíz del kit)."""
    base = f"canales/{canal}"
    lecturas = ["`.claude/agents/director-arte.md` (secciones «Cómo se construye un prompt», «Lo que sabemos del "
                "modelo», «Reglas generales» y «Revisar las imágenes»)"]
    if hay_ficha:
        lecturas.append(f"la ficha `{base}/equipo/director-arte.md`")
    if hay_brief:
        lecturas.append(f"`{base}/videos/{carpeta_video}/brief_visual.md`")
    servicio = ("ai33 (Nano Banana 2, de pago, con una imagen de referencia de estilo; bueno con personas y manos)"
                if motor == "ai33" else "klein (FLUX.2 klein 4B, gratis; flojo con personas, manos y camas)")
    return f"""Actúa como el director de arte del canal. Lee primero {", ".join(lecturas)}.

El usuario ha marcado como MAL la imagen {ident} del vídeo `{base}/videos/{carpeta_video}/`.
- Motivo del usuario: «{motivo}»
- Se genera con: {servicio}.
- Lo que dice la voz en esa escena: «{texto_escena}»
- Prompt actual (del guion, con los {{personajes}} sin sustituir):
{prompt}

Mira la imagen actual (`{base}/videos/{carpeta_video}/img/{ident}.png`) para ver exactamente qué ha salido mal y
por qué (a menudo el propio prompt se contradice o pide más de lo que el modelo sabe dibujar). Escribe un prompt
corregido que lo evite, con el método del director de arte: concreto, en inglés, que siga contando lo que dice la
voz, con los {{personajes}} tal cual y el mismo encuadre salvo que el encuadre sea la causa. Di también qué
servicio recomiendas para esta imagen. No escribas ni cambies ningún archivo.

Responde SOLO con un objeto JSON, sin texto alrededor ni bloque de código:
{{"prompt": "<prompt corregido>", "explicacion": "<en castellano, 1-3 frases: qué falló y qué cambias>", "servicio": "klein" o "ai33"}}"""


def _extraer(texto: str) -> dict:
    """El JSON de la respuesta (tolera un bloque de código o texto alrededor)."""
    m = re.search(r"\{.*\}", texto or "", re.S)
    if not m:
        raise ErrorSugerencia("Claude no devolvió una sugerencia con el formato esperado")
    try:
        datos = json.loads(m.group(0))
    except json.JSONDecodeError:
        raise ErrorSugerencia("Claude no devolvió una sugerencia con el formato esperado")
    prompt = " ".join(str(datos.get("prompt") or "").split())
    if not prompt:
        raise ErrorSugerencia("Claude no propuso ninguna descripción")
    servicio = datos.get("servicio") if datos.get("servicio") in ("klein", "ai33") else None
    return {"prompt": prompt, "explicacion": str(datos.get("explicacion") or "").strip(), "servicio": servicio}


def instrucciones_lote(canal: str, carpeta_video: str, imagenes: list[dict], hay_brief: bool, hay_ficha: bool) -> str:
    """Encargo para corregir VARIAS imágenes de una vez (modo revisión). Cada imagen: ident, prompt, motivo,
    motor y texto (lo que dice la voz)."""
    base = f"canales/{canal}"
    lecturas = ["`.claude/agents/director-arte.md` (secciones «Cómo se construye un prompt», «Lo que sabemos del "
                "modelo», «Reglas generales» y «Revisar las imágenes»)"]
    if hay_ficha:
        lecturas.append(f"la ficha `{base}/equipo/director-arte.md`")
    if hay_brief:
        lecturas.append(f"`{base}/videos/{carpeta_video}/brief_visual.md`")
    lista = "\n\n".join(
        f"### {i['ident']} (se genera con {'ai33' if i['motor'] == 'ai33' else 'klein'})\n"
        f"- Motivo del usuario: «{i['motivo']}»\n- Lo que dice la voz: «{i['texto']}»\n"
        f"- Imagen actual: `{base}/videos/{carpeta_video}/img/{i['ident']}.png`\n- Prompt actual:\n{i['prompt']}"
        for i in imagenes)
    return f"""Actúa como el director de arte del canal. Lee primero {", ".join(lecturas)}.

El usuario ha revisado el vídeo `{base}/videos/{carpeta_video}/` y ha marcado como MAL {len(imagenes)} imágenes.
Mira CADA imagen actual para ver exactamente qué ha salido mal y por qué (a menudo el prompt se contradice o pide
más de lo que el modelo sabe dibujar) y escribe para cada una un prompt corregido con el método del director de
arte: concreto, en inglés, que siga contando lo que dice la voz, con los {{personajes}} tal cual. Si varias
imágenes comparten un objeto o personaje (una diligencia, un médico), descríbelo IGUAL en todas para que salgan
coherentes. Recomienda el servicio de cada una: klein (gratis; flojo contando cosas, con manos, personas y
personajes repetidos) o ai33 (Nano Banana 2, de pago, ≈ 1.700 créditos; bueno en todo eso). No escribas ni
cambies ningún archivo.

{lista}

Responde SOLO con un objeto JSON, sin texto alrededor ni bloque de código, con una entrada por imagen:
{{"imagenes": {{"<EE-N>": {{"prompt": "<prompt corregido>", "explicacion": "<castellano, 1-2 frases>", "servicio": "klein" o "ai33"}}}}}}"""


def _extraer_lote(texto: str) -> dict:
    m = re.search(r"\{.*\}", texto or "", re.S)
    try:
        datos = json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        datos = None
    if not isinstance(datos, dict) or not isinstance(datos.get("imagenes"), dict):
        raise ErrorSugerencia("Claude no devolvió las correcciones con el formato esperado")
    salida = {}
    for ident, d in datos["imagenes"].items():
        prompt = " ".join(str((d or {}).get("prompt") or "").split())
        if prompt:
            salida[ident] = {"prompt": prompt, "explicacion": str(d.get("explicacion") or "").strip(),
                             "servicio": d.get("servicio") if d.get("servicio") in ("klein", "ai33") else None}
    if not salida:
        raise ErrorSugerencia("Claude no propuso ninguna descripción")
    return salida


async def sugerir_lote(clave: str, encargo: str) -> dict:
    """Como `sugerir`, para varias imágenes: {imagenes: {EE-N: {prompt, explicacion, servicio}}, segundos}."""
    datos = await sugerir(clave, encargo, extraer=_extraer_lote, tiempo=900)
    segundos = datos.pop("segundos", 0)
    return {"imagenes": datos, "segundos": segundos}


async def sugerir(clave: str, encargo: str, extraer=None, tiempo: int = TIEMPO_MAXIMO) -> dict:
    """Lanza `claude -p` y devuelve {prompt, explicacion, servicio, segundos}. Una a la vez por imagen."""
    if clave in _en_marcha:
        raise ErrorSugerencia("Claude ya está pensando una sugerencia para esta imagen")
    _en_marcha.add(clave)
    try:
        try:
            texto, sobre = await asyncio.to_thread(
                motor_ia.ejecutar, "sugerencia", encargo, cwd=config.RAIZ, tiempo=tiempo,
                permitidas=LECTURA, vetadas=PROHIBIDAS)
        except motor_ia.TiempoAgotado:
            raise ErrorSugerencia(f"Claude ha tardado demasiado (más de {tiempo // 60} min): prueba otra vez")
        except motor_ia.LimiteAgotado as e:
            raise ErrorSugerencia(f"Se ha agotado el cupo de tu suscripción de Claude: {e}")
        except motor_ia.SinSesion as e:
            raise ErrorSugerencia(f"Claude no tiene sesión iniciada: entra de nuevo con tu cuenta ({e})")
        except motor_ia.ErrorIA as e:
            raise ErrorSugerencia(f"No se pudo consultar a Claude: {e}")
        datos = (extraer or _extraer)(texto)
        datos["segundos"] = round((sobre.get("duration_ms") or 0) / 1000)
        return datos
    finally:
        _en_marcha.discard(clave)

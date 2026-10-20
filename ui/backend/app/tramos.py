"""Fases C a I con pantalla guiada (mismo patrón que la A y la B, app/fases_ui.py): cada fase se divide en «tramos»,
cada tramo es UNA decisión del usuario con su resultado a la vista (luces, cifras, documentos) y un botón principal.

Un tramo con `mensaje` lo produce Claude en segundo plano («MODO UI», sin chat) y deja archivos conocidos; los que
tienen un `json` de resumen lo muestran como tarjetas. Los demás (voz, imágenes, montaje, miniaturas) reutilizan las
pantallas de trabajo que ya existen. El estado sigue en estado.json y en la carpeta del vídeo (la guía antigua y Claude
lo leen igual): aprobar un tramo = aprobar su punto de la guía; la última aprobación cierra la fase."""

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import config
from .guia import Contexto, _ahora, _guardar, _leer, aprobacion_caducada, de, vigencia

log = logging.getLogger("canalyt.tramos")

CREDITOS_POR_PALABRA = 6.4          # ver fases_ui.py
IMAGENES_POR_DIA = 90


@dataclass
class Ctx:
    """Todo lo que un tramo necesita para decidir su estado y sus luces."""
    video: object                    # modelos.Video
    guia: Contexto
    cfg: dict
    revisor: dict | None = None      # resultado de revisar_guion.py (solo el tramo del guion lo pide)

    @property
    def carpeta(self) -> Path:
        return self.guia.carpeta

    @property
    def estado(self) -> dict:
        return self.guia.estado

    def json(self, nombre: str):
        try:
            return json.loads((self.carpeta / nombre).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None


ORDEN_GRAVEDAD = {"alta": 0, "media": 1, "baja": 2, "sin_clasificar": 3}


def avisos_normalizados(valor) -> list[dict]:
    """Avisos como [{texto, gravedad (alta|media|baja|sin_clasificar), que_hacer}], los más graves primero.
    Acepta los antiguos (texto suelto) y los nuevos (objetos con gravedad)."""
    salida = []
    for a in valor if isinstance(valor, list) else []:
        if isinstance(a, dict):
            texto = str(a.get("texto") or "").strip()
            g = str(a.get("gravedad") or "").lower()
            que = str(a.get("que_hacer") or "").strip()
        else:
            texto, g, que = str(a or "").strip(), "", ""
        if texto:
            salida.append({"texto": texto[:400], "gravedad": g if g in ("alta", "media", "baja") else "sin_clasificar",
                           "que_hacer": que[:300]})
    return sorted(salida, key=lambda x: ORDEN_GRAVEDAD[x["gravedad"]])[:10]


def resumen_gravedad(avisos: list[dict]) -> tuple[str, str]:
    """(valor, color) de un conjunto de avisos: «1 importante, 2 menores» y rojo/ámbar/verde."""
    if not avisos:
        return "Ninguno", "verde"
    n = lambda g: sum(1 for a in avisos if a["gravedad"] == g)
    partes = [f"{n('alta')} {'importante' if n('alta') == 1 else 'importantes'}" if n("alta") else None,
              f"{n('media')} a revisar" if n("media") else None,
              f"{n('baja')} {'menor' if n('baja') == 1 else 'menores'}" if n("baja") else None,
              f"{n('sin_clasificar')} sin clasificar" if n("sin_clasificar") else None]
    color = "rojo" if n("alta") else "ambar" if n("media") or n("sin_clasificar") else "gris"
    return ", ".join(p for p in partes if p), color


def luz(titulo, valor, color="gris", detalle=""):
    return {"titulo": titulo, "valor": str(valor), "color": color, "detalle": detalle}


@dataclass
class Tramo:
    id: str
    fase: str
    titulo: str
    ayuda: str
    vista: str = "doc"
    aprobacion: str | None = None
    boton: str | None = None
    tarda: str | None = None
    archivos: tuple = ()
    docs: tuple = ()
    json: str | None = None
    mensaje: Callable | None = None
    listo: Callable | None = None            # tramos sin Claude: ¿hay algo que aprobar?
    luces: Callable | None = None
    datos: Callable | None = None
    antes: str | None = None                 # titular mientras no hay nada producido («Escribe el guion» → «Lee el guion»)

    def titular(self, prod: bool) -> str:
        return self.antes if self.antes and not prod else self.titulo


# --------------------------------------------------------------------------- encargos a Claude («MODO UI»)

def _base(ctx: Ctx) -> str:
    return f"canales/{ctx.video.canal}/videos/{ctx.video.carpeta}"


def _cabecera(ctx: Ctx, tramo: str) -> str:
    e = ctx.estado
    if ctx.video.tipo == "short":
        datos = [f"Short «{e.get('titulo_provisional') or e.get('tema')}»", f"enfoque: {e.get('enfoque') or '—'}",
                 f"gancho: {e.get('gancho') or '—'}", f"pilar: {e.get('pilar') or '—'}",
                 (f"apoya al vídeo largo canales/{ctx.video.canal}/videos/{e['apoya']}/" if e.get("apoya")
                  else "sin vídeo largo detrás")]
        return (f"MODO UI · Short, fase {ctx.video.fase}, tramo «{tramo}». No me hables ni pidas aprobación: el usuario "
                f"lo verá en pantalla.\nShort: {_base(ctx)}/ · " + " · ".join(datos) + ".")
    datos = [f"tema «{e.get('titulo_provisional') or e.get('tema')}»", f"enfoque: {e.get('enfoque') or '—'}",
             f"duración: {e.get('duracion_objetivo') or '?'} min", f"pilar: {e.get('pilar') or '—'}"]
    if e.get("titulo_elegido"):
        datos.append(f"título elegido: «{e['titulo_elegido']}»")
    if e.get("referencia"):
        datos.append(f"vídeo de referencia: {e['referencia']}")
    return (f"MODO UI · fase {ctx.video.fase}, tramo «{tramo}». No me hables ni pidas aprobación: el usuario lo verá en "
            f"pantalla.\nVídeo: {_base(ctx)}/ · " + " · ".join(datos) + ".")


def _cambios(cambios: str | None) -> str:
    if not cambios:
        return ""
    return ("\nEl usuario pide estos cambios sobre lo que ya hay (revísalo en lugar de rehacerlo desde cero y marca el "
            f"cambio como atendido en estado.json → cambios_pedidos): «{cambios}»")


CIERRE = ("\nTermina con 2-3 líneas para el usuario, sin jerga: qué has hecho, qué has cambiado y por qué, y qué decisiones "
          "has tomado (las verá en el historial del vídeo).")


def msg_investigar(ctx: Ctx, cambios=None) -> str:
    b = _base(ctx)
    return f"""{_cabecera(ctx, 'investigar')}
Sigue la fase C de .claude/commands/nuevo-video.md: busca en la web y verifica cada dato en 2+ fuentes fiables; separa \
comprobado, hipótesis y leyendas; busca enlaces de afiliación honestos. Material para {ctx.estado.get('duracion_objetivo') or 10} min.
Escribe {b}/fuentes.md (como siempre) Y {b}/investigacion.json con este formato exacto:
{{"resumen": "2 frases con lo que da el tema, sin jerga", "comprobados": 12, "hipotesis": 3, "leyendas": 2, "fuentes": 9,
 "actos_posibles": 4, "veredicto": "suficiente|justo|insuficiente",
 "avisos": [{{"texto": "lo que el usuario debe saber, claro y sin jerga", "gravedad": "alta|media|baja", "que_hacer": "qué se hará con ello en el guion"}}],
 "datos": [{{"texto": "dato en una frase", "estado": "comprobado|hipotesis|leyenda", "fuentes": ["[BPS]", "[SHI]"]}}],
 "fuentes_lista": [{{"codigo": "[BPS]", "nombre": "nombre legible de la fuente o título del artículo", "url": "https://…"}}],
 "afiliacion": [{{"titulo": "libro o audiolibro", "url": "https://…"}}]}}
Incluye en «datos» TODOS los datos que podrá usar el guion (hasta 60): las cifras que ve el usuario se cuentan de esa lista. «veredicto»: suficiente = alcanza para la duración elegida. «gravedad» de un \
aviso: alta = cambia el vídeo o puede ser falso/peligroso; media = conviene tenerlo en cuenta al escribir; baja = detalle menor.{_cambios(cambios)}{CIERRE}"""


def msg_empaquetado(ctx: Ctx, cambios=None) -> str:
    b = _base(ctx)
    return f"""{_cabecera(ctx, 'empaquetado')}
Encarga al agente estratega-youtube el empaquetado (fase D, punto 0 de .claude/commands/nuevo-video.md) a partir de \
{b}/fuentes.md. Escribe {b}/empaquetado.md (como siempre) Y {b}/empaquetado.json con este formato exacto:
{{"angulo": "el ángulo en una frase", "promesa": "la promesa que el gancho confirmará en 10 s",
 "titulos": [{{"texto": "título (< 60 caracteres)", "por_que": "una frase sin jerga", "recomendado": true}}],
 "miniatura": {{"muestra": "qué se ve", "oculta": "qué no se ve (la curiosidad)", "texto": "2-4 palabras"}},
 "riesgo_clickbait": "bajo|medio|alto", "riesgo_nota": "una frase"}}
5 títulos, UNO recomendado.{_cambios(cambios)}{CIERRE}"""


def msg_escaleta(ctx: Ctx, cambios=None) -> str:
    b = _base(ctx)
    return f"""{_cabecera(ctx, 'escaleta')}
Encarga al agente narrativa la escaleta (fase D, punto 1 de .claude/commands/nuevo-video.md) con fuentes.md y el \
empaquetado aprobado ({b}/empaquetado.md){' y la estructura de referencia (canales/' + ctx.video.canal + '/analisis/estructuras/, nunca la transcripción)' if ctx.estado.get('referencia') else ''}. \
Escribe {b}/escaleta.md (como siempre) Y {b}/escaleta.json con este formato exacto:
{{"resumen": "la historia en 2 frases", "giro": "el giro final", "cierre": "cómo cierra",
 "actos": [{{"titulo": "…", "pregunta": "la pregunta que abre", "recompensa": "lo que se descubre", "minutos": 2.0}}],
 "avisos": [{{"texto": "recompensa floja o repetida, bucle sin cerrar…; lista vacía si no hay", "gravedad": "alta|media|baja", "que_hacer": "cómo se resolverá"}}]}}
«gravedad»: alta = el vídeo no funciona así (hay que arreglarlo antes del guion); media = mejora clara; baja = pulido.{_cambios(cambios)}{CIERRE}"""


def msg_guion(ctx: Ctx, cambios=None) -> str:
    b = _base(ctx)
    return f"""{_cabecera(ctx, 'guion')}
Con la escaleta aprobada ({b}/escaleta.md) haz los puntos 2-6 de la fase D de .claude/commands/nuevo-video.md, en este orden y \
con los agentes que indica: guionista → guion.json y guion.md (con "pilar"); copia guion_generado.json si no existe; \
verificador → verificacion.md y aplica sus correcciones; narrativa → revision_estructura.md y aplica los cambios con \
sentido; director-arte → brief_visual.md y un prompt por imagen; y `.venv/bin/python herramientas/revisar_guion.py \
{b}/guion.json` sin ERRORES (avisos corregidos o justificados).{' Con vídeo de referencia, comprueba también el solape con estructura_referencia.py --comparar.' if ctx.estado.get('referencia') else ''}
No gastes créditos ni lances montar.py.{_cambios(cambios)}{CIERRE}"""


def msg_publicacion(ctx: Ctx, cambios=None) -> str:
    b = _base(ctx)
    return f"""{_cabecera(ctx, 'publicación')}
Fase H de .claude/commands/nuevo-video.md: traduce {b}/subtitulos.srt a {b}/subtitulos_en.srt (mismos números y tiempos, \
traducción natural) y, con el agente estratega-youtube, repasa publicacion.md y guarda su versión final en \
{b}/publicacion_final.md (títulos, descripción con fuentes y capítulos reales, afiliación con el aviso «(enlace de \
afiliado)», etiquetas, comentario fijado y textos de los Shorts).{_cambios(cambios)}{CIERRE}"""


def msg_aprendizajes(ctx: Ctx, cambios=None) -> str:
    b = _base(ctx)
    return f"""{_cabecera(ctx, 'aprendizajes')}
Fase I (bucle de mejora) de .claude/commands/nuevo-video.md: ejecuta `.venv/bin/python herramientas/comparar_guion.py \
{b}` y, con su salida, el agente guionista escribe {b}/aprendizajes.md (cambios de estructura y de estilo → reglas, \
patrones repetidos y propuesta para su ficha). Si no hay guion_generado.json, escribe un aprendizajes.md que lo diga.{_cambios(cambios)}{CIERRE}"""


def msg_cierre(ctx: Ctx, cambios=None) -> str:
    return f"""{_cabecera(ctx, 'cierre')}
Fase I de .claude/commands/nuevo-video.md, sin el bucle de aprendizajes ya hecho: añade el vídeo a docs/historial.md del \
canal (con la duración real y el pilar) y marca la idea como usada en docs/ideas.md; propón 3 ideas nuevas \
inspiradas en este vídeo, mídelas con saturacion.py y añádelas a ideas.md con pilar y semáforo; actualiza el \
«Siguiente paso» de docs/progreso.md del canal y haz commit (sin los vídeos pesados, como dice CLAUDE.md).{_cambios(cambios)}{CIERRE}"""


def msg_cambios(ctx: Ctx, t: "Tramo", texto: str) -> str:
    """Tramos que no produce Claude (voz, imágenes, montaje, miniaturas): lo que pide el usuario se aplica así."""
    return f"""{_cabecera(ctx, t.titulo.lower())}
El usuario ha pedido cambios en «{t.titulo}» (punto de aprobación {t.aprobacion}): «{texto}»
Aplícalos como indica la fase {t.fase} de .claude/commands/{'nuevo-short' if ctx.video.tipo == 'short' else 'nuevo-video'}.md (p. ej. cambios sobre el TEXTO de la voz: encarga \
al guionista reescribir esas escenas sin tocar datos verificados; sobre imágenes: corrige el prompt con el director-arte y \
deja las marcadas listas para rehacer desde la interfaz). Tú no puedes gastar créditos ni montar: lo que cueste, queda \
indicado para que lo lance el usuario con su botón. Marca el cambio como atendido en estado.json → cambios_pedidos y \
resume en una frase lo que has cambiado en `respuesta`.{CIERRE}"""


# --- Shorts (.claude/commands/nuevo-short.md) ---

def _largo(ctx: Ctx) -> str:
    apoya = ctx.estado.get("apoya")
    return f"canales/{ctx.video.canal}/videos/{apoya}" if apoya else ""


def msg_guion_short(ctx: Ctx, cambios=None) -> str:
    b, largo = _base(ctx), _largo(ctx)
    material = (f"Material del vídeo largo: {largo}/guion.md, {largo}/fuentes.md y {largo}/brief_visual.md."
                if largo else "No hay vídeo largo detrás: verifica el dato con el agente verificador.")
    return f"""{_cabecera(ctx, 'guion')}
Haz la fase B de .claude/commands/nuevo-short.md, en este orden y con los agentes que indica:
1. guionista (modo Short tráiler) → {b}/guion.json ("tipo": "short", "formato": "vertical", 3-5 escenas, 90-140 palabras, una imagen cada 2-4 s, final que remite al vídeo largo) y {b}/guion.md legible.
2. verificador solo si el dato no estaba ya verificado en el vídeo largo (si verificas, deja {b}/verificacion.md).
3. director-arte → un prompt vertical por imagen (sujeto grande y centrado, nada importante en el tercio inferior); reutiliza imágenes del vídeo largo cuando encajen.
4. `.venv/bin/python herramientas/revisar_guion.py {b}/guion.json` sin ERRORES (avisos corregidos o justificados).
{material}
No gastes créditos ni lances montar.py.{_cambios(cambios)}{CIERRE}"""


def msg_publicacion_short(ctx: Ctx, cambios=None) -> str:
    b = _base(ctx)
    return f"""{_cabecera(ctx, 'publicación')}
Lo que va después del montaje en la fase D de .claude/commands/nuevo-short.md: traduce {b}/subtitulos.srt a {b}/subtitulos_en.srt (mismos números y tiempos, traducción natural) y, con el agente estratega-youtube, repasa {b}/publicacion.md y guarda su versión final en {b}/publicacion_final.md (textos para YouTube Shorts, TikTok y Reels, con el enlace al vídeo largo si lo hay y sin «dale a like»).{_cambios(cambios)}{CIERRE}"""


def msg_cierre_short(ctx: Ctx, cambios=None) -> str:
    return f"""{_cabecera(ctx, 'cierre')}
Fase E de .claude/commands/nuevo-short.md: añade el Short a docs/historial.md del canal (sección «Shorts», con el nombre exacto de su carpeta, «{ctx.video.carpeta}», y el vídeo largo al que apoya); actualiza el «Siguiente paso» de docs/progreso.md del canal y haz commit (solo textos: nada de vídeo, audio ni imágenes, como dice CLAUDE.md).{_cambios(cambios)}{CIERRE}"""


# --------------------------------------------------------------------------- luces y datos de cada vista

def _lista(valor, maximo=40):
    return [x for x in (valor if isinstance(valor, list) else []) if isinstance(x, dict)][:maximo]


_ESTADOS_DATO = {"comprobado": "comprobado", "comprobada": "comprobado", "verificado": "comprobado",
                 "hipotesis": "hipotesis", "hipótesis": "hipotesis", "leyenda": "leyenda", "leyendas": "leyenda", "mito": "leyenda"}


def _investigacion(ctx: Ctx) -> tuple[dict | None, list[dict], dict | None]:
    """investigacion.json con una sola fuente para las cifras: si Claude dejó la lista de datos, comprobados, hipótesis
    y leyendas se cuentan de esa lista (lo que el usuario ve y filtra), no de los números que escribió aparte. Un dato
    con un estado que no se reconoce cuenta como hipótesis: nunca se enseña como comprobado sin serlo."""
    j = ctx.json("investigacion.json")
    if not j:
        return None, [], None
    datos = [{"texto": str(d.get("texto", ""))[:300],
              "estado": _ESTADOS_DATO.get(str(d.get("estado", "")).strip().lower(), "hipotesis"),
              "fuentes": d.get("fuentes") or []} for d in _lista(j.get("datos"), 60)]

    def n(k):
        return int(j.get(k)) if str(j.get(k, "")).isdigit() else 0
    if datos:
        conteo = {k: sum(d["estado"] == k for d in datos) for k in ("comprobado", "hipotesis", "leyenda")}
        conteo = {"comprobados": conteo["comprobado"], "hipotesis": conteo["hipotesis"], "leyendas": conteo["leyenda"]}
    else:
        conteo = {k: n(k) for k in ("comprobados", "hipotesis", "leyendas")}
    conteo["fuentes"] = n("fuentes")
    return j, datos, conteo


def luces_investigacion(ctx: Ctx):
    j, _, c = _investigacion(ctx)
    if not j:
        return [luz("Resumen", "Sin resumen", "gris", "Claude no dejó el resumen; lee la investigación completa.")]
    v = str(j.get("veredicto", "")).lower()
    color = {"suficiente": "verde", "justo": "ambar", "insuficiente": "rojo"}.get(v, "gris")
    minutos = ctx.estado.get("duracion_objetivo") or 10
    return [
        luz("¿Da para el vídeo?", {"suficiente": "Sí", "justo": "Justo", "insuficiente": "No"}.get(v, "—"), color,
            f"{j.get('actos_posibles', '?')} actos con material para {minutos} minutos."),
        luz("Datos comprobados", c["comprobados"], "verde" if c["comprobados"] >= 8 else "ambar",
            "Con 2 o más fuentes fiables cada uno."),
        luz("Hipótesis y leyendas", f"{c['hipotesis']} y {c['leyendas']}", "gris",
            "El guion las dirá como tales, nunca como hechos."),
        luz("Fuentes", c["fuentes"] or "—", "gris", "Universidades, museos, revistas y divulgación seria."),
    ]


def datos_investigacion(ctx: Ctx):
    j, datos, conteo = _investigacion(ctx)
    j = j or {}
    return {"resumen": j.get("resumen"), "conteo": conteo, "avisos": avisos_normalizados(j.get("avisos")),
            "datos": datos, "fuentes": _fuentes(ctx, j)}


_FUENTE_MD = re.compile(r"^\s*[-*]\s*\**(\[[A-Za-z0-9]{2,8}\])\**\s*(.+)$")
_URL = re.compile(r"https?://\S+")


def _fuentes(ctx: Ctx, j: dict) -> dict:
    """{«[AND21]»: {nombre, url}} para enseñar el nombre de cada fuente en vez de su código (hallazgo 22). De la lista de
    investigacion.json («fuentes_lista») o, en investigaciones anteriores, de las líneas «- **[COD]** … https://…» de
    fuentes.md. El nombre es el título entre comillas «…» si lo hay."""
    res = {}
    for f in _lista(j.get("fuentes_lista"), 80):
        cod = str(f.get("codigo", "")).strip()
        if cod:
            cod = cod if cod.startswith("[") else f"[{cod}]"
            res[cod] = {"nombre": str(f.get("nombre", ""))[:160] or cod, "url": str(f.get("url", ""))[:300] or None}
    if res:
        return res
    try:
        lineas = (ctx.carpeta / "fuentes.md").read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    for linea in lineas:
        m = _FUENTE_MD.match(linea)
        if not m or m.group(1) in res:
            continue
        resto = m.group(2)
        url = _URL.search(resto)
        texto = resto[:url.start()] if url else resto
        titulo = re.search(r"«([^»]{4,})»", texto)
        nombre = (titulo.group(1) if titulo else re.sub(r"[*_]", "", texto)).strip(" ,.·")
        res[m.group(1)] = {"nombre": nombre[:160], "url": url.group(0).rstrip(").,") if url else None}
    return res


def datos_publicacion(ctx: Ctx):
    """Los enlaces de afiliación los encuentra la investigación, pero se usan en la descripción del vídeo: se enseñan aquí."""
    j = ctx.json("investigacion.json") or {}
    return {"afiliacion": [{"titulo": str(a.get("titulo", ""))[:150], "url": str(a.get("url", ""))[:300]}
                           for a in _lista(j.get("afiliacion"), 6)]}


def luces_empaquetado(ctx: Ctx):
    j = ctx.json("empaquetado.json")
    if not j:
        return [luz("Resumen", "Sin resumen", "gris", "Claude no dejó el resumen; lee el empaquetado completo.")]
    r = str(j.get("riesgo_clickbait", "")).lower()
    return [luz("Riesgo de clickbait", r.capitalize() or "—", {"bajo": "verde", "medio": "ambar", "alto": "rojo"}.get(r, "gris"),
                j.get("riesgo_nota") or "Que el vídeo cumpla lo que promete el título."),
            luz("Títulos propuestos", len(_lista(j.get("titulos"))), "gris", "Elige el que mejor prometa lo que cuenta.")]


def datos_empaquetado(ctx: Ctx):
    j = ctx.json("empaquetado.json") or {}
    m = j.get("miniatura") if isinstance(j.get("miniatura"), dict) else {}
    return {"angulo": j.get("angulo"), "promesa": j.get("promesa"),
            "titulos": [{"n": i, "texto": str(t.get("texto", ""))[:120], "por_que": str(t.get("por_que", ""))[:300],
                         "recomendado": bool(t.get("recomendado"))} for i, t in enumerate(_lista(j.get("titulos"), 8), 1)],
            "miniatura": {k: str(m.get(k, ""))[:300] for k in ("muestra", "oculta", "texto")},
            "elegido": ctx.estado.get("titulo_elegido")}


def luces_escaleta(ctx: Ctx):
    j = ctx.json("escaleta.json")
    if not j:
        return [luz("Resumen", "Sin resumen", "gris", "Claude no dejó el resumen; lee la escaleta completa.")]
    avisos = avisos_normalizados(j.get("avisos"))
    valor, color = resumen_gravedad(avisos)
    return [luz("Avisos del narrador", valor, color,
                "Recompensas flojas o repetidas, bucles sin cerrar." if avisos else "Cada acto tiene su recompensa."),
            luz("Actos", len(_lista(j.get("actos"))), "gris", f"Para {ctx.estado.get('duracion_objetivo') or '?'} minutos.")]


def datos_escaleta(ctx: Ctx):
    j = ctx.json("escaleta.json") or {}
    return {"resumen": j.get("resumen"), "giro": j.get("giro"), "cierre": j.get("cierre"),
            "avisos": avisos_normalizados(j.get("avisos")),
            "actos": [{"titulo": str(a.get("titulo", ""))[:150], "pregunta": str(a.get("pregunta", ""))[:300],
                       "recompensa": str(a.get("recompensa", ""))[:300], "minutos": a.get("minutos")}
                      for a in _lista(j.get("actos"), 10)]}


def _luz_revisor(rev: dict) -> dict:
    ne, na = len(rev.get("errores", [])), len(rev.get("avisos", []))
    return luz("Revisión automática", "Sin errores" if not ne else "1 error" if ne == 1 else f"{ne} errores",
               "rojo" if ne else "verde" if not na else "ambar",
               f"{na} aviso(s) para mirar." if na else "Nada que corregir.")


def luces_guion(ctx: Ctx):
    v, e, rev = ctx.video, ctx.estado, ctx.revisor or {}
    objetivo = e.get("duracion_objetivo") or 0
    dur = v.duracion_estimada or 0
    dc = "gris" if not objetivo or not dur else "verde" if abs(dur - objetivo) <= objetivo * 0.1 else "ambar"
    luces = [luz("Duración", f"≈ {dur:g} min" if dur else "—", dc, f"Objetivo: {objetivo} min." if objetivo else ""),
             luz("Imágenes", v.imagenes_total or "—", "gris",
                 f"≈ {max(1, -(-v.imagenes_total // IMAGENES_POR_DIA))} día(s) de cuota gratis." if v.imagenes_total else "")]
    if rev:
        luces.insert(0, _luz_revisor(rev))
    c = ctx.guia
    luces.append(luz("Datos verificados", "Hecho" if c.existe("verificacion.md") else "Falta", "verde" if c.existe("verificacion.md") else "rojo",
                     "Cada afirmación contra las fuentes."))
    luces.append(luz("Coste de la voz", f"≈ {round((v.palabras or 0) * CREDITOS_POR_PALABRA, -2):,.0f} créditos".replace(",", "."),
                     "gris", "Solo con la voz de pago; la gratis no cuesta."))
    return luces


def datos_guion(ctx: Ctx):
    rev = ctx.revisor or {}
    pasos = [("guion.md", "Guion escrito"), ("verificacion.md", "Datos verificados"),
             ("revision_estructura.md", "Ritmo y estructura revisados"), ("brief_visual.md", "Brief visual"),
             ("guion_generado.json", "Copia para aprender de tus cambios")]
    return {"errores": rev.get("errores", [])[:10], "avisos": rev.get("avisos", [])[:12],
            "resumen": rev.get("resumen"),
            "pasos": [{"texto": t, "hecho": (ctx.carpeta / f).exists()} for f, t in pasos]
            + [{"texto": "Una descripción por imagen", "hecho": bool(ctx.guia.imagenes)}]}


SHORT_SEGUNDOS = (30, 55)              # .claude/commands/nuevo-short.md (descripción)
SHORT_PALABRAS = (90, 140)             # fase B de nuevo-short.md


def luces_guion_short(ctx: Ctx):
    v, rev = ctx.video, ctx.revisor or {}
    seg = round((v.duracion_estimada or 0) * 60)
    pal = v.palabras or 0
    luces = [luz("Duración", f"≈ {seg} s" if seg else "—",
                 "gris" if not seg else "verde" if SHORT_SEGUNDOS[0] <= seg <= SHORT_SEGUNDOS[1] else "ambar",
                 f"Un Short dura entre {SHORT_SEGUNDOS[0]} y {SHORT_SEGUNDOS[1]} segundos."),
             luz("Palabras", pal or "—",
                 "gris" if not pal else "verde" if SHORT_PALABRAS[0] <= pal <= SHORT_PALABRAS[1] else "ambar",
                 f"Entre {SHORT_PALABRAS[0]} y {SHORT_PALABRAS[1]}."),
             luz("Imágenes", v.imagenes_total or "—", "gris", "Una cada 2-4 segundos, en vertical.")]
    if rev:
        luces.insert(0, _luz_revisor(rev))
    luces.append(luz("Coste de la voz", f"≈ {round(pal * CREDITOS_POR_PALABRA, -2):,.0f} créditos".replace(",", "."),
                     "gris", "Solo con la voz de pago; la gratis no cuesta."))
    return luces


def datos_guion_short(ctx: Ctx):
    rev = ctx.revisor or {}
    return {"errores": rev.get("errores", [])[:10], "avisos": rev.get("avisos", [])[:12], "resumen": rev.get("resumen"),
            "pasos": [{"texto": "Guion escrito", "hecho": (ctx.carpeta / "guion.md").exists()},
                      {"texto": "Una descripción por imagen, en vertical", "hecho": bool(ctx.guia.imagenes)}]}


def luces_voz(ctx: Ctx):
    c = ctx.guia
    if c.guion.get("voz_archivo"):              # locución hecha fuera (en un Short, lo habitual: la web de ai33)
        ok = (c.carpeta_canal / str(c.guion["voz_archivo"])).exists()
        return [luz("Locución", "Archivo propio" if ok else "Falta el archivo", "verde" if ok else "rojo",
                    str(c.guion["voz_archivo"]).rsplit("/", 1)[-1])]
    voces = len(list((ctx.carpeta / "voz").glob("[0-9][0-9].wav"))) if (ctx.carpeta / "voz").exists() else 0
    total = ctx.video.escenas_total or 0
    cambiadas = c.voz["cambiadas"]
    extra = ([luz("Texto cambiado", len(cambiadas), "ambar",
                  "Escenas reescritas después de locutarlas: hay que volver a locutarlas (la tarjeta «Locución» da el coste).")]
             if cambiadas else [])
    return [luz("Locución", f"{voces}/{total} escenas" if total else "—", "verde" if total and voces >= total else "ambar" if voces else "rojo",
                "Primero un bloque de prueba; si te gusta, el resto."), *extra,
            luz("Entonación", "Revisada" if c.entonacion_al_dia() else "Sin revisar", "verde" if c.entonacion_al_dia() else "ambar",
                "Finales que suben como pregunta y cortes de la voz (gratis).")]


def luces_imagenes(ctx: Ctx):
    v, c = ctx.video, ctx.guia
    hechas, total = v.imagenes_hechas or 0, v.imagenes_total or 0
    mal = c.marcadas_mal()
    return [luz("Imágenes listas", f"{hechas}/{total}", "verde" if total and hechas >= total else "ambar" if hechas else "rojo",
                "Las que faltan se generan con los botones de abajo."),
            luz("Marcadas como mal", mal or "Ninguna", "ambar" if mal else "verde", "Corrige su descripción y rehazlas."),
            luz("A rehacer", v.imagenes_desactualizadas or "Ninguna", "ambar" if v.imagenes_desactualizadas else "verde",
                "Su descripción cambió después de generarlas.")]


def _luz_control(c, m: dict) -> dict:
    """El control por fotogramas vale para el montaje con el que se hizo: si el vídeo se ha vuelto a montar después o
    está desactualizado, hay que repetirlo (hallazgo 51)."""
    hecho = c.existe("tmp/control.png")
    vigente = hecho and m["al_dia"] and (c.carpeta / "tmp" / "control.png").stat().st_mtime >= c.ultima("final.mp4")
    return luz("Control por fotogramas", "Hecho" if vigente else "Del montaje anterior" if hecho else "Sin hacer",
               "verde" if vigente else "ambar", "Sincronía, rótulos legibles y nada cortado."
               if vigente or not hecho else "Repítelo cuando vuelvas a montar el vídeo.")


def luces_montaje(ctx: Ctx):
    c = ctx.guia
    m = c.montaje
    que = ("El Short final, en vertical y con subtítulos." if ctx.video.tipo == "short"
           else "El vídeo final, con pantalla final y subtítulos.")
    montado = (luz("Vídeo montado", "Sí", "verde", que) if m["al_dia"]
               else luz("Vídeo montado", "Desactualizado", "ambar", "Hay que volver a montarlo: " + ", ".join(m["motivos"]) + ".")
               if m["existe"] else luz("Vídeo montado", "Todavía no", "rojo", que))
    return [montado,
            _luz_control(c, m),
            luz("Música", "Elegida" if c.musica_elegida() else "La del canal", "gris", "La de Suno es opcional y de pago.")]


def luces_miniaturas(ctx: Ctx):
    n = len(list(ctx.carpeta.glob("miniatura_*.jpg")))
    return [luz("Miniaturas", n or "Ninguna", "verde" if n >= 3 else "ambar" if n else "rojo",
                "Las 3 se pueden subir a «Probar y comparar».")]


def luz_cumplimiento(ctx: Ctx):
    """Declaraciones del canal ante YouTube (contenido sintético, afiliación, licencias): canal.json → cumplimiento."""
    cum = (ctx.cfg or {}).get("cumplimiento")
    if not isinstance(cum, dict):
        return luz("Cumplimiento", "Sin declarar", "rojo", "El canal no dice si debe marcar «contenido sintético» ni qué licencias tiene: pídeselo a Claude desde la ficha del canal.")
    if "<<RELLENAR" in json.dumps(cum, ensure_ascii=False):
        return luz("Cumplimiento", "Incompleto", "ambar", "Quedan datos de cumplimiento sin rellenar en la configuración del canal: pídeselo a Claude.")
    sintetico = str(cum.get("contenido_sintetico", "")).lower() in ("si", "sí", "true")
    return luz("Cumplimiento", "Marcar como sintético" if sintetico else "Declarado", "ambar" if sintetico else "verde",
               str(cum.get("motivo_sintetico") or "") or "Comprueba que este vídeo sigue encajando con lo declarado.")


def luces_publicacion(ctx: Ctx):
    c = ctx.guia
    return [luz_cumplimiento(ctx),
            luz("Subtítulos en inglés", "Hechos" if c.existe("subtitulos_en.srt") else "Faltan", "verde" if c.existe("subtitulos_en.srt") else "rojo", ""),
            luz("Textos de publicación", "Listos" if c.existe("publicacion_final.md") else "Faltan", "verde" if c.existe("publicacion_final.md") else "rojo",
                "Títulos, descripción con fuentes, etiquetas y comentario fijado.")]


def luces_aprendizajes(ctx: Ctx):
    c = ctx.guia
    return [luz("Reglas propuestas", "Hechas" if c.existe("aprendizajes.md") else "Faltan", "verde" if c.existe("aprendizajes.md") else "rojo",
                "Las que apruebes se aplican a todos los guiones siguientes.")]


def luces_cierre(ctx: Ctx):
    c = ctx.guia
    return [luz("Historial del canal", "Anotado" if c.en_historial() else "Sin anotar", "verde" if c.en_historial() else "rojo", "")]


# --------------------------------------------------------------------------- fase J: publicado y resultados

MOMENTOS = {"48h": 48, "7d": 24 * 7}
NOMBRE_MOMENTO = {"48h": "48 horas", "7d": "7 días"}


def _publicacion(ctx: Ctx) -> dict:
    p = ctx.estado.get("publicacion")
    return p if isinstance(p, dict) else {}


def _disponible_desde(ctx: Ctx, momento: str):
    from datetime import datetime, timedelta
    try:
        base = datetime.fromisoformat(str(_publicacion(ctx).get("fecha")))
    except ValueError:
        return None
    return base + timedelta(hours=MOMENTOS[momento])


def luces_publicado(ctx: Ctx):
    p = _publicacion(ctx)
    return [luz("Enlace", p.get("url") or "Sin registrar", "verde" if p.get("url") else "gris", ""),
            luz("Publicado", str(p.get("fecha") or "—")[:16].replace("T", " "), "verde" if p.get("fecha") else "gris", "")]


def datos_publicado(ctx: Ctx):
    return {"publicacion": _publicacion(ctx)}


def _luces_metricas(momento: str):
    def f(ctx: Ctx):
        from datetime import datetime
        desde = _disponible_desde(ctx, momento)
        if desde is None:
            return [luz("Cuándo", "Primero registra la publicación", "gris", "")]
        ahora = datetime.now()
        if ahora < desde:
            return [luz("Cuándo", f"Desde el {desde:%d/%m a las %H:%M}", "ambar",
                        f"Mira YouTube Studio pasadas {NOMBRE_MOMENTO[momento]} desde la publicación.")]
        return [luz("Cuándo", "Ya puedes registrarlas", "verde", "YouTube Studio → Analytics → Contenido.")]
    return f


def _datos_metricas(momento: str):
    def f(ctx: Ctx):
        m = (ctx.estado.get("metricas") or {}).get(momento) or {}
        return {"momento": momento, "metricas": m}
    return f


def _listo_publicado(ctx: Ctx) -> bool:
    return bool(_publicacion(ctx).get("url"))


def _listo_metricas(momento: str):
    return lambda ctx: bool((ctx.estado.get("metricas") or {}).get(momento))


def _tiene(*nombres):
    return lambda ctx: all((ctx.carpeta / n).exists() for n in nombres)


TRAMOS: dict[str, list[Tramo]] = {
    "C": [Tramo("c-investigar", "C", "Revisa la investigación", "Claude busca los datos, los verifica con dos fuentes y separa lo comprobado de las leyendas.",
                antes="Investiga el tema",
                vista="investigacion", aprobacion="c-aprobar", boton="Investigar el tema", tarda="8-10 minutos",
                archivos=("fuentes.md",), docs=("fuentes.md",), json="investigacion.json", mensaje=msg_investigar,
                luces=luces_investigacion, datos=datos_investigacion)],
    "D": [Tramo("d-empaquetado", "D", "Elige título y miniatura", "Antes de escribir, se decide lo que prometen el título y la miniatura: el guion tendrá que cumplirlo.",
                antes="Prepara título y miniatura",
                vista="empaquetado", aprobacion="d-aprobar-empaquetado", boton="Proponer títulos y miniatura", tarda="Unos 4 minutos",
                archivos=("empaquetado.md",), docs=("empaquetado.md",), json="empaquetado.json", mensaje=msg_empaquetado,
                luces=luces_empaquetado, datos=datos_empaquetado),
          Tramo("d-escaleta", "D", "Revisa la historia", "La escaleta cuenta el vídeo acto a acto, con su pregunta y su recompensa. Cambiar algo aquí es barato; en el guion, no.",
                antes="Escribe la historia",
                vista="escaleta", aprobacion="d-aprobar-escaleta", boton="Escribir la escaleta", tarda="Unos 5 minutos",
                archivos=("escaleta.md",), docs=("escaleta.md",), json="escaleta.json", mensaje=msg_escaleta,
                luces=luces_escaleta, datos=datos_escaleta),
          Tramo("d-guion", "D", "Lee el guion", "Claude escribe el texto para la voz, lo verifica, revisa el ritmo y describe cada imagen.",
                antes="Escribe el guion",
                vista="guion", aprobacion="d-aprobar-guion", boton="Escribir y revisar el guion", tarda="20-30 minutos",
                archivos=("guion.json", "guion.md", "verificacion.md", "revision_estructura.md", "brief_visual.md"),
                docs=("guion.md", "verificacion.md", "revision_estructura.md", "brief_visual.md"), mensaje=msg_guion,
                luces=luces_guion, datos=datos_guion)],
    "E": [Tramo("e-voz", "E", "Escucha la voz", "Locuta un bloque de prueba, escúchalo y, si te gusta, el resto. La entonación se revisa sola.",
                antes="Locuta la voz",
                vista="voz", aprobacion="e-aprobar", listo=lambda ctx: ctx.guia.voz_completa(), luces=luces_voz)],
    "F": [Tramo("f-imagenes", "F", "Revisa las imágenes", "Genera las que faltan, mira cada una a tamaño grande y marca las que estén mal.",
                antes="Genera las imágenes",
                vista="imagenes", aprobacion="f-aprobar",
                listo=lambda ctx: bool(ctx.guia.imagenes) and ctx.guia.por_generar() == 0, luces=luces_imagenes)],
    "G": [Tramo("g-montaje", "G", "Mira el vídeo montado", "Se monta con voz, imágenes y subtítulos; se mira entero y se revisan los fotogramas.",
                antes="Monta el vídeo",
                vista="montaje", aprobacion="g-aprobar", listo=lambda ctx: ctx.guia.montaje_al_dia(), luces=luces_montaje)],
    "H": [Tramo("h-miniatura", "H", "Elige la miniatura", "Las tres se pueden subir a «Probar y comparar»; aquí eliges la principal.",
                vista="miniaturas", aprobacion="h-miniatura", listo=lambda ctx: bool(list(ctx.carpeta.glob("miniatura_*.jpg"))),
                luces=luces_miniaturas),
          Tramo("h-publicacion", "H", "Revisa la publicación", "Subtítulos en inglés y los textos de YouTube, TikTok y Reels.",
                antes="Prepara la publicación",
                vista="doc", boton="Preparar la publicación", tarda="Unos 5 minutos",
                archivos=("subtitulos_en.srt", "publicacion_final.md"), docs=("publicacion_final.md",), mensaje=msg_publicacion,
                luces=luces_publicacion, datos=datos_publicacion)],
    "I": [Tramo("i-aprendizajes", "I", "Aprende de tus cambios", "Claude compara el guion que entregó con el que locutaste y propone reglas para escribir mejor el siguiente.",
                vista="doc", aprobacion="i-aprobar-aprendizajes", boton="Proponer reglas", tarda="Unos 3 minutos",
                archivos=("aprendizajes.md",), docs=("aprendizajes.md",), mensaje=msg_aprendizajes, luces=luces_aprendizajes),
          Tramo("i-cierre", "I", "Cierra el vídeo", "Se anota en el historial, se proponen 3 ideas nuevas medidas y se guarda todo.",
                vista="doc", boton="Cerrar el vídeo", tarda="Unos 5 minutos", mensaje=msg_cierre,
                listo=lambda ctx: ctx.guia.en_historial(), luces=luces_cierre),
          Tramo("i-subir", "I", "Sube el vídeo a YouTube", "Con la guía de subida y los textos ya preparados. Cuando lo hayas subido, márcalo.",
                vista="subida")],
    "J": [Tramo("j-publicado", "J", "Registra la publicación", "Pega el enlace de YouTube y cuándo lo publicaste: a partir de ahí se cuentan las 48 h y los 7 días.",
                vista="publicado", listo=_listo_publicado, luces=luces_publicado, datos=datos_publicado),
          Tramo("j-48h", "J", "Resultados a las 48 horas", "Visitas, CTR y retención de las primeras 48 h: dicen si el título y la miniatura funcionan.",
                vista="metricas", listo=_listo_metricas("48h"), luces=_luces_metricas("48h"), datos=_datos_metricas("48h")),
          Tramo("j-7d", "J", "Resultados a los 7 días", "Con una semana ya se ve si el vídeo tiene recorrido. Con esto se decide qué cambiar en el siguiente.",
                vista="metricas", listo=_listo_metricas("7d"), luces=_luces_metricas("7d"), datos=_datos_metricas("7d"))],
}


def _voz_lista(ctx: Ctx) -> bool:
    """Voz del Short lista: el mp3 hecho fuera (voz_archivo) existe o, si se locutó por escenas, está toda al día."""
    archivo = ctx.guia.guion.get("voz_archivo")
    return (ctx.guia.carpeta_canal / str(archivo)).exists() if archivo else ctx.guia.voz_completa()


# Shorts (.claude/commands/nuevo-short.md). La fase A (elegir el enfoque) tiene pantalla propia (app/fases_ui.py).
TRAMOS_SHORT: dict[str, list[Tramo]] = {
    "B": [Tramo("sb-guion", "B", "Lee el guion", "Claude escribe el guion vertical (gancho, el dato en 2-3 golpes, giro y un final que lleva al vídeo largo) y describe cada imagen.",
                antes="Escribe el guion",
                vista="guion", aprobacion="sb-aprobar", boton="Escribir el guion del Short", tarda="5-10 minutos",
                archivos=("guion.json", "guion.md"), docs=("guion.md",), mensaje=msg_guion_short,
                luces=luces_guion_short, datos=datos_guion_short)],
    "C": [Tramo("sc-voz", "C", "Voz lista", "Locútala aquí. Si es de pago, verás el coste antes de gastar nada.",
                antes="Locuta la voz",
                vista="voz", listo=_voz_lista, luces=luces_voz),
          Tramo("sc-imagenes", "C", "Revisa las imágenes", "Genera las que faltan, mira cada una a tamaño grande y marca las que estén mal.",
                antes="Genera las imágenes",
                vista="imagenes", aprobacion="sc-aprobar",
                listo=lambda ctx: _voz_lista(ctx) and bool(ctx.guia.imagenes) and ctx.guia.por_generar() == 0
                and ctx.guia.marcadas_mal() == 0,
                luces=luces_imagenes)],
    "D": [Tramo("sd-montaje", "D", "Mira el Short montado", "Se monta en vertical con voz, imágenes y subtítulos. Fíjate sobre todo en el primer segundo.",
                antes="Monta el Short",
                vista="montaje", aprobacion="sd-aprobar", listo=lambda ctx: ctx.guia.montaje_al_dia(), luces=luces_montaje),
          Tramo("sd-publicacion", "D", "Revisa la publicación", "Subtítulos en inglés y los textos para YouTube Shorts, TikTok y Reels.",
                antes="Prepara la publicación",
                vista="doc", boton="Preparar la publicación", tarda="Unos 3 minutos",
                archivos=("subtitulos_en.srt", "publicacion_final.md"), docs=("publicacion_final.md",),
                mensaje=msg_publicacion_short, luces=luces_publicacion)],
    "E": [Tramo("se-cierre", "E", "Cierra el Short", "Se anota en el historial del canal, junto al vídeo largo al que apoya, y se guarda todo.",
                vista="doc", boton="Cerrar el Short", tarda="Unos 2 minutos", mensaje=msg_cierre_short,
                listo=lambda ctx: ctx.guia.en_historial(), luces=luces_cierre),
          Tramo("se-subir", "E", "Sube el Short", "Con la guía de subida y los textos ya preparados; en YouTube, enlázalo al vídeo largo («Vídeo relacionado»). Cuando lo hayas subido, márcalo.",
                vista="subida")],
}


# --------------------------------------------------------------------------- estado de los tramos

def producido(t: Tramo, ctx: Ctx) -> bool:
    if t.listo:
        return bool(t.listo(ctx))
    return all((ctx.carpeta / a).exists() for a in t.archivos) and (t.vista != "guion" or bool(ctx.guia.imagenes))


def hecho(t: Tramo, ctx: Ctx, fase_hecha: bool) -> bool:
    if fase_hecha:
        return True
    if t.aprobacion:
        return t.aprobacion in (ctx.estado.get("aprobaciones") or {}) and not aprobacion_caducada(ctx.guia, t.aprobacion)
    if t.vista == "subida":                     # lo marca el usuario (i-subir, se-subir)
        return t.id in (ctx.estado.get("pasos_hechos") or [])
    return producido(t, ctx)


def tramos_de(letra: str, tipo: str = "largo") -> list[Tramo]:
    return (TRAMOS_SHORT if tipo == "short" else TRAMOS).get(letra, [])


def buscar(tid: str, tipo: str) -> Tramo | None:
    """El tramo con ese id entre los del tipo de vídeo (un Short no acepta tramos de vídeo largo ni al revés)."""
    return next((x for ts in (TRAMOS_SHORT if tipo == "short" else TRAMOS).values() for x in ts if x.id == tid), None)


def detalle(t: Tramo, ctx: Ctx) -> dict:
    """Lo que la pantalla enseña de un tramo: su ayuda, luces, datos de la vista y documentos."""
    estado = ctx.estado
    prod = producido(t, ctx)
    pedidos = [c for c in estado.get("cambios_pedidos") or [] if t.aprobacion and c.get("punto") == t.aprobacion
               and not c.get("atendido")]
    return {
        "id": t.id, "titulo": t.titular(prod), "ayuda": t.ayuda, "vista": t.vista, "boton": t.boton,
        "tarda": t.tarda, "job": t.mensaje is not None, "producido": prod,
        "aprobable": bool(t.aprobacion) and prod, "completable": t.vista == "subida",
        "aprobacion": t.aprobacion, "cambios_pendientes": [c.get("texto") for c in pedidos],
        "luces": t.luces(ctx) if t.luces and (prod or not t.mensaje) else [],
        "datos": t.datos(ctx) if t.datos and prod else {},
        "docs": [d for d in t.docs if (ctx.carpeta / d).exists()],
    }


def estado_fase(ctx: Ctx, letra: str, trabajando: bool = False, revision: bool = False) -> dict:
    """Los tramos de una fase y cuál toca. Con `revision` (volver a una fase ya hecha) cada tramo lleva su detalle."""
    estado = ctx.estado
    # Como en la guía: cerrada alguna vez Y al día (si lo de antes ha cambiado, se vuelve a hacer y a aprobar).
    avisos = vigencia(ctx.video.tipo, ctx.guia).get(letra, [])
    fase_hecha = (letra in (estado.get("completadas") or []) or estado.get("fase") == "cerrado") and not avisos
    tramos, actual = [], None
    for t in tramos_de(letra, ctx.video.tipo):
        h = hecho(t, ctx, fase_hecha)
        fila = {"id": t.id, "titulo": t.titular(h or producido(t, ctx)), "estado": "hecho" if h else "actual" if actual is None else "pendiente"}
        if revision:
            fila["detalle"] = detalle(t, ctx)
        tramos.append(fila)
        if not h and actual is None:
            actual = t
    return {"letra": letra, "tramos": tramos, "completa": actual is None, "revision": revision, "avisos": avisos,
            "actual": detalle(actual, ctx) if actual else None}


# --------------------------------------------------------------------------- acciones

def _otra_fase(tipo, completadas, actual):
    letras = [f.letra for f in de(tipo)]
    return next((l for l in letras if l not in completadas), None)


def cerrar_fase(ruta: Path, tipo: str, letra: str):
    """Marca la fase como hecha y pasa a la siguiente (o a «cerrado»)."""
    estado = _leer(ruta)
    completadas = list(dict.fromkeys((estado.get("completadas") or []) + [letra]))
    siguiente = _otra_fase(tipo, completadas, letra)
    estado["completadas"] = completadas
    estado["fase"] = siguiente or "cerrado"
    estado.setdefault("historial_fases", []).append({"de": letra, "a": estado["fase"], "fecha": _ahora(), "desde": "UI"})
    _guardar(ruta, estado)


def aprobar_tramo(ruta: Path, tipo: str, t: Tramo, ctx: Ctx, eleccion=None):
    """Aprueba el punto del tramo (con la elección del usuario si la hay) y cierra la fase si era el último."""
    from . import guia
    if not producido(t, ctx):
        motivos = ctx.guia.montaje["motivos"] if t.vista == "montaje" else []
        raise ValueError("Todavía no se puede aprobar: " + (", ".join(motivos) + ". Vuelve a montar el vídeo."
                                                            if motivos else "falta lo que hay que aprobar."))
    comentario = None
    if t.id == "d-empaquetado" and eleccion is not None:
        titulos = datos_empaquetado(ctx)["titulos"]
        elegido = next((x for x in titulos if x["n"] == int(eleccion)), None)
        if not elegido:
            raise ValueError("Ese título no existe")
        estado = _leer(ruta)
        estado["titulo_elegido"] = elegido["texto"]
        _guardar(ruta, estado)
        comentario = f"Título {elegido['n']}: «{elegido['texto']}»"
    if t.id == "h-miniatura" and eleccion is not None:
        n = int(eleccion)
        if not (ctx.carpeta / f"miniatura_{n}.jpg").exists():
            raise ValueError("Esa miniatura no existe")
        estado = _leer(ruta)
        estado["miniatura_elegida"] = n
        _guardar(ruta, estado)
        comentario = f"Miniatura {n}"
    guia.aprobar(ruta, tipo, t.aprobacion, comentario)
    _cerrar_si_completa(ruta, tipo, t, ctx)


def _cerrar_si_completa(ruta: Path, tipo: str, t: Tramo, ctx: Ctx):
    """Si todos los tramos de la fase están hechos (con el estado ya escrito), cierra la fase."""
    ctx.guia.estado = _leer(ruta)
    if all(hecho(x, ctx, False) for x in tramos_de(t.fase, tipo)):
        cerrar_fase(ruta, tipo, t.fase)


def completar_tramo(ruta: Path, tipo: str, t: Tramo, ctx: Ctx):
    estado = _leer(ruta)
    estado["pasos_hechos"] = list(dict.fromkeys((estado.get("pasos_hechos") or []) + [t.id]))
    _guardar(ruta, estado)
    _cerrar_si_completa(ruta, tipo, t, ctx)


def pedir_cambios_tramo(ruta: Path, tipo: str, t: Tramo, texto: str):
    from . import guia
    if not t.aprobacion:
        raise ValueError("Este tramo no tiene cambios que pedir")
    guia.pedir_cambios(ruta, tipo, t.aprobacion, texto)


# --- fase J: lo que registra el usuario ---

_URL_YT = re.compile(r"^https://(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|live/)|youtu\.be/)[\w\-]{6,20}([&?#].*)?$")


def registrar_publicacion(ruta: Path, tipo: str, ctx: Ctx, url: str, fecha: str, titulo: str | None = None):
    from datetime import datetime
    url = (url or "").strip()
    if not _URL_YT.match(url):
        raise ValueError("Pega el enlace del vídeo en YouTube (https://www.youtube.com/watch?v=… o https://youtu.be/…)")
    try:
        cuando = datetime.fromisoformat(fecha)
    except ValueError:
        raise ValueError("La fecha de publicación no es válida")
    if cuando > datetime.now().replace(microsecond=0) and (cuando - datetime.now()).days >= 1:
        raise ValueError("La fecha de publicación es futura: si está programado, registra el enlace cuando se publique")
    estado = _leer(ruta)
    estado["publicacion"] = {"url": url, "fecha": cuando.isoformat(timespec="minutes"),
                             "titulo": (titulo or estado.get("titulo_elegido") or "")[:200], "registrada": _ahora()}
    _guardar(ruta, estado)
    t = next(x for x in tramos_de("J") if x.id == "j-publicado")
    _cerrar_si_completa(ruta, tipo, t, ctx)


def _num(valor, nombre, maximo, entero=False, obligatorio=True):
    if valor in (None, ""):
        if obligatorio:
            raise ValueError(f"Falta: {nombre}")
        return None
    try:
        n = float(str(valor).replace(",", "."))
    except ValueError:
        raise ValueError(f"{nombre} debe ser un número")
    if not 0 <= n <= maximo:
        raise ValueError(f"{nombre} debe estar entre 0 y {maximo:g}")
    return int(n) if entero else round(n, 2)


def registrar_metricas(ruta: Path, tipo: str, ctx: Ctx, momento: str, datos: dict):
    if momento not in MOMENTOS:
        raise ValueError("Momento no válido (48h o 7d)")
    if not _publicacion(ctx).get("url"):
        raise ValueError("Primero registra la publicación")
    registro = {
        "visitas": _num(datos.get("visitas"), "Visitas", 1_000_000_000, entero=True),
        "ctr": _num(datos.get("ctr"), "CTR (%)", 100),
        "retencion": _num(datos.get("retencion"), "Retención media (%)", 100),
        "impresiones": _num(datos.get("impresiones"), "Impresiones", 10_000_000_000, entero=True, obligatorio=False),
        "horas_vistas": _num(datos.get("horas_vistas"), "Horas vistas", 10_000_000, obligatorio=False),
        "suscriptores": _num(datos.get("suscriptores"), "Suscriptores ganados", 10_000_000, entero=True, obligatorio=False),
        "notas": " ".join(str(datos.get("notas") or "").split())[:500],
        "registrada": _ahora(),
    }
    estado = _leer(ruta)
    estado.setdefault("metricas", {})[momento] = {k: v for k, v in registro.items() if v not in (None, "")}
    _guardar(ruta, estado)
    t = next(x for x in tramos_de("J") if x.id == f"j-{momento}")
    _cerrar_si_completa(ruta, tipo, t, ctx)


# --------------------------------------------------------------------------- la revisión automática del guion

_revisor_cache: dict[str, tuple[float, dict]] = {}


async def revisar(carpeta: Path, canal: str) -> dict | None:
    """Pasa revisar_guion.py (gratis) por el guion y devuelve errores y avisos. Cacheado por fecha del guion."""
    guion = carpeta / "guion.json"
    if not guion.exists():
        return None
    mtime = guion.stat().st_mtime
    previo = _revisor_cache.get(str(guion))
    if previo and previo[0] == mtime:
        return previo[1]
    try:
        proc = await asyncio.create_subprocess_exec(
            str(config.PYTHON), str(config.HERRAMIENTAS / "revisar_guion.py"), str(guion), cwd=config.RAIZ,
            env={**os.environ, "CANAL": canal}, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        fuera, _ = await asyncio.wait_for(proc.communicate(), timeout=40)
    except Exception as e:                    # noqa: BLE001
        log.warning("revisar_guion: %s", e)
        return None
    lineas = fuera.decode(errors="replace").splitlines()
    res = {"errores": [l[7:].strip() for l in lineas if l.startswith("ERROR ")],
           "avisos": [l[6:].strip() for l in lineas if l.startswith("aviso ")],
           "resumen": lineas[0] if lineas and "escenas" in lineas[0] else None}
    _revisor_cache[str(guion)] = (mtime, res)
    return res

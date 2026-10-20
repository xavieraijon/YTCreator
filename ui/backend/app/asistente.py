"""Asistente «desde cero»: kit preparado → canal → primer vídeo → publicarlo. Solo LEE el estado de los archivos y
dice cuál es el siguiente paso; lo que se hace en cada uno lo hacen la guía del vídeo, el chat de Claude y el
formulario «Nuevo vídeo». Las fases del canal son las de .claude/commands/nuevo-canal.md (tests/test_asistente.py
comprueba que coinciden)."""

import json
import shutil
import time
from pathlib import Path

from . import config  # noqa: F401  (pone herramientas/ en sys.path)

import canal as kit_canal  # noqa: E402
import canales as kit_canales  # noqa: E402
import servicios  # noqa: E402
import uso  # noqa: E402

from .sugerencias import ejecutable  # noqa: E402

FASES_CANAL = [
    ("A", "Arranque y mercado"),
    ("B", "Concepto"),
    ("C", "Nombre e identificador"),
    ("D", "Estilo visual"),
    ("E", "Voz y narrador"),
    ("F", "Marca: tipografía, colores y música"),
    ("G", "Configuración y reglas"),
    ("H", "Equipo de agentes"),
    ("I", "Marca y alta en YouTube"),
    ("J", "Banco de ideas"),
    ("K", "Prueba, activación y cierre"),
]

# Lo que ve el usuario de cada fase (sin letras ni jerga del kit; hallazgo 47). FASES_CANAL sigue igual que el comando.
_PARA_USUARIO = {"C": "Nombre", "H": "Equipo de especialistas", "I": "Alta en YouTube"}


def fase_canal(letra: str | None) -> str | None:
    """«Paso 2 de 11: Concepto» para una fase de la creación del canal; None si no es una fase conocida."""
    letras = [l for l, _ in FASES_CANAL]
    if letra not in letras:
        return None
    return f"Paso {letras.index(letra) + 1} de {len(letras)}: {_PARA_USUARIO.get(letra) or dict(FASES_CANAL)[letra]}"


def _json(ruta: Path):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _env() -> dict[str, bool]:
    """Qué claves del .env están rellenas (True/False). Nunca devuelve valores."""
    return servicios.claves_rellenas(config.RAIZ / ".env")


# Servicios con cuota que enseña la cabecera (rutas/tareas.py → /api/cuotas).
CON_CUOTA = ("cloudflare", "azure", "ai33", "gemini")


def lista_servicios() -> list[dict]:
    """Los servicios del catálogo (herramientas/servicios.py) con el .env de este espacio."""
    return servicios.todos(config.RAIZ / ".env")


def conectados() -> dict[str, bool]:
    """Qué servicios tienen sus claves en el .env (sin enseñar valores): la cabecera no pinta como disponible una cuota
    teórica de un servicio sin conectar (hallazgo 42 del recorrido profano)."""
    return {s["id"]: s["conectado"] for s in lista_servicios() if s["id"] in CON_CUOTA}


def activos() -> dict[str, bool]:
    """Qué servicios usa el usuario (Ajustes → Servicios): la cabecera no enseña la cuota de uno que no usa."""
    return {s["id"]: s["activo"] for s in lista_servicios() if s["id"] in CON_CUOTA}


def nombres() -> dict[str, str]:
    return {s["id"]: s["nombre"] for s in lista_servicios() if s["id"] in CON_CUOTA}


def otros() -> list[dict]:
    """Servicios que el usuario usa y que no saben decir su cuota (los conectados por él y cualquiera del catálogo sin
    consulta propia): la cabecera enseña su nombre y lo gastado que cuenta el kit (`data/uso.jsonl`), no una cuota inventada.
    Los gratuitos incluidos o locales (sin clave) no gastan: no ocupan sitio."""
    gasto: dict[str, dict] = {}
    desde = time.time() - 86400
    for l in uso.leer():
        g = gasto.setdefault(str(l.get("servicio")), {"total": 0.0, "hoy": 0.0, "unidad": ""})
        g["total"] += l.get("cantidad") or 0
        g["hoy"] += (l.get("cantidad") or 0) if l.get("t", 0) >= desde else 0
        g["unidad"] = (l.get("detalle") or "").split(" · ")[0] or g["unidad"]
    salida = []
    for s in lista_servicios():
        if s["id"] in CON_CUOTA or not s["disponible"] or not (s["claves"] or s["conector"]):
            continue
        g = gasto.get(f"conector:{s['id']}", {"total": 0.0, "hoy": 0.0, "unidad": ""})
        salida.append({"id": s["id"], "nombre": s["nombre"], "hace": [servicios.CAPACIDADES[c] for c in s["hace"]],
                       "de_pago": s["tipo"] == "pago", "gastado_total": round(g["total"], 4),
                       "gastado_hoy": round(g["hoy"], 4), "unidad": g["unidad"]})
    return salida


_TIPO = {"gratis": "gratis", "pago": "de pago", "local": "en este ordenador", "incluido": "incluido"}


def item_servicio(s: dict) -> dict:
    """Un servicio elegido en la comprobación del kit, en lenguaje de usuario (el nombre, solo tras «Servicio:»)."""
    que = ", ".join(servicios.CAPACIDADES[c] for c in s["hace"])
    como = "guarda su clave en Ajustes → Servicios (nunca por el chat)" if s["claves"] else "se instala aparte"
    return {"id": s["id"], "texto": f"{que} ({_TIPO[s['tipo']]})", "ok": s["conectado"], "requerido": False,
            "ayuda": f"Servicio: {s['nombre']}; {como}."}


AYUDA_INSTALAR = "Lo instala Claude: abre la carpeta de YTCreator en Claude y escribe «Instala YTCreator»."


def kit() -> dict:
    items = []
    for nombre, binario, ayuda in (("yt-dlp", "yt-dlp", AYUDA_INSTALAR), ("ffmpeg", "ffmpeg", AYUDA_INSTALAR)):
        items.append({"id": binario, "texto": nombre, "ok": bool(shutil.which(binario)), "requerido": True, "ayuda": ayuda})
    claude = ejecutable()
    items.append({"id": "claude", "texto": "Claude, la inteligencia artificial que escribe y revisa", "ok": bool(shutil.which(claude) or Path(claude).exists()),
                  "requerido": True, "ayuda": "Instala Claude Code e inicia sesión con tu cuenta."})
    # Ningún servicio es obligatorio (bloque B): solo se avisa de los elegidos a los que les falta algo.
    items += [item_servicio(s) for s in lista_servicios() if s["activo"]]
    return {"items": items, "listo": all(i["ok"] for i in items if i["requerido"])}


def canal_en_creacion():
    """El canal a medio crear: su carpeta (estado_canal.json con fase ≠ hecho) o, antes de la fase B,
    analisis/mercado/nuevo_canal.json. None si no hay ninguno."""
    for p in sorted(kit_canal.CANALES.glob("*/estado_canal.json")):
        e = _json(p) or {}
        if p.parent.name.startswith("_") or e.get("fase") in (None, "hecho"):
            continue
        cfg = _json(p.parent / "canal.json") or {}
        return {"slug": p.parent.name, "nombre": cfg.get("nombre") or p.parent.name, "fase": e["fase"],
                "completadas": list(e.get("completadas") or []), "notas": e.get("notas"), "carpeta": True}
    e = _json(config.RAIZ / "analisis" / "mercado" / "nuevo_canal.json")
    if e and e.get("fase") not in (None, "hecho"):
        return {"slug": None, "nombre": "Canal nuevo (sin carpeta todavía)", "fase": e["fase"],
                "completadas": list(e.get("completadas") or []), "notas": e.get("notas"), "carpeta": False}
    return None


def canal_para_chat():
    """CANAL del turno del asistente: el canal en creación (si ya tiene carpeta) o el activo; None si no hay."""
    c = canal_en_creacion()
    if c and c["slug"]:
        return c["slug"]
    activo = (kit_canal.ACTIVO.read_text(encoding="utf-8").strip() if kit_canal.ACTIVO.exists() else "")
    return activo or None


def estado(videos: list, situaciones: dict[int, dict] | None = None) -> dict:
    """El asistente entero. `videos`: los Video del canal activo (del índice); `situaciones`: la de cada uno según su
    guía (`guia.situacion`, por id). Nada se deduce aquí de los archivos: «producido» y «listo para subir» son los de
    la guía del vídeo."""
    situaciones = situaciones or {}
    k = kit()
    creacion = canal_en_creacion()
    canales = kit_canal.canales()
    activo = kit_canal.ACTIVO.read_text(encoding="utf-8").strip() if kit_canal.ACTIVO.exists() else None
    tiene_canal = bool(activo and activo in canales) and not (creacion and creacion["slug"] == activo)
    # Un canal con marcas <<RELLENAR>> no está listo para producir (los agentes se paran con fichas sin rellenar),
    # aunque no tenga estado_canal.json (creado a mano o /nuevo-canal cortado a medias).
    pendientes = len(kit_canales.pendientes(kit_canal.CANALES / activo)) if tiene_canal else 0
    nombre = ((_json(kit_canal.CANALES / activo / "canal.json") or {}).get("nombre") or activo) if tiene_canal else None
    sit = {v.id: situaciones.get(v.id) or {} for v in videos}
    producidos = [v for v in videos if sit[v.id].get("montado")]
    publicados = [v for v in videos if sit[v.id].get("publicado")]
    publicables = [v for v in videos if sit[v.id].get("listo_para_subir")]
    en_curso = [v for v in videos if not v.aparcado and v.fase != "cerrado" and not sit[v.id].get("montado")]
    pasos = [
        {"id": "kit", "titulo": "Dejarlo todo listo", "hecho": k["listo"],
         "resumen": "Todo listo" if k["listo"] else f"Faltan {sum(1 for i in k['items'] if i['requerido'] and not i['ok'])} cosas necesarias"},
        {"id": "canal", "titulo": "Crear el canal", "hecho": tiene_canal and not creacion and not pendientes,
         "resumen": ((fase_canal(creacion["fase"]) or "Creándose") if creacion
                     else f"{nombre}: " + ("falta 1 campo" if pendientes == 1 else f"faltan {pendientes} campos") + " por rellenar"
                     if pendientes
                     else ("Canal activo: " + nombre) if tiene_canal else "Todavía no hay canal")},
        {"id": "video", "titulo": "Producir el primer vídeo", "hecho": bool(producidos),
         "resumen": (_contar(len(producidos), "vídeo terminado", "vídeos terminados") if producidos
                     else _contar(len(en_curso), "vídeo en producción", "vídeos en producción") if en_curso
                     else "Todavía no hay ninguno" if tiene_canal else "Primero, el canal")},
        {"id": "publicar", "titulo": "Publicarlo en YouTube", "hecho": bool(publicados),
         "resumen": (_contar(len(publicados), "vídeo publicado", "vídeos publicados") if publicados
                     else _contar(len(publicables), "listo para subir", "listos para subir") if publicables
                     else "Ninguno está listo para subir todavía")},
    ]
    actual = next((p["id"] for p in pasos if not p["hecho"]), "publicar")
    return {"kit": k, "pasos": pasos, "actual": actual, "canal": {
        "activo": activo, "creacion": creacion, "hay_canal": tiene_canal, "pendientes": pendientes,
        "fases": [{"letra": l, "nombre": _PARA_USUARIO.get(l, n)} for l, n in FASES_CANAL]},
        "video": {"en_curso": [{"id": v.id, "carpeta": v.carpeta, "titulo": v.titulo, "fase": v.fase, "tipo": v.tipo,
                                "fase_nombre": sit[v.id].get("vista_nombre")} for v in en_curso],
                  "publicables": [{"id": v.id, "carpeta": v.carpeta, "titulo": v.titulo} for v in publicables],
                  "publicados": [{"id": v.id, "carpeta": v.carpeta, "titulo": v.titulo} for v in publicados]}}


def _contar(n: int, uno: str, varios: str) -> str:
    return f"1 {uno}" if n == 1 else f"{n} {varios}"

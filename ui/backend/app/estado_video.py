"""Estado REAL de un vídeo: la única cuenta de «dónde está» y «qué le falta», sacada de su guía (app/guia.py), que
mira el contenido de los archivos y no solo las marcas de estado.json. Se calcula al sincronizar el índice
(sincronizar._rellenar_video) y lo leen Inicio, la lista de vídeos, el carril de fases, el Asistente y el contexto del
chat con Claude: si dos pantallas cuentan cosas distintas, el fallo está aquí y no en cada pantalla."""

from . import guia


def calcular(tipo: str, ctx: guia.Contexto) -> dict:
    g = guia.construir(tipo, ctx)
    sit = guia.situacion(tipo, g, ctx.estado)
    fases = [{"letra": f["letra"], "nombre": f["nombre"], "estado": f["estado"], "avisos": f["avisos"]} for f in g["fases"]
             # La A de un vídeo largo (comprobar el kit) no es un paso del usuario: solo se ve en vídeos antiguos que sigan en ella.
             if not (tipo == "largo" and f["letra"] == "A" and ctx.estado.get("fase") != "A")]
    # La fase que toca mirar: la primera que ha dejado de estar al día y, si no hay, la actual.
    vista = next((f for f in fases if f["estado"] == "desactualizada"), None) or \
        next((f for f in fases if f["estado"] == "actual"), None)
    m = ctx.montaje
    return {
        "fases": fases,
        "vista": vista["letra"] if vista else g["fase_actual"],
        "vista_nombre": vista["nombre"] if vista else None,
        "paso": (fases.index(vista) + 1) if vista else len(fases),
        "pasos": len(fases),
        "avisos": [{"fase": f["letra"], "nombre": f["nombre"], "texto": a} for f in fases for a in f["avisos"]],
        "siguiente": g["siguiente"],
        "montaje": "al_dia" if m["al_dia"] else "desactualizado" if m["existe"] else "sin_montar",
        **sit,
    }


def texto(e: dict | None) -> str:
    """El estado en pocas líneas, para el contexto del chat con Claude (lo mismo que ve el usuario)."""
    if not e:
        return "Sin estado calculado."
    hechas = [f["nombre"] for f in e["fases"] if f["estado"] == "hecha"]
    danado = ["ATENCIÓN: " + e["archivo_danado"] + " (Si te lo pide, repara el JSON sin perder campos; no lo rehagas de cero.)"] \
        if e.get("archivo_danado") else []
    lineas = [f"Fase que toca: {e.get('vista_nombre') or e['vista']} (paso {e['paso']} de {e['pasos']})."]
    if hechas:
        lineas.append("Hechas y al día: " + ", ".join(hechas) + ".")
    for a in e["avisos"]:
        lineas.append(f"Desactualizado · {a['nombre']}: {a['texto']}")
    if e.get("siguiente"):
        nombre = next((f["nombre"] for f in e["fases"] if f["letra"] == e["siguiente"]["fase"]), e["siguiente"]["fase"])
        lineas.append(f"Siguiente paso: {e['siguiente']['texto']} (en «{nombre}»).")
    lineas.append({"al_dia": "Montaje: al día.", "desactualizado": "Montaje: desactualizado.",
                   "sin_montar": "Montaje: sin hacer."}[e["montaje"]])
    if e.get("publicado"):
        lineas.append("Publicado en YouTube.")
    elif e.get("listo_para_subir"):
        lineas.append("Listo para subir a YouTube.")
    return "\n".join(danado + lineas)

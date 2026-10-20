"""Glosario de la UI (docs/ui/auditoria-usuario-profano.md, bloque 3): en las pantallas de usuario no aparecen nombres de
proveedores, modelos, archivos ni jerga del kit. Se permiten en el detalle técnico (los archivos de AVANZADO) y en
una línea de detalle que empieza por «Servicio:». Los nombres de usuario están en frontend/src/app/core/glosario.ts."""
import re

import pytest

from tests import textos_ui

PROHIBIDAS = re.compile(
    r"\b(klein|ai33|neuronas?|nano banana|flux(\.2)?|workers ai|UTC|prompts?|outliers?|MRV|regla del hueco|clon(es)?|"
    r"haiku|sonnet|opus|cloudflare|azure|elevenlabs|mflux|kit|piezas?|short de apoyo|UI|API|ráfaga|tema amplio)\b"
    r"|\b[\w-]+\.(md|json|mp4|env|srt|png|py)\b|\.env\b|\bimg/",
    re.I,
)

# El detalle técnico del vídeo («Detalles técnicos» de cada paso y «Archivos y notas del vídeo») y Ajustes → servicios,
# que son para quien quiere el detalle. La pantalla del vídeo (video.html) ya no entra: es solo el paso a paso.
AVANZADO = {
    "paginas/video/detalles-fase.ts", "paginas/video/archivos-video.ts", "paginas/video/pestana-prompts.html",
    "paginas/video/pestana-prompts.ts", "paginas/video/guia-manual.ts", "paginas/video/pestana-guion.ts",
    "paginas/video/pestana-montaje.ts",
    "paginas/ajustes/servicios.ts", "paginas/ajustes/conectar-servicio.ts", "paginas/ajustes/ia.ts", "paginas/ajustes/gasto.ts", "paginas/ajustes/equipo.ts",
    "paginas/ajustes/modelos.ts", "compartido/preferencias-prompts.ts", "compartido/lote-prompts.ts",
    "core/modelos.ts", "core/glosario.ts",
}


# Cadenas que el extractor toma por texto pero no se enseñan: la marca de los encargos de las pantallas guiadas a Claude.
NO_SE_ENSENAN = {"MODO UI"}


def es_jerga(texto: str) -> bool:
    return (bool(PROHIBIDAS.search(texto)) and not texto.lstrip().startswith("Servicio:")
            and texto.strip() not in NO_SE_ENSENAN)


def jerga() -> dict[str, list[str]]:
    hallado = {}
    for archivo in textos_ui.archivos():
        rel = archivo.relative_to(textos_ui.APP).as_posix()
        if rel in AVANZADO:
            continue
        malas = [t for t in textos_ui.textos(archivo) if es_jerga(t)]
        if malas:
            hallado[rel] = malas
    return hallado


def test_sin_jerga_en_las_pantallas_de_usuario():
    hallado = jerga()
    informe = "\n".join(f"{a}:\n" + "\n".join(f"  · {t[:140]}" for t in ts) for a, ts in hallado.items())
    assert not hallado, "Palabras del kit en pantallas de usuario (usa core/glosario.ts):\n" + informe


@pytest.mark.parametrize("texto,mal", [
    ("Generar 3 gratis (klein)", True), ("Ficha del canal (CANAL.md)", True), ("Une todo en final.mp4", True),
    ("Servicio: Cloudflare · FLUX.2 klein", False), ("Imágenes de calidad (de pago)", False),
])
def test_el_detector(texto, mal):
    assert es_jerga(texto) is mal


# --- Textos que genera el backend y llegan a pantalla ------------------------------------------------------------------

def _constantes(nodo) -> list[str]:
    import ast
    if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str):
        return [nodo.value]
    if isinstance(nodo, ast.JoinedStr):
        return [" ".join(v.value for v in nodo.values if isinstance(v, ast.Constant))]
    if isinstance(nodo, ast.BinOp):
        return _constantes(nodo.left) + _constantes(nodo.right)
    return []


def _textos_backend() -> list[tuple[str, str]]:
    """Mensajes de error (raise …("texto")) de las rutas y módulos que los devuelven a la UI, y textos de luz(…)."""
    import ast
    from pathlib import Path
    app = Path(__file__).resolve().parents[1] / "app"
    res = []
    for f in [*app.glob("*.py"), *(app / "rutas").glob("*.py")]:
        for n in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            llamada = n.exc if isinstance(n, ast.Raise) else n if isinstance(n, ast.Call) else None
            if not isinstance(llamada, ast.Call):
                continue
            nombre = getattr(llamada.func, "id", getattr(llamada.func, "attr", ""))
            if isinstance(n, ast.Raise) or nombre == "luz":
                for arg in llamada.args:
                    res += [(f"{f.name}:{n.lineno}", t) for t in _constantes(arg)]
    return res


def test_sin_jerga_en_textos_del_backend():
    from app import asistente, tareas, tramos
    textos = [(f"tarea {k}", t) for k, h in tareas.HERRAMIENTAS.items() for t in (h.titulo, h.descripcion or "")]
    import servicios
    items = [asistente.item_servicio({**s, "id": sid, "claves": list(s["claves"]), "conectado": False}) for sid, s in servicios.CATALOGO.items()]
    textos += [("servicio en la comprobación del kit", t) for i in items for t in (i["texto"], i["ayuda"])]
    textos += [(f"tramo {t.id}", x) for ts in [*tramos.TRAMOS.values(), *tramos.TRAMOS_SHORT.values()] for t in ts
               for x in (t.titulo, t.ayuda, t.antes or "", t.boton or "", t.tarda or "")]
    textos += _textos_backend()
    malos = [f"{donde}: {t[:120]}" for donde, t in textos if es_jerga(t)]
    assert not malos, "Palabras del kit en textos que ve el usuario:\n" + "\n".join(malos)


# --- Textos que construye el backend en tiempo real (hallazgo 44): los que el análisis estático no ve -------------------

CLAVES_USUARIO = {"titulo", "texto", "ayuda", "detalle", "motivo", "resumen", "valor", "boton", "tarda", "accion",
                  "nombre", "vista_nombre", "fase_nombre", "avisos", "esquema", "archivo_danado", "detail"}


def _visibles(dato, clave=None):
    """Las cadenas que se enseñan en una respuesta de la API: las de CLAVES_USUARIO, recorriendo listas y objetos."""
    if isinstance(dato, dict):
        for k, v in dato.items():
            yield from _visibles(v, k)
    elif isinstance(dato, list):
        for v in dato:
            yield from _visibles(v, clave)
    elif isinstance(dato, str) and clave in CLAVES_USUARIO:
        yield clave, dato


def test_sin_jerga_ni_identificadores_en_las_respuestas_de_la_api(cliente, tmp_path, monkeypatch):
    import json

    import canal as kit_canal
    from tests.test_fases_ui import CANAL_JSON, PROPUESTAS
    slug = "canal-de-ensayo"
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    monkeypatch.setattr(kit_canal, "ACTIVO", tmp_path / "canal_activo")
    (tmp_path / "canal_activo").write_text(slug)
    c = tmp_path / "canales" / slug
    c.mkdir(parents=True)
    (c / "canal.json").write_text(json.dumps({**CANAL_JSON, "nombre": "Canal de Ensayo"}))
    largo = cliente.post(f"/api/canales/{slug}/videos", json={"tema": "Mente en blanco"}).json()
    short = cliente.post(f"/api/canales/{slug}/videos", json={"tema": "Gatos", "tipo": "short", "apoya": largo["carpeta"]}).json()
    for v in (largo, short):                  # enfoques con una medición guardada con el motivo antiguo de la herramienta
        d = c / "videos" / v["carpeta"]
        (d / "propuestas.json").write_text(json.dumps(PROPUESTAS))
        e = json.loads((d / "estado.json").read_text())       # de una versión más nueva: su aviso también se revisa
        (d / "estado.json").write_text(json.dumps({**e, "version_esquema": 99}))
        (d / "propuestas_medidas.json").write_text(json.dumps({"1": {
            "dato": PROPUESTAS["propuestas"][0]["dato"], "semaforo": "verde", "motivo": "6 clones, sin ráfaga reciente",
            "clones": 6, "recientes": 0, "perennes": 1, "mediana": 900, "demanda": "alta", "fecha": "2026-10-07"}}))
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal
    with Sesion() as s:                       # que el índice vea los archivos tocados arriba
        sincronizar_canal(s, slug)
    respuestas = [("asistente", cliente.get("/api/asistente").json())]
    for v, letras in ((largo, "CDEFGHIJ"), (short, "BCDE")):
        # La guía completa (/guia) no entra: ya no la enseña ninguna pantalla (se usa en los tests como comprobación).
        respuestas += [(f"vídeo {v['carpeta']}", cliente.get(f"/api/videos/{v['id']}").json()),
                       (f"enfoque {v['carpeta']}", cliente.get(f"/api/videos/{v['id']}/fase-b").json())]
        for letra in letras:
            r = cliente.get(f"/api/videos/{v['id']}/fase/{letra}", params={"revision": True})
            if r.status_code == 200:
                respuestas.append((f"fase {letra} de {v['carpeta']}", r.json()))
    malos = [f"{donde} → {clave}: {t[:120]}" for donde, r in respuestas for clave, t in _visibles(r)
             if es_jerga(t) or slug in t]
    assert not malos, "Jerga o identificadores en lo que enseña la API:\n" + "\n".join(malos)


def test_el_motivo_llano_del_semaforo_no_lleva_jerga():
    """Hallazgo 45: el motivo que ve el usuario sale de saturacion.py en lenguaje llano, en todas las ramas."""
    import saturacion as s
    casos = []
    for n in (1, s.CLONES_BAJO + 1, s.CLONES_ALTO):
        for recientes in (0, s.RAFAGA):
            for mediana in (10, 10**6):
                for amplio in (None, {"grandes": 0, "maximo": 0}, {"grandes": 9, "maximo": 10**7}):
                    c = {"clones": [0] * n, "recientes": recientes, "mediana": mediana, "maximo": 0}
                    casos.append(s.veredicto(c, amplio))
    assert {color for color, _, _ in casos} == {"ROJO", "ÁMBAR", "VERDE", "GRIS"}
    malos = [llano for _, _, llano in casos if es_jerga(llano) or "hueco" in llano and "hay hueco" not in llano]
    assert not malos, malos


def test_el_control_por_fotogramas_caduca_con_el_montaje(tmp_path):
    """Hallazgo 51: con el montaje desactualizado, el control de antes no sale «Hecho»."""
    from types import SimpleNamespace
    from app import tramos
    import os
    (tmp_path / "tmp").mkdir()
    (tmp_path / "final.mp4").write_bytes(b"x")
    (tmp_path / "tmp" / "control.png").write_bytes(b"x")
    os.utime(tmp_path / "final.mp4", (1000, 1000))
    os.utime(tmp_path / "tmp" / "control.png", (2000, 2000))           # el control, después del montaje
    c = SimpleNamespace(carpeta=tmp_path, existe=lambda n: (tmp_path / n).exists(),
                        ultima=lambda patron: max((p.stat().st_mtime for p in tmp_path.glob(patron)), default=0.0))
    assert tramos._luz_control(c, {"al_dia": True})["valor"] == "Hecho"
    assert tramos._luz_control(c, {"al_dia": False})["valor"] == "Del montaje anterior"
    os.utime(tmp_path / "final.mp4", (3000, 3000))                       # se volvió a montar después del control
    assert tramos._luz_control(c, {"al_dia": True})["valor"] == "Del montaje anterior"

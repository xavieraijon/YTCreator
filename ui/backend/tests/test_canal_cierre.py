"""Crear el canal paso a paso, pasos 7-11 (app/canal_cierre.py): reglas, equipo, alta en YouTube, ideas y cierre."""
import json
from datetime import datetime
import re


from app import canal_guiado
from tests.test_canal_guiado import _esperar, espacio  # noqa: F401  (fixture)
from tests.test_chat import _falso

API = "/api/asistente/canal"


def _canal_en(tmp_path, fase, previas):
    import contextlib
    import io

    import canales as kit_canales
    with contextlib.redirect_stdout(io.StringIO()):
        kit_canales.crear("ruina", "Ruina")
    carpeta = tmp_path / "canales" / "ruina"
    (carpeta / "estado_canal.json").write_text(json.dumps({"fase": fase, "completadas": previas}))
    return carpeta


def _rellenar(carpeta, *rutas):
    """Quita las marcas <<RELLENAR>> de esos archivos (o de todos) como lo haría Claude."""
    for f in (carpeta / r for r in rutas) if rutas else carpeta.rglob("*"):
        if f.is_file() and f.suffix in (".md", ".json") and "videos" not in f.relative_to(carpeta).parts:
            f.write_text(re.sub(r"<<RELLENAR.*?>>", "algo", f.read_text(encoding="utf-8"), flags=re.S), encoding="utf-8")


def _prueba(carpeta, que, datos):
    p = carpeta / "videos" / "_pruebas" / que
    p.mkdir(parents=True, exist_ok=True)
    (p / "prueba.json").write_text(json.dumps(datos))


def _estado(carpeta):
    return json.loads((carpeta / "estado_canal.json").read_text())


def test_pasos_7_a_11_tienen_pantalla(cliente, espacio, tmp_path):  # noqa: F811
    _canal_en(tmp_path, "G", list("ABCDEF"))
    d = cliente.get(API).json()
    assert all(p["guiado"] for p in d["pasos"]) and d["reglas"]["prueba"] is None


# --------------------------------------------------------------------------- G
REGLAS = {"resumen": ["Frases cortas", "Sin cifras largas"], "sintetico": {"respuesta": True, "motivo": "Escenas realistas"},
          "afiliacion": {"respuesta": False, "motivo": "No"}, "licencias": "Música propia"}


def test_reglas_proponer_y_elegir(cliente, espacio, tmp_path, monkeypatch):  # noqa: F811
    carpeta = _canal_en(tmp_path, "G", list("ABCDEF"))
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post(f"{API}/reglas/proponer", json={"indicaciones": "serias"}).status_code == 200
    _esperar(cliente, lambda d: d["trabajo"]["estado"] == "libre" and d["trabajo"]["conversacion"])
    p = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "reglas/prueba.json" in p and "«serias»" in p and "NO toques `cumplimiento`" in p
    assert cliente.post(f"{API}/reglas/elegir", json={"sintetico": True, "afiliacion": False}).status_code == 409
    _prueba(carpeta, "reglas", REGLAS)
    r = cliente.get(API).json()["reglas"]
    assert r["prueba"]["sintetico"]["respuesta"] and r["pendientes"]       # la plantilla aún tiene marcas
    assert cliente.post(f"{API}/reglas/elegir", json={"sintetico": True, "afiliacion": False}).status_code == 409
    assert _estado(carpeta)["fase"] == "G"
    # Como cuando el asistente termina: solo quedan las marcas de `cumplimiento`, que escribe la respuesta del usuario.
    cfg = (carpeta / "canal.json").read_text(encoding="utf-8")
    cfg = "\n".join(l if any(f'"{c}"' in l for c in ("contenido_sintetico", "motivo_sintetico", "afiliacion", "licencias"))
                    else re.sub(r"<<RELLENAR.*?>>", "algo", l) for l in cfg.splitlines())
    (carpeta / "canal.json").write_text(cfg, encoding="utf-8")
    _rellenar(carpeta, "docs/concepto.md")
    assert cliente.get(API).json()["reglas"]["pendientes"] == []
    r = cliente.post(f"{API}/reglas/elegir", json={"sintetico": True, "afiliacion": False})
    assert r.status_code == 200
    cfg = json.loads((carpeta / "canal.json").read_text())
    assert cfg["cumplimiento"]["contenido_sintetico"] == "si" and cfg["cumplimiento"]["afiliacion"] is False
    assert cfg["cumplimiento"]["licencias"] == "Música propia"
    assert _estado(carpeta)["fase"] == "H" and _estado(carpeta)["completadas"][-1] == "G"


# --------------------------------------------------------------------------- H
def test_equipo_quita_los_opcionales_no_elegidos(cliente, espacio, tmp_path):  # noqa: F811
    carpeta = _canal_en(tmp_path, "H", list("ABCDEFG"))
    assert cliente.post(f"{API}/equipo/elegir", json={"opcionales": []}).status_code == 409   # sin propuesta
    _prueba(carpeta, "equipo", {"roles": [{"id": "guionista", "porque": "Escribe", "recomendado": True},
                                          {"id": "inventado", "porque": "x"}],
                                "pruebas": [{"rol": "guionista", "resultado": "bien"}]})
    e = cliente.get(API).json()["equipo"]
    assert [r["id"] for r in e["roles"]] == ["narrativa", "guionista", "director-arte", "estratega-youtube",
                                             "verificador", "asesor-tematico"]
    assert e["roles"][1]["porque"] == "Escribe" and not e["roles"][0]["rellena"]
    assert cliente.post(f"{API}/equipo/elegir", json={"opcionales": []}).status_code == 409   # fichas sin rellenar
    _rellenar(carpeta, *(f"equipo/{r}.md" for r in ("narrativa", "guionista", "director-arte", "estratega-youtube",
                                                      "verificador")))
    assert cliente.post(f"{API}/equipo/elegir", json={"opcionales": ["verificador", "asesor-tematico"]}).status_code == 409
    assert cliente.post(f"{API}/equipo/elegir", json={"opcionales": ["verificador"]}).status_code == 200
    assert (carpeta / "equipo" / "verificador.md").exists() and not (carpeta / "equipo" / "asesor-tematico.md").exists()
    est = _estado(carpeta)
    assert est["fase"] == "I" and est["equipo"][-1] == "verificador"


# --------------------------------------------------------------------------- I
ALTA = {"nombre": "Ruina", "arroba": "@ruina", "descripcion": "x" * 1200, "palabras_clave": ["a", "b"],
        "categoria": "Educación", "audiencia": "No es para niños"}


def test_alta_confirmar_comprueba_el_canal(cliente, espacio, tmp_path, monkeypatch):  # noqa: F811
    carpeta = _canal_en(tmp_path, "I", list("ABCDEFGH"))
    _prueba(carpeta, "alta", ALTA)
    a = cliente.get(API).json()["alta"]
    assert a["prueba"]["arroba"] == "ruina" and len(a["prueba"]["descripcion"]) <= 1000 and a["avatar"] is None
    assert cliente.post(f"{API}/alta/confirmar", json={"url": "https://ejemplo.com/@ruina"}).status_code == 409

    async def falso(args):
        assert args[1:3] == ["-J", "--flat-playlist"] and args[-1] == "https://www.youtube.com/@ruina"
        return json.dumps({"channel_id": "UC" + "a" * 22, "channel": "Ruina"})

    monkeypatch.setattr(canal_guiado, "_lanzar", falso)
    r = cliente.post(f"{API}/alta/confirmar", json={"url": "https://www.youtube.com/@ruina/"})
    assert r.status_code == 200 and r.json()["resultado"]["coincide"]
    cfg = json.loads((carpeta / "canal.json").read_text())
    assert cfg["url"] == "https://www.youtube.com/@ruina" and "UC" + "a" * 22 in cfg["_url"]
    assert _estado(carpeta)["fase"] == "J"


def test_alta_confirmar_canal_inexistente(cliente, espacio, tmp_path, monkeypatch):  # noqa: F811
    carpeta = _canal_en(tmp_path, "I", list("ABCDEFGH"))

    async def falla(args):
        raise RuntimeError("ERROR: no existe")

    monkeypatch.setattr(canal_guiado, "_lanzar", falla)
    r = cliente.post(f"{API}/alta/confirmar", json={"url": "https://www.youtube.com/@nadie"})
    assert r.status_code == 409 and "No he podido ver" in r.json()["detail"] and _estado(carpeta)["fase"] == "I"


def test_alta_saltar_deja_la_url_vacia(cliente, espacio, tmp_path):  # noqa: F811
    carpeta = _canal_en(tmp_path, "I", list("ABCDEFGH"))
    assert cliente.post(f"{API}/alta/saltar").status_code == 200
    assert json.loads((carpeta / "canal.json").read_text())["url"] == ""
    assert _estado(carpeta)["fase"] == "J" and _estado(carpeta)["alta"] == {"saltada": True}


# --------------------------------------------------------------------------- J
def _ideas(n=6):
    return {"ideas": [{"id": i, "titulo": f"Título {i}", "dato": f"dato {i}", "amplio": "tema", "pilar": "🏦 Bancos",
                       "enfoque": f"Enfoque {i}"} for i in range(1, n + 1)] + [{"id": 1, "titulo": "repetida", "dato": "x"}],
            "recomendada": 2}


def test_ideas_medir_y_elegir(cliente, espacio, tmp_path, monkeypatch):  # noqa: F811
    carpeta = _canal_en(tmp_path, "J", list("ABCDEFGHI"))
    _rellenar(carpeta, "docs/ideas.md")
    # la plantilla de ideas.md: la marca de sección debe seguir para que la interfaz escriba las tablas
    (carpeta / "docs" / "ideas.md").write_text("# Ideas\n\n<<RELLENAR: una sección \"## <emoji> <pilar>\" (fase J)>>\n")
    _prueba(carpeta, "ideas", _ideas())
    d = cliente.get(API).json()["ideas"]
    assert len(d["ideas"]) == 6 and d["por_medir"] == [1, 2, 3, 4, 5, 6] and d["ideas"][1]["recomendada"]
    assert cliente.post(f"{API}/ideas/elegir", json={"candidata": 2}).status_code == 409    # sin medir

    llamadas = []

    async def falso(args):
        llamadas.append(args)
        sem = "ROJO" if args[2] == "Dato 3" else "VERDE"
        return "aviso\n" + json.dumps({"fecha": "2026-10-15", "semaforo": sem, "motivo": "m", "motivo_llano": f"llano {sem}"},
                                      indent=2)

    monkeypatch.setattr(canal_guiado, "_lanzar", falso)
    assert cliente.post(f"{API}/ideas/medir").json() == {"lanzadas": 6}
    d = _esperar(cliente, lambda d: not d["ideas"]["por_medir"] and not any(i["midiendo"] for i in d["ideas"]["ideas"]))["ideas"]
    assert d["ideas"][2]["medida"]["semaforo"] == "rojo" and d["ideas"][0]["medida"]["semaforo"] == "verde"
    assert cliente.post(f"{API}/ideas/elegir", json={"candidata": 3}).status_code == 409     # roja
    assert cliente.post(f"{API}/ideas/elegir", json={"candidata": 2, "descartadas": [1, 4]}).status_code == 409   # < 5 ideas
    r = cliente.post(f"{API}/ideas/elegir", json={"candidata": 2, "descartadas": [1]})
    assert r.status_code == 200, r.text
    texto = (carpeta / "docs" / "ideas.md").read_text()
    assert "## 🏦 Bancos" in texto and "(2026-10-15)" in texto and "RELLENAR" not in texto and "Título 1" not in texto
    est = _estado(carpeta)
    assert est["fase"] == "K" and est["candidata"]["id"] == 2 and est["candidata"]["semaforo"] == "verde"


# --------------------------------------------------------------------------- K
def test_cierre_exige_prueba_y_sin_marcas(cliente, espacio, tmp_path):  # noqa: F811
    from app.db import Sesion
    from app.modelos import Tarea
    carpeta = _canal_en(tmp_path, "K", list("ABCDEFGHIJ"))
    assert cliente.get(API).json()["cierre"]["pendientes"]
    assert cliente.post(f"{API}/cierre/terminar", json={"activar": True}).status_code == 409    # sin prueba
    with Sesion() as s:
        s.add(Tarea(herramienta="probar_kit", titulo="Probar el kit", canal="ruina", estado="hecha", argumentos={}, creada=datetime.now()))
        s.commit()
    assert cliente.post(f"{API}/cierre/terminar", json={"activar": True}).status_code == 409    # marcas
    _rellenar(carpeta)
    assert cliente.post(f"{API}/cierre/terminar", json={"activar": True}).status_code == 200
    assert _estado(carpeta)["fase"] == "hecho" and "K" in _estado(carpeta)["completadas"]
    assert (tmp_path / "canal_activo").read_text().strip() == "ruina"
    assert cliente.get(API).json()["creacion"] is None

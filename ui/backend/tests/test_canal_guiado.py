"""Crear el canal paso a paso (app/canal_guiado.py). Paso 1, Mercado: Claude propone nichos, la UI los mide con
mercado.py (aquí, uno falso) y elegir aprueba la fase A. Paso 2, Concepto: elegir crea la carpeta del canal. Paso 3,
Nombre: los nombres (de Claude y del usuario) se miden con nombre_canal.py (falso) y elegir renombra el canal. Paso 4,
Estilo: Claude escribe la prueba de laboratorio_estilo.py, las imágenes son una tarea y elegir escribe canal.json."""
import json
import time

import pytest

from app import config
from tests.test_chat import _falso

NICHOS = {"nichos": [
    {"id": 1, "nicho": "desastres financieros", "porque": "historias con giro", "publico": "adultos curiosos",
     "busquedas": ["estafas famosas", "quiebras de empresas", "", "a", "b"], "categoria": "educacion", "recomendado": True},
    {"id": 2, "nicho": "nada que ver", "busquedas": ["nada"], "categoria": "rara"},
    {"id": 3, "porque": "sin nicho: se descarta"},
]}


@pytest.fixture()
def espacio(tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    monkeypatch.setattr(kit_canal, "ACTIVO", tmp_path / "canal_activo")
    monkeypatch.setattr(kit_canal, "RAIZ", tmp_path)
    monkeypatch.setattr(config, "RAIZ", tmp_path)
    (tmp_path / "canales").mkdir()
    mercado = tmp_path / "analisis" / "mercado"
    mercado.mkdir(parents=True)
    return mercado


def _esperar(cliente, cond, segundos=15):
    fin = time.time() + segundos
    while time.time() < fin:
        d = cliente.get("/api/asistente/canal").json()
        if cond(d):
            return d
        time.sleep(0.1)
    raise AssertionError(d)


def test_sin_creacion_el_paso_1_es_el_actual(cliente, espacio):
    d = cliente.get("/api/asistente/canal").json()
    assert d["actual"] == "A" and d["creacion"] is None and len(d["pasos"]) == 11
    assert d["pasos"][0] == {"letra": "A", "nombre": "Arranque y mercado", "guiado": True, "estado": "actual"}
    assert d["pasos"][2]["nombre"] == "Nombre" and d["pasos"][2]["guiado"] is True
    assert d["pasos"][4]["guiado"] is True and d["pasos"][10]["guiado"] is True
    assert d["mercado"] == {"intereses": None, "propuestas": [], "error": None, "elegido": None, "por_medir": []}


def test_proponer_encarga_a_claude_y_guarda_los_intereses(cliente, espacio, tmp_path, monkeypatch):
    registro = _falso(tmp_path, monkeypatch)
    r = cliente.post("/api/asistente/canal/mercado/proponer", json={"intereses": "  dinero   e historia "})
    assert r.status_code == 200
    _esperar(cliente, lambda d: d["trabajo"]["estado"] == "libre" and d["trabajo"]["conversacion"])
    p = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "MODO UI" in p and "«dinero e historia»" in p and "nichos_propuestos.json" in p and "NO lances mercado.py" in p
    e = json.loads((espacio / "nuevo_canal.json").read_text())
    assert e == {"fase": "A", "completadas": [], "intereses": "dinero e historia"}
    assert cliente.get("/api/asistente/canal").json()["mercado"]["intereses"] == "dinero e historia"


def test_leer_medir_y_elegir(cliente, espacio, tmp_path, monkeypatch):
    (espacio / "nichos_propuestos.json").write_text(json.dumps(NICHOS))
    d = cliente.get("/api/asistente/canal").json()["mercado"]
    assert [p["id"] for p in d["propuestas"]] == [1, 2]
    uno, dos = d["propuestas"]
    assert uno["nicho"] == "Desastres financieros" and uno["busquedas"] == ["estafas famosas", "quiebras de empresas", "a", "b"]
    assert dos["categoria"] == "educacion" and dos["recomendado"] is False and d["por_medir"] == [1, 2]

    falso = tmp_path / "herr"
    falso.mkdir()
    (falso / "mercado.py").write_text(
        "import json, sys\n"
        "a = sys.argv[1:]\n"
        "if 'Nada que ver' in a: sys.exit('ERROR: yt-dlp falló')\n"
        "print('Informe guardado')\n"
        "print(json.dumps({'nicho': a[a.index('--nicho') + 1], 'semaforo': 'verde', 'motivo': 'hay sitio',\n"
        "                  'busquedas': [a[i + 1] for i, x in enumerate(a) if x == '--busqueda'],\n"
        "                  'informe': 'analisis/mercado/x.md'}))\n")
    monkeypatch.setattr(config, "HERRAMIENTAS", falso)
    assert cliente.post("/api/asistente/canal/mercado/medir").json() == {"lanzadas": 2}
    d = _esperar(cliente, lambda d: all(p["medida"] for p in d["mercado"]["propuestas"]))["mercado"]
    m = {p["id"]: p["medida"] for p in d["propuestas"]}
    assert m[1]["ok"] and m[1]["semaforo"] == "verde" and m[1]["busquedas"] == uno["busquedas"]
    assert m[2]["ok"] is False and m[2]["semaforo"] == "gris"
    assert d["por_medir"] == [] and cliente.post("/api/asistente/canal/mercado/medir").json() == {"lanzadas": 0}

    # Si Claude cambia las búsquedas, la medida vieja deja de valer
    NICHOS2 = json.loads(json.dumps(NICHOS))
    NICHOS2["nichos"][1]["busquedas"] = ["otra"]
    (espacio / "nichos_propuestos.json").write_text(json.dumps(NICHOS2))
    assert cliente.get("/api/asistente/canal").json()["mercado"]["por_medir"] == [2]

    assert cliente.post("/api/asistente/canal/mercado/elegir", json={"propuesta": 9}).status_code == 409
    assert cliente.post("/api/asistente/canal/mercado/elegir", json={"propuesta": 1}).status_code == 200
    e = json.loads((espacio / "nuevo_canal.json").read_text())
    assert e["fase"] == "B" and e["completadas"] == ["A"] and e["historial_fases"][0]["desde"] == "UI"
    assert e["nicho"]["nicho"] == "Desastres financieros" and e["nicho"]["semaforo"] == "verde"
    assert "nicho «Desastres financieros» elegido en la UI" in e["notas"]
    d = cliente.get("/api/asistente/canal").json()
    assert d["actual"] == "B" and d["pasos"][0]["estado"] == "hecho" and d["mercado"] is None
    # Pasado el mercado no se vuelve a proponer ni elegir
    assert cliente.post("/api/asistente/canal/mercado/proponer", json={}).status_code == 409
    assert cliente.post("/api/asistente/canal/mercado/elegir", json={"propuesta": 1}).status_code == 409


def test_canal_rapido_convertido_guarda_en_su_carpeta(cliente, espacio, tmp_path, monkeypatch):
    c = tmp_path / "canales" / "rapido-1"
    c.mkdir()
    (c / "canal.json").write_text(json.dumps({"nombre": "Rápido 1"}))
    (c / "estado_canal.json").write_text(json.dumps({"fase": "A", "completadas": [], "desde_rapido": True}))
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post("/api/asistente/canal/mercado/proponer", json={"intereses": "cocina"}).status_code == 200
    _esperar(cliente, lambda d: d["trabajo"]["estado"] == "libre" and d["trabajo"]["conversacion"])
    llamada = json.loads(registro.read_text().splitlines()[0])
    assert "canales/rapido-1/" in llamada["args"][1] and llamada["canal"] == "rapido-1"
    (espacio / "nichos_propuestos.json").write_text(json.dumps(NICHOS))
    assert cliente.post("/api/asistente/canal/mercado/elegir", json={"propuesta": 2}).status_code == 200
    e = json.loads((c / "estado_canal.json").read_text())
    assert e["desde_rapido"] and e["fase"] == "B" and e["intereses"] == "cocina" and e["nicho"]["semaforo"] is None
    assert not (espacio / "nuevo_canal.json").exists()


CONCEPTOS = {"conceptos": [
    {"id": 1, "nombre": "Ruina Ilustrada", "promesa": "cómo se hundieron fortunas enteras", "pilares": ["estafas", "quiebras"],
     "publico": "adultos", "formato": "10 min", "narrador": "voz seria", "ritmo": "1 por semana", "monetizacion": "anuncios"},
    {"id": 2, "nombre": "Sin promesa: se descarta"},
]}

NOMBRE_FALSO = (
    "import json, sys\n"
    "a = sys.argv[1:]\n"
    "n = a[0]\n"
    "if n == 'Roto': sys.exit('ERROR: YouTube no responde')\n"
    "ident = a[a.index('--id') + 1] if '--id' in a else n.replace(' ', '')\n"
    "ocupada = n == 'Ocupado'\n"
    "print(json.dumps([{'nombre': n, 'id': ident, 'arroba_libre': not ocupada, 'videos': 0,\n"
    "                   'semaforo': 'rojo' if ocupada else 'verde', 'motivo': 'La @ ya es de otro.' if ocupada else 'Libre.',\n"
    "                   'fecha': '2026-10-12'}]))\n")


def _en_fase_b(espacio):
    (espacio / "nuevo_canal.json").write_text(json.dumps({
        "fase": "B", "completadas": ["A"], "intereses": "dinero", "notas": "Fase A: nicho elegido.",
        "nicho": {"nicho": "Desastres financieros", "informe": "analisis/mercado/x.md"}}))
    (espacio / "nombres_propuestos.json").write_text("{}")         # de un canal anterior: elegir lo borra


def test_concepto_proponer_y_elegir_crea_la_carpeta(cliente, espacio, tmp_path, monkeypatch):
    _en_fase_b(espacio)
    assert cliente.post("/api/asistente/canal/concepto/elegir", json={"propuesta": 1}).status_code == 409
    registro = _falso(tmp_path, monkeypatch)
    r = cliente.post("/api/asistente/canal/concepto/proponer", json={"indicaciones": " serio  "})
    assert r.status_code == 200
    _esperar(cliente, lambda d: d["trabajo"]["estado"] == "libre" and d["trabajo"]["conversacion"])
    p = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "«Desastres financieros»" in p and "analisis/mercado/x.md" in p and "conceptos_propuestos.json" in p
    assert "«serio»" in p and "NO crees la carpeta" in p
    # En otro paso no se puede pedir ni elegir el nombre
    assert cliente.post("/api/asistente/canal/nombre/proponer", json={}).status_code == 409

    (espacio / "conceptos_propuestos.json").write_text(json.dumps(CONCEPTOS))
    d = cliente.get("/api/asistente/canal").json()
    assert d["actual"] == "B" and d["mercado"] is None and d["conceptos"]["indicaciones"] == "serio"
    [c] = d["conceptos"]["propuestas"]
    assert c["nombre"] == "Ruina Ilustrada" and c["recomendado"] and c["pilares"] == ["Estafas", "Quiebras"]

    assert cliente.post("/api/asistente/canal/concepto/elegir", json={"propuesta": 7}).status_code == 409
    r = cliente.post("/api/asistente/canal/concepto/elegir", json={"propuesta": 1})
    assert r.json() == {"ok": True, "slug": "ruina-ilustrada"}
    carpeta = tmp_path / "canales" / "ruina-ilustrada"
    assert json.loads((carpeta / "canal.json").read_text())["nombre"] == "Ruina Ilustrada"
    e = json.loads((carpeta / "estado_canal.json").read_text())
    assert e["fase"] == "C" and e["completadas"] == ["A", "B"] and e["intereses"] == "dinero"
    assert e["concepto"]["promesa"] == "Cómo se hundieron fortunas enteras" and "carpeta canales/ruina-ilustrada/" in e["notas"]
    assert not (espacio / "nuevo_canal.json").exists() and not (espacio / "nombres_propuestos.json").exists()
    d = cliente.get("/api/asistente/canal").json()
    assert d["actual"] == "C" and d["creacion"]["slug"] == "ruina-ilustrada"
    assert d["concepto"] == {"nombre": "Ruina Ilustrada", "promesa": "Cómo se hundieron fortunas enteras"}
    assert d["nombres"] == {"propuestas": [], "error": None, "por_medir": []}


def test_nombre_medir_anadir_y_elegir_renombra(cliente, espacio, tmp_path, monkeypatch):
    _en_fase_b(espacio)
    (espacio / "conceptos_propuestos.json").write_text(json.dumps(CONCEPTOS))
    assert cliente.post("/api/asistente/canal/concepto/elegir", json={"propuesta": 1}).status_code == 200
    viejo = tmp_path / "canales" / "ruina-ilustrada"
    concepto = viejo / "docs" / "concepto.md"
    assert "<<RELLENAR: @identificador" in concepto.read_text()

    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post("/api/asistente/canal/nombre/proponer", json={"indicaciones": "corto"}).status_code == 200
    _esperar(cliente, lambda d: d["trabajo"]["estado"] == "libre" and d["trabajo"]["conversacion"])
    llamada = json.loads(registro.read_text().splitlines()[0])
    assert llamada["canal"] == "ruina-ilustrada" and "nombres_propuestos.json" in llamada["args"][1]
    assert "«corto»" in llamada["args"][1] and "NO midas nada" in llamada["args"][1]

    (espacio / "nombres_propuestos.json").write_text(json.dumps({"nombres": [
        {"id": 1, "nombre": "Dinero en Llamas", "arroba": "@DineroLlamas", "porque": "dice el desastre"},
        {"id": 2, "nombre": "Ocupado", "porque": "su @ es de otro"},
        {"id": 3, "nombre": "Roto"},
        {"id": 4, "porque": "sin nombre: se descarta"},
    ]}))
    herr = tmp_path / "herr"
    herr.mkdir()
    (herr / "nombre_canal.py").write_text(NOMBRE_FALSO)
    monkeypatch.setattr(config, "HERRAMIENTAS", herr)
    d = cliente.get("/api/asistente/canal").json()["nombres"]
    assert [p["id"] for p in d["propuestas"]] == [1, 2, 3] and d["por_medir"] == [1, 2, 3]
    assert d["propuestas"][0]["arroba"] == "DineroLlamas" and d["propuestas"][0]["recomendado"]

    # Los del usuario: validados, sin repetir, con id propio y medidos igual
    assert cliente.post("/api/asistente/canal/nombre/anadir", json={"nombre": "x"}).status_code == 422
    assert cliente.post("/api/asistente/canal/nombre/anadir", json={"nombre": "Mío", "arroba": "@a b"}).status_code == 422
    assert cliente.post("/api/asistente/canal/nombre/anadir", json={"nombre": "ocupado"}).status_code == 422
    r = cliente.post("/api/asistente/canal/nombre/anadir", json={"nombre": "  ruina   total ", "arroba": "@RuinaTotal"})
    assert r.json() == {"ok": True, "id": 101}
    d = _esperar(cliente, lambda d: all(p["medida"] for p in d["nombres"]["propuestas"]))["nombres"]
    m = {p["id"]: p for p in d["propuestas"]}
    assert m[101]["nombre"] == "Ruina total" and m[101]["propio"] and m[101]["medida"]["id"] == "RuinaTotal"
    assert m[1]["medida"]["id"] == "DineroLlamas" and m[1]["medida"]["semaforo"] == "verde"
    assert m[2]["medida"]["arroba_libre"] is False and m[3]["medida"]["semaforo"] == "gris"
    assert cliente.post("/api/asistente/canal/nombre/medir").json() == {"lanzadas": 0}

    # Una @ que ya es de otro no se puede elegir
    r = cliente.post("/api/asistente/canal/nombre/elegir", json={"propuesta": 2})
    assert r.status_code == 409 and "@Ocupado" in r.json()["detail"]
    r = cliente.post("/api/asistente/canal/nombre/elegir", json={"propuesta": 1})
    assert r.json() == {"ok": True, "slug": "dinero-en-llamas"}
    nuevo = tmp_path / "canales" / "dinero-en-llamas"
    assert not viejo.exists() and nuevo.is_dir()
    cfg = json.loads((nuevo / "canal.json").read_text())
    assert cfg["nombre"] == "Dinero en Llamas" and cfg["slugs_anteriores"] == ["ruina-ilustrada"]
    texto = (nuevo / "docs" / "concepto.md").read_text()
    assert "@DineroLlamas (libre el 2026-10-12" in texto and "<<RELLENAR: @identificador" not in texto
    assert "Dice el desastre. Búsqueda en YouTube: Libre." in texto and "«Ocupado» (rojo" in texto
    e = json.loads((nuevo / "estado_canal.json").read_text())
    assert e["fase"] == "D" and e["completadas"] == ["A", "B", "C"]
    assert e["nombre"] == {"nombre": "Dinero en Llamas", "arroba": "DineroLlamas", "semaforo": "verde", "motivo": "Libre."}
    d = cliente.get("/api/asistente/canal").json()
    assert d["actual"] == "D" and d["nombres"] is None and d["pasos"][3]["guiado"] is True
    assert d["estilos"] == {"indicaciones": None, "escenas": [], "estilos": [], "error": None, "faltan": 0, "referencias": []}


ESTILOS = {
    "formato": "horizontal",
    "escenas": {"banco": "a crowd outside a bank, 1929, morning light", "caja": "an empty safe, close-up"},
    "escenas_es": {"banco": "una multitud ante un banco en 1929"},
    "estilos": {"E1_tinta": "ink drawing in a {paleta}: {escena}", "E2_oleo": "oil painting: {escena}",
                "malo id": "x {escena}", "E3_sin": "sin escena"},
    "presentacion": {"E2_oleo": {"nombre": "óleo", "porque": "da peso"}},
    "recomendado": "E2_oleo",
    "paleta": "sepia and red palette",
    "paletas": {"Estafas": "green palette"},
}


def _en_fase_d(tmp_path):
    import contextlib
    import io

    import canales as kit_canales
    with contextlib.redirect_stdout(io.StringIO()):
        kit_canales.crear("ruina", "Ruina")
    carpeta = tmp_path / "canales" / "ruina"
    (carpeta / "estado_canal.json").write_text(json.dumps({"fase": "D", "completadas": ["A", "B", "C"]}))
    return carpeta


def test_estilo_proponer_imagenes_y_elegir(cliente, espacio, tmp_path, monkeypatch):
    carpeta = _en_fase_d(tmp_path)
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post("/api/asistente/canal/estilo/proponer", json={"indicaciones": "oscuro"}).status_code == 200
    _esperar(cliente, lambda d: d["trabajo"]["estado"] == "libre" and d["trabajo"]["conversacion"])
    llamada = json.loads(registro.read_text().splitlines()[0])
    p = llamada["args"][1]
    assert llamada["canal"] == "ruina" and "canales/ruina/videos/_pruebas/estilo/prueba.json" in p
    assert "«oscuro»" in p and "NO generes imágenes" in p and "CONSERVA" not in p
    assert "CONSERVA las escenas" in __import__("app.canal_guiado", fromlist=["x"]).mensaje_estilo(
        "", True, {"slug": "ruina", "nombre": "Ruina"})

    # Sin prueba no se pueden pintar ni elegir
    r = cliente.post("/api/tareas", json={"herramienta": "estilo_canal", "argumentos": {"canal": "ruina"}})
    assert r.status_code == 422 and "proponga" in r.json()["detail"]
    assert cliente.post("/api/asistente/canal/estilo/elegir", json={"estilo": "E1_tinta"}).status_code == 409

    pruebas = carpeta / "videos" / "_pruebas" / "estilo"
    pruebas.mkdir(parents=True)
    (pruebas / "prueba.json").write_text(json.dumps(ESTILOS))
    d = cliente.get("/api/asistente/canal").json()
    assert d["tarea"] is None
    e = d["estilos"]
    assert [x["id"] for x in e["escenas"]] == ["banco", "caja"]
    assert e["escenas"][0]["texto"] == "Una multitud ante un banco en 1929" and e["escenas"][1]["texto"] == "Caja"
    assert [x["id"] for x in e["estilos"]] == ["E1_tinta", "E2_oleo"] and e["faltan"] == 4
    assert e["estilos"][1].pop("pedidos")["caja"].startswith("oil painting")
    assert e["estilos"][1] == {"id": "E2_oleo", "nombre": "Óleo", "porque": "Da peso", "recomendado": True,
                               "imagenes": {}, "con_referencia": False}
    assert e["paleta"] == "sepia and red palette" and e["paletas"] == {"Estafas": "green palette"}
    assert cliente.post("/api/asistente/canal/estilo/elegir", json={"estilo": "E1_tinta"}).status_code == 409

    # Una imagen cuenta si se hizo con el prompt de ahora (prompts.json de laboratorio_estilo.py)
    for nombre in ("E1_tinta_klein_banco.png", "E1_tinta_klein_caja.png"):
        (pruebas / nombre).write_bytes(b"png")
    (pruebas / "prompts.json").write_text(json.dumps({
        "E1_tinta_klein_banco.png": "ink drawing in a sepia and red palette: a crowd outside a bank, 1929, morning light",
        "E1_tinta_klein_caja.png": "un prompt viejo"}))
    e = cliente.get("/api/asistente/canal").json()["estilos"]
    assert list(e["estilos"][0]["imagenes"]) == ["banco"] and e["faltan"] == 3
    assert e["estilos"][0]["imagenes"]["banco"].startswith("ruina/videos/_pruebas/estilo/E1_tinta_klein_banco.png?v=")

    r = cliente.post("/api/asistente/canal/estilo/elegir", json={"estilo": "E1_tinta"})
    assert r.json() == {"ok": True, "estilo": "E1_tinta"}
    cfg = json.loads((carpeta / "canal.json").read_text())
    assert cfg["estilo"] == "ink drawing in a {paleta}: {escena}"
    assert cfg["paletas"]["defecto"] == "sepia and red palette" and cfg["paletas"]["Estafas"] == "green palette"
    assert "_comentario" in cfg["paletas"]
    estado = json.loads((carpeta / "estado_canal.json").read_text())
    assert estado["fase"] == "E" and estado["completadas"] == ["A", "B", "C", "D"]
    assert estado["estilo"] == {"id": "E1_tinta", "nombre": "E1 tinta",
                                "imagenes": ["ruina/videos/_pruebas/estilo/E1_tinta_klein_banco.png"]}
    assert "Fase D: estilo «E1 tinta»" in estado["notas"]
    assert cliente.post("/api/asistente/canal/estilo/elegir", json={"estilo": "E1_tinta"}).status_code == 409


def test_estilo_sin_paleta_borra_las_paletas(cliente, espacio, tmp_path):
    carpeta = _en_fase_d(tmp_path)
    pruebas = carpeta / "videos" / "_pruebas" / "estilo"
    pruebas.mkdir(parents=True)
    (pruebas / "prueba.json").write_text(json.dumps(ESTILOS))
    (pruebas / "E2_oleo_klein_caja.png").write_bytes(b"png")       # sin prompts.json: vale (hecha a mano)
    assert cliente.post("/api/asistente/canal/estilo/elegir", json={"estilo": "E2_oleo"}).status_code == 200
    cfg = json.loads((carpeta / "canal.json").read_text())
    assert cfg["estilo"] == "oil painting: {escena}" and "paletas" not in cfg


# --------------------------------------------------------------------------- paso 5: voz

VOCES = {
    "texto": "En 1929 {pausa:300} todo el mundo [curious] quería comprar acciones.",
    "voces": [{"id": "rachel", "voz": "ai33:elevenlabs_abc", "nombre": "Rachel", "porque": "Grave y pausada.",
               "muestra_oficial": "https://ejemplo.invalid/rachel.mp3"},
              {"id": "puck", "voz": "gemini:Puck", "nombre": "Puck", "porque": "Gratis", "estilo": "calmado, de documental"},
              {"id": "marta", "voz": "es-ES-Marta:MAI-Voice-2", "velocidad": "-5%"}],
    "recomendado": "puck",
    "estilo_voz": "castellano neutro, sereno",
    "narrador": "Un narrador en off que habla de tú.",
    "marcas": "[curious]",
}


def _en_fase_e(tmp_path):
    carpeta = _en_fase_d(tmp_path)
    (carpeta / "estado_canal.json").write_text(json.dumps({"fase": "E", "completadas": ["A", "B", "C", "D"]}))
    pruebas = carpeta / "videos" / "_pruebas" / "voz"
    pruebas.mkdir(parents=True)
    return carpeta, pruebas


def test_voz_proponer_estado_y_coste(cliente, espacio, tmp_path, monkeypatch):
    import muestras_voz
    carpeta, pruebas = _en_fase_e(tmp_path)
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post("/api/asistente/canal/voz/proponer", json={"indicaciones": "grave"}).status_code == 200
    _esperar(cliente, lambda d: d["trabajo"]["estado"] == "libre" and d["trabajo"]["conversacion"])
    p = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "canales/ruina/videos/_pruebas/voz/prueba.json" in p and "«grave»" in p and "muestras_voz.py buscar" in p
    assert "NO locutes" in p and "CONSERVA" not in p

    d = cliente.get("/api/asistente/canal").json()
    assert d["voces"]["texto"] is None and d["voces"]["indicaciones"] == "grave"
    assert cliente.post("/api/tareas", json={"herramienta": "voz_canal", "argumentos": {"canal": "ruina"}}).status_code == 422

    (pruebas / "prueba.json").write_text(json.dumps(VOCES))
    v = cliente.get("/api/asistente/canal").json()["voces"]
    assert [x["id"] for x in v["voces"]] == ["rachel", "puck", "marta"] and v["faltan"] == 3
    assert [x["de_pago"] for x in v["voces"]] == [True, False, False] and v["voces"][1]["recomendado"] is True
    assert v["voces"][2]["nombre"] == "Marta" and v["voces"][2]["velocidad"] == "-5%"
    assert v["coste_ai33"]["creditos"] == muestras_voz.coste_ai33(VOCES["texto"]) and v["coste_ai33"]["euros"] < 0.01
    assert "huella" not in v["voces"][0]

    # Solo cuenta la muestra hecha con el texto y la voz de ahora; a la de pago le basta la oficial para no «faltar»
    (pruebas / "puck.mp3").write_bytes(b"mp3")
    (pruebas / "marta.mp3").write_bytes(b"mp3")
    (pruebas / "rachel_oficial.mp3").write_bytes(b"mp3")
    (pruebas / "muestras.json").write_text(json.dumps({
        "puck": {"huella": muestras_voz.huella(VOCES["texto"], VOCES["voces"][1]), "ppm": 145, "duracion": 4.1,
                 "avisos": ["1.2 s «acciones»: sube como pregunta"]},
        "marta": {"huella": "vieja", "ppm": 150, "error": None},
        "rachel": {"oficial": "rachel_oficial.mp3"}}))
    v = cliente.get("/api/asistente/canal").json()["voces"]
    rachel, puck, marta = v["voces"]
    assert rachel["muestra"] is None and rachel["oficial"].startswith("ruina/videos/_pruebas/voz/rachel_oficial.mp3?v=")
    assert puck["muestra"].startswith("ruina/videos/_pruebas/voz/puck.mp3?v=") and puck["ppm"] == 145
    assert puck["avisos"] == ["1.2 s «acciones»: sube como pregunta"]
    assert marta["muestra"] is None and marta["ppm"] is None and v["faltan"] == 1


def test_voz_de_pago_pide_confirmar_el_coste(cliente, espacio, tmp_path):
    import muestras_voz
    _, pruebas = _en_fase_e(tmp_path)
    (pruebas / "prueba.json").write_text(json.dumps(VOCES))
    creditos = muestras_voz.coste_ai33(VOCES["texto"])

    def lanzar(**a):
        return cliente.post("/api/tareas", json={"herramienta": "voz_canal_ai33", "argumentos": {"canal": "ruina", **a}})
    r = lanzar(voz="puck", confirmado=True, previsto=creditos)
    assert r.status_code == 422 and "no es de pago" in r.json()["detail"]
    r = lanzar(voz="rachel", previsto=creditos)
    assert r.status_code == 422 and "confirmar" in r.json()["detail"]
    r = lanzar(voz="rachel", confirmado=True, previsto=creditos - 1)
    assert r.status_code == 422 and "ha cambiado" in r.json()["detail"]


def test_voz_elegir_escribe_canal_y_concepto(cliente, espacio, tmp_path):
    import muestras_voz
    carpeta, pruebas = _en_fase_e(tmp_path)
    assert cliente.post("/api/asistente/canal/voz/elegir", json={"voz": "puck"}).status_code == 409   # sin prueba
    (pruebas / "prueba.json").write_text(json.dumps(VOCES))
    assert cliente.post("/api/asistente/canal/voz/elegir", json={"voz": "puck"}).status_code == 409   # sin muestra
    assert cliente.post("/api/asistente/canal/voz/elegir", json={"voz": "nadie"}).status_code == 409
    (pruebas / "puck.mp3").write_bytes(b"mp3")
    (pruebas / "muestras.json").write_text(json.dumps({
        "puck": {"huella": muestras_voz.huella(VOCES["texto"], VOCES["voces"][1]), "ppm": 150}}))

    r = cliente.post("/api/asistente/canal/voz/elegir", json={"voz": "puck"})
    assert r.json() == {"ok": True, "voz": "puck"}
    cfg = json.loads((carpeta / "canal.json").read_text())
    assert cfg["voz"] == "gemini:Puck" and cfg["voces"]["gemini"] == "gemini:Puck"
    assert cfg["voces"]["azure"] == "es-ES-Marta:MAI-Voice-2" and "_comentario" in cfg["voces"]
    assert cfg["estilo_voz"] == "calmado, de documental" and cfg["palabras_por_minuto"] == 150
    assert cfg["duraciones"]["10"]["palabras"] == [1460, 1540] and cfg["duraciones"]["short"]["segundos"] == [30, 55]
    concepto = (carpeta / "docs" / "concepto.md").read_text()
    assert "- Un narrador en off que habla de tú\n" in concepto
    assert "- Voz: Puck (`gemini:Puck`, gratis, 150 palabras/min medidas), elegida en la UI el " in concepto
    assert "alternativa gratuita: `es-ES-Marta:MAI-Voice-2`" in concepto
    assert "- Marcas de emoción permitidas: [curious], como mucho" in concepto
    estado = json.loads((carpeta / "estado_canal.json").read_text())
    assert estado["fase"] == "F" and estado["completadas"] == ["A", "B", "C", "D", "E"]
    assert estado["voz"] == {"id": "puck", "nombre": "Puck", "voz": "gemini:Puck", "de_pago": False, "ppm": 150,
                             "muestra": "ruina/videos/_pruebas/voz/puck.mp3"}
    assert "palabras de cada duración reajustadas" in estado["notas"]
    assert cliente.post("/api/asistente/canal/voz/elegir", json={"voz": "puck"}).status_code == 409


def test_voz_de_pago_se_elige_con_la_muestra_oficial(cliente, espacio, tmp_path):
    carpeta, pruebas = _en_fase_e(tmp_path)
    (pruebas / "prueba.json").write_text(json.dumps(VOCES))
    (pruebas / "rachel_oficial.mp3").write_bytes(b"mp3")
    (pruebas / "muestras.json").write_text(json.dumps({"rachel": {"oficial": "rachel_oficial.mp3"}}))
    assert cliente.post("/api/asistente/canal/voz/elegir", json={"voz": "rachel"}).status_code == 200
    cfg = json.loads((carpeta / "canal.json").read_text())
    assert cfg["voz"] == "ai33:elevenlabs_abc" and cfg["voces"]["ai33"] == "ai33:elevenlabs_abc"
    assert cfg["estilo_voz"] == "Castellano neutro, sereno" and cfg["palabras_por_minuto"] == 170   # sin medir
    estado = json.loads((carpeta / "estado_canal.json").read_text())
    assert estado["voz"]["muestra"] == "ruina/videos/_pruebas/voz/rachel_oficial.mp3" and estado["voz"]["de_pago"]


def test_voz_de_pago_sin_muestra_oficial_no_queda_pendiente(cliente, espacio, tmp_path):
    _, pruebas = _en_fase_e(tmp_path)
    sin_oficial = {**VOCES, "voces": [{k: x for k, x in VOCES["voces"][0].items() if k != "muestra_oficial"}]}
    (pruebas / "prueba.json").write_text(json.dumps(sin_oficial))
    v = cliente.get("/api/asistente/canal").json()["voces"]
    assert v["faltan"] == 0 and v["voces"][0]["oficial"] is None and "con_oficial" not in v["voces"][0]


# --------------------------------------------------------------------------- paso 6: marca

MARCAS = {
    "titulo": "El *crack* del 29",
    "propuestas": [
        {"id": "clasica", "nombre": "Clásica", "porque": "Serif con peso.", "fuente": "PlayfairDisplay-Black.ttf",
         "fuente_nombre": "Playfair Display Black", "acento": "#C0392B", "resaltado": "#F1C40F", "texto": "#F5F0E6",
         "fondo": "#1B1B1B", "musica": "misterio"},
        {"id": "potente", "nombre": "Potente", "fuente": "LuckiestGuy-Regular.ttf", "acento": "#E67E22",
         "resaltado": "#FFFFFF", "texto": "#FFFFFF", "fondo": "#101820", "musica": "inventada"}],
    "recomendada": "clasica",
    "marca": {"monograma": "R*F*", "titulo": "RUINA *FINAL*", "lema": "La historia de cómo se pierde todo", "pilares": "Crisis  ·  Estafas"},
    "pantalla_final": {"titulo": "RUINA|*FINAL*", "lema": "Hasta la próxima caída"},
    "hashtags": ["#economia", "#RuinaFinal", "mal hecho"],
}


def _en_fase_f(tmp_path):
    carpeta = _en_fase_d(tmp_path)
    fondo = carpeta / "videos" / "_pruebas" / "estilo" / "uno.png"
    fondo.parent.mkdir(parents=True)
    fondo.write_bytes(b"png")
    (carpeta / "estado_canal.json").write_text(json.dumps({
        "fase": "F", "completadas": ["A", "B", "C", "D", "E"],
        "estilo": {"imagenes": ["ruina/videos/_pruebas/estilo/uno.png"]}}))
    pruebas = carpeta / "videos" / "_pruebas" / "marca"
    pruebas.mkdir(parents=True)
    return carpeta, pruebas, fondo


def test_marca_proponer_estado_y_muestras(cliente, espacio, tmp_path, monkeypatch):
    import muestras_marca
    carpeta, pruebas, fondo = _en_fase_f(tmp_path)
    registro = _falso(tmp_path, monkeypatch)
    assert cliente.post("/api/asistente/canal/marca/proponer", json={"indicaciones": "elegante"}).status_code == 200
    _esperar(cliente, lambda d: d["trabajo"]["estado"] == "libre" and d["trabajo"]["conversacion"])
    p = json.loads(registro.read_text().splitlines()[0])["args"][1]
    assert "canales/ruina/videos/_pruebas/marca/prueba.json" in p and "«elegante»" in p and "recursos/fuentes" in p
    assert cliente.get("/api/asistente/canal").json()["marcas"]["propuestas"] == []
    assert cliente.post("/api/tareas", json={"herramienta": "marca_canal", "argumentos": {"canal": "ruina"}}).status_code == 422

    (pruebas / "prueba.json").write_text(json.dumps(MARCAS))
    m = cliente.get("/api/asistente/canal").json()["marcas"]
    assert [x["id"] for x in m["propuestas"]] == ["clasica", "potente"] and m["faltan"] == 4
    assert m["propuestas"][0]["recomendada"] and m["propuestas"][1]["musica"] == "tranquilo"   # ambiente inventado
    assert m["hashtags"] == ["#economia", "#RuinaFinal"] and m["marca"]["titulo"] == "RUINA *FINAL*"

    clasica = MARCAS["propuestas"][0]
    (pruebas / "clasica-1.jpg").write_bytes(b"jpg")
    (pruebas / "muestras.json").write_text(json.dumps({
        "clasica-1.jpg": {"huella": muestras_marca.huella("El *crack* del 29", clasica, fondo), "error": None}}))
    (pruebas / "musica_misterio.mp3").write_bytes(b"mp3")
    m = cliente.get("/api/asistente/canal").json()["marcas"]
    assert m["faltan"] == 2 and m["propuestas"][0]["miniaturas"][0].startswith("ruina/videos/_pruebas/marca/clasica-1.jpg?v=")
    assert m["propuestas"][0]["audio"] and not m["propuestas"][1]["miniaturas"]


def test_marca_elegir_escribe_canal(cliente, espacio, tmp_path):
    import muestras_marca
    carpeta, pruebas, fondo = _en_fase_f(tmp_path)
    assert cliente.post("/api/asistente/canal/marca/elegir", json={"marca": "clasica"}).status_code == 409   # sin prueba
    (pruebas / "prueba.json").write_text(json.dumps(MARCAS))
    assert cliente.post("/api/asistente/canal/marca/elegir", json={"marca": "clasica"}).status_code == 409   # sin miniatura
    assert cliente.post("/api/asistente/canal/marca/elegir", json={"marca": "nadie"}).status_code == 409
    (pruebas / "clasica-1.jpg").write_bytes(b"jpg")
    (pruebas / "muestras.json").write_text(json.dumps({
        "clasica-1.jpg": {"huella": muestras_marca.huella("El *crack* del 29", MARCAS["propuestas"][0], fondo), "error": None}}))

    assert cliente.post("/api/asistente/canal/marca/elegir", json={"marca": "clasica"}).json() == {"ok": True, "marca": "clasica"}
    cfg = json.loads((carpeta / "canal.json").read_text())
    assert cfg["fuentes"]["titulo"] == {"archivo": "PlayfairDisplay-Black.ttf", "nombre": "Playfair Display Black"}
    assert cfg["colores"]["acento"] == "#C0392B" and cfg["colores"]["fondo"] == "#1B1B1B"
    assert cfg["marca"]["monograma"] == "R*F*" and cfg["marca"]["lema"].startswith("La historia")
    assert cfg["pantalla_final"]["lema"] == "Hasta la próxima caída" and cfg["pantalla_final"]["musica"] == "misterio"
    assert cfg["hashtags_shorts"] == ["#shorts", "#economia", "#RuinaFinal"]
    estado = json.loads((carpeta / "estado_canal.json").read_text())
    assert estado["fase"] == "G" and estado["completadas"][-1] == "F" and estado["marca"]["id"] == "clasica"
    assert cliente.post("/api/asistente/canal/marca/elegir", json={"marca": "clasica"}).status_code == 409

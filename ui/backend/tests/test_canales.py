from app import config


def test_salud(cliente):
    r = cliente.get("/api/salud").json()
    assert r["ok"] is True and r["reiniciar"] is False and r["cambiados"] == []


def test_salud_avisa_si_el_codigo_cambia_tras_arrancar(cliente, monkeypatch):
    from app import main
    monkeypatch.setattr(main, "ARRANQUE", 0)                   # como si hubiera arrancado antes de todo
    r = cliente.get("/api/salud").json()
    assert r["reiniciar"] is True and "ui/backend/app/main.py" in r["cambiados"]


def test_lista_canales_coincide_con_los_archivos(cliente):
    datos = cliente.get("/api/canales").json()
    slugs = {c["slug"] for c in datos}
    activo = (config.RAIZ / "canal_activo").read_text(encoding="utf-8").strip()
    assert activo in slugs
    assert [c["slug"] for c in datos if c["activo"]] == [activo]
    assert all(c["archivado"] == c["slug"].startswith("_archivo/") for c in datos)


def test_activar_canal_inexistente_da_404_y_no_toca_canal_activo(cliente):
    antes = (config.RAIZ / "canal_activo").read_text(encoding="utf-8")
    r = cliente.post("/api/canales/no-existe/activar")
    assert r.status_code == 404
    assert (config.RAIZ / "canal_activo").read_text(encoding="utf-8") == antes


def test_activar_el_canal_activo_lo_deja_igual(cliente):
    antes = (config.RAIZ / "canal_activo").read_text(encoding="utf-8")
    activo = antes.strip()
    r = cliente.post(f"/api/canales/{activo}/activar")
    assert r.status_code == 200
    assert (config.RAIZ / "canal_activo").read_text(encoding="utf-8").strip() == activo


def test_ruta_api_inexistente_da_404(cliente):
    assert cliente.get("/api/no-existe").status_code == 404


def test_actualizar_todo(cliente, monkeypatch):
    from app.rutas import tareas
    from app.eventos import difusor
    datos = {"cloudflare": {"libres": 5000}, "azure": {"libres": 1}, "ai33": {"saldo": 7}}
    monkeypatch.setattr(tareas, "_consultar_cuotas", lambda: datos)    # sin red
    cola = difusor.suscribir()
    r = cliente.post("/api/actualizar").json()
    assert r["canales"] >= 1 and r["videos"] >= 1 and r["cuotas_error"] is None
    assert cliente.get("/api/cuotas").json()["datos"] == datos
    avisos = [cola.get_nowait() for _ in range(cola.qsize())]
    assert any(a["tipo"] == "cuotas" and a["datos"] == datos for a in avisos)      # llegan solas a la UI
    difusor.baja(cola)


def test_estructuras_de_referencia(cliente, tmp_path, monkeypatch):
    import json
    from app.rutas import canales as rc
    carpeta = tmp_path / "analisis" / "estructuras" / "YzD6Dz423Y8"
    carpeta.mkdir(parents=True)
    (carpeta / "metricas.json").write_text(json.dumps({
        "id": "YzD6Dz423Y8", "titulo": "Uno", "canal": "C", "idioma": "es", "duracion_s": 600, "visitas": 10,
        "ratio_visitas_suscriptores": 2.0, "outlier": False, "mrv": {"reciente": True}}))
    (carpeta / "estructura.md").write_text("# Estructura")
    (carpeta / "transcripcion.txt").write_text("secreto")
    monkeypatch.setattr(rc, "carpeta_canal", lambda slug: tmp_path)
    slug = cliente.get("/api/canales").json()[0]["slug"]
    assert [e["id"] for e in cliente.get(f"/api/canales/{slug}/estructuras").json()] == ["YzD6Dz423Y8"]
    assert cliente.get(f"/api/canales/{slug}/estructuras/YzD6Dz423Y8").json()["texto"] == "# Estructura"
    assert cliente.get(f"/api/canales/{slug}/estructuras/..%2F..").status_code in (404, 422)
    assert cliente.get(f"/api/canales/{slug}/estructuras/transcripcion").status_code in (404, 422)


def test_crear_video_nuevo(cliente, tmp_path, monkeypatch):
    import json
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path)
    pruebas = tmp_path / "prueba"
    (pruebas / "videos" / "001-uno").mkdir(parents=True)
    (pruebas / "videos" / "S001-corto").mkdir()
    (pruebas / "videos" / "990-prueba").mkdir()           # los 9xx son de pruebas: no cuentan
    (pruebas / "canal.json").write_text("{}")
    r = cliente.post("/api/canales/prueba/videos", json={
        "tema": "¿Por qué el cielo es azul? Ñandú", "duracion": 10, "referencia": "https://youtu.be/YzD6Dz423Y8"})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["carpeta"] == "002-por-que-el-cielo-es-azul-nandu" and d["tipo"] == "largo"
    estado = json.loads((pruebas / "videos" / d["carpeta"] / "estado.json").read_text())
    assert estado["fase"] == "B" and estado["completadas"] == ["A"] and estado["duracion_objetivo"] == 10
    assert estado["referencia"] == "https://youtu.be/YzD6Dz423Y8" and estado["creado_desde"] == "UI"
    assert cliente.get(f"/api/videos/{d['id']}/guia").json()["fase_actual"] == "B"     # la A se comprueba sola
    c = cliente.post("/api/canales/prueba/videos", json={"tipo": "short", "tema": "Un dato", "apoya": "001-uno"})
    assert c.json()["carpeta"] == "S002-un-dato"


def test_crear_video_valida(cliente, tmp_path, monkeypatch):
    import canal as kit_canal
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path)
    (tmp_path / "prueba").mkdir()
    (tmp_path / "prueba" / "canal.json").write_text("{}")
    malos = [{"tema": "ab"}, {"tema": "x" * 151}, {"tema": "Tema", "tipo": "otro"},
             {"tema": "Tema", "referencia": "https://evil.example/x"}, {"tema": "Tema", "duracion": 3},
             {"tema": "Tema", "tipo": "short", "duracion": 10}, {"tema": "Tema", "tipo": "short", "apoya": "../x"}]
    for m in malos:
        assert cliente.post("/api/canales/prueba/videos", json=m).status_code == 422, m
    assert cliente.post("/api/canales/no-existe/videos", json={"tema": "Tema"}).status_code == 404
    assert not list((tmp_path / "prueba").glob("videos/*"))


def test_cuotas_dicen_que_servicios_estan_conectados(cliente, monkeypatch, tmp_path):
    """Hallazgo 42: sin clave, la cabecera no debe pintar una cuota teórica como disponible."""
    from app import config
    from app.rutas import tareas
    monkeypatch.setattr(tareas, "_consultar_cuotas", lambda: {"cloudflare": {"libres": 10000}})
    monkeypatch.setattr(config, "RAIZ", tmp_path)
    (tmp_path / ".env").write_text("CF_ACCOUNT_ID=abc\nCF_API_TOKEN=\nAI33_API_KEY='k'\n# AZURE_SPEECH_KEY=x\n")
    r = cliente.get("/api/cuotas", params={"refrescar": True}).json()
    assert r["conectados"] == {"cloudflare": False, "azure": False, "ai33": True, "gemini": False}
    assert r["activos"] == r["conectados"]          # sin elegir nada, se usan los que tienen su clave


def test_canal_rapido_sin_campos_pendientes_y_activo(cliente):
    """Bloque E, vídeo rápido sin canal: un canal sin nombre con los valores de fábrica, sin nada por rellenar (ni en
    canal.json, que leen las herramientas), activo y marcado como rápido; las fichas llevan las marcas POR DEFECTO."""
    import json
    import shutil
    activo = config.RAIZ / "canal_activo"
    antes = activo.read_text(encoding="utf-8")
    r = cliente.post("/api/canales/rapido")
    try:
        assert r.status_code == 201, r.text
        c = r.json()
        assert c["slug"].startswith("rapido-") and c["rapido"] is True and c["activo"] is True
        assert c["pendientes"] == 0 and c["fase_creacion"] is None and c["nombre"] == "Canal sin nombre"
        carpeta = config.RAIZ / "canales" / c["slug"]
        cfg = json.loads((carpeta / "canal.json").read_text(encoding="utf-8"))
        texto = json.dumps(cfg, ensure_ascii=False)
        assert "<<RELLENAR" not in texto and "<<POR DEFECTO" not in texto and cfg["rapido"] is True
        assert "{escena}" in cfg["estilo"] and cfg["voz"] in cfg["voces"].values() and "pilares" not in cfg["marca"]
        assert "<<POR DEFECTO" in (carpeta / "equipo" / "guionista.md").read_text(encoding="utf-8")
        assert activo.read_text(encoding="utf-8").strip() == c["slug"]
        otro = cliente.post("/api/canales/rapido").json()          # el siguiente no pisa al primero
        assert otro["slug"] != c["slug"]
        shutil.rmtree(config.RAIZ / "canales" / otro["slug"])
    finally:
        if r.status_code == 201:
            shutil.rmtree(config.RAIZ / "canales" / r.json()["slug"], ignore_errors=True)
        activo.write_text(antes, encoding="utf-8")


def test_convertir_canal_rapido_conserva_los_videos(cliente):
    """«Convertir en canal» (bloque E): el canal rápido pasa a tener nombre y carpeta propios, las fichas vuelven a
    <<RELLENAR>>, /nuevo-canal queda en la fase A (lo sigue el Asistente) y sus vídeos conservan el id (y su gasto)."""
    import json
    import shutil
    from datetime import datetime
    from app.db import Sesion
    from app.modelos import Gasto
    activo = config.RAIZ / "canal_activo"
    antes = activo.read_text(encoding="utf-8")
    rapido = cliente.post("/api/canales/rapido").json()["slug"]
    try:
        vid = cliente.post(f"/api/canales/{rapido}/videos", json={"tema": "El cielo azul"}).json()["id"]
        with Sesion() as s:
            s.add(Gasto(fecha=datetime.now(), servicio="ai33", herramienta="voz_ai33", creditos=10, video_id=vid, canal=rapido))
            s.commit()
        assert cliente.post(f"/api/canales/{rapido}/convertir", json={"nombre": "x"}).status_code == 422
        r = cliente.post(f"/api/canales/{rapido}/convertir", json={"nombre": "  Misterios  del Mar "})
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["slug"] == "misterios-del-mar" and c["nombre"] == "Misterios del Mar" and c["rapido"] is False
        assert c["activo"] is True and c["fase_creacion"] == "A" and c["pendientes"] > 0
        assert activo.read_text(encoding="utf-8").strip() == "misterios-del-mar"
        carpeta = config.RAIZ / "canales" / "misterios-del-mar"
        assert not (config.RAIZ / "canales" / rapido).exists()
        cfg = json.loads((carpeta / "canal.json").read_text(encoding="utf-8"))
        assert "rapido" not in cfg and cfg["slugs_anteriores"] == [rapido] and cfg["nombre"] == "Misterios del Mar"
        assert "{escena}" in cfg["estilo"]                     # los valores de fábrica siguen hasta las fases D-G
        ficha = (carpeta / "equipo" / "guionista.md").read_text(encoding="utf-8")
        assert "<<RELLENAR:" in ficha and "<<POR DEFECTO" not in ficha and '"Misterios del Mar"' in ficha
        assert "Canal sin nombre" not in (carpeta / "CANAL.md").read_text(encoding="utf-8")
        assert json.loads((carpeta / "estado_canal.json").read_text(encoding="utf-8"))["desde_rapido"] == rapido
        videos = cliente.get("/api/videos", params={"canal": "misterios-del-mar"}).json()
        assert [v["id"] for v in videos] == [vid]
        with Sesion() as s:
            assert s.query(Gasto).filter_by(video_id=vid).one().canal == "misterios-del-mar"
        assert cliente.get("/api/asistente").json()["canal"]["creacion"]["slug"] == "misterios-del-mar"
        assert cliente.post("/api/canales/misterios-del-mar/convertir", json={"nombre": "Otro"}).status_code == 409
        assert cliente.post("/api/canales/no-existe/convertir", json={"nombre": "Otro"}).status_code == 404
    finally:
        for slug in (rapido, "misterios-del-mar"):
            shutil.rmtree(config.RAIZ / "canales" / slug, ignore_errors=True)
        activo.write_text(antes, encoding="utf-8")


def test_renombrar_a_mano_y_el_vigilante_no_pierde_los_videos(cliente, tmp_path, monkeypatch):
    """`canales.py renombrar` (fase C de /nuevo-canal): aunque el vigilante sincronice primero el canal viejo (que ya no
    está en disco), los vídeos pasan al nuevo con su id; y no pisa otro canal ni acepta slugs malos."""
    import json
    import pytest
    import canal as kit_canal
    import canales as kit_canales
    from app.db import Sesion
    from app.sincronizar import sincronizar_canal, sincronizar_todo
    monkeypatch.setattr(kit_canal, "CANALES", tmp_path / "canales")
    monkeypatch.setattr(kit_canal, "ACTIVO", tmp_path / "canal_activo")
    for slug in ("provisional", "otro"):
        (tmp_path / "canales" / slug / "videos" / "001-uno").mkdir(parents=True)
        (tmp_path / "canales" / slug / "canal.json").write_text(json.dumps({"nombre": slug.title()}))
    (tmp_path / "canales" / "provisional" / "docs").mkdir()
    (tmp_path / "canales" / "provisional" / "docs" / "ideas.md").write_text('# Banco de ideas: "Provisional"\n')
    (tmp_path / "canal_activo").write_text("provisional\n")
    with Sesion() as s:
        sincronizar_todo(s)
    vid = cliente.get("/api/videos", params={"canal": "provisional"}).json()[0]["id"]
    with pytest.raises(SystemExit, match="ya existe"):
        kit_canales.renombrar("provisional", "otro")
    with pytest.raises(SystemExit, match="minúsculas"):
        kit_canales.renombrar("provisional", "../fuera")
    kit_canales.renombrar("provisional", "definitivo", "El Definitivo")
    with Sesion() as s:
        sincronizar_canal(s, "provisional")               # lo que hace el vigilante al ver desaparecer la carpeta
    assert [v["id"] for v in cliente.get("/api/videos", params={"canal": "definitivo"}).json()] == [vid]
    assert (tmp_path / "canal_activo").read_text().strip() == "definitivo"
    assert (tmp_path / "canales/definitivo/docs/ideas.md").read_text() == '# Banco de ideas: "El Definitivo"\n'

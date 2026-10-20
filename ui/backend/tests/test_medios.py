import time

ARCHIVO = "_archivo/los-viajes-de-tok"
S002 = f"{ARCHIVO}/videos/S002-diez-dias-1582"


def _s002(cliente):
    v = next(v for v in cliente.get("/api/videos", params={"canal": ARCHIVO}).json()
             if v["carpeta"] == "S002-diez-dias-1582")
    return cliente.get(f"/api/videos/{v['id']}").json()


def test_detalle_trae_los_medios(cliente):
    d = _s002(cliente)
    m = d["medios"]
    assert [x["nombre"] for x in m["videos"]] == ["final.mp4"]
    assert m["audio"] and m["audio"][0]["ruta"].endswith("web_sin_final.mp3")   # voz_archivo del guion
    assert any(x["ruta"].endswith("tmp/control.png") for x in m["hojas"])
    assert {x["nombre"] for x in m["subtitulos"]} == {"subtitulos.srt", "subtitulos_en.srt"}
    assert m["exportaciones"] == []    # sin exportacion.zip en este vídeo de prueba
    assert all(e["audio"] is None for e in d["escenas"])      # con voz_archivo no hay voz por escena
    assert d["palabras_por_minuto"] > 0


def test_sirve_archivos_del_canal_con_rangos(cliente):
    r = cliente.get(f"/api/medios/{S002}/final.mp4", headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100


def test_miniatura_en_cache(cliente):
    d = _s002(cliente)
    img = next(i for i in d["imagenes"] if i["existe"])
    r = cliente.get(f"/api/medios/{ARCHIVO}/{img['ruta']}", params={"ancho": 480})
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert len(r.content) < 200_000


def test_picos_de_un_audio(cliente):
    d = _s002(cliente)
    ruta = d["medios"]["audio"][0]["ruta"]        # web_sin_final.mp3, 2s de seno a 220Hz
    r = cliente.get(f"/api/medios/{ARCHIVO}/{ruta}", params={"picos": 50})
    assert r.status_code == 200
    picos = r.json()["picos"]
    assert len(picos) == 50
    assert all(0 <= v <= 1 for v in picos)
    assert max(picos) > 0.1     # hay señal, no es silencio


def test_no_sale_de_canales_ni_sirve_lo_no_permitido(cliente):
    assert cliente.get("/api/medios/../.env").status_code == 404
    assert cliente.get("/api/medios/..%2F..%2F.env").status_code == 404
    assert cliente.get(f"/api/medios/{ARCHIVO}/canal.json").status_code == 404      # extensión no permitida
    assert cliente.get(f"/api/medios/{S002}/no-existe.png").status_code == 404


def test_ident_de_imagen_solo_con_su_formato(cliente):
    """El ident llega a rutas de archivo (img/<ident>.png): nada de rutas ni caracteres raros."""
    vid = cliente.get("/api/videos").json()[0]["id"]
    for malo in ("..%2F..%2Fx", "01-1;rm", "abc", "01-1.png"):
        assert cliente.post(f"/api/videos/{vid}/imagenes/{malo}/restaurar").status_code in (404, 405, 422)
    r = cliente.post(f"/api/videos/{vid}/imagenes/..x/restaurar")      # lo para la validación, antes de tocar disco
    assert r.status_code == 422 and r.json()["detail"][0]["type"] == "string_pattern_mismatch"


def test_picos_en_cache(tmp_path, monkeypatch):
    """La segunda petición de los mismos picos no vuelve a llamar a ffmpeg (lee el .json cacheado)."""
    import subprocess

    from app import medios
    monkeypatch.setattr(medios, "CACHE_PICOS", tmp_path)
    audio = tmp_path / "audio.wav"
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=1",
                        str(audio)], check=True)
    assert r.returncode == 0
    primero = medios.picos(audio, 20)
    assert len(primero) == 20
    llamadas = []
    original = subprocess.run
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: (llamadas.append(1), original(*a, **k))[1])
    segundo = medios.picos(audio, 20)
    assert segundo == primero and not llamadas


def test_la_cache_de_miniaturas_no_crece_sin_limite(tmp_path, monkeypatch):
    import os
    import time
    from app import medios
    monkeypatch.setattr(medios, "CACHE", tmp_path)
    ahora = time.time()
    for nombre, dias, tamano in (("vieja", 100, 10), ("media", 10, 600), ("nueva", 1, 600)):
        f = tmp_path / f"{nombre}.jpg"
        f.write_bytes(b"x" * tamano)
        os.utime(f, (ahora - dias * 86400, ahora - dias * 86400))
    assert medios.limpiar_cache(max_dias=90, max_bytes=1000) == 2      # la vieja por edad; la media para bajar de 1000
    assert [f.name for f in tmp_path.iterdir()] == ["nueva.jpg"]
    assert medios.limpiar_cache() == 0


def test_dos_peticiones_a_la_vez_de_la_misma_miniatura(tmp_path, monkeypatch):
    """La rejilla de imágenes y «Detalles técnicos» piden la misma miniatura a la vez: antes las dos escribían el mismo
    temporal y la segunda fallaba (500 en el navegador)."""
    import threading
    from PIL import Image
    from app import medios
    monkeypatch.setattr(medios, "CACHE", tmp_path / "cache")
    original = tmp_path / "img.png"
    Image.new("RGB", (1600, 900), "teal").save(original)
    salida = Image.Image.save
    monkeypatch.setattr(Image.Image, "save", lambda self, *a, **k: (time.sleep(0.05), salida(self, *a, **k))[1])
    salida_ok, errores, barrera = [], [], threading.Barrier(6)

    def pedir():
        barrera.wait()
        try:
            salida_ok.append(medios.miniatura(original, 480))
        except Exception as e:          # noqa: BLE001 (el test cuenta cualquier fallo)
            errores.append(e)

    hilos = [threading.Thread(target=pedir) for _ in range(6)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    assert not errores and len(set(salida_ok)) == 1 and salida_ok[0].exists()
    assert [f.name for f in (tmp_path / "cache").iterdir()] == [salida_ok[0].name]     # sin temporales sueltos

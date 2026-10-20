"""Bloque B: sin servicios se produce subiendo lo propio. Imágenes para los huecos del guion y música para cada ambiente:
se comprueba que el archivo es lo que dice (no la extensión), nada se borra para siempre y quitarlo vuelve a lo de antes."""
import io
import json
import shutil
import subprocess

import pytest
from PIL import Image

from app import config

CANAL = config.RAIZ / "canales" / "asombroso-y-real"


@pytest.fixture
def video(cliente):
    v = next(x for x in cliente.get("/api/videos", params={"canal": "asombroso-y-real"}).json() if x["carpeta"].startswith("001-"))
    carpeta = CANAL / "videos" / v["carpeta"]
    guion = (carpeta / "guion.json").read_bytes()
    musica = CANAL / "recursos" / "musica"
    sfx = CANAL / "recursos" / "sfx"
    antes = {p.name for p in musica.glob("*")} if musica.exists() else set()
    antes_sfx = {p.name for p in sfx.glob("*")} if sfx.exists() else set()
    yield v, carpeta
    (carpeta / "guion.json").write_bytes(guion)
    shutil.rmtree(carpeta / "img" / "propias", ignore_errors=True)
    shutil.rmtree(carpeta / "video" / "propias", ignore_errors=True)
    if musica.exists():
        for p in musica.glob("*"):
            if p.name not in antes:
                shutil.rmtree(p) if p.is_dir() else p.unlink()
    if sfx.exists():
        for p in sfx.glob("*"):
            if p.name not in antes_sfx:
                shutil.rmtree(p) if p.is_dir() else p.unlink()


def _png(color="teal", tam=(1600, 900)) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", tam, color).save(b, "PNG")
    return b.getvalue()


def _spec(carpeta, ident):
    n, k = (int(x) for x in ident.split("-"))
    e = json.loads((carpeta / "guion.json").read_text())["escenas"][n - 1]
    return e["imagenes"][k - 1] if e.get("imagenes") else e


def test_subir_y_quitar_una_imagen_propia(cliente, video):
    v, carpeta = video
    url = f"/api/videos/{v['id']}/imagenes/02-1/propia"
    prompt = _spec(carpeta, "02-1").get("prompt")
    r = cliente.put(url, params={"nombre": "mi foto.JPG"}, content=_png())
    assert r.status_code == 200, r.text
    spec = _spec(carpeta, "02-1")
    assert spec["imagen"] == f"videos/{v['carpeta']}/img/propias/02-1.png" and spec.get("prompt") == prompt
    assert (CANAL / spec["imagen"]).exists()
    img = next(i for i in cliente.get(f"/api/videos/{v['id']}").json()["imagenes"] if i["ident"] == "02-1")
    assert img["origen"] == "imagen" and img["existe"]
    cliente.put(url, params={"nombre": "otra.png"}, content=_png("red"))           # otra encima: la primera se aparta
    assert len(list((carpeta / "img" / "propias" / "anteriores").glob("02-1-*.png"))) == 1
    assert cliente.delete(url).status_code == 204
    assert "imagen" not in _spec(carpeta, "02-1")                                   # vuelve a generarse desde su descripción
    assert not (carpeta / "img" / "propias" / "02-1.png").exists()
    assert len(list((carpeta / "img" / "propias" / "anteriores").glob("02-1-*.png"))) == 2   # nada se borra


@pytest.mark.parametrize("nombre, contenido, motivo", [
    ("foto.png", b"esto no es una imagen", "No es una imagen"),
    ("foto.gif", b"GIF89a", "Sube un archivo"),
    ("foto.png", b"", "No ha llegado"),
])
def test_una_imagen_mala_no_cambia_nada(cliente, video, nombre, contenido, motivo):
    v, carpeta = video
    antes = (carpeta / "guion.json").read_bytes()
    r = cliente.put(f"/api/videos/{v['id']}/imagenes/02-1/propia", params={"nombre": nombre}, content=contenido)
    assert r.status_code == 422 and motivo in r.json()["detail"]
    assert (carpeta / "guion.json").read_bytes() == antes
    assert not list((carpeta / "img" / "propias").glob("*")) if (carpeta / "img" / "propias").exists() else True


def test_huecos_que_no_existen_o_verticales(cliente, video):
    v, _ = video
    assert cliente.put(f"/api/videos/{v['id']}/imagenes/99-1/propia", params={"nombre": "a.png"}, content=_png()).status_code == 422
    assert cliente.put(f"/api/videos/{v['id']}/imagenes/v01-1/propia", params={"nombre": "a.png"}, content=_png()).status_code == 422
    assert cliente.delete(f"/api/videos/{v['id']}/imagenes/02-1/propia").status_code == 422         # no tenía propia


def test_subir_y_quitar_musica_propia(cliente, video, tmp_path):
    v, _ = video
    ambiente = cliente.get(f"/api/videos/{v['id']}/musica").json()["ambientes"][0]["ambiente"]
    mp3 = tmp_path / "m.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", str(mp3)], check=True)
    url = f"/api/videos/{v['id']}/musica/{ambiente}/propia"
    assert cliente.put(url, params={"nombre": "mi tema.mp3"}, content=mp3.read_bytes()).status_code == 200
    assert (CANAL / "recursos" / "musica" / f"{ambiente}.wav").exists()
    a = next(x for x in cliente.get(f"/api/videos/{v['id']}/musica").json()["ambientes"] if x["ambiente"] == ambiente)
    assert a["origen_propia"] == "canal"
    assert cliente.put(url, params={"nombre": "x.mp3"}, content=b"no es audio").status_code == 422
    assert cliente.put(f"/api/videos/{v['id']}/musica/..%2Fx/propia", params={"nombre": "x.mp3"}, content=b"x").status_code in (404, 405, 422)
    assert cliente.delete(url).status_code == 204
    assert not (CANAL / "recursos" / "musica" / f"{ambiente}.wav").exists()
    assert list((CANAL / "recursos" / "musica" / "anteriores").glob(f"{ambiente}-*.wav"))         # apartada, no borrada


def _clip(tmp_path, nombre="c.mp4", duracion=2, con_audio=True) -> bytes:
    salida = tmp_path / nombre
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=blue:s=320x240:d={duracion}"]
    if con_audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duracion}"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p"] + (["-c:a", "aac"] if con_audio else ["-an"]) + [str(salida)]
    subprocess.run(cmd, check=True, capture_output=True)
    return salida.read_bytes()


def test_subir_y_quitar_un_clip_propio(cliente, video, tmp_path):
    v, carpeta = video
    url = f"/api/videos/{v['id']}/video/02-1/propia"
    prompt = _spec(carpeta, "02-1").get("prompt")
    r = cliente.put(url, params={"nombre": "mi clip.mp4"}, content=_clip(tmp_path))
    assert r.status_code == 200, r.text
    assert r.json()["con_audio"] and r.json()["duracion"] > 0
    assert r.json()["audio_mezclado"] is False and r.json()["cortes_de_escena"] == 0
    spec = _spec(carpeta, "02-1")
    assert spec["video"] == f"videos/{v['carpeta']}/video/propias/02-1.mp4" and spec.get("prompt") == prompt
    assert "audio_clip" not in spec                                                   # sin pedirlo, no se mezcla
    assert (CANAL / spec["video"]).exists()
    img = next(i for i in cliente.get(f"/api/videos/{v['id']}").json()["imagenes"] if i["ident"] == "02-1")
    assert img["origen"] == "video" and img["existe"]                                 # el fotograma ya está, sin montar
    assert cliente.delete(url).status_code == 204
    assert "video" not in _spec(carpeta, "02-1")                                      # vuelve a generarse la imagen
    assert not (carpeta / "video" / "propias" / "02-1.mp4").exists()
    assert list((carpeta / "video" / "propias" / "anteriores").glob("02-1-*.mp4"))     # apartado, no borrado
    assert not (carpeta / "img" / "02-1.png").exists()                                 # el fotograma ya no vale


def test_subir_un_clip_mezclando_su_audio(cliente, video, tmp_path):
    v, carpeta = video
    url = f"/api/videos/{v['id']}/video/02-1/propia"
    r = cliente.put(url, params={"nombre": "con-sonido.mp4", "mezclar_audio": "true"}, content=_clip(tmp_path))
    assert r.status_code == 200, r.text
    assert r.json()["audio_mezclado"] is True
    assert _spec(carpeta, "02-1")["audio_clip"] is True
    cliente.delete(url)


@pytest.mark.parametrize("nombre, contenido, motivo", [
    ("clip.mp4", b"esto no es un video", "No es un v"),
    ("clip.gif", b"GIF89a", "Sube un archivo"),
    ("clip.mp4", b"", "No ha llegado"),
])
def test_un_clip_malo_no_cambia_nada(cliente, video, nombre, contenido, motivo):
    v, carpeta = video
    antes = (carpeta / "guion.json").read_bytes()
    r = cliente.put(f"/api/videos/{v['id']}/video/02-1/propia", params={"nombre": nombre}, content=contenido)
    assert r.status_code == 422 and motivo in r.json()["detail"]
    assert (carpeta / "guion.json").read_bytes() == antes


def test_clip_mas_corto_que_su_tramo_no_impide_subirlo(cliente, video, tmp_path):
    """montar.py avisa y congela el último fotograma; subirlo no falla."""
    v, _ = video
    r = cliente.put(f"/api/videos/{v['id']}/video/02-1/propia", params={"nombre": "corto.mp4"},
                     content=_clip(tmp_path, duracion=1, con_audio=False))
    assert r.status_code == 200, r.text
    assert not r.json()["con_audio"]


def _wav(tmp_path, nombre="s.wav", duracion=1) -> bytes:
    salida = tmp_path / nombre
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency=880:duration={duracion}", str(salida)],
                   check=True, capture_output=True)
    return salida.read_bytes()


def test_estado_de_los_efectos_del_guion(cliente, video, tmp_path):
    v, carpeta = video
    guion = json.loads((carpeta / "guion.json").read_text())
    guion["escenas"][0]["texto"] = "Toc, toc.{toc_toc} ¿Quién es?" + guion["escenas"][0]["texto"]
    guion["escenas"][1]["texto"] = "Otra vez.{toc_toc}" + guion["escenas"][1]["texto"]
    (carpeta / "guion.json").write_text(json.dumps(guion))
    r = cliente.get(f"/api/videos/{v['id']}/efectos")
    assert r.status_code == 200, r.text
    efectos = r.json()["efectos"]
    assert efectos == [{"nombre": "toc_toc", "escenas": [1, 2], "origen_propio": None}]
    # ya incluido en el kit (recursos/sfx/clic.wav): aparece como "incluido" sin que el canal tenga uno propio
    guion["escenas"][0]["texto"] += "{clic}"
    (carpeta / "guion.json").write_text(json.dumps(guion))
    efectos = cliente.get(f"/api/videos/{v['id']}/efectos").json()["efectos"]
    assert next(e for e in efectos if e["nombre"] == "clic")["origen_propio"] == "incluido"
    cliente.put(f"/api/videos/{v['id']}/efectos/toc_toc", params={"archivo": "toc.wav"}, content=_wav(tmp_path))
    efectos = cliente.get(f"/api/videos/{v['id']}/efectos").json()["efectos"]
    assert next(e for e in efectos if e["nombre"] == "toc_toc")["origen_propio"] == "canal"
    cliente.delete(f"/api/videos/{v['id']}/efectos/toc_toc")


def test_subir_y_quitar_un_efecto_propio(cliente, video, tmp_path):
    v, _ = video
    url = f"/api/videos/{v['id']}/efectos/toc_toc"
    assert cliente.get(url).status_code == 404                                        # todavía no hay uno propio
    r = cliente.put(url, params={"archivo": "toc.wav"}, content=_wav(tmp_path))
    assert r.status_code == 200, r.text
    assert r.json() == {"nombre": "toc_toc", "archivo": "toc_toc.wav", "duracion": pytest.approx(1.0, abs=0.1)}
    assert (CANAL / "recursos" / "sfx" / "toc_toc.wav").exists()
    assert cliente.get(url).status_code == 200
    assert cliente.delete(url).status_code == 204
    assert not (CANAL / "recursos" / "sfx" / "toc_toc.wav").exists()
    assert list((CANAL / "recursos" / "sfx" / "anteriores").glob("toc_toc-*.wav"))     # apartado, no borrado


@pytest.mark.parametrize("nombre, motivo", [
    ("pausa", "no válido"),
    ("img", "no válido"),
    ("Toc-Toc", "no válido"),
    ("mayus", None),
])
def test_nombre_de_efecto(cliente, video, tmp_path, nombre, motivo):
    v, _ = video
    r = cliente.put(f"/api/videos/{v['id']}/efectos/{nombre}", params={"archivo": "x.wav"}, content=_wav(tmp_path))
    if motivo:
        assert r.status_code == 422 and motivo in r.json()["detail"]
    else:
        assert r.status_code == 200, r.text
        cliente.delete(f"/api/videos/{v['id']}/efectos/{nombre}")


def test_un_efecto_malo_no_se_guarda(cliente, video):
    v, _ = video
    r = cliente.put(f"/api/videos/{v['id']}/efectos/malo", params={"archivo": "x.wav"}, content=b"esto no es audio")
    assert r.status_code == 422 and "No es un audio" in r.json()["detail"]
    assert not (CANAL / "recursos" / "sfx" / "malo.wav").exists()

"""Invariantes de montar.py que, si se rompen, estropean un vídeo SIN dar error: audio y vídeo desfasados, huecos
entre planos, recortes fuera de la imagen, bloques de voz demasiado largos o capítulos mal escritos para YouTube.
Funciones puras: sin FFmpeg, sin voz y sin red."""

import itertools

import pytest

import montar


def test_duraciones_en_fotogramas_enteros_y_con_la_pausa():
    durs = montar.duraciones([{"duracion": 3.21}, {"duracion": 1.0, "pausa_tras": 0}, {"duracion": 0.017}])
    for d in durs:
        assert abs(d * montar.FPS - round(d * montar.FPS)) < 1e-9       # si no, el audio se desfasa del vídeo
    assert durs[0] >= 3.21 + montar.PAUSA_ESCENA and durs[1] == 1.0


def _voz(cortes, duracion):
    return {"duracion": duracion, "marcas": [{"nombre": montar.MARCA_IMAGEN, "t": t} for t in cortes]}


def test_planos_cubren_el_video_sin_huecos_ni_solapes(tmp_path):
    guion = {"escenas": [
        {"texto": "uno {img} dos {img} tres", "imagenes": [{"prompt": "a"}, {"prompt": "b", "movimiento": "fijo"},
                                                           {"prompt": "c", "rotulo": "1848"}]},
        {"texto": "cuatro", "prompt": "d"},
    ]}
    datos = [_voz([1.2, 2.5], 4.0), _voz([], 2.0)]
    durs = montar.duraciones(datos)
    rutas = {i: tmp_path / f"{i}.png" for i in ("01-1", "01-2", "01-3", "02-1")}
    lista = montar.planos(guion, [1, 2], datos, durs, rutas)
    assert [p["id"] for p in lista] == ["01-1", "01-2", "01-3", "02-1"]
    assert lista[0]["inicio"] == 0
    for a, b in itertools.pairwise(lista):
        assert a["fin"] == b["inicio"] and a["fin"] > a["inicio"]
    assert lista[-1]["fin"] == pytest.approx(sum(durs), abs=1e-3)
    assert lista[1]["movimiento"] == "fijo" and lista[2]["rotulo"] == "1848"
    assert lista[0]["movimiento"] in montar.MOVIMIENTOS            # sin movimiento: el de la rotación


@pytest.mark.parametrize("movimiento", montar.MOVIMIENTOS_VALIDOS)
@pytest.mark.parametrize("ancho,alto", [(1344, 768), (768, 1344), (1024, 1024)])
def test_el_recorte_nunca_sale_de_la_imagen_y_conserva_el_aspecto(movimiento, ancho, alto):
    aspecto = 16 / 9
    for i in range(11):
        x0, y0, x1, y1 = montar.caja(movimiento, i / 10, ancho, alto, aspecto)
        assert -1e-6 <= x0 < x1 <= ancho + 1e-6 and -1e-6 <= y0 < y1 <= alto + 1e-6
        assert (x1 - x0) / (y1 - y0) == pytest.approx(aspecto)


def test_el_movimiento_arranca_y_termina_suave():
    """La curva coseno: el plano empieza y acaba quieto (sin tirón) y llega al final del recorrido."""
    a = montar.caja("derecha", 0, 1344, 768, 16 / 9)
    casi = montar.caja("derecha", 0.01, 1344, 768, 16 / 9)
    fin = montar.caja("derecha", 1, 1344, 768, 16 / 9)
    assert a[0] == pytest.approx(0) and casi[0] < 0.5 and fin[2] == pytest.approx(1344)


def test_tramos_de_musica_agrupan_escenas_seguidas_y_saltan_el_silencio(tmp_path):
    a, b = tmp_path / "a.mp3", tmp_path / "b.mp3"
    tramos = montar.tramos_musica([a, a, None, b, b, a], [1, 2, 3, 4, 5, 6])
    assert tramos == [(a, 0, 3), (b, 6, 15), (a, 15, 21)]


def test_bloques_de_voz_respetan_el_maximo_y_los_cambios_de_ajustes(monkeypatch):
    monkeypatch.setattr(montar.canal, "get", lambda clave, defecto=None: 100 if clave == "caracteres_bloque_voz" else defecto)
    escenas = [{"texto": "x" * 40} for _ in range(5)]
    escenas[3]["estilo_voz"] = "susurro"
    bloques = montar.bloques_voz({"escenas": escenas})
    assert bloques == [[1, 2], [3], [4], [5]]          # 40+40 caben, 3 no; la 4 cambia de estilo y la 5 vuelve
    assert sorted(itertools.chain(*bloques)) == [1, 2, 3, 4, 5]
    assert montar.bloques_voz({"escenas": escenas, "voz_archivo": "voz.mp3"}) == [[1, 2, 3, 4, 5]]


def test_validar_exige_una_imagen_mas_que_marcas():
    with pytest.raises(SystemExit, match="2 imágenes pero 2 marcas"):
        montar.validar({"escenas": [{"texto": "a {img} b {img} c", "imagenes": [{"prompt": "x"}, {"prompt": "y"}]}]})
    with pytest.raises(SystemExit, match="movimiento 'girar' no válido"):
        montar.validar({"escenas": [{"texto": "a", "prompt": "x", "movimiento": "girar"}]})
    montar.validar({"escenas": [{"texto": "a {img} b", "imagenes": [{"prompt": "x"}, {"reutilizar": "01-1"}]}]})


@pytest.mark.parametrize("segundos,texto", [(0, "0:00"), (65.9, "1:05"), (600, "10:00"), (3600, "1:00:00"),
                                            (3725, "1:02:05")])
def test_tiempos_de_capitulo_como_los_lee_youtube(segundos, texto):
    assert montar.tiempo_capitulo(segundos) == texto


def test_firma_ai33_cambia_con_lo_que_cambia_la_imagen(tmp_path):
    guion = {"estilo": "{escena}", "personajes": {}}
    cfg = {"modelo": "m", "resolucion": "1K", "referencias_estilo": []}
    base = montar.firma_ai33(guion, {"prompt": "un faro"}, "horizontal", cfg)
    assert base == montar.firma_ai33(guion, {"prompt": "un faro"}, "horizontal", cfg)
    assert base != montar.firma_ai33(guion, {"prompt": "dos faros"}, "horizontal", cfg)
    assert base != montar.firma_ai33(guion, {"prompt": "un faro"}, "vertical", cfg)
    assert base != montar.firma_ai33(guion, {"prompt": "un faro"}, "horizontal", {**cfg, "modelo": "otro"})
    assert len(base) == 12 and int(base, 16) >= 0          # 12 cifras hexadecimales


def test_una_voz_sin_su_wav_no_se_da_por_hecha(tmp_path):
    """Con la firma al día pero sin el .wav, montar.py la daba por «reutilizada» y ffmpeg fallaba después."""
    guion = {"voz": "azure:es-ES-AlvaroNeural", "escenas": [{"texto": "Hola, esto es una prueba."}]}
    (tmp_path / "voz").mkdir()
    b = montar.voces_previstas(guion, tmp_path, set())[0]
    assert b["hecho"] is False
    (tmp_path / "voz" / "01.firma").write_text(b["huella"])
    (tmp_path / "voz" / "01.json").write_text("{}")
    (tmp_path / "voz" / "01.wav").write_bytes(b"RIFF")
    assert montar.voces_previstas(guion, tmp_path, set())[0]["hecho"] is True
    (tmp_path / "voz" / "01.wav").unlink()
    assert montar.voces_previstas(guion, tmp_path, set())[0]["hecho"] is False


def test_montaje_log_apunta_fases_y_el_error_de_ffmpeg(tmp_path, monkeypatch):
    """«¿Por qué falló este montaje?»: en <vídeo>/montaje.log quedan la ejecución, sus fases con lo que tardaron y cada
    orden de ffmpeg; la que falla, con el final de su error."""
    monkeypatch.setattr(montar, "LOG_FFMPEG", None)
    montar.abrir_log(tmp_path, ["canales/x/videos/v/guion.json"])
    montar.fase(0, "Voces")
    montar.registrar_orden(["ffmpeg", "-i", "voz 01.wav"], 0, 0.4, "ruido que no se guarda")
    montar.fase(9, "Audio")
    montar.registrar_orden(["ffmpeg", "-i", "falta.wav"], 1, 0.1, "falta.wav: No such file or directory")
    montar.fase(100, "Hecho")
    log = (tmp_path / "montaje.log").read_text(encoding="utf-8")
    assert "montar.py canales/x/videos/v/guion.json" in log
    assert "-- Voces (" in log and "-- Voces: " in log and "-- Audio: " in log
    assert "'voz 01.wav'" in log and "ruido" not in log           # orden copiable; el error, solo si falla
    assert "código 1" in log and "| falta.wav: No such file or directory" in log


def test_montaje_log_no_crece_sin_limite(tmp_path, monkeypatch):
    monkeypatch.setattr(montar, "MAX_LOG_FFMPEG", 1000)
    monkeypatch.setattr(montar, "LOG_FFMPEG", None)
    (tmp_path / "montaje.log").write_text("vieja\n" * 400, encoding="utf-8")
    montar.abrir_log(tmp_path, [])
    texto = (tmp_path / "montaje.log").read_text(encoding="utf-8")
    assert len(texto) < 700 and texto.splitlines()[0] == "vieja" and "=====" in texto


def test_sin_log_abierto_no_se_escribe_nada(tmp_path, monkeypatch):
    monkeypatch.setattr(montar, "LOG_FFMPEG", None)
    montar.registrar_orden(["ffmpeg"], 1, 0.1, "error")      # p. ej. el previsto de la voz: sin log y sin fallar
    assert not list(tmp_path.iterdir())

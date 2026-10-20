import asyncio
import json
import shutil

from app import config
from app.eventos import difusor
from app.sincronizar import canal_de_ruta
from app.vigilante import Filtro, vigilar
from watchfiles import Change

ARCHIVO = "_archivo/los-viajes-de-tok"


def test_canal_de_ruta():
    base = config.RAIZ / "canales"
    assert canal_de_ruta(base / "asombroso-y-real" / "videos" / "x" / "guion.json") == "asombroso-y-real"
    assert canal_de_ruta(base / "_archivo" / "los-viajes-de-tok" / "canal.json") == ARCHIVO
    assert canal_de_ruta(config.RAIZ / "docs" / "progreso.md") is None


def test_filtro_ignora_temporales(monkeypatch):
    import canal as kit_canal
    f = Filtro()
    v = kit_canal.CANALES / "c" / "videos" / "001"
    assert f(Change.modified, str(v / "estado.json"))
    assert not f(Change.modified, str(v / "tmp" / "contactos.png"))
    assert not f(Change.modified, str(v / "img" / "01-1.firma"))
    assert not f(Change.added, str(v / "voz" / "01.wav"))
    # Un espacio que vive bajo una carpeta «tmp» (o «voz») no deja la UI sorda: solo cuenta lo que hay dentro de canales/.
    monkeypatch.setattr(kit_canal, "CANALES", kit_canal.CANALES.parent / "tmp" / "voz" / "canales")
    assert f(Change.modified, str(kit_canal.CANALES / "c" / "videos" / "001" / "guion.json"))


def test_un_cambio_en_disco_reindexa_y_avisa(cliente):
    carpeta = config.RAIZ / "canales" / ARCHIVO / "videos" / "998-vigilante"

    async def prueba():
        cola = difusor.suscribir()
        parada = asyncio.Event()
        tarea = asyncio.create_task(vigilar(parada))
        await asyncio.sleep(0.5)
        carpeta.mkdir()
        (carpeta / "estado.json").write_text(json.dumps({"fase": "B", "completadas": ["A"]}))
        try:
            mensaje = await asyncio.wait_for(cola.get(), timeout=10)
        finally:
            parada.set()
            await asyncio.wait_for(tarea, timeout=5)
            difusor.baja(cola)
        return mensaje

    try:
        mensaje = asyncio.run(prueba())
        assert mensaje == {"tipo": "cambio", "canal": ARCHIVO}
        carpetas = {v["carpeta"]: v for v in cliente.get("/api/videos", params={"canal": ARCHIVO}).json()}
        assert carpetas["998-vigilante"]["fase"] == "B"
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)

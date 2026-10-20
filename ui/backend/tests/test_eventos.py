import asyncio
import threading
import time

from app.eventos import Difusor


def test_un_aviso_publicado_desde_un_hilo_llega_al_momento():
    """Las rutas `def` publican desde el threadpool: antes el cliente no se enteraba hasta el siguiente latido."""
    async def probar():
        d = Difusor()
        cola = d.suscribir()
        inicio = time.monotonic()
        threading.Timer(0.05, lambda: d.publicar("cambio", canal="x")).start()
        mensaje = await asyncio.wait_for(cola.get(), timeout=5)
        return mensaje, time.monotonic() - inicio

    mensaje, segundos = asyncio.run(probar())
    assert mensaje == {"tipo": "cambio", "canal": "x"}
    assert segundos < 1


def test_un_cliente_que_no_lee_se_cierra_en_vez_de_quedarse_sordo():
    async def probar():
        d = Difusor()
        lento, atento = d.suscribir(), d.suscribir()
        flujo = d.flujo(lento, latido=5)
        assert await anext(flujo) == "retry: 3000\n\n"
        for i in range(101):                    # la cola admite 100
            d.publicar("tarea", id=i)
            if not atento.empty():
                atento.get_nowait()
        restos = [trozo async for trozo in flujo]       # el flujo termina (el navegador reconectará)
        d.publicar("cambio", canal=None)
        return restos, atento.get_nowait(), lento in d._colas

    restos, ultimo, sigue = asyncio.run(probar())
    assert restos == []
    assert ultimo == {"tipo": "cambio", "canal": None}
    assert not sigue

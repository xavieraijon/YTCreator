"""Avisos en tiempo real al frontend (Server-Sent Events): cambios en los archivos del kit, progreso de las tareas,
chat con Claude y cuotas.

El SSE solo AVISA: el estado de verdad está en la BD y en los archivos (REST). Por eso no se numeran ni se repiten
eventos: al reconectar, el frontend vuelve a pedir lo que enseña.

- `publicar` se puede llamar desde el bucle de eventos o desde un hilo (las rutas `def` de FastAPI corren en el
  threadpool): desde un hilo se pasa al bucle con `call_soon_threadsafe` (asyncio.Queue no es segura entre hilos y el
  cliente no se despertaba hasta el siguiente latido).
- Un cliente que no lee (cola llena) se cierra en vez de dejarlo conectado y sordo: el navegador reconecta solo y
  relee el estado."""

import asyncio
import json
from contextlib import suppress

_CERRAR = None          # marca en la cola: el flujo de ese cliente termina


class Difusor:
    def __init__(self):
        self._colas: set[asyncio.Queue] = set()
        self._bucle: asyncio.AbstractEventLoop | None = None

    def iniciar(self):
        """Al arrancar el backend: el bucle al que se pasan los avisos que llegan desde hilos."""
        self._bucle = asyncio.get_running_loop()

    def suscribir(self) -> asyncio.Queue:
        if self._bucle is None:
            with suppress(RuntimeError):
                self._bucle = asyncio.get_running_loop()
        cola = asyncio.Queue(maxsize=100)
        self._colas.add(cola)
        return cola

    def baja(self, cola):
        self._colas.discard(cola)

    def publicar(self, tipo, **datos):
        mensaje = {"tipo": tipo, **datos}
        bucle = self._bucle
        if bucle is None or bucle.is_closed():          # sin bucle conocido (pruebas sin servidor): directo
            self._repartir(mensaje)
            return
        try:
            en_el_bucle = asyncio.get_running_loop() is bucle
        except RuntimeError:                             # desde un hilo sin bucle (threadpool)
            en_el_bucle = False
        if en_el_bucle:
            self._repartir(mensaje)
        else:
            bucle.call_soon_threadsafe(self._repartir, mensaje)

    def _repartir(self, mensaje):
        for cola in list(self._colas):
            try:
                cola.put_nowait(mensaje)
            except asyncio.QueueFull:     # cliente que no lee: se cierra su flujo y el navegador reconectará
                self._colas.discard(cola)
                while not cola.empty():
                    cola.get_nowait()
                cola.put_nowait(_CERRAR)

    async def flujo(self, cola, latido=15):
        """Generador SSE para un cliente; manda un latido para que el proxy no corte la conexión."""
        try:
            yield "retry: 3000\n\n"
            while True:
                try:
                    mensaje = await asyncio.wait_for(cola.get(), timeout=latido)
                except asyncio.TimeoutError:
                    yield ": latido\n\n"
                    continue
                if mensaje is _CERRAR:
                    return
                yield f"data: {json.dumps(mensaje, ensure_ascii=False)}\n\n"
        finally:
            self.baja(cola)


difusor = Difusor()

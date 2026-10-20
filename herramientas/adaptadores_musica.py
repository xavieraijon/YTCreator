"""Contrato de la capacidad «música» y sus adaptadores (plan 8b-C).

Quien necesita música de fondo arma una `SolicitudMusica` (ambiente, carpeta del vídeo, prompt) y se la da a un proveedor del
REGISTRO. Cada uno cumple `ProveedorMusica`: dice si está disponible (elegido y conectado, `servicios.py`), si es de pago, y
`componer` deja las versiones en `<vídeo>/musica/` y devuelve una `RespuestaMusica`. Elegir cuál se usa (`musica_ai33.elegir`) es
un paso aparte: la música de pago es un encargo con varias versiones, no una llamada que devuelve un archivo.

Adaptadores hoy: `sintetizador` (gratis, incluido: gen_musica.py, una versión) y `ai33` (DE PAGO, Suno por ai33.pro, dos
versiones; musica_ai33.py sigue siendo la herramienta de línea de órdenes que usa la UI). Fallos: SystemExit «ERROR: …».
Para añadir otro: una clase con `id`, `de_pago`, `disponible()` y `componer()`, y una línea en REGISTRO.
"""

import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

sys.path.insert(0, str(Path(__file__).resolve().parent))
import servicios  # noqa: E402
import simulacion  # noqa: E402


@dataclass
class SolicitudMusica:
    ambiente: str
    carpeta: Path                       # carpeta del vídeo; las versiones van a <carpeta>/musica/
    guion: dict = field(default_factory=dict)
    prompt: str | None = None           # solo lo entienden los proveedores con IA
    semilla: int = 1                    # solo el sintetizador

    def __post_init__(self):
        self.carpeta = Path(self.carpeta)


@dataclass
class RespuestaMusica:
    versiones: list = field(default_factory=list)   # [{"n", "archivo" (relativo a la carpeta), "duracion"}]
    creditos: int = 0                               # lo cobrado (0 = gratis o simulado)


class ProveedorMusica(Protocol):
    id: str
    de_pago: bool

    def disponible(self) -> bool: ...

    def componer(self, sol: SolicitudMusica) -> RespuestaMusica: ...


class Sintetizador:
    """Ambientes sencillos que hace el propio programa (gen_musica.py): sin IA, sin red, sin coste."""
    id = "sintetizador"
    de_pago = False

    def disponible(self):
        return servicios.disponible("sintetizador")

    def componer(self, sol):
        import gen_musica
        import musica_ai33
        if sol.ambiente not in gen_musica.AMBIENTES:
            sys.exit(f"ERROR: el sintetizador no tiene el ambiente «{sol.ambiente}» ({', '.join(gen_musica.AMBIENTES)})")
        destino = sol.carpeta / "musica"
        destino.mkdir(parents=True, exist_ok=True)
        final = destino / f"{sol.ambiente}_v1.mp3"
        with tempfile.TemporaryDirectory() as tmp:
            wav = gen_musica.guardar(gen_musica.componer(sol.ambiente, sol.semilla), Path(tmp) / "v1.wav")
            musica_ai33.igualar(wav, final)
        return RespuestaMusica([{"n": 1, "archivo": str(final.relative_to(sol.carpeta)),
                                 "duracion": musica_ai33.duracion(final)}], 0)


class Ai33:
    """Suno por ai33.pro: un encargo = 2 versiones (≈ 3.600 créditos). Con el modo sin gasto no envía nada."""
    id = "ai33"
    de_pago = True

    def disponible(self):
        return servicios.disponible("ai33")

    def componer(self, sol):
        import musica_ai33
        if not simulacion.activa() and not self.disponible():
            sys.exit("ERROR: no usas ai33.pro (Ajustes → Servicios), o falta AI33_API_KEY.")
        cobrado = musica_ai33.encargar(sol.guion, sol.carpeta, sol.ambiente, sol.prompt)   # exige el permiso de pago
        entrada = musica_ai33.leer_estado(sol.carpeta).get(sol.ambiente) or {}
        return RespuestaMusica(list(entrada.get("versiones", [])), cobrado)


REGISTRO: dict[str, ProveedorMusica] = {p.id: p for p in (Sintetizador(), Ai33())}

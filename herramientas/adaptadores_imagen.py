"""Contrato de la capacidad «imagen» y sus adaptadores (plan 8b-C).

Una herramienta que necesita una imagen no habla con un servicio concreto: arma una `SolicitudImagen` (prompt, referencias,
medidas, semilla) y se la da a un proveedor del REGISTRO. Cada proveedor cumple `ProveedorImagen`: dice si está disponible
(elegido por el usuario y conectado, `servicios.py`) y `generar` escribe el archivo. Los fallos son tipados, para que quien
orquesta (gen_imagen.py) decida el siguiente proveedor sin leer textos:

    CuotaAgotada    límite gratuito o demasiadas peticiones
    ImagenFiltrada  el filtro de contenido del servicio rechaza esta imagen
    (cualquier otro fallo: SystemExit con «ERROR: …», como el resto de herramientas)

Adaptadores hoy: `cloudflare` (FLUX.2 klein en Workers AI), `local` (FLUX.2 klein en el Mac, motor_local.py) y los
conectores del usuario con capacidad «imagen» (`Conector`, sobre conector_ia.py: el servicio lo describe
data/proveedores/<id>.json; recibe los datos prompt, ancho, alto, formato, semilla, modelo y referencia_base64, esta
última vacía si no hay referencias). Un conector de pago solo se usa si se pide por su nombre (--motor <id>): el
automático nunca gasta. Para añadir otro: una clase con `id`, `disponible()` y `generar()`, y una línea en REGISTRO.
"""

import atexit
import base64
import io
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import requests
from dotenv import load_dotenv
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import espacio  # noqa: E402
import servicios  # noqa: E402
import sistema  # noqa: E402
import uso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
MODELOS = {
    "klein": "@cf/black-forest-labs/flux-2-klein-4b",
    "klein9": "@cf/black-forest-labs/flux-2-klein-9b",     # en prueba (laboratorio de estilo)
    "dev": "@cf/black-forest-labs/flux-2-dev",             # en prueba: el grande de FLUX.2
    "lucid": "@cf/leonardo/lucid-origin",                  # en prueba: sin imágenes de referencia
    "schnell": "@cf/black-forest-labs/flux-1-schnell",
}
FORMATOS = {
    "horizontal": (1344, 768),   # 16:9 aprox.; el montaje lo escala a 1920x1080
    "vertical": (768, 1344),
    "cuadrado": (1024, 1024),
}
REINTENTOS = 3


class CuotaAgotada(Exception):
    pass


class ImagenFiltrada(Exception):
    """El filtro de contenido de Cloudflare rechaza la imagen (código 3030, «flagged»)."""


@dataclass
class SolicitudImagen:
    prompt: str
    salida: Path
    formato: str = "horizontal"
    ancho: int = 0
    alto: int = 0
    referencias: list = field(default_factory=list)
    semilla: int | None = None
    modelo: str = "klein"           # solo lo entienden los proveedores que tienen varios

    def __post_init__(self):
        self.salida = Path(self.salida)
        if not (self.ancho and self.alto):
            self.ancho, self.alto = FORMATOS[self.formato]


class ProveedorImagen(Protocol):
    id: str

    def disponible(self) -> bool: ...

    def generar(self, sol: SolicitudImagen) -> Path: ...


class MotorLocal:
    """Proceso de motor_local.py abierto mientras dure este programa (el modelo se carga una sola vez)."""
    _proceso = None

    @classmethod
    def generar(cls, prompt, salida, ancho, alto, referencias, semilla=None):
        if cls._proceso is None:
            python = sistema.python_venv(RAIZ, ".venv-local")
            if not python.exists():
                sys.exit("ERROR: falta el motor local (.venv-local); ver herramientas/motor_local.py")
            print("Motor local: cargando FLUX.2 klein en el Mac (prioridad baja)...")
            cls._proceso = subprocess.Popen([str(python), str(RAIZ / "herramientas" / "motor_local.py")],
                                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            atexit.register(cls.cerrar)
            cls._leer()
        peticion = {"prompt": prompt, "salida": str(salida), "ancho": ancho, "alto": alto,
                    "referencias": [str(r) for r in referencias], "semilla": semilla}
        cls._proceso.stdin.write(json.dumps(peticion, ensure_ascii=False) + "\n")
        cls._proceso.stdin.flush()
        return cls._leer()

    @classmethod
    def _leer(cls):
        linea = cls._proceso.stdout.readline()
        if not linea:
            sys.exit("ERROR: el motor local se ha cerrado inesperadamente")
        respuesta = json.loads(linea)
        if not respuesta["ok"]:
            sys.exit(f"ERROR (motor local): {respuesta['error']}")
        return respuesta

    @classmethod
    def cerrar(cls):
        if cls._proceso and cls._proceso.poll() is None:
            cls._proceso.stdin.close()
            cls._proceso.wait(timeout=60)


class Local:
    """Mismo modelo (klein) en el Mac; schnell no existe en local y se sustituye por klein."""
    id = "local"

    def disponible(self):
        return servicios.disponible("local")

    def generar(self, sol):
        if not self.disponible():
            sys.exit("ERROR: no usas el motor de imágenes de este Mac (Ajustes → Servicios), o no está instalado.")
        salida = sol.salida
        salida.parent.mkdir(parents=True, exist_ok=True)
        temporal = salida.with_suffix(".local.png")
        r = MotorLocal.generar(sol.prompt, temporal, sol.ancho, sol.alto, sol.referencias, sol.semilla)
        print(f"  (motor local: {r['segundos']:.0f} s, pico de memoria {r['memoria_gb']} GB, semilla {r['semilla']})")
        salida.with_suffix(".semilla").write_text(str(r["semilla"]))
        with Image.open(temporal) as imagen:
            imagen = imagen.convert("RGB") if salida.suffix.lower() in (".jpg", ".jpeg") else imagen.copy()
        imagen.save(salida)
        temporal.unlink()
        uso.registrar("local", 0, str(salida.name))
        return salida


class Cloudflare:
    id = "cloudflare"

    def disponible(self):
        return servicios.disponible("cloudflare")

    @staticmethod
    def credenciales():
        load_dotenv(espacio.ENV)
        cuenta = os.getenv("CF_ACCOUNT_ID", "").strip()
        token = os.getenv("CF_API_TOKEN", "").strip()
        if not cuenta or not token:
            sys.exit("ERROR: faltan CF_ACCOUNT_ID o CF_API_TOKEN en .env")
        return cuenta, token

    @staticmethod
    def peticion(modelo, prompt, formato, referencias):
        """Devuelve los argumentos de requests.post para cada modelo."""
        if modelo == "schnell":
            if referencias or formato != "cuadrado":
                sys.exit("ERROR: el modelo schnell solo admite formato cuadrado y sin referencias")
            return {"json": {"prompt": prompt, "steps": 4}}
        if modelo == "lucid":
            if referencias:
                print("Aviso: lucid no admite imágenes de referencia; se ignoran")
            ancho, alto = FORMATOS[formato]
            return {"json": {"prompt": prompt, "width": ancho, "height": alto}}
        ancho, alto = FORMATOS[formato]
        campos = {"prompt": (None, prompt), "width": (None, str(ancho)), "height": (None, str(alto))}
        for i, ref in enumerate(referencias):
            ref = Path(ref)
            if not ref.exists():
                sys.exit(f"ERROR: no existe la referencia {ref}")
            campos[f"input_image_{i}"] = (ref.name, ref.read_bytes(), "image/png")
        return {"files": campos}

    def generar(self, sol):
        cuenta, token = self.credenciales()
        url = f"https://api.cloudflare.com/client/v4/accounts/{cuenta}/ai/run/{MODELOS[sol.modelo]}"
        args = self.peticion(sol.modelo, sol.prompt, sol.formato, list(sol.referencias))

        for intento in range(1, REINTENTOS + 1):
            try:
                r = requests.post(url, headers={"Authorization": f"Bearer {token}"}, timeout=180, **args)
            except requests.RequestException as e:
                error = f"conexión: {e}"
            else:
                if r.ok:
                    imagen_b64 = (r.json().get("result") or {}).get("image")
                    if not imagen_b64:
                        sys.exit(f"ERROR: respuesta sin imagen: {r.text[:300]}")
                    break
                if "flagged" in r.text.lower() or '"code":3030' in r.text.replace(" ", ""):
                    raise ImagenFiltrada(r.text[:200])
                if r.status_code in (400, 401, 403):
                    sys.exit(f"ERROR {r.status_code}: {r.text[:300]}")
                if r.status_code == 429 or "neuron" in r.text.lower():
                    raise CuotaAgotada(r.text[:200])
                error = f"HTTP {r.status_code}: {r.text[:200]}"
            if intento == REINTENTOS:
                sys.exit(f"ERROR tras {REINTENTOS} intentos: {error}")
            print(f"Aviso: {error}. Reintentando ({intento}/{REINTENTOS})...")
            time.sleep(3 * intento)

        salida = sol.salida
        salida.parent.mkdir(parents=True, exist_ok=True)
        imagen = Image.open(io.BytesIO(base64.b64decode(imagen_b64)))
        tam_refs = []
        for ref in sol.referencias:
            with Image.open(ref) as r:
                tam_refs.append(r.size)
        uso.registrar("cloudflare", uso.neuronas_imagen(sol.modelo, *imagen.size, tam_refs), str(salida.name))
        if salida.suffix.lower() in (".jpg", ".jpeg"):
            imagen = imagen.convert("RGB")
        imagen.save(salida)
        return salida


class Conector:
    """Un servicio de imágenes conectado por el usuario (conector_ia.py)."""

    def __init__(self, sid):
        self.id = sid

    @property
    def de_pago(self):
        import conector_ia
        return conector_ia.de_pago(conector_ia.cargar(self.id))

    def disponible(self):
        return servicios.disponible(self.id)

    def generar(self, sol):
        import random

        import conector_ia
        if not self.disponible():
            sys.exit(f"ERROR: no usas el servicio «{self.id}» (Ajustes → Servicios), o falta su clave.")
        referencia = base64.b64encode(Path(sol.referencias[0]).read_bytes()).decode() if sol.referencias else ""
        datos = {"prompt": sol.prompt, "ancho": sol.ancho, "alto": sol.alto, "formato": sol.formato,
                 "semilla": sol.semilla if sol.semilla is not None else random.randint(0, 2**31 - 1),
                 "modelo": sol.modelo, "referencia_base64": referencia}
        sol.salida.parent.mkdir(parents=True, exist_ok=True)
        temporal = sol.salida.with_suffix(".conector")
        try:
            conector_ia.ejecutar(self.id, datos, temporal)
        except conector_ia.CupoAgotado as e:
            raise CuotaAgotada(str(e)) from e
        except (conector_ia.ErrorConector, OSError) as e:        # incluye ClaveInvalida y TiempoAgotado
            sys.exit(f"ERROR: {e}")
        try:
            with Image.open(temporal) as imagen:
                imagen = imagen.convert("RGB") if sol.salida.suffix.lower() in (".jpg", ".jpeg") else imagen.copy()
        except OSError:
            sys.exit(f"ERROR: el servicio «{self.id}» no ha devuelto una imagen que se pueda leer")
        finally:
            temporal.unlink(missing_ok=True)
        imagen.save(sol.salida)
        return sol.salida


def conectores_de_usuario():
    """Los conectores de imagen del usuario (sean o no utilizables ahora)."""
    return {s["id"]: Conector(s["id"]) for s in servicios.conectores() if "imagen" in s["hace"]}


REGISTRO: dict[str, ProveedorImagen] = {p.id: p for p in (Cloudflare(), Local())}

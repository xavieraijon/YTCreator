"""Imágenes de referencia del paso «Estilo visual» de la creación del canal: el usuario sube una imagen (o da su dirección)
y las pruebas de estilo se pintan PARECIDAS a ella. Viven en <canal>/videos/_pruebas/estilo/referencias/ (ref-1.png…) y
el programa, no Claude, es quien las anota en `prueba.json` → `referencias` (Claude reescribe ese archivo en cada tanda).
Gratis. La dirección es un dato del usuario: solo http(s) a internet (nada de este equipo ni de la red local), solo
imágenes de verdad y con tope de tamaño."""

import ipaddress
import socket
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from PIL import Image, UnidentifiedImageError

import archivos  # noqa: E402  (herramientas/, en sys.path por config)

MAXIMO = 4                              # lo que admite el modelo de imágenes
MAX_BYTES = 20 * 1024 * 1024
LADO_MAX = 1536                         # la referencia no necesita más; menos peso al modelo
SALTOS = 3                              # redirecciones que se siguen


class ErrorReferencia(ValueError):
    pass


def carpeta_de(estilo: Path) -> Path:
    return estilo / "referencias"


def listar(estilo: Path) -> list[Path]:
    c = carpeta_de(estilo)
    return sorted(c.glob("ref-*.png"), key=lambda p: int(p.stem.split("-")[1])) if c.is_dir() else []


def guardar(estilo: Path, parcial: Path) -> Path:
    """Comprueba que es una imagen de verdad (no por la extensión) y la guarda como la siguiente referencia."""
    if len(listar(estilo)) >= MAXIMO:
        raise ErrorReferencia(f"Ya hay {MAXIMO} imágenes de referencia: quita alguna antes de añadir otra")
    try:
        with Image.open(parcial) as im:
            im.verify()
        with Image.open(parcial) as im:
            im = im.convert("RGB")
            im.thumbnail((LADO_MAX, LADO_MAX))
            carpeta = carpeta_de(estilo)
            carpeta.mkdir(parents=True, exist_ok=True)
            n = max((int(p.stem.split("-")[1]) for p in listar(estilo)), default=0) + 1
            destino = carpeta / f"ref-{n}.png"
            temporal = carpeta / f"ref-{n}.png.part"
            im.save(temporal, "PNG")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ErrorReferencia(f"No es una imagen que se pueda leer ({type(e).__name__})")
    temporal.replace(destino)
    fijar(estilo)
    return destino


def quitar(estilo: Path, nombre: str):
    destino = carpeta_de(estilo) / nombre
    if destino.name != nombre or destino not in listar(estilo):
        raise ErrorReferencia("Esa imagen de referencia no existe")
    notas = leer_notas(estilo)
    destino.unlink()
    if notas.pop(nombre, None) is not None:
        archivos.escribir_json(carpeta_de(estilo) / "notas.json", notas)
    fijar(estilo)


# --- Descripción que acompaña a cada referencia ---------------------------------------------------------------------------

MAX_NOTA = 500


def leer_notas(estilo: Path) -> dict[str, str]:
    """{ref-N.png: descripción} de las imágenes que existen; un archivo dañado cuenta como sin notas."""
    ruta = carpeta_de(estilo) / "notas.json"
    if not ruta.exists():
        return {}
    try:
        crudo = archivos.leer_json(ruta)
    except archivos.ArchivoDanado:
        return {}
    if not isinstance(crudo, dict):
        return {}
    hay = {p.name for p in listar(estilo)}
    return {k: v for k, v in crudo.items() if k in hay and isinstance(v, str) and v.strip()}


def anotar(estilo: Path, nombre: str, texto: str):
    """Guarda (o borra, si va vacía) la descripción de una referencia."""
    if (carpeta_de(estilo) / nombre) not in listar(estilo):
        raise ErrorReferencia("Esa imagen de referencia no existe")
    texto = " ".join(texto.split())[:MAX_NOTA]
    notas = leer_notas(estilo)
    if texto:
        notas[nombre] = texto
    else:
        notas.pop(nombre, None)
    archivos.escribir_json(carpeta_de(estilo) / "notas.json", notas)


def fijar(estilo: Path):
    """Anota en prueba.json las referencias que hay (y solo ellas); si no hay prueba o está dañada, no toca nada."""
    ruta = estilo / "prueba.json"
    if not ruta.exists():
        return
    try:
        prueba = archivos.leer_json(ruta)
    except archivos.ArchivoDanado:
        return
    if not isinstance(prueba, dict):
        return
    refs = [f"referencias/{p.name}" for p in listar(estilo)]
    if (prueba.get("referencias") or []) == refs:
        return
    if refs:
        prueba["referencias"] = refs
    else:
        prueba.pop("referencias", None)
    archivos.escribir_json(ruta, prueba)


# --- Por dirección -----------------------------------------------------------------------------------------------------

def _es_de_internet(host: str):
    """Rechaza lo que no sea una dirección pública: este equipo, la red local, enlaces locales."""
    try:
        direcciones = {i[4][0] for i in socket.getaddrinfo(host, None)}
    except OSError:
        raise ErrorReferencia("No se encuentra esa dirección en internet")
    for d in direcciones:
        ip = ipaddress.ip_address(d.split("%")[0])
        if not ip.is_global:
            raise ErrorReferencia("Esa dirección no es de internet: usa la de una imagen pública")


def descargar(url: str, parcial: Path):
    """Baja la imagen de una dirección pública a `parcial` (sigue pocas redirecciones, mira cada salto)."""
    parcial.parent.mkdir(parents=True, exist_ok=True)
    actual = url.strip()
    with httpx.Client(timeout=20, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0 YTCreator"}) as cliente:
        for _ in range(SALTOS + 1):
            partes = urlparse(actual)
            if partes.scheme not in ("http", "https") or not partes.hostname:
                raise ErrorReferencia("Escribe la dirección completa de una imagen (empieza por https://)")
            _es_de_internet(partes.hostname)
            try:
                with cliente.stream("GET", actual) as r:
                    if r.is_redirect and r.headers.get("location"):
                        actual = urljoin(actual, r.headers["location"])
                        continue
                    if r.status_code != 200:
                        raise ErrorReferencia(f"No se pudo bajar la imagen (el sitio contesta {r.status_code}): "
                                              "descárgala y súbela desde tu equipo")
                    recibidos = 0
                    with open(parcial, "wb") as f:
                        for trozo in r.iter_bytes():
                            recibidos += len(trozo)
                            if recibidos > MAX_BYTES:
                                raise ErrorReferencia("Esa imagen pesa demasiado (más de 20 MB)")
                            f.write(trozo)
                    if not recibidos:
                        raise ErrorReferencia("Esa dirección no devuelve nada")
                    return
            except httpx.HTTPError:
                raise ErrorReferencia("No se pudo bajar la imagen de esa dirección: descárgala y súbela desde tu equipo")
        raise ErrorReferencia("Esa dirección redirige demasiadas veces")

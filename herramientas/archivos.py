"""Escritura de archivos sin dejarlos nunca a medias.

Los JSON del kit (guion.json, estado.json, revisiones, ajustes) y el .env los leen a la vez la UI, el vigilante, las
herramientas y Claude: un corte (o un lector) a mitad de una escritura no debe ver nunca un archivo truncado. Se escribe
en un temporal de la misma carpeta, se fuerza a disco y se sustituye de golpe (os.replace es atómico en el mismo
volumen). Se conservan los permisos del archivo anterior (o los pedidos, p. ej. 600 para el .env).

    from archivos import escribir_json, escribir_texto, leer_json
    escribir_json(ruta, datos)                    # indent=2 y salto de línea final, como lo deja Claude
    datos = leer_json(ruta)                       # para modificar y volver a escribir: si está dañado, ArchivoDanado

Regla: lo que se va a volver a escribir se lee con `leer_json` (estricto). Leer «lo que haya, o vacío» y escribir encima
borraría un archivo dañado que aún se puede reparar (p. ej. un estado.json cortado a medias).
"""

import json
import os
import tempfile
from pathlib import Path


# Cómo se llama cada archivo para el usuario (los mensajes no enseñan nombres de archivo).
QUE_ES = {"estado.json": "el estado del vídeo", "guion.json": "el guion", "canal.json": "la configuración del canal",
          "revision_imagenes.json": "las marcas de revisión de las imágenes", "ajustes.json": "los ajustes",
          "propuestas.json": "los enfoques propuestos", "musica.json": "la música del vídeo",
          "ai33_tareas.json": "el registro de las imágenes ya pagadas en ai33",
          "revision_propuestas.json": "las correcciones de prompts propuestas por Claude"}


class ArchivoDanado(ValueError):
    """Un JSON que no se puede leer. No se ha tocado: se puede reparar (a mano o pidiéndoselo a Claude)."""

    def __init__(self, ruta: Path, error: json.JSONDecodeError | UnicodeDecodeError):
        self.ruta = Path(ruta)
        que = QUE_ES.get(self.ruta.name, f"un archivo de datos ({self.ruta.name})")
        donde = f" (línea {error.lineno}, columna {error.colno})" if isinstance(error, json.JSONDecodeError) else ""
        super().__init__(f"No se puede leer {que}: el archivo está dañado{donde}. No se ha cambiado nada; pide a Claude "
                         "en el chat que lo repare o restaura una copia.")


def leer_json(ruta: Path | str, defecto=None):
    """El JSON de `ruta`; si no existe, `defecto` ({} si no se dice). Si está dañado, ArchivoDanado (nunca «vacío»)."""
    ruta = Path(ruta)
    try:
        texto = ruta.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {} if defecto is None else defecto
    except UnicodeDecodeError as e:
        raise ArchivoDanado(ruta, e) from None
    try:
        return json.loads(texto)
    except json.JSONDecodeError as e:
        raise ArchivoDanado(ruta, e) from None


def escribir_texto(ruta: Path | str, texto: str, permisos: int | None = None) -> None:
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    if permisos is None:
        try:
            permisos = ruta.stat().st_mode & 0o777
        except FileNotFoundError:
            permisos = 0o666 & ~_UMASK
    descriptor, temporal = tempfile.mkstemp(dir=ruta.parent, prefix=f".{ruta.name}.", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as f:
            f.write(texto)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(temporal, permisos)
        os.replace(temporal, ruta)
    except BaseException:
        Path(temporal).unlink(missing_ok=True)
        raise


def escribir_json(ruta: Path | str, datos, indent: int | None = 2, final_linea: bool = True,
                  permisos: int | None = None) -> None:
    texto = json.dumps(datos, ensure_ascii=False, indent=indent) + ("\n" if final_linea else "")
    escribir_texto(ruta, texto, permisos)


def _leer_umask() -> int:
    """Una vez, al importar: os.umask cambia la del proceso entero y no se puede consultar sin tocarla."""
    actual = os.umask(0o022)
    os.umask(actual)
    return actual


_UMASK = _leer_umask()

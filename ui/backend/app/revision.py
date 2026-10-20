"""Revisión de imágenes desde la UI: marcar una imagen como mal (con el motivo) o bien, y prepararla para
rehacerla con el servicio elegido.

- Las marcas van a `<vídeo>/revision_imagenes.json`, junto a los demás archivos del vídeo, para que Claude y
  el director de arte las lean (el motivo sirve para corregir el prompt):
  {"13-2": {"estado": "mal" | "bien", "motivo": "...", "fecha": "...", "rehecha_desde": "..." | null,
            "historial": [{"fecha", "estado", "motivo"?, "accion"?, "anterior"?}]}}
- Cambiar el prompt, el motor (klein o ai33) o quitar la semilla de una imagen se escribe en guion.json con
  el mismo formato que usa Claude (JSON con sangría de 2, sin escapar tildes).
- Antes de rehacerla, la imagen actual se guarda en img/anteriores/ para poder compararlas."""

import json
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path

import archivos  # noqa: E402  (herramientas/, en sys.path por config)
import canal as kit_canal  # noqa: E402
import esquema  # noqa: E402

ARCHIVO = "revision_imagenes.json"
MOTORES = ("klein", "ai33")


def _ahora():
    return datetime.now().isoformat(timespec="seconds")


def _escribir_json(ruta: Path, datos, final_linea: bool):
    """Escritura atómica: el vigilante (y Claude) nunca ven un archivo a medias."""
    archivos.escribir_json(ruta, datos, final_linea=final_linea)


def leer(carpeta: Path) -> dict:
    try:
        return json.loads((carpeta / ARCHIVO).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _leer_para_escribir(carpeta: Path) -> dict:
    """Las marcas para modificarlas: si el archivo está dañado, ArchivoDanado (no se pierden las que había)."""
    return archivos.leer_json(carpeta / ARCHIVO)


def _guardar(carpeta: Path, datos: dict):
    _escribir_json(carpeta / ARCHIVO, datos, True)


def estado_de(entrada: dict | None, png: Path) -> dict | None:
    """Lo que ve la UI: mal (pendiente), rehecha (se rehízo después de marcarla: revísala) o bien."""
    if not entrada:
        return None
    estado = entrada.get("estado")
    # Rehecha = generada DESPUÉS de marcarla, la rehaga el visor (rehecha_desde) o el botón general de
    # «Generar» (01/10: las rehechas con ese botón seguían saliendo como «mal»).
    desde = entrada.get("rehecha_desde") or entrada.get("fecha")
    if estado == "mal" and desde and png.exists() and \
            datetime.fromtimestamp(png.stat().st_mtime) > datetime.fromisoformat(desde) + timedelta(seconds=2):
        estado = "rehecha"
    anteriores = [h["anterior"] for h in entrada.get("historial", []) if h.get("anterior")]
    return {"estado": estado, "motivo": entrada.get("motivo"), "fecha": entrada.get("fecha"),
            "anteriores": anteriores, "historial": entrada.get("historial", [])}


# --- guion.json ---------------------------------------------------------------------------------------

def _spec(guion: dict, ident: str) -> dict:
    """La imagen EE-N del guion (el dict que hay que cambiar)."""
    try:
        n, k = (int(x) for x in ident.split("-"))
        escena = guion["escenas"][n - 1]
    except (ValueError, IndexError, KeyError):
        raise ValueError(f"No existe la imagen {ident}")
    if escena.get("imagenes"):
        if not 1 <= k <= len(escena["imagenes"]):
            raise ValueError(f"No existe la imagen {ident}")
        return escena["imagenes"][k - 1]
    if k != 1:
        raise ValueError(f"No existe la imagen {ident}")
    return escena                   # formato corto: la escena lleva su única imagen


def editar_guion(ruta: Path, ident: str, prompt: str | None = None, motor: str | None = None,
                 quitar_semilla: bool = False) -> list[str]:
    """Cambia prompt, motor o semilla de una imagen; devuelve qué se cambió (para el historial). Con cerrojo y
    relectura (kit_canal.editar_guion): no pisa lo que Claude o la UI hayan guardado entre medias."""
    return kit_canal.editar_guion(ruta, lambda guion: _editar_spec(guion, ident, prompt, motor, quitar_semilla)) or []


def _editar_spec(guion: dict, ident: str, prompt: str | None, motor: str | None, quitar_semilla: bool):
    spec = _spec(guion, ident)
    if "prompt" not in spec or any(k in spec for k in ("video", "imagen", "reutilizar")):
        raise ValueError(f"{ident} no se genera desde una descripción (reutiliza otra, es un clip o un archivo propio)")
    cambios = []
    if prompt is not None:
        prompt = " ".join(prompt.split())
        if not prompt:
            raise ValueError("La descripción no puede quedar vacía")
        if prompt != spec["prompt"]:
            spec["prompt"] = prompt
            cambios.append("prompt cambiado")
    if motor is not None:
        if motor not in MOTORES:
            raise ValueError(f"Servicio no válido: {motor}")
        actual = "ai33" if spec.get("motor") == "ai33" else "klein"
        if motor != actual:
            if motor == "ai33":
                spec["motor"] = "ai33"
            else:
                spec.pop("motor", None)
            cambios.append(f"servicio {actual} → {motor}")
    if quitar_semilla and "semilla" in spec:
        spec.pop("semilla")
        cambios.append("semilla quitada (si no, saldría la misma imagen)")
    return cambios or False                     # sin cambios, no se reescribe


def motor_de(ruta_guion: Path, ident: str) -> str:
    spec = _spec(esquema.migrar("guion", archivos.leer_json(ruta_guion)), ident)
    return "ai33" if spec.get("motor") == "ai33" else "klein"


# --- Marcas -------------------------------------------------------------------------------------------

def marcar(carpeta: Path, ident: str, estado: str, motivo: str | None = None, cambios: list[str] = (),
           etiquetas: list[str] | None = None):
    """Marca mal (con motivo y, desde el modo revisión, las etiquetas del fallo) o bien."""
    if estado not in ("mal", "bien"):
        raise ValueError("Estado no válido")
    motivo = " ".join((motivo or "").split())[:1000] or None
    if estado == "mal" and not motivo:
        raise ValueError("Di qué está mal: sirve para corregir la descripción")
    datos = _leer_para_escribir(carpeta)
    entrada = datos.setdefault(ident, {"historial": []})
    entrada.update(estado=estado, fecha=_ahora())
    if estado == "mal":
        entrada["motivo"] = motivo
        entrada["etiquetas"] = [e for e in (etiquetas or []) if isinstance(e, str)][:10]
        entrada.pop("rehecha_desde", None)        # marcada otra vez: vuelve a estar pendiente
    entrada["historial"].append({"fecha": entrada["fecha"], "estado": estado,
                                 **({"motivo": motivo} if motivo else {}),
                                 **({"accion": "; ".join(cambios)} if cambios else {})})
    _guardar(carpeta, datos)


def antes_de_rehacer(carpeta: Path, ident: str, servicio: str):
    """Guarda la imagen actual en img/anteriores/ y apunta que se va a rehacer (con qué servicio)."""
    png = carpeta / "img" / f"{ident}.png"
    ahora = _ahora()
    anterior = None
    if png.exists():
        destino = carpeta / "img" / "anteriores" / f"{ident}_{ahora.replace(':', '').replace('-', '')}.png"
        destino.parent.mkdir(exist_ok=True)
        shutil.copy2(png, destino)
        anterior = str(destino.relative_to(carpeta))
    datos = _leer_para_escribir(carpeta)
    entrada = datos.setdefault(ident, {"estado": "mal", "fecha": ahora, "historial": []})
    if entrada.get("estado") != "mal":        # rehacer sin marcar antes: cuenta como marcada
        entrada.update(estado="mal", fecha=ahora)
    entrada["rehecha_desde"] = ahora
    entrada["historial"].append({"fecha": ahora, "estado": "mal", "accion": f"rehacer con {servicio}",
                                 **({"anterior": anterior} if anterior else {})})
    _guardar(carpeta, datos)


def ultima_anterior(carpeta: Path, ident: str) -> Path | None:
    """La versión anterior más reciente de una imagen (img/anteriores/EE-N_*.png)."""
    previas = sorted((carpeta / "img" / "anteriores").glob(f"{ident}_*.png"))
    return previas[-1] if previas else None


def restaurar(carpeta: Path, ident: str, firma_actual: str | None):
    """«Me quedo con la anterior»: vuelve a poner la versión anterior (la actual pasa a anteriores/), la deja
    al día para montar.py con la firma del prompt actual (si no, la rehará) y la marca como bien."""
    anterior = ultima_anterior(carpeta, ident)
    if not anterior:
        raise ValueError(f"{ident} no tiene ninguna versión anterior guardada")
    png = carpeta / "img" / f"{ident}.png"
    ahora = _ahora()
    guardada = None
    if png.exists():
        destino = carpeta / "img" / "anteriores" / f"{ident}_{ahora.replace(':', '').replace('-', '')}.png"
        shutil.copy2(png, destino)
        guardada = str(destino.relative_to(carpeta))
    shutil.copy2(anterior, png)
    os.utime(png)                          # fecha de ahora: cuenta como la versión vigente
    if firma_actual:
        png.with_suffix(".firma").write_text(firma_actual)
    datos = _leer_para_escribir(carpeta)
    entrada = datos.setdefault(ident, {"historial": []})
    entrada.update(estado="bien", fecha=ahora)
    entrada.pop("rehecha_desde", None)
    entrada["historial"].append({"fecha": ahora, "estado": "bien",
                                 "accion": f"me quedo con la anterior ({anterior.name})",
                                 **({"anterior": guardada} if guardada else {})})
    _guardar(carpeta, datos)


def dejar_al_dia(carpeta: Path, ident: str, firma_actual: str | None) -> bool:
    """Da por buena la imagen actual con el prompt de hoy: escribe su firma si no coincide. True si cambió."""
    png = carpeta / "img" / f"{ident}.png"
    if not firma_actual or not png.exists():
        return False
    archivo = png.with_suffix(".firma")
    if archivo.exists() and archivo.read_text() == firma_actual:
        return False
    archivo.write_text(firma_actual)
    datos = _leer_para_escribir(carpeta)
    entrada = datos.setdefault(ident, {"historial": []})
    entrada.setdefault("historial", []).append(
        {"fecha": _ahora(), "estado": "bien", "accion": "aceptada tal cual: queda al día con el prompt actual del guion"})
    _guardar(carpeta, datos)
    return True


# --- Propuestas de Claude (herramientas/corregir_prompts.py → revision_propuestas.json) ---------------

PROPUESTAS = "revision_propuestas.json"


def propuestas(carpeta: Path, guion: dict) -> dict:
    """Las propuestas que siguen valiendo: las que parten del prompt actual de la imagen."""
    try:
        datos = json.loads((carpeta / PROPUESTAS).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    vigentes = {}
    for ident, p in datos.items():
        try:
            actual = _spec(guion, ident).get("prompt")
        except ValueError:
            continue
        if p.get("prompt_base") == actual:
            vigentes[ident] = {k: p.get(k) for k in ("prompt", "explicacion", "servicio", "fecha")}
    return vigentes


def quitar_propuestas(carpeta: Path, idents):
    """Al aplicarlas (o rehacer sin ellas), dejan de ofrecerse."""
    ruta = carpeta / PROPUESTAS
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    for i in idents:
        datos.pop(i, None)
    _escribir_json(ruta, datos, True)

"""Firma que montar.py espera para una imagen de prompt: si la de img/EE-N.firma no coincide, montar.py la
rehará en la siguiente pasada (el prompt, el estilo, la paleta o los personajes han cambiado).

Réplica de montar.construir_prompt + montar.huella para un canal cualquiera (montar.py lee siempre el canal
activo). tests/test_firma.py comprueba que ambas dan lo mismo: si cambia montar.py, cambiar esto también."""

import hashlib
import json
import logging
from pathlib import Path

import archivos  # noqa: E402
import canal as kit_canal        # herramientas/: los campos heredables y la configuración de ai33, de una sola fuente
import esquema  # noqa: E402
import imagen_ai33

log = logging.getLogger("canalyt.firma")


def huella(*partes):
    return hashlib.sha1("\x1f".join(map(str, partes)).encode()).hexdigest()[:12]


def completar(cfg, guion):
    """canal.completar_guion con el canal.json de ese canal."""
    completo = {**{k: cfg[k] for k in kit_canal.HEREDABLES if k in cfg}, **guion}
    completo["personajes"] = {**cfg.get("personajes", {}), **guion.get("personajes", {})}
    return completo


def prompt_final(cfg, guion, prompt):
    for nombre, descripcion in guion.get("personajes", {}).items():
        prompt = prompt.replace("{" + nombre + "}", descripcion)
    estilo = guion.get("estilo", "")
    if "{paleta}" in estilo:
        paletas = cfg.get("paletas", {})
        estilo = estilo.replace("{paleta}", guion.get("paleta") or paletas.get(guion.get("pilar", ""),
                                                                               paletas.get("defecto", "")))
    if "{escena}" in estilo:
        return estilo.replace("{escena}", prompt)
    return f"{estilo}: {prompt}" if estilo else prompt


def config_ai33(cfg, guion):
    """imagen_ai33.config (valores por defecto incluidos): la misma función, para que un cambio de modelo no
    desincronice las firmas de la UI y las de montar.py."""
    return imagen_ai33.config(guion, cfg)


def esperada(cfg, guion_completo, spec, carpeta_canal):
    """Firma de una imagen con "prompt" (guion ya completado con completar())."""
    formato = guion_completo.get("formato", "horizontal")
    if spec.get("motor") == "ai33":           # montar.firma_ai33
        c = config_ai33(cfg, guion_completo)
        refs = [(carpeta_canal / r).resolve() for r in c["referencias_estilo"]]
        return huella(prompt_final(cfg, guion_completo, spec["prompt"]), formato, "ai33", c["modelo"],
                      c["resolucion"], *refs)
    refs = ([(carpeta_canal / r).resolve() for r in guion_completo.get("referencias", [])]
            if spec.get("personaje") else [])
    semilla = spec.get("semilla")
    return huella(prompt_final(cfg, guion_completo, spec["prompt"]), formato, *refs,
                  *([semilla] if semilla is not None else []))


def esperada_de(carpeta_canal: Path, carpeta_video: Path, ident: str) -> str | None:
    """La firma que montar.py espera hoy para la imagen `ident` del vídeo (la del prompt actual del guion), o None si
    no se puede calcular (guion a medio escribir, imagen que no existe o que no sale de un prompt)."""
    from .revision import _spec
    try:
        try:
            cfg = json.loads((carpeta_canal / "canal.json").read_text(encoding="utf-8"))
        except FileNotFoundError:
            cfg = {}
        guion = esquema.migrar("guion", archivos.leer_json(carpeta_video / "guion.json"))
        spec = _spec(guion, ident)
        if "prompt" not in spec:
            return None
        return esperada(cfg, completar(cfg, guion), spec, carpeta_canal)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        log.info("Sin firma esperada para %s en %s: %s", ident, carpeta_video.name, e)
        return None

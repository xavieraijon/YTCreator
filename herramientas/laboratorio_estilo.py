"""Laboratorio de estilo: las mismas escenas pintadas con varios estilos, para elegir el de un canal (o
probar una paleta) mirando una sola hoja. Es el paso "estilo visual" de /nuevo-canal (y el paso 4 de la UI).

Uso:
    .venv/bin/python herramientas/laboratorio_estilo.py <prueba.json>
    .venv/bin/python herramientas/laboratorio_estilo.py <prueba.json> --motor cloudflare --solo E1,E3 --sufijo _v2

prueba.json (las rutas son relativas a su carpeta):
{
  "formato": "horizontal",                              # o "vertical"
  "escenas": {"faro": "a lighthouse keeper climbing ...", "mercado": "..."},
  "estilos": {"E1_editorial": "editorial illustration painted in a {paleta}: {escena}, ...",
              "E2_acuarela": "..."},                     # {escena} obligatorio; {paleta} opcional
  "paleta": "muted ochre and deep blue palette",        # opcional: sustituye {paleta}
  "personajes": {"guia": "a tall woman with ..."},      # opcional: {guia} dentro de las escenas
  "referencias": ["ref/guia.png"],                      # opcional: imágenes de referencia (personaje o estilo)
  "referencia_en": ["E3_muneco"],                       # opcional: qué estilos usan las referencias (sin él, todos)
  "escenas_simples": {"faro": "a stick figure next to a lighthouse"},   # opcional: escena mínima para los estilos de
  "estilos_simples": ["E3_muneco"]                      #   "estilos_simples" (figuras sin fondo): la usan en lugar de la escena
}
(Otras claves, como las que añade la UI para presentar los estilos, se ignoran.)

Resultados en la carpeta del json: <estilo>_<modelo>_<escena><sufijo>.png y hoja<sufijo>.jpg (una fila por
estilo, una columna por escena). Una imagen que ya existe no se rehace, salvo que su prompt haya cambiado
(prompts.json guarda con qué prompt se hizo cada una). No necesita canal activo.
Coste: imágenes gratis (Cloudflare con cuota diaria o el Mac); estilos × escenas imágenes.
"""

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402

MANIFIESTO = "prompts.json"     # archivo → prompt con que se hizo


def escena_de(ident, escena, estilo_id, prueba):
    """La escena que pinta ese estilo: los estilos de «estilos_simples» (figuras sin fondo) usan la mínima de
    «escenas_simples» si la escena tiene una; los demás, la normal."""
    if estilo_id in (prueba.get("estilos_simples") or []):
        return (prueba.get("escenas_simples") or {}).get(ident) or escena
    return escena


def referencias_de(prueba, estilo_id, carpeta):
    """Las imágenes de referencia que usa ese estilo (existentes; máx. 4, lo que admite el modelo)."""
    usan = prueba.get("referencia_en")
    if isinstance(usan, list) and estilo_id not in usan:
        return []
    rutas = [Path(carpeta) / r for r in prueba.get("referencias") or [] if isinstance(r, str)]
    return [r for r in rutas if r.is_file()][:4]


def huella_de(prompt, refs):
    """Con qué se hizo una imagen: el prompt y, si lleva referencias, su contenido (cambiar la referencia rehace la
    imagen). Sin referencias es el prompt tal cual, como siempre."""
    if not refs:
        return prompt
    h = hashlib.sha1()
    for r in refs:
        h.update(r.read_bytes())
    return f"{prompt}\n[referencias {h.hexdigest()[:12]}]"


# FLUX.2 klein no admite prompt negativo: lo que no debe salir se pide en positivo, al final (donde más pesa).
ANATOMIA = ("Correct anatomy: every person or character has exactly one head, two arms and two legs, each limb "
            "attached once, simple clear pose, nothing duplicated.")
COMO_REFERENCIA = ("Copy the visual style of the reference image exactly: same line weight, proportions, face design, "
                   "colours and flat background; only the subject and its pose change.")


def lleva_cuerpo(prueba, estilo_id):
    """Si ese estilo pinta personajes con cuerpo (lo anota quien escribe la prueba en «estilos_con_cuerpo»): solo
    entonces lleva el refuerzo de anatomía; un paisaje, un objeto o un logo no."""
    return estilo_id in (prueba.get("estilos_con_cuerpo") or [])


def prompt_de(estilo, escena, prueba, con_referencia=False, con_cuerpo=False):
    """El prompt final de una imagen de prueba: el estilo con la escena y, al final, el refuerzo de anatomía (si el
    estilo pinta personajes con cuerpo) y, si lleva imagen de referencia, la orden de copiar su estilo."""
    for nombre, descripcion in prueba.get("personajes", {}).items():
        escena = escena.replace("{" + nombre + "}", descripcion)
    estilo = estilo.replace("{paleta}", prueba.get("paleta", ""))
    if "{escena}" not in estilo:
        raise ValueError(f"el estilo no tiene {{escena}}: {estilo[:60]}…")
    prompt = estilo.replace("{escena}", escena).rstrip()
    extra = ([ANATOMIA] if con_cuerpo else []) + ([COMO_REFERENCIA] if con_referencia else [])
    if not extra:
        return prompt
    return " ".join([prompt if prompt.endswith((".", "!")) else prompt + "."] + extra)


def nombre_imagen(estilo, escena, modelo="klein", sufijo=""):
    return f"{estilo}_{modelo}_{escena}{sufijo}.png"


def main():
    ap = argparse.ArgumentParser(description="Mismas escenas con varios estilos y hoja comparativa")
    ap.add_argument("prueba", help="JSON con escenas y estilos (ver la cabecera)")
    ap.add_argument("--motor", default="auto", choices=["auto", "cloudflare", "local"])
    ap.add_argument("--modelo", default="klein")
    ap.add_argument("--solo", help="Estilos a generar, separados por comas (por defecto, todos)")
    ap.add_argument("--sufijo", default="", help="Para una segunda ronda sin pisar la primera (p. ej. _v2)")
    a = ap.parse_args()

    archivo = Path(a.prueba).resolve()
    if not archivo.is_file():
        sys.exit(f"ERROR: no existe {archivo}")
    carpeta = archivo.parent
    try:
        prueba = archivos.leer_json(archivo)
        estilos, escenas = prueba["estilos"], prueba["escenas"]
        elegidos = a.solo.split(",") if a.solo else list(estilos)
        faltan = [e for e in elegidos if e not in estilos]
        if faltan:
            raise ValueError(f"estilos que no están en el json: {', '.join(faltan)}")
        trabajos = [(nombre, ident, prompt_de(estilos[nombre], escena_de(ident, escena, nombre, prueba), prueba,
                                      bool(referencias_de(prueba, nombre, carpeta)), lleva_cuerpo(prueba, nombre)))
                    for nombre in elegidos for ident, escena in escenas.items()]
    except (archivos.ArchivoDanado, KeyError, ValueError, AttributeError) as e:
        sys.exit(f"ERROR: {e if not isinstance(e, KeyError) else f'falta {e} en el json'}")

    import gen_imagen
    from montar import hoja_de_contactos

    gen_imagen.MOTOR = a.motor
    hechos = archivos.leer_json(carpeta / MANIFIESTO)
    imagenes, etiquetas = [], []
    for i, (nombre, ident, prompt) in enumerate(trabajos, 1):
        destino = carpeta / nombre_imagen(nombre, ident, a.modelo, a.sufijo)
        refs = referencias_de(prueba, nombre, carpeta)
        huella = huella_de(prompt, refs)
        canal.progreso(i, len(trabajos), f"{nombre} · {ident}")
        if not destino.exists() or hechos.get(destino.name, huella) != huella:
            gen_imagen.generar(prompt, destino, prueba.get("formato", "horizontal"), refs, modelo=a.modelo)
            hechos[destino.name] = huella
            archivos.escribir_json(carpeta / MANIFIESTO, hechos)
            canal.evento("imagen", ident=destino.name, estado="hecha")
            print("OK", destino.name, flush=True)
        imagenes.append(destino)
        etiquetas.append(f"{nombre} · {ident}")
    hoja = carpeta / f"hoja{a.sufijo}.jpg"
    hoja_de_contactos(imagenes, hoja, etiquetas, columnas=len(escenas))
    print(f"OK: hoja comparativa en {hoja}")


if __name__ == "__main__":
    main()

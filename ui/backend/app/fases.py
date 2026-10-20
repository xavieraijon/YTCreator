"""Fases de producción, tal como las definen .claude/commands/nuevo-video.md y nuevo-short.md.
Si cambian los comandos, actualizar aquí."""

LARGO = [
    ("A", "Arranque"),
    ("B", "Tema y duración"),
    ("C", "Investigación"),
    ("D", "Escaleta y guion"),
    ("E", "Voz"),
    ("F", "Imágenes"),
    ("G", "Montaje y control"),
    ("H", "Miniatura y publicación"),
    ("I", "Cierre"),
    ("J", "Publicado y resultados"),
]

SHORT = [
    ("A", "Arranque y enfoque"),
    ("B", "Guion"),
    ("C", "Voz e imágenes"),
    ("D", "Montaje y publicación"),
    ("E", "Cierre"),
]


def de(tipo):
    return SHORT if tipo == "short" else LARGO

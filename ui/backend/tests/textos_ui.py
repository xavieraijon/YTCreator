"""Texto que ve el usuario en el frontend: nodos de texto de las plantillas, atributos literales que se leen (tooltip,
aria-label, placeholder, title, label) y cadenas de los componentes que acaban en pantalla. Lo usa test_glosario.py.

No es un parser de Angular: quita interpolaciones, bloques de control y etiquetas con un contador de paréntesis. Basta
para encontrar palabras del kit en lo que se enseña; si algo se cuela, se ve en el informe del test."""

import re
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / "frontend" / "src" / "app"

_ATRIBUTOS = re.compile(r'(?<![\[\w.-])(matTooltip|aria-label|placeholder|title|label|mat-label)="([^"]*)"')
_CADENA = re.compile(r"`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'")
_CONTROL = re.compile(r"@(?:else\s+if|if|for|switch|case|defer|empty|else|default)\b")


def _sin_parentesis(texto: str, i: int) -> int:
    """Desde un «(» devuelve la posición tras su «)» (paréntesis anidados y comillas)."""
    nivel, comilla = 0, None
    while i < len(texto):
        c = texto[i]
        if comilla:
            comilla = None if c == comilla else comilla
        elif c in "'\"`":
            comilla = c
        elif c == "(":
            nivel += 1
        elif c == ")":
            nivel -= 1
            if nivel == 0:
                return i + 1
        i += 1
    return i


def _limpiar_control(t: str) -> str:
    salida, i = [], 0
    while True:
        m = _CONTROL.search(t, i)
        if not m:
            salida.append(t[i:])
            break
        salida.append(t[i:m.start()])
        j = m.end()
        while j < len(t) and t[j] in " \t\n":
            j += 1
        if j < len(t) and t[j] == "(":
            j = _sin_parentesis(t, j)
        i = j
    t = "".join(salida)
    t = re.sub(r"@let [^;]*;", " ", t)
    return t.replace("{", " ").replace("}", " ")


def _literales_interpolados(plantilla: str) -> list[str]:
    """Literales dentro de {{ … }} que acaban en pantalla («{{ n === 1 ? 'vídeo' : 'vídeos' }}»): de dos o más palabras o
    una palabra sola sin símbolos (los ids con «:», «-» o «_» y las comparaciones con mayúsculas internas se ignoran)."""
    res = []
    for interp in re.findall(r"\{\{(.*?)\}\}", plantilla, flags=re.S):
        for a, b in _CADENA.findall(interp):
            cadena = re.sub(r"\$\{[^}]*\}", " ", a or b).strip()
            if len(cadena.split()) >= 2 or re.fullmatch(r"[a-záéíóúñ]{4,}", cadena):
                res.append(cadena)
    return res


def _textos_plantilla(plantilla: str) -> list[str]:
    plantilla = re.sub(r"<!--.*?-->", " ", plantilla, flags=re.S)
    interpolados = _literales_interpolados(plantilla)
    plantilla = re.sub(r"\{\{.*?\}\}", " ", plantilla, flags=re.S)
    literales = [v for _, v in _ATRIBUTOS.findall(plantilla)]
    sin_etiquetas = re.sub(r"""<(?:[^>"']|"[^"]*"|'[^']*')*>""", "\n", plantilla, flags=re.S)
    nodos = [x.strip() for x in _limpiar_control(sin_etiquetas).split("\n")]
    return [x for x in nodos + literales + interpolados if x and re.search(r"[A-Za-zÁÉÍÓÚáéíóúñ]{3}", x)]


# Cadenas de TS que acaban en pantalla: cualquier literal de dos o más palabras (los identificadores, rutas y claves
# internas son de una sola «palabra»). Los comentarios se quitan antes. (_CADENA, arriba.)


def _cadenas_ts(codigo: str) -> list[str]:
    codigo = re.sub(r"/\*.*?\*/", " ", codigo, flags=re.S)
    codigo = re.sub(r"(?m)^\s*//.*$|(?<=[;,{}()\s])//[^'`\n]*$", " ", codigo)
    res = []
    for a, b in _CADENA.findall(codigo):
        cadena = re.sub(r"\$\{[^}]*\}", " ", a or b).strip()
        if len(cadena.split()) >= 2 and not cadena.startswith(("/api", "http", "@", "./", "../")):
            res.append(cadena)
    return res


def textos(archivo: Path) -> list[str]:
    codigo = archivo.read_text(encoding="utf-8")
    if archivo.suffix == ".html":
        return _textos_plantilla(codigo)
    res = []
    for m in re.finditer(r"template:\s*`", codigo):
        fin = codigo.index("`", m.end())
        while codigo[fin - 1] == "\\":
            fin = codigo.index("`", fin + 1)
        res += _textos_plantilla(codigo[m.end():fin])
    sin_plantillas = re.sub(r"template:\s*`.*?(?<!\\)`", "", codigo, flags=re.S)
    sin_plantillas = re.sub(r"styles:\s*`.*?(?<!\\)`", "", sin_plantillas, flags=re.S)
    res += _cadenas_ts(sin_plantillas)
    return res


def archivos() -> list[Path]:
    return sorted(p for p in APP.rglob("*") if p.suffix in (".ts", ".html") and not p.name.endswith(".spec.ts"))

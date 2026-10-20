"""Diario de cada vídeo: qué ha pasado y por qué, para acompañar al usuario (decisiones, cambios y trabajo de Claude).

Una línea JSON por suceso en `<vídeo>/diario.jsonl` (texto, se guarda con el resto del vídeo). Dos fuentes:
- Las acciones del usuario en la UI (aprobar, elegir, pedir cambios, pasar de fase): las registran las rutas.
- Cada turno de Claude (encargo de la UI o mensaje del chat): `chat.py` toma una instantánea de los documentos del vídeo
  antes y después y guarda qué archivos cambiaron, con un resumen legible (p. ej. «Avisos: se quitaron 7») y el diff."""

import difflib
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path

NOMBRE = "diario.jsonl"
SUFIJOS = (".md", ".json", ".srt")
# Archivos que cambian solos o son ruido: no cuentan como «cambio de Claude».
IGNORAR = {"estado.json", "diario.jsonl", "propuestas_medidas.json", "revision_imagenes.json", "revision_propuestas.json",
           "motores.json", "entonacion.json"}
MAX_ARCHIVO = 1_500_000
MAX_DIFF = 7000
MAX_ARCHIVOS = 8


def _ahora():
    return datetime.now().isoformat(timespec="seconds")


def instantanea(carpeta: Path) -> dict[str, str]:
    """{nombre: texto} de los documentos de la carpeta del vídeo (sin subcarpetas ni ruido)."""
    res = {}
    try:
        for p in carpeta.iterdir():
            if p.is_file() and p.suffix in SUFIJOS and p.name not in IGNORAR and p.stat().st_size <= MAX_ARCHIVO:
                try:
                    res[p.name] = p.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError):
                    continue
    except OSError:
        pass
    return res


def _corto(texto, n=110):
    t = " ".join(str(texto).split())
    return t if len(t) <= n else t[:n - 1] + "…"


def _texto_item(x):
    if isinstance(x, dict):
        return _corto(x.get("texto") or x.get("titulo") or x.get("nombre") or json.dumps(x, ensure_ascii=False))
    return _corto(x)


def _resumen_json(antes: dict, despues: dict) -> list[str]:
    """Resumen legible de lo que cambió entre dos JSON: listas (qué se quitó y qué se añadió) y valores sueltos."""
    lineas, sueltos = [], []
    for k in list(dict.fromkeys(list(antes) + list(despues))):
        a, d = antes.get(k), despues.get(k)
        if a == d:
            continue
        nombre = k.replace("_", " ").capitalize()
        if k == "escenas" and isinstance(a, list) and isinstance(d, list):
            cambiadas = [i for i, (x, y) in enumerate(zip(a, d), 1) if x != y]
            extra = len(d) - len(a)
            txt = f"{len(cambiadas)} escena(s) modificada(s)" + (f", {abs(extra)} {'añadida(s)' if extra > 0 else 'quitada(s)'}" if extra else "")
            lineas.append(f"Escenas: {txt}" + (f" (la {', la '.join(map(str, cambiadas[:6]))}{'…' if len(cambiadas) > 6 else ''})" if cambiadas else ""))
        elif isinstance(a, list) and isinstance(d, list):
            ta, td = [_texto_item(x) for x in a], [_texto_item(x) for x in d]
            quitados = [x for x in ta if x not in td]
            nuevos = [x for x in td if x not in ta]
            partes = []
            if quitados:
                partes.append(f"se quitaron {len(quitados)}: " + "; ".join(quitados[:3]) + ("…" if len(quitados) > 3 else ""))
            if nuevos:
                partes.append(f"se añadieron {len(nuevos)}: " + "; ".join(nuevos[:3]) + ("…" if len(nuevos) > 3 else ""))
            lineas.append(f"{nombre}: " + (" · ".join(partes) or "cambió el orden"))
        elif isinstance(a, (str, int, float, bool)) or a is None:
            if isinstance(d, (str, int, float, bool)) or d is None:
                sueltos.append(f"{nombre}: «{_corto(a, 60)}» → «{_corto(d, 60)}»")
            else:
                sueltos.append(f"{nombre}: cambió")
        else:
            sueltos.append(f"{nombre}: cambió")
    return lineas + sueltos          # primero lo que se quitó o añadió en listas (avisos, escenas…), luego los valores sueltos


def _cambio(nombre: str, antes: str | None, despues: str | None) -> dict:
    tipo = "creado" if antes is None else "borrado" if despues is None else "modificado"
    if nombre.endswith(".json"):                 # un JSON en una sola línea no se puede comparar: se compara en bonito
        def bonito(t):
            try:
                return json.dumps(json.loads(t), ensure_ascii=False, indent=2) if t is not None else None
            except ValueError:
                return t
        antes_d, despues_d = bonito(antes), bonito(despues)
    else:
        antes_d, despues_d = antes, despues
    diff = list(difflib.unified_diff((antes_d or "").splitlines(), (despues_d or "").splitlines(), "antes", "ahora", lineterm="", n=1))
    mas = sum(1 for l in diff if l.startswith("+") and not l.startswith("+++"))
    menos = sum(1 for l in diff if l.startswith("-") and not l.startswith("---"))
    resumen = []
    if nombre.endswith(".json") and antes is not None and despues is not None:
        try:
            resumen = _resumen_json(json.loads(antes), json.loads(despues))
        except (ValueError, AttributeError):
            resumen = []
    if not resumen:
        resumen = [{"creado": f"Archivo nuevo ({mas} líneas)", "borrado": "Archivo borrado",
                    "modificado": f"{mas} líneas añadidas, {menos} quitadas"}[tipo]]
    texto = "\n".join(diff)
    return {"archivo": nombre, "tipo": tipo, "mas": mas, "menos": menos, "resumen": resumen[:8],
            "diff": texto[:MAX_DIFF] + ("\n… (recortado)" if len(texto) > MAX_DIFF else "")}


def diferencias(antes: dict[str, str], despues: dict[str, str]) -> list[dict]:
    cambios = []
    for nombre in sorted(set(antes) | set(despues)):
        a, d = antes.get(nombre), despues.get(nombre)
        if a != d:
            cambios.append(_cambio(nombre, a, d))
    return cambios[:MAX_ARCHIVOS]


def registrar(carpeta: Path, quien: str, tipo: str, titulo: str, detalle: str | None = None, fase: str | None = None,
              **extra):
    """Añade un suceso al diario del vídeo. Nunca debe romper la acción que lo origina."""
    entrada = {"id": uuid.uuid4().hex[:10], "fecha": _ahora(), "quien": quien, "tipo": tipo, "titulo": titulo,
               "detalle": detalle, "fase": fase, **{k: v for k, v in extra.items() if v not in (None, [], "")}}
    if os.getenv("CANALYT_DIARIO") == "0":      # las pruebas no escriben en carpetas de vídeos reales
        return entrada
    try:
        with (carpeta / NOMBRE).open("a", encoding="utf-8") as f:
            f.write(json.dumps({k: v for k, v in entrada.items() if v is not None}, ensure_ascii=False) + "\n")
    except OSError:
        pass
    return entrada


def leer(carpeta: Path, limite: int = 60) -> list[dict]:
    """Los sucesos más recientes primero."""
    try:
        lineas = (carpeta / NOMBRE).read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    salida = []
    for l in reversed(lineas):
        try:
            salida.append(json.loads(l))
        except ValueError:
            continue
        if len(salida) >= limite:
            break
    return salida


_TRAMO = re.compile(r"tramo «([^»]+)»")
_PIDE = re.compile(r"pide(?:n)? (?:estos )?cambios[^:]*: «(.+?)»\s*$|pedido cambios[^:]*: «(.+?)»", re.S)


def registrar_turno(carpeta: Path, pedido: str, antes: dict, fase: str | None, resumen: str | None, estado: str,
                    cancelado: bool, segundos: int):
    """Un turno de Claude terminado: qué se le pidió, qué dijo y qué archivos cambiaron."""
    cambios = diferencias(antes, instantanea(carpeta))
    tramo = _TRAMO.search(pedido or "")
    if (pedido or "").startswith("MODO UI") and tramo:
        titulo = f"Claude trabajó en «{tramo.group(1)}»"
        m = re.search(r"cambios[^«\n]*«(.+?)»", pedido, re.S)
        usuario = _corto(m.group(1), 400) if m else None
    elif (pedido or "").startswith("/nuevo-"):
        titulo, usuario = "Claude siguió con la producción", None
    else:
        titulo, usuario = "Claude respondió a tu mensaje", _corto(pedido, 400)
    if cancelado:
        titulo += " (parado por ti)"
    elif estado == "error":
        titulo = "Claude no pudo terminar: " + titulo[0].lower() + titulo[1:]
    return registrar(carpeta, "claude", "claude", titulo, _corto(resumen, 900) if resumen else None, fase,
                     pedido=usuario, cambios=cambios, segundos=segundos, error=True if estado == "error" else None)


def anotar(video, quien: str, tipo: str, titulo: str, detalle: str | None = None, **extra):
    """Registra un suceso de un vídeo (modelos.Video) en su diario, con su fase actual."""
    from .sincronizar import carpeta_video
    carpeta = carpeta_video(video)
    try:
        estado = json.loads((carpeta / "estado.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        estado = {}
    return registrar(carpeta, quien, tipo, titulo, detalle, estado.get("fase"), **extra)

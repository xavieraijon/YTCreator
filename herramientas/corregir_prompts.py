"""Corrige con Claude los prompts de las imágenes marcadas como mal (modo revisión de la UI).

Uso:
    .venv/bin/python herramientas/corregir_prompts.py <canal>/videos/NNN-slug/guion.json --ids 14-5,15-1,16-2

Claude actúa como el director de arte (lee su oficio, la ficha del canal y el brief del vídeo), MIRA cada
imagen y escribe un prompt corregido con el motivo que dejó el usuario (`revision_imagenes.json`), y el
servicio que recomienda (klein o ai33). No toca guion.json: deja las propuestas en
`<vídeo>/revision_propuestas.json`, que la UI enseña para aceptarlas, editarlas o descartarlas.

Por qué así (2026-10-01): en la UI era una petición atada a la ventana (al cerrarla se perdía) y con 20
imágenes tardaba muchísimo (una sola conversación, imagen tras imagen). Ahora es una tarea con su barra, el
resultado queda en un archivo, y las imágenes van en grupos seguidos de 5 (las vecinas, juntas: coherentes
entre sí) con 3 grupos a la vez.

Usa el CLI `claude -p` con la sesión de claude.ai (suscripción, sin API de pago) y SOLO herramientas de
lectura. CANALYT_CLAUDE cambia el ejecutable (pruebas)."""

import argparse
import asyncio
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402
import motor_ia  # noqa: E402

RAIZ = canal.RAIZ
POR_GRUPO = 5
A_LA_VEZ = 3
TIEMPO_MAXIMO = 900
LECTURA = ["Read", "Glob", "Grep"]
PROHIBIDAS = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Agent"]
MARCAS = re.compile(r"\{[^}]*\}|\[[^\]]*\]")
IDS = re.compile(r"^\d{2}-\d+(,\d{2}-\d+)*$")


def ejecutable():
    return motor_ia.ejecutable()


def imagenes_del_guion(guion):
    """{EE-N: (spec, texto de la voz de su tramo)}."""
    salida = {}
    for n, e in enumerate(guion["escenas"], 1):
        specs = e.get("imagenes") or ([e] if any(k in e for k in ("prompt", "imagen", "video", "reutilizar")) else [])
        tramos = (e.get("texto") or "").split("{img}")
        for k, spec in enumerate(specs, 1):
            texto = " ".join(MARCAS.sub(" ", tramos[k - 1] if k <= len(tramos) else "").split())
            salida[f"{n:02d}-{k}"] = (spec, texto)
    return salida


def encargo(carpeta_canal, carpeta_video, lista):
    base = carpeta_canal.relative_to(RAIZ)
    video = carpeta_video.relative_to(RAIZ)
    lecturas = ["`.claude/agents/director-arte.md` (secciones «Cómo se construye un prompt», «Lo que sabemos del "
                "modelo», «Reglas generales» y «Revisar las imágenes»)"]
    if (carpeta_canal / "equipo" / "director-arte.md").exists():
        lecturas.append(f"la ficha `{base}/equipo/director-arte.md`")
    if (carpeta_video / "brief_visual.md").exists():
        lecturas.append(f"`{video}/brief_visual.md`")
    partes = "\n\n".join(
        f"### {i['ident']} (se genera con {i['motor']})\n- Motivo del usuario: «{i['motivo']}»\n"
        f"- Lo que dice la voz: «{i['texto']}»\n- Imagen actual: `{video}/img/{i['ident']}.png`\n"
        f"- Prompt actual:\n{i['prompt']}" for i in lista)
    return f"""Actúa como el director de arte del canal. Lee primero {", ".join(lecturas)}.

El usuario ha revisado el vídeo `{video}/` y ha marcado como MAL estas {len(lista)} imágenes. Mira CADA imagen
actual para ver exactamente qué ha salido mal y por qué (a menudo el prompt se contradice o pide más de lo que el
modelo sabe dibujar) y escribe para cada una un prompt corregido con el método del director de arte: concreto, en
inglés, que siga contando lo que dice la voz, con los {{personajes}} tal cual. Si varias comparten un objeto o
personaje (una diligencia, un médico), descríbelo IGUAL en todas para que salgan coherentes. Recomienda el
servicio de cada una: klein (gratis; flojo contando cosas, con manos, personas y personajes repetidos) o ai33
(Nano Banana 2, de pago; bueno en todo eso). No escribas ni cambies ningún archivo.

{partes}

Responde SOLO con un objeto JSON, sin texto alrededor ni bloque de código, con una entrada por imagen:
{{"imagenes": {{"<EE-N>": {{"prompt": "<prompt corregido>", "explicacion": "<castellano, 1-2 frases>", "servicio": "klein" o "ai33"}}}}}}"""


def extraer(texto):
    m = re.search(r"\{.*\}", texto or "", re.S)
    try:
        datos = json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        datos = None
    if not isinstance(datos, dict) or not isinstance(datos.get("imagenes"), dict):
        return {}
    salida = {}
    for ident, d in datos["imagenes"].items():
        prompt = " ".join(str((d or {}).get("prompt") or "").split())
        if prompt:
            salida[ident] = {"prompt": prompt, "explicacion": str(d.get("explicacion") or "").strip(),
                             "servicio": d.get("servicio") if d.get("servicio") in ("klein", "ai33") else None}
    return salida


class Avance:
    """Barra de la UI: una imagen cuenta al terminar su grupo; mientras, la etapa dice cuál está mirando."""

    def __init__(self, total):
        self.total, self.hechas = total, 0

    def mirando(self, ident):
        canal.progreso(self.hechas, self.total, f"Claude mirando {ident}")

    def grupo_hecho(self, n, idents):
        self.hechas += n
        canal.progreso(self.hechas, self.total, "Corregidas: " + ", ".join(idents))


async def corregir_grupo(lista, carpeta_canal, carpeta_video, avance, limite):
    async with limite:
        idents = [i["ident"] for i in lista]
        print(f"  grupo {idents[0]}…{idents[-1]}: Claude mirando {len(lista)} imágenes", flush=True)
        orden = motor_ia.preparar("revision", encargo(carpeta_canal, carpeta_video, lista), salida="stream-json",
                                  extra=["--verbose"], permitidas=LECTURA, vetadas=PROHIBIDAS)
        proceso = await asyncio.create_subprocess_exec(
            *orden.args, cwd=RAIZ, env=orden.env, stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE, limit=16 * 1024 * 1024)
        resultado, error = "", ""
        try:
            async def leer():
                nonlocal resultado, error
                async for linea in proceso.stdout:
                    try:
                        ev = json.loads(linea)
                    except json.JSONDecodeError:
                        continue
                    if ev.get("type") == "assistant":
                        for c in (ev.get("message") or {}).get("content") or []:
                            ruta = str((c.get("input") or {}).get("file_path") or "") if c.get("type") == "tool_use" else ""
                            m = re.search(r"/img/(\d{2}-\d+)\.png$", ruta)
                            if m:
                                avance.mirando(m.group(1))
                    elif ev.get("type") == "result":
                        resultado = ev.get("result") or ""
                        if ev.get("is_error"):
                            error = str(ev.get("result"))[:300]
            await asyncio.wait_for(leer(), timeout=TIEMPO_MAXIMO)
            await proceso.wait()
        except asyncio.TimeoutError:
            proceso.kill()
            error = f"más de {TIEMPO_MAXIMO // 60} min sin terminar"
        if error:
            exc = motor_ia.clasificar(error)
            motor_ia.anotar(exc.estado if exc else "error", error, "revision")
            if exc:
                error = motor_ia.describir(exc)[:300]
        else:
            motor_ia.anotar("ok", "", "revision")
        propuestas = {} if error else extraer(resultado)
        faltan = [i for i in idents if i not in propuestas]
        avance.grupo_hecho(len(idents), idents)
        if error or faltan:
            print(f"  AVISO grupo {idents[0]}…{idents[-1]}: " + (error or f"sin propuesta para {', '.join(faltan)}"),
                  flush=True)
        else:
            print(f"  grupo {idents[0]}…{idents[-1]}: {len(propuestas)} prompts corregidos", flush=True)
        return propuestas


async def principal(guion_ruta, ids):
    carpeta_video = guion_ruta.parent
    carpeta_canal = carpeta_video.parent.parent
    _, guion = canal.leer_guion(guion_ruta)
    try:
        marcas = json.loads((carpeta_video / "revision_imagenes.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        marcas = {}
    todas = imagenes_del_guion(guion)
    lista = []
    for ident in ids:
        spec, texto = todas.get(ident, (None, ""))
        if not spec or "prompt" not in spec:
            sys.exit(f"ERROR: {ident} no se genera con un prompt")
        motivo = (marcas.get(ident) or {}).get("motivo")
        if not motivo:
            sys.exit(f"ERROR: {ident} no está marcada como mal con un motivo")
        lista.append({"ident": ident, "prompt": spec["prompt"], "motivo": motivo, "texto": texto,
                      "motor": "ai33" if spec.get("motor") == "ai33" else "klein"})
    lista.sort(key=lambda i: tuple(int(x) for x in i["ident"].split("-")))
    grupos = [lista[k:k + POR_GRUPO] for k in range(0, len(lista), POR_GRUPO)]
    avance = Avance(len(lista))
    canal.progreso(0, len(lista), f"Claude corrigiendo {len(lista)} prompts en {len(grupos)} grupos")
    inicio = time.time()
    limite = asyncio.Semaphore(A_LA_VEZ)
    resultados = await asyncio.gather(*(corregir_grupo(g, carpeta_canal, carpeta_video, avance, limite)
                                        for g in grupos))
    propuestas = {k: v for r in resultados for k, v in r.items()}
    # Se guardan junto al prompt del que parten: si el prompt cambia después, la propuesta queda vieja.
    archivo = carpeta_video / "revision_propuestas.json"
    guardadas = archivos.leer_json(archivo)      # dañado → ArchivoDanado: nunca se pisan propuestas que no se leen
    fecha = time.strftime("%Y-%m-%dT%H:%M:%S")
    base = {i["ident"]: i["prompt"] for i in lista}
    for ident, p in propuestas.items():
        if ident in base:
            guardadas[ident] = {**p, "prompt_base": base[ident], "fecha": fecha}
    archivos.escribir_json(archivo, guardadas)
    canal.progreso(len(lista), len(lista), "Hecho")
    print(f"OK: {len(propuestas)} de {len(lista)} prompts corregidos en {time.time() - inicio:.0f} s "
          f"→ {archivo.relative_to(RAIZ)}")
    if len(propuestas) < len(lista):
        sys.exit(1)


def main():
    p = argparse.ArgumentParser(description="Corrige con Claude los prompts de las imágenes marcadas como mal")
    p.add_argument("guion")
    p.add_argument("--ids", required=True, help="Imágenes EE-N separadas por comas")
    a = p.parse_args()
    ids = a.ids.replace(" ", "")
    if not IDS.match(ids):
        sys.exit("ERROR: --ids con el formato EE-N separados por comas (p. ej. 14-5,15-1)")
    try:
        asyncio.run(principal(canal.ruta(a.guion), list(dict.fromkeys(ids.split(",")))))
    except archivos.ArchivoDanado as e:
        sys.exit(f"ERROR: {e}")


if __name__ == "__main__":
    main()

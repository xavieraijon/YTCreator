"""Música de fondo de pago con Suno (por ai33.pro) para un vídeo: un encargo por ambiente (misterio, tranquilo,
alegre…), dos versiones por encargo, se elige una y montar.py la usa en vez de la música propia del canal.

- DE PAGO: 3.600 créditos por encargo (= 2 versiones de ~3 min; medido el 02/10/2026 ≈ 1,6 céntimos).
  No gasta sin --gastar-ai33; --previsto da el coste gratis. Tarda segundos (no tiene la cola de las imágenes).
- Las versiones se guardan igualadas a −18 LUFS (como recursos/musica/*.wav): Suno sale 3-4 dB más fuerte y,
  sin igualar, taparía la voz con el volumen de música validado (0,18).
- Archivos en <vídeo>/musica/: <ambiente>_v1.mp3, <ambiente>_v2.mp3, la elegida como <ambiente>.mp3 y
  musica.json (prompt, tarea, coste, versiones y cuál se eligió). montar.py busca primero <vídeo>/musica/<ambiente>.mp3.
- Licencia: revisar los derechos comerciales de Suno y Content ID antes de publicar (recursos/LICENCIAS.md).

Prompts: el del vídeo (musica.json o --prompt) o, si no, el del canal: canal.json → "musica_ai33" → "prompts"
→ <ambiente>, con "base" delante (lo común: instrumental para narración, sin voces, dinámica estable).

    .venv/bin/python herramientas/musica_ai33.py videos/001-x/guion.json --estado
    .venv/bin/python herramientas/musica_ai33.py videos/001-x/guion.json --previsto tranquilo alegre
    .venv/bin/python herramientas/musica_ai33.py videos/001-x/guion.json --encargar tranquilo --gastar-ai33 [--prompt "…"]
    .venv/bin/python herramientas/musica_ai33.py videos/001-x/guion.json --elegir tranquilo 1   (0 = volver a la propia)
    .venv/bin/python herramientas/musica_ai33.py videos/001-x/guion.json --guardar-prompt tranquilo "…"   ("" = el del canal)
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402
import simulacion  # noqa: E402
import proveedores  # noqa: E402
import uso  # noqa: E402
from imagen_ai33 import BASE, cabeceras  # noqa: E402

CREDITOS_POR_ENCARGO = proveedores.valor("ai33.creditos_por_encargo_musica")
LUFS = -18
MAX_PROMPT = proveedores.valor("suno.max_prompt")


def miles(n):
    return f"{n:,}".replace(",", ".")
BASE_PROMPT = ("Instrumental underscore for a documentary narration. No vocals, no drum kit, no build-ups or drops, "
               "steady dynamics so a narrator's voice sits clearly on top, loop-friendly ending. ")


def config():
    return {"creditos_por_encargo": CREDITOS_POR_ENCARGO, "base": BASE_PROMPT, "prompts": {},
            **(canal.config().get("musica_ai33") or {})}


def ambientes_del_guion(guion):
    """Ambientes que usa el guion, en orden de aparición, con las escenas de cada uno."""
    actual, salida = guion.get("musica"), {}
    for i, escena in enumerate(guion["escenas"], 1):
        actual = escena.get("musica", actual)
        if actual and actual != "ninguna" and "/" not in actual:
            salida.setdefault(actual, []).append(i)
    return salida


def leer_estado(carpeta):
    """Estricto (archivos.leer_json): guarda lo pagado (tareas de Suno, versiones). Dañado → ArchivoDanado, sin tocarlo."""
    return archivos.leer_json(carpeta / "musica" / "musica.json")


def guardar_estado(carpeta, datos):
    (carpeta / "musica").mkdir(exist_ok=True)
    ruta = carpeta / "musica" / "musica.json"
    archivos.escribir_json(ruta, datos)


def prompt_de(carpeta, ambiente, cfg):
    """Prompt completo que se mandaría: el del vídeo si lo hay; si no, base del canal + el del ambiente."""
    propio = (leer_estado(carpeta).get(ambiente) or {}).get("prompt")
    if propio:
        return propio
    especifico = cfg["prompts"].get(ambiente) or f"Mood: {ambiente}."
    return (cfg["base"] + especifico).strip()


def estado(guion, carpeta):
    cfg, datos = config(), leer_estado(carpeta)
    salida = []
    for ambiente, escenas in ambientes_del_guion(guion).items():
        d = datos.get(ambiente) or {}
        propia = canal.recurso("musica", f"{ambiente}.wav")
        salida.append({
            "ambiente": ambiente, "escenas": escenas, "prompt": prompt_de(carpeta, ambiente, cfg),
            "prompt_propio": bool(d.get("prompt")),
            "propia": str(propia.relative_to(canal.RAIZ)) if propia.exists() else None,
            "versiones": [v for v in d.get("versiones", []) if (carpeta / v["archivo"]).exists()],
            "elegida": d.get("elegida"), "fecha": d.get("fecha"), "creditos": d.get("creditos"),
        })
    return {"creditos_por_encargo": cfg["creditos_por_encargo"], "ambientes": salida}


def igualar(origen, destino):
    """Copia a −18 LUFS (dos pasadas no hacen falta: es una pista de música continua) en mp3 de 256 kb/s."""
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(origen), "-af",
                    f"loudnorm=I={LUFS}:TP=-2:LRA=11", "-ar", "48000", "-b:a", "256k", str(destino)], check=True)


def duracion(archivo):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                        str(archivo)], capture_output=True, text=True)
    try:
        return round(float(r.stdout.strip()), 1)
    except ValueError:
        return None


def encargar(guion, carpeta, ambiente, prompt=None):
    """Un encargo a Suno (instrumental, modo simple): baja e iguala las 2 versiones. Devuelve créditos cobrados."""
    cfg = config()
    if ambiente not in ambientes_del_guion(guion):
        sys.exit(f"ERROR: el guion no usa el ambiente «{ambiente}»")
    datos = leer_estado(carpeta)
    entrada = datos.setdefault(ambiente, {})
    if prompt:
        entrada["prompt"] = " ".join(prompt.split())
        guardar_estado(carpeta, datos)
    texto = prompt_de(carpeta, ambiente, cfg)
    if len(texto) > MAX_PROMPT:
        sys.exit(f"ERROR: el prompt de «{ambiente}» tiene {len(texto)} caracteres (Suno admite {MAX_PROMPT})")
    if simulacion.activa():            # modo sin gasto: dos versiones sintetizadas por el kit, sin red
        return _encargo_falso(carpeta, ambiente)
    simulacion.exigir_pago_permitido("ai33 (música de Suno)")
    H = {**cabeceras(), "Content-Type": "application/json"}
    canal.progreso(etapa=f"Encargando «{ambiente}» a Suno")
    print(f"  {ambiente}: encargo a Suno (≈ {miles(cfg['creditos_por_encargo'])} créditos)…", flush=True)
    try:
        resp = requests.post(f"{BASE}/v1s/task/music-generation", headers=H, timeout=120, json={
            "create_mode": "simple", "gpt_description_prompt": texto, "make_instrumental": True})
    except requests.ReadTimeout:
        sys.exit(f"ERROR: se mandó el encargo de «{ambiente}» y ai33 no ha contestado; puede haberse cobrado. Míralo en la web de ai33 antes de repetirlo.")
    except requests.RequestException as e:
        sys.exit(f"ERROR: no se pudo conectar con ai33 ({e}); no se ha encargado nada. Mira tu conexión y repite.")
    try:
        r = resp.json()
    except ValueError:
        r = {}
    if r.get("success") and not r.get("task_id"):
        sys.exit(f"ERROR: ai33 ha aceptado el encargo de «{ambiente}» pero no ha devuelto su número; puede haberse cobrado. Míralo en la web de ai33 antes de repetirlo.")
    if not r.get("success"):
        sys.exit(f"ERROR: ai33 no aceptó el encargo ({resp.status_code}): {resp.text[:200]}")
    tarea = r["task_id"]
    entrada.update(tarea=tarea, fecha=datetime.now().isoformat(timespec="seconds"), prompt_enviado=texto)
    guardar_estado(carpeta, datos)          # si se corta aquí, la tarea queda apuntada (no se vuelve a pagar)
    return recoger(carpeta, ambiente, tarea, H)


def _encargo_falso(carpeta, ambiente):
    import gen_musica
    destino = carpeta / "musica"
    destino.mkdir(exist_ok=True)
    estilo = ambiente if ambiente in gen_musica.AMBIENTES else next(iter(gen_musica.AMBIENTES))
    versiones = []
    with tempfile.TemporaryDirectory() as tmp:
        for n in (1, 2):
            final = destino / f"{ambiente}_v{n}.mp3"
            simulacion.proteger(final)
            wav = gen_musica.guardar(gen_musica.componer(estilo, 100 + n), Path(tmp) / f"{n}.wav")
            igualar(wav, final)
            simulacion.marca(final).write_text("simulada\n")
            versiones.append({"n": n, "archivo": str(final.relative_to(carpeta)), "duracion": duracion(final)})
    datos = leer_estado(carpeta)
    entrada = datos.setdefault(ambiente, {})
    entrada.update(versiones=versiones, creditos=0, simulada=True, fecha=datetime.now().isoformat(timespec="seconds"))
    entrada["elegida"] = None
    guardar_estado(carpeta, datos)
    print(f"  {ambiente}: 2 versiones SIMULADAS (modo sin gasto, 0 créditos)", flush=True)
    return 0


def _bajar(url, tarea) -> bytes:
    """El audio de una versión (3 intentos: su CDN es lenta). Si no se puede, sale con la forma de recogerla sin pagar."""
    for intento in range(1, 4):
        try:
            r = requests.get(url, timeout=180)
            r.raise_for_status()
            return r.content
        except (requests.RequestException, TypeError) as e:
            if intento == 3:
                sys.exit(f"ERROR: no se pudo bajar la música ya pagada ({e}). Está hecha: vuelve a lanzar --recoger "
                         f"(tarea {tarea}) para bajarla sin volver a pagar.")
            time.sleep(5)
    return b""


def recoger(carpeta, ambiente, tarea, H=None):
    H = H or {**cabeceras(), "Content-Type": "application/json"}
    inicio = time.time()
    while True:
        try:
            d = requests.get(f"{BASE}/v1/task/{tarea}", headers=H, timeout=60).json()
        except (requests.RequestException, ValueError):
            d = {}                                  # un corte al consultar no pierde el encargo: se sigue esperando
        if time.time() - inicio > 1800:
            sys.exit(f"ERROR: «{ambiente}» lleva 30 min sin terminar (tarea {tarea}); vuelve a lanzar --recoger")
        if not d:
            time.sleep(10)
            continue
        if d.get("status") == "done":
            break
        if d.get("status") in ("error", "failed"):
            sys.exit(f"ERROR: Suno falló con «{ambiente}»: {d.get('error_message')}")
        canal.progreso(etapa=f"Suno compone «{ambiente}» ({d.get('progress', 0)} %)")
        time.sleep(10)
    meta = d.get("metadata") or {}
    clips = (meta.get("suno_result") or {}).get("clips") or [{"audio_url": u} for u in meta.get("all_audio_urls", [])]
    destino = carpeta / "musica"
    destino.mkdir(exist_ok=True)
    versiones = []
    with tempfile.TemporaryDirectory() as tmp:
        for n, clip in enumerate(clips, 1):
            canal.progreso(n, len(clips), f"Bajando e igualando la versión {n}")
            crudo = Path(tmp) / f"{n}.mp3"
            crudo.write_bytes(_bajar(clip.get("audio_url"), tarea))
            final = destino / f"{ambiente}_v{n}.mp3"
            igualar(crudo, final)
            versiones.append({"n": n, "archivo": str(final.relative_to(carpeta)), "duracion": duracion(final)})
    cobrado = int(d.get("credit_cost") or 0)
    datos = leer_estado(carpeta)
    entrada = datos.setdefault(ambiente, {})
    entrada.update(versiones=versiones, creditos=cobrado, estilo_suno=(clips[0].get("tags") if clips else None))
    if entrada.get("elegida"):                  # versiones nuevas: la elección anterior ya no vale
        entrada["elegida"] = None
        (destino / f"{ambiente}.mp3").unlink(missing_ok=True)
    guardar_estado(carpeta, datos)
    if cobrado:
        uso.registrar("ai33_musica", cobrado, f"{carpeta.name}/{ambiente}")
    print(f"  {ambiente}: {len(versiones)} versiones ({' y '.join(str(v['duracion']) + ' s' for v in versiones)}), "
          f"{miles(cobrado)} créditos cobrados", flush=True)
    return cobrado


def elegir(carpeta, ambiente, n):
    """n = número de versión; 0 = volver a la música propia del canal."""
    datos = leer_estado(carpeta)
    entrada = datos.get(ambiente) or {}
    elegida = carpeta / "musica" / f"{ambiente}.mp3"
    if n == 0:
        entrada["elegida"] = None
        elegida.unlink(missing_ok=True)
    else:
        v = next((v for v in entrada.get("versiones", []) if v["n"] == n), None)
        if not v or not (carpeta / v["archivo"]).exists():
            sys.exit(f"ERROR: «{ambiente}» no tiene versión {n}")
        shutil.copy2(carpeta / v["archivo"], elegida)
        entrada["elegida"] = n
    datos[ambiente] = entrada
    guardar_estado(carpeta, datos)
    print(f"  {ambiente}: " + (f"versión {n} de Suno" if n else "música propia del canal"))


def guardar_prompt(guion, carpeta, ambiente, texto):
    """Prompt propio del vídeo para ese ambiente («» = volver al del canal). No gasta nada."""
    if ambiente not in ambientes_del_guion(guion):
        sys.exit(f"ERROR: el guion no usa el ambiente «{ambiente}»")
    texto = " ".join((texto or "").split())
    if len(texto) > MAX_PROMPT:
        sys.exit(f"ERROR: el prompt tiene {len(texto)} caracteres (Suno admite {MAX_PROMPT})")
    datos = leer_estado(carpeta)
    entrada = datos.setdefault(ambiente, {})
    if texto:
        entrada["prompt"] = texto
    else:
        entrada.pop("prompt", None)
    guardar_estado(carpeta, datos)
    print(f"  {ambiente}: " + ("prompt propio del vídeo guardado" if texto else "vuelve al prompt del canal"))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("guion")
    p.add_argument("--estado", action="store_true", help="JSON con los ambientes, prompts y versiones (gratis)")
    p.add_argument("--previsto", nargs="*", metavar="AMBIENTE", help="coste de encargar esos ambientes (gratis)")
    p.add_argument("--encargar", nargs="+", metavar="AMBIENTE", help="DE PAGO: encarga esos ambientes a Suno")
    p.add_argument("--prompt", help="prompt para el ambiente que se encarga (se guarda para el vídeo)")
    p.add_argument("--gastar-ai33", action="store_true", help="permiso de gasto (preguntar antes)")
    p.add_argument("--recoger", nargs=2, metavar=("AMBIENTE", "TAREA"), help="recoge una tarea ya pagada")
    p.add_argument("--elegir", nargs=2, metavar=("AMBIENTE", "N"), help="elige la versión N (0 = la propia)")
    p.add_argument("--guardar-prompt", nargs=2, metavar=("AMBIENTE", "TEXTO"),
                   help="prompt propio del vídeo para ese ambiente (\"\" = el del canal); gratis")
    a = p.parse_args()
    ruta_guion, guion = canal.leer_guion(a.guion)
    carpeta = ruta_guion.parent
    if a.estado:
        print(json.dumps(estado(guion, carpeta), ensure_ascii=False, indent=2))
    elif a.previsto is not None:
        n = len(a.previsto) or len(ambientes_del_guion(guion))
        print(json.dumps({"encargos": n, "creditos": n * config()["creditos_por_encargo"]}))
    elif a.encargar:
        if not a.gastar_ai33:
            sys.exit("ERROR: --encargar necesita --gastar-ai33 (DE PAGO: preguntar antes)")
        if a.prompt and len(a.encargar) > 1:
            sys.exit("ERROR: --prompt va con un solo ambiente")
        total = 0
        for k, ambiente in enumerate(a.encargar, 1):
            canal.progreso(k - 1, len(a.encargar), f"Ambiente «{ambiente}»")
            total += encargar(guion, carpeta, ambiente, a.prompt)
        print(f"OK: {len(a.encargar)} {'encargo' if len(a.encargar) == 1 else 'encargos'}, {miles(total)} créditos cobrados")
    elif a.recoger:
        recoger(carpeta, a.recoger[0], a.recoger[1])
    elif a.elegir:
        elegir(carpeta, a.elegir[0], int(a.elegir[1]))
    elif a.guardar_prompt:
        guardar_prompt(guion, carpeta, *a.guardar_prompt)
    else:
        p.print_help()


if __name__ == "__main__":
    os.nice(5) if hasattr(os, "nice") else None
    try:
        main()
    except archivos.ArchivoDanado as e:        # musica.json dañado: se para sin tocarlo (guarda lo pagado)
        sys.exit(f"ERROR: {e}")

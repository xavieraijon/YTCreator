"""Imágenes de pago con ai33.pro (p. ej. Nano Banana 2) para las que FLUX.2 klein hace mal (personas de
cerca, manos, varias personas, camas…). Lo usa montar.py con las imágenes del guion que llevan
"motor": "ai33"; aquí no hay línea de comandos.

- DE PAGO (créditos de ai33). montar.py no gasta sin --gastar-ai33 y antes dice cuántas y el coste previsto.
- Lento: la cola de ai33 retiene las tareas (quietas al "15 %") de 7 min a más de 4 h (medido el 29/09/2026:
  la generación en sí es de segundos; es un revendedor con capacidad compartida). Admite como mucho 20
  tareas en cola por cuenta: se mandan hasta llenar la cola y las demás se van mandando al liberarse sitio.
  Conviene lanzar los lotes con antelación (de noche, mientras se hace el guion o la voz).
- Barato: 15 € = 3,3 M créditos → una imagen con referencia (1.720) ≈ 0,8 céntimos (Google directo:
  0,067 $ por imagen, ~7 veces más).
- NUNCA se cancela una tarea (ai33 no devuelve los créditos). Las tareas mandadas se apuntan en
  img/ai33_tareas.json: si montar.py se corta, la siguiente pasada recoge esas mismas tareas en vez de
  pagarlas otra vez.
- Referencias de estilo: 1-2 imágenes buenas del propio vídeo (guion → "ai33" → "referencias_estilo") para
  que no se note el salto entre motores. Con 1 referencia, Nano Banana 2 cuesta ≈ 1.720 créditos (medido
  el 29/09/2026; sin referencia ≈ 1.314). OJO: el "presented_credits" de /v1i/models es ≈ ⅓ del real.

Configuración (guion.json, o canal.json como valor por defecto):
    "ai33": {"modelo": "gemini-3.1-flash-image-preview", "resolucion": "1K",
             "referencias_estilo": ["videos/001-tema/img/07-5.png"], "creditos_por_imagen": 1720}
"""

import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
import archivos  # noqa: E402
import canal  # noqa: E402
import simulacion  # noqa: E402
import sistema  # noqa: E402
import espacio  # noqa: E402
import proveedores  # noqa: E402
import uso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
BASE = "https://api.ai33.pro"
MODELO = "gemini-3.1-flash-image-preview"          # Nano Banana 2
CREDITOS_POR_IMAGEN = proveedores.valor("ai33.creditos_por_imagen")    # con 1 referencia de estilo
ASPECTO = {"horizontal": "16:9", "vertical": "9:16", "cuadrado": "1:1"}
PREFIJO_ESTILO = ("Match exactly the illustration style of {refs}: same painterly editorial technique, same "
                  "paper grain texture, same limited palette, same chiaroscuro lighting. New scene: ")


class ErrorAi33(RuntimeError):
    """Fallo de configuración de ai33 (sin clave…). La librería lo lanza; solo la parte de terminal (lote) sale con
    sys.exit: el backend importa este módulo y un sys.exit dentro de una petición la tumbaría."""


def cabeceras():
    load_dotenv(espacio.ENV)
    clave = os.getenv("AI33_API_KEY", "").strip()
    if not clave:
        raise ErrorAi33("falta AI33_API_KEY en .env")
    return {"xi-api-key": clave}


def config(guion, cfg_canal):
    """La del guion sobre la del canal ("ai33" en los dos)."""
    return {"modelo": MODELO, "resolucion": "1K", "referencias_estilo": [], "creditos_por_imagen": CREDITOS_POR_IMAGEN,
            **(cfg_canal.get("ai33") or {}), **(guion.get("ai33") or {})}


def prompt_final(prompt, n_refs):
    if not n_refs:
        return prompt
    refs = " and ".join(f"@img{i}" for i in range(1, n_refs + 1))
    return PREFIJO_ESTILO.format(refs=refs) + prompt


def _registro(carpeta_img):
    return carpeta_img / "ai33_tareas.json"


def _leer_registro(carpeta_img):
    """Estricto (archivos.leer_json): es lo YA PAGADO. Si estuviera dañado y se diera por vacío, al guardar se perdería
    y esas imágenes se mandarían (y pagarían) otra vez: mejor parar con ArchivoDanado."""
    return archivos.leer_json(_registro(carpeta_img))


def _guardar_registro(carpeta_img, datos):
    # atómico: es el registro de lo YA PAGADO; si quedara a medias, se volverían a mandar (y pagar) esas imágenes
    archivos.escribir_json(_registro(carpeta_img), datos, indent=1, final_linea=False)


COLA_MAXIMA = proveedores.valor("ai33.cola_maxima")     # tareas activas por cuenta en ai33 (error 429 "active_task_limit")
EUROS_POR_CREDITO = proveedores.valor("ai33.euros_por_millon_creditos") / 1_000_000


def euros(creditos):
    return creditos * EUROS_POR_CREDITO


def tareas_apuntadas(carpeta_img):
    """Tareas mandadas y aún no recogidas (img/ai33_tareas.json): {ident: {tarea, estimado, mandada…}}. Solo para
    mostrar (la pantalla del vídeo): si está dañado, {} sin tocarlo (quien lo reescribe para con ArchivoDanado)."""
    try:
        return _leer_registro(carpeta_img)
    except archivos.ArchivoDanado:
        return {}


def consultar(tarea, H=None, timeout=20):
    """Estado de una tarea en ai33 (sin gastar): {"status", "progress", "credit_cost"} o {"status": "?"}."""
    try:
        d = requests.get(f"{BASE}/v1/task/{tarea}", headers=H or cabeceras(), timeout=timeout).json()
    except ErrorAi33 as e:
        return {"status": "?", "error_message": str(e)}
    except (requests.RequestException, ValueError):
        return {"status": "?"}
    return {k: d.get(k) for k in ("status", "progress", "credit_cost", "error_message")}


def _mandar(H, p, cfg, rutas_refs):
    """Manda una imagen. Devuelve la respuesta (dict), "cola_llena" o None si hubo otro error."""
    simulacion.exigir_pago_permitido("ai33 (imágenes)")
    datos = {"prompt": prompt_final(p["prompt"], len(rutas_refs)), "model_id": cfg["modelo"],
             "generations_count": "1",
             "model_parameters": json.dumps({"aspect_ratio": ASPECTO[p["formato"]], "resolution": cfg["resolucion"]})}
    ficheros = [("assets", (Path(r).name, open(r, "rb"), "image/png")) for r in rutas_refs]
    try:
        r = requests.post(f"{BASE}/v1i/task/generate-image", headers=H, data=datos, files=ficheros or None,
                          timeout=120)
    except requests.ReadTimeout:
        # Salió y no llegó respuesta: puede estar aceptada (y cobrada). Repetirla sola podría cobrarla dos veces.
        print(f"  ai33 {p['ident']}: ATENCIÓN: se mandó y no ha contestado; puede haberse cobrado. Míralo en la web de ai33 antes de repetirlo.", flush=True)
        return None
    except requests.RequestException as e:
        print(f"  ai33 {p['ident']}: no se pudo mandar ({e}); se reintentará", flush=True)
        return "cola_llena"
    finally:
        for _, (_, f, _) in ficheros:
            f.close()
    if r.status_code == 429 and "active_task_limit" in r.text:
        return "cola_llena"
    try:
        cuerpo = r.json()
    except ValueError:                  # una página de error (proxy, mantenimiento…) en vez de JSON
        cuerpo = None
    if not (r.ok and isinstance(cuerpo, dict) and cuerpo.get("success")):
        print(f"  ai33 {p['ident']}: ERROR al mandar: {r.status_code} {r.text[:200]}", flush=True)
        return None
    if not cuerpo.get("task_id"):
        # La ha aceptado (y puede haberla cobrado) pero sin número de encargo no se puede recoger: no se repite sola.
        if cuerpo.get("estimated_credits"):
            uso.registrar("ai33_imagen", cuerpo["estimated_credits"], p["salida"].name)
        print(f"  ai33 {p['ident']}: ATENCIÓN: ai33 la ha aceptado pero no ha devuelto su número de encargo; puede "
              "haberse cobrado. Mírala en la web de ai33 antes de volver a pedirla.", flush=True)
        return None
    return cuerpo


FIRMAS_IMAGEN = (b"\x89PNG", b"\xff\xd8\xff", b"RIFF")    # PNG, JPEG, WEBP (RIFF…WEBP)


def _recoger(d: dict) -> bytes | None:
    """La imagen de una tarea terminada, o None si la respuesta no la trae o lo descargado no es una imagen."""
    try:
        url = d["metadata"]["result_images"][0]["imageUrl"]
        contenido = requests.get(url, timeout=300).content
    except (KeyError, IndexError, TypeError, requests.RequestException):
        return None
    return contenido if contenido[:4].startswith(FIRMAS_IMAGEN) else None


INTENTOS_RECOGER = 3        # descargas fallidas de una imagen ya pagada antes de dejarla para la próxima pasada


def lote(peticiones, cfg, rutas_refs, carpeta_img, espera=15):
    """peticiones: [{"ident", "prompt", "salida" (Path), "formato", "firma"}]. Manda las que no tengan ya una
    tarea apuntada con la misma firma, espera todas y guarda cada imagen y su .firma.
    Devuelve (hechas, errores, créditos cobrados en esta pasada)."""
    if simulacion.activa():            # modo sin gasto: imágenes de relleno, sin red, sin firma (no cuentan como hechas)
        medidas = {"horizontal": (1344, 768), "vertical": (768, 1344), "cuadrado": (1024, 1024)}
        for p in peticiones:
            simulacion.imagen_falsa(p["prompt"], p["salida"], *medidas.get(p["formato"], medidas["horizontal"]))
            print(f"  imagen {p['ident']}: SIMULADA (modo sin gasto)", flush=True)
            canal.evento("imagen", ident=p["ident"], estado="simulada")
        return [p["ident"] for p in peticiones], [], 0
    try:
        H = cabeceras()
    except ErrorAi33 as e:
        sys.exit(f"ERROR: {e}")
    carpeta_img.mkdir(parents=True, exist_ok=True)
    candado = open(carpeta_img / "ai33.lock", "a")
    try:          # un solo lote de ai33 por vídeo a la vez (se liberará al salir del proceso)
        sistema.bloquear(candado, esperar=False)
    except BlockingIOError:
        sys.exit("ERROR: ya hay un lote de ai33 en marcha para este vídeo (img/ai33.lock); espera a que termine")
    registro = _leer_registro(carpeta_img)
    por_mandar = []
    for p in peticiones:
        previa = registro.get(p["ident"])
        if previa and previa.get("firma") == p["firma"]:
            print(f"  ai33 {p['ident']}: recojo la tarea ya pagada {previa['tarea'][:8]}…", flush=True)
        else:
            por_mandar.append(p)

    def mandar_las_que_quepan():
        while por_mandar and sum(1 for i in registro if i in pendientes) < COLA_MAXIMA:
            p = por_mandar[0]
            d = _mandar(H, p, cfg, rutas_refs)
            if d == "cola_llena":
                return
            por_mandar.pop(0)
            if d is None:
                errores.append(p["ident"])
                continue
            registro[p["ident"]] = {"tarea": d["task_id"], "firma": p["firma"], "salida": str(p["salida"]),
                                    "estimado": d.get("estimated_credits"), "mandada": time.time()}
            _guardar_registro(carpeta_img, registro)   # antes de esperar: si se corta, no se paga dos veces
            pendientes[p["ident"]] = p
            cobrado = d.get("estimated_credits") or 0      # ai33 cobra al aceptar la tarea, no al terminar
            gastado_envio.append(cobrado)
            uso.registrar("ai33_imagen", cobrado, p["salida"].name)
            print(f"  ai33 {p['ident']}: mandada ({cobrado} créditos cobrados)", flush=True)
        if por_mandar:
            print(f"  ai33: cola llena ({COLA_MAXIMA}); {len(por_mandar)} esperan turno", flush=True)

    pendientes = {p["ident"]: p for p in peticiones if p["ident"] in registro}
    hechas, errores, gastado_envio, fallos = [], [], [], {}
    inicio = time.time()
    mandar_las_que_quepan()
    while pendientes or por_mandar:
        if not pendientes:                 # la cola de ai33 estaba llena por tareas ajenas a este lote
            time.sleep(espera * 4)
            mandar_las_que_quepan()
            continue
        time.sleep(espera)
        for ident, p in list(pendientes.items()):
            tarea = registro[ident]["tarea"]
            try:
                d = requests.get(f"{BASE}/v1/task/{tarea}", headers=H, timeout=60).json()
            except (requests.RequestException, ValueError) as e:
                print(f"  aviso: no se pudo consultar {ident} ({e}); sigo esperando", flush=True)
                continue
            estado = d.get("status") if isinstance(d, dict) else None
            if estado == "done":
                imagen = _recoger(d)
                if imagen is None:
                    fallos[ident] = fallos.get(ident, 0) + 1
                    if fallos[ident] < INTENTOS_RECOGER:
                        print(f"  aviso: {ident} está hecha en ai33 pero no se ha podido descargar; lo reintento", flush=True)
                        continue
                    # Sigue apuntada en ai33_tareas.json: la próxima pasada la recoge sin volver a pagarla.
                    print(f"  ai33 {ident}: ERROR: hecha y pagada, pero no se ha podido descargar; queda apuntada para "
                          "recogerla en la próxima pasada (sin volver a pagarla)", flush=True)
                    errores.append(ident)
                    del pendientes[ident]
                    continue
                p["salida"].parent.mkdir(parents=True, exist_ok=True)
                parcial = p["salida"].with_name(p["salida"].name + ".part")
                parcial.write_bytes(imagen)
                parcial.replace(p["salida"])             # nunca una imagen a medias con su firma
                p["salida"].with_suffix(".firma").write_text(p["firma"])
                print(f"  imagen {ident}: generada (ai33, {int(time.time() - inicio)} s)", flush=True)
                canal.evento("imagen", ident=ident, estado="generada")
                hechas.append(ident)
            elif estado == "error":
                print(f"  ai33 {ident}: ERROR: {d.get('error_message')}", flush=True)
                errores.append(ident)
            else:
                continue
            del pendientes[ident]
            registro.pop(ident, None)
            _guardar_registro(carpeta_img, registro)
            mandar_las_que_quepan()           # ha quedado un hueco en la cola
        if pendientes and int(time.time() - inicio) % 300 < espera:
            print(f"  ai33: {len(pendientes)} en marcha ({int(time.time() - inicio) // 60} min)…", flush=True)
    return hechas, errores, sum(gastado_envio)     # lo cobrado en ESTA pasada (las recogidas se pagaron antes)

"""Pantalla web de progreso durante la instalación (pasos 3 a 11 de `instalar.sh` / `instalar.ps1`).

Para alguien que instala YTCreator por primera vez, una lista de texto en la terminal da miedo. En cuanto Python está
listo (paso 3) se abre ya el navegador en el puerto final de la aplicación (127.0.0.1:8765) con una página sencilla:
checklist de los 11 pasos y una barra de progreso, sin nada técnico. La página hace *polling* a un JSON de estado que
el instalador va actualizando con el subcomando `paso`; no hace falta FastAPI ni compilar nada.

Uso (desde `instalar.sh` / `instalar.ps1`, nunca a mano por la persona):

    .venv/bin/python herramientas/instalar_progreso.py iniciar [--desde 3]
        # arranca el servidor en segundo plano (pidfile en programas/instalar_progreso.pid), escribe el estado
        # inicial (los pasos anteriores a --desde, hechos; ese, en marcha) y abre el navegador en http://127.0.0.1:8765
    .venv/bin/python herramientas/instalar_progreso.py paso 4 ok "ffmpeg instalado"
        # actualiza el paso 4 ("pendiente" | "marcha" | "ok" | "aviso" | "error") con un texto opcional
    .venv/bin/python herramientas/instalar_progreso.py nota "Vuelve a la terminal: …"
        # recuadro destacado encima de la lista (lo que la persona tiene que hacer); sin texto, se quita
    .venv/bin/python herramientas/instalar_progreso.py listo
        # marca que ya se puede pasar a la aplicación real (la página se recarga sola)
    .venv/bin/python herramientas/instalar_progreso.py detener
        # para el servidor y libera el puerto 8765 antes de arrancar ui/arrancar.py

Todo lo que escribe queda en `programas/` del kit (ya fuera de git: `.gitignore` → `/programas/`).
"""

import json
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PROGRAMAS = RAIZ / "programas"
ESTADO = PROGRAMAS / "instalar_progreso.json"
PIDFILE = PROGRAMAS / "instalar_progreso.pid"
PUERTO = 8765

PASOS = [
    "Comprobar tu ordenador",
    "Descargar YTCreator",
    "Python (el lenguaje de YTCreator)",
    "ffmpeg (monta los vídeos)",
    "Node (prepara las pantallas)",
    "Las pantallas de la aplicación",
    "Tu carpeta de trabajo",
    "Claude (la IA que maneja YTCreator)",
    "Entrar con tu cuenta de Claude",
    "Probar que todo funciona",
    "Abrir YTCreator",
]
ESTADOS_VALIDOS = {"pendiente", "marcha", "ok", "aviso", "error"}


# --- Estado -----------------------------------------------------------------------------------------------------------

def _inicial(desde: int = 3) -> dict:
    def estado(n):
        return "ok" if n < desde else "marcha" if n == desde else "pendiente"
    pasos = [{"numero": i + 1, "titulo": t, "estado": estado(i + 1), "texto": ""} for i, t in enumerate(PASOS)]
    return {"pasos": pasos, "listo": False, "nota": ""}


def _leer() -> dict:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import archivos
    return archivos.leer_json(ESTADO, defecto=_inicial())


def _escribir(estado: dict) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import archivos
    PROGRAMAS.mkdir(parents=True, exist_ok=True)
    archivos.escribir_json(ESTADO, estado)


# --- Servidor -----------------------------------------------------------------------------------------------------------

_PAGINA = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instalando YTCreator</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 20px;
         background: #fff; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background: #16181c; color: #e8e8e8; } }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  p.sub { opacity: .7; margin-top: 0; }
  .barra { height: 10px; border-radius: 6px; background: #e3e3e8; overflow: hidden; margin: 24px 0; }
  @media (prefers-color-scheme: dark) { .barra { background: #2a2d33; } }
  .barra > div { height: 100%; background: #4a7dfc; transition: width .4s ease; }
  ul { list-style: none; padding: 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 1rem; }
  .icono { font-size: 1.1rem; width: 1.4rem; text-align: center; }
  .texto { opacity: .65; font-size: .85rem; margin-left: 2.2rem; }
  .marcha { font-weight: 600; }
  .nota { display: none; border-left: 4px solid #f2a33a; background: #fff6e8; padding: 12px 16px; border-radius: 6px;
          margin: 16px 0; line-height: 1.45; }
  @media (prefers-color-scheme: dark) { .nota { background: #3a2f1e; } }
</style>
</head>
<body>
<h1>Instalando YTCreator</h1>
<p class="sub" id="sub">Esto tarda unos 20 minutos, casi todo esperando descargas. No cierres la terminal.</p>
<div class="barra"><div id="relleno" style="width:0%"></div></div>
<div class="nota" id="nota"></div>
<ul id="lista"></ul>
<script>
const ICONOS = {pendiente: "⬜", marcha: "⏳", ok: "✅", aviso: "⚠️", error: "❌"};
let recargando = false;
async function actualizar() {
  try {
    const r = await fetch("/estado.json", {cache: "no-store"});
    const e = await r.json();
    const lista = document.getElementById("lista");
    lista.innerHTML = "";
    let hechos = 0;
    for (const p of e.pasos) {
      if (p.estado === "ok" || p.estado === "aviso") hechos++;
      const li = document.createElement("li");
      li.innerHTML = `<span class="icono">${ICONOS[p.estado] || "⬜"}</span>` +
        `<span class="${p.estado === "marcha" ? "marcha" : ""}">${p.numero}. ${p.titulo}` +
        (p.texto ? `<div class="texto">${p.texto}</div>` : "") + `</span>`;
      lista.appendChild(li);
    }
    document.getElementById("relleno").style.width = Math.round(100 * hechos / e.pasos.length) + "%";
    const nota = document.getElementById("nota");
    nota.textContent = e.nota || "";
    nota.style.display = e.nota ? "block" : "none";
    if (e.listo && !recargando) {
      recargando = true;
      document.getElementById("sub").textContent = "Listo. Abriendo YTCreator…";
      setTimeout(recargarCuandoResponda, 1500);
    }
  } catch (err) { /* el servidor de progreso puede parar un instante al pasar al real: se reintenta solo */ }
}
async function recargarCuandoResponda() {
  try {
    await fetch("/", {cache: "no-store"});
    location.reload();
  } catch (err) {
    setTimeout(recargarCuandoResponda, 800);
  }
}
actualizar();
setInterval(actualizar, 1500);
</script>
</body>
</html>"""


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, formato, *args):
        pass    # silencio: no ensuciar la terminal con cada petición de polling

    def do_GET(self):
        if self.path.startswith("/estado.json"):
            cuerpo = json.dumps(_leer()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        cuerpo = _PAGINA.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)


def _servir():
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), _Handler)
    servidor.serve_forever()


# --- Subcomandos ---------------------------------------------------------------------------------------------------

def iniciar(desde: int = 3):
    import subprocess
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import sistema
    PROGRAMAS.mkdir(parents=True, exist_ok=True)
    _escribir(_inicial(desde))
    orden = [str(sistema.python_venv(RAIZ)), __file__, "_servir"]
    proceso = subprocess.Popen(orden, cwd=str(RAIZ), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                **sistema.opciones_grupo())
    PIDFILE.write_text(str(proceso.pid), encoding="utf-8")
    time.sleep(0.5)    # darle un instante al servidor antes de abrir el navegador
    try:
        webbrowser.open(f"http://127.0.0.1:{PUERTO}")
    except Exception:
        pass
    print(f"Pantalla de progreso abierta en http://127.0.0.1:{PUERTO}")


def paso(numero: int, estado: str, texto: str = ""):
    if estado not in ESTADOS_VALIDOS:
        sys.exit(f"ERROR: estado «{estado}» no válido ({', '.join(sorted(ESTADOS_VALIDOS))})")
    e = _leer()
    for p in e["pasos"]:
        if p["numero"] == numero:
            p["estado"], p["texto"] = estado, texto
            _escribir(e)
            return
    sys.exit(f"ERROR: no existe el paso {numero} (hay {len(PASOS)})")


def nota(texto: str = ""):
    e = _leer()
    e["nota"] = texto
    _escribir(e)


def listo():
    e = _leer()
    e["listo"] = True
    _escribir(e)


def detener():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import sistema
    if not PIDFILE.exists():
        return
    try:
        pid = int(PIDFILE.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        PIDFILE.unlink(missing_ok=True)
        return
    sistema.senal_grupo(pid, "term")
    PIDFILE.unlink(missing_ok=True)
    # esperar a que el puerto quede libre de verdad antes de que arranque el servidor real
    import socket
    limite = time.monotonic() + 5
    while time.monotonic() < limite:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.2)
            if s.connect_ex(("127.0.0.1", PUERTO)) != 0:
                return
        time.sleep(0.2)


def main():
    import argparse
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
    si = sub.add_parser("iniciar", help="arranca el servidor y abre el navegador")
    si.add_argument("--desde", type=int, default=3, help="paso en marcha al abrir (los anteriores, hechos)")
    sub.add_parser("_servir", help=argparse.SUPPRESS)    # uso interno: el proceso en segundo plano
    sp = sub.add_parser("paso", help="actualiza un paso")
    sp.add_argument("numero", type=int)
    sp.add_argument("estado", choices=sorted(ESTADOS_VALIDOS))
    sp.add_argument("texto", nargs="?", default="")
    sn = sub.add_parser("nota", help="recuadro con lo que la persona tiene que hacer (sin texto, se quita)")
    sn.add_argument("texto", nargs="?", default="")
    sub.add_parser("listo", help="marca que ya se puede pasar a la aplicación real")
    sub.add_parser("detener", help="para el servidor y libera el puerto")
    a = p.parse_args()
    if a.orden == "iniciar":
        iniciar(a.desde)
    elif a.orden == "_servir":
        _servir()
    elif a.orden == "paso":
        paso(a.numero, a.estado, a.texto)
    elif a.orden == "nota":
        nota(a.texto)
    elif a.orden == "listo":
        listo()
    elif a.orden == "detener":
        detener()


if __name__ == "__main__":
    main()

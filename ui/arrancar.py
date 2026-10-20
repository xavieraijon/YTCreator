"""Interfaz del kit CanalYT (solo en este ordenador, 127.0.0.1), igual en Mac, Windows y Linux.

    python ui/arrancar.py            → compila el frontend si hace falta y abre http://127.0.0.1:8765
    python ui/arrancar.py dev        → desarrollo: backend con recarga (8765) + ng serve (http://127.0.0.1:4300)
    python ui/arrancar.py compilar   → solo compila el frontend
    python ui/arrancar.py comprobar  → todo lo que debe pasar antes de dar un cambio por bueno: ruff, pytest, Vitest y compilación
    python ui/arrancar.py prueba     → la interfaz con un canal de prueba ya avanzado (http://127.0.0.1:8766), sin gasto y sin
                                       tocar tu espacio: un vídeo publicado, otro por montar y otro a medio guion (herramientas/demo.py).
                                       Se construye la primera vez (unos 3 min) y se reutiliza; `prueba nueva` lo rehace desde cero

`python` puede ser cualquiera: si no es el del .venv del kit, se relanza con él. En Mac y Linux, `ui/arrancar.sh` es un atajo.
La primera vez pregunta dónde guardar tus canales y claves (espacio de trabajo); después lo recuerda (herramientas/espacio.py).
Usa el Node 24 de ui/.node (no el del sistema). Prioridad baja (nice en Mac y Linux; «por debajo de lo normal» en Windows).
"""

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from pathlib import Path

UI = Path(__file__).resolve().parent
RAIZ = UI.parent
sys.path.insert(0, str(RAIZ / "herramientas"))
import sistema  # noqa: E402

PY = sistema.python_venv(RAIZ)
PUERTO, PUERTO_DEV, PUERTO_PRUEBA = 8765, 4300, 8766


def _entorno() -> dict:
    """PATH con el Node de ui/.node delante (en Windows node.exe está en la raíz de la carpeta; en Mac y Linux, en bin/)."""
    node = UI / ".node"
    return {**os.environ, "PATH": os.pathsep.join([str(node / "bin"), str(node), os.environ.get("PATH", "")])}


ENTORNO = _entorno()


def _baja() -> dict:
    """Prioridad baja para un proceso que se queda en primer plano (Ctrl+C le sigue llegando)."""
    return {"creationflags": subprocess.BELOW_NORMAL_PRIORITY_CLASS} if sistema.WINDOWS else {}


def _orden(*partes) -> list[str]:
    return [*sistema.prioridad_baja(), *map(str, partes)]


def _npx() -> str:
    npx = shutil.which("npx", path=ENTORNO["PATH"])
    if not npx:
        sys.exit("ERROR: falta Node en ui/.node (se instala con la línea de instalación: docs/instalar.md).")
    return npx


def _ejecutar(orden, cwd) -> int:
    try:
        return subprocess.run(orden, cwd=cwd, env=ENTORNO, **_baja()).returncode
    except KeyboardInterrupt:
        return 130


# ---------------------------------------------------------------------------------------------------- espacio
def _espacio_actual() -> str:
    r = subprocess.run([str(PY), str(RAIZ / "herramientas" / "espacio.py")], capture_output=True, text=True)
    return next((linea.split(":", 1)[1].strip() for linea in r.stdout.splitlines() if linea.startswith("espacio:")), "?")


def elegir_espacio():
    """El espacio de trabajo (canales, claves y datos) vive fuera del kit: se elige una vez y se recuerda en .espacio."""
    if os.environ.get("CANALYT_ESPACIO") or (RAIZ / ".espacio").exists() or not sys.stdin.isatty():
        return
    print("¿Dónde guardo tus canales, claves y datos (el espacio de trabajo)?")
    r = input("  Intro = ~/YTCreator · o escribe otra carpeta · 'kit' = dentro del kit (sin separar): ").strip()
    destino = RAIZ if r == "kit" else Path(r or "~/YTCreator").expanduser().resolve()
    espacio_py = [str(PY), str(RAIZ / "herramientas" / "espacio.py")]
    if subprocess.run([*espacio_py, "elegir", str(destino)]).returncode:
        sys.exit(1)
    if destino == RAIZ:
        return
    entorno = {**os.environ, "CANALYT_ESPACIO": str(destino)}
    subprocess.run([*espacio_py, "preparar"], env=entorno)
    tengo = (RAIZ / "canales").is_dir() and any((RAIZ / "canales").iterdir())
    vacio = not (destino / "canales").is_dir() or not any((destino / "canales").iterdir())
    if tengo and vacio:
        c = input("¿Copio ahí lo que ya tienes (canales, claves y datos; no se borra nada)? [S/n] ").strip().lower()
        if c != "n":
            subprocess.run([*espacio_py, "migrar"], env=entorno)


# ---------------------------------------------------------------------------------------------------- puertos
def ocupado(puerto: int) -> bool:
    """Si el puerto ya está ocupado, no se arranca otra copia (sin lsof ni ps: vale en cualquier sistema)."""
    with socket.socket() as s:
        s.settimeout(0.5)
        if s.connect_ex(("127.0.0.1", puerto)):
            return False
    print(f"El puerto {puerto} ya está en uso: otro programa lo tiene abierto.")
    print(f"Si es YTCreator, ya está abierto: http://127.0.0.1:{puerto}  ·  Para cerrarlo: botón de apagado, arriba a la "
          "derecha en la interfaz (o Ctrl+C en la ventana donde se arrancó).")
    return True


def _uvicorn(*extra, puerto: int = PUERTO) -> list[str]:
    return _orden(PY, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", puerto,
                  "--timeout-graceful-shutdown", "2", *extra)


def _servir(orden: list[str], entorno: dict, cwd: Path) -> int:
    """Lanza el servidor y lo relanza mientras pida «reiniciar» (botones «Reiniciar ahora» y «Cerrar YTCreator»: el
    servidor escribe la orden en CANALYT_ORDEN y se para solo, app/rutas/sistema.py). Sin orden, devuelve su código."""
    fd, archivo = tempfile.mkstemp(prefix="ytcreator-orden-")
    os.close(fd)
    pedido = Path(archivo)
    try:
        while True:
            pedido.write_text("", encoding="utf-8")
            codigo = subprocess.run(orden, cwd=cwd, env={**entorno, "CANALYT_ORDEN": archivo}, **_baja()).returncode
            que = pedido.read_text(encoding="utf-8").strip()
            if que == "cerrar":
                print("YTCreator cerrado desde la interfaz.", flush=True)
                return 0
            if que != "reiniciar":
                return codigo
            print("Reiniciando YTCreator…", flush=True)
    except KeyboardInterrupt:
        return 130
    finally:
        pedido.unlink(missing_ok=True)


# ---------------------------------------------------------------------------------------------------- modos
def compilar() -> int:
    return _ejecutar(_orden(_npx(), "ng", "build"), UI / "frontend")


def comprobar() -> int:
    """Cada paso se pasa aunque falle otro; al final, un resumen y código de salida 1 si algo no ha pasado."""
    fallos = []

    def paso(nombre, orden, cwd):
        print(f"\n━━ {nombre}", flush=True)
        t = time.monotonic()
        bien = _ejecutar(orden, cwd) == 0
        print(f"{'✔' if bien else '✘'} {nombre} ({time.monotonic() - t:.0f} s)", flush=True)
        if not bien:
            fallos.append(nombre)

    if subprocess.run([str(PY), "-m", "ruff", "--version"], capture_output=True).returncode:
        print(f"Falta ruff en el .venv: {PY} -m pip install -r ui/backend/requirements.txt")
        fallos.append("ruff (sin instalar)")
    else:
        paso("Python: ruff", [str(PY), "-m", "ruff", "check"], RAIZ)
    paso("Backend: pytest", [str(PY), "-m", "pytest", "-q"], UI / "backend")
    paso("Frontend: Vitest", [_npx(), "ng", "test", "--watch=false"], UI / "frontend")
    paso("Frontend: compilación", _orden(_npx(), "ng", "build"), UI / "frontend")
    print()
    if fallos:
        print(f"NO PASA: {', '.join(fallos)}")
        return 1
    print("TODO PASA: ruff, pytest, Vitest y compilación.")
    return 0


def dev() -> int:
    if ocupado(PUERTO):
        return 1
    elegir_espacio()
    if ocupado(PUERTO_DEV):
        return 1
    back = subprocess.Popen(_uvicorn("--reload", "--reload-dir", "app"), cwd=UI / "backend", env=ENTORNO, **_baja())
    try:
        return _ejecutar(_orden(_npx(), "ng", "serve"), UI / "frontend")
    finally:
        back.terminate()
        try:
            back.wait(10)
        except subprocess.TimeoutExpired:
            back.kill()


def arrancar() -> int:
    if ocupado(PUERTO):
        return 1
    elegir_espacio()
    if not (UI / "frontend" / "dist" / "frontend" / "browser" / "index.html").exists() and compilar():
        return 1
    print(f"CanalYT: http://127.0.0.1:{PUERTO}  ·  espacio de trabajo: {_espacio_actual()}", flush=True)
    return _servir(_uvicorn(), ENTORNO, UI / "backend")


def prueba() -> int:
    """Canal de prueba para ver la interfaz fase a fase: espacio aparte (herramientas/demo.py), puerto propio y sin gasto."""
    if ocupado(PUERTO_PRUEBA):
        return 1
    if not (UI / "frontend" / "dist" / "frontend" / "browser" / "index.html").exists() and compilar():
        return 1
    destino = Path(tempfile.gettempdir()) / "YTCreator-demo"
    nueva = sys.argv[2:3] == ["nueva"]
    if nueva or not (destino / ".demo").exists():
        print("Preparando el canal de prueba (unos 3 minutos, solo esta vez)…", flush=True)
        if subprocess.run([str(PY), str(RAIZ / "herramientas" / "demo.py"), "hacer", str(destino)]).returncode:
            return 1
    entorno = {**ENTORNO, "CANALYT_ESPACIO": str(destino), "CANALYT_SIN_GASTO": "1"}
    url = f"http://127.0.0.1:{PUERTO_PRUEBA}"
    print(f"YTCreator de PRUEBA: {url}  ·  canal de prueba en {destino} (sin gasto; `prueba nueva` lo rehace)", flush=True)
    threading.Timer(3, webbrowser.open, [url]).start()
    return _servir(_uvicorn(puerto=PUERTO_PRUEBA), entorno, UI / "backend")


MODOS = {"dev": dev, "compilar": compilar, "comprobar": comprobar, "prueba": prueba, "": arrancar}


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else ""
    if modo in ("-h", "--help"):
        print(__doc__)
        return
    if modo not in MODOS:
        sys.exit(f"ERROR: modo desconocido «{modo}» (dev, compilar, comprobar o prueba; sin nada, arranca la interfaz)")
    if not PY.exists():
        sys.exit(f"ERROR: falta el entorno de Python del kit ({PY}). Se crea al instalar: vuelve a pegar la línea de instalación (docs/instalar.md).")
    if Path(sys.prefix).resolve() != PY.parent.parent.resolve():          # otro python: se relanza con el del .venv
        sys.exit(subprocess.run([str(PY), __file__, *sys.argv[1:]]).returncode)
    sys.exit(MODOS[modo]())


if __name__ == "__main__":
    main()

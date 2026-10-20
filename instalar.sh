#!/usr/bin/env bash
# Instalador de YTCreator para Mac y Linux. Se lanza con una sola línea:
#
#     curl -fsSL https://raw.githubusercontent.com/xavieraijon/YTCreator/main/instalar.sh | bash
#
# Instala todo en la carpeta del usuario, sin contraseña de administrador salvo git en Linux (y, en un Mac sin
# herramientas de Apple, la ventana de Apple que las instala): git, Python (con uv), ffmpeg, Node, las pantallas de la
# aplicación, la carpeta de trabajo ~/YTCreator (con el programa en ~/YTCreator/programa), Claude Code y el inicio de
# sesión con la cuenta de Claude. Desde el paso 3 se ve en el navegador (herramientas/instalar_progreso.py).
#
# Se puede repetir: cada paso mira primero si ya está. Repetirlo con YTCreator instalado = actualizarlo (trae la versión
# nueva sin tocar los canales). Registro: ~/YTCreator/programa/programas/instalar.log.
#
# Variables (para pruebas): YTC_CARPETA (por defecto ~/YTCreator), YTC_REPO (URL del repositorio), YTC_PRUEBA=1 (no abre la
# aplicación al final ni pone accesos en el Escritorio o el menú), YTC_SIN_CLAUDE=1 (no instala Claude Code ni pide iniciar sesión).

# Todo va dentro de funciones y se ejecuta en la última línea: si la descarga se corta a medias, no se ejecuta nada.

set -u

REPO="${YTC_REPO:-https://github.com/xavieraijon/YTCreator.git}"
CARPETA="${YTC_CARPETA:-$HOME/YTCreator}"
KIT="$CARPETA/programa"
PY="$KIT/.venv/bin/python"
PUERTO=8765
TOTAL=11
PANTALLA=0          # 1 cuando la pantalla de progreso del navegador está abierta
APP_ABIERTA=0       # 1 si YTCreator ya estaba abierto (actualización): se reinicia al final
TMP=""

# --- Mensajes ----------------------------------------------------------------------------------------------------------

if [ -t 1 ]; then B=$'\033[1m'; V=$'\033[32m'; A=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else B=""; V=""; A=""; R=""; N=""; fi

decir() { printf '%s\n' "$*"; }
titulo() { printf '\n%s%s%s\n' "$B" "$*" "$N"; }

registro() {
    # una línea por suceso en programas/instalar.log (en cuanto existe el kit)
    if [ -d "$KIT/herramientas" ]; then
        mkdir -p "$KIT/programas"
        printf '%s  %s\n' "$(date '+%F %T')" "$*" >> "$KIT/programas/instalar.log"
    fi
}

progreso() {
    # progreso <paso> <pendiente|marcha|ok|aviso|error> ["texto"]: en la terminal y, si está abierta, en el navegador
    local n="$1" estado="$2" texto="${3:-}"
    case "$estado" in
        marcha) printf '%s⏳ %s/%s%s %s\n' "$B" "$n" "$TOTAL" "$N" "$texto" ;;
        ok) printf '%s✅ Paso %s hecho%s%s\n' "$V" "$n" "$N" "${texto:+: $texto}" ;;
        aviso) printf '%s⚠️  Paso %s hecho con un aviso%s%s\n' "$A" "$n" "$N" "${texto:+: $texto}" ;;
        error) printf '%s❌ Paso %s: %s%s\n' "$R" "$n" "$texto" "$N" ;;
    esac
    registro "paso $n $estado $texto"
    if [ "$PANTALLA" = 1 ]; then
        "$PY" "$KIT/herramientas/instalar_progreso.py" paso "$n" "$estado" "$texto" >/dev/null 2>&1 || true
    fi
}

nota() {
    # recuadro destacado en la pantalla del navegador (lo que la persona tiene que hacer); sin texto, se quita
    if [ "$PANTALLA" = 1 ]; then
        "$PY" "$KIT/herramientas/instalar_progreso.py" nota "${1:-}" >/dev/null 2>&1 || true
    fi
}

fallar() {
    # fallar <paso> "qué ha pasado" ["qué puede hacer"]
    progreso "$1" error "$2"
    nota "Algo ha fallado. Mira la terminal: ahí te explica qué hacer."
    decir ""
    decir "${R}No se ha podido terminar la instalación.${N} $2"
    [ -n "${3:-}" ] && decir "$3"
    decir "Cuando lo arregles, vuelve a pegar la misma línea: sigue por donde iba."
    decir "Ayuda: https://github.com/xavieraijon/YTCreator/blob/main/docs/instalar.md#problemas"
    [ -f "$KIT/programas/instalar.log" ] && decir "Registro de lo hecho: $KIT/programas/instalar.log"
    exit 1
}

preguntar_si() {
    # preguntar_si "pregunta" → 0 si contesta que sí; sin teclado (sin /dev/tty), sí
    local r
    if ! { exec 3</dev/tty; } 2>/dev/null; then return 0; fi
    printf '%s [s/n] ' "$1"
    read -r r <&3
    exec 3<&-
    case "$r" in s|S|si|sí|Si|Sí|SI|y|Y|"") return 0 ;; *) return 1 ;; esac
}

ejecutar() {
    # ejecutar <orden…>: su salida va al registro, no a la pantalla; devuelve su código
    local log="$KIT/programas/instalar.log"
    if [ -d "$KIT/programas" ]; then
        "$@" >> "$log" 2>&1
    else
        "$@" > "$TMP/salida.log" 2>&1
    fi
}

ultimas_lineas() {
    local log="$KIT/programas/instalar.log"
    [ -f "$log" ] || log="$TMP/salida.log"
    tail -n 5 "$log" 2>/dev/null
}

descargar() {
    # descargar <url> <archivo>: con reintentos (las conexiones lentas cortan)
    curl -fL --retry 3 --retry-delay 3 --connect-timeout 30 -o "$2" "$1" >> "$TMP/descargas.log" 2>&1
}

puerto_ocupado() {
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PUERTO/" 2>/dev/null
}

abrir_navegador() {
    if [ "$SISTEMA" = mac ]; then open "$1"; else xdg-open "$1" >/dev/null 2>&1 || true; fi
}

# --- 1. Comprobar tu ordenador -----------------------------------------------------------------------------------------

paso1() {
    titulo "Instalando YTCreator · unos 20 minutos, casi todo esperando descargas"
    decir "No cierres esta ventana hasta que termine. Al llegar al paso 3 se abrirá tu navegador con el progreso."
    decir ""
    progreso 1 marcha "Comprobar tu ordenador"
    case "$(uname -s)" in
        Darwin) SISTEMA=mac ;;
        Linux) SISTEMA=linux ;;
        *) fallar 1 "Este instalador es para Mac y Linux." "En Windows, usa la línea de PowerShell del README." ;;
    esac
    case "$(uname -m)" in
        arm64|aarch64) CPU=arm64 ;;
        x86_64|amd64) CPU=x64 ;;
        *) fallar 1 "Tu procesador ($(uname -m)) no está entre los que YTCreator admite." ;;
    esac
    local libre_gb
    libre_gb=$(( $(df -Pk "$HOME" | awk 'NR==2 {print $4}') / 1024 / 1024 ))
    if [ "$SISTEMA" = mac ]; then
        local version
        version=$(sw_vers -productVersion)
        decir "Es un Mac (macOS $version, chip $( [ "$CPU" = arm64 ] && echo 'de Apple' || echo 'Intel')) con $libre_gb GB libres."
        if [ "${version%%.*}" -lt 13 ]; then
            decir "${A}YTCreator necesita macOS 13 o más nuevo; con este puede fallar.${N}"
            preguntar_si "¿Quieres intentarlo igualmente?" || exit 1
        fi
    else
        decir "Es un ordenador con Linux ($CPU) con $libre_gb GB libres."
    fi
    if [ "$libre_gb" -lt 3 ]; then
        decir "${A}Hay menos de 3 GB libres: YTCreator ocupa ~1 GB y tus vídeos necesitan sitio.${N}"
        preguntar_si "¿Seguir de todos modos?" || exit 1
    fi
    command -v curl >/dev/null || fallar 1 "Falta curl, el programa que descarga cosas." "En Linux: sudo apt install -y curl"
    progreso 1 ok
}

# --- 2. Descargar YTCreator --------------------------------------------------------------------------------------------

instalar_git() {
    if [ "$SISTEMA" = mac ]; then
        # en un Mac sin las herramientas de Apple, `git` existe pero solo abre la ventana para instalarlas
        xcode-select -p >/dev/null 2>&1 && git --version >/dev/null 2>&1 && return 0
        decir ""
        decir "${B}Va a salir una ventana de Apple para instalar unas herramientas (traen git, que descarga YTCreator).${N}"
        decir "Pulsa ${B}Instalar${N}, acepta la licencia y espera: tarda unos minutos. Esta ventana sigue sola al acabar."
        xcode-select --install >/dev/null 2>&1 || true
        local espera=0
        until xcode-select -p >/dev/null 2>&1 && git --version >/dev/null 2>&1; do
            sleep 10
            espera=$((espera + 10))
            [ "$espera" -ge 3600 ] && fallar 2 "Las herramientas de Apple no se han instalado." \
                "Ejecuta «xcode-select --install» en la terminal, termina la instalación y vuelve a pegar la línea."
        done
        return 0
    fi
    command -v git >/dev/null && return 0
    decir ""
    decir "${B}Falta git (el programa que descarga YTCreator) y para instalarlo hace falta tu contraseña del ordenador.${N}"
    decir "Al escribirla ${B}no se ve nada, ni puntos${N}: es normal. Escríbela y pulsa Intro."
    if command -v apt-get >/dev/null; then sudo apt-get install -y git </dev/tty
    elif command -v dnf >/dev/null; then sudo dnf install -y git </dev/tty
    elif command -v pacman >/dev/null; then sudo pacman -S --noconfirm git </dev/tty
    elif command -v zypper >/dev/null; then sudo zypper install -y git </dev/tty
    fi
    command -v git >/dev/null || fallar 2 "No se ha podido instalar git." "Instálalo con el gestor de programas de tu Linux."
}

paso2() {
    progreso 2 marcha "Descargar YTCreator (en la carpeta YTCreator de tu carpeta personal)"
    instalar_git
    if [ -f "$KIT/herramientas/sistema.py" ]; then
        if [ -d "$KIT/.git" ]; then
            if [ -n "$(git -C "$KIT" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
                progreso 2 aviso "ya estaba; tiene cambios hechos a mano, así que no se actualiza"
                return
            fi
            local antes
            antes=$(git -C "$KIT" rev-parse HEAD)
            if ejecutar git -C "$KIT" pull --ff-only; then
                if [ "$antes" = "$(git -C "$KIT" rev-parse HEAD)" ]; then
                    progreso 2 ok "ya estaba, en la última versión"
                else
                    progreso 2 ok "actualizado a la última versión"
                fi
            else
                progreso 2 aviso "ya estaba; no se ha podido actualizar (¿sin internet?)"
            fi
        else
            progreso 2 ok "ya estaba"
        fi
        return
    fi
    if [ -e "$KIT" ] && [ -n "$(ls -A "$KIT" 2>/dev/null)" ]; then
        fallar 2 "Ya existe la carpeta $KIT y no es YTCreator." "Cámbiale el nombre o muévela, y vuelve a pegar la línea."
    fi
    mkdir -p "$CARPETA"
    if ! git clone --quiet "$REPO" "$KIT" > "$TMP/salida.log" 2>&1; then
        ultimas_lineas
        fallar 2 "No se ha podido descargar YTCreator." "Comprueba la conexión a internet."
    fi
    [ -f "$KIT/herramientas/sistema.py" ] || fallar 2 "La descarga de YTCreator está incompleta."
    progreso 2 ok
}

# --- 3. Python ---------------------------------------------------------------------------------------------------------

paso3() {
    progreso 3 marcha "Python (el lenguaje de YTCreator) y sus piezas, entre ellas yt-dlp, que consulta YouTube"
    local uv
    uv=$(command -v uv || true)
    [ -z "$uv" ] && [ -x "$HOME/.local/bin/uv" ] && uv="$HOME/.local/bin/uv"
    if [ -z "$uv" ]; then
        # uv (el instalador de Python) va a ~/.local/bin, sin contraseña ni tocar la configuración de la terminal
        curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 INSTALLER_NO_MODIFY_PATH=1 sh \
            > "$TMP/salida.log" 2>&1 || { ultimas_lineas; fallar 3 "No se ha podido instalar uv (el instalador de Python)."; }
        uv="$HOME/.local/bin/uv"
    fi
    if ! "$PY" --version 2>/dev/null | grep -q '^Python 3\.13'; then
        ejecutar "$uv" venv --clear --seed --python 3.13 "$KIT/.venv" \
            || { ultimas_lineas; fallar 3 "No se ha podido instalar Python 3.13."; }
    fi
    ejecutar "$uv" pip install --python "$KIT/.venv" -r "$KIT/requirements.txt" -r "$KIT/ui/backend/requirements.txt" \
        || { ultimas_lineas; fallar 3 "No se han podido instalar las piezas de Python." "Comprueba la conexión a internet."; }
    "$PY" -m yt_dlp --version >/dev/null 2>&1 && "$PY" -c "import fastapi, PIL, numpy" 2>/dev/null \
        || fallar 3 "Python se ha instalado pero le faltan piezas."
    local aviso=""
    if [ "$SISTEMA" = linux ] && ! "$PY" -c "import azure.cognitiveservices.speech" >/dev/null 2>&1; then
        # la voz gratis de Azure necesita la biblioteca de sonido del sistema
        decir "${B}Para la voz de Azure falta una pieza de sonido del sistema; hace falta tu contraseña del ordenador${N}"
        decir "(al escribirla no se ve nada: es normal). Si prefieres no hacerlo ahora, pulsa Ctrl+C y vuelve a pegar la línea."
        if command -v apt-get >/dev/null; then
            sudo apt-get install -y libasound2t64 </dev/tty >/dev/null 2>&1 || sudo apt-get install -y libasound2 </dev/tty >/dev/null 2>&1
        fi
        "$PY" -c "import azure.cognitiveservices.speech" >/dev/null 2>&1 || aviso="falta la pieza de sonido de la voz de Azure"
    fi
    # en cuanto hay Python, la pantalla del navegador (en una actualización con la aplicación abierta, no: ocupa su sitio).
    # Si quedó abierta la de un intento anterior que falló, se cierra y se abre de nuevo
    "$PY" "$KIT/herramientas/instalar_progreso.py" detener >/dev/null 2>&1
    if puerto_ocupado; then
        APP_ABIERTA=1
    elif "$PY" "$KIT/herramientas/instalar_progreso.py" iniciar --desde 3 >/dev/null 2>&1; then
        PANTALLA=1
        decir ""
        decir "${B}Se ha abierto tu navegador con el progreso de la instalación.${N} Puedes seguirla allí; si te hace falta"
        decir "hacer algo, te lo dirá. No cierres esta ventana."
        decir ""
    fi
    if [ -n "$aviso" ]; then progreso 3 aviso "$aviso"; else progreso 3 ok "Python 3.13 instalado"; fi
}

# --- 4. ffmpeg ---------------------------------------------------------------------------------------------------------

paso4() {
    progreso 4 marcha "ffmpeg, el programa que monta los vídeos"
    local p="$KIT/programas"
    mkdir -p "$p"
    if "$p/ffmpeg" -version >/dev/null 2>&1 && "$p/ffprobe" -version >/dev/null 2>&1; then
        progreso 4 ok "ya estaba"; return
    fi
    if command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null && ffmpeg -version >/dev/null 2>&1; then
        progreso 4 ok "ya estaba en tu ordenador"; return
    fi
    local d="$TMP/ffmpeg"
    mkdir -p "$d"
    if [ "$SISTEMA" = mac ]; then
        local arq
        arq=$( [ "$CPU" = arm64 ] && echo arm64 || echo amd64 )
        for prog in ffmpeg ffprobe; do
            mkdir -p "$d/$prog"
            descargar "https://ffmpeg.martin-riedl.de/redirect/latest/macos/$arq/release/$prog.zip" "$d/$prog.zip" \
                || fallar 4 "No se ha podido descargar $prog." "Comprueba la conexión a internet."
            unzip -oq "$d/$prog.zip" -d "$d/$prog" || fallar 4 "La descarga de $prog está dañada."
            cp "$(find "$d/$prog" -type f -name "$prog" | head -n 1)" "$p/$prog"
        done
    else
        local arq
        arq=$( [ "$CPU" = arm64 ] && echo arm64 || echo amd64 )
        descargar "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-$arq-static.tar.xz" "$d/ff.tar.xz" \
            || fallar 4 "No se ha podido descargar ffmpeg." "Comprueba la conexión a internet."
        tar -xJf "$d/ff.tar.xz" -C "$d" || fallar 4 "La descarga de ffmpeg está dañada."
        cp "$(find "$d" -type f -name ffmpeg | head -n 1)" "$p/ffmpeg"
        cp "$(find "$d" -type f -name ffprobe | head -n 1)" "$p/ffprobe"
    fi
    chmod +x "$p/ffmpeg" "$p/ffprobe"
    # en un Mac, lo descargado puede quedar en cuarentena: se le quita (es nuestro, viene de una dirección fija)
    [ "$SISTEMA" = mac ] && xattr -d com.apple.quarantine "$p/ffmpeg" "$p/ffprobe" 2>/dev/null
    "$p/ffmpeg" -version >/dev/null 2>&1 && "$p/ffprobe" -version >/dev/null 2>&1 \
        || fallar 4 "ffmpeg se ha descargado pero no funciona en este ordenador."
    progreso 4 ok
}

# --- 5. Node -----------------------------------------------------------------------------------------------------------

paso5() {
    progreso 5 marcha "Node, que prepara las pantallas de la aplicación"
    local destino="$KIT/ui/.node"
    if "$destino/bin/node" --version 2>/dev/null | grep -q '^v24\.'; then progreso 5 ok "ya estaba"; return; fi
    local so ext
    if [ "$SISTEMA" = mac ]; then so=darwin; ext=tar.gz; else so=linux; ext=tar.xz; fi
    local base="https://nodejs.org/dist/latest-v24.x"
    local d="$TMP/node"
    mkdir -p "$d/x"
    descargar "$base/SHASUMS256.txt" "$d/SHASUMS256.txt" || fallar 5 "No se ha podido consultar la versión de Node."
    local linea archivo suma
    linea=$(grep -E " node-v24\.[0-9.]+-$so-$CPU\.$ext\$" "$d/SHASUMS256.txt" | head -n 1)
    [ -n "$linea" ] || fallar 5 "No hay Node para este ordenador ($so-$CPU)."
    suma=${linea%% *}
    archivo=${linea##* }
    descargar "$base/$archivo" "$d/$archivo" || fallar 5 "No se ha podido descargar Node." "Comprueba la conexión a internet."
    local calculada
    if command -v shasum >/dev/null; then calculada=$(shasum -a 256 "$d/$archivo" | cut -d' ' -f1)
    else calculada=$(sha256sum "$d/$archivo" | cut -d' ' -f1); fi
    [ "$calculada" = "$suma" ] || fallar 5 "La descarga de Node no es la original (la comprobación no coincide)."
    tar -xf "$d/$archivo" -C "$d/x" || fallar 5 "La descarga de Node está dañada."
    [ -e "$destino" ] && rm -rf "$destino.viejo" && mv "$destino" "$destino.viejo"
    mv "$d/x/${archivo%.$ext}" "$destino"
    rm -rf "$destino.viejo"
    "$destino/bin/node" --version >/dev/null 2>&1 || fallar 5 "Node se ha descargado pero no funciona en este ordenador."
    progreso 5 ok
}

# --- 6. Las pantallas de la aplicación ---------------------------------------------------------------------------------

paso6() {
    progreso 6 marcha "Las pantallas de la aplicación (la primera vez tarda unos minutos)"
    export PATH="$KIT/ui/.node/bin:$PATH"
    local front="$KIT/ui/frontend"
    if ! { [ -d "$front/node_modules" ] && (cd "$front" && npm ls --depth=0 >/dev/null 2>&1); }; then
        (cd "$front" && ejecutar npm ci --no-audit --no-fund --loglevel=error) \
            || { ultimas_lineas; fallar 6 "No se han podido descargar las piezas de las pantallas." "Comprueba la conexión a internet."; }
    fi
    # siempre: tras una actualización, las pantallas cambian
    (cd "$KIT" && ejecutar "$PY" ui/arrancar.py compilar) || { ultimas_lineas; fallar 6 "No se han podido preparar las pantallas."; }
    [ -f "$front/dist/frontend/browser/index.html" ] || fallar 6 "Las pantallas no se han generado."
    progreso 6 ok
}

# --- 7. Tu carpeta de trabajo ------------------------------------------------------------------------------------------

paso7() {
    progreso 7 marcha "Tu carpeta YTCreator, donde se guardan tus canales y vídeos"
    local info actual
    info=$(cd "$KIT" && "$PY" herramientas/espacio.py 2>/dev/null)
    actual=$(printf '%s\n' "$info" | sed -n 's/^espacio: //p' | head -n 1)
    if printf '%s\n' "$info" | grep -q 'separado: True' && [ -n "$actual" ] && [ -d "$actual" ]; then
        # ya elegido (quizá en otro sitio, con canales): se respeta y solo se reparan los enlaces
        (cd "$KIT" && CANALYT_ESPACIO="$actual" ejecutar "$PY" herramientas/espacio.py preparar) \
            || fallar 7 "No se ha podido revisar tu carpeta de trabajo ($actual)."
        CARPETA="$actual"
        # una actualización puede cambiar el formato de los guiones: se adaptan los que ya hay
        (cd "$KIT" && CANALYT_ESPACIO="$actual" ejecutar "$PY" herramientas/esquema.py actualizar) \
            || fallar 7 "No se han podido adaptar tus guiones a la versión nueva."
        progreso 7 ok "ya estaba"
    else
        (cd "$KIT" && ejecutar "$PY" herramientas/espacio.py elegir "$CARPETA" \
            && CANALYT_ESPACIO="$CARPETA" ejecutar "$PY" herramientas/espacio.py preparar) \
            || { ultimas_lineas; fallar 7 "No se ha podido preparar tu carpeta de trabajo."; }
        progreso 7 ok
    fi
    # historial de tus canales (git local, nunca se sube a ningún sitio)
    if [ ! -d "$CARPETA/.git" ]; then
        ejecutar git -C "$CARPETA" init -q
    fi
    if [ -z "$(git -C "$CARPETA" config user.name 2>/dev/null)" ]; then
        local nombre=""
        if { exec 3</dev/tty; } 2>/dev/null; then
            nota "Mira la terminal: te pregunta tu nombre."
            decir ""
            printf '%s' "${B}¿Qué nombre quieres que aparezca en el historial de tus canales?${N} (pulsa Intro para «$(id -un)»): "
            read -r nombre <&3
            exec 3<&-
            nota ""
        fi
        git -C "$CARPETA" config user.name "${nombre:-$(id -un)}"
    fi
    # el historial es solo local: basta un correo de este equipo
    [ -n "$(git -C "$CARPETA" config user.email 2>/dev/null)" ] || git -C "$CARPETA" config user.email "$(id -un)@ytcreator.local"
    crear_lanzador
    if ! git -C "$CARPETA" rev-parse -q --verify HEAD >/dev/null 2>&1; then
        ejecutar git -C "$CARPETA" add -A && ejecutar git -C "$CARPETA" commit -q -m "Carpeta de trabajo de YTCreator"
    fi
}

# --- 8. Claude ---------------------------------------------------------------------------------------------------------

CLAUDE=""

buscar_claude() {
    CLAUDE=$(command -v claude || true)
    [ -z "$CLAUDE" ] && [ -x "$HOME/.local/bin/claude" ] && CLAUDE="$HOME/.local/bin/claude"
    [ -n "$CLAUDE" ] && "$CLAUDE" --version >/dev/null 2>&1
}

paso8() {
    progreso 8 marcha "Claude Code, la IA que escribe contigo y maneja YTCreator"
    if [ "${YTC_SIN_CLAUDE:-}" = 1 ]; then progreso 8 aviso "no instalado (YTC_SIN_CLAUDE)"; return; fi
    if buscar_claude; then progreso 8 ok "ya estaba"; return; fi
    curl -fsSL https://claude.ai/install.sh | bash > "$TMP/salida.log" 2>&1 \
        || { ultimas_lineas; fallar 8 "No se ha podido instalar Claude Code." "Comprueba la conexión a internet."; }
    buscar_claude || fallar 8 "Claude Code se ha instalado pero no responde."
    # que la orden `claude` funcione también en las terminales nuevas
    case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *)
        local rc="$HOME/.bashrc"
        [ "$SISTEMA" = mac ] && rc="$HOME/.zshrc"
        grep -qs '.local/bin' "$rc" || printf '\n# Claude Code (YTCreator)\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$rc"
    esac
    progreso 8 ok
}

# --- 9. Entrar con tu cuenta de Claude ---------------------------------------------------------------------------------

estado_claude() {
    # imprime «dentro <plan>» o «fuera»
    "$CLAUDE" auth status --json 2>/dev/null | "$PY" -c '
import json, sys
try:
    e = json.load(sys.stdin)
except ValueError:
    e = {}
print(("dentro " + (e.get("subscriptionType") or "")) if e.get("loggedIn") else "fuera")'
}

paso9() {
    progreso 9 marcha "Entrar con tu cuenta de Claude"
    if [ "${YTC_SIN_CLAUDE:-}" = 1 ] || [ -z "$CLAUDE" ]; then progreso 9 aviso "sin Claude Code"; return; fi
    local estado
    estado=$(estado_claude)
    if [ "$estado" = fuera ]; then
        nota "Vuelve a la terminal (la ventana negra donde pegaste la línea): te pide entrar con tu cuenta de Claude."
        decir ""
        decir "${B}Ahora entras con tu cuenta de Claude${N} (hace falta un plan de pago: Pro o Max)."
        decir "Se abrirá una pestaña del navegador: entra con tu cuenta y pulsa ${B}Autorizar${N} (en inglés, «Authorize»)."
        decir "Después vuelve aquí. Si la pestaña no se abre, copia en el navegador la dirección que aparece abajo."
        decir ""
        if { exec 3</dev/tty; } 2>/dev/null; then
            exec 3<&-
            "$CLAUDE" auth login --claudeai </dev/tty || true
        fi
        nota ""
        estado=$(estado_claude)
    fi
    case "$estado" in
        fuera)
            progreso 9 aviso "sin entrar: hazlo al abrir YTCreator (te lo pedirá)" ;;
        "dentro pro"|"dentro max"|"dentro team"|"dentro enterprise")
            progreso 9 ok "dentro, plan ${estado#dentro }" ;;
        "dentro free"|"dentro ")
            progreso 9 aviso "tu cuenta no tiene plan de pago (Pro o Max): YTCreator no podrá usar a Claude"
            decir "${A}Tu cuenta de Claude es del plan gratuito.${N} Pásala a Pro en claude.ai → Ajustes → Facturación." ;;
        *)
            progreso 9 ok "dentro" ;;
    esac
}

# --- 10. Probar que todo funciona --------------------------------------------------------------------------------------

paso10() {
    progreso 10 marcha "Probar que todo funciona"
    local fallos=""
    (cd "$KIT" && "$PY" -c "import sys; sys.path.insert(0, 'herramientas'); import sistema, shutil
assert shutil.which('ffmpeg') and shutil.which('ffprobe') and shutil.which('yt-dlp')") >/dev/null 2>&1 \
        || fallos="$fallos ffmpeg/yt-dlp"
    "$KIT/ui/.node/bin/node" --version >/dev/null 2>&1 || fallos="$fallos node"
    (cd "$KIT" && CANALYT_ESPACIO="$CARPETA" "$PY" herramientas/espacio.py >/dev/null 2>&1) || fallos="$fallos carpeta"
    (cd "$KIT" && CANALYT_ESPACIO="$CARPETA" "$PY" herramientas/canales.py lista >/dev/null 2>&1) || fallos="$fallos canales"
    # un vídeo de 1 segundo con el ffmpeg que usará YTCreator
    (cd "$KIT" && "$PY" -c "import sys, subprocess; sys.path.insert(0, 'herramientas'); import sistema
subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=1', '-y', sys.argv[1]], check=True)" \
        "$TMP/prueba.mp4") >/dev/null 2>&1 || fallos="$fallos vídeo"
    [ -f "$KIT/ui/frontend/dist/frontend/browser/index.html" ] || fallos="$fallos pantallas"
    [ -n "$fallos" ] && fallar 10 "Algo no funciona:$fallos."
    progreso 10 ok
}

# --- 11. Abrir YTCreator -----------------------------------------------------------------------------------------------

crear_lanzador() {
    # «Abrir YTCreator» para los días siguientes, sin terminal ni Claude
    if [ "$SISTEMA" = mac ]; then
        local l="$CARPETA/Abrir YTCreator.command"
        cat > "$l" <<EOF
#!/bin/bash
# Abre YTCreator (lo creó el instalador). Si ya está abierto, solo abre el navegador.
cd "$KIT" || exit 1
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:$PUERTO/; then
    nohup "$PY" "$KIT/ui/arrancar.py" >> programas/ytcreator.log 2>&1 &
    for i in \$(seq 60); do curl -s -o /dev/null --max-time 1 http://127.0.0.1:$PUERTO/ && break; sleep 1; done
fi
open http://127.0.0.1:$PUERTO
osascript -e 'tell application "Terminal" to close (every window whose name contains "Abrir YTCreator")' >/dev/null 2>&1 &
EOF
        chmod +x "$l"
        [ "${YTC_PRUEBA:-}" != 1 ] && [ -d "$HOME/Desktop" ] && ln -sf "$l" "$HOME/Desktop/YTCreator"
    else
        local l="$KIT/programas/abrir-ytcreator.sh"
        cat > "$l" <<EOF
#!/bin/bash
# Abre YTCreator (lo creó el instalador). Si ya está abierto, solo abre el navegador.
cd "$KIT" || exit 1
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:$PUERTO/; then
    nohup "$PY" "$KIT/ui/arrancar.py" >> programas/ytcreator.log 2>&1 &
    for i in \$(seq 60); do curl -s -o /dev/null --max-time 1 http://127.0.0.1:$PUERTO/ && break; sleep 1; done
fi
xdg-open http://127.0.0.1:$PUERTO
EOF
        chmod +x "$l"
        [ "${YTC_PRUEBA:-}" = 1 ] && return
        local escritorio
        escritorio="[Desktop Entry]
Type=Application
Name=YTCreator
Comment=Crea y produce tus canales de YouTube
Exec=$l
Icon=video-x-generic
Terminal=false
Categories=AudioVideo;"
        mkdir -p "$HOME/.local/share/applications"
        printf '%s\n' "$escritorio" > "$HOME/.local/share/applications/ytcreator.desktop"
        local escr
        escr=$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")
        if [ -d "$escr" ]; then
            printf '%s\n' "$escritorio" > "$escr/ytcreator.desktop"
            chmod +x "$escr/ytcreator.desktop"
            gio set "$escr/ytcreator.desktop" metadata::trusted true >/dev/null 2>&1 || true
        fi
    fi
}

paso11() {
    progreso 11 marcha "Abrir YTCreator"
    if [ "${YTC_PRUEBA:-}" = 1 ]; then
        [ "$PANTALLA" = 1 ] && "$PY" "$KIT/herramientas/instalar_progreso.py" detener >/dev/null 2>&1
        progreso 11 ok "sin abrir (YTC_PRUEBA)"
        return
    fi
    if [ "$APP_ABIERTA" = 1 ]; then
        # actualización con la aplicación abierta: se para para que arranque la versión nueva
        pkill -f "$KIT/ui/arrancar.py" >/dev/null 2>&1
        pkill -f "uvicorn app.main:app --host 127.0.0.1 --port $PUERTO" >/dev/null 2>&1
        for _ in $(seq 20); do puerto_ocupado || break; sleep 0.5; done
    fi
    if [ "$PANTALLA" = 1 ]; then
        progreso 11 ok
        "$PY" "$KIT/herramientas/instalar_progreso.py" listo >/dev/null 2>&1
        sleep 3    # que la página se entere antes de que se pare su servidor
        "$PY" "$KIT/herramientas/instalar_progreso.py" detener >/dev/null 2>&1
    fi
    (cd "$CARPETA" && nohup "$PY" "$KIT/ui/arrancar.py" >> "$KIT/programas/ytcreator.log" 2>&1 &)
    local arrancada=0
    for _ in $(seq 60); do
        if puerto_ocupado; then arrancada=1; break; fi
        sleep 1
    done
    [ "$arrancada" = 1 ] || fallar 11 "YTCreator no ha arrancado." "Mira el registro: $KIT/programas/ytcreator.log"
    [ "$PANTALLA" = 1 ] || abrir_navegador "http://127.0.0.1:$PUERTO"
    [ "$PANTALLA" = 1 ] || progreso 11 ok
}

despedida() {
    titulo "¡Listo! YTCreator está abierto en tu navegador."
    decir "Su Asistente te guía para crear tu primer canal."
    decir ""
    if [ "$SISTEMA" = mac ]; then
        decir "Para abrirlo otro día: haz doble clic en ${B}YTCreator${N} en tu Escritorio (o en «Abrir YTCreator» dentro"
        decir "de la carpeta YTCreator de tu carpeta personal)."
    else
        decir "Para abrirlo otro día: busca ${B}YTCreator${N} en el menú de aplicaciones (o en tu Escritorio)."
    fi
    decir "Tus canales y vídeos se guardan en $CARPETA; no borres la carpeta «programa» que hay dentro."
    decir "Para actualizarlo, vuelve a pegar la misma línea de instalación."
    decir ""
    decir "Ya puedes cerrar esta ventana."
    registro "instalación terminada"
}

main() {
    TMP=$(mktemp -d "${TMPDIR:-/tmp}/ytcreator.XXXXXX")
    trap 'rm -rf "$TMP"' EXIT
    trap 'decir ""; decir "Instalación interrumpida. Vuelve a pegar la línea para seguir por donde iba."; exit 130' INT
    paso1
    paso2
    registro "--- instalación ($(uname -s) $(uname -m)) desde $REPO"
    paso3
    paso4
    paso5
    paso6
    paso7
    paso8
    paso9
    paso10
    paso11
    despedida
}

main "$@"

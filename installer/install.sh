#!/usr/bin/env bash
# YTCreator installer (R2). Same line installs, resumes an interrupted install, and updates (FR-003):
#   curl -fsSL https://github.com/<owner>/<repo>/releases/latest/download/install.sh | bash
# Compatible with bash 3.2 (macOS's default bash). No step ever uses sudo (FR-005).
set -euo pipefail

# --- Versions and checksums, written in by installer/stamp.sh at publish time (R1, R24) ---------------------
YTCREATOR_VERSION="__YTCREATOR_VERSION__"
NODE_VERSION="__NODE_VERSION__"
SHA_RELEASE="__SHA_RELEASE__"
SHA_NODE_DARWIN_ARM64="__SHA_NODE_DARWIN_ARM64__"
SHA_NODE_DARWIN_X64="__SHA_NODE_DARWIN_X64__"
SHA_NODE_LINUX_X64="__SHA_NODE_LINUX_X64__"
SHA_NODE_LINUX_ARM64="__SHA_NODE_LINUX_ARM64__"

# --- Env vars (none of these are documented for the creator) ------------------------------------------------
: "${YTCREATOR_RELEASE_BASE:=https://github.com/xavieraijon/YTCreator/releases/latest/download}"
: "${YTCREATOR_NODE_BASE:=https://nodejs.org/dist/v${NODE_VERSION}}"
: "${YTCREATOR_CLAUDE_INSTALL_URL:=https://claude.ai/install.sh}"
: "${YTCREATOR_INSTALL_TEST:=0}"
: "${YTCREATOR_INSTALL_FAIL_STEP:=0}"
: "${YTCREATOR_ASSUME_YES:=0}"

# --- Visible texts (checked by the glossary test, T073: plain words, no jargon, addressed as «tú») ---------
MSG_NEEDS_AI_1="YTCreator necesita una suscripción de Claude que incluya Claude Code (Pro o Max)"
MSG_NEEDS_AI_2="o una cuenta de Anthropic con saldo. No incluye una IA gratuita."
MSG_STEP1="Comprobando tu ordenador"
MSG_STEP2="Preparando las carpetas"
MSG_STEP3="Descargando el motor"
MSG_STEP4="Descargando YTCreator"
MSG_STEP5="Instalando Claude Code"
MSG_STEP6="Preparando tus datos"
MSG_STEP7="Creando el acceso directo"
MSG_STEP8="Abriendo YTCreator"
MSG_DONE="✓ YTCreator está listo."

MSG_UNSUPPORTED_WHAT="Tu sistema no es compatible con YTCreator todavía."
MSG_UNSUPPORTED_TODO="YTCreator funciona en macOS y Linux, con procesador Intel o Apple Silicon."
MSG_MISSING_TOOL_WHAT="Falta una herramienta que YTCreator necesita para instalarse."
MSG_MISSING_TOOL_TODO="Instala curl, tar y shasum (o sha256sum) y vuelve a pegar la línea de instalación."
MSG_LOW_DISK_PROMPT="Queda poco espacio libre en el disco. ¿Seguimos igualmente? (s/n) "
MSG_LOW_DISK_STOP="No hay suficiente espacio libre en el disco para instalar YTCreator."
MSG_FOREIGN_WORKSPACE_WHAT="La carpeta YTCreator de tu carpeta personal ya existe y no parece ser de YTCreator."
MSG_FOREIGN_WORKSPACE_TODO="Mueve o renombra esa carpeta y vuelve a pegar la línea de instalación."
MSG_NO_PERMISSION_WHAT="YTCreator no puede escribir en tu carpeta personal."
MSG_NO_PERMISSION_TODO="Revisa los permisos de tu carpeta personal y vuelve a pegar la línea de instalación."
MSG_DOWNLOAD_WHAT="No se ha podido descargar un archivo necesario para instalar YTCreator."
MSG_DOWNLOAD_TODO="Revisa tu conexión a internet y vuelve a pegar la línea de instalación."
MSG_CHECKSUM_WHAT="El archivo descargado no coincide con lo esperado."
MSG_CHECKSUM_TODO="Vuelve a pegar la línea de instalación; si sigue pasando, puede ser un problema de tu conexión."
MSG_CLAUDE_WARN="No se ha podido instalar Claude Code. Podrás repararlo más tarde desde YTCreator."
MSG_MIGRATE_WHAT="No se han podido preparar tus datos para la nueva versión."
MSG_MIGRATE_TODO="Tus datos se han dejado como estaban: sigues con la versión anterior."
MSG_SHORTCUT_WARN="No se ha podido crear el acceso directo. YTCreator funciona igual sin él."
MSG_UNEXPECTED_WHAT="Algo ha fallado durante la instalación."
MSG_UNEXPECTED_TODO="Vuelve a pegar la línea de instalación; si sigue pasando, cuéntanoslo con el registro de abajo."
MSG_INTERRUPTED="Instalación interrumpida."
MSG_RETRY_LINE="Cuando lo tengas, vuelve a pegar la misma línea: seguirá donde se quedó."
MSG_TEST_HOOK_WHAT="Interrupción de prueba en este paso."

# --- Logging (R2): before APP_HOME exists, the log lives in a temp file moved once step 2 creates it -------
LOG_FILE="$(mktemp 2>/dev/null || echo "/tmp/ytcreator-install-$$.log")"
KNOWN_EXIT=0

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >>"${LOG_FILE}"
}

fail() {
  local code="$1" what="$2" todo="${3:-}"
  KNOWN_EXIT=1
  echo "" >&2
  echo "$what" >&2
  [ -n "$todo" ] && echo "$todo" >&2
  echo "$MSG_RETRY_LINE" >&2
  echo "Registro: ${LOG_FILE}" >&2
  log "FAIL code=$code: $what"
  exit "$code"
}

on_interrupt() {
  echo "" >&2
  echo "$MSG_INTERRUPTED" >&2
  echo "$MSG_RETRY_LINE" >&2
  echo "Registro: ${LOG_FILE}" >&2
  log "interrupted by signal"
  KNOWN_EXIT=1
  exit 99
}
trap on_interrupt INT TERM

on_exit() {
  local code="$1"
  if [ "$code" != 0 ] && [ "$KNOWN_EXIT" != "1" ]; then
    echo "" >&2
    echo "$MSG_UNEXPECTED_WHAT" >&2
    echo "$MSG_UNEXPECTED_TODO" >&2
    echo "$MSG_RETRY_LINE" >&2
    echo "Registro: ${LOG_FILE}" >&2
    log "unexpected exit code=$code"
  fi
}
trap 'on_exit $?' EXIT

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# --- Step 1: comprobando tu ordenador ------------------------------------------------------------------------
step1_done() { return 1; }

step1_run() {
  detect_platform
  check_required_tools
  check_disk_space
}

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin) PLATFORM_OS="darwin" ;;
    Linux) PLATFORM_OS="linux" ;;
    *) fail 10 "$MSG_UNSUPPORTED_WHAT" "$MSG_UNSUPPORTED_TODO" ;;
  esac
  case "$arch" in
    arm64 | aarch64) PLATFORM_ARCH="arm64" ;;
    x86_64 | amd64) PLATFORM_ARCH="x64" ;;
    *) fail 10 "$MSG_UNSUPPORTED_WHAT" "$MSG_UNSUPPORTED_TODO" ;;
  esac
  PLATFORM="${PLATFORM_OS}-${PLATFORM_ARCH}"
  case "$PLATFORM_OS" in
    darwin) APP_HOME="$HOME/Library/Application Support/YTCreator" ;;
    linux) APP_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/ytcreator" ;;
  esac
  WORKSPACE="$HOME/YTCreator"
}

check_required_tools() {
  local tool
  for tool in curl tar script; do
    command -v "$tool" >/dev/null 2>&1 || fail 11 "$MSG_MISSING_TOOL_WHAT" "$MSG_MISSING_TOOL_TODO"
  done
  if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
    fail 11 "$MSG_MISSING_TOOL_WHAT" "$MSG_MISSING_TOOL_TODO"
  fi
}

check_disk_space() {
  # Kept out of test runs: df output and thresholds aren't worth making deterministic across CI runners.
  [ "${YTCREATOR_INSTALL_TEST}" = "1" ] && return 0
  local avail_kb
  avail_kb="$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2{print $4}')"
  [ -n "${avail_kb:-}" ] || return 0
  [ "$avail_kb" -ge 524288 ] && return 0
  if [ "${YTCREATOR_ASSUME_YES}" = "1" ]; then return 0; fi
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf "%s" "$MSG_LOW_DISK_PROMPT" >/dev/tty
    local answer=""
    read -r answer </dev/tty || true
    case "$answer" in
      [sS]*) return 0 ;;
    esac
  fi
  fail 12 "$MSG_LOW_DISK_STOP" ""
}

# --- Step 2: preparando las carpetas (R3) --------------------------------------------------------------------
step2_done() {
  [ -d "$APP_HOME/secrets" ] && [ -d "$APP_HOME/claude-accounts" ] && [ -f "$WORKSPACE/.ytcreator" ]
}

step2_run() {
  if [ -d "$WORKSPACE" ] && [ ! -f "$WORKSPACE/.ytcreator" ] && [ -n "$(ls -A "$WORKSPACE" 2>/dev/null)" ]; then
    fail 20 "$MSG_FOREIGN_WORKSPACE_WHAT" "$MSG_FOREIGN_WORKSPACE_TODO"
  fi
  mkdir -p "$APP_HOME" "$APP_HOME/runtime" "$APP_HOME/versions" "$APP_HOME/logs" "$APP_HOME/backups" "$WORKSPACE" \
    || fail 21 "$MSG_NO_PERMISSION_WHAT" "$MSG_NO_PERMISSION_TODO"
  mkdir -p "$APP_HOME/secrets" || fail 21 "$MSG_NO_PERMISSION_WHAT" "$MSG_NO_PERMISSION_TODO"
  chmod 700 "$APP_HOME/secrets"
  mkdir -p "$APP_HOME/claude-accounts" || fail 21 "$MSG_NO_PERMISSION_WHAT" "$MSG_NO_PERMISSION_TODO"
  chmod 700 "$APP_HOME/claude-accounts"
  : >"$WORKSPACE/.ytcreator"

  local real_log
  real_log="$APP_HOME/logs/install-$(date +%Y%m%d-%H%M%S).log"
  cat "$LOG_FILE" >>"$real_log" 2>/dev/null || true
  rm -f "$LOG_FILE"
  LOG_FILE="$real_log"
}

# --- Download + checksum helper, shared by steps 3 and 4 (R2: a cut never leaves a half-good file) ----------
download_verify() {
  local name="$1" expected="$2" base="$3" dest="$4"
  local tmp="${dest}.partial"
  local attempt mismatched=0 ok=0
  for attempt in 1 2 3; do
    rm -f "$tmp"
    if curl -fL -o "$tmp" "${base}/${name}" >>"${LOG_FILE}" 2>&1; then
      local actual
      actual="$(sha256_of "$tmp")"
      if [ "$actual" = "$expected" ]; then
        ok=1
        break
      fi
      log "checksum mismatch for $name (attempt $attempt): expected $expected got $actual"
      mismatched=1
    else
      log "download failed for $name (attempt $attempt)"
    fi
  done
  if [ "$ok" = "1" ]; then
    mv "$tmp" "$dest"
    return 0
  fi
  rm -f "$tmp"
  if [ "$mismatched" = "1" ]; then
    fail 31 "$MSG_CHECKSUM_WHAT" "$MSG_CHECKSUM_TODO"
  else
    fail 30 "$MSG_DOWNLOAD_WHAT" "$MSG_DOWNLOAD_TODO"
  fi
}

# --- Step 3: descargando el motor (Node, R1) -----------------------------------------------------------------
step3_done() {
  [ -x "$APP_HOME/runtime/node-v${NODE_VERSION}/bin/node" ] \
    && [ "$("$APP_HOME/runtime/node-v${NODE_VERSION}/bin/node" --version)" = "v${NODE_VERSION}" ]
}

sha_for_node_platform() {
  case "$PLATFORM" in
    darwin-arm64) echo "$SHA_NODE_DARWIN_ARM64" ;;
    darwin-x64) echo "$SHA_NODE_DARWIN_X64" ;;
    linux-x64) echo "$SHA_NODE_LINUX_X64" ;;
    linux-arm64) echo "$SHA_NODE_LINUX_ARM64" ;;
  esac
}

step3_run() {
  mkdir -p "$APP_HOME/runtime"
  local archive="node-v${NODE_VERSION}-${PLATFORM}.tar.gz"
  download_verify "$archive" "$(sha_for_node_platform)" "$YTCREATOR_NODE_BASE" "$APP_HOME/runtime/${archive}"
  tar -xzf "$APP_HOME/runtime/${archive}" -C "$APP_HOME/runtime"
  rm -f "$APP_HOME/runtime/${archive}"
  rm -rf "$APP_HOME/runtime/node-v${NODE_VERSION}"
  mv "$APP_HOME/runtime/node-v${NODE_VERSION}-${PLATFORM}" "$APP_HOME/runtime/node-v${NODE_VERSION}"
}

# --- Step 4: descargando YTCreator ------------------------------------------------------------------------
step4_done() {
  [ -f "$APP_HOME/versions/${YTCREATOR_VERSION}/VERSION" ] \
    && [ "$(cat "$APP_HOME/versions/${YTCREATOR_VERSION}/VERSION")" = "$YTCREATOR_VERSION" ]
}

step4_run() {
  mkdir -p "$APP_HOME/versions"
  local archive="ytcreator-${YTCREATOR_VERSION}.tar.gz"
  download_verify "$archive" "$SHA_RELEASE" "$YTCREATOR_RELEASE_BASE" "$APP_HOME/versions/${archive}"
  local dest="$APP_HOME/versions/${YTCREATOR_VERSION}"
  rm -rf "${dest}.new"
  mkdir -p "${dest}.new"
  tar -xzf "$APP_HOME/versions/${archive}" -C "${dest}.new"
  rm -f "$APP_HOME/versions/${archive}"
  rm -rf "$dest"
  mv "${dest}.new" "$dest"
  chmod +x "$dest/bin/ytcreator" 2>/dev/null || true
}

# --- Step 5: instalando Claude Code (never stops the install, FR per contract) -------------------------------
claude_available() {
  command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ]
}

step5_done() { claude_available; }

step5_run() {
  if ! curl -fsSL "$YTCREATOR_CLAUDE_INSTALL_URL" 2>>"${LOG_FILE}" | bash >>"${LOG_FILE}" 2>&1; then
    log "claude code installer exited non-zero"
  fi
  if ! claude_available; then
    echo "$MSG_CLAUDE_WARN"
    log "claude code still not available after install attempt"
  fi
}

# --- Step 6: preparando tus datos (install/update + migrate, R21) -------------------------------------------
step6_done() {
  [ -L "$APP_HOME/current" ] && [ "$(readlink "$APP_HOME/current")" = "$APP_HOME/versions/${YTCREATOR_VERSION}" ]
}

extract_json_number() {
  grep -o "\"$2\"[[:space:]]*:[[:space:]]*[0-9]*" "$1" 2>/dev/null | head -n1 | grep -o '[0-9]*$'
}

extract_json_string() {
  grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$1" 2>/dev/null | head -n1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
}

stop_running_instance() {
  local inst="$APP_HOME/instance.json" pid
  [ -f "$inst" ] || return 0
  pid="$(extract_json_number "$inst" pid)"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  kill -TERM "$pid" 2>/dev/null || true
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 50 ]; do
    sleep 0.1
    waited=$((waited + 1))
  done
}

prune_backups() {
  # Backup filenames embed a sortable timestamp (ytcreator-<version>-<YYYYMMDD-HHMMSS>.db), so the default
  # lexical glob order is also chronological order; oldest first.
  local dir="$APP_HOME/backups"
  local files=("$dir"/*.db)
  [ -e "${files[0]}" ] || return 0
  while [ "${#files[@]}" -gt 3 ]; do
    rm -f "${files[0]}"
    files=("${files[@]:1}")
  done
}

write_install_json() {
  local previous="$1" now installed_at
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  installed_at="$now"
  if [ -f "$APP_HOME/install.json" ]; then
    local existing
    existing="$(extract_json_string "$APP_HOME/install.json" installedAt)"
    [ -n "$existing" ] && installed_at="$existing"
  fi
  local previous_json="null"
  [ -n "$previous" ] && previous_json="\"$previous\""
  cat >"$APP_HOME/install.json" <<JSON
{
  "schemaVersion": 1,
  "version": "${YTCREATOR_VERSION}",
  "previousVersion": ${previous_json},
  "workspacePath": "${WORKSPACE}",
  "platform": "${PLATFORM}",
  "installedAt": "${installed_at}",
  "updatedAt": "${now}"
}
JSON
}

step6_run() {
  local new_dir="$APP_HOME/versions/${YTCREATOR_VERSION}"
  local db="$WORKSPACE/ytcreator.db"
  local previous="" backup=""

  if [ -L "$APP_HOME/current" ]; then
    previous="$(basename "$(readlink "$APP_HOME/current")")"
  fi

  if [ -n "$previous" ] && [ "$previous" != "$YTCREATOR_VERSION" ]; then
    stop_running_instance
    if [ -f "$db" ]; then
      mkdir -p "$APP_HOME/backups"
      backup="$APP_HOME/backups/ytcreator-${previous}-$(date +%Y%m%d-%H%M%S).db"
      cp "$db" "$backup"
      prune_backups
    fi
  fi

  # Runs at its real versions/<v> path, before "current" points at it: YTC_APP_HOME tells the launcher where
  # APP_HOME actually is, since that can't be derived from this path's depth (bin/ytcreator).
  if ! YTC_APP_HOME="$APP_HOME" "${new_dir}/bin/ytcreator" migrate >>"${LOG_FILE}" 2>&1; then
    [ -n "$backup" ] && [ -f "$backup" ] && cp "$backup" "$db"
    fail 60 "$MSG_MIGRATE_WHAT" "$MSG_MIGRATE_TODO"
  fi

  ln -sfn "$new_dir" "$APP_HOME/current"
  write_install_json "$previous"
}

# --- Step 7: creando el acceso directo (R6; never stops the install) ----------------------------------------
step7_done() {
  case "$PLATFORM_OS" in
    darwin) [ -x "$HOME/Applications/YTCreator.app/Contents/MacOS/YTCreator" ] ;;
    linux) [ -f "$HOME/.local/share/applications/ytcreator.desktop" ] ;;
  esac
}

create_shortcut_darwin() {
  local app="$HOME/Applications/YTCreator.app"
  mkdir -p "$app/Contents/MacOS" || return 1
  cat >"$app/Contents/Info.plist" <<PLIST || return 1
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>YTCreator</string>
  <key>CFBundleIdentifier</key><string>com.ytcreator.app</string>
  <key>CFBundleExecutable</key><string>YTCreator</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict>
</plist>
PLIST
  cat >"$app/Contents/MacOS/YTCreator" <<SCRIPT || return 1
#!/usr/bin/env bash
exec "${APP_HOME}/current/bin/ytcreator" open
SCRIPT
  chmod +x "$app/Contents/MacOS/YTCreator"
}

create_shortcut_linux() {
  local dir="$HOME/.local/share/applications"
  mkdir -p "$dir" || return 1
  cat >"$dir/ytcreator.desktop" <<DESKTOP || return 1
[Desktop Entry]
Type=Application
Name=YTCreator
Exec="${APP_HOME}/current/bin/ytcreator" open
Terminal=false
Categories=AudioVideo;
DESKTOP
}

step7_run() {
  local created=1
  case "$PLATFORM_OS" in
    darwin) create_shortcut_darwin && created=0 ;;
    linux) create_shortcut_linux && created=0 ;;
  esac
  if [ "$created" != 0 ]; then
    echo "$MSG_SHORTCUT_WARN"
    log "shortcut creation failed; continuing without it"
  fi
  return 0
}

# --- Step 8: abriendo YTCreator -------------------------------------------------------------------------------
step8_done() { return 1; }

step8_run() {
  # "open" (R6) IS the running app once started (serve() blocks on the listening socket until shutdown), the
  # same way a double-clicked .app/.desktop launch works. Here the install script itself is the parent and
  # must finish and hand the terminal back, so it is launched decoupled (setsid when available, else nohup)
  # instead of waited on.
  if command -v setsid >/dev/null 2>&1; then
    setsid "$APP_HOME/current/bin/ytcreator" open >>"${LOG_FILE}" 2>&1 </dev/null &
  else
    nohup "$APP_HOME/current/bin/ytcreator" open >>"${LOG_FILE}" 2>&1 </dev/null &
  fi
  disown 2>/dev/null || true
}

# --- Driver ----------------------------------------------------------------------------------------------------
run_step() {
  local n="$1" text="$2"
  echo "Paso ${n} de 8 · ${text}"
  if [ "${YTCREATOR_INSTALL_TEST}" = "1" ] && [ "${YTCREATOR_INSTALL_FAIL_STEP}" = "$n" ]; then
    log "step $n: forced failure (test hook)"
    fail 99 "$MSG_TEST_HOOK_WHAT" ""
  fi
  if "step${n}_done"; then
    log "step $n: already done, skipping"
  else
    "step${n}_run"
  fi
  echo "✓"
}

main() {
  echo "$MSG_NEEDS_AI_1"
  echo "$MSG_NEEDS_AI_2"
  echo ""
  run_step 1 "$MSG_STEP1"
  run_step 2 "$MSG_STEP2"
  run_step 3 "$MSG_STEP3"
  run_step 4 "$MSG_STEP4"
  run_step 5 "$MSG_STEP5"
  run_step 6 "$MSG_STEP6"
  run_step 7 "$MSG_STEP7"
  run_step 8 "$MSG_STEP8"

  local place="el menú de aplicaciones"
  [ "$PLATFORM_OS" = "darwin" ] && place="Launchpad"
  echo ""
  echo "$MSG_DONE"
  echo "  Se ha abierto en tu navegador. La próxima vez, ábrelo desde ${place}."
  echo "  Ya puedes cerrar esta ventana."
}

main "$@"

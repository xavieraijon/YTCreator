# Instalador de YTCreator para Windows 10 y 11. Se lanza con una sola línea en PowerShell:
#
#     irm https://raw.githubusercontent.com/xavieraijon/YTCreator/main/instalar.ps1 | iex
#
# Hace lo mismo que instalar.sh (Mac y Linux), en la carpeta del usuario y sin administrador salvo git (lo instala
# winget, que puede pedir permiso con una ventana de Windows): git, Python (con uv), ffmpeg, Node, las pantallas de la
# aplicación, la carpeta de trabajo ~\YTCreator (con el programa en ~\YTCreator\programa), Claude Code y el inicio de
# sesión con la cuenta de Claude. Desde el paso 3 se ve en el navegador (herramientas/instalar_progreso.py).
#
# Se puede repetir: cada paso mira primero si ya está; repetirlo con YTCreator instalado = actualizarlo.
# Registro: ~\YTCreator\programa\programas\instalar.log.
#
# Variables (para pruebas): YTC_CARPETA, YTC_REPO, YTC_PRUEBA=1 (no abre la aplicación ni pone accesos en el
# Escritorio), YTC_SIN_CLAUDE=1 (no instala Claude Code ni pide iniciar sesión).
#
# Todo va dentro de una función que se llama en la última línea (si la descarga se corta, no se ejecuta nada) y sin
# `exit`, que cerraría la ventana de PowerShell de la persona.

function Instalar-YTCreator {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'          # la barra de Invoke-WebRequest lo hace 10 veces más lento
    try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $Repo = if ($env:YTC_REPO) { $env:YTC_REPO } else { 'https://github.com/xavieraijon/YTCreator.git' }
    $Carpeta = if ($env:YTC_CARPETA) { $env:YTC_CARPETA } else { Join-Path $HOME 'YTCreator' }
    $Kit = Join-Path $Carpeta 'programa'
    $Py = Join-Path $Kit '.venv\Scripts\python.exe'
    $Puerto = 8765
    $Total = 11
    $script:Pantalla = $false
    $script:AppAbierta = $false
    $Tmp = Join-Path ([IO.Path]::GetTempPath()) ("ytcreator-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
    $Log = Join-Path $Tmp 'salida.log'

    # --- Mensajes ------------------------------------------------------------------------------------------------------

    function Decir([string]$texto = '', [string]$color = '') {
        if ($color) { Write-Host $texto -ForegroundColor $color } else { Write-Host $texto }
    }

    function Registro([string]$texto) {
        if (Test-Path (Join-Path $Kit 'herramientas')) {
            $p = Join-Path $Kit 'programas'
            New-Item -ItemType Directory -Force -Path $p | Out-Null
            Add-Content -Path (Join-Path $p 'instalar.log') -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $texto) -Encoding UTF8
        }
    }

    function Progreso([int]$n, [string]$estado, [string]$texto = '') {
        switch ($estado) {
            'marcha' { Decir "⏳ $n/$Total $texto" 'White' }
            'ok' { Decir ("✅ Paso $n hecho" + $(if ($texto) { ": $texto" } else { '' })) 'Green' }
            'aviso' { Decir ("⚠️  Paso $n hecho con un aviso" + $(if ($texto) { ": $texto" } else { '' })) 'Yellow' }
            'error' { Decir "❌ Paso ${n}: $texto" 'Red' }
        }
        Registro "paso $n $estado $texto"
        if ($script:Pantalla) {
            & $Py (Join-Path $Kit 'herramientas\instalar_progreso.py') paso $n $estado $texto *> $null
        }
    }

    function Nota([string]$texto = '') {
        if ($script:Pantalla) { & $Py (Join-Path $Kit 'herramientas\instalar_progreso.py') nota $texto *> $null }
    }

    function Fallar([int]$n, [string]$que, [string]$hacer = '') {
        throw [Exception]::new("$n|$que|$hacer")
    }

    function Ejecutar {
        # Ejecutar <programa> <argumentos…>: su salida va al registro; devuelve $true si acaba bien
        param([string]$programa, [Parameter(ValueFromRemainingArguments = $true)][string[]]$argumentos)
        $destino = Join-Path $Kit 'programas\instalar.log'
        if (-not (Test-Path (Split-Path $destino))) { $destino = $Log }
        $ErrorActionPreference = 'Continue'           # la salida de error de un programa no es un fallo de PowerShell
        & $programa @argumentos *>> $destino
        return ($LASTEXITCODE -eq 0)
    }

    function Ultimas-Lineas {
        $destino = Join-Path $Kit 'programas\instalar.log'
        if (-not (Test-Path $destino)) { $destino = $Log }
        if (Test-Path $destino) { Get-Content $destino -Tail 5 | ForEach-Object { Decir $_ } }
    }

    function Descargar([string]$url, [string]$archivo) {
        for ($i = 1; $i -le 3; $i++) {
            try { Invoke-WebRequest -Uri $url -OutFile $archivo -UseBasicParsing; return $true }
            catch { Start-Sleep -Seconds 3 }
        }
        return $false
    }

    function Puerto-Ocupado {
        try {
            $c = New-Object Net.Sockets.TcpClient
            $r = $c.BeginConnect('127.0.0.1', $Puerto, $null, $null)
            $ok = $r.AsyncWaitHandle.WaitOne(1000) -and $c.Connected
            $c.Close()
            return $ok
        } catch { return $false }
    }

    function Refrescar-Path {
        # lo que acaba de instalar winget no está en el PATH de esta ventana
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    }

    function Interactivo {
        # ¿hay alguien delante? (lanzado por Claude o en segundo plano, la entrada no es el teclado)
        try { return -not [Console]::IsInputRedirected } catch { return $false }
    }

    function Preguntar-Si([string]$pregunta) {
        if (-not (Interactivo)) { return $true }
        $r = Read-Host "$pregunta [s/n]"
        return ($r -eq '' -or $r -match '^(s|si|sí|y)$')
    }

    # --- 1. Comprobar tu ordenador -------------------------------------------------------------------------------------

    function Paso1 {
        Decir ''
        Decir 'Instalando YTCreator · unos 20 minutos, casi todo esperando descargas' 'White'
        Decir 'No cierres esta ventana hasta que termine. Al llegar al paso 3 se abrirá tu navegador con el progreso.'
        Decir ''
        Progreso 1 marcha 'Comprobar tu ordenador'
        if ($env:OS -ne 'Windows_NT') { Fallar 1 'Este instalador es para Windows.' 'En Mac o Linux, usa la línea de instalar.sh del README.' }
        $build = [Environment]::OSVersion.Version.Build
        if ($build -lt 17763) { Fallar 1 "YTCreator necesita Windows 10 (versión 1809 o más nueva) o Windows 11." }
        $cpu = $env:PROCESSOR_ARCHITECTURE
        if ($cpu -ne 'AMD64' -and $cpu -ne 'ARM64') { Fallar 1 "Tu procesador ($cpu) no está entre los que YTCreator admite (Windows de 64 bits)." }
        $script:Cpu = if ($cpu -eq 'ARM64') { 'arm64' } else { 'x64' }
        $unidad = (Get-Item $HOME).PSDrive
        $libre = [math]::Floor($unidad.Free / 1GB)
        Decir "Es un ordenador con Windows ($(if ($build -ge 22000) { '11' } else { '10' }), $($script:Cpu)) con $libre GB libres."
        if ($libre -lt 3) {
            Decir 'Hay menos de 3 GB libres: YTCreator ocupa ~1 GB y tus vídeos necesitan sitio.' 'Yellow'
            if (-not (Preguntar-Si '¿Seguir de todos modos?')) { throw [Exception]::new('parado') }
        }
        Progreso 1 ok
    }

    # --- 2. Descargar YTCreator ----------------------------------------------------------------------------------------

    function Instalar-Git {
        if (Get-Command git -ErrorAction SilentlyContinue) { return }
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
            Fallar 2 'Falta git (el programa que descarga YTCreator) y este Windows no tiene winget para instalarlo.' `
                'Instálalo desde https://git-scm.com/download/win (todo «Siguiente») y vuelve a pegar la línea.'
        }
        Decir ''
        Decir 'Falta git (el programa que descarga YTCreator). Se instala ahora; puede salir una ventana de Windows' 'White'
        Decir 'preguntando si permites cambios en el equipo: pulsa «Sí».' 'White'
        Ejecutar winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent | Out-Null
        Refrescar-Path
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            Fallar 2 'No se ha podido instalar git.' 'Instálalo desde https://git-scm.com/download/win y vuelve a pegar la línea.'
        }
    }

    function Paso2 {
        Progreso 2 marcha 'Descargar YTCreator (en la carpeta YTCreator de tu carpeta personal)'
        Instalar-Git
        if (Test-Path (Join-Path $Kit 'herramientas\sistema.py')) {
            if (Test-Path (Join-Path $Kit '.git')) {
                if (git -C $Kit status --porcelain --untracked-files=no 2>$null) {
                    Progreso 2 aviso 'ya estaba; tiene cambios hechos a mano, así que no se actualiza'
                    return
                }
                $antes = git -C $Kit rev-parse HEAD
                if (Ejecutar git -C $Kit pull --ff-only) {
                    if ($antes -eq (git -C $Kit rev-parse HEAD)) { Progreso 2 ok 'ya estaba, en la última versión' }
                    else { Progreso 2 ok 'actualizado a la última versión' }
                } else { Progreso 2 aviso 'ya estaba; no se ha podido actualizar (¿sin internet?)' }
            } else { Progreso 2 ok 'ya estaba' }
            return
        }
        if ((Test-Path $Kit) -and (Get-ChildItem $Kit -Force | Select-Object -First 1)) {
            Fallar 2 "Ya existe la carpeta $Kit y no es YTCreator." 'Cámbiale el nombre o muévela, y vuelve a pegar la línea.'
        }
        New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
        if (-not (Ejecutar git clone --quiet $Repo $Kit)) {
            Ultimas-Lineas
            Fallar 2 'No se ha podido descargar YTCreator.' 'Comprueba la conexión a internet.'
        }
        if (-not (Test-Path (Join-Path $Kit 'herramientas\sistema.py'))) { Fallar 2 'La descarga de YTCreator está incompleta.' }
        Progreso 2 ok
    }

    # --- 3. Python -----------------------------------------------------------------------------------------------------

    function Paso3 {
        Progreso 3 marcha 'Python (el lenguaje de YTCreator) y sus piezas, entre ellas yt-dlp, que consulta YouTube'
        $uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
        if (-not $uv -and (Test-Path "$HOME\.local\bin\uv.exe")) { $uv = "$HOME\.local\bin\uv.exe" }
        if (-not $uv) {
            # uv (el instalador de Python) va a ~\.local\bin, sin administrador ni tocar el PATH
            $env:UV_NO_MODIFY_PATH = '1'
            $env:INSTALLER_NO_MODIFY_PATH = '1'
            if (-not (Ejecutar powershell -NoProfile -ExecutionPolicy Bypass -Command 'irm https://astral.sh/uv/install.ps1 | iex')) {
                Ultimas-Lineas; Fallar 3 'No se ha podido instalar uv (el instalador de Python).'
            }
            $uv = "$HOME\.local\bin\uv.exe"
        }
        $version = if (Test-Path $Py) { & $Py --version 2>$null } else { '' }
        if ($version -notmatch '^Python 3\.13') {
            if (-not (Ejecutar $uv venv --clear --seed --python 3.13 (Join-Path $Kit '.venv'))) {
                Ultimas-Lineas; Fallar 3 'No se ha podido instalar Python 3.13.'
            }
        }
        if (-not (Ejecutar $uv pip install --python (Join-Path $Kit '.venv') -r (Join-Path $Kit 'requirements.txt') -r (Join-Path $Kit 'ui\backend\requirements.txt'))) {
            Ultimas-Lineas; Fallar 3 'No se han podido instalar las piezas de Python.' 'Comprueba la conexión a internet.'
        }
        if (-not (Ejecutar $Py -c 'import fastapi, PIL, numpy, yt_dlp')) { Fallar 3 'Python se ha instalado pero le faltan piezas.' }
        # en cuanto hay Python, la pantalla del navegador (si quedó la de un intento anterior, se cierra y se abre de nuevo;
        # en una actualización con la aplicación abierta, no: ocupa su sitio)
        & $Py (Join-Path $Kit 'herramientas\instalar_progreso.py') detener *> $null
        if (Puerto-Ocupado) {
            $script:AppAbierta = $true
        } elseif (Ejecutar $Py (Join-Path $Kit 'herramientas\instalar_progreso.py') iniciar --desde 3) {
            $script:Pantalla = $true
            Decir ''
            Decir 'Se ha abierto tu navegador con el progreso de la instalación. Puedes seguirla allí; si te hace falta' 'White'
            Decir 'hacer algo, te lo dirá. No cierres esta ventana.' 'White'
            Decir ''
        }
        Progreso 3 ok 'Python 3.13 instalado'
    }

    # --- 4. ffmpeg -----------------------------------------------------------------------------------------------------

    function Paso4 {
        Progreso 4 marcha 'ffmpeg, el programa que monta los vídeos'
        $p = Join-Path $Kit 'programas'
        New-Item -ItemType Directory -Force -Path $p | Out-Null
        if ((Test-Path "$p\ffmpeg.exe") -and (Test-Path "$p\ffprobe.exe") -and (Ejecutar "$p\ffmpeg.exe" -version)) {
            Progreso 4 ok 'ya estaba'; return
        }
        # versión estática de gyan.dev (la que enlaza ffmpeg.org para Windows); en Windows ARM funciona emulada
        $d = Join-Path $Tmp 'ffmpeg'
        New-Item -ItemType Directory -Force -Path "$d\x" | Out-Null
        $url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
        if (-not (Descargar $url "$d\ff.zip")) { Fallar 4 'No se ha podido descargar ffmpeg.' 'Comprueba la conexión a internet.' }
        if (Descargar "$url.sha256" "$d\ff.sha256") {
            $suma = ((Get-Content "$d\ff.sha256" -Raw).Trim() -split '\s+')[0]
            if ((Get-FileHash "$d\ff.zip" -Algorithm SHA256).Hash -ne $suma.ToUpper()) {
                Fallar 4 'La descarga de ffmpeg no es la original (la comprobación no coincide).'
            }
        }
        if (-not (Ejecutar tar -xf "$d\ff.zip" -C "$d\x")) { Fallar 4 'La descarga de ffmpeg está dañada.' }
        foreach ($prog in 'ffmpeg.exe', 'ffprobe.exe') {
            $f = Get-ChildItem "$d\x" -Recurse -Filter $prog | Select-Object -First 1
            if (-not $f) { Fallar 4 "La descarga de ffmpeg no trae $prog." }
            Copy-Item $f.FullName (Join-Path $p $prog) -Force
        }
        if (-not ((Ejecutar "$p\ffmpeg.exe" -version) -and (Ejecutar "$p\ffprobe.exe" -version))) {
            Fallar 4 'ffmpeg se ha descargado pero no funciona en este ordenador.'
        }
        Progreso 4 ok
    }

    # --- 5. Node -------------------------------------------------------------------------------------------------------

    function Paso5 {
        Progreso 5 marcha 'Node, que prepara las pantallas de la aplicación'
        $destino = Join-Path $Kit 'ui\.node'
        if ((Test-Path "$destino\node.exe") -and ((& "$destino\node.exe" --version 2>$null) -match '^v24\.')) {
            Progreso 5 ok 'ya estaba'; return
        }
        $base = 'https://nodejs.org/dist/latest-v24.x'
        $d = Join-Path $Tmp 'node'
        New-Item -ItemType Directory -Force -Path "$d\x" | Out-Null
        if (-not (Descargar "$base/SHASUMS256.txt" "$d\SHASUMS256.txt")) { Fallar 5 'No se ha podido consultar la versión de Node.' }
        $linea = Get-Content "$d\SHASUMS256.txt" | Where-Object { $_ -match " node-v24\.[0-9.]+-win-$($script:Cpu)\.zip$" } | Select-Object -First 1
        if (-not $linea) { Fallar 5 "No hay Node para este ordenador (win-$($script:Cpu))." }
        $suma, $archivo = $linea -split '\s+'
        if (-not (Descargar "$base/$archivo" "$d\$archivo")) { Fallar 5 'No se ha podido descargar Node.' 'Comprueba la conexión a internet.' }
        if ((Get-FileHash "$d\$archivo" -Algorithm SHA256).Hash -ne $suma.ToUpper()) {
            Fallar 5 'La descarga de Node no es la original (la comprobación no coincide).'
        }
        if (-not (Ejecutar tar -xf "$d\$archivo" -C "$d\x")) { Fallar 5 'La descarga de Node está dañada.' }
        if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
        Move-Item (Join-Path "$d\x" ($archivo -replace '\.zip$', '')) $destino
        if (-not (Ejecutar "$destino\node.exe" --version)) { Fallar 5 'Node se ha descargado pero no funciona en este ordenador.' }
        Progreso 5 ok
    }

    # --- 6. Las pantallas de la aplicación -----------------------------------------------------------------------------

    function Paso6 {
        Progreso 6 marcha 'Las pantallas de la aplicación (la primera vez tarda unos minutos)'
        $env:Path = (Join-Path $Kit 'ui\.node') + ';' + $env:Path
        $front = Join-Path $Kit 'ui\frontend'
        Push-Location $front
        try {
            $bien = (Test-Path 'node_modules') -and (Ejecutar npm.cmd ls --depth=0)
            if (-not $bien -and -not (Ejecutar npm.cmd ci --no-audit --no-fund --loglevel=error)) {
                Ultimas-Lineas; Fallar 6 'No se han podido descargar las piezas de las pantallas.' 'Comprueba la conexión a internet.'
            }
        } finally { Pop-Location }
        # siempre: tras una actualización, las pantallas cambian
        if (-not (Ejecutar $Py (Join-Path $Kit 'ui\arrancar.py') compilar)) { Ultimas-Lineas; Fallar 6 'No se han podido preparar las pantallas.' }
        if (-not (Test-Path "$front\dist\frontend\browser\index.html")) { Fallar 6 'Las pantallas no se han generado.' }
        Progreso 6 ok
    }

    # --- 7. Tu carpeta de trabajo --------------------------------------------------------------------------------------

    function Crear-Lanzador {
        # «Abrir YTCreator» para los días siguientes, sin terminal ni Claude
        $l = Join-Path $Carpeta 'Abrir YTCreator.cmd'
        $contenido = @"
@echo off
rem Abre YTCreator (lo creó el instalador). Si ya está abierto, solo abre el navegador.
cd /d "$Kit"
curl -s -o nul --max-time 2 http://127.0.0.1:$Puerto/
if errorlevel 1 (
    start "" /min "$Py" "$Kit\ui\arrancar.py"
    for /l %%i in (1,1,60) do (
        curl -s -o nul --max-time 1 http://127.0.0.1:$Puerto/ && goto abierto
        timeout /t 1 /nobreak >nul
    )
)
:abierto
start "" http://127.0.0.1:$Puerto
"@
        # cmd lee los .cmd en la página de códigos del sistema: sin BOM y sin caracteres raros en las órdenes
        [IO.File]::WriteAllText($l, $contenido, (New-Object Text.UTF8Encoding $false))
        if ($env:YTC_PRUEBA -eq '1') { return }
        try {
            $escritorio = [Environment]::GetFolderPath('Desktop')
            $ws = New-Object -ComObject WScript.Shell
            $acceso = $ws.CreateShortcut((Join-Path $escritorio 'YTCreator.lnk'))
            $acceso.TargetPath = $l
            $acceso.WorkingDirectory = $Kit
            $acceso.WindowStyle = 7                   # minimizada
            $acceso.Description = 'Crea y produce tus canales de YouTube'
            $acceso.Save()
        } catch {}
    }

    function Paso7 {
        Progreso 7 marcha 'Tu carpeta YTCreator, donde se guardan tus canales y vídeos'
        $info = & $Py (Join-Path $Kit 'herramientas\espacio.py') 2>$null
        $actual = ($info | Where-Object { $_ -like 'espacio: *' } | Select-Object -First 1) -replace '^espacio: ', ''
        if (($info -contains 'separado: True') -and $actual -and (Test-Path $actual)) {
            # ya elegido (quizá en otro sitio, con canales): se respeta y solo se reparan los enlaces
            $env:CANALYT_ESPACIO = $actual
            if (-not (Ejecutar $Py (Join-Path $Kit 'herramientas\espacio.py') preparar)) { Fallar 7 "No se ha podido revisar tu carpeta de trabajo ($actual)." }
            Set-Variable -Name Carpeta -Value $actual -Scope 1
            # una actualización puede cambiar el formato de los guiones: se adaptan los que ya hay
            if (-not (Ejecutar $Py (Join-Path $Kit 'herramientas\esquema.py') actualizar)) { Fallar 7 'No se han podido adaptar tus guiones a la versión nueva.' }
            Progreso 7 ok 'ya estaba'
        } else {
            if (-not (Ejecutar $Py (Join-Path $Kit 'herramientas\espacio.py') elegir $Carpeta)) { Ultimas-Lineas; Fallar 7 'No se ha podido preparar tu carpeta de trabajo.' }
            $env:CANALYT_ESPACIO = $Carpeta
            if (-not (Ejecutar $Py (Join-Path $Kit 'herramientas\espacio.py') preparar)) { Ultimas-Lineas; Fallar 7 'No se ha podido preparar tu carpeta de trabajo.' }
            Progreso 7 ok
        }
        Remove-Item Env:\CANALYT_ESPACIO -ErrorAction SilentlyContinue
        # historial de tus canales (git local, nunca se sube a ningún sitio)
        if (-not (Test-Path (Join-Path $Carpeta '.git'))) { Ejecutar git -C $Carpeta init -q | Out-Null }
        if (-not (git -C $Carpeta config user.name 2>$null)) {
            $nombre = ''
            if (Interactivo) {
                Nota 'Mira la ventana de PowerShell: te pregunta tu nombre.'
                Decir ''
                $nombre = Read-Host "¿Qué nombre quieres que aparezca en el historial de tus canales? (Intro para «$env:USERNAME»)"
                Nota ''
            }
            if (-not $nombre) { $nombre = $env:USERNAME }
            git -C $Carpeta config user.name $nombre
        }
        # el historial es solo local: basta un correo de este equipo
        if (-not (git -C $Carpeta config user.email 2>$null)) { git -C $Carpeta config user.email "$env:USERNAME@ytcreator.local" }
        Crear-Lanzador
        git -C $Carpeta rev-parse -q --verify HEAD *> $null
        if ($LASTEXITCODE -ne 0) {
            Ejecutar git -C $Carpeta add -A | Out-Null
            Ejecutar git -C $Carpeta commit -q -m 'Carpeta de trabajo de YTCreator' | Out-Null
        }
    }

    # --- 8. Claude -----------------------------------------------------------------------------------------------------

    function Buscar-Claude {
        $c = (Get-Command claude -ErrorAction SilentlyContinue).Source
        if (-not $c -and (Test-Path "$HOME\.local\bin\claude.exe")) { $c = "$HOME\.local\bin\claude.exe" }
        if ($c -and (Ejecutar $c --version)) { $script:Claude = $c; return $true }
        return $false
    }

    function Paso8 {
        Progreso 8 marcha 'Claude Code, la IA que escribe contigo y maneja YTCreator'
        $script:Claude = ''
        if ($env:YTC_SIN_CLAUDE -eq '1') { Progreso 8 aviso 'no instalado (YTC_SIN_CLAUDE)'; return }
        if (Buscar-Claude) { Progreso 8 ok 'ya estaba'; return }
        if (-not (Ejecutar powershell -NoProfile -ExecutionPolicy Bypass -Command 'irm https://claude.ai/install.ps1 | iex')) {
            Ultimas-Lineas; Fallar 8 'No se ha podido instalar Claude Code.' 'Comprueba la conexión a internet.'
        }
        if (-not (Buscar-Claude)) { Fallar 8 'Claude Code se ha instalado pero no responde.' }
        # que la orden `claude` funcione también en las ventanas nuevas
        $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
        $bin = "$HOME\.local\bin"
        if (-not (($usuario -split ';') -contains $bin)) {
            [Environment]::SetEnvironmentVariable('Path', ($bin + ';' + $usuario).TrimEnd(';'), 'User')
        }
        Progreso 8 ok
    }

    # --- 9. Entrar con tu cuenta de Claude -----------------------------------------------------------------------------

    function Estado-Claude {
        $ErrorActionPreference = 'Continue'
        $json = & $script:Claude auth status --json 2>$null | Out-String
        try { $e = $json | ConvertFrom-Json } catch { return 'fuera' }
        if ($e.loggedIn) { return ('dentro ' + $e.subscriptionType).Trim() }
        return 'fuera'
    }

    function Paso9 {
        Progreso 9 marcha 'Entrar con tu cuenta de Claude'
        if ($env:YTC_SIN_CLAUDE -eq '1' -or -not $script:Claude) { Progreso 9 aviso 'sin Claude Code'; return }
        $estado = Estado-Claude
        if ($estado -eq 'fuera' -and (Interactivo)) {
            Nota 'Vuelve a la ventana de PowerShell (donde pegaste la línea): te pide entrar con tu cuenta de Claude.'
            Decir ''
            Decir 'Ahora entras con tu cuenta de Claude (hace falta un plan de pago: Pro o Max).' 'White'
            Decir 'Se abrirá una pestaña del navegador: entra con tu cuenta y pulsa «Autorizar» (en inglés, «Authorize»).'
            Decir 'Después vuelve aquí. Si la pestaña no se abre, copia en el navegador la dirección que aparece abajo.'
            Decir ''
            $ErrorActionPreference = 'Continue'
            & $script:Claude auth login --claudeai
            $ErrorActionPreference = 'Stop'
            Nota ''
            $estado = Estado-Claude
        }
        switch -regex ($estado) {
            '^fuera$' { Progreso 9 aviso 'sin entrar: hazlo al abrir YTCreator (te lo pedirá)' }
            '^dentro (pro|max|team|enterprise)$' { Progreso 9 ok "dentro, plan $($Matches[1])" }
            '^dentro( free)?$' {
                Progreso 9 aviso 'tu cuenta no tiene plan de pago (Pro o Max): YTCreator no podrá usar a Claude'
                Decir 'Tu cuenta de Claude es del plan gratuito. Pásala a Pro en claude.ai → Ajustes → Facturación.' 'Yellow'
            }
            default { Progreso 9 ok 'dentro' }
        }
    }

    # --- 10. Probar que todo funciona ----------------------------------------------------------------------------------

    function Paso10 {
        Progreso 10 marcha 'Probar que todo funciona'
        $fallos = @()
        Push-Location $Kit
        try {
            $env:CANALYT_ESPACIO = $Carpeta
            $prueba = "import sys, shutil, subprocess; sys.path.insert(0, 'herramientas'); import sistema; " +
                "assert shutil.which('ffmpeg') and shutil.which('ffprobe') and shutil.which('yt-dlp'); " +
                "subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=1', '-y', sys.argv[1]], check=True)"
            if (-not (Ejecutar $Py -c $prueba (Join-Path $Tmp 'prueba.mp4'))) { $fallos += 'ffmpeg/yt-dlp' }
            if (-not (Ejecutar "$Kit\ui\.node\node.exe" --version)) { $fallos += 'node' }
            if (-not (Ejecutar $Py herramientas\espacio.py)) { $fallos += 'carpeta' }
            if (-not (Ejecutar $Py herramientas\canales.py lista)) { $fallos += 'canales' }
            if (-not (Test-Path "$Kit\ui\frontend\dist\frontend\browser\index.html")) { $fallos += 'pantallas' }
        } finally {
            Remove-Item Env:\CANALYT_ESPACIO -ErrorAction SilentlyContinue
            Pop-Location
        }
        if ($fallos) { Fallar 10 ('Algo no funciona: ' + ($fallos -join ', ') + '.') }
        Progreso 10 ok
    }

    # --- 11. Abrir YTCreator -------------------------------------------------------------------------------------------

    function Paso11 {
        Progreso 11 marcha 'Abrir YTCreator'
        if ($env:YTC_PRUEBA -eq '1') {
            if ($script:Pantalla) { & $Py (Join-Path $Kit 'herramientas\instalar_progreso.py') detener *> $null }
            Progreso 11 ok 'sin abrir (YTC_PRUEBA)'
            return
        }
        if ($script:AppAbierta) {
            # actualización con la aplicación abierta: se para para que arranque la versión nueva
            Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
                Where-Object { $_.CommandLine -like "*uvicorn app.main:app --host 127.0.0.1 --port $Puerto*" -or $_.CommandLine -like '*ui\arrancar.py*' } |
                ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            for ($i = 0; $i -lt 20 -and (Puerto-Ocupado); $i++) { Start-Sleep -Milliseconds 500 }
        }
        if ($script:Pantalla) {
            Progreso 11 ok
            & $Py (Join-Path $Kit 'herramientas\instalar_progreso.py') listo *> $null
            Start-Sleep -Seconds 3                     # que la página se entere antes de que se pare su servidor
            & $Py (Join-Path $Kit 'herramientas\instalar_progreso.py') detener *> $null
        }
        $p = Join-Path $Kit 'programas'
        Start-Process -FilePath $Py -ArgumentList "`"$Kit\ui\arrancar.py`"" -WorkingDirectory $Carpeta -WindowStyle Hidden `
            -RedirectStandardOutput "$p\ytcreator.log" -RedirectStandardError "$p\ytcreator-errores.log"
        $arrancada = $false
        for ($i = 0; $i -lt 90; $i++) {
            if (Puerto-Ocupado) { $arrancada = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $arrancada) { Fallar 11 'YTCreator no ha arrancado.' "Mira el registro: $p\ytcreator-errores.log" }
        if (-not $script:Pantalla) { Start-Process "http://127.0.0.1:$Puerto"; Progreso 11 ok }
    }

    function Despedida {
        Decir ''
        Decir '¡Listo! YTCreator está abierto en tu navegador.' 'Green'
        Decir 'Su Asistente te guía para crear tu primer canal.'
        Decir ''
        Decir 'Para abrirlo otro día: haz doble clic en YTCreator en tu Escritorio (o en «Abrir YTCreator» dentro de la'
        Decir 'carpeta YTCreator de tu carpeta personal).'
        Decir "Tus canales y vídeos se guardan en $Carpeta; no borres la carpeta «programa» que hay dentro."
        Decir 'Para actualizarlo, vuelve a pegar la misma línea de instalación.'
        Decir ''
        Decir 'Ya puedes cerrar esta ventana.'
        Registro 'instalación terminada'
    }

    try {
        Paso1
        Paso2
        Registro "--- instalación (Windows $([Environment]::OSVersion.Version) $env:PROCESSOR_ARCHITECTURE) desde $Repo"
        Paso3
        Paso4
        Paso5
        Paso6
        Paso7
        Paso8
        Paso9
        Paso10
        Paso11
        Despedida
    } catch {
        $m = $_.Exception.Message
        if ($m -eq 'parado') { return }
        $partes = $m -split '\|', 3
        if ($partes.Count -eq 3 -and $partes[0] -match '^\d+$') {
            $n, $que, $hacer = $partes
        } else {
            # un fallo que no esperábamos: se cuenta tal cual
            $n = 0; $que = "Error inesperado: $m"; $hacer = ''
        }
        if ([int]$n -gt 0) { Progreso ([int]$n) error $que }
        Nota 'Algo ha fallado. Mira la ventana de PowerShell: ahí te explica qué hacer.'
        Registro "error: $m"
        Decir ''
        Decir "No se ha podido terminar la instalación. $que" 'Red'
        if ($hacer) { Decir $hacer }
        Decir 'Cuando lo arregles, vuelve a pegar la misma línea: sigue por donde iba.'
        Decir 'Ayuda: https://github.com/xavieraijon/YTCreator/blob/main/docs/instalar.md#problemas'
        $registro = Join-Path $Kit 'programas\instalar.log'
        if (Test-Path $registro) { Decir "Registro de lo hecho: $registro" }
    } finally {
        Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Instalar-YTCreator

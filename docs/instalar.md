# Instalar YTCreator: detalles y problemas

La instalación es **una línea** que se pega en la terminal (portada del repositorio, `README.md`). Esta guía explica con
más calma qué hace el instalador, qué te puede pedir y qué hacer si algo sale mal.

> Capturas de pantalla: pendientes (se harán en equipos limpios de Mac, Windows y Linux).

## Lo que necesitas

- Un ordenador con **Mac** (macOS 13 o más nuevo), **Windows** 10 (versión 1809 o posterior) u 11, o **Linux** (Ubuntu
  20.04, Debian 10 o más nuevos), con al menos 4 GB de memoria.
- Unos **3 GB libres**: el programa y sus piezas ocupan ~1 GB; el resto, para tus vídeos.
- Conexión a internet y unos **20 minutos**, la mayor parte esperando.
- Una cuenta de **Claude de pago**: Pro como mínimo, Max si vas a hacer muchos vídeos (precios en
  **claude.com/pricing**). YTCreator usa **Claude Code**, la parte de Claude que trabaja con los archivos de tu
  ordenador, y el plan gratuito no la incluye. Todo lo demás es gratis salvo que tú elijas un servicio de pago, y
  siempre se te pregunta antes.

No hace falta la aplicación de escritorio de Claude: el instalador pone Claude Code y YTCreator lo usa por dentro.

---

## La línea de instalación

Abre la terminal (**Mac**: `⌘ Cmd` + `Espacio`, *Terminal*, `Intro` · **Windows**: tecla `⊞ Windows`, *PowerShell*,
`Intro`; no hace falta «ejecutar como administrador» · **Linux**: *Terminal* en el menú, o `Ctrl` + `Alt` + `T`) y pega:

| Sistema | Línea |
|---|---|
| Mac y Linux | `curl -fsSL https://raw.githubusercontent.com/xavieraijon/YTCreator/main/instalar.sh \| bash` |
| Windows (PowerShell) | `irm https://raw.githubusercontent.com/xavieraijon/YTCreator/main/instalar.ps1 \| iex` |

Para **pegar**: `⌘ Cmd` + `V` en Mac; botón derecho del ratón en Windows; `Ctrl` + `Mayús` + `V` en Linux.

## Qué hace

Once pasos. Los dos primeros los ves en la terminal; en cuanto Python está listo (paso 3), **se abre tu navegador** con
una pantalla sencilla (barra de progreso y checklist) que marca el resto. Los iconos son los mismos en los dos sitios
(✅ hecho, ⏳ en marcha, ⬜ pendiente, ⚠️ hecho con un aviso, ❌ falló):

| Paso | Qué es |
|---|---|
| 1. Comprobar tu ordenador | Qué sistema y procesador tienes y cuánto sitio libre (con menos de 3 GB, pregunta si seguir). |
| 2. Descargar YTCreator | Instala **git** si falta (el programa que descarga YTCreator y lo mantiene al día) y descarga YTCreator en `YTCreator/programa`. |
| 3. Python | El lenguaje en el que está hecho YTCreator, con sus piezas (entre ellas **yt-dlp**, que consulta YouTube). Lo instala **uv** en tu carpeta de usuario. |
| 4. ffmpeg | El programa que monta los vídeos: une imágenes, voz y música. Si ya lo tienes instalado, usa el tuyo. |
| 5. Node | Prepara las pantallas de la aplicación (se comprueba que la descarga es la original). |
| 6. Las pantallas | Construye la aplicación que verás en el navegador. |
| 7. Tu carpeta de trabajo | Prepara la carpeta `YTCreator` para tus canales, con su historial (te pregunta qué nombre poner) y el acceso «YTCreator» del Escritorio. |
| 8. Claude | Instala **Claude Code**, la IA que escribe contigo. |
| 9. Entrar con tu cuenta de Claude | Si aún no has entrado, abre el navegador para que entres con tu cuenta. |
| 10. Probar que todo funciona | Una prueba rápida sin gastar nada: ffmpeg, yt-dlp, Node, tu carpeta y las pantallas. |
| 11. Abrir YTCreator | La abre en tu navegador (http://127.0.0.1:8765). |

Todo se instala **dentro de tu carpeta de usuario**: no toca el resto del sistema ni pide permisos de administrador,
salvo para instalar git si falta. Si se corta, vuelve a pegar la línea: cada paso mira primero si ya está y no instala
nada dos veces. Lo que hace queda anotado en `YTCreator/programa/programas/instalar.log`.

### Lo que te puede pedir

- **Tu nombre** (paso 7), para el historial de tus canales. Ese historial se queda en tu ordenador; no se sube a ningún
  sitio. Pulsa `Intro` para usar el nombre de tu usuario.
- **Entrar con tu cuenta de Claude** (paso 9): se abre una pestaña del navegador; entra con tu cuenta, pulsa
  **Autorizar** (*Authorize*) y vuelve a la terminal. Si la pestaña no se abre, copia en el navegador la dirección que
  sale en la terminal.
- **Mac**, si falta git: una ventana de Apple para instalar las «herramientas de línea de comandos». Pulsa
  **Instalar**, acepta la licencia y espera unos minutos; el instalador sigue solo cuando acaba.
- **Windows**, si falta git: *«¿Quieres permitir que esta aplicación haga cambios en el dispositivo?»*. Pulsa **Sí**.
- **Linux**, si falta git o la pieza de sonido de la voz de Azure: **tu contraseña del ordenador** (no la de Claude). Al
  escribirla **no se ve nada, ni puntos**: es normal. Escríbela y pulsa `Intro`.
- **No se gasta dinero.** Los servicios de imágenes y voces se conectan después, desde la aplicación: Ajustes →
  Servicios.

---

## Dónde queda cada cosa

```text
YTCreator/                 (en tu carpeta personal)
├── canales/     ← tus canales y vídeos
├── analisis/    ← estudios de otros canales
├── data/        ← ajustes y datos de la aplicación
├── .env         ← tus claves de servicios (privado)
├── Abrir YTCreator   ← para abrirlo (también en el Escritorio)
└── programa/    ← YTCreator en sí
```

- **`programa`** es la aplicación. **No la borres ni la muevas**: sin ella YTCreator no funciona. No guarda nada tuyo; si
  se estropeara, vuelve a pegar la línea de instalación y se descarga de nuevo.
- Lo tuyo está en **`canales`**, `analisis` y `data`. La copia de seguridad (Ajustes → Este equipo) copia eso y deja
  fuera `programa`.
- Si mueves la carpeta `YTCreator` entera a otro sitio, vuelve a pegar la línea de instalación (o, desde Claude, «Repara
  YTCreator») antes de abrirlo.

## Usarlo otro día

Doble clic en **YTCreator** en el Escritorio (en Mac también vale «Abrir YTCreator» dentro de la carpeta `YTCreator`; en
Linux, el menú de aplicaciones). Arranca la aplicación y abre el navegador; si ya estaba abierta, solo abre el navegador.

## Actualizar

**Vuelve a pegar la línea de instalación.** Descarga la versión nueva del programa, rehace lo que haga falta, adapta tus
guiones si cambió su formato y vuelve a abrir YTCreator (si estaba abierto, lo reinicia). Tus canales no se tocan. Si
cambiaste a mano algo de la carpeta `programa`, no la actualiza y te lo dice.

## Para pruebas

Variables que el instalador entiende (delante de `bash`, p. ej. `curl … | YTC_PRUEBA=1 bash`; en Windows,
`$env:YTC_PRUEBA=1` antes de la línea):

| Variable | Qué hace |
|---|---|
| `YTC_CARPETA` | Otra carpeta de trabajo en vez de `~/YTCreator`. |
| `YTC_REPO` | Otro repositorio de donde descargar (por ejemplo, una copia local). |
| `YTC_PRUEBA=1` | No abre la aplicación al final ni pone accesos en el Escritorio o el menú. |
| `YTC_SIN_CLAUDE=1` | No instala Claude Code ni pide entrar con la cuenta. |

Desde Claude, **«Repara YTCreator»** / `/instalar` vuelve a ejecutar el instalador y `/instalar comprobar` revisa la
instalación sin cambiar nada.

---

## Problemas

**`curl: command not found` / `irm : no se reconoce…`**
Has abierto otra cosa que no es la terminal indicada. En Windows tiene que ser **PowerShell**, no «Símbolo del sistema».

**En Windows sale un error en rojo sobre «la ejecución de scripts está deshabilitada»**
La línea `irm … | iex` no lo necesita, pero si tu empresa lo bloquea, pega antes
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` (solo para esa ventana) y después la línea de instalación.

**La instalación se ha parado a medias**
La terminal dice en rojo qué ha fallado y qué hacer. Arréglalo (casi siempre, la conexión a internet) y vuelve a pegar la
misma línea: sigue por donde iba. El registro de lo hecho está en `YTCreator/programa/programas/instalar.log`.

**«Ya existe la carpeta … programa y no es YTCreator»**
Había una carpeta `YTCreator/programa` con otra cosa. Cámbiale el nombre o muévela, y vuelve a pegar la línea.

**«Tiene cambios hechos a mano, así que no se actualiza»**
Alguien ha cambiado archivos de `programa`. El instalador no los pisa: sigue con la versión que tienes. Si quieres la
nueva, pídele a Claude que revise esos cambios (o borra la carpeta `programa` y vuelve a pegar la línea: tus canales
están a salvo en `canales`).

**Al entrar dice que tu plan no incluye Claude Code, o el paso 9 avisa de que tu cuenta es gratuita**
Pasa a Pro (o superior) en claude.ai → Ajustes → Facturación. Después, vuelve a pegar la línea de instalación (o, en la
terminal, `claude auth login`).

**El paso 9 acaba con «sin entrar»**
No terminaste de entrar con tu cuenta. YTCreator te lo pedirá al abrirlo; o vuelve a pegar la línea.

**Al escribir `claude` en la terminal sale `command not found` o «no se reconoce»**
Cierra la terminal y ábrela otra vez (el instalador lo deja preparado para las ventanas nuevas). Para un diagnóstico:
`claude doctor`.

**El navegador dice «No es seguro» en http://127.0.0.1:8765**
Es tu propio ordenador (127.0.0.1 significa «este equipo»): nada sale a internet. Puedes usarlo con tranquilidad.

**La ventana de progreso no se abrió sola en el paso 3**
No pasa nada: la terminal sigue enseñando cada paso. Pasa sobre todo sin entorno gráfico (un servidor remoto); en tu
propio ordenador también puedes abrir tú http://127.0.0.1:8765. Si YTCreator ya estaba abierto (una actualización), no
hay ventana de progreso: el progreso sale solo en la terminal.

**La ventana de progreso se queda en blanco un instante en el último paso**
Normal: al llegar al paso 11, el instalador cierra la pantalla de progreso (usa el mismo sitio, 127.0.0.1:8765) y arranca
ahí YTCreator de verdad. La página se recarga sola en unos segundos.

**«YTCreator no ha arrancado»**
Mira `YTCreator/programa/programas/ytcreator.log` (en Windows, también `ytcreator-errores.log`). Lo más común: otro
programa usa el puerto 8765. Reinicia el ordenador y haz doble clic en YTCreator.

**«Probar que todo funciona» falla**
Dice qué pieza ha fallado (ffmpeg, node, carpeta, pantallas). Vuelve a pegar la línea; si sigue, el detalle está en
`instalar.log`.

**Has borrado la carpeta `programa` por error**
Tus canales están a salvo en `YTCreator/canales`. Vuelve a pegar la línea de instalación: descarga el programa de nuevo y
reconoce tu carpeta de trabajo.

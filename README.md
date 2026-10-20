# YTCreator

**Crea y produce tus propios canales de YouTube con ayuda de la IA.** YTCreator te acompaña desde la idea del canal
(temática, nombre, estilo, voz y marca) hasta cada vídeo terminado: investigación, guion, imágenes, voz, montaje,
miniaturas y textos para publicar. Tú apruebas cada paso.

Funciona en **Mac, Windows y Linux**. Lo mueve **Claude**, la IA de Anthropic: escribe contigo y te guía. Todo lo demás
es gratis salvo que tú elijas un servicio de pago (y siempre se te pregunta antes).

---

## Instalarlo

No hace falta saber nada de ordenadores: **copias una línea, la pegas y pulsas `Intro`**. El instalador lo pone todo
solo y te va enseñando qué hace. Tarda unos **20 minutos**, casi todo esperando descargas.

**Antes de empezar necesitas:**

| | |
|---|---|
| 💻 Un ordenador | Mac (macOS 13 o más nuevo), Windows 10/11 o Linux (Ubuntu, Debian o parecido) |
| 💾 Sitio libre | Unos **3 GB** |
| 🔑 Una cuenta de Claude **de pago** | **Pro** como mínimo (Max si vas a hacer muchos vídeos). Créala en [claude.ai](https://claude.ai) y elige el plan en [claude.com/pricing](https://claude.com/pricing). El plan gratuito no sirve: no incluye Claude Code, la parte de Claude que trabaja con tu ordenador. |

### 1 · Abre la terminal

La terminal es una ventana donde se escriben órdenes. Solo la vas a usar para pegar una línea.

| Sistema | Cómo abrirla |
|---|---|
| **Mac** | Pulsa `⌘ Cmd` + `Espacio`, escribe **Terminal** y pulsa `Intro`. |
| **Windows** | Pulsa la tecla `⊞ Windows`, escribe **PowerShell** y pulsa `Intro`. |
| **Linux** | Busca **Terminal** en el menú de aplicaciones (o pulsa `Ctrl` + `Alt` + `T`). |

<!-- Capturas pendientes: la terminal recién abierta en cada sistema. -->

### 2 · Pega la línea de tu sistema

Cópiala con el botón 📋 que aparece a la derecha del recuadro al pasar el ratón, pégala en la terminal y pulsa `Intro`.

**Mac o Linux** (para pegar: `⌘ Cmd` + `V` en Mac; `Ctrl` + `Mayús` + `V` en Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/xavieraijon/YTCreator/main/instalar.sh | bash
```

**Windows** (para pegar: botón derecho del ratón dentro de la ventana):

```powershell
irm https://raw.githubusercontent.com/xavieraijon/YTCreator/main/instalar.ps1 | iex
```

### 3 · Espera y sigue lo que te diga

Verás la lista de pasos en la terminal y, en cuanto llega al paso 3, **se abre tu navegador** con una pantalla que los va
marcando sola:

```text
✅ 1. Comprobar tu ordenador
✅ 2. Descargar YTCreator
⏳ 3. Python
⬜ 4. ffmpeg (monta los vídeos)
⬜ 5. Node (prepara las pantallas)
⬜ 6. Las pantallas de la aplicación
⬜ 7. Tu carpeta de trabajo
⬜ 8. Claude
⬜ 9. Entrar con tu cuenta de Claude
⬜ 10. Probar que todo funciona
⬜ 11. Abrir YTCreator
```

**No cierres la terminal hasta que termine.** Solo te pedirá algo en estos casos (y la pantalla del navegador te avisa de
que mires la terminal):

- **Tu nombre**, para el historial de tus canales (o pulsa `Intro` y usa el de tu usuario).
- **Entrar con tu cuenta de Claude**: se abre una pestaña del navegador; entra con tu cuenta, pulsa **Autorizar** (en
  inglés, *Authorize*) y vuelve a la terminal.
- **En Mac**, si falta git: una ventana de Apple para instalar las «herramientas de línea de comandos». Pulsa
  **Instalar** y espera.
- **En Windows**, si falta git: una ventana de Windows preguntando si permites cambios en el equipo. Pulsa **Sí**.
- **En Linux**, si falta git: **tu contraseña del ordenador**. Al escribirla **no se ve nada, ni puntos**: es normal.

Si algo falla o se corta (se va internet, cierras el portátil…), la terminal te dice qué hacer; después **vuelve a pegar
la misma línea**: sigue por donde iba.

Al terminar, **YTCreator se abre en tu navegador** y su Asistente te guía para crear tu primer canal.

> ¿Ha salido un error? Mira [Problemas al instalar](docs/instalar.md#problemas).

---

## Usarlo otro día

Haz doble clic en **YTCreator** en tu Escritorio. (También está «Abrir YTCreator» dentro de la carpeta `YTCreator`; en
Linux, en el menú de aplicaciones.) Si ya estaba abierto, solo abre el navegador.

## Actualizarlo

**Vuelve a pegar la misma línea de instalación.** Descarga la versión nueva sin tocar tus canales y vuelve a abrir
YTCreator.

## Dónde queda cada cosa

Todo vive en **una sola carpeta**, `YTCreator`, dentro de tu carpeta personal:

```text
YTCreator/
├── canales/     ← tus canales y vídeos
├── analisis/    ← estudios de otros canales
├── data/        ← ajustes de la aplicación
└── programa/    ← YTCreator en sí (no lo toques: se actualiza solo con la línea de instalación)
```

- **No borres la carpeta `programa`**: sin ella YTCreator no funciona. Tus vídeos no están ahí, sino en `canales`.
- Para hacer una copia de seguridad de tus canales: en YTCreator, **Ajustes → Este equipo**.

## Más ayuda

- [Guía de instalación con todos los detalles y los problemas más comunes](docs/instalar.md)
- [Manual completo de YTCreator](docs/MANUAL.md)

## Derechos

© 2026 Xavi Aijon. Todos los derechos reservados. El código está a la vista para que puedas instalarlo y usarlo en tu
ordenador, pero no tiene licencia de código abierto: no se puede copiar, modificar ni redistribuir sin permiso.

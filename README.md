# YTCreator

Tu productor de YouTube con IA, instalado en tu propio ordenador. Te acompaña desde la idea del vídeo hasta el paquete
listo para publicar: canal y nicho, ideas, guion, escaleta, título, descripción y subtítulos.

Tus datos se quedan en tu ordenador. YTCreator solo se conecta a la IA que tú elijas.

## Lo que necesitas

YTCreator necesita **una de estas dos cosas** para funcionar. No incluye una IA gratuita.

- **Una suscripción de Claude que incluya Claude Code** (planes Pro o Max). Es la opción sin coste añadido si ya la
  pagas. Consulta los planes en [claude.ai/pricing](https://claude.ai/pricing).
- **Una cuenta de Anthropic con saldo** (pago por uso). Pagas solo lo que usas y fijas límites de gasto antes de
  empezar. Crea la cuenta y añade saldo en [console.anthropic.com](https://console.anthropic.com).

La elegirás y la conectarás en el primer arranque, sin tocar la Terminal.

## Sistemas compatibles

- **macOS** con procesador Apple Silicon o Intel.
- **Linux** de 64 bits (x86-64).

Windows todavía no es compatible.

## Instalar

Abre la Terminal, pega esta línea y pulsa Intro:

```sh
curl -fsSL https://github.com/xavieraijon/YTCreator/releases/latest/download/install.sh | bash
```

El instalador te dice en qué paso está («Paso N de 8») y, al terminar, abre YTCreator en tu navegador. No pide la
contraseña del ordenador.

Si algo falla o se corta, vuelve a pegar **la misma línea**: seguirá donde se quedó. Esa misma línea también sirve
para actualizar a una versión nueva sin perder nada.

La próxima vez, abre YTCreator desde Launchpad (macOS) o desde el menú de aplicaciones (Linux).

## Desinstalar

Todavía no hay un desinstalador. Para quitar YTCreator a mano:

1. Cierra YTCreator con el botón «Cerrar YTCreator» de la cabecera.
2. Borra la carpeta de la aplicación:
   - macOS: `~/Library/Application Support/YTCreator`
   - Linux: `~/.local/share/ytcreator`
3. Borra el acceso directo:
   - macOS: `~/Applications/YTCreator.app`
   - Linux: `~/.local/share/applications/ytcreator.desktop`
4. Si guardaste tus accesos en el llavero del sistema, bórralos desde «Acceso a Llaveros» (macOS) o desde tu gestor
   de contraseñas (Linux): son las entradas cuyo nombre empieza por `ytcreator:`.
5. **Tus datos** están en la carpeta `~/YTCreator`. Bórrala solo si ya no los quieres; si no, guárdala como copia.

Claude Code se instala aparte y puede que lo uses para otras cosas: YTCreator no lo quita.

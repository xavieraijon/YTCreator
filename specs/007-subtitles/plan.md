# Implementation Plan: Subtítulos

**Branch**: `007-subtitles` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-subtitles/spec.md`

## Summary

La 007 convierte el audio o el vídeo final del creador en unos subtítulos en español listos para subir a YouTube Studio,
y lleva al paquete de la 006 los minutos reales de los capítulos. El navegador saca el audio del vídeo (el vídeo nunca
sale de él), el servidor lo reconoce en el equipo con whisper.cpp (sin coste ni conexión) y el dominio trocea, corrige
con el guion y localiza los bloques. La IA solo entra si el creador pide la revisión. Tiene siete piezas:

- **Dominio** (`packages/core/src/subtitles`), con funciones puras: troceado (R8), alineamiento con el guion y
  correcciones (R9), marcas (R10), validación de la revisión de la IA (R11), estado (R12), minutos de los bloques (R13)
  y exportación SRT, WebVTT y SBV (R14). Un puerto nuevo, `SpeechRecognizer` (`packages/core/src/speech`).
- **Reconocimiento** (`packages/speech`, nuevo, como `packages/youtube`): el adaptador de `whisper-cli` y uno falso
  determinista, con una batería de contrato común (R6).
- **Motor**: `installer/versions.json` gana `whisperCpp` y `whisperModels`; la descarga al primer uso sigue el patrón de
  `reader-update.ts` (R1, R2); `release.yml` compila `whisper-cli` para Mac (R1).
- **Conocimiento**: `subtitles/craft.json` (límites de lectura, umbrales, factores de velocidad; R7, R8, R10) y
  `subtitles/youtube.json` (formatos admitidos, R14), y un prompt (`revision_subtitulos`).
- **Servidor**: migración `0008_subtitles.sql`, repos `subtitle-tracks` y `subtitle-versions`, servicios `subtitles` y
  `speech-engine`, y las rutas de [http-api](./contracts/http-api.md), con la subida y la reproducción del audio (R4,
  R15).
- **Web**: `/canal/subtitulos/:scriptId`, la entrada desde el guion aprobado y desde el paquete, y la conversión del audio
  con mediabunny cargada solo en esa pantalla (R3).
- **Pruebas**: dominio, contrato del reconocimiento, rutas, e2e con axe, `test:real-speech` (R19) y auditoría de
  novato.

El riesgo principal es que los subtítulos digan lo que el creador no dijo: el guion «corrigiendo» frases improvisadas o la
IA reescribiendo. Se mitiga con límites en el código: el guion solo cambia hasta 3 palabras parecidas en el mismo sitio
(R9), la IA no recibe ni devuelve tiempos y su salida se rechaza si se aleja más de un 30 % del texto (R11), y todo es
propuesta marcada que el creador acepta.

## Technical Context

**Language/Version**: TypeScript `strict` sobre Node 24 LTS.

**Primary Dependencies**: las actuales, más:

- `mediabunny` (MPL-2.0) en `apps/web`, para sacar el audio en el navegador (R3, decisión 4).
- El binario `whisper-cli` de whisper.cpp (`b5454`) y sus modelos, descargados al primer uso (R1, R2). Ya los prevé la
  constitución.

**Storage**: la misma SQLite, con la migración `0008_subtitles.sql`. Reconstruye `background_job` para admitir los tipos
`reconocer_voz` y `descargar_motor` y el estado `en_cola`, como hizo la 004, conservando todas las filas. El audio va a
`~/YTCreator/subtitulos/<scriptId>/audio.wav`; el motor y los modelos, a `APP_HOME/bin/whisper/` y `APP_HOME/models/`.

**Testing**:

- Vitest: troceado con cada límite, alineamiento (corrección, improvisación, cifras, bloques no encontrados), marcas,
  validación de la salida de la IA, estado y versiones, exportación a los tres formatos, cabecera del WAV, descarga
  fijada (SHA256 bueno y malo, retomada), rutas con SQLite en memoria y migración sobre una base de la 006 con datos.
- Batería de contrato de `SpeechRecognizer` con el falso; la misma, opcional, con el real (`test:real-speech`).
- Batería de contrato de IA con el uso nuevo y sus rechazos.
- Playwright + axe en claro y oscuro, a 375 y 1280 px, con el reconocimiento falso, un fichero de prueba pequeño y
  teclado.
- Auditoría de novato.

**Target Platform**: las de la 002: macOS (Apple Silicon e Intel) y Linux (x64 y arm64), en local o en un VPS. Navegador
con WebCodecs (las versiones actuales de Chrome, Edge, Firefox y Safari).

**Project Type**: app web local (servidor Node + SPA de React) en el monorepo pnpm.

**Performance Goals**: un vídeo de 10 minutos listo para revisar en menos de 15 minutos en un portátil corriente
(SC-001); troceado y alineamiento de 1 hora de audio en menos de 2 s; la lista de subtítulos fluida con 1.000.

**Constraints**: el audio no sale del equipo; el vídeo no sale del navegador; sin coste salvo la revisión de la IA, con el
coste a la vista; nada se pierde; ningún subtítulo fuera de límites en la propuesta; WCAG 2.2 AA, teclado, 375 px y zoom
al 200 %.

**Scale/Scope**: 1 creador, N canales; 1 pantalla con 3 estados, unas 14 rutas, 1 uso de IA, 1 migración, 2 paquetes de
conocimiento, 1 paquete nuevo del monorepo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ver `.specify/memory/constitution.md` (v2.1.1). Marcar cada puerta como ✅ cumple, ➖ no aplica o ❌ viola (si viola,
justificar en «Complexity Tracking»).

| # | Puerta | Estado | Nota |
|---|--------|--------|------|
| I | Una acción principal por pantalla, sin jerga (test de glosario), lo avanzado plegado tras «Modo experto», errores para personas | ✅ | Cada estado de la pantalla tiene una acción principal ([ui-screens](./contracts/ui-screens.md)). Sin «transcripción», «modelo», «SRT» ni «WAV» fuera de «Modo experto»; los fallos del motor tienen texto y botón |
| II | Todo lo generado se puede aprobar, editar y regenerar, con versiones; nada externo sin una acción explícita; dato ≠ opinión | ✅ | Versiones completas (R12); correcciones del guion y de la IA como propuesta marcada con lo anterior al lado (R9, R11); los minutos reales se aceptan uno a uno (R13). Descargar es una acción del creador |
| III | Coste estimado en euros antes de gastar, dentro de los límites de gasto, con un camino sin coste | ✅ | Reconocer no cuesta (local). La revisión de la IA pide `estimateId` y respeta los límites; todo lo demás no gasta |
| IV | La IA solo a través del puerto `AiProvider`; prompts versionados que valen para cualquier modelo; salida validada con Zod; errores tipados; uso explícito | ✅ | Un uso nuevo con prompt, esquema y perfil; rechazos de R11. El binario va detrás de su propio puerto (`SpeechRecognizer`), como pide la regla de binarios externos |
| V | Conocimiento en paquetes versionados con fuente y fecha; datos de mercado reales y citados; reglas de escritura humana | ✅ | Límites de lectura con fuente (guía de Netflix para el español) y fecha; formatos con la ayuda de YouTube; lo que no tiene fuente (Short a una línea, umbral de seguridad, factores de velocidad), marcado como supuesto. La revisión de la IA no reescribe, así que las reglas de escritura humana no aplican a su salida |
| VI | Solo tokens (ningún valor suelto), `@layer` + CSS Modules, temas claro y oscuro, WCAG 2.2 AA, 375 px, componente documentado | ✅ | Con los componentes que hay (R18). Si hiciera falta uno, se para y se pregunta |
| VII | Datos en local y exportables, secretos protegidos, autenticación en VPS, sin telemetría por defecto | ✅ | El audio queda en la carpeta de trabajo y se puede borrar (R16); subtítulos exportables en `.srt` y `.json` (R17). `whisper-cli` corre sin los secretos en su entorno (R6). La instalación de un paso no cambia: el motor se descarga al primer uso, fijado y comprobado (R1) |
| VIII | Dentro del alcance de la v1; lo que surja va al backlog | ✅ | Subtítulos a partir del audio o vídeo, en el alcance. Sin quemar, montar ni subir; sin traducción (decisión 3) |
| IX | Tests unitarios, de contrato de los adaptadores con IA falsa, e2e + axe y auditoría de novato prevista | ✅ | Ver «Testing». El reconocimiento tiene su propia batería de contrato con un falso determinista |
| X | La opción más simple; cada dependencia nueva justificada | ✅ | Una dependencia web justificada en R3 con su alternativa. Sin ffmpeg (decisión 4). El paquete `packages/speech` se justifica en «Complexity Tracking» |
| XI | Autonomía demostrada: cinco campos por historia, Puerta A, controles no ejecutados declarados, huecos a `decisions.md` | ✅ | Cinco historias con sus cinco campos. Las pruebas reales quedan previstas y declaradas ([quickstart](./quickstart.md)). Cada fase cierra con `/puerta-a` |

**Re-evaluación tras la Fase 1:** sin cambios. El diseño abre tres salidas de red, todas fijadas y comprobadas por SHA256
al primer uso (el motor y dos modelos), y ninguna con datos del creador. El audio solo viaja del navegador al servidor de
la propia app.

## Project Structure

### Documentation (this feature)

```text
specs/007-subtitles/
├── spec.md
├── plan.md              # este fichero
├── research.md          # R1–R20
├── data-model.md
├── quickstart.md
├── decisions.md
├── contracts/
│   ├── http-api.md
│   ├── speech-recognizer.md
│   ├── ai-uses.md
│   └── ui-screens.md
├── checklists/
│   ├── requirements.md
│   └── validation.md    # informes de la Puerta A
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/core/src/
├── speech/
│   ├── port.ts            # SpeechRecognizer: palabras con tiempo y probabilidad
│   └── failures.ts        # sin_motor, sin_modelo, audio_no_valido, sin_memoria, interrumpido, interno
├── subtitles/
│   ├── model.ts           # subtítulo, marcas, versión, corrección en bloque
│   ├── segment.ts         # troceado con límites (R8)
│   ├── align.ts           # alineamiento con el guion, correcciones y bloques (R9, R13)
│   ├── flags.ts           # marcas y filtro «Para revisar» (R10)
│   ├── edit.ts            # partir, juntar, mover tiempos, cambiar en todos, reaplicar (FR-008, FR-009, FR-017)
│   ├── review.ts          # validación de la revisión de la IA (R11)
│   ├── status.ts          # estado calculado (R12)
│   └── export.ts          # SRT, WebVTT y SBV (R14)
├── publish/chapters.ts    # + `fromAudio` como minuto fijo (R13)
├── ai/uses.ts             # + revision_subtitulos
└── api/subtitles.ts       # esquemas de las rutas

packages/speech/           # nuevo
├── src/whisper/           # comando, proceso, lectura del JSON y del avance, fallos
├── src/fake/              # reconocimiento falso determinista
└── test/contract/         # batería común

packages/knowledge/
├── subtitles/{craft,youtube}.json
└── prompts/revision_subtitulos/v1.md

apps/server/src/
├── db/migrations/0008_subtitles.sql
├── db/repos/{subtitle-tracks,subtitle-versions}.ts
├── services/{subtitles,speech-engine}.ts   # pistas y trabajos; descarga fijada del motor y los modelos
└── http/routes/subtitles.ts

apps/web/src/
├── screens/channel/subtitles/   # elegir, en marcha, revisar; propuesta de capítulos
├── audio/extract.ts             # mediabunny, cargado con import() diferido
├── strings/subtitles.es.ts
└── api/client.ts                # + subtitlesApi

installer/versions.json          # + whisperCpp, whisperModels
.github/workflows/release.yml    # + compilación de whisper-cli para Mac
apps/web/e2e/subtitles.spec.ts
```

**Structure Decision**: el monorepo de siempre. El dominio nuevo va en carpetas propias de `core`, y el adaptador del
binario en un paquete propio, como `yt-dlp` en `packages/youtube`.

## Complexity Tracking

| Añadido | Por qué hace falta | Alternativa más simple descartada |
|---------|--------------------|-----------------------------------|
| Paquete `packages/speech` | La constitución pide que los binarios externos se usen a través de adaptadores, y el falso tiene que poder sustituir al real en las pruebas y la e2e | Ponerlo en `apps/server`: mezclaría el proceso con el servidor y no tendría batería de contrato propia, al contrario que `packages/youtube` |
| Compilar `whisper-cli` para Mac en `release.yml` | whisper.cpp no publica un programa para Mac, y la instalación debe ser de un paso (VII; decisión 5) | Homebrew: un paso más que un novato no sabe dar |
| Reconstruir `background_job` | Su `CHECK` no admite los tipos nuevos ni el estado `en_cola` | Reutilizar el tipo `ia`: mezclaría trabajos con coste y sin coste en las mismas pantallas y cuentas |

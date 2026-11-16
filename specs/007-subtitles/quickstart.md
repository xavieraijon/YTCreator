# Quickstart: comprobar los subtítulos

Todo se hace con la IA, YouTube y el reconocimiento falsos y la carpeta `.dev-home`. Nunca se tocan `~/YTCreator`,
`~/ytc-prueba` ni el puerto 4310. Los tests nunca llaman a una IA real ni descargan el motor.

## Requisitos

- Node 24 (`fnm exec --using=24 --`) y las dependencias instaladas.
- Un canal con perfil aprobado, un guion aprobado y su paquete: el e2e los prepara con los recorridos de la 003 a la 006.
- Ficheros de prueba en `apps/web/e2e/fixtures/subtitles/`: un MP4 corto con voz y un WAV, hechos para el proyecto.

## 1. Controles

```bash
fnm exec --using=24 -- pnpm lint
```

```bash
fnm exec --using=24 -- pnpm typecheck
```

```bash
fnm exec --using=24 -- pnpm test
```

```bash
fnm exec --using=24 -- pnpm test:e2e
```

## 2. Recorridos

Con `pnpm dev` y `YTCREATOR_FAKE_AI=ok YTCREATOR_FAKE_SPEECH=1`:

1. **US1**: abrir un guion aprobado → «Hacer los subtítulos» → descargar el programa (falso, inmediato) → elegir el MP4
   de prueba → ver «Tardará unos…» → «Empezar» → recargar a mitad → ver el avance → ver los subtítulos, uno marcado
   «Escrito como en tu guion» → «Descargar». El fichero abre como SRT válido y ningún subtítulo pasa de los límites.
2. **US2**: oír un subtítulo con `Espacio`, editarlo, partir uno, juntar dos, «Cambiar en todos» (ver el número),
   «Revisar con la IA» (ver el coste, aceptar uno y rechazar otro), volver a una versión, aprobar y recargar.
3. **US3**: con el paquete aprobado, «Minutos reales de los capítulos» → un capítulo cambia y otro «No aparece en el
   audio» → poner los marcados → el paquete vuelve a borrador con el aviso → la descripción montada lleva el minuto real.
4. **US4**: con un guion de Short, subtítulos de una línea y sin capítulos.
5. **US5**: «Elegir otro fichero» con el WAV → versión nueva → aceptar reaplicar las correcciones en bloque → la versión
   anterior sigue en el historial.

Cada recorrido, con axe en claro y oscuro a 375 y 1280 px y solo con teclado.

## 3. Pruebas reales (fuera del CI)

```bash
fnm exec --using=24 -- pnpm test:real-speech
```

Descarga el motor y el modelo fijados (una vez, unos 580 MB) y reconoce el audio de prueba en español. Comprueba el
tiempo (SC-001 en proporción), las correcciones desde el guion (SC-004) y los minutos de los bloques (SC-005). No gasta
dinero ni cupo: el agente puede ejecutarla.

La revisión de la IA real (`pnpm test:real-ai`) solo con la autorización del creador y la suscripción de Claude Code.
Subir el fichero descargado a YouTube Studio (SC-003) lo hace el creador con un vídeo suyo.

Lo que no se ejecute consta como no ejecutado en `checklists/validation.md`.

# Contrato: puerto de reconocimiento de voz

**Feature**: `007-subtitles` | Decisiones en [research.md](../research.md) R1, R2, R5 y R6

El dominio solo conoce `SpeechRecognizer` (`packages/core/src/speech/port.ts`). Las implementaciones viven en
`packages/speech`: `whisper` (real) y `fake` (determinista). Las dos pasan la misma batería de contrato
(`packages/speech/test/contract`); la del real solo corre con `test:real-speech`.

## Entrada

```text
recognize({
  audioPath: string,          // WAV PCM 16 kHz mono, ya comprobado por el servidor
  language: 'es',
  hint: string,               // nombres, cifras y términos del guion, hasta ~200 tokens (R6)
  model: string,              // id de whisperModels
  signal: AbortSignal,
  onProgress(fraction: number): void,   // 0 a 1, creciente
})
```

## Salida

```text
{ ok: true, words: HeardWord[], seconds: number }   // tiempo que tardó, para el factor de R7
{ ok: false, failure: SpeechFailure }
```

`HeardWord`: `{ text, start, end, p }`, en orden, con `0 ≤ start ≤ end ≤ duración del audio` y `0 ≤ p ≤ 1`. Las palabras
llevan su puntuación pegada, como la da el modelo.

## Fallos

| Código | Cuándo | Texto para el creador (resumen) |
|---|---|---|
| `sin_motor` | falta `whisper-cli` o no arranca | «Falta el programa que escucha el audio» + «Instalarlo» |
| `sin_modelo` | falta el modelo | «Falta una parte del programa que escucha el audio» + «Descargarlo» (decisión 13) |
| `audio_no_valido` | el motor no puede leer el audio | «No se ha podido leer el audio» + «Elegir otro fichero» |
| `sin_memoria` | el proceso muere por memoria | «Tu equipo se ha quedado sin memoria» + sugerencia del modelo pequeño |
| `interrumpido` | se canceló o se cerró la app | «Se ha parado antes de terminar» + «Volver a empezar» |
| `interno` | cualquier otro | «Algo ha fallado al escuchar el audio» + «Volver a intentarlo» |

## Reglas de la batería

1. Con un audio válido, devuelve palabras ordenadas dentro de la duración y avisa del avance de forma creciente hasta 1.
2. Abortar con la señal termina en menos de 2 s con `interrumpido` y no deja procesos vivos.
3. Un audio que no es WAV válido da `audio_no_valido`.
4. Sin el binario da `sin_motor`; sin el modelo, `sin_modelo`.
5. El proceso no recibe ninguna variable de entorno con secretos (solo `PATH`, `HOME`, `LANG`, `TMPDIR` y, en Linux,
   `LD_LIBRARY_PATH`).
6. Nunca escribe en el log el texto oído ni la ruta del audio.

## El falso

Devuelve un guion de palabras fijo según el nombre del audio de prueba (`hola.wav`, `con-errores.wav`,
`improvisa.wav`, `silencio.wav`, `fallo-*.wav` para cada fallo), con un avance en cinco pasos. Se activa con
`YTCREATOR_FAKE_SPEECH` solo en construcciones que admiten falsos (`__YTC_ALLOW_FAKE_AI__`), y `release.yml` comprueba
que no entra en el paquete publicado, como el falso de la IA y el de YouTube.

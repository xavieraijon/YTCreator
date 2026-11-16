import { basename } from 'node:path'
import type { RecognizeResult, SpeechRecognizer } from '@ytcreator/core'
import { readWavInfo } from '../wav.ts'
import { fakeSpeechWords, scenarioOf } from './scenarios.ts'

export interface FakeRecognizerOptions {
  /**
   * What it hears when the audio has no test name, as the server always saves `audio.wav` (decision 9): the value of
   * `YTCREATOR_FAKE_SPEECH`: `1` is `hola`, otherwise a scenario or `fallo-<código>`.
   */
  scenario?: string
  /** Milliseconds between the five steps of progress. */
  stepMs?: number
  /** Without the engine or the model, as on a machine that has not downloaded them. */
  engine?: boolean
  models?: readonly string[]
  log?: (line: string) => void
}

const STEPS = 5
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) return resolve()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true })
  })

// Deterministic: the words of each test audio, in five steps of progress (contracts/speech-recognizer.md).
export function createFakeRecognizer(options: FakeRecognizerOptions = {}): SpeechRecognizer {
  const { stepMs = 0, engine = true, models, log = () => {} } = options
  // `1` is «hola»; a scenario or `fallo-<código>` is that one (the registry refuses anything else).
  const byDefault = (options.scenario && scenarioOf(`${options.scenario}.wav`)) || 'hola'
  return {
    async recognize({ audioPath, model, signal, onProgress }): Promise<RecognizeResult> {
      const began = Date.now()
      if (!engine) return { ok: false, failure: 'sin_motor' }
      if (models && !models.includes(model)) return { ok: false, failure: 'sin_modelo' }
      const chosen = scenarioOf(basename(audioPath)) ?? byDefault
      if (typeof chosen === 'object') return { ok: false, failure: chosen.failure }
      const wav = await readWavInfo(audioPath)
      if (!wav || wav.seconds <= 0) return { ok: false, failure: 'audio_no_valido' }

      for (let step = 1; step <= STEPS; step++) {
        await wait(stepMs, signal)
        if (signal.aborted) return { ok: false, failure: 'interrumpido' }
        onProgress(step / STEPS)
      }
      // Within the audio: a shorter one squeezes the words in.
      const scripted = fakeSpeechWords(chosen)
      const last = scripted.at(-1)?.end ?? 0
      const scale = last > wav.seconds ? wav.seconds / last : 1
      const words = scripted.map((word) => ({
        ...word,
        start: Number((word.start * scale).toFixed(3)),
        end: Number((word.end * scale).toFixed(3)),
      }))
      // Never the heard text nor the audio path (rule 6).
      log(`fake speech: ${words.length} words`)
      return { ok: true, words, seconds: (Date.now() - began) / 1000 }
    },
  }
}

import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RecognizeRequest, RecognizeResult, SpeechRecognizer } from '@ytcreator/core'
import { readWavInfo } from '../wav.ts'
import { classifyWhisperRun } from './classify.ts'
import { whisperArgs } from './command.ts'
import { parseWhisperJson } from './parse.ts'
import { runWhisper, whisperEnv } from './process.ts'

export interface WhisperLocation {
  binary: string
  /** LD_LIBRARY_PATH on Linux; null when the program has everything inside. */
  libDir: string | null
  model: string
  vad: string
}

export interface WhisperOptions {
  /** Where the program and the files of `model` are; the server knows them (speech-engine.ts). */
  locate: (model: string) => WhisperLocation
  /** Only the outcome and how long it took: never the text nor the path (contract, rule 6). */
  log?: (line: string) => void
  threads?: number
}

// The real recognizer: whisper-cli of whisper.cpp, run once per audio (research.md R6).
export function createWhisperRecognizer({ locate, log, threads }: WhisperOptions): SpeechRecognizer {
  const cores = threads ?? Math.max(1, Math.min(8, availableParallelism() - 1))
  return {
    async recognize(request: RecognizeRequest): Promise<RecognizeResult> {
      const result = await run(request)
      log?.(
        result.ok
          ? `whisper ok ${result.words.length} palabras en ${Math.round(result.seconds)} s`
          : `whisper ${result.failure}`,
      )
      return result
    },
  }

  async function run({ audioPath, hint, model, signal, onProgress }: RecognizeRequest): Promise<RecognizeResult> {
    const where = locate(model)
    if (!existsSync(where.binary)) return { ok: false, failure: 'sin_motor' }
    if (!existsSync(where.model) || !existsSync(where.vad)) return { ok: false, failure: 'sin_modelo' }
    const wav = await readWavInfo(audioPath)
    if (!wav || wav.seconds <= 0) return { ok: false, failure: 'audio_no_valido' }
    if (signal.aborted) return { ok: false, failure: 'interrumpido' }

    const dir = await mkdtemp(join(tmpdir(), 'ytc-whisper-'))
    const began = performance.now()
    try {
      let last = 0
      const outBase = join(dir, 'salida')
      const finished = await runWhisper(
        where.binary,
        whisperArgs({ model: where.model, vad: where.vad, audio: audioPath, outBase, hint, threads: cores }),
        {
          env: whisperEnv(where.libDir),
          signal,
          onPercent: (percent) => {
            // Never back, and 1 only once it is read.
            const fraction = Math.min(0.99, percent / 100)
            if (fraction > last) {
              last = fraction
              onProgress(fraction)
            }
          },
        },
      )
      const failure = classifyWhisperRun(finished)
      if (failure) return { ok: false, failure }
      let words
      try {
        words = parseWhisperJson(await readFile(`${outBase}.json`), wav.seconds)
      } catch {
        return { ok: false, failure: 'interno' }
      }
      onProgress(1)
      return { ok: true, words, seconds: (performance.now() - began) / 1000 }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

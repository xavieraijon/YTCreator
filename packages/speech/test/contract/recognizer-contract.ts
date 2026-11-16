import { fileURLToPath } from 'node:url'
import type { RecognizeRequest, RecognizeResult, SpeechRecognizer } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { readWavInfo } from '../../src/wav.ts'

// The rules every SpeechRecognizer keeps (contracts/speech-recognizer.md, «Reglas de la batería»).
export const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url))
export const AUDIO = {
  hola: `${FIXTURES}hola.wav`,
  invalid: `${FIXTURES}no-es-audio.wav`,
}

export const SECRET_ENV = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'YTCREATOR_YOUTUBE_KEY']
const ALLOWED_ENV = ['PATH', 'HOME', 'LANG', 'TMPDIR', 'LD_LIBRARY_PATH']

export interface RecognizerSubject {
  recognizer: SpeechRecognizer
  model: string
  /** The same recognizer, without its engine or without the model. */
  withoutEngine: () => SpeechRecognizer
  withoutModel: () => SpeechRecognizer
  /** What the last process was given as its environment; null when it runs none. */
  lastEnv: () => Record<string, string> | null
  /** How many of its processes are still alive. */
  liveProcesses: () => number
  /** Every line it wrote to the log. */
  logs: () => string[]
}

const request = (subject: RecognizerSubject, audioPath: string, extra: Partial<RecognizeRequest> = {}) => {
  const progress: number[] = []
  const req: RecognizeRequest = {
    audioPath,
    language: 'es',
    hint: 'pan casero, masa madre',
    model: subject.model,
    signal: new AbortController().signal,
    onProgress: (fraction) => progress.push(fraction),
    ...extra,
  }
  return { req, progress }
}

export function runRecognizerContract(name: string, make: () => RecognizerSubject, timeout = 5_000) {
  describe(`SpeechRecognizer contract: ${name}`, () => {
    it(
      '1. with a valid audio, ordered words within its length and a growing progress up to 1',
      async () => {
        const subject = make()
        const { req, progress } = request(subject, AUDIO.hola)
        const result = await subject.recognizer.recognize(req)
        if (!result.ok) throw new Error(`expected ok, got ${result.failure}`)
        const length = (await readWavInfo(AUDIO.hola))!.seconds
        expect(result.words.length).toBeGreaterThan(0)
        expect(result.seconds).toBeGreaterThanOrEqual(0)
        result.words.forEach((word, i) => {
          expect(word.start).toBeGreaterThanOrEqual(0)
          expect(word.start).toBeLessThanOrEqual(word.end)
          expect(word.end).toBeLessThanOrEqual(length)
          expect(word.p).toBeGreaterThanOrEqual(0)
          expect(word.p).toBeLessThanOrEqual(1)
          if (i > 0) expect(word.start).toBeGreaterThanOrEqual(result.words[i - 1]!.start)
        })
        expect(progress.length).toBeGreaterThan(0)
        progress.forEach((value, i) => i > 0 && expect(value).toBeGreaterThanOrEqual(progress[i - 1]!))
        expect(progress.at(-1)).toBe(1)
      },
      timeout,
    )

    it(
      '2. aborting ends in under 2 s with «interrumpido» and leaves no process alive',
      async () => {
        const subject = make()
        const controller = new AbortController()
        const { req } = request(subject, AUDIO.hola, {
          signal: controller.signal,
          onProgress: () => controller.abort(),
        })
        const pending = subject.recognizer.recognize(req)
        // Some engines only report progress late: abort anyway after a moment.
        setTimeout(() => controller.abort(), 200)
        const began = Date.now()
        const result: RecognizeResult = await pending
        expect(result).toEqual({ ok: false, failure: 'interrumpido' })
        expect(Date.now() - began).toBeLessThan(2_000 + 200)
        expect(subject.liveProcesses()).toBe(0)
      },
      timeout,
    )

    it('3. an audio that is not a valid WAV gives «audio_no_valido»', async () => {
      const subject = make()
      expect(await subject.recognizer.recognize(request(subject, AUDIO.invalid).req)).toEqual({
        ok: false,
        failure: 'audio_no_valido',
      })
    })

    it('4. without the engine «sin_motor»; without the model «sin_modelo»', async () => {
      const subject = make()
      expect(await subject.withoutEngine().recognize(request(subject, AUDIO.hola).req)).toEqual({
        ok: false,
        failure: 'sin_motor',
      })
      expect(await subject.withoutModel().recognize(request(subject, AUDIO.hola).req)).toEqual({
        ok: false,
        failure: 'sin_modelo',
      })
    })

    it(
      '5. the process gets no secret in its environment',
      async () => {
        const subject = make()
        const saved = SECRET_ENV.map((key) => [key, process.env[key]] as const)
        for (const key of SECRET_ENV) process.env[key] = 'secreto-que-no-debe-salir'
        try {
          await subject.recognizer.recognize(request(subject, AUDIO.hola).req)
        } finally {
          for (const [key, value] of saved) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
          }
        }
        const env = subject.lastEnv()
        if (env === null) return
        expect(Object.keys(env).filter((key) => !ALLOWED_ENV.includes(key))).toEqual([])
        expect(Object.values(env)).not.toContain('secreto-que-no-debe-salir')
      },
      timeout,
    )

    it(
      '6. never writes the heard text nor the audio path to the log',
      async () => {
        const subject = make()
        const result = await subject.recognizer.recognize(request(subject, AUDIO.hola).req)
        if (!result.ok) throw new Error(`expected ok, got ${result.failure}`)
        const log = subject.logs().join('\n')
        expect(log).not.toContain(AUDIO.hola)
        expect(log).not.toContain('hola.wav')
        for (const word of result.words.filter((w) => w.text.length > 3)) expect(log).not.toContain(word.text)
      },
      timeout,
    )
  })
}

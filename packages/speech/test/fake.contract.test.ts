import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RecognizeRequest } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { createFakeRecognizer } from '../src/fake/fake-recognizer.ts'
import { FAKE_SPEECH_SCENARIOS } from '../src/fake/scenarios.ts'
import { createSpeechRecognizer } from '../src/registry.ts'
import { readWavInfo } from '../src/wav.ts'
import { FIXTURES, runRecognizerContract } from './contract/recognizer-contract.ts'

const MODEL = 'ggml-large-v3-turbo-q5_0.bin'

runRecognizerContract('fake', () => {
  const lines: string[] = []
  const options = { stepMs: 50, models: [MODEL], log: (line: string) => lines.push(line) }
  return {
    recognizer: createFakeRecognizer(options),
    model: MODEL,
    withoutEngine: () => createFakeRecognizer({ ...options, engine: false }),
    withoutModel: () => createFakeRecognizer({ ...options, models: [] }),
    lastEnv: () => null,
    liveProcesses: () => 0,
    logs: () => lines,
  }
})

const req = (audioPath: string): RecognizeRequest => ({
  audioPath,
  language: 'es',
  hint: '',
  model: MODEL,
  signal: new AbortController().signal,
  onProgress: () => {},
})

describe('fake speech recognizer', () => {
  it('hears the words of each test audio, inside its length', async () => {
    const fake = createFakeRecognizer()
    for (const scenario of FAKE_SPEECH_SCENARIOS) {
      const path = `${FIXTURES}${scenario}.wav`
      const result = await fake.recognize(req(path))
      if (!result.ok) throw new Error(`${scenario}: ${result.failure}`)
      const length = (await readWavInfo(path))!.seconds
      expect(result.words.every((w) => w.end <= length)).toBe(true)
      if (scenario === 'silencio') expect(result.words).toEqual([])
      else expect(result.words.length).toBeGreaterThan(5)
    }
  })

  it('marks the misheard words with little confidence', async () => {
    const result = await createFakeRecognizer().recognize(req(`${FIXTURES}con-errores.wav`))
    if (!result.ok) throw new Error('expected ok')
    expect(result.words.filter((w) => w.p < 0.5).map((w) => w.text)).toEqual(['madr', 'arina', 'fuersa,'])
  })

  it('«fallo-<código>.wav» gives that failure, an unknown code «interno»', async () => {
    const fake = createFakeRecognizer()
    expect(await fake.recognize(req('/tmp/fallo-sin_memoria.wav'))).toEqual({ ok: false, failure: 'sin_memoria' })
    expect(await fake.recognize(req('/tmp/fallo-otro.wav'))).toEqual({ ok: false, failure: 'interno' })
  })

  it('the audio the server saves (audio.wav) hears the scenario it was given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ytc-speech-'))
    try {
      const saved = join(dir, 'audio.wav')
      await copyFile(`${FIXTURES}hola.wav`, saved)
      const silent = await createFakeRecognizer({ scenario: 'silencio' }).recognize(req(saved))
      expect(silent).toMatchObject({ ok: true, words: [] })
      const byDefault = await createFakeRecognizer().recognize(req(saved))
      expect(byDefault.ok && byDefault.words[0]?.text).toBe('Hola,')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('a missing file is not a valid audio', async () => {
    expect(await createFakeRecognizer().recognize(req('/tmp/no-existe/audio.wav'))).toEqual({
      ok: false,
      failure: 'audio_no_valido',
    })
  })
})

describe('speech registry', () => {
  const real = createFakeRecognizer({ scenario: 'improvisa' })

  it('uses the real one unless the fake switch is on', () => {
    expect(createSpeechRecognizer({ env: {}, real: () => real })).toEqual({ recognizer: real, fake: false })
    expect(createSpeechRecognizer({ env: { YTCREATOR_FAKE_SPEECH: '1' }, real: () => real }).fake).toBe(true)
  })

  it('takes 1, a scenario or fallo-<código>; anything else stops the start', async () => {
    const make = (value: string) => createSpeechRecognizer({ env: { YTCREATOR_FAKE_SPEECH: value }, real: () => real })
    expect(make('silencio').fake).toBe(true)
    const dir = await mkdtemp(join(tmpdir(), 'ytc-speech-'))
    try {
      const saved = join(dir, 'audio.wav')
      await copyFile(`${FIXTURES}hola.wav`, saved)
      expect(await make('fallo-sin_memoria').recognizer.recognize(req(saved))).toEqual({
        ok: false,
        failure: 'sin_memoria',
      })
      expect(await make('silencio').recognizer.recognize(req(saved))).toMatchObject({ ok: true, words: [] })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
    expect(() => make('silencioo')).toThrow(/YTCREATOR_FAKE_SPEECH no válido/)
    expect(() => make('0')).toThrow(/no válido/)
  })

  it('a build that does not allow fakes ignores the switch', () => {
    expect(
      createSpeechRecognizer({ env: { YTCREATOR_FAKE_SPEECH: '1' }, real: () => real, allowFake: false }).fake,
    ).toBe(false)
  })
})

import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RecognizeRequest } from '@ytcreator/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createWhisperRecognizer, type WhisperLocation } from '../src/whisper/adapter.ts'
import { parseWhisperJson } from '../src/whisper/parse.ts'
import { whisperEnv } from '../src/whisper/process.ts'
import { AUDIO, FIXTURES, runRecognizerContract } from './contract/recognizer-contract.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A folder with its own copy of the fake whisper-cli, a model and the detection model. */
function setup(mode?: string, libDir: string | null = null) {
  const dir = mkdtempSync(join(tmpdir(), 'ytc-whisper-test-'))
  dirs.push(dir)
  const binary = join(dir, 'whisper-cli')
  copyFileSync(join(FIXTURES, 'fake-whisper-cli'), binary)
  writeFileSync(join(dir, 'modelo.bin'), 'modelo')
  writeFileSync(join(dir, 'vad.bin'), 'vad')
  if (mode) writeFileSync(join(dir, 'modo'), mode)
  const where: WhisperLocation = { binary, libDir, model: join(dir, 'modelo.bin'), vad: join(dir, 'vad.bin') }
  const lines: string[] = []
  const recognizer = createWhisperRecognizer({ locate: () => where, log: (line) => lines.push(line), threads: 3 })
  const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null)
  const alive = (name: string) => {
    const pid = Number(read(name))
    if (!pid) return false
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  return { dir, where, recognizer, lines, read, alive }
}

const request = (extra: Partial<RecognizeRequest> = {}): RecognizeRequest => ({
  audioPath: AUDIO.hola,
  language: 'es',
  hint: 'Fernández, 250 grados',
  model: 'large-v3-turbo-q5_0',
  signal: new AbortController().signal,
  onProgress: () => {},
  ...extra,
})

runRecognizerContract('whisper (fake whisper-cli)', () => {
  const subject = setup()
  return {
    recognizer: subject.recognizer,
    model: 'large-v3-turbo-q5_0',
    withoutEngine: () =>
      createWhisperRecognizer({ locate: () => ({ ...subject.where, binary: join(subject.dir, 'no-existe') }) }),
    withoutModel: () =>
      createWhisperRecognizer({ locate: () => ({ ...subject.where, model: join(subject.dir, 'no-existe.bin') }) }),
    lastEnv: () => {
      const text = subject.read('env')
      if (text === null) return null
      // `env` of sh adds what the shell itself sets.
      const shell = new Set(['PWD', 'SHLVL', '_', 'OLDPWD'])
      return Object.fromEntries(
        text
          .trim()
          .split('\n')
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
          .filter(([key]) => !shell.has(key!)),
      )
    },
    liveProcesses: () => ['pid', 'child'].filter(subject.alive).length,
    logs: () => subject.lines,
  }
})

describe('the whisper.cpp adapter (R6)', () => {
  it('calls whisper-cli with the model, Spanish, voice detection, the full JSON, the hint and the threads', async () => {
    const { recognizer, read, where } = setup()
    await recognizer.recognize(request())
    const args = read('args')!.trim().split('\n')
    const after = (flag: string) => args[args.indexOf(flag) + 1]
    expect(after('-m')).toBe(where.model)
    expect(after('-f')).toBe(AUDIO.hola)
    expect(after('-l')).toBe('es')
    expect(args).toContain('--vad')
    expect(after('-vm')).toBe(where.vad)
    expect(args).toContain('-ojf')
    expect(args).toContain('-pp')
    expect(after('-t')).toBe('3')
    // The hint goes as one argument, never through a shell.
    expect(after('--prompt')).toBe('Fernández, 250 grados')
  })

  it('without a hint, no --prompt', async () => {
    const { recognizer, read } = setup()
    await recognizer.recognize(request({ hint: '  ' }))
    expect(read('args')).not.toContain('--prompt')
  })

  it('reads each word with its times in seconds and the mean probability of its fragments', async () => {
    const { recognizer } = setup()
    const result = await recognizer.recognize(request())
    if (!result.ok) throw new Error(result.failure)
    expect(result.words.map((word) => word.text)).toEqual(['Hola,', 'mañana', 'pan-', 'casero.'])
    expect(result.words[0]).toEqual({ text: 'Hola,', start: 0.1, end: 0.56, p: 0.94 })
    expect(result.words[1]).toEqual({ text: 'mañana', start: 0.7, end: 1.2, p: 0.6 })
    // A time past the end of the audio stays inside it.
    expect(result.words.at(-1)!.end).toBeLessThanOrEqual(5.3)
  })

  it('the progress only grows, and reaches 1 once the words are read', async () => {
    const { recognizer } = setup()
    const seen: number[] = []
    await recognizer.recognize(request({ onProgress: (fraction) => seen.push(fraction) }))
    expect(seen).toEqual([0.05, 0.3, 0.75, 0.99, 1])
  })

  it('on Linux it gets LD_LIBRARY_PATH with the folder of its libraries; elsewhere, not', async () => {
    expect(whisperEnv('/opt/whisper')['LD_LIBRARY_PATH']).toBe('/opt/whisper')
    expect(whisperEnv(null)).not.toHaveProperty('LD_LIBRARY_PATH')
    const { recognizer, read, dir } = setup(undefined, '/libs/whisper')
    await recognizer.recognize(request())
    expect(read('env')).toContain('LD_LIBRARY_PATH=/libs/whisper')
    expect(dir).toBeTruthy()
  })

  it.each([
    ['memoria', 'sin_memoria'],
    ['matado', 'sin_memoria'],
    ['modelo', 'sin_modelo'],
    ['audio', 'audio_no_valido'],
    ['raro', 'interno'],
    ['sinjson', 'interno'],
  ])('«%s» is «%s»', async (mode, failure) => {
    const { recognizer, lines } = setup(mode)
    expect(await recognizer.recognize(request())).toEqual({ ok: false, failure })
    expect(lines).toEqual([`whisper ${failure}`])
  })

  it('stopping a long run kills it and what it started', async () => {
    const { recognizer, alive } = setup('lento')
    const controller = new AbortController()
    const pending = recognizer.recognize(request({ signal: controller.signal, onProgress: () => controller.abort() }))
    expect(await pending).toEqual({ ok: false, failure: 'interrumpido' })
    expect(alive('pid')).toBe(false)
    expect(alive('child')).toBe(false)
    // A shell started under the load of the whole suite can take a while to say its first progress.
  }, 15_000)

  it('leaves no temporary files', async () => {
    const before = new Set(readdirTmp())
    await setup().recognizer.recognize(request())
    expect(readdirTmp().filter((name) => !before.has(name))).toEqual([])
  })
})

describe('reading the JSON of whisper-cli', () => {
  it('an empty transcription is no words', () => {
    expect(parseWhisperJson(Buffer.from('{"transcription":[]}'), 10)).toEqual([])
  })
})

function readdirTmp() {
  return readdirSync(tmpdir()).filter(
    (name: string) => name.startsWith('ytc-whisper-') && !name.startsWith('ytc-whisper-test-'),
  )
}

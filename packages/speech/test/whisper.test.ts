import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RecognizeRequest } from '@ytcreator/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createWhisperRecognizer, type WhisperLocation } from '../src/whisper/adapter.ts'
import { afterSilence, parseVadLine, parseWhisperJson, startsOfStretches, toAudioTime } from '../src/whisper/parse.ts'
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

  // As whisper.cpp b5454 says and writes it with the voice detection on (T075): the stretches of voice in its messages,
  // and a fragment whose words count only the voice, across the silence cut between the first two stretches.
  const lines = [
    'whisper_vad: vad_segment_info: orig_start: 0.96, orig_end: 7.71, vad_start: 0.00, vad_end: 6.75',
    'whisper_vad: vad_segment_info: orig_start: 9.09, orig_end: 16.54, vad_start: 6.95, vad_end: 14.40',
  ]
  const detected = {
    transcription: [
      {
        offsets: { from: 960, to: 16540 },
        tokens: [
          ['[_BEG_]', 0, 0],
          [' Hola', 40, 600],
          [' todos', 600, 2200],
          [' Necesit', 7220, 7700],
          ['áis', 7700, 8000],
          [' fin', 14300, 14400],
          ['[_TT_720]', 14400, 14400],
        ].map(([text, from, to]) => ({ text, offsets: { from, to }, p: 0.9 })),
      },
    ],
  }

  it('reads the stretches of voice from its messages, and nothing else', () => {
    expect(lines.map(parseVadLine)).toEqual([
      { origStart: 0.96, origEnd: 7.71, vadStart: 0, vadEnd: 6.75 },
      { origStart: 9.09, origEnd: 16.54, vadStart: 6.95, vadEnd: 14.4 },
    ])
    expect(parseVadLine('whisper_full: VAD is enabled, processing speech segments only')).toBeNull()
    expect(parseVadLine('[00:00.000 --> 00:03.000]  Hola a todos')).toBeNull()
  })

  it('with the voice detection on, each word is put back in the audio, stretch by stretch', () => {
    const segments = lines.map((line) => parseVadLine(line)!)
    const words = parseWhisperJson(Buffer.from(JSON.stringify(detected), 'utf8'), 60, segments)
    expect(words.map(({ text, start, end }) => [text, start, end])).toEqual([
      ['Hola', 1, 1.56],
      ['todos', 1.56, 3.16],
      ['Necesitáis', 9.36, 10.14],
      ['fin', 16.44, 16.54],
    ])
  })

  it('in the gap between two stretches, a time goes to the nearer edge; before or after all, to the first or last', () => {
    const segments = lines.map((line) => parseVadLine(line)!)
    expect(toAudioTime(6.8, segments)).toBe(7.71)
    expect(toAudioTime(6.9, segments)).toBe(9.09)
    expect(toAudioTime(-1, segments)).toBe(0.96)
    expect(toAudioTime(20, segments)).toBe(16.54)
    expect(toAudioTime(3, [])).toBe(3)
  })

  it('a word that runs over a cut silence starts where the voice comes back, never in the silence', () => {
    const segments = lines.map((line) => parseVadLine(line)!)
    // «Mezclad» heard from the end of the word before, across the pause, to just after the voice came back.
    expect(afterSilence(7.5, 9.2, segments)).toBe(9.09)
    expect(afterSilence(7.71, 9.2, segments)).toBe(9.09)
    // Its end fell in the second half of the silence, so it was put where the voice comes back.
    expect(afterSilence(7.5, 9.09, segments)).toBe(9.09)
    // Ending in the pause, or inside one stretch: as it is.
    expect(afterSilence(7.5, 7.71, segments)).toBe(7.5)
    expect(afterSilence(10, 11, segments)).toBe(10)
    expect(afterSilence(7.5, 9.2, [])).toBe(7.5)
  })

  it('the first word of a stretch left at the end of the one before goes to where the voice comes back', () => {
    const segments = lines.map((line) => parseVadLine(line)!)
    const said = (text: string, start: number, end: number) => ({ text, start, end, p: 0.9 })
    const atEdge = [
      said('minutos.', 7.2, 7.5),
      said('Dejadlo', 7.5, 7.71),
      said('enfriar', 9.12, 9.5),
      said('sobre', 9.5, 9.8),
    ]
    startsOfStretches(atEdge, segments)
    expect(atEdge.map((word) => [word.start, word.end])).toEqual([
      [7.2, 7.5],
      [9.09, 9.12],
      [9.12, 9.5],
      [9.5, 9.8],
    ])
    // Even when whisper put it well before the end of the stretch.
    const early = [said('minutos.', 6.4, 6.7), said('Dejadlo', 6.7, 7.2), said('enfriar', 9.6, 9.9)]
    startsOfStretches(early, segments)
    expect(early.map((word) => [word.start, word.end])).toEqual([
      [6.4, 6.7],
      [9.09, 9.59],
      [9.6, 9.9],
    ])
    // The last word of a sentence, one not after a sentence, or one whose next word is still in its stretch: as they are.
    const kept = [
      [said('fresca', 7.2, 7.5), said('final.', 7.5, 7.71), said('Mezclad', 9.12, 9.5)],
      [said('una', 7.2, 7.5), said('pizca', 7.5, 7.71), said('de', 9.12, 9.5)],
      [said('fin.', 7.0, 7.2), said('Bueno,', 7.3, 7.6), said('vamos', 9.12, 9.5)],
      [said('fin.', 7.0, 7.2), said('Dejadlo', 7.5, 7.71), said('enfriar', 7.71, 7.71)],
    ]
    for (const one of kept) {
      const before = structuredClone(one)
      startsOfStretches(one, segments)
      expect(one).toEqual(before)
    }
  })

  it('without it, the times are left as they are', () => {
    const words = parseWhisperJson(Buffer.from(JSON.stringify(detected), 'utf8'), 60)
    expect(words.map((word) => word.start)).toEqual([0.04, 0.6, 7.22, 14.3])
  })
})

function readdirTmp() {
  return readdirSync(tmpdir()).filter(
    (name: string) => name.startsWith('ytc-whisper-') && !name.startsWith('ytc-whisper-test-'),
  )
}

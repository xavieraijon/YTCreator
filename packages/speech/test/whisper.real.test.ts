import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { align, blockStarts, scriptHint, segment, type Cue, type HeardWord } from '@ytcreator/core'
import { afterAll, describe, expect, it } from 'vitest'
import { createWhisperRecognizer } from '../src/whisper/adapter.ts'

// T075 of 007: the pinned whisper.cpp and its model listen to a real Spanish voice (`pnpm test:real-speech`). Outside
// CI; it downloads about 580 MB once (kept in YTC_REAL_SPEECH_DIR, by default in the temporary folder) and costs no
// money nor AI quota. The voice is macOS's own (`say`), so it only runs on a Mac.
//
// It measures SC-001 (how long per second of audio), SC-004 (the script's spelling, and an improvised sentence kept)
// and SC-005 (where each block starts, within 2 s).

const ROOT = join(import.meta.dirname, '..', '..', '..')
const versions = JSON.parse(readFileSync(join(ROOT, 'installer', 'versions.json'), 'utf8')) as {
  whisperCpp: { assets: Record<string, { url: string; sha256: string; archive: string }> }
  whisperModels: Record<string, { file: string; url: string; sha256: string; role: string; recommended?: boolean }>
}
const craft = JSON.parse(readFileSync(join(ROOT, 'packages', 'knowledge', 'subtitles', 'craft.json'), 'utf8')) as {
  data: { long: Record<string, { value: number }>; lowConfidence: { value: number } }
}

const PLATFORM = `${process.platform}-${process.arch}`
const MODEL =
  process.env['YTC_REAL_SPEECH_MODEL'] ?? Object.entries(versions.whisperModels).find(([, one]) => one.recommended)![0]
const VAD = Object.entries(versions.whisperModels).find(([, one]) => one.role === 'deteccion')![0]
const CACHE = process.env['YTC_REAL_SPEECH_DIR'] ?? join(tmpdir(), 'ytcreator-real-speech')
const VOICE = process.env['YTC_REAL_SPEECH_VOICE'] ?? 'Mónica'
const RATE = 16_000
const LEAD_SECONDS = 1
const GAP_SECONDS = 1.5

// A cooking video: the script as written, and what is said. The fourth block is improvised: said, not in the script.
const BLOCKS = [
  {
    script:
      'Hola a todos, bienvenidos a Cuchara Viva. Hoy os enseño a hacer un pan de centeno en casa, sin amasar y con muy poca levadura.',
  },
  {
    script:
      'Necesitáis medio kilo de harina de centeno, 350 mililitros de agua tibia, 10 gramos de sal y una pizca de levadura fresca.',
    said: 'Necesitáis medio kilo de harina de centeno, trescientos cincuenta mililitros de agua tibia, diez gramos de sal y una pizca de levadura fresca.',
  },
  {
    script:
      'Mezclad todo en un bol grande con una cuchara de madera y tapadlo con un paño limpio. Dejadlo reposar 12 horas en un rincón templado de la cocina.',
    said: 'Mezclad todo en un bol grande con una cuchara de madera y tapadlo con un paño limpio. Dejadlo reposar doce horas en un rincón templado de la cocina.',
  },
  {
    improvised:
      'Por cierto, mi abuela siempre decía que el pan con prisas sale triste, y tenía toda la razón del mundo.',
  },
  {
    script:
      'Pasado ese tiempo, dadle la vuelta sobre la mesa enharinada, formad una bola y horneadlo a 230 grados durante 40 minutos.',
    said: 'Pasado ese tiempo, dadle la vuelta sobre la mesa enharinada, formad una bola y horneadlo a doscientos treinta grados durante cuarenta minutos.',
  },
  {
    script:
      'Dejadlo enfriar sobre una rejilla antes de cortarlo. Si os ha gustado, contadme en los comentarios cómo os ha quedado. Hasta la próxima.',
  },
] as const

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

/** A pinned file in the cache: downloaded once and always checked against its sha256. */
async function pinned(name: string, url: string, sha: string, local?: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true })
  const path = join(CACHE, name)
  if (!existsSync(path) || sha256(path) !== sha) {
    if (local) writeFileSync(path, readFileSync(local))
    else {
      const response = await fetch(url, { redirect: 'follow' })
      if (!response.ok) throw new Error(`No se pudo descargar ${name}: HTTP ${response.status}. Usa YTC_WHISPER_CLI.`)
      writeFileSync(path, Buffer.from(await response.arrayBuffer()))
    }
  }
  expect(sha256(path), `${name} no es el fijado en versions.json`).toBe(sha)
  return path
}

/** A WAV PCM 16-bit mono at 16 kHz with these samples. */
function wav(samples: Buffer) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + samples.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(samples.length, 40)
  return Buffer.concat([header, samples])
}

/** The PCM samples of a WAV written by afconvert (it may add chunks before `data`). */
function pcmOf(path: string) {
  const file = readFileSync(path)
  let at = 12
  while (at < file.length) {
    const id = file.toString('ascii', at, at + 4)
    const size = file.readUInt32LE(at + 4)
    if (id === 'data') return file.subarray(at + 8, at + 8 + size)
    at += 8 + size + (size % 2)
  }
  throw new Error(`Sin datos en ${path}`)
}

const silence = (seconds: number) => Buffer.alloc(Math.round(seconds * RATE) * 2)

/** Says every block with macOS's voice, one after another with a pause; returns the audio and when each one starts. */
function speak(dir: string) {
  const parts: Buffer[] = [silence(LEAD_SECONDS)]
  const starts: number[] = []
  let seconds = LEAD_SECONDS
  BLOCKS.forEach((block, index) => {
    const text = 'improvised' in block ? block.improvised : 'said' in block ? block.said : block.script
    const aiff = join(dir, `b${index}.aiff`)
    const pcm = join(dir, `b${index}.wav`)
    execFileSync('say', ['-v', VOICE, '-o', aiff, text])
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, pcm])
    const samples = pcmOf(pcm)
    starts.push(seconds)
    parts.push(samples, silence(GAP_SECONDS))
    seconds += samples.length / 2 / RATE + GAP_SECONDS
  })
  const audioPath = join(dir, 'audio.wav')
  writeFileSync(audioPath, wav(Buffer.concat(parts)))
  return { audioPath, starts, audioSeconds: seconds }
}

const normal = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe.runIf(process.platform === 'darwin')('whisper.cpp listening to a real voice (T075)', () => {
  it('SC-001, SC-004 and SC-005 with the pinned engine and model', async () => {
    const engine = versions.whisperCpp.assets[PLATFORM]
    expect(engine, `Sin motor fijado para ${PLATFORM}`).toBeDefined()
    expect(engine!.archive).toBe('binary')
    const binary = await pinned('whisper-cli', engine!.url, engine!.sha256, process.env['YTC_WHISPER_CLI'])
    chmodSync(binary, 0o755)
    const voice = versions.whisperModels[MODEL]!
    const vad = versions.whisperModels[VAD]!
    const modelPath = await pinned(voice.file, voice.url, voice.sha256)
    const vadPath = await pinned(vad.file, vad.url, vad.sha256)

    const dir = mkdtempSync(join(tmpdir(), 'ytc-real-speech-'))
    dirs.push(dir)
    const { audioPath, starts, audioSeconds } = speak(dir)
    const scriptBlocks = BLOCKS.flatMap((block, index) =>
      'script' in block ? [{ id: `b${index}`, text: block.script, start: starts[index]! }] : [],
    )
    const scriptText = scriptBlocks.map((block) => block.text).join('\n\n')

    const lines: string[] = []
    const recognizer = createWhisperRecognizer({
      locate: () => ({ binary, libDir: null, model: modelPath, vad: vadPath }),
      log: (line) => lines.push(line),
    })
    const progress: number[] = []
    const began = performance.now()
    const heard = await recognizer.recognize({
      audioPath,
      language: 'es',
      hint: scriptHint(scriptText),
      model: MODEL,
      signal: new AbortController().signal,
      onProgress: (fraction) => progress.push(fraction),
    })
    const wall = (performance.now() - began) / 1000
    expect(heard.ok, JSON.stringify(heard)).toBe(true)
    if (!heard.ok) return
    const words: HeardWord[] = heard.words

    // SC-001: a 10-minute video ready in under 15 minutes, so under 1.5 s per second of audio (this one is short, so
    // loading the model weighs more than it will in a real video).
    const perSecond = wall / audioSeconds

    // SC-004: what the script writes otherwise is corrected and marked; the improvised sentence stays as it was heard.
    const limits = Object.fromEntries(Object.entries(craft.data.long).map(([key, one]) => [key, one.value]))
    const aligned = align(words, scriptText)
    const cues: Cue[] = segment(aligned, limits as never, {
      audioSeconds,
      lowConfidence: craft.data.lowConfidence.value,
    })
    const output = normal(cues.map((cue) => cue.text).join(' '))
    const changed = aligned.filter((word) => word.heard !== null)
    const unmarked = changed.filter(
      (word) => !cues.some((cue) => cue.flags.includes('del_guion') && cue.start <= word.start && word.end <= cue.end),
    )
    const spellings = ['cuchara viva', '350 mililitros', '10 gramos', '12 horas', '230 grados', '40 minutos']
    const improvised = normal(
      BLOCKS.flatMap((block) => ('improvised' in block ? [block.improvised] : [])).join(' '),
    ).split(' ')
    const improvisedKept = improvised.filter((word) => output.split(' ').includes(word)).length / improvised.length

    // SC-005: each block of the script found within 2 s of where it starts.
    const found = blockStarts(
      words,
      scriptBlocks.map(({ id, text }) => ({ id, text })),
    )
    const offsets = found.map((one, index) =>
      one.seconds === null ? null : Math.abs(one.seconds - scriptBlocks[index]!.start),
    )
    const within = offsets.filter((offset) => offset !== null && offset <= 2).length / scriptBlocks.length

    const report = {
      platform: PLATFORM,
      model: MODEL,
      voice: VOICE,
      audioSeconds: Number(audioSeconds.toFixed(2)),
      wallSeconds: Number(wall.toFixed(2)),
      engineSeconds: Number(heard.seconds.toFixed(2)),
      perSecond: Number(perSecond.toFixed(3)),
      tenMinuteVideoMinutes: Number((perSecond * 10).toFixed(1)),
      words: words.length,
      lowConfidence: words.filter((word) => word.p < craft.data.lowConfidence.value).length,
      correctedByScript: changed.map((word) => `${word.heard} → ${word.text}`),
      unmarked: unmarked.length,
      spellings: Object.fromEntries(spellings.map((one) => [one, output.includes(one)])),
      improvisedKept: Number(improvisedKept.toFixed(2)),
      blockOffsets: offsets.map((offset) => (offset === null ? null : Number(offset.toFixed(2)))),
      blocksWithin2s: within,
      progressEnds: progress.at(-1),
      log: lines,
      heard: words.map((word) => `${word.start.toFixed(2)}-${word.end.toFixed(2)} ${word.text}`),
      cues: cues.map((cue) => `${cue.start.toFixed(2)}–${cue.end.toFixed(2)} [${cue.flags.join(',')}] ${cue.text}`),
    }
    // Kept to look at what was heard again by hand, with the same audio and hint.
    writeFileSync(join(CACHE, 'last-report.json'), JSON.stringify(report, null, 2))
    writeFileSync(join(CACHE, 'last-audio.wav'), readFileSync(audioPath))
    writeFileSync(join(CACHE, 'last-hint.txt'), scriptHint(scriptText))
    console.log(JSON.stringify(report, null, 2))

    expect(perSecond).toBeLessThan(1.5)
    expect(unmarked).toEqual([])
    for (const one of spellings) expect(output, one).toContain(one)
    expect(improvisedKept).toBeGreaterThanOrEqual(0.9)
    expect(within).toBeGreaterThanOrEqual(0.95)
    // The log says only the outcome: never the text heard (contract, rule 6).
    expect(lines.join(' ')).not.toMatch(/abuela|centeno/i)
  })
})

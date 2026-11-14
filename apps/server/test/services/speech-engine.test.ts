import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSpeechEngine, type SpeechVersions, speechVersionsSchema } from '../../src/services/speech-engine.ts'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const ENGINE = Buffer.from('#!/bin/sh\necho whisper\n')
const LARGE = Buffer.alloc(300_000, 7)
const SMALL = Buffer.alloc(100_000, 3)
const VAD = Buffer.alloc(9_000, 1)
const BASE = 'https://example.test'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const temporary = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ytc-speech-'))
  dirs.push(dir)
  return dir
}

/** A `.tar.gz` like the official Linux one: a folder with whisper-cli and its libraries. Made once: each tar differs. */
let archiveMade: Buffer | null = null
function linuxArchive(): Buffer {
  if (archiveMade) return archiveMade
  const dir = temporary()
  const inner = join(dir, 'whisper-bin-ubuntu-x64')
  mkdirSync(inner)
  writeFileSync(join(inner, 'whisper-cli'), ENGINE, { mode: 0o755 })
  writeFileSync(join(inner, 'libwhisper.so.1'), 'lib')
  execFileSync('tar', ['-czf', join(dir, 'a.tar.gz'), '-C', dir, 'whisper-bin-ubuntu-x64'])
  archiveMade = readFileSync(join(dir, 'a.tar.gz'))
  return archiveMade
}

function versions(over: { engineHash?: string; archive?: Buffer } = {}): SpeechVersions {
  const archive = over.archive ?? linuxArchive()
  return speechVersionsSchema.parse({
    whisperCpp: {
      version: 'b5454',
      assets: {
        'linux-x64': {
          url: `${BASE}/linux.tar.gz`,
          sha256: over.engineHash ?? sha(archive),
          sizeBytes: archive.length,
          archive: 'tar.gz',
        },
        'darwin-arm64': { url: `${BASE}/mac`, sha256: sha(ENGINE), sizeBytes: ENGINE.length, archive: 'binary' },
      },
    },
    whisperModels: {
      'large-v3-turbo-q5_0': {
        file: 'ggml-large-v3-turbo-q5_0.bin',
        url: `${BASE}/large.bin`,
        sha256: sha(LARGE),
        sizeBytes: LARGE.length,
        role: 'voz',
        recommended: true,
      },
      'small-q5_1': {
        file: 'ggml-small-q5_1.bin',
        url: `${BASE}/small.bin`,
        sha256: sha(SMALL),
        sizeBytes: SMALL.length,
        role: 'voz',
      },
      'silero-v6.2.0': {
        file: 'ggml-silero-v6.2.0.bin',
        url: `${BASE}/vad.bin`,
        sha256: sha(VAD),
        sizeBytes: VAD.length,
        role: 'deteccion',
      },
    },
  })
}

interface Served {
  body: Buffer
  /** Cut the connection after this many bytes, once. */
  cutAt?: number
  ignoreRange?: boolean
}

function server(files: Record<string, Served>) {
  const asked: { url: string; range: string | null }[] = []
  const fetch = (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    const url = String(input)
    const range = new Headers(init?.headers).get('range')
    asked.push({ url, range })
    const served = files[url.slice(BASE.length + 1)]
    if (!served) return new Response('no', { status: 404 })
    const from = range && !served.ignoreRange ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0
    const bytes = served.body.subarray(from)
    const cut = served.cutAt
    served.cutAt = undefined
    // One chunk at a time, so a cut comes after what was already read.
    const end = cut ?? bytes.length
    let at = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= end) {
          if (cut !== undefined) controller.error(new Error('conexión cortada'))
          else controller.close()
          return
        }
        controller.enqueue(new Uint8Array(bytes.subarray(at, Math.min(at + 32_768, end))))
        at += 32_768
      },
    })
    return new Response(stream, { status: from > 0 ? 206 : 200 })
  }) as typeof globalThis.fetch
  return { fetch, asked }
}

const allFiles = (archive = linuxArchive()): Record<string, Served> => ({
  'linux.tar.gz': { body: archive },
  mac: { body: ENGINE },
  'large.bin': { body: LARGE },
  'small.bin': { body: SMALL },
  'vad.bin': { body: VAD },
})

function engine(
  fetch: typeof globalThis.fetch,
  over: Partial<Parameters<typeof createSpeechEngine>[0]> & { archive?: Buffer } = {},
) {
  const appHome = over.appHome ?? temporary()
  return {
    appHome,
    engine: createSpeechEngine({
      fetch,
      appHome,
      versions: over.versions ?? versions({ archive: over.archive }),
      platform: over.platform ?? 'linux',
      arch: over.arch ?? 'x64',
      freeBytes: over.freeBytes ?? (() => 10 ** 12),
    }),
  }
}

describe('downloading the engine and its models (R1, R2)', () => {
  it('on Linux, extracts the pinned package into APP_HOME/bin/whisper/ and puts the models in APP_HOME/models/', async () => {
    const archive = linuxArchive()
    const { fetch } = server(allFiles(archive))
    const { engine: speech, appHome } = engine(fetch, { archive })
    expect(speech.status('large-v3-turbo-q5_0')).toEqual({ engine: false, model: false, vad: false })
    const result = await speech.install({ model: 'large-v3-turbo-q5_0' })
    expect(result).toEqual({ ok: true })
    expect(readFileSync(join(appHome, 'bin', 'whisper', 'whisper-cli'))).toEqual(ENGINE)
    expect(existsSync(join(appHome, 'bin', 'whisper', 'libwhisper.so.1'))).toBe(true)
    expect(readFileSync(join(appHome, 'models', 'ggml-large-v3-turbo-q5_0.bin'))).toEqual(LARGE)
    expect(readFileSync(join(appHome, 'models', 'ggml-silero-v6.2.0.bin'))).toEqual(VAD)
    expect(speech.status('large-v3-turbo-q5_0')).toEqual({ engine: true, model: true, vad: true })
    // Nothing temporary is left behind.
    expect(readdirSync(join(appHome, 'models')).sort()).toEqual([
      'ggml-large-v3-turbo-q5_0.bin',
      'ggml-silero-v6.2.0.bin',
    ])
    expect(readdirSync(join(appHome, 'bin'))).toEqual(['whisper'])
    expect(speech.paths('large-v3-turbo-q5_0')).toEqual({
      binary: join(appHome, 'bin', 'whisper', 'whisper-cli'),
      libDir: join(appHome, 'bin', 'whisper'),
      model: join(appHome, 'models', 'ggml-large-v3-turbo-q5_0.bin'),
      vad: join(appHome, 'models', 'ggml-silero-v6.2.0.bin'),
    })
  })

  it('on a Mac, the binary as it comes, ready to run and without a library folder', async () => {
    const { fetch } = server(allFiles())
    const { engine: speech, appHome } = engine(fetch, { platform: 'darwin', arch: 'arm64' })
    expect(await speech.install({ model: 'small-q5_1' })).toEqual({ ok: true })
    expect(execFileSync(join(appHome, 'bin', 'whisper', 'whisper-cli')).toString()).toBe('whisper\n')
    expect(speech.paths('small-q5_1')?.libDir).toBeNull()
  })

  it('a wrong SHA256 is `hash` and nothing changes', async () => {
    const { fetch } = server(allFiles())
    const { engine: speech, appHome } = engine(fetch, { versions: versions({ engineHash: 'a'.repeat(64) }) })
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: false, failure: 'hash' })
    expect(existsSync(join(appHome, 'bin', 'whisper'))).toBe(false)
    expect(speech.status('large-v3-turbo-q5_0').engine).toBe(false)
  })

  it('a model whose bytes do not match is `hash`, and its broken download is thrown away', async () => {
    const files = allFiles()
    files['large.bin'] = { body: Buffer.alloc(LARGE.length, 9) }
    const { fetch } = server(files)
    const { engine: speech, appHome } = engine(fetch)
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: false, failure: 'hash' })
    expect(readdirSync(join(appHome, 'models')).filter((name) => name.startsWith('ggml-large'))).toEqual([])
  })

  it('a download cut halfway is `descarga`, and the next one goes on from where it stopped with Range', async () => {
    const files = allFiles()
    files['large.bin'] = { body: LARGE, cutAt: 120_000 }
    const { fetch, asked } = server(files)
    const { engine: speech, appHome } = engine(fetch)
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: false, failure: 'descarga' })
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: true })
    const large = asked.filter((one) => one.url.endsWith('/large.bin'))
    expect(large.map((one) => one.range)).toEqual([null, 'bytes=120000-'])
    expect(readFileSync(join(appHome, 'models', 'ggml-large-v3-turbo-q5_0.bin'))).toEqual(LARGE)
  })

  it('a server that ignores Range sends it all again, and it is still right', async () => {
    const files = allFiles()
    files['large.bin'] = { body: LARGE, cutAt: 50_000, ignoreRange: true }
    const { fetch } = server(files)
    const { engine: speech, appHome } = engine(fetch)
    await speech.install({ model: 'large-v3-turbo-q5_0' })
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: true })
    expect(readFileSync(join(appHome, 'models', 'ggml-large-v3-turbo-q5_0.bin'))).toEqual(LARGE)
  })

  it('without room on the disk, `espacio` before downloading anything', async () => {
    const { fetch, asked } = server(allFiles())
    const { engine: speech } = engine(fetch, { freeBytes: () => 1000 })
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: false, failure: 'espacio' })
    expect(asked).toEqual([])
  })

  it('a system without its entry in versions.json is `descarga`', async () => {
    const { fetch, asked } = server(allFiles())
    const { engine: speech } = engine(fetch, { platform: 'darwin', arch: 'x64' })
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: false, failure: 'descarga' })
    expect(asked).toEqual([])
  })

  it('a server that fails is `descarga`', async () => {
    const files = allFiles()
    delete files['vad.bin']
    const { fetch } = server(files)
    const { engine: speech } = engine(fetch)
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: false, failure: 'descarga' })
  })

  it('what is already there is not downloaded again', async () => {
    const { fetch, asked } = server(allFiles())
    const { engine: speech } = engine(fetch)
    await speech.install({ model: 'large-v3-turbo-q5_0' })
    const before = asked.length
    expect(await speech.install({ model: 'large-v3-turbo-q5_0' })).toEqual({ ok: true })
    expect(asked.length).toBe(before)
    // Only the model that is missing.
    await speech.install({ model: 'small-q5_1' })
    expect(asked.slice(before).map((one) => one.url)).toEqual([`${BASE}/small.bin`])
  })

  it('reports the progress in bytes, growing up to the total of what is missing', async () => {
    const archive = linuxArchive()
    const { fetch } = server(allFiles(archive))
    const { engine: speech } = engine(fetch, { archive })
    const seen: [number, number][] = []
    await speech.install({ model: 'large-v3-turbo-q5_0', onProgress: (done, total) => seen.push([done, total]) })
    const total = archive.length + LARGE.length + VAD.length
    expect(seen.length).toBeGreaterThan(1)
    expect(seen.every(([, t]) => t === total)).toBe(true)
    expect(seen.map(([done]) => done)).toEqual([...seen.map(([done]) => done)].sort((a, b) => a - b))
    expect(seen.at(-1)).toEqual([total, total])
  })

  it('an unknown model, or the detection one, cannot be chosen', async () => {
    const { fetch } = server(allFiles())
    const { engine: speech } = engine(fetch)
    expect(speech.isSpeechModel('silero-v6.2.0')).toBe(false)
    expect(speech.isSpeechModel('otro')).toBe(false)
    expect(speech.isSpeechModel('small-q5_1')).toBe(true)
    expect(speech.recommended).toBe('large-v3-turbo-q5_0')
  })
})

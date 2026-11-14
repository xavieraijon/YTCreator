import { createHash } from 'node:crypto'
import { type SpeechVersions, speechVersionsSchema } from './speech-engine.ts'

// For the tests and the e2e with the fake recognizer: the same download, from a fake server, of small files that
// stand for the engine and the models. Only in a build that allows fakes (main.ts checks __YTC_ALLOW_FAKE_AI__).

const BASE = 'https://descargas.ytcreator.test'
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export function fakeSpeechDownloads(platform: string, arch: string, { delayMs = 0 } = {}) {
  const files: Record<string, Uint8Array> = {
    'whisper-cli': new TextEncoder().encode('#!/bin/sh\nexit 0\n'),
    'large.bin': new Uint8Array(600_000).fill(1),
    'small.bin': new Uint8Array(200_000).fill(2),
    'vad.bin': new Uint8Array(1_000).fill(3),
  }
  const piece = (name: string) => ({
    url: `${BASE}/${name}`,
    sha256: sha(files[name]!),
    sizeBytes: files[name]!.length,
  })
  const versions: SpeechVersions = speechVersionsSchema.parse({
    whisperCpp: {
      // Not the pinned one: a fake left in a development folder is never taken for the real program.
      version: 'falso',
      assets: { [`${platform}-${arch}`]: { ...piece('whisper-cli'), archive: 'binary' } },
    },
    whisperModels: {
      'large-v3-turbo-q5_0': {
        file: 'ggml-large-v3-turbo-q5_0.bin',
        ...piece('large.bin'),
        role: 'voz',
        recommended: true,
      },
      'small-q5_1': { file: 'ggml-small-q5_1.bin', ...piece('small.bin'), role: 'voz' },
      'silero-v6.2.0': { file: 'ggml-silero-v6.2.0.bin', ...piece('vad.bin'), role: 'deteccion' },
    },
  })
  const fetch = (async (input: Parameters<typeof globalThis.fetch>[0]) => {
    const bytes = files[String(input).slice(BASE.length + 1)]
    if (!bytes) return new Response('no', { status: 404 })
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    return new Response(bytes, { status: 200 })
  }) as typeof globalThis.fetch
  return { versions, fetch }
}

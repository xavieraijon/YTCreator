import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createReaderUpdate, readReaderVersion, type ReaderVersions } from '../../src/services/reader-update.ts'

const BINARY = Buffer.from('#!/bin/sh\necho 2026.08.19\n')
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const URL_MAC = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_macos'

const versions = (hash = sha(BINARY)): ReaderVersions => ({
  ytDlp: { version: '2026.08.19', assets: { 'darwin-arm64': { url: URL_MAC, sha256: hash } } },
})

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function binDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ytc-reader-'))
  dirs.push(dir)
  return join(dir, 'bin')
}

function serving(body: Buffer | null, status = 200) {
  const asked: string[] = []
  const fetch = (async (input: Parameters<typeof globalThis.fetch>[0]) => {
    asked.push(String(input))
    if (body === null) throw new Error('sin red')
    return new Response(new Uint8Array(body), { status })
  }) as typeof globalThis.fetch
  return { fetch, asked }
}

describe('createReaderUpdate', () => {
  it('downloads the pinned version, checks its SHA256 and leaves it ready to run', async () => {
    const bin = binDir()
    const { fetch, asked } = serving(BINARY)
    const update = createReaderUpdate({ fetch, binDir: bin, versions: versions(), platform: 'darwin', arch: 'arm64' })
    expect(await update()).toEqual({ ok: true, version: '2026.08.19' })
    expect(asked).toEqual([URL_MAC])
    expect(readFileSync(join(bin, 'yt-dlp'))).toEqual(BINARY)
    expect(statSync(join(bin, 'yt-dlp')).mode & 0o777).toBe(0o755)
    expect(readReaderVersion(bin)).toBe('2026.08.19')
    expect(readdirSync(bin).sort()).toEqual(['yt-dlp', 'yt-dlp.version'])
  })

  it('a download that does not match its hash: nothing replaced, nothing left behind', async () => {
    const bin = binDir()
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'yt-dlp'), 'el de antes', { mode: 0o755 })
    writeFileSync(join(bin, 'yt-dlp.version'), '2026.01.01\n')
    const update = createReaderUpdate({
      fetch: serving(Buffer.from('otra cosa')).fetch,
      binDir: bin,
      versions: versions(),
      platform: 'darwin',
      arch: 'arm64',
    })
    expect(await update()).toEqual({ ok: false, failure: 'hash' })
    expect(readFileSync(join(bin, 'yt-dlp'), 'utf8')).toBe('el de antes')
    expect(readReaderVersion(bin)).toBe('2026.01.01')
    expect(readdirSync(bin).sort()).toEqual(['yt-dlp', 'yt-dlp.version'])
  })

  it('no network, or an error answer → descarga', async () => {
    for (const { fetch } of [serving(null), serving(Buffer.from('no'), 404)]) {
      const bin = binDir()
      const update = createReaderUpdate({ fetch, binDir: bin, versions: versions(), platform: 'darwin', arch: 'arm64' })
      expect(await update()).toEqual({ ok: false, failure: 'descarga' })
      expect(existsSync(join(bin, 'yt-dlp'))).toBe(false)
    }
  })

  it('a system with no pinned file → descarga, without asking anything', async () => {
    const { fetch, asked } = serving(BINARY)
    const update = createReaderUpdate({ fetch, binDir: binDir(), versions: versions(), platform: 'win32', arch: 'x64' })
    expect(await update()).toEqual({ ok: false, failure: 'descarga' })
    expect(asked).toEqual([])
  })

  it('the same version already there downloads nothing', async () => {
    const bin = binDir()
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'yt-dlp'), BINARY, { mode: 0o755 })
    writeFileSync(join(bin, 'yt-dlp.version'), '2026.08.19\n')
    const { fetch, asked } = serving(BINARY)
    const update = createReaderUpdate({ fetch, binDir: bin, versions: versions(), platform: 'darwin', arch: 'arm64' })
    expect(await update()).toEqual({ ok: true, version: '2026.08.19' })
    expect(asked).toEqual([])
  })
})

describe('readReaderVersion', () => {
  it('null when the reader was never installed', () => {
    expect(readReaderVersion(binDir())).toBeNull()
  })
})

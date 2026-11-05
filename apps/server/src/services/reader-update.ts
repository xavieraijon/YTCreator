import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

// installer/versions.json: the version of the YouTube reader, and where to get it and its SHA256 for each system.
export const readerVersionsSchema = z.object({
  ytDlp: z.object({
    version: z.string().min(1),
    assets: z.record(
      z.string(),
      z.object({ url: z.url({ protocol: /^https$/ }), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
    ),
  }),
})
export type ReaderVersions = z.infer<typeof readerVersionsSchema>

// The codes of contracts/installer.md; the log carries the code, never a path or the address.
export type ReaderUpdateFailure = 'descarga' | 'hash' | 'permisos'
export type ReaderUpdateResult = { ok: true; version: string } | { ok: false; failure: ReaderUpdateFailure }

export interface ReaderUpdateOptions {
  fetch: typeof globalThis.fetch
  binDir: string
  versions: ReaderVersions
  platform: NodeJS.Platform
  arch: string
  timeoutMs?: number
}

const BINARY = 'yt-dlp'
const VERSION_FILE = 'yt-dlp.version'

/** The version the installer (or the last update) left, or null if the reader is not there. */
export function readReaderVersion(binDir: string): string | null {
  try {
    if (!existsSync(join(binDir, BINARY))) return null
    return readFileSync(join(binDir, VERSION_FILE), 'utf8').trim() || null
  } catch {
    return null
  }
}

// «Actualizar el lector de YouTube» does what the installer does (R2): the pinned version, checked against its SHA256
// in a temporary file, and only then put in place. Never «the latest». A failure leaves the reader as it was.
export function createReaderUpdate({
  fetch,
  binDir,
  versions,
  platform,
  arch,
  timeoutMs = 600_000,
}: ReaderUpdateOptions) {
  return async (): Promise<ReaderUpdateResult> => {
    const { version, assets } = versions.ytDlp
    if (readReaderVersion(binDir) === version) return { ok: true, version }
    const asset = assets[`${platform}-${arch}`]
    if (!asset) return { ok: false, failure: 'descarga' }

    let bytes: Buffer
    try {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) return { ok: false, failure: 'descarga' }
      bytes = Buffer.from(await response.arrayBuffer())
    } catch {
      return { ok: false, failure: 'descarga' }
    }
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) return { ok: false, failure: 'hash' }

    // Both files are written beside the real ones first; the renames that follow are what can hardly fail.
    const suffix = `${randomBytes(6).toString('hex')}.tmp`
    const temporary = join(binDir, `.${BINARY}.${suffix}`)
    const temporaryVersion = join(binDir, `.${VERSION_FILE}.${suffix}`)
    try {
      mkdirSync(binDir, { recursive: true, mode: 0o700 })
      writeFileSync(temporary, bytes, { mode: 0o700 })
      chmodSync(temporary, 0o755)
      writeFileSync(temporaryVersion, `${version}\n`)
      renameSync(temporary, join(binDir, BINARY))
      renameSync(temporaryVersion, join(binDir, VERSION_FILE))
      return { ok: true, version }
    } catch {
      rmSync(temporary, { force: true })
      rmSync(temporaryVersion, { force: true })
      return { ok: false, failure: 'permisos' }
    }
  }
}

export type ReaderUpdate = ReturnType<typeof createReaderUpdate>

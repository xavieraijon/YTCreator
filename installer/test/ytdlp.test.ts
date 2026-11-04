import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeRelease, stampInstallScript, writeClaudeInstaller, YTDLP_FILES } from './fixtures/make-release.ts'
import { makeTempHome, runInstaller, type Platform, type TestHome } from './helpers.ts'

const TEMPLATE = join(import.meta.dirname, '..', 'install.sh')
const STAMP_SCRIPT = join(import.meta.dirname, '..', 'stamp.sh')
const FAILED = 'No hemos podido preparar el lector de YouTube. Puedes seguir; lo intentaremos desde Ajustes.'

describe.each<Exclude<Platform, 'freebsd'>>(['darwin-arm64', 'linux-x64'])('YouTube reader step on %s', (platform) => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  function setup(): { h: TestHome; script: string; binary: string; file: string } {
    const h = makeTempHome(platform)
    const release = makeRelease(h.serveDir)
    writeClaudeInstaller(h.serveDir)
    const workDir = mkdtempSync(join(tmpdir(), 'ytc-stamped-'))
    const script = join(workDir, 'install.sh')
    stampInstallScript(TEMPLATE, script, release, STAMP_SCRIPT)
    cleanups.push(h.cleanup, release.cleanup, () => rmSync(workDir, { recursive: true, force: true }))
    return { h, script, binary: join(h.appHome, 'bin', 'yt-dlp'), file: YTDLP_FILES[platform] }
  }

  const logsOf = (h: TestHome) => {
    const dir = join(h.appHome, 'logs')
    return readdirSync(dir)
      .map((name) => readFileSync(join(dir, name), 'utf8'))
      .join('\n')
  }

  it('downloads it, leaves it executable and says so', () => {
    const { h, script, binary, file } = setup()
    const run = runInstaller(script, h)
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('Preparando el lector de YouTube…')
    expect(run.stdout).toContain('Lector de YouTube listo.')
    expect(readFileSync(binary, 'utf8')).toContain('fake reader')
    expect(statSync(binary).mode & 0o111).not.toBe(0)
    expect(h.curlCalls()).toContain(file)
    // Only the binary and its version: the temporary file is gone.
    expect(readdirSync(join(h.appHome, 'bin')).sort()).toEqual(['yt-dlp', 'yt-dlp.version'])
  })

  it('a wrong hash removes the temporary file and the install goes on', () => {
    const { h, script, binary, file } = setup()
    h.setCurlPlan({ [file]: { corrupt: true } })
    const run = runInstaller(script, h)
    expect(run.code).toBe(0)
    expect(run.stdout).toContain(FAILED)
    expect(run.stdout).toContain('YTCreator está listo')
    expect(existsSync(binary)).toBe(false)
    expect(readdirSync(join(h.appHome, 'bin'))).toEqual([])
    expect(logsOf(h)).toContain('youtube reader: code=hash')
  })

  it('without a connection it warns and the install goes on', () => {
    const { h, script, binary, file } = setup()
    h.setCurlPlan({ [file]: { failTimes: 99 } })
    const run = runInstaller(script, h)
    expect(run.code).toBe(0)
    expect(run.stdout).toContain(FAILED)
    expect(run.stdout).toContain('YTCreator está listo')
    expect(existsSync(binary)).toBe(false)
    const log = logsOf(h)
    expect(log).toContain('youtube reader: code=descarga')
    // Never a personal path next to the code.
    expect(
      log
        .split('\n')
        .filter((line) => line.includes('youtube reader'))
        .join('\n'),
    ).not.toContain(h.home)
  })

  it('the same version already installed downloads nothing', () => {
    const { h, script, file } = setup()
    expect(runInstaller(script, h).code).toBe(0)
    const downloads = h.curlCalls().filter((name) => name === file).length
    expect(downloads).toBe(1)
    expect(runInstaller(script, h).code).toBe(0)
    expect(h.curlCalls().filter((name) => name === file).length).toBe(1)
  })

  it('a failed download later is tried again by the next install', () => {
    const { h, script, binary, file } = setup()
    h.setCurlPlan({ [file]: { failTimes: 1 } })
    expect(runInstaller(script, h).code).toBe(0)
    expect(existsSync(binary)).toBe(false)
    expect(runInstaller(script, h).code).toBe(0)
    expect(existsSync(binary)).toBe(true)
  })
})

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeRelease, stampInstallScript, writeClaudeInstaller, type Release } from './fixtures/make-release.ts'
import { makeTempHome, runInstaller, type Platform, type TestHome } from './helpers.ts'

const TEMPLATE = join(import.meta.dirname, '..', 'install.sh')
const STAMP_SCRIPT = join(import.meta.dirname, '..', 'stamp.sh')

/** Builds a release fixture and stamps install.sh against it, serving the release from `home.serveDir`. */
function stampFor(home: TestHome, version = '1.0.0'): { release: Release; script: string; cleanup: () => void } {
  const release = makeRelease(home.serveDir, version)
  const workDir = mkdtempSync(join(tmpdir(), 'ytc-stamped-'))
  const script = join(workDir, 'install.sh')
  stampInstallScript(TEMPLATE, script, release, STAMP_SCRIPT)
  return {
    release,
    script,
    cleanup: () => {
      release.cleanup()
      rmSync(workDir, { recursive: true, force: true })
    },
  }
}

describe('installer/install.sh', () => {
  const homes: TestHome[] = []
  const cleanups: Array<() => void> = []

  function home(platform: Platform): TestHome {
    const h = makeTempHome(platform)
    homes.push(h)
    return h
  }

  afterEach(() => {
    while (homes.length) homes.pop()!.cleanup()
    while (cleanups.length) cleanups.pop()!()
  })

  describe.each<Platform>(['darwin-arm64', 'linux-x64'])('clean install on %s', (platform) => {
    it('installs, migrates and opens YTCreator, ending with exit code 0', () => {
      const h = home(platform)
      const { script, cleanup } = stampFor(h)
      cleanups.push(cleanup)

      const result = runInstaller(script, h)

      expect(result.stderr).toBe('')
      expect(result.code).toBe(0)
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
        expect(result.stdout).toContain(`Paso ${n} de 8 ·`)
      }
      expect(result.stdout).toContain('YTCreator está listo')

      const tree = h.tree()
      expect(tree).toContain('app/install.json')
      // `app/current` is a symlink to `app/versions/<version>`; tree() follows it, so its target's files show up
      // under the `current/` prefix too.
      expect(tree).toContain('app/current/VERSION')
      expect(tree).toContain('workspace/.ytcreator')

      // No secret material anywhere under the workspace (R3: secrets never live there).
      expect(tree.some((p) => p.includes('secret'))).toBe(false)
    })
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('resumes after an interruption at step %i with the same end state', (n) => {
    const h = home('darwin-arm64')
    const { script, cleanup } = stampFor(h)
    cleanups.push(cleanup)

    const interrupted = runInstaller(script, h, { YTCREATOR_INSTALL_FAIL_STEP: String(n) })
    expect(interrupted.code).toBe(99)

    const resumed = runInstaller(script, h, { YTCREATOR_INSTALL_FAIL_STEP: '0' })
    expect(resumed.code).toBe(0)
    expect(resumed.stdout).toContain('YTCreator está listo')

    const baseline = home('darwin-arm64')
    const baselineFixture = stampFor(baseline)
    cleanups.push(baselineFixture.cleanup)
    const clean = runInstaller(baselineFixture.script, baseline)
    expect(clean.code).toBe(0)

    // Log filenames embed the install's start time (R2), so they differ run to run by design; compare everything else.
    const withoutLogs = (tree: string[]) => tree.filter((p) => !p.startsWith('app/logs/'))
    expect(withoutLogs(h.tree())).toEqual(withoutLogs(baseline.tree()))
  })

  it('stops with code 10 on an unsupported system', () => {
    const h = home('freebsd')
    const { script, cleanup } = stampFor(h)
    cleanups.push(cleanup)

    const result = runInstaller(script, h)

    expect(result.code).toBe(10)
    expect(h.tree()).toEqual([])
  })

  it('stops with code 20 when ~/YTCreator already holds foreign content', () => {
    const h = home('darwin-arm64')
    const { script, cleanup } = stampFor(h)
    cleanups.push(cleanup)
    mkdirSync(h.workspace, { recursive: true })
    writeFileSync(join(h.workspace, 'not-ours-placeholder.txt'), 'hello')

    const result = runInstaller(script, h)

    expect(result.code).toBe(20)
  })

  it('stops with code 31 when a downloaded file fails its checksum', () => {
    const h = home('darwin-arm64')
    const { release, script, cleanup } = stampFor(h)
    cleanups.push(cleanup)
    h.setCurlPlan({ [`ytcreator-${release.version}.tar.gz`]: { corrupt: true } })

    const result = runInstaller(script, h)

    expect(result.code).toBe(31)
    expect(h.tree().some((p) => p.endsWith('.partial'))).toBe(false)
  })

  it('warns and finishes with code 0 when the Claude Code installer fails', () => {
    const h = home('darwin-arm64')
    const { script, cleanup } = stampFor(h)
    cleanups.push(cleanup)
    writeClaudeInstaller(h.serveDir, false)

    const result = runInstaller(script, h)

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('No se ha podido instalar Claude Code')
  })

  it('skips the Claude Code installer entirely when it is already installed', () => {
    const h = home('darwin-arm64')
    const { script, cleanup } = stampFor(h)
    cleanups.push(cleanup)
    h.installFakeClaude()

    const result = runInstaller(script, h)

    expect(result.code).toBe(0)
    expect(h.curlCalls()).not.toContain('claude-install.sh')
  })
})

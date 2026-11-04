import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeRelease, stampInstallScript, writeClaudeInstaller, type Release } from './fixtures/make-release.ts'
import { makeTempHome, runInstaller, type Platform, type TestHome } from './helpers.ts'

const TEMPLATE = join(import.meta.dirname, '..', 'install.sh')
const STAMP_SCRIPT = join(import.meta.dirname, '..', 'stamp.sh')

/** Builds a release fixture and stamps install.sh against it, serving the release from `home.serveDir`. */
function stampFor(
  home: TestHome,
  version = '1.0.0',
  opts: { migrateFails?: boolean } = {},
): { release: Release; script: string; cleanup: () => void } {
  const release = makeRelease(home.serveDir, version, opts)
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
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        expect(result.stdout).toContain(`Paso ${n} de 9 ·`)
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

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('resumes after an interruption at step %i with the same end state', (n) => {
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

  // FR-001b: what the creator needs is said before step 1, on every run, without asking anything. The update run is
  // covered with the update cases (T144).
  it('starts with the AI requirements notice before step 1, on install and on reinstall', () => {
    const h = home('darwin-arm64')
    const { script, cleanup } = stampFor(h)
    cleanups.push(cleanup)
    const notice =
      'YTCreator necesita una suscripción de Claude que incluya Claude Code (Pro o Max)\n' +
      'o una cuenta de Anthropic con saldo. No incluye una IA gratuita.\n'

    for (const run of [runInstaller(script, h), runInstaller(script, h)]) {
      expect(run.code).toBe(0)
      expect(run.stdout.startsWith(notice)).toBe(true)
      expect(run.stdout.indexOf(notice)).toBeLessThan(run.stdout.indexOf('Paso 1 de 9'))
    }
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

  it('updates from v1 to v2 keeping data and secrets, moving current to v2 and keeping v1 (R21)', () => {
    const h = home('darwin-arm64')
    const v1 = stampFor(h, '1.0.0')
    cleanups.push(v1.cleanup)

    const installed = runInstaller(v1.script, h)
    expect(installed.code).toBe(0)

    const dbPath = join(h.workspace, 'ytcreator.db')
    const secretPath = join(h.appHome, 'secrets', 'test-secret.txt')
    const accountPath = join(h.appHome, 'claude-accounts', 'test-account.json')
    writeFileSync(dbPath, 'test-db-data')
    writeFileSync(secretPath, 'test-secret-data')
    writeFileSync(accountPath, '{"test":"account"}')

    const v2 = stampFor(h, '2.0.0')
    cleanups.push(v2.cleanup)

    const updated = runInstaller(v2.script, h)

    expect(updated.code).toBe(0)
    expect(readFileSync(dbPath, 'utf8')).toBe('test-db-data')
    expect(readFileSync(secretPath, 'utf8')).toBe('test-secret-data')
    expect(readFileSync(accountPath, 'utf8')).toBe('{"test":"account"}')
    expect(readFileSync(join(h.appHome, 'current', 'VERSION'), 'utf8')).toBe('2.0.0')
    expect(h.tree()).toContain('app/versions/1.0.0/VERSION')
    expect(h.tree()).toContain('app/versions/2.0.0/VERSION')
  })

  it('stops with code 60 on a failing migration, restoring the database byte for byte and keeping current on v1', () => {
    const h = home('darwin-arm64')
    const v1 = stampFor(h, '1.0.0')
    cleanups.push(v1.cleanup)

    const installed = runInstaller(v1.script, h)
    expect(installed.code).toBe(0)

    const dbPath = join(h.workspace, 'ytcreator.db')
    writeFileSync(dbPath, 'before-the-failed-migration')
    const originalDb = readFileSync(dbPath)

    const v2 = stampFor(h, '2.0.0', { migrateFails: true })
    cleanups.push(v2.cleanup)

    const updated = runInstaller(v2.script, h)

    expect(updated.code).toBe(60)
    expect(updated.stderr).toContain('No se han podido preparar tus datos para la nueva versión')
    expect(updated.stderr).toContain('Tus datos se han dejado como estaban: sigues con la versión anterior')
    expect(readFileSync(dbPath)).toEqual(originalDb)
    expect(readFileSync(join(h.appHome, 'current', 'VERSION'), 'utf8')).toBe('1.0.0')
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

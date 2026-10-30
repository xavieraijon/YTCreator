import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// bin/ytcreator (R6, contracts/installer.md Lanzador) is never exercised by installer/test/install.test.ts:
// its fixture replaces it with a trivial stub (make-release.ts) that doesn't compute APP_HOME at all. This
// test runs the real script, in both shapes install.sh invokes it with, so a regression in its path logic
// (as happened once: step 6 runs it one level deeper than "current/bin/ytcreator") fails here instead of only
// surfacing in a real install.
describe('bin/ytcreator (launcher)', () => {
  const launcher = join(import.meta.dirname, '..', 'bin', 'ytcreator')

  // Mirrors cli.ts's real entry-point guard (fileURLToPath(import.meta.url) realpath'd vs process.argv[1]):
  // a stub that always ran, regardless of the guard, would never catch a mismatch like the one that let
  // `open`/`serve` through `current` (a symlink) silently no-op while `migrate` at its real versions/<v>
  // path (no symlink) kept working — exit 0, zero output, nobody noticed.
  const fakeServer = `
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  console.log('server.mjs', process.argv.slice(2).join(' '))
}
`

  function makeAppHome(): { appHome: string; cleanup: () => void } {
    const appHome = mkdtempSync(join(tmpdir(), 'ytc-app-home-'))
    const versionDir = join(appHome, 'versions', '1.0.0')
    mkdirSync(join(versionDir, 'bin'), { recursive: true })
    writeFileSync(join(versionDir, 'server.mjs'), fakeServer)
    const launcherCopy = join(versionDir, 'bin', 'ytcreator')
    writeFileSync(launcherCopy, readFileSync(launcher))
    chmodSync(launcherCopy, 0o755)

    // A fake Node runtime: only its existence and executability matter, the launcher execs it as the final step.
    const nodeDir = join(appHome, 'runtime', 'node-v24.9.0', 'bin')
    mkdirSync(nodeDir, { recursive: true })
    writeFileSync(join(nodeDir, 'node'), readFileSync(process.execPath))
    chmodSync(join(nodeDir, 'node'), 0o755)

    return { appHome, cleanup: () => rmSync(appHome, { recursive: true, force: true }) }
  }

  it('resolves APP_HOME and actually runs server.mjs when run through the "current" symlink, as `open`/`serve` do', () => {
    const { appHome, cleanup } = makeAppHome()
    try {
      symlinkSync(join(appHome, 'versions', '1.0.0'), join(appHome, 'current'))
      const result = spawnSync(join(appHome, 'current', 'bin', 'ytcreator'), ['open'], { encoding: 'utf8' })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      // Guards against the entry-point check comparing a symlink-resolved import.meta.url against a
      // non-resolved argv[1]: that mismatch made this print nothing while still exiting 0.
      expect(result.stdout).toBe('server.mjs open\n')
    } finally {
      cleanup()
    }
  })

  it(
    'resolves APP_HOME from YTC_APP_HOME and runs server.mjs when run at its real versions/<v> path, as step 6 ' +
      'does before "current" is moved there',
    () => {
      const { appHome, cleanup } = makeAppHome()
      try {
        const result = spawnSync(join(appHome, 'versions', '1.0.0', 'bin', 'ytcreator'), ['migrate'], {
          encoding: 'utf8',
          env: { ...process.env, YTC_APP_HOME: appHome },
        })
        expect(result.stderr).toBe('')
        expect(result.status).toBe(0)
        expect(result.stdout).toBe('server.mjs migrate\n')
      } finally {
        cleanup()
      }
    },
  )

  it('fails with its own message, not a wrong path, when run at its real path without YTC_APP_HOME', () => {
    const { appHome, cleanup } = makeAppHome()
    try {
      const env = { ...process.env }
      delete env.YTC_APP_HOME
      const result = spawnSync(join(appHome, 'versions', '1.0.0', 'bin', 'ytcreator'), ['migrate'], {
        encoding: 'utf8',
        env,
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(join(appHome, 'versions', 'runtime'))
    } finally {
      cleanup()
    }
  })
})

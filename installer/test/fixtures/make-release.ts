import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Fixed in fixtures: install.sh stamps whatever version SHA256SUMS says, it doesn't need to be a real release.
export const NODE_VERSION = '24.9.0'
const NODE_PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'] as const

function tarGz(srcDir: string, destFile: string) {
  const result = spawnSync('tar', ['-czf', destFile, '-C', srcDir, '.'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`tar failed: ${result.stderr}`)
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export interface Release {
  readonly serveDir: string
  readonly version: string
  readonly nodeVersion: string
  readonly sums: Record<string, string>
  readonly cleanup: () => void
}

/** Builds a local "GitHub release" fixture (R1): the release tarball, the 4 Node runtimes and SHA256SUMS. */
export function makeRelease(serveDir: string, version = '1.0.0', opts: { migrateFails?: boolean } = {}): Release {
  const work = mkdtempSync(join(tmpdir(), 'ytc-release-'))
  const sums: Record<string, string> = {}

  const releaseRoot = join(work, 'release')
  mkdirSync(join(releaseRoot, 'bin'), { recursive: true })
  writeFileSync(join(releaseRoot, 'VERSION'), version)
  writeFileSync(join(releaseRoot, 'server.mjs'), "console.log('fake server.mjs', process.argv.slice(2).join(' '))\n")
  writeFileSync(
    join(releaseRoot, 'bin', 'ytcreator'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'case "${1:-open}" in',
      `  migrate) exit ${opts.migrateFails ? 1 : 0} ;;`,
      // Real `open` never returns while the app runs (main.ts's serve() blocks on the listening socket): a
      // stub that returned immediately would never have caught step 8 calling it synchronously, which hung
      // install.sh forever once the entry-point guard that used to make `open` a silent no-op got fixed.
      '  open) echo "YTCreator fake open http://127.0.0.1:4310"; sleep 300 ;;',
      '  *) exit 2 ;;',
      'esac',
      '',
    ].join('\n'),
  )
  chmodSync(join(releaseRoot, 'bin', 'ytcreator'), 0o755)
  const releaseFile = join(serveDir, `ytcreator-${version}.tar.gz`)
  tarGz(releaseRoot, releaseFile)
  sums[`ytcreator-${version}.tar.gz`] = sha256(releaseFile)

  // One fake Node runtime per supported platform: only `bin/node --version` is ever exercised by the installer.
  for (const platform of NODE_PLATFORMS) {
    const nodeDir = join(work, `node-${platform}`)
    const nodeRoot = join(nodeDir, `node-v${NODE_VERSION}-${platform}`)
    mkdirSync(join(nodeRoot, 'bin'), { recursive: true })
    writeFileSync(
      join(nodeRoot, 'bin', 'node'),
      ['#!/usr/bin/env bash', '[ "${1:-}" = "--version" ] && echo "v' + NODE_VERSION + '"', ''].join('\n'),
    )
    chmodSync(join(nodeRoot, 'bin', 'node'), 0o755)
    const file = join(serveDir, `node-v${NODE_VERSION}-${platform}.tar.gz`)
    tarGz(nodeDir, file)
    sums[`node-v${NODE_VERSION}-${platform}.tar.gz`] = sha256(file)
  }

  writeFileSync(
    join(serveDir, 'SHA256SUMS'),
    Object.entries(sums)
      .map(([name, sum]) => `${sum}  ${name}`)
      .join('\n') + '\n',
  )

  return {
    serveDir,
    version,
    nodeVersion: NODE_VERSION,
    sums,
    cleanup: () => rmSync(work, { recursive: true, force: true }),
  }
}

/**
 * Writes the fixture the installer's step 5 pipes into `bash` in place of `curl -fsSL https://claude.ai/install.sh`.
 * `succeed: false` warns (step 5 never stops the install, per contract).
 */
export function writeClaudeInstaller(serveDir: string, succeed = true) {
  const script = succeed
    ? [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'mkdir -p "$HOME/.local/bin"',
        'cat > "$HOME/.local/bin/claude" <<\'EOF\'',
        '#!/usr/bin/env bash',
        '[ "${1:-}" = "--version" ] && echo "1.0.0 (Claude Code)"',
        'EOF',
        'chmod +x "$HOME/.local/bin/claude"',
        '',
      ].join('\n')
    : ['#!/usr/bin/env bash', 'echo "fake claude installer: simulated failure" >&2', 'exit 1', ''].join('\n')
  writeFileSync(join(serveDir, 'claude-install.sh'), script)
}

/**
 * Stamps a copy of `installer/install.sh` with the given release's versions and sums (T072's job, run here so
 * tests exercise the same install.sh the publish flow would ship, not a hand-edited one).
 */
export function stampInstallScript(templatePath: string, outputPath: string, release: Release, stampScript: string) {
  const result = spawnSync(
    'bash',
    [stampScript, templatePath, outputPath, release.version, release.nodeVersion, join(release.serveDir, 'SHA256SUMS')],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`stamp.sh failed (${result.status}): ${result.stderr}`)
  }
}

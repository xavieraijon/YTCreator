import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

export type Platform = 'darwin-arm64' | 'darwin-x64' | 'linux-x64' | 'linux-arm64' | 'freebsd'

const UNAME: Record<Platform, { s: string; m: string }> = {
  'darwin-arm64': { s: 'Darwin', m: 'arm64' },
  'darwin-x64': { s: 'Darwin', m: 'x86_64' },
  'linux-x64': { s: 'Linux', m: 'x86_64' },
  'linux-arm64': { s: 'Linux', m: 'aarch64' },
  freebsd: { s: 'FreeBSD', m: 'amd64' },
}

/** `APP_HOME` of R3, duplicated from apps/server/src/paths.ts: the installer side has no TS to import. */
function appHomeFor(platform: Platform, home: string, xdgDataHome: string): string {
  return platform.startsWith('darwin')
    ? join(home, 'Library', 'Application Support', 'YTCreator')
    : join(xdgDataHome, 'ytcreator')
}

function writeExecutable(path: string, contents: string) {
  writeFileSync(path, contents, 'utf8')
  chmodSync(path, 0o755)
}

const nodeScript = (body: string) => `#!/usr/bin/env node\n${body}\n`

/**
 * The inherited real PATH, minus any directory that holds a `claude` binary. Dev and CI machines that already
 * have Claude Code installed would otherwise let step 5's `command -v claude` find it regardless of the fake
 * `HOME`, short-circuiting the very step the tests mean to exercise.
 */
function pathWithoutRealClaude(): string {
  return (process.env.PATH ?? '')
    .split(':')
    .filter((dir) => dir.length > 0 && !existsSync(join(dir, 'claude')))
    .join(':')
}

function fakeUname(bin: string, platform: Platform) {
  const { s, m } = UNAME[platform]
  writeExecutable(
    join(bin, 'uname'),
    nodeScript(`
const arg = process.argv[2]
console.log(arg === '-m' ? ${JSON.stringify(m)} : ${JSON.stringify(s)})
`),
  )
}

// Step 1 only checks that `script` exists; the pty wrapping it does for real is exercised in packages/ai, not here.
function fakeScript(bin: string) {
  writeExecutable(join(bin, 'script'), nodeScript('process.exit(0)'))
}

function fakeOpener(bin: string, name: string, logFile: string) {
  writeExecutable(
    join(bin, name),
    nodeScript(`
require('node:fs').appendFileSync(${JSON.stringify(logFile)}, process.argv.slice(2).join(' ') + '\\n')
`),
  )
}

/**
 * Fake `curl`: serves files by basename from `serveDir`, following an optional plan in
 * `serveDir/.curl-plan.json` (`{"<basename>": {"failTimes"?: number, "corrupt"?: true}}`) so tests can force
 * retries (code 30) or a bad checksum (code 31). Every call is appended to `serveDir/.curl-log`.
 */
function fakeCurl(bin: string, serveDir: string) {
  writeExecutable(
    join(bin, 'curl'),
    nodeScript(`
const fs = require('node:fs')
const path = require('node:path')
const serveDir = ${JSON.stringify(serveDir)}
const args = process.argv.slice(2)
let out = null
let url = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o') { out = args[++i]; continue }
  if (!args[i].startsWith('-')) url = args[i]
}
if (!url) { console.error('fake curl: no url given'); process.exit(2) }
const base = path.basename(new URL(url).pathname)
const planFile = path.join(serveDir, '.curl-plan.json')
const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : {}
const rule = plan[base] ?? {}
const stateFile = path.join(serveDir, '.curl-state.json')
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {}
state[base] = (state[base] ?? 0) + 1
fs.writeFileSync(stateFile, JSON.stringify(state))
fs.appendFileSync(path.join(serveDir, '.curl-log'), base + '\\n')
if (rule.failTimes && state[base] <= rule.failTimes) process.exit(1)
const source = path.join(serveDir, base)
if (!fs.existsSync(source)) { console.error('fake curl: no fixture for ' + base); process.exit(1) }
let data = fs.readFileSync(source)
if (rule.corrupt) data = Buffer.concat([data, Buffer.from('corrupted-by-test')])
if (out) fs.writeFileSync(out, data)
else process.stdout.write(data)
`),
  )
}

export interface TestHome {
  readonly platform: Platform
  readonly home: string
  readonly xdgDataHome: string
  readonly appHome: string
  readonly workspace: string
  readonly bin: string
  readonly serveDir: string
  readonly openLog: string
  readonly curlLog: string
  readonly env: Record<string, string>
  /** Sorted relative paths under `appHome` (prefixed `app/`) and `workspace` (prefixed `workspace/`). */
  readonly tree: () => string[]
  readonly curlCalls: () => string[]
  readonly setCurlPlan: (plan: Record<string, { failTimes?: number; corrupt?: true }>) => void
  readonly installFakeClaude: () => void
  readonly cleanup: () => void
}

function listTree(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(relative(root, full))
    }
  }
  walk(root)
  return out.sort()
}

export function makeTempHome(platform: Platform): TestHome {
  const root = mkdtempSync(join(tmpdir(), 'ytc-install-'))
  const home = join(root, 'home')
  const xdgDataHome = join(root, 'xdg-data')
  const bin = join(root, 'bin')
  const serveDir = join(root, 'serve')
  const openLog = join(root, 'open.log')
  const curlLog = join(serveDir, '.curl-log')
  for (const dir of [home, xdgDataHome, bin, serveDir]) mkdirSync(dir, { recursive: true })
  writeFileSync(openLog, '')

  fakeUname(bin, platform)
  fakeScript(bin)
  fakeOpener(bin, 'open', openLog)
  fakeOpener(bin, 'xdg-open', openLog)
  fakeCurl(bin, serveDir)

  const env: Record<string, string> = {
    HOME: home,
    XDG_DATA_HOME: xdgDataHome,
    PATH: `${bin}:${pathWithoutRealClaude()}`,
    YTCREATOR_INSTALL_TEST: '1',
    YTCREATOR_ASSUME_YES: '1',
    YTCREATOR_RELEASE_BASE: `file://${serveDir}`,
    YTCREATOR_NODE_BASE: `file://${serveDir}`,
    // Never the real https://claude.ai/install.sh in tests. Pointed at a fixture that may not exist yet: the
    // fake curl then fails harmlessly and step 5 just warns, exactly like a real but unreachable installer would.
    YTCREATOR_CLAUDE_INSTALL_URL: `file://${serveDir}/claude-install.sh`,
  }

  return {
    platform,
    home,
    xdgDataHome,
    appHome: appHomeFor(platform, home, xdgDataHome),
    workspace: join(home, 'YTCreator'),
    bin,
    serveDir,
    openLog,
    curlLog,
    env,
    tree() {
      return [
        ...listTree(this.appHome).map((p) => `app/${p}`),
        ...listTree(this.workspace).map((p) => `workspace/${p}`),
      ].sort()
    },
    curlCalls: () => (existsSync(curlLog) ? readFileLines(curlLog) : []),
    setCurlPlan(plan) {
      writeFileSync(join(serveDir, '.curl-plan.json'), JSON.stringify(plan))
    },
    installFakeClaude() {
      const dir = join(home, '.local', 'bin')
      mkdirSync(dir, { recursive: true })
      writeExecutable(
        join(dir, 'claude'),
        `#!/usr/bin/env bash\n[ "\${1:-}" = "--version" ] && echo "1.0.0 (Claude Code)"\n`,
      )
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function readFileLines(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
}

export interface InstallerResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export function runInstaller(
  scriptPath: string,
  home: TestHome,
  extraEnv: Record<string, string | undefined> = {},
): InstallerResult {
  const env: Record<string, string> = { ...home.env }
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  const result = spawnSync('bash', [scriptPath], { env, encoding: 'utf8', timeout: 60_000 })
  return { code: result.status ?? 99, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

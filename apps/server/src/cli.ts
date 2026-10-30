// Entry point of dist/server.mjs: serve | migrate | open (T063).
import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate, MIGRATIONS } from './db/migrate.ts'
import { openDatabase } from './db/open.ts'
import { createLogger } from './logging.ts'
import { serve, type StartOptions } from './main.ts'
import { appPaths } from './paths.ts'

const scriptDir = dirname(fileURLToPath(import.meta.url))

// VERSION and web/ are placed next to server.mjs when the release is packaged; absent in a dev run.
function readVersion(): string {
  try {
    return readFileSync(join(scriptDir, 'VERSION'), 'utf8').trim()
  } catch {
    return '0.0.0'
  }
}

function defaultWebDir(): string | null {
  const dir = join(scriptDir, 'web')
  return existsSync(dir) ? dir : null
}

export interface CliDeps {
  env: Record<string, string | undefined>
  platform: 'darwin' | 'linux'
  homedir: string
  version: string
  webDir: string | null
  serve: (options: StartOptions) => Promise<{ reused: boolean; url: string }>
  spawn: (command: string, args: string[]) => void
  print: (line: string) => void
}

function defaultDeps(): CliDeps {
  return {
    env: process.env,
    platform: process.platform === 'darwin' ? 'darwin' : 'linux',
    homedir: homedir(),
    version: readVersion(),
    webDir: defaultWebDir(),
    serve,
    spawn: (command, args) => {
      nodeSpawn(command, args, { stdio: 'ignore', detached: true }).unref()
    },
    print: (line) => process.stdout.write(line),
  }
}

// R6: macOS opens with `open`, Linux with `xdg-open` when there's a graphical session; otherwise just prints it.
function openInBrowser(url: string, deps: CliDeps): void {
  if (deps.platform === 'darwin') {
    deps.spawn('open', [url])
    return
  }
  if (deps.env.DISPLAY ?? deps.env.WAYLAND_DISPLAY) {
    deps.spawn('xdg-open', [url])
    return
  }
  deps.print(`YTCreator está en ${url}\n`)
}

// serve | migrate | open; any other argument (including none) exits 2 (T059/T063).
export async function runCli(argv: string[], overrides: Partial<CliDeps> = {}): Promise<number> {
  const deps = { ...defaultDeps(), ...overrides }
  const paths = appPaths({ platform: deps.platform, env: deps.env, homedir: deps.homedir })
  const [command] = argv

  if (command === 'migrate') {
    mkdirSync(paths.appHome, { recursive: true, mode: 0o700 })
    mkdirSync(paths.workspace, { recursive: true })
    const db = openDatabase(paths.database)
    try {
      migrate(db, MIGRATIONS)
      return 0
    } catch (error) {
      createLogger(paths.logs).error('migrate_failed', { error })
      return 60
    } finally {
      db.close()
    }
  }

  if (command === 'serve' || command === 'open') {
    const result = await deps.serve({ paths, env: deps.env, version: deps.version, webDir: deps.webDir })
    if (command === 'open') openInBrowser(result.url, deps)
    return 0
  }

  deps.print(`Comando desconocido: ${command ?? '(ninguno)'}\n`)
  return 2
}

// Runs for real only when this file is the process entry point; a test importing it never matches.
// import.meta.url is Node's realpath of the entry module (symlinks resolved); bin/ytcreator always runs it
// through "current", a symlink to versions/<v>, so argv[1] must be realpath'd too before the comparison —
// otherwise it never matches and the launcher silently no-ops (migrate/serve/open all exit 0 doing nothing).
function isEntryPoint(): boolean {
  if (!process.argv[1]) return false
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}

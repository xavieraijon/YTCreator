import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer } from '@hono/node-server'
import { claudeVersion, createRegistry, resolveClaudeBin } from '@ytcreator/ai'
import { migrate, MIGRATIONS } from './db/migrate.ts'
import { openDatabase } from './db/open.ts'
import { createAccountsRepo } from './db/repos/accounts.ts'
import { createConnectionsRepo } from './db/repos/connections.ts'
import { createOnboardingRepo } from './db/repos/onboarding.ts'
import { createSettingsRepo } from './db/repos/settings.ts'
import { createApp } from './http/app.ts'
import { acquireInstance, releaseInstance } from './instance.ts'
import { createLogger } from './logging.ts'
import type { AppPaths } from './paths.ts'
import { createFileStore } from './secrets/file-store.ts'
import { selectSecretStore } from './secrets/select.ts'
import { createAiConnectionsService, type ClaudeCodeStatus } from './services/ai-connections.ts'

export const HOST = '127.0.0.1'
export const PORT_RANGE = { first: 4310, last: 4329 }

export interface StartOptions {
  paths: AppPaths
  env: Record<string, string | undefined>
  version: string
  webDir: string | null
  // `YTCREATOR_PORT` is only honoured in development builds (contracts/installer.md).
  allowFixedPort?: boolean
  // Called after `POST /api/app/shutdown` has answered (R4); `serve()` below wires it to the ordered shutdown.
  onShutdown?: () => void
}

export interface RunningServer {
  port: number
  instanceId: string
  close(): Promise<void>
}

export class NoFreePortError extends Error {
  constructor() {
    super(`No hay ningún puerto libre entre ${PORT_RANGE.first} y ${PORT_RANGE.last}`)
    this.name = 'NoFreePortError'
  }
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening)
      if (error.code === 'EADDRINUSE') resolve(false)
      else reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve(true)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, HOST)
  })
}

function candidatePorts(env: StartOptions['env'], allowFixedPort: boolean): number[] {
  const fixed = Number(env.YTCREATOR_PORT)
  if (allowFixedPort && env.YTCREATOR_PORT && Number.isInteger(fixed)) return [fixed]
  const ports: number[] = []
  for (let port = PORT_RANGE.first; port <= PORT_RANGE.last; port++) ports.push(port)
  return ports
}

// `claude --version` once per start; with the fake AI the CLI is never looked for.
function claudeCodeStatus(env: StartOptions['env'], bin: string, fake: boolean): () => Promise<ClaudeCodeStatus> {
  let status: Promise<ClaudeCodeStatus> | null = null
  return () =>
    (status ??= fake
      ? Promise.resolve({ installed: true, version: null })
      : claudeVersion(bin, env).then((r) =>
          r.ok ? { installed: true, version: r.version } : { installed: false, version: null },
        ))
}

// Only on 127.0.0.1, never on 0.0.0.0 (FR-007, principle VII). Single instance and signals arrive with T060–T062.
export async function startServer({
  paths,
  env,
  version,
  webDir,
  allowFixedPort = __YTC_ALLOW_FAKE_AI__,
  onShutdown,
}: StartOptions): Promise<RunningServer> {
  mkdirSync(paths.appHome, { recursive: true, mode: 0o700 })
  mkdirSync(paths.workspace, { recursive: true })
  const logger = createLogger(paths.logs)
  const db = openDatabase(paths.database)
  migrate(db, MIGRATIONS)

  const now = () => new Date()
  const settings = createSettingsRepo(db)
  const connections = createConnectionsRepo(db, now)
  const claudeBin = resolveClaudeBin(env)
  const fake = __YTC_ALLOW_FAKE_AI__ && Boolean(env.YTCREATOR_FAKE_AI)
  const ai = createAiConnectionsService({
    connections,
    accounts: createAccountsRepo(db, now),
    settings,
    // With the fake AI the test credentials never reach the system keychain (nor wait for it to unlock).
    secrets: fake
      ? createFileStore(paths.secrets, logger)
      : await selectSecretStore({ platform: process.platform, settings, logger, fileDir: paths.secrets }),
    registry: createRegistry({ env, now, logger, claudeBin }),
    logger,
    now,
    fetch: globalThis.fetch,
    claudeAccountsDir: paths.claudeAccounts,
    claudeCode: claudeCodeStatus(env, claudeBin, fake),
  })
  const onboarding = createOnboardingRepo(db, connections, now)

  const instanceId = randomUUID()
  // The guard needs the port, known only once listening: requests reach the app after that.
  let app: ReturnType<typeof createApp> | null = null
  const server = createAdaptorServer({
    fetch: (request: Request) => (app ? app.fetch(request) : new Response(null, { status: 503 })),
  }) as Server

  let port: number | null = null
  for (const candidate of candidatePorts(env, allowFixedPort)) {
    if (await listen(server, candidate)) {
      port = (server.address() as AddressInfo).port
      break
    }
  }
  if (port === null) {
    db.close()
    throw new NoFreePortError()
  }

  app = createApp({ port, version, instanceId, logger, webDir, onShutdown, onboarding, ai })
  logger.info('server_started', { port, version })

  return {
    port,
    instanceId,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          db.close()
          resolve()
        })
      }),
  }
}

export interface ServeResult {
  reused: boolean
  url: string
}

// Used by the CLI's `serve`/`open` (T063): reuses a live instance (FR-006) or starts one, wires the ordered
// shutdown (R4) to SIGTERM/SIGINT and to `POST /api/app/shutdown`, and logs a startup failure before giving up.
export async function serve(options: StartOptions): Promise<ServeResult> {
  let running: RunningServer | null = null
  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown || !running) return
    shuttingDown = true
    await releaseInstance(options.paths, running)
    process.exit(0)
  }

  try {
    const result = await acquireInstance({
      paths: options.paths,
      version: options.version,
      start: async () => {
        running = await startServer({ ...options, onShutdown: () => void shutdown() })
        return running
      },
    })
    if (result.reused) return { reused: true, url: result.url }
    process.on('SIGTERM', () => void shutdown())
    process.on('SIGINT', () => void shutdown())
    return { reused: false, url: result.url }
  } catch (error) {
    createLogger(options.paths.logs).error('server_start_failed', { error })
    throw error
  }
}

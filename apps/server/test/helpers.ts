import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRegistry } from '@ytcreator/ai'
import { afterEach } from 'vitest'
import { migrate, MIGRATIONS } from '../src/db/migrate.ts'
import { openDatabase } from '../src/db/open.ts'
import { createAccountsRepo } from '../src/db/repos/accounts.ts'
import { createConnectionsRepo } from '../src/db/repos/connections.ts'
import { createLimitsRepo } from '../src/db/repos/limits.ts'
import { createOnboardingRepo } from '../src/db/repos/onboarding.ts'
import { createSettingsRepo } from '../src/db/repos/settings.ts'
import { createApp } from '../src/http/app.ts'
import { createMemoryLogger } from '../src/logging.ts'
import { createFileStore } from '../src/secrets/file-store.ts'
import { createAiConnectionsService } from '../src/services/ai-connections.ts'
import { createClaudeRepair, type InstallerRunner } from '../src/services/claude-repair.ts'

export const TEST_PORT = 4310
export const LOCAL_HEADERS = { host: `127.0.0.1:${TEST_PORT}`, origin: `http://127.0.0.1:${TEST_PORT}` }

export interface TestAppOptions {
  fakeAi?: string // a YTCREATOR_FAKE_AI scenario
  now?: () => Date
  installer?: InstallerRunner // the Claude Code installer; by default it ends well at once
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

// No test reaches the network: a request that gets this far is a bug in the test.
const offline = (() => Promise.reject(new Error('Los tests no salen a la red'))) as typeof fetch

// The whole server in memory: migrated SQLite, file store in a temporary folder, logger in memory.
export function makeTestApp({ fakeAi, now = () => new Date(), installer }: TestAppOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ytc-server-'))
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  cleanups.push(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const logger = createMemoryLogger(now)
  const secrets = createFileStore(join(dir, 'secrets'), logger)
  const settings = createSettingsRepo(db)
  const registry = createRegistry({ env: { YTCREATOR_FAKE_AI: fakeAi }, allowFake: true, now, logger })
  const connections = createConnectionsRepo(db, now)
  const accounts = createAccountsRepo(db, now)
  const onboarding = createOnboardingRepo(db, connections, now)
  const limits = createLimitsRepo(db, now)
  const claudeAccountsDir = join(dir, 'claude-accounts')
  const repair = createClaudeRepair({
    run: installer ?? (async () => 0),
    logger,
    onFinished: async (exitCode) => {
      if (exitCode === 0) await ai.recheckNotInstalled()
    },
  })
  const ai = createAiConnectionsService({
    connections,
    accounts,
    settings,
    secrets,
    registry,
    logger,
    now,
    fetch: offline,
    claudeAccountsDir,
    claudeCode: async () => ({ installed: true, version: '2.1.312' }),
    repairState: repair.state,
  })
  const version = '0.1.0'
  const app = createApp({
    port: TEST_PORT,
    version,
    instanceId: 'test-instance',
    logger,
    webDir: null,
    onboarding,
    ai,
    repair,
    limits,
    settings,
  })

  // A request as the local SPA sends it: local Host and Origin, JSON body.
  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { ...LOCAL_HEADERS }
    if (body !== undefined) headers['content-type'] = 'application/json'
    return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }

  return {
    app,
    db,
    dir,
    version,
    logger,
    secrets,
    settings,
    registry,
    connections,
    accounts,
    onboarding,
    limits,
    claudeAccountsDir,
    repair,
    request,
    now,
  }
}

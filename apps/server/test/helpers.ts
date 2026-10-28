import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRegistry } from '@ytcreator/ai'
import { afterEach } from 'vitest'
import { migrate, MIGRATIONS } from '../src/db/migrate.ts'
import { openDatabase } from '../src/db/open.ts'
import { createSettingsRepo } from '../src/db/repos/settings.ts'
import { createApp } from '../src/http/app.ts'
import { createMemoryLogger } from '../src/logging.ts'
import { createFileStore } from '../src/secrets/file-store.ts'

export const TEST_PORT = 4310
export const LOCAL_HEADERS = { host: `127.0.0.1:${TEST_PORT}`, origin: `http://127.0.0.1:${TEST_PORT}` }

export interface TestAppOptions {
  fakeAi?: string // a YTCREATOR_FAKE_AI scenario
  now?: () => Date
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

// The whole server in memory: migrated SQLite, file store in a temporary folder, logger in memory.
export function makeTestApp({ fakeAi, now = () => new Date() }: TestAppOptions = {}) {
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
  const registry = createRegistry({ env: { YTCREATOR_FAKE_AI: fakeAi }, allowFake: true, now })
  const app = createApp({ port: TEST_PORT, version: '0.1.0', instanceId: 'test-instance', logger, webDir: null })

  // A request as the local SPA sends it: local Host and Origin, JSON body.
  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { ...LOCAL_HEADERS }
    if (body !== undefined) headers['content-type'] = 'application/json'
    return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }

  return { app, db, dir, logger, secrets, settings, registry, request, now }
}

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Secret } from '@ytcreator/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrate, MIGRATIONS } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'
import { createSettingsRepo, type SettingsRepo } from '../../src/db/repos/settings.ts'
import { createMemoryLogger } from '../../src/logging.ts'
import { selectSecretStore, type SelectOptions } from '../../src/secrets/select.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures')

let state: string
let settings: SettingsRepo
let close: () => void

beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), 'ytc-select-'))
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  settings = createSettingsRepo(db)
  close = () => db.close()
})

afterEach(() => {
  close()
  rmSync(state, { recursive: true, force: true })
})

const argv = () => {
  try {
    return readFileSync(join(state, 'argv.log'), 'utf8')
  } catch {
    return ''
  }
}

const select = (platform: NodeJS.Platform, extra: Partial<SelectOptions> = {}) =>
  selectSecretStore({
    platform,
    settings,
    logger: createMemoryLogger(),
    fileDir: join(state, 'secrets'),
    tools: { env: { ...process.env, PATH: `${FIXTURES}:${process.env.PATH}`, FAKE_STATE: state } },
    ...extra,
  })

describe('selectSecretStore', () => {
  it('picks the keychain on macOS and writes it down', async () => {
    expect((await select('darwin')).kind).toBe('keychain')
    expect(settings.get('secret_store')).toBe('keychain')
  })

  it('picks the Secret Service on Linux when the round trip works', async () => {
    expect((await select('linux')).kind).toBe('secret-service')
    expect(settings.get('secret_store')).toBe('secret-service')
    expect(argv()).toMatch(/^store .*\nlookup .*\nclear /)
  })

  it('falls back to the file when the Secret Service fails or is too slow', async () => {
    writeFileSync(join(state, 'broken'), '')
    expect((await select('linux')).kind).toBe('file')
    rmSync(join(state, 'broken'))
    settings.set('secret_store', null)
    writeFileSync(join(state, 'slow'), '')
    expect((await select('linux', { probeTimeoutMs: 300 })).kind).toBe('file')
    expect(settings.get('secret_store')).toBe('file')
  })

  it('uses the file on other platforms', async () => {
    expect((await select('win32')).kind).toBe('file')
  })

  it('keeps the store it wrote down and never switches silently', async () => {
    settings.set('secret_store', 'secret-service')
    writeFileSync(join(state, 'broken'), '')
    const store = await select('linux')
    expect(store.kind).toBe('secret-service')
    expect(argv()).toBe('')
    expect(await store.set('ytcreator:cuenta:x', Secret.from('sk-ant-oat-FAKE-1'))).toEqual({
      ok: false,
      failure: { kind: 'no_disponible', reason: 'llavero_no_disponible' },
    })
    expect(settings.get('secret_store')).toBe('secret-service')
  })
})

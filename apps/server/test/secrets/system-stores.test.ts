import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Secret, type SecretStore } from '@ytcreator/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../src/logging.ts'
import { createLinuxSecretService } from '../../src/secrets/linux-secret-service.ts'
import { createMacosKeychain } from '../../src/secrets/macos-keychain.ts'
import type { ToolOptions } from '../../src/secrets/run.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const REF = 'ytcreator:cuenta:3f0c'
// Quotes, a backslash and a space: the keychain command line must keep it as one word.
const VALUE = 'sk-ant-oat-FAKE-1-a"b\\c d'
const UNAVAILABLE = { ok: false, failure: { kind: 'no_disponible', reason: 'llavero_no_disponible' } }

let state: string
let tools: ToolOptions

beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), 'ytc-tools-'))
  tools = { env: { ...process.env, PATH: `${FIXTURES}:${process.env.PATH}`, FAKE_STATE: state } }
})

afterEach(() => {
  rmSync(state, { recursive: true, force: true })
})

const read = (file: string) => {
  try {
    return readFileSync(join(state, file), 'utf8')
  } catch {
    return ''
  }
}

const stores: [string, (logger: ReturnType<typeof createMemoryLogger>) => SecretStore][] = [
  ['macos-keychain', (logger) => createMacosKeychain(logger, tools)],
  ['linux-secret-service', (logger) => createLinuxSecretService(logger, tools)],
]

describe.each(stores)('%s', (_name, create) => {
  it('sets, gets and deletes', async () => {
    const store = create(createMemoryLogger())
    expect(await store.get(REF)).toEqual({ ok: true, value: null })
    expect(await store.set(REF, Secret.from(VALUE))).toEqual({ ok: true, value: undefined })
    const got = await store.get(REF)
    expect(got.ok && got.value?.reveal()).toBe(VALUE)
    expect(await store.delete(REF)).toEqual({ ok: true, value: undefined })
    expect(await store.get(REF)).toEqual({ ok: true, value: null })
    expect(await store.delete(REF)).toEqual({ ok: true, value: undefined })
  })

  it('sends the value on stdin, never in argv', async () => {
    const store = create(createMemoryLogger())
    await store.set(REF, Secret.from(VALUE))
    expect(read('stdin.log')).toContain('sk-ant-oat-FAKE-1')
    await store.get(REF)
    expect(read('argv.log')).not.toContain('FAKE')
    expect(read('argv.log')).toContain(REF)
  })

  it('answers llavero_no_disponible and logs the exit code, not the output', async () => {
    const logger = createMemoryLogger()
    const store = create(logger)
    writeFileSync(join(state, 'broken'), '')
    expect(await store.set(REF, Secret.from(VALUE))).toEqual(UNAVAILABLE)
    expect(await store.get(REF)).toEqual(UNAVAILABLE)
    expect(await store.delete(REF)).toEqual(UNAVAILABLE)
    const log = logger.lines.join('\n')
    expect(log).toContain('"exitCode":1')
    expect(log).not.toContain('FAKE')
  })

  it('answers llavero_no_disponible when the tool is missing', async () => {
    const logger = createMemoryLogger()
    const store = create(logger)
    tools.env = { ...tools.env, PATH: state }
    expect(await store.get(REF)).toEqual(UNAVAILABLE)
    expect(logger.lines.join('\n')).toContain('"exitCode":null')
  })
})

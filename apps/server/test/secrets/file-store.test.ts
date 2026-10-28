import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Secret } from '@ytcreator/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryLogger } from '../../src/logging.ts'
import { createFileStore } from '../../src/secrets/file-store.ts'

const REF = 'ytcreator:gratis:gemini'
const VALUE = 'AIzaFAKEvalue0000'

const mode = (path: string) => statSync(path).mode & 0o777

describe('file-store', () => {
  let parent: string
  let dir: string

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'ytc-secrets-'))
    dir = join(parent, 'secrets')
  })

  afterEach(() => {
    rmSync(parent, { recursive: true, force: true })
  })

  it('sets, gets and deletes', async () => {
    const store = createFileStore(dir, createMemoryLogger())
    expect(store.kind).toBe('file')
    expect(await store.get(REF)).toEqual({ ok: true, value: null })
    expect(await store.set(REF, Secret.from(VALUE))).toEqual({ ok: true, value: undefined })
    const read = await store.get(REF)
    expect(read.ok && read.value?.reveal()).toBe(VALUE)
    expect(await store.delete(REF)).toEqual({ ok: true, value: undefined })
    expect(await store.get(REF)).toEqual({ ok: true, value: null })
  })

  it('creates the folder 0700 and the file 0600, through a temporary file', async () => {
    const store = createFileStore(dir, createMemoryLogger())
    await Promise.all([store.set('a', Secret.from('1')), store.set('b', Secret.from('2'))])
    expect(mode(dir)).toBe(0o700)
    expect(mode(join(dir, 'secrets.json'))).toBe(0o600)
    expect(readdirSync(dir)).toEqual(['secrets.json'])
    expect(readdirSync(parent)).toEqual(['secrets'])
    expect(JSON.parse(readFileSync(join(dir, 'secrets.json'), 'utf8'))).toEqual({ a: '1', b: '2' })
  })

  it('fixes looser permissions on read and warns without content', async () => {
    const logger = createMemoryLogger()
    const store = createFileStore(dir, logger)
    await store.set(REF, Secret.from(VALUE))
    chmodSync(dir, 0o755)
    chmodSync(join(dir, 'secrets.json'), 0o644)
    await store.get(REF)
    expect(mode(dir)).toBe(0o700)
    expect(mode(join(dir, 'secrets.json'))).toBe(0o600)
    expect(logger.lines.join('\n')).toContain('secrets.permissions_fixed')
    expect(logger.lines.join('\n')).not.toContain('FAKEvalue')
  })

  it('answers llavero_no_disponible when the file is unreadable', async () => {
    const logger = createMemoryLogger()
    const store = createFileStore(dir, logger)
    await store.set(REF, Secret.from(VALUE))
    chmodSync(join(dir, 'secrets.json'), 0o000)
    chmodSync(dir, 0o000)
    const result = await store.get(REF)
    chmodSync(dir, 0o700)
    expect(result).toEqual({ ok: false, failure: { kind: 'no_disponible', reason: 'llavero_no_disponible' } })
    expect(logger.lines.join('\n')).not.toContain('FAKEvalue')
  })
})

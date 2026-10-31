import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Secret } from '@ytcreator/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLogger, redactLine } from '../src/logging.ts'

const FAKE_KEY = 'sk-ant-api03-FAKEfakeFAKEfake1234'
const NOW = new Date('2026-10-28T10:00:00.000Z')

function lines(dir: string, file = 'server.log') {
  return readFileSync(join(dir, file), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('logging', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ytc-log-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes one JSON line per event with ts, level and event', () => {
    const logger = createLogger(dir, { now: () => NOW })
    logger.info('server.started', { port: 4310 })
    logger.warn('secrets.permissions_fixed')
    expect(lines(dir)).toEqual([
      { ts: NOW.toISOString(), level: 'info', event: 'server.started', port: 4310 },
      { ts: NOW.toISOString(), level: 'warn', event: 'secrets.permissions_fixed' },
    ])
  })

  it('hides key patterns anywhere in the line', () => {
    const logger = createLogger(dir, { now: () => NOW })
    logger.error('provider.failed', { message: `bad ${FAKE_KEY} and ${FAKE_KEY}` })
    const raw = readFileSync(join(dir, 'server.log'), 'utf8')
    expect(raw).not.toContain('FAKEfake')
    expect(lines(dir)[0]?.message).toBe('bad [oculto] and [oculto]')
  })

  it('hides sensitive fields, also nested, and Secret values', () => {
    const logger = createLogger(dir, { now: () => NOW })
    logger.info('request', {
      apiKey: 'plain-1',
      headers: { Authorization: 'Bearer plain-2', 'x-api-key': 'plain-3' },
      nested: [{ token: 'plain-5', code: 'plain-6' }],
      credential: Secret.from('plain-7'),
    })
    const raw = readFileSync(join(dir, 'server.log'), 'utf8')
    expect(raw).not.toMatch(/plain-\d/)
    expect(lines(dir)[0]).toMatchObject({
      apiKey: '[oculto]',
      headers: { Authorization: '[oculto]', 'x-api-key': '[oculto]' },
      nested: [{ token: '[oculto]', code: '[oculto]' }],
      credential: '[oculto]',
    })
  })

  it('logs errors by name and message only', () => {
    const logger = createLogger(dir, { now: () => NOW })
    logger.error('boom', { error: new TypeError(`failed with ${FAKE_KEY}`) })
    expect(lines(dir)[0]?.error).toEqual({ name: 'TypeError', message: 'failed with [oculto]' })
  })

  it('rotates past the size limit and keeps 3 files', () => {
    const logger = createLogger(dir, { now: () => NOW, maxBytes: 200 })
    for (let i = 0; i < 40; i++) logger.info('tick', { i, pad: 'x'.repeat(60) })
    expect(readdirSync(dir).sort()).toEqual(['server.log', 'server.log.1', 'server.log.2'])
    const last = lines(dir).at(-1)
    expect(last?.i).toBe(39)
  })

  it('redactLine is idempotent on clean text', () => {
    expect(redactLine('{"event":"ok"}')).toBe('{"event":"ok"}')
  })
})

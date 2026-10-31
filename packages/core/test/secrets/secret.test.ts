import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { Secret } from '../../src/secrets/secret.ts'

const VALUE = 'sk-ant-api03-FAKEsecretvalue1234'

describe('Secret', () => {
  const secret = Secret.from(VALUE)

  it('hides the value from JSON, strings and templates', () => {
    expect(JSON.stringify({ secret })).toBe('{"secret":"[oculto]"}')
    expect(String(secret)).toBe('[oculto]')
    expect(`${secret}`).toBe('[oculto]')
  })

  it('hides the value from util.inspect and console.log', () => {
    expect(inspect(secret)).toBe('[oculto]')
    expect(inspect({ nested: { secret } }, { depth: 5 })).not.toContain(VALUE)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    console.log(secret)
    const printed = inspect(log.mock.calls[0]?.[0])
    log.mockRestore()
    expect(printed).not.toContain(VALUE)
  })

  it('has no enumerable keys', () => {
    expect(Object.keys(secret)).toEqual([])
    expect(Object.values(secret)).toEqual([])
  })

  it('reveals the value and gives the last 4 characters as a hint', () => {
    expect(secret.reveal()).toBe(VALUE)
    expect(secret.hint()).toBe('1234')
  })

  it('trims spaces and line breaks at both ends', () => {
    expect(Secret.from(`  \n${VALUE}\r\n `).reveal()).toBe(VALUE)
  })
})

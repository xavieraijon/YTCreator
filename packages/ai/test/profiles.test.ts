import { AI_USES } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { PROFILES, resolveProfile } from '../src/profiles.ts'

describe('model profiles', () => {
  it('every provider has a profile for every use', () => {
    for (const provider of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
      expect(Object.keys(PROFILES[provider]).sort()).toEqual([...AI_USES].sort())
    }
  })

  it('short uses go to Haiku with 60 s and long ones to Sonnet with 120 s', () => {
    for (const use of ['preguntas', 'nombres'] as const) {
      expect(resolveProfile('anthropic', use)).toMatchObject({ model: 'claude-haiku-5-5', timeoutMs: 60_000 })
    }
    for (const use of ['nichos', 'conceptos', 'lectura_canal', 'posicionamiento'] as const) {
      expect(resolveProfile('claude-code', use)).toMatchObject({ model: 'claude-sonnet-5-5', timeoutMs: 120_000 })
    }
  })

  it('the expert timeout replaces the profile one', () => {
    expect(resolveProfile('anthropic', 'nichos', { aiTimeoutSeconds: 300 }).timeoutMs).toBe(300_000)
  })
})

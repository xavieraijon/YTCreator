import { describe, expect, it } from 'vitest'
import {
  measuresBodySchema,
  nameChecksBodySchema,
  readingBodySchema,
  resolveBodySchema,
  resolvedChannelSchema,
  youtubeApiKeyBodySchema,
  youtubeSettingsSchema,
  youtubeSourceBodySchema,
} from '../../src/api/index.ts'

describe('youtube schemas', () => {
  it('POST /api/journeys/:id/measures', () => {
    const niche = { label: 'Cocina', queries: ['recetas fáciles'] }
    expect(measuresBodySchema.safeParse({ revision: 1, niches: [niche] }).success).toBe(true)
    expect(measuresBodySchema.safeParse({ revision: 1, niches: [] }).success).toBe(false)
    expect(measuresBodySchema.safeParse({ revision: 1, niches: [{ ...niche, queries: [] }] }).success).toBe(false)
    expect(
      measuresBodySchema.safeParse({ revision: 1, niches: [{ ...niche, queries: ['a', 'b', 'c', 'd'] }] }).success,
    ).toBe(false)
  })

  it('POST /api/journeys/:id/name-checks', () => {
    const name = { displayName: 'Cocina Clara', handle: 'cocinaclara', origin: 'ia' }
    expect(nameChecksBodySchema.safeParse({ revision: 1, names: [name] }).success).toBe(true)
    expect(nameChecksBodySchema.safeParse({ revision: 1, names: [{ ...name, handle: 'a b' }] }).success).toBe(false)
    expect(nameChecksBodySchema.safeParse({ revision: 1, names: [{ ...name, origin: 'otro' }] }).success).toBe(false)
    expect(nameChecksBodySchema.safeParse({ revision: 1, names: [{ ...name, displayName: '' }] }).success).toBe(false)
  })

  it('POST /api/journeys/:id/reading and /resolve', () => {
    expect(readingBodySchema.safeParse({ revision: 1, input: '@canal' }).success).toBe(true)
    expect(readingBodySchema.safeParse({ revision: 1, input: '' }).success).toBe(false)
    expect(resolveBodySchema.safeParse({ input: '@canal' }).success).toBe(true)
    const resolved = {
      channelId: 'UC1',
      title: 'Canal',
      handle: null,
      subscribers: null,
      thumbnailUrl: null,
      fetchedAt: '2026-11-01T10:00:00.000Z',
    }
    expect(resolvedChannelSchema.parse(resolved)).toEqual(resolved)
  })

  it('GET /api/settings/youtube never carries the key, only its hint', () => {
    const view = {
      source: 'auto',
      effectiveSource: 'ytdlp',
      ytdlpVersion: '2026.08.19',
      apiKey: { set: true, hint: 'abcd', rejected: false },
      quota: { used: 100, limit: 10000, nearLimit: false },
    }
    expect(youtubeSettingsSchema.parse(view)).toEqual(view)
    expect(
      youtubeSettingsSchema.safeParse({ ...view, apiKey: { set: true, hint: 'abcde', rejected: false } }).success,
    ).toBe(false)
    expect(
      youtubeSettingsSchema.parse({ ...view, apiKey: { set: true, hint: 'abcd', rejected: false, value: 'x' } }).apiKey,
    ).toEqual({ set: true, hint: 'abcd', rejected: false })
  })

  it('settings bodies', () => {
    expect(youtubeSourceBodySchema.safeParse({ source: 'data_api' }).success).toBe(true)
    expect(youtubeSourceBodySchema.safeParse({ source: 'fake' }).success).toBe(false)
    expect(youtubeApiKeyBodySchema.safeParse({ apiKey: 'clave' }).success).toBe(true)
    expect(youtubeApiKeyBodySchema.safeParse({ apiKey: '' }).success).toBe(false)
  })
})

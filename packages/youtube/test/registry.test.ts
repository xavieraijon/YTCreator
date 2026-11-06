import { describe, expect, it } from 'vitest'
import { createYouTubeAdapters } from '../src/registry.ts'

const options = {
  binPath: '/no/existe/yt-dlp',
  fetch: (() => Promise.reject(new Error('sin red'))) as typeof fetch,
  getKey: async () => null,
  quota: { used: () => 0, add: () => {} },
  limits: { dailyUnits: 10_000, nearLimitRatio: 0.8, searchUnits: 100, otherUnits: 1 },
}

describe('createYouTubeAdapters', () => {
  it('with YTCREATOR_FAKE_YOUTUBE=1 only the fake exists', () => {
    const adapters = createYouTubeAdapters({ ...options, env: { YTCREATOR_FAKE_YOUTUBE: '1' } })
    expect(Object.keys(adapters)).toEqual(['fake'])
  })

  it('a build that does not allow the fake gets the real ones, whatever the variable says', () => {
    const adapters = createYouTubeAdapters({ ...options, env: { YTCREATOR_FAKE_YOUTUBE: '1' }, allowFake: false })
    expect(Object.keys(adapters).sort()).toEqual(['dataApi', 'ytdlp'])
  })

  it('without the variable, the real ones', () => {
    const adapters = createYouTubeAdapters({ ...options, env: {} })
    if (!('ytdlp' in adapters)) throw new Error('faltan los adaptadores reales')
    expect(adapters.ytdlp.source).toBe('ytdlp')
    expect(adapters.dataApi.source).toBe('data_api')
  })
})

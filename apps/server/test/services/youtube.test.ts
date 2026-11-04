import type { HandleStatus, Sourced, VideoHit, YouTubeData, YouTubeFailureCode, YouTubeResult } from '@ytcreator/core'
import { youtubeFailure } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { CACHE_TTL_MS, HANDLE_CACHE_TTL_MS, createYtCacheRepo } from '../../src/db/repos/yt-cache.ts'
import { createMemoryLogger } from '../../src/logging.ts'
import { createYouTubeService, type YouTubeServiceDeps } from '../../src/services/youtube.ts'
import { freshDb, manualClock } from '../db/repos/helpers.ts'

const KEY = 'AIzaSyFAKE-clave-de-prueba-0123456789abc'
const HIT: VideoHit = {
  videoId: 'v1',
  title: 'Vídeo',
  channelId: 'UC1',
  channelTitle: 'Canal',
  views: 10,
  publishedAt: null,
  durationSeconds: null,
}

function stubAdapter(source: 'ytdlp' | 'data_api', calls: string[], failure?: YouTubeFailureCode): YouTubeData {
  const sourced = <T>(data: T): YouTubeResult<Sourced<T>> => ({
    ok: true,
    value: { data, source, fetchedAt: '2026-11-01T10:00:00.000Z' },
  })
  return {
    source,
    async search(query) {
      calls.push(`${source}:search:${query}`)
      return failure ? youtubeFailure(failure) : sourced([HIT])
    },
    async getChannel(ref) {
      calls.push(`${source}:channel:${ref.channelId}`)
      return youtubeFailure('no_encontrado')
    },
    async listChannelVideos(channelId) {
      calls.push(`${source}:videos:${channelId}`)
      return sourced([])
    },
    async checkHandle(handle) {
      calls.push(`${source}:handle:${handle}`)
      return sourced<HandleStatus>('libre')
    },
    async resolve(input) {
      calls.push(`${source}:resolve:${input}`)
      return sourced({ channelId: 'UC1' })
    },
    async health() {
      return { source, available: true, version: '1' }
    },
  }
}

function setup(
  over: Partial<YouTubeServiceDeps> & { ytFailure?: YouTubeFailureCode; apiFailure?: YouTubeFailureCode } = {},
) {
  const db = freshDb()
  const clock = manualClock()
  const calls: string[] = []
  const logger = createMemoryLogger(clock.now)
  const { ytFailure, apiFailure, ...deps } = over
  const service = createYouTubeService({
    adapters: { ytdlp: stubAdapter('ytdlp', calls, ytFailure), dataApi: stubAdapter('data_api', calls, apiFailure) },
    source: () => 'auto',
    hasKey: () => false,
    quota: { used: () => 0, limit: 10_000, nearLimitRatio: 0.8 },
    cache: createYtCacheRepo(db, clock.now),
    logger,
    now: clock.now,
    ...deps,
  })
  return { service, calls, clock, logger }
}

// A task that stays open until the test lets it go, to count how many run at once.
function gate() {
  let running = 0
  let peak = 0
  const waiting: (() => void)[] = []
  return {
    enter: async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise<void>((resolve) => waiting.push(resolve))
      running--
    },
    peak: () => peak,
    drain: async () => {
      while (running > 0) {
        waiting.splice(0).forEach((go) => go())
        await new Promise((resolve) => setImmediate(resolve))
      }
    },
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  }
}

describe('youtube service: which source', () => {
  it('auto without a key uses yt-dlp', async () => {
    const { service, calls } = setup()
    await service.search('cocina', { limit: 5 })
    expect(calls).toEqual(['ytdlp:search:cocina'])
    expect(service.effectiveSource()).toBe('ytdlp')
  })

  it('auto with a key and quota uses the Data API', async () => {
    const { service, calls } = setup({ hasKey: () => true })
    await service.search('cocina', { limit: 5 })
    expect(calls).toEqual(['data_api:search:cocina'])
    expect(service.effectiveSource()).toBe('data_api')
  })

  it('auto with a key but no units left uses yt-dlp', async () => {
    const { service, calls } = setup({
      hasKey: () => true,
      quota: { used: () => 10_000, limit: 10_000, nearLimitRatio: 0.8 },
    })
    await service.search('cocina', { limit: 5 })
    expect(calls).toEqual(['ytdlp:search:cocina'])
  })

  it('falls back to yt-dlp when the Data API says the quota is over', async () => {
    const { service, calls } = setup({ hasKey: () => true, apiFailure: 'cupo_agotado' })
    const result = await service.search('cocina', { limit: 5 })
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['data_api:search:cocina', 'ytdlp:search:cocina'])
  })

  it('the setting can force a source', async () => {
    const forced = setup({ source: () => 'ytdlp', hasKey: () => true })
    await forced.service.search('a', { limit: 5 })
    expect(forced.calls).toEqual(['ytdlp:search:a'])
    const api = setup({ source: () => 'data_api' })
    await api.service.search('a', { limit: 5 })
    expect(api.calls).toEqual(['data_api:search:a'])
  })

  it('the fake replaces both', async () => {
    const calls: string[] = []
    const { service } = setup({ adapters: { fake: { ...stubAdapter('ytdlp', calls), source: 'fake' } } })
    expect(service.effectiveSource()).toBe('fake')
  })
})

describe('youtube service: cache', () => {
  it('a second search with the same query does not reach the adapter, however it is written', async () => {
    const { service, calls } = setup()
    const first = await service.search('Cocina  Fácil', { limit: 5 })
    const second = await service.search(' cocina fácil ', { limit: 5 })
    expect(calls).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it('searches last 24 h', async () => {
    const { service, calls, clock } = setup()
    await service.search('a', { limit: 5 })
    clock.advance(CACHE_TTL_MS - 1)
    await service.search('a', { limit: 5 })
    expect(calls).toHaveLength(1)
    clock.advance(2)
    await service.search('a', { limit: 5 })
    expect(calls).toHaveLength(2)
  })

  it('handle checks last 1 h', async () => {
    const { service, calls, clock } = setup()
    await service.checkHandle('micanal')
    clock.advance(HANDLE_CACHE_TTL_MS - 1)
    await service.checkHandle('MiCanal')
    expect(calls).toHaveLength(1)
    clock.advance(2)
    await service.checkHandle('micanal')
    expect(calls).toHaveLength(2)
  })

  it('a failure is not cached', async () => {
    const { service, calls } = setup({ ytFailure: 'bloqueado' })
    expect(await service.search('a', { limit: 5 })).toEqual({ ok: false, failure: { code: 'bloqueado' } })
    await service.search('a', { limit: 5 })
    expect(calls).toHaveLength(2)
  })

  it('the cache is per source and per limit', async () => {
    let key = false
    const { service, calls } = setup({ hasKey: () => key })
    await service.search('a', { limit: 5 })
    await service.search('a', { limit: 40 })
    key = true
    await service.search('a', { limit: 40 })
    expect(calls).toEqual(['ytdlp:search:a', 'ytdlp:search:a', 'data_api:search:a'])
  })
})

describe('youtube service: concurrency', () => {
  it('at most 3 yt-dlp processes at a time', async () => {
    const g = gate()
    const adapter: YouTubeData = {
      ...stubAdapter('ytdlp', []),
      async search() {
        await g.enter()
        return youtubeFailure('sin_datos')
      },
    }
    const { service } = setup({ adapters: { ytdlp: adapter, dataApi: stubAdapter('data_api', []) } })
    const all = Array.from({ length: 8 }, (_, i) => service.search(`q${i}`, { limit: 5 }))
    await g.settle()
    expect(g.peak()).toBe(3)
    await g.drain()
    await Promise.all(all)
    expect(g.peak()).toBe(3)
  })

  it('at most 4 handle checks at a time', async () => {
    const g = gate()
    const adapter: YouTubeData = {
      ...stubAdapter('ytdlp', []),
      async checkHandle() {
        await g.enter()
        return youtubeFailure('bloqueado')
      },
    }
    const { service } = setup({ adapters: { ytdlp: adapter, dataApi: stubAdapter('data_api', []) } })
    const all = Array.from({ length: 9 }, (_, i) => service.checkHandle(`nombre${i}`))
    await g.settle()
    expect(g.peak()).toBe(4)
    await g.drain()
    await Promise.all(all)
  })
})

describe('youtube service: quota (FR-030)', () => {
  it('warns when the units near the limit, without stopping', async () => {
    const near = setup({ hasKey: () => true, quota: { used: () => 8000, limit: 10_000, nearLimitRatio: 0.8 } })
    await near.service.search('a', { limit: 5 })
    expect(near.calls).toEqual(['data_api:search:a'])
    expect((await near.service.health()).quota).toEqual({ used: 8000, limit: 10_000, nearLimit: true })
    expect(near.logger.lines.some((line) => line.includes('youtube.quota_near_limit'))).toBe(true)
  })

  it('below the limit, no warning', async () => {
    const far = setup({ hasKey: () => true, quota: { used: () => 7999, limit: 10_000, nearLimitRatio: 0.8 } })
    await far.service.search('a', { limit: 5 })
    expect((await far.service.health()).quota).toEqual({ used: 7999, limit: 10_000, nearLimit: false })
    expect(far.logger.lines.some((line) => line.includes('youtube.quota_near_limit'))).toBe(false)
  })

  it('with yt-dlp there is no quota to tell', async () => {
    const { service } = setup()
    expect((await service.health()).quota).toBeUndefined()
  })
})

describe('youtube service: logs', () => {
  it('say operation, source, time and failure', async () => {
    const { service, logger } = setup({ ytFailure: 'bloqueado' })
    await service.search('receta secreta', { limit: 5 })
    const line = JSON.parse(logger.lines.at(-1)!) as Record<string, unknown>
    expect(line).toMatchObject({ event: 'youtube.call', operation: 'search', source: 'ytdlp', failure: 'bloqueado' })
    expect(typeof line.ms).toBe('number')
  })

  it('never hold the key, a full address or headers, even if a field brings them', () => {
    const logger = createMemoryLogger()
    logger.info('youtube.call', {
      note: `https://www.googleapis.com/youtube/v3/search?key=${KEY}`,
      url: 'https://www.googleapis.com/youtube/v3/search?q=a',
      headers: { 'X-Goog-Api-Key': KEY },
      'x-goog-api-key': KEY,
    })
    const text = logger.lines.join('\n')
    expect(text).not.toContain(KEY)
    expect(text).not.toContain('googleapis.com/youtube/v3/search?q=a')
  })

  it('do not repeat what the creator searched for', async () => {
    const { service, logger } = setup()
    await service.search('receta secreta', { limit: 5 })
    await service.checkHandle('micanalsecreto')
    expect(logger.lines.join('\n')).not.toMatch(/receta secreta|micanalsecreto/)
  })
})

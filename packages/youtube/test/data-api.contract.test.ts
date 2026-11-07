import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEARCH_LIMIT, Secret } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { DATA_API_TIMEOUT_MS, type DataApiLimits, createDataApiYouTube } from '../src/data-api/adapter.ts'
import { classifyResponse } from '../src/data-api/classify.ts'
import { INPUTS, runYouTubeContract } from './contract/battery.ts'
import { API, TEST_KEY, apiError, dataApiFetch, hangingFetch } from './data-api-fetch.ts'

// The limits come from the shared thresholds, the same file the server passes in (FR-030).
const thresholds = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../knowledge/market/thresholds.json'), 'utf8'),
) as { data: { dataApi: DataApiLimits } }
const LIMITS = thresholds.data.dataApi

function memoryQuota(start = 0) {
  let units = start
  return { used: () => units, add: (n: number) => void (units += n) }
}

function make(
  options: {
    fetch?: typeof globalThis.fetch
    key?: string | null
    used?: number
    timeoutMs?: number
  } = {},
) {
  const quota = memoryQuota(options.used)
  const key = options.key === undefined ? TEST_KEY : options.key
  const yt = createDataApiYouTube({
    fetch: options.fetch ?? dataApiFetch().fetch,
    getKey: async () => (key === null ? null : Secret.from(key)),
    quota,
    limits: LIMITS,
    timeoutMs: options.timeoutMs,
  })
  return { yt, quota }
}

runYouTubeContract(
  'data_api',
  (stub) => {
    if (stub === 'no_disponible') return make({ key: null }).yt
    if (stub === 'cupo_agotado') return make({ used: LIMITS.dailyUnits }).yt
    if (stub === 'tiempo_agotado') return make({ fetch: hangingFetch, timeoutMs: 50 }).yt
    return make().yt
  },
  {},
)

describe('Data API adapter', () => {
  it('waits 15 s per request by default', () => {
    expect(DATA_API_TIMEOUT_MS).toBe(15_000)
  })

  it('sends the key in X-Goog-Api-Key and never in the URL', async () => {
    const api = dataApiFetch()
    const { yt } = make({ fetch: api.fetch })
    await yt.search(INPUTS.query, { limit: SEARCH_LIMIT })
    await yt.getChannel({ channelId: INPUTS.channelId })
    await yt.listChannelVideos(INPUTS.channelId, { limit: 60 })
    await yt.resolve(`@${INPUTS.channelHandle}`)
    const google = api.requests.filter((r) => r.url.startsWith(API))
    expect(google.length).toBeGreaterThan(4)
    for (const request of google) {
      expect(request.headers.get('X-Goog-Api-Key')).toBe(TEST_KEY)
      expect(request.url).not.toContain(TEST_KEY)
      expect(new URL(request.url).searchParams.has('key')).toBe(false)
    }
  })

  it('checks a handle at its public URL, with no key and no units', async () => {
    const api = dataApiFetch()
    const { yt, quota } = make({ fetch: api.fetch })
    await yt.checkHandle(INPUTS.freeHandle)
    expect(api.requests).toHaveLength(1)
    expect(api.requests[0]?.url).toBe(`https://www.youtube.com/@${INPUTS.freeHandle}`)
    expect(api.requests[0]?.headers.has('X-Goog-Api-Key')).toBe(false)
    expect(quota.used()).toBe(0)
  })

  it('counts 100 units per search.list and 1 per any other call', async () => {
    const { yt, quota } = make()
    await yt.getChannel({ channelId: INPUTS.channelId })
    expect(quota.used()).toBe(LIMITS.otherUnits)
    // search.list, then one videos.list for views and lengths.
    await yt.search(INPUTS.query, { limit: SEARCH_LIMIT })
    expect(quota.used()).toBe(LIMITS.otherUnits + LIMITS.searchUnits + LIMITS.otherUnits)
  })

  it('counts the units of a request that failed', async () => {
    const { yt, quota } = make()
    await yt.search(INPUTS.blockedQuery, { limit: SEARCH_LIMIT })
    expect(quota.used()).toBe(LIMITS.searchUnits)
  })

  it('does not start a call that would go over the daily units', async () => {
    const api = dataApiFetch()
    const { yt } = make({ fetch: api.fetch, used: LIMITS.dailyUnits - 50 })
    const search = await yt.search(INPUTS.query, { limit: SEARCH_LIMIT })
    expect(!search.ok && search.failure.code).toBe('cupo_agotado')
    expect(api.requests).toHaveLength(0)
    expect((await yt.getChannel({ channelId: INPUTS.channelId })).ok).toBe(true)
  })

  it('a 403 quotaExceeded is cupo_agotado', async () => {
    const api = dataApiFetch(() => apiError(403, 'quotaExceeded'))
    const { yt } = make({ fetch: api.fetch })
    const result = await yt.getChannel({ channelId: INPUTS.channelId })
    expect(!result.ok && result.failure.code).toBe('cupo_agotado')
  })

  it('videos found that cannot be read are no_disponible, not «no results» (P9)', async () => {
    const api = dataApiFetch((url) =>
      url.pathname.endsWith('/videos') ? new Response(JSON.stringify({ items: [] }), { status: 200 }) : undefined,
    )
    const { yt } = make({ fetch: api.fetch })
    const result = await yt.search(INPUTS.query, { limit: SEARCH_LIMIT })
    expect(!result.ok && result.failure.code).toBe('no_disponible')
  })

  it('a key that Google rejects is no_disponible', async () => {
    const api = dataApiFetch(() => apiError(400, 'keyInvalid'))
    const { yt } = make({ fetch: api.fetch })
    const result = await yt.getChannel({ channelId: INPUTS.channelId })
    expect(!result.ok && result.failure.code).toBe('no_disponible')
  })

  it('health reports the units and says nearLimit from the threshold on', async () => {
    const near = Math.ceil(LIMITS.dailyUnits * LIMITS.nearLimitRatio)
    expect((await make({ used: near - 1 }).yt.health()).quota).toEqual({
      used: near - 1,
      limit: LIMITS.dailyUnits,
      nearLimit: false,
    })
    expect((await make({ used: near }).yt.health()).quota?.nearLimit).toBe(true)
    expect(await make({ used: LIMITS.dailyUnits }).yt.health()).toMatchObject({ source: 'data_api', available: false })
    expect(await make({ key: null }).yt.health()).toEqual({ source: 'data_api', available: false })
  })

  it('reads the hidden subscriber count as null and the dates of every video', async () => {
    const { yt } = make()
    const small = await yt.getChannel({ channelId: INPUTS.smallChannelId })
    if (!small.ok) throw new Error(small.failure.code)
    expect(small.value.data).toMatchObject({ subscribers: null, country: null, handle: 'cocinatres', videoCount: 3 })
    const videos = await yt.listChannelVideos(INPUTS.channelId, { limit: 200 })
    if (!videos.ok) throw new Error(videos.failure.code)
    expect(videos.value.data).toHaveLength(30)
    expect(videos.value.data.every((v) => v.publishedAt !== null)).toBe(true)
    expect(videos.value.data.some((v) => v.durationSeconds === null)).toBe(true)
  })
})

describe('Data API failure classification', () => {
  const body = (reason: string) => ({ error: { errors: [{ reason }] } })

  it('reads quota, blocking, missing and bad keys from the status and the reason', () => {
    expect(classifyResponse(200, {})).toBeNull()
    expect(classifyResponse(403, body('quotaExceeded'))).toBe('cupo_agotado')
    expect(classifyResponse(403, body('dailyLimitExceeded'))).toBe('cupo_agotado')
    expect(classifyResponse(403, body('rateLimitExceeded'))).toBe('bloqueado')
    expect(classifyResponse(429, {})).toBe('bloqueado')
    expect(classifyResponse(404, body('channelNotFound'))).toBe('no_encontrado')
    expect(classifyResponse(400, body('keyInvalid'))).toBe('no_disponible')
    expect(classifyResponse(403, body('accessNotConfigured'))).toBe('no_disponible')
    expect(classifyResponse(500, 'no es json')).toBe('no_disponible')
  })
})

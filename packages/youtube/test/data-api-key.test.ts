import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEARCH_LIMIT, Secret } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { type DataApiLimits, createDataApiYouTube } from '../src/data-api/adapter.ts'
import { checkDataApiKey } from '../src/data-api/check-key.ts'
import { isKeyRejected } from '../src/data-api/classify.ts'
import { createFakeKeyCheck } from '../src/data-api/fake-key-check.ts'
import { API, TEST_KEY, apiError, dataApiFetch } from './data-api-fetch.ts'

const thresholds = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../knowledge/market/thresholds.json'), 'utf8'),
) as { data: { dataApi: DataApiLimits } }
const LIMITS = thresholds.data.dataApi

function memoryQuota(start = 0) {
  let units = start
  return { used: () => units, add: (n: number) => void (units += n) }
}

const answering = (response: () => Response) => {
  const requests: { url: string; headers: Headers }[] = []
  const fetch = (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) })
    return response()
  }) as typeof globalThis.fetch
  return { fetch, requests }
}

// What Google answers to a key it does not take (an invalid key, the API off in the project, a restricted key).
const keyInvalid = () =>
  new Response(
    JSON.stringify({
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        errors: [{ reason: 'badRequest', domain: 'global' }],
        status: 'INVALID_ARGUMENT',
        details: [{ reason: 'API_KEY_INVALID', domain: 'googleapis.com' }],
      },
    }),
    { status: 400 },
  )

describe('checkDataApiKey', () => {
  it('one call of 1 unit, with the key only in X-Goog-Api-Key', async () => {
    const api = dataApiFetch()
    const result = await checkDataApiKey(Secret.from(TEST_KEY), { fetch: api.fetch, limits: LIMITS })
    expect(result).toEqual({ ok: true })
    expect(api.requests).toHaveLength(1)
    const [request] = api.requests
    expect(request!.url.startsWith(API)).toBe(true)
    expect(request!.url).not.toContain(TEST_KEY)
    expect(request!.headers.get('X-Goog-Api-Key')).toBe(TEST_KEY)
    expect(LIMITS.otherUnits).toBe(1)
  })

  it('a key Google does not take → rechazada', async () => {
    for (const response of [keyInvalid, () => apiError(403, 'accessNotConfigured')]) {
      const { fetch } = answering(response)
      const result = await checkDataApiKey(Secret.from(TEST_KEY), { fetch, limits: LIMITS })
      expect(result).toEqual({ ok: false, failure: 'rechazada' })
    }
  })

  it('a key out of units today is still a good key', async () => {
    const { fetch } = answering(() => apiError(403, 'quotaExceeded'))
    expect(await checkDataApiKey(Secret.from(TEST_KEY), { fetch, limits: LIMITS })).toEqual({
      ok: true,
    })
  })

  it('Google does not answer → no_disponible; it never throws', async () => {
    const down = (async () => {
      throw new Error('sin red')
    }) as typeof globalThis.fetch
    expect(await checkDataApiKey(Secret.from(TEST_KEY), { fetch: down, limits: LIMITS })).toEqual({
      ok: false,
      failure: 'no_disponible',
    })
    const { fetch } = answering(() => new Response('', { status: 503 }))
    expect(await checkDataApiKey(Secret.from(TEST_KEY), { fetch, limits: LIMITS })).toEqual({
      ok: false,
      failure: 'no_disponible',
    })
  })
})

describe('isKeyRejected', () => {
  it('only the answers that are about the key', () => {
    expect(isKeyRejected(400, { error: { errors: [{ reason: 'keyInvalid' }] } })).toBe(true)
    expect(isKeyRejected(400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } })).toBe(true)
    expect(isKeyRejected(403, { error: { errors: [{ reason: 'accessNotConfigured' }] } })).toBe(true)
    expect(isKeyRejected(403, { error: { errors: [{ reason: 'quotaExceeded' }] } })).toBe(false)
    expect(isKeyRejected(403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } })).toBe(false)
    expect(isKeyRejected(404, null)).toBe(false)
    expect(isKeyRejected(500, null)).toBe(false)
    // A generic «forbidden» can be about one resource, not the key: the key is not dropped for it.
    expect(isKeyRejected(403, { error: { errors: [{ reason: 'forbidden' }] } })).toBe(false)
  })

  it('a malformed error body never throws', () => {
    expect(isKeyRejected(400, { error: { errors: {}, details: 'x' } })).toBe(false)
  })
})

describe('the adapter with a key Google stops taking (P15 a)', () => {
  it('says so once per answer, and still fails as no_disponible', async () => {
    const { fetch } = answering(keyInvalid)
    const rejected: string[] = []
    const yt = createDataApiYouTube({
      fetch,
      getKey: async () => Secret.from(TEST_KEY),
      quota: memoryQuota(),
      limits: LIMITS,
      onKeyRejected: (hint) => void rejected.push(hint),
    })
    const result = await yt.search('recetas', { limit: SEARCH_LIMIT })
    expect(result).toEqual({ ok: false, failure: { code: 'no_disponible' } })
    expect(rejected).toEqual([Secret.from(TEST_KEY).hint()])
  })
})

describe('createFakeKeyCheck', () => {
  it('takes any key but those that say «bad» or «down», and records only the hint', async () => {
    const check = createFakeKeyCheck()
    expect(await check(Secret.from('AIzaFAKE-good-0000'))).toEqual({ ok: true })
    expect(await check(Secret.from('AIzaFAKE-bad-0000'))).toEqual({ ok: false, failure: 'rechazada' })
    expect(await check(Secret.from('AIzaFAKE-down-0000'))).toEqual({ ok: false, failure: 'no_disponible' })
    expect(check.checked).toEqual(['0000', '0000', '0000'])
  })
})

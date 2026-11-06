import {
  CHANNEL_VIDEOS_LIMIT,
  SEARCH_LIMIT,
  SHORT_MAX_SECONDS,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeResult,
} from '@ytcreator/core'
import { describe, expect, it } from 'vitest'

// The inputs every adapter's stubs answer to (contracts/youtube-data.md, «Pruebas de contrato»). The fake's world,
// the fake yt-dlp binary and the Data API stubs all use these same values.
export const INPUTS = {
  query: 'recetas rapidas',
  emptyQuery: 'sin datos',
  blockedQuery: 'bloqueado',
  channelId: 'UCcocinacorta30000000000',
  channelHandle: 'cocinacorta30',
  channelVideoId: 'co30v000xxx',
  smallChannelId: 'UCcocinatres000000000000',
  missingChannelId: 'UCnoexiste00000000000000',
  missingHandle: 'noexiste',
  freeHandle: 'nombrelibre2026',
} as const

// The stub the adapter sets up: inputs drive the normal answers; the rest force a failure on every call.
export type YouTubeStub = 'normal' | 'tiempo_agotado' | 'no_disponible' | 'cupo_agotado'

export type YouTubeFactory = (stub: YouTubeStub) => YouTubeData | Promise<YouTubeData>

export interface YouTubeContractOptions {
  // Cases an adapter cannot produce, with the reason in the test name.
  skip?: Partial<Record<string, string>>
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const nullableNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))
const nullableIso = (value: unknown) => value === null || (typeof value === 'string' && ISO.test(value))

function ok<T>(result: YouTubeResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.failure.code}`)
  return result.value
}

function failed<T>(result: YouTubeResult<T>): YouTubeFailureCode {
  if (result.ok) throw new Error('expected a failure')
  return result.failure.code
}

export function runYouTubeContract(name: string, make: YouTubeFactory, options: YouTubeContractOptions = {}) {
  const skip = options.skip ?? {}
  const test = (id: string, title: string, fn: () => Promise<void>) => {
    const reason = skip[id]
    if (reason) it.skip(`${id} ${title} (${reason})`, fn)
    else it(`${id} ${title}`, fn)
  }

  describe(`YouTubeData contract: ${name}`, () => {
    test('Y1', 'search gives at most the limit, with the source, the date and null where data is missing', async () => {
      const yt = await make('normal')
      const value = ok(await yt.search(INPUTS.query, { limit: SEARCH_LIMIT }))
      expect(value.source).toBe(yt.source)
      expect(value.fetchedAt).toMatch(ISO)
      expect(value.data.length).toBeGreaterThan(0)
      expect(value.data.length).toBeLessThanOrEqual(SEARCH_LIMIT)
      for (const hit of value.data) {
        expect(hit.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/)
        expect(hit.channelId).toMatch(/^UC[A-Za-z0-9_-]{22}$/)
        expect(typeof hit.title).toBe('string')
        expect(typeof hit.channelTitle).toBe('string')
        expect(nullableNumber(hit.views)).toBe(true)
        expect(nullableNumber(hit.durationSeconds)).toBe(true)
        expect(nullableIso(hit.publishedAt)).toBe(true)
      }
      const few = ok(await yt.search(INPUTS.query, { limit: 5 }))
      expect(few.data.length).toBeLessThanOrEqual(5)
    })

    test('Y2', 'a search with nothing useful is sin_datos', async () => {
      const yt = await make('normal')
      expect(failed(await yt.search(INPUTS.emptyQuery, { limit: SEARCH_LIMIT }))).toBe('sin_datos')
    })

    test('Y3', 'a blocked search is bloqueado', async () => {
      const yt = await make('normal')
      expect(failed(await yt.search(INPUTS.blockedQuery, { limit: SEARCH_LIMIT }))).toBe('bloqueado')
    })

    test('Y4', 'getChannel reads the channel', async () => {
      const yt = await make('normal')
      const value = ok(await yt.getChannel({ channelId: INPUTS.channelId }))
      expect(value.source).toBe(yt.source)
      expect(value.data.channelId).toBe(INPUTS.channelId)
      expect(value.data.title.length).toBeGreaterThan(0)
      expect(typeof value.data.description).toBe('string')
      expect(nullableNumber(value.data.subscribers)).toBe(true)
      expect(nullableNumber(value.data.videoCount)).toBe(true)
    })

    test('Y5', 'getChannel of a channel that does not exist is no_encontrado', async () => {
      const yt = await make('normal')
      expect(failed(await yt.getChannel({ channelId: INPUTS.missingChannelId }))).toBe('no_encontrado')
    })

    test('Y6', 'listChannelVideos goes newest first, within the limit, with isShort by duration', async () => {
      const yt = await make('normal')
      const value = ok(await yt.listChannelVideos(INPUTS.channelId, { limit: CHANNEL_VIDEOS_LIMIT }))
      expect(value.source).toBe(yt.source)
      expect(value.data.length).toBeGreaterThan(3)
      expect(value.data.length).toBeLessThanOrEqual(CHANNEL_VIDEOS_LIMIT)
      const dates = value.data.map((v) => v.publishedAt).filter((d): d is string => d !== null)
      expect([...dates].sort().reverse()).toEqual(dates)
      for (const video of value.data) {
        expect(nullableIso(video.publishedAt)).toBe(true)
        expect(nullableNumber(video.views)).toBe(true)
        if (video.durationSeconds !== null && video.durationSeconds > SHORT_MAX_SECONDS) {
          expect(video.isShort).toBe(false)
        }
      }
      const few = ok(await yt.listChannelVideos(INPUTS.channelId, { limit: 2 }))
      expect(few.data).toHaveLength(2)
    })

    test('Y7', 'a channel with few videos gives just those', async () => {
      const yt = await make('normal')
      const value = ok(await yt.listChannelVideos(INPUTS.smallChannelId, { limit: CHANNEL_VIDEOS_LIMIT }))
      expect(value.data).toHaveLength(3)
    })

    test('Y8', 'checkHandle says libre or ocupado', async () => {
      const yt = await make('normal')
      expect(ok(await yt.checkHandle(INPUTS.channelHandle)).data).toBe('ocupado')
      expect(ok(await yt.checkHandle(INPUTS.freeHandle)).data).toBe('libre')
    })

    test('Y9', 'resolve turns a handle, a channel link and a video link into the UC… id', async () => {
      const yt = await make('normal')
      for (const input of [
        `@${INPUTS.channelHandle}`,
        `https://www.youtube.com/@${INPUTS.channelHandle}`,
        `https://www.youtube.com/channel/${INPUTS.channelId}`,
        `https://youtu.be/${INPUTS.channelVideoId}`,
      ]) {
        const value = ok(await yt.resolve(input))
        expect(value.data).toEqual({ channelId: INPUTS.channelId })
        expect(value.source).toBe(yt.source)
      }
    })

    test('Y9b', 'resolve reads the old /user/ and /c/ links; the Data API has no way for /c/ (entry 144)', async () => {
      const yt = await make('normal')
      const user = ok(await yt.resolve(`https://www.youtube.com/user/${INPUTS.channelHandle}`))
      expect(user.data).toEqual({ channelId: INPUTS.channelId })
      const custom = await yt.resolve(`youtube.com/c/${INPUTS.channelHandle}/videos`)
      if (yt.source === 'data_api') expect(failed(custom)).toBe('no_disponible')
      else expect(ok(custom).data).toEqual({ channelId: INPUTS.channelId })
      expect(failed(await yt.resolve(`https://www.youtube.com/user/${INPUTS.missingHandle}`))).toBe('no_encontrado')
    })

    test('Y10', 'resolve of a missing channel or of text that is not a link is no_encontrado', async () => {
      const yt = await make('normal')
      expect(failed(await yt.resolve(`@${INPUTS.missingHandle}`))).toBe('no_encontrado')
      expect(failed(await yt.resolve('esto no es un enlace'))).toBe('no_encontrado')
    })

    test('Y11', 'health names its source', async () => {
      const yt = await make('normal')
      const health = await yt.health()
      expect(health.source).toBe(yt.source)
      expect(health.available).toBe(true)
    })

    for (const code of ['tiempo_agotado', 'no_disponible', 'cupo_agotado'] as const) {
      test(`Y-${code}`, `every operation fails with ${code} and never throws`, async () => {
        const yt = await make(code)
        expect(failed(await yt.search(INPUTS.query, { limit: SEARCH_LIMIT }))).toBe(code)
        expect(failed(await yt.getChannel({ channelId: INPUTS.channelId }))).toBe(code)
        expect(failed(await yt.listChannelVideos(INPUTS.channelId, { limit: CHANNEL_VIDEOS_LIMIT }))).toBe(code)
        expect(failed(await yt.resolve(`@${INPUTS.channelHandle}`))).toBe(code)
        if (code === 'no_disponible') expect((await yt.health()).available).toBe(false)
      })
    }
  })
}

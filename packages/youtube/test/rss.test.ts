import { describe, expect, it } from 'vitest'
import { createFeedReader, FEED_MEMO_MS, FEED_PAUSE_MS, FEED_URL, FEEDS_AT_ONCE } from '../src/rss/feed.ts'
import { parseFeed } from '../src/rss/parse.ts'
import { feedXml } from './feed-xml.ts'

const CHANNEL = 'UCcocinacorta30000000000'

describe('RSS feed', () => {
  it('reads the exact date of each video in UTC', () => {
    const dates = parseFeed(
      feedXml([
        { videoId: 'co30v000xxx', published: '2026-10-01T10:00:00+00:00' },
        { videoId: 'co30v001xxx', published: '2026-09-28T12:30:00+02:00' },
      ]),
    )
    expect(dates.get('co30v000xxx')).toBe('2026-10-01T10:00:00.000Z')
    expect(dates.get('co30v001xxx')).toBe('2026-09-28T10:30:00.000Z')
  })

  it('skips entries with no id or a date it cannot read', () => {
    const dates = parseFeed(feedXml([{ videoId: 'co30v000xxx', published: 'ayer' }]))
    expect(dates.size).toBe(0)
    expect(parseFeed('esto no es xml').size).toBe(0)
  })

  it('asks the public feed of the channel', async () => {
    const urls: string[] = []
    const fetch = (async (url: string) => {
      urls.push(url)
      return new Response(feedXml([{ videoId: 'co30v000xxx', published: '2026-10-01T10:00:00+00:00' }]))
    }) as typeof globalThis.fetch
    const { dates, complete } = await createFeedReader(fetch).read(CHANNEL)
    expect(urls).toEqual([`${FEED_URL}${CHANNEL}`])
    expect(dates.get('co30v000xxx')).toBe('2026-10-01T10:00:00.000Z')
    expect(complete).toBe(true)
  })

  it('encodes what it puts in the address', async () => {
    const urls: string[] = []
    const fetch = (async (url: string) => {
      urls.push(url)
      return new Response('')
    }) as typeof globalThis.fetch
    await createFeedReader(fetch).read('UC&x=1')
    expect(urls).toEqual([`${FEED_URL}UC%26x%3D1`])
  })

  it('gives no dates and says so, and never throws, when the feed fails', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof globalThis.fetch
    const notFound = (async () => new Response('', { status: 404 })) as typeof globalThis.fetch
    expect(await createFeedReader(down).read(CHANNEL)).toEqual({ dates: new Map(), complete: false })
    expect(await createFeedReader(notFound).read(CHANNEL)).toEqual({ dates: new Map(), complete: false })
  })
})

describe('RSS feed: how much it asks YouTube', () => {
  const ok = () => new Response(feedXml([{ videoId: 'co30v000xxx', published: '2026-10-01T10:00:00+00:00' }]))

  it('never more than 5 feeds at once, however many channels', async () => {
    let open = 0
    let most = 0
    const fetch = (async () => {
      open += 1
      most = Math.max(most, open)
      await new Promise((resolve) => setTimeout(resolve, 1))
      open -= 1
      return ok()
    }) as typeof globalThis.fetch
    const reader = createFeedReader(fetch)
    await Promise.all(Array.from({ length: 40 }, (_, i) => reader.read(`UC${i}`)))
    expect(most).toBe(FEEDS_AT_ONCE)
  })

  it('a channel found in several searches is read once within the hour, then again', async () => {
    let asked = 0
    const fetch = (async () => {
      asked += 1
      return ok()
    }) as typeof globalThis.fetch
    let at = 0
    const reader = createFeedReader(fetch, () => new Date(at))
    await Promise.all([reader.read(CHANNEL), reader.read(CHANNEL)])
    await reader.read(CHANNEL)
    expect(asked).toBe(1)
    at = FEED_MEMO_MS
    await reader.read(CHANNEL)
    expect(asked).toBe(2)
  })

  it('a feed that failed is not asked again for a while', async () => {
    let asked = 0
    const fetch = (async () => {
      asked += 1
      return new Response('', { status: 500 })
    }) as typeof globalThis.fetch
    let at = 0
    const reader = createFeedReader(fetch, () => new Date(at))
    await reader.read(CHANNEL)
    await reader.read(CHANNEL)
    expect(asked).toBe(1)
    at = FEED_PAUSE_MS
    await reader.read(CHANNEL)
    expect(asked).toBe(2)
  })

  it('an answer that is not a feed does not count as read', async () => {
    const fetch = (async () => new Response('<html>Antes de continuar</html>')) as typeof globalThis.fetch
    expect((await createFeedReader(fetch).read(CHANNEL)).complete).toBe(false)
  })

  it('a 500 on one feed does not stop the others; a 403 does', async () => {
    const asked: string[] = []
    const answering = (status: number) =>
      (async (url: string) => {
        asked.push(url)
        return new Response('', { status })
      }) as typeof globalThis.fetch
    const down = createFeedReader(answering(500))
    await down.read('UCa')
    await down.read('UCb')
    expect(asked).toHaveLength(2)
    asked.length = 0
    const stopped = createFeedReader(answering(403))
    await stopped.read('UCa')
    await stopped.read('UCb')
    expect(asked).toHaveLength(1)
  })

  it('a read that ran out of its time limit can be asked by the next search', async () => {
    let asked = 0
    const fetch = (async () => {
      asked += 1
      return ok()
    }) as typeof globalThis.fetch
    const reader = createFeedReader(fetch)
    const gone = new AbortController()
    gone.abort()
    expect((await reader.read(CHANNEL, gone.signal)).complete).toBe(false)
    expect((await reader.read(CHANNEL)).complete).toBe(true)
    expect(asked).toBe(1)
  })

  it('after a «too many requests» it stops asking for a while', async () => {
    let asked = 0
    const fetch = (async () => {
      asked += 1
      return asked === 1 ? new Response('', { status: 429 }) : ok()
    }) as typeof globalThis.fetch
    let at = 0
    const reader = createFeedReader(fetch, () => new Date(at))
    await reader.read('UCa')
    expect(await reader.read('UCb')).toEqual({ dates: new Map(), complete: false })
    expect(asked).toBe(1)
    at = FEED_PAUSE_MS
    expect((await reader.read('UCb')).complete).toBe(true)
    expect(asked).toBe(2)
  })

  it('a read cut by its time limit halfway does not count as a failed feed', async () => {
    let asked = 0
    const gone = new AbortController()
    const fetch = ((_url: string, init: RequestInit) => {
      asked += 1
      if (asked > 1) return Promise.resolve(ok())
      return new Promise((_, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('aborted')))
        gone.abort()
      })
    }) as unknown as typeof globalThis.fetch
    const reader = createFeedReader(fetch)
    expect((await reader.read(CHANNEL, gone.signal)).complete).toBe(false)
    expect((await reader.read(CHANNEL)).complete).toBe(true)
    expect(asked).toBe(2)
  })

  it('a feed that hangs ends with its time limit; the ones waiting are not asked after it', async () => {
    const asked: string[] = []
    const fetch = ((url: string, init: RequestInit) => {
      asked.push(url)
      return new Promise((_, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }) as unknown as typeof globalThis.fetch
    const reader = createFeedReader(fetch)
    const deadline = AbortSignal.timeout(5)
    const reads = await Promise.all(Array.from({ length: 8 }, (_, i) => reader.read(`UC${i}`, deadline)))
    expect(reads.every((read) => !read.complete)).toBe(true)
    expect(asked).toHaveLength(FEEDS_AT_ONCE)
  })
})

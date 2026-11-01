import { describe, expect, it } from 'vitest'
import { FEED_URL, readRecentDates } from '../src/rss/feed.ts'
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
    const dates = await readRecentDates(fetch, CHANNEL)
    expect(urls).toEqual([`${FEED_URL}${CHANNEL}`])
    expect(dates.get('co30v000xxx')).toBe('2026-10-01T10:00:00.000Z')
  })

  it('gives no dates, and never throws, when the feed fails', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof globalThis.fetch
    const notFound = (async () => new Response('', { status: 404 })) as typeof globalThis.fetch
    expect((await readRecentDates(down, CHANNEL)).size).toBe(0)
    expect((await readRecentDates(notFound, CHANNEL)).size).toBe(0)
  })
})

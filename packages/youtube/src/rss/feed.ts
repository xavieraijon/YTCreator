import { createLimiter } from '@ytcreator/core'
import { parseFeed } from './parse.ts'

export const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id='

// Feeds read at once in the whole app, however many searches are running: not to look like a flood to YouTube.
export const FEEDS_AT_ONCE = 5
// A channel's feed is read once per hour at most, even if it turns up in several searches.
export const FEED_MEMO_MS = 60 * 60 * 1000
// After YouTube says to stop no feed is asked for a while, and a feed that failed is not asked again for a while.
export const FEED_PAUSE_MS = 10 * 60 * 1000
const MEMO_MAX = 2000
const STOP_ASKING = [403, 429]

export interface FeedRead {
  dates: Map<string, string>
  // False when the feed gave no dates: its videos stay without one, and that may change later.
  complete: boolean
}

const NOT_READ = (): FeedRead => ({ dates: new Map(), complete: false })

// yt-dlp's flat listing has no dates (spike S1); the public feed has the exact date of the 15 newest videos.
// Any failure gives no dates, so they stay null; it never throws.
export function createFeedReader(fetch: typeof globalThis.fetch, now: () => Date = () => new Date()) {
  const limit = createLimiter(FEEDS_AT_ONCE)
  const memo = new Map<string, { until: number; read: Promise<FeedRead> }>()
  let pausedUntil = 0
  const at = () => now().getTime()

  // Null: it was not asked, so nothing is known about this feed.
  const ask = (channelId: string, signal?: AbortSignal) =>
    limit(async (): Promise<FeedRead | null> => {
      if (signal?.aborted || at() < pausedUntil) return null
      try {
        const init = signal ? { signal } : {}
        const response = await fetch(`${FEED_URL}${encodeURIComponent(channelId)}`, init)
        if (STOP_ASKING.includes(response.status)) pausedUntil = at() + FEED_PAUSE_MS
        if (!response.ok) return NOT_READ()
        // A channel found in a search has videos: an answer without dates is not its feed, for instance a notice page.
        const dates = parseFeed(await response.text())
        return { dates, complete: dates.size > 0 }
      } catch {
        return signal?.aborted ? null : NOT_READ()
      }
    })

  return {
    read(channelId: string, signal?: AbortSignal): Promise<FeedRead> {
      const known = memo.get(channelId)
      if (known && at() < known.until) return known.read
      memo.delete(channelId)
      if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!)
      const read = ask(channelId, signal).then((result) => {
        if (!result) {
          memo.delete(channelId)
          return NOT_READ()
        }
        if (!result.complete) memo.set(channelId, { until: at() + FEED_PAUSE_MS, read: Promise.resolve(result) })
        return result
      })
      memo.set(channelId, { until: at() + FEED_MEMO_MS, read })
      return read
    },
  }
}

export type FeedReader = ReturnType<typeof createFeedReader>

import { parseFeed } from './parse.ts'

export const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id='

// yt-dlp's flat listing has no dates (spike S1); the public feed has the exact date of the 15 newest videos.
// Any failure gives no dates, so they stay null; it never throws.
export async function readRecentDates(
  fetch: typeof globalThis.fetch,
  channelId: string,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  try {
    const response = await fetch(`${FEED_URL}${channelId}`, { signal })
    if (!response.ok) return new Map()
    return parseFeed(await response.text())
  } catch {
    return new Map()
  }
}

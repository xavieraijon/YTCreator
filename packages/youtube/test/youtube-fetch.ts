import { CHANNEL_30, CHANNEL_3 } from '../src/fake/scenarios.ts'
import { FEED_URL } from '../src/rss/feed.ts'
import { feedXml } from './feed-xml.ts'

// A `fetch` for the public pages yt-dlp's adapter reads beside the binary: the RSS feed (15 newest dates, like
// YouTube's) and the @handle page (200 taken, 404 free, spike S2). Anything else is a 404.
export function feedFetch(): typeof fetch {
  const channels = [CHANNEL_30, CHANNEL_3]
  return (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.startsWith(FEED_URL)) {
      const channel = channels.find((c) => url === `${FEED_URL}${c.info.channelId}`)
      if (!channel) return new Response('', { status: 404 })
      const entries = channel.videos
        .filter((v) => v.publishedAt !== null)
        .map((v) => ({ videoId: v.videoId, published: v.publishedAt! }))
      return new Response(feedXml(entries))
    }
    const handle = /^https:\/\/www\.youtube\.com\/@(.+)$/.exec(url)?.[1]
    if (handle) {
      return new Response('', { status: channels.some((c) => c.info.handle === handle) ? 200 : 404 })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
}

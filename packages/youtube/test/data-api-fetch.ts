import { CHANNEL_3, FAKE_CHANNELS, type FakeChannel } from '../src/fake/scenarios.ts'

// A `fetch` that answers like the YouTube Data API v3 over the contract's world (the fake's channels), plus the
// public @handle page. It records every request so tests can look at URLs and headers.
export const API = 'https://www.googleapis.com/youtube/v3/'
export const TEST_KEY = 'AIzaTEST-clave-de-prueba-0000wxyz'

const DAY_MS = 86_400_000
const PAGE = 50

export interface RecordedRequest {
  url: string
  headers: Headers
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const apiError = (status: number, reason: string): Response =>
  json({ error: { code: status, message: reason, errors: [{ reason, domain: 'youtube.quota' }] } }, status)

// Seconds to ISO 8601 (PT7M5S), the way the API writes durations.
const isoDuration = (seconds: number) =>
  `PT${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}H` : ''}${Math.floor((seconds % 3600) / 60)}M${seconds % 60}S`

// The API always has a date; the fake's older videos have none, so they get one older than the dated ones.
const videoDate = (channel: FakeChannel, index: number) =>
  channel.videos[index]?.publishedAt ?? new Date(Date.parse('2026-01-01T09:00:00Z') - index * DAY_MS).toISOString()

const allVideos = () =>
  FAKE_CHANNELS.flatMap((channel) => channel.videos.map((video, index) => ({ channel, video, index })))

function videoItem({ channel, video, index }: ReturnType<typeof allVideos>[number]) {
  return {
    id: video.videoId,
    snippet: {
      title: video.title,
      channelId: channel.info.channelId,
      channelTitle: channel.info.title,
      publishedAt: videoDate(channel, index),
    },
    // Live streams have no length: P0D.
    contentDetails: { duration: video.durationSeconds === null ? 'P0D' : isoDuration(video.durationSeconds) },
    statistics: video.views === null ? {} : { viewCount: String(video.views) },
  }
}

function channelItem(channel: FakeChannel) {
  return {
    id: channel.info.channelId,
    snippet: {
      title: channel.info.title,
      description: channel.info.description,
      customUrl: `@${channel.info.handle}`,
      thumbnails: { default: { url: 'https://yt3.ggpht.com/foto=s88' } },
      ...(channel.info.country ? { country: channel.info.country } : {}),
    },
    statistics: {
      viewCount: '1000',
      videoCount: String(channel.info.videoCount),
      hiddenSubscriberCount: channel.info.subscribers === null,
      ...(channel.info.subscribers === null ? {} : { subscriberCount: String(channel.info.subscribers) }),
    },
  }
}

function answer(url: URL): Response {
  const q = url.searchParams
  const endpoint = url.pathname.replace('/youtube/v3/', '')

  // The probe of a key check (check-key.ts): any short list will do.
  if (endpoint === 'i18nLanguages') return json({ items: [{ id: 'es', snippet: { hl: 'es', name: 'Español' } }] })
  if (endpoint === 'search') {
    const query = q.get('q') ?? ''
    if (query.includes('sin datos')) return json({ items: [] })
    if (query.includes('bloqueado')) return apiError(403, 'rateLimitExceeded')
    const max = Number(q.get('maxResults') ?? 5)
    const items = allVideos()
      .filter(({ channel }) => channel !== CHANNEL_3)
      .slice(0, max)
      .map(({ video, channel, index }) => ({
        id: { kind: 'youtube#video', videoId: video.videoId },
        snippet: {
          title: video.title,
          channelId: channel.info.channelId,
          channelTitle: channel.info.title,
          publishedAt: videoDate(channel, index),
        },
      }))
    return json({ items })
  }

  if (endpoint === 'videos') {
    const ids = (q.get('id') ?? '').split(',')
    return json({
      items: allVideos()
        .filter(({ video }) => ids.includes(video.videoId))
        .map(videoItem),
    })
  }

  if (endpoint === 'channels') {
    const ids = (q.get('id') ?? '').split(',')
    // forUsername: the old /user/ links; here the fake channels have the same name as their @.
    const handle = q.get('forHandle')?.replace(/^@/, '') ?? q.get('forUsername') ?? undefined
    const found = FAKE_CHANNELS.filter((c) => ids.includes(c.info.channelId) || c.info.handle === handle)
    // Like the API: no match gives no `items` at all.
    return json(found.length > 0 ? { items: found.map(channelItem) } : {})
  }

  if (endpoint === 'playlistItems') {
    const channel = FAKE_CHANNELS.find((c) => `UU${c.info.channelId.slice(2)}` === q.get('playlistId'))
    if (!channel) return apiError(404, 'playlistNotFound')
    const start = Number(q.get('pageToken') ?? 0)
    const max = Number(q.get('maxResults') ?? 5)
    const items = channel.videos
      .slice(start, start + max)
      .map((video) => ({ contentDetails: { videoId: video.videoId } }))
    const next = start + max < channel.videos.length ? { nextPageToken: String(start + max) } : {}
    return json({ items, ...next, pageInfo: { totalResults: channel.videos.length, resultsPerPage: PAGE } })
  }

  return apiError(404, 'notFound')
}

export function dataApiFetch(override?: (url: URL) => Response | undefined) {
  const requests: RecordedRequest[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, headers: new Headers(init?.headers) })
    const handle = /^https:\/\/www\.youtube\.com\/@(.+)$/.exec(url)?.[1]
    if (handle) return new Response('', { status: FAKE_CHANNELS.some((c) => c.info.handle === handle) ? 200 : 404 })
    if (!url.startsWith(API)) return new Response('', { status: 404 })
    const parsed = new URL(url)
    return override?.(parsed) ?? answer(parsed)
  }) as typeof globalThis.fetch
  return { fetch, requests }
}

// Never answers; only the adapter's timeout ends it.
export const hangingFetch = ((_: string, init?: RequestInit) =>
  new Promise((_, reject) =>
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
  )) as typeof globalThis.fetch

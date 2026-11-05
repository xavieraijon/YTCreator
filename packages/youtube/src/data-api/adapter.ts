import {
  type ChannelInfo,
  type ChannelRef,
  type Secret,
  type Sourced,
  type VideoHit,
  type VideoInfo,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeResult,
  SHORT_MAX_SECONDS,
  isChannelId,
  parseChannelInput,
  youtubeFailure,
} from '@ytcreator/core'
import { z } from 'zod'
import { checkHandleAt, isTimeout } from '../handle.ts'
import { classifyResponse } from './classify.ts'

export const DATA_API_TIMEOUT_MS = 15_000

const API = 'https://www.googleapis.com/youtube/v3/'
const PAGE = 50

export interface DataApiLimits {
  dailyUnits: number
  nearLimitRatio: number
  searchUnits: number
  otherUnits: number
}

export interface DataApiYouTubeOptions {
  fetch: typeof globalThis.fetch
  // Read from the SecretStore on every call, so a key saved or removed takes effect at once.
  getKey: () => Promise<Secret | null>
  // Units spent today (Pacific day), kept by the server.
  quota: { used(): number; add(units: number): void }
  limits: DataApiLimits
  now?: () => Date
  timeoutMs?: number
}

type Failed = { ok: false; failure: { code: YouTubeFailureCode } }

const count = z
  .string()
  .optional()
  .transform((value) => (value === undefined ? null : Number(value)))

const VideosBody = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({
          title: z.string(),
          channelId: z.string(),
          channelTitle: z.string().optional(),
          publishedAt: z.string().optional(),
        }),
        contentDetails: z.object({ duration: z.string().optional() }).optional(),
        statistics: z.object({ viewCount: count }).optional(),
      }),
    )
    .default([]),
})
type VideoItem = z.infer<typeof VideosBody>['items'][number]

const SearchBody = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }) })).default([]),
})

const ChannelsBody = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z
          .object({
            title: z.string(),
            description: z.string().default(''),
            customUrl: z.string().optional(),
            country: z.string().optional(),
            thumbnails: z.object({ default: z.object({ url: z.string() }).optional() }).optional(),
          })
          .optional(),
        statistics: z
          .object({
            subscriberCount: count,
            videoCount: count,
            hiddenSubscriberCount: z.boolean().default(false),
          })
          .optional(),
      }),
    )
    .default([]),
})

const PlaylistBody = z.object({
  items: z.array(z.object({ contentDetails: z.object({ videoId: z.string() }) })).default([]),
  nextPageToken: z.string().optional(),
})

// ISO 8601 duration (PT1H2M3S) to seconds; P0D (live) and anything unreadable are null.
export function parseDuration(iso: string | undefined): number | null {
  const match = iso ? /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso) : null
  if (!match) return null
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0))
  const seconds = (d ?? 0) * 86_400 + (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)
  return seconds > 0 ? seconds : null
}

const toDate = (value: string | undefined) => {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

// Reads YouTube with the creator's own Data API key (research R3). The key goes only in X-Goog-Api-Key, units are
// counted before each call, and nothing throws to the domain.
export function createDataApiYouTube(options: DataApiYouTubeOptions): YouTubeData {
  const now = options.now ?? (() => new Date())
  const timeoutMs = options.timeoutMs ?? DATA_API_TIMEOUT_MS
  const { limits, quota } = options
  const sourced = <T>(data: T): YouTubeResult<Sourced<T>> => ({
    ok: true,
    value: { data, source: 'data_api', fetchedAt: now().toISOString() },
  })
  const withTimeout = (signal?: AbortSignal) =>
    signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
  const isFailed = (value: unknown): value is Failed =>
    typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false

  async function get<T>(
    endpoint: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T | Failed> {
    const key = await options.getKey()
    if (!key) return youtubeFailure('no_disponible')
    const units = endpoint === 'search' ? limits.searchUnits : limits.otherUnits
    // Never start a call the day's units cannot pay for.
    if (quota.used() + units > limits.dailyUnits) return youtubeFailure('cupo_agotado')
    let response: Response
    try {
      response = await options.fetch(`${API}${endpoint}?${new URLSearchParams(params)}`, {
        method: 'GET',
        headers: { 'X-Goog-Api-Key': key.reveal(), Accept: 'application/json' },
        signal: withTimeout(signal),
      })
    } catch (error) {
      return youtubeFailure(isTimeout(error) ? 'tiempo_agotado' : 'no_disponible')
    }
    // Google charges a call that reached it, even one that failed.
    quota.add(units)
    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      if (isTimeout(error)) return youtubeFailure('tiempo_agotado')
      body = null
    }
    const failure = classifyResponse(response.status, body)
    if (failure) return youtubeFailure(failure)
    const parsed = schema.safeParse(body)
    return parsed.success ? parsed.data : youtubeFailure('no_disponible')
  }

  async function videos(ids: string[], signal?: AbortSignal): Promise<VideoItem[] | Failed> {
    const items: VideoItem[] = []
    for (const batch of chunks(ids, PAGE)) {
      const body = await get(
        'videos',
        { part: 'snippet,contentDetails,statistics', id: batch.join(','), maxResults: String(PAGE) },
        VideosBody,
        signal,
      )
      if (isFailed(body)) return body
      items.push(...body.items)
    }
    return items
  }

  const toVideo = (item: VideoItem): VideoInfo => {
    const durationSeconds = parseDuration(item.contentDetails?.duration)
    return {
      videoId: item.id,
      title: item.snippet.title,
      views: item.statistics?.viewCount ?? null,
      durationSeconds,
      publishedAt: toDate(item.snippet.publishedAt),
      isShort: durationSeconds !== null && durationSeconds <= SHORT_MAX_SECONDS,
    }
  }

  return {
    source: 'data_api',

    async search(query, { limit, signal }) {
      const body = await get(
        'search',
        { part: 'snippet', type: 'video', maxResults: String(Math.min(limit, PAGE)), q: query },
        SearchBody,
        signal,
      )
      if (isFailed(body)) return body
      const ids = body.items.flatMap((item) => (item.id.videoId ? [item.id.videoId] : [])).slice(0, limit)
      if (ids.length === 0) return youtubeFailure('sin_datos')
      // search.list has no views nor lengths: one videos.list fills them.
      const items = await videos(ids, signal)
      if (isFailed(items)) return items
      const byId = new Map(items.map((item) => [item.id, item]))
      const hits = ids.flatMap((id): VideoHit[] => {
        const item = byId.get(id)
        if (!item) return []
        return [
          {
            videoId: id,
            title: item.snippet.title,
            channelId: item.snippet.channelId,
            channelTitle: item.snippet.channelTitle ?? '',
            views: item.statistics?.viewCount ?? null,
            publishedAt: toDate(item.snippet.publishedAt),
            durationSeconds: parseDuration(item.contentDetails?.duration),
          },
        ]
      })
      return hits.length > 0 ? sourced(hits) : youtubeFailure('sin_datos')
    },

    async getChannel(ref, signal) {
      if (!isChannelId(ref.channelId)) return youtubeFailure('no_encontrado')
      const body = await get('channels', { part: 'snippet,statistics', id: ref.channelId }, ChannelsBody, signal)
      if (isFailed(body)) return body
      const item = body.items[0]
      if (!item?.snippet) return youtubeFailure('no_encontrado')
      const stats = item.statistics
      const info: ChannelInfo = {
        channelId: item.id,
        title: item.snippet.title,
        handle: item.snippet.customUrl?.replace(/^@/, '') ?? null,
        description: item.snippet.description,
        subscribers: stats && !stats.hiddenSubscriberCount ? stats.subscriberCount : null,
        videoCount: stats?.videoCount ?? null,
        country: item.snippet.country ?? null,
        thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
      }
      return sourced(info)
    },

    async listChannelVideos(channelId, { limit, signal }) {
      if (!isChannelId(channelId)) return youtubeFailure('no_encontrado')
      // Every channel's uploads live in the playlist UU + the id without its UC.
      const playlistId = `UU${channelId.slice(2)}`
      const ids: string[] = []
      let pageToken: string | undefined
      do {
        const params: Record<string, string> = { part: 'contentDetails', playlistId, maxResults: String(PAGE) }
        if (pageToken) params.pageToken = pageToken
        const body = await get('playlistItems', params, PlaylistBody, signal)
        if (isFailed(body)) return body
        ids.push(...body.items.map((item) => item.contentDetails.videoId))
        pageToken = body.nextPageToken
      } while (pageToken && ids.length < limit)
      if (ids.length === 0) return youtubeFailure('sin_datos')
      const items = await videos(ids.slice(0, limit), signal)
      if (isFailed(items)) return items
      const list = items
        .map(toVideo)
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
        .slice(0, limit)
      return list.length > 0 ? sourced(list) : youtubeFailure('sin_datos')
    },

    checkHandle(handle, signal) {
      return checkHandleAt(options.fetch, handle, withTimeout(signal), (status) => sourced(status))
    },

    async resolve(input, signal) {
      const parsed = parseChannelInput(input)
      if (!parsed) return youtubeFailure('no_encontrado')
      if (parsed.kind === 'channel') return sourced<ChannelRef>({ channelId: parsed.channelId })
      if (parsed.kind === 'handle') {
        const body = await get('channels', { part: 'id', forHandle: `@${parsed.handle}` }, ChannelsBody, signal)
        if (isFailed(body)) return body
        const channelId = body.items[0]?.id ?? ''
        return isChannelId(channelId) ? sourced<ChannelRef>({ channelId }) : youtubeFailure('no_encontrado')
      }
      const body = await get('videos', { part: 'snippet', id: parsed.videoId }, VideosBody, signal)
      if (isFailed(body)) return body
      const channelId = body.items[0]?.snippet.channelId ?? ''
      return isChannelId(channelId) ? sourced<ChannelRef>({ channelId }) : youtubeFailure('no_encontrado')
    },

    async health() {
      if (!(await options.getKey())) return { source: 'data_api', available: false }
      const used = quota.used()
      return {
        source: 'data_api',
        available: used < limits.dailyUnits,
        quota: { used, limit: limits.dailyUnits, nearLimit: used >= limits.nearLimitRatio * limits.dailyUnits },
      }
    },
  }
}

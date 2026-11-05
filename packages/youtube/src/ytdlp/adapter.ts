import {
  type ChannelRef,
  type Sourced,
  type VideoHit,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeResult,
  isChannelId,
  parseChannelInput,
  youtubeFailure,
} from '@ytcreator/core'
import { checkHandleAt } from '../handle.ts'
import { createFeedReader } from '../rss/feed.ts'
import { classifyRun } from './classify.ts'
import { channelVideosArgs, handleVideosArgs, searchArgs, versionArgs, videoChannelArgs } from './command.ts'
import { type Listing, parseListing, toChannel, toHits, toVideos } from './parse.ts'
import { type YtDlpRun, runYtDlp } from './process.ts'

export const YTDLP_TIMEOUT_MS = 45_000
export const HANDLE_TIMEOUT_MS = 15_000

export interface YtDlpYouTubeOptions {
  binPath: string
  // For the public pages read beside the binary: the RSS feed and the @handle page.
  fetch: typeof globalThis.fetch
  now?: () => Date
  timeouts?: { processMs?: number; handleMs?: number }
}

type Failed = { ok: false; failure: { code: YouTubeFailureCode } }

// Reads YouTube without a key, through the yt-dlp binary (research R2, spike S1). Never throws to the domain.
export function createYtDlpYouTube(options: YtDlpYouTubeOptions): YouTubeData {
  const now = options.now ?? (() => new Date())
  const processMs = options.timeouts?.processMs ?? YTDLP_TIMEOUT_MS
  const handleMs = options.timeouts?.handleMs ?? HANDLE_TIMEOUT_MS
  const feeds = createFeedReader(options.fetch, now)
  const sourced = <T>(data: T, complete = true): YouTubeResult<Sourced<T>> => ({
    ok: true,
    value: { data, source: 'ytdlp', fetchedAt: now().toISOString(), ...(complete ? {} : { partial: true }) },
  })
  const withTimeout = (ms: number, signal?: AbortSignal) =>
    signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms)

  const run = (args: string[], signal?: AbortSignal): Promise<YtDlpRun> =>
    runYtDlp(options.binPath, args, { signal: withTimeout(processMs, signal) })

  // A listing that ran well but does not parse, or has no entries, is sin_datos.
  async function listing(args: string[], signal?: AbortSignal): Promise<Listing | Failed> {
    const result = await run(args, signal)
    const failure = classifyRun(result)
    if (failure) return youtubeFailure(failure)
    const parsed = parseListing(result.stdout)
    return parsed && parsed.entries.length > 0 ? parsed : youtubeFailure('sin_datos')
  }
  const isFailed = (value: Listing | Failed): value is Failed => 'ok' in value

  // A channel whose listing is empty or missing is not found, rather than sin_datos.
  async function channelListing(channelId: string, limit: number, signal?: AbortSignal) {
    if (!isChannelId(channelId)) return youtubeFailure('no_encontrado')
    const result = await listing(channelVideosArgs(channelId, limit), signal)
    return result
  }

  // The flat listing has no dates (S1): each channel's feed gives those of its 15 newest videos, the rest stay null.
  // All the feeds of a search share one time limit, and a feed that fails only leaves its videos without a date.
  async function withFeedDates(hits: VideoHit[], signal?: AbortSignal): Promise<YouTubeResult<Sourced<VideoHit[]>>> {
    const channels = [...new Set(hits.map((hit) => hit.channelId))].filter(isChannelId)
    const deadline = withTimeout(handleMs, signal)
    const reads = await Promise.all(channels.map((channelId) => feeds.read(channelId, deadline)))
    const dates = new Map(reads.flatMap((read) => [...read.dates]))
    return sourced(
      hits.map((hit) => ({ ...hit, publishedAt: dates.get(hit.videoId) ?? hit.publishedAt })),
      reads.every((read) => read.complete),
    )
  }

  return {
    source: 'ytdlp',

    async search(query, { limit, signal, withoutDates }) {
      const result = await listing(searchArgs(query, limit), signal)
      if (isFailed(result)) return result
      const hits = toHits(result).slice(0, limit)
      if (hits.length === 0) return youtubeFailure('sin_datos')
      return withoutDates ? sourced(hits) : withFeedDates(hits, signal)
    },

    async getChannel(ref, signal) {
      const result = await channelListing(ref.channelId, 1, signal)
      if (isFailed(result)) return result
      const info = toChannel(result)
      return info ? sourced(info) : youtubeFailure('no_encontrado')
    },

    async listChannelVideos(channelId, { limit, signal }) {
      const [result, feed] = await Promise.all([
        channelListing(channelId, limit, signal),
        feeds.read(channelId, withTimeout(handleMs, signal)),
      ])
      if (isFailed(result)) return result
      const videos = toVideos(result)
        .slice(0, limit)
        .map((video) => ({ ...video, publishedAt: feed.dates.get(video.videoId) ?? video.publishedAt }))
      return sourced(videos, feed.complete)
    },

    checkHandle(handle, signal) {
      return checkHandleAt(options.fetch, handle, withTimeout(handleMs, signal), (status) => sourced(status))
    },

    async resolve(input, signal) {
      const parsed = parseChannelInput(input)
      if (!parsed) return youtubeFailure('no_encontrado')
      if (parsed.kind === 'channel') return sourced<ChannelRef>({ channelId: parsed.channelId })
      if (parsed.kind === 'handle') {
        const result = await listing(handleVideosArgs(parsed.handle), signal)
        if (isFailed(result)) return result.failure.code === 'sin_datos' ? youtubeFailure('no_encontrado') : result
        const channelId = typeof result.root.channel_id === 'string' ? result.root.channel_id : ''
        return isChannelId(channelId) ? sourced<ChannelRef>({ channelId }) : youtubeFailure('no_encontrado')
      }
      const result = await run(videoChannelArgs(parsed.videoId), signal)
      const failure = classifyRun(result)
      if (failure) return youtubeFailure(failure)
      const channelId = result.stdout.trim()
      return isChannelId(channelId) ? sourced<ChannelRef>({ channelId }) : youtubeFailure('no_encontrado')
    },

    async health() {
      const result = await run(versionArgs())
      if (classifyRun(result) !== null) return { source: 'ytdlp', available: false }
      return { source: 'ytdlp', available: true, version: result.stdout.trim() }
    },
  }
}

import {
  type ChannelRef,
  type Sourced,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeResult,
  isChannelId,
  parseChannelInput,
  youtubeFailure,
} from '@ytcreator/core'
import { checkHandleAt } from '../handle.ts'
import { readRecentDates } from '../rss/feed.ts'
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
  const sourced = <T>(data: T): YouTubeResult<Sourced<T>> => ({
    ok: true,
    value: { data, source: 'ytdlp', fetchedAt: now().toISOString() },
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

  return {
    source: 'ytdlp',

    async search(query, { limit, signal }) {
      const result = await listing(searchArgs(query, limit), signal)
      if (isFailed(result)) return result
      const hits = toHits(result).slice(0, limit)
      return hits.length > 0 ? sourced(hits) : youtubeFailure('sin_datos')
    },

    async getChannel(ref, signal) {
      const result = await channelListing(ref.channelId, 1, signal)
      if (isFailed(result)) return result
      const info = toChannel(result)
      return info ? sourced(info) : youtubeFailure('no_encontrado')
    },

    async listChannelVideos(channelId, { limit, signal }) {
      const [result, dates] = await Promise.all([
        channelListing(channelId, limit, signal),
        readRecentDates(options.fetch, channelId, withTimeout(handleMs, signal)),
      ])
      if (isFailed(result)) return result
      const videos = toVideos(result)
        .slice(0, limit)
        .map((video) => ({ ...video, publishedAt: dates.get(video.videoId) ?? video.publishedAt }))
      return sourced(videos)
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

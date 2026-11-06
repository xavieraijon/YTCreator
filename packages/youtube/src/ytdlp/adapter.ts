import {
  type ChannelRef,
  type Sourced,
  type VideoHit,
  type VideoInfo,
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
import {
  channelPageArgs,
  channelShortsArgs,
  handlePageArgs,
  handleShortsArgs,
  channelVideosArgs,
  handleVideosArgs,
  legacyPageArgs,
  legacyVideosArgs,
  searchArgs,
  versionArgs,
  videoChannelArgs,
} from './command.ts'
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

  // A channel says who it is in any of its lists: with no long videos, or none at all, it is still a channel (US4 AS5).
  async function channelInAnyList(lists: string[][], signal?: AbortSignal): Promise<Listing | Failed> {
    for (const args of lists) {
      const result = await run(args, signal)
      const failure = classifyRun(result)
      if (failure === 'sin_datos') continue
      if (failure) return youtubeFailure(failure)
      const parsed = parseListing(result.stdout)
      if (parsed && toChannel(parsed)) return parsed
    }
    return youtubeFailure('no_encontrado')
  }

  // Each list comes from newest to oldest and only the newest have a date: those go first. Nothing says which of the
  // rest is newer, so what fits takes from both lists in turn: a channel with many long videos still shows its Shorts.
  const newestFirst = (long: readonly VideoInfo[], shorts: readonly VideoInfo[], limit: number): VideoInfo[] => {
    const hasDate = (video: VideoInfo) => video.publishedAt !== null
    const dated = [...long, ...shorts].filter(hasDate).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!))
    const [restLong, restShorts] = [long, shorts].map((list) => list.filter((video) => !hasDate(video))) as [
      VideoInfo[],
      VideoInfo[],
    ]
    const taken = [...dated]
    for (let i = 0; taken.length < limit && i < Math.max(restLong.length, restShorts.length); i++) {
      for (const list of [restLong, restShorts]) {
        const video = list[i]
        if (video && taken.length < limit) taken.push(video)
      }
    }
    return taken.slice(0, limit)
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
      if (!isChannelId(ref.channelId)) return youtubeFailure('no_encontrado')
      const result = await channelInAnyList(
        [channelVideosArgs(ref.channelId, 1), channelShortsArgs(ref.channelId, 1), channelPageArgs(ref.channelId)],
        signal,
      )
      if (isFailed(result)) return result
      const info = toChannel(result)
      return info ? sourced(info) : youtubeFailure('no_encontrado')
    },

    async listChannelVideos(channelId, { limit, signal, withShorts }) {
      const [result, feed] = await Promise.all([
        channelListing(channelId, limit, signal),
        feeds.read(channelId, withTimeout(handleMs, signal)),
      ])
      // With the Shorts asked for, a list of videos that is not there does not say the channel has nothing.
      const noVideos =
        isFailed(result) &&
        (result.failure.code === 'sin_datos' || (withShorts && result.failure.code === 'no_encontrado'))
      if (isFailed(result) && !noVideos) return result
      // One after the other: the service gives each call a single place among the processes it allows.
      const shorts = withShorts ? await listing(channelShortsArgs(channelId, limit), signal) : null
      const videosRead = isFailed(result) ? [] : toVideos(result)
      // The channel has none, or could not be read: a list of Shorts never takes the videos down with it.
      const shortsFailed = shorts !== null && isFailed(shorts) && shorts.failure.code !== 'sin_datos'
      if (isFailed(result) && shortsFailed) return shorts as Failed
      if (isFailed(result) && (shorts === null || isFailed(shorts))) return result
      const shortsRead = shorts === null || isFailed(shorts) ? [] : toVideos(shorts, { allShorts: true })
      const dated = (list: readonly VideoInfo[]) =>
        list.map((video) => ({ ...video, publishedAt: feed.dates.get(video.videoId) ?? video.publishedAt }))
      return sourced(newestFirst(dated(videosRead), dated(shortsRead), limit), feed.complete && !shortsFailed)
    },

    checkHandle(handle, signal) {
      return checkHandleAt(options.fetch, handle, withTimeout(handleMs, signal), (status) => sourced(status))
    },

    async resolve(input, signal) {
      const parsed = parseChannelInput(input)
      if (!parsed) return youtubeFailure('no_encontrado')
      if (parsed.kind === 'channel') return sourced<ChannelRef>({ channelId: parsed.channelId })
      if (parsed.kind === 'handle') {
        const result = await channelInAnyList(
          [handleVideosArgs(parsed.handle), handleShortsArgs(parsed.handle), handlePageArgs(parsed.handle)],
          signal,
        )
        if (isFailed(result)) return result
        const channelId = typeof result.root.channel_id === 'string' ? result.root.channel_id : ''
        return isChannelId(channelId) ? sourced<ChannelRef>({ channelId }) : youtubeFailure('no_encontrado')
      }
      if (parsed.kind === 'legacy') {
        const result = await channelInAnyList(
          [legacyVideosArgs(parsed.path, parsed.name), legacyPageArgs(parsed.path, parsed.name)],
          signal,
        )
        if (isFailed(result)) return result
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

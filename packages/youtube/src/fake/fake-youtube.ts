import {
  type ChannelRef,
  type HandleStatus,
  type Sourced,
  type VideoHit,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeResult,
  parseChannelInput,
  youtubeFailure,
} from '@ytcreator/core'
import {
  BLOCKED_QUERY_WORDS,
  EMPTY_QUERY_WORDS,
  FAKE_CHANNELS,
  type FakeChannel,
  SEARCH_CHANNELS,
  TAKEN_HANDLE_PREFIX,
} from './scenarios.ts'

export interface FakeYouTubeOptions {
  // Every operation fails with this code; lets tests provoke timeouts, a missing reader or no quota.
  failure?: YouTubeFailureCode
  now?: () => Date
}

// Never touches the network (YTCREATOR_FAKE_YOUTUBE=1): tests, e2e and the novice audit.
export function createFakeYouTube(options: FakeYouTubeOptions = {}): YouTubeData {
  const now = options.now ?? (() => new Date())
  const sourced = <T>(data: T): YouTubeResult<Sourced<T>> => ({
    ok: true,
    value: { data, source: 'fake', fetchedAt: now().toISOString() },
  })
  const forced = () => (options.failure ? youtubeFailure(options.failure) : null)

  const byId = (channelId: string): FakeChannel | undefined =>
    FAKE_CHANNELS.find((c) => c.info.channelId === channelId)
  const byHandle = (handle: string): FakeChannel | undefined =>
    FAKE_CHANNELS.find((c) => c.info.handle?.toLowerCase() === handle.toLowerCase())
  const byVideo = (videoId: string): FakeChannel | undefined =>
    FAKE_CHANNELS.find((c) => c.videos.some((v) => v.videoId === videoId))

  return {
    source: 'fake',

    async search(query, { limit }) {
      const failure = forced()
      if (failure) return failure
      const text = query.toLowerCase()
      if (EMPTY_QUERY_WORDS.some((w) => text.includes(w))) return youtubeFailure('sin_datos')
      if (BLOCKED_QUERY_WORDS.some((w) => text.includes(w))) return youtubeFailure('bloqueado')
      // The query shifts the views so two niches do not look the same.
      const seed = [...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
      const hits: VideoHit[] = Array.from({ length: Math.min(limit, 40) }, (_, i) => {
        const channel = SEARCH_CHANNELS[i % SEARCH_CHANNELS.length]!
        const video = channel.videos[Math.floor(i / SEARCH_CHANNELS.length)]!
        return {
          videoId: video.videoId,
          title: video.title,
          channelId: channel.info.channelId,
          channelTitle: channel.info.title,
          views: video.views === null ? null : video.views + ((seed * (i + 1)) % 5_000),
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds,
        }
      })
      return sourced(hits)
    },

    async getChannel(ref) {
      const failure = forced()
      if (failure) return failure
      const channel = byId(ref.channelId)
      return channel ? sourced({ ...channel.info }) : youtubeFailure('no_encontrado')
    },

    async listChannelVideos(channelId, { limit }) {
      const failure = forced()
      if (failure) return failure
      const channel = byId(channelId)
      if (!channel) return youtubeFailure('no_encontrado')
      return sourced(channel.videos.slice(0, limit).map((v) => ({ ...v })))
    },

    async checkHandle(handle) {
      const failure = forced()
      if (failure) return failure
      const taken = byHandle(handle) !== undefined || handle.toLowerCase().startsWith(TAKEN_HANDLE_PREFIX)
      return sourced<HandleStatus>(taken ? 'ocupado' : 'libre')
    },

    async resolve(input) {
      const failure = forced()
      if (failure) return failure
      const parsed = parseChannelInput(input)
      const channel =
        parsed?.kind === 'handle'
          ? byHandle(parsed.handle)
          : parsed?.kind === 'channel'
            ? byId(parsed.channelId)
            : parsed?.kind === 'video'
              ? byVideo(parsed.videoId)
              : undefined
      return channel ? sourced<ChannelRef>({ channelId: channel.info.channelId }) : youtubeFailure('no_encontrado')
    },

    async health() {
      return { source: 'fake', available: options.failure !== 'no_disponible', version: 'fake' }
    },
  }
}

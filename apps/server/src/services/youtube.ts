import {
  type HandleStatus,
  type Limiter,
  type Logger,
  type Sourced,
  type YouTubeData,
  type YouTubeHealth,
  type YouTubeResult,
  type YouTubeSource,
  createLimiter,
} from '@ytcreator/core'
import type { YouTubeSourceSetting } from '@ytcreator/core/api'
import type { YouTubeAdapters } from '@ytcreator/youtube'
import { CACHE_TTL_MS, HANDLE_CACHE_TTL_MS, type YtCacheRepo } from '../db/repos/yt-cache.ts'

export const MAX_YTDLP_PROCESSES = 3
export const MAX_HANDLE_CHECKS = 4

export interface YouTubeServiceDeps {
  adapters: YouTubeAdapters
  source: () => YouTubeSourceSetting
  hasKey: () => boolean
  quota: { used(): number; limit: number; nearLimitRatio: number }
  cache: YtCacheRepo
  logger: Logger
  now: () => Date
}

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

// What the domain talks to: picks the source, caches 24 h (1 h for handles) and never lets the processes pile up
// (contracts/youtube-data.md). Logs carry the operation, source, time and code, never what was asked for.
export function createYouTubeService(deps: YouTubeServiceDeps): YouTubeData & {
  effectiveSource(): YouTubeSource
} {
  const { adapters, cache, logger, quota, now } = deps
  const processes = createLimiter(MAX_YTDLP_PROCESSES)
  const handles = createLimiter(MAX_HANDLE_CHECKS)
  // Only yt-dlp starts processes; a call to the Data API or to a public page does not take one of those places.
  const unlimited: Limiter = (task) => task()
  const processLimit = (adapter: YouTubeData) => (adapter.source === 'ytdlp' ? processes : unlimited)

  function picked(): YouTubeData {
    if ('fake' in adapters) return adapters.fake
    const setting = deps.source()
    if (setting === 'ytdlp') return adapters.ytdlp
    if (setting === 'data_api') return adapters.dataApi
    return deps.hasKey() && quota.used() < quota.limit ? adapters.dataApi : adapters.ytdlp
  }

  const isNearLimit = () => quota.used() >= quota.limit * quota.nearLimitRatio

  async function timed<T>(
    operation: string,
    adapter: YouTubeData,
    run: (adapter: YouTubeData) => Promise<YouTubeResult<T>>,
    limit: Limiter,
  ): Promise<YouTubeResult<T>> {
    const started = now().getTime()
    const result = await limit(() => run(adapter))
    logger.info('youtube.call', {
      operation,
      source: adapter.source,
      ms: now().getTime() - started,
      ...(result.ok ? {} : { failure: result.failure.code }),
    })
    return result
  }

  // The cached value counts under the source that would answer now; the Data API out of units falls back to yt-dlp.
  async function call<T>(
    operation: string,
    key: string,
    ttlMs: number,
    run: (adapter: YouTubeData) => Promise<YouTubeResult<Sourced<T>>>,
    limitFor: (adapter: YouTubeData) => Limiter = processLimit,
  ): Promise<YouTubeResult<Sourced<T>>> {
    const adapter = picked()
    const cacheKey = `${adapter.source}:${operation}:${key}`
    const cached = cache.get(cacheKey) as Sourced<T> | null
    if (cached) return { ok: true, value: cached }

    let result = await timed(operation, adapter, run, limitFor(adapter))
    if (!result.ok && result.failure.code === 'cupo_agotado' && 'ytdlp' in adapters && adapter !== adapters.ytdlp) {
      result = await timed(operation, adapters.ytdlp, run, limitFor(adapters.ytdlp))
    }
    if (result.ok) cache.set(`${result.value.source}:${operation}:${key}`, result.value, ttlMs)
    if (adapter.source === 'data_api' && isNearLimit()) {
      logger.warn('youtube.quota_near_limit', { used: quota.used(), limit: quota.limit })
    }
    return result
  }

  return {
    get source() {
      return picked().source
    },
    effectiveSource: () => picked().source,

    search: (query, { limit, signal }) =>
      call('search', `${limit}:${normalize(query)}`, CACHE_TTL_MS, (a) =>
        a.search(query, { limit, ...(signal ? { signal } : {}) }),
      ),

    getChannel: (ref, signal) => call('channel', ref.channelId, CACHE_TTL_MS, (a) => a.getChannel(ref, signal)),

    listChannelVideos: (channelId, { limit, signal }) =>
      call('videos', `${limit}:${channelId}`, CACHE_TTL_MS, (a) =>
        a.listChannelVideos(channelId, { limit, ...(signal ? { signal } : {}) }),
      ),

    // A handle check is a page read, not a process: it has a limit of its own.
    checkHandle: (handle, signal) =>
      call<HandleStatus>(
        'handle',
        normalize(handle),
        HANDLE_CACHE_TTL_MS,
        (a) => a.checkHandle(handle, signal),
        () => handles,
      ),

    resolve: (input, signal) => call('resolve', normalize(input), CACHE_TTL_MS, (a) => a.resolve(input, signal)),

    async health(): Promise<YouTubeHealth> {
      const adapter = picked()
      const health = await adapter.health()
      if (adapter.source !== 'data_api') return health
      return { ...health, quota: { used: quota.used(), limit: quota.limit, nearLimit: isNearLimit() } }
    },
  }
}

export type YouTubeService = ReturnType<typeof createYouTubeService>

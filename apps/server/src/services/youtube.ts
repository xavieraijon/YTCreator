import {
  type HandleStatus,
  type Limiter,
  type Logger,
  type Sourced,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeHealth,
  type YouTubeResult,
  type YouTubeSource,
  createLimiter,
} from '@ytcreator/core'
import type { YouTubeSourceSetting } from '@ytcreator/core/api'
import type { YouTubeAdapters } from '@ytcreator/youtube'
import type { SettingsRepo } from '../db/repos/settings.ts'
import { CACHE_TTL_MS, HANDLE_CACHE_TTL_MS, PARTIAL_CACHE_TTL_MS, type YtCacheRepo } from '../db/repos/yt-cache.ts'

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

// What the settings say about the source. `get` answers null for a key never saved.
export const youtubeChoice = (settings: Pick<SettingsRepo, 'get'>): Pick<YouTubeServiceDeps, 'source' | 'hasKey'> => ({
  source: () => settings.get('youtube.source') ?? 'auto',
  // A key YouTube stopped taking is not tried again (P15 a).
  hasKey: () => settings.get('youtube.api_key_ref') !== null && settings.get('youtube.api_key_rejected') !== true,
})

// YouTube stopped taking the saved key (P15 a): it is marked, and no longer tried until another one is saved.
// The hint says which key Google answered about: a late answer about one already replaced marks nothing.
export function markYouTubeKeyRejected(
  settings: Pick<SettingsRepo, 'get' | 'set'>,
  logger: Logger,
  hint: string,
): void {
  if (settings.get('youtube.api_key_rejected') === true) return
  if (settings.get('youtube.api_key_ref') === null || settings.get('youtube.api_key_hint') !== hint) return
  settings.set('youtube.api_key_rejected', true)
  logger.warn('youtube.key_rejected')
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
    // «Siempre con mi clave» with no key to use (removed, or rejected by YouTube): the reader, as with `auto` (P15 a).
    if (setting === 'data_api') return deps.hasKey() ? adapters.dataApi : adapters.ytdlp
    return deps.hasKey() && quota.used() < quota.limit ? adapters.dataApi : adapters.ytdlp
  }

  // Out of units always; a Data API that does not answer, or rejects the key, only if nobody chose it.
  const fallsBack = (code: YouTubeFailureCode) =>
    code === 'cupo_agotado' || ((code === 'no_disponible' || code === 'tiempo_agotado') && deps.source() === 'auto')

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
    {
      limitFor = processLimit,
      canFallBack = true,
      fresh = false,
    }: { limitFor?: (adapter: YouTubeData) => Limiter; canFallBack?: boolean; fresh?: boolean } = {},
  ): Promise<YouTubeResult<Sourced<T>>> {
    const cacheKeyOf = (source: YouTubeSource) => `${source}:${operation}:${key}`
    const kept = (result: YouTubeResult<Sourced<T>>) => {
      if (result.ok) {
        const { value } = result
        cache.set(cacheKeyOf(value.source), value, value.partial ? Math.min(ttlMs, PARTIAL_CACHE_TTL_MS) : ttlMs)
      }
      return result
    }

    const adapter = picked()
    const cached = fresh ? null : (cache.get(cacheKeyOf(adapter.source)) as Sourced<T> | null)
    if (cached) return { ok: true, value: cached }

    const first = await timed(operation, adapter, run, limitFor(adapter))
    if (adapter.source === 'data_api' && isNearLimit()) {
      logger.warn('youtube.quota_near_limit', { used: quota.used(), limit: quota.limit })
    }
    const fellBack = !first.ok && canFallBack && fallsBack(first.failure.code)
    if (!fellBack || !('ytdlp' in adapters) || adapter === adapters.ytdlp) return kept(first)

    // What yt-dlp already answered is not asked again each time the Data API says no.
    const saved = fresh ? null : (cache.get(cacheKeyOf('ytdlp')) as Sourced<T> | null)
    if (saved) return { ok: true, value: saved }
    return kept(await timed(operation, adapters.ytdlp, run, limitFor(adapters.ytdlp)))
  }

  return {
    get source() {
      return picked().source
    },
    effectiveSource: () => picked().source,

    search: (query, { limit, signal, withoutDates }) =>
      call('search', `${limit}:${withoutDates ? 'sin-fechas:' : ''}${normalize(query)}`, CACHE_TTL_MS, (a) =>
        a.search(query, { limit, ...(signal ? { signal } : {}), ...(withoutDates ? { withoutDates } : {}) }),
      ),

    getChannel: (ref, signal) => call('channel', ref.channelId, CACHE_TTL_MS, (a) => a.getChannel(ref, signal)),

    listChannelVideos: (channelId, { limit, signal, withShorts, fresh }) =>
      call(
        'videos',
        `${limit}:${withShorts ? 'con-shorts:' : ''}${channelId}`,
        CACHE_TTL_MS,
        (a) =>
          a.listChannelVideos(channelId, {
            limit,
            ...(signal ? { signal } : {}),
            ...(withShorts ? { withShorts } : {}),
          }),
        { fresh: fresh === true },
      ),

    // A handle check is a page read, not a process: it has a limit of its own. Both sources read that same page, so
    // when it fails there is nowhere else to ask.
    checkHandle: (handle, signal) =>
      call<HandleStatus>('handle', normalize(handle), HANDLE_CACHE_TTL_MS, (a) => a.checkHandle(handle, signal), {
        limitFor: () => handles,
        canFallBack: false,
      }),

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

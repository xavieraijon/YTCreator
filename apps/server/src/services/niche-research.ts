import {
  channelsToAsk,
  type ChannelInfo,
  hasEnoughVideos,
  type Logger,
  type MarketThresholds,
  measureNiche,
  mergeHits,
  type OwnBaselineSettings,
  ownChannelFigures,
  pickReferences,
  type VideoHit,
  type VideoInfo,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeSource,
} from '@ytcreator/core'
import type { Measure, MeasuresRepo, NewReference, ReferenceChannel } from '../db/repos/measures.ts'
import type { JobsService } from './jobs.ts'

export interface NicheToMeasure {
  label: string
  queries: string[]
}

export interface NicheResearchThresholds extends MarketThresholds {
  references: { min: number; max: number }
  ownChannel: OwnBaselineSettings & { referenceVideos: number }
}

export interface NicheResearchDeps {
  youtube: YouTubeData & { effectiveSource(): YouTubeSource }
  measures: MeasuresRepo
  jobs: Pick<JobsService, 'start'>
  thresholds: NicheResearchThresholds
  thresholdsVersion: number
  logger: Logger
  now: () => Date
}

type Read<T> = { ok: true; value: T } | { ok: false; failure: YouTubeFailureCode }
type References =
  | { ok: true; references: ReferenceChannel[] }
  | { ok: false; failure: YouTubeFailureCode }
  | { ok: false; invalid: true }

const SEARCH_LIMIT = 40
// A failure of the reader must not turn into figures: only these mean «nothing here», the rest stop the measure.
const NOTHING_THERE: readonly YouTubeFailureCode[] = ['sin_datos', 'no_encontrado']

export function createNicheResearch(deps: NicheResearchDeps) {
  const { youtube, measures, jobs, thresholds, thresholdsVersion, logger, now } = deps

  async function readHits(queries: readonly string[]): Promise<Read<VideoHit[]>> {
    const results = await Promise.all(queries.map((query) => youtube.search(query, { limit: SEARCH_LIMIT })))
    const lists: VideoHit[][] = []
    for (const result of results) {
      if (result.ok) lists.push(result.value.data)
      else if (!NOTHING_THERE.includes(result.failure.code)) return { ok: false, failure: result.failure.code }
    }
    return { ok: true, value: mergeHits(lists) }
  }

  async function readChannels(ids: readonly string[]): Promise<Read<Map<string, ChannelInfo>>> {
    const results = await Promise.all(ids.map((channelId) => youtube.getChannel({ channelId })))
    const channels = new Map<string, ChannelInfo>()
    for (const result of results) {
      if (result.ok) channels.set(result.value.data.channelId, result.value.data)
      else if (!NOTHING_THERE.includes(result.failure.code)) return { ok: false, failure: result.failure.code }
    }
    return { ok: true, value: channels }
  }

  async function measureOne(measure: Measure): Promise<Measure | null> {
    const hits = await readHits(measure.queries)
    if (!hits.ok) return measures.fail(measure.id, hits.failure)
    if (!hasEnoughVideos(hits.value, thresholds)) return measures.fail(measure.id, 'sin_datos')
    const channels = await readChannels(channelsToAsk(hits.value, thresholds))
    if (!channels.ok) return measures.fail(measure.id, channels.failure)
    const figures = measureNiche({ hits: hits.value, channels: channels.value, thresholds, now: now() })
    return figures ? measures.complete(measure.id, figures) : measures.fail(measure.id, 'sin_datos')
  }

  // A niche already measured with the same searches is kept: that is what «Seguir» resumes from (SC-006).
  function prepare(journeyId: string, niches: readonly NicheToMeasure[], force: boolean): Measure[] {
    const source = youtube.effectiveSource()
    const existing = measures.listByJourney(journeyId)
    return niches.flatMap((niche): Measure[] => {
      const previous = existing.findLast((measure) => measure.nicheLabel === niche.label)
      const same = previous && JSON.stringify(previous.queries) === JSON.stringify(niche.queries)
      if (previous?.status === 'medida' && same && !force) return []
      const again = { queries: niche.queries, source, thresholdsVersion }
      if (previous) return [measures.restart(previous.id, again)!]
      return [measures.start({ journeyId, nicheLabel: niche.label, ...again })]
    })
  }

  async function figuresOf(channelId: string): Promise<ReturnType<typeof ownChannelFigures> & { videos: VideoInfo[] }> {
    const videos = await youtube.listChannelVideos(channelId, { limit: thresholds.ownChannel.referenceVideos })
    const list = videos.ok ? videos.value.data : []
    return { ...ownChannelFigures(list, thresholds.ownChannel), videos: list }
  }

  const withFigures = async (
    channel: ChannelInfo,
    reference: Pick<NewReference, 'reason'> & { topVideoViews: number | null },
  ): Promise<NewReference> => {
    const { videos, ...figures } = await figuresOf(channel.channelId)
    const views = videos.filter((v) => !v.isShort).map((v) => v.views ?? 0)
    return {
      youtubeChannelId: channel.channelId,
      title: channel.title,
      handle: channel.handle,
      subscribers: channel.subscribers,
      topVideoViews: reference.topVideoViews ?? Math.max(0, ...views),
      ...figures,
      reason: reference.reason,
    }
  }

  const toNew = (reference: ReferenceChannel): NewReference => {
    const kept: Partial<ReferenceChannel> = { ...reference }
    delete kept.id
    delete kept.measureId
    delete kept.fetchedAt
    return kept as NewReference
  }

  return {
    start(journeyId: string, niches: readonly NicheToMeasure[], { force = false }: { force?: boolean } = {}) {
      const pending = prepare(journeyId, niches, force)
      return jobs.start({ journeyId, kind: 'medir_nichos', total: pending.length }, async (job) => {
        let done = 0
        await Promise.all(
          pending.map(async (measure) => {
            let finished: Measure | null
            try {
              finished = await measureOne(measure)
            } catch (error) {
              // One niche that breaks does not stop the others.
              logger.error('niche_research.measure_failed', { error })
              finished = measures.fail(measure.id, 'no_disponible')
            }
            done += 1
            job.progress(done, pending.length)
            job.item(finished)
          }),
        )
      })
    },

    async references(
      measure: Measure,
      change: { add?: string | undefined; remove?: string | undefined } = {},
    ): Promise<References> {
      const current = measures.listReferences(measure.id)

      if (change.remove) {
        const kept = current.filter((reference) => reference.youtubeChannelId !== change.remove)
        if (kept.length === current.length || kept.length < thresholds.references.min)
          return { ok: false, invalid: true }
        return { ok: true, references: measures.setReferences(measure.id, kept.map(toNew)) }
      }

      if (change.add) {
        if (current.length >= thresholds.references.max) return { ok: false, invalid: true }
        const resolved = await youtube.resolve(change.add)
        if (!resolved.ok) return { ok: false, failure: resolved.failure.code }
        const channel = await youtube.getChannel(resolved.value.data)
        if (!channel.ok) return { ok: false, failure: channel.failure.code }
        if (current.some((r) => r.youtubeChannelId === channel.value.data.channelId))
          return { ok: false, invalid: true }
        const added = await withFigures(channel.value.data, { reason: 'anadido_por_ti', topVideoViews: null })
        return { ok: true, references: measures.setReferences(measure.id, [...current.map(toNew), added]) }
      }

      if (current.length > 0) return { ok: true, references: current }

      // The first time: the same searches as the measure, which the cache of the service usually has.
      const hits = await readHits(measure.queries)
      if (!hits.ok) return { ok: false, failure: hits.failure }
      const channels = await readChannels(channelsToAsk(hits.value, thresholds))
      if (!channels.ok) return { ok: false, failure: channels.failure }
      const picked = pickReferences(hits.value, channels.value, thresholds)
      const fresh = await Promise.all(
        picked.map(({ channel, topVideoViews, reason }) => withFigures(channel, { reason, topVideoViews })),
      )
      return { ok: true, references: measures.setReferences(measure.id, fresh) }
    },
  }
}

export type NicheResearch = ReturnType<typeof createNicheResearch>

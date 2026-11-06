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
// One channel that fails does not count, like one left out (contracts/market.md). Its cause is kept for when too few are left.
type ChannelsRead = { channels: Map<string, ChannelInfo>; failures: YouTubeFailureCode[] }
type References =
  | { ok: true; references: ReferenceChannel[] }
  | { ok: false; failure: YouTubeFailureCode }
  | { ok: false; invalid: true }

const SEARCH_LIMIT = 40
// A failure of the reader must not turn into figures: only these mean «nothing here». Any other stops a search, and
// leaves a channel as not read.
const NOTHING_THERE: readonly YouTubeFailureCode[] = ['sin_datos', 'no_encontrado']

function mostRepeated(failures: readonly YouTubeFailureCode[]): YouTubeFailureCode {
  const times = (code: YouTubeFailureCode) => failures.filter((failure) => failure === code).length
  return failures.reduce((most, code) => (times(code) > times(most) ? code : most))
}

// Why a measure fell short: the failures, if they explain it better than channels hiding their figure.
function causeOf({ channels, failures }: ChannelsRead): YouTubeFailureCode {
  const hidden = [...channels.values()].filter((channel) => channel.subscribers === null).length
  return failures.length <= hidden ? 'sin_datos' : mostRepeated(failures)
}

export function createNicheResearch(deps: NicheResearchDeps) {
  const { youtube, measures, jobs, thresholds, thresholdsVersion, logger, now } = deps

  async function readHits(queries: readonly string[]): Promise<Read<{ hits: VideoHit[]; source: YouTubeSource }>> {
    const results = await Promise.all(queries.map((query) => youtube.search(query, { limit: SEARCH_LIMIT })))
    const lists: VideoHit[][] = []
    const sources = new Set<YouTubeSource>()
    for (const result of results) {
      if (result.ok) {
        lists.push(result.value.data)
        sources.add(result.value.source)
      } else if (!NOTHING_THERE.includes(result.failure.code)) return { ok: false, failure: result.failure.code }
    }
    // What answered, not what was going to: yt-dlp may have stepped in. If any search went through it, its limits apply.
    const source = sources.has('ytdlp') ? 'ytdlp' : ([...sources][0] ?? youtube.effectiveSource())
    return { ok: true, value: { hits: mergeHits(lists), source } }
  }

  async function readChannels(ids: readonly string[]): Promise<ChannelsRead> {
    const results = await Promise.all(ids.map((channelId) => youtube.getChannel({ channelId })))
    const channels = new Map<string, ChannelInfo>()
    const failures: YouTubeFailureCode[] = []
    for (const result of results) {
      if (result.ok) channels.set(result.value.data.channelId, result.value.data)
      else if (!NOTHING_THERE.includes(result.failure.code)) failures.push(result.failure.code)
    }
    return { channels, failures }
  }

  async function measureOne(measure: Measure): Promise<Measure | null> {
    const read = await readHits(measure.queries)
    if (!read.ok) return measures.fail(measure.id, read.failure)
    const { hits, source } = read.value
    if (!hasEnoughVideos(hits, thresholds)) return measures.fail(measure.id, 'sin_datos')
    const channelsRead = await readChannels(channelsToAsk(hits, thresholds))
    const figures = measureNiche({ hits, channels: channelsRead.channels, thresholds, now: now() })
    return figures ? measures.complete(measure.id, figures, source) : measures.fail(measure.id, causeOf(channelsRead))
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
    // Each channel keeps the date its figures were read: copied or kept, they are not read again (FR-008).
    return kept as NewReference
  }

  const research = {
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

    // «Volver a medir» from the profile (entry 114): always a new measure, so the versions before it keep the figures
    // they were made with. Its reference channels are the ones the creator had, added or removed by hand included: not
    // read again, so no quota is spent on them (entry 120). `onMeasured` makes the new profile version; false if it
    // could not, and then the job fails instead of saying it was saved.
    remeasure(previous: Measure, onMeasured: (measure: Measure) => boolean) {
      const fresh = measures.start({
        journeyId: previous.journeyId,
        nicheLabel: previous.nicheLabel,
        queries: previous.queries,
        source: youtube.effectiveSource(),
        thresholdsVersion,
      })
      return jobs.start({ journeyId: previous.journeyId, kind: 'medir_nichos', total: 1 }, async (job) => {
        let finished: Measure | null
        try {
          finished = await measureOne(fresh)
        } catch (error) {
          logger.error('niche_research.measure_failed', { error })
          finished = measures.fail(fresh.id, 'no_disponible')
        }
        job.progress(1, 1)
        job.item(finished)
        if (finished?.status !== 'medida') return { failure: finished?.failure ?? 'no_disponible' }
        measures.setReferences(finished.id, measures.listReferences(previous.id).map(toNew))
        return onMeasured(finished) ? undefined : { failure: 'interno' }
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
      const read = await readHits(measure.queries)
      if (!read.ok) return { ok: false, failure: read.failure }
      const { hits } = read.value
      const channelsRead = await readChannels(channelsToAsk(hits, thresholds))
      const picked = pickReferences(hits, channelsRead.channels, thresholds)
      // Saved, a short list would never be read again: better a failure the creator can retry (FR-012).
      if (picked.length < thresholds.references.min && channelsRead.failures.length > 0) {
        return { ok: false, failure: mostRepeated(channelsRead.failures) }
      }
      const fresh = await Promise.all(
        picked.map(({ channel, topVideoViews, reason }) => withFigures(channel, { reason, topVideoViews })),
      )
      return { ok: true, references: measures.setReferences(measure.id, fresh) }
    },
  }
  return research
}

export type NicheResearch = ReturnType<typeof createNicheResearch>

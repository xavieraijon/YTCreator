import {
  englishOpportunity,
  type Idea,
  ideaFigures,
  type IdeaThresholds,
  ideaVerdict,
  type Logger,
  type Sourced,
  type VideoHit,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeResult,
  type YouTubeSource,
} from '@ytcreator/core'
import type { IdeaMeasure, IdeaMeasuresRepo } from '../db/repos/idea-measures.ts'
import type { IdeasRepo } from '../db/repos/ideas.ts'
import type { Job } from '../db/repos/jobs.ts'
import type { JobsService } from './jobs.ts'
import { measureView } from './ideas.ts'

export interface IdeaMeasureDeps {
  youtube: YouTubeData & { effectiveSource(): YouTubeSource }
  ideas: Pick<IdeasRepo, 'get'>
  measures: Pick<IdeaMeasuresRepo, 'add'>
  jobs: Pick<JobsService, 'start'>
  thresholds: IdeaThresholds
  thresholdsVersion: number
  logger: Logger
  now: () => Date
}

type Search = YouTubeResult<Sourced<VideoHit[]>>

// Only an empty list means «nothing there»: any other failure of the reader is never read as zero videos
// (contracts/idea-measure.md, «Fallos»; entry 153 of 003).
const isEmpty = (result: Search) => !result.ok && result.failure.code === 'sin_datos'
const failureOf = (result: Search | null): YouTubeFailureCode | null =>
  result && !result.ok && !isEmpty(result) ? result.failure.code : null
const hitsOf = (result: Search | null): VideoHit[] | null => (result?.ok ? result.value.data : null)

// An idea can be measured once it has the search of its concrete topic and of its general one: without the general
// one, the semaphore would say «no audience» without having looked (principle V, entry 37).
const filled = (text: string | null) => text !== null && text.trim() !== ''
export const isMeasurable = (idea: Pick<Idea, 'query' | 'broadQuery'>) => filled(idea.query) && filled(idea.broadQuery)

// «¿Tiene hueco?» and «Medir todas» (contracts/idea-measure.md): the ideas one after another, the three searches of
// each at the same time. The figures, the semaphore and the opportunity are pure functions of core: no AI.
export function createIdeaMeasure(deps: IdeaMeasureDeps) {
  const { youtube, ideas, measures, jobs, thresholds: t, thresholdsVersion, logger, now } = deps

  async function measureOne(idea: Idea, fresh: boolean): Promise<IdeaMeasure> {
    const options = (limit: number, withoutDates: boolean) => ({
      limit,
      ...(withoutDates ? { withoutDates: true as const } : {}),
      ...(fresh ? { fresh: true as const } : {}),
    })
    const [spanish, broad, english] = await Promise.all([
      youtube.search(idea.query!, options(t.searchResults, false)),
      idea.broadQuery ? youtube.search(idea.broadQuery, options(t.broadResults, true)) : null,
      idea.queryEn ? youtube.search(idea.queryEn, options(t.searchResults, true)) : null,
    ])
    const base = {
      ideaId: idea.id,
      ideaRevision: idea.revision,
      queries: { query: idea.query, broadQuery: idea.broadQuery, queryEn: idea.queryEn },
      // What answered, not what was going to: yt-dlp may have stepped in.
      source: spanish.ok ? spanish.value.source : youtube.effectiveSource(),
      thresholdsVersion,
    }
    const failure = failureOf(spanish) ?? failureOf(broad)
    if (failure) {
      return measures.add({
        ...base,
        status: 'fallida',
        verdict: null,
        reason: null,
        figures: null,
        similarVideos: [],
        opportunity: null,
        failure,
        partial: false,
      })
    }
    const read = ideaFigures({
      query: idea.query!,
      hits: hitsOf(spanish) ?? [],
      broadHits: hitsOf(broad),
      format: idea.format,
      thresholds: t,
      now: now(),
    })
    const { verdict, reason } = ideaVerdict(read.figures, t)
    // In English too, an empty list is «nothing there», not a failure (entry 38).
    const englishFailure = failureOf(english)
    const englishHits = english && isEmpty(english) ? [] : hitsOf(english)
    const opportunity = englishFailure
      ? { failure: englishFailure }
      : englishOpportunity({ similar: read.figures.similar, englishHits, thresholds: t })
    const partial =
      read.partial || (spanish.ok && spanish.value.partial === true) || (broad?.ok && broad.value.partial === true)
    return measures.add({
      ...base,
      status: 'medida',
      verdict,
      reason,
      figures: read.figures,
      similarVideos: read.similarVideos,
      opportunity,
      failure: null,
      partial: partial === true,
    })
  }

  return {
    measureOne,

    // The ideas without their search are left out and counted (`progress.skipped`).
    start(channelId: string, ideaIds: readonly string[], { fresh = false }: { fresh?: boolean } = {}): Job {
      const found = [...new Set(ideaIds)]
        .map((id) => ideas.get(id))
        .filter((idea): idea is Idea => idea?.channelId === channelId)
      const measurable = found.filter(isMeasurable).map((idea) => idea.id)
      return jobs.start(
        {
          journeyId: null,
          channelId,
          kind: 'medir_ideas',
          total: measurable.length,
          ideaIds: measurable,
          skipped: found.length - measurable.length,
        },
        async (job) => {
          let done = 0
          for (const id of measurable) {
            // Read again: it may have changed (or lost its search) since the job started.
            const idea = ideas.get(id)
            if (idea && isMeasurable(idea)) {
              let measure: IdeaMeasure
              try {
                measure = await measureOne(idea, fresh)
              } catch (error) {
                // One idea that breaks does not stop the others.
                logger.error('idea_measure.failed', { error })
                measure = measures.add({
                  ideaId: idea.id,
                  ideaRevision: idea.revision,
                  queries: { query: idea.query, broadQuery: idea.broadQuery, queryEn: idea.queryEn },
                  source: youtube.effectiveSource(),
                  thresholdsVersion,
                  status: 'fallida',
                  verdict: null,
                  reason: null,
                  figures: null,
                  similarVideos: [],
                  opportunity: null,
                  failure: 'no_disponible',
                  partial: false,
                })
              }
              job.item({ ideaId: idea.id, measure: measureView(measure) })
            }
            done += 1
            job.progress(done)
          }
        },
      )
    },
  }
}

export type IdeaMeasureService = ReturnType<typeof createIdeaMeasure>

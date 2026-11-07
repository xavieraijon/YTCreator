import type { IdeaFigures } from '../api/ideas.ts'
import { median } from '../market/stats.ts'
import { SHORT_MAX_SECONDS, type VideoHit } from '../youtube/port.ts'
import type { IdeaFormat } from './model.ts'
import { isSimilar, keywordsOf } from './similar.ts'

// The `ideas` block of thresholds.json (research R4): an assumption with no study behind it.
export interface IdeaThresholds {
  searchResults: number
  broadResults: number
  similarHigh: number
  similarLow: number
  recentDays: number
  recentBurst: number
  datedSample: number
  deadMedianViews: number
  audienceViews: number
  audienceVideos: number
  keywordShare: number
  staleDays: number
  opportunity: { englishBigVideos: number; maxSimilar: number }
}

export interface IdeaFiguresInput {
  query: string
  hits: readonly VideoHit[]
  // The search of the general topic; null when YouTube had nothing for it (idea-measure.md, «Fallos»).
  broadHits: readonly VideoHit[] | null
  format: IdeaFormat
  thresholds: IdeaThresholds
  now: Date
}

// How many similar videos are shown as evidence.
export const SIMILAR_SHOWN = 12
const DAY_MS = 24 * 60 * 60 * 1000

// A video of unknown length counts for both formats: leaving it out would hide a competitor (entry 27).
export const fitsFormat = (hit: VideoHit, format: IdeaFormat) =>
  hit.durationSeconds === null || (format === 'short') === hit.durationSeconds <= SHORT_MAX_SECONDS

const known = (values: readonly (number | null)[]) => values.filter((value): value is number => value !== null)

// The figures of one idea, from what YouTube answered (contracts/idea-measure.md, «Cifras»). No AI takes part.
export function ideaFigures(input: IdeaFiguresInput): {
  figures: IdeaFigures
  similarVideos: VideoHit[]
  partial: boolean
} {
  const { thresholds: t, now } = input
  const keywords = keywordsOf(input.query)
  const similar = input.hits
    .filter((hit) => fitsFormat(hit, input.format))
    .filter((hit) => isSimilar(hit.title, keywords, t.keywordShare))
  const sample = similar.slice(0, t.datedSample)
  const dates = known(sample.map((hit) => (hit.publishedAt ? Date.parse(hit.publishedAt) : null))).filter(
    (time) => !Number.isNaN(time),
  )
  const recent = dates.filter((time) => now.getTime() - time <= t.recentDays * DAY_MS).length
  const views = known(similar.map((hit) => hit.views))
  const middle = median(views)
  const maxViews = views.length > 0 ? Math.max(...views) : null
  const broadViews = known((input.broadHits ?? []).map((hit) => hit.views))
  const broadBigVideos = broadViews.filter((value) => value >= t.audienceViews).length
  const figures: IdeaFigures = {
    similar: similar.length,
    recent,
    dated: dates.length,
    medianViews: middle === null ? null : Math.round(middle),
    maxViews,
    broadTopViews: broadViews.length > 0 ? Math.max(...broadViews) : null,
    broadBigVideos,
    hasAudience: broadBigVideos >= t.audienceVideos || (maxViews ?? 0) >= t.audienceViews,
  }
  return {
    figures,
    similarVideos: similar.slice(0, SIMILAR_SHOWN),
    // Without the date of most of the sample, «recent» says less than it seems.
    partial: sample.length > 0 && sample.length - dates.length > sample.length / 2,
  }
}

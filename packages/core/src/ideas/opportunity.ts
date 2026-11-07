import type { VideoHit } from '../youtube/port.ts'
import type { IdeaThresholds } from './figures.ts'

export const ENGLISH_SHOWN = 5

// «Mucho en inglés y poco en castellano» (research R5): a notice apart, which never changes the semaphore.
export function englishOpportunity(input: {
  similar: number
  englishHits: readonly VideoHit[] | null | undefined
  thresholds: Pick<IdeaThresholds, 'audienceViews' | 'opportunity'>
}): { english: boolean; englishBigVideos: number; topVideos: VideoHit[] } | null {
  const { englishHits, thresholds: t } = input
  if (!englishHits) return null
  const englishBigVideos = englishHits.filter((hit) => (hit.views ?? 0) >= t.audienceViews).length
  const topVideos = [...englishHits]
    .filter((hit) => hit.views !== null)
    .sort((a, b) => b.views! - a.views!)
    .slice(0, ENGLISH_SHOWN)
  return {
    english: englishBigVideos >= t.opportunity.englishBigVideos && input.similar <= t.opportunity.maxSimilar,
    englishBigVideos,
    topVideos,
  }
}

import type { IdeaThresholds } from '../../src/ideas/figures.ts'

// The `ideas` block of thresholds.json v5, for the tests.
export const thresholds: IdeaThresholds = {
  searchResults: 40,
  broadResults: 20,
  similarHigh: 12,
  similarLow: 5,
  recentDays: 90,
  recentBurst: 4,
  datedSample: 12,
  deadMedianViews: 1000,
  audienceViews: 100000,
  audienceVideos: 2,
  keywordShare: 0.75,
  staleDays: 30,
  opportunity: { englishBigVideos: 2, maxSimilar: 5 },
}

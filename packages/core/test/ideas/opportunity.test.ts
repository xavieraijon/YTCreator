import { describe, expect, it } from 'vitest'
import { englishOpportunity } from '../../src/ideas/opportunity.ts'
import type { VideoHit } from '../../src/youtube/port.ts'
import { thresholds } from './thresholds.ts'

const hit = (views: number | null, id = String(views)): VideoHit => ({
  videoId: id,
  title: 'Bread',
  channelId: 'UC1',
  channelTitle: 'Channel',
  views,
  publishedAt: null,
  durationSeconds: 600,
})

describe('englishOpportunity (R5)', () => {
  const big = [hit(100000), hit(300000), hit(50), hit(null), hit(200000), hit(7), hit(8), hit(9)]
  it('two or more big videos in English and 5 or fewer similar in Spanish', () => {
    expect(englishOpportunity({ similar: 5, englishHits: big, thresholds })).toMatchObject({
      english: true,
      englishBigVideos: 3,
    })
    expect(englishOpportunity({ similar: 6, englishHits: big, thresholds })?.english).toBe(false)
    expect(englishOpportunity({ similar: 0, englishHits: [hit(100000)], thresholds })?.english).toBe(false)
  })
  it('keeps the 5 English videos with most views', () => {
    const top = englishOpportunity({ similar: 0, englishHits: big, thresholds })!.topVideos
    expect(top.map((video) => video.views)).toEqual([300000, 200000, 100000, 50, 9])
  })
  it('without the English search, nothing', () => {
    expect(englishOpportunity({ similar: 0, englishHits: null, thresholds })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { ideaFigures } from '../../src/ideas/figures.ts'
import type { VideoHit } from '../../src/youtube/port.ts'
import { thresholds } from './thresholds.ts'

const now = new Date('2026-11-07T00:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString()
let n = 0
const hit = (fields: Partial<VideoHit> = {}): VideoHit => ({
  videoId: `v${(n += 1)}`,
  title: 'Pan de masa madre',
  channelId: 'UC1',
  channelTitle: 'Canal',
  views: 500,
  publishedAt: daysAgo(10),
  durationSeconds: 600,
  ...fields,
})
const run = (hits: VideoHit[], broadHits: VideoHit[] | null = [], format: 'largo' | 'short' = 'largo') =>
  ideaFigures({ query: 'pan masa madre', hits, broadHits, format, thresholds, now })

describe('ideaFigures (contracts/idea-measure.md)', () => {
  it('keeps to the format: Shorts are 180 s or less; an unknown length counts for both', () => {
    const hits = [
      hit({ durationSeconds: 60 }),
      hit({ durationSeconds: 180 }),
      hit({ durationSeconds: 181 }),
      hit({ durationSeconds: null }),
    ]
    expect(run(hits, [], 'short').figures.similar).toBe(3)
    expect(run(hits, [], 'largo').figures.similar).toBe(2)
  })

  it('counts the similar, and the dated and recent among the first 12', () => {
    const hits = [
      ...Array.from({ length: 3 }, () => hit({ publishedAt: daysAgo(30) })),
      hit({ publishedAt: daysAgo(91) }),
      hit({ publishedAt: null }),
      hit({ title: 'Bizcocho de chocolate' }),
      ...Array.from({ length: 10 }, () => hit({ publishedAt: daysAgo(1) })),
    ]
    const { figures, similarVideos } = run(hits)
    expect(figures.similar).toBe(15)
    expect(figures.dated).toBe(11) // 12 in the sample, one without a date
    expect(figures.recent).toBe(3 + 7) // the 91 days one is not recent; 7 of the last ten fit in the sample
    expect(similarVideos).toHaveLength(12)
  })

  it('median and max views ignore the unknown, and the median is rounded', () => {
    const { figures } = run([hit({ views: 100 }), hit({ views: 201 }), hit({ views: null })])
    expect(figures.medianViews).toBe(151)
    expect(figures.maxViews).toBe(201)
    expect(run([hit({ views: null })]).figures).toMatchObject({ medianViews: null, maxViews: null })
  })

  it('the general topic: its top views and how many big videos; with two, it has an audience', () => {
    const broad = [hit({ views: 100000 }), hit({ views: 250000 }), hit({ views: 99999 })]
    expect(run([], broad).figures).toMatchObject({ broadTopViews: 250000, broadBigVideos: 2, hasAudience: true })
    expect(run([], broad.slice(0, 1)).figures.hasAudience).toBe(false)
    expect(run([], null).figures).toMatchObject({ broadTopViews: null, broadBigVideos: 0, hasAudience: false })
  })

  it('one similar with 100.000 views is audience enough', () => {
    expect(run([hit({ views: 100000 })], null).figures.hasAudience).toBe(true)
  })

  it('partial when more than half of the sample has no date', () => {
    expect(run([hit({ publishedAt: null }), hit({ publishedAt: null }), hit()]).partial).toBe(true)
    expect(run([hit({ publishedAt: null }), hit()]).partial).toBe(false)
    expect(run([]).partial).toBe(false)
  })
})

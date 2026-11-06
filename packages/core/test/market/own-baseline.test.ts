import { describe, expect, it } from 'vitest'
import { bestVideos, isNotable, ownChannelFigures, rateVideos, worstVideos } from '../../src/market/own-baseline.ts'
import type { VideoInfo } from '../../src/youtube/port.ts'

const settings = { baselineVideos: 10, minBaseline: 3, notableRatio: 3, youngDays: 30 }
const now = new Date('2026-11-01T00:00:00Z')

const video = (id: string, views: number | null, extra: Partial<VideoInfo> = {}): VideoInfo => ({
  videoId: id,
  title: `Vídeo ${id}`,
  views,
  durationSeconds: 600,
  publishedAt: null,
  isShort: false,
  ...extra,
})

describe('rateVideos', () => {
  it('divides the views by the median of the previous uploads', () => {
    const rated = rateVideos([video('a', 3000), video('b', 900), video('c', 1000), video('d', 1100)], settings)
    expect(rated[0]!.ratio).toBe(3)
  })

  it('uses only the 10 previous ones', () => {
    const older = Array.from({ length: 10 }, (_, i) => video(`o${i}`, 100))
    const oldest = Array.from({ length: 5 }, (_, i) => video(`x${i}`, 100_000))
    expect(rateVideos([video('a', 200), ...older, ...oldest], settings)[0]!.ratio).toBe(2)
  })

  it('gives null with fewer than 3 previous uploads with views', () => {
    const rated = rateVideos([video('a', 500), video('b', 100), video('c', null), video('d', 100)], settings)
    expect(rated[0]!.ratio).toBeNull()
  })

  it('gives null when the normal is 0 or the video has no views', () => {
    expect(rateVideos([video('a', 5), video('b', 0), video('c', 0), video('d', 0)], settings)[0]!.ratio).toBeNull()
    expect(rateVideos([video('a', null), video('b', 1), video('c', 1), video('d', 1)], settings)[0]!.ratio).toBeNull()
  })

  it('a viral among the previous ones does not distort the normal', () => {
    const rated = rateVideos([video('a', 2000), video('b', 1000), video('c', 5_000_000), video('d', 1000)], settings)
    expect(rated[0]!.ratio).toBe(2)
  })

  it('never mixes formats', () => {
    const short = (id: string, views: number) => video(id, views, { durationSeconds: 40, isShort: true })
    const rated = rateVideos(
      [
        video('a', 1000),
        short('s1', 900_000),
        video('b', 500),
        short('s2', 300_000),
        video('c', 500),
        short('s3', 300_000),
        video('d', 500),
        short('s4', 600_000),
      ],
      settings,
    )
    expect(rated[0]!.ratio).toBe(2)
    expect(rated[1]!.ratio).toBe(3)
  })

  it('a video with no duration has no format, and is not part of the normal', () => {
    const rated = rateVideos(
      [
        video('a', 300),
        video('u', 90_000, { durationSeconds: null }),
        video('b', 100),
        video('c', 100),
        video('d', 100),
      ],
      settings,
    )
    expect(rated[0]!.ratio).toBe(3)
    expect(rated[1]!.ratio).toBeNull()
  })
})

describe('notable, best and worst', () => {
  const rated = (ratio: number | null, id: string, publishedAt: string | null = null) => ({
    ...video(id, 1),
    publishedAt,
    ratio,
  })

  it('notable from 3 times the normal', () => {
    expect(isNotable(rated(3, 'a'), settings)).toBe(true)
    expect(isNotable(rated(2.9, 'a'), settings)).toBe(false)
    expect(isNotable(rated(null, 'a'), settings)).toBe(false)
  })

  it('best orders by ratio and leaves out those without one', () => {
    const best = bestVideos([rated(1, 'a'), rated(null, 'b'), rated(5, 'c')], 3)
    expect(best.map((v) => v.videoId)).toEqual(['c', 'a'])
  })

  it('a video under 30 days old is never among the worst', () => {
    const worst = worstVideos(
      [rated(0.1, 'nuevo', '2026-10-20T00:00:00Z'), rated(0.5, 'viejo', '2026-08-01T00:00:00Z'), rated(0.9, 'x')],
      3,
      { settings, now },
    )
    expect(worst.map((v) => v.videoId)).toEqual(['viejo', 'x'])
  })

  it('a video without a date is treated as old', () => {
    expect(worstVideos([rated(0.2, 'sin')], 3, { settings, now }).map((v) => v.videoId)).toEqual(['sin'])
  })
})

describe('ownChannelFigures', () => {
  it('reads only long videos', () => {
    const figures = ownChannelFigures(
      [
        video('a', 3000),
        video('s', 900_000, { durationSeconds: 30, isShort: true }),
        video('b', 1000),
        video('c', 1000),
        video('d', 1000),
      ],
      settings,
    )
    expect(figures).toEqual({ medianViews: 1000, bestRatio: 3, bestVideoId: 'a', bestVideoTitle: 'Vídeo a' })
  })

  it('without enough videos the comparison is null', () => {
    expect(ownChannelFigures([video('a', 10)], settings)).toEqual({
      medianViews: 10,
      bestRatio: null,
      bestVideoId: null,
      bestVideoTitle: null,
    })
  })
})

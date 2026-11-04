import { describe, expect, it } from 'vitest'
import { channelsToAsk, measureNiche, mergeHits, pickReferences } from '../../src/market/measures.ts'
import type { ChannelInfo, VideoHit } from '../../src/youtube/port.ts'

const thresholds = {
  demand: { high: 50_000, medium: 5_000 },
  entryDoor: { open: 3, ajar: 1, maxSubscribers: 200_000 },
  concentration: { high: 0.7, medium: 0.4, topChannels: 3 },
  minVideos: 10,
  maxChannels: 20,
  saturationDays: 90,
  context: { smallChannelSubscribers: 10_000 },
  references: { max: 4 },
}
const now = new Date('2026-11-01T00:00:00Z')

let next = 0
const hit = (channelId: string, views: number | null, extra: Partial<VideoHit> = {}): VideoHit => ({
  videoId: `v${next++}`,
  title: 't',
  channelId,
  channelTitle: channelId,
  views,
  publishedAt: null,
  durationSeconds: 600,
  ...extra,
})
const channel = (channelId: string, subscribers: number | null): ChannelInfo => ({
  channelId,
  title: channelId,
  handle: null,
  description: '',
  subscribers,
  videoCount: null,
  country: null,
})
const channels = (entries: Record<string, number | null>) =>
  new Map(Object.entries(entries).map(([id, subs]) => [id, channel(id, subs)]))

const sample = (views: number, count = 10) => Array.from({ length: count }, (_, i) => hit(`c${i}`, views))
const ten = channels(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, 1_000_000])))
const run = (hits: VideoHit[], map = ten) => measureNiche({ hits, channels: map, thresholds, now })

describe('demand', () => {
  it.each([
    [50_000, 'alta'],
    [49_999, 'media'],
    [5_000, 'media'],
    [4_999, 'baja'],
  ])('%i views → %s', (views, level) => {
    const measure = run(sample(views))!
    expect(measure.demandMedianViews).toBe(views)
    expect(measure.demandLevel).toBe(level)
  })

  it('a viral does not move the median', () => {
    expect(run([...sample(1000, 10), hit('c0', 9_000_000)])!.demandMedianViews).toBe(1000)
  })
})

describe('entry door', () => {
  const door = (count: number) => {
    const small = Array.from({ length: count }, (_, i) => [`c${i}`, 100])
    return channels({
      ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, 1_000_000])),
      ...Object.fromEntries(small),
    })
  }
  it.each([
    [3, 'abierta'],
    [1, 'entreabierta'],
    [0, 'cerrada'],
  ])('%i channels → %s', (count, level) => {
    const measure = run(sample(1000), door(count))!
    expect(measure.entryChannels).toBe(count)
    expect(measure.entryLevel).toBe(level)
  })

  it('a channel of 200.000 or more does not count, however many views', () => {
    const map = channels({ ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, 200_000])) })
    expect(run(sample(900_000), map)!.entryChannels).toBe(0)
  })

  it('hidden subscribers are left out and counted, and a channel not asked for too', () => {
    const map = channels({ c0: null, c1: 100 })
    const measure = run(sample(1000), map)!
    expect(measure.entryChannels).toBe(1)
    expect(measure.hiddenSubscribers).toBe(9)
    expect(measure.smallChannels).toBe(1)
  })
})

describe('concentration', () => {
  const share = (top: number, rest: number) => [
    hit('a', top),
    hit('b', top),
    hit('c', top),
    ...Array.from({ length: 7 }, (_, i) => hit(`r${i}`, rest)),
  ]
  it('is the share of views of the top 3 channels', () => {
    expect(run(share(700, (300 / 7) * 3))!.concentration).toBeCloseTo(0.7)
  })
  it.each([
    [3000, 100, 'alta'],
    [1000, 300, 'media'],
    [100, 300, 'baja'],
  ])('top %i, rest %i → %s', (top, rest, level) => {
    expect(run(share(top, rest))!.concentrationLevel).toBe(level)
  })
  it('channels in a tie still count as three', () => {
    const tied = Array.from({ length: 10 }, (_, i) => hit(`c${i}`, 100))
    expect(run(tied)!.concentration).toBeCloseTo(0.3)
  })
})

describe('saturation', () => {
  it('counts the videos of the last 90 days over those with a date', () => {
    const recent = '2026-10-01T00:00:00Z'
    const old = '2026-01-01T00:00:00Z'
    const hits = [
      hit('a', 10, { publishedAt: recent }),
      hit('a', 10, { publishedAt: recent }),
      hit('a', 10, { publishedAt: recent }),
      hit('a', 10, { publishedAt: old }),
      ...sample(10, 6),
    ]
    const measure = run(hits)!
    expect(measure.recentVideos).toBe(3)
    expect(measure.recentShare).toBeCloseTo(0.75)
  })
  it('without any date it stays null, never estimated', () => {
    const measure = run(sample(10))!
    expect(measure.recentVideos).toBeNull()
    expect(measure.recentShare).toBeNull()
  })
})

describe('formats (FR-007b)', () => {
  const short = (views: number | null) => hit('s', views, { durationSeconds: 45 })
  const unknown = () => hit('u', 9_000_000, { durationSeconds: null })

  it('Shorts and videos with no duration change no indicator', () => {
    const base = sample(1000)
    const clean = run(base)!
    const mixed = run([...base, short(5_000_000), short(5_000_000), unknown()])!
    for (const key of ['demandMedianViews', 'entryChannels', 'concentration', 'sampleSize', 'verdict'] as const) {
      expect(mixed[key]).toEqual(clean[key])
    }
    expect(mixed.shortsInSample).toBe(2)
    expect(mixed.unknownFormatVideos).toBe(1)
  })

  it('exactly 180 seconds is a Short; 181 is long', () => {
    const measure = run([
      ...sample(100, 9),
      hit('x', 100, { durationSeconds: 181 }),
      hit('x', 1, { durationSeconds: 180 }),
    ])!
    expect(measure.sampleSize).toBe(10)
    expect(measure.shortsInSample).toBe(1)
  })

  it('gives the median of the Shorts only with enough of them', () => {
    expect(run([...sample(1), ...Array.from({ length: 9 }, () => short(500))])!.shortsMedianViews).toBeNull()
    expect(run([...sample(1), ...Array.from({ length: 10 }, () => short(500))])!.shortsMedianViews).toBe(500)
  })

  it('with fewer than 10 long videos there is no measure, even with many Shorts', () => {
    expect(run([...sample(1000, 9), ...Array.from({ length: 30 }, () => short(5000))])).toBeNull()
  })

  it('a long video without views does not count', () => {
    expect(run([...sample(1000, 9), hit('x', null)])).toBeNull()
  })
})

describe('sample', () => {
  it('joins the searches without repeated videos', () => {
    const repeated = hit('a', 1)
    expect(mergeHits([[repeated, hit('b', 1)], [repeated]])).toHaveLength(2)
  })

  it('asks for at most 20 channels, those with most views first, and only those with long videos', () => {
    const hits = Array.from({ length: 25 }, (_, i) => hit(`c${i}`, i))
    const asked = channelsToAsk([...hits, hit('short', 999_999, { durationSeconds: 30 })], thresholds)
    expect(asked).toHaveLength(20)
    expect(asked[0]).toBe('c24')
    expect(asked).not.toContain('short')
  })

  it('the verdict comes with the figures', () => {
    const map = channels({ c0: 1, c1: 1, c2: 1 })
    expect(run(sample(60_000), map)!.verdict).toBe('conviene')
    expect(run(sample(10), map)!.verdict).toBe('no_conviene')
  })
})

describe('pickReferences (FR-012)', () => {
  it('first the channels that count for the entry door, then by the views of their best video', () => {
    const hits = [hit('big', 900_000), hit('open', 500), hit('open2', 1000), hit('big2', 1_000)]
    const map = channels({ big: 5_000_000, open: 100, open2: 100, big2: 5_000_000 })
    const picked = pickReferences(hits, map, thresholds)
    expect(picked.map((c) => c.channel.channelId)).toEqual(['open2', 'open', 'big', 'big2'])
    expect(picked[0]!.reason).toBe('puerta_de_entrada')
    expect(picked[2]!.reason).toBe('mejor_video')
  })

  it('at most 4, and only channels it could read', () => {
    const hits = Array.from({ length: 6 }, (_, i) => hit(`c${i}`, 10))
    const map = channels(Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, 1])))
    const picked = pickReferences(hits, map, thresholds)
    expect(picked).toHaveLength(4)
    expect(picked.map((c) => c.channel.channelId)).not.toContain('c5')
  })
})

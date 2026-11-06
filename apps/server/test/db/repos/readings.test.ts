import { beforeEach, describe, expect, it } from 'vitest'
import { createReadingsRepo, type ReadingsRepo } from '../../../src/db/repos/readings.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

const format = {
  count: 0,
  medianViews: null,
  averageDurationSeconds: null,
  videosPerWeek: null,
  datedVideos: 0,
  best: [],
  worst: [],
}
const summary = {
  videosRead: 1,
  lowInfo: true,
  partial: false,
  unknownFormat: 0,
  long: format,
  short: { ...format, count: 1 },
}

describe('readings repo', () => {
  let readings: ReadingsRepo
  let channelId: string
  const clock = manualClock()

  beforeEach(() => {
    const db = freshDb()
    channelId = seedJourney(db).channelId
    readings = createReadingsRepo(db, clock.now)
  })

  const reading = (title: string) => ({
    channelId,
    youtubeChannelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
    source: 'fake' as const,
    title,
    handle: 'canal',
    description: '',
    subscribers: null,
    videoCount: 3,
    videos: [
      { id: 'v1', title: 'Uno', views: null, durationSeconds: 60, publishedAt: null, isShort: true, ratio: null },
    ],
    summary,
  })

  it('returns null before any reading', () => {
    expect(readings.latest(channelId)).toBeNull()
  })

  it('keeps the videos and summary as read, with null where YouTube gave nothing', () => {
    const saved = readings.add(reading('Canal'))
    expect(saved).toMatchObject({
      subscribers: null,
      videos: [{ id: 'v1', views: null }],
      summary: { videosRead: 1, short: { medianViews: null } },
    })
    expect(saved.fetchedAt).toBe(clock.now().toISOString())
  })

  it('latest returns the newest reading', () => {
    readings.add(reading('Antes'))
    clock.advance(1000)
    readings.add(reading('Después'))
    expect(readings.latest(channelId)?.title).toBe('Después')
  })

  it('latestFor returns the newest reading of that channel of YouTube', () => {
    readings.add(reading('Suya'))
    clock.advance(1000)
    readings.add({ ...reading('De otro'), youtubeChannelId: 'UCbbbbbbbbbbbbbbbbbbbbbb' })
    expect(readings.latestFor(channelId, 'UCaaaaaaaaaaaaaaaaaaaaaa')?.title).toBe('Suya')
    expect(readings.latestFor(channelId, 'UCcccccccccccccccccccccc')).toBeNull()
  })
})

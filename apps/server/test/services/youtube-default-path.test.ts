import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createYouTubeAdapters } from '@ytcreator/youtube'
import { describe, expect, it, vi } from 'vitest'
import { createJobsRepo } from '../../src/db/repos/jobs.ts'
import { createMeasuresRepo } from '../../src/db/repos/measures.ts'
import { createSettingsRepo } from '../../src/db/repos/settings.ts'
import { createYtCacheRepo } from '../../src/db/repos/yt-cache.ts'
import { createMemoryLogger } from '../../src/logging.ts'
import { createJobsService } from '../../src/services/jobs.ts'
import { createNicheResearch } from '../../src/services/niche-research.ts'
import { createYouTubeService, youtubeChoice } from '../../src/services/youtube.ts'
import { freshDb, manualClock, seedJourney } from '../db/repos/helpers.ts'

// A yt-dlp that answers like the real one (spike S1): flat listings with no dates. 30 channels: 20 big, 10 small.
const FAKE_BIN = `#!/usr/bin/env node
const target = process.argv.at(-1)
const out = (value) => process.stdout.write(JSON.stringify(value))
if (target.startsWith('ytsearch')) {
  const entries = Array.from({ length: 30 }, (_, i) => ({
    id: ('vid' + String(i).padStart(3, '0')).padEnd(11, 'x'),
    title: 'Vídeo ' + i,
    view_count: i < 20 ? 100000 + i : 500 + i,
    duration: 600,
    channel: 'Canal ' + i,
    channel_id: 'UC' + String(i).padStart(22, '0'),
  }))
  out({ _type: 'playlist', entries })
} else {
  const id = /channel\\/(UC[0-9]+)/.exec(target)[1]
  const big = Number(id.slice(2)) < 20
  out({ _type: 'playlist', channel_id: id, channel: 'Canal', channel_follower_count: big ? 1000000 : 100, entries: [{ id: 'aaaaaaaaaaa', title: 't', view_count: 1, duration: 600 }] })
}
`

// The feed of each channel dates only its first video in the search.
const feeds = (async (input: string | URL | Request) => {
  const id = Number(/channel_id=UC([0-9]+)/.exec(String(input))?.[1])
  const videoId = `vid${String(id).padStart(3, '0')}`.padEnd(11, 'x')
  return new Response(`<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
    <entry><yt:videoId>${videoId}</yt:videoId><published>2026-10-20T10:00:00+00:00</published></entry></feed>`)
}) as typeof fetch

const THRESHOLDS = {
  demand: { high: 50_000, medium: 5_000 },
  entryDoor: { open: 3, ajar: 1, maxSubscribers: 200_000 },
  concentration: { high: 0.7, medium: 0.4, topChannels: 3 },
  minVideos: 10,
  maxChannels: 20,
  minKnownChannelsShare: 0.5,
  saturationDays: 90,
  context: { smallChannelSubscribers: 10_000 },
  references: { min: 2, max: 4 },
  ownChannel: { baselineVideos: 30, minBaseline: 5, notableRatio: 3, youngDays: 30, referenceVideos: 30 },
}

// The way a real install without a key reads YouTube: real settings, real adapters, only the binary and the web faked.
// None of the other tests go through this: they use the fake YouTube or inject `hasKey`.
describe('the default path, without a key (G1, G2, G3)', () => {
  it('measures a niche with yt-dlp, dates from the feeds and small channels counted', async () => {
    const db = freshDb()
    const clock = manualClock()
    const logger = createMemoryLogger(clock.now)
    const settings = createSettingsRepo(db)
    const dir = mkdtempSync(join(tmpdir(), 'ytc-default-path-'))
    const bin = join(dir, 'yt-dlp')
    writeFileSync(bin, FAKE_BIN)
    chmodSync(bin, 0o755)

    const youtube = createYouTubeService({
      adapters: createYouTubeAdapters({
        env: {},
        binPath: bin,
        fetch: feeds,
        getKey: async () => null,
        quota: { used: () => 0, add: () => undefined },
        limits: { dailyUnits: 10_000, nearLimitRatio: 0.8, searchUnits: 100, otherUnits: 1 },
        now: clock.now,
      }),
      ...youtubeChoice(settings),
      quota: { used: () => 0, limit: 10_000, nearLimitRatio: 0.8 },
      cache: createYtCacheRepo(db, clock.now),
      logger,
      now: clock.now,
    })
    expect(youtube.effectiveSource()).toBe('ytdlp')

    const { journeyId } = seedJourney(db)
    const measures = createMeasuresRepo(db, clock.now)
    const research = createNicheResearch({
      youtube,
      measures,
      jobs: createJobsService({ jobs: createJobsRepo(db, clock.now), logger }),
      thresholds: THRESHOLDS,
      thresholdsVersion: 1,
      logger,
      now: clock.now,
    })
    research.start(journeyId, [{ label: 'Recetas', queries: ['recetas rápidas'] }])

    await vi.waitFor(() => expect(measures.listByJourney(journeyId)[0]?.status).toBe('medida'), { timeout: 15_000 })
    const [measure] = measures.listByJourney(journeyId)
    expect(measure).toMatchObject({ source: 'ytdlp', sampleSize: 30, hiddenSubscribers: 0, unreadChannels: 10 })
    expect(measure!.recentVideos).toBeGreaterThan(0)
    expect(measure!.entryChannels).toBeGreaterThan(0)
  }, 20_000)
})

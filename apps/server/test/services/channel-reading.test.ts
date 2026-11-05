import type { ChannelInfo, ReadingSummary, VideoInfo, YouTubeData, YouTubeFailureCode } from '@ytcreator/core'
import { CHANNEL_VIDEOS_LIMIT, youtubeFailure } from '@ytcreator/core'
import { describe, expect, it, vi } from 'vitest'
import { createChannelsRepo } from '../../src/db/repos/channels.ts'
import { createJobsRepo } from '../../src/db/repos/jobs.ts'
import { createJourneysRepo } from '../../src/db/repos/journeys.ts'
import { createProposalsRepo } from '../../src/db/repos/proposals.ts'
import { createReadingsRepo } from '../../src/db/repos/readings.ts'
import { createChannelReading, readingInput } from '../../src/services/channel-reading.ts'
import { createJobsService } from '../../src/services/jobs.ts'
import { freshDb } from '../db/repos/helpers.ts'

const NOW = new Date('2026-11-05T10:00:00.000Z')
const DAY = 86_400_000
const UC = 'UCabcdefghijklmnopqrstuv'
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const THRESHOLDS = { baselineVideos: 10, minBaseline: 3, notableRatio: 3, youngDays: 30, referenceVideos: 30 }

const info: ChannelInfo = {
  channelId: UC,
  title: 'Mi Canal',
  handle: 'micanal',
  description: 'Un canal de cocina.',
  subscribers: 1200,
  videoCount: 42,
  country: 'ES',
  thumbnailUrl: 'https://yt3.ggpht.com/foto=s88',
}

const video = (index: number, views: number | null, days: number | null, durationSeconds = 600): VideoInfo => ({
  videoId: `video${String(index).padStart(6, '0')}`,
  title: `Vídeo ${index}`,
  views,
  durationSeconds,
  publishedAt: days === null ? null : ago(days),
  isShort: durationSeconds <= 180,
})

function setup({
  videos = [],
  failure,
  partial,
  channel = info,
}: {
  videos?: VideoInfo[]
  failure?: YouTubeFailureCode
  partial?: true
  channel?: ChannelInfo
}) {
  const db = freshDb()
  const now = () => NOW
  const channels = createChannelsRepo(db, now)
  const journeys = createJourneysRepo(db, now)
  const readings = createReadingsRepo(db, now)
  const proposals = createProposalsRepo(db, now)
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const jobsRepo = createJobsRepo(db, now)
  const jobs = createJobsService({ jobs: jobsRepo, logger: logger as never })
  const sourced = <T>(data: T) => ({
    ok: true as const,
    value: { data, source: 'fake' as const, fetchedAt: ago(1), ...(partial ? { partial } : {}) },
  })
  const listChannelVideos = vi.fn<YouTubeData['listChannelVideos']>(async (_id, options) =>
    failure ? youtubeFailure(failure) : sourced(videos.slice(0, options.limit)),
  )
  const youtube = {
    resolve: vi.fn<YouTubeData['resolve']>(async () => sourced({ channelId: UC })),
    getChannel: vi.fn<YouTubeData['getChannel']>(async () => sourced(channel)),
    listChannelVideos,
  } as unknown as YouTubeData
  const service = createChannelReading({
    youtube,
    channels,
    journeys,
    proposals,
    readings,
    jobs,
    db,
    thresholds: THRESHOLDS,
    now,
    logger: logger as never,
  })
  const row = channels.create({ origin: 'existente' })
  const journey = journeys.create({ channelId: row.id, kind: 'existente', step: 'confirmar' })
  return { db, channels, journeys, readings, proposals, jobsRepo, service, row, journey, listChannelVideos }
}

async function readAll(ctx: ReturnType<typeof setup>) {
  const looked = await ctx.service.lookUp('@micanal')
  if (!looked.ok) throw new Error(looked.failure)
  const job = ctx.service.start(ctx.journey, '@micanal', looked)
  await vi.waitFor(() => expect(ctx.jobsRepo.get(job.id)?.status).not.toBe('en_curso'))
  return { job: ctx.jobsRepo.get(job.id)!, reading: ctx.readings.latest(ctx.row.id) }
}

const summaryOf = (reading: { summary: unknown } | null) => reading!.summary as unknown as ReadingSummary

// 10 long videos, one a week from newest to oldest, with views chosen so the ratios are known.
const tenLong = () =>
  [1000, 6000, 1000, 200, 1000, 1000, 1000, 1000, 1000, 1000].map((views, index) => video(index, views, 40 + index * 7))

describe('lookUp (resolve)', () => {
  it('gives what the confirmation shows', async () => {
    const ctx = setup({})
    expect(await ctx.service.lookUp('@micanal')).toEqual({
      ok: true,
      channel: {
        channelId: UC,
        title: 'Mi Canal',
        handle: 'micanal',
        subscribers: 1200,
        thumbnailUrl: 'https://yt3.ggpht.com/foto=s88',
        fetchedAt: ago(1),
      },
      info,
      source: 'fake',
    })
  })

  it('an image from anywhere else is not shown', async () => {
    const ctx = setup({ channel: { ...info, thumbnailUrl: 'https://intruso.invalid/foto.png' } })
    const looked = await ctx.service.lookUp('@micanal')
    expect(looked.ok && looked.channel.thumbnailUrl).toBeNull()
  })
})

describe('the reading of a channel', () => {
  it('reads up to 200 videos with title, views, duration and date', async () => {
    const videos = Array.from({ length: 230 }, (_, i) => video(i, 1000 + i, 40 + i))
    const ctx = setup({ videos })
    const { reading } = await readAll(ctx)
    expect(ctx.listChannelVideos).toHaveBeenCalledWith(UC, { limit: CHANNEL_VIDEOS_LIMIT, withShorts: true })
    expect(reading!.videos).toHaveLength(200)
    expect(reading!.videos[0]).toMatchObject({
      id: 'video000000',
      title: 'Vídeo 0',
      views: 1000,
      durationSeconds: 600,
      publishedAt: ago(40),
      isShort: false,
    })
    expect(reading).toMatchObject({
      channelId: ctx.row.id,
      youtubeChannelId: UC,
      source: 'fake',
      title: 'Mi Canal',
      handle: 'micanal',
      description: 'Un canal de cocina.',
      subscribers: 1200,
      videoCount: 42,
    })
  })

  it('dates what it says when it was read, not when it was saved (FR-020)', async () => {
    const { reading } = await readAll(setup({ videos: tenLong() }))
    expect(reading!.fetchedAt).toBe(ago(1))
  })

  it('a date comes as the reader gives it: exact for the newest, unknown for the rest', async () => {
    const videos = [video(0, 1000, 2), video(1, 1000, 5), video(2, 1000, null), video(3, 1000, null)]
    const { reading } = await readAll(setup({ videos }))
    expect(reading!.videos.map((v) => v.publishedAt)).toEqual([ago(2), ago(5), null, null])
  })

  it('every video has its times the normal of its channel', async () => {
    const { reading } = await readAll(setup({ videos: tenLong() }))
    expect(reading!.videos[1]!.ratio).toBeCloseTo(6)
    expect(reading!.videos[3]!.ratio).toBeCloseTo(0.2)
    // The last ones have too few videos before them to know what was normal.
    expect(reading!.videos.at(-1)!.ratio).toBeNull()
  })

  it('sums up by format, with the average duration, the videos a week and the views of a typical one', async () => {
    const videos = [...tenLong(), video(20, 500, null, 40), video(21, 700, null, 60)]
    const { reading } = await readAll(setup({ videos }))
    const summary = summaryOf(reading)
    expect(summary.videosRead).toBe(12)
    expect(summary.long).toMatchObject({ count: 10, medianViews: 1000, averageDurationSeconds: 600, datedVideos: 10 })
    // Up to today, not only between the videos: it has been a while since the last one.
    expect(summary.long.videosPerWeek).toBeCloseTo(0.7)
    expect(summary.short).toMatchObject({ count: 2, medianViews: 600, averageDurationSeconds: 50, datedVideos: 0 })
    // Without dates there is no pace: no figure rather than a made-up one.
    expect(summary.short.videosPerWeek).toBeNull()
  })

  it('a video whose format is not known counts apart', async () => {
    const videos: VideoInfo[] = [...tenLong(), { ...video(30, 900, 1), durationSeconds: null, isShort: false }]
    const summary = summaryOf((await readAll(setup({ videos }))).reading)
    expect(summary.unknownFormat).toBe(1)
    expect(summary.long.count).toBe(10)
  })

  it('the best and the worst go by times the normal, not by total views (FR-020b)', async () => {
    const summary = summaryOf((await readAll(setup({ videos: tenLong() }))).reading)
    expect(summary.long.best[0]).toMatchObject({ videoId: 'video000001' })
    expect(summary.long.best[0]!.ratio).toBeCloseTo(6)
    expect(summary.long.worst[0]).toMatchObject({ videoId: 'video000003' })
    expect(summary.long.best.length).toBeLessThanOrEqual(3)
    expect(summary.long.worst.length).toBeLessThanOrEqual(3)
  })

  it('a video less than 30 days old never counts among the worst (FR-020b)', async () => {
    const videos = tenLong().map((v, i) => (i === 3 ? { ...v, publishedAt: ago(10) } : v))
    const summary = summaryOf((await readAll(setup({ videos }))).reading)
    expect(summary.long.worst.map((v) => v.videoId)).not.toContain('video000003')
  })

  it('a video is not both one of the best and one of the worst', async () => {
    const videos = [100, 200, 300, 100, 100, 100].map((views, index) => video(index, views, 40 + index))
    const summary = summaryOf((await readAll(setup({ videos }))).reading)
    const best = summary.long.best.map((v) => v.videoId)
    for (const { videoId } of summary.long.worst) expect(best).not.toContain(videoId)
  })

  it('less than 5 videos is little information (FR-022)', async () => {
    const few = setup({ videos: [video(0, 10, 40), video(1, 20, 50), video(2, 30, 60), video(3, 40, 70)] })
    const { reading } = await readAll(few)
    expect(summaryOf(reading).lowInfo).toBe(true)
    const enough = setup({ videos: tenLong().slice(0, 5) })
    const read = await readAll(enough)
    expect(summaryOf(read.reading).lowInfo).toBe(false)
  })

  it('a channel with no videos is read, and it is little information (US4 AS5)', async () => {
    const ctx = setup({ failure: 'sin_datos' })
    const { job, reading } = await readAll(ctx)
    expect(job.status).toBe('hecho')
    expect(reading!.videos).toEqual([])
    expect(summaryOf(reading)).toMatchObject({ videosRead: 0, lowInfo: true })
    expect(summaryOf(reading).long.best).toEqual([])
  })

  it('when it cannot be read, the job fails with its code and nothing is saved', async () => {
    for (const failure of ['bloqueado', 'tiempo_agotado', 'no_disponible', 'cupo_agotado'] as const) {
      const ctx = setup({ failure })
      const { job, reading } = await readAll(ctx)
      expect(job).toMatchObject({ status: 'fallido', failure })
      expect(reading).toBeNull()
    }
  })

  it('says when part of it could not be read', async () => {
    const summary = summaryOf((await readAll(setup({ videos: tenLong(), partial: true }))).reading)
    expect(summary.partial).toBe(true)
    expect(summaryOf((await readAll(setup({ videos: tenLong() }))).reading).partial).toBe(false)
  })
})

describe('the pace of a channel', () => {
  it('is over a week at least: two videos of yesterday are not 14 a week', async () => {
    const hoursAgo = (index: number, hours: number) => ({
      ...video(index, 1000, 1),
      publishedAt: new Date(NOW.getTime() - hours * 3_600_000).toISOString(),
    })
    const videos = [
      hoursAgo(0, 12),
      hoursAgo(1, 24),
      ...tenLong()
        .slice(2, 6)
        .map((v) => ({ ...v, publishedAt: null })),
    ]
    expect(summaryOf((await readAll(setup({ videos }))).reading).long.videosPerWeek).toBe(2)
  })
})

describe('reading again', () => {
  it('what came out cut short is asked for again, not taken from what was kept (entry 71)', async () => {
    const ctx = setup({ videos: tenLong(), partial: true })
    await readAll(ctx)
    expect(ctx.listChannelVideos.mock.lastCall?.[1].fresh).toBeUndefined()
    const moved = ctx.journeys.get(ctx.journey.id)!
    const looked = await ctx.service.lookUp('@micanal')
    if (!looked.ok) throw new Error(looked.failure)
    const job = ctx.service.start(moved, '@micanal', looked)
    await vi.waitFor(() => expect(ctx.jobsRepo.get(job.id)?.status).not.toBe('en_curso'))
    expect(ctx.listChannelVideos.mock.lastCall?.[1].fresh).toBe(true)
  })

  it('what came out whole may come from what was kept', async () => {
    const ctx = setup({ videos: tenLong() })
    await readAll(ctx)
    const moved = ctx.journeys.get(ctx.journey.id)!
    const looked = await ctx.service.lookUp('@micanal')
    if (!looked.ok) throw new Error(looked.failure)
    const job = ctx.service.start(moved, '@micanal', looked)
    await vi.waitFor(() => expect(ctx.jobsRepo.get(job.id)?.status).not.toBe('en_curso'))
    expect(ctx.listChannelVideos.mock.lastCall?.[1].fresh).toBeUndefined()
  })
})

describe('a channel with no title', () => {
  it('goes by its @', async () => {
    const ctx = setup({ channel: { ...info, title: '  ', handle: 'micanal' } })
    await readAll(ctx)
    expect(ctx.channels.get(ctx.row.id)).toMatchObject({
      displayName: 'micanal',
      handle: 'micanal',
      nameStatus: 'elegido',
    })
  })

  it('with no @ either, has its name left to choose', async () => {
    const ctx = setup({ channel: { ...info, title: '  ', handle: null } })
    await readAll(ctx)
    expect(ctx.channels.get(ctx.row.id)).toMatchObject({ displayName: null, nameStatus: 'provisional' })
  })
})

describe('a video with no date (FR-020b)', () => {
  const others = (from: number, count: number, days: number | null) =>
    Array.from({ length: count }, (_, i) => video(from + i, 100, days))

  it('does not count among the worst if the dates do not reach back 30 days: it could be recent', async () => {
    const videos = [...others(0, 3, 3), video(3, 1, null), ...others(4, 6, null)]
    const { reading } = await readAll(setup({ videos }))
    expect(summaryOf(reading).long.worst.map(({ videoId }) => videoId)).not.toContain('video000003')
  })

  it('with no date at all, none does', async () => {
    const videos = [video(0, 1, null), ...others(1, 8, null)]
    const { reading } = await readAll(setup({ videos }))
    expect(summaryOf(reading).long.worst).toEqual([])
  })

  it('counts if the dates reach back further: it is older than those', async () => {
    const videos = [...others(0, 3, 40), video(3, 1, null), ...others(4, 6, null)]
    const { reading } = await readAll(setup({ videos }))
    expect(summaryOf(reading).long.worst.map(({ videoId }) => videoId)).toContain('video000003')
  })
})

describe('the @ of the channel', () => {
  it('with letters of any language it is kept, as FR-022 asks (entry 84)', async () => {
    const ctx = setup({ videos: tenLong(), channel: { ...info, handle: 'cocinaespañola' } })
    const looked = await ctx.service.lookUp('@micanal')
    if (!looked.ok) throw new Error(looked.failure)
    const job = ctx.service.start(ctx.journey, '@micanal', looked)
    await vi.waitFor(() => expect(ctx.jobsRepo.get(job.id)?.status).toBe('hecho'))
    expect(ctx.channels.get(ctx.journey.channelId)).toMatchObject({ handle: 'cocinaespañola', nameStatus: 'elegido' })
  })

  it('what is not an @ of YouTube is left out, and the reading goes on', async () => {
    const ctx = setup({ videos: tenLong(), channel: { ...info, handle: 'mi canal' } })
    const looked = await ctx.service.lookUp('@micanal')
    if (!looked.ok) throw new Error(looked.failure)
    const job = ctx.service.start(ctx.journey, '@micanal', looked)
    await vi.waitFor(() => expect(ctx.jobsRepo.get(job.id)?.status).toBe('hecho'))
    expect(ctx.channels.get(ctx.journey.channelId)).toMatchObject({ handle: null, nameStatus: 'elegido' })
  })
})

describe('reading twice', () => {
  it('while it is being read, the same channel follows the same job; another one starts its own', async () => {
    const ctx = setup({ videos: tenLong() })
    let answer: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (answer = resolve))
    const original = ctx.listChannelVideos.getMockImplementation()!
    ctx.listChannelVideos.mockImplementation(async (id, options) => {
      await gate
      return original(id, options)
    })
    const looked = await ctx.service.lookUp('@micanal')
    if (!looked.ok) throw new Error(looked.failure)
    const first = ctx.service.start(ctx.journey, '@micanal', looked)
    const again = ctx.service.start(ctx.journeys.get(ctx.journey.id)!, '@micanal', looked)
    expect(again.id).toBe(first.id)
    const other = { ...looked, channel: { ...looked.channel, channelId: 'UCotrootrootrootrootroot' } }
    const third = ctx.service.start(ctx.journeys.get(ctx.journey.id)!, '@otro', other)
    expect(third.id).not.toBe(first.id)
    answer()
    await vi.waitFor(() => expect(ctx.jobsRepo.get(third.id)?.status).toBe('hecho'))
  })

  it('a reading that ends after moving to another channel does not speak for the new one', async () => {
    const ctx = setup({ videos: [video(0, 10, 40), video(1, 20, 50)] })
    let answer: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (answer = resolve))
    const original = ctx.listChannelVideos.getMockImplementation()!
    ctx.listChannelVideos.mockImplementation(async (id, options) => {
      await gate
      return original(id, options)
    })
    const looked = await ctx.service.lookUp('@micanal')
    if (!looked.ok) throw new Error(looked.failure)
    const first = ctx.service.start(ctx.journey, '@micanal', looked)
    const moved = ctx.journeys.get(ctx.journey.id)!
    ctx.journeys.update(moved.id, moved.revision, { state: { ...moved.state, resolvedChannelId: 'UCotro' } })
    answer()
    await vi.waitFor(() => expect(ctx.jobsRepo.get(first.id)?.status).toBe('hecho'))
    expect(ctx.readings.latestFor(ctx.journey.channelId, 'UCotro')).toBeNull()
  })
})

describe('what the AI reads', () => {
  it('has the videos by id with their times the normal, so its claims can cite them', async () => {
    const ctx = setup({ videos: tenLong() })
    await readAll(ctx)
    const journey = ctx.journeys.get(ctx.journey.id)!
    const input = readingInput('lectura_canal', journey, ctx.readings, ctx.proposals, {})
    const { videos, summary, channel } = input as {
      videos: { videoId: string; ratio: number | null }[]
      summary: ReadingSummary
      channel: { title: string }
    }
    expect(videos[1]).toMatchObject({ videoId: 'video000001' })
    expect(videos[1]!.ratio).toBeCloseTo(6)
    expect(summary.long.count).toBe(10)
    expect(channel.title).toBe('Mi Canal')
  })

  it('without a reading of this channel it has nothing to read', async () => {
    const ctx = setup({})
    expect(readingInput('lectura_canal', ctx.journey, ctx.readings, ctx.proposals, {})).toBeNull()
  })

  it('the positioning needs the profile approved and the answers given (entries 62 and 72)', async () => {
    const ctx = setup({ videos: tenLong() })
    await readAll(ctx)
    const input = (journey = ctx.journeys.get(ctx.journey.id)!) =>
      readingInput('posicionamiento', journey, ctx.readings, ctx.proposals, {})
    expect(input()).toBeNull()
    const current = ctx.proposals.create({
      journeyId: ctx.journey.id,
      kind: 'perfil_actual',
      payload: {},
      promptId: 'lectura_canal',
      promptVersion: 1,
      instructions: null,
      claimsTrimmed: false,
      usageId: null,
    })
    const moved = ctx.journeys.get(ctx.journey.id)!
    const answered = { ...moved, state: { ...(moved.state as object), hoursPerWeek: 8, onCamera: 'voz' } }
    expect(input(answered)).toBeNull()
    ctx.proposals.approve(current.id)
    expect(input(moved)).toBeNull()
    expect(input(answered)).not.toBeNull()
  })
})

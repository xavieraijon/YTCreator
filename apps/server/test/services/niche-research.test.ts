import { type ChannelInfo, type VideoHit, youtubeFailure, type YouTubeData } from '@ytcreator/core'
import { loadMarket } from '@ytcreator/knowledge'
import { createFakeYouTube } from '@ytcreator/youtube'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrate, MIGRATIONS } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'
import { createChannelsRepo } from '../../src/db/repos/channels.ts'
import { createJobsRepo } from '../../src/db/repos/jobs.ts'
import { createJourneysRepo } from '../../src/db/repos/journeys.ts'
import { createMeasuresRepo, type MeasuresRepo } from '../../src/db/repos/measures.ts'
import { createNicheResearch } from '../../src/services/niche-research.ts'
import { createJobsService } from '../../src/services/jobs.ts'
import type { DatabaseSync } from 'node:sqlite'

const market = loadMarket()
const now = () => new Date('2026-11-01T00:00:00Z')
const logger = { info() {}, warn() {}, error() {} } as never

describe('niche research', () => {
  let db: DatabaseSync
  let measures: MeasuresRepo
  let journeyId: string
  let jobsRepo: ReturnType<typeof createJobsRepo>

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
    const channel = createChannelsRepo(db, now).create({ origin: 'nuevo' })
    journeyId = createJourneysRepo(db, now).create({ channelId: channel.id, kind: 'nuevo', step: 'nichos' }).id
    measures = createMeasuresRepo(db, now)
    jobsRepo = createJobsRepo(db, now)
  })
  afterEach(() => db.close())

  function research(youtube: YouTubeData = createFakeYouTube({ now })) {
    const events: { type: string; item?: unknown }[] = []
    const jobs = createJobsService({ jobs: jobsRepo, logger })
    const service = createNicheResearch({
      youtube: { ...youtube, effectiveSource: () => 'fake' as const },
      measures,
      jobs,
      thresholds: market.thresholds.data,
      thresholdsVersion: market.thresholds.version,
      logger,
      now,
    })
    const run = async (niches: { label: string; queries: string[] }[], options?: { force?: boolean }) => {
      const job = service.start(journeyId, niches, options)
      const ended = new Promise<void>((resolve) => {
        jobs.subscribe(job.id, (event) => {
          events.push(event)
          if (event.type === 'done' || event.type === 'failed') resolve()
        })
      })
      await ended
      return job
    }
    return { service, run, events }
  }

  it('measures each niche with its searches and leaves the figures with the version of the thresholds', async () => {
    const { run, events } = research()
    await run([
      { label: 'Uno', queries: ['recetas rapidas'] },
      { label: 'Dos', queries: ['recetas baratas', 'menu barato'] },
    ])
    const [one, two] = measures.listByJourney(journeyId)
    expect(one).toMatchObject({ nicheLabel: 'Uno', status: 'medida', thresholdsVersion: market.thresholds.version })
    expect(one!.demandMedianViews).toBeGreaterThan(0)
    expect(one!.sampleSize).toBeGreaterThanOrEqual(10)
    expect(one!.shortsInSample).toBeGreaterThan(0)
    expect(one!.verdict).not.toBeNull()
    expect(two!.queries).toEqual(['recetas baratas', 'menu barato'])
    expect(events.filter((e) => e.type === 'item')).toHaveLength(2)
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('one failure does not stop the rest, and shows no figures', async () => {
    const { run, events } = research()
    await run([
      { label: 'Bien', queries: ['recetas'] },
      { label: 'Vacío', queries: ['sin datos'] },
      { label: 'Bloqueado', queries: ['bloqueado'] },
    ])
    const byLabel = Object.fromEntries(measures.listByJourney(journeyId).map((m) => [m.nicheLabel, m]))
    expect(byLabel['Bien']!.status).toBe('medida')
    expect(byLabel['Vacío']).toMatchObject({
      status: 'fallida',
      failure: 'sin_datos',
      demandMedianViews: null,
      verdict: null,
    })
    expect(byLabel['Bloqueado']).toMatchObject({ status: 'fallida', failure: 'bloqueado', shortsInSample: null })
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('what was measured survives a cut, and resuming only measures what is pending', async () => {
    const fake = createFakeYouTube({ now })
    let searches = 0
    const counting: YouTubeData = {
      ...fake,
      search: (query, options) => ((searches += 1), fake.search(query, options)),
    }
    const { run } = research(counting)
    const niches = [
      { label: 'Hecho', queries: ['recetas'] },
      { label: 'Cortado', queries: ['tupper'] },
      { label: 'Falló', queries: ['bloqueado'] },
    ]
    await run(niches.slice(0, 1))
    const done = measures.listByJourney(journeyId)[0]!
    // The server stopped halfway through this one.
    measures.start({ journeyId, nicheLabel: 'Cortado', queries: ['tupper'], source: 'fake', thresholdsVersion: 1 })
    await run([niches[2]!])
    searches = 0

    await run(niches)

    const all = measures.listByJourney(journeyId)
    expect(all).toHaveLength(3)
    expect(all.find((m) => m.nicheLabel === 'Hecho')!.measuredAt).toBe(done.measuredAt)
    expect(all.find((m) => m.nicheLabel === 'Cortado')!.status).toBe('medida')
    expect(searches).toBe(2)
  })

  it('«Volver a medir» measures again what was measured', async () => {
    const fake = createFakeYouTube({ now })
    let searches = 0
    const counting: YouTubeData = {
      ...fake,
      search: (query, options) => ((searches += 1), fake.search(query, options)),
    }
    const { run } = research(counting)
    const niches = [{ label: 'Uno', queries: ['recetas'] }]
    await run(niches)
    await run(niches, { force: true })
    expect(searches).toBe(2)
    expect(measures.listByJourney(journeyId)).toHaveLength(1)
  })

  it('a reader that stops while reading channels fails the measure instead of closing the entry door', async () => {
    const fake = createFakeYouTube({ now })
    const { run } = research({ ...fake, getChannel: async () => youtubeFailure('bloqueado') })
    await run([{ label: 'Uno', queries: ['recetas'] }])
    expect(measures.listByJourney(journeyId)[0]).toMatchObject({
      status: 'fallida',
      failure: 'bloqueado',
      verdict: null,
    })
  })

  describe('references (FR-012)', () => {
    async function measured(youtube?: YouTubeData) {
      const r = research(youtube)
      await r.run([{ label: 'Uno', queries: ['recetas'] }])
      return { ...r, measure: measures.listByJourney(journeyId)[0]! }
    }

    it('proposes 2–4 real channels with what is normal in each, and keeps them', async () => {
      const { service, measure } = await measured()
      const first = await service.references(measure)
      if (!first.ok) throw new Error('should work')
      expect(first.references.length).toBeGreaterThanOrEqual(2)
      expect(first.references.length).toBeLessThanOrEqual(4)
      expect(first.references[0]!.medianViews).toBeGreaterThan(0)
      expect(first.references[0]!.bestRatio).toBeGreaterThan(0)
      expect(first.references[0]!.bestVideoTitle).toBeTruthy()
      const again = await service.references(measure)
      expect(again).toEqual(first)
    })

    it('a channel whose videos cannot be read stays as a reference, without that comparison', async () => {
      const fake = createFakeYouTube({ now })
      const { service, measure } = await measured({
        ...fake,
        listChannelVideos: async () => youtubeFailure('bloqueado'),
      })
      const result = await service.references(measure)
      if (!result.ok) throw new Error('should work')
      expect(result.references.length).toBeGreaterThanOrEqual(2)
      expect(result.references[0]).toMatchObject({ medianViews: null, bestRatio: null, bestVideoId: null })
    })

    it('the first read fails if the search does', async () => {
      const fake = createFakeYouTube({ now })
      let block = false
      const youtube: YouTubeData = {
        ...fake,
        search: (query, options) =>
          block ? Promise.resolve(youtubeFailure('bloqueado')) : fake.search(query, options),
      }
      const { service, measure } = await measured(youtube)
      block = true
      expect(await service.references(measure)).toEqual({ ok: false, failure: 'bloqueado' })
    })

    it('removes down to 2 and no further; adds up to 4 and no further', async () => {
      const channel = (id: string): ChannelInfo => ({
        channelId: `UC${id}`,
        title: id,
        handle: id,
        description: '',
        subscribers: 1,
        videoCount: 1,
        country: null,
      })
      const fake = createFakeYouTube({ now })
      const hit = (i: number): VideoHit => ({
        videoId: `v${i}`,
        title: 't',
        channelId: `UCc${i % 5}`,
        channelTitle: 'c',
        views: 500,
        publishedAt: null,
        durationSeconds: 600,
      })
      const { service, measure } = await measured({
        ...fake,
        search: async () => ({
          ok: true,
          value: { data: Array.from({ length: 12 }, (_, i) => hit(i)), source: 'fake', fetchedAt: '' },
        }),
        getChannel: async ({ channelId }) => ({
          ok: true,
          value: { data: channel(channelId.slice(2)), source: 'fake', fetchedAt: '' },
        }),
        listChannelVideos: async () => ({ ok: true, value: { data: [], source: 'fake', fetchedAt: '' } }),
        resolve: async (input) => ({
          ok: true,
          value: { data: { channelId: `UC${input}` }, source: 'fake', fetchedAt: '' },
        }),
      })
      const proposed = await service.references(measure)
      if (!proposed.ok) throw new Error('should work')
      expect(proposed.references).toHaveLength(4)
      expect(await service.references(measure, { add: 'otro' })).toEqual({ ok: false, invalid: true })

      const three = await service.references(measure, { remove: proposed.references[0]!.youtubeChannelId })
      if (!three.ok) throw new Error('should work')
      expect(three.references).toHaveLength(3)

      const added = await service.references(measure, { add: 'otro' })
      if (!added.ok) throw new Error('should work')
      expect(added.references.at(-1)).toMatchObject({ youtubeChannelId: 'UCotro', reason: 'anadido_por_ti' })
      expect(await service.references(measure, { add: 'otro' })).toEqual({ ok: false, invalid: true })

      await service.references(measure, { remove: added.references[0]!.youtubeChannelId })
      const two = await service.references(measure, { remove: added.references[1]!.youtubeChannelId })
      if (!two.ok) throw new Error('should work')
      expect(two.references).toHaveLength(2)
      expect(await service.references(measure, { remove: two.references[0]!.youtubeChannelId })).toEqual({
        ok: false,
        invalid: true,
      })
    })
  })
})

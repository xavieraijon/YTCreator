import {
  type Sourced,
  type VideoHit,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeResult,
  youtubeFailure,
} from '@ytcreator/core'
import { loadMarket } from '@ytcreator/knowledge'
import { describe, expect, it, vi } from 'vitest'
import { createIdeaMeasure } from '../../src/services/idea-measure.ts'
import { finished } from '../http/flows.ts'
import { makeTestApp } from '../helpers.ts'

const market = loadMarket()
const now = new Date('2026-11-07T10:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
const hit = (title: string, views: number, publishedAt: string | null = daysAgo(200)): VideoHit => ({
  videoId: `${title}-${views}`,
  title,
  channelId: 'UC1',
  channelTitle: 'Canal',
  views,
  publishedAt,
  durationSeconds: 600,
})

type Answer = VideoHit[] | YouTubeFailureCode
type Call = { query: string; withoutDates?: true; fresh?: true; limit: number }

// A YouTube that answers each search with what the test says, and writes down how it was asked.
function scripted(answers: Record<string, Answer>) {
  const calls: Call[] = []
  const youtube = {
    source: 'fake' as const,
    effectiveSource: () => 'fake' as const,
    async search(query: string, options: Omit<Call, 'query'>): Promise<YouTubeResult<Sourced<VideoHit[]>>> {
      calls.push({ query, ...options })
      const answer = answers[query] ?? []
      if (typeof answer === 'string') return youtubeFailure(answer)
      if (answer.length === 0) return youtubeFailure('sin_datos')
      return { ok: true, value: { data: answer, source: 'fake', fetchedAt: now.toISOString() } }
    },
  } as unknown as YouTubeData & { effectiveSource(): 'fake' }
  return { youtube, calls }
}

async function setUp(answers: Record<string, Answer>) {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { channelId } = await finished(t)
  const { youtube, calls } = scripted(answers)
  const service = createIdeaMeasure({
    youtube,
    ideas: t.ideas.ideas,
    measures: t.ideas.measures,
    jobs: t.jobs,
    thresholds: market.thresholds.data.ideas,
    thresholdsVersion: market.thresholds.version,
    logger: t.logger,
    now: () => now,
  })
  const idea = (title: string, queries: { query?: string; broadQuery?: string; queryEn?: string } = {}) =>
    t.ideas.ideas.create({ channelId, origin: 'creador', title, format: 'largo', profileVersion: 1, ...queries })
  const run = async (ids: string[], fresh = false) => {
    const job = service.start(channelId, ids, { fresh })
    await vi.waitFor(() => expect(t.jobs.get(job.id)?.status).toBe('hecho'))
    return t.jobs.get(job.id)!
  }
  return { t, channelId, service, calls, idea, run }
}

const burnt = Array.from({ length: 12 }, (_, i) =>
  hit(`Pan de masa madre ${i}`, 20_000, i < 4 ? daysAgo(10) : daysAgo(200)),
)
const audience = [hit('Pan', 300_000), hit('Pan 2', 150_000)]

describe('measuring ideas (contracts/idea-measure.md)', () => {
  it('makes its three searches at once: Spanish with dates, the general topic and English without', async () => {
    const { calls, idea, run, t } = await setUp({ 'pan masa madre': burnt, pan: audience, 'sourdough bread': audience })
    const one = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan', queryEn: 'sourdough bread' })
    await run([one.id])
    expect(calls).toEqual([
      { query: 'pan masa madre', limit: 40 },
      { query: 'pan', limit: 20, withoutDates: true },
      { query: 'sourdough bread', limit: 40, withoutDates: true },
    ])
    const measure = t.ideas.measures.latest(one.id)!
    expect(measure).toMatchObject({
      status: 'medida',
      verdict: 'quemado',
      reason: 'racha_reciente',
      ideaRevision: 1,
      queries: { query: 'pan masa madre', broadQuery: 'pan', queryEn: 'sourdough bread' },
      source: 'fake',
      thresholdsVersion: market.thresholds.version,
      partial: false,
    })
    expect(measure.figures).toMatchObject({ similar: 12, recent: 4, hasAudience: true })
    expect(measure.opportunity).toMatchObject({ english: false, englishBigVideos: 2 })
  })

  it('two searches without queryEn, and the opportunity says nothing', async () => {
    const { calls, idea, run, t } = await setUp({ 'pan masa madre': [hit('Pan de masa madre', 500)] })
    const one = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan' })
    await run([one.id])
    expect(calls).toHaveLength(2)
    expect(t.ideas.measures.latest(one.id)!.opportunity).toBeNull()
  })

  it('with nothing in Spanish, similar is 0 and the semaphore is still worked out', async () => {
    const { idea, run, t } = await setUp({ 'pan masa madre': [], pan: audience })
    const one = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan' })
    await run([one.id])
    expect(t.ideas.measures.latest(one.id)).toMatchObject({
      status: 'medida',
      verdict: 'hueco',
      reason: 'pocos_con_publico',
    })
    expect(t.ideas.measures.latest(one.id)!.figures).toMatchObject({ similar: 0 })
  })

  it.each(['bloqueado', 'no_disponible', 'cupo_agotado', 'tiempo_agotado', 'no_encontrado'] as const)(
    '%s in Spanish or in the general topic: a failed measure with that failure',
    async (code) => {
      const { idea, run, t } = await setUp({ 'pan masa madre': code, 'otro tema': [hit('x', 1)], pan2: code })
      const spanish = idea('Pan', { query: 'pan masa madre', broadQuery: 'otro tema' })
      const broad = idea('Pan 2', { query: 'otro tema', broadQuery: 'pan2' })
      await run([spanish.id, broad.id])
      for (const one of [spanish, broad]) {
        expect(t.ideas.measures.latest(one.id)).toMatchObject({ status: 'fallida', failure: code, verdict: null })
      }
    },
  )

  it('a failure in English only takes the opportunity away', async () => {
    const { idea, run, t } = await setUp({ 'pan masa madre': burnt, 'sourdough bread': 'bloqueado' })
    const one = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan', queryEn: 'sourdough bread' })
    await run([one.id])
    expect(t.ideas.measures.latest(one.id)).toMatchObject({
      status: 'medida',
      opportunity: { failure: 'bloqueado' },
    })
  })

  it('nothing in English is looked at and empty, not a failure', async () => {
    const { idea, run, t } = await setUp({ 'pan masa madre': burnt })
    const one = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan', queryEn: 'sourdough bread' })
    await run([one.id])
    expect(t.ideas.measures.latest(one.id)).toMatchObject({
      status: 'medida',
      opportunity: { english: false, englishBigVideos: 0, topVideos: [] },
    })
  })

  it('an idea without its search is left out and counted', async () => {
    const { idea, run, t } = await setUp({ 'pan masa madre': burnt })
    const measured = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan' })
    const without = idea('Sin búsqueda')
    // Without the general search the audience would be guessed: it is left out too (entry 37).
    const noBroad = idea('Sin tema general', { query: 'pan masa madre' })
    const job = await run([measured.id, without.id, noBroad.id])
    expect(job.progress).toEqual({ done: 1, total: 1, ideaIds: [measured.id], skipped: 2 })
    expect(t.ideas.measures.latest(without.id)).toBeNull()
    expect(t.ideas.measures.latest(noBroad.id)).toBeNull()
  })

  it('the same idea twice is measured once', async () => {
    const { calls, idea, run } = await setUp({ 'pan masa madre': burnt })
    const one = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan' })
    const job = await run([one.id, one.id])
    expect(job.progress).toMatchObject({ total: 1, skipped: 0 })
    expect(calls.filter((call) => call.query === 'pan masa madre')).toHaveLength(1)
  })

  it('«fresh» asks YouTube again, past the cache', async () => {
    const { calls, idea, run } = await setUp({ 'pan masa madre': burnt })
    const one = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan' })
    await run([one.id], true)
    expect(calls[0]).toMatchObject({ fresh: true })
  })

  it('partial when most of the sample has no date', async () => {
    const undated = Array.from({ length: 3 }, (_, i) => hit(`Pan de masa madre ${i}`, 500, null))
    const { idea, run, t } = await setUp({ 'pan masa madre': undated })
    const one = idea('Pan', { query: 'pan masa madre', broadQuery: 'pan' })
    await run([one.id])
    expect(t.ideas.measures.latest(one.id)!.partial).toBe(true)
  })
})

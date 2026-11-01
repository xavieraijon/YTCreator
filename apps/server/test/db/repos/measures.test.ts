import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMeasuresRepo, type MeasuresRepo } from '../../../src/db/repos/measures.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

const figures = {
  demandMedianViews: 12000,
  demandLevel: 'media',
  entryChannels: 4,
  entryLevel: 'entreabierta',
  concentration: 0.42,
  concentrationLevel: 'media',
  recentVideos: 9,
  recentShare: 0.3,
  sampleSize: 40,
  verdict: 'con_reservas',
} as const

describe('measures repo', () => {
  let db: DatabaseSync
  let measures: MeasuresRepo
  let journeyId: string
  const clock = manualClock()

  beforeEach(() => {
    db = freshDb()
    journeyId = seedJourney(db).journeyId
    measures = createMeasuresRepo(db, clock.now)
  })

  const start = () =>
    measures.start({
      journeyId,
      nicheLabel: 'Cocina de aprovechamiento',
      queries: ['recetas con sobras', 'cocina sin desperdicio'],
      source: 'fake',
      thresholdsVersion: 1,
    })

  it('starts a measure in progress with no figures', () => {
    const measure = start()
    expect(measure).toMatchObject({
      status: 'en_curso',
      queries: ['recetas con sobras', 'cocina sin desperdicio'],
      demandMedianViews: null,
      verdict: null,
      measuredAt: null,
    })
  })

  it('completes a measure with its figures and the date it was measured', () => {
    const done = measures.complete(start().id, figures)
    expect(done).toMatchObject({ status: 'medida', ...figures, measuredAt: clock.now().toISOString() })
  })

  it('a failed measure keeps the failure and no figures', () => {
    const failed = measures.fail(start().id, 'bloqueado')
    expect(failed).toMatchObject({ status: 'fallida', failure: 'bloqueado', demandMedianViews: null, verdict: null })
  })

  it('lists the measures of a journey and keeps 2–4 reference channels per measure', () => {
    const measure = start()
    measures.setReferences(measure.id, [
      { youtubeChannelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', title: 'A', handle: 'a', subscribers: null, topVideoViews: 5000, reason: 'r' },
      { youtubeChannelId: 'UCbbbbbbbbbbbbbbbbbbbbbb', title: 'B', handle: null, subscribers: 900, topVideoViews: 8000, reason: 'r' },
    ])
    expect(measures.listByJourney(journeyId).map((m) => m.id)).toEqual([measure.id])
    const references = measures.listReferences(measure.id)
    expect(references.map((r) => r.title)).toEqual(['A', 'B'])
    expect(references[0]).toMatchObject({ subscribers: null, fetchedAt: clock.now().toISOString() })
  })

  it('replacing references drops the old ones', () => {
    const measure = start()
    const ref = { youtubeChannelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', title: 'A', handle: null, subscribers: 1, topVideoViews: 1, reason: 'r' }
    measures.setReferences(measure.id, [ref])
    measures.setReferences(measure.id, [{ ...ref, title: 'A2' }])
    expect(measures.listReferences(measure.id).map((r) => r.title)).toEqual(['A2'])
  })
})

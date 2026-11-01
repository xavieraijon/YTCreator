import { beforeEach, describe, expect, it } from 'vitest'
import { createUsageRepo, type UsageRepo } from '../../../src/db/repos/usage.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

describe('usage repo', () => {
  let usage: UsageRepo
  let journeyId: string
  const clock = manualClock('2026-11-15T12:00:00.000Z')

  beforeEach(() => {
    clock.set('2026-11-15T12:00:00.000Z')
    const db = freshDb()
    journeyId = seedJourney(db).journeyId
    usage = createUsageRepo(db, clock.now)
  })

  const record = (costCents: number) =>
    usage.record({
      journeyId,
      use: 'nichos',
      providerId: 'fake',
      model: 'sonnet',
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCents: 3,
      costCents,
      pricingVersion: 1,
      outcome: 'ok',
    })

  it('records a call and lists it newest first', () => {
    const first = record(2)
    clock.advance(1000)
    const second = record(0)
    expect(usage.list().map((u) => u.id)).toEqual([second.id, first.id])
    expect(first).toMatchObject({ use: 'nichos', costCents: 2, outcome: 'ok', createdAt: '2026-11-15T12:00:00.000Z' })
  })

  it('sums the cost of today and of the current month', () => {
    clock.set('2026-10-20T12:00:00.000Z')
    record(50)
    clock.set('2026-11-02T12:00:00.000Z')
    record(7)
    clock.set('2026-11-15T12:00:00.000Z')
    record(3)
    record(4)
    expect(usage.totals(clock.now())).toEqual({ dayCents: 7, monthCents: 14 })
  })
})

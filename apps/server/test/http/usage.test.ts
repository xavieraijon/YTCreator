import { usageListSchema } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import type { NewUsage } from '../../src/db/repos/usage.ts'
import { makeTestApp } from '../helpers.ts'

const call = (usage: NewUsage['use'], costCents: number): NewUsage => ({
  use: usage,
  providerId: 'anthropic',
  model: 'claude-haiku-5-5',
  inputTokens: 1000,
  outputTokens: 500,
  estimatedCents: costCents,
  costCents,
  pricingVersion: 1,
  outcome: 'ok',
})

// Local days, as the creator reads them.
const at = (day: number, month = 10, hour = 12) => new Date(2026, month, day, hour)

function withCalls() {
  let clock = at(5)
  const t = makeTestApp({ now: () => clock })
  const record = (when: Date, usage: NewUsage) => {
    clock = when
    t.usage.record(usage)
  }
  record(at(28, 9), call('nichos', 9)) // October
  record(at(1), call('conceptos', 4))
  record(at(4), call('nombres', 2))
  record(at(5, 10, 9), call('nichos', 3))
  record(at(5, 10, 11), call('conceptos', 0))
  clock = at(5)
  return t
}

const list = async (t: ReturnType<typeof makeTestApp>, query = '') => {
  const response = await t.request('GET', `/api/usage${query}`)
  return { status: response.status, body: (await response.json()) as unknown }
}

describe('GET /api/usage', () => {
  it('without dates: the calls of this month, newest first, and the totals of today and the month', async () => {
    const t = withCalls()
    const { status, body } = await list(t)
    expect(status).toBe(200)
    const usage = usageListSchema.parse(body)
    expect(usage.items.map((item) => [item.use, item.costCents])).toEqual([
      ['conceptos', 0],
      ['nichos', 3],
      ['nombres', 2],
      ['conceptos', 4],
    ])
    expect(usage.todayCents).toBe(3)
    expect(usage.monthCents).toBe(9)
  })

  it('from and to choose the days, both included; the totals stay those of today and the month', async () => {
    const t = withCalls()
    const usage = usageListSchema.parse((await list(t, '?from=2026-10-28&to=2026-11-01')).body)
    expect(usage.items.map((item) => item.use)).toEqual(['conceptos', 'nichos'])
    expect(usage.todayCents).toBe(3)
    expect(usage.monthCents).toBe(9)
  })

  it('a date that is not a date, or from after to → 400', async () => {
    const t = withCalls()
    expect((await list(t, '?from=ayer')).status).toBe(400)
    expect((await list(t, '?from=2026-11-05&to=2026-11-01')).status).toBe(400)
  })
})

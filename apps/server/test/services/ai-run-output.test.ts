import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from '../http/flows.ts'

// The use `ideas` has a cap of 3.000 tokens: 2,25 cents at the fake price, more with the prompt.
const setUp = async () => {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { journeyId } = await finished(t)
  return { t, journeyId, aiRun: t.ideas.aiRun }
}

describe('estimate with the expected output (R11)', () => {
  it('shows what is expected, and keeps the cap in the most it can cost', async () => {
    const { aiRun, journeyId } = await setUp()
    const capped = aiRun.estimate({ journeyId, use: 'ideas', input: {} })
    const expected = aiRun.estimate({ journeyId, use: 'ideas', input: {}, outputTokens: 300 })
    expect(expected.cents).toBeLessThan(capped.cents)
    expect(expected.maxCents).toBe(capped.maxCents)
  })

  it('never shows more than the cap', async () => {
    const { aiRun, journeyId } = await setUp()
    const capped = aiRun.estimate({ journeyId, use: 'ideas', input: {} })
    expect(aiRun.estimate({ journeyId, use: 'ideas', input: {}, outputTokens: 900_000 }).cents).toBe(capped.cents)
  })

  it('is blocked by the cap even when what is expected fits', async () => {
    const { t, aiRun, journeyId } = await setUp()
    const capped = aiRun.estimate({ journeyId, use: 'ideas', input: {} })
    const perOperationCents = capped.cents * 2 - 1
    await call(t, 'PUT', '/api/settings/limits', { perOperationCents, dailyCents: 1000, monthlyCents: 5000 })
    const expected = aiRun.estimate({ journeyId, use: 'ideas', input: {}, outputTokens: 10 })
    expect(expected.cents * 2).toBeLessThanOrEqual(perOperationCents)
    expect(expected.blockedBy).toBe('por_operacion')
  })

  it('a run whose most does not fit does not start, even if what is expected fits', async () => {
    const { t, aiRun, journeyId } = await setUp()
    const capped = aiRun.estimate({ journeyId, use: 'ideas', input: {} })
    const { estimateId } = aiRun.estimate({ journeyId, use: 'ideas', input: {}, outputTokens: 10 })
    await call(t, 'PUT', '/api/settings/limits', {
      perOperationCents: capped.cents * 2 - 1,
      dailyCents: 1000,
      monthlyCents: 5000,
    })
    const result = await aiRun.run({ estimateId, use: 'ideas', input: {} })
    expect(result).toEqual({ ok: false, failure: 'limite_de_gasto' })
  })
})

import { describe, expect, it } from 'vitest'
import { usageListSchema, usageQuerySchema } from '../../src/api/index.ts'

describe('usage schemas', () => {
  it('GET /api/usage', () => {
    const list = {
      items: [
        {
          id: 'u1',
          journeyId: null,
          use: 'nichos',
          providerId: 'anthropic',
          model: 'claude-sonnet-5-5',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCents: 4,
          costCents: 3,
          pricingVersion: 1,
          outcome: 'ok',
          createdAt: '2026-11-01T10:00:00.000Z',
        },
      ],
      todayCents: 3,
      monthCents: 3,
    }
    expect(usageListSchema.parse(list)).toEqual(list)
    expect(usageListSchema.safeParse({ ...list, todayCents: 1.5 }).success).toBe(false)
  })

  it('from and to are optional dates', () => {
    expect(usageQuerySchema.safeParse({}).success).toBe(true)
    expect(usageQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-30' }).success).toBe(true)
    expect(usageQuerySchema.safeParse({ from: 'ayer' }).success).toBe(false)
  })
})

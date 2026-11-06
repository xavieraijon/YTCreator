import { describe, expect, it } from 'vitest'
import { checkBudget } from '../../src/index.ts'

const limits = { perOperationCents: 50, dailyCents: 300, monthlyCents: 2_000 }

describe('budget', () => {
  it('lets a call through when it fits every limit', () => {
    expect(checkBudget({ cents: 50, limits, spentTodayCents: 250, spentThisMonthCents: 1_950 })).toBeNull()
  })

  it('blocks by operation, day and month, in that order', () => {
    expect(checkBudget({ cents: 51, limits, spentTodayCents: 0, spentThisMonthCents: 0 })).toBe('por_operacion')
    expect(checkBudget({ cents: 10, limits, spentTodayCents: 291, spentThisMonthCents: 0 })).toBe('diario')
    expect(checkBudget({ cents: 10, limits, spentTodayCents: 0, spentThisMonthCents: 1_991 })).toBe('mensual')
  })

  it('an included call never blocks', () => {
    expect(checkBudget({ cents: 0, limits, spentTodayCents: 300, spentThisMonthCents: 2_000 })).toBeNull()
  })
})

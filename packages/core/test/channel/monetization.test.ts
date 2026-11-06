import { describe, expect, it } from 'vitest'
import { estimateMonetization, monthlyEurRange, type MonetizationInput } from '../../src/index.ts'

const knowledge = {
  categories: {
    general: { espana: { min: 1, max: 4 }, latam: { min: 0.5, max: 1 }, mixto: { min: 0.8, max: 3 } },
    educacion: { espana: { min: 2, max: 5 }, latam: { min: 0.5, max: 2 }, mixto: { min: 1, max: 3 } },
    infantil: { espana: { min: 0.1, max: 0.5 }, latam: { min: 0.1, max: 0.2 }, mixto: { min: 0.1, max: 0.3 } },
  },
  weeksPerMonth: 4,
  viewsShareOfMedian: { min: 0.1, max: 0.5 },
  ypp: { subscribers: 1000, watchHours: 4000, shortsViews: 10_000_000 },
}
const input: MonetizationInput = {
  category: 'educacion',
  region: 'espana',
  madeForKids: false,
  longPerWeek: 1,
  medianViews: 10_000,
}

describe('a channel that already exists (P21)', () => {
  it('counts its own typical video in full: views × videos × earnings, with no share of a niche', () => {
    const own = estimateMonetization({ ...input, medianViews: 1000, ownChannel: true }, knowledge)
    const views = Math.round((input.longPerWeek * knowledge.weeksPerMonth * 1000) / 100) * 100
    expect(own.monthlyViewsAssumption).toEqual({ min: views, max: views })
    expect(own.monthlyEurRange).toEqual(monthlyEurRange({ min: views, max: views }, own.rpmEurRange))
    expect(own.monthlyEurRange!.min).toBeLessThan(own.monthlyEurRange!.max)
  })

  it('with no long videos, or too few visits to count, there is no figure', () => {
    for (const change of [{ medianViews: null }, { longPerWeek: 0 }, { medianViews: 1, longPerWeek: 1 }]) {
      const own = estimateMonetization({ ...input, medianViews: 1000, ownChannel: true, ...change }, knowledge)
      expect(own.monthlyEurRange).toBeNull()
    }
  })
})

describe('monetization (FR-014)', () => {
  it('is views × earnings per 1.000 / 1.000, always a range', () => {
    expect(monthlyEurRange({ min: 4000, max: 20_000 }, { min: 2, max: 5 })).toEqual({ min: 8, max: 100 })
    const estimate = estimateMonetization(input, knowledge)
    expect(estimate.rpmEurRange).toEqual({ min: 2, max: 5 })
    expect(estimate.monthlyViewsAssumption).toEqual({ min: 4000, max: 20_000 })
    expect(estimate.monthlyEurRange).toEqual({ min: 8, max: 100 })
    expect(estimate.yppRequirements).toEqual(knowledge.ypp)
  })

  it('depends on the region of the audience', () => {
    expect(estimateMonetization({ ...input, region: 'latam' }, knowledge).rpmEurRange).toEqual({ min: 0.5, max: 2 })
  })

  it('made for children lowers the range', () => {
    const kids = estimateMonetization({ ...input, madeForKids: true }, knowledge)
    expect(kids.rpmEurRange).toEqual(knowledge.categories.infantil.espana)
    expect(kids.monthlyEurRange!.max).toBeLessThan(estimateMonetization(input, knowledge).monthlyEurRange!.max)
  })

  it('without data there is no figure', () => {
    for (const change of [{ medianViews: null }, { medianViews: 0 }, { longPerWeek: 0 }]) {
      const estimate = estimateMonetization({ ...input, ...change }, knowledge)
      expect(estimate.monthlyEurRange).toBeNull()
      expect(estimate.monthlyViewsAssumption).toBeNull()
    }
  })

  it('a category the package lacks falls back to the general one', () => {
    expect(estimateMonetization({ ...input, category: 'videojuegos' }, knowledge).rpmEurRange).toEqual({
      min: 1,
      max: 4,
    })
  })
})

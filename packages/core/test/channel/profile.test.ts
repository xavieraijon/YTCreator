import { describe, expect, it } from 'vitest'
import { channelProfileSchema, monthlyEurRange } from '../../src/channel/profile.ts'

const pillar = { title: 'Cenas', description: 'Platos rápidos.' }
const profile = {
  schemaVersion: 1,
  niche: { label: 'Cocina fácil', summary: 'Recetas de diario.', measureId: null },
  concept: {
    promise: 'Recetas de diario para gente con poco tiempo.',
    pillars: [pillar, pillar, pillar],
    audience: { description: 'Gente joven.', region: 'espana', madeForKids: false },
    format: { presence: 'voz', longForm: 'Vídeos de diez minutos.', shortsRole: 'Un truco por short.' },
    cadence: { longPerWeek: 1, shortsPerWeek: 3, hoursPerWeek: 6 },
    monetization: {
      rpmEurRange: { min: 1, max: 3 },
      monthlyViewsAssumption: { min: 10_000, max: 50_000 },
      monthlyEurRange: { min: 10, max: 150 },
      yppRequirements: { subscribers: 1000, watchHours: 4000, shortsViews: 10_000_000 },
      assumptions: ['Público de España.'],
      sourceIds: ['rpm'],
    },
    warnings: [],
  },
  name: { displayName: 'Cocina Clara', handle: 'cocinaclara', status: 'elegido', checkId: null },
  context: null,
  sources: [{ id: 'rpm', kind: 'conocimiento', label: 'Ganancias por nicho', url: null, date: '2026-11-01' }],
}

const withConcept = (patch: object) => ({ ...profile, concept: { ...profile.concept, ...patch } })

describe('channelProfileSchema', () => {
  it('accepts a whole profile', () => {
    expect(channelProfileSchema.safeParse(profile).success).toBe(true)
  })

  it('promise: at most 160 characters', () => {
    expect(channelProfileSchema.safeParse(withConcept({ promise: 'a'.repeat(160) })).success).toBe(true)
    expect(channelProfileSchema.safeParse(withConcept({ promise: 'a'.repeat(161) })).success).toBe(false)
  })

  it('pillars: 3 or 4', () => {
    const count = (n: number) => channelProfileSchema.safeParse(withConcept({ pillars: Array(n).fill(pillar) })).success
    expect([2, 3, 4, 5].map(count)).toEqual([false, true, true, false])
  })

  it('displayName: 1 to 100 characters, or none while the name is provisional', () => {
    const named = (displayName: string | null) =>
      channelProfileSchema.safeParse({ ...profile, name: { ...profile.name, displayName } }).success
    expect(named('')).toBe(false)
    expect(named('a')).toBe(true)
    expect(named('a'.repeat(100))).toBe(true)
    expect(named('a'.repeat(101))).toBe(false)
    expect(named(null)).toBe(true)
  })

  it('monetization: the monthly range has to be views × rate / 1.000', () => {
    const monetization = { ...profile.concept.monetization, monthlyEurRange: { min: 999, max: 9999 } }
    expect(channelProfileSchema.safeParse(withConcept({ monetization })).success).toBe(false)
  })
})

describe('monthlyEurRange', () => {
  it('multiplies views by the rate per 1.000 and rounds', () => {
    expect(monthlyEurRange({ min: 10_000, max: 50_000 }, { min: 1, max: 3 })).toEqual({ min: 10, max: 150 })
    expect(monthlyEurRange({ min: 1_234, max: 5_678 }, { min: 1.5, max: 2.5 })).toEqual({ min: 2, max: 14 })
  })
})

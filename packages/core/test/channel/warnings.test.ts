import { describe, expect, it } from 'vitest'
import {
  type WarningKnowledge,
  conceptWarnings,
  hoursNeeded,
  nicheWarnings,
  yppSummary,
} from '../../src/channel/warnings.ts'

const KNOWLEDGE: WarningKnowledge = {
  madeForKids: { reviewedAt: '2026-11-01', audienceKeywords: ['niños', 'infantil', 'bebés'], label: 'Niños' },
  inauthentic: { reviewedAt: '2026-11-01', keywords: ['recopilación', 'plantilla', 'en masa'], label: 'No auténtico' },
  shorts: { reviewedAt: '2026-11-01', label: 'Shorts' },
  ypp: {
    reviewedAt: '2026-11-01',
    label: 'Programa de socios',
    ads: { subscribers: 1000, watchHours: 4000, shortsViews: 10_000_000 },
  },
  hoursPerLongVideo: 4,
  hoursPerShort: 1,
}

const concept = {
  audience: { description: 'Gente joven que cocina.', madeForKids: false },
  format: { longForm: 'Vídeos de diez minutos.', shortsRole: 'Un truco.' },
  cadence: { longPerWeek: 1, shortsPerWeek: 2 },
}

const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code)

describe('conceptWarnings (FR-015)', () => {
  it('a plain concept has no warnings', () => {
    expect(conceptWarnings(concept, { hoursPerWeek: 10 }, KNOWLEDGE)).toEqual([])
  })

  it('made for kids when the AI says so, citing the source', () => {
    const warnings = conceptWarnings(
      { ...concept, audience: { ...concept.audience, madeForKids: true } },
      { hoursPerWeek: 10 },
      KNOWLEDGE,
    )
    expect(warnings).toEqual([{ code: 'infantil', sourceId: 'made-for-kids', reviewedAt: '2026-11-01' }])
  })

  it('made for kids by a domain rule on the audience, even if the AI says it is not', () => {
    const warnings = conceptWarnings(
      { ...concept, audience: { description: 'Canciones para niños pequeños.', madeForKids: false } },
      { hoursPerWeek: 10 },
      KNOWLEDGE,
    )
    expect(codes(warnings)).toEqual(['infantil'])
  })

  it('a word that only contains the keyword is not a match', () => {
    const warnings = conceptWarnings(
      { ...concept, audience: { description: 'Gente con bebésitos no cuenta.', madeForKids: false } },
      { hoursPerWeek: 10 },
      KNOWLEDGE,
    )
    expect(warnings).toEqual([])
  })

  it('repetitive or inauthentic content', () => {
    const warnings = conceptWarnings(
      { ...concept, format: { ...concept.format, longForm: 'Recopilación de clips con la misma plantilla.' } },
      { hoursPerWeek: 10 },
      KNOWLEDGE,
    )
    expect(warnings).toEqual([{ code: 'no_autentico', sourceId: 'inauthentic', reviewedAt: '2026-11-01' }])
  })

  it('only Shorts', () => {
    const warnings = conceptWarnings(
      { ...concept, cadence: { longPerWeek: 0, shortsPerWeek: 5 } },
      { hoursPerWeek: 10 },
      KNOWLEDGE,
    )
    expect(warnings).toEqual([{ code: 'solo_shorts', sourceId: 'shorts', reviewedAt: '2026-11-01' }])
  })

  it('a rhythm that does not fit the hours', () => {
    const fits = conceptWarnings(concept, { hoursPerWeek: 6 }, KNOWLEDGE)
    const tooMuch = conceptWarnings(concept, { hoursPerWeek: 5 }, KNOWLEDGE)
    expect(codes(fits)).toEqual([])
    expect(tooMuch).toEqual([{ code: 'ritmo_insostenible', sourceId: null, reviewedAt: null }])
  })

  it('without the hours it does not guess the rhythm', () => {
    expect(codes(conceptWarnings(concept, {}, KNOWLEDGE))).toEqual([])
  })
})

describe('nicheWarnings (US1 AS7, FR-015)', () => {
  it('the same rules run on a measured niche', () => {
    expect(codes(nicheWarnings({ label: 'Cocina fácil', summary: 'Recetas.' }, KNOWLEDGE))).toEqual([])
    expect(codes(nicheWarnings({ label: 'Cuentos infantiles', summary: 'Historias.' }, KNOWLEDGE))).toEqual([
      'infantil',
    ])
    expect(
      codes(nicheWarnings({ label: 'Curiosidades', summary: 'Vídeos en masa con plantilla.' }, KNOWLEDGE)),
    ).toEqual(['no_autentico'])
    expect(codes(nicheWarnings({ label: 'Humor', summary: 'Chistes cortos.', shortsOnly: true }, KNOWLEDGE))).toEqual([
      'solo_shorts',
    ])
  })
})

describe('hoursNeeded (novice audit 003, M2)', () => {
  it('is what the videos of a week take, apart from the hours the creator has', () => {
    const rhythm = { hoursPerLongVideo: 4, hoursPerShort: 1 }
    expect(hoursNeeded({ longPerWeek: 1, shortsPerWeek: 3 }, rhythm)).toBe(7)
    expect(hoursNeeded({ longPerWeek: 0, shortsPerWeek: 0 }, rhythm)).toBe(0)
  })
})

describe('yppSummary', () => {
  it('gives the requirements of the partner programme with their source', () => {
    expect(yppSummary(KNOWLEDGE)).toEqual({
      subscribers: 1000,
      watchHours: 4000,
      shortsViews: 10_000_000,
      sourceId: 'ypp',
      reviewedAt: '2026-11-01',
    })
  })
})

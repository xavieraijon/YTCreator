import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ConceptCard,
  ConceptEditor,
  isStale,
  parseCount,
  type Concept,
} from '../../src/screens/channel/new/Concepts.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'

const text = channelEs.concepts
const concept: Concept = {
  promise: 'Recetas de diario para gente con poco tiempo.',
  pillars: [
    { title: 'Cenas', description: 'En veinte minutos.' },
    { title: 'Tupper', description: 'Para el trabajo.' },
    { title: 'Básicos', description: 'Técnicas sencillas.' },
  ],
  audience: { description: 'Gente joven.', region: 'espana', madeForKids: false },
  format: { presence: 'voz', longForm: 'Diez minutos.', shortsRole: 'Un truco por short.' },
  cadence: { longPerWeek: 1, shortsPerWeek: 3, hoursPerWeek: 6 },
  monetization: { category: 'estilo_de_vida', assumptions: ['Público de España.'] },
  figures: {
    monetization: {
      rpmEurRange: { min: 1.5, max: 4 },
      monthlyViewsAssumption: { min: 10_000, max: 100_000 },
      monthlyEurRange: { min: 15, max: 400 },
      yppRequirements: { subscribers: 1000, watchHours: 4000, shortsViews: 10_000_000 },
      rpmSource: { label: 'Datos de ganancias', reviewedAt: '2026-11-01', confidence: 'baja' },
      yppSource: { label: 'Ayuda de YouTube', reviewedAt: '2026-11-01' },
    },
    warnings: [],
  },
}
const card = (change: Partial<Concept> = {}, chosen = false) =>
  renderToStaticMarkup(
    <ConceptCard concept={{ ...concept, ...change }} chosen={chosen} onChoose={() => {}} onEdit={() => {}} />,
  )
const count = (html: string, part: string) => html.split(part).length - 1

describe('ConceptCard', () => {
  it('has every part, each saying why it matters', () => {
    const html = card()
    for (const part of [text.promise, text.pillars, text.audience, text.format, text.cadence, text.money]) {
      expect(html).toContain(part)
    }
    for (const why of [text.promiseWhy, text.pillarsWhy, text.audienceWhy, text.formatWhy, text.cadenceWhy]) {
      expect(html).toContain(why)
    }
    expect(html).toContain(concept.promise)
    expect(html).toContain('Tupper')
  })

  it('money is a range, with its assumptions and the source of the knowledge (US2 AS2)', () => {
    const html = card()
    expect(html).toContain('De 15 a 400 € al mes')
    expect(html).toContain('10.000')
    expect(html).toContain('Público de España.')
    expect(html).toContain('programa de socios de YouTube')
    expect(html).toContain('Datos de ganancias')
    expect(html).toContain('Ayuda de YouTube')
    expect(count(html, 'data-kind="conocimiento"')).toBe(2)
  })

  it('says how sure the money figures are, and that the regional part has no source (G5)', () => {
    const html = card()
    expect(html).toContain(text.moneyConfidence.baja)
    expect(html).toContain('sin fuente')
  })

  it('without a figure says so and gives no amount', () => {
    const html = card({
      figures: {
        ...concept.figures,
        monetization: { ...concept.figures.monetization, monthlyEurRange: null, monthlyViewsAssumption: null },
      },
    })
    expect(html).toContain(text.moneyUnknown)
    expect(html).not.toContain('€ al mes')
  })

  it('warns with its source (US2 AS4)', () => {
    const html = card({
      figures: {
        ...concept.figures,
        warnings: [
          { code: 'infantil', sourceLabel: 'Hecho para niños', reviewedAt: '2026-11-01' },
          { code: 'solo_shorts', sourceLabel: 'Shorts', reviewedAt: '2026-11-01' },
          { code: 'ritmo_insostenible', sourceLabel: null, reviewedAt: null },
        ],
      },
    })
    expect(html).toContain(channelEs.niches.warnings.infantil)
    expect(html).toContain(channelEs.niches.warnings.solo_shorts)
    expect(html).toContain(channelEs.niches.warnings.ritmo_insostenible)
    expect(count(html, 'data-kind="conocimiento"')).toBe(4)
  })

  it('offers to choose and to edit; the chosen one is marked', () => {
    const html = card()
    expect(html).toContain(text.choose)
    expect(html).toContain(text.edit)
    const chosen = card({}, true)
    expect(chosen).toContain(text.chosen)
    expect(chosen).not.toContain(text.choose)
  })
})

describe('ConceptEditor (US2 AS3)', () => {
  it('lets every part be edited', () => {
    const html = renderToStaticMarkup(<ConceptEditor concept={concept} onSave={() => {}} onCancel={() => {}} />)
    for (const label of [
      text.form.promise,
      text.form.audience,
      text.form.longForm,
      text.form.shortsRole,
      text.form.longPerWeek,
      text.form.shortsPerWeek,
      text.form.assumptions,
      text.form.madeForKids,
    ]) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Tema 3')
    expect(html).toContain(text.form.save)
  })

  it('takes counts from 0 up, and half a video too', () => {
    expect(parseCount('0')).toBe(0)
    expect(parseCount('0,5')).toBe(0.5)
    expect(parseCount('')).toBeNull()
    expect(parseCount('-1')).toBeNull()
    expect(parseCount('dos')).toBeNull()
  })
})

describe('concepts written with other answers (G4)', () => {
  it('reads what the server says, and an edit counts over the original', () => {
    const basedOn = { nicheLabel: 'Cocina' }
    const stale = { basedOn, stale: true }
    expect(isStale({ payload: stale, editedPayload: null })).toBe(true)
    expect(isStale({ payload: stale, editedPayload: { basedOn, stale: false } })).toBe(false)
    expect(isStale({ payload: { old: true }, editedPayload: null })).toBe(false)
    expect(isStale({ payload: {}, editedPayload: null })).toBe(false)
  })
})

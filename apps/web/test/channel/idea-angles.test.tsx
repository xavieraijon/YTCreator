import type { IdeaBankView, IdeaBatchView, IdeaMeasureView, IdeaView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IdeaBankContent, type MeasureControls } from '../../src/screens/channel/ideas/IdeaBank.tsx'
import { IdeaMeasure } from '../../src/screens/channel/ideas/IdeaMeasure.tsx'
import { ideasEs } from '../../src/strings/ideas.es.ts'

// «Buscar otro enfoque» (specs/004-idea-bank/contracts/ui-screens.md, US3).
const text = ideasEs.measure
const at = '2026-11-07T10:00:00.000Z'
const now = new Date('2026-11-08T10:00:00.000Z')
const basis = { label: 'Supuesto', date: '2026-09-27', recentDays: 90, audienceViews: 100_000 }
const measure = (verdict: IdeaMeasureView['verdict']): IdeaMeasureView => ({
  id: 'm1',
  ideaRevision: 1,
  status: 'medida',
  verdict,
  reason: 'racha_reciente',
  figures: {
    similar: 12,
    recent: 4,
    dated: 12,
    medianViews: 800,
    maxViews: 50000,
    broadTopViews: 300000,
    broadBigVideos: 2,
    hasAudience: true,
  },
  similarVideos: [],
  opportunity: null,
  queries: { query: 'pan', broadQuery: 'pan', queryEn: null },
  failure: null,
  source: 'fake',
  partial: false,
  thresholdsVersion: 5,
  measuredAt: at,
})
const idea = (fields: Partial<IdeaView> = {}): IdeaView => ({
  id: 'i1',
  origin: 'creador',
  batchId: null,
  sourceIdeaId: null,
  title: 'Pan casero',
  hook: '',
  pillar: null,
  format: 'largo',
  notes: '',
  query: 'pan',
  broadQuery: 'pan',
  queryEn: null,
  status: 'banco',
  position: 1,
  queuePosition: null,
  revision: 1,
  profileVersion: 1,
  createdAt: at,
  updatedAt: at,
  measure: null,
  stale: false,
  fromOlderProfile: false,
  measuredOlderRevision: false,
  ...fields,
})
const noop = () => {}
const estimate = {
  estimateId: 'e1',
  use: 'otro_enfoque' as const,
  cents: 0,
  included: true,
  blockedBy: null,
  maxCents: 0,
  pricingVersion: 1,
}
const card = (one: IdeaView, open = false) =>
  renderToStaticMarkup(
    <IdeaMeasure
      idea={one}
      basis={basis}
      now={now}
      busy={false}
      angles={{ open, estimate, failure: null, busy: false, onOpen: noop, onRun: noop }}
      onMeasure={noop}
      onMeasureWithTitle={noop}
    />,
  )

const angles: IdeaBatchView = {
  id: 'b2',
  kind: 'otro_enfoque',
  sourceIdeaId: 'i1',
  candidates: [0, 1].map((index) => ({
    index,
    title: `Pan para celíacos ${index}`,
    hook: 'Sin gluten.',
    pillar: 'Panes',
    format: 'largo' as const,
    query: 'pan sin gluten',
    broadQuery: 'pan',
    queryEn: 'gluten free bread',
    why: 'Se dirige a quien no puede tomar gluten.',
    decision: index === 1 ? ('quedada' as const) : null,
  })),
  removedRepeats: 0,
  claimsTrimmed: false,
  createdAt: at,
}
const bank = (fields: Partial<IdeaBankView> = {}): IdeaBankView => ({
  ideas: [idea({ measure: measure('quemado') })],
  queue: [],
  profileVersion: 1,
  pendingBatch: null,
  pendingAngles: [angles],
  runningJob: null,
  interrupted: null,
  measureBasis: basis,
  measureUnits: null,
  ...fields,
})
const controls: MeasureControls = {
  job: null,
  estimate: null,
  announcement: '',
  now,
  onMeasure: noop,
  onMeasureWithTitle: noop,
  angles: { ideaId: null, estimate: null, failure: null, busy: false, onOpen: noop, onRun: noop },
}
const show = (view: IdeaBankView) =>
  renderToStaticMarkup(
    <IdeaBankContent
      state={{ kind: 'ready', channelId: 'c1', pillars: ['Panes'], niche: 'Pan', defaultFormat: 'largo', bank: view }}
      measure={controls}
    />,
  )

describe('another angle (US3)', () => {
  it.each(['quemado', 'competido'] as const)('offered for an idea %s, named after it', (verdict) => {
    expect(card(idea({ measure: measure(verdict) }))).toContain(`aria-label="${text.angles} «Pan casero»"`)
  })

  it.each(['hueco', 'frio'] as const)('not offered for an idea %s (AS3)', (verdict) => {
    expect(card(idea({ measure: measure(verdict) }))).not.toContain(text.angles)
  })

  it('not offered for a failed measure or none', () => {
    expect(card(idea())).not.toContain(text.angles)
    const failed = { ...measure(null), status: 'fallida' as const, failure: 'bloqueado' as const }
    expect(card(idea({ measure: failed }))).not.toContain(text.angles)
  })

  it('pressing it shows the cost first, that only a measure says if it has room, and room for instructions', () => {
    const html = card(idea({ measure: measure('quemado') }), true)
    expect(html).toContain(text.anglesWhy)
    expect(html).toContain(`${text.angles} · Incluido en tu suscripción`)
    expect(html).toContain(text.anglesInstructions)
    // What is waiting of this idea goes when asking again: it says so before.
    expect(html).toContain('se descartan')
  })

  it('not offered with a measure of an older version of the idea', () => {
    expect(card(idea({ measure: measure('quemado'), measuredOlderRevision: true }))).not.toContain(text.angles)
  })

  it('the angles wait by their idea, with their reason as an opinion of the AI', () => {
    const html = show(bank())
    expect(html).toContain('aria-label="Otros enfoques de «Pan casero»"')
    expect(html).toContain('Opinión de la IA: Se dirige a quien no puede tomar gluten.')
    expect(html).toContain('aria-label="Me la quedo «Pan para celíacos 0»"')
    expect(html).toContain(ideasEs.batch.kept)
    // Asked for again from the idea, where the instructions and the cost are.
    expect(html).toContain('aria-label="Proponer otras variantes de «Pan casero»"')
    expect(html).not.toContain(ideasEs.batch.instructions)
    // Its «Quedarme con todas» is not a second main action, and says which ones.
    const keepAll = html.match(/<button[^>]*aria-label="Quedarme con todas: Otros enfoques de «Pan casero»"[^>]*>/)
    expect(keepAll?.[0]).toContain('data-variant="secondary"')
  })

  it('«Proponer otras variantes» only where the card can open the request', () => {
    const again = 'Proponer otras variantes de «Pan casero»'
    const pending = (fields: Partial<IdeaView>) =>
      show(bank({ ideas: [idea({ measure: measure('quemado'), ...fields })], pendingAngles: [angles] }))
    expect(pending({})).toContain(again)
    expect(pending({ measuredOlderRevision: true })).not.toContain(again)
    expect(pending({ measure: measure('hueco') })).not.toContain(again)
  })

  it('the angles of two ideas wait at the same time, each by its own', () => {
    const other = idea({ id: 'i3', title: 'Bizcocho', measure: measure('competido') })
    const second = { ...angles, id: 'b3', sourceIdeaId: 'i3' }
    const html = show(bank({ ideas: [idea({ measure: measure('quemado') }), other], pendingAngles: [angles, second] }))
    expect(html).toContain('aria-label="Otros enfoques de «Pan casero»"')
    expect(html).toContain('aria-label="Otros enfoques de «Bizcocho»"')
  })

  it('with their idea out of the bank, they still show under the list, a level below it', () => {
    const html = show(bank({ ideas: [] }))
    expect(html).toContain(ideasEs.batch.anglesRegionUnknown)
    expect(html).toContain(`<h3>${ideasEs.batch.anglesRegionUnknown}</h3>`)
    expect(html).toContain('<h4>Pan para celíacos 0</h4>')
  })

  it('a kept angle says where it came from (AS2)', () => {
    const kept = idea({ id: 'i2', origin: 'otro_enfoque', sourceIdeaId: 'i1', title: 'Pan para celíacos 1' })
    const html = show(bank({ ideas: [idea({ measure: measure('quemado') }), kept], pendingAngles: [] }))
    expect(html).toContain('Otro enfoque de «Pan casero»')
  })
})

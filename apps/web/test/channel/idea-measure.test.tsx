import { IDEA_REASONS, type IdeaReason } from '@ytcreator/core'
import type { IdeaBankView, IdeaMeasureView, IdeaView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { asSearch, IdeaBankContent, type MeasureControls } from '../../src/screens/channel/ideas/IdeaBank.tsx'
import { IdeaMeasure, reasonText, VERDICT_STATE } from '../../src/screens/channel/ideas/IdeaMeasure.tsx'
import { ideasEs } from '../../src/strings/ideas.es.ts'
import { youtubeFailureActionsEs, youtubeFailuresEs } from '../../src/strings/youtube-failures.es.ts'

const text = ideasEs.measure
const at = '2026-11-07T10:00:00.000Z'
const now = new Date('2026-11-08T10:00:00.000Z')
const basis = { label: 'Supuesto de YTCreator', date: '2026-09-27', recentDays: 90, audienceViews: 100_000 }
const video = {
  videoId: 'v1',
  title: 'Pan de masa madre',
  channelId: 'UC1',
  channelTitle: 'Plato Diario',
  views: 12000,
  publishedAt: '2026-10-01T10:00:00.000Z',
  durationSeconds: 600,
}
const measure = (fields: Partial<IdeaMeasureView> = {}): IdeaMeasureView => ({
  id: 'm1',
  ideaRevision: 1,
  status: 'medida',
  verdict: 'quemado',
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
  similarVideos: [video],
  opportunity: { english: false, englishBigVideos: 0, topVideos: [] },
  queries: { query: 'pan masa madre', broadQuery: 'pan', queryEn: 'sourdough' },
  failure: null,
  source: 'fake',
  partial: false,
  thresholdsVersion: 5,
  measuredAt: at,
  ...fields,
})
const idea = (fields: Partial<IdeaView> = {}): IdeaView => ({
  id: 'i1',
  script: null,
  origin: 'creador',
  batchId: null,
  sourceIdeaId: null,
  title: 'Pan casero',
  hook: '',
  pillar: null,
  format: 'largo',
  notes: '',
  query: 'pan masa madre',
  broadQuery: 'pan',
  queryEn: 'sourdough',
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
const render = (one: IdeaView, busy = false) =>
  renderToStaticMarkup(
    <IdeaMeasure idea={one} basis={basis} now={now} busy={busy} onMeasure={noop} onMeasureWithTitle={noop} />,
  )

describe('the measure of an idea (contracts/ui-screens.md)', () => {
  it('unmeasured: says so, and «¿Tiene hueco?» names the idea', () => {
    const html = render(idea())
    expect(html).toContain(text.unmeasured)
    expect(html).toContain('aria-label="¿Tiene hueco? «Pan casero»"')
  })

  it.each(IDEA_REASONS)('the sentence of %s, with its figures', (reason: IdeaReason) => {
    const one = measure({ reason })
    const sentence = reasonText(one, 90)
    expect(sentence).not.toMatch(/\{\w+\}/)
    expect(render(idea({ measure: one }))).toContain(sentence)
  })

  it('measured: semaphore, sentence, source, date, the assumption seal and the similar videos folded', () => {
    const html = render(idea({ measure: measure() }))
    expect(html).toContain(text.verdict.quemado)
    expect(html).toContain('Ya hay 12 vídeos casi iguales y 4 son de los últimos 90 días')
    expect(html).toContain(text.assumption)
    expect(html).toContain(text.basisLabel)
    expect(html).not.toContain('Supuesto de YTCreator')
    expect(html).toContain('<details')
    expect(html).toContain(text.similar)
    expect(html).toContain('Pan de masa madre · Plato Diario · 12.000 visitas')
    expect(html).toContain(`aria-label="${text.again} «Pan casero»"`)
  })

  it('the English opportunity with its videos', () => {
    const english = { english: true, englishBigVideos: 2, topVideos: [{ ...video, videoId: 'e1', title: 'Bread' }] }
    const html = render(
      idea({ measure: measure({ verdict: 'hueco', reason: 'pocos_con_publico', opportunity: english }) }),
    )
    expect(html).toContain('En inglés este tema tiene vídeos con 100.000 visitas o más')
    expect(html).toContain(text.english)
    expect(html).toContain('Bread · Plato Diario')
  })

  it('without the English part, and with it failed, it says which', () => {
    expect(render(idea({ measure: measure({ opportunity: null }) }))).toContain(text.englishMissing)
    expect(render(idea({ measure: measure({ opportunity: { failure: 'bloqueado' } }) }))).toContain(text.englishFailed)
  })

  it('the notices: an old measure, of another version, partial dates', () => {
    const html = render(idea({ stale: true, measuredOlderRevision: true, measure: measure({ partial: true }) }))
    expect(html).toContain('Medida antigua (de hace 1 día).')
    expect(html).toContain(text.olderRevision)
    expect(html).toContain(text.partial)
  })

  const failed = measure({ status: 'fallida', verdict: null, reason: null, figures: null, failure: 'bloqueado' })

  it('a failure: «Sin medir», the text, and it can be measured again (US2 AS3)', () => {
    const html = render(idea({ measure: failed }))
    expect(html).toContain(text.unmeasured)
    expect(html).toContain(youtubeFailuresEs.bloqueado.what)
    expect(html).toContain(`aria-label="${text.check} «Pan casero»"`)
  })

  it('the reader not ready: «Ir a Ajustes», and measuring again is still there', () => {
    const html = render(idea({ measure: { ...failed, failure: 'no_disponible' } }))
    expect(html).toContain(`aria-label="${youtubeFailureActionsEs.ir_a_ajustes} «Pan casero»"`)
    expect(html).toContain(`aria-label="${text.check} «Pan casero»"`)
  })

  it('the failures of a channel are said for a search', () => {
    const html = render(idea({ measure: { ...failed, failure: 'no_encontrado' } }))
    expect(html).toContain(text.failure.no_encontrado)
    expect(html).not.toContain('canal')
  })

  it('«Frío» is grey, with another shape than «Competido»', () => {
    expect(VERDICT_STATE.frio).toBe('sin_comprobar')
    expect(VERDICT_STATE.competido).toBe('ambar')
  })

  it('«pocos recientes» says how many', () => {
    const one = measure({
      verdict: 'hueco',
      reason: 'sin_racha_con_publico',
      figures: { ...measure().figures!, similar: 8, recent: 3 },
    })
    expect(reasonText(one, 90)).toContain('pocos son recientes (3)')
  })

  it('with the Data API, measuring one idea says its units first', () => {
    const html = renderToStaticMarkup(
      <IdeaMeasure
        idea={idea()}
        basis={basis}
        units={{ withoutEnglish: 202, withEnglish: 303 }}
        now={now}
        busy={false}
        onMeasure={noop}
        onMeasureWithTitle={noop}
      />,
    )
    expect(html).toContain('Medirla gasta unas 303 unidades de tu cupo diario de YouTube.')
  })

  it('«Medir con el título» says its units first with the Data API', () => {
    const html = renderToStaticMarkup(
      <IdeaMeasure
        idea={idea({ query: null, broadQuery: null, queryEn: null })}
        basis={basis}
        units={{ withoutEnglish: 202, withEnglish: 303 }}
        now={now}
        busy={false}
        onMeasure={noop}
        onMeasureWithTitle={noop}
      />,
    )
    expect(html).toContain(`aria-label="${text.useTitle} «Pan casero»"`)
    expect(html).toContain('Medirla gasta unas 202 unidades de tu cupo diario de YouTube.')
  })

  it('an idea without its searches offers «Medir con el título»', () => {
    const html = render(idea({ query: null, broadQuery: null, queryEn: null }))
    expect(html).toContain(text.noQuery)
    expect(html).toContain(`aria-label="${text.useTitle} «Pan casero»"`)
  })

  it('without the general search it is not measured: the semaphore would guess the audience', () => {
    const html = render(idea({ broadQuery: null }))
    expect(html).toContain(text.noQuery)
    expect(html).not.toContain(`aria-label="${text.check} «Pan casero»"`)
  })

  it('«¿Tiene hueco?» without searches leads to «Preparar la medida» with its cost (R6)', () => {
    const prepare = (open: boolean) =>
      renderToStaticMarkup(
        <IdeaMeasure
          idea={idea({ query: null, broadQuery: null, queryEn: null })}
          basis={basis}
          now={now}
          busy={false}
          prepare={{ open, estimate: null, failure: null, busy: false, onOpen: noop, onRun: noop }}
          onMeasure={noop}
          onMeasureWithTitle={noop}
        />,
      )
    expect(prepare(false)).toContain(`aria-label="${text.check} «Pan casero»"`)
    expect(prepare(true)).toContain(text.prepare)
    expect(prepare(true)).toContain(text.prepareWhy)
  })
})

describe('measuring from the bank', () => {
  const bank = (fields: Partial<IdeaBankView> = {}): IdeaBankView => ({
    ideas: [idea(), idea({ id: 'i2', title: 'Otra', query: null })],
    queue: [],
    profileVersion: 1,
    pendingBatch: null,
    pendingAngles: [],
    runningJob: null,
    interrupted: null,
    measureBasis: basis,
    measureUnits: null,
    ...fields,
  })
  const controls = (fields: Partial<MeasureControls> = {}): MeasureControls => ({
    job: null,
    estimate: { ideas: 2, measurable: 1, withoutEnglish: 0, units: 303 },
    announcement: '',
    now,
    onMeasure: noop,
    onMeasureWithTitle: noop,
    ...fields,
  })
  const show = (view: IdeaBankView, measure: MeasureControls) =>
    renderToStaticMarkup(
      <IdeaBankContent
        state={{ kind: 'ready', channelId: 'c1', pillars: [], niche: 'Cocina', defaultFormat: 'largo', bank: view }}
        measure={measure}
      />,
    )

  it('«Medir todas» is the main action, with the units of the Data API and the ideas left out', () => {
    const html = show(bank(), controls())
    expect(html).toContain(text.countOne)
    expect(html).toContain('Medirla gasta unas 303 unidades de tu cupo diario de YouTube.')
    expect(html).toContain(text.skippedOne)
    expect(html).toMatch(new RegExp(`data-variant="primary"[^>]*><span[^>]*>${text.measureAll}`))
  })

  it('with the reader, no units are mentioned', () => {
    const html = show(bank(), controls({ estimate: { ideas: 1, measurable: 1, withoutEnglish: 0, units: null } }))
    expect(html).not.toContain('unidades')
    expect(html).toContain(text.countOne)
  })

  it('a failed measure goes back into «Medir todas»', () => {
    const failed = measure({ status: 'fallida', verdict: null, reason: null, figures: null, failure: 'no_disponible' })
    const html = show(bank({ ideas: [idea({ measure: failed })] }), controls())
    expect(html).toContain(`>${text.measureAll}<`)
  })

  it('with everything measured, proposing is the main action again', () => {
    const html = show(bank({ ideas: [idea({ measure: measure() })] }), controls({ estimate: null }))
    expect(html).not.toContain(`>${text.measureAll}<`)
    expect(html).toMatch(/data-variant="primary"[^>]*>(<span[^>]*>)?Proponer más ideas de vídeo/)
  })

  it('while measuring: the progress and that the tab can be closed', () => {
    const html = show(bank(), controls({ job: { done: 1, total: 3 } }))
    expect(html).toContain('Midiendo 1 de 3 ideas')
    expect(show(bank(), controls({ job: { done: 0, total: 1 } }))).toContain(text.progressOne)
    expect(html).toContain(text.progressNote)
    expect(html).not.toContain(`>${text.measureAll}<`)
  })

  it('cut short by a restart: «Seguir midiendo»', () => {
    const units = { withoutEnglish: 202, withEnglish: 303 }
    const html = show(bank({ interrupted: { jobId: 'j1', ideaIds: ['i1'] }, measureUnits: units }), controls())
    expect(html).toContain(text.interrupted)
    expect(html).toContain(text.resume)
    expect(html).toContain(text.countOne)
    expect(html).toContain('Medirla gasta unas 303 unidades')
  })

  it('what arrives is said in a polite live region', () => {
    expect(show(bank(), controls({ announcement: '«Pan casero»: Quemado.' }))).toMatch(
      /<p role="status"[^>]*>«Pan casero»: Quemado\.<\/p>/,
    )
  })
})

describe('asSearch', () => {
  it('takes out what YouTube reads as quotes or operators', () => {
    expect(asSearch('«Pan» -sin "gluten" | fácil OR rápido: hoy')).toBe('Pan sin gluten fácil rápido hoy')
    expect(asSearch('Rock or pop')).toBe('Rock pop')
    expect(asSearch('«»')).toBe('')
  })
})

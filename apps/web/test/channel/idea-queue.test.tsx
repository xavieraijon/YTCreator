import type { IdeaBankView, IdeaMeasureView, IdeaView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IdeaBankContent, type OrderControls } from '../../src/screens/channel/ideas/IdeaBank.tsx'
import { filterIdeas, NO_FILTERS } from '../../src/screens/channel/ideas/IdeaShelf.tsx'
import { ideasEs } from '../../src/strings/ideas.es.ts'

// US4: the queue, the order, the filters, the archive and the downloads (contracts/ui-screens.md).
const at = '2026-11-07T10:00:00.000Z'
const measure = (verdict: IdeaMeasureView['verdict']): IdeaMeasureView => ({
  id: 'm1',
  ideaRevision: 1,
  status: 'medida',
  verdict,
  reason: 'pocos_con_publico',
  figures: {
    similar: 3,
    recent: 1,
    dated: 3,
    medianViews: 800,
    maxViews: 5000,
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
const idea = (id: string, title: string, fields: Partial<IdeaView> = {}): IdeaView => ({
  id,
  origin: 'creador',
  batchId: null,
  sourceIdeaId: null,
  title,
  hook: '',
  pillar: null,
  format: 'largo',
  notes: '',
  query: null,
  broadQuery: null,
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
const ideas = [
  idea('a', 'Pan de molde', { status: 'elegida', queuePosition: 2 }),
  idea('b', 'Pan de pita', { status: 'elegida', queuePosition: 1, format: 'short' }),
  idea('c', 'Pan de centeno', { measure: measure('hueco') }),
  idea('d', 'Pan hecho', { status: 'hecha', measure: measure('quemado') }),
]
const bank = (fields: Partial<IdeaBankView> = {}): IdeaBankView => ({
  ideas,
  queue: ['b', 'a'],
  profileVersion: 1,
  pendingBatch: null,
  pendingAngles: [],
  runningJob: null,
  interrupted: null,
  measureBasis: { label: 'Supuesto', date: '2026-09-27', recentDays: 90, audienceViews: 100_000 },
  measureUnits: null,
  ...fields,
})
const noop = () => {}
const order: OrderControls = {
  archived: [idea('z', 'Pan olvidado', { status: 'archivada' })],
  busy: false,
  announcement: 'Movida a la posición 2.',
  onMove: noop,
  onStatus: noop,
  onDownload: noop,
}
const show = (view: IdeaBankView = bank()) =>
  renderToStaticMarkup(
    <IdeaBankContent
      state={{ kind: 'ready', channelId: 'c1', pillars: [], niche: 'Pan', defaultFormat: 'largo', bank: view }}
      order={order}
    />,
  )
const named = (action: string, title: string) => `aria-label="${action} «${title}»"`

describe('the queue and the order (US4)', () => {
  it('«Próximos vídeos» in its order, each with Subir, Bajar and Quitar de la cola, and the note', () => {
    const html = show()
    const queue = html.slice(html.indexOf(ideasEs.queue.title), html.indexOf(ideasEs.bank.listTitle + '</h2>'))
    expect(queue.indexOf('Pan de pita')).toBeLessThan(queue.indexOf('Pan de molde'))
    // Its order buttons say they change the queue: the same idea has those of the bank in its card.
    for (const action of [ideasEs.order.upQueue, ideasEs.order.downQueue, ideasEs.queue.remove]) {
      expect(queue).toContain(named(action, 'Pan de pita'))
    }
    expect(queue).toContain('1. Pan de pita')
    expect(queue).toContain(ideasEs.queue.note)
  })

  it('without chosen ideas, it says how to choose one, and there is no note', () => {
    const html = show(bank({ ideas: [idea('c', 'Pan de centeno')], queue: [] }))
    expect(html).toContain(ideasEs.queue.empty)
    expect(html).not.toContain(ideasEs.queue.note)
  })

  it('the order buttons are named after the idea; at an edge they say they are not available', () => {
    const html = show()
    const first = html.match(/<button[^>]*data-order="bank:a:up"[^>]*>/)![0]
    expect(first).toContain(named('Subir', 'Pan de molde'))
    expect(first).toContain('aria-disabled="true"')
    expect(html.match(/<button[^>]*data-order="bank:a:down"[^>]*>/)![0]).not.toContain('aria-disabled')
  })

  it('each card has the moves its state allows', () => {
    const html = show()
    expect(html).toContain(named(ideasEs.moves.choose, 'Pan de centeno'))
    expect(html).toContain(named(ideasEs.moves.done, 'Pan de centeno'))
    expect(html).toContain(named(ideasEs.moves.archive, 'Pan de centeno'))
    expect(html).not.toContain(named(ideasEs.moves.choose, 'Pan de molde'))
    // A done idea goes back to the bank (a mistake is undone) or is archived.
    expect(html).not.toContain(named(ideasEs.moves.done, 'Pan hecho'))
    expect(html).not.toContain(named(ideasEs.moves.choose, 'Pan hecho'))
    expect(html).toContain(named(ideasEs.moves.undone, 'Pan hecho'))
    expect(html).toContain(named(ideasEs.moves.archive, 'Pan hecho'))
  })

  it('says where the idea moved to, politely', () => {
    expect(show()).toMatch(/<p role="status"[^>]*>Movida a la posición 2\.<\/p>/)
  })
})

describe('the filters, the archive and the downloads (US4)', () => {
  it('filters by state, format and semaphore', () => {
    const titles = (filters: Partial<typeof NO_FILTERS>) =>
      filterIdeas(ideas, { ...NO_FILTERS, ...filters }).map((one) => one.title)
    expect(titles({ status: 'elegida' })).toEqual(['Pan de molde', 'Pan de pita'])
    expect(titles({ format: 'short' })).toEqual(['Pan de pita'])
    expect(titles({ verdict: 'hueco' })).toEqual(['Pan de centeno'])
    expect(titles({ verdict: 'sin_medir' })).toEqual(['Pan de molde', 'Pan de pita'])
    expect(titles({})).toHaveLength(4)
  })

  it('shows the three filters', () => {
    const html = show()
    for (const label of [ideasEs.filters.status, ideasEs.filters.format, ideasEs.filters.verdict]) {
      expect(html).toContain(`>${label}</label>`)
    }
  })

  it('«Archivadas» is folded, with «Recuperar» on each', () => {
    const html = show()
    expect(html).toMatch(/<details[^>]*><summary[^>]*>.*Archivadas<\/summary>/)
    expect(html).not.toMatch(/<details[^>]*open/)
    expect(html).toContain(named(ideasEs.moves.recover, 'Pan olvidado'))
  })

  it('offers the bank as a document and as data', () => {
    const html = show()
    expect(html).toContain(ideasEs.download.document)
    expect(html).toContain(ideasEs.download.data)
  })
})

describe('the older profile (T062, edge case of the spec)', () => {
  it('an idea proposed with an older version of the profile says so on its card; the others do not', () => {
    const older = idea('o', 'Pan antiguo', { origin: 'ia', fromOlderProfile: true })
    const html = show(bank({ ideas: [older, idea('n', 'Pan nuevo', { origin: 'ia' })], queue: [] }))
    expect(html.match(new RegExp(ideasEs.measure.olderProfile, 'g'))).toHaveLength(1)
    const card = html.slice(html.indexOf('Pan antiguo'), html.indexOf('Pan nuevo'))
    expect(card).toContain(ideasEs.measure.olderProfile)
  })
})

describe('what the novice audit asked for (004)', () => {
  it('with no similar video, the sentence says there are none instead of «Solo hay 0»', async () => {
    const { reasonText } = await import('../../src/screens/channel/ideas/IdeaMeasure.tsx')
    const none = {
      ...measure('frio'),
      reason: 'pocos_sin_publico' as const,
      figures: { ...measure('frio').figures!, similar: 0 },
    }
    expect(reasonText(none, 90)).toBe(ideasEs.measure.reason.pocos_sin_publico_cero)
    expect(reasonText({ ...none, reason: 'pocos_con_publico' }, 90)).toBe(ideasEs.measure.reason.pocos_con_publico_cero)
    expect(
      reasonText({ ...none, reason: 'pocos_sin_publico', figures: { ...none.figures, similar: 2 } }, 90),
    ).toContain('Solo hay 2')
  })
})

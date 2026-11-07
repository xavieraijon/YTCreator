import type { IdeaBankView, IdeaBatchView, IdeaView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IdeaBankContent, type IdeaBankState } from '../../src/screens/channel/ideas/IdeaBank.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'
import { ideasEs } from '../../src/strings/ideas.es.ts'

const text = ideasEs.bank
const at = '2026-11-07T10:00:00.000Z'
const estimate = {
  estimateId: 'e1',
  use: 'ideas' as const,
  cents: 0,
  included: true,
  blockedBy: null,
  maxCents: 0,
  pricingVersion: 1,
}
const empty: IdeaBankView = {
  ideas: [],
  queue: [],
  profileVersion: 1,
  pendingBatch: null,
  runningJob: null,
  interrupted: null,
  measureBasis: { label: 'Supuesto de prueba', date: '2026-09-27', recentDays: 90, audienceViews: 100_000 },
  measureUnits: null,
}
const idea = (fields: Partial<IdeaView> = {}): IdeaView => ({
  id: 'i1',
  origin: 'creador',
  batchId: null,
  sourceIdeaId: null,
  title: 'Pan casero',
  hook: 'Sin amasar.',
  pillar: 'Cenas rápidas',
  format: 'short',
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
const batch: IdeaBatchView = {
  id: 'b1',
  kind: 'ideas',
  sourceIdeaId: null,
  candidates: [
    {
      index: 0,
      title: 'Cena en diez minutos',
      hook: 'Rápida.',
      pillar: 'Cenas rápidas',
      format: 'largo',
      query: 'cena',
      broadQuery: 'cenas',
      queryEn: 'dinner',
      decision: null,
    },
    {
      index: 1,
      title: 'Tupper semanal',
      hook: 'Para toda la semana.',
      pillar: 'Táper',
      format: 'short',
      query: 'tupper',
      broadQuery: 'tupper',
      queryEn: 'meal prep',
      decision: 'quedada',
    },
  ],
  removedRepeats: 2,
  claimsTrimmed: false,
  createdAt: at,
}
const ready = (bank: IdeaBankView): IdeaBankState => ({
  kind: 'ready',
  channelId: 'c1',
  pillars: ['Cenas rápidas', 'Táper'],
  niche: 'Cocina casera',
  defaultFormat: 'largo',
  bank,
})
const render = (state: IdeaBankState) => renderToStaticMarkup(<IdeaBankContent state={state} estimate={estimate} />)
const button = (html: string, label: string) =>
  [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g)].map(([b]) => b).find((b) => b.includes(label))

describe('IdeaBank (contracts/ui-screens.md)', () => {
  it('without a profile: says why and takes the creator to it (US1 AS5)', () => {
    const html = render({ kind: 'noProfile' })
    expect(html).toContain(text.noProfile)
    expect(html).toContain(text.goToProfile)
    expect(html).not.toContain(text.why)
  })

  it('with the bank empty, «Proponer ideas de vídeo» with its cost is the main action', () => {
    const html = render(ready(empty))
    expect(html).toContain(text.why)
    expect(html).toContain(text.empty)
    const propose = button(html, text.propose)
    expect(propose).toContain('data-variant="primary"')
    expect(propose).toContain(channelEs.proposal.included)
  })

  it('with ideas to measure, proposing more is not the main action, and each idea says where it came from', () => {
    const state = ready({ ...empty, ideas: [idea(), idea({ id: 'i2', origin: 'ia', title: 'Otra' })] })
    const toMeasure = {
      job: null,
      estimate: { ideas: 2, measurable: 2, withoutEnglish: 0, units: null },
      announcement: '',
      now: new Date(),
      onMeasure: () => {},
      onMeasureWithTitle: () => {},
    }
    const html = renderToStaticMarkup(<IdeaBankContent state={state} estimate={estimate} measure={toMeasure} />)
    expect(button(html, text.proposeMore)).not.toContain('data-variant="primary"')
    expect(html).toContain(ideasEs.card.origin.creador)
    expect(html).toContain(ideasEs.card.origin.ia)
    expect(html).toContain('Cambiar algo de «Pan casero»')
    expect(html).toContain(ideasEs.status.banco)
    expect(html).toContain('Gancho: Sin amasar.')
    // Asking for others with instructions works outside a batch too (US1 AS3).
    expect(html).toContain(text.instructions)
  })

  it('a batch: keep or leave each one, keep them all, ask for others with instructions, and the repeats said', () => {
    const html = render(ready({ ...empty, pendingBatch: batch }))
    expect(html).toContain(`aria-label="${ideasEs.batch.region}"`)
    expect(html).toContain(ideasEs.batch.keep)
    expect(html).toContain(ideasEs.batch.discard)
    expect(html).toContain(ideasEs.batch.keepAll)
    expect(html).toContain(ideasEs.batch.again)
    expect(html).toContain(ideasEs.batch.instructions)
    expect(html).toContain('La IA repitió 2 ideas que ya tenías; las hemos quitado.')
    expect(html).toContain(ideasEs.batch.kept)
    expect(html).toContain('aria-label="Me la quedo «Cena en diez minutos»"')
    expect(html).toContain('Tema del canal: Cenas rápidas · Vídeo largo')
    expect(html).toContain('Las que no te hayas quedado se descartan.')
  })

  it('«Escribir una idea mía» asks for the title and the format, with the searches in «Modo experto»', () => {
    const html = render(ready(empty))
    expect(html).toContain(ideasEs.editor.open)
    expect(html).toContain(ideasEs.editor.title)
    expect(html).toContain(ideasEs.format.largo)
    expect(html).toContain(ideasEs.format.short)
    expect(html).toContain(ideasEs.editor.expert)
  })

  it('with the bank empty there is nothing to add instructions to yet', () => {
    expect(render(ready(empty))).not.toContain(text.instructions)
  })
})

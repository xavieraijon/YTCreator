import { conceptFiguresSchema, journeyViewSchema, proposalSchema } from '@ytcreator/core/api'
import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown>
interface Concept {
  promise: string
  audience: { description: string; region: string; madeForKids: boolean }
  figures: unknown
  [key: string]: unknown
}

async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  return { status: response.status, body: (await response.json()) as Body }
}

const view = async (t: TestApp, id: string) =>
  journeyViewSchema.parse((await call(t, 'GET', `/api/journeys/${id}`)).body)

async function step(t: TestApp, id: string, to: string, extra: Body = {}) {
  const { revision } = await view(t, id)
  return call(t, 'POST', `/api/journeys/${id}/step`, { revision, step: to, ...extra })
}

async function propose(t: TestApp, id: string, kind: string, extra: Body = {}) {
  const { revision } = await view(t, id)
  const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: kind })
  const created = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
    revision,
    kind,
    estimateId: estimate.body['estimateId'],
    ...extra,
  })
  return proposalSchema.parse(created.body)
}

// A journey at the concepts, with a niche chosen and, if asked, measured.
async function atConcepts(t: TestApp, { measured = true } = {}) {
  await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 500, dailyCents: 1000, monthlyCents: 5000 })
  await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: 'sk-ant-api03-FAKE-concepts-0123456789' })
  await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })
  const created = await call(t, 'POST', '/api/channels', { origin: 'nuevo' })
  const id = (created.body['journey'] as { id: string }).id
  await step(t, id, 'preguntas', { data: { interests: 'Me gusta cocinar y explicar recetas.' } })
  await step(t, id, 'nichos', { data: { answers: [] } })
  const niches = await propose(t, id, 'nichos')
  const { niches: list } = niches.payload as { niches: { label: string; queries: string[] }[] }
  if (measured) {
    const { revision } = await view(t, id)
    await call(t, 'POST', `/api/journeys/${id}/measures`, {
      revision,
      niches: [{ label: list[0]!.label, queries: list[0]!.queries }],
    })
    await vi.waitFor(async () => {
      expect((await view(t, id)).measures.map((m) => m.status)).toEqual(['medida'])
    })
  }
  await call(t, 'PATCH', `/api/proposals/${niches.id}`, { selectedIndex: 0, status: 'aprobada' })
  await step(t, id, 'ritmo')
  await step(t, id, 'conceptos', { data: { hoursPerWeek: 8, onCamera: 'voz', audienceRegion: 'espana' } })
  return id
}

const conceptsOf = (payload: unknown) => (payload as { concepts: Concept[] }).concepts

describe('POST /api/journeys/:id/proposals, kind conceptos', () => {
  it('gives 2–3 concepts, each with its ranges worked out by the domain and their sources', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    const concepts = conceptsOf(proposal.payload)
    expect(concepts.length).toBeGreaterThanOrEqual(2)
    expect(concepts.length).toBeLessThanOrEqual(3)
    const { monetization } = conceptFiguresSchema.parse(concepts[0]!.figures)
    expect(monetization.rpmEurRange.min).toBeLessThan(monetization.rpmEurRange.max)
    expect(monetization.monthlyEurRange).not.toBeNull()
    expect(monetization.monthlyEurRange!.min).toBeLessThan(monetization.monthlyEurRange!.max)
    expect(monetization.rpmSource.label).toBeTruthy()
    expect(monetization.yppSource.reviewedAt).toBeTruthy()
    expect(monetization.yppRequirements.subscribers).toBeGreaterThan(0)
  })

  it('a niche without a measure has no money figure', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t, { measured: false })
    const proposal = await propose(t, id, 'conceptos')
    const { monetization } = conceptFiguresSchema.parse(conceptsOf(proposal.payload)[0]!.figures)
    expect(monetization.monthlyEurRange).toBeNull()
    expect(monetization.rpmEurRange).toBeTruthy()
  })

  it('«Proponer otra» with instructions makes a child proposal', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const first = await propose(t, id, 'conceptos')
    const second = await propose(t, id, 'conceptos', { parentId: first.id, instructions: 'Más serio' })
    expect(second).toMatchObject({ parentId: first.id, instructions: 'Más serio' })
  })

  it('choosing one moves on to the names; without choosing it does not', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    expect((await step(t, id, 'nombres')).status).not.toBe(200)
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { selectedIndex: 1, status: 'aprobada' })
    expect((await step(t, id, 'nombres')).status).toBe(200)
    expect((await view(t, id)).step).toBe('nombres')
  })

  it('the creator may delete the assumptions when editing, which the AI may not', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    const concepts = conceptsOf(proposal.payload)
    const { monetization } = concepts[0]! as unknown as { monetization: { assumptions: string[] } }
    const edited = { ...concepts[0]!, monetization: { ...monetization, assumptions: [] } }
    const saved = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, {
      editedPayload: { concepts: [edited, concepts[1]] },
    })
    expect(saved.status).toBe(200)
    const saved0 = conceptsOf(saved.body['editedPayload'])[0]! as unknown as typeof edited
    expect(saved0.monetization.assumptions).toEqual([])
  })

  it('an edit is saved and its figures worked out again, ignoring those it brings (FR-014)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    const concepts = conceptsOf(proposal.payload)
    const edited = {
      ...concepts[0]!,
      promise: 'Mi promesa',
      audience: { ...concepts[0]!.audience, madeForKids: true },
      figures: { monetization: { monthlyEurRange: { min: 99_999, max: 99_999 } } },
    }
    const saved = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, {
      editedPayload: { concepts: [edited, concepts[1]] },
    })
    expect(saved.status).toBe(200)
    const after = conceptsOf(saved.body['editedPayload'])[0]!
    expect(after.promise).toBe('Mi promesa')
    const figures = conceptFiguresSchema.parse(after.figures)
    expect(figures.monetization.monthlyEurRange!.max).toBeLessThan(99_999)
    // Made for children: the warning with its source, and a lower range than the original.
    expect(figures.warnings).toContainEqual(expect.objectContaining({ code: 'infantil' }))
    expect(figures.warnings.find((w) => w.code === 'infantil')!.sourceLabel).toBeTruthy()
    const before = conceptFiguresSchema.parse(concepts[0]!.figures)
    expect(figures.monetization.rpmEurRange.max).toBeLessThan(before.monetization.rpmEurRange.max)
  })

  it('going back to the niches asks for confirmation and the concept must be chosen again (FR-025)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { selectedIndex: 0, status: 'aprobada' })
    await step(t, id, 'ritmo')
    expect((await step(t, id, 'nichos')).status).not.toBe(200)
    expect((await view(t, id)).step).toBe('ritmo')

    expect((await step(t, id, 'nichos', { confirm: true })).status).toBe(200)
    expect((await view(t, id)).state.conceptNeedsReview).toBe(true)
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos')
    expect((await step(t, id, 'nombres')).status).not.toBe(200)

    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { selectedIndex: 0, status: 'aprobada' })
    expect((await view(t, id)).state.conceptNeedsReview).toBeUndefined()
    expect((await step(t, id, 'nombres')).status).toBe(200)
  })
})

describe('the figures of a concept follow the journey (G4)', () => {
  const figuresIn = (payload: unknown) => conceptFiguresSchema.parse(conceptsOf(payload)[0]!.figures)
  const latestConcepts = async (t: TestApp, id: string) =>
    (await view(t, id)).proposals.findLast((p) => p.kind === 'conceptos')!

  it('a niche without a measure stops showing the money of the measured one', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    expect(figuresIn((await latestConcepts(t, id)).payload).monetization.monthlyEurRange).not.toBeNull()

    // Back to the niches: another niche, never measured.
    const niches = (await view(t, id)).proposals.findLast((p) => p.kind === 'nichos')!
    await step(t, id, 'ritmo')
    await step(t, id, 'nichos')
    await call(t, 'PATCH', `/api/proposals/${niches.id}`, { selectedIndex: 1, status: 'aprobada' })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos')

    const after = await latestConcepts(t, id)
    expect(figuresIn(after.payload).monetization.monthlyEurRange).toBeNull()
    expect((after.payload as { stale?: boolean }).stale).toBe(true)
  })

  it('fewer hours bring the pace warning without asking for the concepts again', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    expect(figuresIn((await latestConcepts(t, id)).payload).warnings.map((w) => w.code)).not.toContain(
      'ritmo_insostenible',
    )
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { hoursPerWeek: 1 } })
    expect(figuresIn((await latestConcepts(t, id)).payload).warnings.map((w) => w.code)).toContain('ritmo_insostenible')
  })

  it('a concept has the hours the creator answered, edited too, and the view says what a video takes (entry 136)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    const hours = (payload: unknown) =>
      conceptsOf(payload).map((c) => (c['cadence'] as { hoursPerWeek: number }).hoursPerWeek)
    expect(hours((await latestConcepts(t, id)).payload)).toEqual(conceptsOf(proposal.payload).map(() => 8))

    const [first, ...rest] = conceptsOf((await latestConcepts(t, id)).payload)
    const cadence = first!['cadence'] as Record<string, number>
    const edited = { ...first!, cadence: { ...cadence, shortsPerWeek: 1, hoursPerWeek: 30 } }
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: { concepts: [edited, ...rest] } })
    expect(hours((await latestConcepts(t, id)).payload)[0]).toBe(8)
    expect((await view(t, id)).rhythm).toEqual({ hoursPerLongVideo: 4, hoursPerShort: 1 })
  })

  it('concepts written for this niche are not stale', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    expect((await latestConcepts(t, id)).payload).toMatchObject({ stale: false })
  })

  it('a region changed after writing them does not make them stale', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    expect((await latestConcepts(t, id)).payload).toMatchObject({ stale: false })
  })

  it('a region set by hand survives an edit of something else, even if the journey has come to say the same', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    const handSet = conceptsOf(proposal.payload)
    handSet[0]!.audience.region = 'mixto'
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: { concepts: handSet } })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'mixto' } })
    const shown = conceptsOf((await latestConcepts(t, id)).editedPayload)
    shown[1]!.promise = 'Cenas de diario sin complicarte la vida.'
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: { concepts: shown } })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    const after = conceptsOf((await latestConcepts(t, id)).editedPayload)
    expect(after.map((c) => c.audience.region)).toEqual(after.map((_, i) => (i === 0 ? 'mixto' : 'latam')))
  })

  it('editing before the journey has a region does not pin it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    const journey = t.channel.journeys.get(id)!
    const state: Record<string, unknown> = { ...journey.state }
    delete state['audienceRegion']
    t.channel.journeys.update(id, journey.revision, { state })
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, {
      editedPayload: { concepts: conceptsOf(proposal.payload) },
    })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    expect(conceptsOf((await latestConcepts(t, id)).editedPayload)[0]!.audience.region).toBe('latam')
  })

  it('the AI does not choose the region: the concept takes the one of the journey', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    await propose(t, id, 'conceptos')
    expect(conceptsOf((await latestConcepts(t, id)).payload)[0]!.audience.region).toBe('latam')
  })

  it('a region changed afterwards changes the money, and the concept says that region', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    const before = figuresIn((await latestConcepts(t, id)).payload).monetization.rpmEurRange
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    const after = (await latestConcepts(t, id)).payload
    expect(figuresIn(after).monetization.rpmEurRange).not.toEqual(before)
    expect(conceptsOf(after)[0]!.audience.region).toBe('latam')
    // The audience only changes the money: there is no reason to suggest paying for new text.
    expect(after).toMatchObject({ stale: false })
  })

  it('the region the creator set by hand on a concept stays, whatever the journey says later', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    const concepts = conceptsOf(proposal.payload)
    concepts[0]!.audience.region = 'mixto'
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: { concepts } })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    const after = (await latestConcepts(t, id)).editedPayload
    expect(conceptsOf(after)[0]!.audience.region).toBe('mixto')
    expect(conceptsOf(after)[1]!.audience.region).toBe('latam')
  })

  it('editing from what the screen shows does not pin the region: it keeps following the journey', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    const shown = await latestConcepts(t, id)
    const concepts = conceptsOf(shown.payload)
    concepts[0]!.promise = 'Cenas de diario sin complicarte la vida.'
    await call(t, 'PATCH', `/api/proposals/${shown.id}`, { editedPayload: { concepts } })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'espana' } })
    const after = (await latestConcepts(t, id)).editedPayload
    expect(conceptsOf(after).map((c) => c.audience.region)).toEqual(concepts.map(() => 'espana'))
    expect(after).toMatchObject({ stale: false })
  })

  it('choosing by hand the region it was written for, while the journey says another, stays', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    const shown = await latestConcepts(t, id)
    const concepts = conceptsOf(shown.payload)
    concepts[0]!.audience.region = 'espana'
    await call(t, 'PATCH', `/api/proposals/${shown.id}`, { editedPayload: { concepts } })
    expect(conceptsOf((await latestConcepts(t, id)).editedPayload)[0]!.audience.region).toBe('espana')
  })

  it('other hours or another way of appearing make them stale: the text says what was answered then', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { hoursPerWeek: 1 } })
    expect((await latestConcepts(t, id)).payload).toMatchObject({ stale: true })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { hoursPerWeek: 8, onCamera: 'cara' } })
    expect((await latestConcepts(t, id)).payload).toMatchObject({ stale: true })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { onCamera: 'voz' } })
    expect((await latestConcepts(t, id)).payload).toMatchObject({ stale: false })
  })

  it('something saved that can no longer be read shows as no concepts, not as a broken journey', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    const proposal = await propose(t, id, 'conceptos')
    t.channel.proposals.edit(proposal.id, { old: true })
    expect((await latestConcepts(t, id)).editedPayload).toMatchObject({ concepts: [] })
  })

  it('says how sure the money figures are (G5)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConcepts(t)
    await propose(t, id, 'conceptos')
    expect(figuresIn((await latestConcepts(t, id)).payload).monetization.rpmSource.confidence).toBe('baja')
  })
})

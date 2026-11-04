import { conceptFiguresSchema, journeyViewSchema, proposalSchema } from '@ytcreator/core/api'
import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown>
interface Concept {
  promise: string
  audience: { description: string; madeForKids: boolean }
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

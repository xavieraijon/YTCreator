import { journeyViewSchema, referenceChannelSchema } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown> & { error?: Record<string, unknown> }

async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  return { status: response.status, body: (await response.json()) as Body }
}

async function journey(t: TestApp) {
  const created = await call(t, 'POST', '/api/channels', { origin: 'nuevo' })
  return (created.body as { journey: { id: string; revision: number } }).journey
}

async function measured(t: TestApp, id: string, revision: number, niches: object[]) {
  const started = await call(t, 'POST', `/api/journeys/${id}/measures`, { revision, niches })
  expect(started.status).toBe(202)
  const jobId = started.body.jobId as string
  await new Promise<void>((resolve) => {
    const finish = setInterval(() => {
      if (t.jobs.get(jobId)?.status !== 'en_curso') {
        clearInterval(finish)
        resolve()
      }
    }, 5)
  })
  return jobId
}

describe('measures', () => {
  it('answers 202 with a job and the view brings the measures', async () => {
    const t = makeTestApp()
    const { id, revision } = await journey(t)
    await measured(t, id, revision, [
      { label: 'Uno', queries: ['recetas'] },
      { label: 'Dos', queries: ['sin datos'] },
    ])
    const view = journeyViewSchema.parse((await call(t, 'GET', `/api/journeys/${id}`)).body)
    expect(view.measures.map((m) => [m.nicheLabel, m.status])).toEqual([
      ['Uno', 'medida'],
      ['Dos', 'fallida'],
    ])
    expect(view.jobs.at(-1)).toMatchObject({ kind: 'medir_nichos', status: 'hecho' })
  })

  it('a stale revision is a conflict; an unknown journey is not found', async () => {
    const t = makeTestApp()
    const { id, revision } = await journey(t)
    const stale = await call(t, 'POST', `/api/journeys/${id}/measures`, {
      revision: revision + 1,
      niches: [{ label: 'Uno', queries: ['x'] }],
    })
    expect(stale.status).toBe(409)
    const missing = await call(t, 'POST', '/api/journeys/nada/measures', {
      revision: 0,
      niches: [{ label: 'Uno', queries: ['x'] }],
    })
    expect(missing.status).toBe(404)
  })

  it('refuses niches with no searches', async () => {
    const t = makeTestApp()
    const { id, revision } = await journey(t)
    const bad = await call(t, 'POST', `/api/journeys/${id}/measures`, {
      revision,
      niches: [{ label: 'Uno', queries: [] }],
    })
    expect(bad.status).toBe(400)
  })
})

describe('references', () => {
  const references = z.array(referenceChannelSchema)

  it('proposes them, removes and adds', async () => {
    const t = makeTestApp()
    const { id, revision } = await journey(t)
    await measured(t, id, revision, [{ label: 'Uno', queries: ['recetas'] }])
    const measureId = t.measures.listByJourney(id)[0]!.id

    const proposed = await call(t, 'POST', `/api/journeys/${id}/references`, { measureId })
    expect(proposed.status).toBe(200)
    const list = references.parse(proposed.body)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list[0]!.medianViews).not.toBeNull()
  })

  it('a measure of another journey is not found', async () => {
    const t = makeTestApp()
    const { id } = await journey(t)
    const answer = await call(t, 'POST', `/api/journeys/${id}/references`, { measureId: 'nada' })
    expect(answer.status).toBe(404)
  })

  it('a failure of the reader is told with its code', async () => {
    const t = makeTestApp()
    const { id, revision } = await journey(t)
    await measured(t, id, revision, [{ label: 'Uno', queries: ['recetas'] }])
    const measureId = t.measures.listByJourney(id)[0]!.id
    const answer = await call(t, 'POST', `/api/journeys/${id}/references`, { measureId, add: '@no-existe-seguro' })
    expect(answer.status).toBe(502)
    expect(answer.body.error).toMatchObject({ code: 'youtube', youtubeFailure: 'no_encontrado' })
  })
})

describe('warnings in the view', () => {
  it('flags a niche for children, with its source', async () => {
    const t = makeTestApp()
    const { id } = await journey(t)
    t.channelProposals.create({
      journeyId: id,
      kind: 'nichos',
      payload: {
        niches: [
          { label: 'Cuentos para niños', summary: 'Historias', queries: ['cuentos'], whyItFits: 'x' },
          { label: 'Bricolaje', summary: 'Arreglos', queries: ['bricolaje'], whyItFits: 'x' },
        ],
      },
      promptId: 'nichos',
      promptVersion: 1,
      instructions: null,
      claimsTrimmed: false,
      usageId: null,
    })
    const view = journeyViewSchema.parse((await call(t, 'GET', `/api/journeys/${id}`)).body)
    expect(view.warnings['Cuentos para niños']![0]).toMatchObject({ code: 'infantil' })
    expect(view.warnings['Cuentos para niños']![0]!.sourceLabel).toBeTruthy()
    expect(view.warnings['Bricolaje']).toEqual([])
  })
})

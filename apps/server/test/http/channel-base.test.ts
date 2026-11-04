import { channelCurrentSchema, estimateSchema, journeyViewSchema, proposalSchema } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { ESTIMATE_TTL_MS } from '@ytcreator/core'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown> & { error?: Record<string, unknown> }

const KEY = 'sk-ant-api03-FAKE-channel-0123456789'
const INTERESTS = 'Me gusta cocinar y explicar recetas.'

async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  return { status: response.status, body: (await response.json()) as Body }
}

async function newChannel(t: TestApp, origin = 'nuevo') {
  const created = await call(t, 'POST', '/api/channels', { origin })
  expect(created.status).toBe(201)
  return created.body as { channel: { id: string }; journey: { id: string; revision: number } }
}

// Pay-per-use connected and with limits, so the estimates are real figures.
async function connect(t: TestApp) {
  await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 500, dailyCents: 1000, monthlyCents: 5000 })
  const saved = await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
  expect(saved.status).toBe(200)
  const active = await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })
  expect(active.status).toBe(200)
}

async function step(t: TestApp, id: string, revision: number, target: string, extra: object = {}) {
  return call(t, 'POST', `/api/journeys/${id}/step`, { revision, step: target, ...extra })
}

async function atQuestions(t: TestApp) {
  const { journey } = await newChannel(t)
  const moved = await step(t, journey.id, journey.revision, 'preguntas', { data: { interests: INTERESTS } })
  expect(moved.status).toBe(200)
  return { id: journey.id, revision: moved.body.revision as number }
}

async function generate(t: TestApp, id: string, revision: number, kind = 'preguntas', use = kind) {
  const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use })
  expect(estimate.status).toBe(200)
  return call(t, 'POST', `/api/journeys/${id}/proposals`, {
    revision,
    kind,
    estimateId: estimate.body.estimateId,
  })
}

describe('GET /api/channels/current', () => {
  it('without a channel', async () => {
    const t = makeTestApp()
    expect(await call(t, 'GET', '/api/channels/current')).toEqual({ status: 200, body: { channel: null } })
  })

  it('with a channel: the channel, no profile yet and its journey', async () => {
    const t = makeTestApp()
    const { channel, journey } = await newChannel(t)
    const { body } = await call(t, 'GET', '/api/channels/current')
    const parsed = channelCurrentSchema.parse(body)
    expect(parsed).toMatchObject({ channel: { id: channel.id }, profile: null, journey: { id: journey.id } })
  })
})

describe('POST /api/channels', () => {
  it('creates the channel and its journey at the first step', async () => {
    const t = makeTestApp()
    const created = await newChannel(t)
    expect(created.journey).toMatchObject({ step: 'intereses', kind: 'nuevo', status: 'activo', revision: 0 })
    const other = makeTestApp()
    expect((await newChannel(other, 'existente')).journey).toMatchObject({ step: 'enlace', kind: 'existente' })
  })

  it('a second channel → 409 ya_hay_canal (FR-028)', async () => {
    const t = makeTestApp()
    await newChannel(t)
    const second = await call(t, 'POST', '/api/channels', { origin: 'existente' })
    expect(second).toEqual({ status: 409, body: { error: { code: 'conflicto', guard: 'ya_hay_canal' } } })
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM channel').get()).toEqual({ n: 1 })
  })

  it('an unknown origin → 400', async () => {
    const t = makeTestApp()
    expect((await call(t, 'POST', '/api/channels', { origin: 'otro' })).status).toBe(400)
  })
})

describe('GET /api/journeys/:id', () => {
  it('brings its state, proposals, measures, checks and jobs', async () => {
    const t = makeTestApp()
    const { journey } = await newChannel(t)
    const { status, body } = await call(t, 'GET', `/api/journeys/${journey.id}`)
    expect(status).toBe(200)
    expect(journeyViewSchema.parse(body)).toMatchObject({ proposals: [], measures: [], nameChecks: [], jobs: [] })
  })

  it('an unknown journey → 404', async () => {
    const t = makeTestApp()
    expect((await call(t, 'GET', '/api/journeys/no-existe')).status).toBe(404)
  })
})

describe('POST /api/journeys/:id/step', () => {
  it('saves the answers of the step and moves on', async () => {
    const t = makeTestApp()
    const { journey } = await newChannel(t)
    const moved = await step(t, journey.id, 0, 'preguntas', { data: { interests: INTERESTS } })
    expect(moved.status).toBe(200)
    expect(moved.body).toMatchObject({ step: 'preguntas', revision: 1, state: { interests: INTERESTS } })
  })

  it('a stale revision → 409 with the current journey', async () => {
    const t = makeTestApp()
    const { id } = await atQuestions(t)
    const stale = await step(t, id, 0, 'nichos')
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatchObject({ code: 'conflicto', current: { id, step: 'preguntas', revision: 1 } })
  })

  it('without the approval of the step → 400', async () => {
    const t = makeTestApp()
    const { journey } = await newChannel(t)
    const refused = await step(t, journey.id, 0, 'preguntas')
    expect(refused).toEqual({
      status: 400,
      body: { error: { code: 'validacion', fields: { step: 'no_valido' } } },
    })
    const { body } = await call(t, 'GET', `/api/journeys/${journey.id}`)
    expect(body).toMatchObject({ step: 'intereses', revision: 0 })
  })

  it('skipping a step → 400', async () => {
    const t = makeTestApp()
    const { id, revision } = await atQuestions(t)
    expect((await step(t, id, revision, 'conceptos')).status).toBe(400)
  })

  it('going back keeps the answers', async () => {
    const t = makeTestApp()
    const { id, revision } = await atQuestions(t)
    const back = await step(t, id, revision, 'intereses')
    expect(back.body).toMatchObject({ step: 'intereses', state: { interests: INTERESTS } })
  })

  it('invalid answers → 400 and nothing saved', async () => {
    const t = makeTestApp()
    const { journey } = await newChannel(t)
    expect((await step(t, journey.id, 0, 'preguntas', { data: { interests: 'corto' } })).status).toBe(400)
  })

  it('the region of the rhythm step reaches the channel (FR-014b)', async () => {
    const t = makeTestApp()
    const { channel, journey } = await newChannel(t)
    await step(t, journey.id, 0, 'preguntas', { data: { interests: INTERESTS, audienceRegion: 'latam' } })
    expect(t.channels.get(channel.id)?.audienceRegion).toBe('latam')
  })
})

describe('POST /api/journeys/:id/estimate', () => {
  it('gives the amount and an id, and spends nothing', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await connect(t)
    const { id } = await atQuestions(t)
    const { status, body } = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'preguntas' })
    expect(status).toBe(200)
    expect(estimateSchema.parse(body)).toMatchObject({ use: 'preguntas', included: false, blockedBy: null })
    expect(t.usage.list()).toEqual([])
  })

  it('with the AI not connected → 400 sin_conexion', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atQuestions(t)
    const refused = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'preguntas' })
    expect(refused).toEqual({ status: 400, body: { error: { code: 'validacion', guard: 'sin_conexion' } } })
  })
})

describe('POST /api/journeys/:id/proposals', () => {
  it('runs the AI and keeps a proposal, its prompt version and its usage', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await connect(t)
    const { id, revision } = await atQuestions(t)
    const { status, body } = await generate(t, id, revision)
    expect(status).toBe(200)
    const proposal = proposalSchema.parse(body)
    expect(proposal).toMatchObject({ kind: 'preguntas', status: 'propuesta', promptId: 'preguntas', promptVersion: 1 })
    const [usage] = t.usage.list()
    expect(proposal.usageId).toBe(usage?.id)
    const view = await call(t, 'GET', `/api/journeys/${id}`)
    expect(journeyViewSchema.parse(view.body).proposals).toHaveLength(1)
  })

  it('an expired estimate → 400 and no call', async () => {
    let at = new Date('2026-11-01T10:00:00.000Z')
    const t = makeTestApp({ fakeAi: 'ok', now: () => at })
    await connect(t)
    const { id, revision } = await atQuestions(t)
    const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'preguntas' })
    at = new Date(at.getTime() + ESTIMATE_TTL_MS + 1)
    const refused = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
      revision,
      kind: 'preguntas',
      estimateId: estimate.body.estimateId,
    })
    expect(refused).toEqual({
      status: 400,
      body: { error: { code: 'validacion', fields: { estimateId: 'no_valido' } } },
    })
    expect(t.usage.list()).toEqual([])
  })

  it('an estimate is only good once', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await connect(t)
    const { id, revision } = await atQuestions(t)
    const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'preguntas' })
    const send = () =>
      call(t, 'POST', `/api/journeys/${id}/proposals`, {
        revision,
        kind: 'preguntas',
        estimateId: estimate.body.estimateId,
      })
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(400)
  })

  it('a stale revision → 409 before spending anything', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await connect(t)
    const { id, revision } = await atQuestions(t)
    const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'preguntas' })
    const stale = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
      revision: revision - 1,
      kind: 'preguntas',
      estimateId: estimate.body.estimateId,
    })
    expect(stale.status).toBe(409)
    expect(t.usage.list()).toEqual([])
  })

  it('a failure of the AI is a 200 with its code, and stores no proposal', async () => {
    const t = makeTestApp({ fakeAi: 'salida_rota' })
    await connect(t)
    const { id, revision } = await atQuestions(t)
    expect(await generate(t, id, revision)).toEqual({ status: 200, body: { failure: 'respuesta_invalida' } })
    const view = await call(t, 'GET', `/api/journeys/${id}`)
    expect(journeyViewSchema.parse(view.body).proposals).toEqual([])
  })

  it('«Proponer otra» discards the one before and points to it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await connect(t)
    const { id, revision } = await atQuestions(t)
    const first = proposalSchema.parse((await generate(t, id, revision)).body)
    const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'preguntas' })
    const second = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
      revision,
      kind: 'preguntas',
      estimateId: estimate.body.estimateId,
      parentId: first.id,
      instructions: 'Más cortas',
    })
    expect(second.body).toMatchObject({ parentId: first.id, instructions: 'Más cortas' })
    const view = journeyViewSchema.parse((await call(t, 'GET', `/api/journeys/${id}`)).body)
    expect(view.proposals.map((p) => p.id)).toEqual([second.body.id])
  })
})

describe('PATCH /api/proposals/:id', () => {
  async function withProposal(t: TestApp, kind = 'nichos') {
    await connect(t)
    const { id, revision } = await atQuestions(t)
    const moved = await step(t, id, revision, 'nichos')
    const made = await generate(t, id, moved.body.revision as number, kind)
    return { journeyId: id, revision: moved.body.revision as number, proposal: proposalSchema.parse(made.body) }
  }

  it('choosing one approves it and opens the next step', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { journeyId, revision, proposal } = await withProposal(t)
    expect((await step(t, journeyId, revision, 'ritmo')).status).toBe(400)
    const chosen = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { selectedIndex: 1 })
    expect(chosen.body).toMatchObject({ status: 'aprobada', selectedIndex: 1 })
    expect((await step(t, journeyId, revision, 'ritmo')).status).toBe(200)
  })

  it('an index out of the list → 400', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { proposal } = await withProposal(t)
    const refused = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { selectedIndex: 99 })
    expect(refused).toEqual({
      status: 400,
      body: { error: { code: 'validacion', fields: { selectedIndex: 'no_valido' } } },
    })
  })

  it('approving a choice without choosing → 400', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { proposal } = await withProposal(t)
    expect((await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { status: 'aprobada' })).status).toBe(400)
  })

  it('an edit is validated and takes over the payload', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { proposal } = await withProposal(t, 'preguntas')
    const edited = { questions: [{ id: 'q1', question: '¿Cuál?', why: 'Para afinar.' }] }
    const saved = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: edited })
    expect(saved.body).toMatchObject({ editedPayload: edited })
    const bad = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: { roto: true } })
    expect(bad).toEqual({
      status: 400,
      body: { error: { code: 'validacion', fields: { editedPayload: 'no_valido' } } },
    })
  })

  it('a discarded proposal does not come back → 409', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { proposal } = await withProposal(t)
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { status: 'descartada' })
    expect((await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { selectedIndex: 0 })).status).toBe(409)
  })

  it('an unknown proposal → 404', async () => {
    const t = makeTestApp()
    expect((await call(t, 'PATCH', '/api/proposals/no-existe', { selectedIndex: 0 })).status).toBe(404)
  })

  it('choosing a concept again clears the review mark (FR-025)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await connect(t)
    const { id, revision } = await atQuestions(t)
    const atNiches = await step(t, id, revision, 'nichos')
    let rev = atNiches.body.revision as number
    const niches = proposalSchema.parse((await generate(t, id, rev, 'nichos')).body)
    await call(t, 'PATCH', `/api/proposals/${niches.id}`, { selectedIndex: 0 })
    rev = (await step(t, id, rev, 'ritmo')).body.revision as number
    rev = (await step(t, id, rev, 'conceptos', { data: { hoursPerWeek: 6, onCamera: 'voz' } })).body.revision as number
    const concepts = proposalSchema.parse((await generate(t, id, rev, 'conceptos')).body)
    await call(t, 'PATCH', `/api/proposals/${concepts.id}`, { selectedIndex: 0 })
    rev = (await step(t, id, rev, 'nombres')).body.revision as number

    const refused = await step(t, id, rev, 'nichos')
    expect(refused.body.error).toEqual({ code: 'validacion', fields: { confirm: 'no_valido' } })
    const back = await step(t, id, rev, 'nichos', { confirm: true })
    expect(back.body).toMatchObject({ step: 'nichos', state: { conceptNeedsReview: true } })

    await call(t, 'PATCH', `/api/proposals/${concepts.id}`, { selectedIndex: 1 })
    const view = journeyViewSchema.parse((await call(t, 'GET', `/api/journeys/${id}`)).body)
    expect(view.state.conceptNeedsReview).toBeUndefined()
  })
})

describe('the local guard', () => {
  it.each([
    ['GET', '/api/channels/current'],
    ['POST', '/api/channels'],
    ['GET', '/api/journeys/x'],
    ['POST', '/api/journeys/x/step'],
    ['POST', '/api/journeys/x/estimate'],
    ['POST', '/api/journeys/x/proposals'],
    ['PATCH', '/api/proposals/x'],
  ])('%s %s refuses another Host or Origin', async (method, path) => {
    const t = makeTestApp()
    const response = await t.app.request(path, {
      method,
      headers: { host: 'evil.example', origin: 'http://evil.example', 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    })
    expect(response.status).toBe(403)
  })
})

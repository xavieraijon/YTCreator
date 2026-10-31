import { FAKE_LOGIN_CODE } from '@ytcreator/ai'
import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>

// The fields these tests read; the rest is compared as a whole.
interface Body {
  revision?: number
  loginId?: string
  error?: Record<string, unknown>
  [field: string]: unknown
}

async function step(t: TestApp, body: Record<string, unknown>) {
  const response = await t.request('POST', '/api/onboarding/step', body)
  return { status: response.status, body: (await response.json()) as Body }
}

// From `bienvenida` to `conectar` with the given kind; returns the revision reached.
async function toConnect(t: TestApp, kind: 'suscripcion' | 'pago_por_uso') {
  await step(t, { expectedRevision: 0, action: 'continuar' })
  const chosen = await step(t, { expectedRevision: 1, action: 'elegir', kind })
  expect(chosen.body).toMatchObject({ step: 'conectar', chosenKind: kind })
  return chosen.body.revision as number
}

async function addAccount(t: TestApp) {
  const login = (await (await t.request('POST', '/api/ai/subscription/login', {})).json()) as { loginId: string }
  const response = await t.request('POST', `/api/ai/subscription/login/${login.loginId}/complete`, {
    code: FAKE_LOGIN_CODE,
  })
  expect(response.status).toBe(201)
}

describe('GET /api/onboarding', () => {
  it('starts at bienvenida, revision 0', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const response = await t.request('GET', '/api/onboarding')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      step: 'bienvenida',
      chosenKind: null,
      postponed: false,
      revision: 0,
      completedAt: null,
    })
  })
})

describe('POST /api/onboarding/step', () => {
  it('moves on and returns the new state', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const result = await step(t, { expectedRevision: 0, action: 'continuar' })
    expect(result).toEqual({
      status: 200,
      body: expect.objectContaining({ step: 'elegir', revision: 1 }),
    })
    expect(t.onboarding.get().step).toBe('elegir')
  })

  it('elegir without kind → 400 validacion with the field', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await step(t, { expectedRevision: 0, action: 'continuar' })
    const result = await step(t, { expectedRevision: 1, action: 'elegir' })
    expect(result.status).toBe(400)
    expect(result.body.error).toMatchObject({ code: 'validacion', fields: { kind: 'no_valido' } })
  })

  it('an unknown action or a body that is not JSON → 400 validacion', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    expect((await step(t, { expectedRevision: 0, action: 'saltar' })).status).toBe(400)
    const response = await t.app.request('/api/onboarding/step', {
      method: 'POST',
      headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'content-type': 'application/json' },
      body: '{no es json',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'validacion' } })
  })

  it('an action the step does not allow → 400 validacion without guard', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const result = await step(t, { expectedRevision: 0, action: 'volver' })
    expect(result).toEqual({ status: 400, body: { error: { code: 'validacion' } } })
  })

  it('continuar in conectar without a connection → 400 with guard sin_conexion', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const revision = await toConnect(t, 'suscripcion')
    const result = await step(t, { expectedRevision: revision, action: 'continuar' })
    expect(result).toEqual({ status: 400, body: { error: { code: 'validacion', guard: 'sin_conexion' } } })
  })

  it('continuar in limites without limits → 400 with guard sin_limites', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const revision = await toConnect(t, 'pago_por_uso')
    const saved = await t.request('PUT', '/api/ai/connections/pago_por_uso/credential', {
      key: 'sk-ant-api03-FAKE-0123456789',
    })
    expect(saved.status).toBe(200)
    const toLimits = await step(t, { expectedRevision: revision, action: 'continuar' })
    expect(toLimits.body).toMatchObject({ step: 'limites' })
    const result = await step(t, { expectedRevision: toLimits.body.revision, action: 'continuar' })
    expect(result).toEqual({ status: 400, body: { error: { code: 'validacion', guard: 'sin_limites' } } })
    expect(t.connections.active()).toBeNull()
  })

  it('an old revision → 409 conflicto with the current state (two tabs)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await step(t, { expectedRevision: 0, action: 'continuar' })
    const result = await step(t, { expectedRevision: 0, action: 'continuar' })
    expect(result.status).toBe(409)
    expect(result.body.error).toEqual({
      code: 'conflicto',
      current: { step: 'elegir', chosenKind: null, postponed: false, revision: 1, completedAt: null },
    })
  })

  it('leaving conectar with the subscription activates it in the same step', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const revision = await toConnect(t, 'suscripcion')
    await addAccount(t)
    expect(t.connections.get('suscripcion')).toMatchObject({ status: 'conectada', isActive: false })

    const result = await step(t, { expectedRevision: revision, action: 'continuar' })
    expect(result.body).toMatchObject({ step: 'listo', revision: revision + 1 })
    expect(t.connections.active()?.kind).toBe('suscripcion')
  })

  it('a step refused by a guard changes nothing: neither the state nor the active connection', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const revision = await toConnect(t, 'suscripcion')
    await step(t, { expectedRevision: revision, action: 'continuar' })
    expect(t.onboarding.get()).toMatchObject({ step: 'conectar', revision })
    expect(t.connections.active()).toBeNull()
  })
})

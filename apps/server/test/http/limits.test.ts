import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>

const FIXED_NOW = new Date('2026-10-29T10:00:00.000Z')

async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function step(t: TestApp, body: Record<string, unknown>) {
  return call(t, 'POST', '/api/onboarding/step', body)
}

describe('GET /api/settings/limits', () => {
  it('without saved limits → the proposed ones, not accepted', async () => {
    const t = makeTestApp()
    expect(await call(t, 'GET', '/api/settings/limits')).toEqual({
      status: 200,
      body: { perOperationCents: 50, dailyCents: 300, monthlyCents: 2000, accepted: false },
    })
  })
})

describe('PUT /api/settings/limits', () => {
  it('valid limits → accepted, with accepted_at stored', async () => {
    const t = makeTestApp({ now: () => FIXED_NOW })
    const limits = { perOperationCents: 100, dailyCents: 500, monthlyCents: 5000 }
    expect(await call(t, 'PUT', '/api/settings/limits', limits)).toEqual({
      status: 200,
      body: { ...limits, accepted: true },
    })
    expect(t.limits.get()).toEqual({ ...limits, acceptedAt: FIXED_NOW.toISOString() })
    expect(await call(t, 'GET', '/api/settings/limits')).toEqual({ status: 200, body: { ...limits, accepted: true } })
    expect(t.connections.hasLimits()).toBe(true)
  })

  it('changing them replaces the single row', async () => {
    const t = makeTestApp()
    await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 50, dailyCents: 300, monthlyCents: 2000 })
    await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 75, dailyCents: 300, monthlyCents: 2000 })
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM spending_limits').get()).toEqual({ n: 1 })
    expect(t.limits.get()).toMatchObject({ perOperationCents: 75 })
  })

  it('invalid limits → 400 validacion with a code per field, and nothing stored', async () => {
    const t = makeTestApp()
    const result = await call(t, 'PUT', '/api/settings/limits', {
      perOperationCents: 400,
      dailyCents: 300,
      monthlyCents: 100_001,
    })
    expect(result).toEqual({
      status: 400,
      body: {
        error: {
          code: 'validacion',
          fields: { perOperationCents: 'mayor_que_diario', monthlyCents: 'demasiado_alto' },
        },
      },
    })
    expect(t.limits.get()).toBeNull()
  })

  it('a value that is not whole cents → no_valido', async () => {
    const t = makeTestApp()
    const result = await call(t, 'PUT', '/api/settings/limits', {
      perOperationCents: 0.5,
      dailyCents: '300',
      monthlyCents: 2000,
    })
    expect(result).toEqual({
      status: 400,
      body: { error: { code: 'validacion', fields: { perOperationCents: 'no_valido', dailyCents: 'no_valido' } } },
    })
  })
})

describe('the wizard after accepting the limits', () => {
  it('continuar from limites activates pago_por_uso', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await step(t, { expectedRevision: 0, action: 'continuar' })
    await step(t, { expectedRevision: 1, action: 'elegir', kind: 'pago_por_uso' })
    const saved = await t.request('PUT', '/api/ai/connections/pago_por_uso/credential', {
      key: 'sk-ant-api03-FAKE-0123456789',
    })
    expect(saved.status).toBe(200)
    expect((await step(t, { expectedRevision: 2, action: 'continuar' })).body).toMatchObject({ step: 'limites' })

    const accepted = await call(t, 'PUT', '/api/settings/limits', {
      perOperationCents: 50,
      dailyCents: 300,
      monthlyCents: 2000,
    })
    expect(accepted.status).toBe(200)
    const done = await step(t, { expectedRevision: 3, action: 'continuar' })
    expect(done).toMatchObject({ status: 200, body: { step: 'listo' } })
    expect(t.connections.active()?.kind).toBe('pago_por_uso')
  })
})

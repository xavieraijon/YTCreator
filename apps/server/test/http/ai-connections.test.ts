import { statSync } from 'node:fs'
import { join } from 'node:path'
import { FAKE_LOGIN_CODE, FAKE_LOGIN_URL } from '@ytcreator/ai'
import { secretRef } from '@ytcreator/core'
import { accountViewSchema, aiOverviewSchema, connectionViewSchema } from '@ytcreator/core/api'
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

const KEY = 'sk-ant-api03-FAKE-connections-0123456789'
const KEY_REF = secretRef('pago_por_uso', 'anthropic')

// Everything the server answered, to look for credentials in it (SC-006).
function recorder(t: TestApp) {
  const bodies: string[] = []
  return {
    bodies,
    async call(method: string, path: string, body?: unknown) {
      const response = await t.request(method, path, body)
      const text = await response.text()
      bodies.push(text)
      return { status: response.status, body: text ? (JSON.parse(text) as Body) : null }
    },
  }
}

async function login(r: ReturnType<typeof recorder>, code = FAKE_LOGIN_CODE, label?: string) {
  const started = await r.call('POST', '/api/ai/subscription/login', {})
  expect(started.status).toBe(200)
  return r.call('POST', `/api/ai/subscription/login/${started.body!.loginId}/complete`, {
    code,
    ...(label ? { label } : {}),
  })
}

describe('GET /api/ai', () => {
  it('with nothing configured: no connections, no accounts, the CLI status and no limits', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const response = await t.request('GET', '/api/ai')
    expect(response.status).toBe(200)
    const overview = aiOverviewSchema.parse(await response.json())
    expect(overview).toEqual({
      activeKind: null,
      connections: [],
      accounts: [],
      claudeCode: { installed: true, version: '2.1.312', repair: { state: 'inactivo' } },
      hasLimits: false,
    })
  })

  it('lists only the configured connections and the accounts in order, with a 4-character hint', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const r = recorder(t)
    await r.call('PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    await login(r)
    await login(r, FAKE_LOGIN_CODE, 'Trabajo')

    const { body } = await r.call('GET', '/api/ai')
    const overview = aiOverviewSchema.parse(body)
    expect(overview.connections.map((c) => c.kind).sort()).toEqual(['pago_por_uso', 'suscripcion'])
    expect(overview.connections.find((c) => c.kind === 'pago_por_uso')?.hint).toBe(KEY.slice(-4))
    expect(overview.connections.find((c) => c.kind === 'suscripcion')?.hint).toBeNull()
    expect(overview.accounts.map((a) => [a.position, a.label])).toEqual([
      [1, 'Cuenta 1'],
      [2, 'Trabajo'],
    ])
    for (const account of overview.accounts) expect(account.hint).toHaveLength(4)
    expect(r.bodies.join('\n')).not.toContain('FAKE')
  })
})

describe('PUT /api/ai/connections/pago_por_uso/credential', () => {
  it('a good key → conectada, the secret stored, and the connection still inactive', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const r = recorder(t)
    const result = await r.call('PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    expect(result.status).toBe(200)
    expect(connectionViewSchema.parse(result.body)).toMatchObject({
      kind: 'pago_por_uso',
      providerId: 'anthropic',
      isActive: false,
      status: 'conectada',
      hint: KEY.slice(-4),
    })
    const stored = await t.secrets.get(KEY_REF)
    expect(stored.ok && stored.value?.hint()).toBe(KEY.slice(-4))
    expect(t.connections.active()).toBeNull()
    expect(r.bodies.join('\n')).not.toContain(KEY)
  })

  it('trims the spaces around the key before checking and storing it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const result = await t.request('PUT', '/api/ai/connections/pago_por_uso/credential', { key: `  ${KEY}\n ` })
    expect(result.status).toBe(200)
    const stored = await t.secrets.get(KEY_REF)
    expect(stored.ok && stored.value?.hint()).toBe(KEY.slice(-4))
    expect(stored.ok && stored.value?.toString()).toBe('[oculto]')
  })

  it('a bad key → 422 ia with the failure, and neither row nor secret', async () => {
    const t = makeTestApp({ fakeAi: 'sin_sesion:clave_no_valida' })
    const r = recorder(t)
    const result = await r.call('PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    expect(result).toEqual({
      status: 422,
      body: { error: { code: 'ia', failure: { kind: 'sin_sesion', reason: 'clave_no_valida' } } },
    })
    expect(t.connections.get('pago_por_uso')).toBeNull()
    expect(await t.secrets.get(KEY_REF)).toEqual({ ok: true, value: null })
    const log = t.logger.lines.join('\n')
    expect(log).toContain('ai.connection_failed')
    expect(log).not.toContain('FAKE')
  })

  it('an empty key → 400 validacion; another kind → 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const empty = await t.request('PUT', '/api/ai/connections/pago_por_uso/credential', { key: '   ' })
    expect(empty.status).toBe(400)
    expect(await empty.json()).toEqual({ error: { code: 'validacion', fields: { key: 'longitud_no_valida' } } })
    const other = await t.request('PUT', '/api/ai/connections/suscripcion/credential', { key: KEY })
    expect(other.status).toBe(404)
  })
})

describe('subscription login', () => {
  it('start gives the link; complete with the right code → 201 AccountView and the suscripcion connection', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const r = recorder(t)
    const started = await r.call('POST', '/api/ai/subscription/login', {})
    expect(started.body).toEqual({ loginId: expect.any(String), url: FAKE_LOGIN_URL, expiresAt: expect.any(String) })

    const result = await r.call('POST', `/api/ai/subscription/login/${started.body!.loginId}/complete`, {
      code: ` ${FAKE_LOGIN_CODE} `,
    })
    expect(result.status).toBe(201)
    const account = accountViewSchema.parse(result.body)
    expect(account).toMatchObject({ label: 'Cuenta 1', position: 1, status: 'conectada' })
    expect(account.hint).toHaveLength(4)
    expect(t.connections.get('suscripcion')).toMatchObject({
      providerId: 'claude-code',
      status: 'conectada',
      isActive: false,
      secretRef: null,
    })

    const row = t.accounts.get(account.id)!
    expect(row.secretRef).toBe(secretRef('cuenta', account.id))
    expect(row.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    const stored = await t.secrets.get(row.secretRef)
    expect(stored.ok && stored.value?.hint()).toBe(account.hint)
    expect(statSync(join(t.claudeAccountsDir, account.id)).mode & 0o777).toBe(0o700)
    expect(r.bodies.join('\n')).not.toContain('FAKE')
  })

  it('a wrong code → 422 ia with codigo_no_valido and no account', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const result = await login(recorder(t), 'WXYZ-0000')
    expect(result).toEqual({
      status: 422,
      body: { error: { code: 'ia', failure: { kind: 'sin_sesion', reason: 'codigo_no_valido' } } },
    })
    expect(t.accounts.count('claude-code')).toBe(0)
    expect(t.connections.get('suscripcion')).toBeNull()
  })

  it('the same account twice → 409 conflicto, and the second is not stored', async () => {
    const t = makeTestApp({ fakeAi: 'login:duplicada' })
    const r = recorder(t)
    expect((await login(r)).status).toBe(201)
    expect(await login(r)).toEqual({ status: 409, body: { error: { code: 'conflicto' } } })
    expect(t.accounts.count('claude-code')).toBe(1)
  })

  it('a sixth account → 400 with guard maximo_de_cuentas', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const r = recorder(t)
    for (let n = 1; n <= 5; n++) expect((await login(r)).status).toBe(201)
    expect(await login(r)).toEqual({ status: 400, body: { error: { code: 'validacion', guard: 'maximo_de_cuentas' } } })
    expect(t.accounts.count('claude-code')).toBe(5)
  })

  it('a new login cancels the previous one: its code no longer works', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const r = recorder(t)
    const first = await r.call('POST', '/api/ai/subscription/login', {})
    const second = await r.call('POST', '/api/ai/subscription/login', {})
    expect(second.body!.loginId).not.toBe(first.body!.loginId)
    const stale = await r.call('POST', `/api/ai/subscription/login/${first.body!.loginId}/complete`, {
      code: FAKE_LOGIN_CODE,
    })
    expect(stale.status).toBe(422)
  })

  it('DELETE cancels the login → 204, and completing it afterwards fails', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const r = recorder(t)
    const started = await r.call('POST', '/api/ai/subscription/login', {})
    const cancelled = await t.request('DELETE', `/api/ai/subscription/login/${started.body!.loginId}`)
    expect(cancelled.status).toBe(204)
    const late = await r.call('POST', `/api/ai/subscription/login/${started.body!.loginId}/complete`, {
      code: FAKE_LOGIN_CODE,
    })
    expect(late.status).toBe(422)
  })

  it('an account whose check fails is kept, with its status; the connection sums it up', async () => {
    const t = makeTestApp({ fakeAi: 'cuentas:cupo:2026-11-01T00:00:00.000Z' })
    const result = await login(recorder(t))
    expect(result.status).toBe(201)
    expect(result.body).toMatchObject({ status: 'cupo_agotado', resetsAt: '2026-11-01T00:00:00.000Z' })
    expect(t.connections.get('suscripcion')).toMatchObject({ status: 'cupo_agotado' })
  })

  it('a label longer than 40 characters → 400 with longitud_no_valida', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const result = await login(recorder(t), FAKE_LOGIN_CODE, 'x'.repeat(41))
    expect(result).toEqual({
      status: 400,
      body: { error: { code: 'validacion', fields: { label: 'longitud_no_valida' } } },
    })
  })
})

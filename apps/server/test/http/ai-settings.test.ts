import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FAKE_LOGIN_CODE } from '@ytcreator/ai'
import { Secret, secretRef } from '@ytcreator/core'
import {
  accountViewSchema,
  aiOverviewSchema,
  checkConnectionResponseSchema,
  connectionViewSchema,
} from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { secretFingerprint } from '../../src/secrets/fingerprint.ts'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>

interface Body {
  loginId?: string
  error?: Record<string, unknown>
  [field: string]: unknown
}

const KEY = 'sk-ant-api03-FAKE-settings-0123456789'
const KEY_REF = secretRef('pago_por_uso', 'anthropic')
const LIMITS = { perOperationCents: 50, dailyCents: 300, monthlyCents: 2000 }

async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  const text = await response.text()
  return { status: response.status, body: text ? (JSON.parse(text) as Body) : null }
}

async function login(t: TestApp, label?: string) {
  const started = await call(t, 'POST', '/api/ai/subscription/login', {})
  return call(t, 'POST', `/api/ai/subscription/login/${started.body!.loginId}/complete`, {
    code: FAKE_LOGIN_CODE,
    ...(label ? { label } : {}),
  })
}

async function relogin(t: TestApp, accountId: string) {
  const started = await call(t, 'POST', `/api/ai/subscription/accounts/${accountId}/login`, {})
  expect(started.status).toBe(200)
  return call(t, 'POST', `/api/ai/subscription/login/${started.body!.loginId}/complete`, { code: FAKE_LOGIN_CODE })
}

const accountIds = (t: TestApp) => t.accounts.list('claude-code').map((a) => a.id)

describe('POST /api/ai/active', () => {
  it('without that connection conectada → 400 with guard sin_conexion', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const result = await call(t, 'POST', '/api/ai/active', { kind: 'suscripcion' })
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: { code: 'validacion', guard: 'sin_conexion' } })
  })

  it('pago_por_uso without spending limits → 400 with guard sin_limites', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    const result = await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: { code: 'validacion', guard: 'sin_limites' } })
  })

  it('switches between both options and keeps the other one connected (FR-026)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await login(t)
    await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    await call(t, 'PUT', '/api/settings/limits', LIMITS)

    const toKey = await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })
    expect(toKey.status).toBe(200)
    const overview = aiOverviewSchema.parse(toKey.body)
    expect(overview.activeKind).toBe('pago_por_uso')
    expect(overview.connections.map((c) => [c.kind, c.status]).sort()).toEqual([
      ['pago_por_uso', 'conectada'],
      ['suscripcion', 'conectada'],
    ])
    expect(overview.accounts).toHaveLength(1)

    const back = await call(t, 'POST', '/api/ai/active', { kind: 'suscripcion' })
    expect(aiOverviewSchema.parse(back.body).activeKind).toBe('suscripcion')
  })
})

describe('POST /api/ai/connections/:kind/check', () => {
  it('cuentas:cupo,ok → moves on to the second account, says so and stores both states (SC-012)', async () => {
    const t = makeTestApp({ fakeAi: 'cuentas:cupo,ok' })
    await login(t)
    await login(t)
    const [first, second] = accountIds(t)
    // The first account worked last time; its quota runs out now.
    t.accounts.updateStatus(first!, { ok: true })

    const result = await call(t, 'POST', '/api/ai/connections/suscripcion/check', {})
    expect(result.status).toBe(200)
    const view = checkConnectionResponseSchema.parse(result.body)
    expect(view).toMatchObject({ kind: 'suscripcion', status: 'conectada' })
    expect(view.switched).toEqual([{ fromId: first, toId: second, reason: 'cupo_agotado' }])

    const [one, two] = t.accounts.list('claude-code')
    expect(one).toMatchObject({ status: 'cupo_agotado', reason: 'limite_de_uso' })
    expect(Date.parse(one!.resetsAt!)).toBeGreaterThan(Date.now())
    expect(two).toMatchObject({ status: 'conectada' })
  })

  it('without a switch there is no switched field, and a failed check is still a 200', async () => {
    const t = makeTestApp({ fakeAi: 'no_disponible:sin_conexion' })
    await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY }).then((r) =>
      expect(r.status).toBe(422),
    )
    // The key never got stored; put it in place by hand to check it.
    await t.secrets.set(KEY_REF, Secret.from(KEY))
    t.connections.upsertKey('pago_por_uso', 'anthropic', KEY_REF, KEY.slice(-4))

    const result = await call(t, 'POST', '/api/ai/connections/pago_por_uso/check', {})
    expect(result.status).toBe(200)
    expect(result.body).not.toHaveProperty('switched')
    expect(connectionViewSchema.parse(result.body)).toMatchObject({ status: 'no_disponible', reason: 'sin_conexion' })
  })

  it('an unknown kind or a connection that does not exist → 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    expect((await call(t, 'POST', '/api/ai/connections/gratis/check', {})).status).toBe(404)
    expect((await call(t, 'POST', '/api/ai/connections/pago_por_uso/check', {})).status).toBe(404)
  })
})

describe('DELETE /api/ai/connections/:kind/credential', () => {
  it('removes the secret and the row; if it was active, nothing is active any more', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    await call(t, 'PUT', '/api/settings/limits', LIMITS)
    await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })

    const result = await call(t, 'DELETE', '/api/ai/connections/pago_por_uso/credential')
    expect(result.status).toBe(204)
    expect(await t.secrets.get(KEY_REF)).toEqual({ ok: true, value: null })
    expect(t.connections.get('pago_por_uso')).toBeNull()
    expect(aiOverviewSchema.parse((await call(t, 'GET', '/api/ai')).body).activeKind).toBeNull()
  })

  it('the key in use with the subscription working → the subscription takes over', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await login(t)
    await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    await call(t, 'PUT', '/api/settings/limits', LIMITS)
    await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })

    expect((await call(t, 'DELETE', '/api/ai/connections/pago_por_uso/credential')).status).toBe(204)
    expect(aiOverviewSchema.parse((await call(t, 'GET', '/api/ai')).body).activeKind).toBe('suscripcion')
  })

  it('a key that is not in use → the option in use does not change', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await login(t)
    await call(t, 'POST', '/api/ai/active', { kind: 'suscripcion' })
    await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })

    expect((await call(t, 'DELETE', '/api/ai/connections/pago_por_uso/credential')).status).toBe(204)
    expect(aiOverviewSchema.parse((await call(t, 'GET', '/api/ai')).body).activeKind).toBe('suscripcion')
  })

  it('without a key stored → 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    expect((await call(t, 'DELETE', '/api/ai/connections/pago_por_uso/credential')).status).toBe(404)
  })
})

describe('subscription accounts', () => {
  it('PATCH order with an exact permutation → the new positions', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await login(t, 'Uno')
    await login(t, 'Dos')
    await login(t, 'Tres')
    const [a, b, c] = accountIds(t)

    const result = await call(t, 'PATCH', '/api/ai/subscription/accounts/order', { ids: [c, a, b] })
    expect(result.status).toBe(200)
    const views = accountViewSchema.array().parse(result.body)
    expect(views.map((v) => [v.position, v.label])).toEqual([
      [1, 'Tres'],
      [2, 'Uno'],
      [3, 'Dos'],
    ])
  })

  it.each([
    ['one missing', (ids: string[]) => ids.slice(1)],
    ['one repeated', (ids: string[]) => [ids[0]!, ids[0]!]],
    ['an unknown id', (ids: string[]) => [ids[0]!, 'otra']],
  ])('PATCH order with %s → 400 and nothing moves', async (_, change) => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await login(t)
    await login(t)
    const ids = accountIds(t)
    const result = await call(t, 'PATCH', '/api/ai/subscription/accounts/order', { ids: change(ids) })
    expect(result.status).toBe(400)
    expect(result.body?.error).toMatchObject({ code: 'validacion' })
    expect(accountIds(t)).toEqual(ids)
  })

  it('PATCH :id renames; a label of 0 or 41 characters → 400 longitud_no_valida', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await login(t)
    const [id] = accountIds(t)

    const renamed = await call(t, 'PATCH', `/api/ai/subscription/accounts/${id}`, { label: 'Personal' })
    expect(renamed.status).toBe(200)
    expect(accountViewSchema.parse(renamed.body).label).toBe('Personal')

    for (const label of ['', 'x'.repeat(41)]) {
      const result = await call(t, 'PATCH', `/api/ai/subscription/accounts/${id}`, { label })
      expect(result.status).toBe(400)
      expect(result.body).toEqual({ error: { code: 'validacion', fields: { label: 'longitud_no_valida' } } })
    }
    expect(t.accounts.get(id!)?.label).toBe('Personal')
  })

  it('DELETE :id removes secret and folder, and packs the positions again', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await login(t, 'Uno')
    await login(t, 'Dos')
    await login(t, 'Tres')
    const [, middle] = t.accounts.list('claude-code')

    const result = await call(t, 'DELETE', `/api/ai/subscription/accounts/${middle!.id}`)
    expect(result.status).toBe(204)
    expect(await t.secrets.get(middle!.secretRef)).toEqual({ ok: true, value: null })
    expect(existsSync(join(t.claudeAccountsDir, middle!.id))).toBe(false)
    expect(t.accounts.list('claude-code').map((a) => [a.position, a.label])).toEqual([
      [1, 'Uno'],
      [2, 'Tres'],
    ])
  })

  it('deleting the last account → suscripcion is sin_sesion / sesion_caducada and no longer active', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await login(t)
    await call(t, 'POST', '/api/ai/active', { kind: 'suscripcion' })
    const [id] = accountIds(t)

    expect((await call(t, 'DELETE', `/api/ai/subscription/accounts/${id}`)).status).toBe(204)
    const overview = aiOverviewSchema.parse((await call(t, 'GET', '/api/ai')).body)
    expect(overview.activeKind).toBeNull()
    expect(overview.accounts).toEqual([])
    expect(overview.connections.find((c) => c.kind === 'suscripcion')).toMatchObject({
      status: 'sin_sesion',
      reason: 'sesion_caducada',
      isActive: false,
    })
  })

  it('deleting the last account in use with the key working → pago_por_uso takes over if it has limits', async () => {
    const withLimits = makeTestApp({ fakeAi: 'ok' })
    await login(withLimits)
    await call(withLimits, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    await call(withLimits, 'PUT', '/api/settings/limits', LIMITS)
    await call(withLimits, 'POST', '/api/ai/active', { kind: 'suscripcion' })
    await call(withLimits, 'DELETE', `/api/ai/subscription/accounts/${accountIds(withLimits)[0]}`)
    expect(aiOverviewSchema.parse((await call(withLimits, 'GET', '/api/ai')).body).activeKind).toBe('pago_por_uso')

    const withoutLimits = makeTestApp({ fakeAi: 'ok' })
    await login(withoutLimits)
    await call(withoutLimits, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: KEY })
    await call(withoutLimits, 'POST', '/api/ai/active', { kind: 'suscripcion' })
    await call(withoutLimits, 'DELETE', `/api/ai/subscription/accounts/${accountIds(withoutLimits)[0]}`)
    expect(aiOverviewSchema.parse((await call(withoutLimits, 'GET', '/api/ai')).body).activeKind).toBeNull()
  })

  it('POST :id/check checks that account only, without rotating', async () => {
    const t = makeTestApp({ fakeAi: 'cuentas:cupo,ok' })
    await login(t)
    await login(t)
    const [first, second] = t.accounts.list('claude-code')
    t.accounts.updateStatus(second!.id, { ok: false, failure: { kind: 'sin_sesion', reason: 'sesion_caducada' } })

    const result = await call(t, 'POST', `/api/ai/subscription/accounts/${first!.id}/check`, {})
    expect(result.status).toBe(200)
    expect(accountViewSchema.parse(result.body)).toMatchObject({ id: first!.id, status: 'cupo_agotado' })
    expect(t.accounts.get(second!.id)).toMatchObject({ status: 'sin_sesion', reason: 'sesion_caducada' })
  })

  it('POST :id/login + complete renews the token of that account: 200, same label and position', async () => {
    const t = makeTestApp({ fakeAi: 'cuentas:sin_sesion:sesion_caducada' })
    await login(t, 'Personal')
    const before = t.accounts.list('claude-code')[0]!
    expect(before.status).toBe('sin_sesion')

    const result = await relogin(t, before.id)
    expect(result.status).toBe(200)
    expect(accountViewSchema.parse(result.body)).toMatchObject({
      id: before.id,
      label: 'Personal',
      position: 1,
      status: 'conectada',
    })
    const after = t.accounts.get(before.id)!
    expect(after.fingerprint).not.toBe(before.fingerprint)
    expect(after.secretRef).toBe(before.secretRef)
    expect(t.accounts.count('claude-code')).toBe(1)
  })

  it('a re-login that gives the same access again → 200 without a new account', async () => {
    const t = makeTestApp({ fakeAi: 'login:duplicada' })
    await login(t)
    const [id] = accountIds(t)
    const result = await relogin(t, id!)
    expect(result.status).toBe(200)
    expect(accountIds(t)).toEqual([id])
  })

  it('a re-login with the access of another row → 409 conflicto and the account does not change', async () => {
    const t = makeTestApp({ fakeAi: 'login:duplicada' })
    await login(t) // always the same access: FAKE-1
    const other = 'otra-cuenta'
    const otherRef = secretRef('cuenta', other)
    const otherToken = Secret.from('sk-ant-oat-FAKE-9-otra')
    await t.secrets.set(otherRef, otherToken)
    t.accounts.create({
      id: other,
      providerId: 'claude-code',
      fingerprint: secretFingerprint(otherToken),
      secretRef: otherRef,
      hint: otherToken.hint(),
    })
    const before = t.accounts.get(other)

    const result = await relogin(t, other)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: { code: 'conflicto' } })
    expect(t.accounts.get(other)).toEqual(before)
    const stored = await t.secrets.get(otherRef)
    expect(stored.ok && stored.value?.hint()).toBe(otherToken.hint())
  })

  it('an id that does not exist → 404 everywhere', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const base = '/api/ai/subscription/accounts/no-existe'
    expect((await call(t, 'PATCH', base, { label: 'x' })).status).toBe(404)
    expect((await call(t, 'DELETE', base)).status).toBe(404)
    expect((await call(t, 'POST', `${base}/check`, {})).status).toBe(404)
    expect((await call(t, 'POST', `${base}/login`, {})).status).toBe(404)
  })
})

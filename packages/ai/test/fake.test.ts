import { Secret, type ProviderDeps } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { createFakeLogin, FAKE_LOGIN_CODE } from '../src/fake/fake-login.ts'
import { createFakeProvider } from '../src/fake/fake-provider.ts'
import { parseScenario } from '../src/fake/scenarios.ts'

const NOW = new Date('2026-10-28T10:00:00.000Z')
const deps: ProviderDeps = {
  fetch: (() => Promise.reject(new Error('sin red'))) as typeof fetch,
  now: () => NOW,
  logger: { info() {}, warn() {}, error() {} },
}

describe('parseScenario', () => {
  it('reads every documented form', () => {
    expect(parseScenario('ok').accounts).toEqual([{ type: 'ok' }])
    expect(parseScenario('sin_sesion:clave_no_valida').accounts).toEqual([
      { type: 'fail', failure: { kind: 'sin_sesion', reason: 'clave_no_valida' } },
    ])
    expect(parseScenario('cupo:2026-10-28T12:00:00.000Z').accounts).toEqual([
      { type: 'cupo', resetsAt: '2026-10-28T12:00:00.000Z' },
    ])
    expect(parseScenario('cuentas:cupo,ok').accounts).toEqual([{ type: 'cupo' }, { type: 'ok' }])
    expect(parseScenario('lento').accounts).toEqual([{ type: 'lento' }])
    expect(parseScenario('login:duplicada').login).toBe('duplicada')
  })

  it('refuses unknown names, reasons of another kind and bad dates', () => {
    for (const name of ['', 'nada', 'sin_sesion:sin_saldo', 'cupo:mañana', 'cuentas:', 'login:otro']) {
      expect(() => parseScenario(name)).toThrow()
    }
  })
})

describe('fake provider', () => {
  it('gives each subscription account its own outcome with cuentas:', async () => {
    const scenario = parseScenario('cuentas:cupo,ok')
    const login = createFakeLogin(scenario, () => NOW)
    const tokens: Secret[] = []
    for (let i = 0; i < 2; i++) {
      const started = await login.start()
      if (!started.ok) throw new Error('start')
      const done = await login.complete(started.value.loginId, Secret.from(FAKE_LOGIN_CODE))
      if (!done.ok) throw new Error('complete')
      tokens.push(done.token)
    }
    const first = await createFakeProvider(scenario, tokens[0]!, deps).check()
    const second = await createFakeProvider(scenario, tokens[1]!, deps).check()
    expect(first).toEqual({
      ok: false,
      failure: { kind: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: '2026-10-28T11:00:00.000Z' },
    })
    expect(second).toEqual({ ok: true })
  })

  it('lento answers tiempo_agotado when aborted', async () => {
    const controller = new AbortController()
    const pending = createFakeProvider(parseScenario('lento'), Secret.from('AIzaFAKE-0123456789'), {
      ...deps,
      aiTimeoutSeconds: 300,
    }).check(controller.signal)
    controller.abort()
    expect(await pending).toEqual({ ok: false, failure: { kind: 'tiempo_agotado', reason: 'respuesta_lenta' } })
  })
})

describe('fake login', () => {
  async function loginWith(scenarioName: string, code = FAKE_LOGIN_CODE, now = () => NOW) {
    const login = createFakeLogin(parseScenario(scenarioName), now)
    const started = await login.start()
    if (!started.ok) throw new Error('start')
    return { login, started: started.value, result: () => login.complete(started.value.loginId, Secret.from(code)) }
  }

  it('gives a fake token for the fixed code, with a fixed link that expires in 10 minutes', async () => {
    const { started, result } = await loginWith('ok')
    expect(started.url).toMatch(/^https:\/\/example\.invalid\//)
    expect(started.expiresAt).toBe('2026-10-28T10:10:00.000Z')
    const done = await result()
    expect(done.ok && done.token.reveal()).toMatch(/^sk-ant-oat-FAKE-1-/)
  })

  it('refuses a wrong code, any code with codigo_malo, and a code after expiry', async () => {
    const bad = { ok: false, failure: { kind: 'sin_sesion', reason: 'codigo_no_valido' } }
    expect(await (await loginWith('ok', 'WXYZ-0000')).result()).toEqual(bad)
    expect(await (await loginWith('login:codigo_malo')).result()).toEqual(bad)
    let now = NOW
    const late = await loginWith('ok', FAKE_LOGIN_CODE, () => now)
    now = new Date(NOW.getTime() + 10 * 60 * 1000)
    expect(await late.result()).toEqual(bad)
  })

  it('keeps one login at a time: starting again cancels the open one', async () => {
    const { login, started } = await loginWith('ok')
    await login.start()
    expect((await login.complete(started.loginId, Secret.from(FAKE_LOGIN_CODE))).ok).toBe(false)
  })

  it('duplicada always gives the same token', async () => {
    const login = createFakeLogin(parseScenario('login:duplicada'), () => NOW)
    const tokens: string[] = []
    for (let i = 0; i < 2; i++) {
      const started = await login.start()
      if (!started.ok) throw new Error('start')
      const done = await login.complete(started.value.loginId, Secret.from(FAKE_LOGIN_CODE))
      if (done.ok) tokens.push(done.token.reveal())
    }
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toBe(tokens[1])
  })
})

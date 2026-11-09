import {
  CHANNEL_OUTPUTS,
  anglesOutputFor,
  checkClaims,
  ideasOutputFor,
  Secret,
  type AiRequest,
  type ChannelOutput,
  type ChannelUse,
  type IdeasOutput,
  type ProviderDeps,
} from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { createFakeLogin, FAKE_LOGIN_CODE } from '../src/fake/fake-login.ts'
import { createFakeProvider } from '../src/fake/fake-provider.ts'
import { fakeChannelOutput } from '../src/fake/outputs.ts'
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
    expect(parseScenario('ok').output).toBe('normal')
    for (const mode of ['cifra_inventada', 'salida_rota', 'limite_de_gasto'] as const) {
      expect(parseScenario(mode)).toEqual({ name: mode, accounts: [{ type: 'ok' }], login: 'ok', output: mode })
    }
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
    const pending = createFakeProvider(parseScenario('lento'), Secret.from('sk-ant-api03-FAKE-0123456789'), {
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

describe('fake provider: channel uses', () => {
  const KEY = Secret.from('sk-ant-api03-FAKE-0123456789')
  const input = { videos: [{ videoId: 'vid-xyz' }] }
  const uses = Object.keys(CHANNEL_OUTPUTS) as ChannelUse[]
  const request = <U extends ChannelUse>(use: U): AiRequest<ChannelOutput<U>> => ({
    use,
    prompt: { id: use, version: 1, text: 'Prueba.' },
    input,
    schema: CHANNEL_OUTPUTS[use] as unknown as AiRequest<ChannelOutput<U>>['schema'],
  })

  it('answers every channel use with an output its schema accepts and no invented figure', async () => {
    const provider = createFakeProvider(parseScenario('ok'), KEY, deps)
    for (const use of uses) {
      const result = await provider.generate(request(use))
      expect(result.ok, use).toBe(true)
      if (result.ok) expect(checkClaims(result.value, input), use).toEqual([])
    }
  })

  it('cites the videos of the input in the readings', async () => {
    const result = await createFakeProvider(parseScenario('ok'), KEY, deps).generate(request('lectura_canal'))
    expect(result.ok && result.value.niche.videoIds).toEqual(['vid-xyz'])
  })

  it('cifra_inventada puts a figure the validator catches', async () => {
    const provider = createFakeProvider(parseScenario('cifra_inventada'), KEY, deps)
    for (const use of uses) {
      const result = await provider.generate(request(use))
      expect(result.ok, use).toBe(true)
      if (result.ok) expect(checkClaims(result.value, input).length, use).toBeGreaterThan(0)
    }
  })

  it('salida_rota fails the schema twice and gives invalidOutput', async () => {
    const result = await createFakeProvider(parseScenario('salida_rota'), KEY, deps).generate(request('nichos'))
    expect(result).toMatchObject({ ok: false, invalidOutput: true })
  })

  it('limite_de_gasto reports a usage that blows any daily limit', async () => {
    const result = await createFakeProvider(parseScenario('limite_de_gasto'), KEY, deps).generate(request('nichos'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.usage.inputTokens).toBeGreaterThanOrEqual(1_000_000)
  })

  it('pilar_invalido names a pillar out of the profile first, and a valid one when asked again', async () => {
    const profile = { pillars: ['Cenas rápidas', 'Táper'] }
    const strict = ideasOutputFor(profile.pillars)
    const result = await createFakeProvider(parseScenario('pilar_invalido'), KEY, deps).generate({
      use: 'ideas',
      prompt: { id: 'ideas', version: 1, text: 'Prueba.' },
      input: { profile },
      schema: strict as unknown as AiRequest<IdeasOutput>['schema'],
    })
    expect(result.ok).toBe(true)
    expect(strict.safeParse(fakeChannelOutput('ideas', { profile }, 'pilar_invalido', 1)).success).toBe(false)
    const angles = anglesOutputFor(profile.pillars)
    expect(angles.safeParse(fakeChannelOutput('otro_enfoque', { profile }, 'pilar_invalido', 1)).success).toBe(false)
    expect(angles.safeParse(fakeChannelOutput('otro_enfoque', { profile }, 'pilar_invalido', 2)).success).toBe(true)
  })

  it('ideas_repetidas repeats two ideas of the bank', () => {
    const avoid = [{ title: 'Mi idea uno' }, { title: 'Mi idea dos' }]
    const output = fakeChannelOutput('ideas', { avoid }, 'ideas_repetidas') as IdeasOutput
    expect(output.ideas.map((idea) => idea.title).slice(0, 2)).toEqual(['Mi idea uno', 'Mi idea dos'])
  })

  it('gives only shorts to a channel with no long videos', () => {
    const output = fakeChannelOutput('ideas', { profile: { rhythm: { longPerWeek: 0 } } }, 'normal') as IdeasOutput
    expect(new Set(output.ideas.map((idea) => idea.format))).toEqual(new Set(['short']))
  })

  it('keeps answering listo for comprobacion', async () => {
    const result = await createFakeProvider(parseScenario('cifra_inventada'), KEY, deps).generate({
      use: 'comprobacion',
      prompt: { id: 'comprobacion', version: 1, text: 'Responde listo.' },
    })
    expect(result).toMatchObject({ ok: true, value: 'listo' })
  })
})

import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Secret, type Logger, type ProviderDeps } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { createClaudeCodeProvider } from '../../src/claude-code/adapter.ts'
import { createClaudeLogin, extractToken } from '../../src/claude-code/login.ts'
import { resolveProfile } from '../../src/profiles.ts'
import { createFakeClaude, isAlive, mkdtemp, type FakeClaudeState } from '../claude-bin.ts'
import { INVALID_OUTPUT, runProviderContract, useOutputs, VALID_OUTPUT, type BaseCase } from './battery.ts'

const TOKEN = 'sk-ant-oat01-FAKE-contract-0123456789'
// The token of the recorded `setup-token` screen (fixtures/claude-code/setup-token/success.log).
const RECORDED_TOKEN = `sk-ant-oat01-${'FAKEfixture'.repeat(6)}FAKEfixtureFAKEfixtureAA`
const LOGIN_CODE = 'codigo-FAKE-1234'

const STATES: Record<BaseCase, FakeClaudeState> = {
  valid_credential: { scenario: 'ok' },
  invalid_credential: { scenario: 'fixture:invalid-token' },
  no_permission: { scenario: 'status:403' },
  quota: { scenario: 'status:429' },
  offline: { scenario: 'fixture:offline' },
  timeout: { scenario: 'hang' },
  service_down: { scenario: 'status:529' },
  filtered: { scenario: 'refusal' },
  unknown_error: { scenario: 'garbage' },
  output_valid: { scenario: 'output', outputs: [VALID_OUTPUT] },
  output_invalid_then_valid: { scenario: 'output', outputs: [INVALID_OUTPUT, VALID_OUTPUT] },
  output_invalid_twice: { scenario: 'output', outputs: [INVALID_OUTPUT, INVALID_OUTPUT] },
}

// The env of the server, with everything that could switch the CLI to another account or provider (CC1).
const SERVER_ENV = {
  PATH: process.env.PATH,
  HOME: '/home/creador',
  LANG: 'es_ES.UTF-8',
  ANTHROPIC_API_KEY: 'sk-ant-api03-FAKE-server-env',
  ANTHROPIC_AUTH_TOKEN: 'FAKE-auth-token',
  ANTHROPIC_BASE_URL: 'https://example.invalid',
  CLAUDE_CODE_USE_BEDROCK: '1',
  CLAUDE_CODE_USE_VERTEX: '1',
  CLAUDE_EFFORT: 'high',
  MAX_THINKING_TOKENS: '32000',
}

const silent: Logger = { info() {}, warn() {}, error() {} }

function depsFor(bin: string, accountDir = mkdtemp('ytc-account-')): ProviderDeps {
  return { fetch, now: () => new Date(), logger: silent, claudeBin: bin, accountDir }
}

runProviderContract('claude-code', (stub, deps) => {
  const outputs = useOutputs(stub)
  const fake = createFakeClaude(outputs ? { scenario: 'output', outputs } : STATES[stub as BaseCase])
  const aiTimeoutSeconds = stub === 'timeout' ? 1 : undefined
  const provider = createClaudeCodeProvider(
    Secret.from(TOKEN),
    { ...deps, claudeBin: fake.bin, accountDir: mkdtemp('ytc-account-'), aiTimeoutSeconds },
    { env: SERVER_ENV },
  )
  const timeoutMs = resolveProfile('claude-code', 'comprobacion', { aiTimeoutSeconds }).timeoutMs
  return { provider, calls: () => fake.calls().length, credential: TOKEN, timeoutMs }
})

describe('claude-code: casos propios', () => {
  it('CC1 entorno limpio, con el token y la carpeta de la cuenta', async () => {
    const fake = createFakeClaude()
    const accountDir = mkdtemp('ytc-account-')
    const provider = createClaudeCodeProvider(Secret.from(TOKEN), depsFor(fake.bin, accountDir), { env: SERVER_ENV })
    expect(await provider.check()).toEqual({ ok: true })

    const [call] = fake.calls()
    expect(call!.env).toMatchObject({
      CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
      CLAUDE_CONFIG_DIR: accountDir,
      CLAUDE_CODE_MAX_RETRIES: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
      DISABLE_AUTOUPDATER: '1',
      HOME: '/home/creador',
      LANG: 'es_ES.UTF-8',
    })
    for (const name of Object.keys(call!.env)) {
      expect(name).not.toMatch(/^(ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_EFFORT$|MAX_THINKING_TOKENS$)/)
    }
    expect(call!.argv).toEqual(expect.arrayContaining(['-p', '--model', 'claude-haiku-5-5', '--effort', 'low']))
  })

  it('CC2 binario ausente → programa_no_instalado, sin lanzar', async () => {
    const provider = createClaudeCodeProvider(Secret.from(TOKEN), depsFor('/no/existe/claude'), { env: SERVER_ENV })
    expect(await provider.check()).toEqual({
      ok: false,
      failure: { kind: 'no_disponible', reason: 'programa_no_instalado' },
    })
  })

  it('CC3 el token no aparece en los argumentos; el prompt va por la entrada estándar', async () => {
    const fake = createFakeClaude()
    const provider = createClaudeCodeProvider(Secret.from(TOKEN), depsFor(fake.bin), { env: SERVER_ENV })
    await provider.check()
    const [call] = fake.calls()
    expect(call!.argv.join(' ')).not.toContain(TOKEN)
    expect(call!.prompt).toContain('listo')
  })

  it('pide la salida estructurada con --json-schema y devuelve el texto sin esquema', async () => {
    const fake = createFakeClaude({ scenario: 'ok', text: 'hola' })
    const provider = createClaudeCodeProvider(Secret.from(TOKEN), depsFor(fake.bin), { env: SERVER_ENV })
    const result = await provider.generate({
      use: 'comprobacion',
      prompt: { id: 'prueba', version: 1, text: 'di hola' },
    })
    expect(result).toMatchObject({ ok: true, value: 'hola' })
    expect(fake.calls()[0]!.argv).not.toContain('--json-schema')
  })
})

describe('claude-code: inicio de sesión', () => {
  const loginFor = (state: FakeClaudeState, overrides: Partial<Parameters<typeof createClaudeLogin>[0]> = {}) => {
    const fake = createFakeClaude({ loginCode: LOGIN_CODE, ...state })
    const login = createClaudeLogin({ logger: silent, claudeBin: fake.bin, env: SERVER_ENV, ...overrides })
    return { fake, login }
  }

  it('extrae el token partido en líneas de la salida grabada', async () => {
    const log = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'claude-code', 'setup-token', 'success.log'))
    expect(extractToken(log.toString('utf8'))).toBe(RECORDED_TOKEN)
  })

  // The screen of 2.1.314, as the masked T158 diagnostic showed it: the token on one line and no colour reset after
  // it, only the colour of the next line.
  it('extrae el token de la salida de la 2.1.314, sin reset de color tras él', () => {
    const token = `sk-ant-oat01-${'FAKE314-token_'.repeat(6)}AA`
    const screen =
      `\x1b[1C\x1b[1BYour\x1b[7GOAuth\x1b[13Gtoken\x1b[19G(valid\x1b[26Gfor\x1b[30G1\x1b[32Gyear):\r\x1b[1C\x1b[1B\x1b[K` +
      `\r\x1b[1C\x1b[1B\x1b[38;2;255;193;7m${token}\r\x1b[1C\x1b[2B\x1b[38;2;153;153;153mStore this token securely.\x1b[39m`
    expect(extractToken(screen)).toBe(token)
  })

  it('no da por bueno un token a medio llegar', () => {
    expect(extractToken(`\x1b[38;2;255;193;7msk-ant-oat01-${'FAKEhalf'.repeat(4)}`)).toBeNull()
  })

  it('CC4 enlace → código → token', async () => {
    const { fake, login } = loginFor({})
    const started = await login.start()
    expect(started.ok).toBe(true)
    if (!started.ok) return
    expect(started.value.url).toMatch(/^https:\/\/claude\.com\/cai\/oauth\/authorize\?code=true&client_id=FAKE0fixture/)

    const result = await login.complete(started.value.loginId, Secret.from(LOGIN_CODE))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.token.reveal()).toBe(RECORDED_TOKEN)
    await expect.poll(() => isAlive(fake.loginPid()!)).toBe(false)
  }, 30_000)

  // «Reparar» installs it while the server runs: the path is looked up again on each login, not once (T158).
  it('encuentra Claude Code instalado después de crear el inicio de sesión', async () => {
    const home = mkdtemp('ytc-home-')
    const login = createClaudeLogin({ logger: silent, env: { PATH: '/usr/bin:/bin', HOME: home } })
    const fake = createFakeClaude({ loginCode: LOGIN_CODE })
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    symlinkSync(fake.bin, join(home, '.local', 'bin', 'claude'))

    const started = await login.start()
    expect(started.ok).toBe(true)
    if (started.ok) await login.cancel(started.value.loginId)
  }, 30_000)

  // The CLI stays open after refusing a code: the answer comes from its message, not from the timeout (T158).
  it('CC5 código no válido → codigo_no_valido, sin esperar al tiempo máximo', async () => {
    const { login } = loginFor({}, { tokenTimeoutMs: 60_000 })
    const started = await login.start()
    if (!started.ok) throw new Error('sin enlace')
    const sent = Date.now()
    const result = await login.complete(started.value.loginId, Secret.from('otro-codigo'))
    expect(result).toEqual({ ok: false, failure: { kind: 'sin_sesion', reason: 'codigo_no_valido' } })
    expect(Date.now() - sent).toBeLessThan(10_000)
  }, 30_000)

  // A real code is ~100 characters: written with its Enter at once, the CLI took it all as a paste and never sent it
  // (found in T158).
  it('un código largo como los reales se envía: el Enter va aparte', async () => {
    const longCode = `${'c'.repeat(52)}#${'s'.repeat(43)}`
    const { login } = loginFor({ loginCode: longCode }, { tokenTimeoutMs: 10_000 })
    const started = await login.start()
    if (!started.ok) throw new Error('sin enlace')
    const result = await login.complete(started.value.loginId, Secret.from(longCode))
    expect(result.ok).toBe(true)
  }, 30_000)

  it('CC6 al caducar se termina el proceso y el código ya no vale', async () => {
    const { fake, login } = loginFor({}, { expiresMs: 3_000 })
    const started = await login.start()
    if (!started.ok) throw new Error('sin enlace')
    const pid = fake.loginPid()!
    await expect.poll(() => isAlive(pid), { timeout: 10_000 }).toBe(false)
    const result = await login.complete(started.value.loginId, Secret.from(LOGIN_CODE))
    expect(result).toEqual({ ok: false, failure: { kind: 'sin_sesion', reason: 'codigo_no_valido' } })
  }, 30_000)

  it('un inicio nuevo termina el anterior, y cancelar termina el proceso', async () => {
    const { fake, login } = loginFor({})
    const first = await login.start()
    if (!first.ok) throw new Error('sin enlace')
    const firstPid = fake.loginPid()!
    const second = await login.start()
    if (!second.ok) throw new Error('sin enlace')
    await expect.poll(() => isAlive(firstPid)).toBe(false)
    expect(await login.complete(first.value.loginId, Secret.from(LOGIN_CODE))).toMatchObject({ ok: false })

    const secondPid = fake.loginPid()!
    await login.cancel(second.value.loginId)
    await expect.poll(() => isAlive(secondPid)).toBe(false)
  }, 30_000)

  it('binario ausente → programa_no_instalado', async () => {
    const login = createClaudeLogin({ logger: silent, claudeBin: '/no/existe/claude', env: SERVER_ENV })
    expect(await login.start()).toEqual({
      ok: false,
      failure: { kind: 'no_disponible', reason: 'programa_no_instalado' },
    })
  }, 30_000)

  // Otherwise the CLI opens its own tab with the automatic flow (localhost callback): authorizing there shows no
  // code to paste, and the app never learns the login finished (found in T158).
  it('la CLI no abre el navegador por su cuenta: solo vale el enlace que da la app', async () => {
    const { fake, login } = loginFor({})
    const started = await login.start()
    if (!started.ok) throw new Error('sin enlace')
    expect(fake.loginBrowser()).toBe('true')
    await login.cancel(started.value.loginId)
  }, 30_000)

  it('no deja la carpeta temporal del inicio de sesión', async () => {
    const { fake, login } = loginFor({})
    const started = await login.start()
    if (!started.ok) throw new Error('sin enlace')
    expect(existsSync(fake.loginDir())).toBe(true)
    await login.complete(started.value.loginId, Secret.from(LOGIN_CODE))
    expect(existsSync(fake.loginDir())).toBe(false)
  }, 30_000)
})

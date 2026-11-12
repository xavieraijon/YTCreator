import { Secret, type Logger, type ProviderDeps } from '@ytcreator/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnthropicProvider } from '../../src/anthropic/adapter.ts'
import { resolveProfile } from '../../src/profiles.ts'
import {
  CONTRACT_SCHEMA,
  INVALID_OUTPUT,
  NEVER_SEEN_URL,
  runProviderContract,
  useOutputs,
  VALID_OUTPUT,
  type BaseCase,
  type ContractCase,
} from './battery.ts'

const KEY = 'sk-ant-api03-FAKE-contract-0123456789'
const NOW = new Date('2026-10-29T10:00:00.000Z')

interface Request {
  method: string
  path: string
  headers: Headers
  body: unknown
}

type Reply = Response | 'offline' | 'hang'
type Responder = (call: number, request: Request) => Reply

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const apiError = (status: number, type: string, message = 'FAKE', headers?: Record<string, string>) =>
  json(status, { type: 'error', error: { type, message } }, headers)

const MODELS = {
  data: [
    { id: 'claude-haiku-5-5', type: 'model', display_name: 'Claude Haiku 5.5', created_at: '2026-01-01T00:00:00Z' },
  ],
  has_more: false,
  first_id: 'claude-haiku-5-5',
  last_id: 'claude-haiku-5-5',
}

const message = (text: string, stopReason = 'end_turn') =>
  json(200, {
    id: 'msg_FAKE',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: stopReason === 'refusal' ? [] : [{ type: 'text', text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 4 },
  })

// One reply per call: the last one repeats.
const replies =
  (...list: Reply[]): Responder =>
  (call) =>
    list[Math.min(call, list.length - 1)]!

// The first step of a search: one result seen, and an address that is only written in the text.
const searched = () =>
  json(200, {
    id: 'msg_FAKE',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [
      {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_FAKE',
        content: [{ type: 'web_search_result', url: 'https://vista.example/', title: 'Vista', encrypted_content: 'x' }],
      },
      { type: 'text', text: `Leído en ${NEVER_SEEN_URL}` },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 4, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
  })

const RESPONDERS: Record<BaseCase, Responder> = {
  valid_credential: replies(json(200, MODELS)),
  invalid_credential: replies(apiError(401, 'authentication_error', 'invalid x-api-key')),
  no_permission: replies(apiError(403, 'permission_error')),
  quota: replies(apiError(429, 'rate_limit_error', 'FAKE', { 'retry-after': '30' })),
  offline: replies('offline'),
  timeout: replies('hang'),
  service_down: replies(apiError(529, 'overloaded_error')),
  filtered: replies(message('', 'refusal')),
  unknown_error: replies(apiError(418, 'teapot_error')),
  output_valid: replies(message(JSON.stringify(VALID_OUTPUT))),
  output_invalid_then_valid: replies(message(JSON.stringify(INVALID_OUTPUT)), message(JSON.stringify(VALID_OUTPUT))),
  output_invalid_twice: replies(message(JSON.stringify(INVALID_OUTPUT))),
  web_unsupported: replies(message('')),
  web_valid: replies(searched(), message(JSON.stringify(VALID_OUTPUT))),
}

function responderFor(stub: ContractCase): Responder {
  const outputs = useOutputs(stub)
  if (outputs) return replies(...outputs.map((output) => message(JSON.stringify(output))))
  return RESPONDERS[stub as BaseCase]
}

// A `fetch` that never leaves the process: it answers from the responder and keeps every request.
function stubFetch(respond: Responder) {
  const requests: Request[] = []
  const fetch = (async (input: string | URL | globalThis.Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof globalThis.Request ? input.url : input)
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
    const request = { method: init.method ?? 'GET', path: url.pathname, headers: new Headers(init.headers), body }
    requests.push(request)
    const reply = respond(requests.length - 1, request)
    if (reply === 'offline') throw new TypeError('fetch failed')
    if (reply === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
      })
    }
    return reply.clone()
  }) as typeof globalThis.fetch
  return { fetch, requests }
}

const silent: Logger = { info() {}, warn() {}, error() {} }

function providerFor(respond: Responder, deps: Partial<ProviderDeps> = {}) {
  const stub = stubFetch(respond)
  const provider = createAnthropicProvider(Secret.from(KEY), {
    fetch: stub.fetch,
    now: () => NOW,
    logger: silent,
    ...deps,
  })
  return { provider, requests: stub.requests }
}

runProviderContract(
  'anthropic',
  (stub, deps) => {
    const aiTimeoutSeconds = stub === 'timeout' ? 1 : undefined
    const { fetch, requests } = stubFetch(responderFor(stub))
    const provider = createAnthropicProvider(Secret.from(KEY), { ...deps, fetch, aiTimeoutSeconds })
    const timeoutMs = resolveProfile('anthropic', 'comprobacion', { aiTimeoutSeconds }).timeoutMs
    return { provider, calls: () => requests.length, credential: KEY, timeoutMs }
  },
  {
    skip: {
      filtered: 'check() solo lista los modelos y no genera; el rechazo se prueba con generate en AN3',
      web_unsupported: 'la API siempre puede buscar',
    },
  },
)

describe('anthropic: casos propios', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('check() solo lista los modelos, con la clave del creador y sin llamadas que cuesten', async () => {
    const { provider, requests } = providerFor(RESPONDERS.valid_credential)
    expect(await provider.check()).toEqual({ ok: true })
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/models'])
    expect(requests[0]!.headers.get('authorization')).toBe(`Bearer ${KEY}`)
  })

  it('no lee la URL, el token ni la clave del entorno', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://example.invalid')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'FAKE-auth-token')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-api03-FAKE-server-env')
    const stub = stubFetch(RESPONDERS.valid_credential)
    const urls: string[] = []
    const fetch = ((input: string | URL, init?: RequestInit) => {
      urls.push(String(input))
      return stub.fetch(input, init)
    }) as typeof globalThis.fetch
    const provider = createAnthropicProvider(Secret.from(KEY), { fetch, now: () => NOW, logger: silent })
    await provider.check()
    expect(urls[0]).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/)
    expect(stub.requests[0]!.headers.get('authorization')).toBe(`Bearer ${KEY}`)
  })

  it.each([
    ['429', apiError(429, 'rate_limit_error')],
    ['500', apiError(500, 'api_error')],
    ['529', apiError(529, 'overloaded_error')],
  ])('AN1 maxRetries: 0, un %s hace una sola llamada', async (_status, reply) => {
    const { provider, requests } = providerFor(replies(reply))
    expect((await provider.check()).ok).toBe(false)
    expect(requests).toHaveLength(1)
  })

  it('AN2 429 con retry-after → resetsAt a esa distancia', async () => {
    const { provider } = providerFor(RESPONDERS.quota)
    expect(await provider.check()).toEqual({
      ok: false,
      failure: { kind: 'cupo_agotado', reason: 'limite_de_uso', resetsAt: '2026-10-29T10:00:30.000Z' },
    })
  })

  it('AN2 429 con anthropic-ratelimit-*-reset → resetsAt del reinicio más tardío', async () => {
    const headers = {
      'anthropic-ratelimit-requests-reset': '2026-10-29T10:01:00Z',
      'anthropic-ratelimit-tokens-reset': '2026-10-29T10:05:00Z',
    }
    const { provider } = providerFor(replies(apiError(429, 'rate_limit_error', 'FAKE', headers)))
    const result = await provider.check()
    expect(result).toMatchObject({ ok: false, failure: { resetsAt: '2026-10-29T10:05:00.000Z' } })
  })

  it.each([
    ['402 billing_error', apiError(402, 'billing_error')],
    [
      '400 credit balance',
      apiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
    ],
  ])('%s → sin_saldo', async (_case, reply) => {
    const { provider } = providerFor(replies(reply))
    const result = await provider.generate({ use: 'comprobacion', prompt: { id: 'prueba', version: 1, text: 'hola' } })
    expect(result).toEqual({ ok: false, failure: { kind: 'cupo_agotado', reason: 'sin_saldo' } })
  })

  const GENERATE_REQUEST = {
    use: 'comprobacion',
    prompt: { id: 'prueba', version: 1, text: 'hola' },
    schema: CONTRACT_SCHEMA,
  } as const

  it('AN3b two invalid outputs were both paid for, so their usage comes back with the failure (G6)', async () => {
    const { provider } = providerFor(replies(message(JSON.stringify(INVALID_OUTPUT))))
    const result = await provider.generate(GENERATE_REQUEST)
    expect(result).toMatchObject({ ok: false, invalidOutput: true, usage: { inputTokens: 24, outputTokens: 8 } })
  })

  it('AN3c an invalid output and then a valid one count both calls (G6)', async () => {
    const { provider } = providerFor(
      replies(message(JSON.stringify(INVALID_OUTPUT)), message(JSON.stringify(VALID_OUTPUT))),
    )
    const result = await provider.generate(GENERATE_REQUEST)
    expect(result).toMatchObject({ ok: true, usage: { inputTokens: 24, outputTokens: 8 } })
  })

  it('AN3d a refusal keeps its usage (G6)', async () => {
    const { provider } = providerFor(replies(message('', 'refusal')))
    const result = await provider.generate(GENERATE_REQUEST)
    expect(result).toMatchObject({ ok: false, usage: { inputTokens: 12, outputTokens: 4 } })
  })

  it('AN3 stop_reason refusal → contenido_filtrado', async () => {
    const { provider } = providerFor(RESPONDERS.filtered)
    const result = await provider.generate({ use: 'comprobacion', prompt: { id: 'prueba', version: 1, text: 'hola' } })
    expect(result).toMatchObject({ ok: false, failure: { kind: 'contenido_filtrado', reason: 'rechazo_del_modelo' } })
  })

  it('generate usa el perfil y pide la salida estructurada solo con esquema', async () => {
    const { provider, requests } = providerFor(replies(message('hola')))
    const result = await provider.generate({
      use: 'comprobacion',
      prompt: { id: 'prueba', version: 1, text: 'di hola' },
    })
    expect(result).toEqual({ ok: true, value: 'hola', usage: { inputTokens: 12, outputTokens: 4 } })
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/v1/messages' })
    expect(requests[0]!.body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'di hola' }],
    })
    expect(requests[0]!.body).not.toHaveProperty('output_config')
  })
})

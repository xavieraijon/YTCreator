import { Secret, type AiRequest, type Logger } from '@ytcreator/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createAnthropicProvider } from '../src/anthropic/adapter.ts'

const KEY = 'sk-ant-api03-FAKE-web-0123456789'
const silent: Logger = { info() {}, warn() {}, error() {} }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const usage = (searches = 0, fetches = 0, input = 100) => ({
  input_tokens: input,
  output_tokens: 10,
  server_tool_use: { web_search_requests: searches, web_fetch_requests: fetches },
})

const message = (content: unknown[], stop_reason = 'end_turn', searches = 0, fetches = 0, input = 100) =>
  json(200, {
    id: 'msg_FAKE',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content,
    stop_reason,
    stop_sequence: null,
    usage: usage(searches, fetches, input),
  })

const results = (...urls: string[]) => ({
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_FAKE',
  content: urls.map((url) => ({ type: 'web_search_result', url, title: 't', encrypted_content: 'x' })),
})

const SEARCH_ERROR = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_FAKE',
  content: { type: 'web_search_tool_result_error', error_code: 'unavailable' },
}

const text = (value: string, citations: unknown[] = []) => ({ type: 'text', text: value, citations })
const citation = (url: string) => ({
  type: 'web_search_result_location',
  url,
  title: 'Fuente',
  cited_text: 'x',
  encrypted_index: 'x',
})
const fetched = (url: string) => ({
  type: 'web_fetch_tool_result',
  tool_use_id: 'srvtoolu_FAKE',
  content: {
    type: 'web_fetch_result',
    url,
    retrieved_at: null,
    content: {
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data: 'x' },
      title: null,
      citations: null,
    },
  },
})

const VALID = message([text('{"ok":true}')])
const INVALID = message([text('{"ok":"no"}')])
const SEARCHED = message([results('https://a.example/1'), text('Informe')], 'end_turn', 2)

interface Sent {
  model: string
  max_tokens: number
  tools?: { type: string; name: string; max_uses?: number; max_content_tokens?: number }[]
  output_config?: unknown
  messages: { role: string; content: unknown }[]
}

function setup(...replies: (Response | (() => Response))[]) {
  const sent: Sent[] = []
  const fetch = (async (_: unknown, init: RequestInit = {}) => {
    sent.push(JSON.parse(init.body as string) as Sent)
    const reply = replies[Math.min(sent.length - 1, replies.length - 1)]!
    return (typeof reply === 'function' ? reply() : reply).clone()
  }) as typeof globalThis.fetch
  const provider = createAnthropicProvider(Secret.from(KEY), { fetch, now: () => new Date(), logger: silent })
  return { provider, sent }
}

const request: AiRequest<{ ok: boolean }> = {
  use: 'investigacion',
  prompt: { id: 'investigacion', version: 1, text: 'Investiga.' },
  input: { idea: 'pan' },
  schema: z.object({ ok: z.boolean() }),
  web: { maxSearches: 8, maxFetches: 10 },
}

describe('anthropic: buscar en dos pasos (R4)', () => {
  it('searches with the tools and no format, then asks for the format with no tools', async () => {
    const { provider, sent } = setup(SEARCHED, VALID)
    expect(await provider.generate(request)).toMatchObject({ ok: true, value: { ok: true } })
    expect(sent).toHaveLength(2)
    expect(sent[0]!.model).toBe('claude-sonnet-5-5')
    expect(sent[0]!.tools).toEqual([
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 10, max_content_tokens: 8000 },
    ])
    expect(sent[0]!.output_config).toBeUndefined()
    expect(sent[1]!.tools).toBeUndefined()
    expect(sent[1]!.output_config).toBeDefined()
    expect(sent[1]!.messages[0]!.content).toContain('Informe')
  })

  it('hands the addresses of the citations over to the second step', async () => {
    const { provider, sent } = setup(
      message([results('https://a.example/1'), text('El dato', [citation('https://a.example/1')])], 'end_turn', 1),
      VALID,
    )
    await provider.generate(request)
    expect(sent[1]!.messages[0]!.content).toContain('https://a.example/1')
  })

  it('gives the addresses of results, citations and pages read', async () => {
    const { provider } = setup(
      message(
        [
          results('https://a.example/1', 'https://a.example/2'),
          fetched('https://b.example/leida'),
          text('Dato', [citation('https://c.example/citada')]),
        ],
        'end_turn',
        1,
      ),
      VALID,
    )
    const result = await provider.generate(request)
    expect(result.ok && [...result.seenUrls!].sort()).toEqual([
      'https://a.example/1',
      'https://a.example/2',
      'https://b.example/leida',
      'https://c.example/citada',
    ])
  })

  it('adds the tokens and searches of every step', async () => {
    const { provider } = setup(SEARCHED, VALID)
    const result = await provider.generate(request)
    expect(result.ok && result.usage).toEqual({ inputTokens: 200, outputTokens: 20, webSearches: 2 })
  })

  it('resends a paused turn as it was, up to three times', async () => {
    const paused = () => message([results('https://a.example/1'), text('Parte. ')], 'pause_turn', 1)
    const { provider, sent } = setup(paused, paused, paused, () => message([text('Fin')], 'end_turn', 1), VALID)
    const result = await provider.generate(request)
    expect(result.ok).toBe(true)
    expect(sent).toHaveLength(5)
    expect(sent[1]!.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(sent[1]!.tools).toEqual(sent[0]!.tools)
    expect(sent[4]!.messages[0]!.content).toContain('Parte. Parte. Parte. Fin')
  })

  it('does not resend a fourth time', async () => {
    const paused = () => message([results('https://a.example/1'), text('Parte. ')], 'pause_turn', 1)
    const { provider, sent } = setup(paused, paused, paused, paused, VALID)
    expect((await provider.generate(request)).ok).toBe(true)
    expect(sent).toHaveLength(5)
  })

  it('does not resend once the searches budgeted are spent', async () => {
    const { provider, sent } = setup(
      () => message([results('https://a.example/1'), text('Parte')], 'pause_turn', 8),
      VALID,
    )
    expect((await provider.generate(request)).ok).toBe(true)
    expect(sent).toHaveLength(2)
    expect(sent[1]!.tools).toBeUndefined()
  })

  it('is not available when no search worked, and says what it cost', async () => {
    const { provider, sent } = setup(message([SEARCH_ERROR, text('No pude buscar')], 'end_turn', 0))
    const result = await provider.generate(request)
    expect(result).toMatchObject({ ok: false, failure: { kind: 'no_disponible', reason: 'servicio_caido' } })
    expect(!result.ok && result.usage).toMatchObject({ inputTokens: 100 })
    expect(sent).toHaveLength(1)
  })

  it('is not available when it never searched', async () => {
    const { provider } = setup(message([text('Ya lo sabía')]))
    expect(await provider.generate(request)).toMatchObject({ ok: false, failure: { kind: 'no_disponible' } })
  })

  it('goes on when one search failed and another worked', async () => {
    const { provider } = setup(
      message([SEARCH_ERROR, results('https://a.example/1'), text('Informe')], 'end_turn', 1),
      VALID,
    )
    expect((await provider.generate(request)).ok).toBe(true)
  })

  it('takes a search turned off for the organization as not available', async () => {
    const off = json(400, {
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Web search is disabled for this organization' },
    })
    const { provider } = setup(off)
    expect(await provider.generate(request)).toMatchObject({ ok: false, failure: { kind: 'no_disponible' } })
  })

  it('classifies any other error as usual', async () => {
    const { provider } = setup(json(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }))
    expect(await provider.generate(request)).toMatchObject({ ok: false, failure: { kind: 'sin_sesion' } })
  })

  it('takes a refusal as filtered', async () => {
    const { provider } = setup(message([], 'refusal'))
    expect(await provider.generate(request)).toMatchObject({ ok: false, failure: { kind: 'contenido_filtrado' } })
  })

  it('repeats only the structured step when the answer is invalid', async () => {
    const { provider, sent } = setup(SEARCHED, INVALID, VALID)
    const result = await provider.generate(request)
    expect(result).toMatchObject({ ok: true, value: { ok: true } })
    expect(sent).toHaveLength(3)
    expect(sent[2]!.tools).toBeUndefined()
    expect(result.ok && result.usage).toEqual({ inputTokens: 300, outputTokens: 30, webSearches: 2 })
  })

  it('counts the search as spent when the structured step fails', async () => {
    const down = json(500, { type: 'error', error: { type: 'api_error', message: 'x' } })
    const { provider } = setup(SEARCHED, down)
    const result = await provider.generate(request)
    expect(result).toMatchObject({ ok: false, usage: { webSearches: 2, inputTokens: 100 } })
  })

  it('stops after two invalid answers, with what was consumed', async () => {
    const { provider, sent } = setup(SEARCHED, INVALID, INVALID)
    expect(await provider.generate(request)).toMatchObject({
      ok: false,
      invalidOutput: true,
      usage: { webSearches: 2 },
    })
    expect(sent).toHaveLength(3)
  })

  it('does not resume a paused turn once the pages to read are spent', async () => {
    const paused = message([results('https://a.example/1'), text('Informe')], 'pause_turn', 1, 10)
    const { provider, sent } = setup(paused, VALID)
    expect((await provider.generate(request)).ok).toBe(true)
    expect(sent).toHaveLength(2)
    expect(sent[1]!.tools).toBeUndefined()
  })

  it('does not resume a paused turn when sending it again goes past what was budgeted', async () => {
    const paused = message([results('https://a.example/1'), text('Informe')], 'pause_turn', 1, 0, 60_000)
    const { provider, sent } = setup(paused, VALID)
    const limited = { ...request, web: { maxSearches: 8, maxFetches: 10, maxResultTokens: 88_000 } }
    expect((await provider.generate(limited)).ok).toBe(true)
    expect(sent).toHaveLength(2)
  })

  it('resumes a paused turn that is still within the budget', async () => {
    const paused = message([results('https://a.example/1'), text('Informe')], 'pause_turn', 1, 0, 1000)
    const { provider, sent } = setup(paused, SEARCHED, VALID)
    const limited = { ...request, web: { maxSearches: 8, maxFetches: 10, maxResultTokens: 88_000 } }
    expect((await provider.generate(limited)).ok).toBe(true)
    expect(sent).toHaveLength(3)
  })

  it('takes a page read, with no search, as research done', async () => {
    const { provider } = setup(message([fetched('https://b.example/x'), text('Informe')], 'end_turn', 0, 1), VALID)
    expect((await provider.generate(request)).ok).toBe(true)
  })

  it('declares the capability', () => {
    expect(setup().provider.capabilities.webResearch).toBe(true)
  })

  it('does not search when the request has no `web`', async () => {
    const { provider, sent } = setup(VALID)
    expect((await provider.generate({ ...request, web: undefined })).ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.tools).toBeUndefined()
  })
})

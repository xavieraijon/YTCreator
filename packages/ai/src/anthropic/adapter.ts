import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  UNKNOWN_FAILURE,
  type AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type AiUsage,
  type AiWebLimits,
  type ProviderDeps,
  type Secret,
} from '@ytcreator/core'
import { WEB_STRUCTURE_STEP } from '@ytcreator/knowledge'
import { resolveProfile, type AiProfile } from '../profiles.ts'
import { addUsage } from '../usage.ts'
import { buildPrompt } from '../prompt.ts'
import { classifyAnthropicError } from './classify.ts'

const API_URL = 'https://api.anthropic.com'
const REFUSED: AiFailure = { kind: 'contenido_filtrado', reason: 'rechazo_del_modelo' }

const NO_SEARCH: AiFailure = { kind: 'no_disponible', reason: 'servicio_caido' }
const MAX_RESUMES = 3
const WEB_CONTENT_TOKENS = 8000
const CHARS_PER_TOKEN = 3.5
const STRUCTURE_RESERVE_MS = 60_000

type Outcome =
  { ok: true; text: string; usage: AiUsage } | { ok: false; failure: AiFailure; status?: number; usage?: AiUsage }

type ResearchOutcome =
  { ok: true; text: string; usage: AiUsage; seenUrls: string[] } | { ok: false; failure: AiFailure; usage: AiUsage }

const WEB_OFF = /web[ _-]?(search|fetch)/i

// What the second step needs from the first: the text, and the address of whatever it quotes, which the citations
// carry apart from it.
function readResearch(content: Anthropic.ContentBlock[], seen: Set<string>): { text: string; searched: boolean } {
  let text = ''
  let searched = false
  for (const block of content) {
    if (block.type === 'text') {
      text += block.text
      for (const citation of block.citations ?? []) {
        if (citation.type !== 'web_search_result_location') continue
        seen.add(citation.url)
        text += ` [fuente: ${citation.title ?? ''} ${citation.url}]`
      }
    } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      searched = true
      for (const result of block.content) seen.add(result.url)
    } else if (block.type === 'web_fetch_tool_result' && block.content.type === 'web_fetch_result') {
      searched = true
      seen.add(block.content.url)
    }
  }
  return { text, searched }
}

// Anthropic API with the creator's key, paid per use (research R10). The SDK retries nothing (C12) and reads
// nothing from the environment: the URL, the key and the logs are fixed here.
export function createAnthropicProvider(credentials: Secret, deps: ProviderDeps): AiProvider {
  const profile = resolveProfile('anthropic', 'comprobacion', { aiTimeoutSeconds: deps.aiTimeoutSeconds })
  let client: Anthropic | undefined

  function getClient() {
    client ??= new Anthropic({
      apiKey: credentials.reveal(),
      authToken: null,
      baseURL: API_URL,
      maxRetries: 0,
      timeout: profile.timeoutMs,
      fetch: deps.fetch,
      logLevel: 'off',
    })
    return client
  }

  function failed(error: unknown): Outcome {
    const { failure, status, known } = classifyAnthropicError(error, deps.now())
    // Only the name: an unknown message may quote the request.
    if (!known) deps.logger.warn('ai.unknown_error', { provider: 'anthropic', name: (error as Error)?.name })
    return { ok: false, failure, status }
  }

  async function call(
    prompt: string,
    schema: Record<string, unknown> | undefined,
    signal?: AbortSignal,
    use: AiProfile = profile,
  ) {
    try {
      const message = await getClient().messages.create(
        {
          model: use.model,
          max_tokens: use.maxOutputTokens,
          messages: [{ role: 'user', content: prompt }],
          ...(schema ? { output_config: { format: { type: 'json_schema' as const, schema } } } : {}),
        },
        { signal, timeout: use.timeoutMs },
      )
      const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens }
      if (message.stop_reason === 'refusal') return { ok: false, failure: REFUSED, usage } satisfies Outcome
      const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
      return { ok: true, text, usage } satisfies Outcome
    } catch (error) {
      return failed(error)
    }
  }

  // The first step of R4: with the tools and no output format, which cannot live with their citations.
  async function research(
    prompt: string,
    web: AiWebLimits,
    signal: AbortSignal | undefined,
    remaining: () => AiProfile,
  ): Promise<ResearchOutcome> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
    const tools: Anthropic.ToolUnion[] = [
      { type: 'web_search_20260209', name: 'web_search', max_uses: web.maxSearches },
      {
        type: 'web_fetch_20260209',
        name: 'web_fetch',
        max_uses: web.maxFetches,
        max_content_tokens: WEB_CONTENT_TOKENS,
      },
    ]
    const seen = new Set<string>()
    let usage: AiUsage = {}
    let text = ''
    let searched = false
    let fetches = 0
    const allowed = Math.ceil(prompt.length / CHARS_PER_TOKEN) + (web.maxResultTokens ?? Number.POSITIVE_INFINITY)
    for (let resumes = 0; ; resumes++) {
      const use = remaining()
      let message: Anthropic.Message
      try {
        message = await getClient().messages.create(
          { model: use.model, max_tokens: use.maxOutputTokens, messages, tools },
          { signal, timeout: use.timeoutMs },
        )
      } catch (error) {
        const outcome = failed(error)
        // A search turned off for the organization comes back as a 400 of its own.
        const off = !outcome.ok && outcome.status === 400 && WEB_OFF.test((error as Error).message ?? '')
        return { ok: false, failure: off ? NO_SEARCH : (outcome as { failure: AiFailure }).failure, usage }
      }
      usage = addUsage(usage, {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        webSearches: message.usage.server_tool_use?.web_search_requests ?? 0,
      })
      if (message.stop_reason === 'refusal') return { ok: false, failure: REFUSED, usage }
      const read = readResearch(message.content, seen)
      text += read.text
      searched ||= read.searched
      fetches += message.usage.server_tool_use?.web_fetch_requests ?? 0
      // Never past what was budgeted, even if the turn was left half done. A resume sends everything again, and that
      // is paid for again: it counts before it is sent (decision 33).
      const spent =
        (usage.webSearches ?? 0) >= web.maxSearches ||
        fetches >= web.maxFetches ||
        (usage.inputTokens ?? 0) + message.usage.input_tokens > allowed
      if (message.stop_reason !== 'pause_turn' || resumes === MAX_RESUMES || spent) break
      messages.push({ role: 'assistant', content: message.content as Anthropic.ContentBlockParam[] })
    }
    // An error of a search arrives inside a 200.
    if (!searched || text.trim() === '') return { ok: false, failure: NO_SEARCH, usage }
    return { ok: true, text, usage, seenUrls: [...seen] }
  }

  function logResult(operation: string, outcome: Outcome | ResearchOutcome) {
    const fields = outcome.ok
      ? { ok: true }
      : {
          ok: false,
          kind: outcome.failure.kind,
          reason: outcome.failure.reason,
          status: 'status' in outcome ? outcome.status : undefined,
        }
    deps.logger.info(`ai.${operation}`, { provider: 'anthropic', ...fields })
  }

  return {
    id: 'anthropic',
    capabilities: { text: true, structured: true, streaming: false, vision: false, webResearch: true },
    billing: 'por_uso',

    // Free (R12): listing the models proves the key without generating a single token.
    async check(signal) {
      let outcome: Outcome
      try {
        await getClient().models.list({ limit: 1 }, { signal })
        outcome = { ok: true, text: '', usage: {} }
      } catch (error) {
        outcome = failed(error)
      }
      logResult('check', outcome)
      return outcome.ok ? { ok: true } : { ok: false, failure: outcome.failure }
    },

    async generate<T>(request: AiRequest<T>): Promise<AiResult<T>> {
      const schema = request.schema ? zodOutputFormat(request.schema).schema : undefined
      let prompt = buildPrompt(request.prompt.text, request.input)
      const useProfile = resolveProfile('anthropic', request.use, { aiTimeoutSeconds: deps.aiTimeoutSeconds })
      // Every answer is paid for, also those that do not count: what comes back adds them all.
      let usage: AiUsage = {}
      // With a search, the time of the use covers every step, and part of it is kept for the step that gives the format.
      const deadline = Date.now() + useProfile.timeoutMs
      const until = (end: number): AiProfile => ({ ...useProfile, timeoutMs: Math.max(1, end - Date.now()) })
      const reserve = Math.min(STRUCTURE_RESERVE_MS, useProfile.timeoutMs / 5)
      let seenUrls: string[] | undefined
      if (request.web) {
        const found = await research(prompt, request.web, request.signal, () => until(deadline - reserve))
        usage = found.usage
        if (!found.ok) {
          logResult('generate', found)
          return { ok: false, failure: found.failure, usage }
        }
        seenUrls = found.seenUrls
        prompt = buildPrompt(`${request.prompt.text}\n\n${WEB_STRUCTURE_STEP}`, {
          ...request.input,
          informe_web: found.text,
        })
      }
      const seen = seenUrls ? { seenUrls } : {}
      // A structured output that does not validate is asked for once more (principle IV).
      for (let attempt = 1; attempt <= 2; attempt++) {
        // A repetition is of this step only: the search, which is the expensive part, is not repeated (R4).
        const outcome = await call(prompt, schema, request.signal, request.web ? until(deadline) : useProfile)
        const consumed = outcome.usage !== undefined || attempt > 1 || request.web !== undefined
        usage = addUsage(usage, outcome.usage)
        if (!outcome.ok) {
          logResult('generate', outcome)
          // An error from the API, on the first try, consumed nothing.
          return { ok: false, failure: outcome.failure, ...(consumed ? { usage } : {}) }
        }
        if (!request.schema) return { ok: true, value: outcome.text as T, usage, ...seen }
        const parsed = request.schema.safeParse(parseJson(outcome.text))
        if (parsed.success) return { ok: true, value: parsed.data, usage, ...seen }
        const issues = parsed.error.issues.length
        deps.logger.warn('ai.output_invalid', { provider: 'anthropic', attempt, issues })
      }
      return { ok: false, failure: UNKNOWN_FAILURE, invalidOutput: true, usage }
    },
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

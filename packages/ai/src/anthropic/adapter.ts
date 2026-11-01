import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  UNKNOWN_FAILURE,
  type AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type AiUsage,
  type ProviderDeps,
  type Secret,
} from '@ytcreator/core'
import { resolveProfile, type AiProfile } from '../profiles.ts'
import { buildPrompt } from '../prompt.ts'
import { classifyAnthropicError } from './classify.ts'

const API_URL = 'https://api.anthropic.com'
const REFUSED: AiFailure = { kind: 'contenido_filtrado', reason: 'rechazo_del_modelo' }

type Outcome = { ok: true; text: string; usage: AiUsage } | { ok: false; failure: AiFailure; status?: number }

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
      if (message.stop_reason === 'refusal') return { ok: false, failure: REFUSED } satisfies Outcome
      const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
      const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens }
      return { ok: true, text, usage } satisfies Outcome
    } catch (error) {
      return failed(error)
    }
  }

  function logResult(operation: string, outcome: Outcome) {
    const fields = outcome.ok
      ? { ok: true }
      : { ok: false, kind: outcome.failure.kind, reason: outcome.failure.reason, status: outcome.status }
    deps.logger.info(`ai.${operation}`, { provider: 'anthropic', ...fields })
  }

  return {
    id: 'anthropic',
    capabilities: { text: true, structured: true, streaming: false, vision: false },
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
      const prompt = buildPrompt(request.prompt.text, request.input)
      const useProfile = resolveProfile('anthropic', request.use, { aiTimeoutSeconds: deps.aiTimeoutSeconds })
      // A structured output that does not validate is asked for once more (principle IV).
      for (let attempt = 1; attempt <= 2; attempt++) {
        const outcome = await call(prompt, schema, request.signal, useProfile)
        if (!outcome.ok) {
          logResult('generate', outcome)
          return { ok: false, failure: outcome.failure }
        }
        if (!request.schema) return { ok: true, value: outcome.text as T, usage: outcome.usage }
        const parsed = request.schema.safeParse(parseJson(outcome.text))
        if (parsed.success) return { ok: true, value: parsed.data, usage: outcome.usage }
        const issues = parsed.error.issues.length
        deps.logger.warn('ai.output_invalid', { provider: 'anthropic', attempt, issues })
      }
      return { ok: false, failure: UNKNOWN_FAILURE, invalidOutput: true }
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

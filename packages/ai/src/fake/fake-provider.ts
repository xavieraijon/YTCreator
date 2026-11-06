import {
  CHANNEL_OUTPUTS,
  UNKNOWN_FAILURE,
  type AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type AiUsage,
  type Billing,
  type ChannelUse,
  type CheckResult,
  type ProviderDeps,
  type Secret,
} from '@ytcreator/core'
import { resolveProfile } from '../profiles.ts'
import { addUsage } from '../usage.ts'
import { buildPrompt } from '../prompt.ts'
import { fakeChannelOutput } from './outputs.ts'
import type { FakeOutcome, FakeScenario } from './scenarios.ts'

// Recognisable fake credentials, so the leak test (SC-006) can look for them.
const ACCEPTED = /^(sk-ant-api03-FAKE|sk-ant-oat-FAKE)/
// Tokens of the fake login carry the account number: `cuentas:` gives each account its own outcome.
const ACCOUNT_NUMBER = /^sk-ant-oat-FAKE-(\d+)-/

const INVALID_KEY: AiFailure = { kind: 'sin_sesion', reason: 'clave_no_valida' }
const TIMED_OUT: AiFailure = { kind: 'tiempo_agotado', reason: 'respuesta_lenta' }
// `limite_de_gasto`: one call this big spends more than any daily limit, so the next one is blocked.
const HUGE_USAGE = { inputTokens: 2_000_000, outputTokens: 200_000 }

export interface FakeProviderOptions {
  billing?: Billing
  // Stands in for the network in tests: it gets the prompt as sent; its result is the raw model output; throwing is
  // an unknown error.
  transport?: (operation: 'check' | 'generate', prompt?: string) => Promise<unknown>
}

function isChannelUse(use: string): use is ChannelUse {
  return Object.hasOwn(CHANNEL_OUTPUTS, use)
}

function outcomeFor(scenario: FakeScenario, credential: string): FakeOutcome {
  const number = ACCOUNT_NUMBER.exec(credential)?.[1]
  const index = number ? Number(number) - 1 : 0
  return scenario.accounts[index] ?? { type: 'ok' }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

export function createFakeProvider(
  scenario: FakeScenario,
  credentials: Secret,
  deps: ProviderDeps,
  options: FakeProviderOptions = {},
): AiProvider {
  const profile = resolveProfile('fake', 'comprobacion', { aiTimeoutSeconds: deps.aiTimeoutSeconds })

  // What a call answers without a transport: the canned output of a channel use, or `listo`.
  function answer(request?: AiRequest<unknown>): AiResult<unknown> {
    if (!request || !isChannelUse(request.use))
      return { ok: true, value: 'listo', usage: { inputTokens: 1, outputTokens: 1 } }
    const value = fakeChannelOutput(request.use, request.input ?? {}, scenario.output)
    const usage = scenario.output === 'limite_de_gasto' ? HUGE_USAGE : { inputTokens: 1, outputTokens: 1 }
    return { ok: true, value, usage }
  }

  // One call to the "provider": the outcome of the scenario, then the transport if a test gave one.
  async function call(
    operation: 'check' | 'generate',
    signal?: AbortSignal,
    prompt?: string,
    request?: AiRequest<unknown>,
  ): Promise<AiResult<unknown>> {
    const credential = credentials.reveal()
    if (!ACCEPTED.test(credential)) return { ok: false, failure: INVALID_KEY }
    const outcome = outcomeFor(scenario, credential)
    try {
      switch (outcome.type) {
        case 'fail':
          return { ok: false, failure: outcome.failure }
        case 'cupo': {
          const resetsAt = outcome.resetsAt ?? new Date(deps.now().getTime() + 3_600_000).toISOString()
          return { ok: false, failure: { kind: 'cupo_agotado', reason: 'limite_de_uso', resetsAt } }
        }
        case 'lento':
          await wait(profile.timeoutMs, signal)
          return { ok: false, failure: TIMED_OUT }
        case 'ok': {
          if (!options.transport) return answer(request)
          const value = await options.transport(operation, prompt)
          return { ok: true, value, usage: { inputTokens: 1, outputTokens: 1 } }
        }
      }
    } catch (error) {
      // Only the name: an unknown message may quote the credential.
      deps.logger.warn('ai.unknown_error', { provider: 'fake', operation, name: (error as Error)?.name })
      return { ok: false, failure: UNKNOWN_FAILURE }
    }
  }

  function logResult(operation: string, result: AiResult<unknown> | CheckResult) {
    const fields = result.ok ? { ok: true } : { ok: false, kind: result.failure.kind, reason: result.failure.reason }
    deps.logger.info(`ai.${operation}`, { provider: 'fake', ...fields })
  }

  return {
    id: 'fake',
    capabilities: { text: true, structured: true, streaming: false, vision: false },
    billing: options.billing ?? 'suscripcion',

    async check(signal) {
      const result = await call('check', signal)
      const checked: CheckResult = result.ok ? { ok: true } : result
      logResult('check', checked)
      return checked
    },

    async generate<T>(request: AiRequest<T>): Promise<AiResult<T>> {
      // A structured output that does not validate is asked for once more (principle IV).
      const prompt = buildPrompt(request.prompt.text, request.input)
      let usage: AiUsage = {}
      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = await call('generate', request.signal, prompt, request as AiRequest<unknown>)
        if (!result.ok) {
          logResult('generate', result)
          return { ...result, ...(attempt > 1 ? { usage } : {}) }
        }
        usage = addUsage(usage, result.usage)
        if (!request.schema) return { ...result, usage } as AiResult<T>
        const parsed = request.schema.safeParse(result.value)
        if (parsed.success) return { ok: true, value: parsed.data, usage }
        deps.logger.warn('ai.output_invalid', { provider: 'fake', attempt, issues: parsed.error.issues.length })
      }
      return { ok: false, failure: UNKNOWN_FAILURE, invalidOutput: true, usage }
    },
  }
}

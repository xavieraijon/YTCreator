import {
  UNKNOWN_FAILURE,
  type AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type Billing,
  type CheckResult,
  type ProviderDeps,
  type Secret,
} from '@ytcreator/core'
import { resolveProfile } from '../profiles.ts'
import type { FakeOutcome, FakeScenario } from './scenarios.ts'

// Recognisable fake credentials, so the leak test (SC-006) can look for them.
const ACCEPTED = /^(sk-ant-api03-FAKE|AIzaFAKE|sk-ant-oat-FAKE)/
// Tokens of the fake login carry the account number: `cuentas:` gives each account its own outcome.
const ACCOUNT_NUMBER = /^sk-ant-oat-FAKE-(\d+)-/

const INVALID_KEY: AiFailure = { kind: 'sin_sesion', reason: 'clave_no_valida' }
const TIMED_OUT: AiFailure = { kind: 'tiempo_agotado', reason: 'respuesta_lenta' }

export interface FakeProviderOptions {
  billing?: Billing
  // Stands in for the network in tests: its result is the raw model output; throwing is an unknown error.
  transport?: (operation: 'check' | 'generate') => Promise<unknown>
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

  // One call to the "provider": the outcome of the scenario, then the transport if a test gave one.
  async function call(operation: 'check' | 'generate', signal?: AbortSignal): Promise<AiResult<unknown>> {
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
          const value = options.transport ? await options.transport(operation) : 'listo'
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
    billing: options.billing ?? 'gratis',

    async check(signal) {
      const result = await call('check', signal)
      const checked: CheckResult = result.ok ? { ok: true } : result
      logResult('check', checked)
      return checked
    },

    async generate<T>(request: AiRequest<T>): Promise<AiResult<T>> {
      // A structured output that does not validate is asked for once more (principle IV).
      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = await call('generate', request.signal)
        if (!result.ok) {
          logResult('generate', result)
          return result
        }
        if (!request.schema) return result as AiResult<T>
        const parsed = request.schema.safeParse(result.value)
        if (parsed.success) return { ok: true, value: parsed.data, usage: result.usage }
        deps.logger.warn('ai.output_invalid', { provider: 'fake', attempt, issues: parsed.error.issues.length })
      }
      return { ok: false, failure: UNKNOWN_FAILURE }
    },
  }
}

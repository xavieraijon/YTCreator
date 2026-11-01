import { randomUUID } from 'node:crypto'
import { type ProviderId, resolveProfile } from '@ytcreator/ai'
import {
  type AiRequest,
  type AiResult,
  type Billing,
  type BudgetBlock,
  CHANNEL_OUTPUTS,
  type ChannelOutput,
  type ChannelUse,
  type FailureKind,
  type Logger,
  type Pricing,
  checkBudget,
  checkClaims,
  claimsFeedback,
  costCents,
  estimateCall,
  isEstimateExpired,
  overrunsEstimate,
  trimClaims,
} from '@ytcreator/core'
import type { LimitsRepo } from '../db/repos/limits.ts'
import type { UsageRepo } from '../db/repos/usage.ts'
import { ApiError } from '../http/errors.ts'

// The connection that answers right now, already chosen by ai-connections.
export interface ActiveAi {
  providerId: ProviderId
  billing: Billing
  generate<T>(req: AiRequest<T>): Promise<AiResult<T>>
}

export interface PromptRef {
  id: string
  version: number
  text: string
}

export interface AiRunDeps {
  usage: UsageRepo
  limits: LimitsRepo
  pricing: Pricing
  logger: Logger
  now: () => Date
  active: () => ActiveAi | null
  promptFor: (use: ChannelUse) => PromptRef
  aiTimeoutSeconds?: () => number | null
}

export interface Estimate {
  estimateId: string
  use: ChannelUse
  cents: number
  included: boolean
  blockedBy: BudgetBlock | null
  pricingVersion: number
}

export type RunFailure = FailureKind | 'respuesta_invalida' | 'limite_de_gasto'

export type RunResult<U extends ChannelUse> =
  | { ok: true; value: ChannelOutput<U>; claimsTrimmed: boolean }
  | { ok: false; failure: RunFailure }

interface Saved {
  journeyId: string
  use: ChannelUse
  cents: number
  createdAt: Date
}

// Every channel AI call goes through here: estimate, budget, port, figure validator, `ai_usage` (contracts/cost.md).
export function createAiRunService(deps: AiRunDeps) {
  const { usage, limits, pricing, logger, now } = deps
  const estimates = new Map<string, Saved>()

  const activeOrThrow = (): ActiveAi => {
    const ai = deps.active()
    if (!ai) throw new ApiError({ code: 'validacion', guard: 'sin_conexion' })
    return ai
  }

  const profileOf = (ai: ActiveAi, use: ChannelUse) =>
    resolveProfile(ai.providerId, use, { aiTimeoutSeconds: deps.aiTimeoutSeconds?.() ?? null })

  const budgetBlock = (ai: ActiveAi, cents: number): BudgetBlock | null => {
    if (ai.billing === 'suscripcion') return null
    const saved = limits.get()
    if (!saved) throw new ApiError({ code: 'validacion', guard: 'sin_limites' })
    const { dayCents, monthCents } = usage.totals(now())
    return checkBudget({ cents, limits: saved, spentTodayCents: dayCents, spentThisMonthCents: monthCents })
  }

  const dropExpired = () => {
    for (const [id, saved] of estimates) if (isEstimateExpired(saved.createdAt, now())) estimates.delete(id)
  }

  return {
    estimate({ journeyId, use, input }: { journeyId: string; use: ChannelUse; input: Record<string, unknown> }): Estimate {
      const ai = activeOrThrow()
      const profile = profileOf(ai, use)
      const promptChars = deps.promptFor(use).text.length + JSON.stringify(input).length
      const call = estimateCall(pricing, {
        billing: ai.billing,
        model: profile.model,
        promptChars,
        maxOutputTokens: profile.maxOutputTokens,
      })
      const blockedBy = budgetBlock(ai, call.cents)
      dropExpired()
      const estimateId = randomUUID()
      estimates.set(estimateId, { journeyId, use, cents: call.cents, createdAt: now() })
      return {
        estimateId,
        use,
        cents: call.cents,
        included: call.included,
        blockedBy,
        pricingVersion: call.pricingVersion,
      }
    },

    async run<U extends ChannelUse>({
      estimateId,
      use,
      input,
      instructions,
      signal,
    }: {
      estimateId: string
      use: U
      input: Record<string, unknown>
      instructions?: string
      signal?: AbortSignal
    }): Promise<RunResult<U>> {
      const saved = estimates.get(estimateId)
      if (!saved || saved.use !== use || isEstimateExpired(saved.createdAt, now())) {
        throw new ApiError({ code: 'validacion', fields: { estimateId: 'no_valido' } })
      }
      estimates.delete(estimateId)

      const ai = activeOrThrow()
      const profile = profileOf(ai, use)
      const base = {
        journeyId: saved.journeyId,
        use,
        providerId: ai.providerId,
        model: profile.model,
        estimatedCents: saved.cents,
        pricingVersion: pricing.version,
      }

      // Checked again: the totals may have moved since the estimate.
      if (budgetBlock(ai, saved.cents)) {
        usage.record({ ...base, inputTokens: 0, outputTokens: 0, costCents: 0, outcome: 'limite_de_gasto' })
        return { ok: false, failure: 'limite_de_gasto' }
      }

      const prompt = deps.promptFor(use)
      const fullInput = instructions ? { ...input, instructions } : input
      const schema = CHANNEL_OUTPUTS[use] as unknown as AiRequest<ChannelOutput<U>>['schema']
      let inputTokens = 0
      let outputTokens = 0
      const call = async (text: string) => {
        const result = await ai.generate<ChannelOutput<U>>({
          use,
          prompt: { ...prompt, text },
          input: fullInput,
          schema,
          ...(signal ? { signal } : {}),
        })
        if (result.ok) {
          inputTokens += result.usage.inputTokens ?? 0
          outputTokens += result.usage.outputTokens ?? 0
        }
        return result
      }
      const finish = (outcome: RunFailure | 'ok') => {
        const cents = ai.billing === 'suscripcion' ? 0 : costCents(pricing, profile.model, inputTokens, outputTokens)
        usage.record({ ...base, inputTokens, outputTokens, costCents: cents, outcome })
        if (overrunsEstimate(saved.cents, cents)) {
          logger.warn('estimate_overrun', { use, estimatedCents: saved.cents, costCents: cents })
        }
      }

      let result = await call(prompt.text)
      if (result.ok) {
        const violations = checkClaims(result.value, input)
        if (violations.length > 0) {
          result = await call(`${prompt.text}\n\n${claimsFeedback(violations)}`)
        }
      }
      if (!result.ok) {
        const failure: RunFailure = result.invalidOutput ? 'respuesta_invalida' : result.failure.kind
        finish(failure)
        return { ok: false, failure }
      }
      const { output, trimmed } = trimClaims(result.value, input)
      finish('ok')
      return { ok: true, value: output, claimsTrimmed: trimmed }
    },
  }
}

export type AiRunService = ReturnType<typeof createAiRunService>

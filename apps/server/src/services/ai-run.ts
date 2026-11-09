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
  /** The most it can cost if the AI has to repeat itself, within the limit per operation (P17). */
  maxCents: number
  pricingVersion: number
}

// The fields whose figures the validator checks, per use; every text when a use is not here. A title or a search
// may well say «1.000 suscriptores» as a topic, not as a market figure (004, contracts/ai-uses.md, «Cifras»).
const CLAIM_FIELDS: Partial<Record<ChannelUse, readonly string[]>> = {
  ideas: ['hook'],
  otro_enfoque: ['hook', 'why'],
  busquedas_idea: [],
  // In a script a figure without a source gets marked, not trimmed (R9).
  escaleta: [],
}

// One request can become up to four calls: an answer that does not validate is always asked for again by the adapter
// (principle IV), and one with figures that have no source is asked for again here. So nothing starts unless two calls
// fit the budget, and the figures are asked for again only if two more still fit; otherwise they are trimmed (P17,
// entry 152). So what is spent stays within the limit per operation, as far as the estimate of each call holds (it
// counts characters, not tokens, and its output is the most the use may write).
export const MAX_CALLS_PER_RUN = 4
export const CALLS_RESERVED = 2
// The longest instructions the creator can write (proposalBodySchema): unknown when estimating, so the most it can
// cost leaves room for them.
const MAX_INSTRUCTIONS = 'x'.repeat(500)

export type RunFailure = FailureKind | 'respuesta_invalida' | 'limite_de_gasto'

export type RunResult<U extends ChannelUse> =
  { ok: true; value: ChannelOutput<U>; claimsTrimmed: boolean; usageId: string } | { ok: false; failure: RunFailure }

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

  // The most a request can cost: four calls, and never past the limit per operation, which every repetition checks.
  const maxCentsOf = (ai: ActiveAi, cents: number): number => {
    if (ai.billing === 'suscripcion' || cents === 0) return 0
    const perOperation = limits.get()?.perOperationCents ?? Number.POSITIVE_INFINITY
    return Math.max(cents * CALLS_RESERVED, Math.min(cents * MAX_CALLS_PER_RUN, perOperation))
  }

  const callCents = (ai: ActiveAi, model: string, maxOutputTokens: number, use: ChannelUse, input: unknown) =>
    estimateCall(pricing, {
      billing: ai.billing,
      model,
      promptChars: deps.promptFor(use).text.length + JSON.stringify(input).length,
      maxOutputTokens,
    })

  const dropExpired = () => {
    for (const [id, saved] of estimates) if (isEstimateExpired(saved.createdAt, now())) estimates.delete(id)
  }

  // An estimate spent or for something else is refused; work in the background asks this before it starts.
  const estimateOf = (estimateId: string, use: ChannelUse, journeyId?: string): Saved => {
    const saved = estimates.get(estimateId)
    if (
      !saved ||
      saved.use !== use ||
      (journeyId !== undefined && saved.journeyId !== journeyId) ||
      isEstimateExpired(saved.createdAt, now())
    ) {
      throw new ApiError({ code: 'validacion', fields: { estimateId: 'no_valido' } })
    }
    return saved
  }

  return {
    assertEstimate(estimateId: string, use: ChannelUse, journeyId?: string): void {
      estimateOf(estimateId, use, journeyId)
    },

    estimate({
      journeyId,
      use,
      input,
      outputTokens,
    }: {
      journeyId: string
      use: ChannelUse
      input: Record<string, unknown>
      /** What the AI is expected to write (005, R11): what is shown. The budget still counts the most it may write. */
      outputTokens?: number
    }): Estimate {
      const ai = activeOrThrow()
      const profile = profileOf(ai, use)
      const call = callCents(ai, profile.model, profile.maxOutputTokens, use, input)
      const expected = callCents(
        ai,
        profile.model,
        Math.min(outputTokens ?? profile.maxOutputTokens, profile.maxOutputTokens),
        use,
        input,
      )
      const withInstructions = callCents(ai, profile.model, profile.maxOutputTokens, use, {
        ...input,
        instructions: MAX_INSTRUCTIONS,
      })
      // The repetition of an invalid answer is reserved: the budget has to hold two calls (principle IV, P17).
      const blockedBy = budgetBlock(ai, call.cents * CALLS_RESERVED)
      dropExpired()
      const estimateId = randomUUID()
      estimates.set(estimateId, { journeyId, use, cents: expected.cents, createdAt: now() })
      return {
        estimateId,
        use,
        cents: expected.cents,
        included: expected.included,
        blockedBy,
        maxCents: maxCentsOf(ai, withInstructions.cents),
        pricingVersion: call.pricingVersion,
      }
    },

    async run<U extends ChannelUse>({
      estimateId,
      journeyId,
      use,
      input,
      instructions,
      signal,
      schema: strict,
    }: {
      estimateId: string
      /** When given, the estimate has to be one asked for this journey. */
      journeyId?: string
      use: U
      input: Record<string, unknown>
      instructions?: string
      signal?: AbortSignal
      /** A stricter schema than the use's own, such as one that knows the pillars of the profile (004, ai-uses.md). */
      schema?: { safeParse(value: unknown): { success: boolean } }
    }): Promise<RunResult<U>> {
      const saved = estimateOf(estimateId, use, journeyId)
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

      const fullInput = instructions ? { ...input, instructions } : input
      // What is really sent (the previous proposal, the creator's instructions) can be longer than what was estimated:
      // the budget is checked with the larger of the two (P17).
      const oneCallCents = Math.max(
        saved.cents,
        callCents(ai, profile.model, profile.maxOutputTokens, use, fullInput).cents,
      )

      // Checked again, with the repetition reserved: the totals may have moved since the estimate.
      if (budgetBlock(ai, oneCallCents * CALLS_RESERVED)) {
        usage.record({ ...base, inputTokens: 0, outputTokens: 0, costCents: 0, outcome: 'limite_de_gasto' })
        return { ok: false, failure: 'limite_de_gasto' }
      }

      const prompt = deps.promptFor(use)
      const schema = (strict ?? CHANNEL_OUTPUTS[use]) as unknown as AiRequest<ChannelOutput<U>>['schema']
      let inputTokens = 0
      let outputTokens = 0
      // Asking again for the figures goes only if what was spent, plus two more calls (that one and the repetition the
      // adapter may need), still fits every limit (P17).
      const mayAskAgain = (): boolean => {
        const spent = costCents(pricing, profile.model, inputTokens, outputTokens)
        const allowed = budgetBlock(ai, spent + oneCallCents * CALLS_RESERVED) === null
        if (!allowed) logger.warn('ai.retry_skipped_budget', { use })
        return allowed
      }
      const call = async (text: string) => {
        const result = await ai.generate<ChannelOutput<U>>({
          use,
          prompt: { ...prompt, text },
          input: fullInput,
          schema,
          ...(signal ? { signal } : {}),
        })
        // Also on a failure: an answer that did not validate was paid for all the same (principle III).
        inputTokens += result.usage?.inputTokens ?? 0
        outputTokens += result.usage?.outputTokens ?? 0
        return result
      }
      const finish = (outcome: RunFailure | 'ok') => {
        const cents = ai.billing === 'suscripcion' ? 0 : costCents(pricing, profile.model, inputTokens, outputTokens)
        const row = usage.record({ ...base, inputTokens, outputTokens, costCents: cents, outcome })
        if (overrunsEstimate(saved.cents, cents)) {
          logger.warn('estimate_overrun', { use, estimatedCents: saved.cents, costCents: cents })
        }
        return row.id
      }

      // What the AI wrote the last time is not a source: a figure in it may be out of date, or its own invention.
      const sources: Record<string, unknown> = { ...(input as Record<string, unknown>) }
      delete sources['previous']

      let result = await call(prompt.text)
      if (result.ok) {
        const violations = checkClaims(result.value, sources, CLAIM_FIELDS[use])
        // Without room for another call, the figures with no source are trimmed below instead (P17).
        if (violations.length > 0 && mayAskAgain()) {
          result = await call(`${prompt.text}\n\n${claimsFeedback(violations)}`)
        }
      }
      if (!result.ok) {
        const failure: RunFailure = result.invalidOutput ? 'respuesta_invalida' : result.failure.kind
        finish(failure)
        return { ok: false, failure }
      }
      const { output, trimmed } = trimClaims(result.value, sources, CLAIM_FIELDS[use])
      // Trimming can empty a field its schema requires: saved like that, the journey could not end later.
      if (trimmed && !(strict ?? CHANNEL_OUTPUTS[use]).safeParse(output).success) {
        finish('respuesta_invalida')
        return { ok: false, failure: 'respuesta_invalida' }
      }
      return { ok: true, value: output, claimsTrimmed: trimmed, usageId: finish('ok') }
    },
  }
}

export type AiRunService = ReturnType<typeof createAiRunService>

import type { Billing } from '../ai/capabilities.ts'

// The figures of `pricing.json`, already read (contracts/cost.md).
export interface Pricing {
  version: number
  models: Record<string, { input: number; output: number }> // USD per million tokens
  usdToEur: number
  charsPerToken: number
  webSearchUsdPer1000: number
  webInputTokensPerSearch: number // an assumption: what comes back from a search has no cap (R6)
  webInputTokensPerFetch: number // an assumption: a page read up to the most that is asked for
}

export const ESTIMATE_TTL_MS = 10 * 60_000
const OVERRUN = 1.5

function usdOf(pricing: Pricing, model: string, inputTokens: number, outputTokens: number, webSearches = 0): number {
  const price = pricing.models[model]
  if (!price) throw new Error(`No price for model ${model}`)
  return (
    (inputTokens * price.input + outputTokens * price.output) / 1_000_000 +
    (webSearches * pricing.webSearchUsdPer1000) / 1000
  )
}

// Rounded to 6 decimals first, so float noise never adds a cent.
const usdToCents = (pricing: Pricing, usd: number) => Math.ceil(Math.round(usd * pricing.usdToEur * 100 * 1e6) / 1e6)

export function costCents(
  pricing: Pricing,
  model: string,
  inputTokens: number,
  outputTokens: number,
  webSearches = 0,
): number {
  return usdToCents(pricing, usdOf(pricing, model, inputTokens, outputTokens, webSearches))
}

export interface CallToEstimate {
  billing: Billing
  model: string
  inputTokens?: number // counted by the provider when it can
  promptChars?: number
  maxOutputTokens: number
  web?: { maxSearches: number; maxFetches: number } // the most the request may search and read
}

export interface CallEstimate {
  cents: number
  repeatableCents: number // the part a repetition pays again: everything, unless there is a search
  included: boolean
  inputTokens: number
  outputTokens: number
  pricingVersion: number
}

export function estimateCall(pricing: Pricing, call: CallToEstimate): CallEstimate {
  const inputTokens = call.inputTokens ?? Math.ceil((call.promptChars ?? 0) / pricing.charsPerToken)
  const included = call.billing === 'suscripcion'
  const { model, maxOutputTokens: output, web } = call
  // With a search, what the first step read and wrote is paid once; only the step that gives the format can repeat (R6).
  const onceUsd = web
    ? usdOf(
        pricing,
        model,
        inputTokens +
          web.maxSearches * pricing.webInputTokensPerSearch +
          web.maxFetches * pricing.webInputTokensPerFetch,
        output,
        web.maxSearches,
      )
    : 0
  const repeatableUsd = usdOf(pricing, model, inputTokens + (web ? output : 0), output)
  return {
    cents: included ? 0 : usdToCents(pricing, onceUsd + repeatableUsd),
    repeatableCents: included ? 0 : usdToCents(pricing, repeatableUsd),
    included,
    inputTokens,
    outputTokens: call.maxOutputTokens,
    pricingVersion: pricing.version,
  }
}

// What a number of attempts can cost: the part paid once, and the rest as many times.
export function reservedCents(call: Pick<CallEstimate, 'cents' | 'repeatableCents'>, attempts: number): number {
  return call.cents + call.repeatableCents * (attempts - 1)
}

export function isEstimateExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= ESTIMATE_TTL_MS
}

export function overrunsEstimate(estimatedCents: number, actualCents: number): boolean {
  return actualCents > estimatedCents * OVERRUN
}

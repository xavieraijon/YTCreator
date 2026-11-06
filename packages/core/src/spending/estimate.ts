import type { Billing } from '../ai/capabilities.ts'

// The figures of `pricing.json`, already read (contracts/cost.md).
export interface Pricing {
  version: number
  models: Record<string, { input: number; output: number }> // USD per million tokens
  usdToEur: number
  charsPerToken: number
}

export const ESTIMATE_TTL_MS = 10 * 60_000
const OVERRUN = 1.5

export function costCents(pricing: Pricing, model: string, inputTokens: number, outputTokens: number): number {
  const price = pricing.models[model]
  if (!price) throw new Error(`No price for model ${model}`)
  const usd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000
  // Rounded to 6 decimals first, so float noise never adds a cent.
  return Math.ceil(Math.round(usd * pricing.usdToEur * 100 * 1e6) / 1e6)
}

export interface CallToEstimate {
  billing: Billing
  model: string
  inputTokens?: number // counted by the provider when it can
  promptChars?: number
  maxOutputTokens: number
}

export interface CallEstimate {
  cents: number
  included: boolean
  inputTokens: number
  outputTokens: number
  pricingVersion: number
}

export function estimateCall(pricing: Pricing, call: CallToEstimate): CallEstimate {
  const inputTokens = call.inputTokens ?? Math.ceil((call.promptChars ?? 0) / pricing.charsPerToken)
  const included = call.billing === 'suscripcion'
  return {
    cents: included ? 0 : costCents(pricing, call.model, inputTokens, call.maxOutputTokens),
    included,
    inputTokens,
    outputTokens: call.maxOutputTokens,
    pricingVersion: pricing.version,
  }
}

export function isEstimateExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= ESTIMATE_TTL_MS
}

export function overrunsEstimate(estimatedCents: number, actualCents: number): boolean {
  return actualCents > estimatedCents * OVERRUN
}

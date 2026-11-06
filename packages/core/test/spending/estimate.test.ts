import { describe, expect, it } from 'vitest'
import {
  costCents,
  ESTIMATE_TTL_MS,
  estimateCall,
  isEstimateExpired,
  overrunsEstimate,
  type Pricing,
} from '../../src/index.ts'

const pricing: Pricing = {
  version: 1,
  models: { 'claude-haiku-5-5': { input: 0.1, output: 0.5 }, 'claude-sonnet-5-5': { input: 2, output: 10 } },
  usdToEur: 0.86,
  charsPerToken: 3.5,
}

describe('estimate', () => {
  it('cents = ceil(usd × fx × 100) with the prices of pricing.json', () => {
    // (3500 × 2 + 4000 × 10) / 1e6 = 0.047 USD → 0.04042 € → 4.042 cents → 5
    expect(costCents(pricing, 'claude-sonnet-5-5', 3_500, 4_000)).toBe(5)
    expect(costCents(pricing, 'claude-haiku-5-5', 0, 0)).toBe(0)
  })

  it('counts tokens from characters when they cannot be counted', () => {
    const estimate = estimateCall(pricing, {
      billing: 'por_uso',
      model: 'claude-sonnet-5-5',
      promptChars: 12_250,
      maxOutputTokens: 4_000,
    })
    expect(estimate).toEqual({ cents: 5, included: false, inputTokens: 3_500, outputTokens: 4_000, pricingVersion: 1 })
  })

  it('a subscription costs 0 €', () => {
    const estimate = estimateCall(pricing, {
      billing: 'suscripcion',
      model: 'claude-sonnet-5-5',
      inputTokens: 100_000,
      maxOutputTokens: 4_000,
    })
    expect(estimate).toMatchObject({ cents: 0, included: true })
  })

  it('an unknown model fails loudly instead of costing 0', () => {
    expect(() => costCents(pricing, 'otro', 10, 10)).toThrow()
  })

  it('expires after 10 minutes', () => {
    const createdAt = new Date('2026-11-01T10:00:00Z')
    expect(ESTIMATE_TTL_MS).toBe(600_000)
    expect(isEstimateExpired(createdAt, new Date('2026-11-01T10:09:59Z'))).toBe(false)
    expect(isEstimateExpired(createdAt, new Date('2026-11-01T10:10:00Z'))).toBe(true)
  })

  it('warns when the real cost goes more than 50 % over the estimate', () => {
    expect(overrunsEstimate(10, 15)).toBe(false)
    expect(overrunsEstimate(10, 16)).toBe(true)
    expect(overrunsEstimate(0, 0)).toBe(false)
  })
})

import { estimateCall, PROPOSED_LIMITS, reservedCents, type Pricing } from '@ytcreator/core'
import { loadMarket } from '@ytcreator/knowledge'
import { describe, expect, it } from 'vitest'
import { resolveProfile } from '../src/profiles.ts'

const market = loadMarket()

const pricing: Pricing = {
  version: market.pricing.version,
  models: market.pricing.data.models,
  usdToEur: market.pricing.data.usdToEur.rate,
  charsPerToken: market.pricing.data.charsPerToken,
  webSearchUsdPer1000: market.pricing.data.webSearchUsdPer1000,
  webInputTokensPerSearch: market.pricing.data.webInputTokensPerSearch.value,
  webInputTokensPerFetch: market.pricing.data.webInputTokensPerFetch.value,
}

describe('what researching can cost (R6, decision 37)', () => {
  it.each(['investigacion', 'comprobar_guion'] as const)('%s fits in the proposed limit per operation', (use) => {
    const profile = resolveProfile('anthropic', use)
    const estimate = estimateCall(pricing, {
      billing: 'por_uso',
      model: profile.model,
      promptChars: 10_000,
      maxOutputTokens: profile.maxOutputTokens,
      web: profile.web!,
    })
    expect(reservedCents(estimate, 2)).toBeLessThanOrEqual(PROPOSED_LIMITS.perOperationCents)
  })

  it('stops a resume at what the estimate counts', () => {
    const { web } = resolveProfile('anthropic', 'investigacion')
    expect(web!.maxResultTokens).toBe(
      web!.maxSearches * pricing.webInputTokensPerSearch + web!.maxFetches * pricing.webInputTokensPerFetch,
    )
  })
})

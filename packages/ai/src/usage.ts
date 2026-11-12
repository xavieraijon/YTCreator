import type { AiUsage } from '@ytcreator/core'

// What several attempts of one operation consumed together: a retry also costs.
export const addUsage = (a: AiUsage, b: AiUsage | undefined): AiUsage => {
  const webSearches = (a.webSearches ?? 0) + (b?.webSearches ?? 0)
  return {
    inputTokens: (a.inputTokens ?? 0) + (b?.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b?.outputTokens ?? 0),
    ...(webSearches > 0 ? { webSearches } : {}),
  }
}

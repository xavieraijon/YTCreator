import type { AiUsage } from '@ytcreator/core'

// What several attempts of one operation consumed together: a retry also costs.
export const addUsage = (a: AiUsage, b: AiUsage | undefined): AiUsage => ({
  inputTokens: (a.inputTokens ?? 0) + (b?.inputTokens ?? 0),
  outputTokens: (a.outputTokens ?? 0) + (b?.outputTokens ?? 0),
})

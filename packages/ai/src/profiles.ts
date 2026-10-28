import type { AiUse } from '@ytcreator/core'

export type ProviderId = 'claude-code' | 'anthropic' | 'gemini' | 'fake'

export interface AiProfile {
  model: string
  timeoutMs: number
  maxOutputTokens: number
  effort?: 'low' | 'medium' | 'high'
}

// Model, effort and timeout come from (provider, use), never from the caller or the environment.
export const PROFILES: Record<ProviderId, Record<AiUse, AiProfile>> = {
  'claude-code': { comprobacion: { model: 'claude-haiku-5-5', timeoutMs: 60_000, maxOutputTokens: 16, effort: 'low' } },
  anthropic: { comprobacion: { model: 'claude-haiku-5-5', timeoutMs: 30_000, maxOutputTokens: 16 } },
  // Provisional until spike S6 confirms the lightest model of the free tier.
  gemini: { comprobacion: { model: 'gemini-flash-lite-latest', timeoutMs: 30_000, maxOutputTokens: 16 } },
  fake: { comprobacion: { model: 'fake', timeoutMs: 1_000, maxOutputTokens: 16 } },
}

export interface ProfileSettings {
  // `ai_timeout_seconds` of the expert mode; replaces the profile timeout when set.
  aiTimeoutSeconds?: number | null
}

export function resolveProfile(provider: ProviderId, use: AiUse, settings: ProfileSettings = {}): AiProfile {
  const profile = PROFILES[provider][use]
  const seconds = settings.aiTimeoutSeconds
  return seconds ? { ...profile, timeoutMs: seconds * 1000 } : profile
}

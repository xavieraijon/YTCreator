import type { AiUse } from '@ytcreator/core'

export type ProviderId = 'claude-code' | 'anthropic' | 'fake'

export interface AiProfile {
  model: string
  timeoutMs: number
  maxOutputTokens: number
  effort?: 'low' | 'medium' | 'high'
}

const HAIKU = 'claude-haiku-5-5'
const SONNET = 'claude-sonnet-5-5'

const short = (maxOutputTokens: number): AiProfile => ({ model: HAIKU, timeoutMs: 60_000, maxOutputTokens })
const long = (maxOutputTokens: number): AiProfile => ({ model: SONNET, timeoutMs: 120_000, maxOutputTokens })

const CHANNEL_USES = {
  preguntas: short(1024),
  nichos: long(4096),
  conceptos: long(6144),
  nombres: short(2048),
  recomendacion: long(2048),
  lectura_canal: long(6144),
  posicionamiento: long(6144),
} satisfies Record<Exclude<AiUse, 'comprobacion'>, AiProfile>

const withEffort = (effort: AiProfile['effort'], profile: AiProfile): AiProfile => ({ ...profile, effort })

// Model, effort and timeout come from (provider, use), never from the caller or the environment.
export const PROFILES: Record<ProviderId, Record<AiUse, AiProfile>> = {
  'claude-code': {
    comprobacion: { model: HAIKU, timeoutMs: 60_000, maxOutputTokens: 16, effort: 'low' },
    preguntas: withEffort('low', CHANNEL_USES.preguntas),
    nichos: withEffort('medium', CHANNEL_USES.nichos),
    conceptos: withEffort('medium', CHANNEL_USES.conceptos),
    nombres: withEffort('low', CHANNEL_USES.nombres),
    recomendacion: withEffort('medium', CHANNEL_USES.recomendacion),
    lectura_canal: withEffort('medium', CHANNEL_USES.lectura_canal),
    posicionamiento: withEffort('medium', CHANNEL_USES.posicionamiento),
  },
  anthropic: { comprobacion: { model: HAIKU, timeoutMs: 30_000, maxOutputTokens: 16 }, ...CHANNEL_USES },
  // Longer than the 5 s after which the web offers «Cancelar», so `lento` can show it (e2e failures.spec.ts).
  fake: {
    comprobacion: { model: 'fake', timeoutMs: 10_000, maxOutputTokens: 16 },
    ...Object.fromEntries(
      Object.entries(CHANNEL_USES).map(([use, p]) => [use, { ...p, model: 'fake', timeoutMs: 10_000 }]),
    ),
  } as Record<AiUse, AiProfile>,
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

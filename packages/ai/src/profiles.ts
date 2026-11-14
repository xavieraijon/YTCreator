import type { AiUse, AiWebLimits } from '@ytcreator/core'

export type ProviderId = 'claude-code' | 'anthropic' | 'fake'

export interface AiProfile {
  model: string
  timeoutMs: number
  maxOutputTokens: number
  effort?: 'low' | 'medium' | 'high'
  web?: AiWebLimits // the uses that look things up on the internet (005, ai-uses.md)
}

const HAIKU = 'claude-haiku-5-5'
const SONNET = 'claude-sonnet-5-5'

const short = (maxOutputTokens: number): AiProfile => ({ model: HAIKU, timeoutMs: 60_000, maxOutputTokens })
const long = (maxOutputTokens: number): AiProfile => ({ model: SONNET, timeoutMs: 120_000, maxOutputTokens })

// What the estimate counts (R6, decision 37): six readings, so that researching fits in the proposed limit per operation.
const WEB_LIMITS: AiWebLimits = { maxSearches: 8, maxFetches: 6, maxResultTokens: 88_000 }

const CHANNEL_USES = {
  preguntas: short(1024),
  nichos: long(4096),
  conceptos: long(6144),
  nombres: short(2048),
  recomendacion: long(2048),
  lectura_canal: long(6144),
  posicionamiento: long(6144),
  perfil_parte: long(2048),
  // The idea bank (004, contracts/ai-uses.md): output cap and time per use.
  ideas: { model: SONNET, timeoutMs: 90_000, maxOutputTokens: 3000 },
  otro_enfoque: { model: SONNET, timeoutMs: 60_000, maxOutputTokens: 1500 },
  busquedas_idea: { model: HAIKU, timeoutMs: 30_000, maxOutputTokens: 300 },
  // The script (005, contracts/ai-uses.md).
  escaleta: { model: SONNET, timeoutMs: 120_000, maxOutputTokens: 5000 },
  guion: { model: SONNET, timeoutMs: 420_000, maxOutputTokens: 22_000 },
  guion_short: { model: SONNET, timeoutMs: 90_000, maxOutputTokens: 2000 },
  bloque_guion: { model: SONNET, timeoutMs: 90_000, maxOutputTokens: 3000 },
  enfoques_short: { model: SONNET, timeoutMs: 60_000, maxOutputTokens: 1500 },
  investigacion: { model: SONNET, timeoutMs: 300_000, maxOutputTokens: 8000, web: WEB_LIMITS },
  comprobar_guion: { model: SONNET, timeoutMs: 300_000, maxOutputTokens: 8000, web: WEB_LIMITS },
  // The publishing package (006, contracts/ai-uses.md).
  titulos: { model: SONNET, timeoutMs: 90_000, maxOutputTokens: 1500 },
  miniaturas: { model: SONNET, timeoutMs: 90_000, maxOutputTokens: 2000 },
  descripcion: { model: SONNET, timeoutMs: 120_000, maxOutputTokens: 4000 },
  parte_paquete: { model: SONNET, timeoutMs: 90_000, maxOutputTokens: 2500 },
  paquete_short: { model: SONNET, timeoutMs: 90_000, maxOutputTokens: 2500 },
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
    perfil_parte: withEffort('low', CHANNEL_USES.perfil_parte),
    ideas: withEffort('medium', CHANNEL_USES.ideas),
    otro_enfoque: withEffort('medium', CHANNEL_USES.otro_enfoque),
    busquedas_idea: withEffort('low', CHANNEL_USES.busquedas_idea),
    escaleta: withEffort('medium', CHANNEL_USES.escaleta),
    guion: withEffort('medium', CHANNEL_USES.guion),
    guion_short: withEffort('medium', CHANNEL_USES.guion_short),
    bloque_guion: withEffort('medium', CHANNEL_USES.bloque_guion),
    enfoques_short: withEffort('medium', CHANNEL_USES.enfoques_short),
    investigacion: withEffort('medium', CHANNEL_USES.investigacion),
    comprobar_guion: withEffort('medium', CHANNEL_USES.comprobar_guion),
    titulos: withEffort('medium', CHANNEL_USES.titulos),
    miniaturas: withEffort('medium', CHANNEL_USES.miniaturas),
    descripcion: withEffort('medium', CHANNEL_USES.descripcion),
    parte_paquete: withEffort('medium', CHANNEL_USES.parte_paquete),
    paquete_short: withEffort('medium', CHANNEL_USES.paquete_short),
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

// Grows with each feature that calls the AI; every use has its own profile per provider.
export const AI_USES = ['comprobacion'] as const
export type AiUse = (typeof AI_USES)[number]

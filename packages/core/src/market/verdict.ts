import type { EntryLevel, Level, Verdict } from '../channel/model.ts'

export const VERDICT_REASONS = [
  'demanda_baja',
  'puerta_cerrada',
  'concentracion_alta',
  'puerta_entreabierta',
  'buen_equilibrio',
] as const
export type VerdictReason = (typeof VERDICT_REASONS)[number]

export interface VerdictInput {
  demandLevel: Level
  entryLevel: EntryLevel
  concentrationLevel: Level
}

// A fixed rule, in this order (contracts/market.md). The AI explains it but never changes it.
export function verdictOf({ demandLevel, entryLevel, concentrationLevel }: VerdictInput): {
  verdict: Verdict
  reason: VerdictReason
} {
  if (demandLevel === 'baja') return { verdict: 'no_conviene', reason: 'demanda_baja' }
  if (entryLevel === 'cerrada') return { verdict: 'no_conviene', reason: 'puerta_cerrada' }
  if (concentrationLevel === 'alta') return { verdict: 'con_reservas', reason: 'concentracion_alta' }
  if (entryLevel === 'entreabierta') return { verdict: 'con_reservas', reason: 'puerta_entreabierta' }
  return { verdict: 'conviene', reason: 'buen_equilibrio' }
}

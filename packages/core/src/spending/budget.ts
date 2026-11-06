import type { LimitsBody } from '../api/settings.ts'

export type BudgetBlock = 'por_operacion' | 'diario' | 'mensual'

export interface BudgetCheck {
  cents: number
  limits: LimitsBody
  spentTodayCents: number
  spentThisMonthCents: number
}

// Checked when estimating and again right before the call (contracts/cost.md).
export function checkBudget({ cents, limits, spentTodayCents, spentThisMonthCents }: BudgetCheck): BudgetBlock | null {
  if (cents === 0) return null
  if (cents > limits.perOperationCents) return 'por_operacion'
  if (spentTodayCents + cents > limits.dailyCents) return 'diario'
  if (spentThisMonthCents + cents > limits.monthlyCents) return 'mensual'
  return null
}

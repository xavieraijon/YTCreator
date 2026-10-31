import type { FieldCode } from '../api/errors.ts'
import type { LimitsBody } from '../api/settings.ts'

// Proposed by the wizard for pago_por_uso (FR-021, R17): 0,50 €, 3,00 € and 20,00 €.
export const PROPOSED_LIMITS: LimitsBody = { perOperationCents: 50, dailyCents: 300, monthlyCents: 2000 }

// 1000 € a month (FR-022).
export const MAX_MONTHLY_CENTS = 100_000

export type LimitsField = keyof LimitsBody

export type LimitsValidation =
  { ok: true; limits: LimitsBody } | { ok: false; fields: Partial<Record<LimitsField, FieldCode>> }

// Repeats the CHECKs of `spending_limits`, so the creator gets a code per field instead of a database error.
// Each field gets one code; a comparison only counts between fields that are themselves valid.
export function validateLimits(limits: LimitsBody): LimitsValidation {
  const fields: Partial<Record<LimitsField, FieldCode>> = {}
  const usable = (field: LimitsField) => {
    const value = limits[field]
    if (!Number.isSafeInteger(value)) fields[field] = 'no_valido'
    else if (value <= 0) fields[field] = 'debe_ser_positivo'
    return fields[field] === undefined
  }

  const perOperation = usable('perOperationCents')
  const daily = usable('dailyCents')
  const monthly = usable('monthlyCents')

  if (perOperation && daily && limits.perOperationCents > limits.dailyCents) {
    fields.perOperationCents = 'mayor_que_diario'
  }
  if (daily && monthly && limits.dailyCents > limits.monthlyCents) fields.dailyCents = 'mayor_que_mensual'
  if (monthly && limits.monthlyCents > MAX_MONTHLY_CENTS) fields.monthlyCents = 'demasiado_alto'

  return Object.keys(fields).length === 0 ? { ok: true, limits } : { ok: false, fields }
}

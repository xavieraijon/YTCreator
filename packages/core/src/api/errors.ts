import { z } from 'zod'
import { aiFailureSchema } from './ai.ts'
import { onboardingStateSchema } from './onboarding.ts'

export const API_ERROR_CODES = ['validacion', 'conflicto', 'no_encontrado', 'ia', 'prohibido', 'interno'] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export const GUARDS = ['sin_conexion', 'sin_limites', 'maximo_de_cuentas'] as const
export type Guard = (typeof GUARDS)[number]

// Codes of `fields` (field → code); the web translates each one.
export const FIELD_CODES = [
  'no_valido',
  'longitud_no_valida',
  'debe_ser_positivo',
  'mayor_que_diario',
  'mayor_que_mensual',
  'demasiado_alto',
] as const
export type FieldCode = (typeof FIELD_CODES)[number]

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    fields: z.record(z.string(), z.enum(FIELD_CODES)).optional(),
    guard: z.enum(GUARDS).optional(),
    failure: aiFailureSchema.optional(),
    current: onboardingStateSchema.optional(),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

export const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  validacion: 400,
  prohibido: 403,
  no_encontrado: 404,
  conflicto: 409,
  ia: 422,
  interno: 500,
}

import { z } from 'zod'
import { YOUTUBE_FAILURES } from '../youtube/failures.ts'
import { aiFailureSchema } from './ai.ts'
import { journeySchema } from './channel.ts'
import { onboardingStateSchema } from './onboarding.ts'

export const API_ERROR_CODES = [
  'validacion',
  'conflicto',
  'no_encontrado',
  'ia',
  'youtube',
  'prohibido',
  'interno',
] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export const GUARDS = ['sin_conexion', 'sin_limites', 'maximo_de_cuentas', 'ya_hay_canal'] as const
export type Guard = (typeof GUARDS)[number]

// Codes of `fields` (field → code); the web translates each one.
export const FIELD_CODES = [
  'no_valido',
  'longitud_no_valida',
  'debe_ser_positivo',
  'mayor_que_diario',
  'mayor_que_mensual',
  'demasiado_alto',
  // The idea bank (004): a channel without a profile, and «Buscar otro enfoque» for an idea that is not burned.
  'sin_perfil',
  'sin_medida_quemada',
] as const
export type FieldCode = (typeof FIELD_CODES)[number]

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    fields: z.record(z.string(), z.enum(FIELD_CODES)).optional(),
    guard: z.enum(GUARDS).optional(),
    failure: aiFailureSchema.optional(),
    youtubeFailure: z.enum(YOUTUBE_FAILURES).optional(),
    // A stale `revision`: what the server has now (the wizard's state or the journey).
    current: z.union([onboardingStateSchema, journeySchema]).optional(),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

export const HTTP_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  validacion: 400,
  prohibido: 403,
  no_encontrado: 404,
  conflicto: 409,
  ia: 422,
  youtube: 502,
  interno: 500,
}

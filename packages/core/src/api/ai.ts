import { z } from 'zod'
import { CONNECTION_STATUSES, FAILURE_KINDS, FAILURE_REASONS, type AiFailure } from '../ai/failures.ts'
import { Secret } from '../secrets/secret.ts'
import { connectionKindSchema } from './onboarding.ts'

const ALL_REASONS = Object.values(FAILURE_REASONS).flat()
const failureReasonSchema = z.enum(ALL_REASONS as [string, ...string[]])

export const aiFailureSchema = z
  .object({
    kind: z.enum(FAILURE_KINDS as [string, ...string[]]),
    reason: failureReasonSchema,
    resetsAt: z.string().optional(),
  })
  .refine((f) => (FAILURE_REASONS[f.kind as AiFailure['kind']] as readonly string[]).includes(f.reason), {
    message: 'reason does not belong to kind',
  }) as unknown as z.ZodType<AiFailure>

const statusFields = {
  status: z.enum(CONNECTION_STATUSES),
  reason: failureReasonSchema.nullable(),
  resetsAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
}

export const connectionViewSchema = z.object({
  kind: connectionKindSchema,
  providerId: z.string(),
  isActive: z.boolean(),
  ...statusFields,
  hint: z.string().max(4).nullable(),
})
export type ConnectionView = z.infer<typeof connectionViewSchema>

export const accountViewSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: z.number().int().positive(),
  ...statusFields,
  lastCallAt: z.string().nullable(),
  hint: z.string().max(4),
})
export type AccountView = z.infer<typeof accountViewSchema>

export const repairStateSchema = z.object({ state: z.enum(['inactivo', 'en_curso', 'hecho', 'fallido']) })
export type RepairState = z.infer<typeof repairStateSchema>

export const aiOverviewSchema = z.object({
  activeKind: connectionKindSchema.nullable(),
  connections: z.array(connectionViewSchema),
  accounts: z.array(accountViewSchema),
  claudeCode: z.object({ installed: z.boolean(), version: z.string().nullable(), repair: repairStateSchema }),
  hasLimits: z.boolean(),
})
export type AiOverview = z.infer<typeof aiOverviewSchema>

export const accountSwitchedSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  reason: z.literal('cupo_agotado'),
})
export type AccountSwitched = z.infer<typeof accountSwitchedSchema>

export const checkConnectionResponseSchema = connectionViewSchema.extend({
  switched: z.array(accountSwitchedSchema).optional(),
})

export const loginStartSchema = z.object({ loginId: z.string(), url: z.string().url(), expiresAt: z.string() })

// Credentials arrive as text and become a Secret during validation; the text is not touched again.
const secretText = z
  .string()
  .trim()
  .min(1)
  .transform((value) => Secret.from(value))

export const labelSchema = z.string().trim().min(1).max(40)

export const completeLoginBodySchema = z.object({ code: secretText, label: labelSchema.optional() })
export const credentialBodySchema = z.object({ key: secretText })
export const activeBodySchema = z.object({ kind: connectionKindSchema })
export const renameAccountBodySchema = z.object({ label: labelSchema })
export const reorderAccountsBodySchema = z.object({ ids: z.array(z.string()).min(1) })
export const keyConnectionKindSchema = z.enum(['pago_por_uso', 'gratis'])

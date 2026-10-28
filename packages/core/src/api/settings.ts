import { z } from 'zod'

const cents = z.number().int()

export const limitsBodySchema = z.object({ perOperationCents: cents, dailyCents: cents, monthlyCents: cents })
export type LimitsBody = z.infer<typeof limitsBodySchema>

export const limitsViewSchema = limitsBodySchema.extend({ accepted: z.boolean() })
export type LimitsView = z.infer<typeof limitsViewSchema>

export const aiTimeoutSecondsSchema = z.number().int().min(10).max(300).nullable()

export const generalSettingsSchema = z.object({
  updateCheckEnabled: z.boolean(),
  aiTimeoutSeconds: aiTimeoutSecondsSchema,
})
export type GeneralSettings = z.infer<typeof generalSettingsSchema>

export const generalSettingsPatchSchema = generalSettingsSchema.partial()

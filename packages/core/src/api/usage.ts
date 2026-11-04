import { z } from 'zod'
import { AI_USES } from '../ai/uses.ts'

const cents = z.number().int().nonnegative()

export const usageItemSchema = z.object({
  id: z.string(),
  journeyId: z.string().nullable(),
  use: z.enum(AI_USES),
  providerId: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCents: cents,
  costCents: cents,
  pricingVersion: z.number().int().positive(),
  outcome: z.string(),
  createdAt: z.string(),
})

// GET /api/usage?from&to
export const usageQuerySchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() })
export const usageListSchema = z.object({ items: z.array(usageItemSchema), todayCents: cents, monthCents: cents })
export type UsageList = z.infer<typeof usageListSchema>

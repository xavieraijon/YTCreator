import { z } from 'zod'
import { ON_CAMERA } from './journey.ts'
import { AUDIENCE_REGIONS, NAME_STATUSES } from './model.ts'
import { HANDLE_PATTERN, WARNING_CODES } from './outputs.ts'

// The channel profile, the same for new and existing channels (data-model.md, FR-021b).
const text = z.string().trim().min(1)
const range = z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
export type Range = z.infer<typeof range>

// What the channel would earn a month: views × earnings per 1.000 views (rpm.json), rounded to whole euros.
export function monthlyEurRange(views: Range, rpm: Range): Range {
  return { min: Math.round((views.min * rpm.min) / 1000), max: Math.round((views.max * rpm.max) / 1000) }
}

export const monetizationSchema = z
  .object({
    rpmEurRange: range,
    monthlyViewsAssumption: range,
    monthlyEurRange: range,
    yppRequirements: z.object({
      subscribers: z.number().int().positive(),
      watchHours: z.number().int().positive(),
      shortsViews: z.number().int().positive(),
    }),
    assumptions: z.array(text),
    sourceIds: z.array(text),
  })
  .refine(
    (m) => {
      const expected = monthlyEurRange(m.monthlyViewsAssumption, m.rpmEurRange)
      return m.monthlyEurRange.min === expected.min && m.monthlyEurRange.max === expected.max
    },
    { message: 'monthlyEurRange debe ser visitas × ganancias por 1.000 / 1.000' },
  )

export const sourceSchema = z.object({
  id: text,
  kind: z.enum(['youtube', 'conocimiento']),
  label: text,
  url: z.string().nullable(),
  date: text,
})
export type Source = z.infer<typeof sourceSchema>

export const channelProfileSchema = z.object({
  schemaVersion: z.literal(1),
  niche: z.object({ label: text, summary: text, measureId: z.string().nullable() }),
  concept: z.object({
    promise: text.max(160),
    pillars: z
      .array(z.object({ title: text, description: text }))
      .min(3)
      .max(4),
    audience: z.object({ description: text, region: z.enum(AUDIENCE_REGIONS), madeForKids: z.boolean() }),
    format: z.object({ presence: z.enum(ON_CAMERA), longForm: text, shortsRole: text }),
    cadence: z.object({
      longPerWeek: z.number().min(0),
      shortsPerWeek: z.number().min(0),
      hoursPerWeek: z.number().min(0),
    }),
    monetization: monetizationSchema,
    warnings: z.array(z.object({ code: z.enum(WARNING_CODES), sourceId: text })),
  }),
  name: z.object({
    // Null while the name is left for later (FR-018b).
    displayName: text.max(100).nullable(),
    handle: z.string().regex(HANDLE_PATTERN).nullable(),
    status: z.enum(NAME_STATUSES),
    checkId: z.string().nullable(),
  }),
  context: z.object({ currentProfile: text, readingId: text }).nullable(),
  sources: z.array(sourceSchema),
})
export type ChannelProfile = z.infer<typeof channelProfileSchema>

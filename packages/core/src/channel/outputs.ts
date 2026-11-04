import { z } from 'zod'
import { AUDIENCE_REGIONS } from './model.ts'

// Output schemas of the six channel uses (contracts/ai-uses.md). The AI writes these; the domain fills the rest.
export const HANDLE_PATTERN = /^[A-Za-z0-9._-]{3,30}$/
export const WARNING_CODES = ['infantil', 'solo_shorts', 'no_autentico'] as const
export type WarningCode = (typeof WARNING_CODES)[number]

const text = z.string().trim().min(1)

export const questionsOutput = z.object({
  questions: z.array(z.object({ id: text, question: text, why: text })).max(3),
})

export const nichesOutput = z.object({
  niches: z
    .array(z.object({ label: text, summary: text, queries: z.array(text).min(1).max(3), whyItFits: text }))
    .min(3)
    .max(5),
})

export const conceptSchema = z.object({
  promise: text.max(160),
  pillars: z
    .array(z.object({ title: text, description: text }))
    .min(3)
    .max(4),
  audience: z.object({ description: text, region: z.enum(AUDIENCE_REGIONS), madeForKids: z.boolean() }),
  format: z.object({ presence: z.enum(['cara', 'voz', 'ninguna']), longForm: text, shortsRole: text }),
  cadence: z.object({
    longPerWeek: z.number().min(0),
    shortsPerWeek: z.number().min(0),
    hoursPerWeek: z.number().min(0),
  }),
  // Only the assumptions: the ranges come from rpm.json and ypp.json.
  monetization: z.object({ assumptions: z.array(text) }),
  warnings: z.array(z.enum(WARNING_CODES)).optional(),
})
export type ConceptOutput = z.infer<typeof conceptSchema>

export const conceptsOutput = z.object({ concepts: z.array(conceptSchema).min(2).max(3) })

export const namesOutput = z.object({
  names: z
    .array(z.object({ displayName: text.max(50), handle: z.string().regex(HANDLE_PATTERN), why: text }))
    .min(6)
    .max(8),
})

const cited = z.object({ text, videoIds: z.array(text).min(1) })
export const channelReadingOutput = z.object({
  niche: cited,
  pillars: z.array(cited).min(1),
  audience: cited,
  works: z.array(cited),
  doesNotWork: z.array(cited),
})

export const positioningOutput = conceptSchema.extend({
  changes: z.array(z.object({ what: text, why: text, videoIds: z.array(text) })),
})

export const CHANNEL_OUTPUTS = {
  preguntas: questionsOutput,
  nichos: nichesOutput,
  conceptos: conceptsOutput,
  nombres: namesOutput,
  lectura_canal: channelReadingOutput,
  posicionamiento: positioningOutput,
} as const
export type ChannelUse = keyof typeof CHANNEL_OUTPUTS
export type ChannelOutput<U extends ChannelUse> = z.infer<(typeof CHANNEL_OUTPUTS)[U]>

import { SCRIPT_OUTPUTS } from '../script/outputs.ts'
import { z } from 'zod'
import { AUDIENCE_REGIONS } from './model.ts'
import { RPM_CATEGORIES } from './monetization.ts'
import { IDEA_OUTPUTS } from '../ideas/outputs.ts'

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

// The creator's own niche joins the list, so an edited list may have one more than the AI can propose (FR-011).
export const nichesEditedOutput = z.object({
  niches: z
    .array(z.object({ label: text, summary: text, queries: z.array(text).min(1).max(3), whyItFits: text }))
    .min(1)
    .max(6),
})

// Marked as an opinion on screen; the verdict of each niche is a fixed rule it cannot change (FR-010).
export const recommendationOutput = z.object({
  recommendedLabel: text,
  why: text,
  cautions: z.array(z.object({ label: text, why: text })),
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
  // Only the assumptions and the kind of content: the ranges come from rpm.json and ypp.json.
  monetization: z.object({ category: z.enum(RPM_CATEGORIES), assumptions: z.array(text) }),
  warnings: z.array(z.enum(WARNING_CODES)).optional(),
})
export type ConceptOutput = z.infer<typeof conceptSchema>

// What the creator can save: the editor lets them delete the assumptions.
export const conceptsEditedOutput = z.object({ concepts: z.array(conceptSchema).min(2).max(3) })

// What the AI has to give: the money always comes with what it assumes (FR-014).
const generatedConcept = conceptSchema.extend({
  monetization: conceptSchema.shape.monetization.extend({ assumptions: z.array(text).min(1) }),
})
export const conceptsOutput = z.object({ concepts: z.array(generatedConcept).min(2).max(3) })

// With the creator's own names added to the proposal (FR-016): they are not limited to what the AI may give.
export const namesEditedOutput = z.object({
  names: z
    .array(z.object({ displayName: text.max(50), handle: z.string().regex(HANDLE_PATTERN), why: text }))
    .min(1)
    .max(12),
})

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

const changes = z.array(z.object({ what: text, why: text, videoIds: z.array(text).min(1) }))
export const positioningOutput = generatedConcept.extend({ changes })
export type PositioningOutput = z.infer<typeof positioningOutput>

// What the creator can save, as with a concept: they may delete the assumptions.
export const positioningEditedOutput = conceptSchema.extend({ changes })

// «Regenerar con IA» a part of a saved profile (entry 115): the AI gives the three texts it can rewrite and the domain
// keeps only the one asked for. Never the money, the rhythm or the figures.
export const PROFILE_PARTS = ['promesa', 'temas', 'publico'] as const
export type ProfilePart = (typeof PROFILE_PARTS)[number]
export const profilePartOutput = z.object({
  promise: text.max(160),
  pillars: conceptSchema.shape.pillars,
  audienceDescription: text,
})
export type ProfilePartOutput = z.infer<typeof profilePartOutput>

export const CHANNEL_OUTPUTS = {
  preguntas: questionsOutput,
  nichos: nichesOutput,
  recomendacion: recommendationOutput,
  conceptos: conceptsOutput,
  nombres: namesOutput,
  lectura_canal: channelReadingOutput,
  posicionamiento: positioningOutput,
  perfil_parte: profilePartOutput,
  // The idea bank (004) hangs from the channel too: the same run service, estimate and figure validator.
  ...IDEA_OUTPUTS,
  // The script (005) as well.
  ...SCRIPT_OUTPUTS,
} as const
export type ChannelUse = keyof typeof CHANNEL_OUTPUTS
export type ChannelOutput<U extends ChannelUse> = z.infer<(typeof CHANNEL_OUTPUTS)[U]>

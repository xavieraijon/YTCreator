import { z } from 'zod'
import type { IdeaFormat } from '../ideas/model.ts'
import { PUBLISH_LIMITS } from './model.ts'

// What the AI has to answer for each use of the publishing package (specs/006-publishing-package/contracts/ai-uses.md).

/** The most a title of the AI may have: what YouTube accepts (`publish/youtube.json`, decision 13). */
export const AI_TITLE_MAX = 100

const WEB_ADDRESS = /https?:\/\/|www\./i

/** Whether any text of the value, however deep, holds a web address: the AI never writes links (research.md R4). */
export function rejectWebAddresses(value: unknown): boolean {
  if (typeof value === 'string') return WEB_ADDRESS.test(value)
  if (Array.isArray(value)) return value.some(rejectWebAddresses)
  if (value && typeof value === 'object') return Object.values(value).some(rejectWebAddresses)
  return false
}

const noWebAddress = { message: 'direccion_web' }
const text = (max: number) => z.string().trim().min(1).max(max)

const aiTitle = z.object({
  text: text(AI_TITLE_MAX),
  why: text(PUBLISH_LIMITS.why),
  blockId: z.string().min(1),
})

/** How many titles the AI proposes: fewer in a Short (decision 17). */
export const TITLE_COUNTS: Record<IdeaFormat, { min: number; max: number }> = {
  largo: { min: 5, max: 8 },
  short: { min: 3, max: 5 },
}

export const titlesOutput = z
  .object({ titles: z.array(aiTitle).min(TITLE_COUNTS.short.min).max(TITLE_COUNTS.largo.max) })
  .refine((output) => !rejectWebAddresses(output), noWebAddress)
export type TitlesOutput = z.infer<typeof titlesOutput>

// As many as the format asks for, and each one keeps its promise in a block of the approved script (R8).
export const titlesOutputFor = (format: IdeaFormat, blockIds: readonly string[]) =>
  titlesOutput
    .refine(
      ({ titles }) => titles.length >= TITLE_COUNTS[format].min && titles.length <= TITLE_COUNTS[format].max,
      { message: 'cuantos_no_valido' },
    )
    .refine(({ titles }) => titles.every((title) => blockIds.includes(title.blockId)), {
      message: 'bloque_desconocido',
    })

/** YouTube can test up to three thumbnails (`publish/youtube.json`, «Probar y comparar»). */
export const AI_THUMBNAILS = 3

const aiConcept = z.object({
  scene: text(PUBLISH_LIMITS.scene),
  bigText: z.string().trim().max(PUBLISH_LIMITS.bigText),
  emotion: z.string().trim().max(PUBLISH_LIMITS.emotion),
  composition: z.string().trim().max(PUBLISH_LIMITS.composition),
  colors: z.string().trim().max(PUBLISH_LIMITS.colors),
  // 0 is the main title, 1 and 2 the alternatives.
  titleIndex: z.number().int().min(0).max(PUBLISH_LIMITS.alternatives),
})

export const thumbnailsOutput = z
  .object({ concepts: z.array(aiConcept).length(AI_THUMBNAILS) })
  .refine((output) => !rejectWebAddresses(output), noWebAddress)
export type ThumbnailsOutput = z.infer<typeof thumbnailsOutput>

// Each concept goes with a title that is there: the main one and the alternatives chosen.
export const thumbnailsOutputFor = (titleCount: number) =>
  thumbnailsOutput.refine(({ concepts }) => concepts.every((concept) => concept.titleIndex < titleCount), {
    message: 'titulo_desconocido',
  })

export const PUBLISH_OUTPUTS = {
  titulos: titlesOutput,
  miniaturas: thumbnailsOutput,
} as const
export type PublishUse = keyof typeof PUBLISH_OUTPUTS
export const PUBLISH_USES = Object.keys(PUBLISH_OUTPUTS) as [PublishUse, ...PublishUse[]]

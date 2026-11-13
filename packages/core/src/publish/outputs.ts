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
    .refine(({ titles }) => titles.length >= TITLE_COUNTS[format].min && titles.length <= TITLE_COUNTS[format].max, {
      message: 'cuantos_no_valido',
    })
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

// Hashtags only go in a Short, as a list of their own (decision 9): never inside the texts.
const HASHTAG_IN_TEXT = /(^|\s)#[^\s#]/
const noHashtags = (...texts: (string | undefined)[]) => texts.every((one) => !HASHTAG_IN_TEXT.test(one ?? ''))

/** How many tags the AI proposes: YouTube counts them all against `tagsMaxTotalChars` (decision 38). */
export const AI_TAGS = { min: 3, max: 20 } as const

const aiChapter = z.object({
  title: text(PUBLISH_LIMITS.chapterTitle),
  blockIds: z.array(z.string().min(1)).min(1),
})
const aiChapters = z.array(aiChapter).min(1).max(PUBLISH_LIMITS.chapters)
// YouTube Studio splits tags by commas: one with a comma, or the same one twice, would not be what was proposed.
const aiTags = z
  .array(text(PUBLISH_LIMITS.tag).regex(/^[^,]+$/))
  .min(AI_TAGS.min)
  .max(AI_TAGS.max)
  .refine((tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length, 'Etiquetas repetidas')
// The pinned comment is optional (decision 14): trimming a figure out of it must not throw the paid answer away.
const aiComment = z.string().trim().max(PUBLISH_LIMITS.comment)
const aiHashtag = z
  .string()
  .trim()
  .min(1)
  .max(PUBLISH_LIMITS.hashtag)
  .regex(/^[^\s#]+$/)

/** The chapters cover every block of the approved script, in its order and each one once (R3). */
export const coversBlocks = (chapters: readonly { blockIds: readonly string[] }[], blockIds: readonly string[]) => {
  const covered = chapters.flatMap((chapter) => chapter.blockIds)
  return covered.length === blockIds.length && covered.every((id, index) => id === blockIds[index])
}

// The first proposal of a long video's description: the minutes and the sources are not the AI's (R3, R4).
export const descriptionOutput = z
  .object({
    firstLines: text(PUBLISH_LIMITS.firstLines),
    body: text(PUBLISH_LIMITS.body),
    chapters: aiChapters,
    tags: aiTags,
    comment: aiComment,
  })
  .refine((output) => !rejectWebAddresses(output), noWebAddress)
  .refine((output) => noHashtags(output.firstLines, output.body, output.comment), { message: 'con_hashtags' })
export type DescriptionOutput = z.infer<typeof descriptionOutput>

/** YouTube's figures the answer must keep, from `packages/knowledge/publish/youtube.json` (never copied here). */
export interface YouTubeTextRules {
  readonly chapterMinCount: number
  readonly tagsMaxTotalChars: number
}

/** As many chapters as YouTube needs to show them, unless the script has fewer blocks (decision 39). */
const enoughChapters = (chapters: readonly unknown[], blockIds: readonly string[], rules?: YouTubeTextRules) =>
  !rules || chapters.length >= Math.min(rules.chapterMinCount, blockIds.length)
/** All the tags fit in what YouTube takes, counted with the commas that separate them. */
const tagsFit = (tags: readonly string[], rules?: YouTubeTextRules) =>
  !rules || tags.join(',').length <= rules.tagsMaxTotalChars

export const descriptionOutputFor = (blockIds: readonly string[], rules?: YouTubeTextRules) =>
  descriptionOutput
    .refine(({ chapters }) => coversBlocks(chapters, blockIds), { message: 'capitulos_no_validos' })
    .refine(({ chapters }) => enoughChapters(chapters, blockIds, rules), { message: 'pocos_capitulos' })
    .refine(({ tags }) => tagsFit(tags, rules), { message: 'etiquetas_largas' })

/** The parts that can be asked for again one by one (FR-011). */
export const PACKAGE_PARTS = ['descripcion', 'capitulos', 'etiquetas', 'comentario', 'portada_short'] as const
export type PackagePart = (typeof PACKAGE_PARTS)[number]

const PART_OUTPUTS = {
  // The fixed part is never the AI's; hashtags only in a Short, up to the three YouTube shows above the title.
  descripcion: z.object({
    firstLines: text(PUBLISH_LIMITS.firstLines),
    body: text(PUBLISH_LIMITS.body),
    hashtags: z.array(aiHashtag).max(3).optional(),
  }),
  capitulos: z.object({ chapters: aiChapters }),
  etiquetas: z.object({ tags: aiTags }),
  comentario: z.object({ comment: aiComment }),
  portada_short: z.object({
    cover: z.object({
      blockId: z.string().min(1),
      moment: text(PUBLISH_LIMITS.moment),
      screenText: z.string().trim().max(PUBLISH_LIMITS.screenText),
    }),
  }),
} as const
export type PartOutput<P extends PackagePart> = z.infer<(typeof PART_OUTPUTS)[P]>

export const partOutput = z
  .union([
    PART_OUTPUTS.descripcion,
    PART_OUTPUTS.capitulos,
    PART_OUTPUTS.etiquetas,
    PART_OUTPUTS.comentario,
    PART_OUTPUTS.portada_short,
  ])
  .refine((output) => !rejectWebAddresses(output), noWebAddress)
export type AnyPartOutput = z.infer<typeof partOutput>

/** The answer for one part, checked against the script and the format it is for. */
export function partOutputFor(
  part: PackagePart,
  format: IdeaFormat,
  blockIds: readonly string[],
  rules?: YouTubeTextRules,
) {
  const base = PART_OUTPUTS[part] as z.ZodType<Record<string, unknown>>
  return base
    .refine((output) => !rejectWebAddresses(output), noWebAddress)
    .refine(
      (output) => {
        switch (part) {
          case 'descripcion': {
            const { firstLines, body, hashtags } = output as PartOutput<'descripcion'>
            return noHashtags(firstLines, body) && (format === 'short' || (hashtags ?? []).length === 0)
          }
          case 'capitulos': {
            const { chapters } = output as PartOutput<'capitulos'>
            return coversBlocks(chapters, blockIds) && enoughChapters(chapters, blockIds, rules)
          }
          case 'etiquetas':
            return tagsFit((output as PartOutput<'etiquetas'>).tags, rules)
          case 'comentario':
            return noHashtags((output as PartOutput<'comentario'>).comment)
          case 'portada_short':
            return blockIds.includes((output as PartOutput<'portada_short'>).cover.blockId)
          default:
            return true
        }
      },
      { message: 'parte_no_valida' },
    )
}

export const PUBLISH_OUTPUTS = {
  titulos: titlesOutput,
  miniaturas: thumbnailsOutput,
  descripcion: descriptionOutput,
  parte_paquete: partOutput,
} as const
export type PublishUse = keyof typeof PUBLISH_OUTPUTS
export const PUBLISH_USES = Object.keys(PUBLISH_OUTPUTS) as [PublishUse, ...PublishUse[]]

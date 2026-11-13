import { z } from 'zod'
import type { IdeaFormat } from '../ideas/model.ts'

// The publishing package of an approved script: one versioned piece per kind
// (specs/006-publishing-package/data-model.md, research.md R1).
export const PACKAGE_KINDS = [
  'titulos',
  'miniaturas',
  'portada_short',
  'descripcion',
  'capitulos',
  'etiquetas',
  'comentario',
] as const
export type PackageKind = (typeof PACKAGE_KINDS)[number]

export const PACKAGE_ORIGINS = ['ia', 'edicion', 'parte_ia', 'recuperada'] as const
export type PackageOrigin = (typeof PACKAGE_ORIGINS)[number]

/** The two steps approved on the way; the package itself is approved at the end (research.md R2). */
export const PACKAGE_STEPS = ['portada', 'textos'] as const
export type PackageStep = (typeof PACKAGE_STEPS)[number]

export const PIECE_ORIGINS = ['ia', 'creador'] as const
export type PieceOrigin = (typeof PIECE_ORIGINS)[number]

export const PUBLISH_LIMITS = {
  candidates: 12,
  // What the creator writes may go past YouTube's maximum, so the review can warn (decision 13).
  titleText: 200,
  why: 300,
  alternatives: 2,
  concepts: 6,
  chosen: 3,
  scene: 500,
  bigText: 40,
  emotion: 120,
  composition: 300,
  colors: 200,
  moment: 300,
  screenText: 60,
  firstLines: 300,
  body: 3000,
  hashtags: 10,
  hashtag: 100,
  fixedText: 1500,
  chapters: 30,
  chapterTitle: 100,
  tags: 40,
  tag: 100,
  comment: 1000,
  instructions: 500,
} as const

const id = z.string().min(1)
const unique = (values: readonly string[]) => new Set(values).size === values.length

export const titleCandidateSchema = z.object({
  id,
  text: z.string().trim().min(1).max(PUBLISH_LIMITS.titleText),
  why: z.string().max(PUBLISH_LIMITS.why),
  blockId: id.nullable(),
  origin: z.enum(PIECE_ORIGINS),
})
export type TitleCandidate = z.infer<typeof titleCandidateSchema>

export const titlesContentSchema = z
  .object({
    candidates: z.array(titleCandidateSchema).min(1).max(PUBLISH_LIMITS.candidates),
    main: id.nullable(),
    alternatives: z.array(id).max(PUBLISH_LIMITS.alternatives),
  })
  .refine(({ candidates }) => unique(candidates.map((candidate) => candidate.id)), { message: 'repetido' })
  .refine(
    ({ candidates, main, alternatives }) => {
      const ids = new Set(candidates.map((candidate) => candidate.id))
      const chosen = [...(main === null ? [] : [main]), ...alternatives]
      return unique(chosen) && chosen.every((choice) => ids.has(choice))
    },
    { message: 'eleccion_no_valida' },
  )
export type TitlesContent = z.infer<typeof titlesContentSchema>

export const thumbnailConceptSchema = z.object({
  id,
  scene: z.string().trim().min(1).max(PUBLISH_LIMITS.scene),
  bigText: z.string().max(PUBLISH_LIMITS.bigText),
  emotion: z.string().max(PUBLISH_LIMITS.emotion),
  composition: z.string().max(PUBLISH_LIMITS.composition),
  colors: z.string().max(PUBLISH_LIMITS.colors),
  titleId: id.nullable(),
  origin: z.enum(PIECE_ORIGINS),
})
export type ThumbnailConcept = z.infer<typeof thumbnailConceptSchema>

export const thumbnailsContentSchema = z
  .object({
    concepts: z.array(thumbnailConceptSchema).min(1).max(PUBLISH_LIMITS.concepts),
    chosen: z.array(id).max(PUBLISH_LIMITS.chosen),
  })
  .refine(({ concepts }) => unique(concepts.map((concept) => concept.id)), { message: 'repetido' })
  .refine(({ concepts, chosen }) => unique(chosen) && chosen.every((choice) => concepts.some((c) => c.id === choice)), {
    message: 'eleccion_no_valida',
  })
export type ThumbnailsContent = z.infer<typeof thumbnailsContentSchema>

export const shortCoverContentSchema = z.object({
  blockId: id.nullable(),
  moment: z.string().max(PUBLISH_LIMITS.moment),
  screenText: z.string().max(PUBLISH_LIMITS.screenText),
})
export type ShortCoverContent = z.infer<typeof shortCoverContentSchema>

// Stored without «#»: the assembly adds it (research.md R5). Only Shorts get them (decision 9).
export const hashtagSchema = z
  .string()
  .min(1)
  .max(PUBLISH_LIMITS.hashtag)
  .regex(/^[^\s#]+$/)

export const descriptionContentSchema = z.object({
  firstLines: z.string().max(PUBLISH_LIMITS.firstLines),
  body: z.string().max(PUBLISH_LIMITS.body),
  hashtags: z.array(hashtagSchema).max(PUBLISH_LIMITS.hashtags),
  /** A copy of the channel's fixed part when this version was made (FR-010). */
  fixedText: z.string().max(PUBLISH_LIMITS.fixedText),
})
export type DescriptionContent = z.infer<typeof descriptionContentSchema>

export const chapterSchema = z
  .object({
    id,
    title: z.string().max(PUBLISH_LIMITS.chapterTitle),
    blockIds: z.array(id),
    /** `null` while it is worked out from the script; a number written by the creator is `manual` (R3). */
    startSeconds: z.number().int().nonnegative().nullable(),
    manual: z.boolean(),
  })
  .refine((chapter) => !chapter.manual || chapter.startSeconds !== null, { message: 'manual_sin_minuto' })
export type Chapter = z.infer<typeof chapterSchema>

export const chaptersContentSchema = z
  .object({ chapters: z.array(chapterSchema).max(PUBLISH_LIMITS.chapters) })
  .refine(({ chapters }) => unique(chapters.map((chapter) => chapter.id)), { message: 'repetido' })
export type ChaptersContent = z.infer<typeof chaptersContentSchema>

export const tagsContentSchema = z.object({
  tags: z.array(z.string().min(1).max(PUBLISH_LIMITS.tag)).max(PUBLISH_LIMITS.tags),
})
export type TagsContent = z.infer<typeof tagsContentSchema>

export const commentContentSchema = z.object({ text: z.string().max(PUBLISH_LIMITS.comment) })
export type CommentContent = z.infer<typeof commentContentSchema>

export const PACKAGE_CONTENT_SCHEMAS = {
  titulos: titlesContentSchema,
  miniaturas: thumbnailsContentSchema,
  portada_short: shortCoverContentSchema,
  descripcion: descriptionContentSchema,
  capitulos: chaptersContentSchema,
  etiquetas: tagsContentSchema,
  comentario: commentContentSchema,
} as const

export type PackageContentOf<K extends PackageKind> = z.infer<(typeof PACKAGE_CONTENT_SCHEMAS)[K]>

const STEP_KINDS: Record<IdeaFormat, Record<PackageStep, readonly PackageKind[]>> = {
  largo: { portada: ['titulos', 'miniaturas'], textos: ['descripcion', 'capitulos', 'etiquetas', 'comentario'] },
  short: { portada: ['titulos', 'portada_short'], textos: ['descripcion', 'etiquetas', 'comentario'] },
}

/** The pieces approved together in a step (research.md R2). */
export const stepKinds = (format: IdeaFormat, step: PackageStep): readonly PackageKind[] => STEP_KINDS[format][step]

/** Every piece a package of this format has. */
export const formatKinds = (format: IdeaFormat): readonly PackageKind[] => [
  ...STEP_KINDS[format].portada,
  ...STEP_KINDS[format].textos,
]

const blank = (text: string) => text.trim() === ''

/** A piece that cannot be approved yet. The pinned comment is optional (decision 14). */
export function emptyPiece<K extends PackageKind>(kind: K, content: PackageContentOf<K>): boolean {
  switch (kind) {
    case 'titulos':
      return (content as TitlesContent).main === null
    case 'miniaturas':
      return (content as ThumbnailsContent).chosen.length === 0
    case 'portada_short':
      return blank((content as ShortCoverContent).moment)
    case 'descripcion':
      return blank((content as DescriptionContent).firstLines)
    case 'capitulos':
      return (content as ChaptersContent).chapters.length === 0
    case 'etiquetas':
      return (content as TagsContent).tags.length === 0
    default:
      return false
  }
}

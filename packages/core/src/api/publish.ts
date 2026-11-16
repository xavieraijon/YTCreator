import { z } from 'zod'
import { IDEA_FORMATS, IDEA_VERDICTS } from '../ideas/model.ts'
import { YOUTUBE_SOURCES } from '../youtube/port.ts'
import {
  chaptersContentSchema,
  commentContentSchema,
  descriptionContentSchema,
  PACKAGE_KINDS,
  PACKAGE_ORIGINS,
  PACKAGE_STEPS,
  PUBLISH_LIMITS,
  shortCoverContentSchema,
  tagsContentSchema,
  thumbnailsContentSchema,
  titlesContentSchema,
} from '../publish/model.ts'
import { pieceComparisonSchema } from '../publish/compare.ts'
import { PACKAGE_PARTS, PUBLISH_USES } from '../publish/outputs.ts'
import { PACKAGE_STATUSES, PACKAGE_WARNINGS } from '../publish/status.ts'
import { STUDIO_KEYS } from '../publish/studio.ts'
import { DRAFT_BLOCK_TYPES } from '../script/model.ts'
import { SCRIPT_STATUSES } from '../script/status.ts'

// Contracts of the publishing package (specs/006-publishing-package/contracts/http-api.md). The 409 codes are the
// ones of 005: `en_curso` (a job is running), `version_cambiada` (another tab saved first) and `sin_aprobar` (the
// script or the step before is not approved).
const id = z.string().min(1)
const count = z.number().int().nonnegative()

export const packageVersionMetaSchema = z.object({
  version: z.number().int().positive(),
  origin: z.enum(PACKAGE_ORIGINS),
  createdAt: z.string(),
  draftVersion: z.number().int().positive(),
  mainTitle: z.string().nullable(),
  instructions: z.string().nullable(),
  restoredFrom: count.nullable(),
})
export type PackageVersionMeta = z.infer<typeof packageVersionMetaSchema>

const pieceOf = <S extends z.ZodType>(content: S) => packageVersionMetaSchema.extend({ content }).nullable()

export const packagePiecesSchema = z.object({
  titulos: pieceOf(titlesContentSchema),
  miniaturas: pieceOf(thumbnailsContentSchema),
  portada_short: pieceOf(shortCoverContentSchema),
  descripcion: pieceOf(descriptionContentSchema),
  capitulos: pieceOf(chaptersContentSchema),
  etiquetas: pieceOf(tagsContentSchema),
  comentario: pieceOf(commentContentSchema),
})
export type PackagePieces = z.infer<typeof packagePiecesSchema>

const kindVersionsSchema = z.record(z.string(), z.number().int().positive())

export const packageJobSchema = z.object({
  id,
  op: z.string(),
  status: z.string(),
  failure: z.string().nullable(),
})
export type PackageJob = z.infer<typeof packageJobSchema>

// Where a text of the knowledge packages comes from, shown under it (principle V).
const cited = z.object({ label: z.string(), date: z.string() })

export const packageViewSchema = z.object({
  id,
  channelId: id,
  scriptId: id,
  format: z.enum(IDEA_FORMATS),
  updatedAt: z.string(),
  status: z.enum(PACKAGE_STATUSES),
  idea: z.object({ id, title: z.string(), hook: z.string(), format: z.enum(IDEA_FORMATS) }),
  // The approved script: its blocks, with how long each one lasts at the channel's pace (R3).
  script: z.object({
    id,
    status: z.enum(SCRIPT_STATUSES),
    approvedDraftVersion: z.number().int().positive().nullable(),
    blocks: z.array(z.object({ id, type: z.enum(DRAFT_BLOCK_TYPES), title: z.string(), seconds: count })),
  }),
  pieces: packagePiecesSchema,
  approvals: z.object({
    cover: kindVersionsSchema.nullable(),
    texts: kindVersionsSchema.nullable(),
    package: kindVersionsSchema.nullable(),
    packageApprovedAt: z.string().nullable(),
    packageApprovedWarnings: count.nullable(),
  }),
  warnings: z.array(z.enum(PACKAGE_WARNINGS)),
  // Only what 004 measured for this idea, with where and when (R7, principle V); `null` if it was never measured.
  // `olderRevision`: measured before the idea last changed, as the bank says it (004).
  measured: z
    .object({
      query: z.string().nullable(),
      verdict: z.enum(IDEA_VERDICTS).nullable(),
      similarTitles: z.array(z.string()),
      measuredAt: z.string(),
      source: z.enum(YOUTUBE_SOURCES),
      partial: z.boolean(),
      olderRevision: z.boolean(),
    })
    .nullable(),
  // Kept after it ends: on coming back the screen still has to say that it failed.
  job: packageJobSchema.nullable(),
  studioDone: z.array(z.string()),
  // The guided list of YouTube Studio, from the profile and the knowledge packages (R12): a help, never a blocker.
  studio: z.array(
    z.discriminatedUnion('key', [
      z.object({
        key: z.literal('publico_infantil'),
        // `null`: the profile cannot be read, and the app does not answer for the creator.
        answer: z.boolean().nullable(),
        why: z.string(),
        implications: z.array(z.string()),
        source: cited,
        implicationsSource: cited,
      }),
      z.object({
        key: z.literal('contenido_sintetico'),
        answer: z.null(),
        question: z.string(),
        why: z.string(),
        mustDisclose: z.array(z.string()),
        noNeed: z.array(z.string()),
        source: cited,
      }),
      z.object({
        key: z.literal('idioma'),
        answer: z.string(),
        why: z.string(),
        assumption: z.literal(true),
        source: cited.nullable(),
      }),
      z.object({
        key: z.literal('categoria'),
        answer: z.string(),
        why: z.string(),
        assumption: z.boolean(),
        source: cited.nullable(),
      }),
    ]),
  ),
  // The description as it is copied, put together from its parts (R3 to R6).
  texts: z.object({
    // Each chapter with when it starts: the creator's minute (`manual`), the real one from the subtitles (`fromAudio`,
    // 007) or worked out from the script, an estimate.
    chapters: z.array(
      z.object({
        id,
        title: z.string(),
        blockIds: z.array(id),
        startSeconds: count,
        manual: z.boolean(),
        fromAudio: z.boolean(),
        time: z.string(),
      }),
    ),
    // Only from the facts the approved script used (R4).
    sources: z.array(z.object({ title: z.string(), url: z.string().nullable(), reference: z.string().nullable() })),
    assembled: z.string().nullable(),
    // The fixed part the channel has now, and whether it is the default one (R6).
    fixedText: z.object({ current: z.string(), isDefault: z.boolean() }),
  }),
  // In a Short drawn from a long video, the title of that video.
  parentTitle: z.string().nullable(),
  // What the screen warns about, with where each figure comes from (principle V).
  limits: z.object({
    titleMaxChars: z.number().int().positive(),
    // An assumption: no official page gives it.
    mobileTitleChars: z.number().int().positive(),
    descriptionMaxChars: z.number().int().positive(),
    youtube: z.object({ label: z.string(), date: z.string() }),
    // The hashtags YouTube shows above the title of a Short, with their own source (principle V).
    hashtagsShown: z.number().int().positive(),
    hashtags: z.object({ label: z.string(), date: z.string() }),
  }),
})
export type PackageView = z.infer<typeof packageViewSchema>

export const packageSummarySchema = z.object({
  id,
  scriptId: id,
  // The main title once there is one; the working title of the idea before.
  title: z.string(),
  format: z.enum(IDEA_FORMATS),
  status: z.enum(PACKAGE_STATUSES),
  updatedAt: z.string(),
})
export type PackageSummary = z.infer<typeof packageSummarySchema>

// `baseVersion` is the version this edit started from, 0 if there was none (as in 005).
export const packageBaseVersionSchema = count

// POST /packages/:id/estimate and /generate (contracts/http-api.md, «Con IA»).
// `part` only with `parte_paquete`, and always with it.
const partMatchesUse = ({ use, part }: { use: string; part?: string | undefined }) =>
  (use === 'parte_paquete') === (part !== undefined)

export const packageEstimateBodySchema = z
  .object({ use: z.enum(PUBLISH_USES), part: z.enum(PACKAGE_PARTS).optional() })
  .refine(partMatchesUse, { message: 'no_valido', path: ['part'] })
export type PackageEstimateBody = z.infer<typeof packageEstimateBodySchema>

export const packageGenerateBodySchema = z
  .object({
    use: z.enum(PUBLISH_USES),
    part: z.enum(PACKAGE_PARTS).optional(),
    estimateId: id,
    instructions: z.string().trim().max(PUBLISH_LIMITS.instructions).optional(),
  })
  .refine(partMatchesUse, { message: 'no_valido', path: ['part'] })
export type PackageGenerateBody = z.infer<typeof packageGenerateBodySchema>

// PUT /packages/:id/pieces/:kind: the content is checked against the schema of its kind by the server.
export const pieceSaveBodySchema = z.object({ baseVersion: packageBaseVersionSchema, content: z.unknown() })
export type PieceSaveBody = z.infer<typeof pieceSaveBodySchema>

// POST /packages/:id/approve: `versions` are the ones on screen, so nothing changed under the creator approves.
// The whole package (`paquete`) is approved knowing how many notices are left (FR-013): `acknowledgedWarnings` is
// the count the screen showed, and it has to be the one the server works out.
export const PACKAGE_APPROVE_STEPS = [...PACKAGE_STEPS, 'paquete'] as const
export const packageApproveBodySchema = z.object({
  step: z.enum(PACKAGE_APPROVE_STEPS),
  versions: kindVersionsSchema,
  acknowledgedWarnings: count.optional(),
})
export type PackageApproveBody = z.infer<typeof packageApproveBodySchema>

// GET /packages/:id/review: the figures of publish/youtube.json and publish/craft.json the review uses (R13).
export const packageReviewRulesSchema = z.object({
  rules: z.object({
    titleMaxChars: z.number().int().positive(),
    mobileTitleChars: z.number().int().positive(),
    descriptionMaxChars: z.number().int().positive(),
    tagsMaxTotalChars: z.number().int().positive(),
    chapterMinCount: z.number().int().positive(),
    chapterMinSeconds: z.number().int().positive(),
    hashtagsShown: z.number().int().positive(),
  }),
  // Where each figure comes from, to show it under its own notice (principle V); `null` is a calculation of ours.
  sources: z.record(z.string(), z.object({ label: z.string(), date: z.string() }).nullable()),
})
export type PackageReviewRules = z.infer<typeof packageReviewRulesSchema>

// PUT /packages/:id/studio: the settings marked as done; only the keys of the list (R12).
// `base`: the marks the screen had, so another tab's are never written over unsaid (409 `version_cambiada`).
const studioKeys = z.array(z.enum(STUDIO_KEYS)).max(STUDIO_KEYS.length)
export const packageStudioBodySchema = z.object({ done: studioKeys, base: studioKeys })
export type PackageStudioBody = z.infer<typeof packageStudioBodySchema>

// GET /packages/:id/export and /channels/:id/packages/export (R15): the brief only for one package.
export const PACKAGE_EXPORT_FORMATS = ['md', 'json', 'brief'] as const
export const packageExportQuerySchema = z.object({ format: z.enum(PACKAGE_EXPORT_FORMATS) })
export const packagesExportQuerySchema = z.object({ format: z.enum(['md', 'json']) })

// GET and PUT /channels/:id/publish-settings: the fixed part of every description and the category (R6, R12).
export const publishSettingsViewSchema = z.object({
  fixedText: z.string(),
  category: z.string().nullable(),
  // Nothing saved yet: the fixed part is the default one, empty if the profile has no @ of the channel.
  isDefault: z.boolean(),
  // Whether the profile has the @ of the channel, which the default subscription link needs.
  hasHandle: z.boolean(),
  suggestedCategory: z.string(),
  categories: z.array(z.string()),
})
export type PublishSettingsView = z.infer<typeof publishSettingsViewSchema>

export const publishSettingsBodySchema = z.object({
  fixedText: z.string().max(PUBLISH_LIMITS.fixedText),
  category: z.string().min(1).nullable(),
})
export type PublishSettingsBody = z.infer<typeof publishSettingsBodySchema>

// The history of each piece (US5): every version, what it changes from the current one, and going back to it.
export const packageVersionSummarySchema = z.object({
  version: z.number().int().positive(),
  origin: z.enum(PACKAGE_ORIGINS),
  createdAt: z.string(),
  restoredFrom: z.number().int().positive().nullable(),
})
export type PackageVersionSummary = z.infer<typeof packageVersionSummarySchema>

export const packageVersionDetailSchema = z.object({
  version: packageVersionSummarySchema,
  content: z.unknown(),
  comparison: pieceComparisonSchema,
})
export type PackageVersionDetail = z.infer<typeof packageVersionDetailSchema>

export const packageVersionsQuerySchema = z.object({ kind: z.enum(PACKAGE_KINDS) })
export const packageVersionParamsSchema = z.object({
  kind: z.enum(PACKAGE_KINDS),
  version: z
    .string()
    .regex(/^[1-9]\d{0,8}$/)
    .transform(Number),
})
export const packageRestoreBodySchema = z.object({ baseVersion: packageBaseVersionSchema })
export type PackageRestoreBody = z.infer<typeof packageRestoreBodySchema>

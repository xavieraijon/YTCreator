import { z } from 'zod'
import { IDEA_FORMATS, IDEA_VERDICTS } from '../ideas/model.ts'
import { YOUTUBE_SOURCES } from '../youtube/port.ts'
import {
  chaptersContentSchema,
  commentContentSchema,
  descriptionContentSchema,
  PACKAGE_ORIGINS,
  PACKAGE_STEPS,
  PUBLISH_LIMITS,
  shortCoverContentSchema,
  tagsContentSchema,
  thumbnailsContentSchema,
  titlesContentSchema,
} from '../publish/model.ts'
import { PACKAGE_PARTS, PUBLISH_USES } from '../publish/outputs.ts'
import { PACKAGE_STATUSES, PACKAGE_WARNINGS } from '../publish/status.ts'
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
  // The description as it is copied, put together from its parts (R3 to R6).
  texts: z.object({
    // Each chapter with when it starts: the creator's minute (`manual`) or worked out from the script, an estimate.
    chapters: z.array(
      z.object({
        id,
        title: z.string(),
        blockIds: z.array(id),
        startSeconds: count,
        manual: z.boolean(),
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
export const packageApproveBodySchema = z.object({
  step: z.enum(PACKAGE_STEPS),
  versions: kindVersionsSchema,
})
export type PackageApproveBody = z.infer<typeof packageApproveBodySchema>

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

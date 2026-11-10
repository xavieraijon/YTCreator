import { z } from 'zod'
import { IDEA_FORMATS, IDEA_STATUSES, IDEA_VERDICTS } from '../ideas/model.ts'
import {
  draftContentSchema,
  factsContentSchema,
  outlineContentSchema,
  SCRIPT_KINDS,
  SCRIPT_LIMITS,
  scriptSettingsSchema,
  VERSION_ORIGINS,
  VOICE_ADDRESSES,
  VOICE_REGISTERS,
} from '../script/model.ts'
import { itemComparisonSchema } from '../script/compare.ts'
import { SCRIPT_USES, shortAngleViewSchema } from '../script/outputs.ts'
import { SCRIPT_STATUSES, SCRIPT_WARNINGS } from '../script/status.ts'

// The script routes (specs/005-script-and-outline/contracts/http-api.md).
const id = z.string().min(1)
const count = z.number().int().nonnegative()

export const scriptVersionMetaSchema = z.object({
  version: z.number().int().positive(),
  origin: z.enum(VERSION_ORIGINS),
  createdAt: z.string(),
  factsVersion: count.nullable(),
  outlineVersion: count.nullable(),
  instructions: z.string().nullable(),
  restoredFrom: count.nullable(),
})
export type ScriptVersionMeta = z.infer<typeof scriptVersionMetaSchema>

const versionOf = <S extends z.ZodType>(content: S) => scriptVersionMetaSchema.extend({ content }).nullable()

export const scriptSettingsViewSchema = z.object({
  address: z.enum(VOICE_ADDRESSES),
  register: z.enum(VOICE_REGISTERS),
  sample: z.string(),
  wordsPerMinute: z.number().int(),
  isDefault: z.boolean(),
})
export type ScriptSettingsView = z.infer<typeof scriptSettingsViewSchema>

export const scriptJobSchema = z.object({
  id,
  op: z.string(),
  status: z.string(),
  failure: z.string().nullable(),
})
export type ScriptJob = z.infer<typeof scriptJobSchema>

const linkedScriptSchema = z.object({ id, title: z.string() })

export const shortChooseBodySchema = z.object({ baseUpdatedAt: z.string().min(1) })
export type ShortChooseBody = z.infer<typeof shortChooseBodySchema>

export const shortChosenSchema = z.object({ ideaId: id, scriptId: id })
export type ShortChosen = z.infer<typeof shortChosenSchema>

export const scriptViewSchema = z.object({
  id,
  channelId: id,
  ideaId: id,
  format: z.enum(IDEA_FORMATS),
  targetSeconds: z.number().int(),
  notes: z.string(),
  updatedAt: z.string(),
  status: z.enum(SCRIPT_STATUSES),
  idea: z.object({
    id,
    title: z.string(),
    hook: z.string(),
    // The «dato concreto» of the idea (004).
    query: z.string().nullable(),
    pillar: z.string().nullable(),
    format: z.enum(IDEA_FORMATS),
    notes: z.string(),
    status: z.enum(IDEA_STATUSES),
    revision: z.number().int(),
    verdict: z.enum(IDEA_VERDICTS).nullable(),
    verdictAt: z.string().nullable(),
  }),
  facts: versionOf(factsContentSchema),
  outline: versionOf(outlineContentSchema),
  // An edit keeps what the AI proposed: it stays marked as its opinion.
  outlineFromAi: z.boolean(),
  draft: versionOf(draftContentSchema),
  outlineApprovedVersion: count.nullable(),
  draftApprovedVersion: count.nullable(),
  draftApprovedAt: z.string().nullable(),
  draftApprovedPending: count.nullable(),
  warnings: z.array(z.enum(SCRIPT_WARNINGS)),
  // Kept after it ends: on coming back the screen still has to say that it failed.
  job: scriptJobSchema.nullable(),
  shortAngles: z.array(shortAngleViewSchema),
  links: z.object({
    // `momentGone`: the approved long script no longer has the moment this Short comes from (decision 44).
    parent: linkedScriptSchema.extend({ momentGone: z.boolean() }).nullable(),
    shorts: z.array(linkedScriptSchema),
  }),
  webResearch: z.boolean(),
  limits: z.object({
    minSeconds: z.number().int(),
    maxSeconds: z.number().int(),
    maxReviewedAt: z.string().nullable(),
  }),
  voice: scriptSettingsViewSchema,
})
export type ScriptView = z.infer<typeof scriptViewSchema>

export const scriptSummarySchema = z.object({
  id,
  ideaId: id,
  title: z.string(),
  format: z.enum(IDEA_FORMATS),
  status: z.enum(SCRIPT_STATUSES),
  updatedAt: z.string(),
})
export type ScriptSummary = z.infer<typeof scriptSummarySchema>

export const scriptPatchBodySchema = z
  .object({
    // Duration and notes are not versioned: this is what tells that another tab saved first (R18).
    baseUpdatedAt: z.string().min(1),
    targetSeconds: z.number().int().optional(),
    notes: z.string().max(SCRIPT_LIMITS.notes).optional(),
  })
  .refine((body) => body.targetSeconds !== undefined || body.notes !== undefined)
export type ScriptPatchBody = z.infer<typeof scriptPatchBodySchema>

// `baseVersion` is the version this edit started from, 0 if there was none (R18).
const baseVersion = count
export const factsSaveBodySchema = z.object({ baseVersion, content: factsContentSchema })
export type FactsSaveBody = z.infer<typeof factsSaveBodySchema>

export const outlineSaveBodySchema = z.object({ baseVersion, content: outlineContentSchema })
export type OutlineSaveBody = z.infer<typeof outlineSaveBodySchema>

export const draftSaveBodySchema = z.object({ baseVersion, content: draftContentSchema })
export type DraftSaveBody = z.infer<typeof draftSaveBodySchema>

export const CLAIM_ACTIONS = ['confirmar', 'corregir', 'no_es_dato', 'quitar_del_guion', 'aceptar_propuesta'] as const
export type ClaimAction = (typeof CLAIM_ACTIONS)[number]
export const claimActionBodySchema = z.object({
  baseVersion,
  action: z.enum(CLAIM_ACTIONS),
  text: z.string().trim().min(1).max(SCRIPT_LIMITS.claimText).optional(),
})
export type ClaimActionBody = z.infer<typeof claimActionBodySchema>

export const scriptSettingsBodySchema = scriptSettingsSchema
export type ScriptSettingsBody = z.infer<typeof scriptSettingsBodySchema>

export const approveDraftBodySchema = z.object({
  version: z.number().int().positive(),
  acknowledgedPending: z.number().int().nonnegative(),
})
export type ApproveDraftBody = z.infer<typeof approveDraftBodySchema>

export const scriptReviewViewSchema = z.object({
  rules: z.object({
    basis: z.object({ label: z.string(), date: z.string() }),
    maxSentenceWords: z.number().int().positive(),
    hookMaxSeconds: z.object({ largo: z.number().positive(), short: z.number().positive() }),
    durationTolerance: z.number().nonnegative(),
    fillers: z.array(z.string()),
  }),
})

export type ScriptReviewView = z.infer<typeof scriptReviewViewSchema>

export const scriptVersionSummarySchema = z.object({
  version: z.number().int().positive(),
  origin: z.enum(VERSION_ORIGINS),
  createdAt: z.string(),
  restoredFrom: z.number().int().positive().nullable(),
})
export type ScriptVersionSummary = z.infer<typeof scriptVersionSummarySchema>

export const scriptVersionDetailSchema = z.object({
  version: scriptVersionSummarySchema,
  changes: z.array(itemComparisonSchema),
  orderChanged: z.boolean(),
})
export type ScriptVersionDetail = z.infer<typeof scriptVersionDetailSchema>

export const scriptVersionsQuerySchema = z.object({ kind: z.enum(SCRIPT_KINDS) })
export const scriptVersionParamsSchema = z.object({
  kind: z.enum(SCRIPT_KINDS),
  version: z
    .string()
    .regex(/^[1-9]\d{0,8}$/)
    .transform(Number),
})
export const restoreBodySchema = z.object({ baseVersion })
export type RestoreBody = z.infer<typeof restoreBodySchema>

export const approveOutlineBodySchema = z.object({ version: z.number().int().positive() })

export const scriptEstimateBodySchema = z.object({ use: z.enum(SCRIPT_USES), blockId: id.optional() })
export type ScriptEstimateBody = z.infer<typeof scriptEstimateBodySchema>

export const scriptGenerateBodySchema = z.object({
  use: z.enum(SCRIPT_USES),
  estimateId: id,
  instructions: z.string().trim().max(SCRIPT_LIMITS.instructions).optional(),
  blockId: id.optional(),
})
export type ScriptGenerateBody = z.infer<typeof scriptGenerateBodySchema>

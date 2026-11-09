import { z } from 'zod'
import { IDEA_FORMATS, IDEA_STATUSES, IDEA_VERDICTS } from '../ideas/model.ts'
import {
  draftContentSchema,
  factsContentSchema,
  outlineContentSchema,
  SCRIPT_LIMITS,
  VERSION_ORIGINS,
  VOICE_ADDRESSES,
  VOICE_REGISTERS,
} from '../script/model.ts'
import { SCRIPT_USES } from '../script/outputs.ts'
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
  webResearch: z.boolean(),
  limits: z.object({ minSeconds: z.number().int(), maxSeconds: z.number().int() }),
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
export const outlineSaveBodySchema = z.object({ baseVersion, content: outlineContentSchema })
export type OutlineSaveBody = z.infer<typeof outlineSaveBodySchema>

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

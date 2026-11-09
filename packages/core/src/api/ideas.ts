import { z } from 'zod'
import {
  CANDIDATE_DECISIONS,
  IDEA_BATCH_KINDS,
  IDEA_FORMATS,
  IDEA_LIMITS,
  IDEA_MEASURE_STATUSES,
  IDEA_ORIGINS,
  IDEA_REASONS,
  IDEA_STATUSES,
  IDEA_VERDICTS,
  ideaDraftSchema,
  searchTextSchema,
} from '../ideas/model.ts'
import { IDEA_USES } from '../ideas/outputs.ts'
import { SCRIPT_STATUSES } from '../script/status.ts'
import { YOUTUBE_FAILURES } from '../youtube/failures.ts'
import { YOUTUBE_SOURCES } from '../youtube/port.ts'
import { AI_RUN_FAILURES, type AiRunFailure } from './channel.ts'

// The idea bank routes (specs/004-idea-bank/contracts/http-api.md).
const id = z.string().min(1)
const revision = z.number().int().positive()
const count = z.number().int().nonnegative()
const position = z.number().int().nonnegative()
const optionalText = (max: number) => z.string().trim().max(max)

export const videoHitSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  channelId: z.string(),
  channelTitle: z.string(),
  views: count.nullable(),
  publishedAt: z.string().nullable(),
  durationSeconds: count.nullable(),
})

export const ideaFiguresSchema = z.object({
  similar: count,
  recent: count,
  dated: count,
  medianViews: count.nullable(),
  maxViews: count.nullable(),
  broadTopViews: count.nullable(),
  broadBigVideos: count,
  hasAudience: z.boolean(),
})
export type IdeaFigures = z.infer<typeof ideaFiguresSchema>

export const ideaOpportunitySchema = z.union([
  z.object({ english: z.boolean(), englishBigVideos: count, topVideos: z.array(videoHitSchema).max(5) }),
  // The English search failed: measured without the opportunity (idea-measure.md, «Fallos»).
  z.object({ failure: z.enum(YOUTUBE_FAILURES) }),
])
export type IdeaOpportunity = z.infer<typeof ideaOpportunitySchema>

export const ideaQueriesSchema = z.object({
  query: z.string().nullable(),
  broadQuery: z.string().nullable(),
  queryEn: z.string().nullable(),
})

export const ideaMeasureSchema = z.object({
  id,
  ideaRevision: revision,
  status: z.enum(IDEA_MEASURE_STATUSES),
  verdict: z.enum(IDEA_VERDICTS).nullable(),
  reason: z.enum(IDEA_REASONS).nullable(),
  figures: ideaFiguresSchema.nullable(),
  similarVideos: z.array(videoHitSchema).max(12),
  opportunity: ideaOpportunitySchema.nullable(),
  queries: ideaQueriesSchema,
  failure: z.enum(YOUTUBE_FAILURES).nullable(),
  source: z.enum(YOUTUBE_SOURCES),
  partial: z.boolean(),
  thresholdsVersion: z.number().int().positive(),
  measuredAt: z.string(),
})
export type IdeaMeasureView = z.infer<typeof ideaMeasureSchema>

export const ideaSchema = z.object({
  id,
  // The script of this idea, if it has one (005, data-model.md).
  script: z.object({ id, status: z.enum(SCRIPT_STATUSES) }).nullable(),
  origin: z.enum(IDEA_ORIGINS),
  batchId: id.nullable(),
  sourceIdeaId: id.nullable(),
  title: z.string(),
  hook: z.string(),
  pillar: z.string().nullable(),
  format: z.enum(IDEA_FORMATS),
  notes: z.string(),
  query: z.string().nullable(),
  broadQuery: z.string().nullable(),
  queryEn: z.string().nullable(),
  status: z.enum(IDEA_STATUSES),
  position,
  queuePosition: z.number().int().positive().nullable(),
  revision,
  profileVersion: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  measure: ideaMeasureSchema.nullable(),
  // The last measure is older than `ideas.staleDays` (FR-010).
  stale: z.boolean(),
  // Proposed with an older version of the channel profile (R15).
  fromOlderProfile: z.boolean(),
  // The idea changed after its last measure (R11).
  measuredOlderRevision: z.boolean(),
})
export type IdeaView = z.infer<typeof ideaSchema>

export const ideaCandidateSchema = ideaDraftSchema.extend({
  index: count,
  why: z.string().optional(),
  decision: z.enum(CANDIDATE_DECISIONS).nullable(),
})
export const ideaBatchSchema = z.object({
  id,
  kind: z.enum(IDEA_BATCH_KINDS),
  sourceIdeaId: id.nullable(),
  candidates: z.array(ideaCandidateSchema),
  removedRepeats: count,
  claimsTrimmed: z.boolean(),
  createdAt: z.string(),
})
export type IdeaBatchView = z.infer<typeof ideaBatchSchema>

// GET /api/channels/:id/ideas
export const ideaBankSchema = z.object({
  ideas: z.array(ideaSchema),
  queue: z.array(id),
  profileVersion: z.number().int().positive(),
  pendingBatch: ideaBatchSchema.nullable(),
  // The angles of «Buscar otro enfoque» still waiting, shown by the idea they came from (US3, entry 48).
  pendingAngles: z.array(ideaBatchSchema),
  runningJob: id.nullable(),
  // The last «Medir todas» was cut short (a restart): the ideas it had left, for «Seguir midiendo» (entry 28).
  interrupted: z.object({ jobId: id, ideaIds: z.array(id) }).nullable(),
  // Where the limits of the semaphore come from: an assumption of thresholds.json (principle V, R4).
  measureBasis: z.object({ label: z.string(), date: z.string(), recentDays: count, audienceViews: count }),
  // What measuring one idea spends with the Data API; null with yt-dlp (FR-007c).
  measureUnits: z.object({ withoutEnglish: count, withEnglish: count }).nullable(),
})
export type IdeaBankView = z.infer<typeof ideaBankSchema>

// A search can be left out: without `query` the idea is not measured.
const optionalQuery = searchTextSchema.nullable().optional()

// POST /api/channels/:id/ideas
export const newIdeaBodySchema = z.object({
  title: z.string().trim().min(1).max(IDEA_LIMITS.title),
  format: z.enum(IDEA_FORMATS),
  hook: optionalText(IDEA_LIMITS.hook).optional(),
  // An empty pillar is no pillar (data-model.md: null in an idea of the creator's).
  pillar: optionalText(IDEA_LIMITS.title)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
  notes: optionalText(IDEA_LIMITS.notes).optional(),
  query: optionalQuery,
  broadQuery: optionalQuery,
  queryEn: optionalQuery,
})
export type NewIdeaBody = z.input<typeof newIdeaBodySchema>
export const newIdeaResultSchema = z.object({ idea: ideaSchema, duplicateOf: id.nullable() })

// PATCH /api/ideas/:id
export const ideaPatchBodySchema = newIdeaBodySchema.partial().extend({
  revision,
  status: z.enum(IDEA_STATUSES).optional(),
})

export type IdeaPatchBody = z.input<typeof ideaPatchBodySchema>

// PUT /api/channels/:id/ideas/order and /queue: every idea once, in its new place.
export const ideaOrderBodySchema = z.object({ ids: z.array(id).min(1) })
export const ideaOrderResultSchema = z.object({ ideas: z.array(ideaSchema) })
export const ideaQueueResultSchema = z.object({ queue: z.array(id) })

// POST /api/channels/:id/ideas/estimate
export const ideaEstimateBodySchema = z.object({ use: z.enum(IDEA_USES), ideaId: id.optional() })

// POST /api/channels/:id/idea-batches
export const ideaBatchBodySchema = z.object({
  estimateId: id,
  instructions: z.string().trim().max(IDEA_LIMITS.instructions).optional(),
})

const aiFailure = z.object({ failure: z.enum(AI_RUN_FAILURES as unknown as [AiRunFailure, ...AiRunFailure[]]) })
export const ideaBatchOutcomeSchema = z.union([ideaBatchSchema, aiFailure])
export type IdeaBatchOutcome = z.infer<typeof ideaBatchOutcomeSchema>

// POST /api/idea-batches/:id/decide
export const batchDecideBodySchema = z.object({ keep: z.array(count), discard: z.array(count) })
export const batchDecideResultSchema = z.object({ batch: ideaBatchSchema, created: z.array(ideaSchema) })

// POST /api/ideas/:id/angles
export const anglesBodySchema = z.object({
  estimateId: id,
  instructions: z.string().trim().max(IDEA_LIMITS.instructions).optional(),
})

// POST /api/ideas/:id/queries
export const ideaQueriesBodySchema = z.object({ estimateId: id, revision })
export const ideaQueriesOutcomeSchema = z.union([ideaSchema, aiFailure])

// POST /api/channels/:id/idea-measures/estimate
export const measureEstimateBodySchema = z.object({ ideaIds: z.array(id).min(1) })
export const measureEstimateSchema = z.object({
  ideas: count,
  measurable: count,
  withoutEnglish: count,
  // Data API units; null with yt-dlp, which spends none (FR-007c).
  units: count.nullable(),
})
export type MeasureEstimateView = z.infer<typeof measureEstimateSchema>

// POST /api/channels/:id/idea-measures
export const ideaMeasuresBodySchema = z.object({ ideaIds: z.array(id).min(1), fresh: z.literal(true).optional() })

import { z } from 'zod'
import { FAILURE_KINDS } from '../ai/failures.ts'
import { journeyStateSchema } from '../channel/journey.ts'
import { REFERENCE_REASONS } from '../market/measures.ts'
import {
  AUDIENCE_REGIONS,
  CHANNEL_ORIGINS,
  EXISTING_CHANNEL_STEPS,
  JOB_KINDS,
  JOB_STATUSES,
  JOURNEY_STATUSES,
  MEASURE_STATUSES,
  NAME_STATUSES,
  NEW_CHANNEL_STEPS,
  PROFILE_ORIGINS,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  SEMAPHORES,
} from '../channel/model.ts'
import {
  CHANNEL_OUTPUTS,
  type ChannelUse,
  HANDLE_PATTERN,
  PROFILE_PARTS,
  profilePartOutput,
} from '../channel/outputs.ts'
import { channelProfileSchema } from '../channel/profile.ts'
import { readingSummarySchema } from '../channel/reading.ts'
import { YOUTUBE_FAILURES } from '../youtube/failures.ts'
import { YOUTUBE_SOURCES } from '../youtube/port.ts'

const id = z.string().min(1)
const revision = z.number().int().nonnegative()
const cents = z.number().int().nonnegative()
const count = z.number().int().nonnegative()

export const journeyStepSchema = z.enum([...new Set([...NEW_CHANNEL_STEPS, ...EXISTING_CHANNEL_STEPS])] as [
  (typeof NEW_CHANNEL_STEPS)[number] | (typeof EXISTING_CHANNEL_STEPS)[number],
  ...((typeof NEW_CHANNEL_STEPS)[number] | (typeof EXISTING_CHANNEL_STEPS)[number])[],
])

export const channelSchema = z.object({
  id,
  origin: z.enum(CHANNEL_ORIGINS),
  displayName: z.string().nullable(),
  handle: z.string().nullable(),
  nameStatus: z.enum(NAME_STATUSES),
  youtubeChannelId: z.string().nullable(),
  language: z.string(),
  audienceRegion: z.enum(AUDIENCE_REGIONS),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ChannelView = z.infer<typeof channelSchema>

export const journeySchema = z.object({
  id,
  channelId: id,
  kind: z.enum(CHANNEL_ORIGINS),
  step: journeyStepSchema,
  status: z.enum(JOURNEY_STATUSES),
  state: journeyStateSchema,
  revision,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type JourneyView = z.infer<typeof journeySchema>

export const proposalSchema = z.object({
  id,
  journeyId: id,
  kind: z.enum(PROPOSAL_KINDS),
  payload: z.unknown(),
  editedPayload: z.unknown(),
  selectedIndex: count.nullable(),
  status: z.enum(PROPOSAL_STATUSES),
  parentId: z.string().nullable(),
  instructions: z.string().nullable(),
  promptId: z.string(),
  promptVersion: z.number().int().positive(),
  claimsTrimmed: z.boolean(),
  usageId: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
})
export type ProposalView = z.infer<typeof proposalSchema>

export const AI_RUN_FAILURES = [...FAILURE_KINDS, 'respuesta_invalida', 'limite_de_gasto'] as const
export type AiRunFailure = (typeof AI_RUN_FAILURES)[number]

// A failed generation stores nothing: it answers its code, and the proposal before it stays as it was.
export const proposalOutcomeSchema = z.union([
  proposalSchema,
  z.object({ failure: z.enum(AI_RUN_FAILURES as unknown as [AiRunFailure, ...AiRunFailure[]]) }),
])
export type ProposalOutcome = z.infer<typeof proposalOutcomeSchema>
const aiRunFailureSchema = z.object({
  failure: z.enum(AI_RUN_FAILURES as unknown as [AiRunFailure, ...AiRunFailure[]]),
})

export const measureSchema = z.object({
  id,
  journeyId: id,
  nicheLabel: z.string(),
  queries: z.array(z.string()),
  source: z.enum(YOUTUBE_SOURCES),
  status: z.enum(MEASURE_STATUSES),
  failure: z.enum(YOUTUBE_FAILURES).nullable(),
  demandMedianViews: count.nullable(),
  demandLevel: z.enum(['alta', 'media', 'baja']).nullable(),
  entryChannels: count.nullable(),
  entryLevel: z.enum(['abierta', 'entreabierta', 'cerrada']).nullable(),
  concentration: z.number().min(0).max(1).nullable(),
  concentrationLevel: z.enum(['alta', 'media', 'baja']).nullable(),
  recentVideos: count.nullable(),
  recentShare: z.number().min(0).max(1).nullable(),
  sampleSize: count.nullable(),
  shortsInSample: count.nullable(),
  shortsMedianViews: count.nullable(),
  unknownFormatVideos: count.nullable(),
  smallChannels: count.nullable(),
  hiddenSubscribers: count.nullable(),
  unreadChannels: count.nullable(),
  verdict: z.enum(['conviene', 'con_reservas', 'no_conviene']).nullable(),
  thresholdsVersion: z.number().int().positive(),
  measuredAt: z.string().nullable(),
  createdAt: z.string(),
})
export type MeasureView = z.infer<typeof measureSchema>

export const referenceChannelSchema = z.object({
  id,
  measureId: id,
  youtubeChannelId: z.string(),
  title: z.string(),
  handle: z.string().nullable(),
  subscribers: count.nullable(),
  topVideoViews: count,
  medianViews: count.nullable(),
  bestRatio: z.number().min(0).nullable(),
  bestVideoId: z.string().nullable(),
  bestVideoTitle: z.string().nullable(),
  reason: z.enum(REFERENCE_REASONS),
  fetchedAt: z.string(),
})
export type ReferenceChannelView = z.infer<typeof referenceChannelSchema>

export const nameCheckSchema = z.object({
  id,
  journeyId: id,
  displayName: z.string(),
  handle: z.string(),
  origin: z.enum(['ia', 'creador']),
  semaphore: z.enum(SEMAPHORES),
  reasons: z.array(z.enum(['handle_ocupado', 'nombre_igual', 'parecidos', 'titulos_con_nombre', 'largo', 'fallo'])),
  handleStatus: z.enum(['libre', 'ocupado', 'sin_comprobar']),
  similarChannels: z.array(
    z.object({ title: z.string(), handle: z.string().nullable(), subscribers: count.nullable() }),
  ),
  titleHits: count.nullable(),
  checkedAt: z.string(),
})
export type NameCheckView = z.infer<typeof nameCheckSchema>

export const jobSchema = z.object({
  id,
  journeyId: z.string().nullable(),
  kind: z.enum(JOB_KINDS),
  status: z.enum(JOB_STATUSES),
  progress: z.object({ done: count, total: count }),
  failure: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
})
export type JobView = z.infer<typeof jobSchema>

export const profileVersionSchema = z.object({
  channelId: id,
  version: z.number().int().positive(),
  origin: z.enum(PROFILE_ORIGINS),
  restoredFrom: z.number().int().positive().nullable(),
  proposalId: z.string().nullable(),
  profile: channelProfileSchema,
  createdAt: z.string(),
})
export type ProfileVersionView = z.infer<typeof profileVersionSchema>

// GET /api/channels/:id/profile/versions
export const profileVersionItemSchema = profileVersionSchema.pick({ version: true, origin: true, createdAt: true })
export const profileVersionListSchema = z.array(profileVersionItemSchema)
export type ProfileVersionItem = z.infer<typeof profileVersionItemSchema>

// PUT /api/channels/:id/profile: what comes from YouTube, the knowledge and the name is kept from the base.
export const profileEditBodySchema = z.object({
  baseVersion: z.number().int().positive(),
  profile: channelProfileSchema,
})

// POST /api/channels/:id/profile/restore
export const profileRestoreBodySchema = z.object({ version: z.number().int().positive() })

// «Regenerar con IA» a part of the profile (entry 115): the estimate first, then the proposal, then the creator's yes.
// POST /api/channels/:id/profile/estimate
export const profilePartEstimateBodySchema = z.object({ part: z.enum(PROFILE_PARTS) })
// POST /api/channels/:id/profile/regenerate
export const profileRegenerateBodySchema = z.object({
  part: z.enum(PROFILE_PARTS),
  baseVersion: z.number().int().positive(),
  estimateId: id,
  instructions: z.string().trim().max(500).optional(),
})
export const profileRegenerationSchema = z.object({
  regenerationId: id,
  part: z.enum(PROFILE_PARTS),
  baseVersion: z.number().int().positive(),
  // Only the part asked for.
  proposed: profilePartOutput.partial(),
  claimsTrimmed: z.boolean(),
})
export type ProfileRegeneration = z.infer<typeof profileRegenerationSchema>
// GET /api/channels/:id/profile/regeneration: the one waiting, or null.
export const pendingRegenerationSchema = profileRegenerationSchema.nullable()
export const profileRegenerationOutcomeSchema = z.union([profileRegenerationSchema, aiRunFailureSchema])
// POST /api/channels/:id/profile/regenerated: the creator approves the proposal; it becomes a version `ia`.
export const profileRegeneratedBodySchema = z.object({ regenerationId: id, baseVersion: z.number().int().positive() })

// PATCH /api/channels/:id/name
export const channelNameBodySchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  handle: z.string().regex(HANDLE_PATTERN),
  checkId: id.optional(),
})

// GET /api/channels/:id/export?format=md|json
export const EXPORT_FORMATS = ['md', 'json'] as const
export const exportQuerySchema = z.object({ format: z.enum(EXPORT_FORMATS) })

// GET /api/channels/current
export const channelCurrentSchema = z.union([
  z.object({ channel: channelSchema, profile: profileVersionSchema.nullable(), journey: journeySchema.nullable() }),
  z.object({ channel: z.null() }),
])
export type ChannelCurrent = z.infer<typeof channelCurrentSchema>

// POST /api/channels
export const createChannelBodySchema = z.object({ origin: z.enum(CHANNEL_ORIGINS) })
export const createChannelResponseSchema = z.object({ channel: channelSchema, journey: journeySchema })

// GET /api/journeys/:id
export const referenceChannelsSchema = z.array(referenceChannelSchema)

export const channelWarningViewSchema = z.object({
  code: z.enum(['infantil', 'solo_shorts', 'no_autentico', 'ritmo_insostenible']),
  sourceLabel: z.string().nullable(),
  reviewedAt: z.string().nullable(),
})
export type ChannelWarningView = z.infer<typeof channelWarningViewSchema>

// A concept as stored and shown: what the AI wrote plus what the domain worked out after it (T090).
export const conceptFiguresSchema = z.object({
  monetization: z.object({
    rpmEurRange: z.object({ min: z.number(), max: z.number() }),
    monthlyViewsAssumption: z.object({ min: z.number(), max: z.number() }).nullable(),
    monthlyEurRange: z.object({ min: z.number(), max: z.number() }).nullable(),
    yppRequirements: z.object({ subscribers: z.number(), watchHours: z.number(), shortsViews: z.number() }),
    rpmSource: z.object({ label: z.string(), reviewedAt: z.string(), confidence: z.enum(['alta', 'media', 'baja']) }),
    yppSource: z.object({ label: z.string(), reviewedAt: z.string() }),
  }),
  warnings: z.array(channelWarningViewSchema),
})
export type ConceptFigures = z.infer<typeof conceptFiguresSchema>

// The answers the concepts were written for: with others, their text may not fit any more.
export const basedOnSchema = z.object({
  nicheLabel: z.string().nullable(),
  hoursPerWeek: z.number().nullable().optional(),
  onCamera: z.string().nullable().optional(),
})
export type BasedOn = z.infer<typeof basedOnSchema>

// What the server says around the concepts of a journey (contracts/http-api.md).
export const conceptsViewSchema = z.object({ basedOn: basedOnSchema, stale: z.boolean() })

// What was read of an existing channel (data-model.md, `channel_reading`).
export const channelReadingSchema = z.object({
  id,
  channelId: id,
  youtubeChannelId: z.string(),
  source: z.enum(YOUTUBE_SOURCES),
  title: z.string(),
  handle: z.string().nullable(),
  description: z.string(),
  subscribers: count.nullable(),
  videoCount: count.nullable(),
  videos: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      views: count.nullable(),
      durationSeconds: z.number().nonnegative().nullable(),
      publishedAt: z.string().nullable(),
      isShort: z.boolean(),
      ratio: z.number().nonnegative().nullable(),
    }),
  ),
  summary: readingSummarySchema,
  fetchedAt: z.string(),
})
export type ChannelReadingView = z.infer<typeof channelReadingSchema>

export const journeyViewSchema = journeySchema.extend({
  proposals: z.array(proposalSchema),
  measures: z.array(measureSchema),
  nameChecks: z.array(nameCheckSchema),
  jobs: z.array(jobSchema),
  // By niche label, for the latest batch: domain rules with their source (FR-015, US1 AS7).
  warnings: z.record(z.string(), z.array(channelWarningViewSchema)),
  // Older measures ask to be measured again (FR-027).
  measureStaleDays: z.number().int().positive(),
  // What was read of the channel the journey is about: not the one of a channel it no longer is.
  reading: channelReadingSchema.nullable(),
})
export type JourneyFullView = z.infer<typeof journeyViewSchema>

// POST /api/journeys/:id/step
export const journeyStepBodySchema = z.object({
  revision,
  step: journeyStepSchema,
  data: journeyStateSchema.optional(),
  // FR-025: going back to the niches with a concept approved.
  confirm: z.boolean().optional(),
  // FR-018b: «Decidir más tarde».
  nameLater: z.boolean().optional(),
})

const CHANNEL_USES = Object.keys(CHANNEL_OUTPUTS) as [ChannelUse, ...ChannelUse[]]
// `perfil_parte` is asked for from the profile, not from a journey.
const JOURNEY_USES = CHANNEL_USES.filter((use) => use !== 'perfil_parte') as [ChannelUse, ...ChannelUse[]]

// POST /api/journeys/:id/estimate
export const estimateBodySchema = z.object({ use: z.enum(JOURNEY_USES), proposalId: id.optional() })
export const estimateSchema = z.object({
  estimateId: id,
  use: z.enum(CHANNEL_USES),
  cents,
  included: z.boolean(),
  blockedBy: z.enum(['por_operacion', 'diario', 'mensual']).nullable(),
  pricingVersion: z.number().int().positive(),
})
export type EstimateView = z.infer<typeof estimateSchema>

// POST /api/journeys/:id/proposals
export const proposalBodySchema = z.object({
  revision,
  kind: z.enum(PROPOSAL_KINDS),
  estimateId: id,
  instructions: z.string().trim().max(500).optional(),
  parentId: id.optional(),
})

// PATCH /api/proposals/:id
export const patchProposalBodySchema = z.object({
  editedPayload: z.unknown().optional(),
  selectedIndex: count.optional(),
  status: z.enum(['aprobada', 'descartada']).optional(),
})

// POST /api/journeys/:id/references
export const referencesBodySchema = z.object({
  measureId: id,
  add: z.string().trim().min(1).max(500).optional(),
  remove: id.optional(),
})

// POST …/measures, …/name-checks, …/reading and /api/settings/youtube/update-reader
export const jobStartedSchema = z.object({ jobId: id })

// POST /api/journeys/:id/as-new (FR-022)
export const asNewBodySchema = z.object({ revision })

// One event of GET /api/jobs/:id/events.
export const jobEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), done: count, total: count }),
  z.object({ type: z.literal('item'), item: z.unknown() }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('failed'), failure: z.string() }),
])
export type JobEvent = z.infer<typeof jobEventSchema>

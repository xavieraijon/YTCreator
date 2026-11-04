import { describe, expect, it } from 'vitest'
import {
  channelCurrentSchema,
  channelSchema,
  createChannelBodySchema,
  createChannelResponseSchema,
  estimateBodySchema,
  estimateSchema,
  GUARDS,
  jobEventSchema,
  jobStartedSchema,
  journeySchema,
  journeyViewSchema,
  patchProposalBodySchema,
  proposalBodySchema,
  proposalOutcomeSchema,
  proposalSchema,
  referencesBodySchema,
  journeyStepBodySchema,
} from '../../src/api/index.ts'

const at = '2026-11-01T10:00:00.000Z'
const channel = {
  id: 'c1',
  origin: 'nuevo',
  displayName: null,
  handle: null,
  nameStatus: 'provisional',
  youtubeChannelId: null,
  language: 'es',
  audienceRegion: 'espana',
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
}
const journey = {
  id: 'j1',
  channelId: 'c1',
  kind: 'nuevo',
  step: 'intereses',
  status: 'activo',
  state: {},
  revision: 0,
  createdAt: at,
  updatedAt: at,
}
const proposal = {
  id: 'p1',
  journeyId: 'j1',
  kind: 'preguntas',
  payload: { questions: [] },
  editedPayload: null,
  selectedIndex: null,
  status: 'propuesta',
  parentId: null,
  instructions: null,
  promptId: 'preguntas',
  promptVersion: 1,
  claimsTrimmed: false,
  usageId: null,
  createdAt: at,
  decidedAt: null,
}

describe('channel schemas', () => {
  it('channel and journey', () => {
    expect(channelSchema.parse(channel)).toEqual(channel)
    expect(journeySchema.parse(journey)).toEqual(journey)
    expect(journeySchema.safeParse({ ...journey, step: 'volando' }).success).toBe(false)
  })

  it('GET /api/channels/current, with and without a channel', () => {
    expect(channelCurrentSchema.parse({ channel: null })).toEqual({ channel: null })
    const full = { channel, profile: null, journey }
    expect(channelCurrentSchema.parse(full)).toEqual(full)
  })

  it('POST /api/channels', () => {
    expect(createChannelBodySchema.safeParse({ origin: 'existente' }).success).toBe(true)
    expect(createChannelBodySchema.safeParse({ origin: 'otro' }).success).toBe(false)
    expect(createChannelResponseSchema.parse({ channel, journey })).toEqual({ channel, journey })
  })

  it('GET /api/journeys/:id brings what the journey has', () => {
    const view = { ...journey, proposals: [proposal], measures: [], nameChecks: [], jobs: [] }
    expect(journeyViewSchema.parse(view)).toEqual(view)
  })

  it('POST /api/journeys/:id/step', () => {
    expect(journeyStepBodySchema.safeParse({ revision: 3, step: 'preguntas' }).success).toBe(true)
    expect(journeyStepBodySchema.safeParse({ revision: 3, step: 'hecho', nameLater: true }).success).toBe(true)
    expect(journeyStepBodySchema.safeParse({ revision: 3, step: 'nichos', confirm: true }).success).toBe(true)
    expect(journeyStepBodySchema.safeParse({ revision: 3, step: 'ritmo', data: { hoursPerWeek: 61 } }).success).toBe(
      false,
    )
    expect(journeyStepBodySchema.safeParse({ step: 'preguntas' }).success).toBe(false)
  })

  it('POST /api/journeys/:id/estimate', () => {
    expect(estimateBodySchema.safeParse({ use: 'preguntas' }).success).toBe(true)
    expect(estimateBodySchema.safeParse({ use: 'nichos', proposalId: 'p1' }).success).toBe(true)
    expect(estimateBodySchema.safeParse({ use: 'comprobacion' }).success).toBe(false)
    const estimate = {
      estimateId: 'e1',
      use: 'preguntas',
      cents: 4,
      included: false,
      blockedBy: null,
      pricingVersion: 1,
    }
    expect(estimateSchema.parse(estimate)).toEqual(estimate)
    expect(estimateSchema.safeParse({ ...estimate, blockedBy: 'otro' }).success).toBe(false)
  })

  it('POST /api/journeys/:id/proposals', () => {
    const body = { revision: 1, kind: 'preguntas', estimateId: 'e1' }
    expect(proposalBodySchema.safeParse(body).success).toBe(true)
    expect(proposalBodySchema.safeParse({ ...body, instructions: 'a'.repeat(500), parentId: 'p0' }).success).toBe(true)
    expect(proposalBodySchema.safeParse({ ...body, instructions: 'a'.repeat(501) }).success).toBe(false)
    expect(proposalBodySchema.safeParse({ ...body, estimateId: undefined }).success).toBe(false)
    expect(proposalSchema.parse(proposal)).toEqual(proposal)
    expect(proposalOutcomeSchema.parse(proposal)).toEqual(proposal)
    expect(proposalOutcomeSchema.parse({ failure: 'limite_de_gasto' })).toEqual({ failure: 'limite_de_gasto' })
    expect(proposalOutcomeSchema.safeParse({ failure: 'otro' }).success).toBe(false)
  })

  it('PATCH /api/proposals/:id', () => {
    expect(patchProposalBodySchema.safeParse({ selectedIndex: 2, status: 'aprobada' }).success).toBe(true)
    expect(patchProposalBodySchema.safeParse({ editedPayload: { questions: [] } }).success).toBe(true)
    expect(patchProposalBodySchema.safeParse({ status: 'propuesta' }).success).toBe(false)
    expect(patchProposalBodySchema.safeParse({ selectedIndex: -1 }).success).toBe(false)
  })

  it('POST /api/journeys/:id/references', () => {
    expect(referencesBodySchema.safeParse({ measureId: 'm1', add: 'UC123' }).success).toBe(true)
    expect(referencesBodySchema.safeParse({ add: 'UC123' }).success).toBe(false)
  })

  it('jobs', () => {
    expect(jobStartedSchema.parse({ jobId: 'b1' })).toEqual({ jobId: 'b1' })
    for (const event of [
      { type: 'progress', done: 1, total: 5 },
      { type: 'item', item: { id: 'm1' } },
      { type: 'done' },
      { type: 'failed', failure: 'bloqueado' },
    ]) {
      expect(jobEventSchema.parse(event)).toEqual(event)
    }
    expect(jobEventSchema.safeParse({ type: 'otro' }).success).toBe(false)
  })

  it('ya_hay_canal is a guard (FR-028)', () => {
    expect(GUARDS).toContain('ya_hay_canal')
  })
})

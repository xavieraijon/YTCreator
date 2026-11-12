import { describe, expect, it } from 'vitest'
import {
  batchDecideBodySchema,
  ideaEstimateBodySchema,
  ideaOpportunitySchema,
  ideaMeasuresBodySchema,
  ideaPatchBodySchema,
  ideaSchema,
  newIdeaBodySchema,
} from '../../src/api/index.ts'

const idea = {
  id: 'i1',
  script: null,
  origin: 'creador',
  batchId: null,
  sourceIdeaId: null,
  title: 'Cena en diez minutos',
  hook: '',
  pillar: null,
  format: 'largo',
  notes: '',
  query: null,
  broadQuery: null,
  queryEn: null,
  status: 'banco',
  position: 0,
  queuePosition: null,
  revision: 1,
  profileVersion: 1,
  createdAt: '2026-11-07T10:00:00.000Z',
  updatedAt: '2026-11-07T10:00:00.000Z',
  measure: null,
  stale: false,
  fromOlderProfile: false,
  measuredOlderRevision: false,
}

describe('idea bank API schemas (contracts/http-api.md)', () => {
  it('an idea view without a measure is valid', () => {
    expect(ideaSchema.safeParse(idea).success).toBe(true)
  })

  it('a new idea needs a title of 1 to 120 characters and a format', () => {
    expect(newIdeaBodySchema.safeParse({ title: 'Mi idea', format: 'short' }).success).toBe(true)
    expect(newIdeaBodySchema.safeParse({ title: ' ', format: 'short' }).success).toBe(false)
    expect(newIdeaBodySchema.safeParse({ title: 'x'.repeat(121), format: 'short' }).success).toBe(false)
    expect(newIdeaBodySchema.safeParse({ title: 'Mi idea' }).success).toBe(false)
  })

  it('caps the hook at 300, the notes at 2000 and the searches at 120 with no quotes', () => {
    const base = { title: 'Mi idea', format: 'largo' }
    expect(newIdeaBodySchema.safeParse({ ...base, hook: 'x'.repeat(301) }).success).toBe(false)
    expect(newIdeaBodySchema.safeParse({ ...base, notes: 'x'.repeat(2001) }).success).toBe(false)
    expect(newIdeaBodySchema.safeParse({ ...base, query: '"idea"' }).success).toBe(false)
    expect(newIdeaBodySchema.safeParse({ ...base, query: null }).success).toBe(true)
  })

  it('a change asks for the revision', () => {
    expect(ideaPatchBodySchema.safeParse({ title: 'Otro' }).success).toBe(false)
    expect(ideaPatchBodySchema.safeParse({ revision: 2, status: 'elegida' }).success).toBe(true)
    expect(ideaPatchBodySchema.safeParse({ revision: 2, status: 'borrada' }).success).toBe(false)
  })

  it('only the idea uses can be estimated here', () => {
    expect(ideaEstimateBodySchema.safeParse({ use: 'ideas' }).success).toBe(true)
    expect(ideaEstimateBodySchema.safeParse({ use: 'nichos' }).success).toBe(false)
  })

  it('decisions are indexes and a measure needs at least one idea', () => {
    expect(batchDecideBodySchema.safeParse({ keep: [0, 2], discard: [1] }).success).toBe(true)
    expect(batchDecideBodySchema.safeParse({ keep: [-1], discard: [] }).success).toBe(false)
    expect(ideaMeasuresBodySchema.safeParse({ ideaIds: [] }).success).toBe(false)
  })

  it('an empty pillar of an own idea is no pillar', () => {
    expect(newIdeaBodySchema.parse({ title: 'Mi idea', format: 'largo', pillar: ' ' }).pillar).toBeNull()
  })

  it('a failed English search leaves only its failure as the opportunity', () => {
    expect(ideaOpportunitySchema.safeParse({ failure: 'bloqueado' }).success).toBe(true)
    expect(ideaOpportunitySchema.safeParse({ english: true, englishBigVideos: 2, topVideos: [] }).success).toBe(true)
    expect(ideaOpportunitySchema.safeParse({}).success).toBe(false)
  })
})

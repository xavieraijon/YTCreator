import { beforeEach, describe, expect, it } from 'vitest'
import { createChannelsRepo } from '../../../src/db/repos/channels.ts'
import { createJourneysRepo } from '../../../src/db/repos/journeys.ts'
import { createProposalsRepo, type NewProposal, type ProposalsRepo } from '../../../src/db/repos/proposals.ts'
import { freshDb } from './helpers.ts'

describe('proposals repo', () => {
  let proposals: ProposalsRepo
  let base: NewProposal

  beforeEach(() => {
    const db = freshDb()
    const channelId = createChannelsRepo(db).create({ origin: 'nuevo' }).id
    const journeyId = createJourneysRepo(db).create({ channelId, kind: 'nuevo', step: 'nichos' }).id
    proposals = createProposalsRepo(db)
    base = { journeyId, kind: 'nichos', payload: { niches: ['a', 'b'] }, promptId: 'nichos', promptVersion: 1 }
  })

  it('creates a proposal in status propuesta', () => {
    const proposal = proposals.create(base)
    expect(proposal).toMatchObject({ status: 'propuesta', payload: { niches: ['a', 'b'] }, claimsTrimmed: false })
    expect(proposals.latest(base.journeyId, 'nichos')?.id).toBe(proposal.id)
  })

  it('approves with the chosen option and records the decision time', () => {
    const proposal = proposals.create(base)
    const approved = proposals.approve(proposal.id, 1)
    expect(approved).toMatchObject({ status: 'aprobada', selectedIndex: 1 })
    expect(approved?.decidedAt).not.toBeNull()
  })

  it('keeps the edited payload apart from the original one', () => {
    const proposal = proposals.create(base)
    const edited = proposals.edit(proposal.id, { niches: ['c'] })
    expect(edited).toMatchObject({ payload: { niches: ['a', 'b'] }, editedPayload: { niches: ['c'] } })
  })

  it('regenerating discards the old proposal and links the new one to it', () => {
    const first = proposals.create(base)
    const second = proposals.regenerate(first.id, { ...base, instructions: 'más cortos' })
    expect(second).toMatchObject({ parentId: first.id, instructions: 'más cortos', status: 'propuesta' })
    expect(proposals.get(first.id)?.status).toBe('descartada')
    expect(proposals.latest(base.journeyId, 'nichos')?.id).toBe(second.id)
    expect(proposals.list(base.journeyId, 'nichos')).toHaveLength(2)
  })

  it('rejects instructions longer than 500 characters', () => {
    expect(() => proposals.create({ ...base, instructions: 'x'.repeat(501) })).toThrow()
  })
})

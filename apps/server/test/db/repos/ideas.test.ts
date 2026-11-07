import { describe, expect, it } from 'vitest'
import { createIdeaBatchesRepo } from '../../../src/db/repos/idea-batches.ts'
import { createIdeaMeasuresRepo } from '../../../src/db/repos/idea-measures.ts'
import { IdeaMoveError, IdeaOrderError, createIdeasRepo } from '../../../src/db/repos/ideas.ts'
import { createJobsRepo } from '../../../src/db/repos/jobs.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

function setup() {
  const db = freshDb()
  const clock = manualClock()
  const { channelId } = seedJourney(db)
  const ideas = createIdeasRepo(db, clock.now)
  const add = (title: string) =>
    ideas.create({ channelId, origin: 'creador', title, format: 'largo', profileVersion: 1 })
  return { db, clock, channelId, ideas, add }
}

describe('ideas repo (data-model.md)', () => {
  it('keeps the bank in order, without the archived', () => {
    const { ideas, channelId, add } = setup()
    const [a, b, c] = [add('A'), add('B'), add('C')]
    expect(ideas.listBank(channelId).map((i) => i.title)).toEqual(['A', 'B', 'C'])
    expect(a.position).toBe(1)
    ideas.setStatus(b.id, 'archivada')
    expect(ideas.listBank(channelId).map((i) => i.id)).toEqual([a.id, c.id])
    expect(ideas.listArchived(channelId).map((i) => i.id)).toEqual([b.id])
  })

  it('moves the revision only with the content, keeps the original and stamps the change', () => {
    const { ideas, clock, add } = setup()
    const idea = add('Primera')
    clock.advance(1000)
    const notes = ideas.edit(idea.id, { notes: 'apunte' })!
    expect(notes.revision).toBe(1)
    expect(notes.updatedAt).not.toBe(idea.updatedAt)
    const edited = ideas.edit(idea.id, { title: 'Segunda', query: 'segunda busqueda' })!
    expect(edited.revision).toBe(2)
    expect(edited.original).toMatchObject({ title: 'Primera', query: null })
    expect(ideas.edit(idea.id, { title: 'Segunda' })!.revision).toBe(2)
  })

  it('puts a chosen idea at the end of the queue and renumbers it when one leaves', () => {
    const { ideas, channelId, add } = setup()
    const [a, b, c] = [add('A'), add('B'), add('C')]
    ideas.setStatus(a.id, 'elegida')
    ideas.setStatus(b.id, 'elegida')
    ideas.setStatus(c.id, 'elegida')
    expect(ideas.listQueue(channelId).map((i) => [i.title, i.queuePosition])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ])
    ideas.setStatus(a.id, 'hecha')
    expect(ideas.get(a.id)!.queuePosition).toBeNull()
    expect(ideas.listQueue(channelId).map((i) => [i.title, i.queuePosition])).toEqual([
      ['B', 1],
      ['C', 2],
    ])
  })

  it('brings an archived idea back to the end of the bank', () => {
    const { ideas, channelId, add } = setup()
    const [a, b] = [add('A'), add('B')]
    ideas.setStatus(a.id, 'archivada')
    ideas.setStatus(a.id, 'banco')
    expect(ideas.listBank(channelId).map((i) => i.id)).toEqual([b.id, a.id])
  })

  it('reorders the bank and the queue only with every idea once', () => {
    const { ideas, channelId, add } = setup()
    const [a, b, c] = [add('A'), add('B'), add('C')]
    expect(ideas.reorder(channelId, [c.id, a.id, b.id]).map((i) => i.title)).toEqual(['C', 'A', 'B'])
    expect(() => ideas.reorder(channelId, [c.id, a.id])).toThrow(IdeaOrderError)
    expect(() => ideas.reorder(channelId, [c.id, a.id, a.id])).toThrow(IdeaOrderError)
    ideas.setStatus(a.id, 'elegida')
    ideas.setStatus(b.id, 'elegida')
    expect(ideas.reorderQueue(channelId, [b.id, a.id]).map((i) => i.title)).toEqual(['B', 'A'])
    expect(() => ideas.reorderQueue(channelId, [b.id, c.id])).toThrow(IdeaOrderError)
  })

  it('keeps the measures and shows the last one', () => {
    const { db, clock, channelId, add } = setup()
    const measures = createIdeaMeasuresRepo(db, clock.now)
    const idea = add('A')
    const base = {
      ideaId: idea.id,
      ideaRevision: 1,
      reason: null,
      figures: null,
      similarVideos: [],
      opportunity: null,
      queries: { query: 'a', broadQuery: null, queryEn: null },
      source: 'fake' as const,
      partial: false,
      thresholdsVersion: 5,
    }
    measures.add({ ...base, status: 'fallida', verdict: null, failure: 'bloqueado' })
    clock.advance(1000)
    measures.add({ ...base, status: 'medida', verdict: 'hueco', failure: null })
    expect(measures.latest(idea.id)).toMatchObject({ status: 'medida', verdict: 'hueco' })
    expect(measures.latestByChannel(channelId).get(idea.id)?.verdict).toBe('hueco')
  })

  it('keeps what was decided of each candidate of a batch', () => {
    const { db, clock, channelId } = setup()
    const batches = createIdeaBatchesRepo(db, clock.now)
    const batch = batches.create({
      channelId,
      kind: 'ideas',
      payload: { ideas: [{}, {}, {}] },
      promptId: 'ideas',
      promptVersion: 1,
      profileVersion: 1,
    })
    expect(batches.pending(channelId, 'ideas')?.id).toBe(batch.id)
    batches.decide(batch.id, { 0: 'quedada', 1: 'descartada' })
    expect(batches.get(batch.id)!.decisions).toEqual({ 0: 'quedada', 1: 'descartada' })
    batches.discardPending(channelId, 'ideas')
    expect(batches.get(batch.id)!.decisions[2]).toBe('descartada')
    expect(batches.pending(channelId, 'ideas')).toBeNull()
  })

  it('runs a measure of ideas as a job of the channel', () => {
    const { db, clock, channelId } = setup()
    const jobs = createJobsRepo(db, clock.now)
    const job = jobs.start({ journeyId: null, channelId, kind: 'medir_ideas', total: 2 })
    expect(job).toMatchObject({ channelId, kind: 'medir_ideas', journeyId: null })
    expect(jobs.listByChannel(channelId, 'medir_ideas').map((j) => j.id)).toEqual([job.id])
  })

  it('refuses a move the state diagram does not have', () => {
    const { ideas, add } = setup()
    const idea = add('A')
    ideas.setStatus(idea.id, 'archivada')
    expect(() => ideas.setStatus(idea.id, 'elegida')).toThrow(IdeaMoveError)
    expect(ideas.get(idea.id)!.status).toBe('archivada')
  })

  it('an edit with a field given as undefined leaves it as it was', () => {
    const { ideas, add } = setup()
    const idea = add('A')
    const edited = ideas.edit(idea.id, { title: undefined, notes: 'apunte' })!
    expect(edited).toMatchObject({ title: 'A', notes: 'apunte', revision: 1 })
  })
})

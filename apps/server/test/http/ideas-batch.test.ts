import { batchDecideResultSchema, estimateSchema, ideaBankSchema, ideaBatchSchema } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>

async function propose(t: TestApp, channelId: string, instructions?: string) {
  const estimate = await call(t, 'POST', `/api/channels/${channelId}/ideas/estimate`, { use: 'ideas' })
  expect(estimate.status).toBe(200)
  const { estimateId } = estimateSchema.parse(estimate.body)
  return call(t, 'POST', `/api/channels/${channelId}/idea-batches`, {
    estimateId,
    ...(instructions ? { instructions } : {}),
  })
}

describe('a batch of ideas from the AI (US1)', () => {
  it('estimates first, then gives 6 to 10 candidates waiting for the creator', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const estimate = await call(t, 'POST', `/api/channels/${channelId}/ideas/estimate`, { use: 'ideas' })
    expect(estimateSchema.parse(estimate.body)).toMatchObject({ use: 'ideas', blockedBy: null })
    const batch = ideaBatchSchema.parse((await propose(t, channelId)).body)
    expect(batch.candidates.length).toBeGreaterThanOrEqual(6)
    expect(batch.candidates.every((candidate) => candidate.decision === null)).toBe(true)
    expect(t.usage.list().filter((row) => row.use === 'ideas')).toMatchObject([{ outcome: 'ok' }])
    const bank = ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect(bank.pendingBatch?.id).toBe(batch.id)
  })

  it('keeps the chosen at the end of the bank, from the AI, with the batch and the profile version', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    t.ideas.ideas.create({ channelId, origin: 'creador', title: 'La primera', format: 'largo', profileVersion: 1 })
    const batch = ideaBatchSchema.parse((await propose(t, channelId)).body)
    const rest = batch.candidates.map((candidate) => candidate.index).slice(2)
    const decided = await call(t, 'POST', `/api/idea-batches/${batch.id}/decide`, { keep: [0, 1], discard: rest })
    expect(decided.status).toBe(200)
    const { created, batch: after } = batchDecideResultSchema.parse(decided.body)
    expect(created).toMatchObject([
      { origin: 'ia', batchId: batch.id, profileVersion: 1, title: batch.candidates[0]!.title },
      { origin: 'ia', batchId: batch.id, title: batch.candidates[1]!.title },
    ])
    expect(after.candidates.map((candidate) => candidate.decision).slice(0, 3)).toEqual([
      'quedada',
      'quedada',
      'descartada',
    ])
    const bank = ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect(bank.ideas.map((idea) => idea.title)).toEqual(['La primera', ...created.map((idea) => idea.title)])
    expect(bank.pendingBatch).toBeNull()
    // Decided once: a second time is a conflict.
    expect((await call(t, 'POST', `/api/idea-batches/${batch.id}/decide`, { keep: [0], discard: [] })).status).toBe(409)
    expect((await call(t, 'POST', `/api/idea-batches/${batch.id}/decide`, { keep: [99], discard: [] })).status).toBe(
      400,
    )
  })

  it('takes out what repeats the bank and says how many (R9)', async () => {
    const t = makeTestApp({ fakeAi: 'ideas_repetidas' })
    const { channelId } = await finished(t)
    for (const title of ['Mi idea uno', 'Mi idea dos']) {
      t.ideas.ideas.create({ channelId, origin: 'creador', title, format: 'largo', profileVersion: 1 })
    }
    const batch = ideaBatchSchema.parse((await propose(t, channelId)).body)
    expect(batch.removedRepeats).toBe(2)
    expect(batch.candidates.map((candidate) => candidate.title)).not.toContain('Mi idea uno')
  })

  it('sends the bank, the archive and what was discarded as what not to repeat', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const archived = t.ideas.ideas.create({
      channelId,
      origin: 'creador',
      title: 'Archivada',
      format: 'short',
      profileVersion: 1,
    })
    t.ideas.ideas.setStatus(archived.id, 'archivada')
    const first = ideaBatchSchema.parse((await propose(t, channelId)).body)
    await call(t, 'POST', `/api/idea-batches/${first.id}/decide`, { keep: [], discard: [0] })
    const sent: unknown[] = []
    const original = t.channel.aiRun.run
    t.channel.aiRun.run = (async (args: { input: unknown }) => {
      sent.push(args.input)
      return original(args as never)
    }) as typeof original
    await propose(t, channelId)
    const avoid = (sent[0] as { avoid: { title: string }[] }).avoid.map((idea) => idea.title)
    expect(avoid).toContain('Archivada')
    expect(avoid).toContain(first.candidates[0]!.title)
  })

  it('a new batch leaves the candidates of the previous one that were waiting, and never repeats them', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const first = ideaBatchSchema.parse((await propose(t, channelId, 'Más cortas')).body)
    const sent: unknown[] = []
    const original = t.channel.aiRun.run
    // The second answer brings one of the waiting candidates back and seven new ones.
    t.channel.aiRun.run = (async (args: { input: unknown }) => {
      sent.push(args.input)
      const result = await original(args as never)
      if (!result.ok) return result
      const drafts = (result.value as { ideas: { title: string; query: string }[] }).ideas
      const ideas = drafts.map((draft, index) =>
        index === 0 ? draft : { ...draft, title: `${draft.title} bis`, query: `${draft.query} bis` },
      )
      return { ...result, value: { ideas } }
    }) as typeof original
    const second = ideaBatchSchema.parse((await propose(t, channelId)).body)
    const avoid = (sent[0] as { avoid: { title: string }[] }).avoid.map((idea) => idea.title)
    expect(avoid).toContain(first.candidates[0]!.title)
    expect(second.removedRepeats).toBe(1)
    expect(second.candidates.map((candidate) => candidate.title)).not.toContain(first.candidates[0]!.title)
    const old = t.ideas.batches.get(first.id)!
    expect(Object.values(old.decisions).every((decision) => decision === 'descartada')).toBe(true)
    expect(old.instructions).toBe('Más cortas')
    const bank = ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect(bank.pendingBatch?.id).toBe(second.id)
  })

  it('a batch where every candidate repeats is said, and the one being decided stays (entry 17)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const first = ideaBatchSchema.parse((await propose(t, channelId)).body)
    const second = ideaBatchSchema.parse((await propose(t, channelId)).body)
    expect(second.candidates).toEqual([])
    expect(second.removedRepeats).toBe(first.candidates.length)
    expect(t.ideas.batches.get(first.id)!.decisions).toEqual({})
    const bank = ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect(bank.pendingBatch?.id).toBe(first.id)
  })

  it('past 200, the newest go to the AI and the server still takes out every repeat (R9)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    for (let n = 0; n < 205; n++) {
      t.ideas.ideas.create({ channelId, origin: 'creador', title: `Vieja ${n}`, format: 'largo', profileVersion: 1 })
    }
    const first = ideaBatchSchema.parse((await propose(t, channelId)).body)
    await call(t, 'POST', `/api/idea-batches/${first.id}/decide`, { keep: [], discard: [0] })
    const sent: unknown[] = []
    const original = t.channel.aiRun.run
    t.channel.aiRun.run = (async (args: { input: unknown }) => {
      sent.push(args.input)
      const result = await original(args as never)
      if (!result.ok) return result
      const drafts = (result.value as { ideas: { title: string; query: string }[] }).ideas
      const ideas = drafts.map((draft, index) =>
        index === 0
          ? { ...draft, title: 'vieja 0' }
          : { ...draft, title: `${draft.title} bis`, query: `${draft.query} bis` },
      )
      return { ...result, value: { ideas } }
    }) as typeof original
    const second = ideaBatchSchema.parse((await propose(t, channelId)).body)
    const avoid = (sent[0] as { avoid: { title: string }[] }).avoid.map((idea) => idea.title)
    expect(avoid).toHaveLength(200)
    expect(avoid).toContain(first.candidates[0]!.title)
    expect(avoid).not.toContain('Vieja 0')
    expect(second.candidates.map((candidate) => candidate.title)).not.toContain('vieja 0')
  })

  it('a pillar outside the profile is asked again, and the pillar is kept as the profile writes it', async () => {
    const t = makeTestApp({ fakeAi: 'pilar_invalido' })
    const { channelId } = await finished(t)
    const batch = ideaBatchSchema.parse((await propose(t, channelId)).body)
    const profile = t.ideas.profiles.getCurrent(channelId)!.profile as { concept: { pillars: { title: string }[] } }
    const pillars = profile.concept.pillars.map((pillar) => pillar.title)
    expect(batch.candidates.every((candidate) => pillars.includes(candidate.pillar))).toBe(true)

    const original = t.channel.aiRun.run
    t.channel.aiRun.run = (async (args: unknown) => {
      const result = await original(args as never)
      if (!result.ok) return result
      const drafts = (result.value as { ideas: { title: string; pillar: string }[] }).ideas
      const ideas = drafts.map((draft) => ({ ...draft, title: `${draft.title} 2`, pillar: draft.pillar.toLowerCase() }))
      return { ...result, value: { ideas } }
    }) as typeof original
    const lower = ideaBatchSchema.parse((await propose(t, channelId)).body)
    expect(lower.candidates.every((candidate) => pillars.includes(candidate.pillar))).toBe(true)
  })

  it('an invented figure in a hook is taken out and said (claimsTrimmed)', async () => {
    const t = makeTestApp({ fakeAi: 'cifra_inventada' })
    const { channelId } = await finished(t)
    const batch = ideaBatchSchema.parse((await propose(t, channelId)).body)
    expect(batch.claimsTrimmed).toBe(true)
  })

  it('two «Me la quedo» of the same candidate at once make the idea once: the other is a conflict', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const batch = ideaBatchSchema.parse((await propose(t, channelId)).body)
    const both = await Promise.all([
      call(t, 'POST', `/api/idea-batches/${batch.id}/decide`, { keep: [0], discard: [] }),
      call(t, 'POST', `/api/idea-batches/${batch.id}/decide`, { keep: [0], discard: [] }),
    ])
    expect(both.map((result) => result.status).sort()).toEqual([200, 409])
    expect(t.ideas.ideas.listAll(channelId)).toHaveLength(1)
  })

  it('the estimate of a use not ready yet names the field use', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const result = await call(t, 'POST', `/api/channels/${channelId}/ideas/estimate`, { use: 'otro_enfoque' })
    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: { fields: { use: 'no_valido' } } })
  })

  it('past the spending limit: limite_de_gasto, nothing spent and no batch', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const estimate = estimateSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas/estimate`, { use: 'ideas' })).body,
    )
    await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 1, dailyCents: 1, monthlyCents: 1 })
    const result = await call(t, 'POST', `/api/channels/${channelId}/idea-batches`, { estimateId: estimate.estimateId })
    expect(result.body).toEqual({ failure: 'limite_de_gasto' })
    expect(t.usage.list().filter((row) => row.use === 'ideas')).toMatchObject([
      { outcome: 'limite_de_gasto', costCents: 0 },
    ])
    expect(t.ideas.batches.list(channelId)).toEqual([])
  })
})

import { batchDecideResultSchema, estimateSchema, ideaBankSchema, ideaBatchSchema } from '@ytcreator/core/api'
import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>

// An idea of each answer of the fake YouTube, measured (contracts/idea-measure.md).
async function measured(t: TestApp, channelId: string, title: string, query: string) {
  const idea = t.ideas.ideas.create({
    channelId,
    origin: 'creador',
    title,
    format: 'largo',
    profileVersion: 1,
    query,
    broadQuery: 'pan con publico',
  })
  const { jobId } = (await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [idea.id] }))
    .body as { jobId: string }
  await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
  return idea
}

const estimate = (t: TestApp, channelId: string, ideaId: string) =>
  call(t, 'POST', `/api/channels/${channelId}/ideas/estimate`, { use: 'otro_enfoque', ideaId })

async function angles(t: TestApp, channelId: string, ideaId: string) {
  const { estimateId } = estimateSchema.parse((await estimate(t, channelId, ideaId)).body)
  return call(t, 'POST', `/api/ideas/${ideaId}/angles`, { estimateId })
}

describe('another angle for a burnt idea (US3)', () => {
  it('is only for an idea measured quemado or competido', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const room = await measured(t, channelId, 'Con hueco', 'pan idea hueco')
    const bare = t.ideas.ideas.create({
      channelId,
      origin: 'creador',
      title: 'Sin medir',
      format: 'largo',
      profileVersion: 1,
    })
    for (const idea of [room, bare]) {
      const result = await estimate(t, channelId, idea.id)
      expect(result).toMatchObject({ status: 400, body: { error: { fields: { ideaId: 'sin_medida_quemada' } } } })
    }
    const competed = await measured(t, channelId, 'Competida', 'pan idea competida')
    expect((await estimate(t, channelId, competed.id)).status).toBe(200)
  })

  it('gives 2 to 3 angles of kind otro_enfoque, written knowing the similar videos', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const burnt = await measured(t, channelId, 'Quemada', 'pan idea quemada')
    const sent: unknown[] = []
    const original = t.channel.aiRun.run
    t.channel.aiRun.run = (async (args: { input: unknown }) => {
      sent.push(args.input)
      return original(args as never)
    }) as typeof original
    const result = await angles(t, channelId, burnt.id)
    expect(result.status).toBe(200)
    const batch = ideaBatchSchema.parse(result.body)
    expect(batch).toMatchObject({ kind: 'otro_enfoque', sourceIdeaId: burnt.id })
    expect(batch.candidates.length).toBeGreaterThanOrEqual(2)
    expect(batch.candidates.length).toBeLessThanOrEqual(3)
    expect(batch.candidates.every((candidate) => (candidate.why ?? '').length > 0)).toBe(true)
    const input = sent[0] as {
      idea: { title: string; query: string }
      measure: { verdict: string; similarTitles: string[] }
      profile: { pillars: string[] }
    }
    expect(input.idea).toMatchObject({ title: 'Quemada', query: 'pan idea quemada' })
    expect(input.measure.verdict).toBe('quemado')
    expect(input.measure.similarTitles.length).toBeGreaterThan(0)
    expect(input.measure.similarTitles.length).toBeLessThanOrEqual(12)
    expect(input.profile.pillars.length).toBeGreaterThan(0)
    // It comes back with the bank, by the idea it came from, and the proposal is on the usage record.
    const bank = ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect(bank.pendingAngles.map((one) => one.id)).toEqual([batch.id])
    expect(bank.pendingBatch).toBeNull()
    expect(t.usage.list().filter((row) => row.use === 'otro_enfoque')).toMatchObject([{ outcome: 'ok' }])
  })

  it('keeping one makes a new idea of origin otro_enfoque, linked and without a measure', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const burnt = await measured(t, channelId, 'Quemada', 'pan idea quemada')
    const batch = ideaBatchSchema.parse((await angles(t, channelId, burnt.id)).body)
    const decided = await call(t, 'POST', `/api/idea-batches/${batch.id}/decide`, { keep: [0], discard: [1] })
    const { created } = batchDecideResultSchema.parse(decided.body)
    expect(created).toMatchObject([{ origin: 'otro_enfoque', sourceIdeaId: burnt.id, measure: null }])
    const bank = ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect(bank.ideas.map((idea) => idea.title)).toContain(batch.candidates[0]!.title)
    // One left to decide: the angles stay until every one is decided.
    expect(bank.pendingAngles.map((one) => one.id)).toEqual([batch.id])
  })

  it('a measure changed to hueco meanwhile is refused before spending', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const burnt = await measured(t, channelId, 'Quemada', 'pan idea quemada')
    const { estimateId } = estimateSchema.parse((await estimate(t, channelId, burnt.id)).body)
    t.ideas.ideas.edit(burnt.id, { query: 'pan idea hueco' })
    const { jobId } = (await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [burnt.id] }))
      .body as { jobId: string }
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
    const result = await call(t, 'POST', `/api/ideas/${burnt.id}/angles`, { estimateId })
    expect(result).toMatchObject({ status: 400, body: { error: { fields: { ideaId: 'sin_medida_quemada' } } } })
    expect(t.usage.list().filter((row) => row.use === 'otro_enfoque')).toEqual([])
  })

  it('the angles of two ideas wait at the same time; asking again for one leaves only its own', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const a = await measured(t, channelId, 'Quemada', 'pan idea quemada')
    const b = await measured(t, channelId, 'Competida', 'pan idea competida')
    // The angles of B are stored as they are; the fake AI writes the same ones for every idea.
    const draft = (title: string) => ({
      title,
      hook: 'Gancho.',
      pillar: 'Panes',
      format: 'largo',
      query: title.toLowerCase(),
      broadQuery: 'pan',
      queryEn: 'bread',
      why: 'Otro público.',
    })
    const other = t.ideas.batches.create({
      channelId,
      kind: 'otro_enfoque',
      sourceIdeaId: b.id,
      payload: { angles: [draft('Bizcocho sin horno'), draft('Bizcocho para niños')] },
      promptId: 'otro_enfoque',
      promptVersion: 2,
      profileVersion: 1,
    })
    const first = ideaBatchSchema.parse((await angles(t, channelId, a.id)).body)
    const bank = async () => ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect((await bank()).pendingAngles.map((one) => one.sourceIdeaId).sort()).toEqual([a.id, b.id].sort())
    // Asked again for A, with instructions: the AI is told what to avoid, and only A's waiting ones go.
    const sent: { avoid: { title: string }[]; instructions?: string }[] = []
    const original = t.channel.aiRun.run
    t.channel.aiRun.run = (async (args: { input: unknown; instructions?: string }) => {
      sent.push({
        ...(args.input as { avoid: { title: string }[] }),
        ...(args.instructions ? { instructions: args.instructions } : {}),
      })
      return original(args as never)
    }) as unknown as typeof original
    const { estimateId } = estimateSchema.parse((await estimate(t, channelId, a.id)).body)
    await call(t, 'POST', `/api/ideas/${a.id}/angles`, { estimateId, instructions: 'para gente que empieza' })
    expect(sent[0]!.avoid.map((one) => one.title)).toContain(first.candidates[0]!.title)
    expect(sent[0]!.instructions).toBe('para gente que empieza')
    expect((await bank()).pendingAngles.map((one) => one.id)).toContain(other.id)
  })

  it('refused for an archived idea, or with a measure of an older version of it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const changed = await measured(t, channelId, 'Quemada', 'pan idea quemada')
    t.ideas.ideas.edit(changed.id, { title: 'Quemada, cambiada' })
    const archived = await measured(t, channelId, 'Otra quemada', 'pan idea quemada')
    t.ideas.ideas.setStatus(archived.id, 'archivada')
    for (const idea of [changed, archived]) {
      const result = await estimate(t, channelId, idea.id)
      expect(result).toMatchObject({ status: 400, body: { error: { fields: { ideaId: 'sin_medida_quemada' } } } })
    }
  })

  it('an unknown idea is not found', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await finished(t)
    expect((await call(t, 'POST', '/api/ideas/nada/angles', { estimateId: 'e1' })).status).toBe(404)
  })
})

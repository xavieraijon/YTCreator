import { ideaBankSchema, measureEstimateSchema } from '@ytcreator/core/api'
import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>

async function withIdeas(t: TestApp) {
  const { channelId } = await finished(t)
  const create = (title: string, queries: { query?: string; broadQuery?: string; queryEn?: string }) =>
    t.ideas.ideas.create({ channelId, origin: 'creador', title, format: 'largo', profileVersion: 1, ...queries })
  return {
    channelId,
    burnt: create('Quemada', { query: 'pan idea quemada', broadQuery: 'pan con publico', queryEn: 'bread' }),
    room: create('Con hueco', { query: 'pan idea hueco', broadQuery: 'pan con publico' }),
    bare: create('Sin búsquedas', {}),
  }
}

// YouTube waits until the test lets it answer.
function hold(t: TestApp) {
  let release = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const search = t.ideas.youtube.search
  t.ideas.youtube.search = (async (...args: Parameters<typeof search>) => {
    await gate
    return search(...args)
  }) as typeof search
  return release
}

const bank = async (t: TestApp, channelId: string) =>
  ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)

describe('measuring the ideas of the bank (US2)', () => {
  it('the estimate: no units with the reader; with the Data API, 303 with English and 202 without', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, burnt, room, bare } = await withIdeas(t)
    const ids = [burnt.id, room.id, bare.id]
    const free = await call(t, 'POST', `/api/channels/${channelId}/idea-measures/estimate`, { ideaIds: ids })
    expect(measureEstimateSchema.parse(free.body)).toEqual({ ideas: 3, measurable: 2, withoutEnglish: 1, units: null })
    t.ideas.youtube.effectiveSource = () => 'data_api' as never
    const paid = await call(t, 'POST', `/api/channels/${channelId}/idea-measures/estimate`, { ideaIds: ids })
    expect(measureEstimateSchema.parse(paid.body).units).toBe(303 + 202)
  })

  it('measures in the background, one job at a time, and the bank shows the semaphore', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, burnt, room } = await withIdeas(t)
    const release = hold(t)
    const started = await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [burnt.id, room.id] })
    expect(started.status).toBe(202)
    const { jobId } = started.body as { jobId: string }
    expect((await bank(t, channelId)).runningJob).toBe(jobId)
    const again = await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [room.id] })
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ error: { code: 'conflicto', jobId } })
    release()
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
    const { ideas, runningJob } = await bank(t, channelId)
    expect(runningJob).toBeNull()
    expect(ideas.find((idea) => idea.id === burnt.id)?.measure).toMatchObject({
      verdict: 'quemado',
      reason: 'racha_reciente',
    })
    expect(ideas.find((idea) => idea.id === room.id)?.measure).toMatchObject({
      verdict: 'hueco',
      reason: 'pocos_con_publico',
    })
  })

  it('sends each measure as an item event with its idea', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, room } = await withIdeas(t)
    const release = hold(t)
    const { jobId } = (await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [room.id] }))
      .body as { jobId: string }
    const reading = (await t.request('GET', `/api/jobs/${jobId}/events`)).text()
    await new Promise((resolve) => setImmediate(resolve))
    release()
    const text = await reading
    const item = /event: item\ndata: (.*)/.exec(text)?.[1]
    expect(JSON.parse(item!)).toMatchObject({ type: 'item', item: { ideaId: room.id, measure: { verdict: 'hueco' } } })
  })

  it('after a restart the job is interrupted, and the bank says which ideas were left', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, burnt, room } = await withIdeas(t)
    t.jobsRepo.start({ journeyId: null, channelId, kind: 'medir_ideas', total: 2, ideaIds: [burnt.id, room.id] })
    t.jobsRepo.interruptRunning()
    const before = await bank(t, channelId)
    expect(before.runningJob).toBeNull()
    expect(before.interrupted?.ideaIds).toEqual([burnt.id, room.id])
    const { jobId } = (await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [burnt.id] }))
      .body as { jobId: string }
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
    // A later «¿Tiene hueco?» of one idea does not hide what is left: only that idea is out now.
    expect((await bank(t, channelId)).interrupted?.ideaIds).toEqual([room.id])
    const rest = (await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [room.id] })).body as {
      jobId: string
    }
    await vi.waitFor(() => expect(t.jobs.get(rest.jobId)?.status).toBe('hecho'))
    expect((await bank(t, channelId)).interrupted).toBeNull()
  })

  it('the same idea twice is measured once, and an archived one is refused', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, room, burnt } = await withIdeas(t)
    const estimate = await call(t, 'POST', `/api/channels/${channelId}/idea-measures/estimate`, {
      ideaIds: [room.id, room.id],
    })
    expect(estimate.body).toMatchObject({ ideas: 1, measurable: 1 })
    const { jobId } = (
      await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [room.id, room.id] })
    ).body as { jobId: string }
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
    expect(t.jobs.get(jobId)?.progress.total).toBe(1)
    t.db.prepare("UPDATE idea SET status = 'archivada' WHERE id = ?").run(burnt.id)
    const archived = await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [burnt.id] })
    expect(archived).toMatchObject({
      status: 400,
      body: { error: { code: 'validacion', fields: { ideaIds: 'no_valido' } } },
    })
  })

  it('an old measure is stale, and one of another revision says so', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, room } = await withIdeas(t)
    const { jobId } = (await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [room.id] }))
      .body as { jobId: string }
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString()
    t.db.prepare('UPDATE idea_measure SET measured_at = ?').run(old)
    await call(t, 'PATCH', `/api/ideas/${room.id}`, { revision: 1, hook: 'Otro gancho' })
    const view = (await bank(t, channelId)).ideas.find((idea) => idea.id === room.id)!
    expect(view).toMatchObject({ stale: true, measuredOlderRevision: true })
  })

  it('refuses ideas of another channel or that do not exist', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await withIdeas(t)
    const result = await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: ['nada'] })
    expect(result.status).toBe(404)
  })
})

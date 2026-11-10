import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>

async function setUp(format: 'largo' | 'short' = 'largo') {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { channelId } = await finished(t)
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Una idea', format })
  const ideaId = (made.body['idea'] as { id: string }).id
  return { t, channelId, ideaId }
}
const choose = (t: TestApp, ideaId: string) =>
  call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })

const open = async (t: TestApp, ideaId: string) => (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body
const patch = async (t: TestApp, id: string, body: Record<string, unknown>) => {
  const { updatedAt } = (await call(t, 'GET', `/api/scripts/${id}`)).body
  return call(t, 'PATCH', `/api/scripts/${id}`, { baseUpdatedAt: updatedAt, ...body })
}

describe('script base routes (contracts/http-api.md)', () => {
  it('creates the script of a chosen idea, and returns the same one after', async () => {
    const { t, ideaId } = await setUp()
    await choose(t, ideaId)
    const created = await call(t, 'POST', `/api/ideas/${ideaId}/script`)
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      ideaId,
      format: 'largo',
      targetSeconds: 600,
      status: 'sin_empezar',
      facts: null,
      outline: null,
      draft: null,
      warnings: [],
      job: null,
      limits: { minSeconds: 180, maxSeconds: 1800 },
      voice: { address: 'tu', register: 'cercano', wordsPerMinute: 150, isDefault: true },
    })
    const again = await call(t, 'POST', `/api/ideas/${ideaId}/script`)
    expect(again.status).toBe(200)
    expect(again.body['id']).toBe(created.body['id'])
  })

  it('asks for a chosen idea, but keeps the script of one that left the queue', async () => {
    const { t, ideaId } = await setUp()
    const refused = await call(t, 'POST', `/api/ideas/${ideaId}/script`)
    expect(refused.status).toBe(400)
    expect((refused.body['error'] as { fields?: unknown }).fields).toEqual({ ideaId: 'no_valido' })
    await choose(t, ideaId)
    const { body } = await call(t, 'POST', `/api/ideas/${ideaId}/script`)
    await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'banco' })
    expect((await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id']).toBe(body['id'])
  })

  it('a Short starts at 45 seconds and its maximum is the one of the market knowledge', async () => {
    const { t, ideaId } = await setUp('short')
    await choose(t, ideaId)
    const { body } = await call(t, 'POST', `/api/ideas/${ideaId}/script`)
    expect(body).toMatchObject({ targetSeconds: 45, limits: { minSeconds: 15, maxSeconds: 180 } })
  })

  it('reads it and saves duration and notes, within their limits', async () => {
    const { t, ideaId } = await setUp()
    await choose(t, ideaId)
    const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
    const patched = await patch(t, id, { targetSeconds: 300, notes: 'Mis apuntes' })
    expect(patched.status).toBe(200)
    expect(patched.body).toMatchObject({ targetSeconds: 300, notes: 'Mis apuntes' })
    expect((await call(t, 'GET', `/api/scripts/${id}`)).body).toMatchObject({
      targetSeconds: 300,
      notes: 'Mis apuntes',
    })
    expect((await patch(t, id, { targetSeconds: 179 })).status).toBe(400)
    expect((await patch(t, id, { targetSeconds: 1801 })).status).toBe(400)
    expect((await patch(t, id, { notes: 'x'.repeat(20_001) })).status).toBe(400)
    expect((await patch(t, id, {})).status).toBe(400)
  })

  it('saving the notes alone does not ask again for a duration nobody touched', async () => {
    const { t, ideaId } = await setUp('short')
    await choose(t, ideaId)
    const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
    t.db.prepare('UPDATE script SET target_seconds = 9999 WHERE id = ?').run(id)
    expect((await patch(t, id, { notes: 'Nota' })).status).toBe(200)
  })

  it('does not step on what another tab saved first (R18)', async () => {
    const { t, ideaId } = await setUp()
    await choose(t, ideaId)
    const { id, updatedAt } = (await open(t, ideaId)) as { id: string; updatedAt: string }
    t.db
      .prepare("UPDATE script SET notes = 'De otra pestaña', updated_at = '2030-01-01T00:00:00.000Z' WHERE id = ?")
      .run(id)
    const stale = await call(t, 'PATCH', `/api/scripts/${id}`, { baseUpdatedAt: updatedAt, notes: 'Mía' })
    expect(stale.status).toBe(409)
    expect((stale.body['error'] as { code: string }).code).toBe('version_cambiada')
    expect((await call(t, 'GET', `/api/scripts/${id}`)).body['notes']).toBe('De otra pestaña')
  })

  it('changes nothing while a job is running, and says which one (R12)', async () => {
    const { t, ideaId, channelId } = await setUp()
    await choose(t, ideaId)
    const { id } = (await open(t, ideaId)) as { id: string }
    const job = t.jobsRepo.start({ journeyId: null, channelId, kind: 'ia' })
    t.scripts.setJob(id, job.id, 'escaleta')
    const busy = await patch(t, id, { notes: 'x' })
    expect(busy.status).toBe(409)
    expect(busy.body['error']).toMatchObject({ code: 'en_curso', jobId: job.id })
    expect((await call(t, 'GET', `/api/scripts/${id}`)).body['job']).toMatchObject({ id: job.id, op: 'escaleta' })
  })

  it('applies the limits of a Short to a Short', async () => {
    const { t, ideaId } = await setUp('short')
    await choose(t, ideaId)
    const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
    expect((await patch(t, id, { targetSeconds: 181 })).status).toBe(400)
    expect((await patch(t, id, { targetSeconds: 60 })).status).toBe(200)
  })

  it('lists the scripts of the channel, and only those', async () => {
    const { t, ideaId, channelId } = await setUp()
    await choose(t, ideaId)
    const { body } = await call(t, 'POST', `/api/ideas/${ideaId}/script`)
    const list = await call(t, 'GET', `/api/channels/${channelId}/scripts`)
    expect(list.body).toEqual([
      {
        id: body['id'],
        ideaId,
        title: 'Una idea',
        format: 'largo',
        status: 'sin_empezar',
        updatedAt: expect.any(String),
      },
    ])
    expect((await call(t, 'GET', '/api/channels/otro/scripts')).status).toBe(404)
    const other = t.channels.create({ origin: 'nuevo' })
    const profile = t.channel.profiles.getCurrent(channelId)!
    t.channel.profiles.addVersion(other.id, { origin: 'manual', profile: profile.profile })
    expect((await call(t, 'GET', `/api/channels/${other.id}/scripts`)).body).toEqual([])
  })

  it('a script or idea that does not exist is not found', async () => {
    const { t } = await setUp()
    expect((await call(t, 'GET', '/api/scripts/nada')).status).toBe(404)
    expect((await call(t, 'PATCH', '/api/scripts/nada', { baseUpdatedAt: 'x', notes: '' })).status).toBe(404)
    expect((await call(t, 'POST', '/api/ideas/nada/script')).status).toBe(404)
  })
})

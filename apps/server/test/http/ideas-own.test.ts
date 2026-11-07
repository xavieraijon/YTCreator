import { estimateSchema, ideaSchema, newIdeaResultSchema } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

describe('the creator’s own ideas (US1)', () => {
  it('writes one with a title and a format, and says when the bank has one with the same title', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const first = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Pan casero', format: 'short' })
    expect(first.status).toBe(201)
    const { idea, duplicateOf } = newIdeaResultSchema.parse(first.body)
    expect(idea).toMatchObject({ origin: 'creador', format: 'short', hook: '', pillar: null, revision: 1 })
    expect(duplicateOf).toBeNull()
    const again = newIdeaResultSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'PAN casero', format: 'largo' })).body,
    )
    expect(again.duplicateOf).toBe(idea.id)
  })

  it('an edit asks for the revision, moves it and keeps the original', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const { idea } = newIdeaResultSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Pan casero', format: 'short' })).body,
    )
    const edited = await call(t, 'PATCH', `/api/ideas/${idea.id}`, {
      revision: 1,
      title: 'Pan de pueblo',
      hook: 'Sin amasar.',
    })
    expect(ideaSchema.parse(edited.body)).toMatchObject({ title: 'Pan de pueblo', hook: 'Sin amasar.', revision: 2 })
    expect(t.ideas.ideas.get(idea.id)!.original).toMatchObject({ title: 'Pan casero' })
    const stale = await call(t, 'PATCH', `/api/ideas/${idea.id}`, { revision: 1, title: 'Otro' })
    expect(stale.status).toBe(409)
    expect(stale.body).toMatchObject({ error: { code: 'conflicto', current: { id: idea.id, revision: 2 } } })
  })

  it('two changes of the same revision at once: one wins, the other is a conflict', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const { idea } = newIdeaResultSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Pan', format: 'short' })).body,
    )
    const both = await Promise.all([
      call(t, 'PATCH', `/api/ideas/${idea.id}`, { revision: 1, title: 'A' }),
      call(t, 'PATCH', `/api/ideas/${idea.id}`, { revision: 1, title: 'B' }),
    ])
    expect(both.map((result) => result.status).sort()).toEqual([200, 409])
    expect(t.ideas.ideas.get(idea.id)!.revision).toBe(2)
  })

  it('moves only along the states, and refuses one the diagram does not have', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const { idea } = newIdeaResultSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Pan', format: 'short' })).body,
    )
    const archived = ideaSchema.parse(
      (await call(t, 'PATCH', `/api/ideas/${idea.id}`, { revision: 1, status: 'archivada' })).body,
    )
    expect(archived.status).toBe('archivada')
    const refused = await call(t, 'PATCH', `/api/ideas/${idea.id}`, { revision: 1, status: 'elegida' })
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ error: { fields: { status: 'no_valido' } } })
  })

  it.each([
    [{ title: '', format: 'short' }],
    [{ title: 'x'.repeat(121), format: 'short' }],
    [{ title: 'Pan', format: 'short', hook: 'x'.repeat(301) }],
    [{ title: 'Pan', format: 'short', notes: 'x'.repeat(2001) }],
    [{ title: 'Pan', format: 'medio' }],
  ])('refuses %j with 400', async (body) => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const result = await call(t, 'POST', `/api/channels/${channelId}/ideas`, body)
    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: { code: 'validacion' } })
  })

  it('«Preparar la medida»: estimated first, the AI writes the three searches and the revision goes up', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const { idea } = newIdeaResultSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Cena con sobras', format: 'largo' })).body,
    )
    const without = await call(t, 'POST', `/api/channels/${channelId}/ideas/estimate`, { use: 'busquedas_idea' })
    expect(without.body).toMatchObject({ error: { fields: { ideaId: 'no_valido' } } })
    const estimate = estimateSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas/estimate`, { use: 'busquedas_idea', ideaId: idea.id }))
        .body,
    )
    expect(estimate.use).toBe('busquedas_idea')
    const done = await call(t, 'POST', `/api/ideas/${idea.id}/queries`, {
      estimateId: estimate.estimateId,
      revision: 1,
    })
    expect(ideaSchema.parse(done.body)).toMatchObject({
      query: 'cena rapida con sobras',
      broadQuery: 'cenas rapidas',
      queryEn: 'quick dinner with leftovers',
      revision: 2,
    })
    expect(t.usage.list().filter((row) => row.use === 'busquedas_idea')).toMatchObject([{ outcome: 'ok' }])
  })

  it('«Preparar la medida» on an old revision is a conflict, and nothing is spent', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const { idea } = newIdeaResultSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Cena', format: 'largo' })).body,
    )
    await call(t, 'PATCH', `/api/ideas/${idea.id}`, { revision: 1, title: 'Cena otra' })
    const estimate = estimateSchema.parse(
      (await call(t, 'POST', `/api/channels/${channelId}/ideas/estimate`, { use: 'busquedas_idea', ideaId: idea.id }))
        .body,
    )
    const stale = await call(t, 'POST', `/api/ideas/${idea.id}/queries`, {
      estimateId: estimate.estimateId,
      revision: 1,
    })
    expect(stale.status).toBe(409)
    expect(t.usage.list().filter((row) => row.use === 'busquedas_idea')).toEqual([])
  })
})

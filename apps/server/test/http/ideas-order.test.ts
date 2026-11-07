import { ideaBankSchema, ideaQueueResultSchema } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>

// US4: order, queue, states and the archive (specs/004-idea-bank/contracts/http-api.md).
async function bankWith(t: TestApp, titles: string[]) {
  const { channelId } = await finished(t)
  const created = titles.map((title) =>
    t.ideas.ideas.create({ channelId, origin: 'creador', title, format: 'largo', profileVersion: 1 }),
  )
  return { channelId, ids: created.map((idea) => idea.id) }
}
const bankOf = async (t: TestApp, channelId: string) =>
  ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
const move = async (t: TestApp, id: string, status: string) => {
  const revision = t.ideas.ideas.get(id)!.revision
  return call(t, 'PATCH', `/api/ideas/${id}`, { revision, status })
}

describe('the order of the bank and the queue (US4)', () => {
  it('reorders the bank with every idea named once, and keeps it after reading again', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, ids } = await bankWith(t, ['A', 'B', 'C'])
    const reversed = [...ids].reverse()
    const result = await call(t, 'PUT', `/api/channels/${channelId}/ideas/order`, { ids: reversed })
    expect(result.status).toBe(200)
    expect((result.body['ideas'] as { id: string }[]).map((idea) => idea.id)).toEqual(reversed)
    expect((await bankOf(t, channelId)).ideas.map((idea) => idea.id)).toEqual(reversed)
  })

  it.each([
    ['one missing', (ids: string[]) => ids.slice(1)],
    ['one extra', (ids: string[]) => [...ids, 'otra']],
    ['one repeated', (ids: string[]) => [ids[0]!, ...ids.slice(0, -1)]],
  ])('refuses an order with %s, and nothing moves', async (_, change) => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, ids } = await bankWith(t, ['A', 'B', 'C'])
    const result = await call(t, 'PUT', `/api/channels/${channelId}/ideas/order`, { ids: change(ids) })
    expect(result).toMatchObject({ status: 400, body: { error: { code: 'validacion', fields: { ids: 'no_valido' } } } })
    expect((await bankOf(t, channelId)).ideas.map((idea) => idea.id)).toEqual(ids)
  })

  it('choosing several puts them in a queue that can be reordered', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, ids } = await bankWith(t, ['A', 'B', 'C'])
    expect((await move(t, ids[2]!, 'elegida')).body).toMatchObject({ status: 'elegida', queuePosition: 1 })
    expect((await move(t, ids[0]!, 'elegida')).body).toMatchObject({ status: 'elegida', queuePosition: 2 })
    expect((await bankOf(t, channelId)).queue).toEqual([ids[2], ids[0]])
    const reordered = await call(t, 'PUT', `/api/channels/${channelId}/ideas/queue`, { ids: [ids[0], ids[2]] })
    expect(ideaQueueResultSchema.parse(reordered.body).queue).toEqual([ids[0], ids[2]])
    // The queue needs all the chosen ones.
    const short = await call(t, 'PUT', `/api/channels/${channelId}/ideas/queue`, { ids: [ids[0]] })
    expect(short).toMatchObject({ status: 400, body: { error: { fields: { ids: 'no_valido' } } } })
    // One out of the bank cannot go into the queue.
    const other = await call(t, 'PUT', `/api/channels/${channelId}/ideas/queue`, { ids: [ids[0], ids[1]] })
    expect(other.status).toBe(400)
  })

  it('leaving the queue renumbers it; done and archived leave it too', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, ids } = await bankWith(t, ['A', 'B', 'C'])
    for (const id of ids) await move(t, id, 'elegida')
    expect((await move(t, ids[0]!, 'banco')).body).toMatchObject({ status: 'banco', queuePosition: null })
    expect((await move(t, ids[1]!, 'hecha')).body).toMatchObject({ status: 'hecha', queuePosition: null })
    expect((await bankOf(t, channelId)).queue).toEqual([ids[2]])
    expect(t.ideas.ideas.get(ids[2]!)!.queuePosition).toBe(1)
  })

  it('archived ideas leave the bank and come back at its end', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, ids } = await bankWith(t, ['A', 'B', 'C'])
    await move(t, ids[0]!, 'archivada')
    expect((await bankOf(t, channelId)).ideas.map((idea) => idea.id)).toEqual([ids[1], ids[2]])
    const archived = await call(t, 'GET', `/api/channels/${channelId}/ideas/archived`)
    expect((archived.body as unknown as { id: string }[]).map((idea) => idea.id)).toEqual([ids[0]])
    // The order without the archived one is the whole bank.
    expect((await call(t, 'PUT', `/api/channels/${channelId}/ideas/order`, { ids: [ids[2], ids[1]] })).status).toBe(200)
    expect((await move(t, ids[0]!, 'banco')).body).toMatchObject({ status: 'banco' })
    expect((await bankOf(t, channelId)).ideas.map((idea) => idea.id)).toEqual([ids[2], ids[1], ids[0]])
  })

  it('refuses a move the states do not have', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { ids } = await bankWith(t, ['A'])
    await move(t, ids[0]!, 'hecha')
    for (const to of ['banco', 'elegida']) {
      expect(await move(t, ids[0]!, to)).toMatchObject({
        status: 400,
        body: { error: { fields: { status: 'no_valido' } } },
      })
    }
    await move(t, ids[0]!, 'archivada')
    expect((await move(t, ids[0]!, 'elegida')).status).toBe(400)
  })

  it('there is no way to delete an idea: it is archived', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { ids } = await bankWith(t, ['A'])
    expect((await call(t, 'DELETE', `/api/ideas/${ids[0]}`)).status).toBe(404)
    expect(t.ideas.ideas.get(ids[0]!)).not.toBeNull()
  })
})

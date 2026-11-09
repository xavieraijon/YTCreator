import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>
interface Draft {
  version: number
  content: { blocks: { id: string; text: string; visual: string }[]; claims: { id: string; status: string }[] }
}
interface Summary {
  version: number
  origin: string
  createdAt: string
  restoredFrom: number | null
}

const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/scripts/${id}`)).body
async function ask(t: TestApp, id: string, use: string) {
  const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use })
  await call(t, 'POST', `/api/scripts/${id}/generate`, { use, estimateId: estimate.body['estimateId'] })
  await vi.waitFor(async () => {
    expect(((await read(t, id))['job'] as { status: string }).status).not.toBe('en_curso')
  })
  return read(t, id)
}
const edit = async (t: TestApp, id: string, draft: Draft, text: string) => {
  const blocks = draft.content.blocks.map((block, index) => (index === 0 ? { ...block, text } : block))
  const saved = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
    baseVersion: draft.version,
    content: { ...draft.content, blocks },
  })
  return saved.body['draft'] as Draft
}
const list = async (t: TestApp, id: string, kind = 'guion') =>
  (await call(t, 'GET', `/api/scripts/${id}/versions?kind=${kind}`)).body as unknown as Summary[]

async function withVersions() {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { channelId } = await finished(t)
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Pan sin amasar', format: 'largo' })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  const outline = (await ask(t, id, 'escaleta'))['outline'] as { version: number }
  await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: outline.version })
  const first = (await ask(t, id, 'guion'))['draft'] as Draft
  const second = await edit(t, id, first, 'Segundo texto.')
  const third = await edit(t, id, second, 'Tercer texto.')
  return { t, id, first, second, third }
}

describe('the versions of a script', () => {
  it('lists them from the newest to the oldest, with date and origin', async () => {
    const { t, id } = await withVersions()
    const versions = await list(t, id)
    expect(versions.map((one) => [one.version, one.origin])).toEqual([
      [3, 'edicion'],
      [2, 'edicion'],
      [1, 'ia'],
    ])
    expect(Number.isNaN(Date.parse(versions[0]!.createdAt))).toBe(false)
  })

  it('reads one with what changes against the current one', async () => {
    const { t, id, first } = await withVersions()
    const read = await call(t, 'GET', `/api/scripts/${id}/versions/guion/2`)
    expect(read.status).toBe(200)
    expect((read.body['version'] as Summary).version).toBe(2)
    const changes = read.body['changes'] as { id: string; change: string; before: unknown; after: unknown }[]
    const changed = changes.find((one) => one.id === first.content.blocks[0]!.id)!
    expect(changed.change).toBe('cambiado')
    expect(changed.before).toEqual([expect.objectContaining({ field: 'text', value: 'Segundo texto.' })])
    expect(changed.after).toEqual([expect.objectContaining({ field: 'text', value: 'Tercer texto.' })])
    expect(changes.filter((one) => one.change === 'igual')).toHaveLength(first.content.blocks.length - 1)
  })

  it('restores as a new version and loses none (SC-007)', async () => {
    const { t, id, third } = await withVersions()
    const restored = await call(t, 'POST', `/api/scripts/${id}/versions/guion/2/restore`, {
      baseVersion: third.version,
    })
    expect(restored.status).toBe(200)
    const draft = restored.body['draft'] as Draft & { origin: string }
    expect(draft.version).toBe(4)
    expect(draft.content.blocks[0]!.text).toBe('Segundo texto.')
    const versions = await list(t, id)
    expect(versions.map((one) => one.version)).toEqual([4, 3, 2, 1])
    expect(versions[0]).toMatchObject({ origin: 'recuperada', restoredFrom: 2 })
    expect(t.scriptVersions.get(id, 'guion', 3)!.content.blocks[0]!.text).toBe('Tercer texto.')
  })

  it('takes an approved script back to draft', async () => {
    const { t, id, third } = await withVersions()
    const pending = third.content.claims.filter((one) => one.status === 'pendiente').length
    await call(t, 'POST', `/api/scripts/${id}/draft/approve`, { version: third.version, acknowledgedPending: pending })
    expect((await read(t, id))['status']).toBe('guion_aprobado')
    const restored = await call(t, 'POST', `/api/scripts/${id}/versions/guion/1/restore`, {
      baseVersion: third.version,
    })
    expect(restored.body['status']).toBe('guion_borrador')
  })

  it('does not restore during a job', async () => {
    const { t, id, third } = await withVersions()
    const channelId = (await read(t, id))['channelId'] as string
    t.scripts.setJob(id, t.jobsRepo.start({ journeyId: null, channelId, kind: 'ia' }).id, 'guion')
    const blocked = await call(t, 'POST', `/api/scripts/${id}/versions/guion/1/restore`, { baseVersion: third.version })
    expect(blocked.status).toBe(409)
    expect((blocked.body['error'] as { code: string }).code).toBe('en_curso')
  })

  it('restores the outline too, which stops being approved', async () => {
    const { t, id } = await withVersions()
    const outline = (await read(t, id))['outline'] as { version: number; content: { blocks: { title: string }[] } }
    const blocks = outline.content.blocks.map((block, index) =>
      index === 0 ? { ...block, title: 'Otro título' } : block,
    )
    const saved = await call(t, 'PUT', `/api/scripts/${id}/outline`, {
      baseVersion: outline.version,
      content: { blocks },
    })
    expect((saved.body['outline'] as { version: number }).version).toBe(outline.version + 1)
    const detail = await call(t, 'GET', `/api/scripts/${id}/versions/escaleta/${outline.version}`)
    expect(detail.body['orderChanged']).toBe(false)
    const restored = await call(t, 'POST', `/api/scripts/${id}/versions/escaleta/${outline.version}/restore`, {
      baseVersion: outline.version + 1,
    })
    const after = restored.body['outline'] as typeof outline
    expect(after.version).toBe(outline.version + 2)
    expect(after.content.blocks[0]!.title).toBe(outline.content.blocks[0]!.title)
    expect(restored.body['outlineApprovedVersion']).toBe(outline.version)
  })

  it('does not restore over a version it has not seen, nor what does not exist', async () => {
    const { t, id, second, third } = await withVersions()
    const stale = await call(t, 'POST', `/api/scripts/${id}/versions/guion/1/restore`, { baseVersion: second.version })
    expect(stale.status).toBe(409)
    const missing = await call(t, 'POST', `/api/scripts/${id}/versions/guion/9/restore`, { baseVersion: third.version })
    expect(missing.status).toBe(404)
  })

  it('does not create a version when asked to restore the current one', async () => {
    const { t, id, third } = await withVersions()
    await call(t, 'POST', `/api/scripts/${id}/versions/guion/3/restore`, { baseVersion: third.version })
    expect(await list(t, id)).toHaveLength(3)
  })

  it('rejects a kind or a number that are not one', async () => {
    const { t, id, third } = await withVersions()
    expect((await call(t, 'GET', `/api/scripts/${id}/versions?kind=otro`)).status).toBe(400)
    expect((await call(t, 'GET', `/api/scripts/${id}/versions/otro/1`)).status).toBe(400)
    expect((await call(t, 'GET', `/api/scripts/${id}/versions/guion/x`)).status).toBe(400)
    const body = { baseVersion: third.version }
    expect((await call(t, 'POST', `/api/scripts/${id}/versions/guion/x/restore`, body)).status).toBe(400)
  })

  it('lists the outline too, and spends nothing on any of this (FR-013)', async () => {
    const { t, id } = await withVersions()
    const before = t.usage.list().length
    expect((await list(t, id, 'escaleta')).map((one) => one.origin)).toEqual(['ia'])
    await call(t, 'GET', `/api/scripts/${id}/versions/guion/1`)
    await call(t, 'POST', `/api/scripts/${id}/versions/guion/1/restore`, { baseVersion: 3 })
    expect(t.usage.list().length).toBe(before)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>
interface Draft {
  version: number
  content: { blocks: { id: string; text: string; visual: string }[]; claims: { id: string; status: string }[] }
}
const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/scripts/${id}`)).body
async function waitJob(t: TestApp, id: string) {
  await vi.waitFor(async () => {
    expect(((await read(t, id))['job'] as { status: string }).status).not.toBe('en_curso')
  })
  return read(t, id)
}
async function ask(t: TestApp, id: string, use: string) {
  const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use })
  await call(t, 'POST', `/api/scripts/${id}/generate`, { use, estimateId: estimate.body['estimateId'] })
  return waitJob(t, id)
}
async function withDraft() {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { channelId } = await finished(t)
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Pan sin amasar', format: 'largo' })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  const outline = (await ask(t, id, 'escaleta'))['outline'] as { version: number }
  await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: outline.version })
  const draft = (await ask(t, id, 'guion'))['draft'] as Draft
  return {
    t,
    id,
    ideaId,
    channelId,
    draft,
    pending: draft.content.claims.filter((one) => one.status === 'pendiente').length,
  }
}
const approve = (t: TestApp, id: string, version: number, acknowledgedPending: number) =>
  call(t, 'POST', `/api/scripts/${id}/draft/approve`, { version, acknowledgedPending })

describe('reviewing and approving a script', () => {
  it('gives the rules of the review, without the AI', async () => {
    const { t, id } = await withDraft()
    const before = t.usage.list().length
    const { status, body } = await call(t, 'GET', `/api/scripts/${id}/review`)
    expect(status).toBe(200)
    expect(body['rules']).toMatchObject({ maxSentenceWords: 25 })
    expect(t.usage.list()).toHaveLength(before)
  })

  it('approves knowing how many were left, and keeps it', async () => {
    const { t, id, draft, pending } = await withDraft()
    expect(pending).toBeGreaterThan(0)
    const { status, body } = await approve(t, id, draft.version, pending)
    expect(status).toBe(200)
    expect(body).toMatchObject({
      status: 'guion_aprobado',
      draftApprovedVersion: draft.version,
      draftApprovedPending: pending,
    })
    expect(body['draftApprovedAt']).toEqual(expect.any(String))
  })

  it('refuses when what was acknowledged is not what is left', async () => {
    const { t, id, draft, pending } = await withDraft()
    const { status, body } = await approve(t, id, draft.version, pending + 1)
    expect(status).toBe(409)
    expect((body['error'] as { code: string }).code).toBe('conflicto')
  })

  it('approves with nothing pending', async () => {
    const { t, id, draft } = await withDraft()
    let version = draft.version
    for (const claim of draft.content.claims) {
      const done = await call(t, 'POST', `/api/scripts/${id}/claims/${claim.id}`, {
        baseVersion: version,
        action: 'confirmar',
      })
      version = (done.body['draft'] as Draft).version
    }
    expect((await approve(t, id, version, 0)).body).toMatchObject({ status: 'guion_aprobado', draftApprovedPending: 0 })
  })

  it('says so when the version moved', async () => {
    const { t, id, draft, pending } = await withDraft()
    const { status, body } = await approve(t, id, draft.version + 1, pending)
    expect(status).toBe(409)
    expect((body['error'] as { code: string }).code).toBe('version_cambiada')
  })

  it('refuses a block with nothing to say', async () => {
    const { t, id, draft, pending } = await withDraft()
    const blocks = draft.content.blocks.map((block, index) => (index === 1 ? { ...block, text: '' } : block))
    await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { ...draft.content, blocks },
    })
    expect((await approve(t, id, draft.version + 1, pending)).status).toBe(400)
  })

  it('goes back to draft when edited', async () => {
    const { t, id, draft, pending } = await withDraft()
    await approve(t, id, draft.version, pending)
    const blocks = draft.content.blocks.map((block, index) => (index === 0 ? { ...block, text: 'Otro texto.' } : block))
    const edited = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { ...draft.content, blocks },
    })
    expect(edited.body['status']).toBe('guion_borrador')
  })

  it('does not export as approved what went back to draft', async () => {
    const { t, id, draft, pending } = await withDraft()
    await approve(t, id, draft.version, pending)
    const blocks = draft.content.blocks.map((block, index) => (index === 0 ? { ...block, text: 'Otro texto.' } : block))
    await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { ...draft.content, blocks },
    })
    const md = await (await t.request('GET', `/api/scripts/${id}/export?format=md`)).text()
    expect(md).toContain('Estado: guion en borrador')
    expect(md).not.toContain('Aprobado el')
    const json = (await (await t.request('GET', `/api/scripts/${id}/export?format=json`)).json()) as {
      scripts: { approvedAt: unknown; approvedPending: unknown }[]
    }
    expect(json.scripts[0]).toMatchObject({ approvedAt: null, approvedPending: null })
  })

  it('keeps the script of an approved idea marked as done, and back in the bank', async () => {
    const { t, id, ideaId, draft, pending } = await withDraft()
    await approve(t, id, draft.version, pending)
    const revision = t.ideas.ideas.get(ideaId)!.revision
    expect((await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision, status: 'hecha' })).status).toBe(200)
    expect((await read(t, id))['status']).toBe('guion_aprobado')
    expect(
      (
        await call(t, 'PATCH', `/api/ideas/${ideaId}`, {
          revision: t.ideas.ideas.get(ideaId)!.revision,
          status: 'banco',
        })
      ).status,
    ).toBe(200)
    expect((await read(t, id))['status']).toBe('guion_aprobado')
  })

  it('leaves the state of the idea alone', async () => {
    const { t, id, ideaId, draft, pending } = await withDraft()
    await approve(t, id, draft.version, pending)
    expect(t.ideas.ideas.get(ideaId)!.status).toBe('elegida')
  })

  it('downloads the document and the data', async () => {
    const { t, id } = await withDraft()
    const md = await t.request('GET', `/api/scripts/${id}/export?format=md`)
    expect(md.status).toBe(200)
    expect(md.headers.get('content-type')).toContain('text/markdown')
    expect(md.headers.get('content-disposition')).toContain('guion-pan-sin-amasar.md')
    expect(await md.text()).toContain('## Guion')
    const json = await t.request('GET', `/api/scripts/${id}/export?format=json`)
    expect(((await json.json()) as { scripts: unknown[] }).scripts).toHaveLength(1)
    expect((await t.request('GET', `/api/scripts/${id}/export?format=pdf`)).status).toBe(400)
  })

  it('downloads all the scripts of the channel', async () => {
    const { t, channelId } = await withDraft()
    const all = await t.request('GET', `/api/channels/${channelId}/scripts/export?format=md`)
    expect(all.status).toBe(200)
    expect(await all.text()).toContain('# Pan sin amasar')
  })
})

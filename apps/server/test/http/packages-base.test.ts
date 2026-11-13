import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, openPackage, reopenScript, writtenScript } from './publish-flows.ts'

const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code

describe('the base of the publishing package (contracts/http-api.md)', () => {
  it('opens the package of an approved script once, with the format of the script', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, ideaId, draft } = await approvedScript(t)
    const made = await openPackage(t, scriptId)
    expect(made.status).toBe(201)
    expect(made.body).toMatchObject({
      scriptId,
      format: 'largo',
      status: 'sin_empezar',
      idea: { id: ideaId, title: 'Pan sin amasar' },
      script: { id: scriptId, status: 'guion_aprobado', approvedDraftVersion: draft.version },
      pieces: { titulos: null, descripcion: null, comentario: null },
      approvals: { cover: null, texts: null, package: null },
      job: null,
      studioDone: [],
      parentTitle: null,
    })
    const blocks = (made.body['script'] as { blocks: { id: string; seconds: number }[] }).blocks
    expect(blocks.map((block) => block.id)).toEqual(draft.content.blocks.map((block) => block.id))
    expect(blocks.every((block) => block.seconds >= 0)).toBe(true)

    const again = await openPackage(t, scriptId)
    expect(again.status).toBe(200)
    expect(again.body['id']).toBe(made.body['id'])
  })

  it('asks for an approved script, unless the package was already made', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const written = await writtenScript(t)
    const refused = await openPackage(t, written.scriptId)
    expect(refused.status).toBe(409)
    expect(code(refused.body)).toBe('sin_aprobar')

    const other = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, draft } = await approvedScript(other)
    const made = await openPackage(other, scriptId)
    expect((await reopenScript(other, scriptId, draft)).status).toBe(200)
    const kept = await openPackage(other, scriptId)
    expect(kept.status).toBe(200)
    expect(kept.body['id']).toBe(made.body['id'])
    expect(kept.body['warnings']).toContain('guion_sin_aprobar')
  })

  it('reads one package and lists those of the channel', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, channelId } = await approvedScript(t)
    const id = (await openPackage(t, scriptId)).body['id'] as string
    const one = await call(t, 'GET', `/api/packages/${id}`)
    expect(one.status).toBe(200)
    expect(one.body).toMatchObject({ id, status: 'sin_empezar' })
    expect(one.body['warnings']).not.toContain('guion_sin_aprobar')

    const list = await call(t, 'GET', `/api/channels/${channelId}/packages`)
    expect(list.status).toBe(200)
    expect(list.body).toEqual([
      { id, scriptId, title: 'Pan sin amasar', format: 'largo', status: 'sin_empezar', updatedAt: expect.any(String) },
    ])
  })

  it('each channel lists only its own packages', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, channelId } = await approvedScript(t)
    const id = (await openPackage(t, scriptId)).body['id'] as string
    const second = t.channels.create({ origin: 'nuevo' })
    const ids = async (channel: string) =>
      ((await call(t, 'GET', `/api/channels/${channel}/packages`)).body as unknown as { id: string }[]).map(
        (one) => one.id,
      )
    expect(await ids(channelId)).toEqual([id])
    expect(await ids(second.id)).toEqual([])
  })

  it('a version that no longer reads does not take the list down: it keeps the working title', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, channelId, draft } = await approvedScript(t)
    const id = (await openPackage(t, scriptId)).body['id'] as string
    t.packageVersions.add({
      packageId: id,
      kind: 'titulos',
      origin: 'edicion',
      content: {
        candidates: [{ id: 'a', text: 'El pan', why: '', blockId: null, origin: 'creador' }],
        main: 'a',
        alternatives: [],
      },
      draftVersion: draft.version,
    })
    const title = async () =>
      ((await call(t, 'GET', `/api/channels/${channelId}/packages`)).body as unknown as { title: string }[])[0]?.title
    expect(await title()).toBe('El pan')
    t.db.prepare(`UPDATE package_version SET content = '{"candidates":[]}'`).run()
    expect(await title()).toBe('Pan sin amasar')
  })

  it('gives what 004 measured with where it comes from, also after a later failure', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, ideaId } = await approvedScript(t)
    const measure = {
      ideaId,
      ideaRevision: 1,
      verdict: 'hueco' as const,
      reason: null,
      figures: null,
      similarVideos: [
        {
          videoId: 'v',
          title: 'Pan fácil',
          channelId: 'c',
          channelTitle: 'C',
          views: 10,
          publishedAt: null,
          durationSeconds: null,
        },
      ],
      opportunity: null,
      queries: { query: 'pan sin amasar', broadQuery: null, queryEn: null },
      failure: null,
      source: 'fake' as const,
      partial: false,
      thresholdsVersion: 1,
    }
    t.ideas.measures.add({ ...measure, status: 'medida' })
    t.ideas.measures.add({ ...measure, status: 'fallida', verdict: null, similarVideos: [], failure: 'bloqueado' })
    const { body } = await openPackage(t, scriptId)
    expect(body['measured']).toMatchObject({
      query: 'pan sin amasar',
      verdict: 'hueco',
      similarTitles: ['Pan fácil'],
      source: 'fake',
      partial: false,
    })
  })

  it('a missing channel, package or script is not found', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await approvedScript(t)
    expect((await call(t, 'GET', '/api/channels/otro/packages')).status).toBe(404)
    expect((await call(t, 'GET', '/api/packages/nada')).status).toBe(404)
    expect((await call(t, 'POST', '/api/scripts/nada/package')).status).toBe(404)
  })
})

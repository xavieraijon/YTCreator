import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>
interface Outline {
  version: number
  origin: string
  factsVersion: number | null
  instructions: string | null
  content: { blocks: { id: string; type: string; title: string; seconds: number }[] }
}

async function setUp(fakeAi = 'ok', format: 'largo' | 'short' = 'largo') {
  const t = makeTestApp({ fakeAi })
  const { channelId } = await finished(t)
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Una idea', format })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  return { t, id, ideaId, channelId }
}
const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/scripts/${id}`)).body
async function waitJob(t: TestApp, id: string) {
  await vi.waitFor(async () => {
    expect(((await read(t, id))['job'] as { status: string }).status).not.toBe('en_curso')
  })
  return read(t, id)
}
async function generate(t: TestApp, id: string, instructions?: string) {
  const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })
  const started = await call(t, 'POST', `/api/scripts/${id}/generate`, {
    use: 'escaleta',
    estimateId: estimate.body['estimateId'],
    ...(instructions ? { instructions } : {}),
  })
  expect(started.status).toBe(202)
  return waitJob(t, id)
}

describe('the outline with AI (contracts/http-api.md)', () => {
  it('says the cost first, and gets a version with blocks that have an id of ours', async () => {
    const { t, id } = await setUp()
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })
    expect(estimate.status).toBe(200)
    expect(estimate.body).toMatchObject({ use: 'escaleta', blockedBy: null })
    const view = await generate(t, id)
    const outline = view['outline'] as Outline
    expect(outline).toMatchObject({ version: 1, origin: 'ia', factsVersion: null })
    expect(outline.content.blocks.map((block) => block.type)).toEqual(['gancho', 'contexto', 'acto', 'acto', 'cierre'])
    expect(new Set(outline.content.blocks.map((block) => block.id)).size).toBe(5)
    expect(view['status']).toBe('escaleta_borrador')
    expect((view['job'] as { op: string }).op).toBe('escaleta')
  })

  it('writes the spending down and remembers what was asked', async () => {
    const { t, id } = await setUp()
    const view = await generate(t, id, 'Más corta')
    expect((view['outline'] as Outline).instructions).toBe('Más corta')
    expect(t.usage.list().some((row) => row.use === 'escaleta')).toBe(true)
  })

  it('does not take an estimate for something else, or one already spent', async () => {
    const { t, id } = await setUp()
    const refused = await call(t, 'POST', `/api/scripts/${id}/generate`, { use: 'escaleta', estimateId: 'nada' })
    expect(refused.status).toBe(400)
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })
    const body = { use: 'escaleta', estimateId: estimate.body['estimateId'] }
    await call(t, 'POST', `/api/scripts/${id}/generate`, body)
    await waitJob(t, id)
    expect((await call(t, 'POST', `/api/scripts/${id}/generate`, body)).status).toBe(400)
  })

  it('one job at a time', async () => {
    const { t, id, channelId } = await setUp()
    const job = t.jobsRepo.start({ journeyId: null, channelId, kind: 'ia' })
    t.scripts.setJob(id, job.id, 'escaleta')
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })
    const busy = await call(t, 'POST', `/api/scripts/${id}/generate`, {
      use: 'escaleta',
      estimateId: estimate.body['estimateId'],
    })
    expect(busy.status).toBe(409)
    expect(busy.body['error']).toMatchObject({ code: 'en_curso', jobId: job.id })
    const saved = await call(t, 'PUT', `/api/scripts/${id}/outline`, { baseVersion: 0, content: outlineOf() })
    expect(saved.status).toBe(409)
  })

  it.each(['sin_sesion', 'cupo_agotado', 'tiempo_agotado', 'contenido_filtrado', 'no_disponible'])(
    'keeps what there was when the AI fails with %s',
    async (failure) => {
      const { t, id } = await setUp()
      await generate(t, id)
      t.channel.aiRun.run = (async () => ({ ok: false, failure })) as never
      const after = await generate(t, id)
      expect(after['job']).toMatchObject({ status: 'fallido', failure })
      expect((after['outline'] as Outline).version).toBe(1)
    },
  )

  it('a Short has no outline', async () => {
    const { t, id } = await setUp('ok', 'short')
    expect((await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })).status).toBe(400)
    expect((await call(t, 'PUT', `/api/scripts/${id}/outline`, { baseVersion: 0, content: outlineOf() })).status).toBe(
      400,
    )
  })
})

const outlineOf = (title = 'Editado') => ({
  blocks: [{ id: 'b1', type: 'gancho', title, purpose: '', question: null, reward: null, bridge: null, seconds: 30 }],
})

describe('editing and approving the outline', () => {
  it('saves over the version it started from, or says it changed', async () => {
    const { t, id } = await setUp()
    const first = await call(t, 'PUT', `/api/scripts/${id}/outline`, { baseVersion: 0, content: outlineOf() })
    expect(first.status).toBe(200)
    expect(first.body['outline']).toMatchObject({ version: 1, origin: 'edicion' })
    const stale = await call(t, 'PUT', `/api/scripts/${id}/outline`, { baseVersion: 0, content: outlineOf('Otro') })
    expect(stale.status).toBe(409)
    expect((stale.body['error'] as { code: string }).code).toBe('version_cambiada')
    expect(((await read(t, id))['outline'] as Outline).content.blocks[0]?.title).toBe('Editado')
  })

  it('approves the latest, and an edit goes back to draft', async () => {
    const { t, id } = await setUp()
    await generate(t, id)
    const approved = await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: 1 })
    expect(approved.body).toMatchObject({ status: 'escaleta_aprobada', outlineApprovedVersion: 1 })
    expect((await read(t, id))['status']).toBe('escaleta_aprobada')
    const edited = await call(t, 'PUT', `/api/scripts/${id}/outline`, { baseVersion: 1, content: outlineOf() })
    expect(edited.body['status']).toBe('escaleta_borrador')
  })

  it('does not approve an old version, nothing, or a block without a title', async () => {
    const { t, id } = await setUp()
    expect((await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: 1 })).status).toBe(409)
    await call(t, 'PUT', `/api/scripts/${id}/outline`, { baseVersion: 0, content: outlineOf('') })
    const empty = await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: 1 })
    expect(empty.status).toBe(400)
    expect((empty.body['error'] as { fields: unknown }).fields).toEqual({ blocks: 'no_valido' })
    await call(t, 'PUT', `/api/scripts/${id}/outline`, { baseVersion: 1, content: outlineOf() })
    expect((await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: 1 })).status).toBe(409)
    expect((await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: 2 })).status).toBe(200)
  })
})

describe('the idea says if it has a script (data-model.md)', () => {
  it('in the bank', async () => {
    const { t, id, ideaId, channelId } = await setUp()
    const bank = await call(t, 'GET', `/api/channels/${channelId}/ideas`)
    const idea = (bank.body['ideas'] as { id: string; script: unknown }[]).find((one) => one.id === ideaId)
    expect(idea?.script).toEqual({ id, status: 'sin_empezar', fromVideo: false, packageStatus: null })
  })
})

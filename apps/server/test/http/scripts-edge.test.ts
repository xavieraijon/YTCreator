import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

// The edge cases of the spec (spec.md, «Edge Cases») that no other test of 005 goes through.
type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown>
interface Version {
  version: number
  origin: string
  content: { blocks: { id: string; text?: string }[]; claims?: unknown[] }
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
  expect(estimate.status).toBe(200)
  const started = await call(t, 'POST', `/api/scripts/${id}/generate`, { use, estimateId: estimate.body['estimateId'] })
  expect(started.status).toBe(202)
  return waitJob(t, id)
}
async function ideaWithScript(t: TestApp, channelId: string, title = 'Una idea') {
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title, format: 'largo' })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  return { ideaId, id }
}
async function setUp() {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { channelId } = await finished(t)
  return { t, channelId, ...(await ideaWithScript(t, channelId)) }
}
async function withDraft() {
  const set = await setUp()
  const outline = (await ask(set.t, set.id, 'escaleta'))['outline'] as Version
  await call(set.t, 'POST', `/api/scripts/${set.id}/outline/approve`, { version: outline.version })
  const draft = (await ask(set.t, set.id, 'guion'))['draft'] as Version
  return { ...set, outline, draft }
}
async function moveIdea(t: TestApp, ideaId: string, status: string) {
  const { revision } = (await call(t, 'GET', `/api/scripts/${await scriptOf(t, ideaId)}`)).body['idea'] as Body
  return call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision, status })
}
const scriptOf = async (t: TestApp, ideaId: string) => t.scripts.getByIdea(ideaId)!.id
const failWith = (t: TestApp, failure: string) => {
  t.channel.aiRun.run = (async () => ({ ok: false, failure })) as never
}

describe('the idea moves while it has a script', () => {
  it('an archived idea keeps its script, and gets it back when it is recovered', async () => {
    const { t, ideaId, id } = await withDraft()
    expect((await moveIdea(t, ideaId, 'archivada')).status).toBe(200)
    const archived = await read(t, id)
    expect(archived['idea']).toMatchObject({ status: 'archivada' })
    expect((archived['draft'] as Version).version).toBe(1)
    expect((await moveIdea(t, ideaId, 'banco')).status).toBe(200)
    expect((await moveIdea(t, ideaId, 'elegida')).status).toBe(200)
    const again = await call(t, 'POST', `/api/ideas/${ideaId}/script`)
    expect(again.status).toBe(200)
    expect(again.body['id']).toBe(id)
    expect(again.body).toMatchObject({ status: 'guion_borrador', draft: { version: 1 }, outline: { version: 1 } })
  })

  it.each(['quemado', 'competido'] as const)('a %s idea says so and does not stop the script', async (verdict) => {
    const { t, ideaId, id } = await setUp()
    const idea = t.ideas.ideas.get(ideaId)!
    t.ideas.measures.add({
      ideaId,
      ideaRevision: idea.revision,
      status: 'medida',
      verdict,
      reason: 'racha_reciente',
      figures: null,
      similarVideos: [],
      opportunity: null,
      queries: { query: null, broadQuery: null, queryEn: null },
      failure: null,
      source: 'ytdlp',
      partial: false,
      thresholdsVersion: 1,
    })
    expect((await read(t, id))['idea']).toMatchObject({ verdict, verdictAt: expect.any(String) })
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })
    expect(estimate.body).toMatchObject({ blockedBy: null })
    const view = await ask(t, id, 'escaleta')
    expect(view['job']).toMatchObject({ status: 'hecho' })
    expect((view['outline'] as Version).version).toBe(1)
  })
})

describe('what is asked of the AI', () => {
  it('very long notes are admitted up to their limit, and the price goes up with them', async () => {
    const { t, id } = await setUp()
    const short = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })
    const { updatedAt } = await read(t, id)
    const notes = 'Un apunte largo sobre el pan y su historia. '.repeat(450).slice(0, 20_000)
    expect((await call(t, 'PATCH', `/api/scripts/${id}`, { baseUpdatedAt: updatedAt, notes })).status).toBe(200)
    const long = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })
    expect(long.body['cents'] as number).toBeGreaterThan(short.body['cents'] as number)
    expect(long.body['maxCents'] as number).toBeGreaterThan(short.body['maxCents'] as number)
  })

  it('past the spending limit the price says so, and nothing is spent or written', async () => {
    const { t, id } = await setUp()
    await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 1, dailyCents: 1, monthlyCents: 1 })
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })
    expect(estimate.body['blockedBy']).not.toBeNull()
    const started = await call(t, 'POST', `/api/scripts/${id}/generate`, {
      use: 'escaleta',
      estimateId: estimate.body['estimateId'],
    })
    expect(started.status).toBe(202)
    const view = await waitJob(t, id)
    expect(view['job']).toMatchObject({ status: 'fallido', failure: 'limite_de_gasto' })
    expect(view['outline']).toBeNull()
    expect(t.usage.list().filter((row) => row.use === 'escaleta')).toMatchObject([
      { outcome: 'limite_de_gasto', costCents: 0 },
    ])
  })

  it.each(['sin_sesion', 'cupo_agotado', 'tiempo_agotado', 'respuesta_invalida', 'limite_de_gasto'])(
    'a script that fails with %s keeps the approved outline and the edited text',
    async (failure) => {
      const { t, id, draft } = await withDraft()
      const blocks = draft.content.blocks.map((block, index) => (index === 0 ? { ...block, text: 'Mío.' } : block))
      const edited = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
        baseVersion: draft.version,
        content: { ...draft.content, blocks },
      })
      expect(edited.status).toBe(200)
      failWith(t, failure)
      const view = await ask(t, id, 'guion')
      expect(view['job']).toMatchObject({ status: 'fallido', failure })
      expect(view['outlineApprovedVersion']).toBe(1)
      const kept = view['draft'] as Version
      expect(kept).toMatchObject({ version: 2, origin: 'edicion' })
      expect(kept.content.blocks[0]!.text).toBe('Mío.')
      expect(t.scriptVersions.list(id, 'guion')).toHaveLength(2)
    },
  )

  it('a block asked for again that fails leaves the script whole, never half written', async () => {
    const { t, id, draft } = await withDraft()
    failWith(t, 'tiempo_agotado')
    const blockId = draft.content.blocks[1]!.id
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'bloque_guion', blockId })
    expect(estimate.status).toBe(200)
    await call(t, 'POST', `/api/scripts/${id}/generate`, {
      use: 'bloque_guion',
      blockId,
      estimateId: estimate.body['estimateId'],
    })
    const view = await waitJob(t, id)
    expect(view['job']).toMatchObject({ status: 'fallido', failure: 'tiempo_agotado' })
    expect(view['draft']).toEqual(expect.objectContaining({ version: 1, content: draft.content }))
  })
})

describe('several channels', () => {
  it('each channel sees and downloads only its own scripts', async () => {
    const { t, channelId, id } = await setUp()
    // A second channel with the same profile: its scripts are not those of the first.
    const second = t.channels.create({ origin: 'nuevo' })
    const other = { channelId: second.id }
    const profile = t.channel.profiles.getCurrent(channelId)!
    t.channel.profiles.addVersion(second.id, { origin: 'manual', profile: profile.profile })
    const theirs = await ideaWithScript(t, other.channelId, 'La idea del otro canal')
    const list = async (channel: string) =>
      ((await call(t, 'GET', `/api/channels/${channel}/scripts`)).body as unknown as { id: string }[]).map(
        (one) => one.id,
      )
    expect(await list(channelId)).toEqual([id])
    expect(await list(other.channelId)).toEqual([theirs.id])
    expect((await read(t, theirs.id))['channelId']).toBe(other.channelId)

    const { updatedAt } = await read(t, id)
    await call(t, 'PATCH', `/api/scripts/${id}`, { baseUpdatedAt: updatedAt, notes: 'Apuntes del primero' })
    const mine = await t.request('GET', `/api/channels/${channelId}/scripts/export?format=json`)
    const exported = JSON.stringify(await mine.json())
    expect(exported).toContain('Apuntes del primero')
    expect(exported).not.toContain('La idea del otro canal')
  })
})

describe('the logs (T096)', () => {
  it('no line names a link: researching, the links of the creator, checking or failing', async () => {
    const { t, id, draft } = await withDraft()
    await ask(t, id, 'investigacion')
    const facts = (await read(t, id))['facts'] as { version: number; content: { facts: unknown[] } }
    const link = 'https://mi-fuente.example/receta-secreta'
    const mine = {
      id: 'mio',
      text: 'Un hecho mío.',
      label: 'del_creador',
      origin: 'creador',
      sources: [{ id: 's-mio', url: link, reference: null, title: 'Mi fuente', accessedAt: 'hoy', link: null }],
      alternatives: null,
    }
    const saved = await call(t, 'PUT', `/api/scripts/${id}/facts`, {
      baseVersion: facts.version,
      content: { facts: [...facts.content.facts, mine] },
    })
    expect(saved.status).toBe(200)
    await ask(t, id, 'comprobar_guion')
    // An unexpected error that names an address, inside the job.
    t.channel.aiRun.run = (async () => {
      throw new Error(`no se pudo leer ${link}`)
    }) as never
    expect(((await ask(t, id, 'guion'))['job'] as { failure: string }).failure).toBe('interno')

    expect(t.logger.lines.some((line) => line.includes('job.failed'))).toBe(true)
    expect(t.logger.lines.filter((line) => /https?:\/\/|\.example/i.test(line))).toEqual([])
    expect(draft.version).toBe(1)
  })
})

describe('the outline the script was written from (decision 51)', () => {
  it('says it changed only while its blocks are different', async () => {
    const { t, id, outline } = await withDraft()
    const blocks = outline.content.blocks.map((block, index) =>
      index === 0 ? { ...block, title: 'Otro título' } : block,
    )
    const saved = await call(t, 'PUT', `/api/scripts/${id}/outline`, {
      baseVersion: outline.version,
      content: { blocks },
    })
    expect(saved.body['warnings']).toContain('escaleta_cambiada')
    const restored = await call(t, 'POST', `/api/scripts/${id}/versions/escaleta/${outline.version}/restore`, {
      baseVersion: outline.version + 1,
    })
    expect((restored.body['outline'] as Version).version).toBe(outline.version + 2)
    expect(restored.body['warnings']).not.toContain('escaleta_cambiada')
  })
})

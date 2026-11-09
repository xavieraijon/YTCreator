import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>
type Draft = {
  version: number
  content: { blocks: { id: string; type: string; text: string }[]; claims: { status: string }[] }
}

async function waitJob(t: TestApp, id: string) {
  for (let i = 0; i < 200; i++) {
    const view = (await call(t, 'GET', `/api/scripts/${id}`)).body as { job: { status: string } | null }
    if (view.job && view.job.status !== 'en_curso') return view
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('timeout')
}

async function ask(t: TestApp, id: string, use: string, extra: Record<string, unknown> = {}) {
  const estimate = (await call(t, 'POST', `/api/scripts/${id}/estimate`, { use, ...extra })).body as {
    estimateId: string
  }
  expect(
    (await call(t, 'POST', `/api/scripts/${id}/generate`, { use, estimateId: estimate.estimateId, ...extra })).status,
  ).toBe(202)
  return (await waitJob(t, id)) as unknown as Record<string, unknown>
}

describe('the script of a Short', () => {
  let t: TestApp
  let id: string

  beforeEach(async () => {
    t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, {
      title: 'Pan en un minuto',
      format: 'short',
    })
    const ideaId = (made.body['idea'] as { id: string }).id
    await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
    id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  })

  it('starts at 45 seconds and is written with no outline', async () => {
    expect((await call(t, 'GET', `/api/scripts/${id}`)).body['targetSeconds']).toBe(45)
    const view = await ask(t, id, 'guion_short')
    const draft = view['draft'] as Draft
    expect(draft.content.blocks.map((block) => block.type)).toEqual(['gancho', 'desarrollo', 'cierre'])
    expect(view['outline']).toBeNull()
    expect(view['status']).toBe('guion_borrador')
    expect(draft.content.claims).toHaveLength(1)
  })

  it('does not take the uses of a long video, nor a long video this one', async () => {
    expect((await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'escaleta' })).status).toBe(400)
    expect((await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'guion' })).status).toBe(400)
    const channelId = (await call(t, 'GET', '/api/channels/current')).body['channel'] as { id: string }
    const made = await call(t, 'POST', `/api/channels/${channelId.id}/ideas`, { title: 'Pan largo', format: 'largo' })
    const ideaId = (made.body['idea'] as { id: string }).id
    await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
    const long = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
    expect((await call(t, 'POST', `/api/scripts/${long}/estimate`, { use: 'guion_short' })).status).toBe(400)
  })

  it('asks the AI for no more than the maximum of a Short', async () => {
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, id, 'guion_short')
    const { schema } = run.mock.calls[0]![0] as unknown as {
      schema: { safeParse: (value: unknown) => { success: boolean } }
    }
    const part = (type: string, text: string) => ({ type, text, visual: '' })
    const output = (words: number) => ({
      blocks: [part('gancho', 'Mira.'), part('desarrollo', 'palabra '.repeat(words)), part('cierre', 'Sigue.')],
      claims: [],
    })
    expect(schema.safeParse(output(100)).success).toBe(true)
    expect(schema.safeParse(output(900)).success).toBe(false)
  })

  it('asks for a part what the other two leave, even if it is empty', async () => {
    const first = (await ask(t, id, 'guion_short'))['draft'] as Draft
    const blocks = first.content.blocks.map((block, index) => (index === 1 ? { ...block, text: '' } : block))
    await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: first.version,
      content: { ...first.content, blocks },
    })
    const estimate = vi.spyOn(t.channel.aiRun, 'estimate')
    await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'bloque_guion', blockId: first.content.blocks[1]!.id })
    const { input } = estimate.mock.calls[0]![0] as unknown as { input: { targetSeconds: number } }
    expect(input.targetSeconds).toBeGreaterThan(30)
    expect(input.targetSeconds).toBeLessThanOrEqual(45)
  })

  it('does not change the format of an idea once it has a script', async () => {
    const script = (await call(t, 'GET', `/api/scripts/${id}`)).body as { ideaId: string }
    const revision = t.ideas.ideas.get(script.ideaId)!.revision
    const changed = await call(t, 'PATCH', `/api/ideas/${script.ideaId}`, { revision, format: 'largo' })
    expect(changed.status).toBe(400)
    expect((await call(t, 'PATCH', `/api/ideas/${script.ideaId}`, { revision, title: 'Otro título' })).status).toBe(200)
  })

  it('edits, rewrites a part and approves as a long video does', async () => {
    const first = (await ask(t, id, 'guion_short'))['draft'] as Draft
    const blocks = first.content.blocks.map((block, index) =>
      index === 2 ? { ...block, text: 'Otro cierre.' } : block,
    )
    const edited = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: first.version,
      content: { ...first.content, blocks },
    })
    expect(edited.status).toBe(200)
    const rewritten = (await ask(t, id, 'bloque_guion', { blockId: first.content.blocks[0]!.id }))['draft'] as Draft
    expect(rewritten.content.blocks[0]!.text).toContain('escrito de nuevo')
    expect(rewritten.content.blocks[2]!.text).toBe('Otro cierre.')
    const pending = rewritten.content.claims.filter((claim) => claim.status === 'pendiente').length
    const approved = await call(t, 'POST', `/api/scripts/${id}/draft/approve`, {
      version: rewritten.version,
      acknowledgedPending: pending,
    })
    expect(approved.body['status']).toBe('guion_aprobado')
  })

  it('keeps the three blocks when another script is asked for', async () => {
    const first = (await ask(t, id, 'guion_short'))['draft'] as Draft
    const second = (await ask(t, id, 'guion_short'))['draft'] as Draft
    expect(second.version).toBe(first.version + 1)
    expect(second.content.blocks.map((block) => block.id)).toEqual(first.content.blocks.map((block) => block.id))
  })
})

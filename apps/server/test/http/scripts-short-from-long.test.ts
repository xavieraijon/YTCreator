import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown>

const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/scripts/${id}`)).body

async function ask(t: TestApp, id: string, use: string) {
  const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use })
  const started = await call(t, 'POST', `/api/scripts/${id}/generate`, { use, estimateId: estimate.body['estimateId'] })
  expect(started.status).toBe(202)
  await vi.waitFor(async () => {
    expect(((await read(t, id))['job'] as { status: string }).status).not.toBe('en_curso')
  })
  return read(t, id)
}

async function written(fakeAi = 'ok') {
  const t = makeTestApp({ fakeAi })
  const { channelId } = await finished(t)
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Pan sin amasar', format: 'largo' })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  await ask(t, id, 'investigacion')
  const outline = (await ask(t, id, 'escaleta'))['outline'] as { version: number }
  await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: outline.version })
  const draft = (await ask(t, id, 'guion'))['draft'] as { version: number; content: { claims: { status: string }[] } }
  return { t, id, ideaId, draft }
}

const pendingOf = (draft: { content: { claims: { status: string }[] } }) =>
  draft.content.claims.filter((claim) => claim.status === 'pendiente').length

async function approved(fakeAi = 'ok') {
  const made = await written(fakeAi)
  await call(made.t, 'POST', `/api/scripts/${made.id}/draft/approve`, {
    version: made.draft.version,
    acknowledgedPending: pendingOf(made.draft),
  })
  return made
}

const choose = async (t: TestApp, id: string, index: number) =>
  call(t, 'POST', `/api/scripts/${id}/short-angles/${index}/choose`, {
    baseUpdatedAt: (await read(t, id))['updatedAt'],
  })

describe('a Short out of a long video', () => {
  it('needs the script approved', async () => {
    const { t, id } = await written()
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'enfoques_short' })
    expect(estimate.status).toBe(409)
    expect((estimate.body['error'] as { code: string }).code).toBe('sin_aprobar')
    expect(((await choose(t, id, 0)).body['error'] as { code: string }).code).toBe('sin_aprobar')
  })

  it('keeps the angles, already paid for', async () => {
    const { t, id } = await approved()
    const body = await ask(t, id, 'enfoques_short')
    expect(body['shortAngles']).toHaveLength(2)
    expect((await read(t, id))['shortAngles']).toEqual(body['shortAngles'])
  })

  it('creates the idea and its script without calling the AI, with the facts of the video', async () => {
    const { t, id, ideaId } = await approved()
    await ask(t, id, 'enfoques_short')
    const run = vi.spyOn(t.channel.aiRun, 'run')
    const before = t.usage.list().length

    const chosen = await choose(t, id, 0)
    expect(chosen.status).toBe(201)
    expect(run).not.toHaveBeenCalled()
    expect(t.usage.list()).toHaveLength(before)

    const short = (await read(t, chosen.body['scriptId'] as string)) as Body & {
      format: string
      status: string
      notes: string
      draft: unknown
      facts: { version: number; origin: string; content: { facts: unknown[] } }
      links: { parent: { id: string; title: string } | null }
      idea: { title: string; status: string }
    }
    expect(short).toMatchObject({ format: 'short', status: 'sin_empezar', draft: null })
    expect(short.notes).toBe('')
    expect(short.facts).toMatchObject({ version: 1, origin: 'heredada' })
    expect(short.facts.content).toEqual(((await read(t, id))['facts'] as { content: unknown }).content)
    expect(short.links.parent).toEqual({ id, title: 'Pan sin amasar', momentGone: false })
    expect(short.idea.status).toBe('banco')

    const idea = t.ideas.ideas.get(chosen.body['ideaId'] as string)!
    expect(idea).toMatchObject({ origin: 'otro_enfoque', sourceIdeaId: ideaId, format: 'short', status: 'banco' })
  })

  it('takes as many Shorts as wanted from the same video, and shows them', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const first = await choose(t, id, 0)
    const second = await choose(t, id, 1)
    expect(first.body['scriptId']).not.toBe(second.body['scriptId'])
    expect(((await read(t, id))['links'] as { shorts: unknown[] }).shorts).toHaveLength(2)
  })

  it('refuses an angle that does not exist', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    expect((await choose(t, id, 7)).status).toBe(404)
    expect((await call(t, 'POST', `/api/scripts/${id}/short-angles/uno/choose`, {})).status).toBe(400)
  })

  it('does not ask for angles of a Short', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const short = (await choose(t, id, 0)).body['scriptId'] as string
    expect((await call(t, 'POST', `/api/scripts/${short}/estimate`, { use: 'enfoques_short' })).status).toBe(400)
  })

  it('warns the Short when the approved long script says something else at its moment', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const short = (await choose(t, id, 0)).body['scriptId'] as string
    expect((await read(t, short))['warnings']).not.toContain('origen_cambiado')
    const draft = (await read(t, id))['draft'] as {
      version: number
      content: { blocks: { id: string; text: string; visual: string }[]; claims: { status: string }[] }
    }
    // A change still unapproved is not what the Short is drawn from.
    const blocks = draft.content.blocks.map((block, index) => (index === 0 ? { ...block, text: '' } : block))
    await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { blocks, claims: draft.content.claims },
    })
    expect((await read(t, short))['warnings']).not.toContain('origen_cambiado')
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, short, 'guion_short')
    expect((run.mock.calls[0]![0].input as { angle: { moment: string } }).angle.moment).toBe(
      draft.content.blocks[0]!.text,
    )
    run.mockRestore()
    await editAndApprove(t, id)
    expect((await read(t, short))['warnings']).toContain('origen_cambiado')
  })

  it('writes the Short from its moment, and marks what the AI brought over', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const short = (await choose(t, id, 0)).body['scriptId'] as string
    const run = vi.spyOn(t.channel.aiRun, 'run')
    const written = await ask(t, short, 'guion_short')
    const input = run.mock.calls[0]![0].input as { angle: { moment: string; hook: string } }
    const source = (await read(t, id))['draft'] as { content: { blocks: { text: string }[] } }
    expect(input.angle.moment).toBe(source.content.blocks[0]!.text)
    const { claims } = (written['draft'] as { content: { claims: { status: string }[] } }).content
    expect(claims.filter((claim) => claim.status === 'pendiente').length).toBeGreaterThan(0)
  })

  const editAndApprove = async (t: TestApp, id: string) => {
    const draft = (await read(t, id))['draft'] as {
      version: number
      content: { blocks: { id: string; text: string; visual: string }[]; claims: { status: string }[] }
    }
    const blocks = draft.content.blocks.map((block, index) => (index === 0 ? { ...block, text: 'Otro texto.' } : block))
    const saved = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { blocks, claims: draft.content.claims },
    })
    const next = saved.body['draft'] as typeof draft
    await call(t, 'POST', `/api/scripts/${id}/draft/approve`, {
      version: next.version,
      acknowledgedPending: pendingOf(next),
    })
  }

  it('stops offering an angle when the moment it came from changes', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    await editAndApprove(t, id)
    expect(((await read(t, id))['shortAngles'] as unknown[]).length).toBe(1)
  })

  it('adds the angles asked for again to those already paid for', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    expect((await ask(t, id, 'enfoques_short'))['shortAngles']).toHaveLength(4)
  })

  it('refuses a choice made on a list that has changed', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const stale = (await read(t, id))['updatedAt']
    await ask(t, id, 'enfoques_short')
    const chosen = await call(t, 'POST', `/api/scripts/${id}/short-angles/0/choose`, { baseUpdatedAt: stale })
    expect(chosen.status).toBe(409)
    expect((chosen.body['error'] as { code: string }).code).toBe('version_cambiada')
  })

  it('does not keep a figure the AI made up in an angle', async () => {
    const { t, id } = await approved('cifra_inventada')
    // The fake repeats the figure in the script, where it would count as backed.
    const draft = (await read(t, id))['draft'] as {
      version: number
      content: { blocks: { id: string; visual: string }[] }
    }
    const blocks = draft.content.blocks.map((block) => ({ ...block, text: 'Una frase cualquiera.' }))
    const saved = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { blocks, claims: [] },
    })
    const next = saved.body['draft'] as { version: number }
    await call(t, 'POST', `/api/scripts/${id}/draft/approve`, { version: next.version, acknowledgedPending: 0 })
    expect(JSON.stringify((await ask(t, id, 'enfoques_short'))['shortAngles'])).not.toContain('250.000')
  })

  it('takes one Short from each angle, and says which it became', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const base = (await read(t, id))['updatedAt']
    const first = await call(t, 'POST', `/api/scripts/${id}/short-angles/0/choose`, { baseUpdatedAt: base })
    expect(first.status).toBe(201)
    // A second tab with the same list.
    const twice = await call(t, 'POST', `/api/scripts/${id}/short-angles/0/choose`, { baseUpdatedAt: base })
    expect((twice.body['error'] as { code: string }).code).toBe('version_cambiada')
    // And with the list as it is now.
    expect((await choose(t, id, 0)).status).toBe(400)
    const angles = (await read(t, id))['shortAngles'] as { index: number; scriptId: string | null }[]
    expect(angles.map((angle) => [angle.index, angle.scriptId])).toEqual([
      [0, first.body['scriptId']],
      [1, null],
    ])
    expect(((await read(t, id))['links'] as { shorts: unknown[] }).shorts).toHaveLength(1)
  })

  it('loses no angle already paid for: one whose text comes back is offered again', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const original = ((await read(t, id))['draft'] as { content: { blocks: { text: string }[] } }).content.blocks[0]!
      .text
    await editAndApprove(t, id)
    expect((await ask(t, id, 'enfoques_short'))['shortAngles']).toHaveLength(3)
    // The first block says again what it said.
    const draft = (await read(t, id))['draft'] as {
      version: number
      content: { blocks: { id: string; text: string; visual: string }[]; claims: { status: string }[] }
    }
    const blocks = draft.content.blocks.map((block, index) => (index === 0 ? { ...block, text: original } : block))
    const saved = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { blocks, claims: draft.content.claims },
    })
    const next = saved.body['draft'] as typeof draft
    await call(t, 'POST', `/api/scripts/${id}/draft/approve`, {
      version: next.version,
      acknowledgedPending: pendingOf(next),
    })
    // The first one is back; the one drawn from the edited text is the one out of date now.
    const angles = (await read(t, id))['shortAngles'] as { index: number }[]
    expect(angles.map((angle) => angle.index)).toEqual([0, 1, 3])
  })

  it('tells the AI the angles already on the screen', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, id, 'enfoques_short')
    const input = run.mock.calls[0]![0].input as { alreadyOffered: { title: string; blockId: string }[] }
    expect(input.alreadyOffered).toHaveLength(2)
  })

  it('says when a figure was taken out of an angle', async () => {
    const { t, id } = await approved('cifra_inventada')
    const draft = (await read(t, id))['draft'] as { version: number; content: { blocks: { id: string }[] } }
    const blocks = (draft.content.blocks as { id: string; visual: string }[]).map((block) => ({
      ...block,
      text: 'Una frase cualquiera.',
    }))
    const saved = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { blocks, claims: [] },
    })
    await call(t, 'POST', `/api/scripts/${id}/draft/approve`, {
      version: (saved.body['draft'] as { version: number }).version,
      acknowledgedPending: 0,
    })
    const angles = (await ask(t, id, 'enfoques_short'))['shortAngles'] as { trimmed: boolean }[]
    expect(angles.some((angle) => angle.trimmed)).toBe(true)
  })

  it('does not warn the Short for a version of the long script that leaves its moment as it was', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const short = (await choose(t, id, 0)).body['scriptId'] as string
    const draft = (await read(t, id))['draft'] as { version: number; content: { claims: { id: string }[] } }
    const claim = draft.content.claims[0]!
    const done = await call(t, 'POST', `/api/scripts/${id}/claims/${claim.id}`, {
      baseVersion: draft.version,
      action: 'confirmar',
    })
    expect((done.body['draft'] as { version: number }).version).toBeGreaterThan(draft.version)
    expect((await read(t, short))['warnings']).not.toContain('origen_cambiado')
  })

  it('clears the warning once the Short is written from the moment as it is now', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const short = (await choose(t, id, 0)).body['scriptId'] as string
    await editAndApprove(t, id)
    expect((await read(t, short))['warnings']).toContain('origen_cambiado')
    const run = vi.spyOn(t.channel.aiRun, 'run')
    const written = await ask(t, short, 'guion_short')
    expect((run.mock.calls[0]![0].input as { angle: { moment: string } }).angle.moment).toBe('Otro texto.')
    expect(written['warnings']).not.toContain('origen_cambiado')
  })

  it('the bank says the idea is a Short of that video', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const { ideaId } = (await choose(t, id, 0)).body as { ideaId: string }
    const channelId = ((await read(t, id)) as { channelId: string }).channelId
    const bank = (await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body['ideas'] as {
      id: string
      script: { fromVideo: boolean } | null
    }[]
    expect(bank.find((one) => one.id === ideaId)?.script?.fromVideo).toBe(true)
  })

  it.each(['sin_sesion', 'cupo_agotado', 'tiempo_agotado', 'contenido_filtrado', 'no_disponible'])(
    'keeps the angles there were when the AI fails with %s',
    async (failure) => {
      const { t, id } = await approved()
      const before = (await ask(t, id, 'enfoques_short'))['shortAngles']
      t.channel.aiRun.run = (async () => ({ ok: false, failure })) as never
      const after = await ask(t, id, 'enfoques_short')
      expect(after['job']).toMatchObject({ status: 'fallido', failure })
      expect(after['shortAngles']).toEqual(before)
    },
  )

  it('does not offer to write the Short again from a moment that is gone', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const short = (await choose(t, id, 0)).body['scriptId'] as string
    expect(((await read(t, short))['links'] as { parent: { momentGone: boolean } }).parent.momentGone).toBe(false)
    // The long script written again from an outline without that block, and approved.
    const outline = (await read(t, id))['outline'] as { version: number; content: { blocks: unknown[] } }
    const saved = await call(t, 'PUT', `/api/scripts/${id}/outline`, {
      baseVersion: outline.version,
      content: { ...outline.content, blocks: outline.content.blocks.slice(1) },
    })
    expect(saved.status).toBe(200)
    await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: outline.version + 1 })
    const next = (await ask(t, id, 'guion'))['draft'] as { version: number; content: { claims: { status: string }[] } }
    await call(t, 'POST', `/api/scripts/${id}/draft/approve`, {
      version: next.version,
      acknowledgedPending: pendingOf(next),
    })
    const view = await read(t, short)
    expect(view['warnings']).toContain('origen_cambiado')
    expect((view['links'] as { parent: { momentGone: boolean } }).parent.momentGone).toBe(true)
  })

  it('keeps an angle it can no longer read, and the place of the others', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const kept = t.scripts.get(id)!.shortAngles as Record<string, unknown>[]
    t.scripts.setShortAngles(id, [{ ...kept[0], title: '' }, kept[1]])
    expect(((await read(t, id))['shortAngles'] as { index: number }[]).map((angle) => angle.index)).toEqual([1])
    await ask(t, id, 'enfoques_short')
    expect(t.scripts.get(id)!.shortAngles as unknown[]).toHaveLength(4)
    expect((t.scripts.get(id)!.shortAngles as { title: string }[])[0]!.title).toBe('')
  })

  it('the new Short idea can still be measured on request (regression of 004)', async () => {
    const { t, id } = await approved()
    await ask(t, id, 'enfoques_short')
    const { ideaId } = (await choose(t, id, 0)).body as { ideaId: string }
    const channelId = ((await read(t, id)) as { channelId: string }).channelId
    const edited = await call(t, 'PATCH', `/api/ideas/${ideaId}`, {
      revision: 1,
      query: 'masa madre error',
      broadQuery: 'masa madre',
    })
    expect(edited.status).toBe(200)
    const estimate = await call(t, 'POST', `/api/channels/${channelId}/idea-measures/estimate`, { ideaIds: [ideaId] })
    expect(estimate.body).toMatchObject({ ideas: 1, measurable: 1 })
    const { jobId } = (await call(t, 'POST', `/api/channels/${channelId}/idea-measures`, { ideaIds: [ideaId] }))
      .body as { jobId: string }
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
  })
})

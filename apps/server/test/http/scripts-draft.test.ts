import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

type TestApp = ReturnType<typeof makeTestApp>
interface Claim {
  id: string
  blockId: string
  text: string
  status: string
  check: unknown
}
interface Block {
  id: string
  type: string
  title: string
  text: string
  visual: string
}
interface Draft {
  version: number
  origin: string
  outlineVersion: number | null
  instructions: string | null
  content: { blocks: Block[]; claims: Claim[] }
}

const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/scripts/${id}`)).body
const draftOf = (view: Record<string, unknown>) => view['draft'] as Draft
async function waitJob(t: TestApp, id: string) {
  await vi.waitFor(async () => {
    expect(((await read(t, id))['job'] as { status: string }).status).not.toBe('en_curso')
  })
  return read(t, id)
}
async function ask(t: TestApp, id: string, use: string, extra: Record<string, unknown> = {}) {
  const { blockId } = extra as { blockId?: string }
  const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use, ...(blockId ? { blockId } : {}) })
  expect(estimate.status).toBe(200)
  const started = await call(t, 'POST', `/api/scripts/${id}/generate`, {
    use,
    estimateId: estimate.body['estimateId'],
    ...extra,
  })
  expect(started.status).toBe(202)
  return waitJob(t, id)
}
async function withOutline(fakeAi = 'ok') {
  const t = makeTestApp({ fakeAi })
  const { channelId } = await finished(t)
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title: 'Una idea', format: 'largo' })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const id = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  const view = await ask(t, id, 'escaleta')
  return { t, id, channelId, outline: view['outline'] as { version: number; content: { blocks: { id: string }[] } } }
}
async function withDraft() {
  const set = await withOutline()
  await call(set.t, 'POST', `/api/scripts/${set.id}/outline/approve`, { version: set.outline.version })
  const view = await ask(set.t, set.id, 'guion')
  return { ...set, draft: draftOf(view) }
}
const act = (t: TestApp, id: string, claimId: string, baseVersion: number, action: string, text?: string) =>
  call(t, 'POST', `/api/scripts/${id}/claims/${claimId}`, { baseVersion, action, ...(text ? { text } : {}) })

describe('writing the script (contracts/http-api.md)', () => {
  it('asks for the outline to be approved first, even for the price', async () => {
    const { t, id } = await withOutline()
    const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'guion' })
    expect(estimate.status).toBe(409)
    expect((estimate.body['error'] as { code: string }).code).toBe('sin_aprobar')
  })

  it('writes the blocks of the outline, with marks, and says which outline it was', async () => {
    const { id, t, outline, draft } = await withDraft()
    expect(draft).toMatchObject({ version: 1, origin: 'ia', outlineVersion: outline.version })
    expect(draft.content.blocks.map((block) => block.id)).toEqual(outline.content.blocks.map((block) => block.id))
    expect(draft.content.claims.some((claim) => claim.status === 'pendiente')).toBe(true)
    expect((await read(t, id))['status']).toBe('guion_borrador')
    expect(t.usage.list().some((row) => row.use === 'guion')).toBe(true)
  })

  it('prices a long video by what it has to say, not by the most it could', async () => {
    const { t, id, outline } = await withOutline()
    await call(t, 'POST', `/api/scripts/${id}/outline/approve`, { version: outline.version })
    const estimate = vi.spyOn(t.channel.aiRun, 'estimate')
    await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'guion' })
    const asked = estimate.mock.calls[0]![0].outputTokens!
    expect(asked).toBeGreaterThan(1000)
    expect(asked).toBeLessThan(22_000)
  })

  it('keeps the previous one in the history when another is asked for', async () => {
    const { t, id } = await withDraft()
    const view = await ask(t, id, 'guion', { instructions: 'Más directo' })
    expect(draftOf(view)).toMatchObject({ version: 2, origin: 'ia', instructions: 'Más directo' })
    expect(t.scriptVersions.get(id, 'guion', 1)).not.toBeNull()
  })

  it('does not spend on the block that does not exist', async () => {
    const { t, id } = await withDraft()
    expect(
      (await call(t, 'POST', `/api/scripts/${id}/estimate`, { use: 'bloque_guion', blockId: 'nope' })).status,
    ).toBe(404)
  })

  it('asking for a block again leaves the others identical, edits included (SC-004)', async () => {
    const { t, id, draft } = await withDraft()
    const edited = draft.content.blocks.map((block, index) =>
      index === 1 ? { ...block, text: 'Lo he escrito yo.' } : block,
    )
    const saved = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { ...draft.content, blocks: edited },
    })
    const before = draftOf(saved.body)
    const target = before.content.blocks[2]!
    const view = await ask(t, id, 'bloque_guion', { blockId: target.id, instructions: 'Más corto' })
    const after = draftOf(view)
    expect(after).toMatchObject({ version: 3, origin: 'bloque_ia', instructions: 'Más corto' })
    expect(after.content.blocks[2]!.text).not.toBe(target.text)
    after.content.blocks.forEach((block, index) => {
      if (index !== 2) expect(JSON.stringify(block)).toBe(JSON.stringify(before.content.blocks[index]))
    })
    // The figure it brings gets its mark; the marks of the other blocks stay.
    expect(after.content.claims.some((claim) => claim.blockId === target.id && claim.text === 'dos millones')).toBe(
      true,
    )
    expect(after.content.claims.filter((claim) => claim.blockId !== target.id)).toEqual(
      before.content.claims.filter((claim) => claim.blockId !== target.id),
    )
  })

  it('a new version never drops the outline it came from', async () => {
    const { t, id, draft, outline } = await withDraft()
    const saved = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: draft.content,
    })
    expect(draftOf(saved.body).outlineVersion).toBe(outline.version)
  })
})

describe('editing the script by hand', () => {
  it('creates a version, without marking what the creator wrote', async () => {
    const { t, id, draft } = await withDraft()
    const blocks = draft.content.blocks.map((block, index) =>
      index === 1 ? { ...block, text: 'En 1998 lo vi yo mismo.' } : block,
    )
    const { status, body } = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: draft.version,
      content: { ...draft.content, blocks },
    })
    expect(status).toBe(200)
    expect(draftOf(body)).toMatchObject({ version: 2, origin: 'edicion' })
    expect(draftOf(body).content.claims.some((claim) => claim.text === '1998')).toBe(false)
  })

  it('takes away the mark whose words are gone', async () => {
    const { t, id, draft } = await withDraft()
    const claim = draft.content.claims[0]!
    const blocks = draft.content.blocks.map((block) =>
      block.id === claim.blockId ? { ...block, text: 'Otra cosa.' } : block,
    )
    const { body } = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: 1,
      content: { ...draft.content, blocks },
    })
    expect(draftOf(body).content.claims.find((one) => one.id === claim.id)!.status).toBe('quitada')
  })

  it('does not let the page decide the marks or the blocks', async () => {
    const { t, id, draft } = await withDraft()
    const forged = draft.content.claims.map((claim) => ({ ...claim, status: 'confirmada' }))
    const { body } = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: 1,
      content: { ...draft.content, claims: forged },
    })
    expect(draftOf(body).content.claims.every((claim) => claim.status === 'pendiente')).toBe(true)
    const fewer = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: 1,
      content: { blocks: draft.content.blocks.slice(1), claims: [] },
    })
    expect(fewer.status).toBe(400)
  })

  it('says so when another tab saved first', async () => {
    const { t, id, draft } = await withDraft()
    const blocks = draft.content.blocks.map((block, index) => (index === 0 ? { ...block, text: 'Primero yo.' } : block))
    await call(t, 'PUT', `/api/scripts/${id}/draft`, { baseVersion: 1, content: { ...draft.content, blocks } })
    const late = await call(t, 'PUT', `/api/scripts/${id}/draft`, { baseVersion: 1, content: draft.content })
    expect(late.status).toBe(409)
    expect((late.body['error'] as { code: string }).code).toBe('version_cambiada')
  })
})

describe('what the script remembers', () => {
  it('saving what was already there is not a version', async () => {
    const { t, id, draft } = await withDraft()
    const { body } = await call(t, 'PUT', `/api/scripts/${id}/draft`, { baseVersion: 1, content: draft.content })
    expect(draftOf(body).version).toBe(1)
  })

  it('touching a comma does not hide that the idea changed', async () => {
    const { t, id, draft } = await withDraft()
    const view = await read(t, id)
    const { revision } = view['idea'] as { revision: number }
    await call(t, 'PATCH', `/api/ideas/${view['ideaId'] as string}`, { revision, title: 'Otra idea' })
    expect((await read(t, id))['warnings']).toContain('idea_cambiada')
    const blocks = draft.content.blocks.map((block, index) =>
      index === 0 ? { ...block, text: 'Con una coma, nueva.' } : block,
    )
    const { body } = await call(t, 'PUT', `/api/scripts/${id}/draft`, {
      baseVersion: 1,
      content: { ...draft.content, blocks },
    })
    expect(body['warnings']).toContain('idea_cambiada')
  })

  it('a block asked for again goes with the outline the script was written from', async () => {
    const { t, id, draft } = await withDraft()
    const view = await read(t, id)
    const outline = view['outline'] as { version: number; content: { blocks: { id: string; purpose: string }[] } }
    const target = draft.content.blocks[2]!
    const blocks = outline.content.blocks.map((block) =>
      block.id === target.id ? { ...block, purpose: 'Sin aprobar' } : block,
    )
    await call(t, 'PUT', `/api/scripts/${id}/outline`, { baseVersion: outline.version, content: { blocks } })
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, id, 'bloque_guion', { blockId: target.id })
    const input = run.mock.calls[0]![0].input as { block: { purpose: string } }
    expect(input.block.purpose).toBe(outline.content.blocks[2]!.purpose)
  })

  it('the next script uses the new voice, and the one written stays', async () => {
    const { t, id, channelId, draft } = await withDraft()
    await call(t, 'PUT', `/api/channels/${channelId}/script-settings`, {
      address: 'usted',
      register: 'sobrio',
      sample: '',
      wordsPerMinute: 130,
    })
    expect(draftOf(await read(t, id)).content).toEqual(draft.content)
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, id, 'guion')
    expect((run.mock.calls[0]![0].input as { voice: unknown }).voice).toEqual({
      address: 'usted',
      register: 'sobrio',
      sample: '',
    })
    expect(t.scriptVersions.get(id, 'guion', 1)!.content).toEqual(draft.content)
  })
})

describe('what is done with a mark', () => {
  // Two marks to play with: an edit of the AI's output is not marked, so the second comes from a regenerated block.
  async function twoMarks() {
    const set = await withDraft()
    const other = set.draft.content.blocks[2]!
    const view = await ask(set.t, set.id, 'bloque_guion', { blockId: other.id })
    return { ...set, draft: draftOf(view) }
  }
  const pending = (draft: Draft) => draft.content.claims.filter((claim) => claim.status === 'pendiente')

  it('«Es correcto» and «No es un dato» in a row are one line of the history', async () => {
    const { t, id, draft } = await twoMarks()
    const [first, second] = pending(draft)
    const one = await act(t, id, first!.id, draft.version, 'confirmar')
    expect(draftOf(one.body)).toMatchObject({ version: draft.version + 1, origin: 'marcas' })
    const two = await act(t, id, second!.id, draft.version + 1, 'no_es_dato')
    expect(draftOf(two.body)).toMatchObject({ version: draft.version + 1, origin: 'marcas' })
    const statuses = draftOf(two.body).content.claims.map((claim) => claim.status)
    expect(statuses).toContain('confirmada')
    expect(statuses).toContain('sin_marca')
  })

  it('correcting changes the text in a version of its own', async () => {
    const { t, id, draft } = await twoMarks()
    const claim = pending(draft)[0]!
    const { body } = await act(t, id, claim.id, draft.version, 'corregir', 'Parte primera')
    const after = draftOf(body)
    expect(after).toMatchObject({ version: draft.version + 1, origin: 'edicion' })
    const block = after.content.blocks.find((one) => one.id === claim.blockId)!
    expect(block.text).toContain('Parte primera')
    expect(block.text).not.toContain(claim.text)
    expect(after.content.claims.find((one) => one.id === claim.id)).toMatchObject({
      status: 'corregida',
      text: 'Parte primera',
    })
  })

  it('correcting needs the new words', async () => {
    const { t, id, draft } = await twoMarks()
    expect((await act(t, id, pending(draft)[0]!.id, draft.version, 'corregir')).status).toBe(400)
  })

  it('taking it out removes that fragment and leaves the rest', async () => {
    const { t, id, draft } = await twoMarks()
    const claim = pending(draft).find((one) => one.text === 'dos millones')!
    const { body } = await act(t, id, claim.id, draft.version, 'quitar_del_guion')
    const after = draftOf(body)
    expect(after).toMatchObject({ origin: 'edicion' })
    expect(after.content.blocks.find((one) => one.id === claim.blockId)!.text).toBe(
      'Este bloque está escrito de nuevo. Lo agradecen de personas.',
    )
    expect(after.content.claims.find((one) => one.id === claim.id)!.status).toBe('quitada')
    expect(t.scriptVersions.get(id, 'guion', draft.version)!.content.blocks).toEqual(draft.content.blocks)
  })

  it('accepting a proposal puts it in the text, in a version of its own', async () => {
    const { t, id, draft } = await twoMarks()
    const claim = pending(draft)[0]!
    const check = {
      verdict: 'matizar',
      sources: [],
      proposal: 'Una frase mejor',
      checkedAt: '2026-11-09T10:00:00.000Z',
    }
    const checked = t.scriptVersions.add({
      scriptId: id,
      kind: 'guion',
      origin: 'comprobacion',
      ideaRevision: 1,
      profileVersion: 1,
      content: {
        ...draft.content,
        claims: draft.content.claims.map((one) => (one.id === claim.id ? { ...one, check } : one)),
      } as never,
    })
    const { body } = await act(t, id, claim.id, checked.version, 'aceptar_propuesta')
    const after = draftOf(body)
    expect(after).toMatchObject({ version: checked.version + 1, origin: 'edicion' })
    expect(after.content.blocks.find((one) => one.id === claim.blockId)!.text).toContain('Una frase mejor')
    expect(after.content.claims.find((one) => one.id === claim.id)).toMatchObject({ status: 'corregida' })
  })

  it('a mark already dealt with admits nothing else', async () => {
    const { t, id, draft } = await twoMarks()
    const claim = pending(draft)[0]!
    await act(t, id, claim.id, draft.version, 'confirmar')
    expect((await act(t, id, claim.id, draft.version + 1, 'no_es_dato')).status).toBe(409)
  })

  it('accepting a proposal needs one', async () => {
    const { t, id, draft } = await twoMarks()
    expect((await act(t, id, pending(draft)[0]!.id, draft.version, 'aceptar_propuesta')).status).toBe(400)
  })

  it('a text-changing action is not folded into a marks version', async () => {
    const { t, id, draft } = await twoMarks()
    const [first, second] = pending(draft)
    await act(t, id, first!.id, draft.version, 'confirmar')
    const { body } = await act(t, id, second!.id, draft.version + 1, 'corregir', 'cambiado')
    expect(draftOf(body)).toMatchObject({ version: draft.version + 2, origin: 'edicion' })
    expect(t.scriptVersions.get(id, 'guion', draft.version + 1)!.origin).toBe('marcas')
  })

  it('answers 404 for a mark that is not there', async () => {
    const { t, id, draft } = await withDraft()
    expect((await act(t, id, 'nope', draft.version, 'confirmar')).status).toBe(404)
  })

  it('nothing changes under a running job', async () => {
    const { t, id, draft } = await withDraft()
    const channelId = (await read(t, id))['channelId'] as string
    t.scripts.setJob(id, t.jobsRepo.start({ journeyId: null, channelId, kind: 'ia' }).id, 'guion')
    const blocked = await call(t, 'PUT', `/api/scripts/${id}/draft`, { baseVersion: 1, content: draft.content })
    expect(blocked.status).toBe(409)
    expect((blocked.body['error'] as { code: string }).code).toBe('en_curso')
  })
})

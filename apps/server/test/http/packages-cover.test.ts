import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, openPackage, type TestApp } from './publish-flows.ts'

interface Candidate {
  id: string
  text: string
  why: string
  blockId: string | null
  origin: string
}
interface Piece<C> {
  version: number
  origin: string
  mainTitle: string | null
  instructions: string | null
  content: C
}
interface Titles {
  candidates: Candidate[]
  main: string | null
  alternatives: string[]
}
interface Concept {
  id: string
  scene: string
  titleId: string | null
  origin: string
}
interface Thumbnails {
  concepts: Concept[]
  chosen: string[]
}
type View = Record<string, unknown> & {
  status: string
  warnings: string[]
  job: { status: string; failure: string | null } | null
  pieces: { titulos: Piece<Titles> | null; miniaturas: Piece<Thumbnails> | null }
}

const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code
const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/packages/${id}`)).body as View

async function waitJob(t: TestApp, id: string) {
  await vi.waitFor(async () => expect((await read(t, id)).job?.status).not.toBe('en_curso'))
  return read(t, id)
}

async function ask(t: TestApp, id: string, use: string, instructions?: string) {
  const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use })
  expect(estimate.status).toBe(200)
  const started = await call(t, 'POST', `/api/packages/${id}/generate`, {
    use,
    estimateId: estimate.body['estimateId'],
    ...(instructions ? { instructions } : {}),
  })
  expect(started.status).toBe(202)
  expect(started.body['jobId']).toEqual(expect.any(String))
  return waitJob(t, id)
}

const save = (t: TestApp, id: string, kind: string, baseVersion: number, content: unknown) =>
  call(t, 'PUT', `/api/packages/${id}/pieces/${kind}`, { baseVersion, content })

async function withPackage(fakeAi = 'ok') {
  const t = makeTestApp({ fakeAi })
  const { scriptId, draft } = await approvedScript(t)
  const id = (await openPackage(t, scriptId)).body['id'] as string
  return { t, id, draft }
}

// Titles proposed, with a main one and two alternatives chosen.
async function withTitles() {
  const made = await withPackage()
  const { t, id } = made
  const titles = (await ask(t, id, 'titulos')).pieces.titulos!
  const [main, one, two] = titles.content.candidates
  const chosen = await save(t, id, 'titulos', titles.version, {
    ...titles.content,
    main: main!.id,
    alternatives: [one!.id, two!.id],
  })
  expect(chosen.status).toBe(200)
  return { ...made, main: main!, view: chosen.body as View }
}

describe('titles (US1, contracts/http-api.md)', () => {
  it('proposes titles, each with its reason and its block of the script, without asking YouTube', async () => {
    const { t, id, draft } = await withPackage()
    const view = await ask(t, id, 'titulos')
    const titles = view.pieces.titulos!
    expect(titles).toMatchObject({ version: 1, origin: 'ia', mainTitle: null })
    expect(titles.content.candidates).toHaveLength(5)
    const blockIds = draft.content.blocks.map((block) => block.id)
    for (const candidate of titles.content.candidates) {
      expect(candidate).toMatchObject({ id: expect.any(String), origin: 'ia' })
      expect(candidate.why).not.toBe('')
      expect(blockIds).toContain(candidate.blockId)
    }
    expect(view.status).toBe('portada_borrador')
    expect(t.ytQuota.used()).toBe(0)
  })

  it('asking again keeps the chosen ones and those of the creator, and says what was asked', async () => {
    const { t, id, view, main } = await withTitles()
    const titles = view.pieces.titulos!
    const mine = { id: 'mio', text: 'Mi título', why: '', blockId: null, origin: 'creador' }
    const written = await save(t, id, 'titulos', titles.version, {
      ...titles.content,
      candidates: [...titles.content.candidates, mine],
    })
    expect(written.status).toBe(200)
    const again = await ask(t, id, 'titulos', 'más cortos')
    const next = again.pieces.titulos!
    expect(next.instructions).toBe('más cortos')
    expect(next.content.main).toBe(main.id)
    const ids = next.content.candidates.map((candidate) => candidate.id)
    expect(ids).toEqual(expect.arrayContaining([main.id, ...titles.content.alternatives, 'mio']))
    expect(next.content.candidates.length).toBeLessThanOrEqual(12)
  })

  it('a title the creator writes has no block and is marked as theirs, whatever the page says', async () => {
    const { t, id } = await withPackage()
    const forged = { id: 'mio', text: 'Mi título', why: 'Lo dice la IA', blockId: 'b', origin: 'ia' }
    const { status, body } = await save(t, id, 'titulos', 0, { candidates: [forged], main: 'mio', alternatives: [] })
    expect(status).toBe(200)
    expect((body as View).pieces.titulos!.content.candidates[0]).toEqual({
      id: 'mio',
      text: 'Mi título',
      why: '',
      blockId: null,
      origin: 'creador',
    })
  })

  it('a title the creator rewrites is theirs; one left as it was keeps what the AI said', async () => {
    const { t, id, view } = await withTitles()
    const titles = view.pieces.titulos!
    const [first, second] = titles.content.candidates
    const { body } = await save(t, id, 'titulos', titles.version, {
      ...titles.content,
      candidates: titles.content.candidates.map((one) =>
        one.id === second!.id ? { ...one, text: 'Lo digo yo' } : one,
      ),
    })
    const after = (body as View).pieces.titulos!.content.candidates
    expect(after.find((one) => one.id === first!.id)).toEqual(first)
    expect(after.find((one) => one.id === second!.id)).toEqual({
      id: second!.id,
      text: 'Lo digo yo',
      why: '',
      blockId: null,
      origin: 'creador',
    })
  })

  it('asking again keeps a title the creator rewrote even if it is not chosen', async () => {
    const { t, id, view } = await withTitles()
    const titles = view.pieces.titulos!
    const loose = titles.content.candidates[4]!
    await save(t, id, 'titulos', titles.version, {
      ...titles.content,
      candidates: titles.content.candidates.map((one) => (one.id === loose.id ? { ...one, text: 'Reescrito' } : one)),
    })
    const again = await ask(t, id, 'titulos')
    expect(again.pieces.titulos!.content.candidates).toContainEqual(
      expect.objectContaining({ id: loose.id, text: 'Reescrito' }),
    )
  })

  it('with no room for new titles it says so before anything is paid', async () => {
    const { t, id } = await withPackage()
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      id: `mio-${index}`,
      text: `Mi título ${index}`,
      why: '',
      blockId: null,
      origin: 'creador',
    }))
    expect((await save(t, id, 'titulos', 0, { candidates, main: 'mio-0', alternatives: [] })).status).toBe(200)
    const { status, body } = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'titulos' })
    expect(status).toBe(400)
    expect((body['error'] as { fields: Record<string, string> }).fields).toEqual({ titulos: 'lleno' })
  })

  it('a reason with a figure of its own does not get through (principle V)', async () => {
    const t = makeTestApp({ fakeAi: 'cifra_inventada' })
    const { scriptId, draft } = await approvedScript(t)
    // The fake repeats the figure in the script, where it would count as backed: a script without it.
    const blocks = draft.content.blocks.map((block) => ({ ...block, text: 'Una frase cualquiera.' }))
    const saved = await call(t, 'PUT', `/api/scripts/${scriptId}/draft`, {
      baseVersion: draft.version,
      content: { blocks, claims: [] },
    })
    const next = saved.body['draft'] as { version: number }
    await call(t, 'POST', `/api/scripts/${scriptId}/draft/approve`, { version: next.version, acknowledgedPending: 0 })
    const id = (await openPackage(t, scriptId)).body['id'] as string
    const view = await ask(t, id, 'titulos')
    expect(view.job?.status).toBe('hecho')
    expect(JSON.stringify(view.pieces.titulos)).not.toContain('250.000')
  })

  it('a title made only of spaces is refused', async () => {
    const { t, id } = await withPackage()
    const blank = { id: 'mio', text: '   ', why: '', blockId: null, origin: 'creador' }
    expect((await save(t, id, 'titulos', 0, { candidates: [blank], main: 'mio', alternatives: [] })).status).toBe(400)
  })

  it('an edit made from an old version is refused', async () => {
    const { t, id } = await withPackage()
    await ask(t, id, 'titulos')
    const { status, body } = await save(t, id, 'titulos', 0, { candidates: [], main: null, alternatives: [] })
    expect(status).toBe(409)
    expect(code(body)).toBe('version_cambiada')
  })

  it('a kind that is not of this format or not editable yet is refused', async () => {
    const { t, id } = await withPackage()
    expect((await save(t, id, 'portada_short', 0, { blockId: null, moment: '', screenText: '' })).status).toBe(400)
    expect((await save(t, id, 'otra', 0, {})).status).toBe(400)
  })
})

describe('thumbnails (US1)', () => {
  it('need a main title first', async () => {
    const { t, id } = await withPackage()
    const { status, body } = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'miniaturas' })
    expect(status).toBe(409)
    expect(code(body)).toBe('sin_aprobar')
  })

  it('three ideas, each for a title that is there, made for the main title', async () => {
    const { t, id, view, main } = await withTitles()
    const titles = view.pieces.titulos!.content
    const after = await ask(t, id, 'miniaturas')
    const thumbnails = after.pieces.miniaturas!
    expect(thumbnails).toMatchObject({ origin: 'ia', mainTitle: main.text })
    expect(thumbnails.content.concepts).toHaveLength(3)
    const allowed = [titles.main, ...titles.alternatives]
    for (const concept of thumbnails.content.concepts) expect(allowed).toContain(concept.titleId)
  })

  it('asking again keeps the chosen ideas and those the creator edited, even past the limit', async () => {
    const { t, id } = await withTitles()
    const first = (await ask(t, id, 'miniaturas')).pieces.miniaturas!
    const [one, two] = first.content.concepts
    const edited = await save(t, id, 'miniaturas', first.version, {
      concepts: first.content.concepts.map((concept) =>
        concept.id === two!.id ? { ...concept, scene: 'La mía' } : concept,
      ),
      chosen: [one!.id],
    })
    const afterEdit = (edited.body as View).pieces.miniaturas!.content.concepts
    expect(afterEdit.find((concept) => concept.id === two!.id)).toMatchObject({ origin: 'creador' })
    expect(afterEdit.find((concept) => concept.id === one!.id)).toMatchObject({ origin: 'ia' })
    const again = (await ask(t, id, 'miniaturas')).pieces.miniaturas!
    const ids = again.content.concepts.map((concept) => concept.id)
    expect(ids).toEqual(expect.arrayContaining([one!.id, two!.id]))
    expect(again.content.chosen).toEqual([one!.id])

    // Three of their own, the chosen one first: with the three new ones nothing of theirs is trimmed.
    const theirs = Array.from({ length: 3 }, (_, index) => ({
      id: `mia-${index}`,
      scene: `Escena ${index}`,
      bigText: '',
      emotion: '',
      composition: '',
      colors: '',
      titleId: null,
      origin: 'creador',
    }))
    await save(t, id, 'miniaturas', again.version, { concepts: theirs, chosen: ['mia-0'] })
    const trimmed = (await ask(t, id, 'miniaturas')).pieces.miniaturas!
    expect(trimmed.content.concepts).toHaveLength(6)
    expect(trimmed.content.chosen).toEqual(['mia-0'])
    expect(trimmed.content.concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining(['mia-0', 'mia-1', 'mia-2']),
    )
  })

  it('a title a thumbnail idea is for stays when asking for others, and saving goes on working', async () => {
    const { t, id } = await withTitles()
    const thumbnails = (await ask(t, id, 'miniaturas')).pieces.miniaturas!
    const titles = (await read(t, id)).pieces.titulos!
    const target = thumbnails.content.concepts.find((concept) => concept.titleId === titles.content.alternatives[0])!
    await save(t, id, 'miniaturas', thumbnails.version, { ...thumbnails.content, chosen: [target.id] })
    // That title stops being chosen, and more titles are asked for.
    await save(t, id, 'titulos', titles.version, {
      ...titles.content,
      main: titles.content.main,
      alternatives: titles.content.alternatives.filter((one) => one !== target.titleId),
    })
    const again = (await ask(t, id, 'titulos')).pieces.titulos!
    expect(again.content.candidates.map((candidate) => candidate.id)).toContain(target.titleId)
    expect(target).toBeDefined()
    const now = (await read(t, id)).pieces.miniaturas!
    const unchosen = await save(t, id, 'miniaturas', now.version, { ...now.content, chosen: [] })
    expect(unchosen.status).toBe(200)
  })

  it('choosing an idea keeps the title it was made for, and its warning', async () => {
    const { t, id, view } = await withTitles()
    const thumbnails = (await ask(t, id, 'miniaturas')).pieces.miniaturas!
    const titles = (await read(t, id)).pieces.titulos!
    await save(t, id, 'titulos', titles.version, {
      ...titles.content,
      main: titles.content.candidates[3]!.id,
      alternatives: view.pieces.titulos!.content.alternatives,
    })
    const chosen = await save(t, id, 'miniaturas', thumbnails.version, {
      ...thumbnails.content,
      chosen: [thumbnails.content.concepts[0]!.id],
    })
    expect((chosen.body as View).pieces.miniaturas!.mainTitle).toBe(thumbnails.mainTitle)
    expect((chosen.body as View).warnings).toContain('titulo_cambiado')
  })

  it('with no room for three new ideas it says so before anything is paid', async () => {
    const { t, id } = await withTitles()
    const theirs = Array.from({ length: 4 }, (_, index) => ({
      id: `mia-${index}`,
      scene: `Escena ${index}`,
      bigText: '',
      emotion: '',
      composition: '',
      colors: '',
      titleId: null,
      origin: 'creador',
    }))
    expect((await save(t, id, 'miniaturas', 0, { concepts: theirs, chosen: [] })).status).toBe(200)
    const { status, body } = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'miniaturas' })
    expect(status).toBe(400)
    expect((body['error'] as { fields: Record<string, string> }).fields).toEqual({ miniaturas: 'lleno' })
  })

  it('changing the main title after the thumbnails says so', async () => {
    const { t, id, view } = await withTitles()
    await ask(t, id, 'miniaturas')
    const titles = (await read(t, id)).pieces.titulos!
    const other = titles.content.candidates[3]!
    const changed = await save(t, id, 'titulos', titles.version, {
      ...titles.content,
      main: other.id,
      alternatives: view.pieces.titulos!.content.alternatives,
    })
    expect((changed.body as View).warnings).toContain('titulo_cambiado')
  })
})

describe('one job at a time and what the AI gets wrong (US1)', () => {
  it('a running job stops the others', async () => {
    const { t, id } = await withPackage()
    const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'titulos' })
    await call(t, 'POST', `/api/packages/${id}/generate`, { use: 'titulos', estimateId: estimate.body['estimateId'] })
    const again = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'titulos' })
    const second = await call(t, 'POST', `/api/packages/${id}/generate`, {
      use: 'titulos',
      estimateId: again.body['estimateId'],
    })
    expect(second.status).toBe(409)
    expect(code(second.body)).toBe('en_curso')
    const saved = await save(t, id, 'titulos', 0, { candidates: [], main: null, alternatives: [] })
    expect(saved.status).toBe(409)
    await waitJob(t, id)
  })

  it('an answer with a web address is refused and what there was stays', async () => {
    const { t, id } = await withPackage('con_direccion')
    const view = await ask(t, id, 'titulos')
    expect(view.job).toMatchObject({ status: 'fallido', failure: 'respuesta_invalida' })
    expect(view.pieces.titulos).toBeNull()
  })

  it('an answer with a web address leaves the titles there were as they were', async () => {
    const { t, id } = await withPackage('con_direccion')
    const mine = { id: 'mio', text: 'Mi título', why: '', blockId: null, origin: 'creador' }
    const before = (await save(t, id, 'titulos', 0, { candidates: [mine], main: 'mio', alternatives: [] })).body as View
    const after = await ask(t, id, 'titulos')
    expect(after.job).toMatchObject({ status: 'fallido', failure: 'respuesta_invalida' })
    expect(after.pieces.titulos).toEqual(before.pieces.titulos)
  })

  it.each(['sin_sesion', 'cupo_agotado', 'tiempo_agotado', 'contenido_filtrado', 'no_disponible'])(
    'keeps the titles and the thumbnails when the AI fails with %s',
    async (failure) => {
      const { t, id } = await withTitles()
      const before = await ask(t, id, 'miniaturas')
      t.channel.aiRun.run = (async () => ({ ok: false, failure })) as never
      for (const use of ['titulos', 'miniaturas']) {
        const after = await ask(t, id, use)
        expect(after.job).toMatchObject({ status: 'fallido', failure })
        expect(after.pieces).toEqual(before.pieces)
      }
    },
  )
})

describe('approving the cover (US1)', () => {
  it('asks for a main title', async () => {
    const { t, id } = await withPackage()
    const view = await ask(t, id, 'titulos')
    const refused = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'portada',
      versions: { titulos: view.pieces.titulos!.version },
    })
    expect(refused.status).toBe(400)
  })

  it('asks for a main title and a chosen thumbnail', async () => {
    const { t, id } = await withTitles()
    const view = await ask(t, id, 'miniaturas')
    const versions = { titulos: view.pieces.titulos!.version, miniaturas: view.pieces.miniaturas!.version }
    const refused = await call(t, 'POST', `/api/packages/${id}/approve`, { step: 'portada', versions })
    expect(refused.status).toBe(400)
    expect((refused.body['error'] as { fields: Record<string, string> }).fields).toEqual({ miniaturas: 'no_valido' })
  })

  it('approves the versions on screen, refuses old ones, and an edit goes back to draft', async () => {
    const { t, id } = await withTitles()
    const view = await ask(t, id, 'miniaturas')
    const thumbnails = view.pieces.miniaturas!
    const chosen = await save(t, id, 'miniaturas', thumbnails.version, {
      ...thumbnails.content,
      chosen: [thumbnails.content.concepts[0]!.id],
    })
    const now = chosen.body as View
    const versions = { titulos: now.pieces.titulos!.version, miniaturas: now.pieces.miniaturas!.version }

    const stale = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'portada',
      versions: { ...versions, miniaturas: versions.miniaturas - 1 },
    })
    expect(stale.status).toBe(409)
    expect(code(stale.body)).toBe('version_cambiada')

    const approved = await call(t, 'POST', `/api/packages/${id}/approve`, { step: 'portada', versions })
    expect(approved.status).toBe(200)
    expect(approved.body).toMatchObject({ status: 'portada_aprobada', approvals: { cover: versions } })
    expect((await read(t, id)).status).toBe('portada_aprobada')

    const titles = now.pieces.titulos!
    const edited = await save(t, id, 'titulos', titles.version, {
      ...titles.content,
      candidates: titles.content.candidates.map((one, index) => (index === 0 ? { ...one, text: 'Otro texto' } : one)),
    })
    expect((edited.body as View).status).toBe('portada_borrador')
  })

  it('the texts cannot be approved before the cover', async () => {
    const { t, id } = await withPackage()
    const { status, body } = await call(t, 'POST', `/api/packages/${id}/approve`, { step: 'textos', versions: {} })
    expect(status).toBe(409)
    expect(code(body)).toBe('sin_aprobar')
  })
})

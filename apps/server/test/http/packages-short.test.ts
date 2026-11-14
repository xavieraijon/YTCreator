import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, approvedShort, openPackage, type TestApp, warningsOf } from './publish-flows.ts'

// The package of a Short: one request for all of it, no chapters and no thumbnails (US4, research.md R9).
interface Piece<C = Record<string, unknown>> {
  version: number
  origin: string
  mainTitle: string | null
  content: C
}
type Kind = 'titulos' | 'miniaturas' | 'portada_short' | 'descripcion' | 'capitulos' | 'etiquetas' | 'comentario'
type View = Record<string, unknown> & {
  status: string
  format: string
  warnings: string[]
  parentTitle: string | null
  job: { status: string; failure: string | null } | null
  script: { blocks: { id: string; seconds: number }[] }
  pieces: Record<Kind, Piece | null>
  texts: { chapters: { id: string; startSeconds: number }[]; assembled: string | null; fixedText: { current: string } }
}

const SHORT_KINDS = ['titulos', 'portada_short', 'descripcion', 'etiquetas', 'comentario'] as const

const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code
const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/packages/${id}`)).body as View

async function ask(t: TestApp, id: string, use: string, part?: string) {
  const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use, ...(part ? { part } : {}) })
  expect(estimate.status).toBe(200)
  const started = await call(t, 'POST', `/api/packages/${id}/generate`, {
    use,
    ...(part ? { part } : {}),
    estimateId: estimate.body['estimateId'],
  })
  expect(started.status).toBe(202)
  await vi.waitFor(async () => expect((await read(t, id)).job?.status).not.toBe('en_curso'))
  return read(t, id)
}

const save = (t: TestApp, id: string, kind: string, baseVersion: number, content: unknown) =>
  call(t, 'PUT', `/api/packages/${id}/pieces/${kind}`, { baseVersion, content })

const versionsOf = (view: View, kinds: readonly Kind[]) =>
  Object.fromEntries(kinds.map((kind) => [kind, view.pieces[kind]!.version]))

async function shortPackage(options: { fromLong?: boolean } = {}) {
  const t = makeTestApp({ fakeAi: 'ok' })
  const made = await approvedShort(t, options)
  const id = (await openPackage(t, made.scriptId)).body['id'] as string
  return { t, id, ...made }
}

async function withPieces(options: { fromLong?: boolean } = {}) {
  const made = await shortPackage(options)
  return { ...made, view: await ask(made.t, made.id, 'paquete_short') }
}

// The main title chosen and the cover step approved.
async function withCover() {
  const made = await withPieces()
  const { t, id, view } = made
  const titles = view.pieces.titulos as Piece<{ candidates: { id: string }[] }>
  const chosen = await save(t, id, 'titulos', titles.version, {
    ...titles.content,
    main: titles.content.candidates[0]!.id,
  })
  expect(chosen.status).toBe(200)
  const approved = await call(t, 'POST', `/api/packages/${id}/approve`, {
    step: 'portada',
    versions: versionsOf(chosen.body as View, ['titulos', 'portada_short']),
  })
  expect(approved.status).toBe(200)
  return { ...made, view: approved.body as View }
}

describe('asking for the package of a Short (US4)', () => {
  it('makes titles, cover, description, tags and comment at once, and no thumbnail or chapters', async () => {
    const { view } = await withPieces()
    expect(view.format).toBe('short')
    for (const kind of SHORT_KINDS) expect(view.pieces[kind]).toMatchObject({ version: 1, origin: 'ia' })
    expect(view.pieces.miniaturas).toBeNull()
    expect(view.pieces.capitulos).toBeNull()
    const titles = view.pieces.titulos!.content as { candidates: unknown[]; main: string | null }
    expect(titles.candidates).toHaveLength(3)
    // The creator chooses the main title, as in a long video.
    expect(titles.main).toBeNull()
    const blockIds = view.script.blocks.map((block) => block.id)
    expect(blockIds).toContain((view.pieces.portada_short!.content as { blockId: string }).blockId)
    const description = view.pieces.descripcion!.content as { hashtags: string[]; fixedText: string }
    expect(description.hashtags).toEqual(['pan', 'receta', 'shorts'])
    // The fixed part is the channel's, never the AI's.
    expect(description.fixedText).toBe(view.texts.fixedText.current)
    expect(view.texts.assembled).toContain('#pan #receta #shorts')
    expect(view.texts.chapters).toEqual([])
  })

  it('names the long video it comes from: its idea title while it has no package', async () => {
    const { t, id } = await shortPackage()
    const run = vi.spyOn(t.channel.aiRun, 'run')
    const view = await ask(t, id, 'paquete_short')
    expect((run.mock.calls[0]![0].input as { parentTitle: string | null }).parentTitle).toBe('Pan sin amasar')
    expect(view.parentTitle).toBe('Pan sin amasar')
    expect((view.pieces.descripcion!.content as { body: string }).body).toContain('«Pan sin amasar»')
    // No link to it: the app does not know its address (decision 10). The fixed part is the channel's own.
    const { firstLines, body } = view.pieces.descripcion!.content as { firstLines: string; body: string }
    expect(`${firstLines} ${body}`).not.toMatch(/https?:|www\./)
  })

  it('the description always names it: the app adds it if the texts do not (FR-018)', async () => {
    const { t, id, view } = await withPieces()
    const description = view.pieces.descripcion!
    const saved = await save(t, id, 'descripcion', description.version, {
      ...description.content,
      firstLines: 'Un truco en un minuto.',
      body: 'Un truco rápido para el fin de semana.',
    })
    expect((saved.body as View).texts.assembled).toContain('Vídeo completo: «Pan sin amasar»')
  })

  it('names the main title of the long video package when there is one', async () => {
    const { t, id, longScriptId } = await shortPackage()
    const longId = (await openPackage(t, longScriptId!)).body['id'] as string
    const longView = await ask(t, longId, 'titulos')
    const titles = longView.pieces.titulos as Piece<{ candidates: { id: string; text: string }[] }>
    const main = titles.content.candidates[1]!
    await save(t, longId, 'titulos', titles.version, { ...titles.content, main: main.id })
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, id, 'paquete_short')
    expect((run.mock.calls[0]![0].input as { parentTitle: string }).parentTitle).toBe(main.text)
  })

  it('a Short of its own has no long video to name', async () => {
    const { t, id } = await shortPackage({ fromLong: false })
    const run = vi.spyOn(t.channel.aiRun, 'run')
    await ask(t, id, 'paquete_short')
    expect((run.mock.calls[0]![0].input as { parentTitle: string | null }).parentTitle).toBeNull()
  })

  it('is only for a Short, and only once: then each piece is asked for again on its own', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const longId = (await openPackage(t, scriptId)).body['id'] as string
    const long = await call(t, 'POST', `/api/packages/${longId}/estimate`, { use: 'paquete_short' })
    expect(long.status).toBe(400)
    expect(code(long.body)).toBe('validacion')

    const { t: other, id } = await withPieces()
    const again = await call(other, 'POST', `/api/packages/${id}/estimate`, { use: 'paquete_short' })
    expect(again.status).toBe(409)
    expect(code(again.body)).toBe('version_cambiada')
  })

  it('a Short gets no thumbnails nor a long description, and its first titles come with the package', async () => {
    const { t, id } = await shortPackage()
    for (const use of ['titulos', 'miniaturas', 'descripcion']) {
      const refused = await call(t, 'POST', `/api/packages/${id}/estimate`, { use })
      expect(refused.status).toBe(400)
      expect(code(refused.body)).toBe('validacion')
    }
    await ask(t, id, 'paquete_short')
    // Once there, other titles are asked for as in a long video (R9); thumbnails and the long description, never.
    expect((await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'titulos' })).status).toBe(200)
    for (const use of ['miniaturas', 'descripcion'])
      expect((await call(t, 'POST', `/api/packages/${id}/estimate`, { use })).status).toBe(400)
  })

  it("brings what is missing when titles were there before, and keeps the creator's", async () => {
    const { t, id } = await shortPackage()
    const mine = { id: 'mio', text: 'Mi pan de un minuto', why: '', blockId: null, origin: 'creador' }
    expect((await save(t, id, 'titulos', 0, { candidates: [mine], main: 'mio', alternatives: [] })).status).toBe(200)
    const view = await ask(t, id, 'paquete_short')
    const titles = view.pieces.titulos!.content as { candidates: { id: string }[]; main: string | null }
    expect(titles.main).toBe('mio')
    expect(titles.candidates.map((candidate) => candidate.id)).toContain('mio')
    expect(titles.candidates).toHaveLength(4)
    for (const kind of ['portada_short', 'descripcion', 'etiquetas', 'comentario'] as const)
      expect(view.pieces[kind]).toMatchObject({ version: 1, origin: 'ia' })
    // All of it there: from now on, piece by piece.
    expect((await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'paquete_short' })).status).toBe(409)
  })

  it('needs the script approved', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, draft } = await approvedShort(t, { fromLong: false })
    const id = (await openPackage(t, scriptId)).body['id'] as string
    const [first, ...rest] = draft.content.blocks
    await call(t, 'PUT', `/api/scripts/${scriptId}/draft`, {
      baseVersion: draft.version,
      content: { ...draft.content, blocks: [{ ...first!, visual: `${first!.visual} Otro plano.` }, ...rest] },
    })
    const refused = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'paquete_short' })
    expect(refused.status).toBe(409)
    expect(code(refused.body)).toBe('sin_aprobar')
  })
})

describe('working on the package of a Short (US4)', () => {
  it('asks for the cover again on its own, without touching the rest', async () => {
    const { t, id, view } = await withPieces()
    const after = await ask(t, id, 'parte_paquete', 'portada_short')
    expect(after.pieces.portada_short).toMatchObject({ version: 2, origin: 'parte_ia' })
    for (const kind of ['titulos', 'descripcion', 'etiquetas', 'comentario'] as const)
      expect(after.pieces[kind]).toEqual(view.pieces[kind])
  })

  it('keeps the cover the creator writes', async () => {
    const { t, id, view } = await withPieces()
    const cover = view.pieces.portada_short!
    const saved = await save(t, id, 'portada_short', cover.version, {
      ...cover.content,
      moment: 'Cuando parto el pan y cruje.',
      screenText: '¡CRUJE!',
    })
    expect(saved.status).toBe(200)
    expect((saved.body as View).pieces.portada_short).toMatchObject({
      version: 2,
      origin: 'edicion',
      content: { moment: 'Cuando parto el pan y cruje.', screenText: '¡CRUJE!' },
    })
    const unknown = await save(t, id, 'portada_short', 2, { ...cover.content, blockId: 'no-esta' })
    expect(unknown.status).toBe(400)
    expect(code(unknown.body)).toBe('validacion')
  })

  it('asks for the description again with its hashtags, once the cover is approved', async () => {
    const { t, id } = await withPieces()
    const early = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'parte_paquete', part: 'descripcion' })
    expect(early.status).toBe(409)
    expect(code(early.body)).toBe('sin_aprobar')
    const { t: other, id: ready } = await withCover()
    const run = vi.spyOn(other.channel.aiRun, 'run')
    const after = await ask(other, ready, 'parte_paquete', 'descripcion')
    // Asked for again, it still names the long video (FR-018).
    expect((run.mock.calls[0]![0].input as { parentTitle: string | null }).parentTitle).toBe('Pan sin amasar')
    expect((after.pieces.descripcion!.content as { body: string }).body).toContain('«Pan sin amasar»')
    expect(after.pieces.descripcion).toMatchObject({ version: 2, origin: 'parte_ia' })
    expect((after.pieces.descripcion!.content as { hashtags: string[] }).hashtags).toEqual(['pan', 'receta'])
    // A Short has no chapters to ask for.
    const chapters = await call(other, 'POST', `/api/packages/${ready}/estimate`, {
      use: 'parte_paquete',
      part: 'capitulos',
    })
    expect(chapters.status).toBe(400)
  })

  it('approves both steps and the whole package, without chapters', async () => {
    const { t, id } = await withCover()
    const texts = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'textos',
      versions: versionsOf(await read(t, id), ['descripcion', 'etiquetas', 'comentario']),
    })
    expect(texts.status).toBe(200)
    const view = texts.body as View
    const approved = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'paquete',
      versions: versionsOf(view, [...SHORT_KINDS]),
      acknowledgedWarnings: await warningsOf(t, view),
    })
    expect(approved.status).toBe(200)
    expect((approved.body as View).status).toBe('aprobado')
  })
})

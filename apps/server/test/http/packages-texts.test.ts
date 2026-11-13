import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, CREATOR_REFERENCE, openPackage, type TestApp } from './publish-flows.ts'

// The texts of a long video: description, chapters, tags and pinned comment (US2, research.md R3 to R6).
interface Piece<C> {
  version: number
  origin: string
  draftVersion: number
  mainTitle: string | null
  content: C
}
interface Description {
  firstLines: string
  body: string
  hashtags: string[]
  fixedText: string
}
interface Chapter {
  id: string
  title: string
  blockIds: string[]
  startSeconds: number | null
  manual: boolean
}
type Kind = 'titulos' | 'miniaturas' | 'descripcion' | 'capitulos' | 'etiquetas' | 'comentario'
type View = Record<string, unknown> & {
  status: string
  warnings: string[]
  job: { status: string; failure: string | null } | null
  script: { blocks: { id: string; seconds: number }[] }
  pieces: Record<Kind, Piece<Record<string, unknown>> | null> & {
    descripcion: Piece<Description> | null
    capitulos: Piece<{ chapters: Chapter[] }> | null
    etiquetas: Piece<{ tags: string[] }> | null
    comentario: Piece<{ text: string }> | null
  }
  texts: {
    chapters: (Chapter & { startSeconds: number; time: string })[]
    sources: { title: string; url: string | null; reference: string | null }[]
    assembled: string | null
    fixedText: { current: string; isDefault: boolean }
  }
}

const TEXT_KINDS = ['descripcion', 'capitulos', 'etiquetas', 'comentario'] as const

const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code
const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/packages/${id}`)).body as View

async function waitJob(t: TestApp, id: string) {
  await vi.waitFor(async () => expect((await read(t, id)).job?.status).not.toBe('en_curso'))
  return read(t, id)
}

async function ask(t: TestApp, id: string, use: string, part?: string) {
  const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use, ...(part ? { part } : {}) })
  expect(estimate.status).toBe(200)
  const started = await call(t, 'POST', `/api/packages/${id}/generate`, {
    use,
    ...(part ? { part } : {}),
    estimateId: estimate.body['estimateId'],
  })
  expect(started.status).toBe(202)
  return waitJob(t, id)
}

const save = (t: TestApp, id: string, kind: string, baseVersion: number, content: unknown) =>
  call(t, 'PUT', `/api/packages/${id}/pieces/${kind}`, { baseVersion, content })

const versionsOf = (view: View, kinds: readonly Kind[]) =>
  Object.fromEntries(kinds.map((kind) => [kind, view.pieces[kind]!.version]))

// A package with its cover approved: a main title and a chosen thumbnail.
async function withCover({ facts = true, fakeAi = 'ok' }: { facts?: boolean; fakeAi?: string } = {}) {
  const t = makeTestApp({ fakeAi })
  const { channelId, scriptId, draft } = await approvedScript(t, undefined, { facts })
  if (fakeAi === 'cifra_inventada') {
    // The fake repeats the figure in the script, where it would count as backed: a script without it.
    const blocks = draft.content.blocks.map((block) => ({ ...block, text: 'Una frase cualquiera.' }))
    const saved = await call(t, 'PUT', `/api/scripts/${scriptId}/draft`, {
      baseVersion: draft.version,
      content: { blocks, claims: [] },
    })
    const next = saved.body['draft'] as { version: number }
    await call(t, 'POST', `/api/scripts/${scriptId}/draft/approve`, { version: next.version, acknowledgedPending: 0 })
  }
  const id = (await openPackage(t, scriptId)).body['id'] as string
  const titles = (await ask(t, id, 'titulos')).pieces.titulos! as Piece<{ candidates: { id: string }[] }>
  await save(t, id, 'titulos', titles.version, { ...titles.content, main: titles.content.candidates[0]!.id })
  const thumbnails = (await ask(t, id, 'miniaturas')).pieces.miniaturas! as Piece<{ concepts: { id: string }[] }>
  const chosen = await save(t, id, 'miniaturas', thumbnails.version, {
    ...thumbnails.content,
    chosen: [thumbnails.content.concepts[0]!.id],
  })
  const approved = await call(t, 'POST', `/api/packages/${id}/approve`, {
    step: 'portada',
    versions: versionsOf(chosen.body as View, ['titulos', 'miniaturas']),
  })
  expect(approved.status).toBe(200)
  return { t, id, channelId, mainTitle: (approved.body as View).pieces.titulos!.content['main'] as string }
}

async function withTexts(options: { facts?: boolean; fakeAi?: string } = {}) {
  const made = await withCover(options)
  return { ...made, view: await ask(made.t, made.id, 'descripcion') }
}

describe('asking for the texts (US2)', () => {
  it('needs the cover approved first', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const id = (await openPackage(t, scriptId)).body['id'] as string
    const refused = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'descripcion' })
    expect(refused.status).toBe(409)
    expect(code(refused.body)).toBe('sin_aprobar')
  })

  it('makes a version of each text, written for the approved draft and the main title', async () => {
    const { t, id, view } = await withTexts()
    expect(view.job).toMatchObject({ status: 'hecho' })
    const titleText = (view.pieces.titulos!.content['candidates'] as { id: string; text: string }[])[0]!.text
    for (const kind of TEXT_KINDS) {
      const piece = view.pieces[kind]!
      expect(piece).toMatchObject({ version: 1, origin: 'ia', mainTitle: titleText })
      expect(piece.draftVersion).toEqual(expect.any(Number))
    }
    // The fixed part is a copy of the channel's, never the AI's; no hashtags in a long video (decision 9).
    expect(view.pieces.descripcion!.content.fixedText).toBe(view.texts.fixedText.current)
    expect(view.texts.fixedText.current).toMatch(/sub_confirmation=1$/)
    expect(view.pieces.descripcion!.content.hashtags).toEqual([])
    expect(view.pieces.etiquetas!.content.tags.length).toBeGreaterThanOrEqual(3)
    expect(view.status).toBe('textos_borrador')
    expect((await read(t, id)).warnings).not.toContain('sin_fuentes')
  })

  it('once the texts are there they are not asked for whole again: another tab would write over them', async () => {
    const { t, id } = await withTexts()
    const again = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'descripcion' })
    expect(again.status).toBe(409)
    expect(code(again.body)).toBe('version_cambiada')
  })

  it('the chapters cover the script in order and start at 0:00, as an estimate', async () => {
    const { view } = await withTexts()
    const blockIds = view.script.blocks.map((block) => block.id)
    expect(view.pieces.capitulos!.content.chapters.flatMap((one) => one.blockIds)).toEqual(blockIds)
    expect(view.pieces.capitulos!.content.chapters.every((one) => one.startSeconds === null && !one.manual)).toBe(true)
    expect(view.texts.chapters[0]).toMatchObject({ startSeconds: 0, time: '0:00' })
    const times = view.texts.chapters.map((one) => one.startSeconds)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('puts the description together, with the sources from the facts and not from the AI (R4, R5)', async () => {
    const { view } = await withTexts()
    const description = view.pieces.descripcion!.content
    expect(view.texts.sources).toContainEqual({ title: '', url: null, reference: CREATOR_REFERENCE })
    const assembled = view.texts.assembled!
    expect(assembled.startsWith(description.firstLines.trim())).toBe(true)
    expect(assembled).toContain(`0:00 ${view.texts.chapters[0]!.title}`)
    expect(assembled).toContain(`- ${CREATOR_REFERENCE}`)
    expect(assembled.endsWith(description.fixedText)).toBe(true)
    expect(assembled.indexOf('0:00')).toBeLessThan(assembled.indexOf(CREATOR_REFERENCE))
  })

  it('warns when the script had no sources', async () => {
    const { view } = await withTexts({ facts: false })
    expect(view.texts.sources).toEqual([])
    expect(view.warnings).toContain('sin_fuentes')
  })
})

describe('asking for one part again (US2, SC-005)', () => {
  for (const part of TEXT_KINDS) {
    it(`only ${part} gets a new version; the others stay as they were, character for character`, async () => {
      const { t, id, view } = await withTexts()
      const after = await ask(t, id, 'parte_paquete', part)
      expect(after.job).toMatchObject({ status: 'hecho' })
      expect(after.pieces[part]).toMatchObject({ version: 2, origin: 'parte_ia' })
      for (const other of TEXT_KINDS.filter((kind) => kind !== part))
        expect(JSON.stringify(after.pieces[other])).toBe(JSON.stringify(view.pieces[other]))
      expect(after.pieces.descripcion!.content.fixedText).toBe(view.pieces.descripcion!.content.fixedText)
    })
  }

  it('a part that is not there yet, or not of this format, is refused', async () => {
    const { t, id } = await withCover()
    const missing = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'parte_paquete', part: 'comentario' })
    expect(missing.status).toBe(400)
    const { t: other, id: withAll } = await withTexts()
    const short = await call(other, 'POST', `/api/packages/${withAll}/estimate`, {
      use: 'parte_paquete',
      part: 'portada_short',
    })
    expect(short.status).toBe(400)
  })

  it('an estimate is only good for the part it was asked for', async () => {
    const { t, id } = await withTexts()
    const tags = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'parte_paquete', part: 'etiquetas' })
    const other = await call(t, 'POST', `/api/packages/${id}/generate`, {
      use: 'parte_paquete',
      part: 'descripcion',
      estimateId: tags.body['estimateId'],
    })
    expect(other.status).toBe(400)
    expect((other.body['error'] as { fields: Record<string, string> }).fields).toEqual({ estimateId: 'no_valido' })
  })

  it('a figure the creator wrote in the part is not a source when it is written again (principle V)', async () => {
    const { t, id, view } = await withTexts({ fakeAi: 'cifra_inventada' })
    const description = view.pieces.descripcion!
    expect(JSON.stringify(description.content)).not.toContain('250.000')
    await save(t, id, 'descripcion', description.version, {
      ...description.content,
      body: 'Este tema mueve 250.000 visitas al mes.',
    })
    const after = await ask(t, id, 'parte_paquete', 'descripcion')
    expect(after.pieces.descripcion).toMatchObject({ version: 3, origin: 'parte_ia' })
    expect(JSON.stringify(after.pieces.descripcion!.content)).not.toContain('250.000')
  })

  it('a part without `part`, or `part` with another use, is refused', async () => {
    const { t, id } = await withTexts()
    expect((await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'parte_paquete' })).status).toBe(400)
    expect(
      (await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'descripcion', part: 'comentario' })).status,
    ).toBe(400)
  })
})

describe('editing the texts (US2)', () => {
  it('saves each text as a version of the creator', async () => {
    const { t, id, view } = await withTexts()
    const description = view.pieces.descripcion!
    const savedDescription = await save(t, id, 'descripcion', description.version, {
      ...description.content,
      firstLines: 'Pan sin amasar, en casa y sin prisa.',
    })
    expect(savedDescription.status).toBe(200)
    const tags = await save(t, id, 'etiquetas', 1, { tags: ['pan casero', 'masa madre', 'receta fácil'] })
    const comment = await save(t, id, 'comentario', 1, { text: '¿Y tú cómo lo haces?' })
    const now = comment.body as View
    expect(tags.status).toBe(200)
    expect(now.pieces.descripcion).toMatchObject({ version: 2, origin: 'edicion' })
    expect(now.pieces.etiquetas).toMatchObject({ version: 2, origin: 'edicion', content: { tags: expect.any(Array) } })
    expect(now.pieces.comentario).toMatchObject({
      version: 2,
      origin: 'edicion',
      content: { text: '¿Y tú cómo lo haces?' },
    })
    // Tags and comment keep the title they were written for.
    expect(now.pieces.etiquetas!.mainTitle).toBe(view.pieces.etiquetas!.mainTitle)
    expect(now.texts.assembled!.startsWith('Pan sin amasar, en casa y sin prisa.')).toBe(true)
  })

  it('refuses hashtags in a long video and a fixed part that is not the copy or the channel one', async () => {
    const { t, id, view } = await withTexts()
    const description = view.pieces.descripcion!
    const hashtags = await save(t, id, 'descripcion', 1, { ...description.content, hashtags: ['pan'] })
    expect(hashtags.status).toBe(400)
    const fixed = await save(t, id, 'descripcion', 1, { ...description.content, fixedText: 'Otra cosa.' })
    expect(fixed.status).toBe(400)
    expect((fixed.body['error'] as { fields: Record<string, string> }).fields).toEqual({ fixedText: 'no_valido' })
  })

  it('keeps a minute the creator writes, and works out the others again', async () => {
    const { t, id, view } = await withTexts()
    const chapters = view.pieces.capitulos!.content.chapters
    expect(chapters.length).toBeGreaterThan(1)
    const sent = chapters.map((one, index) =>
      index === 1 ? { ...one, title: 'La masa', startSeconds: 125, manual: true } : { ...one, startSeconds: 999 },
    )
    const saved = await save(t, id, 'capitulos', 1, { chapters: sent })
    expect(saved.status).toBe(200)
    const now = saved.body as View
    expect(now.pieces.capitulos!.content.chapters[1]).toMatchObject({ startSeconds: 125, manual: true })
    expect(
      now.pieces.capitulos!.content.chapters.filter((one) => !one.manual).every((one) => one.startSeconds === null),
    ).toBe(true)
    expect(now.texts.chapters[1]).toMatchObject({ title: 'La masa', startSeconds: 125, time: '2:05', manual: true })
    expect(now.texts.chapters[0]).toMatchObject({ startSeconds: 0 })
  })
})

describe('chapter minutes out of order (US2, R3)', () => {
  it('refuses a minute that starts before the chapter before it, and moves the estimates after a written one', async () => {
    const { t, id, view } = await withTexts()
    const chapters = view.pieces.capitulos!.content.chapters
    expect(chapters.length).toBeGreaterThan(2)
    const second = view.texts.chapters[1]!.startSeconds
    const early = chapters.map((one, index) =>
      index === 2 ? { ...one, startSeconds: Math.max(0, second - 1), manual: true } : one,
    )
    expect((await save(t, id, 'capitulos', 1, { chapters: early })).status).toBe(400)
    const close = chapters.map((one, index) => (index === 1 ? { ...one, startSeconds: 5, manual: true } : one))
    expect((await save(t, id, 'capitulos', 1, { chapters: close })).status).toBe(400)
    const moved = chapters.map((one, index) =>
      index === 1 ? { ...one, startSeconds: second + 60, manual: true } : one,
    )
    const saved = (await save(t, id, 'capitulos', 1, { chapters: moved })).body as View
    expect(saved.texts.chapters[2]!.startSeconds).toBe(view.texts.chapters[2]!.startSeconds + 60)
  })
})

describe('the fixed part of the channel (US2, FR-010)', () => {
  it('changing it does not touch the descriptions saved; it warns, and «Usar la nueva» is an edit', async () => {
    const { t, id, channelId, view } = await withTexts()
    const before = view.pieces.descripcion!
    const settings = await call(t, 'PUT', `/api/channels/${channelId}/publish-settings`, {
      fixedText: 'Más recetas en mi canal.',
      category: null,
    })
    expect(settings.status).toBe(200)

    const changed = await read(t, id)
    expect(changed.pieces.descripcion).toEqual(before)
    expect(changed.warnings).toContain('parte_fija_cambiada')
    expect(changed.texts.fixedText).toEqual({ current: 'Más recetas en mi canal.', isDefault: false })

    const used = await save(t, id, 'descripcion', before.version, {
      ...before.content,
      fixedText: 'Más recetas en mi canal.',
    })
    expect(used.status).toBe(200)
    const now = used.body as View
    expect(now.pieces.descripcion).toMatchObject({ version: 2, origin: 'edicion' })
    expect(now.warnings).not.toContain('parte_fija_cambiada')
    expect(now.texts.assembled!.endsWith('Más recetas en mi canal.')).toBe(true)
  })
})

describe('approving the texts (US2)', () => {
  it('asks for the cover approved first', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const id = (await openPackage(t, scriptId)).body['id'] as string
    const refused = await call(t, 'POST', `/api/packages/${id}/approve`, { step: 'textos', versions: {} })
    expect(refused.status).toBe(409)
    expect(code(refused.body)).toBe('sin_aprobar')
  })

  it('refuses empty texts, but the pinned comment may be empty (decision 14)', async () => {
    const { t, id, view } = await withTexts()
    await save(t, id, 'descripcion', 1, { ...view.pieces.descripcion!.content, firstLines: ' ' })
    await save(t, id, 'capitulos', 1, { chapters: [] })
    await save(t, id, 'etiquetas', 1, { tags: [] })
    const emptied = (await save(t, id, 'comentario', 1, { text: '' })).body as View
    const refused = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'textos',
      versions: versionsOf(emptied, TEXT_KINDS),
    })
    expect(refused.status).toBe(400)
    expect((refused.body['error'] as { fields: Record<string, string> }).fields).toEqual({
      descripcion: 'no_valido',
      capitulos: 'no_valido',
      etiquetas: 'no_valido',
    })
  })

  it('approves the versions on screen, with an empty comment', async () => {
    const { t, id } = await withTexts()
    const emptied = (await save(t, id, 'comentario', 1, { text: '' })).body as View
    const approved = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'textos',
      versions: versionsOf(emptied, TEXT_KINDS),
    })
    expect(approved.status).toBe(200)
    expect(approved.body).toMatchObject({ status: 'textos_aprobados' })
  })
})

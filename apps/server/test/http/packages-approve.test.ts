import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, openPackage, reopenScript, type TestApp } from './publish-flows.ts'

// The package ready to copy: the review, the guided list of YouTube Studio, approving the whole package and the
// downloads (US3, research.md R12 to R15).
type Kind = 'titulos' | 'miniaturas' | 'descripcion' | 'capitulos' | 'etiquetas' | 'comentario'
interface Piece {
  version: number
  content: Record<string, unknown>
}
type View = Record<string, unknown> & {
  status: string
  warnings: string[]
  job: { status: string } | null
  pieces: Record<Kind, Piece | null>
  approvals: {
    package: Record<string, number> | null
    packageApprovedAt: string | null
    packageApprovedWarnings: number | null
  }
  studioDone: string[]
  studio: { key: string; answer: unknown; assumption?: boolean; source?: unknown; implicationsSource?: unknown }[]
}

const KINDS: readonly Kind[] = ['titulos', 'miniaturas', 'descripcion', 'capitulos', 'etiquetas', 'comentario']
const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code
const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/packages/${id}`)).body as View
const versionsOf = (view: View, kinds: readonly Kind[] = KINDS) =>
  Object.fromEntries(kinds.map((kind) => [kind, view.pieces[kind]!.version]))
const save = (t: TestApp, id: string, kind: Kind, view: View, content: unknown) =>
  call(t, 'PUT', `/api/packages/${id}/pieces/${kind}`, { baseVersion: view.pieces[kind]!.version, content })

async function ask(t: TestApp, id: string, use: string) {
  const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use })
  await call(t, 'POST', `/api/packages/${id}/generate`, { use, estimateId: estimate.body['estimateId'] })
  await vi.waitFor(async () => expect((await read(t, id)).job?.status).not.toBe('en_curso'))
  return read(t, id)
}

// A long video with both steps approved: what the whole package is approved from.
async function withSteps({ approveTexts = true } = {}) {
  const t = makeTestApp({ fakeAi: 'ok' })
  const script = await approvedScript(t, undefined, { facts: true })
  const id = (await openPackage(t, script.scriptId)).body['id'] as string
  let view = await ask(t, id, 'titulos')
  const candidates = view.pieces.titulos!.content['candidates'] as { id: string }[]
  view = (await save(t, id, 'titulos', view, { ...view.pieces.titulos!.content, main: candidates[0]!.id })).body as View
  view = await ask(t, id, 'miniaturas')
  const concepts = view.pieces.miniaturas!.content['concepts'] as { id: string }[]
  view = (await save(t, id, 'miniaturas', view, { ...view.pieces.miniaturas!.content, chosen: [concepts[0]!.id] }))
    .body as View
  view = (
    await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'portada',
      versions: versionsOf(view, ['titulos', 'miniaturas']),
    })
  ).body as View
  view = await ask(t, id, 'descripcion')
  if (approveTexts) {
    const texts = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'textos',
      versions: versionsOf(view, ['descripcion', 'capitulos', 'etiquetas', 'comentario']),
    })
    expect(texts.status).toBe(200)
    view = texts.body as View
  }
  return { t, id, view, script }
}

// How many notices the screen shows: those of the review and those of the package (FR-013).
async function warningsOf(t: TestApp, view: View) {
  const { reviewPackage, warningNotices, formatKinds } = await import('@ytcreator/core')
  const rules = (await call(t, 'GET', `/api/packages/${view['id'] as string}/review`)).body['rules']
  const texts = view['texts'] as { chapters: { id: string; startSeconds: number }[]; assembled: string | null }
  const blocks = (view['script'] as { blocks: { seconds: number }[] }).blocks
  const notices = reviewPackage(
    {
      format: 'largo',
      pieces: Object.fromEntries(
        formatKinds('largo').map((kind) => [kind, view.pieces[kind as Kind]?.content ?? null]),
      ),
      chapters: texts.chapters,
      scriptSeconds: blocks.reduce((sum, block) => sum + block.seconds, 0),
      assembled: texts.assembled,
    },
    rules as Parameters<typeof reviewPackage>[1],
  )
  return warningNotices(notices).length + view.warnings.length
}

describe('the review (US3)', () => {
  it('gives the figures of publish/youtube.json and publish/craft.json, without AI', async () => {
    const { t, id } = await withSteps({ approveTexts: false })
    const usage = t.db.prepare('SELECT COUNT(*) AS n FROM ai_usage').get() as { n: number }
    const review = await call(t, 'GET', `/api/packages/${id}/review`)
    expect(review.status).toBe(200)
    expect(review.body['rules']).toEqual({
      titleMaxChars: 100,
      mobileTitleChars: 70,
      descriptionMaxChars: 5000,
      tagsMaxTotalChars: 500,
      chapterMinCount: 3,
      chapterMinSeconds: 10,
      hashtagsShown: 3,
    })
    expect((t.db.prepare('SELECT COUNT(*) AS n FROM ai_usage').get() as { n: number }).n).toBe(usage.n)
    // Each figure with its own source; the cut on a phone is a calculation of ours (principle V).
    const sources = review.body['sources'] as Record<string, { label: string } | null>
    expect(sources['chapterMinSeconds']?.label).toMatch(/capítulos/)
    expect(sources['tagsMaxTotalChars']?.label).toMatch(/etiquetas/)
    expect(sources['titleMaxChars']?.label).toMatch(/título/)
    expect(sources['mobileTitleChars']).toBeNull()
    expect((await call(t, 'GET', '/api/packages/no-existe/review')).status).toBe(404)
  })
})

describe('the guided list of YouTube Studio (US3)', () => {
  it('has the four settings, answered from the profile', async () => {
    const { view } = await withSteps({ approveTexts: false })
    expect(view.studio.map((item) => item.key)).toEqual([
      'publico_infantil',
      'contenido_sintetico',
      'idioma',
      'categoria',
    ])
    expect(view.studio.find((item) => item.key === 'contenido_sintetico')?.answer).toBeNull()
    // Each official text says where it comes from; the assumptions say so in their text.
    const kids = view.studio.find((item) => item.key === 'publico_infantil')
    expect(kids?.source).toMatchObject({ label: expect.any(String), date: expect.any(String) })
    expect(kids?.implicationsSource).toMatchObject({ label: expect.any(String), date: expect.any(String) })
    expect(view.studio.find((item) => item.key === 'contenido_sintetico')?.source).toBeTruthy()
    expect(view.studio.find((item) => item.key === 'idioma')?.source).toBeNull()
    // No category chosen yet: the suggested one, as an assumption.
    expect(view.studio.find((item) => item.key === 'categoria')).toMatchObject({
      answer: 'Educación',
      assumption: true,
    })
  })

  it('gives the category the channel chose', async () => {
    const { t, id, view } = await withSteps({ approveTexts: false })
    await call(t, 'PUT', `/api/channels/${view['channelId'] as string}/publish-settings`, {
      fixedText: 'Mi parte fija',
      category: 'Ciencia y tecnología',
    })
    expect((await read(t, id)).studio.find((item) => item.key === 'categoria')).toMatchObject({
      answer: 'Ciencia y tecnología',
      assumption: false,
    })
  })

  it('keeps the marks of «hecho» without making a version, and refuses keys it does not know', async () => {
    const { t, id, view } = await withSteps()
    const marked = await call(t, 'PUT', `/api/packages/${id}/studio`, {
      done: ['idioma', 'categoria', 'idioma'],
      base: [],
    })
    expect(marked.status).toBe(200)
    const after = marked.body as View
    expect(after.studioDone).toEqual(['idioma', 'categoria'])
    expect(versionsOf(after)).toEqual(versionsOf(view))
    expect(after.status).toBe(view.status)
    const unknown = await call(t, 'PUT', `/api/packages/${id}/studio`, { done: ['subir_video'], base: [] })
    expect(unknown.status).toBe(400)
    expect(code(unknown.body)).toBe('validacion')
    expect((await read(t, id)).studioDone).toEqual(['idioma', 'categoria'])
  })

  it('does not write over the marks another tab made since (409)', async () => {
    const { t, id } = await withSteps()
    await call(t, 'PUT', `/api/packages/${id}/studio`, { done: ['idioma'], base: [] })
    // This tab still saw no marks: it would clear «idioma» without knowing.
    const stale = await call(t, 'PUT', `/api/packages/${id}/studio`, { done: ['categoria'], base: [] })
    expect(stale.status).toBe(409)
    expect(code(stale.body)).toBe('version_cambiada')
    expect((await read(t, id)).studioDone).toEqual(['idioma'])
    const fresh = await call(t, 'PUT', `/api/packages/${id}/studio`, {
      done: ['categoria', 'idioma'],
      base: ['idioma'],
    })
    expect(fresh.status).toBe(200)
  })
})

describe('approving the whole package (US3)', () => {
  it('needs both steps approved', async () => {
    const { t, id, view } = await withSteps({ approveTexts: false })
    const refused = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'paquete',
      versions: versionsOf(view),
      acknowledgedWarnings: await warningsOf(t, view),
    })
    expect(refused.status).toBe(409)
    expect(code(refused.body)).toBe('sin_aprobar')
  })

  it('needs the script approved: one back in draft is not approved (guion_sin_aprobar)', async () => {
    const { t, id, view, script } = await withSteps()
    expect((await reopenScript(t, script.scriptId, script.draft)).status).toBe(200)
    const reopened = await read(t, id)
    expect(reopened.warnings).toContain('guion_sin_aprobar')
    const refused = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'paquete',
      versions: versionsOf(view),
      acknowledgedWarnings: await warningsOf(t, reopened),
    })
    expect(refused.status).toBe(409)
    expect(code(refused.body)).toBe('sin_aprobar')
  })

  it('refuses a count of notices that is not the one worked out', async () => {
    const { t, id, view } = await withSteps()
    const warnings = await warningsOf(t, view)
    const wrong = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'paquete',
      versions: versionsOf(view),
      acknowledgedWarnings: warnings + 1,
    })
    expect(wrong.status).toBe(400)
    expect(code(wrong.body)).toBe('validacion')
    expect((await read(t, id)).status).toBe('textos_aprobados')
  })

  it('refuses versions that are not the last ones: another tab changed a piece', async () => {
    const { t, id, view } = await withSteps()
    const stale = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'paquete',
      versions: { ...versionsOf(view), etiquetas: view.pieces.etiquetas!.version + 1 },
      acknowledgedWarnings: await warningsOf(t, view),
    })
    expect(stale.status).toBe(409)
    expect(code(stale.body)).toBe('version_cambiada')
  })

  it('keeps the versions, the date, the draft and the notices left; an edit takes it back to draft', async () => {
    const { t, id, view } = await withSteps()
    const warnings = await warningsOf(t, view)
    const approved = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'paquete',
      versions: versionsOf(view),
      acknowledgedWarnings: warnings,
    })
    expect(approved.status).toBe(200)
    const after = approved.body as View
    expect(after.status).toBe('aprobado')
    expect(after.approvals.package).toEqual(versionsOf(view))
    expect(after.approvals.packageApprovedAt).toEqual(expect.any(String))
    expect(after.approvals.packageApprovedWarnings).toBe(warnings)
    const row = t.db.prepare('SELECT package_approved_draft AS draft FROM publish_package WHERE id = ?').get(id) as {
      draft: number
    }
    expect(row.draft).toBe((view['script'] as { approvedDraftVersion: number }).approvedDraftVersion)

    // Approving makes no version and costs nothing; editing a piece takes the package back to draft.
    expect(versionsOf(after)).toEqual(versionsOf(view))
    const edited = await save(t, id, 'comentario', after, { text: '¿Y tú cómo lo haces?' })
    expect(edited.status).toBe(200)
    expect((edited.body as View).status).toBe('textos_borrador')
  })
})

describe('the downloads (US3)', () => {
  it('give the package as a document, as data and the thumbnail brief apart, as files to keep', async () => {
    const { t, id, view } = await withSteps()
    const titleText = (view.pieces.titulos!.content['candidates'] as { id: string; text: string }[]).find(
      (candidate) => candidate.id === view.pieces.titulos!.content['main'],
    )!.text
    const md = await t.request('GET', `/api/packages/${id}/export?format=md`)
    expect(md.status).toBe(200)
    expect(md.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(md.headers.get('content-disposition')).toMatch(/^attachment; filename="publicacion-[a-z0-9-]+\.md"$/)
    const document = await md.text()
    expect(document).toContain(`# ${titleText}`)
    expect(document).toContain('## Descripción')
    expect(document).toContain('## Ajustes de YouTube Studio')

    const json = await t.request('GET', `/api/packages/${id}/export?format=json`)
    expect(json.headers.get('content-type')).toBe('application/json; charset=utf-8')
    const data = (await json.json()) as { version: number; packages: { titles: { main: string } }[] }
    expect(data.version).toBe(1)
    expect(data.packages[0]?.titles.main).toBe(titleText)

    const brief = await t.request('GET', `/api/packages/${id}/export?format=brief`)
    expect(brief.headers.get('content-disposition')).toMatch(/filename="miniatura-[a-z0-9-]+\.md"$/)
    const briefText = await brief.text()
    expect(briefText).toContain('# Indicaciones para la miniatura')
    expect(briefText).not.toContain('## Descripción')

    expect((await t.request('GET', `/api/packages/${id}/export?format=pdf`)).status).toBe(400)
  })

  it('give every package of the channel at once, without the brief', async () => {
    const { t, view } = await withSteps()
    const channelId = view['channelId'] as string
    const md = await t.request('GET', `/api/channels/${channelId}/packages/export?format=md`)
    expect(md.status).toBe(200)
    expect(md.headers.get('content-disposition')).toMatch(/filename="publicaciones-[a-z0-9-]+\.md"$/)
    expect(await md.text()).toContain('## Descripción')
    const json = await t.request('GET', `/api/channels/${channelId}/packages/export?format=json`)
    expect(((await json.json()) as { packages: unknown[] }).packages).toHaveLength(1)
    expect((await t.request('GET', `/api/channels/${channelId}/packages/export?format=brief`)).status).toBe(400)
    expect((await t.request('GET', '/api/channels/no-existe/packages/export?format=md')).status).toBe(404)
  })
})

describe('the idea shows its package (US3, R17)', () => {
  it('says the package status in the bank, and nothing changes the status of the idea', async () => {
    const { t, id, view, script } = await withSteps()
    const ideaOf = async () => {
      const ideas = (await call(t, 'GET', `/api/channels/${view['channelId'] as string}/ideas`)).body['ideas'] as {
        id: string
        status: string
        script: { packageStatus: string | null } | null
      }[]
      return ideas.find((idea) => idea.id === script.ideaId)!
    }
    expect((await ideaOf()).script?.packageStatus).toBe('textos_aprobados')
    await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'paquete',
      versions: versionsOf(view),
      acknowledgedWarnings: await warningsOf(t, view),
    })
    const idea = await ideaOf()
    expect(idea.script?.packageStatus).toBe('aprobado')
    expect(idea.status).toBe('elegida')
  })
})

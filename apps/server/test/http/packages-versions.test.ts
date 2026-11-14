import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedShort, openPackage, type TestApp, warningsOf } from './publish-flows.ts'

// The history of each piece: every version, what changes from the current one, and going back without losing any
// (US5, SC-008).
interface Piece<C = Record<string, unknown>> {
  version: number
  origin: string
  mainTitle: string | null
  draftVersion: number
  restoredFrom: number | null
  content: C
}
type Kind = 'titulos' | 'portada_short' | 'descripcion' | 'etiquetas' | 'comentario'
type View = Record<string, unknown> & { status: string; pieces: Record<Kind, Piece | null> }
interface Summary {
  version: number
  origin: string
  createdAt: string
  restoredFrom: number | null
}
interface Description {
  firstLines: string
  body: string
  hashtags: string[]
  fixedText: string
}

const SHORT_KINDS = ['titulos', 'portada_short', 'descripcion', 'etiquetas', 'comentario'] as const

const code = (body: unknown) => (body as { error: { code: string } }).error.code
const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/packages/${id}`)).body as View
const save = (t: TestApp, id: string, kind: string, baseVersion: number, content: unknown) =>
  call(t, 'PUT', `/api/packages/${id}/pieces/${kind}`, { baseVersion, content })
const list = async (t: TestApp, id: string, kind: string) =>
  (await call(t, 'GET', `/api/packages/${id}/versions?kind=${kind}`)).body as unknown as Summary[]
const restore = (t: TestApp, id: string, kind: string, version: number, baseVersion: number) =>
  call(t, 'POST', `/api/packages/${id}/versions/${kind}/${version}/restore`, { baseVersion })
const versionsOf = (view: View, kinds: readonly Kind[]) =>
  Object.fromEntries(kinds.map((kind) => [kind, view.pieces[kind]!.version]))

async function withPieces() {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { scriptId } = await approvedShort(t)
  const id = (await openPackage(t, scriptId)).body['id'] as string
  const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'paquete_short' })
  await call(t, 'POST', `/api/packages/${id}/generate`, {
    use: 'paquete_short',
    estimateId: estimate.body['estimateId'],
  })
  await vi.waitFor(async () => expect((await read(t, id)).pieces.descripcion).not.toBeNull())
  return { t, id, view: await read(t, id) }
}

// A description with four versions: the AI's and three edits of the body.
async function fourDescriptions() {
  const made = await withPieces()
  const { t, id } = made
  const first = made.view.pieces.descripcion as unknown as Piece<Description>
  for (const [index, body] of ['Segunda.', 'Tercera.', 'Cuarta.'].entries()) {
    const saved = await save(t, id, 'descripcion', index + 1, { ...first.content, body })
    expect(saved.status).toBe(200)
  }
  return { ...made, first }
}

describe('the history of a piece (US5)', () => {
  it('lists every version, from the newest, with its date and where it came from', async () => {
    const { t, id } = await fourDescriptions()
    const versions = await list(t, id, 'descripcion')
    expect(versions.map(({ version, origin }) => [version, origin])).toEqual([
      [4, 'edicion'],
      [3, 'edicion'],
      [2, 'edicion'],
      [1, 'ia'],
    ])
    expect(versions.every((one) => !Number.isNaN(Date.parse(one.createdAt)) && one.restoredFrom === null)).toBe(true)
  })

  it('says what is wrong with the request', async () => {
    const { t, id } = await withPieces()
    const kind = await call(t, 'GET', `/api/packages/${id}/versions?kind=otra`)
    expect(kind.status).toBe(400)
    expect(code(kind.body)).toBe('validacion')
    expect((await call(t, 'GET', `/api/packages/no-esta/versions?kind=titulos`)).status).toBe(404)
    expect((await call(t, 'GET', `/api/packages/${id}/versions/titulos/9`)).status).toBe(404)
    expect((await call(t, 'GET', `/api/packages/${id}/versions/titulos/dos`)).status).toBe(400)
    // A Short has no chapters: nothing to list.
    expect(await list(t, id, 'capitulos')).toEqual([])
  })

  it('opens an older version and says what changes from the current one', async () => {
    const { t, id } = await fourDescriptions()
    const opened = await call(t, 'GET', `/api/packages/${id}/versions/descripcion/2`)
    expect(opened.status).toBe(200)
    expect(opened.body).toMatchObject({
      version: { version: 2, origin: 'edicion', restoredFrom: null },
      content: { body: 'Segunda.' },
      comparison: {
        orderChanged: false,
        changes: expect.arrayContaining([
          {
            id: 'body',
            change: 'cambiado',
            title: '',
            // Both are the creator's edits: nothing is marked as the AI's.
            fromAi: false,
            before: [{ field: 'text', value: 'Segunda.' }],
            after: [{ field: 'text', value: 'Cuarta.' }],
          },
        ]),
      },
    })
  })

  it('goes back as a new version, and none is lost (SC-008)', async () => {
    const { t, id, first } = await fourDescriptions()
    const back = await restore(t, id, 'descripcion', 2, 4)
    expect(back.status).toBe(200)
    expect((back.body as View).pieces.descripcion).toMatchObject({
      version: 5,
      origin: 'recuperada',
      restoredFrom: 2,
      // What it was written for goes with it, so its notices are still true (R16).
      draftVersion: first.draftVersion,
      mainTitle: first.mainTitle,
      content: { ...first.content, body: 'Segunda.' },
    })
    const versions = await list(t, id, 'descripcion')
    expect(versions.map(({ version }) => version)).toEqual([5, 4, 3, 2, 1])
    expect(versions[0]).toMatchObject({ origin: 'recuperada', restoredFrom: 2 })
    expect(
      ((await call(t, 'GET', `/api/packages/${id}/versions/descripcion/4`)).body as { content: Description }).content
        .body,
    ).toBe('Cuarta.')
  })

  it('going back to the current version makes no new one', async () => {
    const { t, id } = await fourDescriptions()
    const same = await restore(t, id, 'descripcion', 4, 4)
    expect(same.status).toBe(200)
    expect((same.body as View).pieces.descripcion!.version).toBe(4)
    expect(await list(t, id, 'descripcion')).toHaveLength(4)
  })

  it('another tab went first: nothing is written', async () => {
    const { t, id } = await fourDescriptions()
    const stale = await restore(t, id, 'descripcion', 2, 3)
    expect(stale.status).toBe(409)
    expect(code(stale.body)).toBe('version_cambiada')
    const unknown = await restore(t, id, 'descripcion', 9, 4)
    expect(unknown.status).toBe(404)
    expect(await list(t, id, 'descripcion')).toHaveLength(4)
  })

  it('going back in an approved package takes it back to draft (FR-015)', async () => {
    const { t, id, view } = await withPieces()
    const titles = view.pieces.titulos as Piece<{ candidates: { id: string }[] }>
    await save(t, id, 'titulos', 1, { ...titles.content, main: titles.content.candidates[0]!.id })
    // The tags have an older version to go back to before anything is approved.
    await save(t, id, 'etiquetas', 1, { tags: ['otra'] })
    const latest = await read(t, id)
    await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'portada',
      versions: versionsOf(latest, ['titulos', 'portada_short']),
    })
    const texts = (
      await call(t, 'POST', `/api/packages/${id}/approve`, {
        step: 'textos',
        versions: versionsOf(latest, ['descripcion', 'etiquetas', 'comentario']),
      })
    ).body as View
    const approved = await call(t, 'POST', `/api/packages/${id}/approve`, {
      step: 'paquete',
      versions: versionsOf(texts, [...SHORT_KINDS]),
      acknowledgedWarnings: await warningsOf(t, texts),
    })
    expect((approved.body as View).status).toBe('aprobado')
    // Already the current one: nothing changes, and it stays approved.
    expect(((await restore(t, id, 'etiquetas', 2, 2)).body as View).status).toBe('aprobado')
    const restored = (await restore(t, id, 'etiquetas', 1, 2)).body as View
    expect(restored.status).toBe('textos_borrador')
    expect(restored.pieces.etiquetas).toMatchObject({ version: 3, origin: 'recuperada', restoredFrom: 1 })
    // The cover step is still approved: only the step of this piece goes back to draft.
    expect(restored.pieces.titulos!.version).toBe(2)
  })

  it('says what is wrong with going back', async () => {
    const { t, id } = await withPieces()
    const kind = await call(t, 'POST', `/api/packages/${id}/versions/otra/1/restore`, { baseVersion: 1 })
    expect(kind.status).toBe(400)
    expect(kind.body).toMatchObject({ error: { code: 'validacion', fields: { kind: 'no_valido' } } })
    const version = await call(t, 'POST', `/api/packages/${id}/versions/etiquetas/0/restore`, { baseVersion: 1 })
    expect(version.body).toMatchObject({ error: { code: 'validacion', fields: { version: 'no_valido' } } })
    const body = await call(t, 'POST', `/api/packages/${id}/versions/etiquetas/1/restore`, {})
    expect(body.status).toBe(400)
  })
})

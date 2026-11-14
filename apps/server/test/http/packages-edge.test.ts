import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, openPackage, reopenScript, type TestApp } from './publish-flows.ts'

// The edge cases of the spec (spec.md, «Edge Cases») that no other test of 006 goes through. Already covered elsewhere:
// a script back in draft (packages-base, packages-approve), very short blocks (core chapters.test), a fixed part too
// long and too few chapters (core review.test), two tabs (409 `version_cambiada` in every packages-* test), the
// channels' lists (packages-base) and an empty piece (packages-cover, review.test).
interface Piece {
  version: number
  origin: string
  content: Record<string, unknown>
}
type View = Record<string, unknown> & {
  status: string
  warnings: string[]
  job: { status: string; failure: string | null } | null
  pieces: Record<string, Piece | null>
}

const read = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/packages/${id}`)).body as View

async function ask(t: TestApp, id: string, use: string) {
  const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use })
  expect(estimate.status).toBe(200)
  const started = await call(t, 'POST', `/api/packages/${id}/generate`, {
    use,
    estimateId: estimate.body['estimateId'],
  })
  expect(started.status).toBe(202)
  await vi.waitFor(async () => expect((await read(t, id)).job?.status).not.toBe('en_curso'))
  return read(t, id)
}

const failWith = (t: TestApp, failure: string) => {
  t.channel.aiRun.run = (async () => ({ ok: false, failure })) as never
}

async function withPackage() {
  const t = makeTestApp({ fakeAi: 'ok' })
  const script = await approvedScript(t)
  const id = (await openPackage(t, script.scriptId)).body['id'] as string
  return { t, id, ...script }
}

// Titles asked for, and the first one chosen as main by the creator.
async function withTitles() {
  const made = await withPackage()
  const titles = (await ask(made.t, made.id, 'titulos')).pieces['titulos']!
  const candidates = titles.content['candidates'] as { id: string }[]
  const saved = await call(made.t, 'PUT', `/api/packages/${made.id}/pieces/titulos`, {
    baseVersion: titles.version,
    content: { ...titles.content, main: candidates[0]!.id },
  })
  expect(saved.status).toBe(200)
  return { ...made, titles: (saved.body as View).pieces['titulos']! }
}

describe('the script changes under the package', () => {
  it('approved again with other text: nothing changes on its own, it warns, and a piece can be asked for again', async () => {
    const { t, id, scriptId, draft } = await withTitles()
    expect((await read(t, id)).warnings).not.toContain('guion_cambiado')
    expect((await reopenScript(t, scriptId, draft)).status).toBe(200)
    const reopened = (await call(t, 'GET', `/api/scripts/${scriptId}`)).body['draft'] as {
      version: number
      content: { claims: { status: string }[] }
    }
    const approved = await call(t, 'POST', `/api/scripts/${scriptId}/draft/approve`, {
      version: reopened.version,
      acknowledgedPending: reopened.content.claims.filter((one) => one.status === 'pendiente').length,
    })
    expect(approved.status).toBe(200)
    const view = await read(t, id)
    expect(view.warnings).toContain('guion_cambiado')
    expect(view.pieces['titulos']).toMatchObject({ version: 2, origin: 'edicion' })
    // Remaking it has its price on screen, as any other request.
    const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'titulos' })
    expect(estimate.status).toBe(200)
    expect(estimate.body['cents']).toEqual(expect.any(Number))
    const again = await ask(t, id, 'titulos')
    expect(again.warnings).not.toContain('guion_cambiado')
  })

  it('claims approved as still to check are recalled, and stop nothing', async () => {
    const { t, id, draft } = await withPackage()
    const pending = draft.content.claims.filter((one) => one.status === 'pendiente').length
    expect(pending).toBeGreaterThan(0)
    const view = await read(t, id)
    expect(view.warnings).toContain('pendientes_en_guion')
    expect((await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'titulos' })).body['blockedBy']).toBeNull()
  })
})

describe('the idea leaves the queue', () => {
  it.each(['hecha', 'archivada', 'banco'])('back to «%s», its package is kept and still opens', async (status) => {
    const { t, id, ideaId, scriptId } = await withTitles()
    const { revision } = (await call(t, 'GET', `/api/scripts/${scriptId}`)).body['idea'] as { revision: number }
    expect((await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision, status })).status).toBe(200)
    const view = await read(t, id)
    expect(view.pieces['titulos']).toMatchObject({ version: 2 })
    expect((await openPackage(t, scriptId)).body['id']).toBe(id)
    const listed = (await call(t, 'GET', `/api/channels/${view['channelId'] as string}/packages`)).body as unknown as {
      id: string
    }[]
    expect(listed.map((one) => one.id)).toContain(id)
  })
})

describe('what is asked of the AI', () => {
  it('past the spending limit the price says so, and nothing is spent or written', async () => {
    const { t, id } = await withPackage()
    const limits = await call(t, 'PUT', '/api/settings/limits', {
      perOperationCents: 1,
      dailyCents: 1,
      monthlyCents: 1,
    })
    expect(limits.status).toBe(200)
    const estimate = await call(t, 'POST', `/api/packages/${id}/estimate`, { use: 'titulos' })
    expect(estimate.body['blockedBy']).not.toBeNull()
    const started = await call(t, 'POST', `/api/packages/${id}/generate`, {
      use: 'titulos',
      estimateId: estimate.body['estimateId'],
    })
    expect(started.status).toBe(202)
    await vi.waitFor(async () => expect((await read(t, id)).job?.status).not.toBe('en_curso'))
    const view = await read(t, id)
    expect(view.job).toMatchObject({ status: 'fallido', failure: 'limite_de_gasto' })
    expect(view.pieces['titulos']).toBeNull()
    expect(t.usage.list().filter((row) => row.use === 'titulos')).toMatchObject([
      { outcome: 'limite_de_gasto', costCents: 0 },
    ])
  })

  it.each([
    'sin_sesion',
    'cupo_agotado',
    'tiempo_agotado',
    'contenido_filtrado',
    'no_disponible',
    'respuesta_invalida',
  ])('titles asked for again that fail with %s keep what the creator chose', async (failure) => {
    const { t, id, titles } = await withTitles()
    failWith(t, failure)
    const view = await ask(t, id, 'titulos')
    expect(view.job).toMatchObject({ status: 'fallido', failure })
    expect(view.pieces['titulos']).toEqual(titles)
  })
})

describe('several channels', () => {
  it('each channel has its own fixed part', async () => {
    const { t, id } = await withPackage()
    const channelId = (await read(t, id))['channelId'] as string
    const second = t.channels.create({ origin: 'nuevo' })
    const before = (await call(t, 'GET', `/api/channels/${second.id}/publish-settings`)).body['fixedText']
    const saved = await call(t, 'PUT', `/api/channels/${channelId}/publish-settings`, {
      fixedText: 'Solo de este canal.',
      category: null,
    })
    expect(saved.status).toBe(200)
    expect((await call(t, 'GET', `/api/channels/${second.id}/publish-settings`)).body['fixedText']).toBe(before)
    expect((await call(t, 'GET', `/api/channels/${second.id}/packages`)).body).toEqual([])
  })
})

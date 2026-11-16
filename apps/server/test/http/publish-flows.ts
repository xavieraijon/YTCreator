import { expect, vi } from 'vitest'
import type { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

// What the tests of the publishing package start from: a script approved with the fake AI (006).
export type TestApp = ReturnType<typeof makeTestApp>

interface Draft {
  version: number
  content: {
    blocks: { id: string; title: string; text: string; visual: string }[]
    claims: { id: string; status: string }[]
  }
}

const readScript = async (t: TestApp, id: string) => (await call(t, 'GET', `/api/scripts/${id}`)).body

async function ask(t: TestApp, id: string, use: string) {
  const estimate = await call(t, 'POST', `/api/scripts/${id}/estimate`, { use })
  await call(t, 'POST', `/api/scripts/${id}/generate`, { use, estimateId: estimate.body['estimateId'] })
  await vi.waitFor(async () => {
    expect(((await readScript(t, id))['job'] as { status: string }).status).not.toBe('en_curso')
  })
  return readScript(t, id)
}

/** A reference the creator wrote by hand, with no link (005). */
export const CREATOR_REFERENCE = 'Libro «El pan de casa», página 12'

// The facts of the script: what the fake AI found, plus a reference of the creator's.
async function research(t: TestApp, scriptId: string) {
  const facts = (await ask(t, scriptId, 'investigacion'))['facts'] as { version: number; content: { facts: unknown[] } }
  const mine = {
    id: 'referencia-del-creador',
    text: 'Lo cuenta un libro que tengo en casa.',
    label: 'del_creador',
    origin: 'creador',
    sources: [
      { id: 'libro', url: null, reference: CREATOR_REFERENCE, title: '', accessedAt: '2026-11-10', link: null },
    ],
    alternatives: null,
  }
  const saved = await call(t, 'PUT', `/api/scripts/${scriptId}/facts`, {
    baseVersion: facts.version,
    content: { facts: [...facts.content.facts, mine] },
  })
  expect(saved.status).toBe(200)
}

/** A script with its draft written, not approved yet; with `facts`, researched first. */
export async function writtenScript(
  t: TestApp,
  title = 'Pan sin amasar',
  format: 'largo' | 'short' = 'largo',
  { facts = false, channelId: existing }: { facts?: boolean; channelId?: string } = {},
) {
  // Another script of the same channel, when it is given: the app has one channel.
  const channelId = existing ?? (await finished(t)).channelId
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title, format })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const scriptId = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  if (facts) await research(t, scriptId)
  const outline = (await ask(t, scriptId, 'escaleta'))['outline'] as { version: number }
  await call(t, 'POST', `/api/scripts/${scriptId}/outline/approve`, { version: outline.version })
  const draft = (await ask(t, scriptId, 'guion'))['draft'] as Draft
  return { channelId, ideaId, scriptId, draft }
}

/** A script approved with whatever claims were left to check. */
export async function approvedScript(
  t: TestApp,
  title?: string,
  options: { facts?: boolean; channelId?: string } = {},
) {
  const written = await writtenScript(t, title, 'largo', options)
  const { scriptId, draft } = written
  const approved = await call(t, 'POST', `/api/scripts/${scriptId}/draft/approve`, {
    version: draft.version,
    acknowledgedPending: draft.content.claims.filter((one) => one.status === 'pendiente').length,
  })
  expect(approved.status).toBe(200)
  return written
}

/** Edits the approved draft, which takes the script back to draft. */
export const reopenScript = (t: TestApp, scriptId: string, draft: Draft) => {
  const [first, ...rest] = draft.content.blocks
  const blocks = [{ ...first!, visual: `${first!.visual} Plano corto.` }, ...rest]
  return call(t, 'PUT', `/api/scripts/${scriptId}/draft`, {
    baseVersion: draft.version,
    content: { ...draft.content, blocks },
  })
}

export const openPackage = (t: TestApp, scriptId: string) => call(t, 'POST', `/api/scripts/${scriptId}/package`)

/**
 * A Short written and approved with the fake AI. `fromLong`: drawn from an approved long video (005), whose idea title is
 * `Pan sin amasar`; otherwise an idea of its own.
 */
export async function approvedShort(t: TestApp, { fromLong = true }: { fromLong?: boolean } = {}) {
  let scriptId: string
  let longScriptId: string | null = null
  if (fromLong) {
    longScriptId = (await approvedScript(t)).scriptId
    await ask(t, longScriptId, 'enfoques_short')
    const chosen = await call(t, 'POST', `/api/scripts/${longScriptId}/short-angles/0/choose`, {
      baseUpdatedAt: (await readScript(t, longScriptId))['updatedAt'],
    })
    expect(chosen.status).toBe(201)
    scriptId = chosen.body['scriptId'] as string
  } else {
    const { channelId } = await finished(t)
    const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, {
      title: 'Pan en un minuto',
      format: 'short',
    })
    const ideaId = (made.body['idea'] as { id: string }).id
    await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
    scriptId = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  }
  const draft = (await ask(t, scriptId, 'guion_short'))['draft'] as Draft
  const approved = await call(t, 'POST', `/api/scripts/${scriptId}/draft/approve`, {
    version: draft.version,
    acknowledgedPending: draft.content.claims.filter((one) => one.status === 'pendiente').length,
  })
  expect(approved.status).toBe(200)
  return { scriptId, longScriptId, draft }
}

interface ReviewedView {
  id: string
  format: 'largo' | 'short'
  warnings: readonly string[]
  pieces: Record<string, { content: unknown } | null>
  script: { blocks: readonly { seconds: number }[] }
  texts: { chapters: unknown; assembled: string | null }
}

/** How many notices the creator sees before approving the package: the count the server checks (FR-013). */
export async function warningsOf(t: TestApp, body: object) {
  const view = body as ReviewedView
  const { reviewPackage, warningNotices, formatKinds } = await import('@ytcreator/core')
  const rules = (await call(t, 'GET', `/api/packages/${view.id}/review`)).body['rules']
  const notices = reviewPackage(
    {
      format: view.format,
      pieces: Object.fromEntries(formatKinds(view.format).map((kind) => [kind, view.pieces[kind]?.content ?? null])),
      chapters: view.texts.chapters,
      scriptSeconds: view.script.blocks.reduce((sum, block) => sum + block.seconds, 0),
      assembled: view.texts.assembled,
    } as Parameters<typeof reviewPackage>[0],
    rules as Parameters<typeof reviewPackage>[1],
  )
  return warningNotices(notices).length + view.warnings.length
}

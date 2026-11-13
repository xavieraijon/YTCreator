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

/** A script with its draft written, not approved yet. */
export async function writtenScript(t: TestApp, title = 'Pan sin amasar', format: 'largo' | 'short' = 'largo') {
  const { channelId } = await finished(t)
  const made = await call(t, 'POST', `/api/channels/${channelId}/ideas`, { title, format })
  const ideaId = (made.body['idea'] as { id: string }).id
  await call(t, 'PATCH', `/api/ideas/${ideaId}`, { revision: 1, status: 'elegida' })
  const scriptId = (await call(t, 'POST', `/api/ideas/${ideaId}/script`)).body['id'] as string
  const outline = (await ask(t, scriptId, 'escaleta'))['outline'] as { version: number }
  await call(t, 'POST', `/api/scripts/${scriptId}/outline/approve`, { version: outline.version })
  const draft = (await ask(t, scriptId, 'guion'))['draft'] as Draft
  return { channelId, ideaId, scriptId, draft }
}

/** A script approved with whatever claims were left to check. */
export async function approvedScript(t: TestApp, title?: string) {
  const written = await writtenScript(t, title)
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

import { expect } from '@playwright/test'
import type { TestServer } from './server.ts'

export type Body = Record<string, unknown>

// The API as the page calls it (the server only takes changes from its own origin).
export async function api(server: TestServer, method: string, path: string, body?: unknown): Promise<Body> {
  const response = await fetch(`${server.baseURL}${path}`, {
    method,
    headers: { origin: server.baseURL, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(response.ok, `${method} ${path}`).toBe(true)
  const text = await response.text()
  return (text ? JSON.parse(text) : {}) as Body
}

// A new channel all the way to its profile, with the fakes, so a test can start at «Mi canal».
export async function profileByApi(server: TestServer) {
  const created = await api(server, 'POST', '/api/channels', { origin: 'nuevo' })
  const id = (created['journey'] as { id: string }).id
  const revision = async () => (await api(server, 'GET', `/api/journeys/${id}`))['revision']
  const step = async (to: string, extra: Body = {}) =>
    api(server, 'POST', `/api/journeys/${id}/step`, { revision: await revision(), step: to, ...extra })
  const propose = async (kind: string) => {
    const estimate = await api(server, 'POST', `/api/journeys/${id}/estimate`, { use: kind })
    return api(server, 'POST', `/api/journeys/${id}/proposals`, {
      revision: await revision(),
      kind,
      estimateId: estimate['estimateId'],
    })
  }
  const choose = (proposal: Body, index = 0) =>
    api(server, 'PATCH', `/api/proposals/${String(proposal['id'])}`, { selectedIndex: index, status: 'aprobada' })

  await step('preguntas', { data: { interests: 'Me gusta cocinar y explicar recetas.' } })
  await step('nichos', { data: { answers: [] } })
  const niches = await propose('nichos')
  const [first] = (niches['payload'] as { niches: { label: string; queries: string[] }[] }).niches
  await api(server, 'POST', `/api/journeys/${id}/measures`, {
    revision: await revision(),
    niches: [{ label: first!.label, queries: first!.queries }],
  })
  await expect
    .poll(async () => {
      const measures = (await api(server, 'GET', `/api/journeys/${id}`))['measures'] as { status: string }[]
      return measures[0]?.status
    })
    .toBe('medida')
  await choose(niches)
  await step('ritmo')
  await step('conceptos', { data: { hoursPerWeek: 8, onCamera: 'voz', audienceRegion: 'espana' } })
  await choose(await propose('conceptos'))
  await step('nombres')
  await choose(await propose('nombres'), 1)
  await step('hecho')
}

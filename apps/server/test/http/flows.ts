import { journeyViewSchema, proposalSchema } from '@ytcreator/core/api'
import { expect, vi } from 'vitest'
import type { makeTestApp } from '../helpers.ts'

// The journey of a new channel, all the way to its approved profile, shared by the tests that need one.
type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown>

export async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : null) as Body }
}
export const view = async (t: TestApp, id: string) =>
  journeyViewSchema.parse((await call(t, 'GET', `/api/journeys/${id}`)).body)
export async function step(t: TestApp, id: string, to: string, extra: Body = {}) {
  const { revision } = await view(t, id)
  return call(t, 'POST', `/api/journeys/${id}/step`, { revision, step: to, ...extra })
}
export async function propose(t: TestApp, id: string, kind: string) {
  const { revision } = await view(t, id)
  const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: kind })
  const created = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
    revision,
    kind,
    estimateId: estimate.body['estimateId'],
  })
  return proposalSchema.parse(created.body)
}
export const choose = (t: TestApp, id: string, index = 0) =>
  call(t, 'PATCH', `/api/proposals/${id}`, { selectedIndex: index, status: 'aprobada' })

// A new channel all the way to the end, with its niche measured, so the profile has figures behind it.
export async function finished(t: TestApp, { nameLater = false } = {}) {
  await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 500, dailyCents: 1000, monthlyCents: 5000 })
  await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: 'sk-ant-api03-FAKE-profile-0123456789' })
  await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })
  const created = await call(t, 'POST', '/api/channels', { origin: 'nuevo' })
  const id = (created.body['journey'] as { id: string }).id
  const channelId = (created.body['channel'] as { id: string }).id
  await step(t, id, 'preguntas', { data: { interests: 'Me gusta cocinar y explicar recetas.' } })
  await step(t, id, 'nichos', { data: { answers: [] } })
  const niches = await propose(t, id, 'nichos')
  const [first] = (niches.payload as { niches: { label: string; queries: string[] }[] }).niches
  const { revision } = await view(t, id)
  await call(t, 'POST', `/api/journeys/${id}/measures`, {
    revision,
    niches: [{ label: first!.label, queries: first!.queries }],
  })
  await vi.waitFor(async () => {
    expect((await view(t, id)).measures.find((m) => m.nicheLabel === first!.label)?.status).toBe('medida')
  })
  await choose(t, niches.id)
  await step(t, id, 'ritmo')
  await step(t, id, 'conceptos', { data: { hoursPerWeek: 8, onCamera: 'voz', audienceRegion: 'espana' } })
  await choose(t, (await propose(t, id, 'conceptos')).id)
  await step(t, id, 'nombres')
  if (!nameLater) await choose(t, (await propose(t, id, 'nombres')).id, 1)
  expect((await step(t, id, 'hecho', nameLater ? { nameLater: true } : {})).status).toBe(200)
  return { journeyId: id, channelId }
}

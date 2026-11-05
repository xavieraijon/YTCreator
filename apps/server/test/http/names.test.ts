import { journeyViewSchema, proposalSchema } from '@ytcreator/core/api'
import { channelProfileSchema } from '@ytcreator/core'
import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown>

async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  return { status: response.status, body: (await response.json()) as Body }
}
const view = async (t: TestApp, id: string) =>
  journeyViewSchema.parse((await call(t, 'GET', `/api/journeys/${id}`)).body)
async function step(t: TestApp, id: string, to: string, extra: Body = {}) {
  const { revision } = await view(t, id)
  return call(t, 'POST', `/api/journeys/${id}/step`, { revision, step: to, ...extra })
}
async function propose(t: TestApp, id: string, kind: string) {
  const { revision } = await view(t, id)
  const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: kind })
  return proposalSchema.parse(
    (
      await call(t, 'POST', `/api/journeys/${id}/proposals`, {
        revision,
        kind,
        estimateId: estimate.body['estimateId'],
      })
    ).body,
  )
}
const choose = (t: TestApp, id: string, index = 0) =>
  call(t, 'PATCH', `/api/proposals/${id}`, { selectedIndex: index, status: 'aprobada' })

async function atNames(t: TestApp) {
  await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 500, dailyCents: 1000, monthlyCents: 5000 })
  await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: 'sk-ant-api03-FAKE-names-0123456789' })
  await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })
  const created = await call(t, 'POST', '/api/channels', { origin: 'nuevo' })
  const id = (created.body['journey'] as { id: string }).id
  await step(t, id, 'preguntas', { data: { interests: 'Me gusta cocinar y explicar recetas.' } })
  await step(t, id, 'nichos', { data: { answers: [] } })
  await choose(t, (await propose(t, id, 'nichos')).id)
  await step(t, id, 'ritmo')
  await step(t, id, 'conceptos', { data: { hoursPerWeek: 8, onCamera: 'voz', audienceRegion: 'espana' } })
  await choose(t, (await propose(t, id, 'conceptos')).id)
  await step(t, id, 'nombres')
  return id
}

const current = async (t: TestApp) => (await call(t, 'GET', '/api/channels/current')).body
const channelOf = async (t: TestApp) => (await current(t))['channel'] as Record<string, unknown>

describe('POST /api/journeys/:id/name-checks', () => {
  it('answers 202 with the job, and the checks show up in the journey', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    const { revision } = await view(t, id)
    const started = await call(t, 'POST', `/api/journeys/${id}/name-checks`, {
      revision,
      names: [
        { displayName: 'Nombre Libre', handle: 'nombrelibre', origin: 'ia' },
        { displayName: 'Mi Nombre', handle: 'ocupado1', origin: 'creador' },
      ],
    })
    expect(started.status).toBe(202)
    expect(started.body['jobId']).toBeTruthy()
    await vi.waitFor(async () => {
      expect((await view(t, id)).nameChecks).toHaveLength(2)
    })
    const checks = (await view(t, id)).nameChecks
    expect(checks.find((c) => c.handle === 'ocupado1')).toMatchObject({ semaphore: 'rojo', origin: 'creador' })
  })

  it('an old revision → 409; a bad @ → 400', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    const { revision } = await view(t, id)
    const name = { displayName: 'Uno', handle: 'unouno', origin: 'ia' }
    expect(
      (await call(t, 'POST', `/api/journeys/${id}/name-checks`, { revision: revision + 1, names: [name] })).status,
    ).toBe(409)
    const bad = await call(t, 'POST', `/api/journeys/${id}/name-checks`, {
      revision,
      names: [{ ...name, handle: 'a b' }],
    })
    expect(bad.status).toBe(400)
  })
})

describe('the end of the journey', () => {
  it('without a name chosen or left for later it does not finish', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    expect((await step(t, id, 'hecho')).status).not.toBe(200)
  })

  it('the profile keeps the figures of the journey as it stands, and how sure they are', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    const names = await propose(t, id, 'nombres')
    await choose(t, names.id, 1)

    const chosen = (await view(t, id)).proposals.findLast((p) => p.kind === 'conceptos')!
    const { concepts } = chosen.payload as { concepts: { figures: { monetization: { rpmEurRange: unknown } } }[] }
    const written = concepts[0]!.figures.monetization.rpmEurRange

    await step(t, id, 'conceptos')
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { audienceRegion: 'latam' } })
    await step(t, id, 'nombres')
    expect((await step(t, id, 'hecho')).status).toBe(200)

    const channel = await channelOf(t)
    const { concept } = channelProfileSchema.parse(t.channel.profiles.getCurrent(String(channel['id']))!.profile)
    expect(concept.audience.region).toBe('latam')
    expect(concept.monetization.rpmEurRange).not.toEqual(written)
    expect(concept.monetization.confidence).toBe('baja')
  })

  it('the region the creator set by hand on the chosen concept reaches the profile', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    const shown = (await view(t, id)).proposals.findLast((p) => p.kind === 'conceptos')!
    const { concepts } = shown.payload as { concepts: { audience: { region: string } }[] }
    concepts[0]!.audience.region = 'mixto'
    concepts[1]!.audience.region = 'mixto'
    await call(t, 'PATCH', `/api/proposals/${shown.id}`, { editedPayload: { concepts } })
    const names = await propose(t, id, 'nombres')
    await choose(t, names.id, 1)
    expect((await step(t, id, 'hecho')).status).toBe(200)
    const channel = await channelOf(t)
    const { concept } = channelProfileSchema.parse(t.channel.profiles.getCurrent(String(channel['id']))!.profile)
    expect(concept.audience.region).toBe('mixto')
  })

  it('choosing a name saves profile version 1, from the AI, complete', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    const names = await propose(t, id, 'nombres')
    const { names: list } = names.payload as { names: { displayName: string; handle: string }[] }
    await choose(t, names.id, 1)
    expect((await step(t, id, 'hecho')).status).toBe(200)

    const channel = await channelOf(t)
    expect(channel).toMatchObject({
      displayName: list[1]!.displayName,
      handle: list[1]!.handle,
      nameStatus: 'elegido',
    })
    const version = t.channel.profiles.getCurrent(String(channel['id']))!
    expect(version).toMatchObject({ version: 1, origin: 'ia' })
    const profile = channelProfileSchema.parse(version.profile)
    expect(profile.name).toMatchObject({ displayName: list[1]!.displayName, status: 'elegido' })
    expect(profile.concept.promise).toBeTruthy()
    expect(profile.sources.map((s) => s.id)).toEqual(expect.arrayContaining(['rpm', 'ypp']))
    expect((await view(t, id)).step).toBe('hecho')
  })

  it('«Decidir más tarde» keeps a provisional name and can come back to choose it (FR-018b)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    expect((await step(t, id, 'hecho', { nameLater: true })).status).toBe(200)
    let channel = await channelOf(t)
    expect(channel).toMatchObject({ displayName: null, handle: null, nameStatus: 'provisional' })
    const first = t.channel.profiles.getCurrent(String(channel['id']))!
    expect(channelProfileSchema.parse(first.profile).name).toMatchObject({ displayName: null, status: 'provisional' })

    expect((await step(t, id, 'nombres')).status).toBe(200)
    expect((await current(t))['journey']).toMatchObject({ status: 'activo', step: 'nombres' })
    const names = await propose(t, id, 'nombres')
    await choose(t, names.id, 0)
    expect((await step(t, id, 'hecho')).status).toBe(200)
    channel = await channelOf(t)
    expect(channel['nameStatus']).toBe('elegido')
    expect(t.channel.profiles.getCurrent(String(channel['id']))).toMatchObject({ version: 2, origin: 'manual' })
  })

  it('a chosen name cannot go back from the end', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    await choose(t, (await propose(t, id, 'nombres')).id, 0)
    await step(t, id, 'hecho')
    expect((await step(t, id, 'nombres')).status).not.toBe(200)
  })

  it('the creator can add a name of their own to the list', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atNames(t)
    const names = await propose(t, id, 'nombres')
    const { names: list } = names.payload as { names: object[] }
    const mine = { displayName: 'El mío', handle: 'elmio', why: 'Lo has escrito tú.' }
    const all = [...list, mine, { ...mine, handle: 'elmio2' }, { ...mine, handle: 'elmio3' }]
    const saved = await call(t, 'PATCH', `/api/proposals/${names.id}`, { editedPayload: { names: all } })
    expect(saved.status).toBe(200)
  })
})

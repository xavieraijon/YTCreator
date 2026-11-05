import { channelProfileSchema, type ChannelProfile } from '@ytcreator/core'
import { channelSchema, journeyViewSchema, profileVersionSchema, proposalSchema } from '@ytcreator/core/api'
import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown>

async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : null) as Body }
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
  const created = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
    revision,
    kind,
    estimateId: estimate.body['estimateId'],
  })
  return proposalSchema.parse(created.body)
}
const choose = (t: TestApp, id: string, index = 0) =>
  call(t, 'PATCH', `/api/proposals/${id}`, { selectedIndex: index, status: 'aprobada' })

// A new channel all the way to the end, with its niche measured, so the profile has figures behind it.
async function finished(t: TestApp, { nameLater = false } = {}) {
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

const versionOf = async (t: TestApp, channelId: string, v: number) =>
  profileVersionSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/profile/versions/${v}`)).body)

const edited = (profile: ChannelProfile, promise: string): ChannelProfile => ({
  ...profile,
  concept: { ...profile.concept, promise },
})

describe('GET /api/channels/:id/profile/versions', () => {
  it('lists every version with its origin and date, and each one can be read whole', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const list = await call(t, 'GET', `/api/channels/${channelId}/profile/versions`)
    expect(list.status).toBe(200)
    expect(list.body).toEqual([{ version: 1, origin: 'ia', createdAt: expect.any(String) }])
    const one = await versionOf(t, channelId, 1)
    expect(one.version).toBe(1)
    expect(channelProfileSchema.safeParse(one.profile).success).toBe(true)
  })

  it('an unknown channel or version → 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    expect((await call(t, 'GET', '/api/channels/nada/profile/versions')).status).toBe(404)
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/versions/9`)).status).toBe(404)
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/versions/uno`)).status).toBe(404)
  })
})

describe('PUT /api/channels/:id/profile', () => {
  it('saves a new manual version and makes it the current one', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = await versionOf(t, channelId, 1)
    const saved = await call(t, 'PUT', `/api/channels/${channelId}/profile`, {
      baseVersion: 1,
      profile: edited(base.profile, 'Cenas de diario en 15 minutos.'),
    })
    expect(saved.status).toBe(200)
    expect(profileVersionSchema.parse(saved.body)).toMatchObject({ version: 2, origin: 'manual' })
    const current = await call(t, 'GET', '/api/channels/current')
    expect((current.body['profile'] as { version: number }).version).toBe(2)
    expect((await versionOf(t, channelId, 2)).profile.concept.promise).toBe('Cenas de diario en 15 minutos.')
  })

  it('a base that is no longer the current version → 409 with the current one; nothing is saved', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = await versionOf(t, channelId, 1)
    await call(t, 'PUT', `/api/channels/${channelId}/profile`, {
      baseVersion: 1,
      profile: edited(base.profile, 'Una.'),
    })
    const late = await call(t, 'PUT', `/api/channels/${channelId}/profile`, {
      baseVersion: 1,
      profile: edited(base.profile, 'Otra.'),
    })
    expect(late.status).toBe(409)
    expect((late.body['error'] as { code: string }).code).toBe('conflicto')
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/versions`)).body).toHaveLength(2)
  })

  it('what comes from YouTube, the knowledge or the name is kept from the base, whatever is sent (principle V)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = (await versionOf(t, channelId, 1)).profile
    const forged: ChannelProfile = {
      ...base,
      niche: { ...base.niche, measureId: 'otra' },
      concept: {
        ...edited(base, 'Nueva promesa.').concept,
        monetization: {
          ...base.concept.monetization,
          rpmEurRange: { min: 90, max: 99 },
          monthlyViewsAssumption: null,
          monthlyEurRange: null,
        },
        warnings: [],
      },
      name: { displayName: 'Otro Nombre', handle: 'otronombre', status: 'elegido', checkId: null },
      sources: [],
    }
    const saved = await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: forged })
    expect(saved.status).toBe(200)
    const { profile } = profileVersionSchema.parse(saved.body)
    expect(profile.concept.promise).toBe('Nueva promesa.')
    expect(profile.niche.measureId).toBe(base.niche.measureId)
    expect(profile.concept.monetization).toEqual(base.concept.monetization)
    expect(profile.concept.warnings).toEqual(base.concept.warnings)
    expect(profile.name).toEqual(base.name)
    expect(profile.sources).toEqual(base.sources)
  })

  it('a profile that does not fit the shape → 400', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = (await versionOf(t, channelId, 1)).profile
    const bad = { ...base, concept: { ...base.concept, pillars: base.concept.pillars.slice(0, 2) } }
    expect((await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: bad })).status).toBe(
      400,
    )
  })
})

describe('POST /api/channels/:id/profile/restore', () => {
  it('two edits and back to the first: version 4 «restaurada» from 1, and 2 and 3 are still there', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const first = await versionOf(t, channelId, 1)
    await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: edited(first.profile, 'A.') })
    await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 2, profile: edited(first.profile, 'B.') })
    const restored = await call(t, 'POST', `/api/channels/${channelId}/profile/restore`, { version: 1 })
    expect(restored.status).toBe(200)
    expect(profileVersionSchema.parse(restored.body)).toMatchObject({
      version: 4,
      origin: 'restaurada',
      restoredFrom: 1,
    })
    expect((await versionOf(t, channelId, 4)).profile).toEqual(first.profile)
    const list = (await call(t, 'GET', `/api/channels/${channelId}/profile/versions`)).body as unknown as {
      version: number
      origin: string
    }[]
    expect(list.map((v) => [v.version, v.origin])).toEqual([
      [1, 'ia'],
      [2, 'manual'],
      [3, 'manual'],
      [4, 'restaurada'],
    ])
  })

  it('a version that does not exist → 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    expect((await call(t, 'POST', `/api/channels/${channelId}/profile/restore`, { version: 7 })).status).toBe(404)
  })
})

describe('PATCH /api/channels/:id/name', () => {
  it('with a check of that name: the channel and a new profile version take it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t)
    const { revision } = await view(t, journeyId)
    await call(t, 'POST', `/api/journeys/${journeyId}/name-checks`, {
      revision,
      names: [{ displayName: 'Nombre Libre', handle: 'nombrelibre', origin: 'creador' }],
    })
    await vi.waitFor(async () => {
      expect((await view(t, journeyId)).nameChecks.some((c) => c.handle === 'nombrelibre')).toBe(true)
    })
    const check = (await view(t, journeyId)).nameChecks.find((c) => c.handle === 'nombrelibre')!
    const renamed = await call(t, 'PATCH', `/api/channels/${channelId}/name`, {
      displayName: 'Nombre Libre',
      handle: 'nombrelibre',
      checkId: check.id,
    })
    expect(renamed.status).toBe(200)
    expect(channelSchema.parse(renamed.body)).toMatchObject({
      displayName: 'Nombre Libre',
      handle: 'nombrelibre',
      nameStatus: 'elegido',
    })
    const latest = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(latest).toMatchObject({ version: 2, origin: 'manual' })
    expect(latest.profile.name).toEqual({
      displayName: 'Nombre Libre',
      handle: 'nombrelibre',
      status: 'elegido',
      checkId: check.id,
    })
  })

  it('a check of another name, or of nothing → 400; a bad @ → 400', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const name = { displayName: 'Nombre Libre', handle: 'nombrelibre' }
    expect((await call(t, 'PATCH', `/api/channels/${channelId}/name`, { ...name, checkId: 'nada' })).status).toBe(400)
    expect((await call(t, 'PATCH', `/api/channels/${channelId}/name`, { ...name, handle: 'a b' })).status).toBe(400)
  })

  it('without a profile yet → 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const created = await call(t, 'POST', '/api/channels', { origin: 'nuevo' })
    const channelId = (created.body['channel'] as { id: string }).id
    const renamed = await call(t, 'PATCH', `/api/channels/${channelId}/name`, {
      displayName: 'Nombre Libre',
      handle: 'nombrelibre',
    })
    expect(renamed.status).toBe(404)
  })
})

describe('GET /api/channels/:id/export', () => {
  it('md and json: a download named after the channel, with «Fuentes» and the same profile', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const md = await t.request('GET', `/api/channels/${channelId}/export?format=md`)
    expect(md.status).toBe(200)
    expect(md.headers.get('content-type')).toContain('text/markdown')
    expect(md.headers.get('content-disposition')).toMatch(/^attachment; filename="perfil-[a-z0-9-]+\.md"$/)
    const markdown = await md.text()
    expect(markdown).toContain('## Fuentes')

    const json = await t.request('GET', `/api/channels/${channelId}/export?format=json`)
    expect(json.status).toBe(200)
    expect(json.headers.get('content-type')).toContain('application/json')
    expect(json.headers.get('content-disposition')).toMatch(/^attachment; filename="perfil-[a-z0-9-]+\.json"$/)
    const data = (await json.json()) as { schemaVersion: number; profile: unknown; measures: { id: string }[] }
    expect(data.schemaVersion).toBe(1)
    const current = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(data.profile).toEqual(current.profile)
    expect(data.measures.map((m) => m.id)).toEqual([current.profile.niche.measureId])
  })

  it('a format that is not md or json → 400; a channel without a profile → 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    expect((await t.request('GET', `/api/channels/${channelId}/export?format=pdf`)).status).toBe(400)
    const other = makeTestApp({ fakeAi: 'ok' })
    const created = await call(other, 'POST', '/api/channels', { origin: 'nuevo' })
    const empty = (created.body['channel'] as { id: string }).id
    expect((await other.request('GET', `/api/channels/${empty}/export?format=md`)).status).toBe(404)
  })

  it('costs nothing: no AI call is recorded', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const before = t.usage.list().length
    await t.request('GET', `/api/channels/${channelId}/export?format=md`)
    await t.request('GET', `/api/channels/${channelId}/export?format=json`)
    expect(t.usage.list()).toHaveLength(before)
  })
})

describe('choosing the name later keeps what was edited in the profile', () => {
  it('a manual edit survives coming back to choose the name', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t, { nameLater: true })
    const base = await versionOf(t, channelId, 1)
    await call(t, 'PUT', `/api/channels/${channelId}/profile`, {
      baseVersion: 1,
      profile: edited(base.profile, 'Escrita por mí.'),
    })
    expect((await step(t, journeyId, 'nombres')).status).toBe(200)
    await choose(t, (await propose(t, journeyId, 'nombres')).id, 1)
    expect((await step(t, journeyId, 'hecho')).status).toBe(200)
    const latest = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(latest.version).toBe(3)
    expect(latest.profile.concept.promise).toBe('Escrita por mí.')
    expect(latest.profile.name.status).toBe('elegido')
  })
})

describe('choosing the name later after going back in the journey', () => {
  it('another concept chosen on the way: the profile is the journey one, and the edit stays in the history', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t, { nameLater: true })
    const base = await versionOf(t, channelId, 1)
    await call(t, 'PUT', `/api/channels/${channelId}/profile`, {
      baseVersion: 1,
      profile: edited(base.profile, 'Escrita por mí.'),
    })
    expect((await step(t, journeyId, 'nombres')).status).toBe(200)
    expect((await step(t, journeyId, 'conceptos')).status).toBe(200)
    await choose(t, (await propose(t, journeyId, 'conceptos')).id, 1)
    expect((await step(t, journeyId, 'nombres')).status).toBe(200)
    await choose(t, (await propose(t, journeyId, 'nombres')).id, 1)
    expect((await step(t, journeyId, 'hecho')).status).toBe(200)
    const latest = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(latest.origin).toBe('ia')
    expect(latest.profile.concept.promise).not.toBe('Escrita por mí.')
    expect(latest.profile.concept).not.toEqual(base.profile.concept)
    expect(latest.profile.name.status).toBe('elegido')
    expect((await versionOf(t, channelId, 2)).profile.concept.promise).toBe('Escrita por mí.')
  })
})

describe('going back to a version keeps the name of the channel', () => {
  it('a version from before the name was chosen comes back with the name chosen since', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t, { nameLater: true })
    expect((await step(t, journeyId, 'nombres')).status).toBe(200)
    await choose(t, (await propose(t, journeyId, 'nombres')).id, 1)
    expect((await step(t, journeyId, 'hecho')).status).toBe(200)
    const named = await versionOf(t, channelId, 2)
    expect(named.profile.name.status).toBe('elegido')
    const restored = await call(t, 'POST', `/api/channels/${channelId}/profile/restore`, { version: 1 })
    expect(restored.status).toBe(200)
    const latest = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(latest.origin).toBe('restaurada')
    expect(latest.profile.name).toEqual(named.profile.name)
    const channel = (await call(t, 'GET', '/api/channels/current')).body['channel'] as { nameStatus: string }
    expect(channel.nameStatus).toBe('elegido')
  })
})

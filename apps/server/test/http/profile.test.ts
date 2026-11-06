import { channelProfileSchema, type ChannelProfile } from '@ytcreator/core'
import {
  channelSchema,
  jobStartedSchema,
  journeyViewSchema,
  profileVersionSchema,
  proposalSchema,
} from '@ytcreator/core/api'
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
    // The answers are the same as the base: the figures are worked out from the base again, never taken from what is sent.
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

  it('the answers change the money and the warnings, worked out again; the figures are never taken as sent (entry 117)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = (await versionOf(t, channelId, 1)).profile
    expect(base.concept.monetization.monthlyEurRange).not.toBeNull()
    const answers: ChannelProfile = {
      ...base,
      concept: {
        ...base.concept,
        audience: { ...base.concept.audience, region: 'latam', madeForKids: true },
        format: { ...base.concept.format, presence: 'ninguna' },
        cadence: { longPerWeek: 0, shortsPerWeek: 5, hoursPerWeek: 3 },
        monetization: {
          ...base.concept.monetization,
          rpmEurRange: { min: 90, max: 99 },
          monthlyViewsAssumption: null,
          monthlyEurRange: null,
        },
      },
    }
    const saved = await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: answers })
    expect(saved.body).not.toHaveProperty('error')
    expect(saved.status).toBe(200)
    const { profile, origin } = profileVersionSchema.parse(saved.body)
    expect(origin).toBe('manual')
    expect(profile.concept.audience).toMatchObject({ region: 'latam', madeForKids: true })
    expect(profile.concept.format.presence).toBe('ninguna')
    expect(profile.concept.cadence).toEqual({ longPerWeek: 0, shortsPerWeek: 5, hoursPerWeek: 3 })
    // Worked out again from the knowledge: never the 90–99 sent, and no monthly sum without long videos.
    expect(profile.concept.monetization.rpmEurRange).not.toEqual({ min: 90, max: 99 })
    expect(profile.concept.monetization.monthlyEurRange).toBeNull()
    expect(profile.concept.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['infantil', 'solo_shorts']))
    expect(profile.sources.map((s) => s.id)).toEqual(
      expect.arrayContaining(['rpm', 'ypp', 'made-for-kids', 'shorts', base.niche.measureId]),
    )

    // And back to the answers of the start: the same figures as the AI version.
    const back = await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 2, profile: base })
    expect(profileVersionSchema.parse(back.body).profile.concept.monetization).toEqual(base.concept.monetization)
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

describe('POST /api/channels/:id/profile/remeasure (entry 114)', () => {
  it('measures the niche again in the background: a new measure, and a new version with its figures and date', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const before = (await versionOf(t, channelId, 1)).profile
    const spent = t.usage.list().length
    const started = await call(t, 'POST', `/api/channels/${channelId}/profile/remeasure`)
    expect(started.status).toBe(202)
    const { jobId } = jobStartedSchema.parse(started.body)
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
    const latest = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(latest.version).toBe(2)
    expect(latest.origin).toBe('manual')
    const { profile } = latest
    expect(profile.niche.measureId).not.toBe(before.niche.measureId)
    expect(profile.sources.map((s) => s.id)).toContain(profile.niche.measureId)
    expect(profile.sources.map((s) => s.id)).not.toContain(before.niche.measureId)
    expect(profile.concept.promise).toBe(before.concept.promise)
    // The version before keeps the measure it was made with.
    expect((await versionOf(t, channelId, 1)).profile.niche.measureId).toBe(before.niche.measureId)
    // No AI is asked: measuring costs nothing.
    expect(t.usage.list()).toHaveLength(spent)
  })

  it('an unknown channel → 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    expect((await call(t, 'POST', '/api/channels/nope/profile/remeasure')).status).toBe(404)
  })
  it('one at a time; the reference channels are the ones the creator had, not read again (entry 120)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const { niche } = (await versionOf(t, channelId, 1)).profile
    const before = t.channel.measures.setReferences(niche.measureId!, [
      {
        youtubeChannelId: 'UC-mio',
        title: 'Un canal que añadí yo',
        handle: null,
        subscribers: null,
        topVideoViews: 1000,
        medianViews: null,
        bestRatio: null,
        bestVideoId: null,
        bestVideoTitle: null,
        reason: 'anadido_por_ti',
        fetchedAt: '2026-01-02T03:04:05.000Z',
      },
    ])
    // A measure still running for this journey: another one would spend the quota twice.
    const measure = t.channel.measures.get(niche.measureId!)!
    const running = t.channel.jobs.start({ journeyId: measure.journeyId, kind: 'medir_nichos', total: 1 })
    expect((await call(t, 'POST', `/api/channels/${channelId}/profile/remeasure`)).status).toBe(409)
    t.channel.jobs.finish(running.id)
    const first = await call(t, 'POST', `/api/channels/${channelId}/profile/remeasure`)
    expect(first.status).toBe(202)
    const { jobId } = jobStartedSchema.parse(first.body)
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
    const latest = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    const strip = ({ youtubeChannelId, reason }: { youtubeChannelId: string; reason: string }) => ({
      youtubeChannelId,
      reason,
    })
    expect(t.channel.measures.listReferences(latest.profile.niche.measureId!).map(strip)).toEqual(before.map(strip))
    // Not read again, so they keep the date they were read (FR-008).
    expect(t.channel.measures.listReferences(latest.profile.niche.measureId!).map((r) => r.fetchedAt)).toEqual([
      '2026-01-02T03:04:05.000Z',
    ])
  })
})

describe('the money of a version comes from the concept it was made with (entry 121)', () => {
  it('choosing another concept later does not change the kind of content of the versions before', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t)
    const first = (await versionOf(t, channelId, 1)).profile
    // The journey's proposal, with the other concept of another kind of content and chosen afterwards.
    const proposal = t.channel.proposals.latest(journeyId, 'conceptos')!
    const { concepts } = proposal.payload as { concepts: { monetization: { category: string } }[] }
    const other = { ...concepts[1]!, monetization: { ...concepts[1]!.monetization, category: 'finanzas_negocios' } }
    t.channel.proposals.edit(proposal.id, { concepts: [concepts[0], other] })
    t.channel.proposals.approve(proposal.id, 1)

    const sent = edited(first, 'La misma cocina, con otra promesa.')
    const saved = await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: sent })
    expect(saved.status).toBe(200)
    expect(profileVersionSchema.parse(saved.body).profile.concept.monetization.rpmEurRange).toEqual(
      first.concept.monetization.rpmEurRange,
    )
  })
})

describe('changing the name keeps what came after the journey (entry 122)', () => {
  async function rename(t: TestApp, journeyId: string) {
    expect((await step(t, journeyId, 'nombres')).status).toBe(200)
    const names = (await view(t, journeyId)).proposals.findLast((p) => p.kind === 'nombres')!
    await choose(t, names.id, 2)
    expect((await step(t, journeyId, 'hecho')).status).toBe(200)
  }

  it('after a part rewritten by the AI and an answer edited by hand', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t)
    const base = (await versionOf(t, channelId, 1)).profile
    const kids = { ...base, concept: { ...base.concept, audience: { ...base.concept.audience, madeForKids: true } } }
    expect((await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: kids })).status).toBe(
      200,
    )
    const estimate = await call(t, 'POST', `/api/channels/${channelId}/profile/estimate`, { part: 'temas' })
    const proposal = await call(t, 'POST', `/api/channels/${channelId}/profile/regenerate`, {
      part: 'temas',
      baseVersion: 2,
      estimateId: estimate.body['estimateId'],
    })
    await call(t, 'POST', `/api/channels/${channelId}/profile/regenerated`, {
      regenerationId: proposal.body['regenerationId'],
      baseVersion: 2,
    })
    const rewritten = await versionOf(t, channelId, 3)
    await rename(t, journeyId)
    const after = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(after).toMatchObject({ version: 4, origin: 'manual' })
    expect(after.profile.concept).toEqual(rewritten.profile.concept)
    expect(after.profile.name.displayName).not.toBe(rewritten.profile.name.displayName)
  })

  it('after measuring again and editing the promise', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t)
    const started = jobStartedSchema.parse((await call(t, 'POST', `/api/channels/${channelId}/profile/remeasure`)).body)
    await vi.waitFor(() => expect(t.jobs.get(started.jobId)?.status).toBe('hecho'))
    const measured = await versionOf(t, channelId, 2)
    await call(t, 'PUT', `/api/channels/${channelId}/profile`, {
      baseVersion: 2,
      profile: edited(measured.profile, 'Mi promesa, escrita después de medir.'),
    })
    await rename(t, journeyId)
    const after = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(after.origin).toBe('manual')
    expect(after.profile.concept.promise).toBe('Mi promesa, escrita después de medir.')
    expect(after.profile.niche.measureId).toBe(measured.profile.niche.measureId)
  })
})

describe('coming back to change the name, and leaving it as it was (entry 131)', () => {
  it('«Decidir más tarde» keeps the name chosen before, and no version says the same again', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t)
    const before = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect((await step(t, journeyId, 'nombres')).status).toBe(200)
    expect((await step(t, journeyId, 'hecho', { nameLater: true })).status).toBe(200)
    const current = await call(t, 'GET', '/api/channels/current')
    expect(current.body['channel']).toMatchObject({
      nameStatus: 'elegido',
      displayName: before.profile.name.displayName,
    })
    expect(profileVersionSchema.parse(current.body['profile']).version).toBe(before.version)
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/versions`)).body).toHaveLength(1)
  })
})

describe('the words decide warnings too, and the rhythm keeps its limits (entries 121, 123 and 124)', () => {
  it('an audience written for children brings the warning and its money, with the same answers', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = (await versionOf(t, channelId, 1)).profile
    expect(base.concept.warnings.map((w) => w.code)).not.toContain('infantil')
    const kids = {
      ...base,
      concept: { ...base.concept, audience: { ...base.concept.audience, description: 'Niños de primaria.' } },
    }
    const saved = await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: kids })
    const { profile } = profileVersionSchema.parse(saved.body)
    expect(profile.concept.warnings.map((w) => w.code)).toContain('infantil')
    expect(profile.concept.monetization.rpmEurRange).not.toEqual(base.concept.monetization.rpmEurRange)
  })

  it("the assumptions are the creator's to correct", async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = (await versionOf(t, channelId, 1)).profile
    const sent = {
      ...base,
      concept: {
        ...base.concept,
        monetization: { ...base.concept.monetization, assumptions: ['Público de Latinoamérica.'] },
      },
    }
    const saved = await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: sent })
    expect(profileVersionSchema.parse(saved.body).profile.concept.monetization.assumptions).toEqual([
      'Público de Latinoamérica.',
    ])
  })

  it.each([
    ['hours out of range', { hoursPerWeek: 0 }],
    ['half an hour', { hoursPerWeek: 7.5 }],
    ['videos below zero', { longPerWeek: -1 }],
  ])('a rhythm the journey would not accept → 400 (%s)', async (_, change) => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = (await versionOf(t, channelId, 1)).profile
    const sent = { ...base, concept: { ...base.concept, cadence: { ...base.concept.cadence, ...change } } }
    expect((await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: sent })).status).toBe(
      400,
    )
  })

  it('half a video a week, as a concept can have it, is fine; and what does not change is not checked', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const base = (await versionOf(t, channelId, 1)).profile
    const half = { ...base, concept: { ...base.concept, cadence: { ...base.concept.cadence, shortsPerWeek: 2.5 } } }
    expect((await call(t, 'PUT', `/api/channels/${channelId}/profile`, { baseVersion: 1, profile: half })).status).toBe(
      200,
    )
  })
})

describe('«Regenerar con IA» a part of the profile (entry 115)', () => {
  async function regenerate(t: TestApp, channelId: string, part: string, extra: Body = {}) {
    const estimate = await call(t, 'POST', `/api/channels/${channelId}/profile/estimate`, { part })
    expect(estimate.status).toBe(200)
    const current = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    return call(t, 'POST', `/api/channels/${channelId}/profile/regenerate`, {
      part,
      baseVersion: current.version,
      estimateId: estimate.body['estimateId'],
      ...extra,
    })
  }

  it('the estimate first, then a proposal of only that part: approved, it is a new version `ia`', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const before = await versionOf(t, channelId, 1)
    const estimate = await call(t, 'POST', `/api/channels/${channelId}/profile/estimate`, { part: 'temas' })
    expect(estimate.body).toMatchObject({ use: 'perfil_parte', included: false, blockedBy: null })
    expect(estimate.body['cents']).toBeGreaterThan(0)

    const used = t.usage.list().length
    const proposal = await regenerate(t, channelId, 'temas', { instructions: 'Más centrado en cenas.' })
    expect(proposal.status).toBe(200)
    expect(Object.keys(proposal.body['proposed'] as Body)).toEqual(['pillars'])
    expect(t.usage.list()).toHaveLength(used + 1)
    expect(t.usage.list().filter((row) => row.use === 'perfil_parte')).toMatchObject([{ outcome: 'ok' }])
    // Nothing is saved until the creator says yes.
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/versions`)).body).toHaveLength(1)

    const approved = await call(t, 'POST', `/api/channels/${channelId}/profile/regenerated`, {
      regenerationId: proposal.body['regenerationId'],
      baseVersion: 1,
    })
    expect(approved.status).toBe(200)
    const saved = profileVersionSchema.parse(approved.body)
    expect(saved).toMatchObject({ version: 2, origin: 'ia' })
    expect(saved.profile.concept.pillars).toEqual((proposal.body['proposed'] as Body)['pillars'])
    expect(saved.profile.concept.pillars).not.toEqual(before.profile.concept.pillars)
    // The rest of the profile, the money included, is as it was.
    expect({ ...saved.profile, concept: { ...saved.profile.concept, pillars: [] } }).toEqual({
      ...before.profile,
      concept: { ...before.profile.concept, pillars: [] },
    })

    // A proposal is approved once.
    const again = await call(t, 'POST', `/api/channels/${channelId}/profile/regenerated`, {
      regenerationId: proposal.body['regenerationId'],
      baseVersion: 2,
    })
    expect(again.status).toBe(404)
  })

  it('the promise and the audience: each one changes only its own text', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const before = await versionOf(t, channelId, 1)
    for (const [part, version] of [
      ['promesa', 1],
      ['publico', 2],
    ] as const) {
      const proposal = await regenerate(t, channelId, part)
      await call(t, 'POST', `/api/channels/${channelId}/profile/regenerated`, {
        regenerationId: proposal.body['regenerationId'],
        baseVersion: version,
      })
    }
    const after = await versionOf(t, channelId, 3)
    expect(after.profile.concept.promise).not.toBe(before.profile.concept.promise)
    expect(after.profile.concept.audience).toEqual({
      ...before.profile.concept.audience,
      description: 'Gente que trabaja fuera y quiere cenar bien sin complicarse.',
    })
    expect(after.profile.concept.pillars).toEqual(before.profile.concept.pillars)
  })

  it('saved meanwhile: the proposal is not saved over the newer version (409)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const proposal = await regenerate(t, channelId, 'promesa')
    const base = await versionOf(t, channelId, 1)
    await call(t, 'PUT', `/api/channels/${channelId}/profile`, {
      baseVersion: 1,
      profile: edited(base.profile, 'Escrita a mano mientras tanto.'),
    })
    const approved = await call(t, 'POST', `/api/channels/${channelId}/profile/regenerated`, {
      regenerationId: proposal.body['regenerationId'],
      baseVersion: 2,
    })
    expect(approved.status).toBe(409)
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/versions`)).body).toHaveLength(2)

    // Asking from an old version does not call the AI.
    const used = t.usage.list().length
    const estimate = await call(t, 'POST', `/api/channels/${channelId}/profile/estimate`, { part: 'promesa' })
    const stale = await call(t, 'POST', `/api/channels/${channelId}/profile/regenerate`, {
      part: 'promesa',
      baseVersion: 1,
      estimateId: estimate.body['estimateId'],
    })
    expect(stale.status).toBe(409)
    expect(t.usage.list()).toHaveLength(used)
  })

  it('a proposal waits saved until it is approved or left; a left one cannot be saved (entry 119)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/regeneration`)).body).toBeNull()
    const proposal = await regenerate(t, channelId, 'promesa')
    const waiting = await call(t, 'GET', `/api/channels/${channelId}/profile/regeneration`)
    expect(waiting.body).toEqual(proposal.body)
    // Kept in the database, with the call it came from.
    const stored = t.channel.regenerations.get(String(proposal.body['regenerationId']))
    expect(stored?.usageId).toBe(t.usage.list().find((row) => row.use === 'perfil_parte')?.id)

    const id = String(proposal.body['regenerationId'])
    expect((await t.request('DELETE', `/api/channels/${channelId}/profile/regeneration/${id}`)).status).toBe(204)
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/regeneration`)).body).toBeNull()
    const late = await call(t, 'POST', `/api/channels/${channelId}/profile/regenerated`, {
      regenerationId: id,
      baseVersion: 1,
    })
    expect(late.status).toBe(404)
    expect((await t.request('DELETE', `/api/channels/${channelId}/profile/regeneration/${id}`)).status).toBe(404)
  })

  it('asking again takes the place of the proposal before, and approving clears it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const first = await regenerate(t, channelId, 'promesa')
    const second = await regenerate(t, channelId, 'temas')
    expect(t.channel.regenerations.get(String(first.body['regenerationId']))).toBeNull()
    await call(t, 'POST', `/api/channels/${channelId}/profile/regenerated`, {
      regenerationId: second.body['regenerationId'],
      baseVersion: 1,
    })
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/regeneration`)).body).toBeNull()
  })

  it('wrong bodies → 400; an unknown channel → 404; a journey cannot ask for it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId, journeyId } = await finished(t)
    expect((await call(t, 'POST', `/api/channels/${channelId}/profile/estimate`, { part: 'dinero' })).status).toBe(400)
    expect((await call(t, 'POST', '/api/channels/nope/profile/estimate', { part: 'promesa' })).status).toBe(404)
    const long = await regenerate(t, channelId, 'promesa', { instructions: 'x'.repeat(501) })
    expect(long.status).toBe(400)
    expect((await call(t, 'POST', `/api/journeys/${journeyId}/estimate`, { use: 'perfil_parte' })).status).toBe(400)
  })

  it.each([
    ['sin_sesion', 'clave_no_valida'],
    ['cupo_agotado', 'sin_saldo'],
    ['tiempo_agotado', 'respuesta_lenta'],
    ['contenido_filtrado', 'rechazo_del_modelo'],
    ['no_disponible', 'servicio_caido'],
  ])('%s: a 200 with its code, and the profile as it was', async (kind, reason) => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const active = t.ai.activeAi()!
    vi.spyOn(t.ai, 'activeAi').mockReturnValue({
      ...active,
      generate: async () => ({ ok: false, failure: { kind, reason } }) as never,
    })
    const failed = await regenerate(t, channelId, 'temas')
    expect(failed).toEqual({ status: 200, body: { failure: kind } })
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/versions`)).body).toHaveLength(1)
  })

  it('an answer that breaks the schema twice → respuesta_invalida, and nothing saved', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const active = t.ai.activeAi()!
    vi.spyOn(t.ai, 'activeAi').mockReturnValue({
      ...active,
      generate: async () =>
        ({ ok: false, invalidOutput: true, failure: { kind: 'no_disponible', reason: 'servicio_caido' } }) as never,
    })
    expect(await regenerate(t, channelId, 'publico')).toEqual({ status: 200, body: { failure: 'respuesta_invalida' } })
    expect((await call(t, 'GET', `/api/channels/${channelId}/profile/versions`)).body).toHaveLength(1)
  })
})

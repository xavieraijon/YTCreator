import { channelProfileSchema, positioningOutput } from '@ytcreator/core'
import {
  conceptFiguresSchema,
  jobStartedSchema,
  journeyViewSchema,
  profileVersionSchema,
  proposalSchema,
} from '@ytcreator/core/api'
import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'

const WEEKS_PER_MONTH = 4.33

type TestApp = ReturnType<typeof makeTestApp>
type Body = Record<string, unknown>
interface Positioning {
  promise: string
  pillars: { title: string; description: string }[]
  audience: { description: string; region: string; madeForKids: boolean }
  monetization: { category: string; assumptions: string[] }
  changes: { what: string; why: string; videoIds: string[] }[]
  cadence: { longPerWeek: number; shortsPerWeek: number; hoursPerWeek: number }
  format: { presence: string; longForm: string; shortsRole: string }
  figures: { monetization: { monthlyEurRange: unknown } }
  [key: string]: unknown
}
interface CurrentProfile {
  niche: { text: string; videoIds: string[] }
  works: { text: string; videoIds: string[] }[]
  doesNotWork: { text: string; videoIds: string[] }[]
}

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
async function propose(t: TestApp, id: string, kind: string, use: string, extra: Body = {}) {
  const { revision } = await view(t, id)
  const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use })
  expect(estimate.status).toBe(200)
  const created = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
    revision,
    kind,
    estimateId: estimate.body['estimateId'],
    ...extra,
  })
  return proposalSchema.parse(created.body)
}

async function atReading(t: TestApp, input = '@cocinacorta30') {
  await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 500, dailyCents: 1000, monthlyCents: 5000 })
  await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: 'sk-ant-api03-FAKE-position-0123456789' })
  await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })
  const created = await call(t, 'POST', '/api/channels', { origin: 'existente' })
  const id = (created.body['journey'] as { id: string }).id
  await step(t, id, 'confirmar', { data: { channelInput: input } })
  const { revision } = await view(t, id)
  await call(t, 'POST', `/api/journeys/${id}/reading`, { revision, input })
  await vi.waitFor(async () => {
    expect((await view(t, id)).reading).not.toBeNull()
  })
  return id
}

async function atPositioning(t: TestApp) {
  const id = await atReading(t)
  const current = await propose(t, id, 'perfil_actual', 'lectura_canal')
  await call(t, 'PATCH', `/api/proposals/${current.id}`, { status: 'aprobada' })
  expect((await step(t, id, 'ritmo')).status).toBe(200)
  const answers = { hoursPerWeek: 9, onCamera: 'voz', audienceRegion: 'espana' }
  expect((await step(t, id, 'posicionamiento', { data: answers })).status).toBe(200)
  return { id, current }
}

const readingIds = async (t: TestApp, id: string) => (await view(t, id)).reading!.videos.map((video) => video.id)

describe('the answers of the creator (P20)', () => {
  it('there is no going on to the positioning without them', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atReading(t)
    const current = await propose(t, id, 'perfil_actual', 'lectura_canal')
    await call(t, 'PATCH', `/api/proposals/${current.id}`, { status: 'aprobada' })
    await step(t, id, 'ritmo')
    expect((await step(t, id, 'posicionamiento')).status).toBe(400)
  })

  it('the hours and the way to appear are the answers, whatever the AI wrote; and it reads them', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const { payload } = await propose(t, id, 'posicionamiento', 'posicionamiento')
    const { cadence, format } = payload as Positioning
    expect(cadence.hoursPerWeek).toBe(9)
    expect(format.presence).toBe('voz')
  })
})

describe('the current profile', () => {
  it('each claim cites videos of the reading (US4 AS3)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atReading(t)
    const { payload } = await propose(t, id, 'perfil_actual', 'lectura_canal')
    const known = await readingIds(t, id)
    const { niche, works, doesNotWork } = payload as CurrentProfile
    expect(works.length).toBeGreaterThan(0)
    for (const claim of [niche, ...works, ...doesNotWork]) {
      expect(claim.videoIds.length).toBeGreaterThan(0)
      for (const videoId of claim.videoIds) expect(known).toContain(videoId)
    }
  })

  it('an invented figure or video is taken away, and the screen is told (R8)', async () => {
    const t = makeTestApp({ fakeAi: 'cifra_inventada' })
    const id = await atReading(t)
    const proposal = await propose(t, id, 'perfil_actual', 'lectura_canal')
    expect(proposal.claimsTrimmed).toBe(true)
    const known = await readingIds(t, id)
    const { niche, works } = proposal.payload as CurrentProfile
    expect(niche.text).not.toContain('250.000')
    for (const { videoIds } of works) for (const videoId of videoIds) expect(known).toContain(videoId)
  })

  it('an answer that does not fit gives the failure with no proposal', async () => {
    const t = makeTestApp({ fakeAi: 'salida_rota' })
    const id = await atReading(t)
    const { revision } = await view(t, id)
    const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'lectura_canal' })
    const { status, body } = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
      revision,
      kind: 'perfil_actual',
      estimateId: estimate.body['estimateId'],
    })
    expect(status).toBe(200)
    expect(body).toEqual({ failure: 'respuesta_invalida' })
  })

  it('can be edited; the edit still needs its videos', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atReading(t)
    const proposal = await propose(t, id, 'perfil_actual', 'lectura_canal')
    const payload = proposal.payload as CurrentProfile
    const edited = { ...payload, niche: { ...payload.niche, text: 'Cocina de diario.' } }
    const saved = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: edited })
    expect(saved.status).toBe(200)
    expect((saved.body['editedPayload'] as CurrentProfile).niche.text).toBe('Cocina de diario.')
    const bad = { ...payload, niche: { text: 'Sin vídeos.', videoIds: [] } }
    expect((await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: bad })).status).toBe(400)
  })

  it('without being approved there is no going on to the positioning', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atReading(t)
    await propose(t, id, 'perfil_actual', 'lectura_canal')
    expect((await step(t, id, 'ritmo')).status).toBe(400)
  })
})

describe('the positioning', () => {
  it('comes as a whole concept, with its ranges worked out by the domain and the changes citing videos', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const proposal = await propose(t, id, 'posicionamiento', 'posicionamiento')
    const payload = proposal.payload as Positioning
    expect(payload.pillars.length).toBeGreaterThanOrEqual(3)
    expect(payload.changes.length).toBeGreaterThan(0)
    const known = await readingIds(t, id)
    for (const { videoIds } of payload.changes) for (const videoId of videoIds) expect(known).toContain(videoId)
    const { monetization } = conceptFiguresSchema.parse(payload.figures)
    expect(monetization.rpmEurRange.min).toBeLessThan(monetization.rpmEurRange.max)
    // P21: what a long video of the channel gets, by the long videos proposed, with no share of a niche.
    const { summary } = (await view(t, id)).reading!
    const views = Math.round((payload.cadence.longPerWeek * WEEKS_PER_MONTH * summary.long.medianViews!) / 100) * 100
    expect(monetization.monthlyViewsAssumption).toEqual({ min: views, max: views })
    expect(monetization.monthlyEurRange!.min).toBeLessThan(monetization.monthlyEurRange!.max)
    expect(monetization.rpmSource.label).toBeTruthy()
  })

  it('the region is the one of the journey, not the AI’s', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const { payload } = await propose(t, id, 'posicionamiento', 'posicionamiento')
    expect((payload as Positioning).audience.region).toBe('espana')
  })

  it('the creator may delete the assumptions when editing, which the AI may not', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const proposal = await propose(t, id, 'posicionamiento', 'posicionamiento')
    const payload = proposal.payload as Positioning
    const edited = { ...payload, monetization: { ...payload.monetization, assumptions: [] } }
    const saved = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: edited })
    expect(saved.status).toBe(200)
    const stored = saved.body['editedPayload'] as Positioning
    expect(stored.monetization.assumptions).toEqual([])
    expect(stored.changes).toEqual(payload.changes)
    expect(conceptFiguresSchema.safeParse(stored.figures).success).toBe(true)
  })

  it('«Proponer otra» makes a child proposal, and the AI does not get the money of the previous one', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const first = await propose(t, id, 'posicionamiento', 'posicionamiento')
    const second = await propose(t, id, 'posicionamiento', 'posicionamiento', {
      parentId: first.id,
      instructions: 'Menos Shorts',
    })
    expect(second).toMatchObject({ parentId: first.id, instructions: 'Menos Shorts' })
    expect((await view(t, id)).proposals.filter((p) => p.kind === 'posicionamiento').map((p) => p.id)).toEqual([
      second.id,
    ])
  })
})

describe('approving', () => {
  const finish = async (t: TestApp, id: string, proposalId: string) => {
    await call(t, 'PATCH', `/api/proposals/${proposalId}`, { status: 'aprobada' })
    return step(t, id, 'hecho')
  }
  const currentProfile = async (t: TestApp) => {
    const { profile, channel } = (await call(t, 'GET', '/api/channels/current')).body as {
      profile: unknown
      channel: Body
    }
    return { version: profileVersionSchema.parse(profile), channel }
  }

  it('creates version 1, from the AI, with the same shape as a new channel (FR-021b)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const proposal = await propose(t, id, 'posicionamiento', 'posicionamiento')
    expect((await finish(t, id, proposal.id)).status).toBe(200)
    expect((await view(t, id)).status).toBe('terminado')
    const { version, channel } = await currentProfile(t)
    expect(version).toMatchObject({ version: 1, origin: 'ia', proposalId: proposal.id })
    const profile = channelProfileSchema.parse(version.profile)
    const payload = proposal.payload as Positioning
    expect(profile.concept.promise).toBe(payload.promise)
    expect(profile.concept.monetization.rpmEurRange.min).toBeGreaterThan(0)
    expect(profile.concept.monetization.monthlyEurRange).toEqual(payload.figures.monetization.monthlyEurRange)
    expect(profile.concept.monetization.assumptions).toEqual(payload.monetization.assumptions)
    expect(profile.name).toEqual({
      displayName: 'Cocina Corta',
      handle: 'cocinacorta30',
      status: 'elegido',
      checkId: null,
    })
    expect(channel).toMatchObject({ nameStatus: 'elegido', displayName: 'Cocina Corta' })
  })

  it('keeps the current profile and the reading as context, with their source (FR-021b)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id, current } = await atPositioning(t)
    const proposal = await propose(t, id, 'posicionamiento', 'posicionamiento')
    await finish(t, id, proposal.id)
    const { version } = await currentProfile(t)
    const { profile } = version
    const reading = (await view(t, id)).reading!
    expect(profile.context?.readingId).toBe(reading.id)
    const { niche } = current.payload as CurrentProfile
    expect(profile.context?.currentProfile).toContain(niche.text)
    expect(profile.niche).toEqual({ label: niche.text, summary: niche.text, measureId: null })
    expect(profile.sources).toContainEqual(expect.objectContaining({ id: reading.id, kind: 'youtube' }))
    expect(profile.sources.map((source) => source.id)).toEqual(expect.arrayContaining(['rpm', 'ypp']))
  })

  it('edited before approving, it keeps the edit (US4 Independent Test)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const proposal = await propose(t, id, 'posicionamiento', 'posicionamiento')
    const payload = proposal.payload as Positioning
    const pillars = [{ title: 'Cenas de 15 minutos', description: 'Lo que más piden.' }, ...payload.pillars.slice(1)]
    const saved = await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { editedPayload: { ...payload, pillars } })
    expect(saved.status).toBe(200)
    expect((await finish(t, id, proposal.id)).status).toBe(200)
    const { version } = await currentProfile(t)
    expect(version.profile.concept.pillars[0]).toEqual(pillars[0])
    expect(version.origin).toBe('ia')
  })

  it('the current profile as edited is the one kept', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id, current } = await atPositioning(t)
    const payload = current.payload as CurrentProfile
    await call(t, 'PATCH', `/api/proposals/${current.id}`, {
      editedPayload: { ...payload, niche: { ...payload.niche, text: 'Cocina de diario.' } },
    })
    const proposal = await propose(t, id, 'posicionamiento', 'posicionamiento')
    await finish(t, id, proposal.id)
    const { version } = await currentProfile(t)
    expect(version.profile.niche.label).toBe('Cocina de diario.')
    expect(version.profile.context?.currentProfile).toContain('Cocina de diario.')
  })

  it('without the positioning approved there is no end', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    await propose(t, id, 'posicionamiento', 'posicionamiento')
    expect((await step(t, id, 'hecho')).status).toBe(400)
    expect((await view(t, id)).status).toBe('activo')
  })
})

describe('the answers change after the positioning is written (FR-014b, entry 72)', () => {
  const answers = { hoursPerWeek: 3, onCamera: 'cara', audienceRegion: 'latam' }
  const stored = async (t: TestApp, id: string) => {
    const found = (await view(t, id)).proposals.find((p) => p.kind === 'posicionamiento')!
    return { id: found.id, payload: (found.editedPayload ?? found.payload) as Positioning }
  }
  const answerAgain = async (t: TestApp, id: string) => {
    expect((await step(t, id, 'ritmo')).status).toBe(200)
    expect((await step(t, id, 'posicionamiento', { data: answers })).status).toBe(200)
  }

  it('what is shown follows them, with its money, and it is what the profile keeps', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    await propose(t, id, 'posicionamiento', 'posicionamiento')
    const before = await stored(t, id)
    await answerAgain(t, id)
    const { id: proposalId, payload } = await stored(t, id)
    expect(payload.audience.region).toBe('latam')
    expect(payload.cadence.hoursPerWeek).toBe(3)
    expect(payload.format.presence).toBe('cara')
    expect(payload.figures.monetization).not.toEqual(before.payload.figures.monetization)
    // The text was written for other answers: the screen says so with what it was based on.
    expect(payload['basedOn']).toMatchObject({ hoursPerWeek: 9, onCamera: 'voz' })

    await call(t, 'PATCH', `/api/proposals/${proposalId}`, { status: 'aprobada' })
    expect((await step(t, id, 'hecho')).status).toBe(200)
    const { profile } = (await call(t, 'GET', '/api/channels/current')).body as {
      profile: { profile: { concept: Record<string, Record<string, unknown>> } }
    }
    const { concept } = profile.profile
    expect(concept['audience']).toMatchObject({ region: 'latam' })
    expect(concept['cadence']).toMatchObject({ hoursPerWeek: 3 })
    expect(concept['format']).toMatchObject({ presence: 'cara' })
    expect(concept['monetization']!['monthlyEurRange']).toEqual(payload.figures.monetization.monthlyEurRange)
  })

  it('editing something else does not undo what was answered', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    await propose(t, id, 'posicionamiento', 'posicionamiento')
    await answerAgain(t, id)
    const { id: proposalId, payload } = await stored(t, id)
    const edited = { ...payload, promise: 'Otra promesa.' }
    expect((await call(t, 'PATCH', `/api/proposals/${proposalId}`, { editedPayload: edited })).status).toBe(200)
    const { state } = await view(t, id)
    expect(state).toMatchObject({ audienceRegion: 'latam', hoursPerWeek: 3, onCamera: 'cara' })
    expect((await stored(t, id)).payload).toMatchObject({ promise: 'Otra promesa.', cadence: { hoursPerWeek: 3 } })
  })

  it('changing the way to appear when editing changes the answer, as the audience does', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    await propose(t, id, 'posicionamiento', 'posicionamiento')
    const { id: proposalId, payload } = await stored(t, id)
    const edited = { ...payload, format: { ...payload.format, presence: 'ninguna' } }
    expect((await call(t, 'PATCH', `/api/proposals/${proposalId}`, { editedPayload: edited })).status).toBe(200)
    expect((await view(t, id)).state.onCamera).toBe('ninguna')
    expect((await stored(t, id)).payload.format.presence).toBe('ninguna')
  })
})

describe('the five failures of the AI (contracts/ai-provider.md)', () => {
  it.each([
    ['sin_sesion', 'clave_no_valida'],
    ['cupo_agotado', 'sin_saldo'],
    ['tiempo_agotado', 'respuesta_lenta'],
    ['contenido_filtrado', 'rechazo_del_modelo'],
    ['no_disponible', 'servicio_caido'],
  ])('%s, in the reading and in the positioning: a 200 with its code, and nothing stored', async (kind, reason) => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const before = (await view(t, id)).proposals
    const active = t.ai.activeAi()!
    vi.spyOn(t.ai, 'activeAi').mockReturnValue({
      ...active,
      generate: async () => ({ ok: false, failure: { kind, reason } }) as never,
    })
    for (const [proposalKind, use] of [
      ['perfil_actual', 'lectura_canal'],
      ['posicionamiento', 'posicionamiento'],
    ] as const) {
      const { revision } = await view(t, id)
      const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use })
      const failed = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
        revision,
        kind: proposalKind,
        estimateId: estimate.body['estimateId'],
      })
      expect(failed).toEqual({ status: 200, body: { failure: kind } })
    }
    expect((await view(t, id)).proposals).toEqual(before)
  })
})

describe('a positioning that can no longer be read (entries 39 and 92)', () => {
  it('is shown as nothing, and another can be asked for', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const proposal = await propose(t, id, 'posicionamiento', 'posicionamiento')
    t.db.prepare('UPDATE proposal SET payload = ? WHERE id = ?').run(JSON.stringify({ old: true }), proposal.id)
    const seen = await call(t, 'GET', `/api/journeys/${id}`)
    expect(seen.status).toBe(200)
    const positioning = () => view(t, id).then((v) => v.proposals.filter((p) => p.kind === 'posicionamiento'))
    expect(await positioning()).toEqual([])
    await propose(t, id, 'posicionamiento', 'posicionamiento')
    expect(await positioning()).toHaveLength(1)
  })
})

describe('the approvals the server asks for (entry 62)', () => {
  it('nothing is estimated nor asked of the AI about the positioning without the profile approved', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atReading(t)
    await propose(t, id, 'perfil_actual', 'lectura_canal')
    const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'posicionamiento' })
    expect(estimate.status).toBe(400)
  })

  it('a profile asked for again has to be approved before the end', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id, current } = await atPositioning(t)
    const proposal = await propose(t, id, 'posicionamiento', 'posicionamiento')
    await call(t, 'PATCH', `/api/proposals/${proposal.id}`, { status: 'aprobada' })
    const again = await propose(t, id, 'perfil_actual', 'lectura_canal', { parentId: current.id })
    expect(again.status).toBe('propuesta')
    expect((await step(t, id, 'hecho')).status).toBe(400)
    await call(t, 'PATCH', `/api/proposals/${again.id}`, { status: 'aprobada' })
    expect((await step(t, id, 'hecho')).status).toBe(200)
  })

  it('a change that cites no video is not accepted from the AI (FR-021)', () => {
    const change = { what: 'Más cenas', why: 'Es lo que mejor te funciona.', videoIds: [] }
    expect(positioningOutput.shape.changes.safeParse([change]).success).toBe(false)
  })
})

describe('the new journey from a channel with few videos (FR-022)', () => {
  it('ends in a profile with the name and the @ it had', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const first = await atReading(t, '@cocinatres')
    const { revision } = await view(t, first)
    const moved = await call(t, 'POST', `/api/journeys/${first}/as-new`, { revision })
    const id = (moved.body['journey'] as { id: string }).id
    await step(t, id, 'preguntas', { data: { interests: 'Me gusta cocinar y explicar recetas.' } })
    await step(t, id, 'nichos', { data: { answers: [] } })
    const niches = await propose(t, id, 'nichos', 'nichos')
    await call(t, 'PATCH', `/api/proposals/${niches.id}`, { selectedIndex: 0, status: 'aprobada' })
    await step(t, id, 'ritmo')
    await step(t, id, 'conceptos', { data: { hoursPerWeek: 8, onCamera: 'voz', audienceRegion: 'espana' } })
    const concepts = await propose(t, id, 'conceptos', 'conceptos')
    await call(t, 'PATCH', `/api/proposals/${concepts.id}`, { selectedIndex: 0, status: 'aprobada' })
    await step(t, id, 'nombres')
    expect((await step(t, id, 'hecho')).status).toBe(200)
    const { profile, channel } = (await call(t, 'GET', '/api/channels/current')).body as {
      profile: { profile: { name: unknown } }
      channel: Body
    }
    expect(profile.profile.name).toEqual({
      displayName: 'Cocina en Tres',
      handle: 'cocinatres',
      status: 'elegido',
      checkId: null,
    })
    expect(channel).toMatchObject({ displayName: 'Cocina en Tres', handle: 'cocinatres', nameStatus: 'elegido' })
  })
})

describe('the audience of a channel that exists (FR-014b)', () => {
  it('changing it in the positioning is the answer: the next proposal keeps it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const first = await propose(t, id, 'posicionamiento', 'posicionamiento')
    const payload = first.payload as { audience: { region: string } }
    const edited = { ...payload, audience: { ...payload.audience, region: 'latam' } }
    expect((await call(t, 'PATCH', `/api/proposals/${first.id}`, { editedPayload: edited })).status).toBe(200)
    expect((await view(t, id)).state.audienceRegion).toBe('latam')
    const { channel } = (await call(t, 'GET', '/api/channels/current')).body as {
      channel: { audienceRegion: string }
    }
    expect(channel.audienceRegion).toBe('latam')
    const next = await propose(t, id, 'posicionamiento', 'posicionamiento')
    expect((next.payload as { audience: { region: string } }).audience.region).toBe('latam')
  })
})

describe('«Volver a leer tu canal» from the profile (entry 125)', () => {
  it('reads the channel again without the AI: a new reading, and a new version with its figures', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { id } = await atPositioning(t)
    const positioning = await propose(t, id, 'posicionamiento', 'posicionamiento')
    await call(t, 'PATCH', `/api/proposals/${positioning.id}`, { status: 'aprobada' })
    expect((await step(t, id, 'hecho')).status).toBe(200)
    const before = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    const channelId = String(((await call(t, 'GET', '/api/channels/current')).body['channel'] as Body)['id'])
    const spent = t.usage.list().length

    const started = await call(t, 'POST', `/api/channels/${channelId}/profile/remeasure`)
    expect(started.status).toBe(202)
    const { jobId } = jobStartedSchema.parse(started.body)
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))

    const after = profileVersionSchema.parse((await call(t, 'GET', '/api/channels/current')).body['profile'])
    expect(after).toMatchObject({ version: before.version + 1, origin: 'manual' })
    expect(after.profile.context?.readingId).not.toBe(before.profile.context?.readingId)
    expect(after.profile.context?.currentProfile).toBe(before.profile.context?.currentProfile)
    expect(after.profile.sources.map((s) => s.id)).toContain(after.profile.context?.readingId)
    expect(after.profile.sources.map((s) => s.id)).not.toContain(before.profile.context?.readingId)
    expect(after.profile.concept.promise).toBe(before.profile.concept.promise)
    expect(t.usage.list()).toHaveLength(spent)

    // The page reads the reading of the profile, not the last one: a version brought back keeps its own (FR-027).
    const own = await call(t, 'GET', `/api/channels/${channelId}/profile/reading`)
    expect((own.body as Body)['id']).toBe(after.profile.context?.readingId)
    const restored = await call(t, 'POST', `/api/channels/${channelId}/profile/restore`, { version: before.version })
    expect(restored.status).toBe(200)
    const back = await call(t, 'GET', `/api/channels/${channelId}/profile/reading`)
    expect((back.body as Body)['id']).toBe(before.profile.context?.readingId)
  })
})

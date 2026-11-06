import { safeThumbnail } from '@ytcreator/core'
import { journeyViewSchema, proposalSchema, resolvedChannelSchema } from '@ytcreator/core/api'
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

async function connect(t: TestApp) {
  await call(t, 'PUT', '/api/settings/limits', { perOperationCents: 500, dailyCents: 1000, monthlyCents: 5000 })
  await call(t, 'PUT', '/api/ai/connections/pago_por_uso/credential', { key: 'sk-ant-api03-FAKE-existing-0123456789' })
  await call(t, 'POST', '/api/ai/active', { kind: 'pago_por_uso' })
}

async function atLink(t: TestApp) {
  await connect(t)
  const created = await call(t, 'POST', '/api/channels', { origin: 'existente' })
  return (created.body['journey'] as { id: string }).id
}

const read = async (t: TestApp, id: string, input = '@cocinacorta30') => {
  const { revision } = await view(t, id)
  return call(t, 'POST', `/api/journeys/${id}/reading`, { revision, input })
}
const readingDone = async (t: TestApp, id: string) =>
  vi.waitFor(async () => {
    const { reading, jobs } = await view(t, id)
    expect(jobs.at(-1)?.status).toBe('hecho')
    expect(reading).not.toBeNull()
  })

async function atConfirm(t: TestApp, input = '@cocinacorta30') {
  const id = await atLink(t)
  await step(t, id, 'confirmar', { data: { channelInput: input } })
  return id
}

async function propose(t: TestApp, id: string, kind: string, use = kind) {
  const { revision } = await view(t, id)
  const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use })
  const created = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
    revision,
    kind,
    estimateId: estimate.body['estimateId'],
  })
  return { status: created.status, proposal: proposalSchema.safeParse(created.body).data, body: created.body }
}

const CHANNEL_30 = 'UCcocinacorta30000000000'

describe('POST /api/journeys/:id/resolve', () => {
  it('says which channel it is, from its @, its link or the link of one of its videos (FR-019)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atLink(t)
    for (const input of [
      '@cocinacorta30',
      'https://www.youtube.com/@cocinacorta30',
      `https://www.youtube.com/channel/${CHANNEL_30}`,
      'https://www.youtube.com/watch?v=co30v000xxx',
    ]) {
      const { status, body } = await call(t, 'POST', `/api/journeys/${id}/resolve`, { input })
      expect(status).toBe(200)
      expect(resolvedChannelSchema.parse(body)).toMatchObject({
        channelId: CHANNEL_30,
        title: 'Cocina Corta',
        handle: 'cocinacorta30',
        subscribers: 5500,
      })
    }
  })

  it('answers 404 when the channel does not exist or it is not a channel (US4 AS4)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atLink(t)
    for (const input of ['@nadietieneesto', 'https://ejemplo.invalid/algo', 'una frase cualquiera']) {
      const { status, body } = await call(t, 'POST', `/api/journeys/${id}/resolve`, { input })
      expect(status).toBe(404)
      expect(body['error']).toMatchObject({ code: 'no_encontrado' })
    }
  })

  it('the old /c/ and /user/ links find the channel too (FR-019, entry 144)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atLink(t)
    for (const input of ['https://www.youtube.com/c/cocinacorta30', 'youtube.com/user/cocinacorta30/videos']) {
      const { status, body } = await call(t, 'POST', `/api/journeys/${id}/resolve`, { input })
      expect(status, input).toBe(200)
      expect(JSON.stringify(body)).toContain(CHANNEL_30)
    }
  })

  it('validates the body and the journey', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atLink(t)
    expect((await call(t, 'POST', `/api/journeys/${id}/resolve`, { input: '' })).status).toBe(400)
    expect((await call(t, 'POST', '/api/journeys/nada/resolve', { input: '@cocinacorta30' })).status).toBe(404)
  })
})

describe('POST /api/journeys/:id/reading', () => {
  it('answers 202 with the job, moves on to the reading and keeps the name and the @', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    const started = await read(t, id)
    expect(started.status).toBe(202)
    expect(started.body['jobId']).toBeTruthy()
    await readingDone(t, id)
    const journey = await view(t, id)
    expect(journey.step).toBe('lectura')
    expect(journey.state.resolvedChannelId).toBe(CHANNEL_30)
    expect(journey.state.channelInput).toBe('@cocinacorta30')
    expect(journey.state.audienceRegion).toBe('espana')
    expect(journey.reading).toMatchObject({ title: 'Cocina Corta', youtubeChannelId: CHANNEL_30 })
    const { channel } = (await call(t, 'GET', '/api/channels/current')).body as { channel: Body }
    expect(channel).toMatchObject({
      displayName: 'Cocina Corta',
      handle: 'cocinacorta30',
      nameStatus: 'elegido',
      youtubeChannelId: CHANNEL_30,
    })
  })

  it('answers 404 when the channel does not exist, and the journey stays where it was', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    expect((await read(t, id, '@nadietieneesto')).status).toBe(404)
    expect((await view(t, id)).step).toBe('confirmar')
    expect((await call(t, 'POST', '/api/journeys/nada/reading', { revision: 0, input: '@x' })).status).toBe(404)
  })

  it('a channel another one of the app already has gives `conflicto`', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    t.channels.create({ origin: 'existente', youtubeChannelId: CHANNEL_30 })
    const repeated = await read(t, id)
    expect(repeated.status).toBe(409)
    expect(repeated.body['error']).toMatchObject({ code: 'conflicto', guard: 'ya_hay_canal' })
    expect((await view(t, id)).step).toBe('confirmar')
  })

  it('an old revision gives `conflicto`', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    const { revision } = await view(t, id)
    const { status } = await call(t, 'POST', `/api/journeys/${id}/reading`, { revision: revision + 1, input: '@x' })
    expect(status).toBe(409)
  })

  it('only an existing channel at its step can be read', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const created = await call(t, 'POST', '/api/channels', { origin: 'nuevo' })
    const id = (created.body['journey'] as { id: string }).id
    expect((await read(t, id)).status).toBe(400)
  })

  it('another channel leaves out what the AI said of the previous one', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    await read(t, id)
    await readingDone(t, id)
    const { proposal } = await propose(t, id, 'perfil_actual', 'lectura_canal')
    expect(proposal).toBeTruthy()
    await step(t, id, 'enlace')
    await step(t, id, 'confirmar', { data: { channelInput: '@platodiario' } })
    expect((await read(t, id, '@platodiario')).status).toBe(202)
    await vi.waitFor(async () => {
      expect((await view(t, id)).reading?.title).toBe('Plato Diario')
    })
    expect((await view(t, id)).proposals.filter((p) => p.kind === 'perfil_actual')).toEqual([])
  })

  it('another channel leaves out all of it, also what two tabs asked for at once', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    await read(t, id)
    await readingDone(t, id)
    expect((await propose(t, id, 'perfil_actual', 'lectura_canal')).proposal).toBeTruthy()
    expect((await propose(t, id, 'perfil_actual', 'lectura_canal')).proposal).toBeTruthy()
    await step(t, id, 'enlace')
    await step(t, id, 'confirmar', { data: { channelInput: '@platodiario' } })
    expect((await read(t, id, '@platodiario')).status).toBe(202)
    await vi.waitFor(async () => {
      expect((await view(t, id)).reading?.title).toBe('Plato Diario')
    })
    expect((await view(t, id)).proposals.filter((p) => p.kind === 'perfil_actual')).toEqual([])
  })

  it('while another channel is being read, the reading of the previous one is not shown as its own', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    await read(t, id)
    await readingDone(t, id)
    await step(t, id, 'enlace')
    await step(t, id, 'confirmar', { data: { channelInput: '@platodiario' } })
    await read(t, id, '@platodiario')
    const { reading, state } = await view(t, id)
    expect(reading === null || reading.youtubeChannelId === state.resolvedChannelId).toBe(true)
  })
})

describe('the same channel while it is being read', () => {
  it('confirming it again moves on to its reading, following the same job', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    const first = await read(t, id)
    await step(t, id, 'confirmar')
    expect((await view(t, id)).step).toBe('confirmar')
    const again = await read(t, id)
    expect(again.status).toBe(202)
    expect((await view(t, id)).step).toBe('lectura')
    await readingDone(t, id)
    expect(first.status).toBe(202)
  })
})

describe('the step to the AI needs the reading', () => {
  it('there is no estimate or proposal of the current profile without a reading', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atLink(t)
    expect((await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'lectura_canal' })).status).toBe(400)
  })

  it('with few videos the AI is not offered: there is too little to read', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t, '@cocinatres')
    await read(t, id, '@cocinatres')
    await readingDone(t, id)
    expect((await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'lectura_canal' })).status).toBe(400)
  })

  it('what the AI answers about a channel the creator has left is not kept', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    await read(t, id)
    await readingDone(t, id)
    const { revision } = await view(t, id)
    const estimate = await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'lectura_canal' })
    // The moment the answer arrives, the journey is already on another channel.
    const record = t.usage.record.bind(t.usage)
    vi.spyOn(t.usage, 'record').mockImplementationOnce((...args: Parameters<typeof record>) => {
      t.db.prepare(`UPDATE journey SET state = json_set(state, '$.resolvedChannelId', 'UCotro') WHERE id = ?`).run(id)
      return record(...args)
    })
    const late = await call(t, 'POST', `/api/journeys/${id}/proposals`, {
      revision,
      kind: 'perfil_actual',
      estimateId: estimate.body['estimateId'],
    })
    expect(late.status).toBe(409)
    expect((await view(t, id)).proposals.filter((p) => p.kind === 'perfil_actual')).toEqual([])
  })

  it('there is no estimate of the positioning without a current profile', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    await read(t, id)
    await readingDone(t, id)
    expect((await call(t, 'POST', `/api/journeys/${id}/estimate`, { use: 'posicionamiento' })).status).toBe(400)
  })
})

describe('the page lets in only the image of a channel (entry 56)', () => {
  it('the policy opens to its two places and nothing else', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const response = await t.request('GET', '/api/channels/current')
    expect(response.headers.get('content-security-policy')).toContain(
      "img-src 'self' https://*.ggpht.com https://*.googleusercontent.com;",
    )
  })

  it('an image is shown only if the policy would let it in', () => {
    expect(safeThumbnail('https://yt3.ggpht.com/a=s88')).toBe('https://yt3.ggpht.com/a=s88')
    expect(safeThumbnail('https://lh3.googleusercontent.com/a')).toBe('https://lh3.googleusercontent.com/a')
    expect(safeThumbnail('https://ggpht.com/a')).toBeNull()
    expect(safeThumbnail('https://evilggpht.com/a')).toBeNull()
    expect(safeThumbnail('http://yt3.ggpht.com/a')).toBeNull()
  })
})

describe('POST /api/journeys/:id/as-new (FR-022)', () => {
  it('with few videos starts a new journey that keeps the name and the @', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t, '@cocinatres')
    await read(t, id, '@cocinatres')
    await readingDone(t, id)
    expect((await view(t, id)).reading?.summary.lowInfo).toBe(true)
    const { revision } = await view(t, id)
    const moved = await call(t, 'POST', `/api/journeys/${id}/as-new`, { revision })
    expect(moved.status).toBe(201)
    const journey = moved.body['journey'] as { id: string; kind: string; step: string }
    expect(journey).toMatchObject({ kind: 'nuevo', step: 'intereses' })
    const next = await view(t, journey.id)
    expect(next.state.keptName).toEqual({ displayName: 'Cocina en Tres', handle: 'cocinatres' })
    expect((await view(t, id)).status).toBe('abandonado')
    const { channel, journey: active } = (await call(t, 'GET', '/api/channels/current')).body as {
      channel: Body
      journey: { id: string }
    }
    expect(active.id).toBe(journey.id)
    expect(channel).toMatchObject({ displayName: 'Cocina en Tres', handle: 'cocinatres', nameStatus: 'elegido' })
  })

  it('with enough videos it is refused', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t)
    await read(t, id)
    await readingDone(t, id)
    const { revision } = await view(t, id)
    expect((await call(t, 'POST', `/api/journeys/${id}/as-new`, { revision })).status).toBe(400)
  })

  it('an old revision gives `conflicto`', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const id = await atConfirm(t, '@cocinatres')
    await read(t, id, '@cocinatres')
    await readingDone(t, id)
    expect((await call(t, 'POST', `/api/journeys/${id}/as-new`, { revision: 0 })).status).toBe(409)
  })
})

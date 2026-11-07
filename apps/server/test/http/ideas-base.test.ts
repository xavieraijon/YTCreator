import { ideaBankSchema } from '@ytcreator/core/api'
import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

describe('GET /api/channels/:id/ideas', () => {
  it('without an approved profile: 409 sin_perfil, since the ideas are written for it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const created = await call(t, 'POST', '/api/channels', { origin: 'nuevo' })
    const channelId = (created.body['channel'] as { id: string }).id
    const got = await call(t, 'GET', `/api/channels/${channelId}/ideas`)
    expect(got.status).toBe(409)
    expect(got.body).toMatchObject({ error: { code: 'conflicto', fields: { profile: 'sin_perfil' } } })
    expect((await call(t, 'GET', `/api/channels/${channelId}/ideas/archived`)).status).toBe(409)
  })

  it('with a profile: an empty bank, with the version of the profile', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const got = await call(t, 'GET', `/api/channels/${channelId}/ideas`)
    expect(got.status).toBe(200)
    expect(ideaBankSchema.parse(got.body)).toEqual({
      ideas: [],
      queue: [],
      profileVersion: 1,
      pendingBatch: null,
      runningJob: null,
    })
    expect(await call(t, 'GET', `/api/channels/${channelId}/ideas/archived`)).toEqual({ status: 200, body: [] })
  })

  it('a channel that does not exist: 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    expect((await call(t, 'GET', '/api/channels/no-existe/ideas')).status).toBe(404)
  })

  it('shows the warnings of an idea: old measure, older revision and older profile', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const ideas = t.ideas
    const idea = ideas.ideas.create({
      channelId,
      origin: 'ia',
      title: 'Cena rápida',
      format: 'largo',
      profileVersion: 1,
    })
    t.ideas.measures.add({
      ideaId: idea.id,
      ideaRevision: 1,
      status: 'medida',
      verdict: 'hueco',
      reason: 'pocos_con_publico',
      figures: null,
      similarVideos: [],
      opportunity: null,
      queries: { query: 'cena rapida', broadQuery: null, queryEn: null },
      failure: null,
      source: 'fake',
      partial: false,
      thresholdsVersion: 5,
    })
    ideas.ideas.edit(idea.id, { title: 'Cena rápida de verdad' })
    t.channel.profiles.addVersion(channelId, {
      origin: 'manual',
      profile: t.channel.profiles.getCurrent(channelId)!.profile,
    })
    const bank = ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect(bank.profileVersion).toBe(2)
    expect(bank.ideas).toMatchObject([
      { id: idea.id, revision: 2, stale: false, measuredOlderRevision: true, fromOlderProfile: true },
    ])
    expect(bank.ideas[0]!.measure).toMatchObject({ verdict: 'hueco', ideaRevision: 1 })
  })

  it('the own ideas never carry the older-profile warning, and a failed measure is neither old nor outdated', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const own = t.ideas.ideas.create({ channelId, origin: 'creador', title: 'Mía', format: 'short', profileVersion: 1 })
    t.ideas.measures.add({
      ideaId: own.id,
      ideaRevision: 1,
      status: 'fallida',
      verdict: null,
      reason: null,
      figures: null,
      similarVideos: [],
      opportunity: null,
      queries: { query: 'mia', broadQuery: null, queryEn: null },
      failure: 'bloqueado',
      source: 'fake',
      partial: false,
      thresholdsVersion: 5,
    })
    t.ideas.ideas.edit(own.id, { title: 'Mía de verdad' })
    t.channel.profiles.addVersion(channelId, {
      origin: 'manual',
      profile: t.channel.profiles.getCurrent(channelId)!.profile,
    })
    const bank = ideaBankSchema.parse((await call(t, 'GET', `/api/channels/${channelId}/ideas`)).body)
    expect(bank.ideas).toMatchObject([{ fromOlderProfile: false, stale: false, measuredOlderRevision: false }])
  })
})

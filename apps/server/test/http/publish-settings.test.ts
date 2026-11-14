import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

// The fixed part of every description and the category of the channel (US2, research.md R6 and R12).
const settings = (t: ReturnType<typeof makeTestApp>, channelId: string) =>
  call(t, 'GET', `/api/channels/${channelId}/publish-settings`)

describe('publishing settings (US2)', () => {
  it('by default, the subscription link built from the @ of the profile, and the suggested category', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const { status, body } = await settings(t, channelId)
    expect(status).toBe(200)
    expect(body).toMatchObject({ isDefault: true, hasHandle: true, category: null, suggestedCategory: 'Educación' })
    expect(body['fixedText']).toMatch(/^Suscríbete .+https:\/\/www\.youtube\.com\/@[^?]+\?sub_confirmation=1$/)
    expect(body['categories']).toContain('Educación')
  })

  it('empty by default when the profile has no @ of the channel (decision 7)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t, { nameLater: true })
    expect((await settings(t, channelId)).body).toMatchObject({ fixedText: '', isDefault: true, hasHandle: false })
  })

  it('saves the fixed part and a category of the list, or none', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const saved = await call(t, 'PUT', `/api/channels/${channelId}/publish-settings`, {
      fixedText: 'Mis redes: en mi perfil.',
      category: 'Consejos y estilo',
    })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({
      fixedText: 'Mis redes: en mi perfil.',
      category: 'Consejos y estilo',
      isDefault: false,
    })
    const none = await call(t, 'PUT', `/api/channels/${channelId}/publish-settings`, { fixedText: '', category: null })
    expect(none.body).toMatchObject({ fixedText: '', category: null, isDefault: false })
  })

  it('refuses a category that is not in the list and a fixed part over 1.500 characters', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await finished(t)
    const put = (body: unknown) => call(t, 'PUT', `/api/channels/${channelId}/publish-settings`, body)
    expect((await put({ fixedText: '', category: 'Cocina' })).status).toBe(400)
    expect((await put({ fixedText: 'a'.repeat(1501), category: null })).status).toBe(400)
  })

  it('a channel that is not there is not found', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    await finished(t)
    expect((await settings(t, 'otro')).status).toBe(404)
  })
})

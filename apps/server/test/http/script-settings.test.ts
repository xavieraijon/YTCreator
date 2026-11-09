import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call, finished } from './flows.ts'

async function setUp() {
  const t = makeTestApp({ fakeAi: 'ok' })
  const { channelId } = await finished(t)
  return { t, path: `/api/channels/${channelId}/script-settings` }
}
const voice = { address: 'usted', register: 'sobrio', sample: 'Así hablo yo.', wordsPerMinute: 130 }

describe('the voice of the channel (contracts/http-api.md)', () => {
  it('starts with the defaults, and says they are', async () => {
    const { t, path } = await setUp()
    const got = await call(t, 'GET', path)
    expect(got.status).toBe(200)
    expect(got.body).toEqual({ address: 'tu', register: 'cercano', sample: '', wordsPerMinute: 150, isDefault: true })
  })

  it('keeps what is saved', async () => {
    const { t, path } = await setUp()
    expect((await call(t, 'PUT', path, voice)).body).toEqual({ ...voice, isDefault: false })
    expect((await call(t, 'GET', path)).body).toEqual({ ...voice, isDefault: false })
  })

  it.each([
    ['wordsPerMinute', 99],
    ['wordsPerMinute', 221],
    ['sample', 'x'.repeat(4001)],
    ['address', 'vos'],
    ['register', 'raro'],
  ])('refuses %s = %s', async (field, value) => {
    const { t, path } = await setUp()
    expect((await call(t, 'PUT', path, { ...voice, [field]: value })).status).toBe(400)
  })

  it('answers 404 for a channel that is not there', async () => {
    const { t } = await setUp()
    expect((await call(t, 'GET', '/api/channels/nope/script-settings')).status).toBe(404)
  })
})

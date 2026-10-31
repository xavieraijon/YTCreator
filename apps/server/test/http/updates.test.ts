import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>

async function get(t: TestApp) {
  const response = await t.request('GET', '/api/updates')
  return { status: response.status, body: await response.json() }
}

async function dismiss(t: TestApp, version: string) {
  const response = await t.request('POST', '/api/updates/dismiss', { version })
  return { status: response.status, body: await response.json() }
}

async function getGeneral(t: TestApp) {
  const response = await t.request('GET', '/api/settings/general')
  return { status: response.status, body: await response.json() }
}

async function patchGeneral(t: TestApp, body: Record<string, unknown>) {
  const response = await t.request('PATCH', '/api/settings/general', body)
  return { status: response.status, body: await response.json() }
}

describe('GET /api/updates', () => {
  it('makes no network requests: it only reads what the periodic check already saved', async () => {
    const t = makeTestApp()
    const { status, body } = await get(t)
    expect(status).toBe(200)
    expect(body).toEqual({ current: t.version, latest: null, show: false })
  })

  it('shows only when there is a newer version, the notice is enabled and it was not dismissed', async () => {
    const t = makeTestApp()
    t.settings.set('latest_version', '99.0.0')
    expect((await get(t)).body).toMatchObject({ latest: '99.0.0', show: true })

    t.settings.set('dismissed_version', '99.0.0')
    expect((await get(t)).body).toMatchObject({ latest: '99.0.0', show: false })
  })

  it('never shows an older or equal version as new', async () => {
    const t = makeTestApp()
    t.settings.set('latest_version', '0.1.0')
    expect((await get(t)).body).toMatchObject({ show: false })
  })

  it('never shows anything when the notice is disabled', async () => {
    const t = makeTestApp()
    t.settings.set('latest_version', '99.0.0')
    t.settings.set('update_check_enabled', false)
    expect((await get(t)).body).toMatchObject({ show: false })
  })
})

describe('POST /api/updates/dismiss', () => {
  it('remembers the dismissed version so it stops showing', async () => {
    const t = makeTestApp()
    t.settings.set('latest_version', '99.0.0')
    expect((await dismiss(t, '99.0.0')).status).toBe(200)
    expect((await get(t)).body).toMatchObject({ show: false })
  })
})

describe('GET /api/settings/general', () => {
  it('defaults to the notice enabled and no timeout override', async () => {
    const t = makeTestApp()
    expect((await getGeneral(t)).body).toEqual({ updateCheckEnabled: true, aiTimeoutSeconds: null })
  })
})

describe('PATCH /api/settings/general', () => {
  it('saves a timeout between 10 and 300 seconds', async () => {
    const t = makeTestApp()
    expect((await patchGeneral(t, { aiTimeoutSeconds: 120 })).body).toMatchObject({ aiTimeoutSeconds: 120 })
    expect((await getGeneral(t)).body).toMatchObject({ aiTimeoutSeconds: 120 })
  })

  it('accepts null to clear the timeout override', async () => {
    const t = makeTestApp()
    await patchGeneral(t, { aiTimeoutSeconds: 120 })
    expect((await patchGeneral(t, { aiTimeoutSeconds: null })).body).toMatchObject({ aiTimeoutSeconds: null })
  })

  it.each([9, 301])('rejects %i with 400 validacion', async (aiTimeoutSeconds) => {
    const t = makeTestApp()
    const { status, body } = await patchGeneral(t, { aiTimeoutSeconds })
    expect(status).toBe(400)
    expect(body).toEqual({ error: { code: 'validacion', fields: { aiTimeoutSeconds: 'no_valido' } } })
  })

  it('disables the update notice', async () => {
    const t = makeTestApp()
    expect((await patchGeneral(t, { updateCheckEnabled: false })).body).toMatchObject({ updateCheckEnabled: false })
    expect((await getGeneral(t)).body).toMatchObject({ updateCheckEnabled: false })
  })
})

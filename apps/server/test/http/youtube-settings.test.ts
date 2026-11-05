import { secretRef } from '@ytcreator/core'
import { jobStartedSchema, youtubeSettingsSchema } from '@ytcreator/core/api'
import { describe, expect, it, vi } from 'vitest'
import { youtubeChoice } from '../../src/services/youtube.ts'
import { makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>

// New on each run: finding it anywhere written can only be a leak.
const KEY = `AIzaFAKE-good-${Math.random().toString(36).slice(2)}-0123456789`
const BAD_KEY = `AIzaFAKE-bad-${Math.random().toString(36).slice(2)}-0123456789`
const DOWN_KEY = `AIzaFAKE-down-${Math.random().toString(36).slice(2)}-0123456789`

const seen: string[] = []
async function call(t: TestApp, method: string, path: string, body?: unknown) {
  const response = await t.request(method, path, body)
  const text = await response.text()
  seen.push(text)
  return { status: response.status, body: (text ? JSON.parse(text) : null) as Record<string, unknown> }
}
const settingsOf = async (t: TestApp) =>
  youtubeSettingsSchema.parse((await call(t, 'GET', '/api/settings/youtube')).body)

// Every row of every table, as text.
function databaseText(t: TestApp): string {
  const tables = t.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  return tables.map(({ name }) => JSON.stringify(t.db.prepare(`SELECT * FROM "${name}"`).all())).join('\n')
}

describe('GET /api/settings/youtube', () => {
  it('by default: automatic source, no key, the reader version and no quota', async () => {
    const t = makeTestApp({ readerVersion: '2026.08.19' })
    expect(await settingsOf(t)).toEqual({
      source: 'auto',
      effectiveSource: 'fake',
      ytdlpVersion: '2026.08.19',
      apiKey: { set: false, hint: null, rejected: false },
    })
  })
})

describe('PUT /api/settings/youtube/source', () => {
  it('saves the source and answers the settings', async () => {
    const t = makeTestApp()
    const saved = await call(t, 'PUT', '/api/settings/youtube/source', { source: 'ytdlp' })
    expect(saved.status).toBe(200)
    expect(youtubeSettingsSchema.parse(saved.body).source).toBe('ytdlp')
    expect(t.settings.get('youtube.source')).toBe('ytdlp')
  })

  it('a source that does not exist → 400', async () => {
    const t = makeTestApp()
    expect((await call(t, 'PUT', '/api/settings/youtube/source', { source: 'otra' })).status).toBe(400)
  })
})

describe('PUT /api/settings/youtube/api-key', () => {
  it('a key that works: checked with one call, kept in the secret store, only its hint comes back', async () => {
    const t = makeTestApp()
    const saved = await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: KEY })
    expect(saved.status).toBe(200)
    expect(youtubeSettingsSchema.parse(saved.body).apiKey).toEqual({ set: true, hint: KEY.slice(-4), rejected: false })
    expect(t.youtubeKeyChecks).toEqual([KEY.slice(-4)])
    const ref = t.settings.get('youtube.api_key_ref')!
    expect(ref).toBe(secretRef('youtube', 'data_api'))
    const stored = await t.secrets.get(ref)
    expect(stored.ok && stored.value?.reveal()).toBe(KEY)
    expect(t.settings.get('youtube.api_key_hint')).toBe(KEY.slice(-4))
    expect(youtubeChoice(t.settings).hasKey()).toBe(true)
  })

  it('a key YouTube refuses → 400 validacion, and nothing is kept', async () => {
    const t = makeTestApp()
    const refused = await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: BAD_KEY })
    expect(refused.status).toBe(400)
    expect(refused.body['error']).toEqual({ code: 'validacion', fields: { apiKey: 'no_valido' } })
    expect(t.settings.get('youtube.api_key_ref')).toBeNull()
    expect((await settingsOf(t)).apiKey.set).toBe(false)
  })

  it('YouTube could not be asked → 502 youtube, and nothing is kept', async () => {
    const t = makeTestApp()
    const down = await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: DOWN_KEY })
    expect(down.status).toBe(502)
    expect(down.body['error']).toEqual({ code: 'youtube', youtubeFailure: 'no_disponible' })
    expect(t.settings.get('youtube.api_key_ref')).toBeNull()
  })

  it('an empty key → 400 without asking YouTube', async () => {
    const t = makeTestApp()
    expect((await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: '  ' })).status).toBe(400)
    expect(t.youtubeKeyChecks).toEqual([])
  })
})

describe('DELETE /api/settings/youtube/api-key', () => {
  it('→ 204: the key leaves the secret store and the settings', async () => {
    const t = makeTestApp()
    await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: KEY })
    const ref = t.settings.get('youtube.api_key_ref')!
    const removed = await t.request('DELETE', '/api/settings/youtube/api-key')
    expect(removed.status).toBe(204)
    expect(await settingsOf(t)).toMatchObject({ apiKey: { set: false, hint: null, rejected: false } })
    const stored = await t.secrets.get(ref)
    expect(stored.ok && stored.value).toBeNull()
    expect(t.settings.get('youtube.api_key_hint')).toBeNull()
  })
})

describe('a key YouTube stops accepting (P15 a)', () => {
  it('is marked, is no longer used, and saving a new one clears the mark', async () => {
    const t = makeTestApp()
    await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: KEY })
    t.youtubeKeyRejected()
    expect((await settingsOf(t)).apiKey).toEqual({ set: true, hint: KEY.slice(-4), rejected: true })
    expect(youtubeChoice(t.settings).hasKey()).toBe(false)
    await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: KEY })
    expect((await settingsOf(t)).apiKey.rejected).toBe(false)
    expect(youtubeChoice(t.settings).hasKey()).toBe(true)
  })
})

describe('a late answer about a key already replaced (P15 a)', () => {
  it('marks nothing: only the key that was sent can be marked', async () => {
    const t = makeTestApp()
    await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: KEY })
    t.youtubeKeyRejected('zzzz')
    expect((await settingsOf(t)).apiKey.rejected).toBe(false)
  })
})

describe('«Siempre con mi clave» needs a key YouTube takes', () => {
  it('without a key, or with one rejected → 400 on source; and a key lost later falls back to the reader', async () => {
    const t = makeTestApp()
    const refused = await call(t, 'PUT', '/api/settings/youtube/source', { source: 'data_api' })
    expect(refused.status).toBe(400)
    expect(refused.body).toMatchObject({ error: { code: 'validacion', fields: { source: 'no_valido' } } })
    await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: KEY })
    expect((await call(t, 'PUT', '/api/settings/youtube/source', { source: 'data_api' })).status).toBe(200)
    t.youtubeKeyRejected()
    expect((await call(t, 'PUT', '/api/settings/youtube/source', { source: 'data_api' })).status).toBe(400)
  })
})

describe('the quota of the key (FR-030)', () => {
  it('with a key, the units of the day and a warning past 80 %', async () => {
    const t = makeTestApp()
    await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: KEY })
    t.ytQuota.add(7999)
    expect((await settingsOf(t)).quota).toEqual({ used: 7999, limit: 10_000, nearLimit: false })
    t.ytQuota.add(1)
    expect((await settingsOf(t)).quota).toEqual({ used: 8000, limit: 10_000, nearLimit: true })
  })
})

describe('POST /api/settings/youtube/update-reader', () => {
  it('→ 202 with the job; once done, the settings show the new version', async () => {
    const t = makeTestApp({ readerVersion: null, readerUpdate: async () => ({ ok: true, version: '2026.08.19' }) })
    const started = await call(t, 'POST', '/api/settings/youtube/update-reader')
    expect(started.status).toBe(202)
    const { jobId } = jobStartedSchema.parse(started.body)
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))
    expect(t.jobs.get(jobId)?.kind).toBe('actualizar_lector')
    expect((await settingsOf(t)).ytdlpVersion).toBe('2026.08.19')
  })

  it('a download that does not match its hash fails the job with its code', async () => {
    const t = makeTestApp({ readerVersion: '2026.01.01', readerUpdate: async () => ({ ok: false, failure: 'hash' }) })
    const { jobId } = jobStartedSchema.parse((await call(t, 'POST', '/api/settings/youtube/update-reader')).body)
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('fallido'))
    expect(t.jobs.get(jobId)?.failure).toBe('hash')
    expect((await settingsOf(t)).ytdlpVersion).toBe('2026.01.01')
  })
})

describe('the YouTube key never shows anywhere written (FR-033)', () => {
  it('not in the database, the logs or any answer', async () => {
    const t = makeTestApp()
    seen.length = 0
    await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: BAD_KEY })
    await call(t, 'PUT', '/api/settings/youtube/api-key', { apiKey: KEY })
    await settingsOf(t)
    t.youtubeKeyRejected()
    await settingsOf(t)
    await t.request('DELETE', '/api/settings/youtube/api-key')
    const written = [databaseText(t), t.logger.lines.join('\n'), ...seen]
    for (const key of [KEY, BAD_KEY]) {
      for (const needle of [key, key.slice(0, -4)]) {
        expect(written.filter((text) => text.includes(needle))).toEqual([])
      }
    }
  })
})

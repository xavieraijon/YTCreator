import { describe, expect, it } from 'vitest'
import { makeTestApp } from './helpers.ts'

describe('makeTestApp', () => {
  it('serves health through the guard and keeps state in memory', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const response = await t.request('GET', '/api/health')
    expect(response.status).toBe(200)
    expect(t.settings.get('update_check_enabled')).toBe(true)
    expect(t.registry.map((d) => d.id)).toContain('claude-code')
    expect(await t.request('POST', '/api/nada', {})).toHaveProperty('status', 404)
  })
})

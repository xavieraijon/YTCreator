import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { guard } from '../../src/http/guard.ts'

const PORT = 4310

function makeApp() {
  const app = new Hono()
  app.use('/api/*', guard(PORT))
  app.get('/api/health', (c) => c.json({ app: 'ytcreator' }))
  app.post('/api/thing', (c) => c.json({ ok: true }))
  app.delete('/api/thing', (c) => c.json({ ok: true }))
  return app
}

function send(method: string, headers: Record<string, string>, body?: string) {
  return makeApp().request(`http://127.0.0.1:${PORT}/api/${method === 'GET' ? 'health' : 'thing'}`, {
    method,
    headers,
    body,
  })
}

const LOCAL = { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}`, 'content-type': 'application/json' }

async function expectForbidden(response: Response) {
  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({ error: { code: 'prohibido' } })
}

describe('guard', () => {
  it('accepts 127.0.0.1 and localhost on the server port', async () => {
    expect((await send('POST', LOCAL, '{}')).status).toBe(200)
    const localhost = { ...LOCAL, host: `localhost:${PORT}`, origin: `http://localhost:${PORT}` }
    expect((await send('POST', localhost, '{}')).status).toBe(200)
  })

  it('refuses a foreign Host', async () => {
    await expectForbidden(await send('GET', { host: 'evil.example' }))
    await expectForbidden(await send('GET', { host: `127.0.0.1:${PORT + 1}` }))
    await expectForbidden(await send('POST', { ...LOCAL, host: `attacker.test:${PORT}` }, '{}'))
  })

  it('refuses a foreign or missing Origin on mutations', async () => {
    await expectForbidden(await send('POST', { ...LOCAL, origin: 'https://evil.example' }, '{}'))
    await expectForbidden(await send('POST', { ...LOCAL, origin: `http://127.0.0.1:${PORT + 1}` }, '{}'))
    await expectForbidden(await send('POST', { host: LOCAL.host, 'content-type': LOCAL['content-type'] }, '{}'))
    await expectForbidden(await send('DELETE', { host: LOCAL.host }))
  })

  it('refuses a body that is not JSON', async () => {
    await expectForbidden(await send('POST', { ...LOCAL, 'content-type': 'text/plain' }, '{}'))
    await expectForbidden(await send('POST', { ...LOCAL, 'content-type': 'application/x-www-form-urlencoded' }, 'a=1'))
    expect((await send('POST', { ...LOCAL, 'content-type': 'application/json; charset=utf-8' }, '{}')).status).toBe(200)
  })

  it('accepts a mutation without body', async () => {
    expect((await send('DELETE', { host: LOCAL.host, origin: LOCAL.origin })).status).toBe(200)
  })

  it('lets GET /api/health through without Origin', async () => {
    expect((await send('GET', { host: LOCAL.host })).status).toBe(200)
  })
})

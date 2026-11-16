import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/http/app.ts'
import { ApiError } from '../../src/http/errors.ts'
import { createMemoryLogger } from '../../src/logging.ts'

const PORT = 4310
const HOST = { host: `127.0.0.1:${PORT}` }
const webDir = mkdtempSync(join(tmpdir(), 'ytc-web-'))
mkdirSync(join(webDir, 'assets'))
writeFileSync(join(webDir, 'index.html'), '<html><head><script>theme()</script></head><body></body></html>')
writeFileSync(join(webDir, 'assets', 'app.js'), 'console.log(1)')
writeFileSync(join(tmpdir(), 'ytc-outside.txt'), 'secret')

afterAll(() => rmSync(webDir, { recursive: true, force: true }))

function makeApp() {
  const logger = createMemoryLogger()
  const app = createApp({ port: PORT, version: '0.1.0', instanceId: 'i-1', logger, webDir })
  app.get('/api/boom', () => {
    throw new Error('kaput sk-ant-api03-FAKEfakeFAKE')
  })
  app.get('/api/missing', () => {
    throw new ApiError({ code: 'no_encontrado' })
  })
  // A code with two statuses in the contract (007): `sin_audio` is 409 by default, 404 to read the audio.
  app.get('/api/no-audio', () => {
    throw new ApiError({ code: 'sin_audio' }, { status: 404 })
  })
  return { app, logger }
}

describe('createApp', () => {
  it('answers health with security headers', async () => {
    const response = await makeApp().app.request(`/api/health`, { headers: HOST })
    expect(await response.json()).toEqual({ app: 'ytcreator', version: '0.1.0', instanceId: 'i-1' })
    expect(response.headers.get('content-security-policy')).toMatch(/^default-src 'self'; script-src 'self' 'sha256-/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('maps ApiError and hides unexpected errors', async () => {
    const { app, logger } = makeApp()
    const missing = await app.request('/api/missing', { headers: HOST })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: { code: 'no_encontrado' } })
    const noAudio = await app.request('/api/no-audio', { headers: HOST })
    expect(noAudio.status).toBe(404)
    expect(await noAudio.json()).toEqual({ error: { code: 'sin_audio' } })
    expect(new ApiError({ code: 'sin_audio' }).status).toBe(409)

    const boom = await app.request('/api/boom', { headers: HOST })
    expect(boom.status).toBe(500)
    expect(await boom.json()).toEqual({ error: { code: 'interno' } })
    expect(logger.lines.join('\n')).toContain('kaput [oculto]')
  })

  it('serves static files and the SPA for any other GET', async () => {
    const { app } = makeApp()
    const script = await app.request('/assets/app.js')
    expect(script.headers.get('content-type')).toContain('text/javascript')
    expect(await script.text()).toBe('console.log(1)')
    expect(await (await app.request('/ajustes/ia')).text()).toContain('theme()')
    expect(await (await app.request('/../ytc-outside.txt')).text()).not.toBe('secret')
    expect(await (await app.request('/%2e%2e/ytc-outside.txt')).text()).not.toBe('secret')
  })

  it('answers no_encontrado for an unknown API route', async () => {
    const response = await makeApp().app.request('/api/nope', { headers: HOST })
    expect(response.status).toBe(404)
  })
})

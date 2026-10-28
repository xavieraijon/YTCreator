import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/http/app.ts'
import { createMemoryLogger } from '../../src/logging.ts'

const PORT = 4310
const LOCAL_HEADERS = { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}` }

function makeApp(onShutdown?: () => void) {
  return createApp({
    port: PORT,
    version: '0.1.0',
    instanceId: 'i-1',
    logger: createMemoryLogger(),
    webDir: null,
    onShutdown,
  })
}

describe('app routes (contracts/http-api.md)', () => {
  it('answers health', async () => {
    const response = await makeApp().request('/api/health', { headers: { host: LOCAL_HEADERS.host } })
    expect(await response.json()).toEqual({ app: 'ytcreator', version: '0.1.0', instanceId: 'i-1' })
  })

  it('shuts down: answers 202 {} and calls the shutdown callback once the response is out', async () => {
    const onShutdown = vi.fn()
    const app = makeApp(onShutdown)

    const response = await app.request('/api/app/shutdown', {
      method: 'POST',
      headers: { ...LOCAL_HEADERS, 'content-type': 'application/json' },
      body: '{}',
    })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({})
    expect(onShutdown).not.toHaveBeenCalled() // not yet: it only runs after the response has gone out
    await new Promise((resolve) => setImmediate(resolve))
    expect(onShutdown).toHaveBeenCalledOnce()
  })

  it('refuses to shut down without a local Origin', async () => {
    const onShutdown = vi.fn()
    const app = makeApp(onShutdown)

    const response = await app.request('/api/app/shutdown', {
      method: 'POST',
      headers: { host: LOCAL_HEADERS.host, 'content-type': 'application/json' },
      body: '{}',
    })

    expect(response.status).toBe(403)
    expect(onShutdown).not.toHaveBeenCalled()
  })
})

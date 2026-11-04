import { describe, expect, it } from 'vitest'
import { ApiClientError, createApiClient, type JobEventSource, watchJob } from '../src/api/client.ts'

const numberSchema = {
  parse(data: unknown) {
    if (typeof (data as { n?: unknown }).n !== 'number') throw new Error('no')
    return data as { n: number }
  },
}

function stub(status: number, body: string | null, seen: RequestInit[] = []) {
  return createApiClient({
    fetch: (async (_url: string, init: RequestInit) => {
      seen.push(init)
      return new Response(body, { status })
    }) as unknown as typeof fetch,
  })
}

async function caught(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiClientError) return error
    throw error
  }
  throw new Error('expected an ApiClientError')
}

describe('apiClient', () => {
  it('sends JSON and parses the response with the schema', async () => {
    const seen: RequestInit[] = []
    const client = stub(200, '{"n":3}', seen)
    expect(await client.post('/api/x', { a: 1 }, numberSchema)).toEqual({ n: 3 })
    expect(seen[0]?.headers).toMatchObject({ 'content-type': 'application/json' })
    expect(seen[0]?.body).toBe('{"a":1}')
  })

  it('sends no Content-Type without a body and accepts 204', async () => {
    const seen: RequestInit[] = []
    await expect(stub(204, null, seen).delete('/api/x')).resolves.toBeUndefined()
    expect(seen[0]?.headers).not.toHaveProperty('content-type')
  })

  it('turns an ApiError body into a typed error', async () => {
    const body = '{"error":{"code":"validacion","fields":{"daily":"debe_ser_positivo"}}}'
    const error = await caught(stub(400, body).get('/api/x', numberSchema))
    expect(error.kind).toBe('api')
    expect(error.status).toBe(400)
    expect(error.body).toEqual({ code: 'validacion', fields: { daily: 'debe_ser_positivo' } })
  })

  it('reports a network failure and an off-contract answer', async () => {
    const offline = createApiClient({ fetch: (() => Promise.reject(new TypeError('x'))) as typeof fetch })
    expect((await caught(offline.get('/api/x', numberSchema))).kind).toBe('red')
    expect((await caught(stub(200, '{"n":"tres"}').get('/api/x', numberSchema))).kind).toBe('respuesta')
    expect((await caught(stub(500, '<html>').get('/api/x', numberSchema))).kind).toBe('respuesta')
  })

  it('an aborted request is `cancelada`, not a network failure', async () => {
    const hanging = createApiClient({
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })) as unknown as typeof fetch,
    })
    const controller = new AbortController()
    const pending = caught(hanging.post('/api/x', {}, numberSchema, { signal: controller.signal }))
    controller.abort()
    expect((await pending).kind).toBe('cancelada')
  })
})

describe('watchJob', () => {
  function fakeSource() {
    const listeners = new Map<string, (event: { data?: string }) => void>()
    const state = { url: '', closed: false }
    const source: JobEventSource = {
      addEventListener: (type, listener) => listeners.set(type, listener),
      close: () => {
        state.closed = true
      },
    }
    const open = (url: string) => {
      state.url = url
      return source
    }
    const send = (type: string, data: object) => listeners.get(type)?.({ data: JSON.stringify(data) })
    return { open, send, state }
  }

  it('hears the events of the job and closes when it ends', () => {
    const { open, send, state } = fakeSource()
    const events: unknown[] = []
    watchJob('b1', (event) => events.push(event), open)
    expect(state.url).toBe('/api/jobs/b1/events')
    send('progress', { type: 'progress', done: 1, total: 5 })
    send('item', { type: 'item', item: { id: 'm1' } })
    expect(state.closed).toBe(false)
    send('done', { type: 'done' })
    expect(state.closed).toBe(true)
    expect(events).toEqual([
      { type: 'progress', done: 1, total: 5 },
      { type: 'item', item: { id: 'm1' } },
      { type: 'done' },
    ])
  })

  it('a failed job closes too', () => {
    const { open, send, state } = fakeSource()
    watchJob('b1', () => {}, open)
    send('failed', { type: 'failed', failure: 'bloqueado' })
    expect(state.closed).toBe(true)
  })

  it('ignores what is not an event of the contract', () => {
    const { open, send } = fakeSource()
    const events: unknown[] = []
    watchJob('b1', (event) => events.push(event), open)
    send('progress', { type: 'otra cosa' })
    expect(events).toEqual([])
  })

  it('stops watching on demand', () => {
    const { open, state } = fakeSource()
    const stop = watchJob('b1', () => {}, open)
    stop()
    expect(state.closed).toBe(true)
  })
})

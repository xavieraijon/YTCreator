import { describe, expect, it } from 'vitest'
import { ApiClientError, createApiClient } from '../src/api/client.ts'

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
})

import { apiErrorSchema, type ApiErrorBody } from '@ytcreator/core/api'

// Any Zod schema from @ytcreator/core/api; structural so the web needs no direct zod import.
export interface Parser<T> {
  parse(data: unknown): T
}

// `red`: the request never reached the server (it is closed or restarting).
// `respuesta`: the server answered something that does not match the contract.
export type ApiClientErrorKind = 'api' | 'red' | 'respuesta'

export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind
  readonly status: number | null
  readonly body: ApiErrorBody['error'] | null

  constructor(kind: ApiClientErrorKind, status: number | null, body: ApiErrorBody['error'] | null) {
    super(body ? `api:${body.code}` : kind)
    this.name = 'ApiClientError'
    this.kind = kind
    this.status = status
    this.body = body
  }
}

export interface ApiClientOptions {
  fetch?: typeof globalThis.fetch
  baseUrl?: string // same origin by default: the server serves the SPA
}

export type ApiClient = ReturnType<typeof createApiClient>

export function createApiClient({ fetch = globalThis.fetch.bind(globalThis), baseUrl = '' }: ApiClientOptions = {}) {
  async function request<T>(method: string, path: string, body: unknown, schema: Parser<T> | null): Promise<T> {
    const init: RequestInit = { method, headers: { accept: 'application/json' } }
    if (body !== undefined) {
      init.headers = { ...init.headers, 'content-type': 'application/json' }
      init.body = JSON.stringify(body)
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, init)
    } catch {
      throw new ApiClientError('red', null, null)
    }

    const text = await response.text()
    let data: unknown = undefined
    if (text !== '') {
      try {
        data = JSON.parse(text)
      } catch {
        throw new ApiClientError('respuesta', response.status, null)
      }
    }

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(data)
      if (!parsed.success) throw new ApiClientError('respuesta', response.status, null)
      throw new ApiClientError('api', response.status, parsed.data.error)
    }

    if (schema === null) return undefined as T
    try {
      return schema.parse(data)
    } catch {
      throw new ApiClientError('respuesta', response.status, null)
    }
  }

  return {
    get: <T>(path: string, schema: Parser<T>) => request('GET', path, undefined, schema),
    post: <T>(path: string, body: unknown, schema: Parser<T>) => request('POST', path, body, schema),
    put: <T>(path: string, body: unknown, schema: Parser<T>) => request('PUT', path, body, schema),
    patch: <T>(path: string, body: unknown, schema: Parser<T>) => request('PATCH', path, body, schema),
    // 204 without a body.
    delete: (path: string) => request<void>('DELETE', path, undefined, null),
  }
}

export const apiClient = createApiClient()

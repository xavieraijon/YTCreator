import { apiErrorSchema, type ApiErrorBody } from '@ytcreator/core/api'

// Any Zod schema from @ytcreator/core/api; structural so the web needs no direct zod import.
export interface Parser<T> {
  parse(data: unknown): T
}

// `red`: the request never reached the server (it is closed or restarting).
// `respuesta`: the server answered something that does not match the contract.
// `cancelada`: the caller aborted it (the creator pressed «Cancelar»); nothing to show.
export type ApiClientErrorKind = 'api' | 'red' | 'respuesta' | 'cancelada'

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

export interface RequestOptions {
  signal?: AbortSignal
}

export type ApiClient = ReturnType<typeof createApiClient>

export function createApiClient({ fetch = globalThis.fetch.bind(globalThis), baseUrl = '' }: ApiClientOptions = {}) {
  async function request<T>(
    method: string,
    path: string,
    body: unknown,
    schema: Parser<T> | null,
    { signal }: RequestOptions = {},
  ): Promise<T> {
    const init: RequestInit = { method, headers: { accept: 'application/json' }, ...(signal ? { signal } : {}) }
    if (body !== undefined) {
      init.headers = { ...init.headers, 'content-type': 'application/json' }
      init.body = JSON.stringify(body)
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, init)
    } catch {
      throw new ApiClientError(signal?.aborted ? 'cancelada' : 'red', null, null)
    }

    let text: string
    try {
      text = await response.text()
    } catch {
      throw new ApiClientError(signal?.aborted ? 'cancelada' : 'red', null, null)
    }
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
    get: <T>(path: string, schema: Parser<T>, options?: RequestOptions) =>
      request('GET', path, undefined, schema, options),
    post: <T>(path: string, body: unknown, schema: Parser<T>, options?: RequestOptions) =>
      request('POST', path, body, schema, options),
    put: <T>(path: string, body: unknown, schema: Parser<T>, options?: RequestOptions) =>
      request('PUT', path, body, schema, options),
    patch: <T>(path: string, body: unknown, schema: Parser<T>, options?: RequestOptions) =>
      request('PATCH', path, body, schema, options),
    // 204 without a body.
    delete: (path: string, options?: RequestOptions) => request<void>('DELETE', path, undefined, null, options),
  }
}

export const apiClient = createApiClient()

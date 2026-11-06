import type { ChannelOrigin, ChannelUse, JourneyStep, ProposalKind } from '@ytcreator/core'
import {
  apiErrorSchema,
  type ApiErrorBody,
  channelCurrentSchema,
  channelSchema,
  createChannelResponseSchema,
  estimateSchema,
  type JobEvent,
  jobStartedSchema,
  jobEventSchema,
  journeySchema,
  channelReadingSchema,
  journeyViewSchema,
  knowledgeAgesSchema,
  pendingRegenerationSchema,
  profileRegenerationOutcomeSchema,
  profileVersionListSchema,
  profileVersionSchema,
  proposalOutcomeSchema,
  proposalSchema,
  referenceChannelsSchema,
  resolvedChannelSchema,
  usageListSchema,
  youtubeSettingsSchema,
  type YouTubeSourceSetting,
} from '@ytcreator/core/api'
import type { ChannelProfile, ProfilePart } from '@ytcreator/core'

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

export const channelApi = {
  current: (options?: RequestOptions) => apiClient.get('/api/channels/current', channelCurrentSchema, options),
  create: (origin: ChannelOrigin) => apiClient.post('/api/channels', { origin }, createChannelResponseSchema),
  journey: (id: string, options?: RequestOptions) => apiClient.get(`/api/journeys/${id}`, journeyViewSchema, options),
  step: (
    id: string,
    body: { revision: number; step: JourneyStep; data?: object; confirm?: boolean; nameLater?: boolean },
  ) => apiClient.post(`/api/journeys/${id}/step`, body, journeySchema),
  estimate: (id: string, use: ChannelUse, options?: RequestOptions) =>
    apiClient.post(`/api/journeys/${id}/estimate`, { use }, estimateSchema, options),
  propose: (
    id: string,
    body: { revision: number; kind: ProposalKind; estimateId: string; instructions?: string; parentId?: string },
    options?: RequestOptions,
  ) => apiClient.post(`/api/journeys/${id}/proposals`, body, proposalOutcomeSchema, options),
  back: (id: string) => apiClient.post(`/api/proposals/${id}/back`, {}, proposalSchema),
  measure: (id: string, body: { revision: number; niches: { label: string; queries: string[] }[]; force?: boolean }) =>
    apiClient.post(`/api/journeys/${id}/measures`, body, jobStartedSchema),
  checkNames: (
    id: string,
    body: { revision: number; names: { displayName: string; handle: string; origin: 'ia' | 'creador' }[] },
  ) => apiClient.post(`/api/journeys/${id}/name-checks`, body, jobStartedSchema),
  references: (id: string, body: { measureId: string; add?: string; remove?: string }) =>
    apiClient.post(`/api/journeys/${id}/references`, body, referenceChannelsSchema),
  resolve: (id: string, input: string) =>
    apiClient.post(`/api/journeys/${id}/resolve`, { input }, resolvedChannelSchema),
  read: (id: string, body: { revision: number; input: string }) =>
    apiClient.post(`/api/journeys/${id}/reading`, body, jobStartedSchema),
  asNew: (id: string, revision: number) =>
    apiClient.post(`/api/journeys/${id}/as-new`, { revision }, createChannelResponseSchema),
  decide: (id: string, body: { editedPayload?: unknown; selectedIndex?: number; status?: 'aprobada' | 'descartada' }) =>
    apiClient.patch(`/api/proposals/${id}`, body, proposalSchema),
}

// US5: the profile of the channel and its versions.
export const profileApi = {
  versions: (channelId: string) =>
    apiClient.get(`/api/channels/${encodeURIComponent(channelId)}/profile/versions`, profileVersionListSchema),
  version: (channelId: string, version: number) =>
    apiClient.get(`/api/channels/${encodeURIComponent(channelId)}/profile/versions/${version}`, profileVersionSchema),
  save: (channelId: string, body: { baseVersion: number; profile: ChannelProfile }) =>
    apiClient.put(`/api/channels/${encodeURIComponent(channelId)}/profile`, body, profileVersionSchema),
  // A new name for a new channel, with the check of its @ (entry 136): it is saved as a version `manual`.
  rename: (channelId: string, body: { displayName: string; handle: string; checkId?: string }) =>
    apiClient.patch(`/api/channels/${encodeURIComponent(channelId)}/name`, body, channelSchema),
  restore: (channelId: string, version: number) =>
    apiClient.post(`/api/channels/${encodeURIComponent(channelId)}/profile/restore`, { version }, profileVersionSchema),
  // «Volver a medir» (entry 114): a job; the new version is there once it is done.
  remeasure: (channelId: string) =>
    apiClient.post(`/api/channels/${encodeURIComponent(channelId)}/profile/remeasure`, {}, jobStartedSchema),
  // «Regenerar con IA» (entry 115): the cost first, then the proposal, then the creator's yes.
  estimate: (channelId: string, part: ProfilePart) =>
    apiClient.post(`/api/channels/${encodeURIComponent(channelId)}/profile/estimate`, { part }, estimateSchema),
  regenerate: (
    channelId: string,
    body: { part: ProfilePart; baseVersion: number; estimateId: string; instructions?: string },
  ) =>
    apiClient.post(
      `/api/channels/${encodeURIComponent(channelId)}/profile/regenerate`,
      body,
      profileRegenerationOutcomeSchema,
    ),
  reading: (channelId: string) =>
    apiClient.get(`/api/channels/${encodeURIComponent(channelId)}/profile/reading`, channelReadingSchema.nullable()),
  pendingRegeneration: (channelId: string) =>
    apiClient.get(`/api/channels/${encodeURIComponent(channelId)}/profile/regeneration`, pendingRegenerationSchema),
  discardRegeneration: (channelId: string, regenerationId: string) =>
    apiClient.delete(
      `/api/channels/${encodeURIComponent(channelId)}/profile/regeneration/${encodeURIComponent(regenerationId)}`,
    ),
  approveRegeneration: (channelId: string, body: { regenerationId: string; baseVersion: number }) =>
    apiClient.post(`/api/channels/${encodeURIComponent(channelId)}/profile/regenerated`, body, profileVersionSchema),
}

export const usageApi = {
  list: (options?: RequestOptions) => apiClient.get('/api/usage', usageListSchema, options),
  knowledge: (options?: RequestOptions) => apiClient.get('/api/settings/knowledge', knowledgeAgesSchema, options),
}

// Ajustes → YouTube. The key goes in once; only its hint ever comes back.
export const youtubeSettingsApi = {
  get: (options?: RequestOptions) => apiClient.get('/api/settings/youtube', youtubeSettingsSchema, options),
  source: (source: YouTubeSourceSetting) =>
    apiClient.put('/api/settings/youtube/source', { source }, youtubeSettingsSchema),
  saveKey: (apiKey: string) => apiClient.put('/api/settings/youtube/api-key', { apiKey }, youtubeSettingsSchema),
  removeKey: () => apiClient.delete('/api/settings/youtube/api-key'),
  updateReader: () => apiClient.post('/api/settings/youtube/update-reader', {}, jobStartedSchema),
}

const JOB_EVENTS: readonly JobEvent['type'][] = ['progress', 'item', 'done', 'failed']

// The part of EventSource used here, so it can be replaced in tests.
export interface JobEventSource {
  addEventListener(type: string, listener: (event: { data?: string }) => void): void
  close(): void
}

// Follows a job until it ends; returns how to stop watching (the job goes on in the server).
// A connection lost is retried by the browser; on coming back it hears the state the job is in.
export function watchJob(
  jobId: string,
  onEvent: (event: JobEvent) => void,
  open: (url: string) => JobEventSource = (url) => new EventSource(url) as unknown as JobEventSource,
): () => void {
  const source = open(`/api/jobs/${jobId}/events`)
  for (const type of JOB_EVENTS) {
    source.addEventListener(type, (message) => {
      const parsed = jobEventSchema.safeParse(JSON.parse(message.data ?? 'null'))
      if (!parsed.success) return
      onEvent(parsed.data)
      if (parsed.data.type === 'done' || parsed.data.type === 'failed') source.close()
    })
  }
  return () => source.close()
}

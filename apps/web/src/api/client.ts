import type { ChannelOrigin, ChannelUse, JourneyStep, ProposalKind } from '@ytcreator/core'
import {
  apiErrorSchema,
  type ApiErrorBody,
  channelCurrentSchema,
  channelSchema,
  createChannelResponseSchema,
  estimateSchema,
  batchDecideResultSchema,
  ideaBankSchema,
  ideaOrderResultSchema,
  ideaQueueResultSchema,
  ideaBatchOutcomeSchema,
  ideaQueriesOutcomeSchema,
  ideaSchema,
  measureEstimateSchema,
  newIdeaResultSchema,
  scriptSummarySchema,
  scriptSettingsViewSchema,
  scriptViewSchema,
  scriptReviewViewSchema,
  type ApproveDraftBody,
  type ClaimActionBody,
  type DraftSaveBody,
  type ScriptSettingsBody,
  type IdeaPatchBody,
  type OutlineSaveBody,
  type ScriptEstimateBody,
  type ScriptGenerateBody,
  type ScriptPatchBody,
  type NewIdeaBody,
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
import type { ChannelProfile, IdeaUse, ProfilePart } from '@ytcreator/core'

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

  // A download: the file and the name the server gives it. An error answers like any other call, so the page can
  // say it instead of leaving the app for the error's JSON.
  async function file(path: string): Promise<{ blob: Blob; name: string }> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, { headers: { accept: '*/*' } })
    } catch {
      throw new ApiClientError('red', null, null)
    }
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null))
      throw parsed.success
        ? new ApiClientError('api', response.status, parsed.data.error)
        : new ApiClientError('respuesta', response.status, null)
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1]
    if (!name) throw new ApiClientError('respuesta', response.status, null)
    try {
      return { blob: await response.blob(), name }
    } catch {
      throw new ApiClientError('red', null, null)
    }
  }

  return {
    file,
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
  step: (id: string, body: { revision: number; step: JourneyStep; data?: object; nameLater?: boolean }) =>
    apiClient.post(`/api/journeys/${id}/step`, body, journeySchema),
  // With the proposal being redone, the estimate counts it too: it is sent with the request (P17).
  estimate: (id: string, use: ChannelUse, options?: RequestOptions, proposalId?: string) =>
    apiClient.post(
      `/api/journeys/${id}/estimate`,
      { use, ...(proposalId ? { proposalId } : {}) },
      estimateSchema,
      options,
    ),
  propose: (
    id: string,
    body: { revision: number; kind: ProposalKind; estimateId: string; instructions?: string; parentId?: string },
    options?: RequestOptions,
  ) => apiClient.post(`/api/journeys/${id}/proposals`, body, proposalOutcomeSchema, options),
  back: (id: string) => apiClient.post(`/api/proposals/${id}/back`, {}, proposalSchema),
  forward: (id: string) => apiClient.post(`/api/proposals/${id}/forward`, {}, proposalSchema),
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

// The idea bank of a channel (specs/004-idea-bank/contracts/http-api.md).
const channelPath = (channelId: string) => `/api/channels/${encodeURIComponent(channelId)}`
export const ideasApi = {
  list: (channelId: string, options?: RequestOptions) =>
    apiClient.get(`${channelPath(channelId)}/ideas`, ideaBankSchema, options),
  archived: (channelId: string) => apiClient.get(`${channelPath(channelId)}/ideas/archived`, ideaSchema.array()),
  create: (channelId: string, body: NewIdeaBody) =>
    apiClient.post(`${channelPath(channelId)}/ideas`, body, newIdeaResultSchema),
  change: (ideaId: string, body: IdeaPatchBody) =>
    apiClient.patch(`/api/ideas/${encodeURIComponent(ideaId)}`, body, ideaSchema),
  estimate: (channelId: string, use: IdeaUse, ideaId?: string) =>
    apiClient.post(`${channelPath(channelId)}/ideas/estimate`, { use, ...(ideaId ? { ideaId } : {}) }, estimateSchema),
  propose: (channelId: string, body: { estimateId: string; instructions?: string }) =>
    apiClient.post(`${channelPath(channelId)}/idea-batches`, body, ideaBatchOutcomeSchema),
  decide: (batchId: string, body: { keep: number[]; discard: number[] }) =>
    apiClient.post(`/api/idea-batches/${encodeURIComponent(batchId)}/decide`, body, batchDecideResultSchema),
  measureEstimate: (channelId: string, ideaIds: string[]) =>
    apiClient.post(`${channelPath(channelId)}/idea-measures/estimate`, { ideaIds }, measureEstimateSchema),
  measure: (channelId: string, ideaIds: string[], fresh = false) =>
    apiClient.post(
      `${channelPath(channelId)}/idea-measures`,
      { ideaIds, ...(fresh ? { fresh: true } : {}) },
      jobStartedSchema,
    ),
  angles: (ideaId: string, body: { estimateId: string; instructions?: string }) =>
    apiClient.post(`/api/ideas/${encodeURIComponent(ideaId)}/angles`, body, ideaBatchOutcomeSchema),
  queries: (ideaId: string, body: { estimateId: string; revision: number }) =>
    apiClient.post(`/api/ideas/${encodeURIComponent(ideaId)}/queries`, body, ideaQueriesOutcomeSchema),
  order: (channelId: string, ids: string[]) =>
    apiClient.put(`${channelPath(channelId)}/ideas/order`, { ids }, ideaOrderResultSchema),
  queue: (channelId: string, ids: string[]) =>
    apiClient.put(`${channelPath(channelId)}/ideas/queue`, { ids }, ideaQueueResultSchema),
  download: (channelId: string, format: 'md' | 'json') =>
    apiClient.file(`${channelPath(channelId)}/ideas/export?format=${format}`),
}

const scriptPath = (id: string) => `/api/scripts/${encodeURIComponent(id)}`

// The script of an idea (specs/005-script-and-outline/contracts/http-api.md).
export const scriptsApi = {
  list: (channelId: string, options?: RequestOptions) =>
    apiClient.get(`${channelPath(channelId)}/scripts`, scriptSummarySchema.array(), options),
  open: (ideaId: string) => apiClient.post(`/api/ideas/${encodeURIComponent(ideaId)}/script`, {}, scriptViewSchema),
  get: (id: string, options?: RequestOptions) => apiClient.get(scriptPath(id), scriptViewSchema, options),
  change: (id: string, body: ScriptPatchBody) => apiClient.patch(scriptPath(id), body, scriptViewSchema),
  estimate: (id: string, body: ScriptEstimateBody, options?: RequestOptions) =>
    apiClient.post(`${scriptPath(id)}/estimate`, body, estimateSchema, options),
  generate: (id: string, body: ScriptGenerateBody) =>
    apiClient.post(`${scriptPath(id)}/generate`, body, jobStartedSchema),
  saveOutline: (id: string, body: OutlineSaveBody) =>
    apiClient.put(`${scriptPath(id)}/outline`, body, scriptViewSchema),
  approveOutline: (id: string, version: number) =>
    apiClient.post(`${scriptPath(id)}/outline/approve`, { version }, scriptViewSchema),
  review: (id: string, options?: RequestOptions) =>
    apiClient.get(`${scriptPath(id)}/review`, scriptReviewViewSchema, options),
  approveDraft: (id: string, body: ApproveDraftBody) =>
    apiClient.post(`${scriptPath(id)}/draft/approve`, body, scriptViewSchema),
  download: (id: string, format: 'md' | 'json') => apiClient.file(`${scriptPath(id)}/export?format=${format}`),
  downloadAll: (channelId: string, format: 'md' | 'json') =>
    apiClient.file(`${channelPath(channelId)}/scripts/export?format=${format}`),
  saveDraft: (id: string, body: DraftSaveBody) => apiClient.put(`${scriptPath(id)}/draft`, body, scriptViewSchema),
  actOnClaim: (id: string, claimId: string, body: ClaimActionBody) =>
    apiClient.post(`${scriptPath(id)}/claims/${encodeURIComponent(claimId)}`, body, scriptViewSchema),
  settings: (channelId: string, options?: RequestOptions) =>
    apiClient.get(`${channelPath(channelId)}/script-settings`, scriptSettingsViewSchema, options),
  saveSettings: (channelId: string, body: ScriptSettingsBody) =>
    apiClient.put(`${channelPath(channelId)}/script-settings`, body, scriptSettingsViewSchema),
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

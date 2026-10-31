import Anthropic from '@anthropic-ai/sdk'
import { UNKNOWN_FAILURE, type AiFailure } from '@ytcreator/core'

export type AnthropicFailure = { failure: AiFailure; status?: number; known: boolean }

const RESET_HEADERS = [
  'anthropic-ratelimit-requests-reset',
  'anthropic-ratelimit-tokens-reset',
  'anthropic-ratelimit-input-tokens-reset',
  'anthropic-ratelimit-output-tokens-reset',
]

// When the limit lifts: `retry-after` (seconds or an HTTP date), else the latest `anthropic-ratelimit-*-reset`.
export function resetsAt(headers: Headers | undefined, now: Date): string | undefined {
  const retryAfter = headers?.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    const date = Number.isFinite(seconds) ? new Date(now.getTime() + seconds * 1000) : new Date(retryAfter)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  const resets = RESET_HEADERS.map((name) => Date.parse(headers?.get(name) ?? '')).filter((ms) => !Number.isNaN(ms))
  return resets.length ? new Date(Math.max(...resets)).toISOString() : undefined
}

function errorType(error: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = error.error as { error?: { type?: unknown } } | undefined
  return typeof body?.error?.type === 'string' ? body.error.type : undefined
}

// Maps an error thrown by the SDK to a failure (research R13). Subclasses first: they inherit from each other.
// `known: false` means it fell through to `servicio_caido` and only its name may be logged.
export function classifyAnthropicError(error: unknown, now: Date): AnthropicFailure {
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return { failure: { kind: 'tiempo_agotado', reason: 'respuesta_lenta' }, known: true }
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { failure: { kind: 'no_disponible', reason: 'sin_conexion' }, known: true }
  }
  if (!(error instanceof Anthropic.APIError) || error.status === undefined) {
    return { failure: UNKNOWN_FAILURE, known: false }
  }
  const status = error.status
  const fail = (failure: AiFailure) => ({ failure, status, known: true })
  if (status === 401) return fail({ kind: 'sin_sesion', reason: 'clave_no_valida' })
  if (status === 403) return fail({ kind: 'sin_sesion', reason: 'sin_permiso' })
  if (
    status === 402 ||
    errorType(error) === 'billing_error' ||
    (status === 400 && /credit balance/i.test(error.message))
  ) {
    return fail({ kind: 'cupo_agotado', reason: 'sin_saldo' })
  }
  if (status === 429) {
    const at = resetsAt(error.headers, now)
    return fail({ kind: 'cupo_agotado', reason: 'limite_de_uso', ...(at ? { resetsAt: at } : {}) })
  }
  if (status >= 500) return fail({ kind: 'no_disponible', reason: 'servicio_caido' })
  return { failure: UNKNOWN_FAILURE, status, known: false }
}

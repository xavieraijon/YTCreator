import type { AiFailure } from '@ytcreator/core'
import { ApiClientError } from '../api/client.ts'
import { es } from '../strings/es.ts'

// Text of a failed request that is not an AI failure (those go through AiFailureMessage).
export function errorText(error: unknown): string {
  if (error instanceof ApiClientError && error.body?.guard) return es.guard[error.body.guard]
  if (error instanceof ApiClientError && error.body) return es.apiError[error.body.code]
  if (error instanceof ApiClientError && error.kind === 'red') return es.clientError.red
  return es.clientError.respuesta
}

// The AI failure of a refused request (`422 ia`), if that is what it was.
export function failureOf(error: unknown): AiFailure | null {
  return error instanceof ApiClientError ? (error.body?.failure ?? null) : null
}

// The creator pressed «Cancelar»: there is nothing to tell.
export const wasCancelled = (error: unknown) => error instanceof ApiClientError && error.kind === 'cancelada'

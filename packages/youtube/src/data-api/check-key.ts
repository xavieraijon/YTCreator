import type { Secret, YouTubeFailureCode } from '@ytcreator/core'
import { isTimeout } from '../handle.ts'
import { DATA_API_TIMEOUT_MS, type DataApiLimits } from './adapter.ts'
import { classifyResponse, isKeyRejected } from './classify.ts'

// `rechazada`: Google answered and does not take this key.
export type KeyCheck = { ok: true } | { ok: false; failure: 'rechazada' | YouTubeFailureCode }

export interface KeyCheckOptions {
  fetch: typeof globalThis.fetch
  limits: DataApiLimits
  timeoutMs?: number
}

// The cheapest call there is (1 unit): the list of languages, which says nothing about the creator.
const PROBE = 'https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&hl=es'

// Checks a key before it is kept (contracts/http-api.md): one call, the key only in X-Goog-Api-Key. Never throws.
// Today's count belongs to the saved key: the unit of this check is charged to the key being checked, so it neither
// waits on that count nor adds to it, and a new key can be saved on a day the old one ran out.
export async function checkDataApiKey(key: Secret, options: KeyCheckOptions): Promise<KeyCheck> {
  let response: Response
  try {
    response = await options.fetch(PROBE, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': key.reveal(), Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? DATA_API_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, failure: isTimeout(error) ? 'tiempo_agotado' : 'no_disponible' }
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (isKeyRejected(response.status, body)) return { ok: false, failure: 'rechazada' }
  const failure = classifyResponse(response.status, body)
  // Out of units today, or sent too fast: Google knew the key, so it is a good one.
  if (failure === null || failure === 'cupo_agotado' || failure === 'bloqueado') return { ok: true }
  return { ok: false, failure }
}

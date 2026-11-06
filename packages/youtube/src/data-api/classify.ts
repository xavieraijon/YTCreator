import type { YouTubeFailureCode } from '@ytcreator/core'

const QUOTA = new Set(['quotaExceeded', 'dailyLimitExceeded'])
const RATE = new Set(['rateLimitExceeded', 'userRateLimitExceeded'])

// The first `reason` of a googleapis error body, if any.
function reasonOf(body: unknown): string | undefined {
  const errors = (body as { error?: { errors?: { reason?: unknown }[] } } | null)?.error?.errors
  const reason = Array.isArray(errors) ? errors[0]?.reason : undefined
  return typeof reason === 'string' ? reason : undefined
}

// Maps a Data API answer to the port's failures (research R3). Null means the answer is good.
export function classifyResponse(status: number, body: unknown): YouTubeFailureCode | null {
  if (status >= 200 && status < 300) return null
  const reason = reasonOf(body)
  if (status === 429) return 'bloqueado'
  if (status === 403 && reason && QUOTA.has(reason)) return 'cupo_agotado'
  if (status === 403 && reason && RATE.has(reason)) return 'bloqueado'
  if (status === 404) return 'no_encontrado'
  // A bad or unauthorized key, the API off in the project, 5xx: the source cannot answer.
  return 'no_disponible'
}

// What Google answers when the problem is the key itself: not valid, expired, restricted, or the API off in its
// project. A key out of units or sent too fast is still a good key.
const KEY_REASONS = new Set([
  'keyInvalid',
  'keyExpired',
  'accessNotConfigured',
  'ipRefererBlocked',
  'API_KEY_INVALID',
  'API_KEY_EXPIRED',
  'API_KEY_SERVICE_BLOCKED',
  'API_KEY_HTTP_REFERRER_BLOCKED',
  'API_KEY_IP_ADDRESS_BLOCKED',
  'SERVICE_DISABLED',
])

function reasonsOf(body: unknown): string[] {
  const error = (body as { error?: { errors?: { reason?: unknown }[]; details?: { reason?: unknown }[] } } | null)
    ?.error
  const list = (value: unknown): { reason?: unknown }[] => (Array.isArray(value) ? value : [])
  return [...list(error?.errors), ...list(error?.details)]
    .map((item) => item?.reason)
    .filter((reason): reason is string => typeof reason === 'string')
}

export function isKeyRejected(status: number, body: unknown): boolean {
  if (status !== 400 && status !== 403) return false
  const reasons = reasonsOf(body)
  if (reasons.some((reason) => QUOTA.has(reason) || RATE.has(reason))) return false
  return reasons.some((reason) => KEY_REASONS.has(reason))
}

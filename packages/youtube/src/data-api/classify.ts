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

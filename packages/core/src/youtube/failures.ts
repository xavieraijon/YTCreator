// Failures of the YouTube port (contracts/youtube-data.md). Adapters never throw towards the domain.
export const YOUTUBE_FAILURES = [
  'sin_datos',
  'no_encontrado',
  'bloqueado',
  'cupo_agotado',
  'tiempo_agotado',
  'no_disponible',
] as const

export type YouTubeFailureCode = (typeof YOUTUBE_FAILURES)[number]

export interface YouTubeFailure {
  code: YouTubeFailureCode
}

export type YouTubeResult<T> = { ok: true; value: T } | { ok: false; failure: YouTubeFailure }

export const youtubeFailure = (code: YouTubeFailureCode): { ok: false; failure: YouTubeFailure } => ({
  ok: false,
  failure: { code },
})

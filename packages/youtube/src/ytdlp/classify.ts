import type { YouTubeFailureCode } from '@ytcreator/core'
import type { YtDlpRun } from './process.ts'

const BLOCKED = [/HTTP Error 429/i, /Sign in to confirm/i, /captcha/i]
const NOT_FOUND = [/HTTP Error 404/i, /Requested entity was not found/i]
// A channel with nothing of that kind has no such list: an answer, not a failure of the reader.
const NO_LIST = /does not have a \w+ tab/i

// Turns a finished run into a port failure, or null when it ended well (spike S1). An unknown error is
// no_disponible: the creator is told the reader failed, never shown yt-dlp's text.
export function classifyRun(run: YtDlpRun): YouTubeFailureCode | null {
  if (run.spawnError) return 'no_disponible'
  if (run.aborted) return 'tiempo_agotado'
  if (run.exitCode === 0) return null
  if (BLOCKED.some((re) => re.test(run.stderr))) return 'bloqueado'
  if (NOT_FOUND.some((re) => re.test(run.stderr))) return 'no_encontrado'
  if (NO_LIST.test(run.stderr)) return 'sin_datos'
  return 'no_disponible'
}

import { UNKNOWN_FAILURE, type AiFailure, type AiUsage } from '@ytcreator/core'

// The single JSON object `claude -p --output-format json` prints, also on error (spike S1).
interface ClaudeJson {
  is_error?: boolean
  result?: unknown
  structured_output?: unknown
  stop_reason?: string | null
  api_error_status?: number | null
  usage?: { input_tokens?: number; output_tokens?: number }
}

export type ClaudeOutcome =
  { ok: true; text: string; structured: unknown; usage: AiUsage } | { ok: false; failure: AiFailure; status?: number }

const NOT_INSTALLED: AiFailure = { kind: 'no_disponible', reason: 'programa_no_instalado' }
const OFFLINE =
  /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ENETUNREACH|Connection refused|Unable to connect/i
const NOT_LOGGED_IN = /Not logged in|Please run \/login|OAuth token (has )?expired/i

function parse(stdout: string): ClaudeJson | null {
  try {
    const value: unknown = JSON.parse(stdout)
    return value && typeof value === 'object' ? (value as ClaudeJson) : null
  } catch {
    return null
  }
}

function byStatus(status: number): AiFailure {
  if (status === 401) return { kind: 'sin_sesion', reason: 'sesion_caducada' }
  if (status === 403) return { kind: 'sin_sesion', reason: 'plan_sin_acceso' }
  // Without a recorded output there is no reset date to read (S1, pending): no `resetsAt`.
  if (status === 429) return { kind: 'cupo_agotado', reason: 'limite_de_uso' }
  return UNKNOWN_FAILURE
}

// Maps an exit of the CLI to a result (research R13). Failure is read from `is_error`, not from `subtype`, which
// says "success" even on error. Anything unknown is `servicio_caido`.
export function classifyClaudeResult(exitCode: number | null, stdout: string, spawnError?: string): ClaudeOutcome {
  if (spawnError === 'ENOENT' || spawnError === 'EACCES' || exitCode === 127)
    return { ok: false, failure: NOT_INSTALLED }
  const json = parse(stdout)
  if (!json) return { ok: false, failure: UNKNOWN_FAILURE }
  const status = json.api_error_status ?? undefined
  if (json.stop_reason === 'refusal') {
    return { ok: false, failure: { kind: 'contenido_filtrado', reason: 'rechazo_del_modelo' }, status }
  }
  if (json.is_error || exitCode !== 0) {
    const message = typeof json.result === 'string' ? json.result : ''
    if (status) return { ok: false, failure: byStatus(status), status }
    if (NOT_LOGGED_IN.test(message)) return { ok: false, failure: { kind: 'sin_sesion', reason: 'sesion_caducada' } }
    if (OFFLINE.test(message)) return { ok: false, failure: { kind: 'no_disponible', reason: 'sin_conexion' } }
    return { ok: false, failure: UNKNOWN_FAILURE }
  }
  return {
    ok: true,
    text: typeof json.result === 'string' ? json.result : '',
    structured: json.structured_output,
    usage: { inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens },
  }
}

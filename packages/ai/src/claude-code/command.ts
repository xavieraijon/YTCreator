import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Secret } from '@ytcreator/core'
import type { AiProfile } from '../profiles.ts'

// The only variables the CLI inherits: anything else (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, CLAUDE_CODE_USE_*,
// CLAUDE_EFFORT, MAX_THINKING_TOKENS…) could switch it to another account, provider or billing (CC1).
const INHERITED = ['PATH', 'HOME', 'LANG'] as const

// Spike S1: no retries (a network failure takes ~18 s instead of 3 min) and no telemetry or updates.
const QUIET = {
  CLAUDE_CODE_MAX_RETRIES: '0',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_TELEMETRY: '1',
  DISABLE_AUTOUPDATER: '1',
}

const SYSTEM_PROMPT = 'Eres el asistente de YTCreator. Responde en español y solo con lo que se te pide.'

export type Env = Record<string, string | undefined>

export interface ClaudeCommand {
  args: string[]
  env: Record<string, string>
}

export interface ClaudeRequest {
  jsonSchema?: unknown
  web?: boolean
}

export function cleanEnv(base: Env, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const name of INHERITED) {
    const value = base[name]
    if (value !== undefined) env[name] = value
  }
  return { ...env, ...QUIET, ...extra }
}

// The CLI the creator installed: YTCREATOR_CLAUDE_BIN, then the installer's location, then the PATH.
export function resolveClaudeBin(env: Env, exists: (path: string) => boolean = existsSync): string {
  if (env.YTCREATOR_CLAUDE_BIN) return env.YTCREATOR_CLAUDE_BIN
  const local = env.HOME ? join(env.HOME, '.local', 'bin', 'claude') : null
  return local && exists(local) ? local : 'claude'
}

// Flags of spike S1. The prompt goes on stdin and the token in the environment: neither is in argv (CC3).
export function buildClaudeCommand(
  profile: AiProfile,
  account: { token: Secret; configDir: string },
  request: ClaudeRequest,
  baseEnv: Env,
): ClaudeCommand {
  const args = ['-p', '--output-format', 'json', '--model', profile.model]
  if (profile.effort) args.push('--effort', profile.effort)
  // Neither of these two runs commands or reads files. WebFetch does open addresses from this machine, and nothing here
  // can filter them as the link check does (decision 38, P3).
  if (request.web) args.push('--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch', 'WebFetch')
  else args.push('--tools', '')
  args.push(
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--system-prompt',
    SYSTEM_PROMPT,
  )
  if (request.jsonSchema !== undefined) args.push('--json-schema', JSON.stringify(request.jsonSchema))
  const env = cleanEnv(baseEnv, {
    CLAUDE_CODE_OAUTH_TOKEN: account.token.reveal(),
    CLAUDE_CONFIG_DIR: account.configDir,
  })
  return { args, env }
}

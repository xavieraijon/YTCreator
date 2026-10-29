import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  UNKNOWN_FAILURE,
  type AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type CheckResult,
  type ProviderDeps,
  type Secret,
} from '@ytcreator/core'
import { COMPROBACION } from '@ytcreator/knowledge'
import { z } from 'zod'
import { resolveProfile } from '../profiles.ts'
import { classifyClaudeResult, type ClaudeOutcome } from './classify.ts'
import { buildClaudeCommand, cleanEnv, resolveClaudeBin, type Env } from './command.ts'
import { runClaude } from './process.ts'

const TIMED_OUT: AiFailure = { kind: 'tiempo_agotado', reason: 'respuesta_lenta' }
const NOT_INSTALLED: AiFailure = { kind: 'no_disponible', reason: 'programa_no_instalado' }
const VERSION_TIMEOUT_MS = 10_000

export interface ClaudeCodeOptions {
  env?: Env // defaults to process.env; only PATH, HOME and LANG reach the CLI
}

// `claude --version`, for the check and for the «Claude Code» status of the AI screen. Never throws.
export async function claudeVersion(
  bin: string,
  env: Env = process.env,
): Promise<{ ok: true; version: string } | { ok: false; failure: AiFailure }> {
  const run = await runClaude(bin, ['--version'], {
    env: cleanEnv(env),
    signal: AbortSignal.timeout(VERSION_TIMEOUT_MS),
  })
  if (run.spawnError || run.exitCode === 127) return { ok: false, failure: NOT_INSTALLED }
  const version = /\d+\.\d+\.\d+/.exec(run.stdout)?.[0]
  return run.exitCode === 0 && version ? { ok: true, version } : { ok: false, failure: UNKNOWN_FAILURE }
}

// Claude subscription through the CLI the creator installed (research R10), one config folder per account.
export function createClaudeCodeProvider(
  credentials: Secret,
  deps: ProviderDeps,
  options: ClaudeCodeOptions = {},
): AiProvider {
  const env = options.env ?? process.env
  const bin = deps.claudeBin ?? resolveClaudeBin(env)
  const profile = resolveProfile('claude-code', 'comprobacion', { aiTimeoutSeconds: deps.aiTimeoutSeconds })
  let configDir = deps.accountDir

  // The CLI writes into its config folder even without a session (S1): it gets one, and an empty cwd of its own.
  function folders() {
    configDir ??= mkdtempSync(join(tmpdir(), 'ytcreator-claude-'))
    const cwd = join(configDir, 'cwd')
    mkdirSync(cwd, { recursive: true, mode: 0o700 })
    return { configDir, cwd }
  }

  async function call(prompt: string, jsonSchema: unknown, signal?: AbortSignal): Promise<ClaudeOutcome> {
    try {
      const { configDir, cwd } = folders()
      const command = buildClaudeCommand(profile, { token: credentials, configDir }, { jsonSchema }, env)
      const timeout = AbortSignal.timeout(profile.timeoutMs)
      const run = await runClaude(bin, command.args, {
        env: command.env,
        cwd,
        input: prompt,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
      if (run.aborted) return { ok: false, failure: TIMED_OUT }
      return classifyClaudeResult(run.exitCode, run.stdout, run.spawnError)
    } catch (error) {
      // Only the name: an unknown message may quote the environment.
      deps.logger.warn('ai.unknown_error', { provider: 'claude-code', name: (error as Error)?.name })
      return { ok: false, failure: UNKNOWN_FAILURE }
    }
  }

  function logResult(operation: string, outcome: ClaudeOutcome | CheckResult) {
    const fields = outcome.ok
      ? { ok: true }
      : {
          ok: false,
          kind: outcome.failure.kind,
          reason: outcome.failure.reason,
          status: 'status' in outcome ? outcome.status : undefined,
        }
    deps.logger.info(`ai.${operation}`, { provider: 'claude-code', ...fields })
  }

  return {
    id: 'claude-code',
    capabilities: { text: true, structured: true, streaming: false, vision: false },
    billing: 'suscripcion',

    // Free for the creator (R12): the version, then a one-word call that counts against the plan, not money.
    async check(signal) {
      const version = await claudeVersion(bin, env)
      if (!version.ok) {
        logResult('check', version)
        return version
      }
      const outcome = await call(COMPROBACION.text, undefined, signal)
      logResult('check', outcome)
      return outcome.ok ? { ok: true } : { ok: false, failure: outcome.failure }
    },

    async generate<T>(request: AiRequest<T>): Promise<AiResult<T>> {
      const jsonSchema = request.schema ? z.toJSONSchema(request.schema) : undefined
      // A structured output that does not validate is asked for once more (principle IV).
      for (let attempt = 1; attempt <= 2; attempt++) {
        const outcome = await call(request.prompt.text, jsonSchema, request.signal)
        if (!outcome.ok) {
          logResult('generate', outcome)
          return { ok: false, failure: outcome.failure }
        }
        if (!request.schema) return { ok: true, value: outcome.text as T, usage: outcome.usage }
        const parsed = request.schema.safeParse(outcome.structured)
        if (parsed.success) return { ok: true, value: parsed.data, usage: outcome.usage }
        deps.logger.warn('ai.output_invalid', { provider: 'claude-code', attempt, issues: parsed.error.issues.length })
      }
      return { ok: false, failure: UNKNOWN_FAILURE }
    },
  }
}

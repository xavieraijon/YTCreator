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
  type AiUsage,
} from '@ytcreator/core'
import { COMPROBACION, WEB_LIMITS_NOTE, WEB_STRUCTURE_STEP } from '@ytcreator/knowledge'
import { z } from 'zod'
import { resolveProfile, type AiProfile } from '../profiles.ts'
import { addUsage } from '../usage.ts'
import { buildPrompt } from '../prompt.ts'
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

// The CLI refuses a schema that names its draft (2.1.322, T087): Zod writes `$schema`, so it goes.
export function cliSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  delete json['$schema']
  return json
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

  async function call(
    prompt: string,
    jsonSchema: unknown,
    signal?: AbortSignal,
    use: AiProfile = profile,
    web = false,
  ): Promise<ClaudeOutcome> {
    try {
      const { configDir, cwd } = folders()
      const command = buildClaudeCommand(use, { token: credentials, configDir }, { jsonSchema, web }, env)
      const timeout = AbortSignal.timeout(use.timeoutMs)
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
    capabilities: { text: true, structured: true, streaming: false, vision: false, webResearch: true },
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
      const jsonSchema = request.schema ? cliSchema(request.schema) : undefined
      // The CLI has no limit of its own: it goes in the instruction, and a subscription pays nothing per search (R5).
      const limits = request.web
        ? WEB_LIMITS_NOTE.replace('{busquedas}', String(request.web.maxSearches)).replace(
            '{lecturas}',
            String(request.web.maxFetches),
          )
        : null
      let prompt = buildPrompt(limits ? `${request.prompt.text}\n\n${limits}` : request.prompt.text, request.input)
      const useProfile = resolveProfile('claude-code', request.use, { aiTimeoutSeconds: deps.aiTimeoutSeconds })
      // A structured output that does not validate is asked for once more (principle IV).
      let usage: AiUsage = {}
      let searching = request.web !== undefined
      // The time of the use covers both tries when there is a search (contracts/ai-uses.md).
      const deadline = Date.now() + useProfile.timeoutMs
      for (let attempt = 1; attempt <= 2; attempt++) {
        const use = request.web ? { ...useProfile, timeoutMs: Math.max(1, deadline - Date.now()) } : useProfile
        const outcome = await call(prompt, jsonSchema, request.signal, use, searching)
        if (!outcome.ok) {
          logResult('generate', outcome)
          // Only the attempt before it consumed anything: a failure gives no count.
          return { ok: false, failure: outcome.failure, ...(attempt > 1 ? { usage } : {}) }
        }
        usage = addUsage(usage, outcome.usage)
        if (!request.schema) return { ok: true, value: outcome.text as T, usage }
        const parsed = request.schema.safeParse(outcome.structured)
        if (parsed.success) return { ok: true, value: parsed.data, usage }
        deps.logger.warn('ai.output_invalid', { provider: 'claude-code', attempt, issues: parsed.error.issues.length })
        // Only the step that gives the format is repeated: what it found goes back, and it does not search again (R4).
        if (searching) {
          searching = false
          prompt = buildPrompt(`${request.prompt.text}\n\n${WEB_STRUCTURE_STEP}`, {
            ...request.input,
            informe_web: outcome.text || JSON.stringify(outcome.structured ?? null),
          })
        }
      }
      return { ok: false, failure: UNKNOWN_FAILURE, invalidOutput: true, usage }
    },
  }
}

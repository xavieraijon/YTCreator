import type { ZodType } from 'zod'
import type { Secret } from '../secrets/secret.ts'
import type { AiCapabilities, Billing } from './capabilities.ts'
import type { AiFailure } from './failures.ts'
import type { AiUse } from './uses.ts'

export type CheckResult = { ok: true } | { ok: false; failure: AiFailure }

export interface AiRequest<T> {
  use: AiUse
  prompt: { id: string; version: number; text: string } // from packages/knowledge
  input?: Record<string, unknown> // data from YouTube and the creator, sent apart from the instructions
  schema?: ZodType<T> // structured output; without it, T = string
  signal?: AbortSignal
}

export interface AiUsage {
  inputTokens?: number
  outputTokens?: number
}

// `invalidOutput`: the structured output failed its schema twice; the domain shows it as `respuesta_invalida`.
// `usage` on a failure: what was consumed anyway, like an answer that was paid for and did not validate.
export type AiResult<T> =
  { ok: true; value: T; usage: AiUsage } | { ok: false; failure: AiFailure; invalidOutput?: true; usage?: AiUsage }

// check() and generate() never throw: every internal error is classified as an AiFailure.
export interface AiProvider {
  readonly id: string
  readonly capabilities: AiCapabilities
  readonly billing: Billing
  check(signal?: AbortSignal): Promise<CheckResult>
  generate<T>(request: AiRequest<T>): Promise<AiResult<T>>
}

export interface LoginStart {
  loginId: string
  url: string
  expiresAt: string // ISO
}

// The account fingerprint is the SHA-256 of the token: Claude gives no account identity (spike S3).
export type LoginResult = { ok: true; token: Secret } | { ok: false; failure: AiFailure }

export interface SubscriptionLogin {
  start(): Promise<{ ok: true; value: LoginStart } | { ok: false; failure: AiFailure }>
  complete(loginId: string, code: Secret): Promise<LoginResult>
  cancel(loginId: string): Promise<void>
}

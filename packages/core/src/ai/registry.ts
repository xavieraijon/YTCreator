import type { Secret } from '../secrets/secret.ts'
import type { Billing, ConnectionKind } from './capabilities.ts'
import type { AiProvider, SubscriptionLogin } from './port.ts'

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
  error(event: string, fields?: Record<string, unknown>): void
}

export interface ProviderDeps {
  fetch: typeof fetch
  now(): Date
  logger: Logger
  claudeBin?: string
  accountDir?: string
  aiTimeoutSeconds?: number | null // `ai_timeout_seconds` setting; replaces the profile timeout
}

// Adding a subscription later means registering one more descriptor (FR-015).
export interface ProviderDescriptor {
  id: string
  connectionKind: ConnectionKind
  billing: Billing
  label: string // text key, not the text
  create(credentials: Secret, deps: ProviderDeps): AiProvider
  login?: SubscriptionLogin // subscriptions only
}

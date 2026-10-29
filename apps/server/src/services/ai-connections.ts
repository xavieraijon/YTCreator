import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MAX_ACCOUNTS,
  secretRef,
  type AiFailure,
  type ConnectionKind,
  type Logger,
  type ProviderDeps,
  type ProviderDescriptor,
  type Secret,
  type SecretStore,
  type SubscriptionLogin,
} from '@ytcreator/core'
import type { AccountView, AiOverview, ConnectionView } from '@ytcreator/core/api'
import { accountView, type AccountsRepo } from '../db/repos/accounts.ts'
import { connectionView, type ConnectionsRepo } from '../db/repos/connections.ts'
import type { SettingsRepo } from '../db/repos/settings.ts'
import { ApiError } from '../http/errors.ts'
import { secretFingerprint } from '../secrets/fingerprint.ts'

export interface ClaudeCodeStatus {
  installed: boolean
  version: string | null
}

export interface AiConnectionsDeps {
  connections: ConnectionsRepo
  accounts: AccountsRepo
  settings: SettingsRepo
  secrets: SecretStore
  registry: ProviderDescriptor[]
  logger: Logger
  now: () => Date
  fetch: typeof fetch
  // APP_HOME/claude-accounts: one 0700 folder per account, the CLI's CLAUDE_CONFIG_DIR.
  claudeAccountsDir: string
  claudeCode: () => Promise<ClaudeCodeStatus>
}

export function createAiConnectionsService(deps: AiConnectionsDeps) {
  const { connections, accounts, secrets, logger } = deps
  // One subscription login at a time, like `claude setup-token`.
  let openLogin: string | null = null

  function descriptorFor(kind: ConnectionKind): ProviderDescriptor {
    const descriptor = deps.registry.find((d) => d.connectionKind === kind)
    if (!descriptor) throw new ApiError({ code: 'no_encontrado' })
    return descriptor
  }

  function subscriptionLogin(): { descriptor: ProviderDescriptor; login: SubscriptionLogin } {
    const descriptor = descriptorFor('suscripcion')
    if (!descriptor.login) throw new ApiError({ code: 'no_encontrado' })
    return { descriptor, login: descriptor.login }
  }

  function providerDeps(accountDir?: string): ProviderDeps {
    const aiTimeoutSeconds = deps.settings.get('ai_timeout_seconds')
    return { fetch: deps.fetch, now: deps.now, logger, aiTimeoutSeconds, ...(accountDir ? { accountDir } : {}) }
  }

  // Only codes: the reason says enough and a message could quote the credential.
  function failed(provider: string, operation: string, failure: AiFailure): ApiError {
    logger.warn('ai.connection_failed', { provider, operation, kind: failure.kind, reason: failure.reason })
    return new ApiError({ code: 'ia', failure })
  }

  async function storeOrFail(provider: string, ref: string, secret: Secret) {
    const stored = await secrets.set(ref, secret)
    if (!stored.ok) throw failed(provider, 'store_secret', stored.failure)
  }

  async function checkAccount(descriptor: ProviderDescriptor, id: string, token: Secret) {
    const provider = descriptor.create(token, providerDeps(join(deps.claudeAccountsDir, id)))
    const outcome = await provider.check()
    accounts.updateStatus(id, outcome)
    connections.syncSubscription(descriptor.id, accounts.list(descriptor.id))
  }

  return {
    async overview(): Promise<AiOverview> {
      const all = connections.list()
      const subscription = all.find((c) => c.kind === 'suscripcion')
      return {
        activeKind: all.find((c) => c.isActive)?.kind ?? null,
        connections: all.map(connectionView),
        accounts: subscription ? accounts.list(subscription.providerId).map(accountView) : [],
        claudeCode: { ...(await deps.claudeCode()), repair: { state: 'inactivo' } },
        hasLimits: connections.hasLimits(),
      }
    },

    // FR-017: checked for free first; the key and its row are only kept if the connection ends up `conectada`.
    // The connection stays inactive: activating pago_por_uso needs the spending limits (US3).
    async saveKey(kind: 'pago_por_uso', key: Secret): Promise<ConnectionView> {
      const descriptor = descriptorFor(kind)
      const outcome = await descriptor.create(key, providerDeps()).check()
      if (!outcome.ok) throw failed(descriptor.id, 'save_key', outcome.failure)
      const ref = secretRef(kind, descriptor.id)
      await storeOrFail(descriptor.id, ref, key)
      return connectionView(connections.upsertKey(kind, descriptor.id, ref, key.hint()))
    },

    async startLogin() {
      const { descriptor, login } = subscriptionLogin()
      if (openLogin) await login.cancel(openLogin)
      openLogin = null
      const started = await login.start()
      if (!started.ok) throw failed(descriptor.id, 'login_start', started.failure)
      openLogin = started.value.loginId
      return started.value
    },

    async completeLogin(loginId: string, code: Secret, label?: string): Promise<AccountView> {
      const { descriptor, login } = subscriptionLogin()
      if (openLogin === loginId) openLogin = null
      const result = await login.complete(loginId, code)
      if (!result.ok) throw failed(descriptor.id, 'login_complete', result.failure)

      const fingerprint = secretFingerprint(result.token)
      if (accounts.findByFingerprint(descriptor.id, fingerprint)) throw new ApiError({ code: 'conflicto' })
      if (accounts.count(descriptor.id) >= MAX_ACCOUNTS) {
        throw new ApiError({ code: 'validacion', guard: 'maximo_de_cuentas' })
      }

      const id = randomUUID()
      const ref = secretRef('cuenta', id)
      const dir = join(deps.claudeAccountsDir, id)
      await storeOrFail(descriptor.id, ref, result.token)
      try {
        await mkdir(dir, { recursive: true, mode: 0o700 })
        accounts.create({
          id,
          providerId: descriptor.id,
          label,
          fingerprint,
          secretRef: ref,
          hint: result.token.hint(),
        })
      } catch (error) {
        await secrets.delete(ref)
        await rm(dir, { recursive: true, force: true })
        throw error
      }
      connections.syncSubscription(descriptor.id, accounts.list(descriptor.id))
      await checkAccount(descriptor, id, result.token)
      return accountView(accounts.get(id)!)
    },

    async cancelLogin(loginId: string): Promise<void> {
      const { login } = subscriptionLogin()
      if (openLogin === loginId) openLogin = null
      await login.cancel(loginId)
    },
  }
}

export type AiConnectionsService = ReturnType<typeof createAiConnectionsService>

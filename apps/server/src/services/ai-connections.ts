import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProviderId } from '@ytcreator/ai'
import {
  MAX_ACCOUNTS,
  runWithRotation,
  secretRef,
  type AiFailure,
  type AiRequest,
  type AiResult,
  type CheckResult,
  type ConnectionKind,
  type Logger,
  type ProviderDeps,
  type ProviderDescriptor,
  type Secret,
  type SecretStore,
  type SubscriptionLogin,
} from '@ytcreator/core'
import type { AccountSwitched, AccountView, AiOverview, ConnectionView, RepairState } from '@ytcreator/core/api'
import { accountView, type AccountRow, type AccountsRepo } from '../db/repos/accounts.ts'
import { connectionView, LimitsRequiredError, type ConnectionsRepo } from '../db/repos/connections.ts'
import type { SettingsRepo } from '../db/repos/settings.ts'
import { ApiError } from '../http/errors.ts'
import { secretFingerprint } from '../secrets/fingerprint.ts'
import type { ActiveAi } from './ai-run.ts'

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
  repairState?: () => RepairState
}

const NO_SESSION: AiFailure = { kind: 'sin_sesion', reason: 'sesion_caducada' }

export function createAiConnectionsService(deps: AiConnectionsDeps) {
  const { connections, accounts, secrets, logger } = deps
  // One subscription login at a time, like `claude setup-token`. A re-login is tied to its account.
  let openLogin: { loginId: string; accountId: string | null } | null = null

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

  function findAccount(id: string): AccountRow {
    const account = accounts.get(id)
    if (!account) throw new ApiError({ code: 'no_encontrado' })
    return account
  }

  // A missing secret is a session to renew; a keychain that does not answer is its own failure.
  async function checkWith(descriptor: ProviderDescriptor, ref: string | null, accountDir?: string) {
    const stored = ref ? await secrets.get(ref) : { ok: true as const, value: null }
    if (!stored.ok) return { ok: false as const, failure: stored.failure }
    if (!stored.value) return { ok: false as const, failure: NO_SESSION }
    return descriptor.create(stored.value, providerDeps(accountDir)).check()
  }

  const accountDir = (id: string) => join(deps.claudeAccountsDir, id)

  async function checkStoredAccount(descriptor: ProviderDescriptor, account: AccountRow): Promise<CheckResult> {
    const outcome = await checkWith(descriptor, account.secretRef, accountDir(account.id))
    accounts.updateStatus(account.id, outcome)
    connections.syncSubscription(descriptor.id, accounts.list(descriptor.id))
    return outcome
  }

  // The option in use was removed: the other one takes over if it works and can be used (pago_por_uso needs limits).
  function fallBackFrom(removed: ConnectionKind): void {
    const other = connections.list().find((c) => c.kind !== removed)
    if (other?.status !== 'conectada') return
    if (other.kind === 'pago_por_uso' && !connections.hasLimits()) return
    connections.setActive(other.kind)
  }

  async function startSubscriptionLogin(accountId: string | null) {
    const { descriptor, login } = subscriptionLogin()
    if (openLogin) await login.cancel(openLogin.loginId)
    openLogin = null
    const started = await login.start()
    if (!started.ok) throw failed(descriptor.id, 'login_start', started.failure)
    openLogin = { loginId: started.value.loginId, accountId }
    return started.value
  }

  // FR-016d: the same secret_ref, folder, label and position; another row with that access → conflicto.
  async function replaceToken(descriptor: ProviderDescriptor, accountId: string, token: Secret, fingerprint: string) {
    const account = findAccount(accountId)
    const owner = accounts.findByFingerprint(descriptor.id, fingerprint)
    if (owner && owner.id !== accountId) throw new ApiError({ code: 'conflicto' })
    await storeOrFail(descriptor.id, account.secretRef, token)
    accounts.replaceCredential(accountId, fingerprint, token.hint())
    await checkStoredAccount(descriptor, findAccount(accountId))
    return accountView(findAccount(accountId))
  }

  // Runs one generation on an account, or on the key; a stored key that is gone is a session to renew.
  async function generateWith<T>(
    descriptor: ProviderDescriptor,
    ref: string | null,
    request: AiRequest<T>,
    dir?: string,
  ): Promise<AiResult<T>> {
    const stored = ref ? await secrets.get(ref) : { ok: true as const, value: null }
    if (!stored.ok) return { ok: false, failure: stored.failure }
    if (!stored.value) return { ok: false, failure: NO_SESSION }
    return descriptor.create(stored.value, providerDeps(dir)).generate(request)
  }

  return {
    // The connection in use, ready to generate; the subscription rotates between its accounts (R14).
    activeAi(): ActiveAi | null {
      const active = connections.active()
      if (!active) return null
      const descriptor = descriptorFor(active.kind)
      return {
        providerId: descriptor.id as ProviderId,
        billing: descriptor.billing,
        webResearch: descriptor.webResearch,
        async generate<T>(request: AiRequest<T>): Promise<AiResult<T>> {
          if (active.kind === 'pago_por_uso') return generateWith(descriptor, active.secretRef, request)
          const run = await runWithRotation(
            accounts.list(descriptor.id),
            (id) => generateWith(descriptor, findAccount(id).secretRef, request, accountDir(id)),
            deps.now(),
          )
          for (const update of run.updates) accounts.updateStatus(update.id, update.outcome)
          connections.syncSubscription(descriptor.id, accounts.list(descriptor.id))
          return run.result
        },
      }
    },

    async overview(): Promise<AiOverview> {
      const all = connections.list()
      const subscription = all.find((c) => c.kind === 'suscripcion')
      return {
        activeKind: all.find((c) => c.isActive)?.kind ?? null,
        connections: all.map(connectionView),
        accounts: subscription ? accounts.list(subscription.providerId).map(accountView) : [],
        claudeCode: { ...(await deps.claudeCode()), repair: deps.repairState?.() ?? { state: 'inactivo' } },
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

    startLogin: () => startSubscriptionLogin(null),

    // Like startLogin, but `completeLogin` then renews the token of this account instead of adding one.
    async startRelogin(accountId: string) {
      findAccount(accountId)
      return startSubscriptionLogin(accountId)
    },

    // `created` tells a new account (201) from a renewed one (200).
    async completeLogin(
      loginId: string,
      code: Secret,
      label?: string,
    ): Promise<{ account: AccountView; created: boolean }> {
      const { descriptor, login } = subscriptionLogin()
      const relogin = openLogin?.loginId === loginId ? openLogin.accountId : null
      if (openLogin?.loginId === loginId) openLogin = null
      const result = await login.complete(loginId, code)
      if (!result.ok) throw failed(descriptor.id, 'login_complete', result.failure)

      const fingerprint = secretFingerprint(result.token)
      if (relogin) {
        return { account: await replaceToken(descriptor, relogin, result.token, fingerprint), created: false }
      }
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
      await checkStoredAccount(descriptor, findAccount(id))
      return { account: accountView(findAccount(id)), created: true }
    },

    async cancelLogin(loginId: string): Promise<void> {
      const { login } = subscriptionLogin()
      if (openLogin?.loginId === loginId) openLogin = null
      await login.cancel(loginId)
    },

    // A failed check is a 200 with the new state; the subscription rotates (R14) and says which switches it made.
    async checkConnection(kind: ConnectionKind): Promise<ConnectionView & { switched?: AccountSwitched[] }> {
      const connection = connections.get(kind)
      if (!connection) throw new ApiError({ code: 'no_encontrado' })
      const descriptor = descriptorFor(kind)
      if (kind === 'pago_por_uso') {
        const outcome = await checkWith(descriptor, connection.secretRef)
        return connectionView(connections.updateStatus(kind, outcome)!)
      }

      const run = await runWithRotation(
        accounts.list(descriptor.id),
        async (id) => checkWith(descriptor, findAccount(id).secretRef, accountDir(id)),
        deps.now(),
      )
      for (const update of run.updates) accounts.updateStatus(update.id, update.outcome)
      const view = connectionView(connections.syncSubscription(descriptor.id, accounts.list(descriptor.id)))
      return run.switched.length > 0 ? { ...view, switched: run.switched } : view
    },

    // After Claude Code is installed again: the accounts that failed for its absence are checked, without rotating.
    async recheckNotInstalled(): Promise<void> {
      const descriptor = descriptorFor('suscripcion')
      for (const account of accounts.list(descriptor.id)) {
        if (account.reason === 'programa_no_instalado') await checkStoredAccount(descriptor, account)
      }
    },

    // One account, without rotating.
    async checkAccount(id: string): Promise<AccountView> {
      const descriptor = descriptorFor('suscripcion')
      await checkStoredAccount(descriptor, findAccount(id))
      return accountView(findAccount(id))
    },

    // FR-026: the other connections are kept, only `is_active` moves.
    async activate(kind: ConnectionKind): Promise<AiOverview> {
      if (connections.get(kind)?.status !== 'conectada') {
        throw new ApiError({ code: 'validacion', guard: 'sin_conexion' })
      }
      try {
        connections.setActive(kind)
      } catch (error) {
        if (error instanceof LimitsRequiredError) throw new ApiError({ code: 'validacion', guard: 'sin_limites' })
        throw error
      }
      return this.overview()
    },

    async deleteKey(kind: 'pago_por_uso'): Promise<void> {
      const connection = connections.get(kind)
      if (!connection) throw new ApiError({ code: 'no_encontrado' })
      if (connection.secretRef) {
        const deleted = await secrets.delete(connection.secretRef)
        if (!deleted.ok) throw failed(connection.providerId, 'delete_secret', deleted.failure)
      }
      connections.remove(kind)
      if (connection.isActive) fallBackFrom(kind)
    },

    // An exact permutation of the accounts; anything else is `validacion`.
    reorderAccounts(ids: string[]): AccountView[] {
      const descriptor = descriptorFor('suscripcion')
      const current = accounts.list(descriptor.id).map((a) => a.id)
      const same =
        ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id))
      if (!same) throw new ApiError({ code: 'validacion', fields: { ids: 'no_valido' } })
      return accounts.reorder(descriptor.id, ids).map(accountView)
    },

    renameAccount(id: string, label: string): AccountView {
      findAccount(id)
      return accountView(accounts.rename(id, label)!)
    },

    // Secret, CLAUDE_CONFIG_DIR folder and row; without accounts the subscription is no longer active.
    async deleteAccount(id: string): Promise<void> {
      const account = findAccount(id)
      const deleted = await secrets.delete(account.secretRef)
      if (!deleted.ok) throw failed(account.providerId, 'delete_secret', deleted.failure)
      await rm(accountDir(id), { recursive: true, force: true })
      accounts.remove(id)
      const wasActive = connections.get('suscripcion')?.isActive ?? false
      connections.syncSubscription(account.providerId, accounts.list(account.providerId))
      if (wasActive && !connections.active()) fallBackFrom('suscripcion')
    },
  }
}

export type AiConnectionsService = ReturnType<typeof createAiConnectionsService>

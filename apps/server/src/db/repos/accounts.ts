import type { DatabaseSync } from 'node:sqlite'
import { MAX_ACCOUNTS, type AiFailure, type ConnectionStatus } from '@ytcreator/core'
import type { AccountView } from '@ytcreator/core/api'
import { inTransaction } from '../transaction.ts'

export interface AccountRow {
  id: string
  providerId: string
  label: string
  fingerprint: string
  position: number
  status: ConnectionStatus
  reason: AiFailure['reason'] | null
  resetsAt: string | null
  lastCheckedAt: string | null
  lastCallAt: string | null
  secretRef: string
  hint: string
}

export interface NewAccount {
  id: string
  providerId: string
  label?: string
  // SHA-256 of the token, never the token or a piece of it (S3).
  fingerprint: string
  secretRef: string
  hint: string
}

export type CheckOutcome = { ok: true } | { ok: false; failure: AiFailure }

interface Row {
  id: string
  provider_id: string
  label: string
  identity_fingerprint: string
  position: number
  status: ConnectionStatus
  status_reason: AiFailure['reason'] | null
  resets_at: string | null
  last_checked_at: string | null
  last_call_at: string | null
  secret_ref: string
  secret_hint: string
}

function fromRow(row: Row): AccountRow {
  return {
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    fingerprint: row.identity_fingerprint,
    position: row.position,
    status: row.status,
    reason: row.status_reason,
    resetsAt: row.resets_at,
    lastCheckedAt: row.last_checked_at,
    lastCallAt: row.last_call_at,
    secretRef: row.secret_ref,
    hint: row.secret_hint,
  }
}

export function accountView(account: AccountRow): AccountView {
  return {
    id: account.id,
    label: account.label,
    position: account.position,
    status: account.status,
    reason: account.reason,
    resetsAt: account.resetsAt,
    lastCheckedAt: account.lastCheckedAt,
    lastCallAt: account.lastCallAt,
    hint: account.hint,
  }
}

// The status columns an outcome leaves behind; shared with the connections repo.
export function statusColumns(outcome: CheckOutcome) {
  if (outcome.ok) return { status: 'conectada' as ConnectionStatus, reason: null, resetsAt: null }
  const { kind, reason, resetsAt } = outcome.failure
  return { status: kind as ConnectionStatus, reason, resetsAt: kind === 'cupo_agotado' ? (resetsAt ?? null) : null }
}

export function createAccountsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectAll = db.prepare('SELECT * FROM subscription_account WHERE provider_id = ? ORDER BY position')
  const selectOne = db.prepare('SELECT * FROM subscription_account WHERE id = ?')
  const selectByFingerprint = db.prepare(
    'SELECT * FROM subscription_account WHERE provider_id = ? AND identity_fingerprint = ?',
  )
  const countAll = db.prepare('SELECT count(*) AS n FROM subscription_account WHERE provider_id = ?')
  const insert = db.prepare(
    `INSERT INTO subscription_account (id, provider_id, label, identity_fingerprint, position, status, secret_ref,
       secret_hint, created_at)
     VALUES (?, ?, ?, ?, ?, 'sin_comprobar', ?, ?, ?)`,
  )
  const setStatus = db.prepare(
    'UPDATE subscription_account SET status = ?, status_reason = ?, resets_at = ?, last_checked_at = ? WHERE id = ?',
  )
  const setLastCall = db.prepare('UPDATE subscription_account SET last_call_at = ? WHERE id = ?')

  const get = (id: string): AccountRow | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }
  const count = (providerId: string): number => (countAll.get(providerId) as { n: number }).n

  return {
    list: (providerId: string): AccountRow[] => (selectAll.all(providerId) as unknown as Row[]).map(fromRow),
    get,
    count,
    findByFingerprint(providerId: string, fingerprint: string): AccountRow | null {
      const row = selectByFingerprint.get(providerId, fingerprint) as Row | undefined
      return row ? fromRow(row) : null
    },

    // Appended at the end: positions stay 1..n without gaps. The default label is «Cuenta N».
    create(account: NewAccount): AccountRow {
      return inTransaction(db, () => {
        const position = count(account.providerId) + 1
        if (position > MAX_ACCOUNTS) throw new Error('maximo_de_cuentas')
        insert.run(
          account.id,
          account.providerId,
          account.label ?? `Cuenta ${position}`,
          account.fingerprint,
          position,
          account.secretRef,
          account.hint,
          now().toISOString(),
        )
        return get(account.id)!
      })
    },

    updateStatus(id: string, outcome: CheckOutcome): AccountRow | null {
      const { status, reason, resetsAt } = statusColumns(outcome)
      setStatus.run(status, reason, resetsAt, now().toISOString(), id)
      return get(id)
    },

    updateLastCall(id: string): void {
      setLastCall.run(now().toISOString(), id)
    },
  }
}

export type AccountsRepo = ReturnType<typeof createAccountsRepo>

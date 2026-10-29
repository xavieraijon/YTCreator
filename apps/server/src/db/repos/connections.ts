import type { DatabaseSync } from 'node:sqlite'
import type { AiFailure, ConnectionKind, ConnectionStatus } from '@ytcreator/core'
import type { ConnectionView } from '@ytcreator/core/api'
import { inTransaction } from '../transaction.ts'
import { statusColumns, type AccountRow, type CheckOutcome } from './accounts.ts'

export interface ConnectionRow {
  kind: ConnectionKind
  providerId: string
  isActive: boolean
  status: ConnectionStatus
  reason: AiFailure['reason'] | null
  resetsAt: string | null
  lastCheckedAt: string | null
  secretRef: string | null
  hint: string | null
}

interface Row {
  kind: ConnectionKind
  provider_id: string
  is_active: number
  status: ConnectionStatus
  status_reason: AiFailure['reason'] | null
  resets_at: string | null
  last_checked_at: string | null
  secret_ref: string | null
  secret_hint: string | null
}

export class LimitsRequiredError extends Error {
  constructor() {
    super('pago_por_uso cannot be active without spending limits')
    this.name = 'LimitsRequiredError'
  }
}

function fromRow(row: Row): ConnectionRow {
  return {
    kind: row.kind,
    providerId: row.provider_id,
    isActive: row.is_active === 1,
    status: row.status,
    reason: row.status_reason,
    resetsAt: row.resets_at,
    lastCheckedAt: row.last_checked_at,
    secretRef: row.secret_ref,
    hint: row.secret_hint,
  }
}

export function connectionView(connection: ConnectionRow): ConnectionView {
  return {
    kind: connection.kind,
    providerId: connection.providerId,
    isActive: connection.isActive,
    status: connection.status,
    reason: connection.reason,
    resetsAt: connection.resetsAt,
    lastCheckedAt: connection.lastCheckedAt,
    hint: connection.hint,
  }
}

type Summary = Pick<ConnectionRow, 'status' | 'reason' | 'resetsAt' | 'lastCheckedAt'>

const latest = (dates: (string | null)[]): string | null =>
  dates
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1) ?? null

// The subscription status sums up its accounts (data-model.md): `conectada` if any is; otherwise the failure of the
// first account in order, and with `cupo_agotado` on all of them, the nearest `resets_at`.
export function summarizeAccounts(accounts: AccountRow[]): Summary {
  const lastCheckedAt = latest(accounts.map((a) => a.lastCheckedAt))
  const first = accounts[0]
  if (!first) return { status: 'sin_sesion', reason: 'sesion_caducada', resetsAt: null, lastCheckedAt }
  if (accounts.some((a) => a.status === 'conectada')) {
    return { status: 'conectada', reason: null, resetsAt: null, lastCheckedAt }
  }
  if (accounts.every((a) => a.status === 'cupo_agotado')) {
    const resets = accounts.map((a) => a.resetsAt).filter((d): d is string => d !== null)
    return { status: 'cupo_agotado', reason: first.reason, resetsAt: resets.sort()[0] ?? null, lastCheckedAt }
  }
  return { status: first.status, reason: first.reason, resetsAt: first.resetsAt, lastCheckedAt }
}

export function createConnectionsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM ai_connection WHERE kind = ?')
  const selectAll = db.prepare('SELECT * FROM ai_connection ORDER BY kind')
  const upsertRow = db.prepare(
    `INSERT INTO ai_connection (kind, provider_id, status, status_reason, resets_at, last_checked_at, secret_ref,
       secret_hint, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (kind) DO UPDATE SET provider_id = excluded.provider_id, status = excluded.status,
       status_reason = excluded.status_reason, resets_at = excluded.resets_at,
       last_checked_at = excluded.last_checked_at, secret_ref = excluded.secret_ref,
       secret_hint = excluded.secret_hint, updated_at = excluded.updated_at`,
  )
  const setStatus = db.prepare(
    `UPDATE ai_connection SET status = ?, status_reason = ?, resets_at = ?, last_checked_at = ?, updated_at = ?
     WHERE kind = ?`,
  )
  const clearActive = db.prepare('UPDATE ai_connection SET is_active = 0, updated_at = ? WHERE is_active = 1')
  const markActive = db.prepare('UPDATE ai_connection SET is_active = 1, updated_at = ? WHERE kind = ?')
  const limitsExist = db.prepare('SELECT 1 FROM spending_limits WHERE id = 1')

  const get = (kind: ConnectionKind): ConnectionRow | null => {
    const row = selectOne.get(kind) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,
    list: (): ConnectionRow[] => (selectAll.all() as unknown as Row[]).map(fromRow),
    active: (): ConnectionRow | null =>
      (selectAll.all() as unknown as Row[]).map(fromRow).find((c) => c.isActive) ?? null,

    // A pago_por_uso row always carries its key: it is only written once the check ends `conectada` (FR-017).
    upsertKey(kind: ConnectionKind, providerId: string, secretRef: string, hint: string): ConnectionRow {
      const at = now().toISOString()
      upsertRow.run(kind, providerId, 'conectada', null, null, at, secretRef, hint, at, at)
      return get(kind)!
    },

    // The subscription row holds no secret: its status is the summary of its accounts.
    syncSubscription(providerId: string, accounts: AccountRow[]): ConnectionRow {
      const summary = summarizeAccounts(accounts)
      const at = now().toISOString()
      const current = get('suscripcion')
      upsertRow.run(
        'suscripcion',
        providerId,
        summary.status,
        summary.reason,
        summary.resetsAt,
        summary.lastCheckedAt,
        null,
        null,
        at,
        at,
      )
      if (current?.isActive && accounts.length === 0) clearActive.run(at)
      return get('suscripcion')!
    },

    updateStatus(kind: ConnectionKind, outcome: CheckOutcome): ConnectionRow | null {
      const { status, reason, resetsAt } = statusColumns(outcome)
      const at = now().toISOString()
      setStatus.run(status, reason, resetsAt, at, at, kind)
      return get(kind)
    },

    // Deactivates the others in the same transaction; pago_por_uso needs the spending limits (FR-021).
    setActive(kind: ConnectionKind): void {
      inTransaction(db, () => {
        if (kind === 'pago_por_uso' && !limitsExist.get()) throw new LimitsRequiredError()
        const at = now().toISOString()
        clearActive.run(at)
        markActive.run(at, kind)
      })
    },

    hasLimits: (): boolean => limitsExist.get() !== undefined,
  }
}

export type ConnectionsRepo = ReturnType<typeof createConnectionsRepo>

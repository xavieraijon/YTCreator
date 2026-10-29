import type { DatabaseSync } from 'node:sqlite'
import type { LimitsBody } from '@ytcreator/core/api'

interface Row {
  per_operation_cents: number
  daily_cents: number
  monthly_cents: number
  accepted_at: string
}

export interface SavedLimits extends LimitsBody {
  acceptedAt: string
}

// The single row of `spending_limits`; its CHECKs are the last line behind validateLimits.
export function createLimitsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const select = db.prepare('SELECT per_operation_cents, daily_cents, monthly_cents, accepted_at FROM spending_limits')
  const upsert = db.prepare(
    `INSERT INTO spending_limits (id, per_operation_cents, daily_cents, monthly_cents, accepted_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET per_operation_cents = excluded.per_operation_cents,
       daily_cents = excluded.daily_cents, monthly_cents = excluded.monthly_cents, accepted_at = excluded.accepted_at`,
  )

  const get = (): SavedLimits | null => {
    const row = select.get() as Row | undefined
    if (!row) return null
    return {
      perOperationCents: row.per_operation_cents,
      dailyCents: row.daily_cents,
      monthlyCents: row.monthly_cents,
      acceptedAt: row.accepted_at,
    }
  }

  return {
    get,
    // Accepting or changing them is the same act for the creator: `accepted_at` is always now.
    save(limits: LimitsBody): SavedLimits {
      upsert.run(limits.perOperationCents, limits.dailyCents, limits.monthlyCents, now().toISOString())
      return get()!
    },
  }
}

export type LimitsRepo = ReturnType<typeof createLimitsRepo>

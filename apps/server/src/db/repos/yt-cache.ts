import type { DatabaseSync } from 'node:sqlite'

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const HANDLE_CACHE_TTL_MS = 60 * 60 * 1000

export function createYtCacheRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT payload FROM yt_cache WHERE key = ? AND expires_at > ?')
  const upsert = db.prepare(
    `INSERT INTO yt_cache (key, payload, fetched_at, expires_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at,
       expires_at = excluded.expires_at`,
  )
  const deleteExpired = db.prepare('DELETE FROM yt_cache WHERE expires_at <= ?')

  return {
    get(key: string): unknown {
      const row = selectOne.get(key, now().toISOString()) as { payload: string } | undefined
      return row ? (JSON.parse(row.payload) as unknown) : null
    },

    set(key: string, payload: unknown, ttlMs: number): void {
      const at = now()
      upsert.run(key, JSON.stringify(payload), at.toISOString(), new Date(at.getTime() + ttlMs).toISOString())
    },

    purgeExpired(): number {
      return Number(deleteExpired.run(now().toISOString()).changes)
    },
  }
}

export type YtCacheRepo = ReturnType<typeof createYtCacheRepo>

const pacificFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Google resets the Data API quota at midnight Pacific time.
export const pacificDay = (at: Date): string => pacificFormat.format(at)

export function createYtQuotaRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT units FROM yt_quota WHERE day = ?')
  const upsert = db.prepare(
    'INSERT INTO yt_quota (day, units) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET units = units + excluded.units',
  )

  return {
    add(units: number, at: Date = now()): void {
      upsert.run(pacificDay(at), units)
    },

    used(at: Date = now()): number {
      const row = selectOne.get(pacificDay(at)) as { units: number } | undefined
      return row?.units ?? 0
    },
  }
}

export type YtQuotaRepo = ReturnType<typeof createYtQuotaRepo>

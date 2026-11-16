import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number
  sql: string
}

// The SQL files are embedded in dist/server.mjs (R24).
const files = import.meta.glob<string>('./migrations/*.sql', { query: '?raw', import: 'default', eager: true })

export const MIGRATIONS: Migration[] = Object.entries(files)
  .map(([path, sql]) => ({ version: Number(/\/(\d{4})_[^/]+\.sql$/.exec(path)?.[1]), sql }))
  .sort((a, b) => a.version - b.version)

export class UnknownMigrationError extends Error {
  readonly versions: number[]

  constructor(versions: number[]) {
    super(`The database has migrations this version does not know: ${versions.join(', ')}`)
    this.versions = versions
  }
}

/**
 * A migration that rebuilds a table other tables point at carries this line. SQLite ignores `PRAGMA foreign_keys`
 * inside a transaction, so it is turned off around it and every key is checked before committing
 * (the 12 steps of https://www.sqlite.org/lang_altertable.html#otheralter).
 */
export const FOREIGN_KEYS_OFF = '-- ytc:foreign-keys-off'

// Applies each pending migration in its own transaction. A database migrated by a newer version is refused (R7).
export function migrate(db: DatabaseSync, migrations: Migration[]): { applied: number[] } {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  const done = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => Number(row.version)),
  )
  const known = new Set(migrations.map((m) => m.version))
  const unknown = [...done].filter((v) => !known.has(v))
  if (unknown.length > 0) throw new UnknownMigrationError(unknown)

  const applied: number[] = []
  for (const migration of migrations) {
    if (done.has(migration.version)) continue
    const keysOff = migration.sql.includes(FOREIGN_KEYS_OFF)
    const keysWereOn = Number(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys) === 1
    if (keysOff) db.exec('PRAGMA foreign_keys = OFF')
    try {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.exec(migration.sql)
        if (keysOff) {
          const broken = db.prepare('PRAGMA foreign_key_check').all()
          if (broken.length > 0) {
            const tables = [...new Set(broken.map((row) => String(row.table)))].join(', ')
            throw new Error(`Migration ${migration.version} leaves ${broken.length} broken foreign keys in: ${tables}`)
          }
        }
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
          migration.version,
          new Date().toISOString(),
        )
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } finally {
      if (keysOff && keysWereOn) db.exec('PRAGMA foreign_keys = ON')
    }
    applied.push(migration.version)
  }
  return { applied }
}

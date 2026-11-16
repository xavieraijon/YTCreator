import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { FOREIGN_KEYS_OFF, MIGRATIONS, migrate } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'

const NOW = '2026-10-28T10:00:00.000Z'

function insertAccount(db: DatabaseSync, id: string, fingerprint: string, position: number) {
  db.prepare(
    `INSERT INTO subscription_account
       (id, provider_id, label, identity_fingerprint, position, status, secret_ref, secret_hint, created_at)
     VALUES (?, 'claude-code', 'Cuenta', ?, ?, 'conectada', ?, 'abcd', ?)`,
  ).run(id, fingerprint, position, `ytcreator:cuenta:${id}`, NOW)
}

function insertConnection(db: DatabaseSync, kind: string, isActive: number, status = 'conectada') {
  db.prepare(
    `INSERT INTO ai_connection (kind, provider_id, is_active, status, created_at, updated_at)
     VALUES (?, 'fake', ?, ?, ?, ?)`,
  ).run(kind, isActive, status, NOW, NOW)
}

function insertLimits(db: DatabaseSync, perOperation: number, daily: number, monthly: number) {
  db.prepare(
    `INSERT INTO spending_limits (id, per_operation_cents, daily_cents, monthly_cents, accepted_at)
     VALUES (1, ?, ?, ?, ?)`,
  ).run(perOperation, daily, monthly, NOW)
}

describe('migrate', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
  })

  it('applies every migration once and records it', () => {
    expect(migrate(db, MIGRATIONS)).toEqual({ applied: [] })
    const rows = db.prepare('SELECT version FROM schema_migrations').all()
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('creates the wizard row in bienvenida with revision 0', () => {
    const row = db.prepare('SELECT * FROM onboarding_state').get()
    expect(row).toMatchObject({ id: 1, step: 'bienvenida', chosen_kind: null, postponed: 0, revision: 0 })
  })

  it('refuses a second row in single-row tables', () => {
    expect(() =>
      db.prepare(`INSERT INTO onboarding_state (id, step, updated_at) VALUES (2, 'elegir', ?)`).run(NOW),
    ).toThrow()
    expect(() => insertLimits(db, 50, 300, 2000)).not.toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO spending_limits (id, per_operation_cents, daily_cents, monthly_cents, accepted_at)
           VALUES (2, 50, 300, 2000, ?)`,
        )
        .run(NOW),
    ).toThrow()
  })

  it('allows at most one active connection', () => {
    insertConnection(db, 'suscripcion', 1)
    expect(() => insertConnection(db, 'pago_por_uso', 1)).toThrow()
  })

  it('refuses the same fingerprint twice for a provider', () => {
    insertAccount(db, 'a', 'hash-1', 1)
    expect(() => insertAccount(db, 'b', 'hash-1', 2)).toThrow()
  })

  it('enforces the spending limit checks', () => {
    expect(() => insertLimits(db, 0, 300, 2000)).toThrow()
    expect(() => insertLimits(db, 50, 40, 2000)).toThrow()
    expect(() => insertLimits(db, 50, 300, 200)).toThrow()
    expect(() => insertLimits(db, 50, 300, 100001)).toThrow()
    expect(() => insertLimits(db, 50, 300, 100000)).not.toThrow()
  })

  it('refuses a step, kind or status outside its list', () => {
    expect(() => db.prepare(`UPDATE onboarding_state SET step = 'otro'`).run()).toThrow()
    expect(() => db.prepare(`UPDATE onboarding_state SET chosen_kind = 'otro'`).run()).toThrow()
    expect(() => insertConnection(db, 'otro', 0)).toThrow()
    expect(() => insertConnection(db, 'pago_por_uso', 0, 'otro')).toThrow()
  })

  it('refuses a database migrated by a newer version', () => {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (99, ?)').run(NOW)
    expect(() => migrate(db, MIGRATIONS)).toThrow(/99/)
  })

  it('rolls back a migration that fails', () => {
    const fresh = openDatabase(':memory:')
    const broken = [...MIGRATIONS, { version: 5, sql: 'CREATE TABLE ok (id INTEGER); SELECT nope FROM missing;' }]
    expect(() => migrate(fresh, broken)).toThrow()
    expect(fresh.prepare(`SELECT name FROM sqlite_master WHERE name = 'ok'`).get()).toBeUndefined()
    expect(
      fresh
        .prepare('SELECT version FROM schema_migrations')
        .all()
        .map((r) => r.version),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('rebuilds a table other tables point at with the keys off, and turns them on again', () => {
    const fresh = openDatabase(':memory:')
    const base = [
      { version: 1, sql: 'CREATE TABLE p (id TEXT PRIMARY KEY); CREATE TABLE c (p_id TEXT REFERENCES p (id));' },
    ]
    migrate(fresh, base)
    fresh.exec(`INSERT INTO p VALUES ('a'); INSERT INTO c VALUES ('a')`)
    const rebuild = `${FOREIGN_KEYS_OFF}
      CREATE TABLE p_new (id TEXT PRIMARY KEY, extra TEXT); INSERT INTO p_new (id) SELECT id FROM p;
      DROP TABLE p; ALTER TABLE p_new RENAME TO p;`
    expect(migrate(fresh, [...base, { version: 2, sql: rebuild }])).toEqual({ applied: [2] })
    expect(fresh.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(() => fresh.exec(`DELETE FROM p WHERE id = 'a'`)).toThrow()
  })

  it('rolls back a rebuild that leaves a broken key, and turns the keys on again', () => {
    const fresh = openDatabase(':memory:')
    const base = [
      { version: 1, sql: 'CREATE TABLE p (id TEXT PRIMARY KEY); CREATE TABLE c (p_id TEXT REFERENCES p (id));' },
    ]
    migrate(fresh, base)
    fresh.exec(`INSERT INTO p VALUES ('a'); INSERT INTO c VALUES ('a')`)
    const lossy = `${FOREIGN_KEYS_OFF}
      CREATE TABLE p_new (id TEXT PRIMARY KEY); DROP TABLE p; ALTER TABLE p_new RENAME TO p;`
    expect(() => migrate(fresh, [...base, { version: 2, sql: lossy }])).toThrow(/foreign keys in: c/)
    expect(fresh.prepare('SELECT id FROM p').all()).toEqual([{ id: 'a' }])
    expect(fresh.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })
})

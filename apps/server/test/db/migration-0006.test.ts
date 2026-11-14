import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'

const NOW = '2026-11-09T10:00:00.000Z'
const before = MIGRATIONS.filter((m) => m.version <= 5)

function seeded(): DatabaseSync {
  const db = openDatabase(':memory:')
  migrate(db, before)
  db.prepare(
    `INSERT INTO channel (id, origin, name_status, created_at, updated_at) VALUES ('c', 'nuevo', 'provisional', ?, ?)`,
  ).run(NOW, NOW)
  db.prepare(
    `INSERT INTO journey (id, channel_id, kind, step, status, state, created_at, updated_at)
     VALUES ('j', 'c', 'nuevo', 'nichos', 'activo', '{}', ?, ?)`,
  ).run(NOW, NOW)
  for (const id of ['i1', 'i2']) {
    db.prepare(
      `INSERT INTO idea (id, channel_id, origin, title, format, status, position, original, profile_version,
         created_at, updated_at) VALUES (?, 'c', 'creador', 'Idea', 'largo', 'banco', 1, '{}', 1, ?, ?)`,
    ).run(id, NOW, NOW)
  }
  const columns = db
    .prepare('PRAGMA table_info(ai_usage)')
    .all()
    .map((c) => String(c['name']))
  const row: Record<string, unknown> = {
    id: 'u1',
    journey_id: 'j',
    use: 'ideas',
    provider_id: 'fake',
    model: 'fake',
    input_tokens: 1,
    output_tokens: 2,
    estimated_cents: 3,
    cost_cents: 4,
    pricing_version: 1,
    outcome: 'ok',
    created_at: NOW,
  }
  const names = columns.filter((column) => column in row)
  db.prepare(`INSERT INTO ai_usage (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(
    ...(names.map((name) => row[name]) as (string | number)[]),
  )
  return db
}

const script = (db: DatabaseSync, id: string, idea: string, fields: Record<string, unknown> = {}) => {
  const row = { format: 'largo', target_seconds: 600, notes: '', ...fields }
  db.prepare(
    `INSERT INTO script (id, channel_id, idea_id, format, target_seconds, notes, created_at, updated_at)
     VALUES (?, 'c', ?, ?, ?, ?, ?, ?)`,
  ).run(id, idea, row.format as string, row.target_seconds as number, row.notes as string, NOW, NOW)
}
const version = (db: DatabaseSync, id: string, n: number, fields: Record<string, unknown> = {}) => {
  const row = { kind: 'guion', origin: 'ia', ...fields }
  db.prepare(
    `INSERT INTO script_version (id, script_id, kind, version, origin, content, idea_revision, profile_version, created_at)
     VALUES (?, 's', ?, ?, ?, '{}', 1, 1, ?)`,
  ).run(id, row.kind as string, n, row.origin as string, NOW)
}

describe('migration 0006 (the script)', () => {
  it('keeps every row, and the usage of before has no web searches', () => {
    const db = seeded()
    const ideas = db.prepare('SELECT * FROM idea ORDER BY id').all()
    const usage = db.prepare('SELECT * FROM ai_usage').all()
    migrate(db, MIGRATIONS)
    expect(db.prepare('SELECT * FROM idea ORDER BY id').all()).toEqual(ideas)
    expect(db.prepare('SELECT * FROM ai_usage').all()).toEqual(usage.map((u) => ({ ...u, web_searches: 0 })))
  })

  it('one script per idea, with the limits of the data model', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    script(db, 's', 'i1')
    expect(() => script(db, 's2', 'i1')).toThrow()
    expect(() => script(db, 's3', 'i2', { format: 'medio' })).toThrow()
    expect(() => script(db, 's3', 'i2', { target_seconds: 179 })).toThrow()
    expect(() => script(db, 's3', 'i2', { target_seconds: 1801 })).toThrow()
    expect(() => script(db, 's3', 'i2', { format: 'short', target_seconds: 14 })).toThrow()
    expect(() => script(db, 's3', 'i2', { notes: 'x'.repeat(20_001) })).toThrow()
    expect(() => script(db, 's3', 'i2', { format: 'short', target_seconds: 45 })).not.toThrow()
  })

  it('each version number is one per script and kind', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    script(db, 's', 'i1')
    version(db, 'v1', 1)
    expect(() => version(db, 'v2', 1)).toThrow()
    expect(() => version(db, 'v3', 1, { kind: 'escaleta' })).not.toThrow()
    expect(() => version(db, 'v4', 0)).toThrow()
    expect(() => version(db, 'v5', 2, { kind: 'otro' })).toThrow()
    expect(() => version(db, 'v6', 2, { origin: 'otro' })).toThrow()
    for (const origin of ['edicion', 'bloque_ia', 'recuperada', 'comprobacion', 'marcas', 'heredada']) {
      expect(() => version(db, `o-${origin}`, 10 + origin.length, { origin })).not.toThrow()
    }
  })

  it('the voice has its defaults and its limits', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    db.prepare(`INSERT INTO channel_script_settings (channel_id, updated_at) VALUES ('c', ?)`).run(NOW)
    expect(db.prepare('SELECT * FROM channel_script_settings').get()).toMatchObject({
      address: 'tu',
      register: 'cercano',
      sample: '',
      words_per_minute: 150,
    })
    expect(() => db.prepare(`UPDATE channel_script_settings SET words_per_minute = 99`).run()).toThrow()
    expect(() => db.prepare(`UPDATE channel_script_settings SET address = 'vos'`).run()).toThrow()
  })

  it('leaves version 6 recorded', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((r) => r['version'])
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

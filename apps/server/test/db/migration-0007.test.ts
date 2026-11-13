import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'

const NOW = '2026-11-13T10:00:00.000Z'
const before = MIGRATIONS.filter((m) => m.version <= 6)

function seeded(): DatabaseSync {
  const db = openDatabase(':memory:')
  migrate(db, before)
  db.prepare(
    `INSERT INTO channel (id, origin, name_status, created_at, updated_at) VALUES ('c', 'nuevo', 'provisional', ?, ?)`,
  ).run(NOW, NOW)
  for (const id of ['i1', 'i2']) {
    db.prepare(
      `INSERT INTO idea (id, channel_id, origin, title, format, status, position, original, profile_version,
         created_at, updated_at) VALUES (?, 'c', 'creador', 'Idea', 'largo', 'banco', 1, '{}', 1, ?, ?)`,
    ).run(id, NOW, NOW)
    db.prepare(
      `INSERT INTO script (id, channel_id, idea_id, format, target_seconds, created_at, updated_at)
       VALUES (?, 'c', ?, 'largo', 600, ?, ?)`,
    ).run(`s-${id}`, id, NOW, NOW)
  }
  db.prepare(
    `INSERT INTO script_version (id, script_id, kind, version, origin, content, idea_revision, profile_version, created_at)
     VALUES ('v1', 's-i1', 'guion', 1, 'ia', '{"blocks":[]}', 1, 1, ?)`,
  ).run(NOW)
  return db
}

const pkg = (db: DatabaseSync, id: string, script: string, fields: Record<string, unknown> = {}) => {
  const row = { format: 'largo', ...fields }
  db.prepare(
    `INSERT INTO publish_package (id, channel_id, script_id, format, created_at, updated_at)
     VALUES (?, 'c', ?, ?, ?, ?)`,
  ).run(id, script, row.format as string, NOW, NOW)
}
const version = (db: DatabaseSync, id: string, n: number, fields: Record<string, unknown> = {}) => {
  const row = { kind: 'titulos', origin: 'ia', ...fields }
  db.prepare(
    `INSERT INTO package_version (id, package_id, kind, version, origin, content, draft_version, created_at)
     VALUES (?, 'p', ?, ?, ?, '{}', 1, ?)`,
  ).run(id, row.kind as string, n, row.origin as string, NOW)
}

describe('migration 0007 (the publishing package)', () => {
  it('keeps every row of the scripts and their versions', () => {
    const db = seeded()
    const tables = ['idea', 'script', 'script_version']
    const rows = tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())
    migrate(db, MIGRATIONS)
    tables.forEach((table, index) =>
      expect(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).toEqual(rows[index]),
    )
  })

  it('one package per script, with its format and an empty guided list', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    pkg(db, 'p', 's-i1')
    expect(() => pkg(db, 'p2', 's-i1')).toThrow()
    expect(() => pkg(db, 'p3', 's-i2', { format: 'medio' })).toThrow()
    expect(() => pkg(db, 'p3', 's-i2', { format: 'short' })).not.toThrow()
    expect(db.prepare(`SELECT studio_done FROM publish_package WHERE id = 'p'`).get()).toEqual({ studio_done: '[]' })
  })

  it('each version number is one per package and kind, with the kinds and origins of the model', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    pkg(db, 'p', 's-i1')
    version(db, 'v1', 1)
    expect(() => version(db, 'v2', 1)).toThrow()
    expect(() => version(db, 'v0', 0, { kind: 'etiquetas' })).toThrow()
    expect(() => version(db, 'vx', 1, { kind: 'otro' })).toThrow()
    expect(() => version(db, 'vy', 1, { kind: 'etiquetas', origin: 'otro' })).toThrow()
    for (const kind of ['miniaturas', 'portada_short', 'descripcion', 'capitulos', 'etiquetas', 'comentario'])
      expect(() => version(db, `k-${kind}`, 1, { kind })).not.toThrow()
    for (const [index, origin] of ['edicion', 'parte_ia', 'recuperada'].entries())
      expect(() => version(db, `o-${origin}`, 2 + index, { origin })).not.toThrow()
    expect(() =>
      db.prepare(`UPDATE package_version SET instructions = ? WHERE id = 'v1'`).run('x'.repeat(501)),
    ).toThrow()
  })

  it('the publishing settings of a channel: the fixed part up to 1.500', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    db.prepare(`INSERT INTO channel_publish_settings (channel_id, fixed_text, updated_at) VALUES ('c', '', ?)`).run(NOW)
    expect(db.prepare('SELECT category FROM channel_publish_settings').get()).toEqual({ category: null })
    expect(() => db.prepare(`UPDATE channel_publish_settings SET fixed_text = ?`).run('x'.repeat(1501))).toThrow()
  })

  it('leaves version 7 recorded', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((r) => r['version'])
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

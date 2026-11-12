import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'

const NOW = '2026-11-07T10:00:00.000Z'
const before = MIGRATIONS.filter((m) => m.version <= 4)

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
  const kinds = ['medir_nichos', 'comprobar_nombres', 'leer_canal', 'ia', 'actualizar_lector']
  const statuses = ['hecho', 'fallido', 'en_curso', 'interrumpido', 'hecho']
  for (const [i, kind] of kinds.entries()) {
    const status = statuses[i]!
    db.prepare(
      `INSERT INTO background_job (id, journey_id, kind, status, progress, failure, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `job-${i}`,
      kind === 'actualizar_lector' ? null : 'j',
      kind,
      status,
      `{"done":${i},"total":5}`,
      status === 'fallido' ? 'bloqueado' : null,
      `2026-11-0${i + 1}T10:00:00.000Z`,
      status === 'en_curso' ? null : NOW,
    )
  }
  return db
}

const idea = (db: DatabaseSync, id: string, fields: Record<string, unknown> = {}) => {
  const row = { status: 'banco', queue_position: null, format: 'largo', origin: 'creador', title: 'Idea', ...fields }
  db.prepare(
    `INSERT INTO idea (id, channel_id, origin, title, format, status, position, queue_position, original,
       profile_version, created_at, updated_at)
     VALUES (?, 'c', ?, ?, ?, ?, 1, ?, '{}', 1, ?, ?)`,
  ).run(
    id,
    row.origin as string,
    row.title as string,
    row.format as string,
    row.status as string,
    row.queue_position as number | null,
    NOW,
    NOW,
  )
}

describe('migration 0005 (the idea bank)', () => {
  it('keeps every background job and admits medir_ideas with a channel', () => {
    const db = seeded()
    const rows = () => db.prepare('SELECT * FROM background_job ORDER BY id').all()
    const old = rows()
    migrate(db, MIGRATIONS)
    // Every column of every row, as it was, and no channel for the jobs of the 003.
    expect(rows()).toEqual(old.map((row) => ({ ...row, channel_id: null })))
    expect(() =>
      db
        .prepare(
          `INSERT INTO background_job (id, kind, status, started_at) VALUES ('sin', 'medir_ideas', 'en_curso', ?)`,
        )
        .run(NOW),
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO background_job (id, channel_id, kind, status, started_at) VALUES ('n', 'c', 'medir_ideas', 'en_curso', ?)`,
        )
        .run(NOW),
    ).not.toThrow()
    expect(() =>
      db
        .prepare(`INSERT INTO background_job (id, kind, status, started_at) VALUES ('x', 'otro', 'en_curso', ?)`)
        .run(NOW),
    ).toThrow()
  })

  it('creates the idea tables with the rules of data-model.md', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    idea(db, 'ok')
    expect(() => idea(db, 's1', { status: 'otro' })).toThrow()
    expect(() => idea(db, 'f1', { format: 'medio' })).toThrow()
    expect(() => idea(db, 'o1', { origin: 'otro' })).toThrow()
    expect(() => idea(db, 't1', { title: '' })).toThrow()
    expect(() => idea(db, 't2', { title: 'x'.repeat(121) })).toThrow()
    // Only a chosen idea has a place in the queue, and every chosen one has it.
    expect(() => idea(db, 'q1', { status: 'elegida' })).toThrow()
    expect(() => idea(db, 'q2', { status: 'banco', queue_position: 1 })).toThrow()
    expect(() => idea(db, 'q3', { status: 'elegida', queue_position: 1 })).not.toThrow()

    const measure = (id: string, status: string, verdict: string | null, failure: string | null) =>
      db
        .prepare(
          `INSERT INTO idea_measure (id, idea_id, idea_revision, status, verdict, failure, queries, source,
             thresholds_version, measured_at) VALUES (?, 'ok', 1, ?, ?, ?, '{}', 'fake', 5, ?)`,
        )
        .run(id, status, verdict, failure, NOW)
    expect(() => measure('m1', 'medida', 'hueco', null)).not.toThrow()
    expect(() => measure('m2', 'medida', 'azul', null)).toThrow()
    expect(() => measure('m3', 'fallida', null, 'bloqueado')).not.toThrow()
    expect(() => measure('m4', 'fallida', 'hueco', 'bloqueado')).toThrow()
    expect(() => measure('m5', 'medida', null, null)).toThrow()
  })

  it('a batch is of ideas or of angles, and only the angles come from an idea', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    idea(db, 'src')
    const batch = (id: string, kind: string, source: string | null, instructions: string | null = null) =>
      db
        .prepare(
          `INSERT INTO idea_batch (id, channel_id, kind, source_idea_id, payload, instructions, prompt_id,
             prompt_version, profile_version, created_at) VALUES (?, 'c', ?, ?, '{}', ?, 'ideas', 1, 1, ?)`,
        )
        .run(id, kind, source, instructions, NOW)
    expect(() => batch('b1', 'ideas', null)).not.toThrow()
    expect(() => batch('b2', 'otro_enfoque', 'src')).not.toThrow()
    expect(() => batch('b3', 'otro', null)).toThrow()
    expect(() => batch('b4', 'ideas', 'src')).toThrow()
    expect(() => batch('b5', 'otro_enfoque', null)).toThrow()
    expect(() => batch('b6', 'ideas', null, 'x'.repeat(501))).toThrow()
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'idea'").all()
    expect(indexes.length).toBeGreaterThanOrEqual(2)
  })

  it('leaves version 5 recorded', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((r) => r.version)
    expect(versions).toEqual([1, 2, 3, 4, 5, 6])
  })
})

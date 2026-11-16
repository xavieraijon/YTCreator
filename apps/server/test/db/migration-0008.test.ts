import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'

const NOW = '2026-11-14T10:00:00.000Z'
const before = MIGRATIONS.filter((m) => m.version <= 7)

const KINDS = ['medir_nichos', 'comprobar_nombres', 'leer_canal', 'ia', 'actualizar_lector', 'medir_ideas']
const STATUSES = ['en_curso', 'hecho', 'fallido', 'interrumpido']

function seeded(): DatabaseSync {
  const db = openDatabase(':memory:')
  migrate(db, before)
  db.prepare(
    `INSERT INTO channel (id, origin, name_status, created_at, updated_at) VALUES ('c', 'nuevo', 'provisional', ?, ?)`,
  ).run(NOW, NOW)
  // One job of each kind and state, as an installation of the 006 may have them.
  KINDS.forEach((kind, k) =>
    STATUSES.forEach((status, s) =>
      db
        .prepare(
          `INSERT INTO background_job (id, journey_id, channel_id, kind, status, progress, failure, started_at, finished_at)
           VALUES (?, NULL, 'c', ?, ?, '{"done":1,"total":2}', ?, ?, ?)`,
        )
        .run(
          `j${k}${s}`,
          kind,
          status,
          status === 'fallido' ? 'interno' : null,
          NOW,
          status === 'en_curso' ? null : NOW,
        ),
    ),
  )
  for (const id of ['i1', 'i2']) {
    db.prepare(
      `INSERT INTO idea (id, channel_id, origin, title, format, status, position, original, profile_version,
         created_at, updated_at) VALUES (?, 'c', 'creador', 'Idea', 'largo', 'banco', 1, '{}', 1, ?, ?)`,
    ).run(id, NOW, NOW)
  }
  // A script and a package that point at a job: the rebuild must keep those references valid.
  db.prepare(
    `INSERT INTO script (id, channel_id, idea_id, format, target_seconds, job_id, created_at, updated_at)
     VALUES ('s1', 'c', 'i1', 'largo', 600, 'j30', ?, ?)`,
  ).run(NOW, NOW)
  db.prepare(
    `INSERT INTO script (id, channel_id, idea_id, format, target_seconds, created_at, updated_at)
     VALUES ('s2', 'c', 'i2', 'short', 60, ?, ?)`,
  ).run(NOW, NOW)
  db.prepare(
    `INSERT INTO publish_package (id, channel_id, script_id, format, job_id, created_at, updated_at)
     VALUES ('p', 'c', 's1', 'largo', 'j31', ?, ?)`,
  ).run(NOW, NOW)
  db.prepare(
    `INSERT INTO package_version (id, package_id, kind, version, origin, content, draft_version, created_at)
     VALUES ('pv', 'p', 'capitulos', 1, 'ia', '{"chapters":[]}', 1, ?)`,
  ).run(NOW)
  return db
}

const job = (db: DatabaseSync, id: string, kind: string, status: string, channel: string | null = 'c') =>
  db
    .prepare(
      `INSERT INTO background_job (id, journey_id, channel_id, kind, status, started_at) VALUES (?, NULL, ?, ?, ?, ?)`,
    )
    .run(id, channel, kind, status, NOW)
const track = (db: DatabaseSync, id: string, script: string, fields: Record<string, unknown> = {}) => {
  const row = { format: 'largo', ...fields }
  db.prepare(
    `INSERT INTO subtitle_track (id, channel_id, script_id, format, created_at, updated_at)
     VALUES (?, 'c', ?, ?, ?, ?)`,
  ).run(id, script, row.format as string, NOW, NOW)
}
const version = (db: DatabaseSync, id: string, n: number, origin = 'reconocimiento') =>
  db
    .prepare(
      `INSERT INTO subtitle_version (id, track_id, version, origin, content, created_at)
       VALUES (?, 't', ?, ?, '{}', ?)`,
    )
    .run(id, n, origin, NOW)

describe('migration 0008 (the subtitles)', () => {
  it('keeps every job with its values, and the scripts, packages and versions that point at them', () => {
    const db = seeded()
    const tables = ['background_job', 'script', 'publish_package', 'package_version']
    const rows = tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())
    migrate(db, MIGRATIONS)
    tables.forEach((table, index) =>
      expect(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).toEqual(rows[index]),
    )
  })

  it('leaves the foreign keys on and valid, still pointing at the jobs', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(() => db.prepare(`UPDATE script SET job_id = 'no-existe' WHERE id = 's2'`).run()).toThrow()
    expect(() => db.prepare(`DELETE FROM background_job WHERE id = 'j30'`).run()).toThrow()
  })

  it('admits the two new kinds and the queued state', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    expect(() => job(db, 'r1', 'reconocer_voz', 'en_cola')).not.toThrow()
    expect(() => job(db, 'r2', 'reconocer_voz', 'en_curso')).not.toThrow()
    expect(() => job(db, 'd1', 'descargar_motor', 'en_curso', null)).not.toThrow()
    expect(() => job(db, 'x1', 'traducir', 'en_curso')).toThrow()
    expect(() => job(db, 'x2', 'ia', 'pausado')).toThrow()
  })

  it('a recognition belongs to a channel; a measure of ideas still does', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    expect(() => job(db, 'r3', 'reconocer_voz', 'en_curso', null)).toThrow()
    expect(() => job(db, 'm1', 'medir_ideas', 'en_curso', null)).toThrow()
  })

  it('one subtitle track per script, with its format and no replacements yet', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    track(db, 't', 's1')
    expect(() => track(db, 't2', 's1')).toThrow()
    expect(() => track(db, 't3', 's2', { format: 'medio' })).toThrow()
    expect(() => track(db, 't3', 's2', { format: 'short' })).not.toThrow()
    expect(db.prepare(`SELECT replacements FROM subtitle_track WHERE id = 't'`).get()).toEqual({ replacements: '[]' })
  })

  it('each version number is one per track, with the origins of the model', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    track(db, 't', 's1')
    version(db, 'v1', 1)
    expect(() => version(db, 'v1b', 1, 'edicion')).toThrow()
    expect(() => version(db, 'v0', 0)).toThrow()
    for (const [n, origin] of [
      [2, 'edicion'],
      [3, 'ia'],
      [4, 'recuperada'],
      [5, 'reaplicada'],
    ] as const)
      expect(() => version(db, `v${n}`, n, origin)).not.toThrow()
    expect(() => version(db, 'v6', 6, 'parte_ia')).toThrow()
  })

  it('a track points at its channel, script and job', () => {
    const db = seeded()
    migrate(db, MIGRATIONS)
    expect(() => track(db, 't', 'no-existe')).toThrow()
    track(db, 't', 's1')
    expect(() => db.prepare(`UPDATE subtitle_track SET job_id = 'no-existe' WHERE id = 't'`).run()).toThrow()
    expect(() =>
      db.prepare(`UPDATE subtitle_track SET job_id = 'j00', job_op = 'reconocer' WHERE id = 't'`).run(),
    ).not.toThrow()
    expect(() => db.prepare(`UPDATE subtitle_track SET job_op = 'otra' WHERE id = 't'`).run()).toThrow()
  })
})

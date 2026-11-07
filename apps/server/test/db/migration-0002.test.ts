import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'

const NOW = '2026-11-01T10:00:00.000Z'
const UC = 'UC' + 'a'.repeat(22)

const TABLES = [
  'channel',
  'journey',
  'proposal',
  'channel_profile',
  'profile_version',
  'market_measure',
  'reference_channel',
  'name_check',
  'channel_reading',
  'background_job',
  'ai_usage',
  'yt_cache',
  'yt_quota',
]

function insertChannel(db: DatabaseSync, id: string, fields: Record<string, unknown> = {}) {
  const row = {
    origin: 'nuevo',
    display_name: null,
    handle: null,
    name_status: 'provisional',
    youtube_channel_id: null,
    ...fields,
  }
  db.prepare(
    `INSERT INTO channel (id, origin, display_name, handle, name_status, youtube_channel_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.origin as string,
    row.display_name as string | null,
    row.handle as string | null,
    row.name_status as string,
    row.youtube_channel_id as string | null,
    NOW,
    NOW,
  )
}

function insertJourney(db: DatabaseSync, id: string, channelId: string, status = 'activo') {
  db.prepare(
    `INSERT INTO journey (id, channel_id, kind, step, status, state, created_at, updated_at)
     VALUES (?, ?, 'nuevo', 'intereses', ?, '{}', ?, ?)`,
  ).run(id, channelId, status, NOW, NOW)
}

describe('migration 0002', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
  })

  it('creates every table and leaves version 2 recorded', () => {
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => r.name)
    for (const table of TABLES) expect(names).toContain(table)
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((r) => r.version)
    expect(versions).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps 0001 intact', () => {
    expect(db.prepare('SELECT step FROM onboarding_state').get()).toEqual({ step: 'bienvenida' })
    for (const table of ['ai_connection', 'subscription_account', 'spending_limits', 'app_settings']) {
      expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = ?`).get(table)).toBeDefined()
    }
  })

  it('refuses the same YouTube channel twice but allows many without one', () => {
    insertChannel(db, 'a', { origin: 'existente', youtube_channel_id: UC })
    expect(() => insertChannel(db, 'b', { origin: 'existente', youtube_channel_id: UC })).toThrow()
    insertChannel(db, 'c')
    expect(() => insertChannel(db, 'd')).not.toThrow()
  })

  it('checks handle, display name and channel id shapes', () => {
    expect(() => insertChannel(db, 'h1', { handle: 'ab' })).toThrow()
    expect(() => insertChannel(db, 'h2', { handle: 'a'.repeat(31) })).toThrow()
    expect(() => insertChannel(db, 'h3', { handle: 'con espacio' })).toThrow()
    expect(() => insertChannel(db, 'h4', { handle: '@arroba' })).toThrow()
    expect(() => insertChannel(db, 'h5', { handle: 'Cocina_Facil.es-1' })).not.toThrow()
    expect(() => insertChannel(db, 'n1', { display_name: '' })).toThrow()
    expect(() => insertChannel(db, 'n2', { display_name: 'x'.repeat(101) })).toThrow()
    expect(() => insertChannel(db, 'u1', { youtube_channel_id: 'UCcorto' })).toThrow()
    expect(() => insertChannel(db, 'u2', { youtube_channel_id: 'XX' + 'a'.repeat(22) })).toThrow()
    expect(() => insertChannel(db, 'o1', { origin: 'otro' })).toThrow()
  })

  it('allows only one active journey per channel', () => {
    insertChannel(db, 'c')
    insertJourney(db, 'j1', 'c')
    expect(() => insertJourney(db, 'j2', 'c')).toThrow()
    expect(() => insertJourney(db, 'j3', 'c', 'terminado')).not.toThrow()
    expect(() => insertJourney(db, 'j4', 'c', 'abandonado')).not.toThrow()
  })

  it('refuses a journey for a missing channel and an unknown step', () => {
    expect(() => insertJourney(db, 'j', 'nada')).toThrow()
    insertChannel(db, 'c')
    expect(() =>
      db
        .prepare(
          `INSERT INTO journey (id, channel_id, kind, step, status, state, created_at, updated_at)
           VALUES ('j', 'c', 'nuevo', 'otro', 'activo', '{}', ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow()
  })

  it('checks profile version origins and the restored_from rule', () => {
    insertChannel(db, 'c')
    const insert = db.prepare(
      `INSERT INTO profile_version (channel_id, version, origin, restored_from, profile, created_at)
       VALUES ('c', ?, ?, ?, '{}', ?)`,
    )
    insert.run(1, 'ia', null, NOW)
    insert.run(2, 'manual', null, NOW)
    expect(() => insert.run(3, 'restaurada', null, NOW)).toThrow()
    insert.run(3, 'restaurada', 1, NOW)
    expect(() => insert.run(4, 'otro', null, NOW)).toThrow()
    expect(() => insert.run(3, 'ia', null, NOW)).toThrow()
  })

  it('checks background job statuses and kinds', () => {
    insertChannel(db, 'c')
    insertJourney(db, 'j', 'c')
    const insert = db.prepare(
      `INSERT INTO background_job (id, journey_id, kind, status, progress, started_at)
       VALUES (?, 'j', ?, ?, '{"done":0,"total":1}', ?)`,
    )
    for (const [i, status] of ['en_curso', 'hecho', 'fallido', 'interrumpido'].entries()) {
      insert.run(`b${i}`, 'medir_nichos', status, NOW)
    }
    expect(() => insert.run('x', 'medir_nichos', 'otro', NOW)).toThrow()
    expect(() => insert.run('y', 'otro', 'hecho', NOW)).toThrow()
  })

  it('limits proposal instructions to 500 characters', () => {
    insertChannel(db, 'c')
    insertJourney(db, 'j', 'c')
    const insert = db.prepare(
      `INSERT INTO proposal (id, journey_id, kind, payload, status, instructions, prompt_id, prompt_version, created_at)
       VALUES (?, 'j', 'nichos', '[]', 'propuesta', ?, 'nichos', 1, ?)`,
    )
    expect(() => insert.run('p1', 'x'.repeat(500), NOW)).not.toThrow()
    expect(() => insert.run('p2', 'x'.repeat(501), NOW)).toThrow()
  })
})

describe('migration 0003: channels not read', () => {
  it('a measure saved before it is still there and says «not known»', () => {
    const old = openDatabase(':memory:')
    migrate(old, MIGRATIONS.slice(0, 2))
    insertChannel(old, 'c')
    insertJourney(old, 'j', 'c')
    old
      .prepare(
        `INSERT INTO market_measure (id, journey_id, niche_label, queries, source, status, thresholds_version,
           hidden_subscribers, created_at)
         VALUES ('m', 'j', 'Cocina', '[]', 'ytdlp', 'medida', 1, 7, ?)`,
      )
      .run(NOW)
    migrate(old, MIGRATIONS)
    expect(old.prepare('SELECT niche_label, hidden_subscribers, unread_channels FROM market_measure').get()).toEqual({
      niche_label: 'Cocina',
      hidden_subscribers: 7,
      unread_channels: null,
    })
    old.close()
  })
})

describe('migration 0004: the proposal that waits (entry 126)', () => {
  it('only adds: what was saved before stays, and the new table checks what it keeps', () => {
    const old = openDatabase(':memory:')
    migrate(old, MIGRATIONS.slice(0, 3))
    insertChannel(old, 'c')
    insertJourney(old, 'j', 'c')
    migrate(old, MIGRATIONS)
    expect(
      old
        .prepare('SELECT id FROM journey')
        .all()
        .map((r) => r.id),
    ).toEqual(['j'])
    const insert = old.prepare(
      `INSERT INTO profile_regeneration (id, channel_id, base_version, part, proposed, claims_trimmed, created_at)
       VALUES (?, 'c', 1, ?, '{}', 0, ?)`,
    )
    expect(() => insert.run('r1', 'temas', NOW)).not.toThrow()
    expect(() => insert.run('r2', 'dinero', NOW)).toThrow()
    old.close()
  })
})

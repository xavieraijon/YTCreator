import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from '../../src/db/migrate.ts'
import { openDatabase } from '../../src/db/open.ts'
import { createSettingsRepo, type SettingsRepo } from '../../src/db/repos/settings.ts'

describe('settings repo', () => {
  let db: DatabaseSync
  let settings: SettingsRepo

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
    settings = createSettingsRepo(db)
  })

  it('returns defaults when nothing is stored', () => {
    expect(settings.get('update_check_enabled')).toBe(true)
    expect(settings.get('ai_timeout_seconds')).toBeNull()
    expect(settings.get('secret_store')).toBeNull()
  })

  it('stores and reads typed values', () => {
    settings.set('update_check_enabled', false)
    settings.set('ai_timeout_seconds', 120)
    settings.set('secret_store', 'file')
    settings.set('latest_version', '1.2.3')
    settings.set('last_update_check_at', '2026-10-28T10:00:00.000Z')
    expect(settings.get('update_check_enabled')).toBe(false)
    expect(settings.get('ai_timeout_seconds')).toBe(120)
    expect(settings.get('secret_store')).toBe('file')
    expect(settings.get('latest_version')).toBe('1.2.3')
    expect(settings.get('last_update_check_at')).toBe('2026-10-28T10:00:00.000Z')
    expect(db.prepare(`SELECT value FROM app_settings WHERE key = 'update_check_enabled'`).get()?.value).toBe('0')
  })

  it('removes a value with null', () => {
    settings.set('ai_timeout_seconds', 60)
    settings.set('ai_timeout_seconds', null)
    expect(settings.get('ai_timeout_seconds')).toBeNull()
  })

  it('refuses to write an invalid value', () => {
    expect(() => settings.set('ai_timeout_seconds', 5)).toThrow()
    expect(() => settings.set('latest_version', 'v1')).toThrow()
  })

  it('reads a corrupt stored value as its default', () => {
    const write = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
    write.run('update_check_enabled', 'yes')
    write.run('ai_timeout_seconds', '9000')
    write.run('secret_store', 'cloud')
    expect(settings.get('update_check_enabled')).toBe(true)
    expect(settings.get('ai_timeout_seconds')).toBeNull()
    expect(settings.get('secret_store')).toBeNull()
  })
})

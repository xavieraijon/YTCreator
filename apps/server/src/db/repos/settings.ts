import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'

const semver = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)

// Each key decodes from and encodes to the TEXT column (data-model.md, app_settings).
const SETTINGS = {
  update_check_enabled: z.enum(['1', '0']).transform((v) => v === '1'),
  last_update_check_at: z.iso.datetime(),
  latest_version: semver,
  dismissed_version: semver,
  ai_timeout_seconds: z.coerce.number().int().min(10).max(300),
  secret_store: z.enum(['keychain', 'secret-service', 'file']),
  'youtube.source': z.enum(['auto', 'ytdlp', 'data_api']),
  'youtube.api_key_ref': z.string().min(1),
  'youtube.api_key_hint': z.string().length(4),
  'youtube.ytdlp_version': z.string().min(1),
  // YouTube stopped taking the saved key (P15 a): it is no longer used until another one is saved.
  'youtube.api_key_rejected': z.enum(['1', '0']).transform((v) => v === '1'),
  // The model chosen in «Modo experto» and how fast each one ran on this machine, as JSON (007, data-model.md).
  'speech.model': z.string().min(1),
  'speech.speed': z.string().min(2),
}

type Settings = typeof SETTINGS
export type SettingKey = keyof Settings
export type SettingValue<K extends SettingKey> = z.output<Settings[K]>

const DEFAULTS: { [K in SettingKey]?: SettingValue<K> } = {
  update_check_enabled: true,
  'youtube.source': 'auto',
  'youtube.api_key_rejected': false,
}

function encode(value: unknown): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}

export function createSettingsRepo(db: DatabaseSync) {
  const select = db.prepare('SELECT value FROM app_settings WHERE key = ?')
  const upsert = db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  )
  const remove = db.prepare('DELETE FROM app_settings WHERE key = ?')

  return {
    // A missing or invalid value reads as its default, or null.
    get<K extends SettingKey>(key: K): SettingValue<K> | null {
      const row = select.get(key)
      const parsed = SETTINGS[key].safeParse(row?.value)
      if (parsed.success) return parsed.data as SettingValue<K>
      return (DEFAULTS[key] as SettingValue<K> | undefined) ?? null
    },
    set<K extends SettingKey>(key: K, value: SettingValue<K> | null): void {
      if (value === null) {
        remove.run(key)
        return
      }
      const text = encode(value)
      SETTINGS[key].parse(text)
      upsert.run(key, text)
    },
  }
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>

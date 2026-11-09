import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { IdeaFormat, ScriptSettings, VoiceAddress, VoiceRegister } from '@ytcreator/core'

// The script of each idea and the voice of each channel (specs/005-script-and-outline/data-model.md).
export interface Script {
  id: string
  channelId: string
  ideaId: string
  format: IdeaFormat
  targetSeconds: number
  notes: string
  outlineApprovedVersion: number | null
  draftApprovedVersion: number | null
  draftApprovedAt: string | null
  draftApprovedPending: number | null
  sourceScriptId: string | null
  sourceBlockId: string | null
  sourceDraftVersion: number | null
  shortAngles: unknown
  jobId: string | null
  jobOp: string | null
  createdAt: string
  updatedAt: string
}

export interface NewScript {
  channelId: string
  ideaId: string
  format: IdeaFormat
  targetSeconds: number
  notes?: string
  sourceScriptId?: string | null
  sourceBlockId?: string | null
  sourceDraftVersion?: number | null
}

interface Row {
  id: string
  channel_id: string
  idea_id: string
  format: IdeaFormat
  target_seconds: number
  notes: string
  outline_approved_version: number | null
  draft_approved_version: number | null
  draft_approved_at: string | null
  draft_approved_pending: number | null
  source_script_id: string | null
  source_block_id: string | null
  source_draft_version: number | null
  short_angles: string | null
  job_id: string | null
  job_op: string | null
  created_at: string
  updated_at: string
}

const orNull = (value: number | null) => (value === null ? null : Number(value))

const fromRow = (row: Row): Script => ({
  id: row.id,
  channelId: row.channel_id,
  ideaId: row.idea_id,
  format: row.format,
  targetSeconds: Number(row.target_seconds),
  notes: row.notes,
  outlineApprovedVersion: orNull(row.outline_approved_version),
  draftApprovedVersion: orNull(row.draft_approved_version),
  draftApprovedAt: row.draft_approved_at,
  draftApprovedPending: orNull(row.draft_approved_pending),
  sourceScriptId: row.source_script_id,
  sourceBlockId: row.source_block_id,
  sourceDraftVersion: orNull(row.source_draft_version),
  shortAngles: row.short_angles === null ? null : (JSON.parse(row.short_angles) as unknown),
  jobId: row.job_id,
  jobOp: row.job_op,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

interface SettingsRow {
  address: VoiceAddress
  register: VoiceRegister
  sample: string
  words_per_minute: number
}

export function createScriptsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM script WHERE id = ?')
  const selectByIdea = db.prepare('SELECT * FROM script WHERE idea_id = ?')
  const selectByChannel = db.prepare('SELECT * FROM script WHERE channel_id = ? ORDER BY updated_at DESC, rowid DESC')
  const selectBySource = db.prepare('SELECT * FROM script WHERE source_script_id = ? ORDER BY created_at, rowid')
  const insert = db.prepare(
    `INSERT INTO script (id, channel_id, idea_id, format, target_seconds, notes, source_script_id, source_block_id,
       source_draft_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const updateFields = db.prepare('UPDATE script SET target_seconds = ?, notes = ?, updated_at = ? WHERE id = ?')
  const updateOutlineApproved = db.prepare(
    'UPDATE script SET outline_approved_version = ?, updated_at = ? WHERE id = ?',
  )
  const updateDraftApproved = db.prepare(
    `UPDATE script SET draft_approved_version = ?, draft_approved_at = ?, draft_approved_pending = ?, updated_at = ?
     WHERE id = ?`,
  )
  const updateJob = db.prepare('UPDATE script SET job_id = ?, job_op = ?, updated_at = ? WHERE id = ?')
  const updateAngles = db.prepare('UPDATE script SET short_angles = ?, updated_at = ? WHERE id = ?')
  const updateTouched = db.prepare('UPDATE script SET updated_at = ? WHERE id = ?')
  const selectSettings = db.prepare('SELECT * FROM channel_script_settings WHERE channel_id = ?')
  const upsertSettings = db.prepare(
    `INSERT INTO channel_script_settings (channel_id, address, register, sample, words_per_minute, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (channel_id) DO UPDATE SET address = excluded.address, register = excluded.register,
       sample = excluded.sample, words_per_minute = excluded.words_per_minute, updated_at = excluded.updated_at`,
  )

  const get = (id: string): Script | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }
  const at = () => now().toISOString()

  return {
    get,

    getByIdea(ideaId: string): Script | null {
      const row = selectByIdea.get(ideaId) as Row | undefined
      return row ? fromRow(row) : null
    },

    // The last one touched first (FR-002).
    listByChannel: (channelId: string): Script[] => (selectByChannel.all(channelId) as unknown as Row[]).map(fromRow),

    listBySource: (scriptId: string): Script[] => (selectBySource.all(scriptId) as unknown as Row[]).map(fromRow),

    create(script: NewScript): Script {
      const id = randomUUID()
      const when = at()
      insert.run(
        id,
        script.channelId,
        script.ideaId,
        script.format,
        script.targetSeconds,
        script.notes ?? '',
        script.sourceScriptId ?? null,
        script.sourceBlockId ?? null,
        script.sourceDraftVersion ?? null,
        when,
        when,
      )
      return get(id)!
    },

    update(id: string, fields: { targetSeconds: number; notes: string }): Script {
      updateFields.run(fields.targetSeconds, fields.notes, at(), id)
      return get(id)!
    },

    approveOutline(id: string, version: number): Script {
      updateOutlineApproved.run(version, at(), id)
      return get(id)!
    },

    approveDraft(id: string, version: number, pending: number): Script {
      const when = at()
      updateDraftApproved.run(version, when, pending, when, id)
      return get(id)!
    },

    setJob(id: string, jobId: string, op: string): void {
      updateJob.run(jobId, op, at(), id)
    },

    setShortAngles(id: string, angles: unknown): Script {
      updateAngles.run(JSON.stringify(angles), at(), id)
      return get(id)!
    },

    touch(id: string): void {
      updateTouched.run(at(), id)
    },

    settings(channelId: string): ScriptSettings | null {
      const row = selectSettings.get(channelId) as SettingsRow | undefined
      return row
        ? {
            address: row.address,
            register: row.register,
            sample: row.sample,
            wordsPerMinute: Number(row.words_per_minute),
          }
        : null
    },

    saveSettings(channelId: string, settings: ScriptSettings): void {
      upsertSettings.run(channelId, settings.address, settings.register, settings.sample, settings.wordsPerMinute, at())
    },
  }
}

export type ScriptsRepo = ReturnType<typeof createScriptsRepo>

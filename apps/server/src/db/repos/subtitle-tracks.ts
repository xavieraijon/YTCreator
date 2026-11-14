import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { type IdeaFormat, type Replacement, replacementsSchema, type SubtitleJobOp } from '@ytcreator/core'

// The subtitles of each script: its audio, the approved version and the replacements to apply again
// (specs/007-subtitles/data-model.md).
export interface SubtitleTrack {
  id: string
  channelId: string
  scriptId: string
  format: IdeaFormat
  audioFile: string | null
  audioSeconds: number | null
  sourceName: string | null
  approvedVersion: number | null
  approvedAt: string | null
  replacements: Replacement[]
  speedModel: string | null
  jobId: string | null
  jobOp: SubtitleJobOp | null
  createdAt: string
  updatedAt: string
}

export interface SubtitleAudio {
  file: string
  seconds: number
  /** The name of the file the creator chose, without its folder. */
  sourceName: string
}

interface Row {
  id: string
  channel_id: string
  script_id: string
  format: IdeaFormat
  audio_file: string | null
  audio_seconds: number | null
  source_name: string | null
  approved_version: number | null
  approved_at: string | null
  replacements: string
  speed_model: string | null
  job_id: string | null
  job_op: SubtitleJobOp | null
  created_at: string
  updated_at: string
}

const orNull = (value: number | null) => (value === null ? null : Number(value))

// The replacements are validated on the way out too: a row that no longer fits must not be applied again.
const fromRow = (row: Row): SubtitleTrack => ({
  id: row.id,
  channelId: row.channel_id,
  scriptId: row.script_id,
  format: row.format,
  audioFile: row.audio_file,
  audioSeconds: orNull(row.audio_seconds),
  sourceName: row.source_name,
  approvedVersion: orNull(row.approved_version),
  approvedAt: row.approved_at,
  replacements: replacementsSchema.parse(JSON.parse(row.replacements)),
  speedModel: row.speed_model,
  jobId: row.job_id,
  jobOp: row.job_op,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export function createSubtitleTracksRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM subtitle_track WHERE id = ?')
  const selectByScript = db.prepare('SELECT * FROM subtitle_track WHERE script_id = ?')
  const insert = db.prepare(
    'INSERT INTO subtitle_track (id, channel_id, script_id, format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const updateAudio = db.prepare(
    'UPDATE subtitle_track SET audio_file = ?, audio_seconds = ?, source_name = ?, updated_at = ? WHERE id = ?',
  )
  // The file goes (R16); its length and name stay, to say what the subtitles were made from.
  const updateForget = db.prepare('UPDATE subtitle_track SET audio_file = NULL, updated_at = ? WHERE id = ?')
  const updateApproved = db.prepare(
    'UPDATE subtitle_track SET approved_version = ?, approved_at = ?, updated_at = ? WHERE id = ?',
  )
  const updateReplacements = db.prepare('UPDATE subtitle_track SET replacements = ?, updated_at = ? WHERE id = ?')
  const updateSpeedModel = db.prepare('UPDATE subtitle_track SET speed_model = ? WHERE id = ?')
  // Asking for something is not a change: a failed attempt must not move «último cambio» (as in 006).
  const updateJob = db.prepare('UPDATE subtitle_track SET job_id = ?, job_op = ? WHERE id = ?')
  const updateTouched = db.prepare('UPDATE subtitle_track SET updated_at = ? WHERE id = ?')

  const get = (id: string): SubtitleTrack | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }
  const at = () => now().toISOString()

  return {
    get,

    getByScript(scriptId: string): SubtitleTrack | null {
      const row = selectByScript.get(scriptId) as Row | undefined
      return row ? fromRow(row) : null
    },

    create(track: { channelId: string; scriptId: string; format: IdeaFormat }): SubtitleTrack {
      const id = randomUUID()
      const when = at()
      insert.run(id, track.channelId, track.scriptId, track.format, when, when)
      return get(id)!
    },

    setAudio(id: string, audio: SubtitleAudio): SubtitleTrack {
      updateAudio.run(audio.file, audio.seconds, audio.sourceName, at(), id)
      return get(id)!
    },

    forgetAudio(id: string): SubtitleTrack {
      updateForget.run(at(), id)
      return get(id)!
    },

    approve(id: string, version: number): SubtitleTrack {
      const when = at()
      updateApproved.run(version, when, when, id)
      return get(id)!
    },

    setReplacements(id: string, replacements: Replacement[]): SubtitleTrack {
      updateReplacements.run(JSON.stringify(replacementsSchema.parse(replacements)), at(), id)
      return get(id)!
    },

    setSpeedModel(id: string, model: string): SubtitleTrack {
      updateSpeedModel.run(model, id)
      return get(id)!
    },

    setJob(id: string, jobId: string | null, op: SubtitleJobOp): void {
      updateJob.run(jobId, op, id)
    },

    touch(id: string): void {
      updateTouched.run(at(), id)
    },
  }
}

export type SubtitleTracksRepo = ReturnType<typeof createSubtitleTracksRepo>

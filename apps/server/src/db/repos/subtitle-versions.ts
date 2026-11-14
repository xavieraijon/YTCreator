import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { type IdeaFormat, type SubtitleOrigin, type SubtitlesContent, subtitlesContentSchema } from '@ytcreator/core'
import { inTransaction } from '../transaction.ts'

// Every version of the subtitles of a script: a whole picture each, never changed (research.md R12).
export interface SubtitleVersion {
  id: string
  trackId: string
  version: number
  origin: SubtitleOrigin
  content: SubtitlesContent
  /** The version of the approved script it was aligned with; null when there was none. */
  draftVersion: number | null
  restoredFrom: number | null
  usageId: string | null
  promptId: string | null
  promptVersion: number | null
  createdAt: string
}

export interface NewSubtitleVersion {
  trackId: string
  origin: SubtitleOrigin
  content: SubtitlesContent
  draftVersion?: number | null
  restoredFrom?: number | null
  usageId?: string | null
  promptId?: string | null
  promptVersion?: number | null
}

export interface SubtitleVersionSummary {
  version: number
  origin: SubtitleOrigin
  createdAt: string
  restoredFrom: number | null
  cueCount: number
}

interface Row {
  id: string
  track_id: string
  version: number
  origin: SubtitleOrigin
  content: string
  draft_version: number | null
  restored_from: number | null
  usage_id: string | null
  prompt_id: string | null
  prompt_version: number | null
  created_at: string
  // From the track: the content is validated by the format of its script.
  format: IdeaFormat
}

const orNull = (value: number | null) => (value === null ? null : Number(value))

// The content is validated on the way out: a row that no longer fits its schema must not reach the screen.
const fromRow = (row: Row): SubtitleVersion => ({
  id: row.id,
  trackId: row.track_id,
  version: Number(row.version),
  origin: row.origin,
  content: subtitlesContentSchema(row.format).parse(JSON.parse(row.content)),
  draftVersion: orNull(row.draft_version),
  restoredFrom: orNull(row.restored_from),
  usageId: row.usage_id,
  promptId: row.prompt_id,
  promptVersion: orNull(row.prompt_version),
  createdAt: row.created_at,
})

const WITH_FORMAT = 'SELECT v.*, t.format FROM subtitle_version v JOIN subtitle_track t ON t.id = v.track_id'

export function createSubtitleVersionsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectLatest = db.prepare(`${WITH_FORMAT} WHERE v.track_id = ? ORDER BY v.version DESC LIMIT 1`)
  const selectOne = db.prepare(`${WITH_FORMAT} WHERE v.track_id = ? AND v.version = ?`)
  const selectNumber = db.prepare('SELECT MAX(version) AS version FROM subtitle_version WHERE track_id = ?')
  const selectFormat = db.prepare('SELECT format FROM subtitle_track WHERE id = ?')
  const selectSummaries = db.prepare(
    // The count of cues straight from the JSON: no validation, so an old row that no longer reads stays in the list.
    `SELECT version, origin, created_at, restored_from, CASE WHEN json_valid(content) THEN json_array_length(content, '$.cues') END AS cue_count
     FROM subtitle_version WHERE track_id = ? ORDER BY version DESC`,
  )
  const insert = db.prepare(
    `INSERT INTO subtitle_version (id, track_id, version, origin, content, draft_version, restored_from, usage_id,
       prompt_id, prompt_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const latest = (trackId: string): SubtitleVersion | null => {
    const row = selectLatest.get(trackId) as Row | undefined
    return row ? fromRow(row) : null
  }

  const latestNumber = (trackId: string): number | null => {
    const { version } = selectNumber.get(trackId) as { version: number | null }
    return version === null ? null : Number(version)
  }

  return {
    latest,
    latestNumber,

    get(trackId: string, version: number): SubtitleVersion | null {
      const row = selectOne.get(trackId, version) as Row | undefined
      return row ? fromRow(row) : null
    },

    // Without the content: an old row that no longer validates must not stop the list of the others.
    summaries: (trackId: string): SubtitleVersionSummary[] =>
      (
        selectSummaries.all(trackId) as unknown as {
          version: number
          origin: SubtitleOrigin
          created_at: string
          restored_from: number | null
          cue_count: number | null
        }[]
      ).map((row) => ({
        version: Number(row.version),
        origin: row.origin,
        createdAt: row.created_at,
        restoredFrom: orNull(row.restored_from),
        cueCount: Number(row.cue_count ?? 0),
      })),

    add(version: NewSubtitleVersion): SubtitleVersion {
      return inTransaction(db, () => {
        const track = selectFormat.get(version.trackId) as { format: IdeaFormat } | undefined
        if (!track) throw new Error(`No subtitle track ${version.trackId}`)
        const content = subtitlesContentSchema(track.format).parse(version.content)
        const next = (latestNumber(version.trackId) ?? 0) + 1
        insert.run(
          randomUUID(),
          version.trackId,
          next,
          version.origin,
          JSON.stringify(content),
          version.draftVersion ?? null,
          version.restoredFrom ?? null,
          version.usageId ?? null,
          version.promptId ?? null,
          version.promptVersion ?? null,
          now().toISOString(),
        )
        return latest(version.trackId)!
      })
    },
  }
}

export type SubtitleVersionsRepo = ReturnType<typeof createSubtitleVersionsRepo>

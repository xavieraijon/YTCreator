import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { IdeaVerdict, VideoHit, YouTubeSource } from '@ytcreator/core'

// What YouTube said about an idea, each time it was measured (data-model.md). The last one is the one shown.
export interface IdeaMeasure {
  id: string
  ideaId: string
  ideaRevision: number
  status: 'medida' | 'fallida'
  verdict: IdeaVerdict | null
  reason: string | null
  figures: Record<string, unknown> | null
  similarVideos: VideoHit[]
  opportunity: Record<string, unknown> | null
  queries: { query: string | null; broadQuery: string | null; queryEn: string | null }
  failure: string | null
  source: YouTubeSource
  partial: boolean
  thresholdsVersion: number
  measuredAt: string
}

export type NewIdeaMeasure = Omit<IdeaMeasure, 'id' | 'measuredAt'>

interface Row {
  id: string
  idea_id: string
  idea_revision: number
  status: 'medida' | 'fallida'
  verdict: IdeaVerdict | null
  reason: string | null
  figures: string | null
  similar_videos: string
  opportunity: string | null
  queries: string
  failure: string | null
  source: YouTubeSource
  partial: number
  thresholds_version: number
  measured_at: string
}

const json = <T>(text: string | null): T | null => (text === null ? null : (JSON.parse(text) as T))

const fromRow = (row: Row): IdeaMeasure => ({
  id: row.id,
  ideaId: row.idea_id,
  ideaRevision: Number(row.idea_revision),
  status: row.status,
  verdict: row.verdict,
  reason: row.reason,
  figures: json(row.figures),
  similarVideos: JSON.parse(row.similar_videos) as VideoHit[],
  opportunity: json(row.opportunity),
  queries: JSON.parse(row.queries) as IdeaMeasure['queries'],
  failure: row.failure,
  source: row.source,
  partial: row.partial === 1,
  thresholdsVersion: Number(row.thresholds_version),
  measuredAt: row.measured_at,
})

export function createIdeaMeasuresRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM idea_measure WHERE id = ?')
  const selectLatest = db.prepare(
    'SELECT * FROM idea_measure WHERE idea_id = ? ORDER BY measured_at DESC, rowid DESC LIMIT 1',
  )
  const selectLatestMeasured = db.prepare(
    `SELECT * FROM idea_measure WHERE idea_id = ? AND status = 'medida' ORDER BY measured_at DESC, rowid DESC LIMIT 1`,
  )
  const selectLatestByChannel = db.prepare(
    `SELECT m.* FROM idea_measure m JOIN idea i ON i.id = m.idea_id WHERE i.channel_id = ?
     ORDER BY m.measured_at, m.rowid`,
  )
  const insert = db.prepare(
    `INSERT INTO idea_measure (id, idea_id, idea_revision, status, verdict, reason, figures, similar_videos,
       opportunity, queries, failure, source, partial, thresholds_version, measured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  return {
    add(measure: NewIdeaMeasure): IdeaMeasure {
      const id = randomUUID()
      insert.run(
        id,
        measure.ideaId,
        measure.ideaRevision,
        measure.status,
        measure.verdict,
        measure.reason,
        measure.figures === null ? null : JSON.stringify(measure.figures),
        JSON.stringify(measure.similarVideos),
        measure.opportunity === null ? null : JSON.stringify(measure.opportunity),
        JSON.stringify(measure.queries),
        measure.failure,
        measure.source,
        measure.partial ? 1 : 0,
        measure.thresholdsVersion,
        now().toISOString(),
      )
      return fromRow(selectOne.get(id) as unknown as Row)
    },

    latest(ideaId: string): IdeaMeasure | null {
      const row = selectLatest.get(ideaId) as Row | undefined
      return row ? fromRow(row) : null
    },

    // The last one that did measure: a later failure does not take away what YouTube said (006, R7).
    latestMeasured(ideaId: string): IdeaMeasure | null {
      const row = selectLatestMeasured.get(ideaId) as Row | undefined
      return row ? fromRow(row) : null
    },

    // The last measure of every idea of a channel, by idea.
    latestByChannel(channelId: string): Map<string, IdeaMeasure> {
      const rows = (selectLatestByChannel.all(channelId) as unknown as Row[]).map(fromRow)
      return new Map(rows.map((measure) => [measure.ideaId, measure]))
    },
  }
}

export type IdeaMeasuresRepo = ReturnType<typeof createIdeaMeasuresRepo>

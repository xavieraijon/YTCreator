import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { EntryLevel, Level, MeasureStatus, Verdict, YouTubeFailureCode, YouTubeSource } from '@ytcreator/core'
import { inTransaction } from '../transaction.ts'

export interface MeasureFigures {
  demandMedianViews: number
  demandLevel: Level
  entryChannels: number
  entryLevel: EntryLevel
  concentration: number
  concentrationLevel: Level
  recentVideos: number
  recentShare: number
  sampleSize: number
  verdict: Verdict
}

type Nullable<T> = { [K in keyof T]: T[K] | null }

export interface Measure extends Nullable<MeasureFigures> {
  id: string
  journeyId: string
  nicheLabel: string
  queries: string[]
  source: YouTubeSource
  status: MeasureStatus
  failure: YouTubeFailureCode | null
  thresholdsVersion: number
  measuredAt: string | null
  createdAt: string
}

export interface NewMeasure {
  journeyId: string
  nicheLabel: string
  queries: string[]
  source: YouTubeSource
  thresholdsVersion: number
}

export interface NewReference {
  youtubeChannelId: string
  title: string
  handle: string | null
  subscribers: number | null
  topVideoViews: number
  reason: string
}

export interface ReferenceChannel extends NewReference {
  id: string
  measureId: string
  fetchedAt: string
}

interface Row {
  id: string
  journey_id: string
  niche_label: string
  queries: string
  source: YouTubeSource
  status: MeasureStatus
  failure: YouTubeFailureCode | null
  demand_median_views: number | null
  demand_level: Level | null
  entry_channels: number | null
  entry_level: EntryLevel | null
  concentration: number | null
  concentration_level: Level | null
  recent_videos: number | null
  recent_share: number | null
  sample_size: number | null
  verdict: Verdict | null
  thresholds_version: number
  measured_at: string | null
  created_at: string
}

interface ReferenceRow {
  id: string
  measure_id: string
  youtube_channel_id: string
  title: string
  handle: string | null
  subscribers: number | null
  top_video_views: number
  reason: string
  fetched_at: string
}

const fromRow = (row: Row): Measure => ({
  id: row.id,
  journeyId: row.journey_id,
  nicheLabel: row.niche_label,
  queries: JSON.parse(row.queries) as string[],
  source: row.source,
  status: row.status,
  failure: row.failure,
  demandMedianViews: row.demand_median_views,
  demandLevel: row.demand_level,
  entryChannels: row.entry_channels,
  entryLevel: row.entry_level,
  concentration: row.concentration,
  concentrationLevel: row.concentration_level,
  recentVideos: row.recent_videos,
  recentShare: row.recent_share,
  sampleSize: row.sample_size,
  verdict: row.verdict,
  thresholdsVersion: row.thresholds_version,
  measuredAt: row.measured_at,
  createdAt: row.created_at,
})

const fromReferenceRow = (row: ReferenceRow): ReferenceChannel => ({
  id: row.id,
  measureId: row.measure_id,
  youtubeChannelId: row.youtube_channel_id,
  title: row.title,
  handle: row.handle,
  subscribers: row.subscribers,
  topVideoViews: row.top_video_views,
  reason: row.reason,
  fetchedAt: row.fetched_at,
})

export function createMeasuresRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM market_measure WHERE id = ?')
  const selectByJourney = db.prepare('SELECT * FROM market_measure WHERE journey_id = ? ORDER BY created_at, rowid')
  const insert = db.prepare(
    `INSERT INTO market_measure (id, journey_id, niche_label, queries, source, status, thresholds_version, created_at)
     VALUES (?, ?, ?, ?, ?, 'en_curso', ?, ?)`,
  )
  const updateFigures = db.prepare(
    `UPDATE market_measure SET status = 'medida', failure = NULL, demand_median_views = ?, demand_level = ?,
       entry_channels = ?, entry_level = ?, concentration = ?, concentration_level = ?, recent_videos = ?,
       recent_share = ?, sample_size = ?, verdict = ?, measured_at = ?
     WHERE id = ?`,
  )
  const updateFailure = db.prepare(
    `UPDATE market_measure SET status = 'fallida', failure = ?, demand_median_views = NULL, demand_level = NULL,
       entry_channels = NULL, entry_level = NULL, concentration = NULL, concentration_level = NULL,
       recent_videos = NULL, recent_share = NULL, sample_size = NULL, verdict = NULL
     WHERE id = ?`,
  )
  const deleteReferences = db.prepare('DELETE FROM reference_channel WHERE measure_id = ?')
  const insertReference = db.prepare(
    `INSERT INTO reference_channel (id, measure_id, youtube_channel_id, title, handle, subscribers, top_video_views,
       reason, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectReferences = db.prepare('SELECT * FROM reference_channel WHERE measure_id = ? ORDER BY rowid')

  const get = (id: string): Measure | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,

    listByJourney(journeyId: string): Measure[] {
      return (selectByJourney.all(journeyId) as unknown as Row[]).map(fromRow)
    },

    start(measure: NewMeasure): Measure {
      const id = randomUUID()
      insert.run(
        id,
        measure.journeyId,
        measure.nicheLabel,
        JSON.stringify(measure.queries),
        measure.source,
        measure.thresholdsVersion,
        now().toISOString(),
      )
      return get(id)!
    },

    complete(id: string, f: MeasureFigures): Measure | null {
      updateFigures.run(
        f.demandMedianViews,
        f.demandLevel,
        f.entryChannels,
        f.entryLevel,
        f.concentration,
        f.concentrationLevel,
        f.recentVideos,
        f.recentShare,
        f.sampleSize,
        f.verdict,
        now().toISOString(),
        id,
      )
      return get(id)
    },

    fail(id: string, failure: YouTubeFailureCode): Measure | null {
      updateFailure.run(failure, id)
      return get(id)
    },

    setReferences(measureId: string, references: NewReference[]): ReferenceChannel[] {
      return inTransaction(db, () => {
        deleteReferences.run(measureId)
        const at = now().toISOString()
        for (const r of references) {
          insertReference.run(
            randomUUID(),
            measureId,
            r.youtubeChannelId,
            r.title,
            r.handle,
            r.subscribers,
            r.topVideoViews,
            r.reason,
            at,
          )
        }
        return (selectReferences.all(measureId) as unknown as ReferenceRow[]).map(fromReferenceRow)
      })
    },

    listReferences(measureId: string): ReferenceChannel[] {
      return (selectReferences.all(measureId) as unknown as ReferenceRow[]).map(fromReferenceRow)
    },
  }
}

export type MeasuresRepo = ReturnType<typeof createMeasuresRepo>

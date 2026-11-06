import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ReadingSummary, YouTubeSource } from '@ytcreator/core'

export interface ReadingVideo {
  id: string
  title: string
  views: number | null
  durationSeconds: number | null
  publishedAt: string | null
  isShort: boolean
  // Times the normal of its channel (data-model.md), null when there was too little before it to know.
  ratio: number | null
}

export interface NewReading {
  channelId: string
  youtubeChannelId: string
  source: YouTubeSource
  title: string
  handle: string | null
  description: string
  subscribers: number | null
  videoCount: number | null
  videos: ReadingVideo[]
  summary: ReadingSummary
  // When YouTube answered, which may be before saving it (the cache of the service). Now, if not given.
  fetchedAt?: string
}

export interface ChannelReading extends NewReading {
  id: string
  fetchedAt: string
}

interface Row {
  id: string
  channel_id: string
  youtube_channel_id: string
  source: YouTubeSource
  title: string
  handle: string | null
  description: string
  subscribers: number | null
  video_count: number | null
  videos: string
  summary: string
  fetched_at: string
}

const fromRow = (row: Row): ChannelReading => ({
  id: row.id,
  channelId: row.channel_id,
  youtubeChannelId: row.youtube_channel_id,
  source: row.source,
  title: row.title,
  handle: row.handle,
  description: row.description,
  subscribers: row.subscribers,
  videoCount: row.video_count,
  videos: JSON.parse(row.videos) as ReadingVideo[],
  summary: JSON.parse(row.summary) as ReadingSummary,
  fetchedAt: row.fetched_at,
})

export function createReadingsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM channel_reading WHERE id = ?')
  const selectLatest = db.prepare(
    'SELECT * FROM channel_reading WHERE channel_id = ? ORDER BY fetched_at DESC, rowid DESC LIMIT 1',
  )
  const selectLatestFor = db.prepare(
    `SELECT * FROM channel_reading WHERE channel_id = ? AND youtube_channel_id = ?
     ORDER BY fetched_at DESC, rowid DESC LIMIT 1`,
  )
  const insert = db.prepare(
    `INSERT INTO channel_reading (id, channel_id, youtube_channel_id, source, title, handle, description, subscribers,
       video_count, videos, summary, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const get = (id: string): ChannelReading | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,

    add(reading: NewReading): ChannelReading {
      const id = randomUUID()
      insert.run(
        id,
        reading.channelId,
        reading.youtubeChannelId,
        reading.source,
        reading.title,
        reading.handle,
        reading.description,
        reading.subscribers,
        reading.videoCount,
        JSON.stringify(reading.videos),
        JSON.stringify(reading.summary),
        reading.fetchedAt ?? now().toISOString(),
      )
      return get(id)!
    },

    latest(channelId: string): ChannelReading | null {
      const row = selectLatest.get(channelId) as Row | undefined
      return row ? fromRow(row) : null
    },

    /** The newest reading of one channel of YouTube: a reading of another one may have ended after it. */
    latestFor(channelId: string, youtubeChannelId: string): ChannelReading | null {
      const row = selectLatestFor.get(channelId, youtubeChannelId) as Row | undefined
      return row ? fromRow(row) : null
    },
  }
}

export type ReadingsRepo = ReturnType<typeof createReadingsRepo>

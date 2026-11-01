import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { AudienceRegion, ChannelOrigin, NameStatus } from '@ytcreator/core'

export interface Channel {
  id: string
  origin: ChannelOrigin
  displayName: string | null
  handle: string | null
  nameStatus: NameStatus
  youtubeChannelId: string | null
  language: string
  audienceRegion: AudienceRegion
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NewChannel {
  origin: ChannelOrigin
  displayName?: string | null
  handle?: string | null
  youtubeChannelId?: string | null
  audienceRegion?: AudienceRegion
}

export type ChannelPatch = Partial<
  Pick<Channel, 'displayName' | 'handle' | 'nameStatus' | 'youtubeChannelId' | 'audienceRegion'>
>

interface Row {
  id: string
  origin: ChannelOrigin
  display_name: string | null
  handle: string | null
  name_status: NameStatus
  youtube_channel_id: string | null
  language: string
  audience_region: AudienceRegion
  archived_at: string | null
  created_at: string
  updated_at: string
}

const fromRow = (row: Row): Channel => ({
  id: row.id,
  origin: row.origin,
  displayName: row.display_name,
  handle: row.handle,
  nameStatus: row.name_status,
  youtubeChannelId: row.youtube_channel_id,
  language: row.language,
  audienceRegion: row.audience_region,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export function createChannelsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM channel WHERE id = ?')
  // v1 has a single channel; the newest one not archived is the current one.
  const selectCurrent = db.prepare(
    'SELECT * FROM channel WHERE archived_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1',
  )
  const selectByYouTubeId = db.prepare('SELECT * FROM channel WHERE youtube_channel_id = ?')
  const insert = db.prepare(
    `INSERT INTO channel (id, origin, display_name, handle, youtube_channel_id, audience_region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const updateOne = db.prepare(
    `UPDATE channel SET display_name = ?, handle = ?, name_status = ?, youtube_channel_id = ?, audience_region = ?,
       updated_at = ? WHERE id = ?`,
  )

  const get = (id: string): Channel | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,
    getCurrent(): Channel | null {
      const row = selectCurrent.get() as Row | undefined
      return row ? fromRow(row) : null
    },
    findByYouTubeId(youtubeChannelId: string): Channel | null {
      const row = selectByYouTubeId.get(youtubeChannelId) as Row | undefined
      return row ? fromRow(row) : null
    },

    create(channel: NewChannel): Channel {
      const id = randomUUID()
      const at = now().toISOString()
      insert.run(
        id,
        channel.origin,
        channel.displayName ?? null,
        channel.handle ?? null,
        channel.youtubeChannelId ?? null,
        channel.audienceRegion ?? 'espana',
        at,
        at,
      )
      return get(id)!
    },

    update(id: string, patch: ChannelPatch): Channel | null {
      const current = get(id)
      if (!current) return null
      const next = { ...current, ...patch }
      updateOne.run(
        next.displayName,
        next.handle,
        next.nameStatus,
        next.youtubeChannelId,
        next.audienceRegion,
        now().toISOString(),
        id,
      )
      return get(id)
    },
  }
}

export type ChannelsRepo = ReturnType<typeof createChannelsRepo>

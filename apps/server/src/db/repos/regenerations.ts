import { randomUUID } from 'node:crypto'
import { inTransaction } from '../transaction.ts'
import type { DatabaseSync } from 'node:sqlite'
import type { ProfilePart, ProfilePartOutput } from '@ytcreator/core'

// A part of the profile the AI proposed again, waiting for the creator's yes (entry 119).
export interface NewRegeneration {
  channelId: string
  baseVersion: number
  part: ProfilePart
  proposed: Partial<ProfilePartOutput>
  claimsTrimmed: boolean
  usageId: string | null
}

export interface Regeneration extends NewRegeneration {
  id: string
  createdAt: string
}

interface Row {
  id: string
  channel_id: string
  base_version: number
  part: ProfilePart
  proposed: string
  claims_trimmed: number
  usage_id: string | null
  created_at: string
}

const fromRow = (row: Row): Regeneration => ({
  id: row.id,
  channelId: row.channel_id,
  baseVersion: row.base_version,
  part: row.part,
  proposed: JSON.parse(row.proposed) as Partial<ProfilePartOutput>,
  claimsTrimmed: row.claims_trimmed === 1,
  usageId: row.usage_id,
  createdAt: row.created_at,
})

export function createRegenerationsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const insert = db.prepare(
    `INSERT INTO profile_regeneration (id, channel_id, base_version, part, proposed, claims_trimmed, usage_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectOne = db.prepare('SELECT * FROM profile_regeneration WHERE id = ?')
  const selectLatest = db.prepare(
    'SELECT * FROM profile_regeneration WHERE channel_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
  )
  const deleteOne = db.prepare('DELETE FROM profile_regeneration WHERE id = ?')
  const deleteForChannel = db.prepare('DELETE FROM profile_regeneration WHERE channel_id = ?')

  return {
    get(id: string): Regeneration | null {
      const row = selectOne.get(id) as Row | undefined
      return row ? fromRow(row) : null
    },

    // There is one at a time: the one shown in the profile.
    latest(channelId: string): Regeneration | null {
      const row = selectLatest.get(channelId) as Row | undefined
      return row ? fromRow(row) : null
    },

    // A new proposal takes the place of the one before, which the creator already left.
    replace(regeneration: NewRegeneration): Regeneration {
      const id = randomUUID()
      // One at a time per channel, and the one before is not lost if the new one cannot be written.
      inTransaction(db, () => {
        deleteForChannel.run(regeneration.channelId)
        insert.run(
          id,
          regeneration.channelId,
          regeneration.baseVersion,
          regeneration.part,
          JSON.stringify(regeneration.proposed),
          regeneration.claimsTrimmed ? 1 : 0,
          regeneration.usageId,
          now().toISOString(),
        )
      })
      return this.get(id)!
    },

    remove(id: string): boolean {
      return Number(deleteOne.run(id).changes) > 0
    },
  }
}

export type RegenerationsRepo = ReturnType<typeof createRegenerationsRepo>

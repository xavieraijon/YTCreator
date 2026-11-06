import type { DatabaseSync } from 'node:sqlite'
import type { ProfileOrigin } from '@ytcreator/core'
import { inTransaction } from '../transaction.ts'

export interface ProfileVersion {
  channelId: string
  version: number
  origin: ProfileOrigin
  restoredFrom: number | null
  proposalId: string | null
  // Validated with the ChannelProfile schema by the service; the repo only stores it.
  profile: unknown
  createdAt: string
}

export interface NewProfileVersion {
  origin: Exclude<ProfileOrigin, 'restaurada'>
  profile: unknown
  proposalId?: string | null
}

interface Row {
  channel_id: string
  version: number
  origin: ProfileOrigin
  restored_from: number | null
  proposal_id: string | null
  profile: string
  created_at: string
}

const fromRow = (row: Row): ProfileVersion => ({
  channelId: row.channel_id,
  version: row.version,
  origin: row.origin,
  restoredFrom: row.restored_from,
  proposalId: row.proposal_id,
  profile: JSON.parse(row.profile),
  createdAt: row.created_at,
})

export function createProfilesRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectVersion = db.prepare('SELECT * FROM profile_version WHERE channel_id = ? AND version = ?')
  const selectVersions = db.prepare('SELECT * FROM profile_version WHERE channel_id = ? ORDER BY version')
  const selectCurrent = db.prepare(
    `SELECT v.* FROM channel_profile p JOIN profile_version v
       ON v.channel_id = p.channel_id AND v.version = p.current_version WHERE p.channel_id = ?`,
  )
  const selectMax = db.prepare('SELECT max(version) AS n FROM profile_version WHERE channel_id = ?')
  const insertVersion = db.prepare(
    `INSERT INTO profile_version (channel_id, version, origin, restored_from, proposal_id, profile, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const upsertCurrent = db.prepare(
    `INSERT INTO channel_profile (channel_id, current_version, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (channel_id) DO UPDATE SET current_version = excluded.current_version, updated_at = excluded.updated_at`,
  )

  const getVersion = (channelId: string, version: number): ProfileVersion | null => {
    const row = selectVersion.get(channelId, version) as Row | undefined
    return row ? fromRow(row) : null
  }

  // Versions are immutable; each change appends the next number and moves the current pointer.
  const append = (
    channelId: string,
    origin: ProfileOrigin,
    profile: unknown,
    proposalId: string | null,
    restoredFrom: number | null,
  ): ProfileVersion =>
    inTransaction(db, () => {
      const version = ((selectMax.get(channelId) as { n: number | null }).n ?? 0) + 1
      const at = now().toISOString()
      insertVersion.run(channelId, version, origin, restoredFrom, proposalId, JSON.stringify(profile), at)
      upsertCurrent.run(channelId, version, at)
      return getVersion(channelId, version)!
    })

  return {
    getVersion,
    getCurrent(channelId: string): ProfileVersion | null {
      const row = selectCurrent.get(channelId) as Row | undefined
      return row ? fromRow(row) : null
    },
    listVersions(channelId: string): ProfileVersion[] {
      return (selectVersions.all(channelId) as unknown as Row[]).map(fromRow)
    },
    addVersion(channelId: string, version: NewProfileVersion): ProfileVersion {
      return append(channelId, version.origin, version.profile, version.proposalId ?? null, null)
    },
    // `shape` adjusts the old profile before it becomes the current one (the route keeps the chosen name).
    restore(
      channelId: string,
      version: number,
      shape: (profile: unknown) => unknown = (p) => p,
    ): ProfileVersion | null {
      return inTransaction(db, () => {
        const old = getVersion(channelId, version)
        return old ? append(channelId, 'restaurada', shape(old.profile), null, version) : null
      })
    },
  }
}

export type ProfilesRepo = ReturnType<typeof createProfilesRepo>

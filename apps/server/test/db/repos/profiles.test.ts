import { beforeEach, describe, expect, it } from 'vitest'
import { createChannelsRepo } from '../../../src/db/repos/channels.ts'
import { createProfilesRepo, type ProfilesRepo } from '../../../src/db/repos/profiles.ts'
import { freshDb } from './helpers.ts'

describe('profiles repo', () => {
  let profiles: ProfilesRepo
  let channelId: string

  beforeEach(() => {
    const db = freshDb()
    channelId = createChannelsRepo(db).create({ origin: 'nuevo' }).id
    profiles = createProfilesRepo(db)
  })

  it('has no profile before the first version', () => {
    expect(profiles.getCurrent(channelId)).toBeNull()
    expect(profiles.listVersions(channelId)).toEqual([])
  })

  it('numbers versions 1, 2, 3 and keeps the last one as current', () => {
    profiles.addVersion(channelId, { origin: 'ia', profile: { promise: 'uno' } })
    profiles.addVersion(channelId, { origin: 'manual', profile: { promise: 'dos' } })
    const third = profiles.addVersion(channelId, { origin: 'ia', profile: { promise: 'tres' } })
    expect(third.version).toBe(3)
    expect(profiles.getCurrent(channelId)).toMatchObject({ version: 3, profile: { promise: 'tres' } })
    expect(profiles.listVersions(channelId).map((v) => v.origin)).toEqual(['ia', 'manual', 'ia'])
  })

  it('restoring copies an old version into a new one with origin restaurada', () => {
    profiles.addVersion(channelId, { origin: 'ia', profile: { promise: 'uno' } })
    profiles.addVersion(channelId, { origin: 'manual', profile: { promise: 'dos' } })
    const restored = profiles.restore(channelId, 1)
    expect(restored).toMatchObject({ version: 3, origin: 'restaurada', restoredFrom: 1, profile: { promise: 'uno' } })
    expect(profiles.getVersion(channelId, 2)?.profile).toEqual({ promise: 'dos' })
  })

  it('restoring an unknown version returns null', () => {
    expect(profiles.restore(channelId, 9)).toBeNull()
  })
})

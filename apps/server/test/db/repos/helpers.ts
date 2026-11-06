import type { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS, migrate } from '../../../src/db/migrate.ts'
import { openDatabase } from '../../../src/db/open.ts'
import { createChannelsRepo } from '../../../src/db/repos/channels.ts'
import { createJourneysRepo } from '../../../src/db/repos/journeys.ts'

export function freshDb(): DatabaseSync {
  const db = openDatabase(':memory:')
  migrate(db, MIGRATIONS)
  return db
}

// A clock the test moves by hand.
export function manualClock(start = '2026-11-01T10:00:00.000Z') {
  let current = new Date(start)
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current = new Date(current.getTime() + ms)
    },
    set(iso: string) {
      current = new Date(iso)
    },
  }
}

// A channel with an active journey, which most channel tables hang from.
export function seedJourney(db: DatabaseSync): { channelId: string; journeyId: string } {
  const channelId = createChannelsRepo(db).create({ origin: 'nuevo' }).id
  const journeyId = createJourneysRepo(db).create({ channelId, kind: 'nuevo', step: 'nichos' }).id
  return { channelId, journeyId }
}

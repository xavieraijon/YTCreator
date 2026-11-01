import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ChannelOrigin, JourneyStatus, JourneyStep } from '@ytcreator/core'
import { inTransaction } from '../transaction.ts'

export interface Journey {
  id: string
  channelId: string
  kind: ChannelOrigin
  step: JourneyStep
  status: JourneyStatus
  // Validated with journeyStateSchema by the service; the repo only stores it.
  state: Record<string, unknown>
  revision: number
  createdAt: string
  updatedAt: string
}

export interface NewJourney {
  channelId: string
  kind: ChannelOrigin
  step: JourneyStep
}

export type JourneyPatch = Partial<Pick<Journey, 'step' | 'status' | 'state'>>

export type JourneyUpdate = { ok: true; journey: Journey } | { ok: false; conflict: true; current: Journey }

interface Row {
  id: string
  channel_id: string
  kind: ChannelOrigin
  step: JourneyStep
  status: JourneyStatus
  state: string
  revision: number
  created_at: string
  updated_at: string
}

const fromRow = (row: Row): Journey => ({
  id: row.id,
  channelId: row.channel_id,
  kind: row.kind,
  step: row.step,
  status: row.status,
  state: JSON.parse(row.state) as Record<string, unknown>,
  revision: row.revision,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export function createJourneysRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM journey WHERE id = ?')
  const selectActive = db.prepare("SELECT * FROM journey WHERE channel_id = ? AND status = 'activo'")
  const selectLast = db.prepare(
    'SELECT * FROM journey WHERE channel_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
  )
  const insert = db.prepare(
    'INSERT INTO journey (id, channel_id, kind, step, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const updateOne = db.prepare(
    `UPDATE journey SET step = ?, status = ?, state = ?, revision = revision + 1, updated_at = ?
     WHERE id = ? AND revision = ?`,
  )

  const get = (id: string): Journey | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }
  const getActive = (channelId: string): Journey | null => {
    const row = selectActive.get(channelId) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,
    getActive,
    getLast(channelId: string): Journey | null {
      const row = selectLast.get(channelId) as Row | undefined
      return row ? fromRow(row) : null
    },

    create(journey: NewJourney): Journey {
      return inTransaction(db, () => {
        if (getActive(journey.channelId)) throw new Error('recorrido_activo')
        const id = randomUUID()
        const at = now().toISOString()
        insert.run(id, journey.channelId, journey.kind, journey.step, at, at)
        return get(id)!
      })
    },

    // Optimistic update: the caller sends the revision it saw; a stale one gets the current journey back.
    update(id: string, expectedRevision: number, patch: JourneyPatch): JourneyUpdate | null {
      return inTransaction(db, () => {
        const current = get(id)
        if (!current) return null
        if (current.revision !== expectedRevision) return { ok: false, conflict: true, current }
        const next = { ...current, ...patch }
        updateOne.run(next.step, next.status, JSON.stringify(next.state), now().toISOString(), id, expectedRevision)
        return { ok: true, journey: get(id)! }
      })
    },
  }
}

export type JourneysRepo = ReturnType<typeof createJourneysRepo>

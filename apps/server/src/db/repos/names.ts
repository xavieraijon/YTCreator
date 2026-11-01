import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { NameReason, Semaphore, StoredHandleStatus } from '@ytcreator/core'

export interface SimilarChannel {
  title: string
  handle: string | null
  subscribers: number | null
}

export interface NewNameCheck {
  journeyId: string
  displayName: string
  handle: string
  origin: 'ia' | 'creador'
  semaphore: Semaphore
  reasons: readonly NameReason[]
  handleStatus: StoredHandleStatus
  similarChannels: readonly SimilarChannel[]
  titleHits: number | null
}

export interface NameCheck extends NewNameCheck {
  id: string
  checkedAt: string
}

interface Row {
  id: string
  journey_id: string
  display_name: string
  handle: string
  origin: 'ia' | 'creador'
  semaphore: Semaphore
  reasons: string
  handle_status: StoredHandleStatus
  similar_channels: string
  title_hits: number | null
  checked_at: string
}

const fromRow = (row: Row): NameCheck => ({
  id: row.id,
  journeyId: row.journey_id,
  displayName: row.display_name,
  handle: row.handle,
  origin: row.origin,
  semaphore: row.semaphore,
  reasons: JSON.parse(row.reasons) as NameReason[],
  handleStatus: row.handle_status,
  similarChannels: JSON.parse(row.similar_channels) as SimilarChannel[],
  titleHits: row.title_hits,
  checkedAt: row.checked_at,
})

export function createNamesRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM name_check WHERE id = ?')
  const selectByJourney = db.prepare('SELECT * FROM name_check WHERE journey_id = ? ORDER BY checked_at, rowid')
  const insert = db.prepare(
    `INSERT INTO name_check (id, journey_id, display_name, handle, origin, semaphore, reasons, handle_status,
       similar_channels, title_hits, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const get = (id: string): NameCheck | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,

    record(check: NewNameCheck): NameCheck {
      const id = randomUUID()
      insert.run(
        id,
        check.journeyId,
        check.displayName,
        check.handle,
        check.origin,
        check.semaphore,
        JSON.stringify(check.reasons),
        check.handleStatus,
        JSON.stringify(check.similarChannels),
        check.titleHits,
        now().toISOString(),
      )
      return get(id)!
    },

    listByJourney(journeyId: string): NameCheck[] {
      return (selectByJourney.all(journeyId) as unknown as Row[]).map(fromRow)
    },
  }
}

export type NamesRepo = ReturnType<typeof createNamesRepo>

import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { canMoveIdea, checkOrder, type Idea, type IdeaFormat, type IdeaOrigin, type IdeaStatus } from '@ytcreator/core'
import { inTransaction } from '../transaction.ts'

// The idea bank of each channel (specs/004-idea-bank/data-model.md).
export interface NewIdea {
  channelId: string
  origin: IdeaOrigin
  batchId?: string | null
  sourceIdeaId?: string | null
  title: string
  hook?: string
  pillar?: string | null
  format: IdeaFormat
  notes?: string
  query?: string | null
  broadQuery?: string | null
  queryEn?: string | null
  profileVersion: number
}

// What an edit can change. The fields of the content move the revision; the notes do not (R11).
export interface IdeaEdit {
  title?: string
  hook?: string
  pillar?: string | null
  format?: IdeaFormat
  notes?: string
  query?: string | null
  broadQuery?: string | null
  queryEn?: string | null
}

const CONTENT: readonly (keyof IdeaEdit)[] = ['title', 'hook', 'pillar', 'format', 'query', 'broadQuery', 'queryEn']

interface Row {
  id: string
  channel_id: string
  origin: IdeaOrigin
  batch_id: string | null
  source_idea_id: string | null
  title: string
  hook: string
  pillar: string | null
  format: IdeaFormat
  query: string | null
  broad_query: string | null
  query_en: string | null
  notes: string
  status: IdeaStatus
  position: number
  queue_position: number | null
  original: string
  revision: number
  profile_version: number
  created_at: string
  updated_at: string
}

const fromRow = (row: Row): Idea => ({
  id: row.id,
  channelId: row.channel_id,
  origin: row.origin,
  batchId: row.batch_id,
  sourceIdeaId: row.source_idea_id,
  title: row.title,
  hook: row.hook,
  pillar: row.pillar,
  format: row.format,
  query: row.query,
  broadQuery: row.broad_query,
  queryEn: row.query_en,
  notes: row.notes,
  status: row.status,
  position: Number(row.position),
  queuePosition: row.queue_position === null ? null : Number(row.queue_position),
  original: JSON.parse(row.original) as Record<string, unknown>,
  revision: Number(row.revision),
  profileVersion: Number(row.profile_version),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class IdeaOrderError extends Error {
  constructor() {
    super('The order must name every idea once')
    this.name = 'IdeaOrderError'
  }
}

// A move the state diagram does not have (data-model.md, «Estados»).
export class IdeaMoveError extends Error {
  constructor(from: IdeaStatus, to: IdeaStatus) {
    super(`An idea cannot go from ${from} to ${to}`)
    this.name = 'IdeaMoveError'
  }
}

export function createIdeasRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM idea WHERE id = ?')
  const selectBank = db.prepare(
    "SELECT * FROM idea WHERE channel_id = ? AND status <> 'archivada' ORDER BY position, rowid",
  )
  const selectArchived = db.prepare(
    "SELECT * FROM idea WHERE channel_id = ? AND status = 'archivada' ORDER BY updated_at DESC, rowid",
  )
  const selectAll = db.prepare('SELECT * FROM idea WHERE channel_id = ? ORDER BY created_at DESC, rowid DESC')
  const selectQueue = db.prepare(
    "SELECT * FROM idea WHERE channel_id = ? AND status = 'elegida' ORDER BY queue_position, rowid",
  )
  const maxPosition = db.prepare('SELECT coalesce(max(position), 0) AS n FROM idea WHERE channel_id = ?')
  const maxQueue = db.prepare('SELECT coalesce(max(queue_position), 0) AS n FROM idea WHERE channel_id = ?')
  const insert = db.prepare(
    `INSERT INTO idea (id, channel_id, origin, batch_id, source_idea_id, title, hook, pillar, format, query,
       broad_query, query_en, notes, status, position, original, revision, profile_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'banco', ?, ?, 1, ?, ?, ?)`,
  )
  const update = db.prepare(
    `UPDATE idea SET title = ?, hook = ?, pillar = ?, format = ?, query = ?, broad_query = ?, query_en = ?, notes = ?,
       revision = ?, updated_at = ? WHERE id = ?`,
  )
  const setStatusRow = db.prepare('UPDATE idea SET status = ?, queue_position = ?, updated_at = ? WHERE id = ?')
  const setPosition = db.prepare('UPDATE idea SET position = ? WHERE id = ?')
  const setQueuePosition = db.prepare('UPDATE idea SET queue_position = ? WHERE id = ?')

  const get = (id: string): Idea | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }
  const list = (statement: typeof selectBank, channelId: string) =>
    (statement.all(channelId) as unknown as Row[]).map(fromRow)

  // The queue counts from 1 with no gaps, in its current order.
  const renumberQueue = (channelId: string) => {
    list(selectQueue, channelId).forEach((idea, index) => setQueuePosition.run(index + 1, idea.id))
  }

  return {
    get,
    listBank: (channelId: string): Idea[] => list(selectBank, channelId),
    listArchived: (channelId: string): Idea[] => list(selectArchived, channelId),
    // Every idea of the channel, the newest first: what the AI must not repeat (R9).
    listAll: (channelId: string): Idea[] => list(selectAll, channelId),
    listQueue: (channelId: string): Idea[] => list(selectQueue, channelId),

    create(idea: NewIdea): Idea {
      const id = randomUUID()
      const at = now().toISOString()
      const fields = {
        title: idea.title,
        hook: idea.hook ?? '',
        pillar: idea.pillar ?? null,
        format: idea.format,
        query: idea.query ?? null,
        broadQuery: idea.broadQuery ?? null,
        queryEn: idea.queryEn ?? null,
      }
      const position = Number((maxPosition.get(idea.channelId) as { n: number }).n) + 1
      insert.run(
        id,
        idea.channelId,
        idea.origin,
        idea.batchId ?? null,
        idea.sourceIdeaId ?? null,
        fields.title,
        fields.hook,
        fields.pillar,
        fields.format,
        fields.query,
        fields.broadQuery,
        fields.queryEn,
        idea.notes ?? '',
        position,
        JSON.stringify(fields),
        idea.profileVersion,
        at,
        at,
      )
      return get(id)!
    },

    edit(id: string, edit: IdeaEdit): Idea | null {
      const current = get(id)
      if (!current) return null
      // A key given as undefined leaves the field as it is.
      const given = Object.fromEntries(Object.entries(edit).filter(([, value]) => value !== undefined))
      const next = { ...current, ...given }
      const changed = CONTENT.some((key) => edit[key] !== undefined && edit[key] !== current[key])
      update.run(
        next.title,
        next.hook,
        next.pillar,
        next.format,
        next.query,
        next.broadQuery,
        next.queryEn,
        next.notes,
        changed ? current.revision + 1 : current.revision,
        now().toISOString(),
        id,
      )
      return get(id)
    },

    // data-model.md, «Estados»: choosing puts it at the end of the queue; leaving the queue renumbers it.
    setStatus(id: string, status: IdeaStatus): Idea | null {
      const current = get(id)
      if (!current) return null
      if (current.status === status) return current
      if (!canMoveIdea(current.status, status)) throw new IdeaMoveError(current.status, status)
      return inTransaction(db, () => {
        const place = status === 'elegida' ? Number((maxQueue.get(current.channelId) as { n: number }).n) + 1 : null
        setStatusRow.run(status, place, now().toISOString(), id)
        if (current.status === 'elegida') renumberQueue(current.channelId)
        // Brought back from the archive, it goes to the end of the bank.
        if (current.status === 'archivada') {
          setPosition.run(Number((maxPosition.get(current.channelId) as { n: number }).n) + 1, id)
        }
        return get(id)
      })
    },

    reorder(channelId: string, ids: readonly string[]): Idea[] {
      const bank = list(selectBank, channelId)
      if (
        !checkOrder(
          ids,
          bank.map((idea) => idea.id),
        )
      )
        throw new IdeaOrderError()
      inTransaction(db, () => ids.forEach((ideaId, index) => setPosition.run(index + 1, ideaId)))
      return list(selectBank, channelId)
    },

    reorderQueue(channelId: string, ids: readonly string[]): Idea[] {
      const queue = list(selectQueue, channelId)
      if (
        !checkOrder(
          ids,
          queue.map((idea) => idea.id),
        )
      )
        throw new IdeaOrderError()
      inTransaction(db, () => ids.forEach((ideaId, index) => setQueuePosition.run(index + 1, ideaId)))
      return list(selectQueue, channelId)
    },
  }
}

export type IdeasRepo = ReturnType<typeof createIdeasRepo>

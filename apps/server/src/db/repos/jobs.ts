import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { JobKind, JobProgress, JobStatus } from '@ytcreator/core'

export interface Job {
  id: string
  journeyId: string | null
  // The idea bank hangs from the channel, not from a journey (004, data-model.md).
  channelId: string | null
  kind: JobKind
  status: JobStatus
  progress: JobProgress
  failure: string | null
  startedAt: string
  finishedAt: string | null
}

export interface NewJob {
  journeyId: string | null
  channelId?: string | null
  kind: JobKind
  total?: number
  ideaIds?: string[]
  skipped?: number
}

interface Row {
  id: string
  journey_id: string | null
  channel_id: string | null
  kind: JobKind
  status: JobStatus
  progress: string
  failure: string | null
  started_at: string
  finished_at: string | null
}

const fromRow = (row: Row): Job => ({
  id: row.id,
  journeyId: row.journey_id,
  channelId: row.channel_id,
  kind: row.kind,
  status: row.status,
  progress: JSON.parse(row.progress) as JobProgress,
  failure: row.failure,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
})

export function createJobsRepo(db: DatabaseSync, now: () => Date = () => new Date()) {
  const selectOne = db.prepare('SELECT * FROM background_job WHERE id = ?')
  const selectRunning = db.prepare(
    "SELECT * FROM background_job WHERE journey_id = ? AND status = 'en_curso' ORDER BY started_at, rowid",
  )
  const selectByJourney = db.prepare('SELECT * FROM background_job WHERE journey_id = ? ORDER BY started_at, rowid')
  const insert = db.prepare(
    "INSERT INTO background_job (id, journey_id, channel_id, kind, status, progress, started_at) VALUES (?, ?, ?, ?, 'en_curso', ?, ?)",
  )
  const selectByChannel = db.prepare(
    'SELECT * FROM background_job WHERE channel_id = ? AND kind = ? ORDER BY started_at, rowid',
  )
  const updateProgress = db.prepare('UPDATE background_job SET progress = ? WHERE id = ?')
  const updateEnd = db.prepare('UPDATE background_job SET status = ?, failure = ?, finished_at = ? WHERE id = ?')
  const interrupt = db.prepare(
    "UPDATE background_job SET status = 'interrumpido', finished_at = ? WHERE status = 'en_curso'",
  )

  const get = (id: string): Job | null => {
    const row = selectOne.get(id) as Row | undefined
    return row ? fromRow(row) : null
  }

  return {
    get,

    listRunning(journeyId: string): Job[] {
      return (selectRunning.all(journeyId) as unknown as Row[]).map(fromRow)
    },

    listByChannel(channelId: string, kind: JobKind): Job[] {
      return (selectByChannel.all(channelId, kind) as unknown as Row[]).map(fromRow)
    },

    listByJourney(journeyId: string): Job[] {
      return (selectByJourney.all(journeyId) as unknown as Row[]).map(fromRow)
    },

    start(job: NewJob): Job {
      const id = randomUUID()
      insert.run(
        id,
        job.journeyId,
        job.channelId ?? null,
        job.kind,
        JSON.stringify({
          done: 0,
          total: job.total ?? 0,
          ...(job.ideaIds ? { ideaIds: job.ideaIds } : {}),
          ...(job.skipped !== undefined ? { skipped: job.skipped } : {}),
        }),
        now().toISOString(),
      )
      return get(id)!
    },

    progress(id: string, done: number, total?: number): Job | null {
      const current = get(id)
      if (!current) return null
      updateProgress.run(JSON.stringify({ ...current.progress, done, total: total ?? current.progress.total }), id)
      return get(id)
    },

    finish(id: string): Job | null {
      updateEnd.run('hecho', null, now().toISOString(), id)
      return get(id)
    },

    fail(id: string, failure: string): Job | null {
      updateEnd.run('fallido', failure, now().toISOString(), id)
      return get(id)
    },

    // On start-up nothing is running yet, so whatever says `en_curso` was cut short.
    interruptRunning(): number {
      return Number(interrupt.run(now().toISOString()).changes)
    },
  }
}

export type JobsRepo = ReturnType<typeof createJobsRepo>

import type { JobKind, Logger } from '@ytcreator/core'
import type { JobEvent } from '@ytcreator/core/api'
import type { Job, JobsRepo } from '../db/repos/jobs.ts'

export interface JobContext {
  readonly id: string
  progress(done: number, total?: number): void
  // One finished thing (a measure, a name check), for the screen that is watching.
  item(item: unknown): void
}

// The work ends by returning; a code in `failure` is an expected failure the screen can explain.
export type JobWork = (context: JobContext) => Promise<void | { failure: string }>

export const INTERRUPTED = 'interrumpido'

// Long work that outlives the request and the tab: its state lives in `background_job` (SC-006, R14). The events are
// only for whoever is watching now; on coming back, `GET /api/journeys/:id` brings what was done.
export function createJobsService({ jobs, logger }: { jobs: JobsRepo; logger: Logger }) {
  const listeners = new Map<string, Set<(event: JobEvent) => void>>()

  const emit = (id: string, event: JobEvent) => {
    for (const listener of listeners.get(id) ?? []) listener(event)
  }

  const end = (id: string, event: JobEvent) => {
    emit(id, event)
    listeners.delete(id)
  }

  async function run(id: string, work: JobWork) {
    const context: JobContext = {
      id,
      progress(done, total) {
        const job = jobs.progress(id, done, total)
        if (job) emit(id, { type: 'progress', done: job.progress.done, total: job.progress.total })
      },
      item: (item) => emit(id, { type: 'item', item }),
    }
    try {
      const outcome = await work(context)
      if (outcome?.failure) {
        jobs.fail(id, outcome.failure)
        end(id, { type: 'failed', failure: outcome.failure })
      } else {
        jobs.finish(id)
        end(id, { type: 'done' })
      }
    } catch (error) {
      logger.error('job.failed', { id, error })
      try {
        jobs.fail(id, 'interno')
      } catch {
        // The database closed under it (the app is shutting down): on the next start it reads as interrupted.
      }
      end(id, { type: 'failed', failure: 'interno' })
    }
  }

  return {
    get: (id: string): Job | null => jobs.get(id),

    start(job: { journeyId: string | null; kind: JobKind; total?: number }, work: JobWork): Job {
      const started = jobs.start(job)
      void run(started.id, work)
      return started
    },

    subscribe(id: string, listener: (event: JobEvent) => void): () => void {
      const set = listeners.get(id) ?? new Set()
      set.add(listener)
      listeners.set(id, set)
      return () => {
        set.delete(listener)
        if (set.size === 0 && listeners.get(id) === set) listeners.delete(id)
      }
    },

    // On start-up nothing is running yet: whatever says `en_curso` was cut short.
    interruptRunning: () => jobs.interruptRunning(),
  }
}

export type JobsService = ReturnType<typeof createJobsService>

// The last event of a job that is no longer running.
export function finalEvent(job: Job): JobEvent {
  if (job.status === 'hecho') return { type: 'done' }
  return { type: 'failed', failure: job.status === 'interrumpido' ? INTERRUPTED : (job.failure ?? 'interno') }
}

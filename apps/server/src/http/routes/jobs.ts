import type { JobEvent } from '@ytcreator/core/api'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { finalEvent, type JobsService } from '../../services/jobs.ts'
import { ApiError } from '../errors.ts'

const isEnd = (event: JobEvent) => event.type === 'done' || event.type === 'failed'

// Closing the connection only stops the watching: the job goes on (contracts/http-api.md).
export function jobsRoutes(jobs: JobsService) {
  const routes = new Hono()

  routes.get('/:id/events', (c) => {
    const id = c.req.param('id')
    if (!jobs.get(id)) throw new ApiError({ code: 'no_encontrado' })

    return streamSSE(c, async (stream) => {
      const write = (event: JobEvent) => stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      let pending: Promise<unknown> = Promise.resolve()
      let finish: () => void = () => {}
      const ended = new Promise<void>((resolve) => {
        finish = resolve
      })
      // In order, whatever pace the job and the connection go at.
      const push = (event: JobEvent) => {
        pending = pending.then(() => write(event)).catch(() => {})
        if (isEnd(event)) void pending.then(finish)
      }

      // Subscribed before reading the job, so nothing falls in between.
      const unsubscribe = jobs.subscribe(id, push)
      stream.onAbort(() => {
        unsubscribe()
        finish()
      })

      const job = jobs.get(id)!
      push({ type: 'progress', done: job.progress.done, total: job.progress.total })
      if (job.status !== 'en_curso') push(finalEvent(job))
      await ended
      unsubscribe()
    })
  })

  return routes
}

import { describe, expect, it } from 'vitest'
import { createJobsService } from '../../src/services/jobs.ts'
import { makeTestApp } from '../helpers.ts'

// A piece of work the test finishes by hand.
function controlled() {
  let finish: (value?: { failure: string }) => void = () => {}
  const done = new Promise<void | { failure: string }>((resolve) => {
    finish = resolve
  })
  return { done, finish: (value?: { failure: string }) => finish(value) }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function parseEvents(text: string) {
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      return { event, data: data ? (JSON.parse(data) as Record<string, unknown>) : null }
    })
}

describe('GET /api/jobs/:id/events', () => {
  it('a job waiting in the queue is not over: the stream stays open after its progress (007, R5)', async () => {
    const t = makeTestApp()
    const channel = t.channels.create({ origin: 'nuevo' })
    t.db
      .prepare(
        `INSERT INTO background_job (id, channel_id, kind, status, started_at) VALUES ('q', ?, 'reconocer_voz', 'en_cola', ?)`,
      )
      .run(channel.id, new Date().toISOString())
    const response = await t.request('GET', '/api/jobs/q/events')
    const reader = response.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(parseEvents(first).map((event) => event.event)).toEqual(['progress'])
    const next = await Promise.race([
      reader.read().then(() => 'otro'),
      new Promise((r) => setTimeout(() => r('nada'), 100)),
    ])
    expect(next).toBe('nada')
    await reader.cancel()
  })

  it('sends progress, item and done as they happen', async () => {
    const t = makeTestApp()
    const work = controlled()
    const job = t.jobs.start({ journeyId: null, kind: 'actualizar_lector', total: 2 }, async (context) => {
      context.progress(1)
      context.item({ id: 'm1' })
      await work.done
      context.progress(2)
    })

    const response = await t.request('GET', `/api/jobs/${job.id}/events`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reading = response.text()
    await tick()
    t.jobs.get(job.id)
    work.finish()

    const events = parseEvents(await reading)
    expect(events.at(0)?.event).toBe('progress')
    expect(events.at(-1)).toEqual({ event: 'done', data: { type: 'done' } })
    expect(events.at(-2)).toEqual({ event: 'progress', data: { type: 'progress', done: 2, total: 2 } })
    expect(t.jobs.get(job.id)?.status).toBe('hecho')
  })

  it('emits item events to whoever is watching', async () => {
    const t = makeTestApp()
    const work = controlled()
    const gate = controlled()
    const job = t.jobs.start({ journeyId: null, kind: 'actualizar_lector', total: 1 }, async (context) => {
      await gate.done
      context.item({ id: 'm1' })
      await work.done
    })
    const reading = (await t.request('GET', `/api/jobs/${job.id}/events`)).text()
    await tick()
    gate.finish()
    await tick()
    work.finish()
    const events = parseEvents(await reading)
    expect(events.map((e) => e.event)).toEqual(['progress', 'item', 'done'])
    expect(events[1]?.data).toEqual({ type: 'item', item: { id: 'm1' } })
  })

  it('a failure with its code is a failed event', async () => {
    const t = makeTestApp()
    const work = controlled()
    const job = t.jobs.start({ journeyId: null, kind: 'actualizar_lector' }, () => work.done)
    const reading = (await t.request('GET', `/api/jobs/${job.id}/events`)).text()
    await tick()
    work.finish({ failure: 'bloqueado' })
    expect(parseEvents(await reading).at(-1)).toEqual({
      event: 'failed',
      data: { type: 'failed', failure: 'bloqueado' },
    })
    expect(t.jobs.get(job.id)).toMatchObject({ status: 'fallido', failure: 'bloqueado' })
  })

  it('work that throws ends as failed, with no details for the screen', async () => {
    const t = makeTestApp()
    const job = t.jobs.start({ journeyId: null, kind: 'actualizar_lector' }, async () => {
      throw new Error('/Users/alguien/secreto')
    })
    await tick()
    const events = parseEvents(await (await t.request('GET', `/api/jobs/${job.id}/events`)).text())
    expect(events.at(-1)).toEqual({ event: 'failed', data: { type: 'failed', failure: 'interno' } })
  })

  it('a job already finished answers at once', async () => {
    const t = makeTestApp()
    const job = t.jobs.start({ journeyId: null, kind: 'actualizar_lector', total: 3 }, async (context) => {
      context.progress(3)
    })
    await tick()
    const events = parseEvents(await (await t.request('GET', `/api/jobs/${job.id}/events`)).text())
    expect(events.map((e) => e.event)).toEqual(['progress', 'done'])
    expect(events[0]?.data).toEqual({ type: 'progress', done: 3, total: 3 })
  })

  it('the job goes on after the connection closes', async () => {
    const t = makeTestApp()
    const work = controlled()
    const job = t.jobs.start({ journeyId: null, kind: 'actualizar_lector' }, () => work.done)
    const response = await t.request('GET', `/api/jobs/${job.id}/events`)
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()
    await tick()
    expect(t.jobs.get(job.id)?.status).toBe('en_curso')
    work.finish()
    await tick()
    expect(t.jobs.get(job.id)?.status).toBe('hecho')
  })

  it('after a restart, what was running reads as interrupted', async () => {
    const t = makeTestApp()
    const work = controlled()
    const job = t.jobs.start({ journeyId: null, kind: 'actualizar_lector' }, () => work.done)

    // The same database opened by a new server.
    const restarted = createJobsService({ jobs: t.jobsRepo, logger: t.logger })
    expect(restarted.interruptRunning()).toBe(1)
    expect(t.jobs.get(job.id)?.status).toBe('interrumpido')
    const events = parseEvents(await (await t.request('GET', `/api/jobs/${job.id}/events`)).text())
    expect(events.at(-1)).toEqual({ event: 'failed', data: { type: 'failed', failure: 'interrumpido' } })
    work.finish()
  })

  it('an unknown job is a 404', async () => {
    const t = makeTestApp()
    const response = await t.request('GET', '/api/jobs/no-existe/events')
    expect(response.status).toBe(404)
  })

  it('refuses another origin', async () => {
    const t = makeTestApp()
    const response = await t.app.request('/api/jobs/x/events', {
      headers: { host: 'evil.example', origin: 'http://evil.example' },
    })
    expect(response.status).toBe(403)
  })
})

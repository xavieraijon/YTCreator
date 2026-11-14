import { beforeEach, describe, expect, it } from 'vitest'
import { createJobsRepo, type JobsRepo } from '../../../src/db/repos/jobs.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

describe('jobs repo', () => {
  let jobs: JobsRepo
  let journeyId: string
  const clock = manualClock()

  beforeEach(() => {
    const db = freshDb()
    journeyId = seedJourney(db).journeyId
    jobs = createJobsRepo(db, clock.now)
  })

  it('starts a job in progress with its total', () => {
    const job = jobs.start({ journeyId, kind: 'medir_nichos', total: 4 })
    expect(job).toMatchObject({ status: 'en_curso', progress: { done: 0, total: 4 }, failure: null, finishedAt: null })
  })

  it('jobs without a journey are allowed (updating the reader)', () => {
    expect(jobs.start({ journeyId: null, kind: 'actualizar_lector' }).journeyId).toBeNull()
  })

  it('records progress, then finishes or fails', () => {
    const a = jobs.start({ journeyId, kind: 'medir_nichos', total: 2 })
    expect(jobs.progress(a.id, 1)?.progress).toEqual({ done: 1, total: 2 })
    expect(jobs.finish(a.id)).toMatchObject({ status: 'hecho', finishedAt: clock.now().toISOString() })
    const b = jobs.start({ journeyId, kind: 'leer_canal' })
    expect(jobs.fail(b.id, 'bloqueado')).toMatchObject({ status: 'fallido', failure: 'bloqueado' })
  })

  it('on start-up, jobs still in progress become interrupted', () => {
    const running = jobs.start({ journeyId, kind: 'comprobar_nombres', total: 3 })
    const done = jobs.finish(jobs.start({ journeyId, kind: 'ia' }).id)!
    expect(jobs.interruptRunning()).toBe(1)
    expect(jobs.get(running.id)).toMatchObject({ status: 'interrumpido', finishedAt: clock.now().toISOString() })
    expect(jobs.get(done.id)?.status).toBe('hecho')
  })

  it('on start-up, a job waiting in the queue becomes interrupted too (007, R5)', () => {
    const db = freshDb()
    const repo = createJobsRepo(db, clock.now)
    db.prepare(
      `INSERT INTO channel (id, origin, name_status, created_at, updated_at) VALUES ('c', 'nuevo', 'provisional', ?, ?)`,
    ).run(clock.now().toISOString(), clock.now().toISOString())
    db.prepare(
      `INSERT INTO background_job (id, channel_id, kind, status, started_at) VALUES ('q', 'c', 'reconocer_voz', 'en_cola', ?)`,
    ).run(clock.now().toISOString())
    expect(repo.interruptRunning()).toBe(1)
    expect(repo.get('q')).toMatchObject({ status: 'interrumpido', kind: 'reconocer_voz', channelId: 'c' })
  })

  it('lists the running jobs of a journey', () => {
    const running = jobs.start({ journeyId, kind: 'medir_nichos' })
    jobs.finish(jobs.start({ journeyId, kind: 'ia' }).id)
    expect(jobs.listRunning(journeyId).map((j) => j.id)).toEqual([running.id])
  })
})

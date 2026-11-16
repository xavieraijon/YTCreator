import { describe, expect, it, vi } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'

const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code

describe('the program that listens (GET/POST /speech/engine, PUT /speech/engine/model)', () => {
  it('says what is missing, downloads it as a job and then has it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const before = await call(t, 'GET', '/api/speech/engine')
    expect(before.status).toBe(200)
    expect(before.body).toMatchObject({ installed: false, model: 'large-v3-turbo-q5_0', job: null })
    expect(before.body['missingBytes']).toBeGreaterThan(0)
    expect(before.body['models']).toEqual([
      { id: 'large-v3-turbo-q5_0', sizeBytes: expect.any(Number), installed: false, recommended: true },
      { id: 'small-q5_1', sizeBytes: expect.any(Number), installed: false, recommended: false },
    ])

    const started = await call(t, 'POST', '/api/speech/engine', {})
    expect(started.status).toBe(202)
    const jobId = started.body['jobId'] as string
    expect(t.jobs.get(jobId)).toMatchObject({ kind: 'descargar_motor', journeyId: null })
    await vi.waitFor(() => expect(t.jobs.get(jobId)?.status).toBe('hecho'))

    const after = await call(t, 'GET', '/api/speech/engine')
    expect(after.body).toMatchObject({ installed: true, missingBytes: 0, job: { id: jobId, status: 'hecho' } })
    const job = after.body['job'] as { progress: { done: number; total: number } }
    expect(job.progress.done).toBe(job.progress.total)
    // With all of it there, nothing more to download.
    expect((await call(t, 'POST', '/api/speech/engine', {})).status).toBe(200)
    // The log says how it went, never where the files are.
    const logged = JSON.stringify(t.logger.lines)
    expect(logged).toContain('speech.engine_download')
    expect(logged).not.toContain(t.dir)
  })

  it('one download at a time: asking again gives the same job', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const first = await call(t, 'POST', '/api/speech/engine', {})
    const second = await call(t, 'POST', '/api/speech/engine', {})
    expect(second.body['jobId']).toBe(first.body['jobId'])
    await vi.waitFor(() => expect(t.jobs.get(first.body['jobId'] as string)?.status).toBe('hecho'))
  })

  it('a model of «Modo experto» is chosen only once it is downloaded', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const missing = await call(t, 'PUT', '/api/speech/engine/model', { model: 'small-q5_1' })
    expect(missing.status).toBe(409)
    expect(code(missing.body)).toBe('sin_modelo')

    const started = await call(t, 'POST', '/api/speech/engine', { model: 'small-q5_1' })
    await vi.waitFor(() => expect(t.jobs.get(started.body['jobId'] as string)?.status).toBe('hecho'))
    const chosen = await call(t, 'PUT', '/api/speech/engine/model', { model: 'small-q5_1' })
    expect(chosen.status).toBe(200)
    expect(chosen.body).toMatchObject({ model: 'small-q5_1', installed: true })
    expect(t.settings.get('speech.model')).toBe('small-q5_1')
  })

  it('an unknown model, or the one that only detects the voice, is not valid', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    for (const model of ['otro', 'silero-v6.2.0']) {
      expect((await call(t, 'POST', '/api/speech/engine', { model })).status).toBe(400)
      expect((await call(t, 'PUT', '/api/speech/engine/model', { model })).status).toBe(400)
    }
  })
})

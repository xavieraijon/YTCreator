import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LOCAL_HEADERS, makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, type TestApp } from './publish-flows.ts'

// Doing them again with another edit (US5, FR-017, R16): a new version from the new file, the corrections offered
// again, and the audio deleted from this machine on request.
const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code

/** A WAV PCM 16 kHz mono of so many seconds of silence. */
function wav(seconds: number) {
  const rate = 16_000
  const data = Math.round(seconds * rate) * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data, 40)
  return Buffer.concat([header, Buffer.alloc(data)])
}

const upload = (t: TestApp, scriptId: string, seconds: number, name: string) =>
  t.app.request(`/api/scripts/${scriptId}/subtitles/audio?name=${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { ...LOCAL_HEADERS, 'content-type': 'audio/wav' },
    body: wav(seconds),
  })

type View = Record<string, unknown> & {
  status: string
  latest: { version: number; origin: string; content: { cues: { id: string; text: string }[] } } | null
  audio: { available: boolean; seconds: number; sourceName: string | null } | null
  reapply: { corrections: number; count: number } | null
  newAudio: boolean
  job: { status: string; failure: string | null; finishedAt: string | null } | null
}
const view = async (t: TestApp, scriptId: string) =>
  (await call(t, 'GET', `/api/scripts/${scriptId}/subtitles`)).body as View

/** Listens to the file uploaded last and waits for the end: «hecho» or «fallido». */
async function listen(t: TestApp, scriptId: string) {
  const jobId = (await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})).body['jobId'] as string
  await vi.waitFor(() => expect(['hecho', 'fallido']).toContain(t.jobs.get(jobId)?.status), { timeout: 5_000 })
  return t.jobs.get(jobId)!
}

/** An approved script with subtitles from «primero.mp4» (12 s) and «hola» changed in all of them. */
async function withSubtitles(options: { failSecond?: boolean; silentSecond?: boolean } = {}) {
  let heard = 0
  const t = makeTestApp({
    fakeAi: 'ok',
    // The second time, if asked, the program fails: as a new file that cannot be heard.
    wrapRecognizer: (fake) => ({
      async recognize(request) {
        heard++
        if (options.failSecond && heard === 2) return { ok: false, failure: 'sin_memoria' }
        if (options.silentSecond && heard === 2) return { ok: true, words: [], seconds: 1 }
        return fake.recognize(request)
      },
    }),
  })
  const { scriptId } = await approvedScript(t)
  const started = await call(t, 'POST', '/api/speech/engine', {})
  await vi.waitFor(() => expect(t.jobs.get(started.body['jobId'] as string)?.status).toBe('hecho'))
  expect((await upload(t, scriptId, 12, 'primero.mp4')).status).toBe(200)
  expect((await listen(t, scriptId)).status).toBe('hecho')
  const first = await view(t, scriptId)
  const replaced = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/replace`, {
    baseVersion: first.latest!.version,
    from: 'Hola',
    to: 'Buenas',
  })
  expect(replaced.status).toBe(200)
  return { t, scriptId, corrected: replaced.body as View }
}

describe('another file (US5)', () => {
  it('makes a new version only when it is heard well; the ones before stay, and the corrections are offered', async () => {
    const { t, scriptId, corrected } = await withSubtitles()
    expect(corrected.reapply).toBeNull()
    // Uploaded but not heard yet: the subtitles, their audio and the offer are as they were.
    expect((await upload(t, scriptId, 20, 'segundo.mp4')).status).toBe(200)
    const waiting = await view(t, scriptId)
    expect(waiting.latest!.version).toBe(corrected.latest!.version)
    expect(waiting.audio).toMatchObject({ seconds: 12, sourceName: 'primero.mp4' })
    expect((await listen(t, scriptId)).status).toBe('hecho')
    const after = await view(t, scriptId)
    expect(after.latest).toMatchObject({ version: corrected.latest!.version + 1, origin: 'reconocimiento' })
    expect(after.audio).toMatchObject({ available: true, seconds: 20, sourceName: 'segundo.mp4' })
    expect(after.latest!.content.cues.some((cue) => cue.text.includes('Hola'))).toBe(true)
    expect(after.reapply).toEqual({ corrections: 1, count: expect.any(Number) })
    const versions = (await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/versions`)).body as unknown as {
      version: number
    }[]
    expect(versions.map((one) => one.version).sort()).toEqual([1, 2, 3])
  })

  it('a new file that cannot be heard leaves everything as it was, and says when it failed', async () => {
    const { t, scriptId, corrected } = await withSubtitles({ failSecond: true })
    await upload(t, scriptId, 20, 'segundo.mp4')
    const job = await listen(t, scriptId)
    expect(job).toMatchObject({ status: 'fallido', failure: 'sin_memoria' })
    const after = await view(t, scriptId)
    expect(after.latest!.version).toBe(corrected.latest!.version)
    expect(after.audio).toMatchObject({ seconds: 12, sourceName: 'primero.mp4' })
    expect(after.job).toMatchObject({ status: 'fallido', failure: 'sin_memoria', finishedAt: expect.any(String) })
    expect(after.reapply).toBeNull()
  })
})

describe('another file where nothing is heard (US5)', () => {
  it('does not take the place of the subtitles nor of their audio: it fails «sin_voz»', async () => {
    const { t, scriptId, corrected } = await withSubtitles({ silentSecond: true })
    await upload(t, scriptId, 20, 'segundo.mp4')
    expect(await listen(t, scriptId)).toMatchObject({ status: 'fallido', failure: 'sin_voz' })
    const after = await view(t, scriptId)
    expect(after.latest).toEqual(corrected.latest)
    expect(after.audio).toMatchObject({ available: true, seconds: 12, sourceName: 'primero.mp4' })
  })
})

describe('POST /scripts/:id/subtitles/reapply', () => {
  it('makes a version «reaplicada» with the corrections, says how many changed, and the offer goes', async () => {
    const { t, scriptId } = await withSubtitles()
    await upload(t, scriptId, 20, 'segundo.mp4')
    await listen(t, scriptId)
    const before = await view(t, scriptId)
    const done = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/reapply`, {
      baseVersion: before.latest!.version,
    })
    expect(done.status).toBe(200)
    const after = done.body as View & { count: number }
    expect(after.count).toBe(before.reapply!.count)
    expect(after.latest).toMatchObject({ version: before.latest!.version + 1, origin: 'reaplicada' })
    expect(after.latest!.content.cues.some((cue) => cue.text.includes('Hola'))).toBe(false)
    expect(after.latest!.content.cues.some((cue) => cue.text.includes('Buenas'))).toBe(true)
    expect(after.reapply).toBeNull()
    // The recognition before it stays in the history as it was heard.
    const heard = (await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/versions/${before.latest!.version}`))
      .body as { content: { cues: { text: string }[] } }
    expect(heard.content.cues.some((cue) => cue.text.includes('Hola'))).toBe(true)
  })

  it('the offer stays after another change until the changes are made again, and then it goes for good', async () => {
    const { t, scriptId } = await withSubtitles()
    await upload(t, scriptId, 20, 'segundo.mp4')
    await listen(t, scriptId)
    const heard = await view(t, scriptId)
    // A subtitle written by hand meanwhile: the offer is still there, over that new version.
    const cues = heard.latest!.content.cues.map((cue, index) => (index === 0 ? { ...cue, reviewed: true } : cue))
    const edited = (
      await call(t, 'PUT', `/api/scripts/${scriptId}/subtitles`, {
        baseVersion: heard.latest!.version,
        content: { cues },
      })
    ).body as View
    expect(edited.latest!.origin).toBe('edicion')
    expect(edited.reapply).toEqual(heard.reapply)
    const done = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/reapply`, {
      baseVersion: edited.latest!.version,
    })
    expect(done.status).toBe(200)
    // Made once: neither offered nor accepted again.
    expect((done.body as View).reapply).toBeNull()
    const twice = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/reapply`, {
      baseVersion: (done.body as View).latest!.version,
    })
    expect(twice.status).toBe(409)
    expect(code(twice.body)).toBe('conflicto')
  })

  it('from an old version is 409 «version_cambiada»; with nothing to change, 409 «conflicto»', async () => {
    const { t, scriptId, corrected } = await withSubtitles()
    const old = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/reapply`, { baseVersion: 1 })
    expect(old.status).toBe(409)
    expect(code(old.body)).toBe('version_cambiada')
    const nothing = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/reapply`, {
      baseVersion: corrected.latest!.version,
    })
    expect(nothing.status).toBe(409)
    expect(code(nothing.body)).toBe('conflicto')
  })
})

describe('DELETE /scripts/:id/subtitles/audio (R16)', () => {
  it('deletes the audio, also a new one not heard yet, and leaves the subtitles', async () => {
    const { t, scriptId, corrected } = await withSubtitles()
    expect(corrected.newAudio).toBe(false)
    await upload(t, scriptId, 20, 'segundo.mp4')
    expect((await view(t, scriptId)).newAudio).toBe(true)
    const deleted = await call(t, 'DELETE', `/api/scripts/${scriptId}/subtitles/audio`)
    expect(deleted.status).toBe(200)
    const after = deleted.body as View
    expect(after.latest).toEqual(corrected.latest)
    expect(after.audio).toMatchObject({ available: false, seconds: 12, sourceName: 'primero.mp4' })
    expect(after.newAudio).toBe(false)
    expect(
      readdirSync(join(t.dir, 'workspace', 'subtitulos', scriptId)).filter((name) => name.endsWith('.wav')),
    ).toEqual([])
    const audio = await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/audio`)
    expect(audio.status).toBe(404)
    expect(code(audio.body)).toBe('sin_audio')
    // Nothing left to hear: a recognition needs the file again.
    const again = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})
    expect(again.status).toBe(409)
    expect(code(again.body)).toBe('sin_audio')
  })

  it('while it listens, 409 «en_curso»', async () => {
    const { t, scriptId } = await withSubtitles()
    await upload(t, scriptId, 20, 'segundo.mp4')
    await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})
    const busy = await call(t, 'DELETE', `/api/scripts/${scriptId}/subtitles/audio`)
    expect(busy.status).toBe(409)
    expect(code(busy.body)).toBe('en_curso')
  })
})

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LOCAL_HEADERS, makeTestApp } from '../helpers.ts'

type TestApp = ReturnType<typeof makeTestApp>
import { call } from './flows.ts'
import { approvedScript, writtenScript } from './publish-flows.ts'

const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code

/** A WAV PCM 16 kHz mono of so many seconds (silence), or another kind of WAV. */
function wav(
  seconds: number,
  { rate = 16_000, channels = 1, declared }: { rate?: number; channels?: number; declared?: number } = {},
) {
  const data = Math.round(seconds * rate) * channels * 2
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * channels * 2, 28)
  header.writeUInt16LE(channels * 2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(declared ?? data, 40)
  return Buffer.concat([header, Buffer.alloc(data)])
}

const upload = (t: TestApp, scriptId: string, body: Buffer, name = 'Mi vídeo final.mp4') =>
  t.app.request(`/api/scripts/${scriptId}/subtitles/audio?name=${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { ...LOCAL_HEADERS, 'content-type': 'audio/wav' },
    body,
  })

async function installEngine(t: TestApp) {
  const started = await call(t, 'POST', '/api/speech/engine', {})
  await vi.waitFor(() => expect(t.jobs.get(started.body['jobId'] as string)?.status).toBe('hecho'))
}

const view = async (t: TestApp, scriptId: string) => (await call(t, 'GET', `/api/scripts/${scriptId}/subtitles`)).body
const recognize = (t: TestApp, scriptId: string) => call(t, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})
const settled = (t: TestApp, jobId: string) =>
  vi.waitFor(() => expect(['hecho', 'fallido']).toContain(t.jobs.get(jobId)?.status), { timeout: 5_000 })

describe('uploading the audio (PUT /scripts/:id/subtitles/audio)', () => {
  it('takes a WAV PCM 16 kHz mono and says how long it is and how long it will take', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const response = await upload(t, scriptId, wav(12))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { audioSeconds: number; estimateSeconds: number }
    expect(body.audioSeconds).toBeCloseTo(12, 3)
    expect(body.estimateSeconds).toBeGreaterThan(0)
    // Written whole in its folder, with nothing temporary left.
    const folder = join(t.dir, 'workspace', 'subtitulos', scriptId)
    expect(readdirSync(folder).filter((name) => name.includes('.tmp'))).toEqual([])
  })

  it('refuses another format, a stereo or 44,1 kHz WAV, or one that says it is over 3 hours', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    for (const body of [Buffer.from('no es audio'), wav(2, { channels: 2 }), wav(2, { rate: 44_100 })]) {
      const response = await upload(t, scriptId, body)
      expect(response.status).toBe(400)
      expect(code((await response.json()) as Record<string, unknown>)).toBe('audio_no_valido')
    }
    const long = await upload(t, scriptId, wav(1, { declared: 3 * 3600 * 32_000 + 64_000 }))
    expect(long.status).toBe(413)
    expect(code((await long.json()) as Record<string, unknown>)).toBe('audio_largo')
  })

  it('a full disk is 507 «sin_espacio»', async () => {
    const t = makeTestApp({ fakeAi: 'ok', freeBytes: () => 1000 })
    const { scriptId } = await approvedScript(t)
    const response = await upload(t, scriptId, wav(2))
    expect(response.status).toBe(507)
    expect(code((await response.json()) as Record<string, unknown>)).toBe('sin_espacio')
  })

  it('a script that is not approved is 409 «sin_aprobar»', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await writtenScript(t)
    const response = await upload(t, scriptId, wav(2))
    expect(response.status).toBe(409)
    expect(code((await response.json()) as Record<string, unknown>)).toBe('sin_aprobar')
  })
})

describe('recognizing (POST …/recognize, …/cancel)', () => {
  it('without the program it is 409 «sin_motor»; without an audio, 409 «sin_audio»', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const noAudio = await recognize(t, scriptId)
    expect(noAudio.status).toBe(409)
    expect(code(noAudio.body)).toBe('sin_audio')
    await upload(t, scriptId, wav(12))
    const noEngine = await recognize(t, scriptId)
    expect(noEngine.status).toBe(409)
    expect(code(noEngine.body)).toBe('sin_motor')
  })

  it('makes version 1 from what was heard, cut into subtitles and corrected with the script', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, draft } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(12))
    const started = await recognize(t, scriptId)
    expect(started.status).toBe(202)
    const jobId = started.body['jobId'] as string
    expect(t.jobs.get(jobId)).toMatchObject({ kind: 'reconocer_voz' })
    expect((await view(t, scriptId))['status']).toBe('en_marcha')
    await settled(t, jobId)
    expect(t.jobs.get(jobId)?.status).toBe('hecho')

    const after = await view(t, scriptId)
    expect(after).toMatchObject({
      status: 'borrador',
      latest: { version: 1, origin: 'reconocimiento', draftVersion: draft.version },
      audio: { available: true, sourceName: 'Mi vídeo final.mp4' },
      job: { id: jobId, op: 'reconocer', status: 'hecho' },
    })
    const content = (after['latest'] as { content: { cues: { text: string }[]; words: unknown[] } }).content
    expect(content.cues.length).toBeGreaterThan(0)
    expect(content.words.length).toBeGreaterThan(0)
    // The heard words (and so the subtitles) are all there, in order.
    expect(content.cues.map((cue) => cue.text.replace(/\n/g, ' ')).join(' ')).toContain('Hola')
    // The speed of this machine is measured for the next estimate (R7).
    expect(JSON.parse(t.settings.get('speech.speed')!)).toHaveProperty('large-v3-turbo-q5_0')
  })

  it('a second recognition waits «en_cola» and starts when the first ends', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const first = await approvedScript(t)
    const second = await approvedScript(t, 'Otro pan', { channelId: first.channelId })
    await installEngine(t)
    await upload(t, first.scriptId, wav(12))
    await upload(t, second.scriptId, wav(12))
    const one = (await recognize(t, first.scriptId)).body['jobId'] as string
    const two = (await recognize(t, second.scriptId)).body['jobId'] as string
    expect(t.jobs.get(two)?.status).toBe('en_cola')
    expect((await view(t, second.scriptId))['job']).toMatchObject({ status: 'en_cola', queuePosition: 1 })
    // The same script twice is refused while it runs.
    expect(code((await recognize(t, first.scriptId)).body)).toBe('en_curso')
    await settled(t, one)
    await settled(t, two)
    expect(t.jobs.get(two)?.status).toBe('hecho')
  })

  it('stopping leaves the job «fallido» with «cancelado» and makes no version', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(12))
    const jobId = (await recognize(t, scriptId)).body['jobId'] as string
    const stopped = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/cancel`)
    expect(stopped.status).toBe(200)
    await settled(t, jobId)
    expect(t.jobs.get(jobId)).toMatchObject({ status: 'fallido', failure: 'cancelado' })
    expect(await view(t, scriptId)).toMatchObject({ status: 'sin_hacer', latest: null })
  })

  it('«Parar» just as it ends keeps nothing: no version and the old audio stays (gate of US1)', async () => {
    // A recognizer that ends well whatever the signal says, as whisper-cli when its process had already left.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const t = makeTestApp({
      fakeAi: 'ok',
      wrapRecognizer: (fake) => ({
        async recognize(request) {
          const result = await fake.recognize({ ...request, signal: new AbortController().signal })
          await gate
          return result
        },
      }),
    })
    const { scriptId } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(12))
    const jobId = (await recognize(t, scriptId)).body['jobId'] as string
    await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/cancel`)
    release()
    await settled(t, jobId)
    expect(t.jobs.get(jobId)).toMatchObject({ status: 'fallido', failure: 'cancelado' })
    expect(await view(t, scriptId)).toMatchObject({ latest: null })
    const folder = join(t.dir, 'workspace', 'subtitulos', scriptId)
    expect(readdirSync(folder)).toContain('nuevo.wav')
    expect(readdirSync(folder)).not.toContain('audio.wav')
  })

  it('while an audio is arriving, neither another upload nor a recognition starts (gate of US1)', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(2))
    // A body that keeps the upload open until the test lets it go.
    let finish: () => void = () => {}
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(wav(3).subarray(0, 8192)))
        finish = () => {
          controller.enqueue(new Uint8Array(wav(3).subarray(8192)))
          controller.close()
        }
      },
    })
    const slow = t.app.request(`/api/scripts/${scriptId}/subtitles/audio?name=b.wav`, {
      method: 'PUT',
      headers: { ...LOCAL_HEADERS, 'content-type': 'audio/wav' },
      body,
      duplex: 'half',
    } as RequestInit)
    await vi.waitFor(() => {
      const folder = join(t.dir, 'workspace', 'subtitulos', scriptId)
      expect(readdirSync(folder).some((name) => name.endsWith('.tmp'))).toBe(true)
    })
    const during = await recognize(t, scriptId)
    expect(during.status).toBe(409)
    expect(code(during.body)).toBe('en_curso')
    const another = await upload(t, scriptId, wav(2))
    expect(another.status).toBe(409)
    finish()
    expect((await slow).status).toBe(200)
    expect((await recognize(t, scriptId)).status).toBe(202)
  })

  it('closing the app stops what is listening (rule 2)', async () => {
    let seen: AbortSignal | null = null
    const t = makeTestApp({
      fakeAi: 'ok',
      wrapRecognizer: (fake) => ({
        recognize(request) {
          seen = request.signal
          return fake.recognize(request)
        },
      }),
    })
    const { scriptId } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(12))
    await recognize(t, scriptId)
    await vi.waitFor(() => expect(seen).not.toBeNull())
    t.subtitlesRecognition.stop()
    expect(seen!.aborted).toBe(true)
  })

  it('stopping a queued one takes it out of the queue', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const first = await approvedScript(t)
    const second = await approvedScript(t, 'Otro pan', { channelId: first.channelId })
    await installEngine(t)
    await upload(t, first.scriptId, wav(12))
    await upload(t, second.scriptId, wav(12))
    const one = (await recognize(t, first.scriptId)).body['jobId'] as string
    const two = (await recognize(t, second.scriptId)).body['jobId'] as string
    await call(t, 'POST', `/api/scripts/${second.scriptId}/subtitles/cancel`)
    expect(t.jobs.get(two)).toMatchObject({ status: 'fallido', failure: 'cancelado' })
    await settled(t, one)
    expect(t.jobs.get(two)?.status).toBe('fallido')
  })

  it('a failure of the engine is kept on the job and makes no version', async () => {
    const t = makeTestApp({ fakeAi: 'ok', fakeSpeech: 'fallo-sin_memoria' })
    const { scriptId } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(12))
    const jobId = (await recognize(t, scriptId)).body['jobId'] as string
    await settled(t, jobId)
    expect(t.jobs.get(jobId)).toMatchObject({ status: 'fallido', failure: 'sin_memoria' })
    expect((await view(t, scriptId))['latest']).toBeNull()
  })

  it('a job the server did not finish reads «interrumpido» on start-up', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(12))
    const jobId = (await recognize(t, scriptId)).body['jobId'] as string
    t.jobsRepo.interruptRunning()
    expect(t.jobs.get(jobId)?.status).toBe('interrumpido')
  })

  it('never logs the heard text nor the path of the audio', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(12))
    const jobId = (await recognize(t, scriptId)).body['jobId'] as string
    await settled(t, jobId)
    const log = JSON.stringify(t.logger.lines)
    expect(log).toContain('subtitles.recognized')
    expect(log).not.toContain(t.dir)
    expect(log).not.toContain('audio.wav')
    expect(log).not.toContain('bienvenidos')
    expect(log).not.toContain('Mi vídeo final')
  })
})

describe('listening and downloading', () => {
  async function recognized() {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, ideaId } = await approvedScript(t)
    await installEngine(t)
    await upload(t, scriptId, wav(12))
    await settled(t, (await recognize(t, scriptId)).body['jobId'] as string)
    return { t, scriptId, ideaId }
  }

  it('GET …/audio serves the WAV, and a Range gives 206 with that part', async () => {
    const { t, scriptId } = await recognized()
    const whole = await t.app.request(`/api/scripts/${scriptId}/subtitles/audio`, { headers: LOCAL_HEADERS })
    expect(whole.status).toBe(200)
    expect(whole.headers.get('content-type')).toBe('audio/wav')
    expect(whole.headers.get('accept-ranges')).toBe('bytes')
    const size = Buffer.from(await whole.arrayBuffer()).length
    expect(size).toBe(wav(12).length)
    const part = await t.app.request(`/api/scripts/${scriptId}/subtitles/audio`, {
      headers: { ...LOCAL_HEADERS, range: 'bytes=100-199' },
    })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe(`bytes 100-199/${size}`)
    expect(Buffer.from(await part.arrayBuffer()).length).toBe(100)
    const open = await t.app.request(`/api/scripts/${scriptId}/subtitles/audio`, {
      headers: { ...LOCAL_HEADERS, range: `bytes=${size - 10}-` },
    })
    expect(open.headers.get('content-range')).toBe(`bytes ${size - 10}-${size - 1}/${size}`)
    const outside = await t.app.request(`/api/scripts/${scriptId}/subtitles/audio`, {
      headers: { ...LOCAL_HEADERS, range: `bytes=${size + 5}-` },
    })
    expect(outside.status).toBe(416)
  })

  it('without the audio, GET …/audio is 404 «sin_audio»', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const response = await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/audio`)
    expect(response.status).toBe(404)
    expect(code(response.body)).toBe('sin_audio')
  })

  it('GET …/export?format=srt gives the file named after the video', async () => {
    const { t, scriptId } = await recognized()
    const response = await t.app.request(`/api/scripts/${scriptId}/subtitles/export?format=srt`, {
      headers: LOCAL_HEADERS,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/x-subrip; charset=utf-8')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="subtitulos-pan-sin-amasar.srt"')
    const text = await response.text()
    expect(text).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/)
    const vtt = await t.app.request(`/api/scripts/${scriptId}/subtitles/export?format=vtt`, { headers: LOCAL_HEADERS })
    expect(await vtt.text()).toMatch(/^WEBVTT\n/)
    expect((await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/export?format=doc`)).status).toBe(400)
  })

  it('without subtitles, there is nothing to export', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    expect((await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/export?format=srt`)).status).toBe(404)
  })

  it('the script says the state of its subtitles', async () => {
    const { t, scriptId } = await recognized()
    const script = await call(t, 'GET', `/api/scripts/${scriptId}`)
    expect(script.body['subtitles']).toEqual({ status: 'borrador' })
  })
})

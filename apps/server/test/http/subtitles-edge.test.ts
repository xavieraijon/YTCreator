import type { HeardWord } from '@ytcreator/core'
import { describe, expect, it, vi } from 'vitest'
import { LOCAL_HEADERS, makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, type TestApp } from './publish-flows.ts'

// The edge cases of the spec that no user story covers on its own (T071, spec.md «Casos límite»). The others are tested
// where they belong: the script reopened (subtitles-base), a broken engine and stopping (subtitles-recognize), a Short
// longer than a Short (subtitles-short), another file with nothing heard (subtitles-again), two tabs
// (`version_cambiada` in subtitles-edit and subtitles-chapters) and another channel (subtitles-base).

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

const upload = (t: TestApp, scriptId: string, body: Buffer) =>
  t.app.request(`/api/scripts/${scriptId}/subtitles/audio?name=final.mp4`, {
    method: 'PUT',
    headers: { ...LOCAL_HEADERS, 'content-type': 'audio/wav' },
    body,
  })

type View = Record<string, unknown> & {
  status: string
  heardLittle: boolean
  toReview: number
  latest: { version: number; content: { cues: { id: string; flags: string[] }[] } } | null
}
const view = async (t: TestApp, scriptId: string) =>
  (await call(t, 'GET', `/api/scripts/${scriptId}/subtitles`)).body as View

/** Words said one after another, each `gap` seconds from the last, heard with that certainty. */
const said = (texts: string[], p: number, gap = 0.4): HeardWord[] =>
  texts.map((text, i) => ({ text, start: i * gap, end: i * gap + gap * 0.8, p }))

/** An approved script, its engine installed, and an audio of so many seconds where the recognizer hears `words`. */
async function heard(seconds: number, words?: HeardWord[]) {
  const t = makeTestApp({
    fakeAi: 'ok',
    ...(words ? { wrapRecognizer: () => ({ recognize: async () => ({ ok: true as const, words, seconds: 1 }) }) } : {}),
  })
  const { scriptId, channelId } = await approvedScript(t)
  const engine = await call(t, 'POST', '/api/speech/engine', {})
  await vi.waitFor(() => expect(t.jobs.get(engine.body['jobId'] as string)?.status).toBe('hecho'))
  expect((await upload(t, scriptId, wav(seconds))).status).toBe(200)
  const jobId = (await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})).body['jobId'] as string
  await vi.waitFor(() => expect(['hecho', 'fallido']).toContain(t.jobs.get(jobId)?.status), { timeout: 5_000 })
  return { t, scriptId, channelId, job: t.jobs.get(jobId)! }
}

const SPANISH = 'hola a todos hoy os enseño a hacer pan en casa con harina agua sal y levadura'.split(' ')

describe('a file without audio', () => {
  it('a WAV with no sound in it is refused before listening, never a 500', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    const empty = await upload(t, scriptId, wav(0))
    expect(empty.status).toBeGreaterThanOrEqual(400)
    expect(empty.status).toBeLessThan(500)
    expect(((await empty.json()) as { error: { code: string } }).error.code).toBe('audio_no_valido')
    expect((await view(t, scriptId)).status).toBe('sin_hacer')
  })
})

describe('another language or nearly no voice (spec, «Casos límite»)', () => {
  it('heard with little certainty: every subtitle is marked to be looked at, and the view says it understood little', async () => {
    const { t, scriptId, job } = await heard(8, said(SPANISH, 0.2))
    expect(job.status).toBe('hecho')
    const after = await view(t, scriptId)
    const cues = after.latest!.content.cues
    expect(cues.length).toBeGreaterThan(0)
    for (const cue of cues) expect(cue.flags).toContain('poca_seguridad')
    expect(after.toReview).toBe(cues.length)
    expect(after.heardLittle).toBe(true)
  })

  it('a few words in a long audio (music, nearly no voice): the same', async () => {
    const { t, scriptId } = await heard(120, said(SPANISH.slice(0, 6), 0.9))
    const after = await view(t, scriptId)
    expect(after.heardLittle).toBe(true)
    for (const cue of after.latest!.content.cues) expect(cue.flags).toContain('poca_seguridad')
  })

  it('a voice heard well is not marked as a whole', async () => {
    const { t, scriptId } = await heard(8, said(SPANISH, 0.95))
    const after = await view(t, scriptId)
    expect(after.heardLittle).toBe(false)
    for (const cue of after.latest!.content.cues) expect(cue.flags).not.toContain('poca_seguridad')
  })

  it('marking them reviewed one by one leaves nothing to review, and the warning stays to explain why they were', async () => {
    const { t, scriptId } = await heard(8, said(SPANISH, 0.2))
    const before = await view(t, scriptId)
    const cues = before.latest!.content.cues.map((cue) => ({ ...cue, reviewed: true }))
    const saved = await call(t, 'PUT', `/api/scripts/${scriptId}/subtitles`, {
      baseVersion: before.latest!.version,
      content: { cues },
    })
    expect(saved.status).toBe(200)
    const after = await view(t, scriptId)
    expect(after.toReview).toBe(0)
    expect(after.heardLittle).toBe(true)
  })
})

describe('a long video without a publishing package', () => {
  it('the subtitles are made, approved and downloaded all the same; only the chapters are not there', async () => {
    const { t, scriptId } = await heard(12)
    const before = await view(t, scriptId)
    const approved = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/approve`, {
      version: before.latest!.version,
    })
    expect(approved.status).toBe(200)
    expect((await view(t, scriptId)).status).toBe('aprobados')
    const srt = await t.app.request(`/api/scripts/${scriptId}/subtitles/export?format=srt`, { headers: LOCAL_HEADERS })
    expect(srt.status).toBe(200)
    expect(await srt.text()).toContain('-->')
    expect((await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/chapters`)).status).toBe(404)
  })
})

describe('GET /channels/:id/subtitles/export (R17, FR-020)', () => {
  const exported = async (t: TestApp, channelId: string) => {
    const response = await t.app.request(`/api/channels/${channelId}/subtitles/export`, { headers: LOCAL_HEADERS })
    return { response, body: response.status === 200 ? ((await response.json()) as Record<string, unknown>) : null }
  }
  type Exported = {
    channel: { id: string }
    subtitles: {
      scriptId: string
      idea: string
      format: string
      approvedVersion: number | null
      srt: string
      versions: { version: number; origin: string; cues: { text: string }[] }[]
    }[]
  }

  it('every version of the subtitles of each script, oldest first, with the SRT of the last one; never the audio', async () => {
    const { t, scriptId, channelId } = await heard(12)
    const first = await view(t, scriptId)
    const cues = first.latest!.content.cues.map((cue, i) => (i === 0 ? { ...cue, text: 'Hola, panaderos.' } : cue))
    expect(
      (await call(t, 'PUT', `/api/scripts/${scriptId}/subtitles`, { baseVersion: 1, content: { cues } })).status,
    ).toBe(200)

    const { response, body } = await exported(t, channelId)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="subtitulos-[a-z0-9-]+\.json"/)
    const data = body as unknown as Exported
    expect(data.channel.id).toBe(channelId)
    expect(data.subtitles).toHaveLength(1)
    const [one] = data.subtitles
    expect(one).toMatchObject({ scriptId, idea: 'Pan sin amasar', format: 'largo', approvedVersion: null })
    expect(one!.versions.map((version) => [version.version, version.origin])).toEqual([
      [1, 'reconocimiento'],
      [2, 'edicion'],
    ])
    expect(one!.srt).toMatch(/^1\n00:00:\d\d,\d{3} --> /)
    expect(one!.srt).toContain('Hola, panaderos.')
    // Neither the audio nor where it is, nor the words heard (they are the audio written down).
    const text = JSON.stringify(body)
    expect(text).not.toContain('audio.wav')
    expect(text).not.toContain('"words"')
    expect(text).not.toContain('final.mp4')
  })

  it('only the scripts of that channel that have subtitles; a channel that does not exist is a 404', async () => {
    const { t, channelId } = await heard(12)
    // Another script of the same channel, without subtitles yet.
    const idea = t.ideas.ideas.create({
      channelId,
      origin: 'creador',
      title: 'Masa madre',
      format: 'largo',
      profileVersion: 1,
    })
    t.scripts.create({ channelId, ideaId: idea.id, format: 'largo', targetSeconds: 600 })
    const second = t.channels.create({ origin: 'nuevo' })
    expect(((await exported(t, channelId)).body as unknown as Exported).subtitles).toHaveLength(1)
    expect(((await exported(t, second.id)).body as unknown as Exported).subtitles).toEqual([])
    expect((await exported(t, 'no-existe')).response.status).toBe(404)
  })
})

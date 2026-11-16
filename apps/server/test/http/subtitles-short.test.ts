import { describe, expect, it, vi } from 'vitest'
import { LOCAL_HEADERS, makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, approvedShort, openPackage, type TestApp } from './publish-flows.ts'

// The subtitles of a Short (US4): its own limits, no chapters, and a warning for a file longer than a Short.
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

const upload = async (t: TestApp, scriptId: string, body: Buffer) => {
  const response = await t.app.request(`/api/scripts/${scriptId}/subtitles/audio?name=short.mp4`, {
    method: 'PUT',
    headers: { ...LOCAL_HEADERS, 'content-type': 'audio/wav' },
    body,
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe('the subtitles of a Short (US4)', () => {
  it('a file longer than a Short is said before starting, with the maximum of 005 and its source, not refused', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedShort(t)
    const long = await upload(t, scriptId, wav(200))
    expect(long.status).toBe(200)
    expect(long.body['overShort']).toEqual({ limitSeconds: 180, reviewedAt: expect.any(String) })
    const fits = await upload(t, scriptId, wav(30))
    expect(fits.body['overShort']).toBeNull()
    // In whole seconds, as shown: 3:00 and a few tenths is not warned; 3:01 is.
    expect((await upload(t, scriptId, wav(180.4))).body['overShort']).toBeNull()
    expect((await upload(t, scriptId, wav(180.6))).body['overShort']).not.toBeNull()
  })

  it('a long video never gets that warning', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    expect((await upload(t, scriptId, wav(200))).body['overShort']).toBeNull()
  })

  it('the track takes the format of the script: one line of the Short, and every cue within it', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedShort(t)
    const started = await call(t, 'POST', '/api/speech/engine', {})
    await vi.waitFor(() => expect(t.jobs.get(started.body['jobId'] as string)?.status).toBe('hecho'))
    await upload(t, scriptId, wav(30))
    const job = await call(t, 'POST', `/api/scripts/${scriptId}/subtitles/recognize`, {})
    await vi.waitFor(() => expect(t.jobs.get(job.body['jobId'] as string)?.status).toBe('hecho'), { timeout: 5_000 })
    const view = (await call(t, 'GET', `/api/scripts/${scriptId}/subtitles`)).body
    const limits = view['limits'] as Record<string, { value: number }>
    expect(view['format']).toBe('short')
    expect(limits['maxLines']!.value).toBe(1)
    const cues = (view['latest'] as { content: { cues: { text: string }[] } }).content.cues
    expect(cues.length).toBeGreaterThan(0)
    for (const cue of cues) {
      expect(cue.text).not.toContain('\n')
      expect(cue.text.length).toBeLessThanOrEqual(limits['maxCharsPerLine']!.value)
    }
  })

  it('a Short has no chapters: 404 even with its package', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedShort(t)
    await openPackage(t, scriptId)
    const chapters = await call(t, 'GET', `/api/scripts/${scriptId}/subtitles/chapters`)
    expect(chapters.status).toBe(404)
    expect(code(chapters.body)).toBe('no_encontrado')
  })
})

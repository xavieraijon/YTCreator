import { SUBTITLE_EXPORT_FORMATS } from '@ytcreator/core/api'
import { SUBTITLE_FORMATS } from '@ytcreator/knowledge'
import { describe, expect, it } from 'vitest'
import { makeTestApp } from '../helpers.ts'
import { call } from './flows.ts'
import { approvedScript, writtenScript } from './publish-flows.ts'

const code = (body: Record<string, unknown>) => (body['error'] as { code: string }).code
const read = (t: ReturnType<typeof makeTestApp>, scriptId: string) =>
  call(t, 'GET', `/api/scripts/${scriptId}/subtitles`)

describe('the base of the subtitles (contracts/http-api.md)', () => {
  it('an approved script with no subtitles yet says «sin_hacer», with the reading limits and their source', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, ideaId, channelId, draft } = await approvedScript(t)
    const view = await read(t, scriptId)
    expect(view.status).toBe(200)
    expect(view.body).toMatchObject({
      scriptId,
      channelId,
      format: 'largo',
      idea: { id: ideaId, title: 'Pan sin amasar' },
      script: { status: 'guion_aprobado', approvedDraftVersion: draft.version },
      status: 'sin_hacer',
      updatedAt: null,
      latest: null,
      marks: {},
      toReview: 0,
      audio: null,
      approvedVersion: null,
      approvedAt: null,
      scriptChanged: false,
      replacements: [],
      job: null,
      aiProposal: null,
      limits: {
        maxLines: {
          value: 2,
          assumption: false,
          source: { label: expect.stringContaining('español'), date: '2026-11-14' },
        },
        maxCharsPerLine: { value: 42, assumption: false, source: { label: expect.stringContaining('español') } },
        maxCharsPerSecond: { value: 17, assumption: false, source: { label: expect.stringContaining('español') } },
        // The guide for Spanish does not give these: each one cites the page that does (decision 10).
        minSeconds: { value: 0.833, source: { label: expect.stringContaining('requisitos generales') } },
        maxSeconds: { value: 7, source: { label: expect.stringContaining('requisitos generales') } },
        minGapSeconds: { value: 0.083, source: { label: expect.stringContaining('pautas de tiempos') } },
      },
    })
    // Reading it makes nothing.
    expect(t.subtitleTracks.getByScript(scriptId)).toBeNull()
  })

  it('a script that does not exist is a 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const view = await read(t, 'no-existe')
    expect(view.status).toBe(404)
    expect(code(view.body)).toBe('no_encontrado')
  })

  it('a script answers with its own channel, never with another one', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, channelId } = await approvedScript(t)
    const second = t.channels.create({ origin: 'nuevo' })
    const idea = t.ideas.ideas.create({
      channelId: second.id,
      origin: 'creador',
      title: 'La idea del otro canal',
      format: 'largo',
      profileVersion: 1,
    })
    const theirs = t.scripts.create({ channelId: second.id, ideaId: idea.id, format: 'largo', targetSeconds: 600 })
    expect((await read(t, scriptId)).body).toMatchObject({ channelId, idea: { title: 'Pan sin amasar' } })
    expect((await read(t, theirs.id)).body).toMatchObject({
      channelId: second.id,
      idea: { title: 'La idea del otro canal' },
    })
  })

  it('a script whose channel is gone is a 404', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await approvedScript(t)
    t.db.exec('PRAGMA foreign_keys = OFF')
    t.db.prepare(`UPDATE script SET channel_id = 'otro-canal' WHERE id = ?`).run(scriptId)
    t.db.exec('PRAGMA foreign_keys = ON')
    const view = await read(t, scriptId)
    expect(view.status).toBe(404)
    expect(code(view.body)).toBe('no_encontrado')
  })

  it('a script not approved yet: the view says so', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId } = await writtenScript(t)
    const view = await read(t, scriptId)
    expect(view.status).toBe(200)
    expect(view.body).toMatchObject({ status: 'sin_hacer', script: { approvedDraftVersion: null } })
    expect((view.body['script'] as { status: string }).status).not.toBe('guion_aprobado')
  })

  it('a Short has its own reading limits, marked as assumptions', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { channelId } = await approvedScript(t)
    const idea = t.ideas.ideas.create({
      channelId,
      origin: 'creador',
      title: 'Pan en un minuto',
      format: 'short',
      profileVersion: 1,
    })
    const short = t.scripts.create({ channelId, ideaId: idea.id, format: 'short', targetSeconds: 60 })
    const view = await read(t, short.id)
    expect(view.body).toMatchObject({ format: 'short', status: 'sin_hacer' })
    expect(view.body['limits']).toMatchObject({
      maxLines: { value: 1, assumption: true, source: null },
      maxCharsPerLine: { value: 32, assumption: true, source: null },
      maxCharsPerSecond: { value: 17, assumption: false },
    })
  })

  it('with a version: a draft, what is left to review, and whether the script changed since', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, channelId, draft } = await approvedScript(t)
    const track = t.subtitleTracks.create({ channelId, scriptId, format: 'largo' })
    t.subtitleTracks.setAudio(track.id, { file: 'audio.wav', seconds: 10, sourceName: 'final.mp4' })
    const cue = (id: string, start: number, flags: string[], reviewed = false) => ({
      id,
      start,
      end: start + 1.5,
      text: 'Hola',
      flags,
      heard: flags.includes('del_guion') ? 'ola' : null,
      reviewed,
    })
    t.subtitleVersions.add({
      trackId: track.id,
      origin: 'reconocimiento',
      draftVersion: draft.version,
      content: {
        cues: [
          cue('a', 0, []),
          cue('b', 2, ['poca_seguridad']),
          cue('c', 4, ['del_guion']),
          cue('d', 6, ['poca_seguridad'], true),
          // Too short on screen: marked though nothing was kept with it (R10).
          { ...cue('e', 8, []), end: 8.4 },
        ],
        words: [],
        audioSeconds: 10,
      } as never,
    })
    const view = await read(t, scriptId)
    expect(view.body).toMatchObject({
      status: 'borrador',
      latest: { version: 1, origin: 'reconocimiento', draftVersion: draft.version },
      marks: { e: ['fuera_de_limites'] },
      toReview: 3,
      audio: { available: true, seconds: 10, sourceName: 'final.mp4' },
      scriptChanged: false,
    })

    t.subtitleVersions.add({
      trackId: track.id,
      origin: 'edicion',
      draftVersion: draft.version + 1,
      content: { cues: [], words: [], audioSeconds: 10 },
    })
    expect((await read(t, scriptId)).body).toMatchObject({ latest: { version: 2 }, scriptChanged: true })
  })

  it('only the recognition makes them «en marcha»: the AI reviewing approved subtitles leaves them approved', async () => {
    const t = makeTestApp({ fakeAi: 'ok' })
    const { scriptId, channelId } = await approvedScript(t)
    const track = t.subtitleTracks.create({ channelId, scriptId, format: 'largo' })
    t.subtitleVersions.add({ trackId: track.id, origin: 'edicion', content: { cues: [], words: [], audioSeconds: 10 } })
    t.subtitleTracks.approve(track.id, 1)
    const job = t.jobsRepo.start({ journeyId: null, channelId, kind: 'ia' })
    t.subtitleTracks.setJob(track.id, job.id, 'revision_ia')
    expect((await read(t, scriptId)).body).toMatchObject({
      status: 'aprobados',
      job: { op: 'revision_ia', status: 'en_curso' },
    })
    const listening = t.jobsRepo.start({ journeyId: null, channelId, kind: 'reconocer_voz' })
    t.subtitleTracks.setJob(track.id, listening.id, 'reconocer')
    expect((await read(t, scriptId)).body).toMatchObject({ status: 'en_marcha' })
  })

  it('the formats of the API are the ones the knowledge package lists (no list kept by hand twice)', () => {
    expect([...SUBTITLE_EXPORT_FORMATS]).toEqual([...SUBTITLE_FORMATS])
  })
})

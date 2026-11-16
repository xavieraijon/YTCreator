import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { SpeechRecognizer } from '@ytcreator/core'
import {
  chaptersFromAudioBodySchema,
  type SubtitleExportFormat,
  speechEngineModelBodySchema,
  speechEngineStartBodySchema,
  subtitlesAiProposalBodySchema,
  subtitlesApproveBodySchema,
  subtitlesEstimateBodySchema,
  subtitlesExportQuerySchema,
  subtitlesGenerateBodySchema,
  subtitlesReplaceBodySchema,
  subtitlesReapplyBodySchema,
  subtitlesRestoreBodySchema,
  subtitlesSaveBodySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { SpeechEngineService } from '../../services/speech-engine.ts'
import type { SubtitlesChapters } from '../../services/subtitles-chapters.ts'
import type { SubtitlesEdit } from '../../services/subtitles-edit.ts'
import type { SubtitlesRecognition } from '../../services/subtitles-recognize.ts'
import type { SubtitlesService } from '../../services/subtitles.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export interface SubtitleRoutesDeps {
  service: SubtitlesService
  /** The real engine or, in a build that allows it, the fake one (`YTCREATOR_FAKE_SPEECH`). */
  recognizer: SpeechRecognizer
  /** The program that listens and its models, downloaded the first time (R1, R2). */
  engine: SpeechEngineService
  recognition: SubtitlesRecognition
  /** What the creator changes, the history and the AI's review (US2). */
  edit: SubtitlesEdit
  /** The real minutes of the chapters (US3). */
  chapters: SubtitlesChapters
}

const MIME: Record<SubtitleExportFormat, string> = {
  srt: 'application/x-subrip; charset=utf-8',
  vtt: 'text/vtt; charset=utf-8',
  sbv: 'text/plain; charset=utf-8',
}

/** `bytes=a-b`, `bytes=a-` or `bytes=-n` of a file of `size` bytes; null when it asks for none of it. */
function rangeOf(header: string, size: number): { start: number; end: number } | null | 'whole' {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return 'whole'
  if (match[1] === '') {
    const last = Math.min(Number(match[2]), size)
    return last > 0 ? { start: size - last, end: size - 1 } : null
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return start < size && start <= end ? { start, end } : null
}

// The subtitles of a script (specs/007-subtitles/contracts/http-api.md). The rest of the routes come with each story.
export function subtitleRoutes({ service, engine, recognition, edit, chapters }: SubtitleRoutesDeps) {
  const routes = new Hono()

  routes.get('/speech/engine', (c) => c.json(engine.view()))
  routes.post('/speech/engine', async (c) => {
    const { model } = await parseBody(c, speechEngineStartBodySchema)
    const job = engine.start(model)
    return job ? c.json({ jobId: job.id }, 202) : c.json(engine.view(), 200)
  })
  routes.put('/speech/engine/model', async (c) => {
    const { model } = await parseBody(c, speechEngineModelBodySchema)
    return c.json(engine.choose(model))
  })

  routes.get('/scripts/:id/subtitles', (c) => c.json(service.view(c.req.param('id'))))

  // The audio as the body, written by parts (R4); the name of the chosen file comes in `?name=`.
  routes.put('/scripts/:id/subtitles/audio', async (c) => {
    const length = c.req.header('content-length')
    const result = await recognition.upload(
      c.req.param('id'),
      c.req.raw.body,
      length && /^\d+$/.test(length) ? Number(length) : null,
      c.req.query('name') ?? '',
    )
    return c.json(result)
  })

  routes.post('/scripts/:id/subtitles/recognize', (c) => {
    const job = recognition.recognize(c.req.param('id'))
    return c.json({ jobId: job.id }, 202)
  })

  routes.post('/scripts/:id/subtitles/cancel', (c) => {
    recognition.cancel(c.req.param('id'))
    return c.json(service.view(c.req.param('id')))
  })

  // To listen to each subtitle (R15): the whole WAV, or the part a Range asks for.
  routes.get('/scripts/:id/subtitles/audio', async (c) => {
    service.view(c.req.param('id'))
    const audio = await recognition.audioFile(c.req.param('id'))
    if (!audio) throw new ApiError({ code: 'sin_audio' }, { status: 404 })
    const headers: Record<string, string> = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes' }
    const asked = c.req.header('range')
    const range = asked ? rangeOf(asked, audio.size) : 'whole'
    if (range === null) return c.body(null, 416, { ...headers, 'Content-Range': `bytes */${audio.size}` })
    const part = range === 'whole' ? { start: 0, end: audio.size - 1 } : range
    const stream = Readable.toWeb(createReadStream(audio.path, { start: part.start, end: part.end })) as ReadableStream
    return c.body(stream, range === 'whole' ? 200 : 206, {
      ...headers,
      'Content-Length': String(part.end - part.start + 1),
      ...(range === 'whole' ? {} : { 'Content-Range': `bytes ${part.start}-${part.end}/${audio.size}` }),
    })
  })

  // R16: the audio goes from this machine; the subtitles stay as they are.
  routes.delete('/scripts/:id/subtitles/audio', (c) => {
    recognition.forgetAudio(c.req.param('id'))
    return c.json(service.view(c.req.param('id')))
  })

  routes.post('/scripts/:id/subtitles/reapply', async (c) => {
    const { baseVersion } = await parseBody(c, subtitlesReapplyBodySchema)
    return c.json(edit.reapply(c.req.param('id'), baseVersion))
  })

  routes.put('/scripts/:id/subtitles', async (c) => {
    const { baseVersion, content } = await parseBody(c, subtitlesSaveBodySchema)
    return c.json(edit.save(c.req.param('id'), baseVersion, content))
  })

  routes.post('/scripts/:id/subtitles/replace', async (c) => {
    const body = await parseBody(c, subtitlesReplaceBodySchema)
    return c.json(edit.replace(c.req.param('id'), body))
  })

  routes.post('/scripts/:id/subtitles/restore', async (c) => {
    const { baseVersion, version } = await parseBody(c, subtitlesRestoreBodySchema)
    return c.json(edit.restore(c.req.param('id'), baseVersion, version))
  })

  routes.post('/scripts/:id/subtitles/approve', async (c) => {
    const { version } = await parseBody(c, subtitlesApproveBodySchema)
    return c.json(edit.approve(c.req.param('id'), version))
  })

  // The real minutes of the chapters (R13): worked out when asked for; the accepted ones go into the package of 006.
  routes.get('/scripts/:id/subtitles/chapters', (c) => c.json(chapters.proposal(c.req.param('id'))))

  routes.post('/packages/:id/chapters/from-audio', async (c) => {
    const body = await parseBody(c, chaptersFromAudioBodySchema)
    return c.json(chapters.accept(c.req.param('id'), body))
  })

  routes.get('/scripts/:id/subtitles/versions', (c) => c.json(edit.listVersions(c.req.param('id'))))

  routes.get('/scripts/:id/subtitles/versions/:n', (c) => {
    const n = c.req.param('n')
    if (!/^[1-9]\d{0,8}$/.test(n)) throw new ApiError({ code: 'no_encontrado' })
    return c.json(edit.readVersion(c.req.param('id'), Number(n)))
  })

  // The AI's review (R11): the cost of every batch first, then a proposal the creator accepts cue by cue.
  routes.post('/scripts/:id/subtitles/estimate', async (c) => {
    const { use } = await parseBody(c, subtitlesEstimateBodySchema)
    return c.json(edit.estimate(c.req.param('id'), use))
  })

  routes.post('/scripts/:id/subtitles/generate', async (c) => {
    const { use, estimateId, baseVersion } = await parseBody(c, subtitlesGenerateBodySchema)
    return c.json({ jobId: edit.generate(c.req.param('id'), use, estimateId, baseVersion) }, 202)
  })

  routes.post('/scripts/:id/subtitles/ai-proposal', async (c) => {
    const { baseVersion, accept } = await parseBody(c, subtitlesAiProposalBodySchema)
    return c.json(edit.decide(c.req.param('id'), baseVersion, accept))
  })

  routes.get('/scripts/:id/subtitles/export', (c) => {
    const query = subtitlesExportQuerySchema.safeParse({ format: c.req.query('format') })
    if (!query.success) throw new ApiError({ code: 'validacion', fields: { format: 'no_valido' } })
    const { text, fileName } = service.exportFile(c.req.param('id'), query.data.format)
    return c.body(text, 200, {
      'Content-Type': MIME[query.data.format],
      'Content-Disposition': `attachment; filename="${fileName}"`,
    })
  })

  return routes
}

import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { SpeechRecognizer } from '@ytcreator/core'
import {
  type SubtitleExportFormat,
  speechEngineModelBodySchema,
  speechEngineStartBodySchema,
  subtitlesExportQuerySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { SpeechEngineService } from '../../services/speech-engine.ts'
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
export function subtitleRoutes({ service, engine, recognition }: SubtitleRoutesDeps) {
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

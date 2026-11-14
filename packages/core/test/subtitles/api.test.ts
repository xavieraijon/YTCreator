import { describe, expect, it } from 'vitest'
import { SUBTITLE_EXPORT_FORMATS, subtitlesReplaceBodySchema, subtitlesJobSchema } from '../../src/api/subtitles.ts'
import { SUBTITLE_JOB_OPS } from '../../src/subtitles/model.ts'

describe('the bodies of the subtitles (contracts/http-api.md)', () => {
  it('a replacement asks for both texts, and different: never a 500', () => {
    const ok = (body: object) => subtitlesReplaceBodySchema.safeParse(body).success
    expect(ok({ baseVersion: 1, from: 'ola', to: 'hola' })).toBe(true)
    expect(ok({ baseVersion: 1, from: 'ola', to: 'hola', dryRun: true })).toBe(true)
    expect(ok({ baseVersion: 1, from: 'hola', to: 'hola' })).toBe(false)
    expect(ok({ baseVersion: 1, from: ' ', to: 'hola' })).toBe(false)
  })

  it('the job of a track is one of its operations', () => {
    const job = { id: 'j', status: 'en_curso', progress: { done: 0, total: 0 }, failure: null, queuePosition: null }
    for (const op of SUBTITLE_JOB_OPS) expect(subtitlesJobSchema.safeParse({ ...job, op }).success).toBe(true)
    expect(subtitlesJobSchema.safeParse({ ...job, op: 'otra' }).success).toBe(false)
  })

  it('exports the three formats YouTube takes', () => expect(SUBTITLE_EXPORT_FORMATS).toEqual(['srt', 'vtt', 'sbv']))
})

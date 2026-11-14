import { describe, expect, it } from 'vitest'
import { SUBTITLE_STATUSES, subtitlesStatus } from '../../src/subtitles/status.ts'

describe('subtitlesStatus (data-model.md, «Pista»)', () => {
  it('has the four states of the data model', () => {
    expect(SUBTITLE_STATUSES).toEqual(['sin_hacer', 'en_marcha', 'borrador', 'aprobados'])
  })

  it('is «sin_hacer» without a track or without versions', () => {
    expect(subtitlesStatus({ latest: null, approved: null, job: null })).toBe('sin_hacer')
  })

  it('is «en_marcha» while its recognition is queued or running, whatever the versions', () => {
    expect(subtitlesStatus({ latest: null, approved: null, job: 'en_cola' })).toBe('en_marcha')
    expect(subtitlesStatus({ latest: 2, approved: 2, job: 'en_curso' })).toBe('en_marcha')
  })

  it('a finished, failed or interrupted job does not count as running', () => {
    expect(subtitlesStatus({ latest: null, approved: null, job: 'fallido' })).toBe('sin_hacer')
    expect(subtitlesStatus({ latest: 1, approved: null, job: 'hecho' })).toBe('borrador')
    expect(subtitlesStatus({ latest: 1, approved: null, job: 'interrumpido' })).toBe('borrador')
  })

  it('is «borrador» when the last version is not the approved one', () => {
    expect(subtitlesStatus({ latest: 1, approved: null, job: null })).toBe('borrador')
    // A new version after approving (an edit, a restore) takes it back to draft (FR-013).
    expect(subtitlesStatus({ latest: 3, approved: 2, job: null })).toBe('borrador')
  })

  it('is «aprobados» when the last version is the approved one', () => {
    expect(subtitlesStatus({ latest: 2, approved: 2, job: null })).toBe('aprobados')
  })
})

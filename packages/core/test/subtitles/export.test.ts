import { describe, expect, it } from 'vitest'
import { exportSubtitles, subtitlesFileName } from '../../src/subtitles/export.ts'
import type { Cue } from '../../src/subtitles/model.ts'

const cue = (id: string, start: number, end: number, text: string): Cue => ({
  id,
  start,
  end,
  text,
  flags: [],
  heard: null,
  reviewed: false,
})
const CUES = [
  cue('c1', 0.5, 2.25, 'Hoy hacemos pan\ncon masa madre.'),
  cue('c2', 3661.007, 3663.9, 'Año tras año, ¿qué cambia?'),
]

describe('the file of the subtitles (R14)', () => {
  it('SRT: numbered, hh:mm:ss,mmm, the lines and a blank line', () => {
    expect(exportSubtitles(CUES, 'srt')).toBe(
      '1\n00:00:00,500 --> 00:00:02,250\nHoy hacemos pan\ncon masa madre.\n\n' +
        '2\n01:01:01,007 --> 01:01:03,900\nAño tras año, ¿qué cambia?\n',
    )
  })

  it('WebVTT: the header and hh:mm:ss.mmm', () => {
    expect(exportSubtitles(CUES, 'vtt')).toBe(
      'WEBVTT\n\n00:00:00.500 --> 00:00:02.250\nHoy hacemos pan\ncon masa madre.\n\n' +
        '01:01:01.007 --> 01:01:03.900\nAño tras año, ¿qué cambia?\n',
    )
  })

  it('SBV: h:mm:ss.mmm,h:mm:ss.mmm', () => {
    expect(exportSubtitles(CUES, 'sbv')).toBe(
      '0:00:00.500,0:00:02.250\nHoy hacemos pan\ncon masa madre.\n\n' +
        '1:01:01.007,1:01:03.900\nAño tras año, ¿qué cambia?\n',
    )
  })

  it('UTF-8 with accents and «ñ», and no subtitles gives an empty file of its kind', () => {
    const bytes = new TextEncoder().encode(exportSubtitles(CUES, 'srt'))
    expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toContain('Año tras año')
    expect(exportSubtitles([], 'srt')).toBe('')
    expect(exportSubtitles([], 'vtt')).toBe('WEBVTT\n')
  })

  it('a time that rounds up to the next second is written right', () => {
    expect(exportSubtitles([cue('c1', 59.9996, 61, 'Hola')], 'srt')).toContain('00:01:00,000 --> 00:01:01,000')
  })
})

describe('the name of the file', () => {
  it('from the main title of the package, without what file systems do not take', () => {
    expect(subtitlesFileName('Pan casero: ¿sin amasar?', 'Idea', 'srt')).toBe('subtitulos-pan-casero-sin-amasar.srt')
    expect(subtitlesFileName('A/B "test" <1>', 'Idea', 'vtt')).toBe('subtitulos-a-b-test-1.vtt')
  })

  it('from the idea when there is no package title, and a name when nothing is left', () => {
    expect(subtitlesFileName(null, 'Mañana, pan', 'sbv')).toBe('subtitulos-manana-pan.sbv')
    expect(subtitlesFileName('  ', '¿?', 'srt')).toBe('subtitulos-del-video.srt')
  })
})

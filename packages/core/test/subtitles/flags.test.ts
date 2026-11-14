import { describe, expect, it } from 'vitest'
import { countToReview, cueMarks, hasLowConfidence, readingMarks } from '../../src/subtitles/flags.ts'
import type { Cue } from '../../src/subtitles/model.ts'
import type { SubtitleLimits } from '../../src/subtitles/segment.ts'

const LONG: SubtitleLimits = {
  maxLines: 2,
  maxCharsPerLine: 42,
  maxCharsPerSecond: 17,
  minSeconds: 0.833,
  maxSeconds: 7,
  minGapSeconds: 0.083,
}
const cue = (over: Partial<Cue> = {}): Cue => ({
  id: 'c1',
  start: 1,
  end: 3,
  text: 'Hoy hacemos pan.',
  flags: [],
  heard: null,
  reviewed: false,
  ...over,
})

describe('the marks worked out for a cue (R10)', () => {
  it('a cue within the limits has none', () => {
    expect(readingMarks(cue(), LONG)).toEqual([])
  })

  it('«lectura rápida» over 17 characters a second', () => {
    // 34 characters in 1,5 s: about 22,7 a second.
    expect(readingMarks(cue({ end: 2.5, text: 'Hoy hacemos un pan casero sin amasar' }), LONG)).toEqual([
      'lectura_rapida',
    ])
    // Exactly 17 a second is still fine.
    expect(readingMarks(cue({ end: 3, text: 'x'.repeat(34) }), LONG)).toEqual([])
  })

  it('«fuera de límites»: too many lines, a long line, too short or too long on screen', () => {
    expect(readingMarks(cue({ text: 'uno\ndos\ntres' }), LONG)).toContain('fuera_de_limites')
    expect(readingMarks(cue({ end: 9, text: 'a'.repeat(43) }), LONG)).toContain('fuera_de_limites')
    expect(readingMarks(cue({ start: 1, end: 1.5, text: 'Sí.' }), LONG)).toEqual(['fuera_de_limites'])
    expect(readingMarks(cue({ start: 1, end: 9 }), LONG)).toEqual(['fuera_de_limites'])
  })

  it('a Short only has one line', () => {
    const short = { ...LONG, maxLines: 1, maxCharsPerLine: 32 }
    expect(readingMarks(cue({ text: 'Hoy\nhacemos pan.' }), short)).toEqual(['fuera_de_limites'])
  })

  it('the marks of a version are keyed by cue and only list cues that have some', () => {
    const cues = [cue(), cue({ id: 'c2', start: 4, end: 4.5, text: 'Sí.' })]
    expect(cueMarks(cues, LONG)).toEqual({ c2: ['fuera_de_limites'] })
  })
})

describe('«no se oyó bien»', () => {
  it('when some word was heard with a probability under the threshold', () => {
    const word = (p: number) => ({ text: 'pan', start: 0, end: 0.3, p })
    expect(hasLowConfidence([word(0.9), word(0.49)], 0.5)).toBe(true)
    expect(hasLowConfidence([word(0.9), word(0.5)], 0.5)).toBe(false)
    expect(hasLowConfidence([], 0.5)).toBe(false)
  })
})

describe('the number «para revisar»', () => {
  it('counts the cues with some mark, kept or worked out, not reviewed yet', () => {
    const cues = [
      cue({ id: 'c1', flags: ['del_guion'], heard: 'Oy hacemos pan.' }),
      cue({ id: 'c2', flags: ['poca_seguridad'], reviewed: true }),
      cue({ id: 'c3', start: 4, end: 4.5, text: 'Sí.' }),
      cue({ id: 'c4', start: 5, end: 7 }),
      cue({ id: 'c5', start: 8, end: 8.4, text: 'No.', reviewed: true }),
    ]
    expect(countToReview(cues, cueMarks(cues, LONG))).toBe(2)
  })
})

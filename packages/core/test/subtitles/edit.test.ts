import { describe, expect, it } from 'vitest'
import {
  editCue,
  EditError,
  joinCues,
  markReviewed,
  nextCueId,
  replaceAll,
  replaceCount,
  splitCue,
} from '../../src/subtitles/edit.ts'
import { cueMarks } from '../../src/subtitles/flags.ts'
import type { Cue } from '../../src/subtitles/model.ts'
import type { SubtitleLimits } from '../../src/subtitles/segment.ts'

// The figures of subtitles/craft.json (decision 10).
const LONG: SubtitleLimits = {
  maxLines: 2,
  maxCharsPerLine: 42,
  maxCharsPerSecond: 17,
  minSeconds: 0.833,
  maxSeconds: 7,
  minGapSeconds: 0.083,
}
const SHORT: SubtitleLimits = { ...LONG, maxLines: 1, maxCharsPerLine: 32 }

const cue = (id: string, start: number, end: number, text: string, extra: Partial<Cue> = {}): Cue => ({
  id,
  start,
  end,
  text,
  flags: [],
  heard: null,
  reviewed: false,
  ...extra,
})

const CUES: Cue[] = [
  cue('c1', 0.5, 2.5, 'Hoy hacemos pan casero.'),
  cue('c2', 2.6, 4.6, 'Con masa madre y harina de fuerza.', {
    flags: ['del_guion'],
    heard: 'Con masa madr y arina de fuerza.',
  }),
  cue('c3', 4.7, 6.7, 'El pan del canal Pan Casero sale bien.'),
]

const errorOf = (work: () => unknown) => {
  try {
    work()
  } catch (error) {
    if (error instanceof EditError) return error.code
    throw error
  }
  return null
}

describe('splitting a cue (FR-008)', () => {
  it('cuts at a place of its text and shares its time by characters', () => {
    // «Hoy hacemos » | «pan casero.»: 11 and 11 characters once trimmed.
    const cues = splitCue(CUES, 'c1', 12, LONG)
    expect(cues).toHaveLength(4)
    const [left, right] = cues
    expect(left).toMatchObject({ id: 'c1', text: 'Hoy hacemos', start: 0.5, end: 1.5 })
    expect(right).toMatchObject({ id: 'c4', text: 'pan casero.', start: 1.5, end: 2.5 })
    expect(cues.slice(2)).toEqual(CUES.slice(1))
  })

  it('both halves keep the marks and what was heard', () => {
    const [, left, right] = splitCue(CUES, 'c2', 15, LONG)
    expect(left).toMatchObject({ flags: ['del_guion'], heard: 'Con masa madr y arina de fuerza.' })
    expect(right).toMatchObject({ flags: ['del_guion'], heard: 'Con masa madr y arina de fuerza.' })
  })

  it('refuses a place that would leave a half empty', () => {
    expect(errorOf(() => splitCue(CUES, 'c1', 0, LONG))).toBe('posicion')
    expect(errorOf(() => splitCue(CUES, 'c1', 'Hoy hacemos pan casero.'.length, LONG))).toBe('posicion')
    expect(errorOf(() => splitCue(CUES, 'c1', 3, LONG))).toBe(null)
    expect(errorOf(() => splitCue(CUES, 'nada', 3, LONG))).toBe('no_encontrado')
  })
})

describe('joining two cues in a row (FR-008)', () => {
  it('joins their text and their time, and the marks of both', () => {
    const cues = joinCues(CUES, 'c1', LONG)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toMatchObject({
      id: 'c1',
      start: 0.5,
      end: 4.6,
      flags: ['del_guion'],
      heard: 'Hoy hacemos pan casero. Con masa madr y arina de fuerza.',
      reviewed: false,
    })
    // Cut again into lines within the limits.
    const lines = cues[0]!.text.split('\n')
    expect(lines.join(' ')).toBe('Hoy hacemos pan casero. Con masa madre y harina de fuerza.')
    expect(lines.length).toBeLessThanOrEqual(2)
    expect(lines.every((line) => line.length <= 42)).toBe(true)
    expect(cues[1]).toEqual(CUES[2])
  })

  it('in a Short, in a single line', () => {
    const [joined] = joinCues(CUES, 'c1', SHORT)
    expect(joined!.text).not.toContain('\n')
  })

  it('the last one has nothing after it', () => {
    expect(errorOf(() => joinCues(CUES, 'c3', LONG))).toBe('ultimo')
  })
})

describe('moving the start and the end (FR-008)', () => {
  it('within 0 ≤ start < end ≤ the audio, and the cues stay in order', () => {
    const cues = editCue(CUES, 'c3', { start: 0.2, end: 0.4 }, 10)
    expect(cues.map((one) => one.id)).toEqual(['c3', 'c1', 'c2'])
    expect(errorOf(() => editCue(CUES, 'c1', { start: -1 }, 10))).toBe('tiempos')
    expect(errorOf(() => editCue(CUES, 'c1', { start: 3, end: 3 }, 10))).toBe('tiempos')
    expect(errorOf(() => editCue(CUES, 'c1', { end: 11 }, 10))).toBe('tiempos')
  })

  it('the text is kept as the creator writes it, and is then reviewed', () => {
    const [edited] = editCue(CUES, 'c1', { text: 'Hoy hacemos pan.' }, 10)
    expect(edited).toMatchObject({ text: 'Hoy hacemos pan.', reviewed: true })
    expect(errorOf(() => editCue(CUES, 'c1', { text: '   ' }, 10))).toBe('vacio')
  })

  it('an overlap or a cue past the limits is saved, with its mark worked out (FR-010)', () => {
    const cues = editCue(CUES, 'c2', { start: 2, end: 2.3 }, 10)
    const marks = cueMarks(cues, LONG)
    expect(marks['c2']).toEqual(expect.arrayContaining(['lectura_rapida', 'fuera_de_limites', 'solapado']))
  })
})

describe('changing a word in all of them (FR-009)', () => {
  it('counts first, and changes whole words only', () => {
    const cues = [...CUES, cue('c4', 7, 9, 'Panadero, pan y más pan.')]
    expect(replaceCount(cues, 'pan')).toBe(3)
    const { cues: changed, count } = replaceAll(cues, 'pan', 'bollo')
    expect(count).toBe(3)
    expect(changed[0]!.text).toBe('Hoy hacemos bollo casero.')
    expect(changed[2]!.text).toBe('El bollo del canal Pan Casero sale bien.')
    expect(changed[3]!.text).toBe('Panadero, bollo y más bollo.')
    expect(changed[1]).toEqual(cues[1])
  })

  it('a phrase too, and characters a pattern would read as special are plain text', () => {
    expect(replaceAll(CUES, 'Pan Casero', 'PanCasero TV').count).toBe(1)
    expect(replaceCount(CUES, '.')).toBe(0)
    expect(replaceCount([cue('c1', 0, 1, 'Cuesta 3 € (más IVA).')], '(más IVA)')).toBe(1)
  })
})

describe('reviewed, and new ids', () => {
  it('marks a cue as reviewed, or not', () => {
    expect(markReviewed(CUES, 'c2', true)[1]!.reviewed).toBe(true)
    expect(markReviewed(markReviewed(CUES, 'c2', true), 'c2', false)[1]!.reviewed).toBe(false)
  })

  it('a new id is never one in use', () => {
    expect(nextCueId(CUES)).toBe('c4')
    expect(nextCueId([cue('x', 0, 1, 'a'), cue('c9', 1, 2, 'b')])).toBe('c10')
  })
})
